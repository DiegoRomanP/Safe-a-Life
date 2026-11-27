# Runbook de despliegue (demo de bajo costo, ADR-009; preparado, sin desplegar)

Estado: **nada de esto se ha desplegado ni verificado en un entorno real.** Lo que sí está probado en local se indica en cada
punto. Topología aceptada en [ADR-004](decisions/ADR-004-sesion-csrf-cors-topologia.md): el navegador habla solo con Vercel; Vercel
reescribe `/api/*` y `/health/*` hacia el backend en Render, de modo que comparten origen (sin CORS) y el backend solo acepta tráfico
que traiga el secreto de borde.

## Artefactos

| Archivo | Para qué | Probado en local |
| --- | --- | --- |
| `backend/Dockerfile`, `.dockerignore`, `backend/start-demo.sh` | Imagen de la API y del worker (mismo artefacto, otro comando). `sh start-demo.sh` arranca los dos en un contenedor (ADR-009); el 2026-11-26 se probó con variables sintéticas: dos procesos, el worker sin los secretos de la API y la API sin los del worker, y al matar el worker el contenedor se detiene. Node 24.19.0 y npm 12.0.2, usuario `node`, `HEALTHCHECK` a `/health/live`. | `docker build` y arranque con variables de producción sintéticas: `/health/live` 200, `/api/*` sin secreto 403, contenedor `healthy`, usuario `node`. |
| `render.yaml` | Blueprint de Render para la demo: **un** servicio web `plan: free` con API y worker (`sh start-demo.sh`, ADR-009), sin ningún valor real. | Sintaxis YAML. No se aplicó a Render. |
| `frontend/vercel.json` | Instalación desde la raíz del monorepo (`cd .. && npx -y npm@12.0.2 ci`; la instalación filtrada deja fuera `tsc` y `vite`, que viven en la raíz), build de Vite, rewrites hacia el backend, inyección de `X-Edge-Secret`, CSP y cabeceras. | Estructura comprobada por `npm run check:headers`. **No se desplegó en Vercel.** |
| `scripts/check-security-headers.mjs` (`npm run check:headers`) | Arranca el backend compilado en producción sintética y comprueba borde, HTTPS, cabeceras, CORS y `vercel.json`. Está en CI (`headers`). | 27 comprobaciones PASS. |
| `.github/workflows/ci.yml` | Jobs `headers` y `docker`. | Sintaxis YAML; no se ejecutó en GitHub. |

## Desarrollo local: cómo verificar cuentas

> **Antes de empezar:** `dev:local` solo arranca si `SUPABASE_URL` (variable del proceso o, en su defecto, `backend/.env`)
> apunta a `127.0.0.1`, `localhost` o `[::1]`; `supabase start` no cambia ese valor. Usa en `backend/.env` la URL, la JWKS y
> las claves que muestra `supabase status --workdir backend`. La guarda (`scripts/check-local-supabase.mjs`) solo mira la URL
> y solo cubre `dev:local`: `dev:backend` y `dev:worker` siguen usando el destino que tenga el archivo, también remoto.

Con `supabase start --workdir backend` y `EMAIL_PROVIDER=dev-mailbox` en `backend/.env`: `npm run dev:local` (API, worker,
frontend en `:5174` y buzón en `:4025`) → registrarse con un correo `*.example.test` → botón *Abrir buzón de desarrollo* →
*Verificar correo* → *Actualizar* en el buzón → segundo correo → *Crear contraseña*.

El buzón (`npm run dev:mailbox`, `scripts/dev-mailbox.mjs`) muestra los correos que el worker guarda en
`backend/.dev-mailbox/`. Solo escucha en `127.0.0.1`, rechaza un `Host` distinto de `127.0.0.1` o `localhost` y no arranca
con `NODE_ENV=production`. El puerto se cambia con `DEV_MAILBOX_PORT` y, en el frontend, con `VITE_DEV_MAILBOX_URL`. Los
correos contienen enlaces de un solo uso: borra la carpeta al terminar la demo. Con `EMAIL_PROVIDER=resend` deja de usarse.

## Orden de despliegue

1. **Supabase remoto** (solo con permiso explícito de la persona usuaria; la base remota guarda auditoría que no se borra):
   `supabase db push --workdir backend`. Incluye `20261123000000_need_coverage.sql`. Hasta aplicarla, `/health/ready` responde 503
   porque `EXPECTED_SCHEMA_VERSION` (`backend/src/shared/persistence/schema-version.ts`) la exige. Crear los usuarios técnicos
   `api_technical` y `worker` (roles distintos).
2. **Render**: crear el Blueprint desde `render.yaml` y rellenar las variables (tabla siguiente). Un solo servicio con API y worker.
   Las contraseñas técnicas remotas deben tener 32 caracteres o más: si las actuales no, cambiarlas antes en Supabase Auth.
3. **Vercel**: proyecto con raíz `frontend/`. Variables: `EDGE_SHARED_SECRET` (el mismo valor que en la API) y `VITE_MAPBOX_TOKEN` (público,
   restringido por URL). Host del servicio web en `frontend/vercel.json`: `save-a-life-api-3j6d.onrender.com`.
4. Verificar con la lista de abajo antes de abrir a nadie.

## Variables

Genera cada secreto distinto con `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Los de la API
no van al worker (`backend/.env.example`). La configuración falla cerrado: en producción rechaza `TRUSTED_PROXIES` vacío, orígenes no
`https`, `EDGE_SHARED_SECRET` vacío, `EMAIL_PROVIDER` `fake` o `dev-mailbox`, y contraseñas técnicas de menos de 32 caracteres.

| Variable | Proceso | Notas |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_JWKS_URL`, `SUPABASE_ANON_KEY` | API y worker (el worker no usa el JWKS) | `https`. La anon key nunca es una `service_role`. |
| `SUPABASE_SERVICE_ROLE_KEY` | API | Solo el adaptador de Auth Admin (ADR-006). |
| `ALLOWED_ORIGINS` | API | Origen exacto del frontend, `https`, sin barra final. |
| `TRUSTED_PROXIES` | API | Saltos entre el cliente y Express; **confirmar en staging** (abajo). |
| `EDGE_SHARED_SECRET` | API y Vercel | 32 caracteres o más, distinto de los demás. |
| `CSRF_SECRET`, `CURSOR_SECRET` | API | Distintos entre sí y de `EMAIL_HMAC_SECRET`. |
| `EMAIL_HMAC_SECRET`, `OUTBOX_KEYS`, `OUTBOX_KEY_CURRENT` | API y worker | Mismos valores en ambos. Claves `kid:base64` de 32 bytes. |
| `API_TECHNICAL_EMAIL`, `API_TECHNICAL_PASSWORD` | API | Usuario técnico distinto del del worker. |
| `WORKER_EMAIL`, `WORKER_PASSWORD`, `WORKER_POLL_MS` | Worker | Contraseña de 32 caracteres o más. En la demo van en el mismo servicio: `start-demo.sh` se las quita a la API. |
| `EMAIL_INBOX_ALLOWLIST` | Worker | **RF-EML-04**: con `resend` el worker solo envía a estas bandejas (separadas por comas). Vacía = ningún correo sale (intento `permanente` sin llamar a Resend). |
| `APP_PUBLIC_URL`, `EMAIL_FROM`, `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` | API y worker | `RESEND_WEBHOOK_SECRET` (`whsec_…`) solo la API. |
| `PORT` | API | Lo fija la plataforma; por defecto 3000. |

## Inyección de `X-Edge-Secret` en Vercel (hallazgo, sin comprobar en un despliegue)

ADR-004 exige que el borde ponga esa cabecera. La documentación de Vercel (`vercel.json`, propiedad `routes`) describe
`transforms` de tipo `request.headers` con `op: set` y `args: "$VARIABLE"` leyendo de las variables del proyecto (consultada el
2026-11-23). `frontend/vercel.json` la usa en las rutas `/api/(.*)` y `/health/(.*)`. **La documentación no dice de forma expresa que
el transform se aplique cuando el destino es un origen externo**, y `rewrites` no tiene opción de cabeceras de petición. Si en staging
el backend sigue viendo peticiones sin `X-Edge-Secret`, el plan B es un Routing Middleware de Vercel que añada la cabecera. No
se ha implementado.

## Lista de verificación en staging

- [ ] `GET <backend>/health/ready` devuelve 200 tras `supabase db push` (y 503 antes).
- [x] **Saltos de `TRUSTED_PROXIES`** (2026-11-27): con `2` Express veía un salto intermedio. Con `5` toma la IP más a la izquierda de `X-Forwarded-For`, que Vercel sobrescribe con la del cliente: el HMAC del sujeto `login:ip` coincide con la IP pública del cliente y un `X-Forwarded-For` falso no lo cambia. El acceso directo a Render lo corta el guard de borde.
- [ ] **Inyección de `X-Edge-Secret`**: una petición a `https://<frontend>/api/v1/auth/csrf-token` llega al backend (200) y la misma al host `*.onrender.com` directo responde 403.
- [ ] Una petición con `X-Forwarded-Proto: http` al backend responde 403 (solo HTTPS).
- [ ] Cabeceras en `https://<frontend>/` y en `/api/...`: HSTS, CSP, COOP, CORP, Permissions-Policy, Referrer-Policy, `nosniff`.
- [ ] La CSP no bloquea nada: consola del navegador sin violaciones en el área del hospital con el mapa (teselas de OpenStreetMap, `style-src` sin `unsafe-inline`) y en el registro con la búsqueda de Mapbox.
- [ ] Cookies `__Host-sal_at` y `__Host-sal_rt` con `Secure`, `HttpOnly`, `SameSite=Lax` y sin `Domain`.
- [ ] **Keep-alive**: `backend/src/server.ts` fija `keepAliveTimeout` en 5 s. Si el balanceador de Render mantiene conexiones inactivas más tiempo puede dar 502 intermitentes; medirlo y, solo entonces, subirlo por encima del suyo.
- [ ] Webhook de Resend firmado llega y se acepta; el worker procesa el outbox (correo de prueba con datos sintéticos).
- [ ] Flujo completo del hospital: publicar e invitar, mapa de cobertura, respuesta del donante.

## Pendiente y límites

- **HSTS `preload`**: no se activa hasta tener el dominio definitivo (alta difícil de revertir). Las cabeceras actuales llevan `max-age=63072000; includeSubDomains`.
- **Teselas de OpenStreetMap**: su política de uso es para tráfico moderado y con atribución; para tráfico real, un proveedor de teselas con contrato.
- **Worker en Docker**: la imagen declara un `HEALTHCHECK` HTTP que el worker solo (sin servidor HTTP) no cumple; con `start-demo.sh` lo atiende la API. Un `docker run` local del worker solo aparecerá `unhealthy` (usar `--no-healthcheck`).
- **Salida del contenedor con código 0**: si el worker termina, la API se apaga de forma ordenada y el contenedor sale con 0. Comprobar en staging que Render lo reinicia igualmente.
- No hay despliegue continuo (`autoDeployTrigger: off`): cada despliegue es una acción deliberada.

## Día de la demo

1. La víspera: `https://<frontend>/health/ready` devuelve 200 y el monitor externo está en verde. Si el servicio se ha
   reiniciado mucho, subirlo a `starter` desde el panel de Render (prorrateado) y bajarlo después.
2. Una hora antes: entrar con cada rol (superadmin, admin, donante) y enviar un correo de prueba.
3. Después: borrar las cuentas de prueba que no se vayan a reutilizar y volver a `free` si se subió.

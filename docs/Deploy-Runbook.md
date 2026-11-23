# Runbook de despliegue (preparado, sin desplegar)

Estado: **nada de esto se ha desplegado ni verificado en un entorno real.** Lo que sí está probado en local se indica en cada
punto. Topología aceptada en [ADR-004](decisions/ADR-004-sesion-csrf-cors-topologia.md): el navegador habla solo con Vercel; Vercel
reescribe `/api/*` y `/health/*` hacia el backend en Render, de modo que comparten origen (sin CORS) y el backend solo acepta tráfico
que traiga el secreto de borde.

## Artefactos

| Archivo | Para qué | Probado en local |
| --- | --- | --- |
| `backend/Dockerfile`, `.dockerignore` | Imagen de la API y del worker (mismo artefacto, otro comando). Node 24.19.0 y npm 12.0.2, usuario `node`, `HEALTHCHECK` a `/health/live`. | `docker build` y arranque con variables de producción sintéticas: `/health/live` 200, `/api/*` sin secreto 403, contenedor `healthy`, usuario `node`. |
| `render.yaml` | Blueprint de Render: servicio web (`/health/ready`) y worker (`node dist/worker.js`), sin ningún valor real. | Sintaxis YAML y que el conjunto de variables del worker pasa `parseWorkerEnv`. No se aplicó a Render. |
| `frontend/vercel.json` | Rewrites hacia el backend, inyección de `X-Edge-Secret`, CSP y cabeceras. | Estructura comprobada por `npm run check:headers`. **No se desplegó en Vercel.** |
| `scripts/check-security-headers.mjs` (`npm run check:headers`) | Arranca el backend compilado en producción sintética y comprueba borde, HTTPS, cabeceras, CORS y `vercel.json`. Está en CI (`headers`). | 27 comprobaciones PASS. |
| `.github/workflows/ci.yml` | Jobs `headers` y `docker`. | Sintaxis YAML; no se ejecutó en GitHub. |

## Orden de despliegue

1. **Supabase remoto** (solo con permiso explícito de la persona usuaria; la base remota guarda auditoría que no se borra):
   `supabase db push --workdir backend`. Incluye `20261123000000_need_coverage.sql`. Hasta aplicarla, `/health/ready` responde 503
   porque `EXPECTED_SCHEMA_VERSION` (`backend/src/shared/persistence/schema-version.ts`) la exige. Crear los usuarios técnicos
   `api_technical` y `worker` (roles distintos).
2. **Render**: crear el Blueprint desde `render.yaml` y rellenar las variables (tabla siguiente). Servicio web y worker.
3. **Vercel**: proyecto con raíz `frontend/`. Variables: `EDGE_SHARED_SECRET` (el mismo valor que en la API) y `VITE_MAPBOX_TOKEN` (público,
   restringido por URL). **Sustituir `REEMPLAZAR-backend.onrender.com` en `frontend/vercel.json`** por el host real del servicio web.
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
| `WORKER_EMAIL`, `WORKER_PASSWORD`, `WORKER_POLL_MS` | Worker | Contraseña de 32 caracteres o más. |
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
- [ ] **Saltos de `TRUSTED_PROXIES`**: desde un cliente conocido, comprobar qué IP ve el backend (log `seguridad.rechazo`/rate limit) y fijar el número exacto. Con uno incorrecto, todos los usuarios de una región compartirían el cupo de login.
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
- **Worker en Docker**: la imagen declara un `HEALTHCHECK` HTTP que el worker (sin servidor HTTP) no cumple; Render no lo usa, pero un `docker run` local del worker aparecerá `unhealthy` (usar `--no-healthcheck`).
- No hay despliegue continuo (`autoDeployTrigger: off`): cada despliegue es una acción deliberada.

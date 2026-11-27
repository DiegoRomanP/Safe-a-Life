# Plan: desplegar la demo de Save a Life en internet (bajo costo)

## Contexto

El proyecto funciona en local (`dev:local`) y ya tiene un despliegue **preparado pero nunca ejecutado**
(`docs/Deploy-Runbook.md`, `render.yaml`, `backend/Dockerfile`, `frontend/vercel.json`, CI `headers`/`docker`).
Topología fija por ADR-004: el navegador habla solo con **Vercel** (frontend `frontend/`), que reescribe `/api/*` y
`/health/*` hacia **Render** (API Express) e inyecta `X-Edge-Secret`; mismo origen, cookies `__Host-`, sin CORS.
Datos y Auth en **Supabase** remoto «Save-a-life» (ref `comszbhkcodnbnvtccli`); correos por outbox + worker + **Resend**.

Decisiones ya tomadas por el usuario (2026-11-26):
- Render **gratis**: un solo servicio web con API y worker en el mismo contenedor (dos procesos). Subir a Starter
  (7 USD/mes, prorrateado) solo si hace falta el día de la demo.
- **Comprar un dominio barato** (Resend exige dominio verificado para enviar a cualquier dirección).
- **Usar el Supabase existente** (aplicar las migraciones pendientes y crear lo necesario).

Hechos que condicionan el plan:
- Faltan **3 de 27 migraciones** en el remoto (`20261022110000_review_fixes`, `20261120124712_rate_limit_technical_only`, `20261123000000_need_coverage`); `/health/ready` da 503 hasta `20261123000000` (`backend/src/shared/persistence/schema-version.ts:2`).
- En producción (`NODE_ENV=production` o cualquier `RENDER*`) la config **falla cerrado**: exige `TRUSTED_PROXIES`,
  `ALLOWED_ORIGINS` https, `EDGE_SHARED_SECRET`, `EMAIL_PROVIDER=resend`, contraseñas técnicas ≥ 32 (`backend/src/config/env.ts:181-192`).
- La rama `feat/mapa-ubicacion-y-buzon-dev` ya está en `main`: sus commits se reaplicaron y `git cherry` no deja ninguno pendiente.
- `backend/scripts/seed-auth-local.ts` solo sirve para local (contraseña de demo compartida): no se reutiliza en remoto.
- Sin dudas resueltas aún: que el transform `request.headers` de `vercel.json` llegue a un destino externo, los saltos de
  `TRUSTED_PROXIES` y el `keepAliveTimeout` de 5 s frente al balanceador de Render.

## Costo estimado

| Pieza | Plan | Costo |
| --- | --- | --- |
| Vercel (frontend + borde) | Hobby | 0 |
| Render (API + worker en un contenedor) | Free (750 h/mes: alcanza para 1 servicio 24/7) | 0 (Starter 7 USD/mes solo si se necesita) |
| Supabase | Free (500 MB; el worker consultando evita la pausa de 7 días) | 0 |
| Resend | Free (3 000/mes, 100/día) | 0 |
| UptimeRobot (ping cada 5 min a `/health/ready`, evita que Render duerma) | Free | 0 |
| Mapbox (búsqueda de dirección, opcional) | Free | 0 |
| Dominio (.xyz/.site/.com) | anual | ~2–12 USD/año |

**Total: el precio del dominio.**

## Cambio de código mínimo (único)

1. `render.yaml`: dejar **un** servicio `web`, `plan: free`, con
   `dockerCommand: sh -c '(env -u SUPABASE_SERVICE_ROLE_KEY -u API_TECHNICAL_PASSWORD -u API_TECHNICAL_EMAIL -u CSRF_SECRET -u CURSOR_SECRET -u RESEND_WEBHOOK_SECRET -u EDGE_SHARED_SECRET node dist/worker.js; kill 1) & exec env -u WORKER_PASSWORD -u WORKER_EMAIL node dist/server.js'`
   - Cada proceso sigue sin ver los secretos del otro (ADR-005/006 a nivel de proceso).
   - Si el worker muere, `kill 1` tumba la API (SIGTERM ya manejado en `server.ts`) y Render reinicia el contenedor: nunca queda la API sin correo en silencio.
   - Fusionar las variables del worker en ese servicio; quitar el servicio `worker`. Comentario `shortcut:` con el límite y cuándo volver a dos servicios.
   - Confirmar antes que `parseEnv`/`parseWorkerEnv` no rechazan variables ajenas (si lo hacen, el `env -u` ya las quita).
2. `frontend/vercel.json`: sustituir `REEMPLAZAR-backend.onrender.com` por el host real de Render.
3. **ADR-009** nuevo en `docs/decisions/` («Topología de demo de bajo costo»): API y worker en un contenedor gratis; no
   modifica ADR-004/005/006 (se registra como excepción temporal de la demo, aprobada por el usuario).
4. `docs/Deploy-Runbook.md`: actualizar orden, variables (un solo servicio), arranque del día de la demo y la lista de staging.
5. Plan de la tarea en `docs/plans/2026-11-26-despliegue-demo.md` (copia de este plan + bitácora y evidencias).
6. Solo si staging lo pide: Routing Middleware de Vercel para `X-Edge-Secret` (plan B ya documentado) o subir `keepAliveTimeout`.

Nada más: ni scripts de siembra remota, ni CD automático, ni dominio propio en `/api`. El primer superadmin se crea a mano
(ver F2) y el resto de cuentas con los flujos reales de la app (alta de hospital, invitación de admin, registro de donante).

## Fases y agentes

Leyenda: **∥** = puede ir en paralelo; **→** = depende de lo anterior. Cada revisión la hace un subagente
`general-purpose` de solo lectura con el contenido del rol en `.opencode/agent/*.md` (no cuenta si escribió el artefacto).

```
F0 usuario (cuentas, dominio) ─────────────┐
F1a infra-render ∥ F1b borde-vercel ∥ F1c supabase-dryrun
          └──────────→ F1-gate (revisión seguridad) ──┐
                                                      ├→ F2 Supabase remoto  ∥  F3 Render  ∥  F3r Resend+DNS (usuario)
                                                      │                          └→ F4 Vercel (host de Render) → F5 dominio + webhook
                                                      └────────────────────────────────────────────→ F6 staging (lineal)
                                                                                                     → F7 E2E ∥ auditoría en vivo
                                                                                                     → F8 cierre (usuario aprueba)
```

### F0 — Prerrequisitos (usuario; en paralelo con F1)
Ver «Lo que necesito de ti». No bloquea F1; sí bloquea F2–F5.

### F1 — Preparación en el repo (3 agentes en paralelo, archivos disjuntos)
- **F1-pre (lineal, yo):** fusionar `feat/mapa-ubicacion-y-buzon-dev` en `main` vía PR (con aprobación del usuario) y crear
  rama `deploy/demo-bajo-costo` desde `main`.
- **F1a infra-render:** `render.yaml` (cambio 1), ADR-009, runbook. Verifica: `docker build` + `docker run` con variables
  sintéticas de producción → `/health/live` 200, `/api/*` sin secreto 403, `ps` muestra los dos procesos, matar el worker
  reinicia el contenedor; `npm run check:headers`.
- **F1b borde-vercel:** comprobar que Vercel puede instalar el workspace desde la raíz (Node 24, `engines` npm `>=12`,
  `SCARF_ANALYTICS=false`, política `allowScripts`); si npm 12 no está en Vercel, fijar `installCommand` en `vercel.json`
  (p. ej. `npx npm@12.0.2 ci`) y `buildCommand` del workspace. Verifica con `npx vercel build` local (sin desplegar).
- **F1c supabase-dryrun:** `supabase db push --dry-run --workdir backend` (lista las 12 pendientes, sin aplicar); leer por
  MCP (solo lectura) la config de Auth remota: «Confirm email», Site URL, Redirect URLs, MFA TOTP, esquema `api` expuesto,
  `get_advisors`. Entrega una lista de ajustes, sin cambiar nada.
- **F1-gate (→):** revisor `security-privacy-auditor` sobre el diff de F1a/F1b. Después `npm run lint`, `npm test`,
  `npm run build`, commits atómicos.

### F2 — Supabase remoto (lineal internamente; ∥ F3 y F3r) — requiere aprobación explícita
1. `supabase db push --workdir backend` (3 migraciones; la auditoría remota no se borra).
2. Ajustes de Auth según F1c: Site URL y Redirect URL = `https://app.<dominio>`, «Confirm email» desactivado (los correos
   los manda la app), TOTP activo, `jwt_expiry` 600 como en local.
3. Verificar que los usuarios técnicos `api_technical` y `worker` existen con roles distintos; si no, crearlos con
   contraseñas nuevas ≥ 32.
4. Primer superadmin: usuario de Auth con correo real del usuario (o alias) + **una** fila en `app.user_accounts`
   (rol superadmin) por `execute_sql`, con aprobación; el TOTP lo enrola el usuario en su primer login.
   Hospitales y admins se crean después desde la app.

### F3 — Render (usuario crea el Blueprint, yo verifico; ∥ F2)
El usuario crea el Blueprint desde `render.yaml` y pega los secretos (generados por mí en un archivo local ignorado por
git, sin imprimirlos). `TRUSTED_PROXIES` provisional = `2` (se mide en F6). Verifico `https://<servicio>.onrender.com/health/live`.

### F3r — Resend + DNS (usuario; ∥ F2/F3)
Dominio en Resend, registros SPF/DKIM (y MX de retorno) en el DNS; esperar «Verified». Remitente
`no-responder@mail.<dominio>`.

### F4 — Vercel (→ F3)
Host real en `vercel.json`, commit, proyecto Vercel con raíz `frontend/`, variables `EDGE_SHARED_SECRET` (solo
**Production**, así los preview fallan cerrado) y `VITE_MAPBOX_TOKEN`. Despliegue de producción.

### F5 — Dominio y webhook (→ F4, F3r)
`app.<dominio>` → Vercel (CNAME, **sin** proxy de Cloudflare, añadiría un salto). `ALLOWED_ORIGINS` y `APP_PUBLIC_URL` =
`https://app.<dominio>` en Render. Webhook de Resend → `https://app.<dominio>/api/v1/email-delivery/webhooks/resend`;
su `whsec_…` a `RESEND_WEBHOOK_SECRET`. Redeploy manual del servicio.

### F6 — Staging (lineal, → F2 + F5)
La lista de `docs/Deploy-Runbook.md:74-85`, con evidencia en el plan: `/health/ready` 200; `X-Edge-Secret` llega
(vía Vercel 200, directo a `onrender.com` 403); `X-Forwarded-Proto: http` 403; cabeceras y CSP sin violaciones; cookies
`__Host-`; **medir y fijar `TRUSTED_PROXIES`**; 502 intermitentes (keep-alive); webhook firmado aceptado; worker procesa el
outbox. Si el transform de Vercel no inyecta la cabecera → plan B (Routing Middleware) y repetir.

### F7 — Verificación funcional (2 agentes en paralelo, → F6)
- **E2E en vivo (Playwright MCP):** los `.example.test` no reciben correo, así que en producción se usan alias `+` del
  correo del usuario (`tu+donante@…`, `tu+admin@…`) con datos personales sintéticos; revisar si `EMAIL_INBOX_ALLOWLIST`
  conviene para limitar los destinatarios de la demo. Flujos: superadmin (login + TOTP, alta de hospital, invitar admin) → admin
  (aceptar, publicar e invitar, mapa de cobertura) → donante (registro, verificar correo, contraseña, onboarding,
  responder). Sin guardar trazas, HAR ni cookies.
- **Auditoría en vivo (solo lectura):** `security-privacy-auditor` contra la URL pública (cabeceras, 403 del host directo,
  ausencia de `Access-Control-*`, nada de PII en logs de Render) + `clinical-safety-reviewer` (aviso académico visible en
  correos y web).

### F8 — Cierre (lineal)
UptimeRobot (ping a `https://app.<dominio>/health/ready` cada 5 min; mantiene despiertos Render y Supabase y avisa por
correo). Guía «día de la demo» en el runbook (comprobar ready, opción Starter, borrar cuentas de prueba). Actualizar
plan con evidencias, `mem_save`, push y PR; el usuario aprueba el cierre.

## Lo que necesito de ti

**Antes de empezar (bloquean F2–F5):**
1. Aprobar fusionar `feat/mapa-ubicacion-y-buzon-dev` en `main`.
2. Comprar el dominio y decirme cuál; acceso al panel DNS (del registrador o Cloudflare DNS, sin proxy).
3. Crear cuentas (con GitHub donde se pueda): **Render**, **Vercel** (Hobby), **Resend**, **UptimeRobot**; opcional **Mapbox**
   (token público restringido a `https://app.<dominio>/*`).
4. Dar acceso de Render y Vercel al repositorio de GitHub.
5. Confirmar que `supabase login` sigue activo y tener a mano la contraseña de la BD remota (para `db push` la escribirás
   tú con `! supabase db push --workdir backend`).

**Durante el proceso:**
6. F2: aprobar el `db push` y la fila del superadmin; elegir el correo del superadmin.
7. F3/F4: pegar en Render y Vercel los secretos del archivo local que te prepare (no los verás en el chat).
8. F3r: pegar en el DNS los registros que muestre Resend.
9. F5: crear el webhook en Resend y pasarme (o pegar en Render) su secreto.
10. F7: abrir tu bandeja para los correos de verificación y enrolar el TOTP del superadmin.
11. F8: aprobar el cierre del módulo.

## Verificación final

- `curl -sI https://app.<dominio>/` (cabeceras), `curl https://app.<dominio>/health/ready` → 200,
  `curl https://<servicio>.onrender.com/api/v1/auth/csrf-token` → 403.
- Los tres flujos de F7 completos desde un navegador limpio, con los correos recibidos vía Resend.
- Logs de Render: worker procesando el outbox, sin PII. UptimeRobot en verde 24 h.
- Repo: `npm run lint`, `npm test`, `npm run build`, `npm run check:headers` en verde; CI del PR en verde.

## Riesgos conocidos

- Render free puede reiniciar el contenedor cuando quiera; con el ping no debería dormir, pero si cae, el primer acceso
  tarda ~1 min. Mitigación: Starter el día de la demo.
- Teselas de OpenStreetMap: aptas para tráfico bajo de demo, no para producción real.
- La inyección de `X-Edge-Secret` por `routes.transforms` no está documentada para destinos externos: plan B listo.
- Lanzar subagentes ya falló antes por un hook que modifica la llamada; reintentar una vez la misma llamada funciona.

## Bitácora

### 2026-11-26 — F1 (rama `deploy/demo-bajo-costo`)

- **F1-pre**: no hace falta fusionar nada; `git cherry -v main feat/mapa-ubicacion-y-buzon-dev` no deja commits pendientes y
  `render.yaml`, `vercel.json`, el runbook, `backend/` y `scripts/` no difieren.
- **F1a**: `backend/start-demo.sh`, `COPY` en `backend/Dockerfile` y `render.yaml` con un servicio `free`. ADR-009. Runbook.
  Evidencia: `docker build` correcto; `docker run ... sh start-demo.sh` con variables sintéticas de producción (`RENDER=true`):
  `/health/live` 200, `/api/v1/auth/csrf-token` sin secreto de borde 403 (`seguridad.rechazo` con `reason: edge`). Procesos:
  PID 1 `node dist/server.js` y `node dist/worker.js`. El entorno del worker no contiene `SUPABASE_SERVICE_ROLE_KEY`,
  `CSRF_SECRET`, `API_TECHNICAL_PASSWORD` ni `EDGE_SHARED_SECRET`, y el de la API no contiene `WORKER_PASSWORD`. Al enviar
  SIGTERM al worker, el script detiene la API y el contenedor sale (código 0: falta ver en staging si Render lo reinicia).
- **F1b**: la instalación filtrada (`npm ci --workspace=@save-a-life/frontend`) **no sirve**: deja fuera `tsc` y `vite`,
  que están en la raíz. En una copia limpia (`git worktree`) funciona `cd .. && SCARF_ANALYTICS=false npx -y npm@12.0.2 ci` +
  `npm run build` (salida en `frontend/dist`). Se añadió a `frontend/vercel.json` con `framework: vite`. La documentación
  actual de Vercel permite combinar `routes` con `rewrites` y `headers`. Sigue sin confirmar que el transform de cabeceras
  llegue al destino externo (F6).
- **F1c** (solo lectura, MCP): el remoto tiene 24 migraciones y le faltan 3. Existen `api_technical` y `worker` (una cuenta
  cada uno), 10 donantes sintéticos de pruebas anteriores, 0 hospitales, ningún superadmin y ningún TOTP. `backend/.env`
  apunta ahora al Supabase local, así que las contraseñas técnicas remotas hay que reponerlas (≥ 32) en la F2. Avisos:
  funciones `SECURITY DEFINER` ejecutables por `anon`/`authenticated` (por diseño, ADR-003) y la protección de contraseñas
  filtradas desactivada (solo existe en el plan Pro). No se cambió nada en el remoto.
- **Verificación del repo**: `npm run check:headers` (todas PASS), `npm run lint` (exit 0), `npm test` (862 + 428 + 52 + 15
  tests en verde). Build del frontend en copia limpia correcto; el del backend lo hace `check:headers`.
- **F1-gate: NO realizada.** El subagente revisor (security-privacy-auditor) se rechazó dos veces: un hook modifica la entrada
  de la llamada y el modo automático no puede revisarla. No hay PASS. Sin commits hasta que exista la revisión.

### 2026-11-27 — F2 a F6 (en curso)

- **F2**: el usuario aplicó `supabase db push --remote` (27/27 migraciones). Contraseñas técnicas nuevas (≥ 32) puestas por la
  Admin API: cambio y login de prueba 200 para `api_technical` y `worker`. «Confirm email» de Supabase Auth: desactivado (correcto).
- **F3**: Blueprint de Render desde la rama → `save-a-life-api-3j6d.onrender.com` (free, Live). `/health/ready` 200; `/api` directo 403.
- **F4**: Vercel `safe-a-life-frontend` (Hobby), Root Directory `frontend`, preset Vite, rama de producción
  `deploy/demo-bajo-costo`, `EDGE_SHARED_SECRET` solo en Production. El primer build desde `main` falló (127, sin `tsc`):
  esperado. Desde la rama (`54cff52`): Ready.
- **F5**: `savealife.dev` (Production) y `www` → 307 a `savealife.dev`; CNAME en Cloudflare en «DNS only». Certificado emitido.
- **F6 (parcial)**: en `https://savealife.dev`: web 200 con CSP, HSTS, COOP, CORP, XFO, Referrer-Policy, Permissions-Policy y
  nosniff; `/health/ready` 200; `/api/v1/auth/csrf-token` sin sesión **401** (pasa el guard de borde: el transform
  `request.headers` de `routes` sí inyecta `X-Edge-Secret` hacia el destino externo; el plan B no hace falta), sin
  `Access-Control-*`. Directo a Render: 403. `http://` → 308 a `https://`.
- **`TRUSTED_PROXIES`**: medido con un login fallido sintético y comparando el HMAC del sujeto `login:ip` en
  `app.rate_limit_events` con el HMAC de la IP pública del cliente (nunca la IP en claro). Con `2` **no coincide**: Express ve
  un salto intermedio. Se cambia a `5`: Express toma la IP más a la izquierda de `X-Forwarded-For`, que Vercel sobrescribe con
  la del cliente. El acceso directo a Render queda cortado por el guard de borde. Pendiente de verificar (coincidencia y prueba
  de suplantación).
- **`TRUSTED_PROXIES=5` verificado** (tras redeploy manual en Render; cambiar la variable no reinicia el contenedor): las dos
  peticiones de medición, una de ellas con `X-Forwarded-For: 203.0.113.7`, quedaron con el HMAC de la IP real del cliente. El HMAC
  de la IP falsa no aparece. Logs de Render: `worker.ciclo SIN_TRABAJO`, así que el worker está vivo y autenticado en Supabase.
- **Superadmin** (aprobado por el usuario, correo institucional suyo): usuario de Auth creado por la Admin API con correo
  confirmado y contraseña temporal aleatoria en `backend/.env.superadmin` (ignorado por git y Docker), más una fila
  `app.user_accounts` con rol `superadmin`, igual que la siembra local. Login vía `savealife.dev`: 200, `aal: 1`,
  `mfaRequired: true`. Cookies `__Host-sal_at` y `__Host-sal_rt` con `Secure`, `HttpOnly`, `SameSite=Lax` y sin `Domain`. El
  TOTP lo enrola el usuario en `/verificar-identidad`.
- **Hallazgo en la demo (superadmin)**: «Sedes» no tenía hospitales que elegir (todavía no se había creado ninguno; la pantalla
  no lo explicaba) y pedía latitud y longitud a mano. El usuario las escribió intercambiadas. Arreglo `4b20dee`: el formulario
  reutiliza el mapa del donante (`LocationMap`, con textos propios por `labels`) en vez de los campos; si no hay hospitales, lo
  avisa. Tests del frontend 428/428, typecheck y eslint en verde. Desplegado en Vercel (bundle verificado). El backend no cambia.
- **Primera invitación de admin no enviada**: el outbox la marcó `fallido`, intento `permanente` sin HTTP. Causa: con
  `EMAIL_PROVIDER=resend` el worker siempre aplica `EMAIL_INBOX_ALLOWLIST` (`composition-worker.ts:56`, RF-EML-04, ADR-005 §7), y la
  variable faltaba en el despliegue. Es el comportamiento exigido, no un bug: se añade la variable a `render.yaml` y al runbook, con
  las bandejas de prueba del usuario. Reinvitar invalida el token anterior y emite uno nuevo.
- **F7 en vivo, hallazgo**: el donante pulsó «Confirmar intención de asistir» en el detalle de la invitación dentro de su cuenta y
  recibió 409. Causa: `changeOwnInvitationResponse` solo cambia una respuesta existente (línea 204 de `invitation_rpc_b`:
  conflicto si la respuesta sigue en `sin_respuesta`). La primera respuesta va por el token del correo
  (`recordInitialInvitationResponse`, RF-INV-04). El frontend lo sabía en el stub de pruebas (`allowFirstResponse: true`) pero no en
  la interfaz. Arreglo en el frontend: sin respuesta → aviso que remite al correo y sin botones; el stub refleja el backend.
  Tests 429/429. Backend y contrato sin cambios.

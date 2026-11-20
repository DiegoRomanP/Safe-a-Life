# Hardening del backend tras la auditoría de seguridad del 2026-11-20

Rama `fix/revision-seguridad-ui`. Origen: el informe de solo lectura del rol `security-privacy-auditor` sobre `main`
(`44c7d6e`), con los hallazgos H1, M1, M2, L1–L4 e I-1 a I-9. Este plan registra las correcciones, la evidencia y lo
que queda pendiente. **Ningún gate está en PASS**: la revisión independiente (`reviewer-back` y
`security-privacy-auditor` sobre este diff) sigue pendiente y la persona usuaria debe aprobar el cierre.

Solo se usó el Supabase **local** (`--workdir backend`). No se usaron las herramientas MCP de Supabase ni `db push`.
No se tocó `frontend/` (otro agente trabaja allí en paralelo) ni `docs/openapi.json`.

## Correcciones

| Hallazgo | Estado | Commit | Qué se hizo |
|---|---|---|---|
| H1 (alta) | Corregido | `1ce32d7` | `npm audit fix` en la raíz, sin `--force`: `body-parser` 2.3.0 → 2.4.0 (GHSA-27r3-jxmh-p828), `fast-uri` 3.1.8 → 3.1.9 y `qs` 6.16.0 → 6.17.1, más parches menores de dependencias de desarrollo (`fast-xml-parser`, `strnum`, `is-unsafe`, `fast-xml-builder`) y `uuid@8.3.2` subido de `postman-collection/node_modules` a la raíz (misma versión). `express.json` pasa a `inflate: false`: el frontend nunca comprime peticiones y un cuerpo con `Content-Encoding` es 400. |
| H1, webhook | Decisión documentada | `1ce32d7` | El parser crudo del webhook de Resend **conserva** `inflate` por defecto. No encontré documentación de Resend ni de Svix que diga si comprimen el envío (búsqueda web sin resultado concluyente); apagarlo podría romper el webhook. Con `body-parser` 2.4.0 la vulnerabilidad ya está parcheada. Si se confirma que Svix nunca envía `Content-Encoding`, basta con añadir `inflate: false` en `resend-webhook.router.ts`. |
| M1 (media) | Corregido | `8614ce0` | Migración nueva `20261120124712_rate_limit_technical_only.sql`: `api.consume_rate_limit` exige `app.is_api_technical()` y pierde el `EXECUTE` de `anon`. Ya nadie de fuera puede llenar `authquota:login`/`authquota:refresh` ni crear filas con sujetos arbitrarios. El adaptador (`identity-rpc-gateway.ts`) llama con la sesión técnica de la API y reintenta una vez si Auth rechaza el JWT técnico. El sujeto global sigue siendo fijo, pero ya no es alcanzable desde fuera (comentario en `auth-quota.ts`). Sigue siendo DEFINER (ítem 1 de la allowlist de ADR-003), sin cambios en la allowlist. |
| L3 (baja) | Corregido | `8614ce0` | Misma migración: `api.record_public_idempotency` exige `app.is_api_technical()` y pierde el `EXECUTE` de `anon`. |
| M2 (media) | Corregido | `0216811` | `shared/auth/jwks-cache.ts`: caché del JWKS de `SUPABASE_JWKS_URL` (TTL 10 min, single-flight; un `kid` desconocido provoca como mucho una descarga por minuto). Antes de `getClaims` se rechazan en local `alg` fuera de ES256/RS256/HS256, y, si el JWKS publica claves asimétricas, también `HS*`, `kid` ausente o desconocido y `alg` distinto al de la clave. La clave conocida se pasa como `options.jwks` a `getClaims`, así que no hay llamada de red. Sin dependencias nuevas. |
| L4 (baja) | Corregido | `c85186b` | `loop.stop()` devuelve una promesa que espera el ciclo en curso; el worker sale con 0 al terminar o con 1 tras 10 s, como el API. |
| L2 (baja) | Corregido | `b48666e` | `previewAdminInvitation` consume `admin-preview:ip` y `completePasswordReset` consume `reset:ip` (10 cada 15 min, como `claim:ip`) antes de tocar la base. Ambas operaciones ya declaran 429 en el contrato. |
| I-2 (info) | Corregido | `7d69aa4` | `Cross-Origin-Resource-Policy: same-origin` y `Permissions-Policy` restrictiva en `security-headers.ts`. No contradice ADR-004 (mismo origen detrás del proxy de Vercel). |
| L1 (baja) | **No implementado: requiere decisión del usuario** | — | Ver la propuesta más abajo. |
| I-1, I-4 | Pendiente | — | Ver «Pendiente». |
| I-3, I-5, I-6, I-7, I-8 | Sin cambio | — | Aceptados o fuera de alcance según el informe. I-8 sigue necesitando la revisión formal del gate de ADR-006. |
| I-9 (info) | Corregido con H1 | `1ce32d7` | `qs` y `fast-uri` actualizados. |

### Comportamiento de M2 por entorno

- **Supabase local (CLI 3.2.0):** firma con ES256 y publica la clave en `/auth/v1/.well-known/jwks.json`
  (comprobado con `curl`). Los tokens válidos se verifican en local sin llamar a Auth.
- **Proyecto que solo firma con HS256 (JWKS vacío):** el caché detecta el modo simétrico y se delega en Auth
  (`getUser`), como antes. En ese modo la amplificación de M2 sigue existiendo y la alternativa es un límite por IP
  antes de verificar. Hay que confirmar que **producción** usa claves asimétricas (no lo pude verificar).
- **Rotación de claves:** un `kid` nuevo se acepta tras la siguiente descarga (como mucho 1 min después). Un token
  HS256 heredado emitido antes de migrar a claves asimétricas se rechaza en local; vive como mucho `jwt_expiry` (600 s).
- **JWKS inalcanzable:** sin copia previa es 503 (indisponibilidad); con copia previa se sigue usando la copia.
- **Worker:** no recibe `jwksUrl` y conserva el comportamiento del SDK (no verifica tokens de usuarios).

### Riesgo operativo de M1

El login, la renovación y las rutas públicas con límite ahora dependen de la sesión técnica de la API. Si la
identidad `api_technical` no puede iniciar sesión (credencial errónea, Auth caído), esas rutas fallan cerradas
(500/503) en lugar de dejar pasar sin límite. Antes ya dependían de ella las RPC de tokens y la auditoría de
denegaciones.

## L1: propuesta (requiere decisión del usuario)

Los tokens de acción viajan en la ruta (`/…-actions/{token}`) de once operaciones ratificadas. El logger propio solo
registra la plantilla, pero los logs de acceso de Vercel y Render guardan la ruta completa: quien tenga acceso a esos
paneles ve tokens vigentes (1 h).

Propuesta concreta, en una versión nueva del contrato:

1. El enlace del correo apunta al **frontend** con el token en el fragmento (`/restablecer-contrasena#t=<token>`); el
   fragmento no sale del navegador ni llega a los logs del borde.
2. Las vistas previas pasan de `GET /…-actions/{token}` a `POST /…-actions/preview` con `{ "token": "…" }` en el
   cuerpo, y las acciones a `POST /…-actions/{accion}` con el token en el cuerpo (o en una cabecera
   `X-Action-Token`). Los cuerpos no se registran.
3. Se mantienen la validación de forma (43 caracteres base64url), el `Idempotency-Key`, los límites por IP y las
   respuestas neutras.
4. Transición: aceptar ambas formas durante una ventana de 1 h (la vida de un token) y después retirar las rutas viejas.

Mientras tanto: limitar la retención y el acceso a los logs de acceso de Vercel y Render.

## Pendiente

- **Revisión independiente:** `reviewer-back` y `security-privacy-auditor` sobre los commits de este plan. Sin PASS.
- **I-1:** `X-Request-Id` en todas las respuestas y alerta sobre `seguridad.rechazo` con `reason=auth_quota_*`. No lo
  hice porque añade una cabecera de respuesta fuera del contrato y la alerta depende de la plataforma de logs (F9).
- **I-4:** prueba de configuración de que `app` nunca entra en `[api].schemas`. pgTAP no puede leer `config.toml`; haría
  falta una prueba en Node. Queda para otra unidad.
- **Producción:** verificar claves de firma asimétricas, `jwt_expiry = 600`, rotación e `inactivity_timeout`.
- **Webhook:** confirmar con Resend/Svix si comprimen el cuerpo para decidir `inflate: false` también allí.

## Verificación (2026-11-20, Supabase local, salida real)

| Comando | Resultado |
|---|---|
| `npm run audit:production` | `found 0 vulnerabilities` (antes: 1 alta y 2 moderadas). `npm audit` completo aún reporta avisos de dependencias de desarrollo que piden `--force`; no se aplicó. |
| `npm run test --workspace backend` | 72 archivos, 845 pruebas, todas pasan (antes 70 y 829). |
| `npm run typecheck` | Código de salida 0 en todos los workspaces. |
| `npm run lint` | 0 errores, 14 avisos (código de salida 0). |
| `npm run test:backend:db` | Tras `supabase db reset --local`: 19 archivos, 1175 pruebas, `Result: PASS`. |
| `npm run test:backend:integration` | 13 archivos, 227 pruebas, todas pasan (tras M1 y de nuevo tras M2 y L2; no se repitió tras la cabecera I-2, que es aditiva). |
| `npm run test:bruno:backend` | 13 colecciones con `✓ PASS`, 204 peticiones, 0 fallos. |

Observaciones:

- Si se corre `test:backend:db` justo después de la integración, sin resetear la base, fallan `08_privacy_requests`
  (prueba 42) y `09_privacy_execution` por estado que deja la integración. Pasa también sin estos cambios y no lo
  toqué. La aserción nueva de M1 en `00_platform` sí dependía de ese estado y se aisló con `truncate` (`fcc85ae`).
- `docs/openapi.json` no cambió, así que no hizo falta `openapi:types` ni `openapi:api:check`.

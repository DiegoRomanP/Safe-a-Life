# ADR-004: Sesión, CSRF, CORS y topología

## Estado

Aceptado el 2026-10-12 (decisiones D-3, V3 y V4 de la persona usuaria). Los
detalles marcados «verificar» se confirman con la documentación vigente antes
de implementarse y se anotan en el plan del módulo F2a.

## Fecha

2026-10-12

## Contexto

La línea base v1.2 (RNF-SEC-01..08) exige PKCE mediado por Express, cookie
`Secure`/`HttpOnly`, `Origin` exacto más CSRF, validación completa del JWT,
AAL2 para admins y superadmin, step-up de 5 min o menos y membresía comprobada
en cada petición. El contrato `docs/openapi.json` marca `session` y `csrfToken`
como `x-pending-sprint0`. La auditoría de seguridad de 2026-10-12 (L3) pidió
dejar por escrito cómo se compensa que `originGuard` deje pasar una mutación sin
`Origin`.

## Decisión

1. **Sesión = JWT de Supabase en cookies HttpOnly (D-3).**
   - `__Host-sal_at` (access token) y `__Host-sal_rt` (refresh token), ambas
     `HttpOnly; Secure; SameSite=Lax; Path=/`, sin atributo `Domain`.
   - `Max-Age` del access = `expires_in` de Supabase. `Max-Age` del refresh =
     43 200 s (12 h).
   - Express hace el login con la anon key y emite las cookies; el navegador
     nunca ve los tokens.
2. **Vida de la sesión (V4).** `jwt_expiry = 600` s, refresh rotativo con
   `refresh_token_reuse_interval = 10`, `inactivity_timeout = 12h`. Si el access
   token falta o venció y hay refresh, el servidor refresca de forma
   transparente y reescribe ambas cookies; si el refresh falla, expira las dos
   cookies y no hay principal. Recuperación de contraseña y logout revocan las
   sesiones del usuario.
3. **Membresía y rol en cada petición (SEC-07).** Tras validar el JWT
   (`getClaims`), el middleware llama a `api.current_actor()` con el cliente del
   usuario. Un JWT válido de un admin con membresía revocada recibe 403 en la
   siguiente petición; el JWT sigue válido hasta 600 s, pero nunca concede
   acceso por sí solo.
4. **CSRF firmado y ligado a la sesión.**
   - Token = `nonce.HMAC-SHA256(CSRF_SECRET, JSON.stringify([session_id, nonce]))`
     (`shared/crypto/csrf.ts`), emitido por `GET /api/v1/auth/csrf-token`.
   - Toda mutación autenticada por cookie exige `X-CSRF-Token` válido para el
     `session_id` del JWT ya verificado **y** un `Origin` **presente** y dentro
     de la allowlist exacta (`ALLOWED_ORIGINS`). Una mutación con cookie sin
     `Origin` recibe 403 `ACCESS_DENIED` (hallazgo L3). `Origin: null` se
     rechaza. El guard genérico `originGuard` solo cubre mutaciones sin cookie
     (token en el path, públicas).
5. **AAL2 y step-up.** AAL2 se lee del claim `aal`. El step-up se considera
   vigente si `amr` contiene `method: 'totp'` con `timestamp ≥ now − 300 s`.
   Códigos 403 específicos: `MFA_REQUIRED` y `STEP_UP_REQUIRED` (mismo mensaje
   genérico de 403). Verificar con la documentación el formato exacto de `amr`.
6. **Topología (V3) y secreto de borde.** Vercel reescribe `/api/*` y
   `/health/*` hacia Render: navegador y API comparten origen, por eso
   `SameSite=Lax` basta y **no se configura CORS en producción**. En desarrollo,
   el proxy de Vite entrega el mismo origen. `TRUSTED_PROXIES` admite un entero
   de saltos o una lista de IP/CIDR (prefijos demasiado cortos se rechazan); el
   rate limit por IP depende de que `req.ip` sea el cliente real.
   - **Decisión del 2026-10-12 (revisión de seguridad de F2a):** el borde de
     Vercel inyecta una cabecera secreta `X-Edge-Secret` (variable
     `EDGE_SHARED_SECRET`, ≥ 32 caracteres, distinta de los demás secretos) y
     Express rechaza con 403 genérico toda petición sin ella, salvo `/health/*`
     para los sondeos del balanceador. Así un acceso directo a `*.onrender.com`
     no puede falsificar `X-Forwarded-For` ni esquivar el límite por IP. En
     `NODE_ENV=production` la configuración exige `TRUSTED_PROXIES`, orígenes y
     URLs `https` y `EDGE_SHARED_SECRET`.
   - El número exacto de saltos entre Vercel y Render (y si Render añade o
     reemplaza `X-Forwarded-For`) **se confirma en staging** antes de fijar
     `TRUSTED_PROXIES`; con un salto incorrecto todos los usuarios de una región
     de Vercel compartirían el bucket de login. La inyección de la cabecera en el
     rewrite de Vercel también se verifica en F9.
   - El sujeto del rate limit por IP agrupa IPv6 por prefijo /64.
   - **Cuota de Supabase Auth.** Todas las llamadas a `/auth/v1/token` y a MFA
     salen desde la IP del backend, y Supabase limita esos endpoints por IP
     (cuota compartida por todos los usuarios). Por eso: (a) la renovación de
     sesión tiene su propio límite por IP (`refresh:ip`) que se consulta antes
     de llamar a Auth, y los refresh tokens con forma imposible se descartan sin
     llamar; (b) un 429 del proveedor responde 429 con `Retry-After` y **nunca
     borra las cookies** de la sesión; (c) la cuota de MFA (15 por minuto por
     IP) no es configurable y limita el login de admins concurrentes: se vigila
     en la demo.
7. **Cookies `__Host-` en local.** Requieren `Secure`. Verificado el 2026-10-12:
   Bruno CLI 4.2.0 y `fetch` de Node las aceptan sobre `http://127.0.0.1`, así
   que no hace falta la excepción `COOKIE_SECURE=false`. Si un navegador no las
   aceptara en local, se permite esa excepción **solo** con `ALLOWED_ORIGINS`
   local y nombres sin el prefijo `__Host-`.
8. **Contrato.** C-5: `components.securitySchemes.sessionCookie.name =
   __Host-sal_at` y se retira `x-pending-sprint0` de `sessionCookie` y
   `csrfToken`. C-6: los códigos 403 anteriores se documentan en
   `docs/Api-Rules.md`.

## Consecuencias

- Sin CORS en producción se elimina una superficie; cualquier origen distinto
  del rewrite no tiene acceso con credenciales.
- La revocación inmediata de un JWT no existe: se mitiga con vida corta, el
  chequeo del actor en cada petición y en cada RPC.
- Cada módulo con cookie añade pruebas de integración: mutación sin `Origin`,
  con `Origin` ajeno, con CSRF de otra sesión y con CSRF ausente → 403.
- Sin SSR ni Edge Functions; el navegador no usa el SDK de Supabase.

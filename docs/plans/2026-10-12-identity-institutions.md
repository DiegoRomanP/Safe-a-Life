# Plan del módulo F2a: identity-institutions (sesión, MFA, instituciones)

| Campo | Valor |
| --- | --- |
| Fecha | 2026-10-12 |
| Harness | Claude Code |
| Rama | `feat/backend-developing` |
| Estado | **Implementado y verificado; pendiente de revisión independiente y de aprobación del usuario para el cierre** |
| Guía | [`2026-10-12-especificacion-faltante-backend.md`](2026-10-12-especificacion-faltante-backend.md) (§F2a y Anexo A) y [`2026-10-12-plan-maestro-backend-ocho-capacidades.md`](2026-10-12-plan-maestro-backend-ocho-capacidades.md) |
| Gate | `reviewer-back` + `security-privacy-auditor` (ver §5) |

## 1. Operaciones ratificadas (`x-ratification` en `docs/openapi.json`)

| Grupo | Operaciones |
| --- | --- |
| Plataforma | `getLiveness`, `getReadiness` |
| Sesión | `createSession`, `getCurrentSession`, `getCsrfToken`, `deleteCurrentSession` |
| MFA | `enrollMfaFactor` (nueva, C-2), `verifyMfaChallenge`, `verifyStepUp` |
| Hospital | `listOwnHospitalSites` |
| Superadmin | `listHospitals`, `createHospital`, `getHospital`, `updateHospital`, `listHospitalSites`, `createHospitalSite`, `updateHospitalSite`, `listHospitalMemberships`, `revokeHospitalMembership`, `getSuperadminConfiguration`, `setFinalDemoAt`, `listAuditEvents`, `listSuperadminTasks` |

Cambios de contrato aplicados: C-2 (`/api/v1/auth/mfa-enrollments`), C-3
(`SiteCoordinates`, `publicInstructions`), C-5 (cookie `__Host-sal_at`),
C-11 (422 en operaciones de sede). `createHospitalNeed` quedó ratificada
antes y se implementa en F3.

Quedan para F2b: `requestPasswordRecovery`, `completePasswordReset`,
`getHospitalAdminInvitationPreview`, `claimHospitalAdminInvitation`,
`inviteHospitalAdmin` (necesitan correo, F4, y el adaptador `service_role`).

## 2. Qué se construyó

- **Base de datos** (`backend/supabase/migrations/`): `20261013000000_platform_base.sql`,
  `20261013010000_identity_institutions.sql` y `20261013020000_identity_hardening.sql`.
  Esquema `app` sin exponer, `api` expuesto; `hospitals`, `sites`,
  `hospital_memberships`, `idempotency_records`, `rate_limit_events`,
  `audit_events` append-only, `schema_version`. RLS ENABLE+FORCE; RPC
  `SECURITY INVOKER` con tres excepciones `SECURITY DEFINER` de la allowlist de
  ADR-003 (`api.consume_rate_limit`, `api.readiness`,
  `api.record_public_idempotency`). `PUBLIC` sin `EXECUTE` en `api` y `app`.
- **pgTAP**: 99 pruebas (`00_platform` 30, `01_identity_institutions` 42,
  `02_identity_hardening` 27), aisladas de la siembra.
- **Plataforma HTTP** (`backend/src/shared/**`): errores con catálogo alineado al
  contrato, cookies `__Host-`, CSRF firmado ligado a la sesión, `Origin`
  obligatorio en mutaciones con cookie, `Idempotency-Key`, cabeceras de
  seguridad, guard de borde (`X-Edge-Secret`), IP de cliente con proxies
  confiables (IPv6 por /64), validación genérica por operación
  (`compileOperation`, rechaza U+0000), `authenticate` con refresh transparente
  y límite propio, actor resuelto en cada request, guards (rol, AAL2, step-up,
  membresía), logger con unión cerrada de eventos y estado HTTP.
- **Módulo** (`backend/src/modules/identity-institutions`): `AuthService`
  (login, MFA, step-up), `InstitutionsService` sobre el puerto
  `InstitutionsRepository` y su gateway RPC con guards cerrados
  (`shared/persistence/guards.ts`); routers `auth` e `institutions` que solo
  parsean, aplican guards y serializan.
- **Pruebas**: 313 unitarias del backend (`npm test`), 42 de integración contra
  Supabase local (`npm run test:backend:integration`) y Bruno contra el backend
  real (`npm run test:bruno:backend`).

## 3. Decisiones y desviaciones a documentar

- **Replay de operaciones MFA**: `verifyMfaChallenge`, `verifyStepUp` y
  `enrollMfaFactor` responden 409 ante una clave ya usada, porque el código TOTP
  no se puede reutilizar. Excepción a REL-01 **aprobada por ti el 2026-10-12**,
  igual que la del login (B-6: sin 409 por «misma clave con otro payload»).
- **Step-up en `revokeHospitalMembership`** (RNF-SEC-05): decisión tuya del
  2026-10-12. El contrato ya declaraba 403.
- **Contrato**: tras la revisión se declararon en `docs/openapi.json` los errores
  que el backend realmente devuelve (400 en entradas tipadas, 503 en toda
  operación salvo salud, 403 en `verifyMfaChallenge`, 409 en `verifyStepUp`, 422
  en `listHospitalMemberships`). La segunda ronda añadió 429, 500 y otros 403/422
  y la tercera 403 en `getCsrfToken`/`getCurrentSession` (guard de borde) y 400 en
  la pareja de salud. El inventario congelado de Prism terminó en 355 errores y
  460 casos. Una prueba estructural (`backend/src/contract/declared-statuses.test.ts`)
  exige que toda operación de `/api` que el backend sirve declare 400, 401, 403,
  429, 500 y 503, sin depender de qué rutas recorran las pruebas de integración.
- **Sesión en logout/login**: el login nunca renueva sesión (política `skip`). El
  logout renueva con el refresh token si el access venció, para poder revocar
  la sesión en Auth (política `lenient`); si el límite de renovación está agotado
  o el proveedor responde 429, se trata como sin sesión: responde 401 y expira las
  cookies, y **la revocación queda diferida** hasta que el refresh token caduque
  (hasta 12 h de inactividad). Las rutas se comparan sin distinguir mayúsculas ni
  barra final, igual que Express.
- **ADR-003**: allowlist ampliada con `api.record_public_idempotency` (decisión
  tuya); `api.consume_idempotency_key` es INVOKER.
- **ADR-004**: secreto de borde (`EDGE_SHARED_SECRET`), cuota de Supabase Auth y
  verificación de cookies `__Host-` en local. Los saltos exactos de
  `TRUSTED_PROXIES` y la inyección de la cabecera en Vercel se confirman en
  staging (F9).
- El TOTP fresco del login satisface el step-up durante 300 s; la denegación de
  step-up se prueba en pgTAP y en las pruebas unitarias de guards.
- Tras revocar una membresía, `api.current_actor` devuelve `hospital = null` y
  los guards responden 403, no 404.
- Bruno: los escenarios del backend real viven en `bruno/backend/<módulo>/` y no
  reutilizan `bruno/scenarios/`, cuyas aserciones son específicas del mock. El
  runner calcula el TOTP vigente de cada carpeta (el sandbox `safe` de Bruno no
  puede). Desvío respecto de la spec §5.9 (`01b_mfa.bru` dentro de `scenarios/`).
- `auth.admin.signOut(jwt, scope)` se llama con la anon key; `service_role` no
  se usa todavía (la prueba estática `service-role-allowlist.test.ts` lo vigila).

## 4. Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | verde |
| `npm test` | verde (313 pruebas del backend, más mock y web) |
| `npm run test:backend:db` | 100 pruebas pgTAP en verde |
| `npm run test:backend:integration` | 42 pruebas en verde (incluye que todo estado HTTP observado esté declarado, con control negativo, y el logout con access vencido contra `auth.sessions`) |
| `npm run test:bruno:backend` | 28 solicitudes y 30 pruebas en verde (plataforma, hospital, superadmin) |
| `npm run openapi:lint`, `openapi:api:check`, `test:api:generator` | verdes |
| `npm run test:contract`, `npm run test:api` | verdes |

## 5. Revisiones independientes

Primera ronda (2026-10-12), subagentes de contexto separado del autor, solo
lectura:

- `reviewer-back`: **FAIL**. H1 replay roto en revoke/final_demo_at, H2 DEFINER
  fuera de la allowlist, H3 `displayName` > 120, H4 router sin capa de
  aplicación, H5 códigos de error no declarados, H6 cuota de Auth, H7 pruebas
  faltantes y hallazgos bajos.
- `security-privacy-auditor`: **FAIL**. A1 DoS de la cuota de Auth por refresh
  falso, M1 proxies, M2 step-up en revocación, M3 material derivado de la
  contraseña en la base, y hallazgos bajos B1–B8.

Segunda ronda (2026-10-12), subagentes nuevos de contexto separado:

- `reviewer-back`: **FAIL** (un bloqueante). M-1: el backend emitía estados que
  el contrato no declaraba (429 en operaciones con cookie, 500, 403 en
  `createSession`, 422 en revoke y en sedes propias). Bajos: B-1 membresía
  `pendiente`, B-2 sin límite en `enrollMfaFactor`, B-3 segundo intercalar en
  `finalDemoAt`, B-4 surrogates sueltos, B-5 logout ante 429, B-6 desvío de
  `createSession` sin documentar, B-7 orden de guards.
- `security-privacy-auditor`: **PASS con observaciones** (sin hallazgos críticos
  ni altos; el módulo lo cierra la persona usuaria). Observaciones: O1 cuota
  global de `/token` agotable de forma distribuida (decisión de la persona
  usuaria pendiente), O2 el límite de renovación bloqueaba login y logout, O3
  llamadas a Auth sin timeout, O4 fallar cerrado sin `NODE_ENV`, O5 readiness sin
  caché, O6 telemetría sin motivo ni ruta, O7 grants en bloque, O8 normalizar
  `iss`, O9 la anon key es de hecho confidencial, O10 bloqueo dirigido de
  cuentas, O11 derivación de claves dispersa.

Correcciones de la segunda ronda: contrato completo (351 errores / 456 casos en
el inventario de Prism) y una prueba de integración que falla si el backend
devuelve un estado no declarado; login y logout no renuevan sesión (el logout sin
sesión expira las cookies); timeout de 8 s en toda llamada a Auth; `iss`
normalizado; fallar cerrado en Render; readiness con caché de 5 s; log con ruta
y motivo; llavero HMAC derivado una sola vez en la raíz de composición; B-1 a
B-5 y B-7 corregidos.

Tercera ronda (2026-10-12), subagentes nuevos de contexto separado, solo lectura
sobre el delta `c43114e..ccab19e`:

- `reviewer-back`: **FAIL** (un bloqueante). 1) El contrato no declaraba el 403
  del guard de borde en `getCsrfToken` y `getCurrentSession`, ni el 400 de la
  pareja de salud, y la prueba de integración no lo detectaba (solo comprobaba
  «observado ⊆ declarado» y no registraba los `fetch` crudos). 2) Mayor: el
  logout no revocaba la sesión en Auth si el access token había vencido. Menores:
  3) `skipRenewal` comparaba la ruta de forma exacta, 4) telemetría de O6 sin
  pruebas, 5) pruebas débiles, 6) readiness sin single-flight, 7) las claves de
  idempotencia de MFA quedan consumidas si Auth falla después, 8) cifras y
  documentación desactualizadas.
- `security-privacy-auditor`: **PASS con observaciones** (todas menores, sin
  críticos ni altos; el cierre lo decide la persona usuaria). 1 y 2 coinciden con
  los hallazgos 2 y 3 del otro revisor; 3) `consume_rate_limit` y
  `record_public_idempotency` son invocables por `anon` con parámetros del
  llamador, 4) una prueba pgTAP no probaba lo que decía, 5) O9/O10 sin estado en
  el plan, 6) readiness sin single-flight, 7) `TRUSTED_PROXIES` admite prefijos
  desde /8.

Correcciones de la tercera ronda: 403/400 declarados y contadores de Prism
(355/460); prueba estructural de estados globales; `observedFetch` para registrar
los `fetch` crudos y control negativo del verificador; política de renovación
(`skip`/`lenient`/`normal`) con ruta normalizada, pruebas unitarias y dos de
integración (logout con access vencido revoca en `auth.sessions`; con el límite
agotado responde 401 y expira cookies); techos globales de `/token` (O1); readiness con single-flight y pruebas de
expiración a los 5 s; timeout de Auth inyectable con prueba real de aborto (503);
control positivo de pares sustitutos; el rechazo de `23:59:60` se afirma antes de
tocar el repositorio; prueba pgTAP reescrita (ahora 100).

Cuarta ronda (2026-10-12), `reviewer-back` nuevo, enfocada en las correcciones
(`ccab19e..14a1137`): **PASS con observaciones** (sin bloqueantes ni mayores). Confirmó
resueltos el contrato (sin 413/415/405 emitibles; las 21 operaciones declaran los
seis estados globales) y el logout con access vencido, sin regresiones. No ejecutó
integración, pgTAP ni Bruno; esas las ejecuté yo. Observaciones y estado:
M1 single-flight colgado ante un puerto que lanza de forma síncrona (corregido y
probado), M2 la comprobación de contrato podía pasar vacía (mínimo de 30
observaciones), M3 el guard de borde exigía el secreto en `/health/live/` o en
mayúsculas (exención alineada con Express), M4 el logout devolvía 503 sin expirar
cookies si Auth o el limitador estaban caídos (ahora 401 y cookies expiradas, con
revocación diferida), M5 pruebas faltantes en `lenient` (añadidas), M6 redacción de
Backend-Contracts.

Esta cuarta ronda se limitó al delta; las correcciones posteriores a ella (techos
globales de O1 y M1–M5) no fueron vistas por un revisor independiente.

## 6. Pendientes conocidos

- Purga de `idempotency_records` y `rate_limit_events` (RNF-REL-02: 72 h tras el
  estado terminal): la ejecuta el worker (F4/F7).
- `SUPABASE_JWKS_URL` es obligatoria pero no se usa (`getClaims` resuelve las
  claves desde `SUPABASE_URL`); se retira o se usa en F9.
- El proceso de la API carga `SUPABASE_SERVICE_ROLE_KEY` y `WORKER_PASSWORD` sin
  usarlos; la separación del worker llega en F4.
- Login, MFA, step-up y logout no escriben en `audit_events`; los rechazos de
  seguridad sí quedan en el log (`seguridad.rechazo`).
- Verificar contra GoTrue en staging: reutilización de un TOTP dentro de su
  ventana con otra clave de idempotencia, la política de contraseñas del
  proyecto cloud, `inactivity_timeout` según el plan contratado, `schemas =
  ["api"]` en el proyecto cloud y la cuota de MFA (15 por minuto por IP).
- El primer enrolamiento de TOTP sin verificación previa se cierra con la
  invitación de admins (F2b).
- La revocación del logout es inmediata en local (HS256) pero no con claves
  asimétricas en producción: el access token vale hasta 600 s y SEC-07 lo
  mitiga resolviendo el actor en cada petición.

- **B-6 (desvío)**: `createSession` deriva la identidad del actor y el hash de
  idempotencia del email normalizado (sin contraseña). Por eso «misma clave con
  otro payload → 409» ya no ocurre en el login y cada login escribe una fila.
- Hallazgo propio al implementar O1: con techo global de renovación 60 y límite
  por IP 60, una sola IP con cookies falsas agotaba el techo de todos. Se
  rebalanceó (80 / 30 por IP) y una prueba de integración lo vigila.
- Ronda 3, no corregido (decisión o trabajo posterior):
  - Telemetría de O6 (`route`/`reason` del logger y `rejectReason` de los guards)
    sin pruebas específicas.
  - Las operaciones MFA consumen la clave de idempotencia antes de llamar a Auth:
    si Auth falla después (503/timeout) o el enrolamiento termina en 409, un
    reintento con la misma clave da 409 y no el error original. El frontend debe
    generar una clave nueva por intento. `mfa:user` es un bucket compartido por
    enrolar, verificar y step-up.
  - `consume_rate_limit` y `record_public_idempotency` son invocables con la anon
    key directamente en PostgREST: pueden crear filas sin tope y `consume_rate_limit`
    acepta límite y ventana elegidos por el llamador. Propuesta: tabla de políticas
    por bucket con allowlist en el servidor y purga ligada (con F4/F7).
  - La política `audit_events_own_insert` permite a un usuario auditar sus propios
    actos con `actor_kind = 'usuario'`; no puede atribuir a otro actor (pgTAP).
    Decidir si `write_audit` pasa a DEFINER.
  - `TRUSTED_PROXIES` admite prefijos IPv4 desde /8; conviene un mínimo /16 o
    saltos enumerados (se fija con la topología real en F9).
  - Backend-Contracts.md prohíbe 429 en `createHospitalNeed`, pero `authenticate`
    es global en `/api` y puede emitir 429 y 503: se reconcilia en F3.
- **O9 (declarado)**: los límites de intento del backend (login, MFA, CSRF) solo
  protegen el camino por Express. Quien tenga la anon key puede llamar a GoTrue
  directamente (`enable_signup = true` en local y F2b usa `signUp`), de modo que
  solo aplican los límites por IP de Supabase. La mitigación real es que la anon
  key no salga del servidor y fijar el estado de signup en el proyecto cloud.
- **O10 (declarado, aceptado por diseño)**: 10 intentos fallidos con el email de
  una víctima la bloquean 15 min (RNF-SEC-15); es un bloqueo dirigido.
- **O1 (decidido por ti el 2026-10-12: adaptarse al plan base)**: Supabase limita
  `/auth/v1/token` por IP del backend en un solo bucket (150 cada 5 min) y el plan
  no permite ampliarlo. Se implementaron techos globales propios por flujo (50
  logins y 80 renovaciones cada 5 min, suma 130 < 150; el límite de renovación por
  IP baja a 30 cada 15 min) en
  `application/auth-quota.ts`, con motivo de alerta `auth_quota_login` /
  `auth_quota_refresh` y 429 con `Retry-After`; quedó en ADR-004. Riesgo residual
  aceptado: un ataque distribuido puede negar nuevos logins durante la ventana
  (las sesiones abiertas siguen renovándose). Pendiente operativo: alerta sobre
  esos motivos en el entorno real (F9).
- O3 queda parcial: hay timeout, pero un token con `alg` HS* o `kid` ajeno aún
  provoca una llamada a Auth antes de cualquier límite (`getClaims` de auth-js).
  `SUPABASE_JWKS_URL` sigue sin usarse.
- O7: el `grant execute on all functions in schema app` repite el de la primera
  migración; se concederá función por función cuando haya DEFINER en `app`.
- El `alter default privileges … revoke execute … from public` es global:
  afectará a funciones de extensiones futuras (p. ej. cube/earthdistance en F5),
  que necesitarán grants explícitos.

## 7. Bitácora

- 2026-10-12: ratificación, migraciones, pgTAP, API, integración y Bruno contra
  el backend real.
- 2026-10-12: primera ronda de revisión independiente (dos FAIL) y remediación.
- 2026-10-12: segunda ronda (reviewer-back FAIL, seguridad PASS con observaciones) y remediación.
- 2026-10-12: tercera ronda (reviewer-back FAIL, seguridad PASS con observaciones) y remediación.
- 2026-10-12: cuarta ronda enfocada (reviewer-back PASS con observaciones), decisión O1 y aprobación de las excepciones de MFA y login.

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
- **Pruebas**: 288 unitarias del backend (`npm test`), 37 de integración contra
  Supabase local (`npm run test:backend:integration`) y Bruno contra el backend
  real (`npm run test:bruno:backend`).

## 3. Decisiones y desviaciones a documentar

- **Replay de operaciones MFA**: `verifyMfaChallenge`, `verifyStepUp` y
  `enrollMfaFactor` responden 409 ante una clave ya usada, porque el código TOTP
  no se puede reutilizar. Es una excepción a REL-01 que **espera tu aprobación**
  al cerrar el módulo.
- **Step-up en `revokeHospitalMembership`** (RNF-SEC-05): decisión tuya del
  2026-10-12. El contrato ya declaraba 403.
- **Contrato**: tras la revisión se declararon en `docs/openapi.json` los errores
  que el backend realmente devuelve (400 en entradas tipadas, 503 en toda
  operación salvo salud, 403 en `verifyMfaChallenge`, 409 en `verifyStepUp`, 422
  en `listHospitalMemberships`). El inventario congelado de Prism pasó a 322
  errores y 427 casos.
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
| `npm test` | verde (288 pruebas del backend, más mock y web) |
| `npm run test:backend:db` | 99 pruebas pgTAP en verde |
| `npm run test:backend:integration` | 37 pruebas en verde (incluye que todo estado HTTP devuelto esté declarado en el contrato) |
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

**Tercera ronda: pendiente.** El único PASS registrado hasta ahora es el de
seguridad de la segunda ronda, y es anterior a estas correcciones.

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
- **O1 (decisión tuya pendiente)**: Supabase limita `/auth/v1/token` por IP del
  backend en un solo bucket (150 cada 5 min, login y renovación juntos). Un
  ataque distribuido lo agota aunque el límite por IP del backend funcione.
  Opciones: `Sb-Forwarded-For` (exige una clave `sb_secret_…` en el gateway de
  sesión, lo que choca con ADR-006), subir los límites del proyecto y añadir un
  techo global con alerta, o aceptar el riesgo documentado. Debe quedar en
  ADR-004 antes de F9.
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

# Verificación del backend (Fase A de `Backend-Route.md`)

Fecha: 2026-10-21. Ejecutó: Claude Code (sesión Senior), en línea, sin subagentes. Estado: **V0–V7 ejecutados; V8 y V9 pendientes (esperan A1/A2/A3); V10 parcial.**
Alcance: F2a–F7 sobre HEAD `9c18f61`. Datos sintéticos; la evidencia no contiene PII, tokens, coordenadas ni cuerpos. Los registros completos quedaron en el scratchpad de la sesión (no en el repo).

## Resultados por paso

| ID | Comando | Resultado |
| --- | --- | --- |
| V0 | `git status`, versiones, `supabase status --workdir backend` | Node 24.19.0, npm 12.0.2, Bruno 4.2.0, Supabase CLI 2.121.0. Árbol con solo cambios ajenos (`.playwright-mcp/`, este plan). BD **local** (`127.0.0.1:54322`, sin proyecto enlazado) |
| V1 | Lectura de código + `git log -S` | Ver tabla de hallazgos |
| V2 | `openapi:lint`, `openapi:api:check`, `test:api:generator`, `typecheck`, `lint`, `build` | exit 0 en los seis |
| V3 | `npm test` | exit 0. Backend 766 (67 archivos); los otros workspaces 50, 15 y 112 |
| V4 | `npm run test:backend:db` | **1.ª corrida FAIL** con la BD tal como estaba (19 usuarios residuales: falló la prueba 42 de `08` y `09` por `worker@example.test` duplicado). Tras `supabase db reset --workdir backend`: **684 pruebas, PASS** |
| V5 | `npm run test:backend:integration` | **1.ª corrida FAIL** (207/208): `need-records.integration.ts:335`, el `select reason … limit 1` sin `order by` toma un evento `denegacion.limite` previo de la misma cuenta (`POST /api/v1/auth/mfa-verifications`). **2.ª corrida: 208/208 PASS**. Prueba dependiente del orden (flaky) |
| V6 | `npm run test:bruno:backend`, `npm run test:bruno` | Backend real: 10 colecciones, 152 requests, 158 tests, todo verde. Mock: 24 requests, 29 tests, verde (el mock no cuenta como evidencia del backend) |
| V7 | `timeout 540 npm run test:contract` | **FAIL, no verificado.** exit 124; 65 pasan, 7 fallan, 1 cancelada. `COVERAGE_INVENTORY` en `buildPlan` (`scripts/prism-contract.mjs:117/344`) y `CLI readiness timeout` del CLI de Prism. Causa sin diagnosticar; el último cambio de `openapi.json` fue la ratificación de F7 (`0a710e1`), posible desfase con el inventario del runner (hipótesis, no comprobada) |

## V1: estado de los hallazgos en HEAD

Determinado por lectura de código y `git log`; **ninguno tiene prueba de regresión que lo reproduzca**.

| ID | Estado | Evidencia |
| --- | --- | --- |
| B1 | **Abierto (parcial)** | `worker_delete_inert_user` ya borra en una sola sentencia (`3f27e16`, `20261013050000_action_tokens.sql:370`), pero `app.user_accounts.user_id` es `on delete cascade` sobre `auth.users` (`20261013000000_platform_base.sql:35`) y el `not exists` usa el snapshot de la sentencia: una cuenta vinculada en paralelo podría borrarse en cascada. Sin bloqueo de `auth.users` ni prueba de carrera |
| B2 | **Abierto (parcial)** | `parseEnv(…, 'api'\|'worker')` separa solo las credenciales técnicas (`bad932b`). El worker sigue exigiendo `SUPABASE_SERVICE_ROLE_KEY`, `CSRF_SECRET`, `EMAIL_HMAC_SECRET`, `CURSOR_SECRET`, `RESEND_*` y demás (`env.ts:75–95`). Aún no hay `ApiConfig`/`WorkerConfig` separados |
| B3 | **Abierto** | `donor-records-service.ts:248–249`: si `finishEmailChange(true)` falla tras `updateEmail`, no se llama a `revokeSessions`. La prueba (`…service.test.ts:282`) solo cubre el camino feliz |
| B4 | **Abierto** | `20261013030000_need_records.sql:147–164`: la sede se lee sin bloqueo (`for share`/`for update`) antes del `insert`; sin prueba de concurrencia |
| SP-01 | **Abierto** | No existe ADR nuevo en `docs/decisions/` (solo ADR-001…006); `password_setup_required` se levanta en `20261013060000_donor_records.sql:787` sin barrera de generación/sesión |
| SP-04 | **Abierto** | `create_assisted_signup` (`…donor_records.sql:288–319`) devuelve el replay sin revalidar el hospital del admin actual; `create_hospital_need` sí lo hace |
| P-12 | **Abierto / bloqueado (A3)** | `privacy-requests-service.ts:128,164` devuelve `SERVICE_UNAVAILABLE`; el puerto del borrado de Auth (`privacy-requests.ports.ts:88`) no tiene adaptador de producción |

## Actualización: V7, V8 y V9 (misma fecha)

**V7 corregido.** `COVERAGE_INVENTORY` venía de que `0a710e1` (ratificación de F7) añadió 32 respuestas de error (478→510, 585→617 casos) sin actualizar el inventario revisado del runner (`scripts/prism-contract.mjs`, `.test.mjs`). Con el inventario actualizado: 72/72 y sin timeout de Prism.

**V8: B1, B2, B3, B4 y SP-04 corregidos** (autorizados por la persona usuaria; sin commit todavía). Escritores: subagentes `sonnet`; revisor: subagente `opus` distinto.

| ID | Cambio | Archivos |
| --- | --- | --- |
| B1 | `for update` sobre `auth.users` y revalidación con instantánea nueva; prueba de carrera con dos conexiones y `pg_blocking_pids` (falla en HEAD) | `migrations/20261021000000_inert_user_lock.sql`, `test/integration/inert-user-cleanup.integration.ts`, `test/support/psql-session.ts` |
| B4 | `FOR SHARE` no sirve (el admin no tiene política UPDATE sobre `sites`); se captura `insufficient_privilege` y, si la sede ya no es usable, `site_unusable` (422) deshaciendo el claim; INVOKER | `migrations/20261021010000_need_site_race.sql`, `test/integration/site-need-race.integration.ts` |
| SP-04 | El replay de otro hospital devuelve `forbidden` sin `response`, sin alta ni correo | `migrations/20261021020000_assisted_signup_replay_hospital.sql`, `tests/database/10_assisted_signup_replay.test.sql` |
| B2 | `WorkerConfig` + `parseWorkerEnv`/`parseApiEnv`; el worker ya no exige service_role, CSRF, cursor, edge, JWKS, orígenes ni `API_TECHNICAL_*`. **Sin RED real** (se escribió la implementación antes que las pruebas) | `src/config/env.ts`, `worker.ts`, `composition-worker.ts`, `shared/**`, `.env.example` |
| B3 | Si el resultado de Auth es incierto o `finishEmailChange(true)` falla, se revocan sesiones y se propaga el error; si la revocación falla, 503; «correo ocupado» sin cambios | `donor-records-service.ts` y su test |
| — | `EXPECTED_SCHEMA_VERSION` → `20261021020000`; prueba flaky de `need-records.integration.ts` filtrada por `reason` | `schema-version.ts`, `need-records.integration.ts` |

**Regresión completa tras V8 (BD reseteada):** openapi:lint, openapi:api:check, typecheck, lint y build exit 0; unitarias 50/15/774/112; pgTAP 693 PASS; integración 211/211 (repetida dos veces, estable); Bruno backend y mock exit 0; contrato 72/72.

**Gates sobre el diff de V8**
- `reviewer-back`: **PASS** global (B1, B4, SP-04, B2, B3). Observaciones no bloqueantes: (media) la prueba de B4 aceptaba `created` (corregido: ahora exige `site_unusable`); (baja) comentario obsoleto de `FOR SHARE` (corregido); `parseApiEnv`/`ApiConfig` solo se usan en pruebas, `server.ts` sigue con `parseEnv` (abierto); en SP-04 un alta purgada devuelve el DTO guardado a un admin reasignado y `claim_idempotency` podría devolver un `replayed` sin revalidar (abiertos, bajos).
- `security-privacy-auditor`: **pendiente, no ejecutado.** El clasificador de permisos denegó el lanzamiento del subagente. No se reintentó por otra vía.

**V9 sobre F5/F7 (`reviewer-back`)**
- F5: **PASS**. Obs. baja: `Idempotency-Key` exigida pero no usada en verificaciones por token (409/410 en vez de replay).
- F7: **BLOCKED.** `createContextualAccessGrant` y `getContextualDonorData` devuelven 409 (`privacy_requests.sql:358-366,419-427`) y `docs/openapi.json` no lo documenta; la prueba de integración `privacy-requests.integration.ts:133` fija esa desviación. Requiere decisión: añadir 409 al contrato (cambio sobre operaciones ratificadas) o remapear. Obs. baja: el worker marca `fallida` una solicitud cuyo correo sí cambió (`privacy_execution.sql:258`); `get_contextual_donor_data` es DEFINER de lectura no enumerada en ADR-003.
- `security-privacy-auditor` sobre F5/F7 y `clinical-safety-reviewer`: **pendientes**.

## Actualización 2026-10-22: F7, SP-01, P-12 y gates

Decisiones de la persona usuaria: A1 (B1–B4, SP-04), F7 opción (a), A2 (ADR-007 aceptado) y P-12 opción (a) solo para V15. Commits: `da618cd`, `a5110eb`, `1e0bbd3`, `86afd2f`, `f58ab8e`, `0dd60f9`, `83c1f7b`, `48ca797`, `c864044` (409 de F7), `a9193aa` (SP-01) y `c4aab53` (P-12).

- **F7:** 409 documentado en `createContextualAccessGrant` y `getContextualDonorData`; runner de contrato 512 errores y 619 casos. El `reviewer-back` pasó de BLOCKED a resuelto (sin re-revisión formal del cambio de contrato; verificado por lint, `api:check` y `test:contract`).
- **SP-01:** ADR-007 aceptado e implementado (migración `20261022000000_session_barrier.sql`, 3 RPC técnicas, Express con ticket y admisión, 95 aserciones pgTAP). S1 (refresh y AAL2 conservan `session_id`) **confirmado** en integración real; S2 confirmado; S3 (`signOut` local con sesión no admitida) solo mockeado.
- **P-12 (a):** `AuthAdmin.deleteAccount` para la eliminación V15 (ADR-006, cinco métodos). Un resultado incierto de Auth deja la solicitud `en_ejecucion` (503) en vez de `fallida`. **Siguen abiertas** las purgas del worker (`reclamada_incompleta` > 30 días, inertes > 24 h); la purga de inertes a las 24 h descrita en ADR-006 no existe en el código.
- **Gates:** V8 → `reviewer-back` PASS, `security-privacy-auditor` PASS. F5 → ambos PASS. F7 → `security` PASS; `reviewer-back` BLOCKED resuelto con el 409. SP-01/P-12 → `reviewer-back` PASS en código (BLOCKED en pruebas, corregido: refresh real, pgTAP tabla por tabla, Bruno 12 eliminado por no discriminar, aserción débil) y `security` PASS con re-revisión del delta. **`clinical-safety-reviewer`: no ejecutado** (F5–F7 no tocan copia clínica nueva en esta fase; se hará con F6).
- **Regresión final (BD reseteada):** `api:check`, typecheck, lint y build exit 0; pgTAP 788; integración 218 (dos pasadas); Bruno backend 152 requests; Bruno mock verde; contrato 72/72.

**Abiertos para decisión:** (1) purgas del worker (b2 recomendada); (2) corregir en ADR-006 la consecuencia sobre la purga de inertes; (3) factores TOTP creados antes del reset sobreviven a `completePasswordReset` (hallazgo Low del auditor); (4) separación de funciones del superadmin en F7 (cuatro ojos); (5) conciliar con Auth antes de marcar `fallida` una solicitud F7 cuyo cambio de correo quedó incierto.

## Pendiente (histórico de la primera pasada)

- **SP-01 (A2) y P-12 (A3):** el ADR propuesto y las opciones aún no están redactados (lanzamiento del arquitecto denegado por el clasificador). Siguen bloqueados.
- **Gate de seguridad** (`security-privacy-auditor`) sobre V8, F5 y F7: no ejecutado.
- **F7:** decisión sobre el 409 no documentado (contrato vs. implementación).
- **Commits:** nada se ha commiteado; las unidades de V8 están sin stage.
- **V10:** inventario de `docs/README.md` sin re-ejecutar; `mem_save` pendiente.

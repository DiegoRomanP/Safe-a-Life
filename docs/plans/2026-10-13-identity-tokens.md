# Plan del módulo F2b: invitación de admins hospitalarios y recuperación de contraseña

| Campo | Valor |
| --- | --- |
| Estado | Cerrado el 2026-10-13 bajo la autonomía concedida (ver §8) |
| Fecha | 2026-10-13 |
| Rama | `feat/backend-developing` |
| Especificación | `docs/plans/2026-10-12-especificacion-faltante-backend.md` §6 F2b; ADR-004, ADR-005 y ADR-006 |
| Requisitos | F4 y V18 (aceptados el 2026-10-12) |
| Gate | `reviewer-back` más `security-privacy-auditor` |

## 1. Operaciones (ratificadas el 2026-10-13)

`inviteHospitalAdmin` (POST, superadmin + AAL2 + step-up), `getHospitalAdminInvitationPreview` (GET),
`claimHospitalAdminInvitation` (POST), `requestPasswordRecovery` (POST) y `completePasswordReset` (POST). Las cuatro
últimas son públicas (`security: []`).

## 2. Qué se construyó

- **Migración** `20261013050000_action_tokens.sql`: `app.action_tokens` (solo el hash del token), `app.admin_invitations`,
  helpers para DEFINER sin el esquema `auth` (`app.jwt_claims`, `app.d_require`, `app.d_step_up_fresh`, `app.d_audit`),
  las cinco RPC DEFINER y las excepciones `app.user_id_by_email`, `api.worker_revoke_sessions` y `api.worker_delete_inert_user` (propiedad de `postgres`).
- **Aplicación**: `action-tokens-service` (invitar, vista previa, reclamar, recuperar, completar), puertos
  `ActionTokensRepository` y `AuthAdmin`.
- **Infraestructura**: `action-tokens-rpc-gateway` (guards cerrados), `supabase-auth-admin` (**único** archivo con
  `service_role`: `updatePassword`, `updateEmail`, `deleteInertUser`, `revokeAllSessions`) y `signUp` en el gateway de sesión.
- **HTTP**: `action-tokens.router.ts`.
- **Pruebas**: unitarias (servicio, gateway, adaptador con Auth simulado), pgTAP (`05_action_tokens`), integración
  (`action-tokens.integration.ts`) y Bruno (`superadmin/17_invite_admin` y la carpeta `tokens`, donde el runner hace de
  bandeja de entrada).

## 3. Decisiones y desviaciones a documentar

- **D-1: más excepciones DEFINER propiedad de `postgres`** (ADR-003 regla 4): `app.user_id_by_email` y
  `api.worker_revoke_sessions`, además de `app.user_email` (F4). `app_privileged` no puede acceder al esquema `auth` en
  Supabase. Cada una hace una sola cosa y tiene `EXECUTE` restringido (a `app_privileged` y a `service_role`). Anotado en
  ADR-003; la ampliación de la allowlist corresponde en último término a la persona usuaria.
- **D-2: revocación de sesiones.** GoTrue (v2.197) no tiene endpoint por usuario; se usa
  `api.worker_revoke_sessions` (previsto en ADR-006 punto 3). `service_role` recibe `USAGE` sobre el esquema `api`.
- **D-3: la vista previa SQL devuelve el correo invitado** solo para que la aplicación cree la cuenta de Auth; el HTTP
  nunca lo expone (prueba de integración y Bruno).
- **D-4: el reset no usa replay de idempotencia.** El cuerpo lleva la contraseña nueva, así que el token es de un solo
  uso estricto: un segundo intento, aunque repita la clave, es 410. Si Auth rechaza la contraseña tras consumir el
  token, el usuario debe pedir otro enlace.
- **D-5: invitación a un hospital inexistente es 422** (el contrato no declara 404) y a uno sin autorizar 409.
- **D-6: un login recién hecho cuenta como step-up** durante 300 s (ya documentado en F2a); la falta de step-up en
  `inviteHospitalAdmin` se prueba en pgTAP, no por HTTP.
- **D-7: el admin invitado queda en AAL1 con `mfaRequired: true`**; debe enrolar TOTP (`enrollMfaFactor`) para operar.
- **D-8: contrato.** Las operaciones públicas no exigen 401 en la prueba estructural (`security: []`); todas declaran
  400, 403, 429, 500 y 503. Prism: 391 errores y 497 casos.
- **D-10 (hallazgo crítico de la primera ronda): las RPC públicas ya no las ejecuta `anon`.** La vista previa, la
  solicitud de recuperación y el consumo del reset exigen la identidad técnica del backend (`app.is_worker()`), con
  `EXECUTE` solo para `authenticated`. Antes `request_password_recovery` aceptaba de un llamador anónimo el hash del
  token: con la anon key (pública) se podía crear un token de recuperación para cualquier correo con un hash elegido y
  luego restablecer su contraseña. El backend las llama con su sesión técnica (`createTechnicalInvoker`, con
  reintento ante un 401). Prueba de integración: la llamada directa con la anon key falla y no crea nada.
- **D-11: idempotencia de la recuperación dentro de la RPC.** Un reintento con la misma clave no crea otro token ni
  otro correo (antes `record_public_idempotency` devolvía `ok` también en un replay). El contrato declara el 409
  (`in_progress` en una solicitud simultánea idéntica).
- **D-12: reset con revocación en dos pasos.** consumir → revocar sesiones → cambiar contraseña → revocar otra vez
  (con un reintento): si Auth falla a mitad, las sesiones anteriores ya no existen; los access tokens vigentes valen
  hasta 600 s.
- **D-13: usuarios huérfanos.** Un usuario de Auth sin cuenta de aplicación y de más de un minuto que ocupa el correo
  invitado se elimina al reclamar (quien tiene el token es dueño del buzón) y se repite el registro; una cuenta con
  vida propia nunca se elimina (409). El minuto evita borrar el registro en curso de un reclamo simultáneo.
- **D-14: límites.** Recuperación: 10 por IP cada 15 min y 3 por correo por hora. Invitaciones: 20 por superadmin por
  hora, contadas sobre invitaciones reales. La cuenta técnica `worker` no se recupera por correo. Bloqueo por
  correo/sujeto con `pg_advisory_xact_lock` para dejar un único token vigente.
- **D-15: la invitación comprueba el replay antes del estado del hospital** (peek → estado → claim).
- **D-9: `ApiClient`, TOTP y entorno de pruebas.** Con `/tmp` lleno por procesos ajenos, las pruebas usan
  `TMPDIR=backend/.local/tmp`.

## 4. Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | verde |
| `npm test` | verde (631 pruebas del backend, más mock y web) |
| `npm run test:backend:db` | 366 pruebas pgTAP en verde (89 de `05_action_tokens`) |
| `npm run test:backend:integration` | 159 pruebas en verde (28 de `action-tokens`) |
| `npm run test:bruno:backend` | superadmin 18 solicitudes, tokens 10 solicitudes y 11 pruebas, más el resto |
| `npm run test:contract` | 72 pruebas en verde (391 errores y 497 casos) |

## 5. Revisiones independientes

Primera ronda (2026-10-13), subagentes de contexto separado, solo lectura, sobre `4fdd04d..fa5482a`:

- `security-privacy-auditor`: **FAIL** (1 crítico). Crítico: `api.request_password_recovery`, ejecutable por `anon`,
  aceptaba el hash del token del llamador: toma de cualquier cuenta de la aplicación con solo conocer su correo. Medios:
  saltarse el backend (límites y piso de tiempo), ocupación pública del correo invitado (bloqueo del invitado),
  orden de la revocación en el reset, spam de correos de recuperación. Bajos: la cuenta `worker` recuperable,
  `lower(email)` sin índice, retención del correo invitado, varios tokens vigentes simultáneos, sin cuota de
  invitaciones.
- `reviewer-back`: **FAIL** (1 bloqueante, 4 mayores). Bloqueante: el mismo hallazgo crítico. Mayores: 409 de la
  recuperación no declarado, correos duplicados al repetir la misma clave, sesiones vivas si falla la revocación tras
  cambiar la contraseña, ninguna carrera con prueba. Menores: reclamo no idempotente en la práctica (el `replayed` es
  inalcanzable), limpieza con huecos, `weak_password` como 503, gobernanza (ADR-003), pruebas débiles.

Correcciones: ver D-10 a D-15, más pruebas pgTAP nuevas (anon sin acceso, usuario no técnico `forbidden`, idempotencia
propia, cuenta `worker`, huérfano por antigüedad, cupo de invitaciones, replay tras desautorizar), de integración
(llamada directa con la anon key, tres carreras reales, huérfano, cuenta con vida propia, 3 solicitudes por hora) y
unitarias.

Segunda ronda (2026-10-13), `security-privacy-auditor` sobre las correcciones: **PASS condicionado** (sin críticos ni
bloqueantes nuevos). Condiciones y respuesta:

- **M1** (la credencial técnica `WORKER_*` permite pedir recuperaciones saltándose los límites del backend): se añadió un
  tope por cuenta dentro de la RPC (3 enlaces por hora, sobre filas reales, con bloqueo asesor por cuenta; superado,
  responde `ok` sin crear nada) y la contraseña técnica debe tener al menos 32 caracteres en producción. **Riesgo
  residual aceptado bajo la autonomía concedida:** quien robe `WORKER_EMAIL`/`WORKER_PASSWORD` puede, además de operar el
  outbox, emitir hasta 3 enlaces por hora y cuenta; la mitigación operativa es guardar la credencial solo en el secreto
  del servicio y rotarla (ver runbook de F9). Queda a decisión de la persona usuaria si quiere más barreras.
- **M2** (reintento de la segunda revocación): si falla también el reintento, `completePasswordReset` responde 503 en vez
  de éxito silencioso (prueba unitaria nueva); el token ya está consumido y se puede pedir otro enlace.
- **M3** (bloqueante de F5, `deleteUser` no atómico): sustituido por `api.worker_delete_inert_user` (ADR-003/006);
  pgTAP: correo distinto, cuenta con vida propia, usuario joven (registro en curso) y borrado válido.
- **B1**: bloqueo asesor por superadmin antes de contar invitaciones. **B4**: `requestPasswordRecovery` y
  `createDonorRegistration` salen de `record_public_idempotency` (llevan su propia idempotencia dentro de la RPC).
- **Riesgos residuales documentados (B2, B3, B5):** B2, el 409 del reclamo revela que un correo invitado ya tiene
  cuenta (aceptado: solo se llega con un token de invitación válido); B3, los intentos de reclamo se limitan por IP y
  por token pero no por correo; B5, las respuestas de `requestPasswordRecovery` igualan estado y cuerpo, y el piso de
  tiempo de 150 ms no elimina por completo la señal de temporización bajo carga.

**Estado:** la segunda ronda fue una revisión independiente; no se ejecutó una tercera sobre las correcciones de esta
ronda, por lo que **no se afirma un PASS sobre ellas**.

## 6. Pendientes conocidos

- `updateEmail` y el flujo de cambio de correo del donante (`verifyEmailChange`): F5.
- Purga de usuarios de Auth inertes (`signUp` público sin cuenta de aplicación) tras 24 h con `deleteInertUser` (ADR-006): worker de purgas, F7.
- Purga de `action_tokens` vencidos y de `admin_invitations` (el correo invitado queda en claro tras consumirse o vencer): F7.
- El reclamo no es idempotente en la práctica: un reintento tras perder el 201 da 410 aunque la cuenta ya exista (el
  invitado puede iniciar sesión); el `replayed` de `link_admin_account` solo es alcanzable por una llamada directa con
  la sesión del invitado. Las cookies no son reproducibles por diseño.
- Un doble envío simultáneo del reclamo puede devolver 503 al perdedor (Auth rechaza el registro simultáneo).
- Un correo ya encolado para una invitación anulada se envía igual con un enlace muerto (la anulación no cancela el outbox).
- Revisión de `lower(email)` sin índice en `auth.users` (rendimiento) con `EXPLAIN`.
- Verificar en staging la política de contraseñas del proyecto cloud y `enable_signup`.

## 7. Bitácora

- 2026-10-13: contrato, migración, pgTAP, servicio, adaptadores, router, integración y Bruno contra el backend real.

## 8. Cierre

Cerrado el 2026-10-13 bajo la autonomía concedida por la persona usuaria. Queda a su decisión la ampliación de la
allowlist DEFINER con tres funciones propiedad de `postgres` (D-1) y, en general, que ninguna de estas correcciones ha
sido revisada por un subagente independiente.

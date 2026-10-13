# Plan del módulo F2b: invitación de admins hospitalarios y recuperación de contraseña

| Campo | Valor |
| --- | --- |
| Estado | Implementado; revisiones independientes pendientes (ver §5) |
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
  las cinco RPC DEFINER y las excepciones `app.user_id_by_email` y `api.worker_revoke_sessions` (propiedad de `postgres`).
- **Aplicación**: `action-tokens-service` (invitar, vista previa, reclamar, recuperar, completar), puertos
  `ActionTokensRepository` y `AuthAdmin`.
- **Infraestructura**: `action-tokens-rpc-gateway` (guards cerrados), `supabase-auth-admin` (**único** archivo con
  `service_role`: `updatePassword`, `updateEmail`, `deleteUser`, `revokeAllSessions`) y `signUp` en el gateway de sesión.
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
  400, 403, 429, 500 y 503. Prism: 390 errores y 496 casos.
- **D-9: `ApiClient`, TOTP y entorno de pruebas.** Con `/tmp` lleno por procesos ajenos, las pruebas usan
  `TMPDIR=backend/.local/tmp`.

## 4. Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | verde |
| `npm test` | verde (623 pruebas del backend, más mock y web) |
| `npm run test:backend:db` | 348 pruebas pgTAP en verde (71 de `05_action_tokens`) |
| `npm run test:backend:integration` | 150 pruebas en verde (19 de `action-tokens`) |
| `npm run test:bruno:backend` | superadmin 18 solicitudes, tokens 10 solicitudes y 11 pruebas, más el resto |
| `npm run test:contract` | 72 pruebas en verde (390 errores y 496 casos) |

## 5. Revisiones independientes

Pendientes. No se afirma ningún PASS hasta que ocurra.

## 6. Pendientes conocidos

- `updateEmail` y el flujo de cambio de correo del donante (`verifyEmailChange`): F5.
- Purga de usuarios de Auth inertes (`signUp` público sin cuenta de aplicación) tras 24 h con `deleteUser` (ADR-006): worker de purgas, F7.
- Purga de `action_tokens` vencidos: F7.
- Verificar en staging la política de contraseñas del proyecto cloud y `enable_signup`.

## 7. Bitácora

- 2026-10-13: contrato, migración, pgTAP, servicio, adaptadores, router, integración y Bruno contra el backend real.

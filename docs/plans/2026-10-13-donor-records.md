# Plan del módulo F5: donantes, altas asistidas, verificación y cambio de correo

| Campo | Valor |
| --- | --- |
| Estado | Implementado y verificado; cerrado bajo autonomía (ver §8) |
| Fecha | 2026-10-13 |
| Rama | `feat/backend-developing` |
| Especificación | `docs/plans/2026-10-12-especificacion-faltante-backend.md` §6 F5 y C-12; ADR-003, ADR-004 y ADR-006 |
| Requisitos | F4, V11, V18 y C-12 |
| Gate | `reviewer-back` más `security-privacy-auditor` (PII y ubicación) |
| Decisiones de la persona usuaria | `docs/plans/2026-10-13-decisiones-backend.md` |

## 1. Operaciones (ratificadas el 2026-10-13)

Públicas por token (`security: []`): `createDonorRegistration`, `getDonorEmailVerificationPreview`, `verifyDonorEmail`,
`getAssistedActivationPreview`, `claimAssistedRegistration`, `getEmailChangePreview`, `verifyEmailChange`.
Donante con sesión: `completeDonorOnboarding`, `getOwnDonorProfile`, `updateOwnDonorParticipation`.
Admin hospitalario (AAL2 y membresía vigente): `listOwnAssistedSignups`, `createAssistedSignup`,
`getOwnAssistedSignup`, `reissueAssistedActivationLink`.

## 2. Qué se construyó

- **Dominio**: `lima-polygon` (envolvente sintética `DEMO_ONLY-1` con SHA-256 fijado por prueba), `location`
  (rango, tres decimales por comparación entera, punto en el polígono o sobre el borde), `donor-profile` (estados).
- **Migración** `20261013060000_donor_records.sql`: tablas `app.donor_profiles` y `app.assisted_signups` (RLS forzada, con
  CHECK de validación), trigger de guarda `app.guard_donor_profile`, trigger `donor_profiles_sync_signup` (función
  `api.sync_assisted_signup_status`) y 17 RPC:
  - 10 de la sesión técnica: `link_donor_account`, `reissue_donor_verification`, `get_donor_verification_preview`,
    `verify_donor_email`, `get_assisted_activation_preview`, `issue_assisted_activation`, `get_assisted_signup_recipient`,
    `link_assisted_account`, `get_email_change_preview` y `consume_email_change`;
  - 2 DEFINER del admin, sin argumentos de token, outbox ni sellado: `create_assisted_signup` y `reissue_assisted_link`;
  - 2 INVOKER del admin: `list_own_assisted_signups` y `get_own_assisted_signup`;
  - 3 INVOKER del donante: `get_own_donor_profile`, `complete_own_onboarding` y `update_own_participation`.
- **Aplicación**: `donor-records-service`, `email-change` (sellado del correo nuevo), puertos `DonorRecordsRepository`.
- **Infraestructura**: `donor-records-rpc-gateway` (guards cerrados; sesión técnica o JWT de la persona según la RPC);
  `supabase-auth-admin.updateEmail` pasa a llamar al endpoint de administración con `fetch` (ver D-8).
- **HTTP**: `donor-records.router.ts`; guards `donorRead`/`donorWrite` en `route-helpers`.
- **Contrato**: 14 operaciones ratificadas y estados globales declarados (Prism: 447 errores y 553 casos).

## 3. Decisiones y desviaciones

- **D-1: toda RPC con hash de token o id de usuario es solo de la sesión técnica** (lección de F2b): `link_donor_account`,
  vistas previas, `verify_donor_email`, `link_assisted_account`, `get_assisted_signup_recipient`, cambio de correo.
  `anon` no ejecuta ninguna RPC de F5. Prueba de integración con la anon key y con un usuario cualquiera.
- **D-2: `verifyDonorEmail` no abre sesión** (C-12): la operación no recibe la contraseña. El estado se informa como
  `reclamada_incompleta` (interpretación de la especificación: perfil incompleto). Se quitó el `Set-Cookie` del 200.
- **D-3: el admin no puede leer el correo ni el nombre de las altas** (privilegios por columna; `signup_json` recibe
  solo columnas permitidas). Para reemitir, el backend obtiene el correo con la sesión técnica
  (`get_assisted_signup_recipient`, solo de un alta reemitible del hospital de la sesión) únicamente para sellarlo en el
  correo.
- **D-4: emisión en dos pasos.** El admin registra o reemite la alta con una RPC que no recibe hash de token ni sellado
  (hallazgo A1 de seguridad: un admin podía elegir el hash). La sesión técnica emite el enlace con
  `issue_assisted_activation`, idempotente por `(alta, secuencia)`; un conflicto de estado se absorbe.
- **D-5: respuestas sin enumeración.** Registro con un correo existente: mismo 202 y piso de 700 ms; si la verificación
  sigue pendiente se reenvía con `reissue_donor_verification` (reemitir invalida el enlace anterior). Alta asistida con
  un correo que ya es cuenta: misma forma, sin token ni correo.
- **D-6: límites.** Registro: 10 por IP cada 15 min y 3 por correo por hora. Altas asistidas: 20 por hospital y hora
  contadas sobre filas reales (ratificado, ver decisión 3), 3 enlaces por alta y hora y 3 enlaces por correo cada 24 h.
  Se serializa con un bloqueo asesor antes de contar.
- **D-7: privilegios de columna del perfil más amplios que el texto de la especificación.** El donante puede actualizar
  nombre, grupo, estado, disponibilidad y ubicación porque `complete_own_onboarding` es INVOKER (como indica la
  especificación); un trigger y la RLS limitan qué cambios valen en cada estado (un perfil activo solo cambia
  disponibilidad y ubicación; uno sin verificar, nada). El esquema `app` no se expone por PostgREST.
- **D-8: `updateEmail` con `fetch` directo.** Con un correo ya ocupado Auth responde 500 con la violación de unicidad
  (23505) y `supabase-js` lo convierte en un error reintentable indistinguible de una caída; el adaptador (único archivo
  con `service_role`) inspecciona solo el código y devuelve 409.
- **D-9: usuarios huérfanos.** Al reclamar un alta se reemplaza un usuario de Auth inerte (sin cuenta, de más de un
  minuto) con `api.worker_delete_inert_user` (atómico). En el autorregistro no se reemplaza: la persona no ha probado
  poseer el buzón; los huérfanos que queden los purga el worker de F7 (decisión 8: inertes a las 24 h).
- **D-10: cambio de correo.** F5 consume el token `cambio_email` (lo crea F7): abre el correo nuevo sellado (contexto =
  hash del token), lo aplica, y cierra todas las sesiones (con un reintento; si falla otra vez, 503). El token ya está
  consumido, así que la persona pide otro enlace.
- **D-11: la alta pasa a `activa` con un trigger** al completar el perfil, para no depender del backend.
- **D-12: validación en SQL.** Las reglas de ubicación, grupo y nombre se repiten como CHECK y en las RPC, porque el
  perfil lo escribe el propio donante con INVOKER.

## 4. Riesgos residuales aceptados o pendientes

- **Pre-secuestro del correo en el autorregistro**: quien registra el correo de otra persona con su propia contraseña
  puede iniciar sesión tras la verificación de la víctima hasta que esta restablezca la contraseña. Mitigan el reenvío
  de verificación y que la recuperación revoca todas las sesiones. **La decisión 7 de la persona usuaria cierra este
  riesgo** (revocar sesiones al verificar, enlace de contraseña y bloqueo del onboarding hasta fijarla); se entrega
  como unidad aparte después de este commit.
- **Retención de PII**: `app.idempotency_records` guarda la respuesta sin purga y el `record_public_idempotency`
  anónimo crece sin límite hasta que el worker de F7 los purgue (72 h tras el estado terminal). Lo mismo con
  `assisted_signups` a 30 días, las cuentas sin verificar y el `sealedEmail` de los tokens.
- **`Idempotency-Key`** es obligatoria pero no se usa en las operaciones por token: el token de un solo uso ya es la
  garantía.
- **`verifyEmailChange` consume el token antes de `updateEmail`**: ante un 503 el token se pierde y hay que pedir otro.
- El **piso de 700 ms** no se mide en tiempo real (solo se prueba que existe).
- Un cambio de correo directo contra GoTrue (`PUT /auth/v1/user`) evita este módulo: el runbook de F9 pide bloquearlo
  en la configuración de Auth y mantener desactivada la confirmación de correo en producción.
- `invite_hospital_admin`: la elección del hash por el superadmin es de riesgo bajo; se documenta.
- Sin `Retry-After` en los 429 que vienen de las RPC (decisión 10: se añade en la unidad transversal).
- Estados declarados pero inalcanzables (403 y 409 en el registro, 429 en las vistas previas).
- Sincronizar los requisitos (C7) y que la capa de aplicación importe `PersistenceError`.

## 5. Revisiones independientes

| Ronda | Revisor | Resultado |
| --- | --- | --- |
| 1 | `reviewer-back` (subagente de solo lectura) | PASS condicionado: M1 (reenvío de verificación), M2 (topes y bloqueo asesor), M3 (validación en SQL) |
| 1 | `security-privacy-auditor` (subagente de solo lectura) | FAIL: A1 (el admin elegía el hash del token) |

Todos los hallazgos se corrigieron (D-4, D-5, D-6, D-12, orden de bloqueos, 409 absorbido al reemitir, trigger de
sincronización). **No se ha ejecutado una segunda revisión sobre esas correcciones**: no se declara ningún PASS sobre
ellas. La decisión 13 de la persona usuaria programa una ronda final consolidada después de F9.

## 6. Verificación ejecutada (2026-10-13, tras las correcciones)

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | verde |
| `npm run test --workspace backend` | 703 pruebas en verde |
| `npm run openapi:api:check` | sin deriva |
| `npm run test:backend:db` | 7 archivos, 542 pruebas (164 en `06_donor_records`) en verde |
| `npm run test:backend:integration` | 6 archivos, 197 pruebas (38 de `donor-records`) en verde |
| `npm run test:bruno:backend` | `donor-records/public` 30 y `hospital` 18 solicitudes en verde; el resto de escenarios también |
| `npm run test:contract` | verde (72 operaciones; 447 errores y 553 casos) |

Se observó una vez un 503 en el inicio de sesión del `beforeAll` de `identity.integration.ts` en la primera ejecución
completa; no se repitió en dos ejecuciones posteriores (la suite completa y la del módulo), así que se trata como un
fallo intermitente del arranque de Auth tras el reinicio de la base y se anota para vigilarlo.

## 7. Bitácora

- 2026-10-13: ratificación de las 14 operaciones, dominio, aplicación, migración, pgTAP, gateway, router, integración
  y Bruno contra el backend real.
- 2026-10-13: primera ronda de revisión (reviewer-back PASS condicionado, seguridad FAIL) y remediación.
- 2026-10-13: verificación completa tras el rework. El único cambio necesario fue de pruebas: el Bruno
  `02_register_existing` usa ahora una cuenta propia (`existingEmail`), porque reemitir la verificación invalida el
  enlace que el runner había preparado para `verifyEmail`.

## 8. Cierre

El 2026-10-13 la persona usuaria pidió trabajar de forma autónoma hasta completar el backend, dejando sin implementar lo
que no me corresponda decidir. Con esa instrucción se cierra F5 sin una aprobación explícita del módulo. Las decisiones
que la persona resolvió después (topes, retención, pre-secuestro, auditoría de denegaciones, `Retry-After`) están en
`docs/plans/2026-10-13-decisiones-backend.md` y se aplican como unidades posteriores. Pendiente de revisión
independiente: las correcciones de §5.

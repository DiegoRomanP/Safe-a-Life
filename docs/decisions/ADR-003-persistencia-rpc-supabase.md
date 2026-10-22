# ADR-003: Persistencia transaccional mediante RPC de Supabase

## Estado

Aceptado el 2026-10-12. La persona usuaria aceptó la dirección RPC (D1), la
seguridad de funciones **SECURITY INVOKER + RLS de escritura** (V2) y la
especificación [`Need-Draft-Application-Spec.md`](../Need-Draft-Application-Spec.md)
como base de `need-records` (V1, que sustituye la revisión RA2 pendiente).
La aceptación fija la **dirección y las reglas**; los gates de la sección
«Gates de aceptación» siguen abiertos hasta que existan SQL, RLS y pruebas
reales, y se marcan solo con evidencia.

Enmendado el 2026-10-22 (F6, aprobación A4 de la persona usuaria, «opción 1 en
todo, con dos condiciones de salida»; ver
[`2026-10-22-f6-contrato-reconciliado.md`](../plans/2026-10-22-f6-contrato-reconciliado.md)
§3 y §8): ítems 14 y 15 de la allowlist, nota en los ítems 7 y 8, regla 7 de
la sección V2 y sección «Orden de bloqueos». Revisado por
`security-privacy-auditor` (2026-10-22): PASS con correcciones M1–M3 aplicadas.
Enmienda H1 (decidida por la persona usuaria el 2026-10-22): patrón F5 en dos
pasos para el lote y el reintento (ítems 5, 15 y 16 y regla 8); **pendiente de
revisión del auditor**, no es un PASS.

## Fecha

2026-10-12

## Contexto

[T3](../plans/2026-10-04-backend-inside-out.md) ya ratificó exclusivamente crear
una necesidad en borrador, con radio omitido→10, idempotencia, auditoría y
vencimiento desde creación UTC PostgreSQL. La
[línea base v1.2](../1_Primeros_Alcances.md), RNF-SEC-07–10, RNF-REL-01/02,
RNF-DAT-01 y RNF-AUD-01, exige membresía protegida vigente, autorización/RLS,
unicidad y efectos consistentes. El
[contrato del POST](../Backend-Contracts.md) no acepta filas como DTO.

C0 `90c203afc4b565c9a5c2718db32d6603e76b2f41` contiene el fundamento DTO/workspace,
no ese POST real. El
[plan working de Senior](../plans/2026-10-12-api-backend-completo-incremental.md),
D1, registra la elección explícita **Supabase RPC**, SDK existente e identidad
del usuario/RLS, con necesidad/resultado idempotente/auditoría atómicos y sin
`service_role` ordinario. Su bitácora actual es posterior al snapshot de C0.
El mapa de ocho capacidades también está aprobado allí; no se vuelve a proponer.

La mención histórica de RPC pendiente en Backend-Contracts corresponde a su
ratificación inicial: D1 cierra la dirección, no los detalles de seguridad/SQL.
El SDK `@supabase/supabase-js@2.117.1` ya está declarado directamente en
`backend/package.json` y fijado en el lock raíz. Reutilizarlo evita incorporar
otro driver ahora; su presencia no prueba que el scaffold legacy sea seguro.

## Decisión

1. Usar funciones PostgreSQL invocadas mediante RPC de Supabase/PostgREST detrás
   de puertos/adaptadores del backend Express. Para cada comando atómico, una
   llamada encapsula su transacción; una secuencia de llamadas SDK independientes
   **no** constituye una transacción compartida.
2. Las operaciones ordinarias ejecutan con JWT validado del usuario y autorización
   por actor/recurso/hospital, más RLS equivalente. No usar `service_role` para
   crear necesidades, consultar datos ordinarios o simplificar tests. Excepciones
   privilegiadas requieren otra allowlist/diseño/revisión, fuera de este POST.
3. El adaptador futuro es request-scoped: no compartir un cliente cuya sesión o
   header Authorization cambie entre usuarios. Rol y hospital se resuelven de
   datos protegidos actuales; nunca de metadata editable ni argumentos cliente.
4. La RPC de creación futura valida parámetros, obtiene sujeto/AAL y membresía
   actual, determina hospital y comprueba sede propia activa/aprobada. Reclama
   actor/operación/clave atómicamente, valida/recalcula el hash canónico acordado
   y confirma conjuntamente necesidad, resultado original y auditoría. No confiar
   en `actorId`, `hospitalId`, rol o hash suministrados como autoridad por cliente;
   `auth.uid()` sin el resto de controles tampoco concede permiso.
5. PostgreSQL asigna nacimiento y vencimiento desde creación; el replay autorizado
   reproduce el resultado original sin recalcular ni revivir. Esto no decide
   carreras AP-04 ni checks de sede modificada después de crear. La
   [spec privada](../Need-Draft-Application-Spec.md) separa ese puerto del core.
6. Mantener monolito modular y dominio puro, Node.js/Express, Resend y topología
   Vercel/Render/Supabase aprobados. No nuevos packages, engines, lock boundaries,
   SSR/Edge Functions o framework de servidor alternativo. La aplicación no
   conoce el SDK; el navegador no consulta datos de dominio directamente en DB.

### Seguridad de funciones (V2): INVOKER por regla, DEFINER por allowlist cerrada

1. **Las tablas no se exponen.** Viven en el esquema `app`, que no está en
   `[api] schemas` de PostgREST (`backend/supabase/config.toml` →
   `schemas = ["api"]`). Un cliente con la anon key o un JWT solo puede llamar
   funciones del esquema `api`; no puede leer ni escribir `app.*`.
2. **Regla general: funciones `SECURITY INVOKER`.** Se ejecutan como
   `authenticated` con el JWT del usuario. `authenticated` tiene `USAGE` en
   `app` y solo los privilegios de tabla estrictamente necesarios, cada uno
   respaldado por políticas RLS (`USING`/`WITH CHECK`) por rol, hospital y
   propietario. Todas las tablas tienen `ENABLE` y `FORCE ROW LEVEL SECURITY`.
   Nadie tiene `UPDATE`/`DELETE` sobre `app.audit_events` y un trigger lo
   impide.
3. **Excepciones `SECURITY DEFINER`, con allowlist cerrada.** Son propiedad del
   rol `app_privileged` (`NOLOGIN NOBYPASSRLS`), fijan `SET search_path = ''`,
   califican todos los nombres, tienen políticas RLS `TO app_privileged` por
   tabla y comprueban explícitamente al llamador dentro de la función. Solo se
   permiten para operaciones que cruzan propietarios o no tienen JWT:
   1. `api.consume_rate_limit`.
   2. `api.readiness`.
   3. Funciones de token (vista previa y consumo): verificación de email, alta
      asistida, cambio de email, recuperación, invitación de admin y respuesta a
      invitación.
   4. Vinculación de cuentas nuevas: `user_accounts`, membresía y perfil.
   5. `api.request_invitation_batch` (lee perfiles de donantes). Enmienda
      (2026-10-22, F6, H1 (decidido por la persona usuaria el 2026-10-22)): pasa a ejecutarse con la sesión **técnica**
      (`app.is_api_technical()`), no con la del admin, y consume la concesión de
      `api.authorize_invitation_batch` (ítem 16) junto con los slots.
   6. `api.list_own_need_responses` (nombre y grupo de los confirmados).
   7. Cambios de respuesta y de disponibilidad que afectan a la necesidad o al
      outbox. Enmienda (2026-10-22, F6, aprobación A4): `api.update_own_participation`
      pasa de INVOKER a DEFINER, porque su cascada escribe en el outbox, que solo
      toca `app_privileged`.
   8. Transición de necesidad con cascada a invitaciones y outbox. Enmienda
      (2026-10-22, F6, aprobación A4): `api.transition_own_need` pasa de INVOKER a
      DEFINER por el mismo motivo.
   9. Ejecución de solicitudes de corrección o eliminación.
   10. Funciones `worker_*`, `ingest_email_event` y la revocación de sesiones
       del adaptador de `service_role` (ADR-006), si la API de Auth no la
       ofrece.
   11. `api.record_public_idempotency` (añadida el 2026-10-12 por decisión de la
       persona usuaria tras la revisión de F2a): idempotencia previa a la
       sesión (login, recuperación, registro). Acepta solo actores
       `email:<hmac>` o `token:<hmac>` y las operaciones `createSession`,
       `requestPasswordRecovery` y `createDonorRegistration`; nunca devuelve la
       respuesta guardada. Tiene pruebas pgTAP de actor y operación no
       permitidos.
   12. `api.issue_login_ticket`, `api.admit_session` y
       `api.close_session_barrier` (añadidas el 2026-10-22 por
       [ADR-007](ADR-007-barrera-de-sesion-tras-reset-de-contrasena.md)):
       barrera de sesión tras el reset de contraseña. Son propiedad de
       `app_privileged` (no de `postgres`), las ejecuta solo la sesión técnica
       `api_technical` (`jwt_sub` no nulo y `app.is_api_technical()`; si no,
       `unauthenticated` o `forbidden`) y escriben únicamente en
       `app.session_barriers`, `app.admitted_sessions` y `app.login_tickets`.
       Tienen pruebas pgTAP de privilegios, ticket ajeno, reutilizado o vencido
       y emisión tardía.
   13. `api.worker_purge_auth_accounts(int)` (añadida el 2026-10-22 por decisión
       de la persona usuaria, P-12 opción b2): purga de Auth del worker. Es
       propiedad de `app_privileged`, `EXECUTE` solo para `authenticated`, solo
       el JWT del worker (`app.is_worker()`; si no, `unauthenticated` o
       `forbidden`), `p_limit` en 1..500 (si no, `invalid`) y devuelve solo
       conteos (`staleDeleted`, `inertDeleted`). Borra las cuentas asistidas
       reclamadas e incompletas de más de 30 días y los usuarios de Auth sin
       cuenta de aplicación de más de 24 h mediante los helpers de `postgres` de
       la regla 6. `worker_purge_expired` ya no devuelve `staleAccounts`.
       Tiene pruebas pgTAP (privilegios, aislamiento y conteos) y de integración
       (carrera con la activación y la vinculación).
   14. `api.list_own_invitations(int, timestamptz, uuid)` y
       `api.get_own_invitation(uuid)` (añadidas el 2026-10-22 por la aprobación
       A4 de la persona usuaria, opción 1, F6; ver
       [el contrato reconciliado](../plans/2026-10-22-f6-contrato-reconciliado.md)
       §3 y §8): lecturas propias del donante que cruzan propietarios (la
       invitación del donante con datos de la necesidad, la sede y el hospital).
       Razón: como INVOKER exigirían políticas de donante en `app.needs`,
       `app.hospitals` y `app.sites`, y una política de `hospitals` que consulte
       invitaciones, cuya política llama a `admin_hospital_id()` (INVOKER, lee
       `app.hospitals` bajo RLS), produce recursión infinita de RLS. Son propiedad
       de `app_privileged`, `EXECUTE` solo para `authenticated`, resuelven al
       donante con `app.d_require` (rol `donante` y barrera de sesión), devuelven
       solo las invitaciones de ese donante y su salida se limita a la lista
       positiva del plan §2.3 «Lecturas» y del esquema OpenAPI
       (`hospitalName = hospitals.public_name`, `publicSiteName`,
       `instructions` y la `validity` proyectada, además de los campos propios de
       la invitación que declara OpenAPI); no exponen hashes, `donor_id` ni
       códigos internos. Deberán tener pruebas pgTAP de donante ajeno, rol
       distinto y barrera abierta (exigidas en F6-3). **Condición de salida (A4.5):** si
       `security-privacy-auditor` rechaza los ítems 14 y 15 antes de F6-2, solo
       las lecturas (este ítem) pasan a INVOKER con hospital, sede, grupo,
       urgencia, plazo e instrucciones copiados en la invitación al crearla; el
       ítem 15 sigue DEFINER.
   15. `api.retry_invitation_delivery(text, text, uuid, jsonb)` (añadida el
       2026-10-22 por la aprobación A4, F6): reintento manual de entrega
       (operación `retryInvitationDelivery`, ADR-005 punto 4). Solo superadmin con
       AAL2 y step-up vigente (si no, `forbidden`, `mfa_required` o
       `step_up_required`); el superadmin no puede leer la necesidad ni el
       outbox con su JWT, de ahí la DEFINER. Propiedad de `app_privileged`;
       genera tokens nuevos, inserta una fila nueva de outbox y reinicia la
       proyección de la invitación; escribe auditoría y sigue la convención de
       idempotencia. Deberá tener pruebas pgTAP de rol, AAL, step-up y replay
       (exigidas en F6-3). Enmienda (2026-10-22, H1 (decidido por la persona usuaria el 2026-10-22)): patrón F5 en dos pasos.
       `api.authorize_invitation_retry(uuid)` (DEFINER de `app_privileged`,
       superadmin, AAL2 y step-up vigente) valida la invitación y emite una
       concesión de un solo uso ligada a esa invitación y a ese superadmin, con
       las mismas reglas de la concesión del ítem 16. `api.retry_invitation_delivery`
       pasa a sesión **técnica** (`app.is_api_technical()`): consume la concesión
       junto con el slot (hashes y payload sellado generados por la aplicación) y
       el superadmin ya no los elige. Express orquesta los dos pasos; el contrato
       HTTP no cambia. Pendiente de revisión de `security-privacy-auditor` (no es
       un PASS).
   16. `api.authorize_invitation_batch(uuid)` (añadida el 2026-10-22, F6, H1 (decidido por la persona usuaria el 2026-10-22);
       pendiente de revisión de `security-privacy-auditor`, no es un PASS): primer
       paso del lote de invitaciones, paralelo a F5 (altas asistidas, donde el
       hospital no elige el hash del token porque un admin podía reclamar cuentas
       con correos ajenos). DEFINER de `app_privileged`, `EXECUTE` solo para
       `authenticated`; `d_require(admin, aal2)` y después `d_admin_hospital_id()`;
       comprueba que la necesidad es del hospital del admin y emite una
       **concesión de un solo uso** ligada a la necesidad y al admin, con
       vencimiento ≤ 2 min, en una tabla propia (`app.invitation_grants`) sin
       acceso para `authenticated` (solo `app_privileged`; RLS `TO app_privileged`).
       `api.request_invitation_batch` (técnica) la consume en la misma transacción
       que escribe el lote y valida que no esté usada ni vencida ni ligada a otra
       necesidad; el actor de idempotencia sale de la concesión, nunca de un
       argumento del cliente. Una concesión no consumida (p. ej. un replay que
       responde sin ella) vence sin efecto. Deberán existir pruebas pgTAP
       (exigidas en F6-3) de privilegios, concesión reutilizada, vencida, de otro
       admin o de otra necesidad, y de que `authenticated` no accede a la tabla.

   Los ítems 14, 15 y 16 son de `app_privileged`. **La lista de DEFINER
   propiedad de `postgres` sigue en siete** (regla 6): los ítems 14, 15 y 16 no
   añaden ninguna ni ningún uso de `service_role` (ADR-006 intacto).

   Nota: `api.consume_idempotency_key` (clave de un solo uso para MFA y
   step-up) **no** es DEFINER: es INVOKER, exige cuenta de aplicación con rol
   admin o superadmin y solo acepta `enrollMfaFactor`, `verifyMfaChallenge` y
   `verifyStepUp`.

   Cualquier DEFINER nueva exige actualizar esta lista en este ADR y pasar la
   revisión de `security-privacy-auditor`.
4. **Los superusuarios saltan RLS.** Las tablas pertenecen a `postgres`; por eso
   cada migración hace `alter function … owner to app_privileged` en cada
   DEFINER y una prueba pgTAP verifica que ninguna función `prosecdef` del
   esquema `api` pertenece a `postgres`.
5. **`search_path` y permisos.** Toda función fija `search_path` y usa nombres
   calificados; `PUBLIC` y `anon` pierden todo por defecto y `EXECUTE` se
   concede función por función. `EXECUTE` no autoriza acceder a cualquier
   hospital: cada RPC comprueba además acción, AAL, membresía y propiedad,
   incluso con argumentos falsificados y replay.
6. **Worker.** Conserva el límite aprobado: solo `EXECUTE` sobre las RPC
   `worker_*` y `ingest_email_event`, con una identidad técnica de Auth y rol
   interno `worker` (V13); sin tablas generales ni `service_role`.
   Implementado en F4 (2026-10-13): estas DEFINER no llaman a `auth.uid()` (el rol
   `app_privileged` no tiene `USAGE` sobre el esquema `auth` y `postgres` no puede
   concedérselo en Supabase); leen el `sub` del JWT validado por PostgREST con
   `app.jwt_sub()` y resuelven el rol `worker` en `app.user_accounts` con
   `app.is_worker()`. Para el destinatario de una invitación existe **una única
   excepción a la regla 4**: `app.user_email(uuid)`, DEFINER propiedad de `postgres`
   (que sí tiene `USAGE` y `SELECT` sobre `auth.users`), solo ejecutable por
   `app_privileged` y que devuelve únicamente el correo de un id. Una prueba pgTAP
   fija que es la única DEFINER propiedad de `postgres`.

   Ampliado en F2b (2026-10-13), con el mismo motivo: `app.user_id_by_email(text, interval)`
   (buscar el usuario de un correo para invitar o recuperar la contraseña) y
   `api.worker_revoke_sessions(uuid)` (borra las filas de `auth.sessions` de un
   usuario; GoTrue no ofrece revocación por usuario, ADR-006 punto 3) también son
   DEFINER propiedad de `postgres`, con `EXECUTE` solo para `app_privileged` y
   `service_role` respectivamente. Una cuarta, `api.worker_delete_inert_user(uuid, text, interval)`,
   sustituye a `deleteUser` en el reemplazo de usuarios huérfanos: borra el usuario de
   Auth en una sola sentencia solo si el correo coincide, no tiene cuenta de aplicación
   y supera la edad mínima (sin carrera entre comprobar y borrar); `EXECUTE` solo para
   `service_role`. La prueba pgTAP fija las cuatro como únicas. Las
   DEFINER de tokens (`invite_hospital_admin`, `get_admin_invitation_preview`,
   `link_admin_account`, `request_password_recovery`, `consume_password_reset`)
   pertenecen a `app_privileged` (ítems 3 y 4) y leen el `sub`, el AAL y el `amr`
   del GUC que PostgREST valida (`app.jwt_claims`), nunca `auth.uid()`.

   Ampliado el 2026-10-22 (P-12 opción b2 y borrado de factores MFA en el reset,
   [ADR-007](ADR-007-barrera-de-sesion-tras-reset-de-contrasena.md)): tres
   DEFINER más propiedad de `postgres`, con `EXECUTE` solo para `app_privileged`
   (ni `anon`, `authenticated` ni `service_role`), `search_path` vacío y una sola
   tarea sobre `auth`: `app.delete_stale_assisted_account(uuid)` (bloquea el
   perfil y `auth.users` `FOR UPDATE` y borra solo si el rol es `donante`, el
   perfil no está `activo` y el alta sigue `reclamada_incompleta` desde hace más
   de 30 días), `app.purge_inert_auth_users(interval, int)` (usuarios sin cuenta
   de aplicación y de más de la edad dada, saltando filas bloqueadas y
   revalidando con la fila bloqueada, como B1) y `app.delete_mfa_factors(uuid)`
   (borra los factores MFA de un usuario; retos y códigos de recuperación caen en
   cascada). Las llaman `api.worker_purge_auth_accounts` (ítem 13) y
   `api.consume_password_reset`; el worker sigue sin `service_role`. La prueba
   pgTAP fija ahora siete DEFINER de `postgres`: estas tres, `user_email`,
   `user_id_by_email`, `worker_delete_inert_user` y `worker_revoke_sessions`.

   Ampliado en F5 (2026-10-13): las DEFINER de donantes y altas asistidas son de
   `app_privileged`, no llaman a `auth.uid()` y siguen la regla de F2b: toda RPC
   que recibe un hash de token o un id de usuario solo la ejecuta la sesión
   técnica (`link_donor_account`, `reissue_donor_verification`,
   `get_donor_verification_preview`, `verify_donor_email`,
   `get_assisted_activation_preview`, `issue_assisted_activation`,
   `get_assisted_signup_recipient`, `link_assisted_account`,
   `get_email_change_preview`, `consume_email_change`, y las dos de la
   contraseña pendiente `issue_password_setup` y `confirm_password_setup`).
   También solo la sesión técnica de la API: `record_denial` (auditoría de
   denegaciones). Con la sesión del admin
   (`create_assisted_signup`, `reissue_assisted_link`) el hospital solo
   registra el alta: no elige el hash del token, que emite la sesión técnica
   (el primer diseño lo permitía y un admin podía reclamar cuentas con correos
   ajenos). `api.sync_assisted_signup_status()` es una función de trigger en
   `api` (app_privileged no puede ser propietario de funciones en `app`) que
   nadie ejecuta por RPC.

7. **Orden de comprobación en las DEFINER con sesión de usuario** (añadida el
   2026-10-22, F6, aprobación A4). Toda DEFINER que opera con la sesión de un
   usuario llama **primero** a `app.d_require` (rol, AAL y barrera de sesión de
   ADR-007) y solo después a helpers como `app.d_admin_hospital_id()`, que no
   mira la barrera. Las de la sesión técnica (token, webhook, barrera) exigen
   `app.is_api_technical()` y las del worker `app.is_worker()`. Excepción
   explícita: `api.link_admin_account` opera con la sesión del invitado, que aún
   no tiene cuenta de aplicación, y por eso usa `jwt_sub` y `d_session_admitted`
   en lugar de `d_require`. Deberá existir una prueba pgTAP (exigida en F6-3)
   que compruebe que, con la barrera abierta, cada DEFINER de usuario responde
   `unauthenticated`. Las pruebas `02_identity_hardening.test.sql:43-45` y
   `03_need_records.test.sql:68-70` deberán ampliarse (no debilitarse) con las
   funciones nuevas en F6-3/F6-4.

8. **Ninguna RPC con sesión de usuario persiste hashes o secretos elegidos por el
   cliente** (añadida el 2026-10-22, F6, H1 (decidido por la persona usuaria el 2026-10-22)). Es la regla ya aplicada en F5 (el
   hospital registra el alta y la sesión técnica emite el hash del token). En F6
   la sesión del usuario solo **autoriza** (`authorize_invitation_batch`,
   `authorize_invitation_retry`) y la sesión técnica **ejecuta** con los hashes y
   payloads que genera la aplicación. La lista de DEFINER de `postgres` sigue en
   siete y no hay ningún uso nuevo de `service_role`.

### Orden de bloqueos

Añadido el 2026-10-22 (F6, aprobación A4 opción 1 en D3; ver
[el contrato reconciliado](../plans/2026-10-22-f6-contrato-reconciliado.md) §1 D3).
Orden canónico de adquisición de bloqueos para evitar interbloqueos entre rutas
que comparten invitaciones:

| Ruta | Orden de adquisición |
| --- | --- |
| Originada en la necesidad (lote, token, sesión, transición, reintento, vencimiento) | `needs` (`FOR UPDATE`, una fila; el vencimiento, varias con `SKIP LOCKED`) → lock asesor global `invitation-quota` (solo el lote) → `invitations` (`FOR UPDATE`, `order by invitation_id`) → `email_outbox` (`FOR UPDATE`, `order by outbox_id`, solo `pendiente`) → inserciones. En el lote y el reintento la concesión (fila propia, de un solo uso) se consume tras bloquear la necesidad y antes de `claim_idempotency` |
| Originada en el donante (participación) | `donor_profiles` propio (`FOR UPDATE`) → `invitation-quota` (solo si pasa a no disponible) → invitaciones del donante (`order by invitation_id`) → outbox |
| Eliminación V15 (`finish_deletion`) | `correction_requests` (`FOR UPDATE`) → invitaciones del donante → outbox |
| Worker (`worker_record_attempt`, `ingest_email_event`) | invitación de la fila (búsqueda sin bloqueo, luego `FOR UPDATE`) → fila de outbox |
| Worker (`claim`, `expire_outbox`, leases agotados) | fila de outbox con `FOR UPDATE SKIP LOCKED`; si el resultado se proyecta a una invitación (ADR-005 punto 4), invitación vigente con `FOR UPDATE SKIP LOCKED` → outbox, sin esperar nunca |

Reglas:

1. La cuota 3/24 h usa **un único lock asesor transaccional**
   (`hashtextextended('invitation-quota', 0)`), tomado tras el bloqueo de la
   necesidad y **antes** de `claim_idempotency`. Serializa los lotes de todos los
   hospitales.
2. Las rutas de la necesidad nunca bloquean `donor_profiles`, la barrera de
   sesión ni `auth.users` (salvo el `KEY SHARE` implícito de la FK del outbox al
   insertar). Las rutas del donante nunca bloquean `needs`. **Invariante:**
   `invitations.donor_id` y el historial de respuestas **no** tienen FK a
   `donor_profiles`; si se añadiera, el lote tomaría `KEY SHARE` sobre el perfil
   y se interbloquearía con la participación.
3. **Toda espera de bloqueo va antes de `claim_idempotency`**, que fija
   `lock_timeout = 2s` para el resto de la transacción (una espera posterior
   puede fallar con `55P03` y devolver 500), salvo los `KEY SHARE` de inserción.
4. El reintento de entrega no bloquea filas antiguas del outbox (ya finales).

**Riesgo residual (borrado del usuario de Auth).** GoTrue borra `auth.users` en
un orden que el proyecto no controla (involucra `auth.users`, el `email_outbox.recipient_user_id`
a NULL y la cascada a `donor_profiles`; el orden exacto depende de los triggers de
integridad referencial y no está verificado) y puede chocar con la participación o el
vencimiento con `40P01`. Se documenta como 500 reintentable con la misma clave
(el claim se revierte) y F6-4 deberá incluir la prueba de esa carrera.

**Condición de salida (A4.3).** Puerta de rendimiento en F6-6: 5 lotes
concurrentes sobre 500 donantes sintéticos con p95 ≤ 1 s y ningún `55P03` ni
`statement_timeout`. Si no se cumple, la decisión vuelve a la persona usuaria
para elegir la alternativa de locks por donante en orden de `donor_id`. El
umbral de 1 s es una puerta interna propuesta por el asistente; PER-02 (p95 < 2 s)
sigue vigente como requisito del producto.

### Convención de respuesta de toda RPC con efectos

- Devuelve `jsonb` con `{"kind":"created"|"replayed"|"ok", …proyección}` o
  `{"kind":"<fallo>"}` con `<fallo>` ∈ `unauthenticated`, `forbidden`,
  `mfa_required`, `step_up_required`, `not_found`, `conflict`,
  `payload_conflict`, `in_progress`, `gone`, `invalid` y los fallos propios de la
  operación (p. ej. `site_unusable`).
- Las validaciones y rechazos ocurren **antes** de escribir. Un `raise` es un
  fallo interno y provoca rollback (una RPC = una transacción).
- El adaptador TypeScript valida el `jsonb` con guards cerrados y nunca reenvía
  mensajes, SQLSTATE ni detalles de PostgreSQL.

### Hash canónico en SQL

El hash de idempotencia de `createHospitalNeed` es SHA-256 hexadecimal del JSON
compacto con este orden de campos: `component`, `requiredBloodType`,
`targetConfirmations`, `siteId`, `radiusKm`, `urgency`, `expiresInHours`,
después de normalizar `radiusKm` omitido a 10. La RPC lo **recalcula** con
`format('{"component":%s,…}', to_json(…)::text, …)` y `extensions.digest(…,
'sha256')` y compara con el valor recibido; si difiere responde `invalid`. El
`siteId` llega como `text` y se compara literal (sin normalizar mayúsculas); el
cast a `uuid` solo se usa para la búsqueda.

## Alternativas consideradas

### SQL directo con `pg`

Permite transacciones explícitas, pero añade una dependencia y responsabilidad
de pooling/conexión, rol efectivo/contexto por transacción y propagación de
identidad compatible con RLS sin bypass. No seleccionado para esta fase por
decisión D1; no se afirma que sea inseguro por naturaleza. Reconsiderarlo requiere
evidencia y decisión documentada, no una instalación de oportunidad.

### Varias llamadas SDK o backend con `service_role` general

Descartados como mecanismo ordinario: varias llamadas no comparten atomicidad;
`service_role` como Authorization evita RLS. Un check Express o policy añadida
para ese rol no recupera la defensa perdida. Simulación RAM/scaffold tampoco
sustituye transacciones, identidad o pruebas RLS reales.

## Consecuencias

- La consistencia de escritura vive en PostgreSQL; reglas de dominio y
  proyecciones siguen separadas del SDK/SQL. Los adaptadores validan respuestas
  desconocidas y mapean solo categorías seguras, sin `SELECT *`, filas, SQL ni
  excepciones de proveedor expuestas.
- Canonicalización, unicidad e idempotencia deben coincidir entre aplicación y
  RPC. Retención sigue RNF-REL-02 y purga RNF-PRV-02–04; no TTL inventado ni
  aprobación de backups/AP-07. Revisar UUID casing y replay ante cambios de sede
  antes del adaptador según la spec, sin normalizar silenciosamente.
- Auditoría append-only restringida registra IDs opacos/evento/resultado/fecha,
  no body, valores PII, clave o hash. Telemetría usa solo RNF-OBS-01/02; no
  requests, URLs/query strings, JWT/cookies, PII o payloads completos.
- Se conserva autoridad npm raíz, versiones/policies existentes y único lock.
  Este ADR no instala, actualiza ni ejecuta SDK/servicios. Supabase local aislado
  ya está aprobado como entorno; no habilita autostart/configuración global,
  migraciones remotas, lectura de credenciales o datos reales.

### Gates de aceptación de persistencia, todos pendientes

- [ ] RA2 revisó ADR/spec; diseño SQL/roles/grants/RLS y acceso directo recibió
      reviewer-back y auditoría de seguridad independientes antes de ejecutar.
- [ ] Migraciones versionadas desde DB limpia y versión anterior, con
      rollback/roll-forward probado; no adoptar `database/esquema.sql` legacy.
- [ ] Supabase local/Auth/PostgreSQL reales: matriz por rol/AAL/hospital/recurso,
      revocación con misma sesión, parámetros actor/hospital/hash falsificados,
      anonimato/acceso directo y grants indebidos denegados.
- [ ] Veinte solicitudes concurrentes prueban unicidad y un solo efecto; replay
      conserva resultado, payload distinto/en curso comparten conflicto y fallo
      intermedio revierte necesidad/resultado/auditoría. Probar también resultado
      incierto sin generar otra intención.
- [ ] Reloj DB fija `created_at`/`expires_at`; pruebas de límites UTC, no extensión
      futura y replay posterior al plazo. Datos/fixtures completamente sintéticos.
- [ ] Auditoría restringida, purga/retención y telemetría canaria verificadas;
      worker no adquiere acceso general. Readiness exigirá conexión y migraciones
      vigentes, sin dependencia de red de Resend para reiniciar procesos.
- [ ] Antes de HTTP, sesión/refresh/cookie/CSRF/CORS concretos revisados y probados;
      Bruno reutilizado contra API real con reportes sanitizados y E2E pertinentes.
      Los resultados mock/C0 y unitarias con dobles no satisfacen estos gates.

## Criterios de reconsideración

Reconsiderar acceso a datos si RPC/identidad/grants no puede satisfacer invariantes
verificadas, aparecen límites operativos medidos o se justifica otro driver.
Cambios caros o de permisos/comportamiento requieren decisión explícita/ADR;
no sustituir el stack aprobado ni ratificar rutas/AP por autonomía general.

## Referencias técnicas y alcance de su evidencia

Documentación consultada el 2026-10-12 mediante Context7 `/supabase/supabase`:

- [Database Functions](https://supabase.com/docs/guides/database/functions): RPC
  expone funciones; invoker/definer, `search_path` y permisos son decisiones distintas.
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) y
  [service role / Authorization](https://github.com/supabase/supabase/blob/master/apps/docs/content/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z.mdx): RLS depende de Authorization, no de `apikey`; service-role Authorization siempre hace bypass.
- [Transacción por RPC](https://github.com/supabase/supabase/blob/master/apps/docs/content/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b.mdx): cada invocación PostgREST tiene su transacción; reintentos internos no garantizan ausencia de duplicados sin invariantes.

Los ejemplos documentales Edge Functions, `@supabase/server`, SSR y roles de
metadata no son decisiones de este proyecto y no se adoptan. La consulta apoya
el principio RPC/RLS; no prueba compatibilidad operativa ni aprueba permisos del
SDK fijado. El autor no emite PASS: **siguiente gate RA2 independiente**.

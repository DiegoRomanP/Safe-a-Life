# 2026-10-22 — F6 `invitation-coordination`: contrato reconciliado (C0 / P-11)

**Estado:** propuesta del rol `solution-architect` (tarea C0 de
[`Backend-Route.md`](Backend-Route.md) §8.1), con la decisión **A4** aprobada por
la persona usuaria el 2026-10-22 (§8). Las enmiendas de ADR-003 y ADR-005 están
redactadas y revisadas por `security-privacy-auditor` (PASS con correcciones
M1–M3 aplicadas). Este documento no ratifica, no implementa y no modifica
OpenAPI, migraciones ni código; F6-2 puede empezar.

**Punto de partida:** el backend actual, no la spec original: SP-01/ADR-007
(barrera de sesión, `20261022000000_session_barrier.sql`), P-12 (borrado de
Auth en V15 y purgas del worker, `20261022010000_worker_auth_purges.sql`) y V8.
F6 solo tiene dominio puro (`backend/src/modules/invitation-coordination/domain/*`).

**Fuentes leídas:** spec F6 (`2026-10-12-especificacion-faltante-backend.md`
:1524-1697, V1-V20 :119-203, Anexo A :1907-2097, Anexo B :2100-2251), plan
`2026-10-20-invitation-coordination.md`, las 10 operaciones F6 de
`docs/openapi.json`, ADR-003/004/005/006/007, migraciones F3/F4/F2b/F5/F7 y
2026-10-22, `email-delivery` (payload, plantillas, worker), ERS/PA (RF-INV-*).

---

## 0. Resumen de las cinco decisiones de P-11

| # | Discrepancia | Propuesta |
| --- | --- | --- |
| D1 | Payload de dos tokens vs consumidor de uno | Dos tokens (requisito), dos hashes en `app.invitations`; payload sellado `{token, rejectToken}`; el worker obtiene hospital y sede del `claim`; plantilla con dos enlaces |
| D2 | Replay / 409 / 410 | Hashes **no** se anulan al consumir (`token_consumed_at`); orden lookup → lock → terminal/vencida (410, también para replay) → peek (replay 200) → estado (410 consumido/anulado; 409 confirmar con meta) → claim |
| D3 | Orden de locks | Orden canónico necesidad → [cuota] → invitaciones (`order by invitation_id`) → outbox (`order by outbox_id`); cuota con **un** lock asesor global; worker invitación → outbox; barridos con `SKIP LOCKED` |
| D4 | Eventos de outbox anteriores | `invitations.current_outbox_id`; solo la fila vigente proyecta `delivery`; un evento tardío de una fila anterior no toca la invitación |
| D5 | Allowlist RPC | 9 DEFINER nuevas o convertidas cubiertas por los ítems 3, 5-8 y 10 de ADR-003; **dos ítems nuevos** (lecturas propias del donante; reintento del superadmin); ninguna DEFINER nueva de `postgres`; sin `service_role` |

---

## 1. Discrepancias con evidencia y decisión propuesta

### D1 — Payload de dos tokens frente a un consumidor de un token

**Evidencia**

- Requisito: tokens distintos por acción
  (`.opencode/references/project-requirements.md:57-60`; ERS
  `docs/2_Especificaciones_De_Software.md:502` RF-INV-02; OpenAPI
  `docs/openapi.json:949` y `:2374` «ligado a invitación y acción»; la vista
  previa devuelve `intendedAction`).
- La spec sella `{confirmToken, rejectToken}` sin destinatario ni datos de
  presentación (`especificacion…:1580-1584`).
- El consumidor F4 solo admite un token y exige datos de presentación en el
  payload: `EmailPayload = {recipient?, token, hospitalName?, sitePublicName?, deadline?}`
  (`backend/src/modules/email-delivery/application/email-payload.ts:8-14`);
  rechaza claves desconocidas y exige `token` (`:25`, `:43-44`); construye un
  solo enlace (`:56`); `invitacion` exige `hospitalName`, `sitePublicName` y
  `deadline` (`:66`); la plantilla tiene un enlace
  (`templates/invitacion.ts:6-12`).
- Para armar el payload sin ver candidatos, la aplicación no tiene el nombre de
  la sede ni del hospital en `get_own_need` (`need_records.sql:62-68`), y el
  superadmin del reintento no puede leer la necesidad (`needs_admin_select`,
  `need_records.sql:81-82`).

**Propuesta (recomendada, D1-1)**

- Dos hashes SHA-256 hex (`hashToken`, `backend/src/shared/crypto/tokens.ts:11-13`)
  por invitación: `confirm_token_hash`, `reject_token_hash`, únicos
  (`unique` en cada columna). Tokens de 256 bits (`generateActionToken`).
- Payload sellado de `kind='invitacion'`: `{token: <confirmToken>, rejectToken}`.
  Solo secretos; sin destinatario (sale de `recipient_user_id`, ya
  implementado en `worker_claim_due_outbox`, `email_delivery.sql:159`).
- `api.worker_claim_due_outbox` añade, solo para `kind='invitacion'`, un
  objeto `display: {hospitalName, sitePublicName, siteAddress, siteLatitude, siteLongitude}` (join invitación → necesidad
  → sede/hospital; `app_privileged` ya tiene políticas sobre esas tablas). El
  plazo es `notAfter` (= `needs.expires_at`), que el claim ya devuelve.
- Consumidor: `EmailPayload` admite `rejectToken` (obligatorio para
  `invitacion`, prohibido en los demás tipos); `renderEmail('invitacion')` toma
  `display` + `notAfter` y emite **dos** enlaces `APP_PUBLIC_URL/invitaciones#<token>`
  (misma ruta; la acción la decide el token y la vista previa la muestra).
- Trade-offs: cambia F4 (claim, guard del gateway, payload, plantilla) en un
  solo punto; nombres siempre vigentes al enviar; ni el lote ni el reintento
  necesitan lecturas de contexto. Alternativa D1-2 (§8): datos de presentación
  en el payload, a costa de una lectura INVOKER para el admin y otra DEFINER
  nueva para el superadmin. Alternativa D1-3: reutilizar `app.action_tokens`
  con dos `kind` nuevos; uniforma `d_token_state`, pero obliga a alterar su
  `check` de `kind`, a fijar `expires_at` igual al de la necesidad y aun así a
  unir con la invitación para cada validación (más código, sin ganancia).

### D2 — Replay, 409 y 410

**Evidencia**

- La spec anula ambos hashes al consumir (`especificacion…:1624`) y busca por
  hash (`:1617`): un segundo uso del token daría **404**, no 410 como exige
  OpenAPI (`Gone`, `docs/openapi.json:3350-3351`: «vencido o consumido») y RF-INV-02/03
  (`2_Especificaciones…:502-503`).
- La spec reclama idempotencia **después** del lock y sin `peek`
  (`:1587-1588`), contra la convención vigente lock → peek → estado → claim
  (`need_records.sql:2-4`; `action_tokens.sql:228-246`).
- OpenAPI admite «repetición idempotente del resultado» con 200
  (`docs/openapi.json:957`); la ERS exige «no aceptar replay» y «replay/post
  vencimiento rechazados» (`2_Especificaciones…:495`, `:497`;
  `1_Primeros_Alcances.md:541` RF-INV-08).
- V6: confirmar con la meta alcanzada → 409 (`especificacion…:187`, `:1629`);
  pero RF-INV-05 invalida en la misma transacción toda invitación sin respuesta
  al alcanzar la meta (`1_Primeros_Alcances.md:539`), así que una comprobación
  `validity = 'activa'` antes que la de meta convertiría el 409 en 410.
- La vista previa no tiene 409 en el contrato (OpenAPI, `getInvitationActionPreview`:
  400/403/404/410/429/500/503).

**Propuesta (D2-1)**

- «Replay» de la ERS = reutilizar un token ya consumido (otra petición) → 410.
  «Repetición idempotente» de OpenAPI = misma `Idempotency-Key` y mismo token
  → 200 con el resultado guardado, **solo** mientras la necesidad no sea
  terminal ni haya vencido (RF-INV-08 prevalece sobre REL-02 para tokens).
- Los hashes se conservan tras el consumo; `token_consumed_at` marca ambos
  como gastados (el hermano también → 410). Se anulan (NULL) solo al rotar en
  un reintento manual (el token anterior pasa a 404) o al anonimizar (V15).
- Orden en `respond_invitation_by_token` y matriz completa en §2.3.

### D3 — Orden de locks

**Evidencia**

- Spec: cuota con `pg_advisory_xact_lock('cuota:'||donor_id)` dentro del
  recorrido de candidatos (`especificacion…:1608-1611`). Dos lotes de
  necesidades distintas recorren los mismos donantes en órdenes distintos
  (el orden depende de distancia y grupo) → interbloqueo A(X→Y) / B(Y→X).
- Respuesta por token: «`for update` sobre la invitación y la necesidad»
  (`:1618`), orden inverso a lote y transición (necesidad primero,
  `need_records.sql:259`) → ciclo.
- `worker_record_attempt` bloquea el outbox (`email_delivery.sql:186`); si
  además actualiza la invitación (spec `:1671`) el orden sería outbox →
  invitación, inverso a las cascadas (necesidad → invitación → outbox).
- `worker_expire_outbox` y el barrido de leases actualizan varias filas sin
  orden (`email_delivery.sql:138-141`, `:250-258`).
- `claim_idempotency` fija `lock_timeout = 2s` para el resto de la
  transacción (`platform_base.sql:194`): toda espera de lock posterior al claim
  puede fallar con 55P03 → 500.
- Borrado V15: `auth.users` → `donor_profiles` (`on delete cascade`,
  `donor_records.sql:36`) → `email_outbox.recipient_user_id` (`on delete set
  null`, `email_delivery.sql:12`); purgas P-12 bloquean perfil → `auth.users`
  (`worker_auth_purges.sql:10-12`); barrera: lock asesor
  `session-barrier:<uid>` (`session_barrier.sql:79`, `:141`, `:167`).

**Propuesta (D3-1): orden canónico**

| Ruta | Orden de adquisición |
| --- | --- |
| Originada en la necesidad (lote, token, sesión, transición, reintento, vencimiento) | `needs` (FOR UPDATE, una fila; el vencimiento: varias con `SKIP LOCKED`) → lock asesor global `invitation-quota` (solo el lote) → `invitations` (FOR UPDATE, `order by invitation_id`) → `email_outbox` (FOR UPDATE, `order by outbox_id`, solo `pendiente`) → inserciones |
| Originada en el donante (participación) | `donor_profiles` propio (FOR UPDATE) → `invitation-quota` (solo si pasa a no disponible) → invitaciones del donante (`order by invitation_id`) → outbox |
| Eliminación V15 (`finish_deletion`) | `correction_requests` (FOR UPDATE) → invitaciones del donante → outbox |
| Worker (`worker_record_attempt`, `ingest_email_event`) | invitación de la fila (lookup sin lock, luego FOR UPDATE) → fila de outbox |
| Worker (`claim`, `expire_outbox`, leases agotados) | solo outbox, siempre `FOR UPDATE SKIP LOCKED` (nunca espera) |

Reglas:

1. **Cuota con un único lock asesor transaccional** `hashtextextended('invitation-quota', 0)`,
   tomado tras el lock de la necesidad y **antes** del claim. Con él, el filtro
   de cuota va en la misma consulta de candidatos (`count(*) < 3` en
   `(now()-24h, now()]`, `LIMIT n`), sin bucle. Serializa lotes; un lote sobre
   500 donantes es de decenas de ms (supuesto a medir en F6-6).
2. Las rutas de la necesidad **nunca** bloquean `donor_profiles` (ni implícito:
   `invitations.donor_id` e historial **sin FK** a `donor_profiles`), ni la
   barrera, ni `auth.users` salvo el `KEY SHARE` implícito de la FK del outbox
   al insertar.
3. Las rutas del donante nunca bloquean `needs` (RF-INV-07 no modifica una
   confirmación: `1_Primeros_Alcances.md:375`).
4. Toda espera de lock va **antes** de `claim_idempotency` (por su
   `lock_timeout` de 2 s), salvo los `KEY SHARE` de inserción.
5. El reintento no bloquea filas antiguas del outbox (ya finales): así no
   espera al borrado de Auth que las pone a NULL.

Ausencia de ciclos (argumento, pendiente de prueba en F6-3/F6-4): las rutas de
necesidad y de donante solo comparten invitaciones, y cada donante tiene como
máximo una por necesidad (`unique (need_id, donor_id)`); el worker retiene a lo
sumo una invitación; los barridos no esperan; F6 no toma la barrera; las purgas
P-12 solo tocan cuentas sin invitaciones (asistidas no activas, usuarios sin
cuenta de aplicación). Residual: un lote o reintento que inserta outbox para un
usuario que Auth borra en ese instante falla con violación de FK (500
reintentable con la misma clave; el claim se revierte).

### D4 — Eventos de outbox anteriores

**Evidencia**

- Un reintento crea otra fila de outbox (`especificacion…:1677`); la anterior
  sigue recibiendo eventos por `provider_message_id`
  (`email_delivery.sql:287-288`) y `worker_record_attempt` reaplica eventos
  llegados antes del id (`:226-234`).
- `advance_delivery` nunca retrocede (`:99-109`; ADR-005 :34-38), pero V5/B.5
  permiten `fallida → pendiente` por reintento manual (`especificacion…:2170`).
- `email_outbox.invitation_id` está sobrecargada: la invitación de admin guarda
  ahí su id (`action_tokens.sql:168`), así que no admite FK a `app.invitations`
  pese al comentario «la tabla de invitaciones llega con F6»
  (`email_delivery.sql:10`).
- Un envío `en_curso` con fallo transitorio vuelve a `pendiente`
  (`email_delivery.sql:206-216`) y se reintentaría tras cerrar la necesidad.

**Propuesta (D4-1)**

- `app.invitations.current_outbox_id uuid not null references app.email_outbox`.
  Sin FK nueva en `email_outbox.invitation_id`.
- `invitations.delivery` = copia de `email_outbox.delivery_state` de la fila
  **vigente**; `worker_record_attempt` e `ingest_email_event` la actualizan solo
  `where current_outbox_id = <fila>`, con el orden invitación → outbox (D3).
  Una fila anterior se sigue actualizando a sí misma (auditoría del proveedor),
  pero no proyecta. «Nunca retrocede» vale por fila; el reintento manual
  reinicia la proyección a `pendiente` con la fila nueva.
- `worker_record_attempt`: si la invitación ya no está `activa` y el resultado
  no es `ok`, la fila termina `cancelado` (payload NULL) en vez de volver a
  `pendiente` (V6: «un envío en curso termina, pero sus tokens quedan
  inválidos»).

### D5 — Allowlist RPC

**Evidencia**

- ADR-003 regla 3 (`docs/decisions/ADR-003-persistencia-rpc-supabase.md:82-137`)
  cubre token (3), lote (5), respuestas del hospital (6), cambios de respuesta y
  disponibilidad (7), transición con cascada (8), `worker_*` (10). **No** cubre
  el reintento del superadmin (C-4) ni las lecturas del donante que cruzan
  propietarios (hospital, sede, necesidad).
- La spec deja `list_own_invitations`/`get_own_invitation` INVOKER con RLS
  (`especificacion…:1656`), lo que exige políticas de donante en `app.needs`,
  `app.hospitals` y `app.sites`. `app.admin_hospital_id()` es INVOKER y lee
  `app.hospitals` bajo RLS (`need_records.sql:41-49`): una política de
  `hospitals` que consulte invitaciones cuya política llame a
  `admin_hospital_id()` produce **recursión infinita de RLS**.
- `transition_own_need` y `update_own_participation` son INVOKER hoy
  (`need_records.sql:238`; `donor_records.sql:661`, comentario «F6 la reemplaza
  por una DEFINER»); sus cascadas escriben el outbox, que solo `app_privileged`
  puede tocar (`email_delivery.sql:58-61`).
- `app.d_admin_hospital_id()` **no** comprueba la barrera de sesión
  (`donor_records.sql:85-93`); `app.d_require` sí (`session_barrier.sql:221-234`).
- `app_privileged` no puede ser propietario de funciones en `app` (ADR-003 :206).

**Propuesta (D5-1):** lista exacta en §3. Toda DEFINER con sesión de usuario
llama primero a `app.d_require` (barrera incluida) y solo después a
`d_admin_hospital_id`; las de token exigen `app.is_api_technical()`; las del
worker `app.is_worker()`.

### Otras discrepancias encontradas (no listadas en P-11)

| # | Evidencia | Propuesta |
| --- | --- | --- |
| O1 | `api.worker_expire_needs` figura como «reemplazo» (`especificacion…:1666`) pero no existe en ninguna migración | Es **nueva** (worker, DEFINER, ítem 10) |
| O2 | V15 exige anonimizar invitaciones y borrar el historial (`especificacion…:195`); `finish_deletion` no lo hace (`privacy_execution.sql:169-191`) | Cascada en `finish_deletion` (§5); las rutas de token exigen que exista el perfil del donante |
| O3 | Una confirmación anonimizada no cabe en el contrato: `OpaqueHospitalResponse.response` excluye `confirmada` y `ConfirmedHospitalResponse` exige `donorName` | Omitirla de `items`; sigue contando en `confirmedIntentCount` (V15 «se conservan los conteos») |
| O4 | RF-INV-08: al vencer se marcan `vencida` las invitaciones activas **sin respuesta** (`1_Primeros_Alcances.md:541`); la spec vence todas las `activa` (`especificacion…:1668`) | Literal de RF-INV-08; las lecturas proyectan `vencida` si `now() >= expires_at` |
| O5 | `list_superadmin_tasks` solo devuelve `hospital_review` (`identity_institutions.sql:692-707`); V20 añade `delivery_failure` con C-4 | F6-4 añade `delivery_failure` (invitaciones `activa`, `sin_respuesta`, `delivery='fallida'`). Observación: `correction_request` (F7) tampoco está; fuera de alcance F6 |
| O6 | Texto OpenAPI obsoleto: `info.description` (`docs/openapi.json:7`) y `deliveryCounts` (`:2713`) dicen AP-02 pendiente; `scripts/prism-contract.test.mjs:872-894` **exige** que `docs/Api-Rules.md` (`:236`, `:445`) mantenga AP-02 abierta, contra ADR-005 aceptado | Slice S0 de sincronización (§4), separado de F6 |
| O7 | ADR-003 ítem 11 dice que `record_public_idempotency` acepta tres operaciones; la función vigente solo `createSession` (`action_tokens.sql:388`) | Deriva documental; no afecta a F6 (los tokens F6 llevan su propia idempotencia) |
| O8 | La spec reclama la operación como `'requestInvitationBatch:'||need_id` (`:1588`) | Convención vigente: operación fija y `needId` dentro del hash (`fingerprint`), como `transitionOwnHospitalNeed` |
| O9 | El lote no comprueba la sede; una sede retirada tras activar seguiría convocando | `conflict` si la sede no está activa y aprobada (mismo criterio que activar, `need_records.sql:272-276`) |

---

## 2. Contrato reconciliado

### 2.1 Modelo de datos (ajustes sobre `especificacion…:1554-1576`)

- `app.rbc_compatibility` (27 filas) y `app.haversine_m` (immutable; casts a
  `double precision`) sin cambios.
- `app.invitation_batches` sin cambios.
- `app.invitations`, sobre la spec:
  - `hospital_id uuid not null` (desnormalizado de la necesidad, para RLS sin
    consultar `needs`);
  - `donor_id uuid null` **sin FK** a `donor_profiles` (D3 regla 2);
  - `confirm_token_hash`, `reject_token_hash` `text null`, `unique` cada una,
    `check (~ '^[0-9a-f]{64}$')`, no se anulan al consumir;
  - `current_outbox_id uuid not null references app.email_outbox`;
  - índices: `(donor_id, created_at)` (cuota), `(need_id) where response = 'confirmada'`
    (conteo), `(delivery) where delivery = 'fallida'` (tareas).
- `app.invitation_response_history`: `invitation_id` FK a `invitations`,
  `donor_id` sin FK. Trigger: `UPDATE` siempre prohibido; `DELETE` solo si ya
  no existe el perfil del donante (V15; autojustificado, sin GUC).
- RLS: `ENABLE`+`FORCE` en las cuatro tablas; política `TO app_privileged` en
  todas. `authenticated`:
  - `invitations`: `SELECT` solo de columnas (`invitation_id, need_id, batch_id,
    hospital_id, validity, delivery, response, created_at`); políticas admin
    (`hospital_id = (select app.admin_hospital_id())`) y superadmin
    (`app.current_actor_role() = 'superadmin'`). Nunca hashes, `donor_id` ni
    `need_donor_code`;
  - `invitation_batches`: `SELECT`, política admin por hospital;
  - `invitation_response_history`: `SELECT`, política `donor_id = auth.uid()`
    con `app.current_actor_role() = 'donante'` (incluye la barrera);
  - `rbc_compatibility`: sin acceso.
- `need_donor_code`: generado en SQL (`gen_random_bytes` + Crockford, 10
  caracteres, V14) con reintento ante colisión; `need-donor-code.ts` queda como
  referencia de paridad del alfabeto.

### 2.2 Convenciones comunes

- `kind` → HTTP con el mapeo existente (`shared/persistence/rpc-reply.ts:29-41`):
  `created` 201, `ok` 200, `accepted` 202, `replayed` = código original con la
  respuesta guardada; `unauthenticated` 401; `forbidden`, `mfa_required`,
  `step_up_required` 403; `not_found` 404; `conflict`, `payload_conflict`,
  `in_progress` 409; `gone` 410; `invalid` 422; `rate_limited` 429.
- Hash de idempotencia: `app.fingerprint` sobre los campos indicados; los slots
  (aleatorios) **nunca** entran en el hash.
- Validación de forma de path/query/body (400) en Express con los validadores
  generados, como en F5; las rutas de token usan la misma convención que
  `verifyDonorEmail` (`donor-records/http`), `no-store`/`no-referrer` y sin logs.

### 2.3 Por operación

| Operación | RPC | Tipo / propietario / llamador | Parámetros | `kind` de éxito | Fallos (HTTP) |
| --- | --- | --- | --- | --- | --- |
| `listOwnInvitationBatches` | `api.list_own_invitation_batches(p_need_id uuid, p_limit int, p_cursor_created_at timestamptz, p_cursor_id uuid)` | INVOKER; `app.require(admin, aal2)` + `admin_hospital_id()` | — | `ok {items, next}`; orden `(created_at, batch_id)` asc; `deliveryCounts` por `invitations.delivery` | 401/403; necesidad ajena o inexistente 404; cursor 422 |
| `requestInvitationBatch` | Paso 1 `api.authorize_invitation_batch(p_need_id uuid)` (admin, `d_require(admin, aal2)` + `d_admin_hospital_id()`; emite la concesión); paso 2 `api.request_invitation_batch(p_key text, p_hash text, p_need_id uuid, p_slots jsonb)` | DEFINER `app_privileged`; paso 2 con sesión **técnica** (`is_api_technical()`), consume la concesión (H1). El contrato HTTP/OpenAPI no cambia: Express orquesta los dos pasos | hash `[needId]`; `p_slots` 5..50 × `{outboxId, invitationId, confirmHash, rejectHash, sealedPayload}` | `created {batchId, createdInvitationCount, queuedEmailCount}` (201; replay 201) | 401/403; 404; 409 (no `activa` visible, sede no utilizable, clave); 422 (slots ≠ `batchSize(target)`, forma) |
| `listOwnNeedResponses` | `api.list_own_need_responses(p_need_id uuid, p_limit int, p_cursor_created_at timestamptz, p_cursor_id uuid)` | DEFINER (ítem 6) | — | `ok {confirmedIntentCount, items, next}`; orden `(created_at, invitation_id)` | 401/403; 404; 422 |
| `getInvitationActionPreview` | `api.get_invitation_action_preview(p_token_hash text)` | DEFINER; solo `api_technical` | — | `ok {hospitalName, publicSiteName, intendedAction, expiresAt}` | 404 hash desconocido; 410 (consumido, anulado, terminal, vencida, `meta_alcanzada`, donante eliminado) |
| `recordInitialInvitationResponse` | `api.respond_invitation_by_token(p_token_hash text, p_key text, p_hash text)` | DEFINER; solo `api_technical`; actor `token:<hash>` | hash `[tokenHash]` | `ok {response, recordedAt, needStatus}`; replay 200 | 404; 409 (confirmar con meta; clave); 410 |
| `listOwnInvitations` | `api.list_own_invitations(p_limit int, p_cursor_created_at timestamptz, p_cursor_id uuid)` | DEFINER (ítem nuevo 14); `d_require(donante)` | — | `ok {items, next}`; orden `(created_at, invitation_id)` desc | 401/403; 422 |
| `getOwnInvitation` | `api.get_own_invitation(p_invitation_id uuid)` | DEFINER (ítem 14) | — | `ok {invitation, instructions}` | 401/403; ajena o inexistente 404 |
| `changeOwnInvitationResponse` | `api.change_own_invitation_response(p_key text, p_hash text, p_invitation_id uuid, p_response text)` | DEFINER (ítem 7); `d_require(donante)` | hash `[invitationId, response]` | `ok {response, recordedAt, needStatus}` | 401/403; 404; 409; 422 |
| `listOwnResponseHistory` | `api.list_own_response_history(p_limit int, p_cursor_changed_at timestamptz, p_cursor_id bigint)` | INVOKER; `app.require(donante)` + RLS | — | `ok {items, next}`; orden `(changed_at, id)` desc | 401/403; 422 |
| `retryInvitationDelivery` | Paso 1 `api.authorize_invitation_retry(p_invitation_id uuid)` (superadmin, `d_require(superadmin, aal2, step-up)`; emite la concesión); paso 2 `api.retry_invitation_delivery(p_key text, p_hash text, p_invitation_id uuid, p_slot jsonb)` | DEFINER (ítem nuevo 15); paso 2 con sesión **técnica**, consume la concesión (H1). El contrato HTTP/OpenAPI no cambia: Express orquesta los dos pasos | hash `[invitationId]`; slot `{outboxId, confirmHash, rejectHash, sealedPayload}` | `accepted` (202 neutro) | 401/403; 404; 409; 410 |

**`request_invitation_batch`, pasos en orden** (cambio H1: la sesión técnica ejecuta; el paso 1 de abajo lo hace `authorize_invitation_batch` con la sesión del admin)

1. `authorize_invitation_batch`: `d_require` → `kind`; `d_admin_hospital_id()` nulo → `forbidden`; comprueba la necesidad y emite la concesión (un solo uso, ≤ 2 min). En `request_invitation_batch`: `app.is_api_technical()` → si no, `forbidden`; la concesión se lee y se marca consumida tras el lock de la necesidad (paso 3) y antes del claim; vencida, usada o de otra necesidad → `forbidden`; el admin y el hospital salen de la concesión.
2. Forma de clave, hash y slots → `invalid`.
3. `select … from app.needs where need_id = p_need_id and hospital_id = v_hospital for update` → `not_found`.
4. `peek_idempotency('user:'||uid, 'requestInvitationBatch', …)` → replay / 409.
5. Estado: `app.need_status(n) = 'activa'` y sede activa y aprobada, si no
   `conflict`; `jsonb_array_length(p_slots) = least(50, greatest(5, 2*target))`,
   si no `invalid`.
6. `pg_advisory_xact_lock(hashtextextended('invitation-quota', 0))`.
7. `claim_idempotency`.
8. Candidatos (consulta de la spec `:1591-1606` + cuota inline
   `(select count(*) … i.donor_id = p.donor_id and i.created_at > now() - interval '24 hours') < 3`,
   `order by c.is_exact desc, d asc, p.donor_id asc limit n`). Las altas
   asistidas no reclamadas no están `activo`. Urgencia y reconocimientos no
   intervienen.
9. Inserta lote, invitaciones (slot i ↔ candidato i), `app.enqueue_email(outboxId,
   'invitacion', invitationId, donor_id, sealedPayload, n.expires_at)`,
   `current_outbox_id`, auditoría `lote.solicitado` (`d_audit`, id del lote).
   Los slots sobrantes se descartan.
10. `complete_idempotency`; `createdInvitationCount = queuedEmailCount` (0 posible).

**`respond_invitation_by_token`, pasos y matriz**

1. `jwt_sub` nulo → `unauthenticated`; no `is_api_technical()` → `forbidden`; forma → `invalid`.
2. Lookup sin lock por `confirm_token_hash` o `reject_token_hash` → `not_found`.
   La acción la fija la columna que coincide.
3. Lock de la necesidad; lock de la invitación; si el hash ya no coincide
   (rotado) → `not_found`.
4. Necesidad terminal o `now() >= expires_at` → `gone` (también para una
   repetición con la misma clave: RF-INV-08).
5. `peek_idempotency('token:'||hash, 'recordInitialInvitationResponse', …)` →
   replay 200 / 409.
6. En este orden: `token_consumed_at` no nulo o `response <> 'sin_respuesta'` → `gone`;
   `donor_id` nulo o sin perfil → `gone`; necesidad `meta_alcanzada` →
   `conflict` si la acción es confirmar (V6), `gone` si es rechazar;
   `validity <> 'activa'` → `gone`.
7. `claim_idempotency`; respuesta, `response_recorded_at`, `token_consumed_at`;
   historial (`token`); auditoría `invitacion.respondida`.
8. Si confirma y `count(confirmada) >= target`: necesidad `meta_alcanzada`
   (`version+1`), invitaciones `activa`/`sin_respuesta` → `invalidada`, outbox
   `pendiente` → `cancelado` con payload NULL (RF-INV-05), todo ordenado (D3).
9. `ok {response, recordedAt, needStatus}` + `complete_idempotency`.

| Situación | Vista previa | Respuesta por token |
| --- | --- | --- |
| Hash desconocido o rotado | 404 | 404 |
| Primer uso válido | 200 | 200 |
| Misma clave y token tras éxito, necesidad viva | — | 200 (replay) |
| Mismo token, otra clave; o token hermano | 410 | 410 |
| Necesidad cerrada, cancelada o vencida (incluida la repetición) | 410 | 410 |
| Meta alcanzada: confirmar | 410 | 409 |
| Meta alcanzada: rechazar | 410 | 410 |
| Invitación invalidada (indisponibilidad, eliminación) | 410 | 410 |
| 20 POST concurrentes, claves distintas | — | 1 × 200, 19 × 410 |
| Misma clave en curso | — | 409 (`in_progress`) |

**`change_own_invitation_response`**

1. `d_require(donante)`; forma → `invalid`.
2. Lookup sin lock `invitation_id` + `donor_id = jwt_sub()` → `not_found`; lock
   de la necesidad y luego de la invitación; si `donor_id` cambió (V15) → `not_found`.
3. `peek` (`user:<uid>`, `changeOwnInvitationResponse`).
4. Necesidad terminal o vencida → `conflict`; `response = 'sin_respuesta'` →
   `conflict` (la respuesta inicial es solo por token, B.5); mismo valor →
   `ok` sin historial ni auditoría; a `confirmada` con meta alcanzada → `conflict` (V6).
5. `claim`; actualiza; historial (`sesion`); auditoría. A `confirmada` que
   completa la meta → cascada RF-INV-05. De `confirmada` a `rechazada` con
   `meta_alcanzada` y conteo bajo la meta → `activa`, sin revalidar ni lote
   (RF-INV-06).

**`retry_invitation_delivery`** (cambio H1: dos pasos, el contrato HTTP no cambia; Express los orquesta)

Paso 1, `api.authorize_invitation_retry(p_invitation_id uuid)`, sesión del superadmin:

1. `d_require(superadmin, aal2, step-up)` → si no, `unauthenticated`,
   `forbidden`, `mfa_required` o `step_up_required`.
2. Lookup sin bloqueo de la invitación y su necesidad → `not_found`.
3. Emite la concesión de un solo uso (`app.invitation_grants`), ligada a la
   invitación y al superadmin, con vencimiento ≤ 2 min. No escribe hashes ni
   outbox ni toma bloqueos de espera.

Paso 2, `api.retry_invitation_delivery(p_key, p_hash, p_invitation_id, p_slot)`,
sesión **técnica** (`app.is_api_technical()`; si no, `forbidden`); los hashes y
el payload sellado del slot los genera la aplicación:

1. Forma de clave, hash y slot → `invalid`.
2. Lock de la necesidad y de la invitación (D3; no de filas antiguas del
   outbox) → `not_found`; consumo de la concesión (usada, vencida, de otra
   invitación o de otro actor → `forbidden`); el superadmin sale de la
   concesión, nunca de un argumento.
3. `peek` (`user:<uid de la concesión>`, `retryInvitationDelivery`). Supuesto a
   confirmar por el auditor y por la prueba de F6-3: un replay se resuelve en
   este `peek` sin exigir ni consumir una concesión nueva.
4. `now() >= expires_at` o necesidad `vencida` → `gone`; necesidad
   `cerrada`/`cancelada`/`meta_alcanzada`, `validity <> 'activa'`,
   `response <> 'sin_respuesta'`, `delivery <> 'fallida'` o donante anonimizado
   → `conflict`.
5. `claim`; rota ambos hashes (los anteriores pasan a 404); nueva fila con
   `enqueue_email(…, not_after = expires_at)`; `current_outbox_id`;
   `delivery = 'pendiente'`; auditoría `entrega.reintento_manual`.
   El reintento no cuenta para la cuota (no crea invitación).

**Lecturas**

- `list_own_need_responses`: `{needDonorCode, donorName, declaredBloodType, response:'confirmada', responseRecordedAt}`
  si la respuesta vigente es `confirmada` y el donante existe (nombre y grupo
  del perfil vigente); si no, `{needDonorCode, validity, delivery, response}`;
  confirmaciones anonimizadas omitidas (O3). Nunca email, ubicación,
  distancia ni id global.
- `list/get_own_invitation(s)`: `hospitalName = hospitals.public_name`,
  `publicSiteName = sites.public_name`, `instructions = sites.public_instructions`
  o el texto neutral de la spec (`:1659`, pendiente de C1 clínico); `validity`
  proyectada `vencida` si `now() >= expires_at`.

### 2.4 Cuota 3/24 h

Global entre hospitales, ventana `(t-24 h, t]` sobre `invitations.created_at`
del donante; la tercera se permite, la cuarta no (B.3 :2142). Reintentos de
email y filas anonimizadas no cuentan. Serializada por `invitation-quota`; la
participación toma el mismo lock al pasar a no disponible, de modo que un lote
concurrente no deja invitaciones activas a un donante que acaba de retirarse.

### 2.5 Outbox sin destinatario y cancelación

- Fila `kind='invitacion'`, `recipient_user_id = donor_id`, payload solo con
  tokens, `not_after = needs.expires_at`, `invitation_id` sin FK.
- Cerrar/cancelar (RF-INV-08), meta (RF-INV-05), indisponibilidad (RF-INV-07)
  y eliminación (V15): `pendiente` → `cancelado`; vencer: → `vencido`; payload
  NULL en todos (AP-06). `en_curso` termina su intento y, si falla, queda
  `cancelado` (D4).

---

## 3. Allowlist DEFINER exacta y enmiendas de ADR

**Funciones F6 SECURITY DEFINER** (todas `owner app_privileged`, `search_path = ''`,
`EXECUTE` solo a `authenticated`, comprobación explícita del llamador):

| Función | Llamador | Ítem ADR-003 |
| --- | --- | --- |
| `api.authorize_invitation_batch(uuid)` (nueva, H1) | admin + AAL2 | **16 (nuevo)** |
| `api.request_invitation_batch(text,text,uuid,jsonb)` (pasa a sesión técnica, H1) | `api_technical` | 5 |
| `api.get_invitation_action_preview(text)` | `api_technical` | 3 |
| `api.respond_invitation_by_token(text,text,text)` | `api_technical` | 3 |
| `api.change_own_invitation_response(text,text,uuid,text)` | donante | 7 |
| `api.update_own_participation(…)` (pasa de INVOKER a DEFINER) | donante | 7 |
| `api.list_own_need_responses(uuid,int,timestamptz,uuid)` | admin + AAL2 | 6 |
| `api.transition_own_need(text,text,uuid,text)` (pasa de INVOKER a DEFINER) | admin + AAL2 | 8 |
| `api.worker_expire_needs(int)` (nueva) | worker | 10 |
| `api.list_own_invitations(int,timestamptz,uuid)` | donante | **14 (nuevo)** |
| `api.get_own_invitation(uuid)` | donante | **14 (nuevo)** |
| `api.authorize_invitation_retry(uuid)` (nueva, H1) | superadmin + AAL2 + step-up | **15 (nuevo)** |
| `api.retry_invitation_delivery(text,text,uuid,jsonb)` (sesión técnica, H1) | `api_technical` | **15 (nuevo)** |

**DEFINER existentes que cambian de cuerpo** (sin cambiar propietario ni
privilegios): `worker_claim_due_outbox`, `worker_record_attempt`,
`worker_expire_outbox`, `ingest_email_event` (ítem 10) y `finish_deletion`
(ítem 9).

**INVOKER** (sin allowlist): `list_own_invitation_batches`,
`list_own_response_history`, `list_own_needs`/`get_own_need` (vía `need_json`),
`list_superadmin_tasks`.

**Sin cambios:** ninguna DEFINER nueva de `postgres` (la pgTAP sigue fijando
siete); ningún uso nuevo de `service_role` (ADR-006 intacto); F6 no toma la
barrera ni la modifica (ADR-007 intacto); ADR-004 intacto.

**Enmiendas requeridas (las redacta un escritor tras A4; las revisa
`security-privacy-auditor`):**

- **ADR-003:**
  1. Ítem 14: lecturas propias del donante que cruzan propietarios
     (`list_own_invitations`, `get_own_invitation`), con la razón (evitar
     políticas de donante en `needs`/`hospitals`/`sites` y la recursión RLS con
     `admin_hospital_id()`).
  2. Ítem 15: `retry_invitation_delivery` (superadmin, AAL2, step-up, outbox); con H1, `authorize_invitation_retry` + ejecución técnica. Ítem 16: `authorize_invitation_batch`; regla 8 (ningún secreto elegido por el cliente).
  3. Nota en ítems 7 y 8: `update_own_participation` y `transition_own_need`
     pasan a DEFINER.
  4. Regla nueva: toda DEFINER con sesión de usuario llama a `app.d_require`
     antes que a cualquier helper (`d_admin_hospital_id` no mira la barrera).
  5. Sección nueva «Orden de bloqueos» con la tabla de D3 y la regla de
     esperar antes del `claim`.
- **ADR-005:** punto 4, «nunca retrocede» se aplica por fila de outbox; la
  invitación proyecta la fila vigente (`current_outbox_id`) y el reintento
  manual la reinicia a `pendiente`. Puntos 5/9: payload de invitación =
  dos tokens; hospital y sede los aporta el `claim`; dos enlaces.
- **ADR-006 / ADR-007 / ADR-004:** ninguna.

---

## 4. Cambios en `docs/openapi.json`

**Ninguno obligatorio:** paths, schemas, códigos y `x-ratification` de las 10
operaciones ya admiten este contrato.

Recomendados, solo texto (regenerar con `openapi:types` y comprobar
`openapi:api:check`):

1. `recordInitialInvitationResponse.description` (:949): precisar 409 (confirmar
   con la meta alcanzada, V6) y 410 (consumido, anulado, terminal o vencido,
   también para la repetición con la misma clave).
2. Slice **S0** de sincronización (O6; P-03 ya autorizó «sincronizar»):
   `info.description` (:7) y `deliveryCounts` (:2713) dejan de declarar AP-02
   pendiente; `docs/Api-Rules.md:236`/`:445`; y la prueba
   `scripts/prism-contract.test.mjs:872-894`, que hoy **exige** AP-02 abierta,
   pasa a exigir la referencia a ADR-005/V5. Cambiar esa prueba requiere la
   decisión A4.6: no se debilita en silencio.

---

## 5. Cascadas F6-4 sobre funciones existentes

| Función | Cambio |
| --- | --- |
| `api.transition_own_need` | INVOKER → DEFINER (`d_require` + `d_admin_hospital_id`, `d_audit`). Al pasar a `cerrada`/`cancelada`: invitaciones `activa`/`sin_respuesta` → `invalidada`; outbox `pendiente` → `cancelado`, payload NULL. Mismo orden: bloqueos de necesidad, invitaciones y outbox (D3) → peek → estado → claim; los bloqueos de invitaciones y outbox van antes del claim |
| `api.update_own_participation` | INVOKER → DEFINER (`d_require(donante)`; email desde `app.jwt_claims()`, no `auth.jwt()`). Si pasa a no disponible: lock de cuota; invitaciones del donante `activa`/`sin_respuesta` → `invalidada`; outbox cancelado. No toca confirmaciones ni necesidades (RF-INV-07) |
| `api.worker_expire_needs(p_limit int)` | **Nueva.** `is_worker()`; necesidades `borrador`/`activa`/`meta_alcanzada` con `expires_at <= now()`, `order by need_id for update skip locked limit p_limit` → `vencida`; invitaciones `activa`/`sin_respuesta` → `vencida` (O4); outbox → `vencido`, payload NULL; devuelve conteos. El worker la llama en su ciclo |
| `app.need_json` (usada por `list_own_needs`/`get_own_need`/transición) | `confirmedIntentCount = count(*)` de invitaciones `confirmada` de la necesidad (RLS admin en INVOKER; política privilegiada en DEFINER), incluidas las anonimizadas |
| `api.worker_claim_due_outbox` | Para `kind='invitacion'`: `display {hospitalName, sitePublicName, siteAddress, siteLatitude, siteLongitude}` |
| `api.worker_record_attempt` | Orden invitación → outbox; actualiza `invitations.delivery` solo si es la fila vigente; invitación no activa + fallo → `cancelado` |
| `api.ingest_email_event` | Busca la fila por `provider_message_id`, bloquea la invitación vigente y después el outbox; proyecta solo si es la fila vigente |
| `api.worker_expire_outbox` (y el barrido de leases de `claim`) | `FOR UPDATE SKIP LOCKED` en los barridos multi-fila |
| `api.finish_deletion` (V15) | Invitaciones del donante: `donor_id = NULL`, hashes NULL, `activa`/`sin_respuesta` → `invalidada`; outbox `pendiente` → `cancelado`; borra su historial |
| `api.list_superadmin_tasks` | Añade `delivery_failure` (O5), `taskId = invitation_id`, `resourceCode = app.opaque_code(invitation_id)` |

---

## 6. Plan de slices ajustado

Cada slice: un escritor, TDD, ≤ 5 archivos salvo SQL, pgTAP e integración con
`supabase start --workdir backend`, sin `service_role`, commit atómico tras su gate.

| Slice | Archivos | Pruebas obligatorias | Gates |
| --- | --- | --- | --- |
| **S0** (opcional, docs) | `docs/openapi.json` (texto), generados, `docs/Api-Rules.md`, `scripts/prism-contract.test.mjs` | `openapi:lint`, `openapi:api:check`, `test:contract`, `test:api:generator` | reviewer-back |
| **F6-2** Esquema | `backend/supabase/migrations/<ts>_invitation_coordination.sql`; `backend/supabase/tests/database/13_invitation_coordination.test.sql`; `backend/test/integration/invitation-parity.integration.ts`; `backend/src/shared/persistence/schema-version.ts` | 27 filas y paridad TS↔SQL de la matriz; Haversine TS↔SQL ≤ 1e-6 m y borde `==`; `unique` (necesidad, donante) y (necesidad, código); historial: UPDATE falla, DELETE falla con perfil y pasa sin él; privilegios por columna (hashes, `donor_id`, `need_donor_code` invisibles a `authenticated`); RLS admin/otro hospital/superadmin/donante; siete DEFINER de `postgres` | reviewer-back, security |
| **F6-3a** RPC: lote, token y concesión | migración `…_invitation_rpc.sql`; `14_invitation_rpc.test.sql`; `backend/test/integration/invitation-coordination.integration.ts` | pgTAP: admin de otro hospital no lanza lote ni obtiene concesión (H1: `authorize_invitation_batch`/`authorize_invitation_retry`; concesión reutilizada, vencida, de otro admin o de otra necesidad → `forbidden`; `request_invitation_batch` y `retry_invitation_delivery` con sesión de usuario → `forbidden`; `authenticated` sin acceso a `app.invitation_grants`); la concesión del lote vence a los 2 min y el replay se resuelve sin concesión nueva (supuesto a confirmar por el auditor y por esta prueba); cuarta invitación en 24 h excluida; cuarta invitación en 24 h excluida; borde del radio incluido; fuera de polígono / no disponible / alta asistida excluidos; `batchSize` y slots ≠ n → `invalid`; matriz §2.3 completa (404/409/410, replay); barrera abierta → `unauthenticated` en cada DEFINER de usuario; llamador no técnico en token → `forbidden`. Integración: dos lotes concurrentes de hospitales distintos respetan la cuota y no se interbloquean; 20 POST del mismo token → un efecto; última plaza en carrera → un solo `meta_alcanzada`; confirmar tras meta → 409 | reviewer-back, security, clinical (instrucciones), QA (carreras) |
| **F6-3b** RPC: reintento, lecturas del donante, cambio de respuesta e historial | migración `…_invitation_rpc_b.sql`; `14b_invitation_rpc_b.test.sql`; ampliar `invitation-coordination.integration.ts` (nombres sugeridos; el escritor SQL fija los definitivos) | `authorize_invitation_retry` + `retry_invitation_delivery` técnica: concesión reutilizada, vencida, de otra invitación o de otro actor → `forbidden`; sesión de usuario en la ejecución → `forbidden`; rol, AAL y step-up (`forbidden`/`mfa_required`/`step_up_required`); 404/409/410; replay (supuesto a confirmar); `list/get_own_invitation(s)` (ítem 14): donante ajeno 404, solo la lista positiva de campos, barrera abierta → `unauthenticated`; `change_own_invitation_response` (ítem 7) y `list_own_response_history` según §2.3 | reviewer-back, security, QA |
| **F6-4** Cascadas | migración `…_invitation_cascades.sql`; `15_invitation_cascades.test.sql` + ajustes de versión en pgTAP previas; ampliar `invitation-coordination.integration.ts` y `privacy-requests.integration.ts` | cerrar/cancelar → invitaciones `invalidada` y outbox `cancelado`; vencer → `vencida`/`vencido`; no disponible → solo `sin_respuesta` invalidadas; `confirmedIntentCount` real; evento tardío de fila anterior no cambia `delivery`; `en_curso` + transitorio tras cerrar → `cancelado`; V15 anonimiza, borra historial y conserva conteos; carreras sin interbloqueo: transición vs token, participación vs lote, worker vs transición, borrado de Auth vs lote (FK → 500 reintentable) y borrado de Auth vs participación o vencimiento (`40P01` → 500 reintentable); lease agotado → invitación `fallida`, directa o por el barrido de conciliación | reviewer-back, security, QA |
| **F6-5a** Consumidor de correo | `email-delivery/application/email-payload.ts`, `templates/invitacion.ts`, `application/process-outbox.ts`, `infrastructure/outbox-rpc-gateway.ts`, `src/worker.ts` (vencimiento) + sus `.test.ts` | payload con `rejectToken` solo en `invitacion`; dos enlaces con token en el fragmento; plantilla sin grupo, ubicación, distancia ni reconocimientos; guard cerrado de `display`; worker llama a `worker_expire_needs` | reviewer-back, security, clinical (copia) |
| **F6-5b** Módulo HTTP | `invitation-coordination/{application,infrastructure,http}/*`, `composition.ts`, `bruno/backend/invitation-coordination/**` | unitarias de servicio (slots: `generateActionToken`, `hashToken`, `sealEmailPayload`), gateway con guards cerrados, router de las 10 operaciones; Bruno CLI contra el backend real (no Prism ni mock) con roles admin/donante/superadmin/token | reviewer-back, security, QA |
| **F6-6** Rendimiento | semilla de 500 donantes sintéticos (`.example.test`) y script PER-02 | p95 < 2 s, 5 concurrentes, 3 hospitales, 10 calentamientos excluidos, ≥ 100 muestras; puerta interna A4.3: 5 lotes concurrentes sobre 500 donantes con p95 ≤ 1 s y sin `55P03` ni `statement_timeout`; si falla, vuelve a la persona usuaria para elegir la alternativa de locks por donante ordenados | reviewer-back |

Gates de módulo al final: `reviewer-back`, `clinical-safety-reviewer`,
`security-privacy-auditor` y cierre aprobado por la persona usuaria.

---

## 7. Riesgos y supuestos no verificados

- **Ausencia de ciclos de locks:** argumentada (D3), no probada. Se exige una
  prueba de integración por par de rutas concurrentes.
- **Rendimiento del lock global de cuota** con PER-02: no medido.
- **Cascada de `auth.users`** (GoTrue, `on delete set null` en el outbox) y su
  interacción con un lote concurrente: se supone violación de FK (500
  reintentable), no interbloqueo; no comprobado.
- **`statement_timeout`** del rol `authenticated` en Supabase para un lote
  serializado: no comprobado.
- **Privilegios por columna con RLS:** se supone que las expresiones de
  política del admin solo usan columnas concedidas (`hospital_id`); verificar
  con pgTAP.
- **Confirmación anonimizada (O3):** omitirla de la lista es interpretación,
  no regla escrita.
- **Corrección del grupo declarado (F7)** con invitaciones vivas: el hospital
  vería el grupo nuevo; sin regla de requisitos.
- **Purga final PRV-02** (`final_demo_at` + 30 días) no existe en ninguna
  migración; F6 añade tablas que también deberá purgar.
- **Texto neutral de instrucciones** y copia de la plantilla: pendientes del
  gate clínico C1.
- Ninguna afirmación de compatibilidad clínica: la matriz es académica
  (RNF-SAF-01).

---

## 8. Decisión requerida de la persona usuaria (A4)

**H1: decidido por la persona usuaria el 2026-10-22.** Hallazgo del
`security-privacy-auditor` sobre F6-3a: en el lote el admin elegía los hashes de
token (la misma vulnerabilidad que ADR-003 corrigió en F5). Decisión: patrón F5
en dos pasos, también para el reintento del superadmin (F6-3b): una RPC de
autorización con la sesión del usuario emite una concesión de un solo uso
(≤ 2 min, tabla propia sin acceso para `authenticated`) y la RPC de ejecución
corre con la sesión técnica y los hashes que genera la aplicación. Las enmiendas
de ADR-003 (ítems 5, 15 y 16, regla 8) están **pendientes de revisión del
`security-privacy-auditor`; no son un PASS**.

**Decisión A4: aprobada por la persona usuaria el 2026-10-22: opción 1 en todo con las dos condiciones de salida (A4.3, A4.5).**

Recomendación global: **aprobar la opción 1 de cada punto**. Con eso, el
escritor de F6-2 puede empezar y las enmiendas de ADR-003/ADR-005 se redactan
en el mismo commit documental, revisadas por `security-privacy-auditor`.

1. **A4.1 Tokens (D1).**
   1. Dos hashes en la invitación; payload `{token, rejectToken}`; hospital y
      sede desde el `claim` del worker. **(Recomendada)**
   2. Igual, pero hospital, sede y plazo dentro del payload (una lectura INVOKER
      nueva para el admin y una DEFINER nueva para el superadmin).
   3. Reutilizar `app.action_tokens` con dos `kind` nuevos.
2. **A4.2 Replay / 409 / 410 (D2).**
   1. Matriz de §2.3: hashes conservados; terminal o vencida → 410 incluso para
      la repetición; confirmar con meta → 409. **(Recomendada)**
   2. Repetición con la misma clave siempre 200 durante 72 h (REL-02), aunque la
      necesidad haya terminado (contradice RF-INV-08).
3. **A4.3 Locks y cuota (D3).**
   1. Orden canónico y un lock asesor global de cuota. **(Recomendada)**
   2. Locks por donante en orden de `donor_id` sobre todos los candidatos
      antes de filtrar (más concurrencia, más código).
4. **A4.4 Entrega (D4).**
   1. `current_outbox_id` y proyección solo de la fila vigente, con el worker
      en orden invitación → outbox. **(Recomendada)**
   2. Sin columna `delivery`: calcularla en lectura uniendo el outbox (requiere
      exponer el outbox a más rutas).
5. **A4.5 Allowlist (D5).**
   1. DEFINER para las lecturas del donante y el reintento (ítems 14 y 15 de
      ADR-003). **(Recomendada)**
   2. INVOKER para las lecturas del donante copiando hospital, sede, grupo,
      urgencia, plazo e instrucciones en la invitación al crearla (datos
      duplicados y congelados).
6. **A4.6 Puntos menores** (aprobar o rechazar en bloque): confirmación
   anonimizada fuera de `items` (O3); la sesión no emite la respuesta inicial;
   mismo valor → 200 sin historial; vencimiento literal de RF-INV-08 (O4); lote
   rechaza sede no utilizable (O9); reintento solo con `sin_respuesta`; slice S0
   que cambia la prueba C5 de AP-02.
   1. Aprobar todos. **(Recomendada)**
   2. Aprobar todos menos S0 (la prueba C5 sigue exigiendo AP-02 abierta y el
      texto OpenAPI queda obsoleto).
7. **A4.7 OpenAPI.**
   1. Sin cambios de schema; solo la aclaración textual de 409/410 en
      `recordInitialInvitationResponse`. **(Recomendada)**
   2. Ningún cambio.

### 8.1 Evaluación de variaciones por punto (2026-10-22)

Petición de la persona usuaria: confirmar si la opción 1 sirve a todos los
participantes en todos los casos y, si no, dejar una condición o una decisión.
Participantes: donante, admin de hospital, superadmin, worker y quien abre un
enlace del email. Resultado: la opción 1 vale en los siete puntos; dos llevan
una **condición de salida** medible o revisable.

| Punto | ¿Opción 1 para todos? | Condición o decisión |
| --- | --- | --- |
| A4.1 Tokens | Sí. Refuerzo: el email de D1 (`2026-10-22-f6-textos-donante.md`) ahora necesita dirección y coordenadas de la sede; salen del `claim` (siempre vigentes) y no se guardan selladas en el payload. | `display` del `claim` = `{hospitalName, sitePublicName, siteAddress, siteLatitude, siteLongitude}`; el enlace de mapa se arma en la plantilla. Sin condición de salida. |
| A4.2 Replay / 409 / 410 | Sí. La opción 2 contradice RF-INV-08 y RF-INV-02/03. | Ninguna. |
| A4.3 Locks y cuota | Sí para el prototipo (500 donantes), pero el lock global **serializa** lotes de todos los hospitales. | **Puerta en F6-6:** con 5 lotes concurrentes sobre 500 donantes, p95 ≤ 1 s y ningún `55P03` ni `statement_timeout`. Si no se cumple, vuelve a la persona usuaria para elegir la opción 2. El umbral es una propuesta del asistente, no un requisito. |
| A4.4 Entrega | Sí. La opción 2 expone el outbox a más rutas (peor para privacidad). | Ninguna. |
| A4.5 Allowlist | Sí. La opción 2 congela datos duplicados y no sirve a D3: el texto del donante depende del estado vigente de la necesidad. | `security-privacy-auditor` revisa las enmiendas (ítems 14 y 15) antes de F6-2. Si las rechaza, solo las **lecturas** del donante pasan a la opción 2 y el reintento del superadmin sigue DEFINER. |
| A4.6 Menores | Sí, en bloque. S0 es seguro: ADR-005 está aceptado y AP-02 ya no está abierto. | Si te opones a uno, dímelo y lo aparto; los demás no dependen entre sí. |
| A4.7 OpenAPI | Sí. | Ninguna. |

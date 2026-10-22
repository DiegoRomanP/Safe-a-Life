# P-12: opciones para borrar cuentas de Auth

Fecha: 2026-10-21. Autor: `solution-architect` (consulta, sin implementación).
Estado: **pendiente de decisión** (compuerta A3 de
[Backend-Route](Backend-Route.md) §11). Fuentes:
[pendientes P-12](../pending/2026-10-20-bloqueos-y-decisiones.md),
[ADR-003](../decisions/ADR-003-persistencia-rpc-supabase.md),
[ADR-006](../decisions/ADR-006-allowlist-service-role.md) y el código citado.
Ningún archivo de código ni ADR se ha cambiado.

## 1. Situación real en el código (HEAD `48ca797`)

| Purga | Dónde debería ocurrir | Qué pasa hoy |
| --- | --- | --- |
| Eliminación aprobada (V15) | API: `privacy-requests-service.ts` `execute` | `eraser` sin definir (`composition.ts:115-117`): responde 503 antes de tocar nada (`privacy-requests-service.ts:128`). |
| `reclamada_incompleta` > 30 días | Worker: `worker_purge_expired` devuelve `staleAccounts` (`20261020010000_privacy_execution.sql:268-272`) y `purge-job.ts:33-40` los borra | Sin `eraser` en el worker (`composition-worker.ts:40-46`): cada cuenta cuenta como `skipped`. |
| Usuarios de Auth inertes > 24 h (signUp público sin cuenta de aplicación) | ADR-006, «Consecuencias», dice que el worker los purga con `deleteUser` | **No existe** ninguna purga periódica: nada lista esos usuarios. Solo se borran al reemplazar un huérfano durante un alta (`deleteInertUser`, `donor-records-service.ts:84`, `action-tokens-service.ts:100`). El texto de ADR-006 no coincide con el código. |

Otros hechos que condicionan la elección:

- El puerto ya existe: `AccountEraser.deleteAccount(userId): Promise<void>`
  (`backend/src/modules/privacy-requests/application/privacy-requests.ports.ts:87-93`).
  El flujo de dos fases también: primero se borra en Auth y después
  `api.finish_deletion` escribe el ledger, que exige que el perfil ya no exista
  (`privacy_execution.sql:182-183`). Si el cierre falla, el worker lo termina con
  `pendingDeletions` (`privacy_execution.sql:273-277`).
- El worker **no tiene `service_role`**: `WorkerConfig` no lo pide (B2,
  `0dd60f9`) y ADR-003 regla 6 dice «sin tablas generales ni `service_role`».
- `deleteInertUser` ya es un híbrido: el adaptador de `service_role` llama por RPC
  a una función SQL `SECURITY DEFINER` propiedad de `postgres`
  (`api.worker_delete_inert_user`, endurecida por B1 en
  `20261021000000_inert_user_lock.sql`). La pgTAP
  `00_platform.test.sql:33-34` fija exactamente cuatro DEFINER de `postgres`.
- Borrar `auth.users` arrastra por cascada `app.user_accounts`,
  `app.donor_profiles`, `app.hospital_memberships` (y las tablas de ADR-007 si se
  acepta) y deja `app.email_outbox.recipient_user_id` en `null`.

## 2. Qué cambia en la práctica entre (a) y (b)

### En una frase

- **(a)** El backend le pide a **Auth (GoTrue)**, por HTTP y con la clave
  `service_role`, que borre la cuenta: `auth.admin.deleteUser(id)`.
- **(b)** Una **función SQL** propiedad de `postgres` hace `delete from
  auth.users` dentro de la base, con sus condiciones en la misma sentencia o
  transacción.

Ojo: (b) admite dos formas de llamarla, y la diferencia importa.

- **(b1)**, igual que `worker_delete_inert_user`: `EXECUTE` solo para
  `service_role`, invocada desde el adaptador `AuthAdmin`. La clave elevada sigue
  siendo necesaria y el worker no puede usarla.
- **(b2)**: un helper de `postgres` ejecutable solo por `app_privileged`, igual
  que `app.user_email`, al que llama una RPC DEFINER de `app_privileged` que
  comprueba al llamador (`is_api_technical` o `is_worker`). Se invoca con el JWT
  técnico, **sin `service_role`**, y sirve también en el worker.

### Ejemplo 1: el superadmin ejecuta la eliminación de la donante D

- **(a)** API → RPC `execute_correction_request` (estado `en_ejecucion`) →
  `AuthAdmin.deleteAccount(D)` (HTTP `DELETE /auth/v1/admin/users/D`) → la base
  borra en cascada → RPC `finish_deletion` (ledger). Son tres pasos separados. Si
  el proceso cae entre el segundo y el tercero, el worker cierra la solicitud a
  los 15 min. Ese camino ya existe y está probado con dobles.
- **(b2)** API → una sola RPC (p. ej. `api.erase_donor_account(request_id,
  subject_hmac)`) que comprueba la solicitud, borra `auth.users`, escribe el
  ledger y anonimiza, todo en **una transacción**: o pasa todo o nada. El estado
  intermedio desaparece.

### Ejemplo 2: el worker purga una cuenta `reclamada_incompleta` de 31 días

Carrera posible: el worker lee la lista y, un segundo después, la donante termina
su perfil (pasa a `activo`).

- **(a)** El worker necesita `service_role` (hay que enmendar ADR-003 regla 6 y
  deshacer parte de B2). Además, `deleteUser(id)` no tiene condiciones: borra a
  una donante que acaba de activarse. Es el mismo tipo de fallo que B1.
- **(b2)** `delete … where` la cuenta sigue `reclamada_incompleta`, el perfil no
  está `activo` y la fila de `auth.users` está bloqueada `for update` (patrón B1):
  la donante activada no se borra.

### Tabla comparativa

| Aspecto | (a) GoTrue + `service_role` | (b1) DEFINER `postgres` vía `service_role` | (b2) DEFINER `postgres` vía JWT técnico |
| --- | --- | --- | --- |
| Quién tiene el privilegio | El proceso API, con la clave que puede todo en Auth y saltarse RLS | Igual que (a) | `postgres` dentro de una función de una sola tarea; el llamador solo necesita la identidad técnica |
| ¿Sirve en el worker? | Solo si se le da `service_role` | Solo si se le da `service_role` | Sí, sin secretos nuevos |
| Allowlist ADR-006 | +1 método `deleteAccount` (cinco) | +1 método (cinco) | Sin cambios en el adaptador; actualizar la «Consecuencia» sobre inertes |
| Allowlist ADR-003 | Sin cambios | +1 DEFINER de `postgres` (regla 4, pgTAP de 4 → 5) | +1 o 2 helpers de `postgres` y +1 o 2 RPC de `app_privileged` (regla 3 y 4; pgTAP) |
| Condiciones (rol, estado, edad) | Solo en la aplicación, antes de llamar | En SQL, atómicas | En SQL, atómicas |
| Atomicidad con el ledger | No: dos fases y recuperación del worker | No (salvo que la función también escriba el ledger) | Sí, una transacción |
| Auditoría | GoTrue escribe `user_deleted` en `auth.audit_log_entries` (supuesto S1); la app audita `solicitud.completada` en `finish_deletion` | Sin registro de GoTrue; `app.audit_events` en la misma transacción | Igual que (b1) |
| Dependencia | API pública y estable de Auth | Esquema interno `auth` (tablas nuevas de GoTrue sin cascada harían fallar el borrado: falla cerrado) | Igual que (b1) |
| Radio de un fallo | Una clave filtrada o un id equivocado borra cualquier cuenta, también superadmin o técnicas | El SQL limita a quién se borra; la clave filtrada sigue pudiendo todo | El SQL limita a quién se borra y no hay clave elevada en juego |

Conviene recordar que `service_role` ya vive en la API para los cuatro métodos
actuales. Por eso (a) **no añade un secreto nuevo a la API**: añade un uso más
de la clave.

## 3. Recomendación razonada

1. **Eliminación V15: (a)**, en línea con la preferencia de la persona usuaria.
   Ocurre en la API, que ya tiene la clave. Usa la API oficial de Auth (con su
   propia auditoría y sus invariantes). El borrado es incondicional por
   naturaleza (la persona pidió que se borre), el id sale de la base
   (`get_execution_subject`) y el camino de dos fases con recuperación ya está
   construido. Es el cambio más pequeño: un método, el cableado y un ajuste del
   manejo de errores.
2. **Purgas del worker (`reclamada_incompleta` > 30 días e inertes > 24 h):
   (b2), no (a).** Son borrados **condicionales** y concurrentes con la
   actividad de la persona (lección de B1), y el worker no debe recibir
   `service_role` (ADR-003 regla 6, B2). Con (a) habría que elegir entre
   reabrir B2 o dejar las purgas sin hacer.
3. No se recomienda (a) para todo: obliga a dar `service_role` al worker y deja
   la carrera del ejemplo 2. (b2) para todo es técnicamente coherente, porque es
   atómico, pero se aparta de la preferencia expresada y de la API oficial de
   Auth para V15.

Si la persona usuaria prefiere decidir solo V15 ahora, P-12 queda **parcialmente
abierto**: las dos purgas del worker siguen sin hacerse y no se debe operar con
datos reales hasta cerrarlas.

## 4. Diseño concreto de (a) para la eliminación V15

### Archivos

| Archivo | Cambio |
| --- | --- |
| `backend/src/modules/identity-institutions/application/auth-admin.ports.ts` | Cabecera «exactamente cinco métodos». Nuevo `deleteAccount(userId: string): Promise<void>` con este contrato: borra la cuenta de Auth (sesiones, factores e identidades por cascada) y resuelve también si ya no existe (idempotente). Solo para la eliminación V15; el id sale siempre de `get_execution_subject`, nunca de la petición. |
| `backend/src/modules/identity-institutions/infrastructure/supabase-auth-admin.ts` | Implementación (abajo). Mismo archivo: `service-role-allowlist.test.ts` no cambia. |
| `backend/src/composition.ts` (~115) | `eraser: { deleteAccount: (userId) => authAdmin.deleteAccount(userId) }` en `createPrivacyRequestsService`. El módulo `privacy-requests` no importa `identity-institutions`: la composición adapta un puerto al otro. Actualizar el comentario. |
| `backend/src/modules/privacy-requests/application/privacy-requests-service.ts` (159-166) | Distinguir el error (abajo). |
| `backend/src/modules/privacy-requests/application/privacy-requests.ports.ts` (87-90) | Actualizar el comentario de `AccountEraser`. |
| `backend/src/composition-worker.ts` | Sin cambios con (a): el worker sigue sin `eraser`. |

### Implementación del método

```ts
async deleteAccount(userId) {
  if (!UUID.test(userId)) throw new PersistenceError('rejected'); // nunca llamar a Auth con un id raro
  const { error } = await client().auth.admin.deleteUser(userId, false); // borrado definitivo, no soft delete
  if (!error) return;
  if (error.status === 404 || error.code === 'user_not_found') return;   // ya no existe: idempotente
  if (isUnavailable(error) || error.status === 429) throw new PersistenceUnavailableError();
  throw new PersistenceError('rejected');
}
```

No registra ni devuelve mensajes del proveedor (igual que los otros métodos), y
el timeout de 8 s del `boundedFetch` ya se aplica.

### Manejo de errores en `execute` (cambio necesario)

Hoy cualquier fallo de `deleteAccount` llama a `failExecution`. Con un timeout
el resultado es **incierto**: Auth pudo haber borrado la cuenta. Si se marca
`fallida`, `finish_deletion` ya no la cierra (exige `en_ejecucion`) y el ledger
nunca se escribe. Es el mismo patrón que B3. Por eso:

- `PersistenceUnavailableError` (5xx, red, timeout, 429): **no** llamar a
  `failExecution`; responder 503 y dejar `en_ejecucion`. `worker_purge_expired` ya
  resuelve a los 15 min: si la cuenta desapareció, `pendingDeletions` la cierra
  con el ledger; si sigue viva, la marca `fallida`.
- `PersistenceError('rejected')` (rechazo definitivo): `failExecution` y 503,
  como hoy.
- Éxito o 404: `finishDeletion` como hoy.

### Orden respecto a los datos de aplicación

Primero Auth y después la aplicación, como ya exige `finish_deletion`. Si la
aplicación se borrara primero y Auth fallara, quedaría una cuenta con
credenciales válidas y sin datos, capaz de volver a vincularse. Borrar Auth
primero quita el acceso de inmediato; la cascada se lleva cuenta, perfil y
membresías, y `finish_deletion` borra idempotencia y solicitudes, escribe el
ledger (solo HMAC) y anonimiza la solicitud. Un replay de
`executeCorrectionRequest` es seguro: `deleteAccount` responde con 404 (éxito)
y `finish_deletion` devuelve `ok` si ya estaba `completada`.

### Enmienda de ADR-006 (al aceptar)

- Punto 1: «exactamente **cinco** métodos: `updatePassword`, `updateEmail`,
  `deleteInertUser`, `revokeAllSessions` y `deleteAccount` (borrado definitivo
  de la cuenta de Auth de una donante cuya eliminación V15 está `en_ejecucion`;
  el id sale de `api.get_execution_subject`, nunca de la petición; un 404 es
  éxito)».
- Consecuencias: sustituir «el worker los purga tras 24 h con `deleteUser`» por
  el estado real (sin purga periódica hasta decidir §3.2) y añadir que la
  auditoría de V15 está en `auth.audit_log_entries` y en `solicitud.completada`.
- Registrar la decisión de la persona usuaria y el PASS de
  `security-privacy-auditor` (punto 4). ADR-003 no cambia con (a).

### Pruebas necesarias para (a)

- Unitarias del adaptador con `fetch` falso: `DELETE` correcto con la clave;
  200 → ok; 404 o `user_not_found` → ok; 5xx, red, timeout o 429 →
  `PersistenceUnavailableError`; 403 o 422 → `PersistenceError`; id no UUID →
  rechazo sin llamada; sin texto del proveedor en errores ni logs.
- `privacy-requests-service.test.ts`: indisponible → sin `failExecution`, 503;
  rechazo → `failExecution`, 503; 404 → `finishDeletion`; replay tras el cierre.
- `service-role-allowlist.test.ts` sigue verde (sin archivos nuevos con la clave).
- Integración real (`privacy-requests.integration.ts`): eliminación aprobada →
  200; la cuenta ya no existe en Auth; sin `user_accounts`, perfil ni membresías;
  ledger presente; solicitud `completada` con `donor_id` nulo; login con las
  credenciales viejas → 401. Cierre fallido simulado → el worker lo termina con
  `pendingDeletions`.
- Bruno CLI contra el backend real: el escenario de eliminación pasa de 503 a 200.

## 5. Esbozo de (b2) para las purgas del worker (si se elige §3.2)

- Helpers de `postgres` (`EXECUTE` solo `app_privileged`):
  `app.delete_stale_assisted_account(p_user_id uuid) returns boolean` (bloquea
  `auth.users` `for update` y borra solo si el rol es `donante`, el perfil no
  está `activo` y su alta sigue `reclamada_incompleta` con
  `created_at <= now() - 30 días`) y `app.delete_inert_auth_user(p_user_id uuid)`
  (la lógica B1 de `worker_delete_inert_user` con 24 h).
- RPC `api.worker_purge_auth_accounts(p_limit int)` de `app_privileged`, solo
  `is_worker()`: elige candidatos (para los inertes hace falta leer `auth.users`
  sin cuenta; lo hace el helper, no la RPC) y devuelve solo conteos, sin ids.
- `purge-job.ts` deja de recibir `staleAccounts` para borrar (o la RPC los
  procesa directamente). Hay que enmendar ADR-003 reglas 3 y 4 y la pgTAP
  `00_platform.test.sql`, y pasar `security-privacy-auditor`.
- Pruebas: pgTAP de propietario y `EXECUTE`; que no borra activos, no donantes ni
  técnicos; carrera onboarding contra purga con dos conexiones (patrón EQ1/B1);
  y la integración del worker.

## 6. Riesgos y supuestos no verificados

- S1: que `deleteUser` registre `user_deleted` en `auth.audit_log_entries` y
  devuelva 404/`user_not_found` para un id inexistente en la versión local de
  GoTrue. Verificarlo en integración antes de cerrar.
- S2: que no haya objetos de Storage ni otras FK hacia `auth.users` sin cascada
  que bloqueen el borrado (el proyecto no usa Storage; las FK de `app` revisadas
  son `cascade` o `set null`).
- Residual: `app.email_outbox` conserva el payload sellado con el correo hasta
  su propia expiración aunque el destinatario pase a `null`. Comprobar su
  retención contra RNF-PRV antes de operar con datos reales.
- Residual: `app.audit_events` conserva `actor_id` y `resource_id` (UUID
  opacos) de la persona borrada por ser append-only; confirmar que es aceptable
  para el derecho de eliminación (sin conclusión legal).
- La revisión de `security-privacy-auditor` sobre F7 sigue pendiente,
  independientemente de esta decisión.

## Decisión requerida de la persona usuaria

1. **V15:** ¿se aprueba (a), es decir, añadir `AuthAdmin.deleteAccount` con el
   diseño de §4 (incluido el cambio de manejo de errores en `execute`) y enmendar
   ADR-006 punto 1 a cinco métodos?
2. **Purgas del worker** (`reclamada_incompleta` > 30 días e inertes > 24 h),
   una de estas:
   - (i) (b2) según §5 (recomendada), con enmienda de ADR-003;
   - (ii) (a) dando `service_role` al worker (enmienda ADR-003 regla 6 y revierte
     parte de B2; no recomendada);
   - (iii) dejarlas abiertas por ahora (P-12 parcial; no operar con datos reales).
3. ¿Se corrige ya en ADR-006 la consecuencia que afirma que existe la purga de
   inertes a las 24 h, aunque esa purga no exista?

Tras la decisión: implementación por `dev-back` (§4) y, si aplica,
`backend-data-engineer` (§5), con `reviewer-back`, `security-privacy-auditor` y
QA (integración y Bruno reales).

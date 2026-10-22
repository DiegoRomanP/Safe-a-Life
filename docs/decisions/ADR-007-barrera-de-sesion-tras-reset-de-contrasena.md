# ADR-007: Barrera de sesión tras el reset de contraseña

## Estado

Aceptado el 2026-10-22 por la persona usuaria («Apruebo el ADR», compuerta A2 de
[Backend-Route](../plans/Backend-Route.md) §11). Propuesto el 2026-10-21 (SP-01)
tras autorizar su preparación («Decisión SP-01», bitácora de
[ejecución con agentes](../plans/2026-10-20-ejecucion-de-pendientes-con-agentes.md)).
La implementación exige revisión independiente de `reviewer-back` y
`security-privacy-auditor`. Las cuatro decisiones del final se consideran
aprobadas con el ADR; la persona usuaria puede objetarlas antes de producción.

## Fecha

2026-10-21

## Contexto

### El fallo (SP-01, alta)

Un autorregistro lo puede hacer cualquiera con un correo ajeno: quien registra
conoce la contraseña, no necesariamente el dueño del buzón. Por eso, al verificar
el correo, `api.verify_donor_email` marca `password_setup_required`
(`backend/supabase/migrations/20261013060000_donor_records.sql:256-262`) y el
dueño fija una contraseña nueva con un enlace de recuperación. El flujo de
`completePasswordReset`
(`backend/src/modules/identity-institutions/application/action-tokens-service.ts:153-176`)
consume el token, revoca sesiones, cambia la contraseña en Auth, llama a
`api.confirm_password_setup` (`…donor_records.sql:781-792`), que pone el flag en
`false`, y revoca otra vez.

Revocar borra filas de `auth.sessions` y sus refresh tokens
(`api.worker_revoke_sessions`, `20261013050000_action_tokens.sql:98-101`), pero
**no invalida los access tokens ya emitidos**: un JWT de Supabase vale hasta
600 s (ADR-004 punto 2) y PostgREST solo comprueba firma y caducidad. Ninguna
autorización de la base mira la sesión:

- `app.require` (`20261013000000_platform_base.sql:166-186`) solo comprueba
  `auth.uid()`, el rol de `app.user_accounts`, el AAL y el step-up.
- `app.d_require` (`20261013050000_action_tokens.sql:59-71`), el equivalente de
  las DEFINER, tampoco.
- Las políticas RLS se basan en `auth.uid()` o en `app.current_actor_role()`.

Así, quien registró el correo y guardó su JWT (o inició sesión directamente
contra Auth con la contraseña que conoce, sin pasar por Express) puede, en cuanto
`confirm_password_setup` levanta el bloqueo, llamar a
`api.complete_own_onboarding` (`…donor_records.sql:612-658`, cuyo único freno es
el flag de la línea 640) directamente en PostgREST y fijar nombre, grupo
sanguíneo y ubicación de la cuenta ajena. Durante el estado pendiente ese mismo
JWT ya puede, por ejemplo, crear solicitudes de corrección o eliminación
(`correction_requests_own_insert`, `20261020000000_privacy_requests.sql:80-82`).
Lo mismo vale para cualquier reset de contraseña: el JWT anterior sigue operando
hasta caducar.

### Restricciones

- Diseño exigido: barrera por generación/sesión capturada **antes** de llamar a
  Auth, aplicada en Express, en las RPC y en RLS; sin depender de `iat`; sin
  ampliar `service_role` (ADR-006).
- ADR-003: INVOKER + RLS por regla; toda DEFINER nueva entra en su allowlist y
  pasa por `security-privacy-auditor`; un comando atómico es una RPC; ninguna
  DEFINER nueva propiedad de `postgres` (`00_platform.test.sql:33-34` fija las
  cuatro existentes).
- Las migraciones aplicadas no se reescriben: todo va en una migración nueva con
  `create or replace function` (conserva propietario y `EXECUTE`) y
  `alter policy`.
- Sin cambios en `docs/openapi.json`: los códigos que se usan (401 en
  `createSession` y rutas protegidas, 503 en `completePasswordReset`) ya están en
  el contrato.

## Decisión propuesta

### 1. Modelo

Cada usuario puede tener una **barrera** con una generación entera y un estado
(`abierta` | `cerrada`). Un JWT solo autoriza si:

- el usuario **no tiene barrera** (compatibilidad: nadie la tiene hasta su primer
  reset tras desplegar), o
- la barrera está `cerrada` y el `session_id` del JWT figura como **sesión
  admitida en la generación actual**.

Se **abre** (generación + 1, se borran las admisiones del usuario) al consumir un
token de recuperación y al verificar un autorregistro que exige fijar contraseña.
Se **cierra** cuando el reset terminó del todo. Una sesión solo se **admite** en
el login de Express con un **ticket** emitido **antes** de llamar a
`signInWithPassword`, que captura la generación de ese momento. Si el ticket es
de otra generación, o se emitió con la barrera abierta, la sesión no se admite.

Por qué cierra el fallo, también ante emisión tardía:

| Caso | Resultado |
| --- | --- |
| JWT anterior al reset (el del atacante) | Su `session_id` no está admitido en la generación nueva: denegado aunque el JWT no haya caducado. |
| Sesión abierta directamente contra Auth (sin Express) | Nunca se admite: denegada. |
| Login con la contraseña vieja justo antes del cambio, admisión que llega tarde | Ticket de la generación anterior (o con barrera abierta): admisión rechazada. |
| Refresh de una sesión no admitida | Conserva el `session_id`: sigue denegada (el refresh nunca readmite). |
| Login tras el cierre | Exige la contraseña nueva; ticket de la generación vigente y cerrada: admitida. |
| Fallo a mitad del reset | La barrera queda abierta: nadie entra hasta que otro reset termine (falla cerrado). |

No se usa `iat`: tiene precisión de segundos, un refresh de una sesión superviviente
emite un `iat` nuevo y una comparación con la hora del cambio depende del reloj de
Auth y del orden de los pasos.

### 2. Migración nueva

`backend/supabase/migrations/20261022000000_session_barrier.sql`. Todas las
funciones con `set search_path = ''` y nombres calificados.

**Tablas** (`enable` + `force row level security`):

```sql
create table app.session_barriers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  generation int not null check (generation >= 1),
  state text not null check (state in ('abierta', 'cerrada')),
  updated_at timestamptz not null default now()
);
create table app.admitted_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  generation int not null,
  admitted_at timestamptz not null default now()
);
create index admitted_sessions_user_idx on app.admitted_sessions (user_id);
create table app.login_tickets (
  ticket_id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade, -- null si el correo no tiene cuenta
  generation int not null,            -- 0 = sin barrera
  barrier_open boolean not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index login_tickets_created_idx on app.login_tickets (created_at);
```

**Privilegios y RLS:**

- `app_privileged`: `select, insert, update, delete` en las tres y política
  `… for all to app_privileged using (true) with check (true)`.
- `authenticated`: solo `select (user_id, generation, state)` en
  `session_barriers` y `select (session_id, user_id, generation)` en
  `admitted_sessions`, con políticas `… for select to authenticated using
  (user_id = (select auth.uid()))`. Estas dos políticas **no** llaman a la
  barrera (evita recursión). Nada sobre `login_tickets`.

**Helpers nuevos** (INVOKER, `stable`):

```sql
-- Para INVOKER y RLS (rol authenticated). EXECUTE: authenticated.
create function app.session_admitted() returns boolean language sql stable set search_path = '' as $$
  select not exists (select 1 from app.session_barriers b where b.user_id = auth.uid())
      or exists (select 1 from app.session_barriers b
                 join app.admitted_sessions a on a.user_id = b.user_id and a.generation = b.generation
                 where b.user_id = auth.uid() and b.state = 'cerrada'
                   and a.session_id::text = lower(coalesce(auth.jwt() ->> 'session_id', '')))
$$;
-- Mismo cuerpo con app.jwt_sub() y app.jwt_claims() ->> 'session_id'. EXECUTE: app_privileged.
create function app.d_session_admitted() returns boolean …;
-- Abre la barrera (EXECUTE solo app_privileged; se usa dentro de DEFINER).
create function app.open_session_barrier(p_user_id uuid) returns int language plpgsql set search_path = '' as $$
declare v_generation int;
begin
  perform pg_advisory_xact_lock(hashtextextended('session-barrier:' || p_user_id::text, 0));
  insert into app.session_barriers (user_id, generation, state) values (p_user_id, 1, 'abierta')
  on conflict (user_id) do update set generation = app.session_barriers.generation + 1, state = 'abierta', updated_at = now()
  returning generation into v_generation;
  delete from app.admitted_sessions where user_id = p_user_id;
  perform app.d_audit('sesion.barrera_abierta', 'user', p_user_id, 'sistema');
  return v_generation;
end;
$$;
```

La comparación por texto evita un `::uuid` que fallaría con un claim mal formado:
un `session_id` ausente o raro simplemente no coincide.

**RPC nuevas** (DEFINER propiedad de `app_privileged`, `EXECUTE` a
`authenticated`, solo la sesión técnica: `jwt_sub` no nulo y
`app.is_api_technical()`, si no `unauthenticated`/`forbidden`):

| Función | Comportamiento |
| --- | --- |
| `api.issue_login_ticket(p_email text)` | Valida forma del correo (`invalid`). Borra tickets con `created_at < now() - 10 min`. `v_user := app.user_id_by_email(lower(btrim(p_email)))`; lee la barrera (sin fila = generación 0, cerrada); inserta el ticket. Responde siempre `{kind: ok, ticketId}`, exista o no la cuenta. |
| `api.admit_session(p_ticket_id uuid, p_user_id uuid, p_session_id uuid)` | Toma el ticket `for update`. Si no existe, está consumido, tiene más de 2 min o su `user_id` difiere de `p_user_id` → `conflict`. Lo marca consumido. Toma el advisory lock del usuario y relee la barrera. Rechaza (`conflict`) si `ticket.barrier_open`, si la barrera está abierta o si `ticket.generation` difiere de la actual. Si no hay barrera (y el ticket era de generación 0) → `ok` sin insertar. Si no, inserta `(p_session_id, p_user_id, generación)` `on conflict do nothing` → `ok`. |
| `api.close_session_barrier(p_user_id uuid, p_generation int)` | Advisory lock del usuario; `update … set state = 'cerrada' where user_id = p_user_id and generation = p_generation and state = 'abierta'`. Si actualizó: audita `sesion.barrera_cerrada` y `ok`; si la fila ya está cerrada en esa generación → `ok` (reintento); si la generación avanzó → `conflict`. |

Todo `conflict` de `admit_session` es el mismo código, sin distinguir el motivo.

**Funciones existentes redefinidas** (`create or replace`, cuerpo actual más la
línea indicada):

| Función | Cambio |
| --- | --- |
| `app.require` | Tras el `auth.uid() is null`: `if not app.session_admitted() then return 'unauthenticated'; end if;` |
| `app.d_require` | Tras el `app.jwt_sub() is null`: `if not app.d_session_admitted() then return 'unauthenticated'; end if;` |
| `app.current_actor_role()` | `… where ua.user_id = auth.uid() and app.session_admitted()`. Arrastra `api.current_actor`, `app.admin_hospital_id()` y todas las políticas basadas en el rol. |
| `api.consume_password_reset` | Tras marcar el token consumido: `v_generation := app.open_session_barrier(v_token.subject_id);` y la respuesta pasa a `{kind: ok, userId, generation}`. |
| `api.verify_donor_email` | Tras el `update … returning`: si `v_profile.password_setup_required` es verdadero, `perform app.open_session_barrier(v_token.subject_id);`. Respuesta sin cambios. |

**Políticas que solo usaban `auth.uid()`** (`alter policy`, misma expresión más
`and (select app.session_admitted())`):

- `user_accounts_own_select` (`platform_base.sql:312`): con ella `api.current_actor`
  devuelve `null` para una sesión no admitida.
- `memberships_own_select` (`identity_institutions.sql:161`): arrastra
  `app.member_hospital_id()` y por tanto `hospitals_member_select` y
  `sites_member_select`.
- `audit_events_own_insert` (`platform_base.sql:324`, `with check`).
- `idempotency_own` (`platform_base.sql:331`, `using` y `with check`).

Quedan cubiertas sin tocarlas, porque llaman a `app.current_actor_role()`,
`app.admin_hospital_id()` o `app.member_hospital_id()`: `donor_profiles_own_*`,
`assisted_signups_admin_select`, `needs_admin_*`, `hospitals_*`, `sites_*`,
`memberships_superadmin_*`, `configuration_superadmin_*`,
`audit_events_superadmin_select`, `correction_requests_*` y `access_grants_*`.
Una prueba debe demostrarlo tabla por tabla, no darlo por supuesto.

**Datos** (misma migración): las cuentas que hoy esperan fijar contraseña quedan
detrás de una barrera abierta, igual que con la verificación nueva:

```sql
insert into app.session_barriers (user_id, generation, state)
select donor_id, 1, 'abierta' from app.donor_profiles where password_setup_required
on conflict (user_id) do nothing;
```

**Orden de bloqueos:** `consume_password_reset` y `verify_donor_email` toman
primero sus filas (token, perfil) y después el advisory lock de la barrera;
`admit_session` toma el ticket y después el advisory lock; `close_session_barrier`
solo el advisory lock. Ninguna toma filas de tokens o perfiles después del
advisory lock, así que no hay ciclos.

**Fuera de alcance, justificado:** `api.link_admin_account` usa `app.jwt_sub()`
sin `d_require`, pero su llamador es una cuenta de Auth nueva sin cuenta de
aplicación, y las barreras solo se abren para cuentas con cuenta de aplicación
(la recuperación excluye las demás). Las DEFINER técnicas (`is_api_technical`,
`is_worker`) no cambian: esas identidades nunca pasan por la recuperación.

### 3. Express

| Archivo | Cambio |
| --- | --- |
| `backend/src/modules/identity-institutions/application/action-tokens.ports.ts` | `consumePasswordReset` devuelve `{ userId, generation }`; nuevo `closeSessionBarrier(userId, generation): Promise<'ok' \| 'conflict'>`. |
| `…/infrastructure/action-tokens-rpc-gateway.ts` | `closedRecord(reply, ['kind', 'userId', 'generation'])` con `generation` entero ≥ 1; nueva llamada técnica a `close_session_barrier` con `okKinds: ['ok', 'conflict']`. |
| `…/application/action-tokens-service.ts` (`completePasswordReset`) | Tras la revocación final con éxito **y** sin `hookFailed`: `closeSessionBarrier(userId, generation)` con un reintento; si falla dos veces → `SERVICE_UNAVAILABLE`. `conflict` (un reset posterior ya abrió otra generación) se trata como éxito de esta operación. Si la revocación o el hook fallaron, **no** se cierra: la barrera sigue abierta y el usuario pide otro enlace. |
| Puerto nuevo `SessionAdmission` en `…/application/identity.ports.ts` y adaptador `…/infrastructure/session-admission-rpc-gateway.ts` (invocador técnico existente) | `issueLoginTicket(email): Promise<string>` y `admitSession(ticketId, userId, sessionId): Promise<boolean>`. |
| `…/application/auth-service.ts` (`attemptLogin`) | Después de cuotas y límites y **antes** de `sessions.signIn`: `ticket = issueLoginTicket(email normalizado)`. Tras `signIn`: obtener `userId` y `sessionId` **verificando** el access token con el `SessionVerifier` del middleware (nunca decodificar sin verificar). Si no hay claims o `admitSession` devuelve `false`: `sessions.signOut(accessToken, 'local')` y `AUTHENTICATION_REQUIRED`, con el mismo suelo de tiempo del 401. Después sigue igual (`currentActor`, idempotencia, MFA). |
| `backend/src/composition.ts` | Cablear el gateway nuevo en `auth-service`. |

El middleware `authenticate` no cambia: resuelve el actor en cada petición con
`api.current_actor`, que ahora devuelve `null` para una sesión no admitida; sin
principal, toda ruta protegida responde 401 (también MFA, step-up y las que hablan
con Auth con el token del usuario). El refresh conserva el `session_id` y nunca
pasa por `admitSession`. El logout sigue funcionando con una sesión no admitida.

`signUp` (registro y alta asistida) no pasa por el ticket: crea usuarios sin
barrera, y la primera barrera que se abra invalida esas sesiones de todos modos.
Las sesiones técnicas (`api_technical`, `worker`) no tienen barrera.

### 4. Pruebas RED que validan la decisión

Todas deben fallar en el HEAD actual (o no compilar por falta de la función) y
pasar con la implementación. Datos sintéticos `.example.test`.

**pgTAP**, `backend/supabase/tests/database/10_session_barrier.test.sql` (claims
fijados con `set local request.jwt.claims`):

1. Usuario U con sesión S1. Como técnica: `consume_password_reset`,
   `confirm_password_setup` y `close_session_barrier`. Con los claims de S1,
   `api.complete_own_onboarding` devuelve `unauthenticated` (hoy `ok`).
2. Con S1: `select` directo en `app.donor_profiles`, `app.user_accounts`,
   `app.hospital_memberships` y `app.correction_requests` devuelve 0 filas;
   `update` de `app.donor_profiles` e `insert` en `app.correction_requests`,
   `app.audit_events` y `app.idempotency_records` se rechazan.
3. Con S1, `api.current_actor()` devuelve `null`.
4. Admin con barrera y sesión no admitida: `api.create_assisted_signup` (camino
   `d_require`) devuelve `unauthenticated`; `api.list_own_needs` (camino
   `require`), también.
5. Ticket emitido después del cierre y S2 admitida: `complete_own_onboarding`
   devuelve `ok`.
6. Emisión tardía: ticket emitido antes de `consume_password_reset` y admisión
   después del cierre → `conflict`.
7. Ticket emitido con la barrera abierta → `conflict` aunque después se cierre.
8. Barrera abierta sin cierre (el reset falló): ningún ticket admite y toda RPC
   devuelve `unauthenticated`.
9. `verify_donor_email` que activa `password_setup_required` abre la barrera: la
   sesión del registrante recibe `unauthenticated` en
   `api.create_own_correction_request`.
10. Usuario sin barrera: sus sesiones siguen funcionando (regresión de
    compatibilidad).
11. `session_id` ausente o mal formado con barrera cerrada → denegado, sin error
    SQL.
12. Privilegios: un donante o admin normal recibe `forbidden` en las tres RPC
    nuevas; `anon` no las ejecuta; `authenticated` no ve barreras ni admisiones
    ajenas, no escribe en ninguna de las tres tablas y no lee `login_tickets`.
    Las DEFINER nuevas son de `app_privileged` y la lista de DEFINER de `postgres`
    sigue en cuatro.
13. Ticket ajeno (`user_id` distinto), reutilizado o con más de 2 min → `conflict`.

Actualizar `05_action_tokens.test.sql` y `06_donor_records.test.sql` a la
respuesta nueva de `consume_password_reset`.

**Unitarias (vitest):**

- `action-tokens-service.test.ts`: `closeSessionBarrier` se llama después de la
  segunda revocación con la generación recibida; si la revocación final o el hook
  fallan no se llama y responde 503; cierre fallido dos veces → 503; `conflict` →
  éxito.
- `auth-service.test.ts`: el ticket se emite antes de `signIn` (orden de
  llamadas); admisión rechazada → `signOut(…, 'local')` y 401 con suelo de
  tiempo; claims inválidos → 401; fallo del ticket → 503 sin llamar a `signIn`.
- `action-tokens-rpc-gateway.test.ts` y el test del gateway nuevo: respuestas
  cerradas, `generation` no entera rechazada.

**Integración real** (`backend/test/integration/session-barrier.integration.ts`,
Supabase local; ejecutar con vitest directo para no resetear, como EQ1):

- Registro con correo de la víctima, se guarda el access token del registrante;
  verificación; reset por HTTP. Con ese token, `POST /rest/v1/rpc/complete_own_onboarding`
  directo a PostgREST devuelve `kind: unauthenticated`, y las rutas protegidas de
  Express con su cookie responden 401. El dueño inicia sesión y completa el perfil.
- Sesión creada con `signInWithPassword` directo contra Auth: denegada.
- Concurrencia con dos conexiones (`test/support/psql-session.ts`): `admit_session`
  esperando el advisory lock mientras `consume_password_reset` lo tiene (barrera
  comprobada con `pg_blocking_pids`, sin `sleep`) → `conflict`.
- Refresh y verificación MFA de una sesión admitida conservan el `session_id` y
  siguen autorizadas (confirma el supuesto S1).

**Bruno CLI** contra el backend real (`bruno/backend/**`): escenario
reset → cookie anterior → 401 → login nuevo → 200.

## Alternativas consideradas

| Opción | Por qué no |
| --- | --- |
| Comparar `iat` con la hora del cambio de contraseña | Prohibido por el encargo; precisión de segundos, carreras con el reloj de Auth y un refresh emite un `iat` nuevo. |
| Comprobar en cada petición que la sesión sigue en `auth.sessions` | Exige una DEFINER nueva propiedad de `postgres` en el camino de cada política RLS, acopla la base al esquema interno de GoTrue y depende de que la revocación haya funcionado: si falla, el acceso sigue. La barrera falla cerrada. |
| Verificar la sesión solo en Express (`getUser` o `session_not_found`) | Deja abierto el acceso directo a PostgREST, que es justo el del fallo. |
| Bajar `jwt_expiry` | Reduce la ventana, no la cierra. |
| Rotar el secreto JWT | Expulsa a todos los usuarios y no es por usuario. |
| Lista de sesiones revocadas | Para conocer las sesiones anteriores hay que leer `auth.sessions` (nueva excepción de `postgres`), y una sesión creada directamente contra Auth en plena carrera se escapa. |

## Consecuencias

- Positivas: un reset corta de inmediato todo JWT anterior en Express, RPC y RLS;
  cubre el acceso directo a PostgREST y las sesiones abiertas fuera de Express; no
  usa `service_role` ni crea DEFINER de `postgres`.
- Costes: dos RPC técnicas más por login; una búsqueda por clave primaria en cada
  `require` y en las políticas (el `(select …)` la evalúa una vez por consulta).
- Una cuenta con barrera solo opera con sesiones creadas por el login de Express.
- Durante el estado pendiente el dueño legítimo tampoco puede iniciar sesión
  (401) hasta fijar la contraseña. Ya era el flujo previsto; F9 deberá explicarlo
  en la interfaz.
- Un reset fallido deja la cuenta bloqueada hasta completar otro (falla cerrado).
- `app.admitted_sessions` crece una fila por login de usuarios con barrera; se
  vacía al abrir otra barrera o al borrar el usuario. Purga por antigüedad
  diferida (ver riesgos).
- Al aceptarse, se actualizan en la misma unidad: ADR-003 (nuevo ítem 12 de la
  allowlist DEFINER con las tres RPC), ADR-004 punto 2 y la consecuencia de
  ADR-006 sobre los JWT de 600 s (remiten a este ADR), `docs/Backend-Contracts.md`
  y el inventario de SP-01 en los planes. ADR-006 no cambia.

### Compatibilidad con migraciones aplicadas

- Solo hay una migración nueva. `create or replace` conserva el propietario
  (`app_privileged` o `postgres`) y los `EXECUTE` de las funciones redefinidas;
  `alter policy` cambia la expresión sin recrear la política.
- Los usuarios sin barrera no notan nada: no hay re-login global. Solo las cuentas
  con `password_setup_required = true` al migrar quedan con barrera abierta.
- La respuesta de `consume_password_reset` gana `generation` y el gateway actual
  la rechazaría (`closedRecord`): migración y código van en el mismo commit y
  despliegue. No hay producción, así que no hace falta una ventana compatible.
- Marcha atrás: solo hacia delante. Una migración posterior que redefina
  `require`, `d_require`, `current_actor_role`, `consume_password_reset` y
  `verify_donor_email` sin la barrera y devuelva las cuatro políticas a su
  expresión anterior; las tablas pueden quedarse.

## Riesgos y supuestos no verificados

- S1: GoTrue conserva el `session_id` al refrescar y al subir a AAL2 con MFA. Lo
  verifica la prueba de integración; si fallara, la verificación MFA tendría que
  readmitir con ticket.
- S2: todos los access tokens de usuario llevan `session_id` (`parseClaims` ya lo
  exige en Express).
- S3: `signOut(…, 'local')` funciona con una sesión no admitida (es una llamada a
  Auth, no a la base).
- La purga de `admitted_sessions` y de `login_tickets` (fuera de la limpieza que
  hace `issue_login_ticket`) no entra en `worker_purge_expired`; añadirla con la
  retención que se decida para sesiones (hoy `inactivity_timeout = 12h`, sin
  límite total).
- Cambio de correo (B3) y otros cambios de credenciales pueden reutilizar la
  barrera (abrir antes y cerrar después de Auth); no forma parte de esta decisión.
- `link_admin_account` queda fuera (ver §2); si algún día una cuenta con
  barrera pudiera llegar ahí, hay que añadir `d_session_admitted`.

## Decisión requerida de la persona usuaria

1. ¿Se acepta este ADR tal como está (tablas, helpers, tres RPC técnicas nuevas,
   las cinco funciones redefinidas y las cuatro políticas alteradas)?
2. ¿Se acepta que `verify_donor_email` abra la barrera, es decir, que una cuenta
   pendiente de fijar contraseña no opere con ninguna sesión (tampoco la del
   dueño) hasta completar el reset?
3. ¿Se acepta que el login rechazado por la barrera responda 401 (sin cambiar el
   contrato) y que un reset fallido deje la cuenta bloqueada hasta otro reset?
4. ¿Se autoriza ampliar la allowlist DEFINER de ADR-003 con
   `api.issue_login_ticket`, `api.admit_session` y `api.close_session_barrier`?

Con el sí, la implementación va a `backend-data-engineer` (migración y pgTAP) y a
`dev-back` (Express), con `reviewer-back`, `security-privacy-auditor` y QA en
cada slice. Mientras tanto SP-01 sigue abierto y F6 bloqueada.

# Plan del módulo F3: need-records (necesidades del hospital)

| Campo | Valor |
| --- | --- |
| Estado | Cerrado el 2026-10-13 bajo la autonomía concedida por la persona usuaria (ver §8) |
| Fecha | 2026-10-13 |
| Rama | `feat/backend-developing` |
| Especificación | `docs/plans/2026-10-12-especificacion-faltante-backend.md` §6 F3 y `docs/Need-Draft-Application-Spec.md` (V1) |
| Requisitos | V1 (aceptar la spec A2) y V8 (huecos de estado), aceptados por la persona usuaria el 2026-10-12 |
| Gate | `reviewer-back` más `security-privacy-auditor` (toca RLS) |

## 1. Operaciones

| Operación | Ruta | Estado |
| --- | --- | --- |
| `createHospitalNeed` | `POST /api/v1/hospitals/me/needs` | ya ratificada (2026-10-04); implementada |
| `listOwnHospitalNeeds` | `GET /api/v1/hospitals/me/needs` | ratificada el 2026-10-13 |
| `getOwnHospitalNeed` | `GET /api/v1/hospitals/me/needs/{needId}` | ratificada el 2026-10-13 |
| `transitionOwnHospitalNeed` | `PATCH /api/v1/hospitals/me/needs/{needId}` | ratificada el 2026-10-13 |

Las cuatro exigen sesión, rol `admin_hospitalario`, AAL2, membresía activa y hospital
autorizado. Las dos mutaciones exigen además `Origin`, CSRF e `Idempotency-Key`.

## 2. Qué se construyó

- **Migración** `20261013030000_need_records.sql`: tabla `app.needs` con RLS habilitada y
  forzada, políticas por hospital (`app.admin_hospital_id()`), privilegios por columna
  (insert y update acotados), clave foránea compuesta `(site_id, hospital_id)` y las RPC
  `api.create_need_draft`, `api.list_own_needs`, `api.get_own_need` y
  `api.transition_own_need`, todas `SECURITY INVOKER`. Ninguna es invocable por `anon`.
- **Dominio** (`domain/`): `need-draft.ts` (spec A2 §3.1) y `need-state.ts` (matriz C-8,
  `isTerminal`, `projectStatus` con precisión de microsegundos y
  `evaluateManualTransition`).
- **Aplicación** (`application/`): `create-need-draft(.ports).ts` (spec A2 §3.2–§4, con
  validación cerrada de la respuesta del puerto), `needs.ports.ts` y `needs-service.ts`.
- **Infraestructura**: `needs-rpc-gateway.ts` (guards cerrados, `toDraftReply`, creación
  ligada al JWT del actor, sin `service_role`).
- **HTTP**: `needs.router.ts` delgado.
- **Compartido**: `shared/http/route-helpers.ts` y `shared/persistence/page.ts` (guards,
  paginación y `parse` que antes vivían dentro de `identity-institutions`).
- **Contrato**: tres operaciones ratificadas y 429/503 declarados en las cuatro (ver §3).
- **Bruno**: `bruno/backend/need-records/hospital` contra el backend real y C-10 en los
  escenarios del mock.

## 3. Decisiones y desviaciones a documentar

- **D-1 (ratificado el 2026-10-13): catálogo de errores de `createHospitalNeed`.** La spec y
  `Backend-Contracts.md` fijaban «400/401/403/409/422/500, sin 404 ni 429». Pero los
  middlewares globales de `/api` pueden responder 429 (límite de renovación de sesión) y
  503 (base o Auth no disponibles) en cualquier ruta, incluida esta, y la prueba de
  integración falla si el backend devuelve un estado no declarado. Se declararon 429 y 503
  en el POST, igual que en las 21 operaciones de F2a que aprobaste. Esto obligó a ampliar
  `ERROR_STATUSES` en `scripts/generate-api-contract.mjs` y su prueba. Si lo rechazas,
  habría que mapear 429/503 a otra respuesta solo en esta ruta.
- **D-2: 503 en vez de 500.** La spec A2 dice que un `throw` del puerto atómico produce un
  error genérico. Aquí solo la indisponibilidad de la persistencia
  (`PersistenceUnavailableError`) se propaga para responder 503, coherente con el resto del
  backend; cualquier otro fallo es `INTERNAL_ERROR`.
- **D-3: gateway sin invocador.** La creación llama a la RPC sin pasar por `RpcInvoker`
  porque el servicio de la spec A2 interpreta los `kind` (`site_unusable`, `forbidden`…);
  el invocador convertiría esos fallos en excepciones. `toDraftReply` traduce la respuesta
  de SQL al protocolo de la spec (`mfa_required` equivale a `forbidden`; `invalid`,
  `conflict` y similares equivalen a `failed` = 500).
- **D-4: orden de la creación en SQL.** Validar y recalcular el hash → `peek` de
  idempotencia (replay o conflicto) → comprobar la sede → `claim` → insertar. Así un
  rechazo por sede no deja registro de idempotencia y el replay de una creación previa
  sigue valiendo si la sede se desactivó después (decisión sobre la apertura de spec A2 §7).
  No se bloquea la fila de la sede: `FOR SHARE` exige una política de update que el admin
  no tiene. La carrera con una desactivación simultánea sigue abierta (ni la política de
  inserción, que evalúa su `exists` con el snapshot del statement, ni la clave foránea
  compuesta, que solo impide una sede de otro hospital, la cierran). Queda como pendiente:
  cuando F2b permita desactivar sedes, serializar con `pg_advisory_xact_lock(site_id)` en
  ambos lados o con una función DEFINER mínima. Mitigación parcial: activar exige que la
  sede siga vigente (D-12).
- **D-5: el cursor manipulado es 400**, igual que en los listados de F2a, no 422.
- **D-6: orden del listado**: más recientes primero (`created_at` y `need_id`
  descendentes). La spec no fijaba el orden.
- **D-7: el UUID de la sede se conserva literal.** SQL recibe `p_site_id` como texto para
  que el hash use el valor tal cual (spec A2 §7); el `needId` de la transición se normaliza
  a minúsculas antes de calcular el hash porque la RPC lo recibe como `uuid`.
- **D-8: Bruno separado.** Como en F2a, los escenarios contra el backend real viven en
  `bruno/backend/need-records/` y no reutilizan `bruno/scenarios/` (aserciones del mock).
  C-10 sí se aplicó a `05_create_need` y `08_replay_create_need` del mock. El runner ya no
  reutiliza la ventana TOTP de un usuario entre escenarios.
- **D-9: refactor compartido.** Para no importar de otro módulo se movieron a `shared/` los
  helpers de rutas y paginación de `identity-institutions` (sin cambio de comportamiento;
  las 40 pruebas de integración de F2a siguen en verde).
- **D-10: `confirmedIntentCount` vale 0** hasta F6; entonces se reemplaza `app.need_json`.
- **D-12 (hallazgos de la primera ronda): endurecimiento.** (a) Activar un borrador exige
  sede activa y aprobada (409 si no). (b) El replay de la creación no se entrega si el
  hospital guardado difiere del actual (`forbidden`). (c) Tope de creación por actor: 60 por hora (la persona usuaria lo fijó en 60 el 2026-10-13; antes 30), contado sobre las necesidades realmente creadas
  (`created_by` y `created_at` en la última hora) dentro de la RPC, que cubre al llamador
  directo de PostgREST. Se evaluó primero un contador con `api.consume_rate_limit`, pero un
  tercero que conozca el UUID de un admin podría llenar su cupo (el sujeto es un hash sin
  secreto y el límite lo elige el llamador) y las ráfagas concurrentes con la misma clave
  gastaban cupo de más (segunda revisión, M1 y M2); contar filas reales evita ambos. Va después
  de `peek` y antes de `claim`, de modo que los replays no consumen cupo y una respuesta
  `rate_limited` no deja la clave «en curso»; responde 429 `RATE_LIMITED` (sin `Retry-After`).
  Las transiciones no necesitan tope propio: cada necesidad admite como máximo dos. Se añadió
  `RATE_LIMITED` a `NeedDraftFailureCode` y `rate_limited` a los fallos comunes de RPC. El 30
  es una decisión mía; ajústalo si prefieres otro. (d) Las RPC validan la
  longitud de `p_key` (16–255) y responden `invalid`, no una excepción.
- **D-13: formas de UUID.** `format: uuid` admite `urn:uuid:…`, que la base rechaza (500).
  El validador genérico de contrato ahora solo acepta la forma canónica (también beneficia a
  las rutas con UUID de F2a, que tenían el mismo defecto) y el POST valida la sede en el servicio. El casing: la
  base devuelve el UUID en minúsculas aunque el cliente lo haya enviado en mayúsculas; el
  servicio compara sin distinguir mayúsculas y el hash sigue usando el literal, de modo que
  otro casing con la misma clave es un conflicto (409), no una necesidad nueva.
- **D-14: dependencias.** `fingerprint` pasó a `shared/crypto` y la comprobación de UUID canónico a
  `shared/validation/uuid.ts`; la aplicación solo importa de `shared/http` el parser puro de la clave
  de idempotencia. `domain/need-state.ts` es un oráculo del comportamiento de SQL: la
  lógica real vive en la RPC y la deriva se detecta en la prueba de integración de la matriz
  (que ahora compara con una tabla literal independiente y con el dominio).
- **D-11: la transición no tiene cascada** (invitaciones y outbox): llega en F6 con un
  `create or replace` de `api.transition_own_need`.

## 4. Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | verde |
| `npm test` | verde (451 pruebas del backend, más mock y web) |
| `npm run test:backend:db` | 201 pruebas pgTAP en verde (101 de `03_need_records`) |
| `npm run test:backend:integration` | 104 pruebas en verde (62 de `need-records`: rol × AAL × hospital, IDOR, 20 concurrentes, rollback, matriz C-8 con tabla literal y dimensión vencido, tope de creación, canarios) |
| `npm run test:bruno:backend` | 21 solicitudes y 23 pruebas de `need-records` en verde, más platform, hospital y superadmin de F2a |
| `npm run test:bruno` (mock) | verde tras C-10 |
| `npm run test:contract` | 72 pruebas en verde (365 errores y 470 casos) |
| `npm run openapi:lint`, `openapi:api:check`, generador | verdes |

## 5. Revisiones independientes

Primera ronda (2026-10-13), subagentes de contexto separado, solo lectura, sobre
`b81d06a..HEAD`:

- `reviewer-back`: **FAIL** (dos mayores). 1) Un `siteId` con letras en mayúsculas creaba la
  fila y la respuesta era 500 (la base devuelve minúsculas y el servicio comparaba literal;
  el reintento con la misma clave repetía el 500). 2) El replay de la creación no revalidaba
  el hospital en SQL. Menores: `urn:uuid:` daba 500, una prueba de integración era vacía (los
  UUID de siembra no tienen letras), la matriz C-8 comparaba contra el propio dominio,
  cobertura faltante, dependencias de la aplicación hacia `shared/http`, redacción inexacta
  de D-4 y un paréntesis residual en `x-ratification`.
- `security-privacy-auditor`: **PASS condicionado** (sin críticos ni altos). Medios: no hay
  tope de creación por actor ni de necesidades abiertas, y `borrador → activa` no revalidaba
  la sede. Bajos: replay con hospital distinto, longitud de `p_key` sin validar en SQL,
  auditoría solo de éxitos, sin retención de `idempotency_records`, huecos de pgTAP.

Correcciones: ver D-12, D-13 y D-14, más 14 pruebas pgTAP nuevas, 7 de integración nuevas
(letras en el UUID con replay y otro casing, `urn:uuid:`, replay tras revocación, tope de
creación y de transición, desempate por `created_at` idéntico, dimensión «vencido» y tabla
literal en la matriz C-8, activación con sede desactivada) y pruebas unitarias.

Segunda ronda (2026-10-13), `reviewer-back` nuevo, enfocada en las correcciones
(`423df7b..HEAD`): **PASS (acotado)**, sin bloqueantes ni mayores nuevos. Confirmó resueltos
los dos mayores y el orden `peek → sede → tope → claim`; no ejecutó pgTAP, integración ni
Bruno (esos resultados son míos). Observaciones: M1 contadores envenenables y M2 sobreconsumo
concurrente (corregidos al contar filas reales, ver D-12), M3 sin `Retry-After` (pendiente), M4
pruebas de revocación y de tasa mejorables (el replay entre hospitales solo lo cubre pgTAP;
ahora hay una prueba concurrente de cupo), M5 documentación y `PLAIN_UUID` duplicado
(corregidos), M6 la spec y `Backend-Contracts.md:213` dicen «sin 429» (actualizado el segundo;
la spec es documento de la persona usuaria y se ajusta si apruebas D-1), M7 las rutas de F2a
con UUID tenían el mismo defecto `urn:uuid:` (corregido en el validador genérico).

Las correcciones posteriores a esa segunda ronda (tope por filas reales y UUID estricto en el
validador) no las ha visto un revisor independiente. El `security-privacy-auditor` dio PASS
condicionado en la primera ronda y no se ha vuelto a ejecutar.

## 6. Pendientes conocidos

- Carrera entre una creación y la desactivación simultánea de la sede (D-4).
- ~~Auditoría solo de éxitos~~ Resuelto el 2026-10-13 (decisión 6): las respuestas 403, 409 y 429 a un actor
  autenticado dejan un evento `denegacion.*` (ver «Auditoría de denegaciones» en `Backend-Contracts.md`).
- Retención de `idempotency_records` (su `response` conserva grupo, sede y plazo): purga con
  el worker, ya pendiente desde F2a.
- Tope de necesidades abiertas por hospital (además del de creación por hora): decisión de
  producto para F6.
- ~~`Retry-After` en el 429 de estas rutas.~~ Resuelto el 2026-10-13: el manejador central lo añade a todo 429.
- La cascada de la transición (invitaciones y outbox) y `confirmedIntentCount` real: F6.
- El barrido que marca como `vencida` en la tabla (hoy solo se proyecta): worker, F6/F7.
- `listOwnNeedResponses` sigue en borrador (F6).

## 7. Bitácora

- 2026-10-13: primera ronda de revisión (reviewer-back FAIL, seguridad PASS condicionado) y remediación.
- 2026-10-13: ratificación de las tres operaciones, dominio, aplicación, migración,
  pgTAP, gateway, router, integración y Bruno contra el backend real.

## 8. Cierre

El 2026-10-13 la persona usuaria pidió trabajar de forma autónoma hasta completar el backend,
dejando sin implementar lo que no me corresponda decidir. Con esa instrucción se cierra F3 sin
una aprobación explícita del módulo. La persona usuaria ratificó después D-1 (429 y 503 declarados en
`createHospitalNeed`) y fijó el tope de creación en 60 por hora; ver `2026-10-13-decisiones-backend.md`. Siguen abiertos
los pendientes de §6. Revisiones: `reviewer-back`
FAIL → PASS acotado (dos rondas) y `security-privacy-auditor` PASS condicionado (una ronda);
las correcciones posteriores a la segunda ronda no las ha visto un revisor independiente.

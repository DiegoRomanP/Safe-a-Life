# Plan del módulo F3: need-records (necesidades del hospital)

| Campo | Valor |
| --- | --- |
| Estado | Implementado; revisiones independientes pendientes; cierre sin aprobar |
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

- **D-1 (necesita tu aprobación): catálogo de errores de `createHospitalNeed`.** La spec y
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
  No se bloquea la fila de la sede (`FOR SHARE` exige una política de update que el admin
  no tiene): la ventana de una carrera con una desactivación simultánea queda acotada por
  la política de inserción y la clave foránea compuesta, y se acepta.
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
- **D-11: la transición no tiene cascada** (invitaciones y outbox): llega en F6 con un
  `create or replace` de `api.transition_own_need`.

## 4. Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | verde |
| `npm test` | verde (447 pruebas del backend, más mock y web) |
| `npm run test:backend:db` | 188 pruebas pgTAP en verde (88 de `03_need_records`) |
| `npm run test:backend:integration` | 97 pruebas en verde (55 de `need-records`, incluida la paridad de la matriz C-8 con el dominio y el control de estados declarados) |
| `npm run test:bruno:backend` | 21 solicitudes y 23 pruebas de `need-records` en verde, más las de F2a |
| `npm run test:bruno` (mock) | verde tras C-10 |
| `npm run test:contract` | 72 pruebas en verde (365 errores y 470 casos) |
| `npm run openapi:lint`, `openapi:api:check`, generador | verdes |

## 5. Revisiones independientes

Pendientes. No se afirma ningún PASS hasta que ocurra.

## 6. Pendientes conocidos

- Carrera entre una creación y la desactivación simultánea de la sede (D-4).
- La cascada de la transición (invitaciones y outbox) y `confirmedIntentCount` real: F6.
- El barrido que marca como `vencida` en la tabla (hoy solo se proyecta): worker, F6/F7.
- `listOwnNeedResponses` sigue en borrador (F6).

## 7. Bitácora

- 2026-10-13: ratificación de las tres operaciones, dominio, aplicación, migración,
  pgTAP, gateway, router, integración y Bruno contra el backend real.

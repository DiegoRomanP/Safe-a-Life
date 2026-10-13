# Contrato backend ratificado: crear necesidad en borrador

| Campo | Valor |
| --- | --- |
| Estado | Contrato de `createHospitalNeed` ratificado; DTO y validación runtime existen; endpoint HTTP productivo de esta operación aún no implementado |
| Fecha | 2026-10-04 |
| Alcance | Solo `POST /api/v1/hospitals/me/needs`; el inventario OpenAPI global permanece en borrador |
| Fuentes | [`openapi.json`](openapi.json), [`Api-Rules.md`](Api-Rules.md), [`1_Primeros_Alcances.md`](1_Primeros_Alcances.md) v1.2 y decisión T3 en [`plans/2026-10-04-backend-inside-out.md`](plans/2026-10-04-backend-inside-out.md) |

Este documento fija el contrato y la aceptación futura de `createHospitalNeed`;
no aprueba las operaciones vecinas ni reemplaza la línea base funcional. El
workspace `backend` contiene los DTO y su validación runtime, además de la
plataforma HTTP (`src/server.ts` + `createApp`, configuración validada y
utilidades compartidas), pero todavía no registra ninguna ruta de negocio ni la
capa de aplicación/persistencia descrita aquí. El scaffold legacy
(`backend/index.js`, `backend/config/`) ya fue retirado. La salida es un DTO
proyectado, no una entidad o fila de persistencia. Se usan únicamente
identificadores y datos sintéticos.

## DTO implementado y fuente canónica

- Los cuatro archivos del slice viven en
  `backend/src/modules/need-records/dto/`: `validators.ts`,
  `validators.test.ts`, `openapi.ts` y `contract.generated.json`.
- `validators.ts` expone `parseCreateNeedInput` y
  `parseCreatedNeedEnvelope`. Valida los DTO en runtime con AJV 2020 y formatos;
  rechaza forma/campos inválidos, no convierte tipos y normaliza a `10` el
  `radiusKm` omitido. La validación de salida devuelve una proyección cerrada.
  Solo valida el contrato declarado: no verifica grupo, elegibilidad ni seguridad
  clínica. Este módulo no monta rutas Express ni accede a repositorios, Supabase o
  Resend.
- `docs/openapi.json` sigue siendo la única fuente contractual. El generador en
  `scripts/generate-api-contract.mjs` produce los tipos `openapi.ts` de backend,
  web y mock, además del snapshot `contract.generated.json` del DTO backend.
  Editar esos artefactos a mano no sustituye al contrato canónico.
- Instalar dependencias solo desde la raíz con `npm ci`; el único lock activo es
  el `package-lock.json` raíz. `backend` es un workspace npm, no una instalación
  independiente. Sus pins directos exactos se mantienen en `backend/package.json`
  y el lock raíz, sin upgrades para este traslado.

Comandos de referencia, ejecutados desde la raíz:

| Comando | Alcance |
| --- | --- |
| `npm run test:backend:dto` | Pruebas de validación runtime de los DTO backend |
| `npm run test:api:generator` | Pruebas del generador de artefactos OpenAPI |
| `npm run openapi:api:check` | Comprueba que los artefactos generados estén sincronizados |
| `npm run openapi:types` | Regenera los tipos backend/web/mock y el snapshot DTO backend |
| `npm run typecheck --workspace backend` | Typecheck del workspace backend |
| `npm run build --workspace backend` | Compila `backend/src` a `backend/dist`; no inicia el servidor |
| `npm run dev:backend` | Inicia `backend/src/server.ts` con `tsx watch` (sin rutas de negocio todavía) |
| `npm run lint --workspace backend` | Validación TypeScript configurada para backend |

El `npm test` de raíz incluye los scripts `test` presentes en todos los
workspaces, incluido `backend`. `npm run dev` solo inicia Vite y el mock web;
no inicia el backend; para eso existe `npm run dev:backend`. Mientras no haya
rutas de negocio, ese servidor no es evidencia de la API productiva.

## Alcance de la ratificación

Se ratifican únicamente la creación en `borrador`, la entrada cerrada, el DTO de
creación de diez campos, el conteo inicial cero, la sede activa propia, el radio
entero opcional normalizado a 10, la urgencia informativa, el vencimiento desde
creación UTC de PostgreSQL, el replay idempotente y el catálogo de errores de
este caso. `GET /api/v1/hospitals/me/needs` y las otras 68 operaciones no quedan
ratificadas por compartir ruta, recurso o schema.

No se aprueban aquí la duración/refresh de sesión, el protocolo concreto de
autenticación, nombres y mecanismo de cookie/CSRF, allowlist CORS/Origin,
repositorio/driver, RPC, esquema SQL ni políticas/grants RLS. Las referencias
`sessionCookie` y `csrfToken` del OpenAPI siguen siendo placeholders. La
precondición funcional de identidad administrativa AAL2 sí aplica; su
implementación real debe diseñarse antes del transporte protegido.

## Operación HTTP futura

La sección siguiente describe el contrato del transporte aún no implementado;
no afirma que exista un handler ejecutable de `createHospitalNeed`.

- Método y ruta: `POST /api/v1/hospitals/me/needs`.
- Éxito: `201 Created`, `Content-Type: application/json` y envoltura `{ "data":
  ... }`.
- `Idempotency-Key` es metadata del transporte, requerida y fuera del JSON del
  body; el schema canónico actual limita el valor a 16–255 caracteres. Se
  conserva para reintentar la misma intención y nunca se registra.
- La identidad/sesión y controles CSRF mostrados en OpenAPI no fijan la política
  productiva pendiente. La autorización no se deriva de campos del request.

### Entrada: body JSON cerrado

Solo se admiten las siete propiedades de la tabla; `radiusKm` es la única
opcional. `additionalProperties` es `false`.

| Propiedad | Presencia | Tipo JSON / límites | Dominio |
| --- | --- | --- | --- |
| `component` | Requerida | string constante | Solo `RBC` |
| `requiredBloodType` | Requerida | string enum | `O_NEG`, `O_POS`, `A_NEG`, `A_POS`, `B_NEG`, `B_POS`, `AB_NEG`, `AB_POS` |
| `targetConfirmations` | Requerida | integer, 1–50 | Meta de intenciones de asistir, no unidades ni donaciones realizadas |
| `siteId` | Requerida | string con formato UUID | Debe resolver a una sede activa del hospital derivado de la identidad |
| `radiusKm` | Opcional | integer, 1–50; default contractual 10 | Si se omite, normalizar a `10` antes de calcular el hash canónico; omisión y `10` explícito representan la misma intención |
| `urgency` | Requerida | string enum | `Normal`, `Urgente`, `Critica`; informativa, no cambia radio ni selección |
| `expiresInHours` | Requerida | integer, 1–72 | Horas contadas desde la creación, no desde una activación posterior |

No aceptar `hospitalId`, `role`, propietario/actor, `status`, campos de paciente,
fecha o historial de última donación, ni propiedades adicionales. No se solicita,
acepta, guarda ni infiere historia de donación.

El cuerpo sintético existente en OpenAPI sirve como ejemplo de forma. En
particular, no contiene coordenadas ni datos reales.

### Salida: proyección exacta de creación

El `201` contiene `{ "data": { ... } }`. `data` debe tener exactamente estos
diez campos, sin propiedades adicionales. El schema general `NeedEnvelope` no
cambia; el schema de respuesta de esta operación lo especializa inline mediante
`allOf` para exigir `status = borrador` y `confirmedIntentCount = 0`.

| Campo | Tipo / restricción de creación |
| --- | --- |
| `needId` | string UUID opaco |
| `component` | string constante `RBC` |
| `requiredBloodType` | Uno de los ocho valores de `BloodType` |
| `targetConfirmations` | integer, 1–50 |
| `confirmedIntentCount` | integer constante `0` |
| `siteId` | string UUID de la sede validada |
| `radiusKm` | integer, 1–50; `10` cuando se omitió en la entrada |
| `urgency` | `Normal`, `Urgente` o `Critica` |
| `status` | string constante `borrador` |
| `expiresAt` | Fecha-hora RFC 3339 en UTC (`Z`) |

No añadir al DTO `hospitalId`, `createdAt`, nombres de hospital/sede, actor,
conteos de candidatos, invitaciones, paciente, coordenadas ni distancia. La sede
solo se refleja por el `siteId` ya declarado en el contrato.

## Frontera del DTO actual y caso de uso futuro sin HTTP

La implementación actual termina en los DTO/validadores descritos arriba. Los
puntos siguientes describen la frontera conceptual que deberá respetar un caso
de uso futuro; no fijan nombres de clases, librerías o repositorios ni afirman
que esa capa exista.

- **Entrada de negocio:** los seis campos requeridos y `radiusKm` ya normalizado
  (el caso de uso recibe el radio como entero efectivo, incluso cuando el body
  omitió el campo).
- **Contexto de autorización, separado del body:** identidad real validada,
  actor con rol `admin_hospitalario`, AAL2, membresía hospitalaria vigente y
  `hospitalId` derivado de esa membresía. La sede debe existir, estar activa y
  pertenecer a ese hospital.
- **Contexto de idempotencia, separado del body:** clave recibida en
  `Idempotency-Key`, identificador de operación `createHospitalNeed`, actor y
  hash de la intención canónica después de normalizar el radio. La clave no
  sustituye la autorización ni forma parte del body.
- **Salida de negocio:** proyección de necesidad con exactamente los diez
  campos de la tabla anterior, sin la envoltura HTTP.
- **Errores de dominio:** representan motivos del caso de uso sin asignar status
  HTTP. Un futuro controlador traducirá solo categorías allowlisted al catálogo
  seguro de esta especificación; nunca devolverá una excepción, fila SQL,
  detalle de Supabase ni stack.

Para la unicidad, la base de datos debe reclamar atómicamente la combinación de
actor, operación y clave; almacenar/comparar el hash del payload normalizado y
el resultado original. Misma clave y misma intención normalizada reproducen el
resultado; misma clave con intención distinta o ejecución aún en curso produce
`409`. El reclamo no puede implementarse como `SELECT` seguido de `INSERT` sin
una restricción única.

## Precondiciones, tiempo y efectos futuros

1. Una identidad real autenticada corresponde a un admin hospitalario en AAL2.
2. La membresía vigente determina el hospital del actor; ningún campo del cliente
   puede cambiar rol, hospital o propietario.
3. `siteId` debe ser UUID bien formado y corresponder a una sede sintética
   sembrada, activa y propia. Sede inexistente, ajena o inactiva produce la misma
   respuesta `422` genérica, con el mismo código y mensaje; no se permite
   enumerar sedes.
4. Para una creación nueva, PostgreSQL fija `created_at` y calcula
   `expires_at = created_at + expiresInHours` en UTC, dentro de la creación
   atómica. El `expiresAt` público es ese instante serializado en RFC 3339/UTC.
   Activar posteriormente no recalcula ni extiende el vencimiento. La ruta de
   activación no queda ratificada por este documento.
5. En una transacción futura se confirman juntos: necesidad `borrador`, resultado
   idempotente original y evento de auditoría minimizado. La auditoría usa IDs
   opacos, actor, evento, recurso, resultado y fecha; no guarda body ni valores
   sensibles.
6. La creación no activa, no ejecuta matching, no calcula candidatos, no crea
   invitaciones, no escribe outbox y no envía correo.
7. Replay de la misma clave e intención normalizada devuelve el `201` original y
   el mismo `expiresAt`, incluso si ese instante ya pasó; no crea otra necesidad,
   no vuelve a calcular el plazo y no reactiva el recurso.

No se define aquí precedencia de carreras entre operaciones distintas (AP-04),
TTL/sesiones, driver, política RLS, polígono de Lima ni retención específica de
la clave fuera de las reglas aprobadas por RNF-REL-01/02.

## Errores HTTP seguros

Todas las respuestas de error usan `application/json` y exactamente la forma
`{ "error": { "code": "...", "message": "...", "correlationId": "..." } }`
según `ErrorResponse`. `correlationId` es opaco; no se incluyen detalles de
validación que expongan datos protegidos, body, clave idempotente, SQL, proveedor
ni stack. El controlador futuro es responsable del mapeo; el dominio no depende
de HTTP.

| HTTP | Caso para este POST | Código / mensaje público | Regla de privacidad |
| --- | --- | --- | --- |
| `400` | JSON inválido o shape inválido: no-objeto, faltan requeridos, hay campos extra, formato UUID incorrecto, tipo equivocado, decimal donde se exige integer o número no finito/`NaN` | `BAD_REQUEST` / `Solicitud malformada.` | Sin valores, lista de propiedades protegidas ni mensaje del parser |
| `401` | Sesión/identidad ausente, inválida o vencida | `AUTHENTICATION_REQUIRED` / `La sesión no está vigente.` | No exponer causa criptográfica ni estado de cuenta |
| `403` | Actor autenticado sin rol/permisos requeridos, AAL2 o membresía hospitalaria vigente | `ACCESS_DENIED` / `La acción no está permitida.` | No exponer hospital o sede asociados a otras personas |
| `409` | Clave repetida con hash normalizado distinto o intento concurrente todavía en curso | `STATE_CONFLICT` / `La operación entra en conflicto con el estado actual.` | No devolver clave, hash ni resultado ajeno |
| `422` | JSON con shape correcto, pero valor fuera del dominio/límites; también sede inexistente, ajena o inactiva | `VALIDATION_FAILED` / `Uno o más valores no cumplen las reglas del campo.` | Los tres estados de sede usan idénticos status, código y mensaje; no enumerar existencia |
| `500` | Fallo interno no clasificado | `INTERNAL_ERROR` / `No se pudo completar la solicitud.` | Rollback cuando aplique; nunca devolver diagnóstico interno |

Además de ese catálogo, los middlewares globales de `/api` pueden responder `429`
(límite de renovación de sesión, ADR-004) y `503` (base de datos o proveedor de Auth
no disponible), como en todas las operaciones servidas; F3 los declara también aquí
(`429` con `RATE_LIMITED` / `Intenta nuevamente más tarde.`, que además emite el propio
módulo al superar el tope de creaciones por hora, y `503` con `SERVICE_UNAVAILABLE`). No se añade `404` ni ningún otro status. El status `400`
se reserva a sintaxis/forma y `422` a semántica; ningún error incluye datos de
paciente ni afirma elegibilidad clínica. Las respuestas de error llevan siempre
un `correlationId` opaco.

## Criterios de aceptación para implementación futura

El checklist es para integrar DTO, transporte y caso de uso; los criterios
siguen pendientes como aceptación de la API HTTP completa aunque la validación
runtime de DTO ya exista.

- [ ] Aceptar `RBC`, los ocho enums sanguíneos y las tres urgencias exactas; meta
      y radio aceptan solo enteros en sus límites; `expiresInHours` acepta solo
      entero 1–72.
- [ ] Confirmar que string para número, fracción para integer, `NaN` (JSON
      inválido), propiedad extra y cada campo expresamente prohibido no se
      persisten; separar `400` de `422` según el catálogo.
- [ ] Comprobar que radio omitido y radio `10` explícito normalizan al mismo
      payload/hash y producen el valor de salida `10`.
- [ ] Con identidad y membresía válidas, usar una sede propia activa de los seeds
      sintéticos; demostrar que otra sede/rol/hospital no se puede suplantar
      desde body.
- [ ] Hacer que sede inexistente, ajena e inactiva devuelvan exactamente el
      mismo `422`, código y mensaje, sin diferencias que permitan enumeración.
- [ ] Comprobar proyección `201` cerrada con exactamente diez campos, estado
      `borrador`, conteo `0`, envoltura `data` y fecha `expiresAt` UTC; rechazar
      columnas/campos no aprobados.
- [ ] Con reloj de PostgreSQL controlado, fijar el vencimiento desde la creación;
      una activación futura no lo extiende. Replay retorna el vencimiento
      originalmente almacenado sin recomputar.
- [ ] Repeticiones concurrentes de la misma clave/intención producen un solo
      recurso y resultado; una clave reutilizada con otra intención o en curso
      produce `409`. Verificar atomicidad de necesidad, registro idempotente y
      auditoría, incluido rollback ante fallo intermedio.
- [ ] Confirmar ausencia de matching, invitaciones, outbox, correo y datos de
      paciente; confirmar que auditoría, logs y errores no registran body,
      `Idempotency-Key`, PII ni datos sensibles.

## Pendientes antes de aceptación backend/HTTP

- Implementar el endpoint HTTP y el caso de uso dentro del workspace backend,
  consumiendo los DTO/validadores existentes; el scaffolding Express legacy no
  constituye ese endpoint.
- Diseñar y probar identidad Supabase real, AAL2, autorización server-side y RLS
  con acceso directo negativo antes de publicar HTTP protegido.
- Cerrar de forma independiente sesión/refresh, CSRF, CORS/Origin y decisiones
  de driver/transacción; esta ratificación no las resuelve.
- Ejecutar pruebas unitarias/de integración contra PostgreSQL/Supabase local,
  escenarios de rollback/concurrencia y Bruno contra el backend real. Prism,
  mock, readiness y auth de demo no prueban esos controles.
- Obtener revisión independiente de `reviewer-back` y los gates de
  seguridad/privacidad aplicables; la salida de este documento no es aprobación.
- Mantener los datos sintéticos y pendiente la validación clínica profesional y
  legal/de privacidad aplicable en Perú antes de cualquier uso real.

---

## Módulo implementado: identity-institutions (F2a)

Estado: operaciones ratificadas e implementadas en `backend/src/modules/identity-institutions`;
cierre sujeto a las revisiones y a la aprobación registradas en
[`plans/2026-10-12-identity-institutions.md`](plans/2026-10-12-identity-institutions.md).

- **Operaciones**: `createSession`, `getCurrentSession`, `getCsrfToken`,
  `deleteCurrentSession`, `enrollMfaFactor`, `verifyMfaChallenge`, `verifyStepUp`,
  `listOwnHospitalSites` y las trece del superadmin (hospitales, sedes,
  membresías, configuración, auditoría, tareas). La lista y los cambios de
  contrato están en el plan del módulo.
- **Sesión** (ADR-004): cookies `__Host-sal_at` y `__Host-sal_rt`
  (`HttpOnly; Secure; SameSite=Lax; Path=/`), JWT de 600 s con refresh
  transparente en el servidor e inactividad de 12 h. El rol y la membresía se
  resuelven en cada request con `api.current_actor()`, nunca desde el cliente.
- **CSRF**: en toda mutación con cookie se exige un `Origin` presente y dentro de
  la allowlist, más `X-CSRF-Token` firmado y ligado a la sesión.
- **Idempotencia**: toda mutación exige `Idempotency-Key`. Las rechazadas por
  reglas ocurren antes de reclamar la clave. Las operaciones MFA usan claves de
  un solo uso (el replay responde 409).
- **Persistencia** (ADR-003): tablas en el esquema `app` (no expuesto); RPC en
  `api` con `SECURITY INVOKER` y RLS forzada. Las únicas funciones
  `SECURITY DEFINER` de `api` son `api.consume_rate_limit`, `api.readiness` y
  `api.record_public_idempotency`, todas en la allowlist cerrada de ADR-003.
  `PUBLIC` no tiene `EXECUTE` en ninguna función de `api` ni de `app` (lo
  verifica pgTAP).
- **Replay idempotente**: las operaciones cuyo rechazo depende del estado
  (`revokeHospitalMembership`, `setFinalDemoAt`) devuelven el resultado original
  con la misma clave y el mismo payload aunque el estado ya haya cambiado.
- **Step-up**: `updateHospital`, `revokeHospitalMembership` y `setFinalDemoAt`
  exigen un TOTP verificado en los últimos 300 s (403 `STEP_UP_REQUIRED`).
- **Login y logout**: el login nunca renueva la sesión. El logout renueva con el
  refresh token si el access venció, para revocar la sesión en Auth; si el límite
  de renovación está agotado o el proveedor responde 429, responde 401, expira las
  cookies y la revocación queda diferida hasta que caduque el refresh token (también
  si Auth o el limitador no están disponibles). Toda
  llamada a Auth tiene un plazo de 8 s (503 si no contesta).
- **Estados globales**: toda operación ratificada y servida de `/api` declara 400, 401, 403 (también el
  guard de borde `X-Edge-Secret`), 429, 500 y 503; la pareja de salud declara 400 y
  500. Lo verifica una prueba estructural y las pruebas de integración.
- **Cuota de Supabase Auth**: login y renovación comparten la cuota por IP del
  backend (150 cada 5 min, no ampliable); la renovación tiene límite propio
  (`refresh:ip`), ambos flujos tienen un techo global propio de 60 cada 5 min que
  protege esa cuota, y un 429 del proveedor responde 429 sin cerrar la sesión
  (ADR-004, decisión O1).
- **Fuera de este módulo**: recuperación de contraseña e invitación de admins
  (F2b, requieren correo y el adaptador `service_role` de ADR-006).
- **Verificación**: pgTAP, integración contra Supabase local y Bruno contra el
  backend real (`npm run test:backend:db`, `test:backend:integration`,
  `test:bruno:backend`). Prism y el mock no cuentan como evidencia.

---

## Módulo implementado: need-records (F3)

Estado: operaciones ratificadas e implementadas en `backend/src/modules/need-records`;
cierre sujeto a las revisiones y a la aprobación registradas en
[`plans/2026-10-13-need-records.md`](plans/2026-10-13-need-records.md).

- **Operaciones**: `createHospitalNeed` (POST), `listOwnHospitalNeeds` (GET),
  `getOwnHospitalNeed` (GET) y `transitionOwnHospitalNeed` (PATCH), todas bajo
  `/api/v1/hospitals/me/needs`. Exigen admin hospitalario, AAL2, membresía activa y
  hospital autorizado; el hospital sale siempre de la membresía en SQL.
- **Tabla `app.needs`** con RLS forzada. Una clave foránea compuesta
  `(site_id, hospital_id)` impide una sede ajena aunque falle una política.
- **Creación** (`api.create_need_draft`, INVOKER): una sola RPC atómica que valida,
  recalcula el hash canónico, consulta el replay, comprueba la sede, reclama la clave,
  inserta la necesidad y escribe la auditoría. PostgreSQL fija `expires_at`. Sede
  inexistente, ajena, inactiva o sin aprobar dan el mismo 422 y no dejan registro de
  idempotencia. El replay devuelve el 201 original aunque el plazo ya haya pasado o la
  sede se haya desactivado.
- **Estado visible**: un estado no terminal cuyo `expires_at` ya pasó se proyecta como
  `vencida` (también un borrador); el filtro `status` se aplica sobre ese estado.
  `confirmedIntentCount` vale 0 hasta F6.
- **Transición manual (C-8)**: `borrador → activa | cancelada`, `activa → cerrada |
  cancelada`, `meta_alcanzada → cerrada | cancelada`; las terminales no se reabren y
  `meta_alcanzada`/`vencida` no son destinos asignables (422). Cualquier otra
  combinación, y un `borrador → activa` con el plazo vencido, es 409. La transición
  bloquea la fila (`FOR UPDATE`), consulta el replay y solo entonces reclama la clave;
  incrementa `version`. En F6 la RPC se reemplaza para añadir la cascada.
- **Límite por actor**: 30 creaciones por hora (429 `RATE_LIMITED`), contadas en SQL sobre
  las necesidades realmente creadas; los replays no consumen cupo. Activar un borrador exige que su sede
  siga activa y aprobada (409). El replay de la creación no se entrega a quien ya
  pertenece a otro hospital (403).
- **Listado**: más recientes primero, cursor opaco firmado y ligado al actor y a la
  operación (manipulado o ajeno = 400).
- **IDOR**: una necesidad de otro hospital es 404 indistinguible de una inexistente.
- **Estados globales**: además de los suyos, cada operación declara 429 y 503.
- **Verificación**: pgTAP (`03_need_records.test.sql`), integración contra Supabase
  local (`need-records.integration.ts`) y Bruno contra el backend real
  (`bruno/backend/need-records/hospital`). Prism y el mock no cuentan como evidencia.

---

## Módulo implementado: email-delivery (F4)

Estado: implementado en `backend/src/modules/email-delivery`; revisiones y cierre registrados en
[`plans/2026-10-13-email-delivery.md`](plans/2026-10-13-email-delivery.md).

- **Webhook** `receiveResendWebhook` (`POST /api/v1/email-delivery/webhooks/resend`): público, sin cookie. Firma
  estilo Svix (`base64(HMAC-SHA256(secreto, "<svix-id>.<svix-timestamp>.<cuerpo crudo>"))`, cualquiera de las
  firmas `v1,<base64>`), antigüedad máxima 300 s (pasada o futura), JSON parseado solo después de verificar y
  deduplicación por `svix-id`. Respuestas: 204 (aceptado, duplicado o ignorado), 400, 401 (firma o plazo, sin
  detalle), 403 (guard de borde), 429 (límite de Auth al renovar la sesión técnica), 500 y 503. Mapeo: `email.sent → enviada`, `email.delivered → entregada`,
  `email.bounced`/`email.failed → fallida`; otros eventos se ignoran.
- **Outbox**: el payload (token y destinatario) se cifra en la aplicación con AES-256-GCM y el id del outbox como
  AAD; en la base solo existe cifrado y se destruye (`NULL`) al llegar a un estado final o vencer.
- **Reintentos**: máximo 6 llamadas, backoff 1/2/5/10/20 min con jitter ±20 %, nada se envía tras `not_after` (se
  comprueba otra vez justo antes de llamar al proveedor),
  y un resultado incierto se reconcilia a los 30 s durante 5 min con la misma clave de idempotencia.
- **Worker**: proceso separado con identidad técnica y rol interno `worker`; solo llama a las RPC `worker_*` e
  `ingest_email_event`. Sus registros contienen solo evento, código y duración.
- **Plantillas**: enlaces con el token en el fragmento; sin grupo sanguíneo, ubicación ni datos de paciente.
- **Allowlist de bandejas** (RF-EML-04): un destinatario no permitido no llega al proveedor.

---

## Módulo implementado: invitación de admins y recuperación de contraseña (F2b)

Estado: implementado en `backend/src/modules/identity-institutions`; revisiones y cierre en
[`plans/2026-10-13-identity-tokens.md`](plans/2026-10-13-identity-tokens.md).

- **Operaciones**: `inviteHospitalAdmin` (superadmin, AAL2 y step-up), `getHospitalAdminInvitationPreview`,
  `claimHospitalAdminInvitation`, `requestPasswordRecovery` y `completePasswordReset`. Las cuatro últimas son
  públicas: la autorización es el secreto del enlace.
- **Tokens**: se generan en la aplicación (256 bits), viajan solo dentro del correo cifrado (fragmento `#token`) y
  en la base solo existe su SHA-256. Un solo uso; la invitación vale 72 h y la recuperación 1 h. Inexistente = 404,
  vencido, consumido o anulado = 410. Una reinvitación o una nueva solicitud anula el enlace anterior.
- **Reclamo**: comprueba la invitación, crea la cuenta de Auth con la contraseña elegida (`signUp` con la anon key),
  la vincula con la invitación (cuenta de aplicación y membresía activa) y devuelve una sesión AAL1 con
  `mfaRequired: true`. Si el correo ya existe en Auth responde 409 sin consumir el token; si el vínculo falla se
  elimina la cuenta recién creada.
- **Recuperación**: responde siempre 202 con el mismo mensaje, exista o no la cuenta, con un piso de 150 ms. Límites
  de 10 por IP cada 15 min y 3 por correo (HMAC) por hora; un reintento con la misma clave no repite el correo. La cuenta
  técnica no se recupera por correo.
- **RPC de tokens**: la vista previa, la solicitud de recuperación y el consumo del reset las ejecuta solo la sesión
  técnica del backend; un cliente directo de PostgREST (anon key) no puede elegir hashes de token.
- **Reset**: consume el token, revoca las sesiones, cambia la contraseña con `service_role` (único adaptador, ADR-006)
  y revoca otra vez; los access tokens ya emitidos valen hasta 600 s.
- Una invitación a un correo que ya tiene cuenta (donante, admin o worker) es 409; a un hospital inexistente, 422; a
  uno sin autorizar, 409.


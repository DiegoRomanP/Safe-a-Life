# Reglas de API de Save a Life

| Campo | Valor |
| --- | --- |
| Estado | Convenciones globales en borrador; solo `createHospitalNeed` está ratificada para implementación |
| Alcance | API REST Node.js/Express del prototipo académico |
| Contrato de trabajo | [`openapi.json`](openapi.json), borrador importable en Swagger Editor/Prism/Bruno |
| Fuentes principales | [`1_Primeros_Alcances.md`](1_Primeros_Alcances.md), [`2_Especificaciones_De_Software.md`](2_Especificaciones_De_Software.md), [`ADR-001`](decisions/ADR-001-stack-del-prototipo.md) |

Guía operativa para humanos frontend: [Frontend-Handoff.md](Frontend-Handoff.md).
Contiene setup, matriz histórica de 69 operaciones, ejemplos/modos y paquetes de
trabajo; la nueva consulta draft de sedes propias todavía no figura en esa guía.
Revisada independientemente para este paquete local; no ratifica el API productivo.
El contrato acotado de creación de necesidad se documenta en
[Backend-Contracts.md](Backend-Contracts.md).

## 1. Propósito y autoridad

Estas reglas orientan el diseño e implementación de contratos REST. No agregan
comportamiento funcional al producto ni sustituyen requisitos o decisiones
aprobados.

La precedencia documental es:

1. `1_Primeros_Alcances.md` es la línea base funcional aprobada.
2. `ADR-001` gobierna stack y límites arquitectónicos.
3. `2_Especificaciones_De_Software.md` organiza requisitos verificables, pero
   permanece en borrador; mientras siga así, la línea base funcional prevalece.
4. Este documento concreta convenciones de diseño de API dentro de esos límites.
5. `openapi.json` propone el inventario REST para los recorridos descritos de los
   tres roles. Su estado global permanece en borrador y exige aprobación para el
   resto: solo `POST /api/v1/hospitals/me/needs` (`createHospitalNeed`) quedó
   ratificado para implementación el 2026-10-04, con alcance registrado en su
   extensión `x-ratification` y en [Backend-Contracts.md](Backend-Contracts.md).
   Las otras 69 operaciones siguen en borrador, incluido el `GET` de esa misma
   ruta. La ratificación contractual no significa que la API real esté
   implementada.

La ERS deja para Sprint 0 cerrar las rutas restantes, esquemas OpenAPI o
equivalentes y el acceso concreto a datos. El JSON es la propuesta Design-First
que frontend, mock y Bruno consumen; mantiene su estado global de borrador y no
describe una API productiva ya implementada. La excepción es el contrato de
`createHospitalNeed`, ratificado solo para implementación y sin cerrar sesión,
TTL, CSRF, CORS ni persistencia. Antes de implementar, revisar estos documentos
junto con `.opencode/references/project-requirements.md`; si existe discrepancia,
detener el cambio afectado y solicitar sincronización en vez de elegir una fuente
silenciosamente.

## 2. Convenciones propuestas para el contrato

Las siguientes convenciones se usan en `openapi.json` para que el contrato sea
concreto e importable. Deben ratificarse en Sprint 0 antes de convertirse en
compatibilidad de producción:

- OpenAPI 3.1.0 y JSON como formato del documento.
- Prefijo propuesto `/api/v1`. `docs/openapi.json` tiene servidores locales Prism
  (`127.0.0.1:4010`) y stateful mock (`127.0.0.1:4011`); `127.0.0.1:3000` queda
  como placeholder del API real futuro.
- Rutas orientadas a recursos con sustantivos en plural; los verbos HTTP
  expresan la operación. Las acciones de negocio se modelan como subrecursos o
  transiciones explícitas, no como rutas arbitrarias con verbos.
- JSON UTF-8; propiedades `camelCase`; los valores enum conservan literalmente
  los valores definidos por los requisitos y el dominio.
- Éxito envuelto en `{ "data": ... }`; error envuelto en
  `{ "error": { "code", "message", "correlationId" } }`.
- Listas paginadas con cursor opaco y un parámetro `limit` acotado por servidor.
  El borrador usa 20 por defecto y 100 como máximo; el límite se ratifica en
  Sprint 0.
- Fechas como RFC 3339/ISO 8601 en UTC. Ningún cliente decide el reloj autoritativo
  para vencimientos de necesidades: se usa PostgreSQL según RF-NEC-08.

## 3. Contrato primero y límites de arquitectura

- Definir actor, permisos, precondiciones, entrada, salida, errores y efectos
  antes de implementar un handler. Mantener OpenAPI o equivalente junto al
  cambio y actualizarlo con cada cambio contractual.
- El flujo funcional es `web -> API Express -> aplicación -> repositorios ->
  PostgreSQL`. El frontend no consulta datos de dominio directamente en
  Supabase.
- Separar controladores, servicios/casos de uso, repositorios, DTOs de entrada y
  salida, dominio y persistencia. Nunca serializar entidades o filas de base de
  datos directamente.
- Mantener el dominio independiente de Express, Supabase, Resend y mapas; aislar
  proveedores detrás de puertos/adaptadores.
- No acoplar la respuesta pública a nombres de tablas, columnas, joins, códigos
  internos del proveedor ni mensajes del motor SQL.

## 4. Validación de solicitudes

- Validar toda entrada externa en el límite HTTP con esquemas cerrados.
- Rechazar campos desconocidos (`additionalProperties: false`), mass assignment,
  tipos y tamaños inválidos, longitudes fuera de límite, enums desconocidos,
  UUID inválidos y coordenadas fuera de rango. Validar las respuestas de
  proveedores externos como entrada no confiable.
- Aplicar validaciones semánticas en el servidor además de las restricciones de
  forma del OpenAPI: por ejemplo, una sede debe estar activa y pertenecer al
  hospital autenticado; las coordenadas deben caer dentro del polígono versionado
  de Lima.
- Un `PATCH` contiene solo los campos mutables expresamente permitidos por ese
  caso de uso. No usar `PUT` para eludir allowlists.
- El cliente no puede establecer rol, hospital, propietario, estados calculados,
  IDs de donantes ajenos, número de candidatos ni parámetros de matching.
- En el perfil del donante, solo se modifican disponibilidad y ubicación
  sintética aproximada. Nombre, correo y grupo declarado usan el flujo de
  solicitud aprobado. No aceptar fecha o historial de última donación.

## 5. Autenticación, autorización y privacidad

- Express media Supabase Auth. La sesión persistente vive en cookie `Secure` y
  `HttpOnly`; validar criptográficamente JWT/sesión, emisor, audiencia, vigencia y
  sujeto. Los detalles de cookie y CSRF se concretan en Sprint 0.
- El mock local devuelve `expiresAt` para que la UI oculte la vista protegida al
  caducar y revalide la sesión al volver a una pestaña visible. Ese timestamp y la
  duración de demo no fijan la política productiva de expiración/refresh.
- Toda mutación autenticada por cookie valida `Origin` contra allowlist exacta y
  token CSRF. CORS nunca usa `*` junto con credenciales.
- El token de salida de `CsrfTokenEnvelope` es `readOnly: true`, no `writeOnly`:
  lo emite el servidor para enviarlo después en el header CSRF, no como body de
  entrada de esa consulta. Conserva `data`/`token` requeridos, ambos objetos
  cerrados, límites de 32–512 caracteres y el ejemplo sintético existente. El
  cliente lo mantiene solo en memoria; nunca se registra. Esta anotación no fija
  el mecanismo productivo pendiente ni relaja la validación.
- Consultar la membresía vigente en cada operación protegida. Derivar rol y
  hospital de identidad/datos protegidos, nunca de parámetros o metadata
  editables por el cliente.
- Aplicar denegación por defecto en Express y reforzarla en RLS por actor,
  propietario, hospital, recurso y proyección de campos. `auth.uid()` por sí
  solo no constituye autorización.
- Los repositorios ordinarios usan identidad del usuario. `service_role` solo se
  permite en operaciones excepcionales incluidas en una allowlist del backend;
  nunca en web ni worker. El worker recibe únicamente `EXECUTE` sobre RPC
  permitidas, sin acceso general a tablas.
- Diseñar los DTO mediante allowlists específicas del actor y estado. El donante
  consulta solo sus datos. El hospital opera solo en su institución: antes de
  una confirmación afirmativa ve conteos, código aleatorio por necesidad y
  estados opacos; mientras la respuesta vigente sea confirmada recibe únicamente
  los campos de RF-VIS-02. Si el donante cambia a rechazada, ocultar nombre y
  grupo, y conservar solo código por necesidad y estados opacos. No exponer email,
  teléfono, ID global, ubicación, coordenadas ni distancia del donante.
- El superadmin no tiene navegación rutinaria del padrón. El acceso excepcional
  a PII exige step-up y grant contextual, temporal, ligado al actor superadmin,
  solicitud, donante, acción concreta y campos, y auditado conforme a RNF-SEC-05/06.
  En el GET contextual, `currentValues` se limita al grant vigente ligado al actor
  superadmin, solicitud, donante, acción concreta y campos autorizados, en
  intersección con los campos necesarios para esa solicitud.
  `proposedValues` se limita al grant vigente ligado al actor superadmin,
  solicitud, donante, acción concreta y campos autorizados, en intersección con
  los campos necesarios para esa solicitud. El servidor resuelve al actor desde
  la identidad validada y al donante desde la solicitud, sin selector alternativo.
  El DTO exige ambos objetos cerrados; cada uno admite solo `name` (máximo 120),
  `email` (formato email, máximo 254) y `declaredBloodType` (enum existente),
  todos opcionales y solo si están autorizados. Sin propuesta, incluida una
  eliminación sin valores propuestos, `proposedValues` es `{}`; `newEmail` se
  proyecta como `email`. Resúmenes generales y auditoría siguen sin valores PII
  anteriores o propuestos. Esta forma draft no define un mapping GET→`review` /
  POST→`execute`, ni modifica grants, ejecuciones o sus acciones aceptadas.
- No incluir pacientes, diagnósticos, historias clínicas, contacto
  paciente-donante, listas de donantes ni afirmaciones de elegibilidad clínica.
- Los tokens son secretos de un solo uso, ligados a recurso y acción, guardados
  como hash. El payload de email que los transporta se conserva solo cifrado y
  efímero en el outbox conforme a RF-SEC-14. Las páginas receptoras aplican
  `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, no cargan terceros y
  no registran tokens/URLs.
- El token para verificar un email nuevo dura 24 horas. El token de alta asistida
  también dura 24 horas; al vencer, la solicitud pasa a `vencida`, y una
  reemisión permitida antes de la purga la devuelve a `pendiente` sin extender la
  fecha original de purga.

## 6. Métodos, estados e idempotencia

- `GET` es de solo lectura. Abrir un enlace de invitación no consume el token ni
  modifica la respuesta; la primera respuesta ocurre mediante `POST` atómico
  (RF-INV-03).
- `POST` crea un recurso o ejecuta una operación de negocio explícita; `PATCH`
  cambia solo campos permitidos. Las transiciones válidas se comprueban contra
  la máquina de estados documentada, no solo contra el enum del esquema.
- Mantener separados los ejes de vigencia, entrega y respuesta de invitación.
  No aceptar desde el cliente estados que el sistema calcula, como meta alcanzada
  o vencimiento.
- Los tokens de confirmación/rechazo no tienen TTL independiente: son válidos
  solo si la invitación y la necesidad siguen activas y `now < need.expires_at`.
  Al vencer la necesidad, invitaciones pendientes pasan a `vencida`; cierre o
  cancelación manual las marca `invalidada` (RF-INV-01/02/08).
- Toda operación reintentable requiere `Idempotency-Key`, ligada a actor,
  operación y hash canónico del payload. Reclamarla de manera atómica mediante
  restricción única. Misma clave/payload reproduce el resultado; payload distinto
  o ejecución en curso produce `409`. Retener el registro hasta 72 horas después
  del estado terminal o hasta la purga (RNF-REL-01/02).
- La creación de invitaciones, outbox y auditoría es una sola transacción. La
  restricción única de base de datos garantiza como máximo una invitación por
  necesidad y donante (RF-BAT-04).
- Un lote de invitaciones requiere una acción manual del hospital; la urgencia
  no altera radio, selección, ranking, cuotas ni tamaño del lote.
- En el mock local, el replay de lote ya registrado se comprueba después de
  autenticar/verificar propiedad y antes de rechazar una nueva intención terminal.
  Reproduce el éxito sin reabrir la necesidad; una clave nueva sobre terminal
  devuelve 409. No decide las carreras productivas de AP-04.
- El cliente distingue intención de intento: ante resultado incierto conserva la
  clave; un POST exitoso seguido de GET fallido conserva el éxito y permite
  reintentar solo lectura. «Preparar otro lote» habilita una intención nueva;
  la siguiente solicitud usa nueva clave. No repetir POST para refrescar una lista.

### 6.1 Políticas de reconocimiento versionadas

La moderación draft solo admite `suspendida` y `sin_publicar`: el superadmin aplica
`publicada -> suspendida` o `suspendida -> sin_publicar`, siempre con motivo
auditable. Levantar la suspensión **no republica** la oferta; una nueva publicación
corresponde al admin del hospital. Cada mutación compara la versión esperada,
incrementa la versión y rechaza una versión obsoleta con `409`, conforme a la
línea base §4.4. El `200` de moderación especializa `RecognitionPolicyEnvelope`
con `allOf` para restringir solo su estado y tiene un ejemplo media singular de
suspensión. El enum general `RecognitionPolicyStatus` conserva sus tres estados
y las demás respuestas de políticas no cambian.

El DELETE draft `withdrawOwnRecognitionPolicy` no recibe body. Requiere query
`expectedVersion` entero no negativo, además de `Idempotency-Key`, sesión por
cookie y CSRF/Origin. Solo retira la política propia derivada de la identidad y
membresía vigentes, mientras no esté suspendida. El retiro aplicado compara la
versión vigente con `expectedVersion`, incrementa la versión y conserva auditoría;
una versión obsoleta produce `409`. La intención canónica idempotente incluye
`expectedVersion`, ligada a actor, operación y clave: el replay de la misma
intención reproduce el `204` original, vacío, sin incrementar de nuevo; intención
distinta con la misma clave o ejecución en curso conserva el `409` uniforme.
Query ausente o inválida produce `400` mediante `BadRequest`/`ErrorResponse`, sin
valores de entrada ni detalles del recurso. Esto concreta las reglas existentes
de versión e idempotencia; no define una política nueva ni una implementación.

### 6.2 Conteos de entrega del lote

`deliveryCounts` contiene exactamente `pendiente`, `enviada`, `entregada` y
`fallida`, requeridos y enteros no negativos. Son conteos de **estado actual
mutuamente excluyentes**: cada invitación pertenece a un solo estado y la suma
es `createdInvitationCount`. No representan acumulados ni número de intentos;
`enviada` excluye las invitaciones ya `entregada`. Los dos ejemplos canónicos
conservan ocho invitaciones con conteos `0/2/6/0`, no catorce eventos acumulados.
AP-02 sigue pendiente: la relación operativa entre estado agregado e intentos y
cuándo un error transitorio pasa a `fallida` no quedan resueltos por esta
proyección. No se introducen reintentos, transiciones ni umbrales de fallo terminal.

## 7. Respuestas y errores

- Las respuestas con cuerpo usan `application/json`. Cada éxito con cuerpo usa
  la envoltura `data`; cada error usa el mismo esquema y un `correlationId` opaco.
  Un 204 declarado no lleva cuerpo ni envoltura JSON.
- Usar códigos HTTP con semántica uniforme:
  - `200`: lectura o mutación completada con respuesta.
  - `201`: recurso creado.
  - `204`: éxito sin cuerpo, solo cuando el contrato lo declara.
  - `400`: solicitud malformada o parámetros inválidos.
  - `401`: sesión ausente, inválida o vencida.
  - `403`: actor autenticado sin permiso para una acción que no revele datos.
    Dos códigos específicos comparten el mensaje genérico de `ACCESS_DENIED`
    (ADR-004): `MFA_REQUIRED` cuando falta AAL2 y `STEP_UP_REQUIRED` cuando el
    step-up (TOTP de 5 min o menos) está ausente o vencido. Un 403 por Origin
    o CSRF ausente o inválido usa `ACCESS_DENIED`.
  - `409` también cubre `STATE_CONFLICT` por una política de reconocimiento
    suspendida que se intenta publicar o retirar.
  - `404`: recurso inexistente o no visible para ese actor; no confirmar
    existencia de recursos ajenos.
  - `409`: conflicto de estado, concurrencia o clave idempotente incompatible/en
    curso.
  - `410`: token o enlace de un solo uso vencido o consumido, si el contrato
    aprobado elige distinguir ese caso de `404`/`409`.
  - `422`: solicitud bien formada pero inválida semánticamente.
  - `429`: límite de intentos o abuso alcanzado.
  - `500`/`503`: fallo interno o indisponibilidad, con mensaje genérico.
- El cuerpo de error contiene solo código estable, mensaje seguro y
  `correlationId`. No expone stack, SQL, nombres de proveedores, existencia de
  recursos ajenos ni valores de PII. No devolver cuerpos de validación internos
  si pueden revelar estructura protegida.
- Errores, telemetría y access logs respetan RNF-OBS-01/02: solo allowlist de
  evento/resultado/estado HTTP/duración/entorno/plantilla de ruta/correlation ID.
  Nunca registrar cuerpos, query strings, URL completa, headers/cookies/tokens,
  PII, coordenadas exactas ni claves idempotentes.

## 8. Colecciones y consultas

- Paginar todas las colecciones no acotadas; fijar límite máximo en servidor.
  Filtros y ordenamientos deben tener nombre y dominio allowlisted. No aceptar
  nombres arbitrarios de columna o dirección SQL desde query params.
- Aplicar el scope de usuario/hospital en el repositorio/consulta, no después de
  descargar filas globales. Seleccionar únicamente columnas necesarias para el
  DTO; no usar `SELECT *` en datos sensibles.
- Parametrizar valores SQL. Identificadores de SQL dinámico solo se toman de
  allowlists del servidor. No construir consultas concatenando datos del request.
- Evitar N+1 y cargas sin límite. Añadir índices a partir de restricciones y
  patrones medidos; validar planes `EXPLAIN` y objetivos p95 sin sobreindexar.
- El mapa opcional devuelve solo celdas fijas de 1 km con `k >= 5`, centro
  redondeado a dos decimales y datos de una necesidad propia; nunca perfiles,
  coordenadas individuales o filtros arbitrarios diferenciables.

La consulta draft `GET /api/v1/hospitals/me/sites` requiere sesión de un
`admin_hospitalario` en AAL2 y membresía protegida vigente. El servidor deriva el
hospital de la identidad actual y la membresía, exige hospital activo autorizado
y consulta únicamente sedes propias activas y aprobadas. No recibe selectores de
hospital ni filtros adicionales: solo reutiliza `Limit` (entero 1–100, default 20)
y `Cursor` (opaco, máximo 512); query inválida o desconocida usa `400` uniforme.
El orden es `siteId` ascendente y el cursor queda scoped por el servidor a la
institución autorizada y a ese orden. La envoltura cerrada es `data` con `items`
y `pagination` requerida; cada sede exige únicamente `siteId` UUID y
`publicName` de 1–160 caracteres. No incluye hospitalId, dirección, coordenadas,
flags administrativos ni contacto. Sin sedes elegibles responde `200` con lista
vacía y `nextCursor: null`; errores `400/401/403/500` reutilizan `ErrorResponse`.
Al crear una necesidad se revalidan la membresía y la sede; listar no concede
autorización futura. Se preserva el POST ratificado y su catálogo existente,
incluido el `422` idéntico para sede inexistente, ajena o inactiva. Esta consulta
no tiene handler stateful, UI ni solicitud Bruno añadidos en este slice.

Las reglas anteriores son objetivo contractual/productivo, no una declaración de
conformidad completa del mock. Express implementa cursor completo solo en
`listOwnInvitationBatches`, scoped al hospital/necesidad y con orden estable.
Las otras siete colecciones paginadas del subconjunto ignoran cursor y devuelven
`nextCursor: null`: invitaciones, historial y solicitudes propias del donante;
necesidades y respuestas del hospital; hospitales y auditoría del superadmin.
Algunas solo recortan con limit; otras lo ignoran. El detalle y límites del cliente
están en [la guía de entrega](Frontend-Handoff.md#8-paginación-y-límites-stateful-restantes).
No extender estos límites a la API real ni afirmar paginación stateful global.

## 9. Versionado y compatibilidad

- El prefijo `/api/v1` del OpenAPI es una propuesta de convención. Ratificarlo
  antes de publicar una ruta.
- Preferir cambios aditivos compatibles. No cambiar silenciosamente tipo,
  significado, unidad, valores enum, orden estable o proyección de una respuesta.
- Cualquier cambio incompatible requiere contrato/versionado revisado y una
  migración de consumidores acordada; no mantener versiones paralelas sin
  decisión documentada.
- La especificación y sus ejemplos solo usan datos sintéticos; no incluir
  tokens, correos reales, coordenadas exactas ni secretos.

## 10. Pruebas para aceptar una operación

- Pruebas de contrato para entrada cerrada, límites, enum, UUID, DTO allowlist y
  formato de error.
- Pruebas negativas de roles, dueño, hospital falsificado, recurso ajeno, campos
  prohibidos e IDOR tanto por API como con acceso directo a Supabase/RLS.
- Pruebas de integración contra PostgreSQL para transacciones, restricciones
  únicas, RLS, carreras, replay, vencimientos y rollback de fallos intermedios.
- Verificar idempotencia con concurrencia y payload diferente para la misma
  clave.
- Medir conforme a RNF-PER: matching p95 < 2 000 ms con carga especificada y
  operaciones API comunes p95 < 500 ms con concurrencia 10.
- Revisar logs y telemetría con valores canario para confirmar que no contienen
  PII ni secretos.

## 11. Uso del JSON en Swagger Editor

1. Usar **Swagger Editor 5 con soporte OpenAPI 3.1**. Editor 4 no soporta este
   contrato. Abrir [Swagger Editor](https://editor.swagger.io/) y comprobar versión;
   no degradar el JSON ni crear un YAML duplicado.
2. Importar `docs/openapi.json` mediante **File → Import File** o pegar el JSON;
   revisar validación, modelos, operaciones, ejemplos y 204 sin cuerpo.
3. La importación/renderización visual **no se efectuó en esta entrega** y no se
   instaló tooling Editor local. Permanece pendiente humano; lint/runner no
   sustituyen esa comprobación. Senior registra versión y resultado.
4. Separar importación de **Try it out**: la URL `servers` no evita restricciones
   Origin/CORS/cookies/CSRF del origen alojado. No garantizar una sesión ni ampliar
   allowlists para Swagger. Usar web local o Bruno para operaciones autenticadas.
5. Para Prism, iniciar `npm run mock:prism` (4010); para el subconjunto stateful,
   `npm run dev` (web 5173, Express 4011). La web tiene proxy 4011 fijo y no dispone
   de selector/fallback a Prism; las operaciones faltantes devuelven 404 en Express.
6. Ejecutar `npm run test:contract` para cobertura estática global y
   `npm run test:bruno` para escenarios con reset aislado y reporte sin cuerpos/
   headers. La guía describe cuándo usar cada uno y cómo preparar Bruno manual.

Prism es stateless: deriva respuestas de ejemplos/esquemas, valida la forma de
solicitud y no conserva cambios entre llamadas. El mock Express stateful conserva
solo estado sintético en RAM y tiene `/__mock/reset` fuera del OpenAPI, habilitado
únicamente en desarrollo y loopback, protegido por Origin local y una capacidad
aleatoria entregada por el runner. La colección Bruno tiene grupos stateful
conmutables por rol; el grupo hospital consume el estado de respuesta del grupo
donante para comprobar AP-03. Ningún mock prueba auth/RLS real, correo,
transacciones ni comportamiento concurrente productivo. Swagger Editor alojado
en otro origen no debe añadirse a la allowlist real de CORS/Origin; para probar
cookies HttpOnly usa la web local con origen permitido.

### 11.1 Cobertura global y sincronización

El inventario contractual tras E2/E3 tiene 55 paths/70 operaciones/96 schemas,
26 ejemplos media de entrada, 68 éxitos JSON y 2 vacíos 204.
`npm run test:contract` encadena la suite contractual (72 pruebas registradas)
y el runner HTTP. Su inventario fijo revisado comprende **377 casos**:
70 éxitos + 34 variantes en 16 colecciones + **273 errores declarados forzados**.
La consulta de sedes aporta dos ejemplos media (`vacio` y `pagina`) y cuatro
errores; el `400` del DELETE agrega el caso final respecto de E2 (376/272).
La moderación conserva un ejemplo media singular, sin agregar variantes.
El preflight QA exige el inventario final completo; no se relaja ni se omite.
Estas cifras no afirman una ejecución HTTP exitosa. Ajv2020 verifica schemas y
selección exacta; audita además 35 valores de ejemplo en anotaciones de schema,
incluso eclipsados.
El runner falla cerrado ante tuplas/refs/ejemplos/cobertura inválidos o deriva de
los dos tipos regenerados en memoria. Los errores forzados no prueban autorización
ni detección productiva de abusos.

La discrepancia histórica de Prism `--errors` en `getCsrfToken` (500) ocurrió
cuando el schema de salida anotaba el token como `writeOnly` y Prism lo excluía
al normalizar la respuesta. Ahora el contrato usa `readOnly` porque el token es
de salida, no para acomodar el tooling. El gate conserva modo normal + Ajv sobre
el schema original, sin retirar anotaciones, relajar límites ni omitir operaciones.
No se ejecutó el modo `--errors` tras esta corrección ni se afirma PASS en él.
El resumen del runner HTTP usa conteos revisados: 70 operaciones, 68 respuestas
JSON de éxito, 2 respuestas 204 vacías, 26 operaciones con cuerpo, 34 variantes
en 16 colecciones y 273 respuestas de error declaradas (377 checks HTTP); Q2
(2026-10-12) auditó además 35 ejemplos de schema. Son inventarios y
comprobaciones de contrato, no cobertura productiva ni evidencia de autorización;
no se cambian los gates.

Ciclo del dueño contractual: editar solo JSON → `npm run openapi:lint` →
`npm run test:contract`; ante `TYPE_DRIFT` revisado, `npm run openapi:types` →
repetir `npm run test:contract` → `npm run typecheck`. No editar tipos a mano.
Antes de reimportar Bruno ejecutar `bru import openapi --help`, importar con
`--collection-format bru` a temporal nuevo y comparar sin sobrescribir scenarios,
env ni ajustes de runtime. Comando completo en
[Frontend-Handoff.md](Frontend-Handoff.md#ciclo-de-actualización-json--tipos--bruno).

Las 69 solicitudes principales Bruno preexistentes y sus 26 bodies están
canonizados para su inventario anterior, sin la nueva consulta de sedes, pero
11 paths token y 2 grants quedan vacíos para valores sintéticos runtime.
`environments/prism.bru` solo contiene baseUrl. Los examples secundarios heredados
no se canonizaron: pueden tener apiKey placeholder/entradas incompletas y no son
auth ni contrato vigente. La aceptación Q1 (2026-10-12) registró `npm test`
151/151 (mock 50, web 15, DTO 86), suite contractual 72/72, Bruno CLI 24
requests/29 tests y E2E 10/10. Son resultados de esas suites y corridas; no
representan cobertura ni implementación de API productiva, autenticación o RLS.
No confundirlos con 70 secuencias stateful ni con cobertura de la consulta nueva.

Para E2E usar `npm run test:e2e -- --trace=off`: la configuración conserva
`retain-on-failure` y sus trazas pueden guardar headers/cookies/bodies. No compartir
trazas, HAR, cookies ni logs de Prism; revisar/minimizar capturas sintéticas.
Las pruebas y revisiones de este paquete no sustituyen las de producción de §10.

## 12. Pendientes para Sprint 0

- Ratificar individualmente las demás operaciones del inventario de
  `openapi.json` antes de implementarlas, módulo por módulo (D-2); cada
  operación ratificada lleva `x-ratification` y se regenera
  `backend/src/contract/ratified-schemas.generated.json`. Actualizar el
  único contrato canónico si producto ajusta una operación.
- Cookie `__Host-sal_at`, mecanismo CSRF firmado, Origin obligatorio y política
  de CORS (ninguna en producción) quedaron fijados en ADR-004. Pendiente
  confirmar prefijo de versión, esquema de éxito/error y límites de paginación.
- AP-01, AP-03, AP-05 y AP-09 quedaron resueltos en la revisión 1.2 de la línea
  base: aplicar esas reglas a alta asistida, proyección hospitalaria, verificación
  de email e invitaciones/tokens. AP-02, AP-04, AP-06, AP-07 y AP-08 siguen
  pendientes y bloquean solo las cláusulas que dependen de ellos.
- `.opencode/references/project-requirements.md` y `Save_a_Life.xlsx` se
  sincronizan con RF-PRO-05: no pedir, aceptar, guardar o inferir historia de
  donación ni implementar filtro postdonación.
- Cerrar y verificar todas las rutas, schemas, ejemplos y estados de este borrador
  contra requisitos antes de declarar el OpenAPI aprobado.

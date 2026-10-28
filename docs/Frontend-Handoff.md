# Entrega frontend: contrato JSON y mocks de Save a Life

| Campo | Valor |
| --- | --- |
| Corte documental | 2026-10-03, T5 |
| Objetivo | Habilitar trabajo humano frontend sin esperar al backend real |
| Contrato | [openapi.json](openapi.json), OpenAPI 3.1.0, `0.2.0-draft` |
| Estado | Revisiones independientes aprobadas para el handoff local; Swagger Editor visual pendiente |
| Coordinación y evidencia | [Historial de planes](plans/HISTORIAL.md) (el plan de entrega se consolidó allí) |

## 1. Qué se entrega y qué no

Se entregan reglas API, modelos JSON, ejemplos, tipos generados, dos mocks locales,
colección Bruno, pruebas reproducibles y paquetes frontend acotados. El contrato
es un **borrador de trabajo**, no una API productiva ratificada. Las 69 operaciones
pueden probarse estáticamente; solo 25 están registradas en Express. Las otras
44 **no son flujos stateful implementados** ni requieren implementarse para usar
este paquete.

Fuentes: [AGENTS.md](../AGENTS.md), [flujo de agentes](Agent-Workflow.md),
[línea base funcional](1_Primeros_Alcances.md), [ERS en borrador](2_Especificaciones_De_Software.md),
[requisitos normalizados](../.opencode/references/project-requirements.md),
[reglas API](Api-Rules.md), [ADR-001](decisions/ADR-001-stack-del-prototipo.md) y
[ADR-002](decisions/ADR-002-design-first-mock-tooling.md).
La línea base gobierna comportamiento, ADR-001 el stack y ADR-002 el tooling local.
Esta guía no cambia esas decisiones ni resuelve AP-02/AP-04/AP-06/AP-07/AP-08.

No se entrega PostgreSQL/RLS, Supabase Auth, Resend/outbox, matching, despliegue real
ni evidencia de cumplimiento legal o clínico. No introducir pacientes,
diagnósticos, historia/fecha de donación o datos personales reales.

## 2. Preparar el entorno, paso a paso

Todos los comandos, salvo donde se indique lo contrario, se ejecutan desde la
raíz que contiene `package.json` y `package-lock.json`.

1. Obtener el checkout del equipo; conservar el lockfile único y los cambios
   previos. No regenerar dependencias para resolver un problema de onboarding.
2. Usar Node **24.19.0** y npm **12.0.2**. Con nvm disponible:

   ```bash
   nvm use
   node --version
   npm --version
   ```

   `.nvmrc` selecciona Node. Si las versiones no coinciden, preparar el entorno
   antes de instalar; no asumir que instalar Node ajusta también npm correctamente.
3. Comprobar Bruno CLI **4.2.0**, herramienta externa al workspace:

   ```bash
   bru --version
   bru import openapi --help
   ```

   Si falta Bruno, instalarlo mediante el procedimiento aprobado del equipo y
   volver a comprobar la versión. No añadirlo como dependencia del proyecto.
4. Instalar de forma reproducible:

   ```bash
   SCARF_ANALYTICS=false npm ci
   ```

   npm 12 debe respetar `allowScripts` de `package.json`: solo está aprobado
   `esbuild@0.28.2`; `@scarf/scarf` y `protobufjs` están denegados por ADR-002.
   No activar todos los scripts ni aplicar `npm audit fix --force`. Una dependencia
   o script nuevo exige revisión; una discrepancia de lockfile detiene el setup.
5. Comprobar el paquete antes de iniciar la web:

   ```bash
   npm run openapi:lint
   npm run test:contract
   npm run typecheck
   ```

No se necesitan claves Supabase/Resend ni un `.env` con secretos. Los mocks no
deben arrancar con `NODE_ENV=production`.

## 3. Elegir el modo adecuado

| Modo | Comando | Dirección | Uso y límite |
| --- | --- | --- | --- |
| Web + Express | `npm run dev` | Web `http://127.0.0.1:5173`, mock `127.0.0.1:4011` | Recorridos del subconjunto con RAM sintética |
| Prism manual | `npm run mock:prism` | `127.0.0.1:4010` | Solicitudes independientes y selección de ejemplos |
| Contrato automatizado | `npm run test:contract` | Prism efímero en loopback | Inicia, verifica y cierra su propio proceso; no necesita 4010 ocupado |
| Escenarios Bruno | `npm run test:bruno` | Express efímero en loopback | Reset aislado y secuencias donante→hospital |
| API futura | Sin servidor entregado | `127.0.0.1:3000` en OpenAPI | Placeholder, no una API disponible |

La web usa `/api/v1` relativo y `credentials: same-origin` en
[client.ts](../apps/web/src/api/client.ts). El [proxy Vite](../apps/web/vite.config.ts)
apunta **fijo a 4011**. No hay selector de base URL ni fallback a Prism. Seleccionar
otro `server` en Swagger/Bruno **no cambia la web**. Una operación solo Prism
invocada contra Express devuelve el fallback 404.

Para avanzar módulos aún no stateful, usar Prism con Bruno/runner y desarrollar
componentes con entradas tipadas y ejemplos en pruebas. Conectar esas pantallas a
un proveedor runtime diferente requiere una slice explícita posterior, con dueño
y revisión; no enrutar silenciosamente peticiones entre mocks.

### 3.1 Recorrer la demo stateful

1. Ejecutar `npm run dev` y abrir exactamente `http://127.0.0.1:5173`, no cambiarlo
   por `localhost`: Origin y cookies son parte del entorno local.
2. Entrar desde el selector de cuentas sintéticas: donante, hospital o superadmin.
3. Donante: perfil/disponibilidad, invitaciones, historial y solicitudes propias.
   Los valores propuestos para corrección son placeholders no editables; el mock
   guarda campos solicitados, no aplica una corrección ni eliminación.
4. Hospital: necesidades, respuestas y lotes. Crear una necesidad genera un
   **borrador**; activar/cerrar/cancelar mediante PATCH no está implementado en
   Express. Las necesidades activas de fixtures permiten recorrer lotes.
5. Superadmin: consultas de tareas, hospitales, auditoría y configuración; no
   simulan ejecución de correcciones, grants, cambios maestros ni MFA real.
6. Reiniciar el proceso para recuperar fixtures. `/__mock/reset` está fuera del
   contrato: solo loopback/desarrollo, Origin local y capacidad efímera del runner;
   no se habilita para el navegador ni se publica su capacidad.

El timestamp de expiración de sesión y la simulación AAL2 no fijan TTL, refresh,
sesiones ni autenticación productivas. El mock health/ready tampoco prueba DB.

### 3.2 Idempotencia, lectura y otra intención de lote

- Una clave identifica una **intención**, no un intento HTTP. Reintentar la misma
  intención/payload conserva la clave; una intención distinta necesita otra.
- El cliente conserva la clave ante un resultado incierto: pérdida de red, fallo
  5xx o respuesta ilegible. No interpretar un timeout como «no ocurrió».
- Tras POST 201, la UI mantiene «Solicitud de lote registrada» aunque falle el GET
  del listado. **Reintentar lectura** solo repite GET; no crea otro lote.
- **Actualizar lotes** refresca la lectura. **Cargar más lotes** utiliza el cursor
  recibido; un fallo de página conserva filas/cursor y el retry no hace POST.
- Tras lectura recuperada, **Preparar otro lote** expresa una intención nueva;
  no envía POST por sí mismo. El siguiente **Solicitar lote** usa una clave nueva.
  No se prepara otra intención mientras la lectura esté fallida o la necesidad
  no esté activa.
- En Express, replay de un lote ya registrado puede reproducir 201 después de
  cierre/vencimiento, tras comprobar sesión y propiedad. Una **clave nueva** sobre
  necesidad terminal devuelve 409. Replay no reabre la necesidad ni añade filas.
- Cada registro de lote devuelve cero invitaciones/correos. No ejecuta matching,
  no consulta candidatos y **cero no significa que no existan candidatos**.

Estas garantías son del mock local. No prueban carreras/transacciones PostgreSQL
ni deciden AP-04. Los GET de dominio proyectan vencimiento sin materializarlo en
RAM; no se ha añadido un cron ni un worker real.

## 4. Abrir el JSON en Swagger Editor

**Requisito:** Swagger Editor **5**, compatible con OpenAPI 3.1. Editor 4 no
soporta este contrato; no convertirlo a 3.0 ni mantener YAML duplicado para evitar
esa limitación. Referencia: [Swagger Editor upstream](https://github.com/swagger-api/swagger-editor).

1. Abrir [Swagger Editor](https://editor.swagger.io/) y comprobar que la versión
   instalada/alojada sea 5 con soporte OAS 3.1. El sitio alojado puede cambiar.
2. Usar **File → Import File**, seleccionar `docs/openapi.json`, o pegar su JSON.
   Los nombres de controles pueden variar entre builds de Editor 5.
3. Revisar panel de validación, grupos de operaciones, modelos, campos requeridos,
   enums, `oneOf`, ejemplos y las dos respuestas sin cuerpo 204.
4. Confirmar que las URLs `servers` representan los modos de la sección 3.
5. Registrar resultado humano de importación/renderizado y versión en la bitácora
   de Senior, sin capturas de credenciales, datos sensibles o tokens.

**Estado de esa comprobación:** la importación/renderización visual **no se ha
efectuado** en esta entrega; no se instaló tooling Swagger Editor local. Permanece
pendiente humano. El lint y el runner validan el JSON, pero no sustituyen una
importación visual. No afirmar «Swagger importado y renderizado» por sus resultados.

**Try it out es otra comprobación.** Una petición desde Editor alojado depende de
CORS, Origin, cookies HttpOnly/SameSite, CSRF y restricciones HTTPS→loopback del
navegador. No se garantiza una sesión ni una mutación local desde ese origen. No
añadir Swagger alojado a la allowlist, quitar CSRF ni pegar cookies reales.
Para flujos autenticados, usar la web local o Bruno; para formas, usar Prism/runner.

## 5. Ejemplos y verificación contractual global

[openapi.json](openapi.json) es la **única fuente contractual**. Los dos
`src/api/openapi.ts` se generan, no se editan a mano. Bruno y esta matriz son
artefactos derivados, no contratos alternativos.

`npm run test:contract` ejecuta [27 pruebas del runner](../scripts/prism-contract.test.mjs)
y el [runner HTTP](../scripts/test-prism-contract.mjs). El helper
[prism-contract.mjs](../scripts/prism-contract.mjs):

- verifica el conjunto exacto revisado de 69 tuplas método/ruta/operationId, no
  solo su cardinalidad; cambios legítimos de inventario requieren revisión;
- valida entradas, parámetros, refs locales, exclusión `example`/`examples` media,
  licencia OAS y deriva de los dos tipos regenerándolos **en memoria**;
- audita **35 valores de ejemplo en anotaciones de schema**, incluso los
  eclipsados por ejemplos media y los anidados; no son 35 llamadas adicionales;
- verifica **369 casos HTTP**: 69 éxitos (**67 JSON + 2 vacíos 204**), **32 variantes
  seleccionables en 15 colecciones** y **268 errores declarados forzados**;
- comprueba status, media type, schema con Ajv2020/ajv-formats y selección exacta
  del ejemplo; falla ante cobertura parcial o deriva, no reporta éxito parcial;
- usa puerto efímero en loopback, límites finitos y cierre del proceso; no acepta
  un target/spec externo ni imprime bodies, headers o logs de Prism.

Los 268 errores usan `Prefer: code=...` con entradas válidas: comprueban forma y
selección de respuestas declaradas, **no que el servidor real detecte 268 abusos**.
Las variantes se solicitan mediante `Prefer: code=200, example=vacio`, por ejemplo,
en operaciones que contienen ese nombre. Sus nombres exactos figuran en la matriz.
Prism no conserva un POST para un GET posterior; una página o respuesta confirmada
seleccionada es un fixture, no una transición ejecutada.

### Discrepancia conocida: Prism `--errors` y `writeOnly`

El runner usa el modo estático **normal** de Prism aprobado en ADR-002, no
`--errors`. En Prism 5.16.0, `--errors` aplica normalización adicional de salida
que elimina `writeOnly`: `getCsrfToken` con el ejemplo requerido de token termina
en 500. El runner normal + Ajv2020 valida el schema original, conserva la anotación
`writeOnly` y no omite CSRF, ejemplos ni operaciones. No retirar esa anotación ni
alterar schemas para satisfacer esta modalidad. Es una discrepancia de tooling
documentada, no prueba de auth, no garantía de que todos los consumidores apliquen
igual esa anotación y no aprobación de seguridad productiva.

### Ciclo de actualización JSON → tipos → Bruno

Solo el dueño autorizado de la slice contractual cambia `docs/openapi.json`.
Tras editar:

```bash
npm run openapi:lint
npm run test:contract
```

Si el único fallo es `TYPE_DRIFT`, los tipos aún reflejan el JSON anterior. Revisar
el cambio, regenerar ambos y repetir el gate; no editar tipos ni silenciar errores:

```bash
npm run openapi:types
npm run test:contract
npm run typecheck
```

Otros fallos no se arreglan regenerando tipos. Si cambia alcance, variantes o
errores, actualizar la cobertura revisada mediante asignación/revisión independiente,
no recalcular automáticamente el inventario congelado para convertir el fallo en verde.

Para actualizar Bruno, **comprobar primero la CLI**. Desde la raíz, importar a
un directorio temporal nuevo, nunca directamente sobre `bruno/`:

```bash
bru import openapi --help
BRUNO_IMPORT_DIR="$(mktemp -d /tmp/save-a-life-bruno.XXXXXX)"
bru import openapi --source docs/openapi.json \
  --output "$BRUNO_IMPORT_DIR" --collection-format bru \
  --group-by tags --collection-name "Save a Life API (borrador)"
```

`--collection-format bru` es explícito: la CLI 4.2.0 tiene otro formato por
defecto. Comparar importación y colección por método/path, entrada canónica y
ejemplos; no reemplazar `scenarios/`, `environments/`, `collection.bru` ni scripts
de runtime. La importación puede introducir placeholders de auth y no conserva
los ajustes de cookie/CSRF automáticamente. El autor autorizado normaliza solo
las plantillas afectadas, actualiza esta matriz si corresponde y ejecuta:

```bash
npm run test:contract
npm run test:bruno
npm run typecheck
git diff --check
```

La importación temporal no es una orden de sobrescritura ni valida por sí misma
las 69 entradas. Revisar también archivos sin seguimiento; un `git diff` vacío
no garantiza sincronización de artefactos nuevos.

## 6. Usar Bruno sin confundir plantillas con escenarios

- Las **69 solicitudes principales** importadas en `Authentication/`, `Donor/`,
  `Hospital/`, `Superadmin/`, `Invitation_action/` y `Health/` están mapeadas al
  contrato; sus **26 bodies** se canonizaron con ejemplos media. Son plantillas,
  no 69 pruebas stateful.
- Las **11 operaciones con path token** y **2 con `X-Contextual-Grant`** mantienen
  esos campos vacíos intencionalmente. Para probar forma en Prism, proporcionar
  valores **sintéticos** de longitud/formato adecuados solo en runtime. No emitir
  tokens reales, registrarlos, ponerlos en screenshots ni guardarlos en env.
- `bruno/environments/prism.bru` solo define `baseUrl`. No aporta Origin,
  `idempotencyKey`, CSRF, cookie o grants. Preparar placeholders sintéticos de
  runtime en Bruno según la operación, o usar `npm run test:contract`, que los
  construye de manera controlada. No ejecutar la colección entera sin preparar
  parámetros y esperar una prueba global válida.
- Para Express, usar sesión demo y cookie jar de Bruno; obtener CSRF para ese
  actor y conservarlo en memoria. El header `session: {{apiKey}}` **no autentica**.
  No copiar cookies entre actores ni almacenar credenciales en environments.
- Los bloques secundarios `example { request: ... }` heredados **no se
  canonizaron**: todavía pueden tener `apiKey` placeholder, bodies incompletos o
  ejemplos de salida antiguos. No usarlos como auth real ni como entradas
  canónicas. La fuente de ejemplos vigente es el JSON y la solicitud principal.
- La clave de ejemplo en `local.bru` no sirve para todas las nuevas intenciones.
  Mantenerla estable para retry; proporcionar una nueva clave runtime al iniciar
  otra intención. No crear una clave diferente para cada intento de la misma.

La ruta recomendada de secuencias con reset y reporte sin bodies/headers es:

```bash
npm run test:bruno
```

El runner ejecuta 1 health + 10 donor + 7 hospital + 4 superadmin = **22 llamadas,
18 operaciones distintas**; hay login/replay repetidos. Donante y hospital comparten
el estado necesario para AP-03; los otros grupos reinician fixtures. Las aserciones
de Bruno no reemplazan Ajv global ni pruebas PostgreSQL/RLS. `Assertions 0/0` en
su reporte no significa cero tests ni cobertura global del contrato.

## 7. Matriz exacta de las 69 operaciones

Leyenda: **Q** = ejemplo de body canónico; **R** = ejemplo exitoso JSON resoluble
(media o schema); entre corchetes, nombres de variantes media; **204 vacío** =
sin cuerpo. Todos los errores declarados también tienen ejemplo y están en el
runner. **Prism ✅** = forma estática; **Express ✅** = handler local, no producto;
**Cliente ✅** = operación usada por `client.ts` (incluye auxiliar CSRF);
**Bruno ✅** = operación ejercitada por `scenarios/`, no solo plantilla importada.
Express **—** identifica las **44 solo Prism**. Límites transversales: secciones
3, 6 y 8; esta matriz no contiene schemas ni reemplaza el JSON.

| Método | Path | operationId | Tag | Ejemplos | Prism | Express | Cliente | Bruno escenarios |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/health/live` | `getLiveness` | Health | R | ✅ | ✅ | — | ✅ |
| GET | `/health/ready` | `getReadiness` | Health | R | ✅ | ✅ | — | — |
| GET | `/api/v1/auth/csrf-token` | `getCsrfToken` | Authentication | R | ✅ | ✅ | ✅ | ✅ |
| GET | `/api/v1/auth/session` | `getCurrentSession` | Authentication | R | ✅ | ✅ | ✅ | — |
| POST | `/api/v1/auth/sessions` | `createSession` | Authentication | Q + R | ✅ | ✅ | ✅ | ✅ |
| DELETE | `/api/v1/auth/sessions/current` | `deleteCurrentSession` | Authentication | 204 vacío | ✅ | ✅ | ✅ | — |
| POST | `/api/v1/auth/password-recovery-requests` | `requestPasswordRecovery` | Authentication | Q + R | ✅ | — | — | — |
| POST | `/api/v1/auth/password-reset-actions/{token}` | `completePasswordReset` | Authentication | Q + R | ✅ | — | — | — |
| POST | `/api/v1/auth/mfa-verifications` | `verifyMfaChallenge` | Authentication | Q + R | ✅ | — | — | — |
| POST | `/api/v1/auth/step-up-verifications` | `verifyStepUp` | Authentication | Q + R | ✅ | — | — | — |
| POST | `/api/v1/donor-registrations` | `createDonorRegistration` | Donor | Q + R | ✅ | — | — | — |
| GET | `/api/v1/donor-email-verification-actions/{token}` | `getDonorEmailVerificationPreview` | Donor | R | ✅ | — | — | — |
| POST | `/api/v1/donor-email-verification-actions/{token}` | `verifyDonorEmail` | Donor | R | ✅ | — | — | — |
| GET | `/api/v1/assisted-activation-actions/{token}` | `getAssistedActivationPreview` | Donor | R | ✅ | — | — | — |
| POST | `/api/v1/assisted-activation-actions/{token}/claim` | `claimAssistedRegistration` | Donor | Q + R | ✅ | — | — | — |
| PUT | `/api/v1/donors/me/onboarding-profile` | `completeDonorOnboarding` | Donor | Q + R | ✅ | — | — | — |
| GET | `/api/v1/donors/me/profile` | `getOwnDonorProfile` | Donor | R | ✅ | ✅ | ✅ | ✅ |
| PATCH | `/api/v1/donors/me/profile` | `updateOwnDonorParticipation` | Donor | Q + R | ✅ | ✅ | ✅ | — |
| GET | `/api/v1/donors/me/invitations` | `listOwnInvitations` | Donor | R [vacio,pagina] | ✅ | ✅ | ✅ | ✅ |
| GET | `/api/v1/donors/me/invitations/{invitationId}` | `getOwnInvitation` | Donor | R | ✅ | ✅ | — | — |
| PATCH | `/api/v1/donors/me/invitations/{invitationId}/response` | `changeOwnInvitationResponse` | Donor | Q + R | ✅ | ✅ | ✅ | ✅ |
| GET | `/api/v1/donors/me/responses` | `listOwnResponseHistory` | Donor | R [vacio,pagina] | ✅ | ✅ | ✅ | ✅ |
| GET | `/api/v1/donors/me/correction-requests` | `listOwnCorrectionRequests` | Donor | R [vacio,pagina] | ✅ | ✅ | ✅ | ✅ |
| POST | `/api/v1/donors/me/correction-requests` | `createOwnCorrectionRequest` | Donor | Q + R | ✅ | ✅ | ✅ | ✅ |
| GET | `/api/v1/donors/me/correction-requests/{requestId}` | `getOwnCorrectionRequest` | Donor | R | ✅ | ✅ | ✅ | ✅ |
| GET | `/api/v1/donor-email-change-actions/{token}` | `getEmailChangePreview` | Donor | R | ✅ | — | — | — |
| POST | `/api/v1/donor-email-change-actions/{token}` | `verifyEmailChange` | Donor | R | ✅ | — | — | — |
| GET | `/api/v1/donors/me/recognition-policies` | `listPublishedRecognitionPolicies` | Donor | R [vacio,pagina] | ✅ | — | — | — |
| GET | `/api/v1/legal-information/donation-work` | `getDonationWorkInformation` | Donor | R | ✅ | — | — | — |
| GET | `/api/v1/invitation-actions/{token}` | `getInvitationActionPreview` | Invitation action | R | ✅ | — | — | — |
| POST | `/api/v1/invitation-actions/{token}/response` | `recordInitialInvitationResponse` | Invitation action | R | ✅ | — | — | — |
| GET | `/api/v1/hospitals/me/needs` | `listOwnHospitalNeeds` | Hospital | R [vacio,pagina] | ✅ | ✅ | ✅ | ✅ |
| POST | `/api/v1/hospitals/me/needs` | `createHospitalNeed` | Hospital | Q + R | ✅ | ✅ | ✅ | ✅ |
| GET | `/api/v1/hospitals/me/needs/{needId}` | `getOwnHospitalNeed` | Hospital | R | ✅ | ✅ | — | — |
| PATCH | `/api/v1/hospitals/me/needs/{needId}` | `transitionOwnHospitalNeed` | Hospital | Q + R | ✅ | — | — | — |
| GET | `/api/v1/hospitals/me/needs/{needId}/invitation-batches` | `listOwnInvitationBatches` | Hospital | R [vacio,pagina] | ✅ | ✅ | ✅ | ✅ |
| POST | `/api/v1/hospitals/me/needs/{needId}/invitation-batches` | `requestInvitationBatch` | Hospital | R | ✅ | ✅ | ✅ | ✅ |
| GET | `/api/v1/hospitals/me/needs/{needId}/responses` | `listOwnNeedResponses` | Hospital | R [vacio,opacaSinRespuesta,confirmada,rechazadaOpaca] | ✅ | ✅ | ✅ | ✅ |
| GET | `/api/v1/hospitals/me/assisted-signups` | `listOwnAssistedSignups` | Hospital | R [vacio,pagina] | ✅ | — | — | — |
| POST | `/api/v1/hospitals/me/assisted-signups` | `createAssistedSignup` | Hospital | Q + R | ✅ | — | — | — |
| GET | `/api/v1/hospitals/me/assisted-signups/{signupId}` | `getOwnAssistedSignup` | Hospital | R | ✅ | — | — | — |
| POST | `/api/v1/hospitals/me/assisted-signups/{signupId}/activation-links` | `reissueAssistedActivationLink` | Hospital | R | ✅ | — | — | — |
| GET | `/api/v1/hospitals/me/recognition-policy` | `getOwnRecognitionPolicy` | Hospital | R | ✅ | — | — | — |
| PUT | `/api/v1/hospitals/me/recognition-policy` | `publishOwnRecognitionPolicy` | Hospital | Q + R | ✅ | — | — | — |
| DELETE | `/api/v1/hospitals/me/recognition-policy` | `withdrawOwnRecognitionPolicy` | Hospital | 204 vacío | ✅ | — | — | — |
| GET | `/api/v1/hospital-admin-invitation-actions/{token}` | `getHospitalAdminInvitationPreview` | Authentication | R | ✅ | — | — | — |
| POST | `/api/v1/hospital-admin-invitation-actions/{token}/claim` | `claimHospitalAdminInvitation` | Authentication | Q + R | ✅ | — | — | — |
| GET | `/api/v1/superadmin/task-queue` | `listSuperadminTasks` | Superadmin | R [vacio,pagina] | ✅ | ✅ | ✅ | ✅ |
| GET | `/api/v1/superadmin/hospitals` | `listHospitals` | Superadmin | R [vacio,pagina] | ✅ | ✅ | ✅ | ✅ |
| POST | `/api/v1/superadmin/hospitals` | `createHospital` | Superadmin | Q + R | ✅ | — | — | — |
| GET | `/api/v1/superadmin/hospitals/{hospitalId}` | `getHospital` | Superadmin | R | ✅ | — | — | — |
| PATCH | `/api/v1/superadmin/hospitals/{hospitalId}` | `updateHospital` | Superadmin | Q + R | ✅ | — | — | — |
| GET | `/api/v1/superadmin/hospitals/{hospitalId}/sites` | `listHospitalSites` | Superadmin | R [vacio,pagina] | ✅ | — | — | — |
| POST | `/api/v1/superadmin/hospitals/{hospitalId}/sites` | `createHospitalSite` | Superadmin | Q + R | ✅ | — | — | — |
| PATCH | `/api/v1/superadmin/sites/{siteId}` | `updateHospitalSite` | Superadmin | Q + R | ✅ | — | — | — |
| GET | `/api/v1/superadmin/memberships` | `listHospitalMemberships` | Superadmin | R [vacio,pagina] | ✅ | — | — | — |
| POST | `/api/v1/superadmin/hospital-admin-invitations` | `inviteHospitalAdmin` | Superadmin | Q + R | ✅ | — | — | — |
| PATCH | `/api/v1/superadmin/memberships/{membershipId}` | `revokeHospitalMembership` | Superadmin | Q + R | ✅ | — | — | — |
| GET | `/api/v1/superadmin/correction-requests` | `listCorrectionRequests` | Superadmin | R [vacio,pagina] | ✅ | — | — | — |
| GET | `/api/v1/superadmin/correction-requests/{requestId}` | `getCorrectionRequest` | Superadmin | R | ✅ | — | — | — |
| PATCH | `/api/v1/superadmin/correction-requests/{requestId}` | `decideCorrectionRequest` | Superadmin | Q + R | ✅ | — | — | — |
| GET | `/api/v1/superadmin/correction-requests/{requestId}/donor-data` | `getContextualDonorData` | Superadmin | R | ✅ | — | — | — |
| POST | `/api/v1/superadmin/correction-requests/{requestId}/executions` | `executeApprovedCorrectionRequest` | Superadmin | R | ✅ | — | — | — |
| POST | `/api/v1/superadmin/access-grants` | `createContextualAccessGrant` | Superadmin | Q + R | ✅ | — | — | — |
| GET | `/api/v1/superadmin/configuration` | `getSuperadminConfiguration` | Superadmin | R | ✅ | ✅ | ✅ | — |
| PATCH | `/api/v1/superadmin/configuration` | `setFinalDemoAt` | Superadmin | Q + R | ✅ | — | — | — |
| GET | `/api/v1/superadmin/audit-events` | `listAuditEvents` | Superadmin | R [vacio,pagina] | ✅ | ✅ | ✅ | ✅ |
| GET | `/api/v1/superadmin/recognition-policies` | `listRecognitionPoliciesForModeration` | Superadmin | R [vacio,pagina] | ✅ | — | — | — |
| PATCH | `/api/v1/superadmin/recognition-policies/{hospitalId}/moderation` | `moderateRecognitionPolicy` | Superadmin | Q + R | ✅ | — | — | — |

Totales: **54 paths / 69 operaciones / 94 schemas; Prism 69; Express 25;
solo Prism 44; cliente 21; escenarios Bruno 18**. Cliente incluye 20 métodos
públicos + operación CSRF auxiliar, no 21 pantallas. Reset no es una operación
contractual. Por tag, contractual/Express: Health 2/2, Authentication 10/4,
Donor 19/9, Invitation action 2/0, Hospital 14/6 y Superadmin 22/4.

## 8. Paginación y límites stateful restantes

La paginación completa del mock está limitada a
`GET /api/v1/hospitals/me/needs/{needId}/invitation-batches`: `limit` 20 por defecto,
máximo 100; orden ascendente por `createdAt` y `batchId`; cursor opaco scoped al
hospital/necesidad; 400 para cursor inválido y 404 para necesidad ajena. No analizar
ni construir cursores en frontend. El cliente conserva `pagination.nextCursor` y
la UI consume páginas sin duplicar registros por `batchId`.

Estas **otras siete colecciones contractualmente paginadas** aún ignoran `cursor`
en Express y devuelven `nextCursor: null`:

| Operación | Límite local actual |
| --- | --- |
| `listOwnInvitations` | Ignora limit/cursor y devuelve todas las invitaciones propias |
| `listOwnResponseHistory` | Aplica limit a los últimos eventos, invierte orden; ignora cursor |
| `listOwnCorrectionRequests` | Aplica limit; ignora cursor |
| `listOwnHospitalNeeds` | Aplica status/limit; ignora cursor |
| `listOwnNeedResponses` | Ignora limit/cursor y devuelve las respuestas propias |
| `listHospitals` | Aplica limit al catálogo sintético; ignora cursor |
| `listAuditEvents` | Aplica limit al fixture; ignora cursor |

El cliente de estas listas descarta pagination; no usar el mock para certificar
recorridos completos de más de una página ni conteos globales de una lista
truncada. No se ampliaron esas siete paginaciones en esta entrega. Task queue
tiene un fixture fijo sin contrato de cursor; no presentarlo como cola productiva.

## 9. Pruebas, privacidad de evidencia y aceptación

```bash
npm run openapi:lint
npm run test:contract
npm test
npm run test:bruno
npm run test:e2e -- --trace=off
npm run typecheck
npm run lint
npm run build
npm run audit:production
git diff --check
```

Si falta Chromium, ejecutar `npx playwright install chromium` con las dependencias
ya instaladas. Para E2E, detener previamente `npm run dev`: Playwright inicia sus
propios servidores y no reutiliza los existentes. No iniciar Playwright directo
sin `scripts/test-e2e.mjs`, que genera la capacidad reset aislada.

**Seguridad de evidencia:** `playwright.config.ts` conserva `trace: retain-on-failure`.
Por eso los comandos de esta guía lo sobrescriben con **`--trace=off`**; no se
modificó esa configuración. Las trazas pueden capturar red, cookies, tokens,
headers y cuerpos incluso sintéticos; no ejecutarlas ni compartirlas. Screenshots
de fallos y las capturas explícitas de E2E aún pueden mostrar datos demo: inspeccionar
y minimizar antes de compartir, nunca usar PII real. No activar verbose HTTP,
exportar cookie jars/HAR, copiar logs de Prism o adjuntar bodies/headers a reportes.
Prism manual puede escribir rutas/parámetros en consola; para paths con token
preferir el runner, cuyos logs del proceso hijo se descartan.

Según la evidencia QA registrada en el plan para T4b/T4c: API **50**, web **15**,
runner **27 + 369 HTTP**, Bruno **22**, E2E **10 × 3 = 30** ejecuciones exitosas
sin retries, typecheck/lint/build/OpenAPI y audit runtime **0 vulnerabilidades**.
Son resultados del corte, no promesa futura ni sustituto de una nueva ejecución.
`lint` actual equivale a `tsc --noEmit`, **no un linter independiente**. Audit
runtime no significa audit completo limpio: el residual dev Prism de ADR-002
exige loopback/spec local confiable y revisión antes de release o 2026-11-01.

Criterio del **paquete habilitador**: contrato único y ejemplos verificables,
cobertura estática global, subconjunto stateful declarado y probado, instrucciones
humanas claras y revisión independiente. Criterio del **producto** pendiente:
autorización/RLS reales, transacciones/idempotencia concurrente, proveedores,
migraciones/despliegue y pruebas correspondientes. No confundirlos ni exigir
implementar los 44 flujos para completar este handoff.

## 10. Paquetes frontend siguientes listos para asignación

Son **recomendaciones de asignación**, no tareas delegadas, aprobadas ni hechas.
Senior crea una slice/plan por paquete, congela las operaciones indicadas y usa
[Agent-Workflow](Agent-Workflow.md). Referencia visual: [Frontend-Design](Frontend-Design.md).

### Reglas comunes de ownership e integración

- Cada paquete tiene un solo implementador. Los archivos nuevos enumerados abajo
  son rutas propuestas, no archivos entregados; sus nombres no fijan rutas URL nuevas.
- `apps/web/src/api/client.ts` es **compartido y exclusivo por slice**: ninguno de
  estos paquetes lo modifica en paralelo. Tampoco `Workspace.tsx`, `App.tsx`,
  `styles.css` o `Ui.tsx`. Senior asigna una slice de integración posterior a
  `dev-frontier`, con dueño único para esas rutas y wrappers solo de las operaciones
  ratificadas para esa slice. Un selector/proveedor Prism de runtime, si se desea,
  requiere diseño/revisión explícitos; no está entregado ni autorizado por esta guía.
- Todos excluyen mock/backend, JSON, tipos generados, Bruno, dependencias/lockfile,
  ADRs y resolución de AP. No escribir `tasks/*` ni planes desde el subagente.
- En modo solo Prism, entregar componentes tipados con `data/loading/error` como
  entradas y pruebas usando ejemplos del JSON (sin clonar schemas). Bruno/runner
  verifica HTTP aparte; los componentes no afirman persistencia ni éxito real de
  mutaciones. Integración web live queda explícitamente separada.
- Aceptación común: typecheck, tests de componentes con carga/vacío/error y datos
  contractuales, teclado/foco y 320/390 px sin overflow; errores seguros, sin PII
  ajena ni afirmaciones médicas/legales. E2E pertinentes solo mediante el runner,
  `--trace=off`; QA registra qué se prueba con fixtures y qué con Express.
- `reviewer-front` revisa inmediatamente todo slice y tests frontend; para tests
  ordinarios, `tester` como dueño único; para tokens/roles/retry/concurrencia,
  `qa-reliability-engineer` en lugar de Tester. Añadir `security-privacy-auditor`
  por PII/tokens/auth y `clinical-safety-reviewer` por copy clínico. Ningún autor
  aprueba su artefacto ni sustituye esas revisiones por tests verdes.

### F-D: lecturas informativas del donante — `dev-frontier`

- **Archivos nuevos propios:** `apps/web/src/pages/DonorInformationPage.tsx` y
  `apps/web/src/pages/DonorInformationPage.test.tsx`.
- **Contrato/dependencia:** `listPublishedRecognitionPolicies`,
  `getDonationWorkInformation`; ambos solo Prism. Tipos de
  `RecognitionPolicyListEnvelope` y `LegalInformationEnvelope` ya generados.
- **Entrega:** componentes de políticas e información común, probados con
  ejemplos del JSON; no conectados automáticamente al proxy 4011.
- **Aceptación específica:** vacío/página, reconocimientos neutrales sin ranking,
  mostrar aviso y no conclusiones con contenido legal en borrador/retirado;
  no afirmar entrega, asistencia, elegibilidad ni permiso laboral garantizado.
- **Tests/review:** casos de estado y copy además de aceptación común;
  `reviewer-front`, gate clínico/legal competente si se altera contenido aprobado.

### F-H: estados de altas asistidas — `frontend-accessibility-engineer`

- **Archivos nuevos propios:** `apps/web/src/pages/AssistedSignupStatusPage.tsx` y
  `apps/web/src/pages/AssistedSignupStatusPage.test.tsx`.
- **Contrato/dependencia:** `listOwnAssistedSignups`, `getOwnAssistedSignup`, tipos
  `AssistedSignupListEnvelope`/`AssistedSignupCreatedEnvelope`; solo Prism.
- **Entrega:** listado/detalle accesible de estados y fechas mínimas. No crear ni
  reemitir altas, recoger emails nuevos o implementar consumo de token.
- **Aceptación específica:** lectura vacía/cargada/error, navegación teclado y
  foco al detalle; no mostrar identidad/perfil de donante ni interpretar el estado
  sintético como cuenta real. No prometer que Prism recuerda cambios.
- **Tests/review:** variantes y fallos de lectura con fixtures; `reviewer-front` y
  auditor de privacidad si integración/campos lo requieren.

### F-S: revisión minimizada de solicitudes — `dev-frontier`

- **Archivos nuevos propios:** `apps/web/src/pages/CorrectionReviewPage.tsx` y
  `apps/web/src/pages/CorrectionReviewPage.test.tsx`.
- **Contrato/dependencia:** `listCorrectionRequests`, `getCorrectionRequest`,
  `CorrectionRequestListEnvelope`/`CorrectionRequestEnvelope`; solo Prism.
- **Entrega:** vistas de campos solicitados/estado, no padrón ni datos previos/nuevos.
  No implementar grants, acceso `donor-data`, aprobar/ejecutar o borrar usuarios.
- **Aceptación específica:** 401/403/404 seguros sin inferir usuario ajeno,
  requestedFields allowlisted, sin acciones privilegiadas habilitadas ficticiamente.
- **Tests/review:** minimización y estados de error además de comunes;
  `reviewer-front` y `security-privacy-auditor` al integrar permisos/PII.

### F-A: vista informativa de acción — `frontend-accessibility-engineer`

- **Archivos nuevos propios:** `apps/web/src/pages/InvitationActionPreviewPage.tsx`
  y `apps/web/src/pages/InvitationActionPreviewPage.test.tsx`.
- **Contrato/dependencia:** `getInvitationActionPreview`/`InvitationActionPreviewEnvelope`,
  solo Prism. El POST `recordInitialInvitationResponse` queda excluido del paquete.
- **Entrega:** componente informativo con estado 404/410; pruebas con datos y
  tokens únicamente sintéticos. No integrar ruta de token real ni terceros.
- **Aceptación específica:** render/GET nunca consume token, no registra URL,
  no mete token en localStorage/analítica ni en copy, foco y errores accesibles;
  expresa intención, no elegibilidad. Integración de headers/URL se asigna aparte.
- **Tests/review:** `qa-reliability-engineer` dueño de tests sensibles;
  `reviewer-front`, `security-privacy-auditor` y gate clínico para copy aplicable.

F-D/F-H/F-S/F-A pueden desarrollarse en paralelo **solo** con los límites anteriores
de componentes nuevos y sin shared paths. La slice de integración es secuencial,
elige modo declarado por operación y no amplía Express por rutina. Una operación
que dependa de AP abierta se detiene en su cláusula afectada, no se inventa.

## 11. Pendientes y traspaso a Senior

- **Pendiente humano:** importación/renderizado real en Swagger Editor 5 y registro
  de la versión/resultado; no comprobado visualmente por T5.
- **Revisiones completadas:** `reviewer-back` y `reviewer-front` aprobaron este
  documento, README y Api-Rules; el gate `security-privacy-auditor` aprobó el
  alcance local sintético. Evidencia y límites en el plan de entrega.
- **Supuesto de trabajo:** contratos draft sirven para colaboración de frontend;
  no quedan ratificados para producción por esta entrega.
- **Recomendación:** asignar primero paquetes de lectura/UX y separar integración
  compartida; no exigir los 44 flujos stateful ni ocultar límites de cursor.
- **Decisiones abiertas:** ratificación Sprint 0, auth/sesión/CSRF/CORS productivos,
  acceso a datos y despliegue, AP-02/AP-04/AP-06/AP-07/AP-08 y validaciones
  profesionales clínicas/legales antes de datos reales. Sin nuevos cron, intervalos
  clínicos, TTL o políticas de reintentos por esta documentación.

Senior conserva la bitácora. El cierre aprobado se limita al paquete local
sintético de contrato/mocks/handoff, no a la API productiva ni a las decisiones
pendientes. La autoría documental no sustituye las revisiones independientes.

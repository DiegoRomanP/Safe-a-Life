# Save a Life

Prototipo académico de coordinación entre hospitales autorizados y donantes en
Lima. La operación está mediada por el hospital; no existe contacto directo entre
paciente y donante.

## Estado actual

Los requisitos y decisiones se conservan en [`Save_a_Life.xlsx`](Save_a_Life.xlsx),
la línea base funcional en [`docs/1_Primeros_Alcances.md`](docs/1_Primeros_Alcances.md)
y una ERS en borrador en [`docs/2_Especificaciones_De_Software.md`](docs/2_Especificaciones_De_Software.md).
El frontend local se desarrolla Design-First sobre [`docs/openapi.json`](docs/openapi.json),
un borrador global de Sprint 0. Únicamente el contrato `POST
/api/v1/hospitals/me/needs` (`createHospitalNeed`) está ratificado para
implementación; las otras 69 operaciones siguen en borrador, incluido el GET de
necesidades. El workspace `backend` ya contiene los tipos, snapshot y validadores
runtime de los DTO de esa operación; todavía no hay handler HTTP productivo para
`createHospitalNeed`, ni autenticación/AAL2, autorización/RLS o persistencia reales
para esa API. El alcance contractual se describe en
[`docs/Backend-Contracts.md`](docs/Backend-Contracts.md).

El corte ejecutable incluye vistas públicas y de demostración para donante,
hospital y superadmin; un mock Express con estado sintético en memoria; Prism
para ejemplos estáticos; colección y escenarios Bruno; y pruebas Playwright.
El donante puede gestionar perfil/disponibilidad, responder invitaciones,
consultar su historial y crear/seguir solicitudes propias. El mock solo registra
los campos solicitados, descarta los valores propuestos y no ejecuta la corrección.
Las operaciones no incluidas en el mock stateful pueden probarse como contrato
estático con Prism, no como flujos con estado.

La [guía de entrega frontend](docs/Frontend-Handoff.md) reúne el setup humano,
Swagger Editor 5, sincronización JSON→tipos→Bruno, matriz exacta y paquetes de
trabajo siguientes. El inventario canónico OpenAPI tiene **57 paths, 72
operaciones y 100 schemas**. Están ratificadas para implementación
las cinco de invitación de admins y recuperación de contraseña (F2b), el webhook de Resend (F4), las cuatro de necesidades (F3: `createHospitalNeed` y listar, consultar y transicionar las
propias), las dos de salud y las 21 de identidad (F2a), es decir
**33**; las otras **39** siguen en borrador y se ratifican módulo por módulo. El inventario no representa
cuántas operaciones están implementadas por el mock, cliente o backend. El mock
Express, sus comprobaciones de readiness y auth siguen siendo demos, no un backend
real. El paquete es habilitador; no declara
terminado el producto ni implementada la API productiva. La documentación y el
alcance local tienen revisiones independientes;
la importación visual en Swagger Editor 5 sigue pendiente de comprobación humana.

## Stack

- Frontend aprobado: React 18 + Tailwind CSS. Desarrollo local con Vite.
- Backend aprobado para producción: Node.js + Express.
- Datos y autenticación futuros: PostgreSQL/Supabase Auth.
- Email futuro: Resend detrás de un adaptador.
- Desarrollo fijado por [`ADR-002`](docs/decisions/ADR-002-design-first-mock-tooling.md):
  Node 24.19.0, npm 12.0.2, TypeScript, React 18, Vite, Tailwind y Express.
- Stack productivo aprobado por [`ADR-001`](docs/decisions/ADR-001-stack-del-prototipo.md).

Java/Spring Boot fue evaluado y descartado para esta fase.

## Arquitectura y límites del backend

- El workspace npm del backend es `backend`, con los DTO de
  `need-records` en `backend/src/modules/need-records/dto/`. `validators.ts`
  valida y proyecta entrada/salida con AJV 2020; no implementa transporte HTTP,
  casos de uso, acceso a datos ni autorización, ni determina elegibilidad clínica.
- `docs/openapi.json` es la fuente contractual. `npm run openapi:types` genera
  desde ella los tipos y snapshot del DTO backend, además de los tipos de web y
  mock; `npm run openapi:api:check` comprueba que estén sincronizados.
- `apps/web` y `apps/mock-api` siguen siendo workspaces separados de tooling.
  `npm run dev` inicia Vite y el mock; no inicia el backend.
- `backend/src/server.ts` es el punto de entrada del backend: valida el entorno
  (`backend/.env.example` lista los nombres) y compone `createApp` mediante
  `backend/src/composition.ts`. Hoy expone salud (`/health/live`, `/health/ready`)
  y los módulos `identity-institutions` (sesión, MFA, instituciones; F2a),
  `need-records` (necesidades del hospital; F3) y `email-delivery` (outbox cifrado, worker y
  webhook de Resend; F4, con `npm run dev:worker`). El resto
  de las operaciones se implementa por módulo tras su ratificación.
  `backend/supabase/` contiene el proyecto Supabase local (migraciones, siembra
  y pruebas pgTAP). `backend/index.js` y `backend/config/` fueron retirados por
  inseguros (CORS abierto, cliente global con la anon key).
- La instalación se hace desde la raíz, cuyo `package-lock.json` es el único
  lockfile npm activo. Los pins exactos del manifiesto `backend` se conservan; el
  traslado no actualizó dependencias. Puede quedar una carpeta local ignorada
  `apps/api` con outputs residuales; no es un workspace ni una segunda fuente y
  no debe limpiarse como parte del setup.

## Ejecutar localmente

Requiere Node `24.19.0`, npm `12.0.2` y Bruno CLI `4.2.0` disponible en `PATH`.
Con nvm disponible, `nvm use`; comprobar versiones antes de instalar.
Ejecutar la instalación en la raíz del repositorio: `npm ci` usa el único
`package-lock.json`; no instalar desde `backend/`.

```bash
node --version
npm --version
bru --version
SCARF_ANALYTICS=false npm ci
npm run dev
```

`npm ci` conserva el lockfile raíz y la policy `allowScripts` de ADR-002: solo
`esbuild@0.28.2` aprobado, Scarf/protobufjs denegados. No habilitar scripts
globalmente ni añadir claves Supabase/Resend; el mock no necesita secretos.

Abrir <http://127.0.0.1:5173>. El comando inicia Vite y el mock Express en
`127.0.0.1:4011`, no el backend legacy. Prism se ejecuta por separado en
`127.0.0.1:4010`:

```bash
npm run mock:prism
```

El proxy web `/api` apunta fijo a **4011**, sin selector de destino ni fallback.
Prism se usa por separado con Bruno o runner contractual; iniciar Prism no habilita
operaciones adicionales en la web stateful.

## Verificación

```bash
npm test                         # Incluye pruebas de mock/web y DTO backend
npm run test:backend:dto         # Validación runtime de DTO need-records
npm run test:backend:db          # pgTAP (requiere `supabase start --workdir backend`)
npm run test:backend:integration # Integración contra Supabase local (reinicia y siembra la base)
npm run test:bruno:backend       # Bruno CLI contra el backend real
npm run test:api:generator       # Pruebas del generador OpenAPI
npm run openapi:api:check        # Comprueba artefactos generados sin escribirlos
npm run test:api                 # Integración del mock con Supertest
npm run test:contract            # Runner Prism + Ajv2020 contra el contrato estático
npm run test:bruno               # Arranca/resetea/cierra el mock y ejecuta escenarios
npm run test:e2e -- --trace=off   # Playwright Chromium sin guardar trazas de red
npm run typecheck
npm run typecheck --workspace backend
npm run build --workspace backend
npm run lint --workspace backend
npm run lint                     # Actualmente equivale a tsc --noEmit
npm run build
npm run openapi:lint
npm run audit:production
```

En la aceptación Q1 registrada el 2026-10-12 se observaron 72 tests del runner de
contrato, 377 checks HTTP y 35 ejemplos schema auditados; Bruno ejecutó 24
requests/29 tests y E2E 10/10. Son conteos de esa ejecución, no cobertura de auth,
RLS ni handlers productivos.

Si el navegador de Playwright no está instalado, ejecutar `npx playwright install chromium`.
Detener `npm run dev` antes de E2E: sus servidores se inician de forma aislada.
La configuración Playwright aún usa `retain-on-failure`; por eso se sobrescribe
con `--trace=off`. No compartir trazas/HAR/headers/cookies/bodies; revisar capturas
sintéticas antes de adjuntarlas. El audit runtime limpio no elimina el residual
dev de Prism documentado en ADR-002.

## Bruno y contrato

- [`docs/Api-Rules.md`](docs/Api-Rules.md): reglas de contrato, seguridad,
  validación y consulta.
- [`docs/Backend-Contracts.md`](docs/Backend-Contracts.md): contrato acotado y
  criterios de aceptación de `createHospitalNeed`; no implica implementación.
- [`docs/openapi.json`](docs/openapi.json): único contrato OpenAPI 3.1 canónico
  del borrador global, con esa única ratificación contractual acotada.
- `bruno/`: colección importada y escenarios sintéticos de los tres roles.
- `npm run test:bruno`: inicia el mock en un puerto local efímero, reinicia el
  estado entre escenarios y suprime cuerpos/headers en el reporte.
- `npm run openapi:types`: regenera el snapshot y los tipos del DTO backend,
  además de los tipos de cliente web y DTO HTTP del mock, desde el JSON canónico.
- `npm run test:contract`: ejecuta el runner Prism + Ajv2020 y sus checks
  fail-closed de inventario/ejemplos y deriva de tipos, sin demostrar auth real.
- La colección Bruno contiene requests sintéticos; las rutas con tokens o grants
  requieren valores sintéticos runtime. Env Prism solo aporta baseUrl. Examples
  secundarios heredados no canonizados pueden contener apiKey placeholder o
  bodies incompletos: no usarlos como auth ni entradas canónicas.
- Swagger Editor **5** soporta OAS 3.1; importación/renderizado visual **pendiente
  humano**, no efectuado ni tooling local instalado. Try it out alojado no garantiza
  Origin/cookies/CSRF y no justifica ampliar CORS. Pasos completos en la guía.
- Editar solo JSON, lint/contract, regenerar tipos si hay TYPE_DRIFT y revalidar;
  reimportar Bruno solo a temporal tras `bru import openapi --help`, preservar
  escenarios/env. No editar tipos ni mantener un segundo contrato.

## Límites del mock

- Solo acepta cuentas, correos `.example.test` y datos sintéticos en RAM. No
  persiste información ni se conecta a Supabase, PostgreSQL, Resend o mapas.
- El mock de solicitudes de corrección acepta solo valores de ejemplo fijados,
  que la UI envía como placeholders no editables; conserva los campos solicitados
  y descarta esos valores. Nunca deben reemplazarse por datos personales reales.
- Una solicitud manual de lote se registra con cero invitaciones y cero correos;
  no representa una ejecución de matching ni que no existan candidatos.
- El éxito POST de lote se conserva aunque falle refresco GET; «Reintentar
  lectura» no envía POST. «Preparar otro lote» habilita una intención nueva y
  clave distinta; un retry incierto conserva la clave de la misma intención.
- Cursor completo solo en lotes; otras siete colecciones ignoran cursor y
  devuelven nextCursor null. La guía detalla limit/truncación; no afirmar que el
  mock valida paginación o conteos globales de todas las listas.
- `/__mock/reset` existe solo en el mock local, escucha en loopback, exige
  Origin local y una capacidad efímera generada por los runners, y no forma parte
  de OpenAPI.
- Cookie, CSRF, AAL2 de demostración y permisos del mock no prueban autenticación,
  autorización ni RLS productivas. La sesión local tiene expiración server-side;
  la interfaz la oculta al vencer y la revalida al volver a la pestaña. La política
  de sesión/refresh productiva sigue pendiente. Los envíos de correo no ocurren.
- La creación de una necesidad la deja como borrador; no ejecuta matching ni
  crea lote de invitaciones.
- La respuesta confirmada es una intención, no asistencia, donación, elegibilidad
  ni suficiencia clínica. El personal competente verifica grupo y seguridad.
- No se solicita ni conserva historial/fecha de donación. No se muestran
  pacientes, diagnósticos ni historias clínicas.
- AP-02, AP-04, AP-06, AP-07 y AP-08 siguen pendientes; el mock no representa
  comportamientos productivos que dependan de ellos.

La dirección visual se describe en [`docs/Frontend-Design.md`](docs/Frontend-Design.md)
y referencia el archivo Save a Life de Penpot y su inventario de rutas.

## OpenCode

La configuración del proyecto vive en `.opencode/`:

- `agent/`: Senior como agente predeterminado y coordinador; DevFrontier,
  DevBack, Tester y los reviewers de área para el ciclo habitual; los seis
  especialistas existentes cubren accesibilidad frontend, backend de datos,
  arquitectura, seguridad/privacidad, clínica y QA de flujos críticos.
- `skills/`: workflows externos revisados y skills propias del dominio.
- `references/project-requirements.md`: versión normalizada de los requisitos.
- `THIRD_PARTY_SKILLS.md`: procedencia, revisiones y licencias.
- `opencode.json`: desactiva compartir sesiones y conserva snapshots locales.

[`docs/Agent-Workflow.md`](docs/Agent-Workflow.md) es la matriz canónica de
selección de agente por dominio/riesgo, coordinación por slices, skills, gates
de revisión y registro por tarea en `docs/plans/`. Senior selecciona un solo
agente escritor por slice y convoca a los especialistas solo cuando se activa su
criterio; los agentes ocultos siguen siendo invocables internamente por su ID.
`AGENTS.md` define las reglas transversales y el enrutamiento de skills/agentes.
Reinicia OpenCode después de modificar cualquiera de estos archivos porque la
configuración y las skills no se recargan durante una sesión activa.

Antes de tratar datos reales se requiere revisión clínica, legal y de privacidad
aplicable en Perú. Este repositorio no afirma cumplimiento legal ni clínico.

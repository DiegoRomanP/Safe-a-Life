# Save a Life

Prototipo académico de coordinación entre hospitales autorizados y donantes en
Lima. La operación está mediada por el hospital; no existe contacto directo entre
paciente y donante.

## Estado actual

Los requisitos y decisiones se conservan en [`Save_a_Life.xlsx`](Save_a_Life.xlsx),
la línea base funcional en [`docs/1_Primeros_Alcances.md`](docs/1_Primeros_Alcances.md)
y una ERS en borrador en [`docs/2_Especificaciones_De_Software.md`](docs/2_Especificaciones_De_Software.md).
Toda la documentación está indexada por libros en [`docs/README.md`](docs/README.md)
y se publica como sitio con VitePress (ver [Documentación](#documentación)).

El proyecto es un monolito modular con dos carpetas de producto:

- **`backend/`**: API Express con Supabase y Resend detrás de adaptadores. Implementa
  salud, `identity-institutions` (sesión, MFA, hospitales, membresías; F2a),
  invitaciones de admin y recuperación de contraseña (F2b), `need-records` (F3),
  `email-delivery` (outbox, worker y webhook de Resend; F4), `donor-records` (F5) y
  `privacy-requests` (F7, sin borrado de cuentas de Auth: ver ADR-006 y P-12).
  De `invitation-coordination` (F6) solo existe el dominio puro; F8 no tiene módulo.
- **`frontend/`**: frontend real (`@save-a-life/frontend`, TypeScript, React 18, Vite,
  Tailwind). La integración con el backend está en curso: el login ya usa la sesión
  y la consulta de CSRF; el resto de las vistas sigue con datos de demostración.
- **`apps/web` + `apps/mock-api`**: demo web contra un mock Express con estado
  sintético en memoria. Su auth, CSRF, AAL2 y permisos son demostraciones.

[`docs/openapi.json`](docs/openapi.json) es el contrato canónico (OpenAPI 3.1,
**58 paths, 73 operaciones y 100 schemas**). Están ratificadas para implementación
**66** operaciones y siete siguen en borrador; las ratificaciones se registran por
operación en `x-ratification` y en [`docs/Backend-Contracts.md`](docs/Backend-Contracts.md).
Implementar una operación no ratificada o cambiar una decisión abierta requiere
aprobación explícita. El inventario no mide cuántas operaciones están implementadas
ni aceptadas: no se declara terminado el backend ni se usan datos reales.

Las operaciones que el mock no implementa con estado pueden probarse como contrato
estático con Prism. La [guía de entrega frontend](docs/Frontend-Handoff.md) reúne el
setup, la sincronización JSON→tipos→Bruno y la matriz de operaciones.

## Stack

- Frontend aprobado: React 18 + Tailwind CSS. Desarrollo local con Vite.
- Backend aprobado para producción: Node.js + Express.
- Datos y autenticación: PostgreSQL/Supabase Auth (backend, vía RPC y RLS).
- Email: Resend detrás de un adaptador, con outbox y worker.
- Desarrollo fijado por [`ADR-002`](docs/decisions/ADR-002-design-first-mock-tooling.md):
  Node 24.19.0, npm 12.0.2, TypeScript, React 18, Vite, Tailwind y Express.
- Stack productivo aprobado por [`ADR-001`](docs/decisions/ADR-001-stack-del-prototipo.md).

Java/Spring Boot fue evaluado y descartado para esta fase.

## Arquitectura y límites del backend

- Workspaces npm: `apps/mock-api`, `apps/web`, `backend` y `frontend`. El único
  lockfile es el `package-lock.json` raíz; nunca se instala desde un workspace.
- `docs/openapi.json` es la fuente contractual. `npm run openapi:types` genera desde
  ella los tipos y validadores del backend, de la web demo y del mock;
  `npm run openapi:api:check` falla si los artefactos generados se desviaron. No se
  editan a mano.
- `backend/src/server.ts` es el punto de entrada (`npm run dev:backend`): valida el
  entorno (`backend/.env.example` lista los nombres) y compone `createApp` mediante
  `backend/src/composition.ts`. Cada módulo de `backend/src/modules/` se divide en
  `domain`, `application`, `http` e `infrastructure`. El worker del outbox es un
  proceso aparte (`npm run dev:worker`).
- Persistencia (ADR-003): funciones PostgreSQL invocadas por RPC de Supabase detrás
  de puertos y adaptadores, con cliente por petición con el JWT del usuario y RLS.
  `service_role` solo se usa según la allowlist de ADR-006. Rol y hospital se
  resuelven desde datos protegidos, nunca desde argumentos del cliente.
  `backend/supabase/` contiene migraciones, siembra y pruebas pgTAP.
- `npm run dev` inicia Vite (`:5173`) y el mock (`:4011`), no el backend.
  `npm run dev:frontend` sirve el frontend real en `127.0.0.1:5174` con proxy de
  `/api` y `/health` al backend en `127.0.0.1:3000`. Ver [`frontend/README.md`](frontend/README.md).

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
`127.0.0.1:4011`, no el backend. Prism se ejecuta por separado en
`127.0.0.1:4010`:

```bash
npm run mock:prism
```

El proxy web `/api` apunta fijo a **4011**, sin selector de destino ni fallback.
Prism se usa por separado con Bruno o runner contractual; iniciar Prism no habilita
operaciones adicionales en la web stateful.

## Verificación

```bash
npm test                         # Vitest en todos los workspaces
npm run test:backend:dto         # Validadores DTO del backend
npm run test:backend:db          # pgTAP (requiere `supabase start --workdir backend`)
npm run test:backend:integration # Integración contra Supabase local (reinicia y siembra la base)
npm run test:bruno:backend       # Bruno CLI contra el backend real
npm run test:api:generator       # Pruebas del generador OpenAPI
npm run openapi:api:check        # Comprueba artefactos generados sin escribirlos
npm run test:api                 # Integración del mock con Supertest
npm run test:contract            # Runner Prism + Ajv2020 contra el contrato estático
npm run test:bruno               # Arranca/resetea/cierra el mock y ejecuta escenarios
npm run test:e2e -- --trace=off  # Playwright Chromium sin guardar trazas de red
npm run lint                     # ESLint 9 + tsc --noEmit en cada workspace
npm run typecheck
npm run build
npm run openapi:lint
npm run audit:production
```

Los conteos de pruebas cambian con el código; los de cada ejecución quedan en el
plan de la tarea correspondiente (`docs/plans/`) y no son cobertura de auth, RLS ni
de flujos productivos. Solo los endpoints del backend real verificados con Bruno CLI
cuentan como evidencia del backend; Prism y el mock no.

Si el navegador de Playwright no está instalado, ejecutar `npx playwright install chromium`.
Detener `npm run dev` antes de E2E. Playwright conserva trazas ante fallos por
configuración, por eso se usa `--trace=off`. No compartir trazas, HAR, headers,
cookies ni cuerpos de solicitudes. El audit runtime limpio no elimina el residual
dev de Prism documentado en ADR-002.

## Documentación

La documentación oficial vive en `docs/` y se publica con [VitePress](https://vitepress.dev):

```bash
npm run docs:dev      # servidor local con recarga
npm run docs:build    # genera docs/.vitepress/dist/
npm run docs:preview  # sirve el resultado del build
```

El índice por libros (producto, ADR, API, backend, frontend, proceso, diagramas,
operación y pendientes) es [`docs/README.md`](docs/README.md); es también la portada
del sitio. Un documento nuevo se añade a su libro en ese índice. Los diagramas UML
(arquitectura, patrones, clases y composición) están en
[`evidence_pc2/diagramas_uml.md`](evidence_pc2/diagramas_uml.md), con el archivo
editable en `evidence_pc2/diagramas/save-a-life-uml.drawio`.

## Bruno y contrato

- [`docs/Api-Rules.md`](docs/Api-Rules.md): reglas de contrato, seguridad,
  validación y consulta.
- [`docs/Backend-Contracts.md`](docs/Backend-Contracts.md): alcance ratificado por
  operación y estado de implementación por módulo.
- [`docs/openapi.json`](docs/openapi.json): único contrato OpenAPI 3.1 canónico;
  `x-ratification` marca cada operación ratificada.
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
- AP-02, AP-04, AP-06, AP-07 y AP-08 se resolvieron en ADR-005 y en la especificación
  del backend; el mock no representa esos comportamientos productivos.

La dirección visual se describe en [`docs/Frontend-Design.md`](docs/Frontend-Design.md)
y referencia el archivo Save a Life de Penpot y su inventario de rutas.

## Agentes (OpenCode y Claude Code)

`CLAUDE.md` y `AGENTS.md` fijan las reglas para Claude Code y OpenCode; los roles y
referencias comunes viven en `.opencode/`:

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

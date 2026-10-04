# Save a Life

Prototipo académico de coordinación entre hospitales autorizados y donantes en
Lima. La operación está mediada por el hospital; no existe contacto directo entre
paciente y donante.

## Estado actual

Los requisitos y decisiones se conservan en [`Save_a_Life.xlsx`](Save_a_Life.xlsx),
la línea base funcional en [`docs/1_Primeros_Alcances.md`](docs/1_Primeros_Alcances.md)
y una ERS en borrador en [`docs/2_Especificaciones_De_Software.md`](docs/2_Especificaciones_De_Software.md).
El frontend local se desarrolla Design-First sobre [`docs/openapi.json`](docs/openapi.json),
un borrador de Sprint 0, no una API productiva ratificada.

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
trabajo siguientes. Inventario: **54 paths/69 operaciones/94 schemas**, **25 en
Express y 44 solo Prism**, cliente **21 operaciones** y escenarios Bruno **18**.
Es un paquete habilitador; no declara terminado el producto ni aprobado el API
productivo. La documentación y el alcance local tienen revisiones independientes;
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

## Ejecutar localmente

Requiere Node `24.19.0`, npm `12.0.2` y Bruno CLI `4.2.0` disponible en `PATH`.
Con nvm disponible, `nvm use`; comprobar versiones antes de instalar.

```bash
node --version
npm --version
bru --version
SCARF_ANALYTICS=false npm ci
npm run dev
```

`npm ci` conserva el lockfile y la policy `allowScripts` de ADR-002: solo
`esbuild@0.28.2` aprobado, Scarf/protobufjs denegados. No habilitar scripts
globalmente ni añadir claves Supabase/Resend; el mock no necesita secretos.

Abrir <http://127.0.0.1:5173>. El comando inicia Vite y el mock Express en
`127.0.0.1:4011`. Prism se ejecuta por separado en `127.0.0.1:4010`:

```bash
npm run mock:prism
```

El proxy web `/api` apunta fijo a **4011**, sin selector de destino ni fallback.
Prism se usa por separado con Bruno o runner contractual; iniciar Prism no habilita
sus 44 operaciones faltantes en la web stateful.

## Verificación

```bash
npm test                         # Vitest de mock API y cliente web
npm run test:api                 # Integración del mock con Supertest
npm run test:contract            # 27 tests runner + 369 checks HTTP estáticos Prism/Ajv
npm run test:bruno               # Arranca/resetea/cierra el mock y ejecuta escenarios
npm run test:e2e -- --trace=off   # Playwright Chromium sin guardar trazas de red
npm run typecheck
npm run lint                     # Actualmente equivale a tsc --noEmit
npm run build
npm run openapi:lint
npm run audit:production
```

Si el navegador de Playwright no está instalado, ejecutar `npx playwright install chromium`.
Detener `npm run dev` antes de E2E: sus servidores se inician de forma aislada.
La configuración Playwright aún usa `retain-on-failure`; por eso se sobrescribe
con `--trace=off`. No compartir trazas/HAR/headers/cookies/bodies; revisar capturas
sintéticas antes de adjuntarlas. El audit runtime limpio no elimina el residual
dev de Prism documentado en ADR-002.

## Bruno y contrato

- [`docs/Api-Rules.md`](docs/Api-Rules.md): reglas de contrato, seguridad,
  validación y consulta.
- [`docs/openapi.json`](docs/openapi.json): único contrato OpenAPI 3.1 canónico
  del borrador.
- `bruno/`: colección importada y escenarios sintéticos de los tres roles.
- `npm run test:bruno`: inicia el mock en un puerto local efímero, reinicia el
  estado entre escenarios y suprime cuerpos/headers en el reporte.
- `npm run openapi:types`: regenera tipos de cliente web y DTO HTTP del mock
  desde el JSON canónico.
- `npm run test:contract`: modo normal Prism + Ajv2020, 69 éxitos (67 JSON y 2
  vacíos 204), 32 variantes, 268 errores forzados y 35 ejemplos schema auditados;
  checks fail-closed de inventario/ejemplos y deriva de tipos, sin demostrar auth real.
- Las 69 plantillas principales Bruno/26 bodies están canonizadas; 11 paths token
  y 2 grants necesitan valores sintéticos runtime. Env Prism solo aporta baseUrl.
  Examples secundarios heredados no canonizados pueden contener apiKey placeholder
  o bodies incompletos: no usarlos como auth ni entradas canónicas.
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

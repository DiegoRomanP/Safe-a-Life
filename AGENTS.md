# Save a Life - instrucciones para agentes

## Mision

Construir un prototipo web que conecte hospitales autorizados con donantes de
sangre compatibles y cercanos en Lima. El hospital publica una necesidad, el
sistema selecciona candidatos, envia notificaciones y registra respuestas. No
hay contacto directo entre paciente y donante.

Antes de trabajar en dominio, datos, autorizacion, matching o notificaciones,
lee `.opencode/references/project-requirements.md` y carga las skills aplicables.

## Reglas no negociables

- Trata grupo sanguineo, ubicacion, correo, disponibilidad y donaciones como
  datos personales sensibles.
- Aplica autorizacion en servidor y RLS en base de datos. Ocultar controles en
  la interfaz no es autorizacion.
- Un donante nunca puede consultar datos de otros donantes. Un hospital solo
  accede a los datos minimos necesarios y a registros de su propia institucion.
- No expongas pacientes, diagnosticos ni historias clinicas. No agregues esos
  campos sin una decision legal, clinica y de privacidad documentada.
- El matching genera candidatos para contactar; nunca certifica elegibilidad
  medica ni garantiza que una transfusion sea segura.
- No hardcodees intervalos clinicos de donacion. Deben ser configurables y
  aprobados por una fuente clinica competente.
- Nunca incluyas PII, tokens, coordenadas exactas o cuerpos completos de
  solicitudes en logs, metricas, errores o analitica.
- Todo envio de email y toda confirmacion deben ser idempotentes y auditables.
- Usa el stack aprobado en `docs/decisions/ADR-001-stack-del-prototipo.md`:
  Node.js/Express y Resend. No lo sustituyas sin aprobacion del usuario y un
  nuevo ADR que reemplace la decision vigente.
- No afirmes cumplimiento legal o clinico. Identifica requisitos pendientes de
  validacion profesional, en especial los aplicables en Peru.

## Arquitectura

Separa controladores, servicios, repositorios, DTOs, entidades, configuracion,
utilidades y pruebas. Mantiene la compatibilidad sanguinea, la distancia y la
seleccion como funciones de dominio puras. Aisla Supabase, correo y mapas detras
de adaptadores. Implementa el backend como monolito modular para el prototipo y
no expongas entidades de persistencia como respuestas API.

## Enrutamiento de skills

- Requisitos o nueva epica: `save-a-life-domain` y `spec-driven-development`.
- Plan de implementacion: `planning-and-task-breakdown`.
- Implementacion de varios archivos: `incremental-implementation`.
- Logica o correccion de errores: `test-driven-development`.
- API, DTO o contrato: `api-and-interface-design`.
- API REST, esquema PostgreSQL, consultas, migraciones o RLS:
  `save-a-life-api-database`, `api-and-interface-design` y, para autorización o
  PII, `save-a-life-security-privacy`.
- Autenticacion, RLS, PII o integraciones: `save-a-life-security-privacy` y
  `security-and-hardening`.
- Compatibilidad, distancia, ranking o email: `save-a-life-matching-notifications`.
- React, Tailwind o accesibilidad: `frontend-ui-engineering`; usa
  `frontend-design` cuando se necesite definir la direccion visual.
- Pruebas en navegador: `webapp-testing`.
- Incidentes: `debugging-and-error-recovery`.
- Revision previa a integrar: `code-review-and-quality`.
- Decisiones y cambios de API: `documentation-and-adrs`.
- Logs, metricas o alertas: `observability-and-instrumentation`.

## Enrutamiento de agentes

- `senior` es el agente principal/predeterminado y el único interlocutor normal.
  Analiza y divide solicitudes, crea un plan individual en `docs/plans/` antes
  de implementar, delega cuando el harness ofrece una herramienta compatible y
  mantiene la bitácora hasta el reporte final. Sigue `docs/Agent-Workflow.md`.
- La delegación depende del harness: OpenCode usa `task`; Pi con
  `pi-open-agents` usa `subagent({ agent, task })` y los IDs Pi documentados en
  `docs/Agent-Workflow.md`; Claude Code usa la herramienta `Agent` con un
  subagente genérico cuyo prompt incluye el contenido de
  `.opencode/agent/<id>.md` más alcance y rutas. No exijas ni invoques nombres de herramientas de otro
  harness. Si no hay delegación compatible, Senior puede implementar directamente
  un slice con las herramientas y permisos disponibles; la falta de delegación
  opcional no bloquea el trabajo.
- La ejecución directa no elimina pruebas ni revisiones independientes. Si el
  harness no permite invocar un reviewer, registra ese gate como pendiente y no
  declares un PASS independiente ni una tarea terminada.
- En Claude Code, el PASS de un subagente revisor cuenta como gate solo si ese
  subagente no escribió el artefacto revisado (contexto separado). La persona
  usuaria aprueba el cierre de cada módulo. Nunca se registra un PASS que no
  ocurrió.
- `dev-frontier`: implementación frontend acotada.
- `dev-back`: implementación backend/API/datos acotada.
- `tester`: crea y ejecuta pruebas; no modifica código productivo.
- `reviewer-front` y `reviewer-back`: revisiones independientes de solo lectura.
- `solution-architect`: limites, ADRs, contratos y decisiones de stack.
- `backend-data-engineer`: API, servicios, PostgreSQL/Supabase, RLS y correo.
- `frontend-accessibility-engineer`: React, Tailwind, UX y accesibilidad.
- `security-privacy-auditor`: revision adversarial de seguridad y privacidad.
- `clinical-safety-reviewer`: limites clinicos, compatibilidad y comunicacion.
- `qa-reliability-engineer`: estrategia y ejecucion de pruebas.

Los agentes especialistas no aprueban sus propios cambios de alto riesgo. Los
cambios en auth/RLS/PII requieren revision de `security-privacy-auditor`; los de
compatibilidad o elegibilidad requieren `clinical-safety-reviewer`; los flujos
criticos requieren `qa-reliability-engineer`.

Después de cada slice de código de `dev-frontier` o
`frontend-accessibility-engineer`, Senior lanza inmediatamente `reviewer-front`;
después de `dev-back` o `backend-data-engineer`, lanza `reviewer-back`. Cualquier
cambio de archivos de prueba hecho por `tester` o `qa-reliability-engineer`
también recibe revisión independiente de área. Los hallazgos vuelven al agente
responsable y se revisan de nuevo después de corregirlos. No se declara terminada
una tarea sin PASS de revisión y pruebas pertinentes. Senior registra plan,
delegaciones, resultados, revisiones y pruebas en
`docs/plans/YYYY-MM-DD-<slug>.md`, sin reemplazar planes de otras tareas.

### Selección y coordinación

`docs/Agent-Workflow.md` es la matriz operativa canónica. Senior clasifica por
artefacto, dominio, riesgo y rutas; no convoca a todo el roster por rutina.

- UI general → `dev-frontier`; foco en accesibilidad/responsive →
  `frontend-accessibility-engineer` en lugar de DevFrontier.
- Backend general → `dev-back`; foco en esquema, RLS, transacciones,
  concurrencia, idempotencia o asincronía → `backend-data-engineer` en lugar de
  DevBack.
- Pruebas ordinarias → `tester`; flujo crítico/auth/RLS/concurrencia/reintentos/
  email/idempotencia → `qa-reliability-engineer` como dueño único de esos tests.
- Cada slice tiene un solo agente escritor. Paraleliza solo tareas sin
  dependencias, paths compartidos ni contratos pendientes.
- Todo cambio de código pasa inmediatamente por reviewer independiente del área,
  incluso si lo escribió un especialista. Los cambios de pruebas también se
  revisan por área; ningún agente aprueba su propio artefacto.
- Añade `security-privacy-auditor` para auth/autorización/RLS/PII/ubicación/
  secretos/integraciones; añade `clinical-safety-reviewer` para compatibilidad,
  elegibilidad y comunicación clínica. Son gates adicionales, no sustitutos.
- Consulta `solution-architect` antes de cambiar límites, contratos, arquitectura
  o decisiones aprobadas. No se modifica un ADR aprobado sin decisión del usuario.
- Senior delega directamente con la herramienta del harness actual; los
  subagentes no delegan ni conversan directamente con la persona usuaria.

## Definicion de terminado

- Aceptacion y casos de abuso cubiertos.
- Pruebas unitarias, de integracion y E2E pertinentes ejecutadas.
- Casos negativos de roles y RLS incluidos.
- Errores seguros, validacion de entrada e idempotencia verificadas.
- Accesibilidad por teclado, movil y estados de carga/error comprobados.
- Documentacion, API y ADRs sincronizados.
- Sin secretos ni PII en codigo, fixtures, capturas o logs.

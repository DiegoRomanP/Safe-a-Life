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

## Definicion de terminado

- Aceptacion y casos de abuso cubiertos.
- Pruebas unitarias, de integracion y E2E pertinentes ejecutadas.
- Casos negativos de roles y RLS incluidos.
- Errores seguros, validacion de entrada e idempotencia verificadas.
- Accesibilidad por teclado, movil y estados de carga/error comprobados.
- Documentacion, API y ADRs sincronizados.
- Sin secretos ni PII en codigo, fixtures, capturas o logs.

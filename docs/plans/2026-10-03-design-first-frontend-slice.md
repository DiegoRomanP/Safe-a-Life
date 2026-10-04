# Plan de trabajo: slice Design-First stateful y frontend

**Estado:** Completado para el corte descrito
**Fecha:** 2026-10-03
**Solicitud:** Continuar el plan Design-First de API OpenAPI, mocks Bruno y UI de Save a Life.

## Objetivo

Entregar un corte local ejecutable que permita recorrer una respuesta de donante,
verificar la proyección hospitalaria AP-03 y explorar vistas minimizadas de
superadmin, sin presentar el mock como sistema productivo.

## Alcance

- Usar `docs/openapi.json` como fuente canónica y no modificar requisitos de
  producto ni resolver AP pendientes.
- Completar una slice local con salud/sesión, perfil e invitaciones propias,
  respuesta del donante, necesidades/respuestas del hospital y lecturas
  administrativas minimizadas.
- Construir interfaz pública y navegación por los tres roles con fixtures
  sintéticos; mostrar el alcance demo y los límites clínicos.
- Validar API, Bruno, Playwright, typecheck, build y documentación.

## Criterios de aceptación

- [x] OpenAPI lint pasa y las operaciones protegidas por cookie tienen CSRF en
  mutaciones; el documento permanece borrador de Sprint 0.
- [x] El mock se limita a loopback, RAM y datos sintéticos; reset fuera de OpenAPI.
- [x] Donante cambia respuesta con Origin/CSRF/idempotencia; hospital deriva
  institución de sesión y, tras rechazo, recibe código opaco sin nombre/grupo.
- [x] Hospital consulta y crea una necesidad como borrador sin disparar matching
  ni correo.
- [x] Superadmin ve tareas, hospitales, configuración y auditoría minimizadas;
  donante no accede a las vistas administrativas.
- [x] Interfaz pública y tres roles, carga/error/vacío, etiquetas semánticas,
  navegación teclado y responsive 320/390 px.
- [x] Pruebas automatizadas y documentación sincronizadas para el corte.
- [x] PASS independiente de seguridad/privacidad, arquitectura, frontend y QA
  reliability antes de cerrar este corte.

## Tareas y responsables

| Tarea | Responsable | Archivos principales | Estado |
| --- | --- | --- | --- |
| Revisar requisitos, skills, trabajo existente y decisiones | Senior | `AGENTS.md`, `docs/Agent-Workflow.md`, `.opencode/references/project-requirements.md` | Completada |
| Verificar OpenAPI, corregir auth Bruno y nombrar entornos | Senior | `docs/openapi.json`, `bruno/`, `package.json` | Completada |
| Implementar y probar la slice stateful | Senior en esta sesión | `apps/mock-api/` | Completada; revisión de seguridad PASS |
| Crear runner y escenarios stateful entre roles | Senior en esta sesión | `scripts/test-bruno.mjs`, `bruno/scenarios/` | Completada |
| Implementar cliente tipado y pantallas principales por rol | Senior en esta sesión | `apps/web/` | Completada; revisión frontend/QA PASS |
| Sincronizar guía visual, README, API Rules y checklist | Senior | `docs/Frontend-Design.md`, `docs/Api-Rules.md`, `README.md`, `tasks/` | Completada |
| Revisión independiente de auth/PII/seguridad | `security-privacy-auditor` | Archivos de mock/web/Bruno | Completada — PASS; residual de tooling Prism aceptado solo local |
| Revisión independiente de contrato/arquitectura | `solution-architect` | OpenAPI, tipos generados, sede y ejemplo 201 | Completada — PASS |
| Revisión independiente frontend/accesibilidad | `frontend-accessibility-engineer` | UI, foco, contraste y navegación móvil | Completada — PASS |
| Revisión de flujos críticos y confiabilidad | `qa-reliability-engineer` | Tests, runner y flujos API/E2E | Completada — PASS |
| Extender el resto de pantallas/operaciones de `tasks/plan.md` | Siguiente slice | Donante: política/info laboral; hospital: lotes/altas/política; admin: sedes/membresías/grants | Pendiente |

## Riesgos y límites

- El contrato contiene 54 rutas/69 operaciones, pero el mock stateful de este
  corte implementa solo las rutas necesarias para las pantallas enumeradas. Las
  otras rutas siguen disponibles como propuestas estáticas en Prism.
- AAL2 administrativo, correo, persistencia, RLS y permisos son simulados; no
  son evidencia de controles productivos.
- El límite geográfico del fixture local no es el polígono versionado de Lima.
- AP-02, AP-04, AP-06, AP-07 y AP-08 siguen abiertos y no se representan como
  comportamiento real.

## Bitácora

| Fecha | Acción | Resultado |
| --- | --- | --- |
| 2026-10-03 | Revisión de línea base, plan activo, tooling y colección Bruno | Detectado que Bruno importó una API-key falsa en vez de cookie; contrato verificado en 54 rutas/69 operaciones. |
| 2026-10-03 | Añadida slice Express con roles, cookie, CSRF/Origin, proyecciones y reset local | 18 pruebas Supertest verifican expiración, logout/replay, aislamiento entre dos hospitales y AP-09. |
| 2026-10-03 | Añadido runner Bruno y escenarios secuenciales entre donante y hospital | 16 requests de escenario pasan; reporter omite headers y cuerpos. |
| 2026-10-03 | Añadido React/Vite/Tailwind, cliente generado desde OpenAPI y vistas rol | Detectado y corregido doble unwrap de `data`; cliente conserva idempotency key en retries de resultado desconocido. |
| 2026-10-03 | Revisión independiente de seguridad | Hallazgos de producción/reset/expiración/tenant/`.env` corregidos; audit dev-only quedó documentado con 9 High/1 Moderate. Revisión de reintento logout añadió replay y estado local invalidado. |
| 2026-10-03 | Revisión independiente frontend | Contraste de foco/control, navegación móvil horizontal, foco post-acción/vista y vacíos admin corregidos. |
| 2026-10-03 | Revisión de arquitectura | El ejemplo de `CreateNeedRequest.siteId` apuntaba a `needId`; OpenAPI y ejemplo Bruno corregidos para usar la sede sintética. |
| 2026-10-03 | Revisión QA | Se añadieron pruebas de dos tenants, retry idempotente, expiración AP-09, estados de carga/error/vacío por rol, foco y menú móvil. Revisión final PASS. |
| 2026-10-03 | Ejecutada E2E pública/donante/hospital/superadmin, expiración de sesión y responsive | 5 tests Chromium; el runner cubre 320/390 px, vacíos/errores/carga, foco y revalidación de sesión. |
| 2026-10-03 | README, API Rules, diseño visual, requisitos normalizados y tasks sincronizados | Actualizado alcance ejecutable y límites productivos. |
| 2026-10-03 | Revisión de agentes ReviewerBack/ReviewerFront personalizados | El task registry los rechazó como tipo desconocido; el primer intento de `software-architect` falló por modelo no disponible. Se usaron los revisores disponibles `security-privacy-auditor`, `solution-architect`, `frontend-accessibility-engineer` y `qa-reliability-engineer`, todos de solo lectura. |
| 2026-10-03 | Revisión final independiente | PASS de seguridad, arquitectura, frontend/accesibilidad y QA reliability. |

## Verificaciones ejecutadas

- `npm run openapi:lint` — PASS.
- Aserciones Node: 54 paths / 69 operaciones, IDs únicos, sin campo de historial
  de donación y CSRF en mutaciones protegidas — PASS.
- `npm run test:api` — 20 PASS.
- `npm run test --workspace @save-a-life/web` — 1 PASS.
- `npm run test:bruno` — 20/20 requests y tests PASS.
- `npm run test:e2e` — 5 PASS; chromium local.
- `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check` — PASS.
- `npm run audit:production` — 0 vulnerabilidades. El audit completo mantiene 9
  High/1 Moderate solo en tooling dev de Prism; ADR-002 fija revisión antes de
  2026-11-01 y no admite exponer Prism ni cargar specs externas.

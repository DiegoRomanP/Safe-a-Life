# Cierre del paquete Design-First: API JSON, mocks y entrega frontend

**Fecha:** 2026-10-03
**Estado:** Completada — paquete habilitador local, no producto completo
**Coordinador:** Senior
**Solicitud:** Verificar avances de reglas API/modelos JSON en Swagger Editor, planificar y delegar el trabajo para habilitar al equipo frontend con mocks.

## Objetivo y alcance

Entregar un paquete reproducible de contrato y mocks para avanzar frontend sin
esperar al backend productivo. Conservar `docs/openapi.json` como fuente única,
las reglas existentes, tipos generados y colección Bruno. Completar ejemplos y
cobertura estática de las 69 operaciones; corregir defectos del subconjunto
stateful existente y documentar exactamente qué permite cada modo.

Este cierre no equivale a completar Save a Life ni a ratificar el API productivo.
No se implementarán las otras 44 operaciones como flujos stateful por rutina.

## Fuentes y cambios en curso

- Leídos `AGENTS.md`, `docs/Agent-Workflow.md`, requisitos normalizados, ADR-001,
  ADR-002, README y reglas API. Revisar línea base/ERS en cada asignación pertinente.
- Worktree con numerosos cambios previos y archivos sin seguimiento; preservarlos.
  No commits/push ni cambios de configuración de agentes.
- No editar `tasks/plan.md` ni reemplazar planes de otras tareas.
- Auditoría inicial `solution-architect`: 54 paths, 69 operaciones, 94 schemas;
  25 operaciones contractuales Express y 44 solo Prism; 26 bodies, 18 sin ejemplo
  explícito media; 67 éxitos JSON con ejemplo y 2 éxitos 204.
- Pruebas previas: 21 API, 1 cliente, 22 llamadas Bruno, 5 E2E. No constituyen
  aceptación de los defectos reproducidos ni evidencia de RLS productiva.

## Exclusiones y decisiones abiertas

- PostgreSQL/Supabase Auth/RLS, Resend, outbox, matching y despliegue reales.
- AP-02/AP-04/AP-06/AP-07/AP-08, reglas clínicas nuevas, PII real y secrets.
- Sustituir ADR-001/002, ampliar Origin/CORS, publicar mocks o agregar dependencias
  sin justificar/revisar. Swagger alojado no se agrega a orígenes autorizados.
- Completar todos los módulos UI; esta entrega proporciona contratos, mocks y
  tareas acotadas para continuarlos, no declara esas pantallas terminadas.

## Criterios de aceptación

- [x] A1: JSON único válido OAS 3.1, ejemplos sintéticos de los 26 bodies válidos;
  errores observables del subconjunto documentados; tipos regenerados sin deriva.
- [x] A2: runner persistente y finito verifica las 69 operaciones contra Prism,
  status/schema de 67 JSON y 2 cuerpos vacíos 204; entradas válidas, salida sin
  cuerpos/credenciales, loopback y cierre garantizado.
- [x] A3: GET de lotes sin mutación; replay tras cierre/vencimiento reproduce
  éxito, nueva intención terminal falla; cursor funciona sin saltos/duplicados
  y respeta scope; conteos cero sin matching/email.
- [x] A4: frontend conserva éxito POST cuando falla refresco, permite reintentar
  GET sin reenviar POST, consume páginas de lotes y cubre carga/error/foco/móvil.
- [x] A5: guía Swagger Editor 5/OAS 3.1, ciclo JSON→tipos→Bruno, inventario de
  69 operaciones con modo/cobertura/límites y paquetes de delegación frontend
  con rutas propias, dependencias, aceptación y pruebas.
- [x] A6: reviewers de área PASS por slice, seguridad PASS en alcance local y QA
  pertinente aprobada; documentación coherente, pendientes explícitos.

## Tareas ordenadas y responsables

| ID | Tarea y dueño | Rutas permitidas | Dependencia | Criterio/verificación | Estado |
| --- | --- | --- | --- | --- | --- |
| T0 | Auditoría `solution-architect`, solo lectura | contrato/reglas/apps/Bruno | ninguna | Inventario, recomendaciones y decisiones abiertas | Completada |
| T1 | Contrato/ejemplos, `dev-back` | `docs/openapi.json`, `apps/{web,mock-api}/src/api/openapi.ts` solo generación | T0 | A1; lint/types, validación ejemplos; `reviewer-back` inmediato | Completada |
| T2 | Corrección stateful, `backend-data-engineer` | `apps/mock-api/src/app.ts`, helpers nuevos bajo `src/domain/` si necesarios, `app.test.ts` | T1 PASS | A3; RED→GREEN API, typecheck; `reviewer-back` inmediato | Completada |
| T3 | Cliente/UI lotes, `frontend-accessibility-engineer` | `apps/web/src/api/client.ts`, `pages/HospitalPages.tsx`, tests focalizados cliente/UI | T2 PASS | A4; typecheck/test navegador; `reviewer-front` inmediato | Completada |
| T4a | Runner contractual/regresiones API, `qa-reliability-engineer`, dueño único QA | `scripts/test-prism-contract.mjs` y helpers/tests de runner; `package.json` script solo; `apps/mock-api/src/app.test.ts` | T3 PASS | A2/A3; reviewers backend inmediatos | Completada |
| T4b | Regresiones frontend y ejecución final, mismo dueño QA | web tests/E2E, sin producto | T4a PASS | A4; ReviewerFront inmediato, suites completas | Completada |
| T4c | Sincronizar inputs de Bruno importado, `dev-back` | solicitudes importadas en carpetas por tag de `bruno/`, excluye scenarios/env/collection | T4b PASS | Body sintético de cada una de las 26 entradas coincide ejemplo JSON; método/ruta 69 sin deriva; ReviewerBack inmediato | Completada |
| T5 | Guía/inventario y delegación frontend, `solution-architect` autor documental | `docs/Frontend-Handoff.md`, `docs/Api-Rules.md`, `README.md`; Bruno importados solo en slice separado si necesario | T4 PASS | A5; comandos reproducibles, todos method+path, tareas frontend listas; `reviewer-back` y `reviewer-front` verifican artefacto independiente | Completada |
| T6 | Gates finales, `security-privacy-auditor` y reviewers, read-only; QA reejecuta si hay cambios | sin escritura | T5 | A6; PASS local explícito, docs sincronizadas y reporte Senior | Completada |

Skills por asignación: planning/incremental, dominio, API/interface/database,
documentación; seguridad para datos/roles/runner, TDD para lógica y regresiones,
frontend/UI y webapp-testing para T3/QA. Cada agente lee AGENTS/workflow/ADR.
Un writer por slice. Ningún subagente delega ni habla al usuario. Si reviewer
bloquea, registrar hallazgo, devolver al autor y repetir revisión antes de otro
writer. Dividir asignaciones de QA por área si cambian tests backend y frontend.

## Verificaciones finales

`npm run openapi:lint`, `npm run openapi:types` (sin deriva), runner Prism nuevo,
`npm test`, `npm run test:bruno`, `npm run test:e2e`, `npm run typecheck`,
`npm run lint`, `npm run build`, `npm run audit:production`, `git diff --check`.
Validar importación/renderizado Swagger si el navegador/entorno lo permite;
no afirmar Try it out autenticado desde origen alojado. `lint` actual es typecheck,
no un linter independiente. Bruno `Assertions 0/0` no es cobertura global.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Confundir mocks con producción | Matriz operación/modo/límite y disclaimer persistente; no ratificar borrador. |
| Deriva JSON/tipos/Bruno | Generar tipos; inventario por operationId y checks; importación en temporal sin sobreescribir escenarios. |
| AP abiertas | No decidir su comportamiento; separar ejemplos de simulación de reglas reales. |
| GET mutantes/cursores de otras listas | T2 inspecciona helper de expiración compartido; inventariar límites de paginación restantes sin afirmar conformidad global stateful. |
| Prism dev vulnerable | ADR-002 loopback, solo spec local confiable; sin exposición pública, residual 9 high/1 moderate previo, revisión antes 2026-11-01. |
| Roles o PII en evidencia | Solo fixtures sintéticos, sin cuerpos/tokens/headers en bitácora/salida. |

## Bitácora

| Fecha | Asignación/resultado | Archivos/veredicto/comandos | Siguiente paso |
| --- | --- | --- | --- |
| 2026-10-03 | T0 inicio/fin: `solution-architect` auditoría solo lectura | 69 operaciones; probe Prism 69/69, API 21/21, cliente 1/1, Bruno 22, lint/types/audit runtime pasan. Recomendación de cierre acotado, no autoPASS. | T1 contrato y ejemplos |
| 2026-10-03 | Hallazgos previos y T0 confirmados | GET lotes muta globalmente; replay terminal 409; cursor ignorado; GET 400 ausente; UI mezcla éxito POST con fallo GET. Otros listados tienen límites de cursor por inventariar. | T1/T2/T3 corrigen; no cerrar con tests verdes solamente |
| 2026-10-03 | T1 inicio: `dev-back` | Solo JSON canónico y dos tipos generados; 26 ejemplos de entrada, variantes UI seleccionables y errores observables aditivos. | ReviewerBack inmediato al terminar |
| 2026-10-03 | T1 retomada tras cancelación: `dev-back` fin | Tres archivos autorizados: 26 ejemplos body ya presentes al retomar, 32 variantes en 15 colecciones, 28 refs error aditivas; Ajv 26/26 + 32/32, lint/types/typecheck pasan. | ReviewerBack |
| 2026-10-03 | T1 `reviewer-back` BLOCKED | B1: licencia OAS3.1 contiene identifier y url mutuamente excluyentes; inspección tipos/ejemplos sin otras incompatibilidades. Sugerencia: conservar código opaco entre ejemplos confirmada/rechazada. Reviewer no ejecutó comandos. | Corrección DevBack y nueva revisión |
| 2026-10-03 | T1 corrección inicio: `dev-back` | Mismas tres rutas; retirar url de licencia, alinear ejemplos de transición, regenerar tipos y validar. | ReviewerBack inmediato |
| 2026-10-03 | T1 corrección fin y ReviewerBack PASS | B1 resuelto, código compartido entre variantes; validación DevBack 26+32/lint/types/typecheck pasa. Revisión independiente estática, comandos no ejecutados por política del reviewer. | T2 |
| 2026-10-03 | T2 inicio `backend-data-engineer` | Corregir GET puro/expiración compartida, replay terminal y cursor scoped; pruebas RED→GREEN en API. | ReviewerBack inmediato |
| 2026-10-03 | T2 fin, ReviewerBack PASS estático | app.ts + dos helpers domain + app.test.ts: 24 regresiones, GET puros, replay terminal, cursor scoped. RED 21 fallos/22 éxitos, GREEN API45/45 + cliente1, types/lint pasan. | T3; seguridad/QA pendiente |
| 2026-10-03 | T3 inicio `frontend-accessibility-engineer` | Cliente/vista lotes y tests frontend focalizados; éxito POST independiente refresco GET, reintento solo lectura y paginación accesible. | ReviewerFront inmediato |
| 2026-10-03 | T3 fin y ReviewerFront PASS estático/capturas | Cinco archivos frontend; cliente3 + componente8 + previo1=12 tests; E2E focal4/4. Éxito separado/cursores/retry lectura/race guards; sugerencias QA: segunda intención+nueva key y retry página fallida. | T4 dividido por área |
| 2026-10-03 | T4a inicio `qa-reliability-engineer` | Runner Prism finito y schemas2020 + regresiones API de frontera temporal/DTO. No escribe frontend aún. | ReviewerBack inmediato |
| 2026-10-03 | T4a fin QA | Tres scripts + script npm + app.test.ts5 extras; 12 runner tests,369 HTTP (69ops/67JSON/2vacíos/32variantes/268errores),API50/50 y types/lint pasan. Prism --errors discrepa con writeOnly CSRF; modo normal + Ajv sin eliminar anotación. | ReviewerBack |
| 2026-10-03 | T4a ReviewerBack BLOCKED | B1: congelar solo conteos permite sustitución método/ruta/operationId; B2: ejemplos schema inválidos eclipsados por media y exclusión example/examples no verificada. API extras sin hallazgos. --errors CSRF límite documentable, no bloqueo extra. | QA corrige ambos y re-review |
| 2026-10-03 | T4a corrección inicio mismo QA | Inventario tuplas exactas y validar todos ejemplos independientemente de selección; negativas de sustitución/override/conflicto. | ReviewerBack inmediato |
| 2026-10-03 | T4a corrección fin, ReviewerBack PASS estático | B1/B2 resueltos; 27 runner tests +369HTTP pasan,35schema examples auditados,API50/typecheck. | T4b |
| 2026-10-03 | T4b inicio mismo QA | Solo pruebas frontend: segunda intención key distinta, retry página GET con cursor retenido/no duplicados; suites finales ejecutadas. | ReviewerFront inmediato |
| 2026-10-03 | T4b fin, ReviewerFront PASS estático/capturas | Tests3; API50+web15,runner27+369,Bruno22,E2E10x3=30/30 sin retries, types/lint/build/OpenAPI/runtimeaudit0. Heading wait arregla sincronización previa sin retirar Tab. Swagger visual no verificado. | T4c colección y T5 documentación |
| 2026-10-03 | T4c inicio `dev-back` | Slice mecánico de inputs importados; no tocar escenarios ni orígenes. Casos Bruno importados con bodies vacíos deben quedar coherentes con JSON antes de handoff. | ReviewerBack inmediato |
| 2026-10-03 | T4c fin y ReviewerBack PASS estático | 37plantillas importadas normalizadas,69mapping/26bodies validados inline; contract27+369/Bruno22 pasan.11token paths y2grant headers vacíos intencionales; ejemplos heredados secundarios no canonizados contienen placeholder apiKey, no auth principal. | T5 documentar límites de plantillas |
| 2026-10-03 | T5 inicio `solution-architect` autor docs | Solo README/reglas/guía handoff. Matriz69 modos y paquetes de delegación por rutas, no autoaprobación. | Reviewers front/back independientes |
| 2026-10-03 | T5 fin autor documental | Tres docs autorizados; matriz69 tuplas/modos/ejemplos,36enlaces válidos,lint/contract27+369/typecheck pasan. Swagger visual explícitamente pendiente humano. | Reviews independientes T5 |
| 2026-10-03 | Reviews T5 y gate seguridad T6 primer intento | Las tres invocaciones fallaron antes de entregar resultado: The usage limit has been reached. No hay veredicto ni cierre. | Reintentar al pedido del usuario |
| 2026-10-03 | Retomada T5/T6 | Estado preservado; se reanudan ReviewerBack, ReviewerFront y seguridad read-only. | Registrar veredictos o bloqueo operativo |
| 2026-10-03 | T5 ReviewerBack PASS, ReviewerFront PASS | Revisión estática independiente de los tres docs, matriz69/25/44/21/18, comandos, paquetes frontend y límites correctos; autor no autoaprueba. | T6 seguridad |
| 2026-10-03 | T6 security-privacy-auditor PASS local | Ejecución independiente: contract27+369,API50+web15,Bruno22,E2E10/10 con traceoff,OpenAPI/typecheck/audit runtime0/diffcheck. Sin listeners retenidos4010/4011/5173. | Cierre acotado |
| 2026-10-03 | Riesgos residuales documentados | Audit completo9High/1Moderate devPrism; trazas retain-on-failure config exige override traceoff; ejemplos Bruno legacy no canonizados. No fuga nueva observada. | Mantener contención ADR-002 y revisión2026-11-01 |
| 2026-10-03 | Cierre Senior | A1–A6 completos en alcance local. Worktree preservado; sin commits/push ni edición tasks/plan.md. | Entregar links y límites al usuario |

## Resultado y siguientes pasos fuera de este cierre

- Contrato JSON: 54 rutas,69 operaciones,94 schemas;26 ejemplos de entrada,
  32 variantes seleccionables y35 anotaciones schema auditadas.
- Mocks: Prism69 operaciones; Express25 operaciones contractuales enRAM;
  44 operaciones solo estáticas. Runner nuevo `npm run test:contract`.
- QA ejecutada: API50/frontend15/runner27/Bruno22; E2E10 casos x3=30 por QA
  y10 adicionales por seguridad. Build/typecheck/lint/OpenAPI/runtimeaudit pasan.
- Reviewers PASS: contrato/T2/T4a/T4c backend; T3/T4b frontend; documentos ambos;
  gate seguridad independiente PASS exclusivamente local/sintético.
- Entrega principal: [Frontend-Handoff](../Frontend-Handoff.md),
  [reglas API](../Api-Rules.md), [JSON](../openapi.json).
- Pendiente manual explícito no incluido como prueba ejecutada: importar y
  revisar visualmente el contrato en Swagger Editor5 compatible OAS3.1. La guía
  da los pasos; lint/Ajv/Prism no se presentan como evidencia visual.
- Los paquetes de UI futuros quedan preparados con dueño/rutas/criterios en
  handoff; no se afirma que las futuras pantallas estén implementadas/delegadas.
  Integraciones compartidas requieren siguiente slice secuencial de Senior.
- Otras siete listas aún no tienen cursor completo en Express; límites
  enumerados en handoff. No declarar conformidad global stateful.
- API productiva, ratificación de rutas, AP abiertas, Supabase/RLS/Resend,
  matching y revisión legal/clínica quedan fuera, pendientes de planes propios.

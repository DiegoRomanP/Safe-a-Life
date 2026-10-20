# Auditoría y continuación de pendientes de Save a Life

| Campo | Valor |
| --- | --- |
| Fecha | 2026-10-20 |
| Responsable de coordinación | Senior |
| Solicitud | Analizar el proyecto, implementar pendientes de `docs/` mediante agentes, hacer commits por hitos y registrar incertidumbres en `docs/pending/` |
| Estado general | Configuración de delegación corregida; reinicio y comprobación del harness aún pendientes |
| Implementación y revisiones de esta sesión | Sin código de producto; se ajustaron permisos/configuración y documentación de agentes. No hubo delegación ni revisión independiente |

## Objetivo y alcance

Inventariar los pendientes reales, distinguirlos de bitácoras históricas y
continuar en slices verificables el orden aprobado F6 → F7 → F8 → F9. Antes de
implementar se deben resolver las contradicciones documentales que cambien
conducta y verificar la base existente con pruebas y revisión independiente.
Este plan no ratifica contratos ni modifica ADRs o requisitos aprobados.

Exclusiones: datos reales, pacientes, diagnósticos, reglas clínicas nuevas,
modificaciones a cambios ajenos, despliegues remotos, cambios de secretos y
`supabase db push`. No sobrescribir planes históricos ni `tasks/plan.md`.

## Fuentes consultadas

- `AGENTS.md`, `docs/Agent-Workflow.md` y `.opencode/agent/senior.md`.
- `docs/1_Primeros_Alcances.md`, `docs/2_Especificaciones_De_Software.md` y
  `.opencode/references/project-requirements.md`.
- `docs/decisions/ADR-001-stack-del-prototipo.md` y ADR-004, ADR-005 y ADR-006.
- `docs/openapi.json`, `docs/Backend-Contracts.md`, README y entrega frontend.
- Plan maestro y especificación del 2026-10-12; decisiones y planes de módulos
  del 2026-10-13; diagnóstico del 2026-10-16.
- Composición HTTP/worker, routers, migraciones, configuración y manifiestos.

## Evidencia estática de esta sesión

| Área | Hallazgo y límite |
| --- | --- |
| Contrato | Búsquedas textuales encuentran 73 `operationId` y 57 marcas `ratified-for-implementation`; no sustituyen el lint ni el runner contractual |
| Backend | 47 registros de rutas en `backend/src/modules/**/http/*.router.ts`; la composición monta plataforma, identidad, necesidades, correo y donantes |
| Datos | Ocho migraciones y 17 declaraciones de tablas; no se ejecutaron migraciones, RLS ni transacciones |
| F6 | No existe módulo `invitation-coordination`; no se localizaron implementaciones de Haversine, matriz RBC, lotes ni barrido de necesidades |
| F7/F8 | No existen módulos productivos de solicitudes de privacidad, reconocimientos ni información legal; las referencias generadas no son implementación |
| Frontend | `apps/web/vite.config.ts` dirige `/api` solo al mock en 4011; `frontend/` es una plantilla React 19 fuera de los workspaces, frente a React 18 aprobado |
| E2E | `playwright.config.ts` inicia el mock y la demo, no el backend real; no demuestra el flujo productivo |
| Operación | No existe `.github/`; el inventario de `scripts/` no incluye benchmark backend; faltan comprobaciones de salida F9 |
| Seguridad | Los planes F2b/F3/F4/F5 reconocen correcciones posteriores a sus revisiones; no se presume PASS sobre esos cambios |

No se reutilizan los conteos de pruebas históricas como si se hubieran ejecutado
en esta sesión. El diagnóstico del 16 de octubre es una referencia, no una
aprobación de su propuesta de reordenar el trabajo.

## Preservación de modificaciones existentes

El primer `git status --short` permitido mostró cambios previos en:

- `.opencode/agent/backend-data-engineer.md`
- `.opencode/agent/dev-back.md`
- `.opencode/agent/dev-frontier.md`
- `.opencode/agent/senior.md`
- `CLAUDE.md`
- `docs/plans/2026-10-16-analisis-estado-proyecto.md` sin seguimiento.

No restaurar, stagear ni commitear esos archivos como parte de esta solicitud.
La persona usuaria pidió después corregir los permisos, por lo que se actualizaron
las declaraciones de permisos de los perfiles de agentes de forma acotada,
preservando sus cuerpos y límites de rol. También se alinearon los nombres de
herramienta en `AGENTS.md` y `docs/Agent-Workflow.md`. No se editaron los cambios
de `CLAUDE.md` ni el plan del 16 de octubre. Tras las respuestas de la persona
usuaria, `git status --short` volvió a funcionar y mostró además cambios ajenos
en estos perfiles:

- `.opencode/agent/frontend-accessibility-engineer.md`
- `.opencode/agent/qa-reliability-engineer.md`
- `.opencode/agent/security-privacy-auditor.md`
- `.opencode/agent/solution-architect.md`
- `.opencode/agent/tester.md`

El trabajo propio queda sin stage ni commit. La edición de permisos solicitada
afecta los perfiles preexistentes listados más arriba; no se sobrescribieron sus
instrucciones de rol. También siguen intactos los cambios ajenos en `CLAUDE.md`
y el diagnóstico sin seguimiento del 16 de octubre.

## Criterios de aceptación

1. Pendientes inventariados con evidencia, dependencias, responsable y límites;
   incertidumbres registradas sin convertir supuestos en decisiones.
2. Cada slice de código o pruebas tiene revisión independiente inmediata de área;
   seguridad y clínica emiten PASS o BLOCKED cuando corresponda.
3. QA verifica los flujos críticos sobre Supabase/PostgreSQL locales, no solo
   sobre mocks; ninguna prueba pertinente omitida o fallida se presenta como éxito.
4. Contrato, generados y documentación quedan sincronizados tras cada hito;
   commits atómicos solo de archivos propios y después de sus gates.
5. No se declara el producto terminado mientras falten implementación, gates,
   pruebas, ratificaciones o validaciones profesionales pertinentes.

## Tareas y responsables previstos

La tabla es un orden de trabajo, no una lista de asignaciones ya realizadas.
Cada grupo F7–F9 necesita un plan de módulo y desglose de slices de hasta unos
cinco archivos antes de asignar escritores. Ningún subagente delega ni contacta
a la persona usuaria. Las rutas compartidas se trabajan secuencialmente.

| ID | Responsable | Rutas propias / exclusiones | Dependencias | Aceptación y verificación | Estado |
| --- | --- | --- | --- | --- | --- |
| A0 | Senior | Solo este plan y su registro en `docs/pending/`; excluye producto y planes previos | Ninguna | Diagnóstico trazable, preservación e incertidumbres explícitas | Completada: auditoría estática y registro documental, no producto |
| A1 | Senior / persona usuaria | Verificación del harness y precedencia de permisos; sin cambiar configuración global/administrada | A0 | Tras reiniciar, `subagent` disponible, perfiles visibles y permisos de edición/ejecución efectivos por rol | Bloqueada hasta reiniciar y verificar el harness |
| A2 | `solution-architect` | Consulta de solo lectura de requisitos, ADRs y contrato; no autoaprueba ni cambia decisiones | A1 y resolución de contradicciones | Recomendar límites de F6 y aclarar F9/frontend/borde; supuestos y decisiones abiertas por escrito | Pendiente |
| A3 | `reviewer-back` y `security-privacy-auditor` | Solo lectura de correcciones tardías F2b–F5 y evidencia; sin escribir | A1 | PASS o BLOCKED explícitos por alcance; hallazgos vuelven al autor/área y se revisan otra vez | Pendiente |
| A4 | `qa-reliability-engineer` | Pruebas backend existentes; autor único de nuevas regresiones críticas, sin producto | A3; cualquier escritura de tests recibe reviewer inmediato | Baseline contractual, unitarias, pgTAP, integración y Bruno; sanitizar evidencia | Pendiente |
| F6a | `dev-back` | Nuevos `domain/compatibility.ts`, `haversine.ts` y sus tests en `invitation-coordination`; excluye SQL, HTTP y generados | A2–A4 y evidencia clínica académica suficiente | TDD de 64 pares y distancia/bordes; `reviewer-back` inmediato y gate clínico | Bloqueada |
| F6b | `dev-back` | Nuevos dominio de ranking y tamaño de lote con sus tests; excluye compartidos y SQL | F6a PASS | Orden y tamaño según línea base, sin filtro postdonación; review inmediato y pruebas enfocadas | Pendiente |
| F6c | `backend-data-engineer` | Migración F6, pgTAP y versión de esquema; sin rutas frontend | F6b PASS y consulta de arquitectura | Matriz TS/SQL equivalente, restricciones/RLS; reviewer-back inmediato, seguridad y QA real | Pendiente |
| F6d | `backend-data-engineer` | RPC de lote, respuesta e historial en slices separados; SQL/tests propios de cada asignación | F6c PASS | Invitación/outbox/auditoría atómicos, unicidad y cuota; 20 concurrentes, rollback, replay y negativos RLS | Pendiente |
| F6e | `backend-data-engineer` | Cascadas de necesidad/disponibilidad y worker en slices separados, sin frontend | F6d PASS | Meta, cierre, cancelación y vencimiento consistentes; reintentos y tokens inválidos; review y QA por slice | Pendiente |
| F6f | `dev-back` | Aplicación, adaptadores y routers F6 en slices acotados; composición solo en slice exclusiva | F6e PASS | Diez operaciones ratificadas implementadas sin filtraciones; gates backend, seguridad, clínica y QA | Pendiente |
| F7 | `backend-data-engineer` | Futuros slices de `privacy-requests`, grants, purgas/ledger y sus migraciones; excluye F8 y frontend | F6 PASS y ratificación de nueve operaciones | Retención y eliminación aprobadas, grants scoped, restauración en cuarentena; seguridad y QA críticos | Bloqueada |
| F8 | `dev-back` | Futuros slices de `recognition-policies` y `legal-information`; excluye conclusiones clínicas/legales | F7 PASS y ratificación de siete operaciones | Mecánica de políticas; información `0.1-borrador`, aviso neutral y contenido nulo; reviews y pruebas | Bloqueada |
| F9 | `dev-frontier` o `frontend-accessibility-engineer`, uno por slice | Frontend elegido tras decisión; cada shared path tiene dueño exclusivo; configuración/CI en slices separados | F6–F8 PASS y resolución de frontend/borde | Login/MFA/tokens/flujo central, E2E backend, accesibilidad, rendimiento, CI y runbook; gates por área | Bloqueada |
| C0 | Senior | Documentación propia y staging allowlisted por hito; sin cambios ajenos | Gates y QA de cada slice; permiso de comandos | Commits convencionales revisados; reporte de resultados reales y pendientes | Bloqueada hasta verificar permisos efectivos |

Skills previstas por área: dominio/TDD/incrementos para F6; API/datos y
seguridad/privacidad para SQL, HTTP, tokens y purgas; interfaz/accesibilidad y
pruebas web para F9; documentación y revisión de calidad transversalmente.
Las skills pertinentes se cargaron para esta auditoría; cada agente deberá
cargar las correspondientes antes de actuar.

## Pruebas y checkpoints previstos — no ejecutados

- Contrato: `npm run openapi:lint`, `npm run openapi:api:check`,
  `npm run test:api:generator`, `npm run test:contract`.
- Backend: `npm run test --workspace backend`, `npm run test:backend:db`,
  `npm run test:backend:integration`, `npm run test:bruno:backend`.
- Regresión: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`,
  `npm run test:bruno`, `npm run test:e2e -- --trace=off`.
- Suministro: `npm run audit:production`; no instalar ni actualizar dependencias
  para convertir un fallo en verde sin revisión.
- F9 añadirá E2E contra backend y mediciones RNF-PER; los E2E actuales son mock.
- Reset de base exclusivamente local aislada tras comprobar destino sintético.
  No publicar cuerpos, headers, tokens, coordenadas, trazas ni HAR.
- Antes de cada commit: revisar diff allowlisted, pruebas pertinentes y
  `git diff --check`; no usar `git add -A`.

## Riesgos, bloqueos y decisiones

Decisión de la persona usuaria del 2026-10-20, recibida mediante `question`:

- **«Reabrir con herramientas»**: continuar en una sesión con delegación OpenCode
  (`subagent` en V2, `task` en V1) y ejecución acotada de pruebas/commits. No acredita por sí sola que las herramientas ya
  estén disponibles; A1 requiere comprobación efectiva.
- **«Sí, sincronizar»**: actualizar referencias obsoletas de AP-02/AP-04/AP-06/
  AP-07/AP-08 conforme a los ADR aceptados y las decisiones posteriores
  documentadas, sin introducir reglas nuevas y conservando trazabilidad.
  Resuelve la pregunta de autoridad de P-03; la sincronización aún debe hacerse
  y verificarse. No ratifica automáticamente F7/F8 ni decide el traslado frontend.

Detalle y preguntas en
[`docs/pending/2026-10-20-bloqueos-y-decisiones.md`](../pending/2026-10-20-bloqueos-y-decisiones.md).
La ausencia de `subagent` en el runtime actual impide asignaciones y gates
obligatorios. Aún no se han comprobado los permisos tras reiniciar. No se evaden
usando otro agente ni otro canal de ejecución.

## Bitácora

| Fecha / paso | Inicio y fin / agente | Resultado, archivos y siguiente paso |
| --- | --- | --- |
| 2026-10-20 / preflight | Inicio y fin en esta sesión / Senior | Skills e instrucciones leídas; búsquedas de catálogo no exponen `task`; sin asignaciones |
| 2026-10-20 / Git inicial | Inicio y fin en esta sesión / Senior | Comando compuesto denegado; luego los tres comandos de lectura permitidos funcionaron por separado: status, diff-stat y diff-name-only; sin staging ni commit |
| 2026-10-20 / auditoría | Inicio y fin en esta sesión / Senior | Fuentes y código contrastados; 73/57 marcas contractuales, 47 rutas, ocho migraciones; pruebas y reviews no ejecutados |
| 2026-10-20 / memoria | Inicio y fin en esta sesión / Senior | Engram no resuelve identidad segura del proyecto; lectura/búsqueda/guardado sin persistencia confirmada; no elegir alias silenciosamente |
| 2026-10-20 / interrupción | Senior | Primer intento de escritura interrumpido; no produjo documentación confirmada |
| 2026-10-20 / continuación | Inicio y fin en esta sesión / Senior | Sigue sin exponerse `task`; ahora incluso `git status --short` y glob fueron denegados. Se intenta guardar únicamente este plan y pendientes; implementación bloqueada |
| 2026-10-20 / documentación | Inicio y fin en esta sesión / Senior | Escritura confirmada de este plan y `docs/pending/2026-10-20-bloqueos-y-decisiones.md`; ambos releídos. A0 completada solo como auditoría; sin cambios de producto, tests, reviews o commits. Se solicita desbloqueo a la persona usuaria |
| 2026-10-20 / consulta | Inicio y fin en esta sesión / Senior y persona usuaria | Respuestas: «Reabrir con herramientas» y «Sí, sincronizar». Registradas sin simular disponibilidad de task ni ratificaciones adicionales; siguiente paso: comprobar capacidades efectivas |
| 2026-10-20 / comprobación tras respuesta | Inicio y fin en esta sesión / Senior | El catálogo sigue sin exponer `task`. `git status --short` y `git diff --stat` funcionan; `git diff --check` es denegado. El perfil Senior leído mantiene solo tres comandos Git de lectura permitidos. A1 y C0 continúan bloqueadas; preservados cinco perfiles ajenos adicionales. Sin pruebas ni commits |
| 2026-10-20 / permisos OpenCode | Inicio y fin en esta sesión / Senior | Migrados permisos al formato V2, retirada la denegación global de delegación y la invisibilidad de perfiles; Senior puede lanzar IDs del roster, writers pueden editar excepto archivos `.env` y solicitar aprobación para shell. Reviewers tienen allowlist de lectura estricta; auditor/arquitecto mantienen shell sujeto a aprobación. Tester conserva edición de pruebas (incluido `backend/`) y comandos de verificación permitidos. Alineados nombres de herramienta en `AGENTS.md` y `docs/Agent-Workflow.md`. JSON y frontmatter parseados; `git diff --check` pasó. El runtime de esta sesión no expone `subagent`; queda pendiente reiniciar OpenCode y verificar. No se ejecutaron tareas ni comandos de producto |

No hay veredictos independientes de esta sesión. El siguiente paso es habilitar
las herramientas del flujo y resolver las preguntas de autoridad documental,
sin marcar tareas de producto como completadas.

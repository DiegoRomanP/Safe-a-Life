# Corrección y cierre de DTOs de Save a Life

**Fecha:** 2026-10-04  
**Coordinador:** Senior  
**Estado general:** Bloqueada para implementación con commits — permisos operativos y alcance de incorporación de trabajo previo pendientes; preparación de solo lectura en progreso.  
**Solicitud:** Implementar el plan de corrección de DTOs y crear commits respectivos después de cada proceso solucionado, revisado y probado.

## Objetivo

Corregir la compilación de los validadores actuales, las inconsistencias contractuales y la precisión geográfica; completar selección de sedes y cobertura de DTOs ratificados, manteniendo OpenAPI como fuente única. Entregar procesos pequeños con revisión independiente, pruebas y un commit por proceso aceptado. Este plan complementa, sin sustituir, [backend inside-out](2026-10-04-backend-inside-out.md), especialmente T4b2, V-DTO, T4v y T4s.

## Autoridad y línea base

- `AGENTS.md`, `docs/Agent-Workflow.md` y `.opencode/agent/`: Senior solo coordina y escribe esta bitácora; implementadores y revisores se asignan mediante IDs exactos y `task`.
- `docs/1_Primeros_Alcances.md` v1.2 y ADR-001/002: requisitos y decisiones vigentes; ERS v0.4 organiza la aceptación, pero sigue en borrador.
- `docs/openapi.json`, `docs/Api-Rules.md` y `docs/Backend-Contracts.md`: única fuente contractual y ratificación acotada de `createHospitalNeed`; las otras 68 operaciones siguen en borrador.
- La solicitud autoriza ejecutar el plan y hacer commits. No resuelve por sí sola el transporte de precondiciones de versión, política global de fechas, nueva ruta de sedes, protocolo MFA ni ratifica todas las operaciones.
- Auditoría previa en esta conversación: OpenAPI lint y generación sin deriva pasan; 86 pruebas DTO pasan; typecheck API falla con 14 diagnósticos. Web/mock compilan. Auditoría estática prepara 369 casos, pero esa preparación no constituye ejecución HTTP. El validador contractual rechazó 129/1000 muestras sintéticas de tres decimales por `multipleOf`.
- Estos resultados son antecedentes, no verificaciones nuevas ni PASS de implementación.

## Alcance

1. Matriz operación/actor/entrada/salida/error/requisito/ratificación/validador/prueba.
2. Reparación de compilación y aceptación del DTO de creación ya ratificado.
3. Contratos de reconocimientos, variantes de solicitudes/sesión, información legal y fechas, previa concreción de las decisiones pendientes.
4. Corrección numérica sin ampliar precisión ni reemplazar el polígono Lima.
5. Contrato y adaptación local de catálogo de sedes para crear la primera necesidad sin depender de una necesidad previa.
6. Validadores adicionales por módulo y operación ratificada, sin implementar otras capas por rutina.
7. Documentación sincronizada, regresión pertinente y commits atómicos por proceso aceptado.

## Exclusiones y preservación

- No modificar `.opencode/opencode.json`, ADRs aprobados, secretos, `tasks/plan.md` ni planes históricos.
- Conservar el scaffold `backend/` y SQL legado; no reutilizarlos como implementación aprobada.
- No publicar HTTP protegido, implementar persistencia/Auth/RLS/worker/Resend o enviar correo real dentro de una tarea DTO sin asignación adicional explícita.
- No resolver AP-02/AP-04/AP-06/AP-07/AP-08, reglas clínicas ni requisitos legales pendientes.
- Solo datos sintéticos. Ningún reporte, bitácora o artefacto de evidencia contiene PII, coordenadas, tokens, cuerpos, headers sensibles o claves idempotentes.
- No cambiar dependencias/lock por rutina ni relajar strictness, validaciones o pruebas para obtener verde.
- No push, amend, force, configuración Git, hooks omitidos, commits vacíos o stage global.

## Política de commits y bloqueos previos

1. Usuario pide un commit por proceso solucionado. Senior lo crea únicamente después de PASS de reviewers/gates aplicables, ejecución pertinente verde y documentación sincronizada.
2. Antes de cada commit inspeccionar `git status`, diff real completo —incluidos nuevos archivos—, staged diff y `git log --oneline -10`; stagear solo paths/hunks revisados. Comprobar ausencia de secretos; no stagear artefactos ignorados, builds o caches.
3. La política activa permite únicamente `git status --short`, `git diff --stat` y `git diff --name-only` en Bash. `git log --oneline -10` fue denegado; no se intentó eludir la restricción. Permisos de ejecución/pruebas y stage/commit requieren habilitación por el usuario antes de continuar la entrega con commits.
4. Hay trabajo anterior relacionado sin commit: OpenAPI ratificado, generación/base API, paquetes/lock, documentación, cambios mínimos mock y pruebas Bruno. Existen además cambios previos de configuración y ADR ajenos al alcance. No incluir todos los cambios automáticamente.
5. La primera reparación no debe producir un commit dependiente de archivos untracked/de cambios anteriores omitidos. Tras habilitar permisos, inspeccionar y proponer un commit de base contractual/workspace ya revisada; solicitar autorización expresa para incorporar ese trabajo previo. La base parcial runtime no aceptada queda para el commit de reparación. Si el usuario no autoriza incorporar prerrequisitos, acordar otro alcance antes de commit, sin stash/reset/revert silencioso.
6. Mensajes seguirán el estilo real del historial una vez disponible; las etiquetas propuestas abajo describen intención y no anticipan hashes.
7. Registrar hash, paths, gates y pruebas del proceso en esta bitácora. Si el commit ya se creó, registrar su hash en la siguiente actualización de bitácora, sin amend.

## Tareas, límites, dependencias y verificaciones

Todas las tareas están **Pendientes**, salvo P0 **En progreso**. Ninguna asignación de escritor está iniciada. Los límites siguientes se estrechan antes de cada `task`; tests separados pertenecen exclusivamente a QA.

| ID | Responsable y objetivo | Paths previstos propios | Dependencias y aceptación / gate |
| --- | --- | --- | --- |
| P0 | Senior: permisos, preservación, plan y política de commits | Solo este plan; lecturas repo; Git permitido | Estado/diff e inventario; habilitación operativa y autorización de base antes de commits |
| P1 | `solution-architect`: inventario DTO y mapa de decisiones, solo lectura inicialmente | Lectura docs/contrato/apps/scripts; sin cambios ni shell | Recomendar matriz y límites; no autoaprobar arquitectura ni elegir conducta pendiente |
| P2 | Senior + usuario: concretar decisiones compartidas | Registrar únicamente aquí | Recomendación P1; versión en DELETE, legal por estado, fechas, sedes y ratificación gradual |
| B0 | Senior: incorporar prerrequisitos previos revisados si usuario autoriza | Solo archivos previos explícitamente autorizados tras inspección | Permisos, diff completo, revisión independiente de base y pruebas; no runtime roto/config/ADR ajenos |
| P3 | `dev-back`: corregir interoperabilidad NodeNext y type guards | `apps/api/src/modules/need-records/dto/validators.ts`; build config solo si justificado y asignado | Sin cambiar contrato ratificado; typecheck producto, misma normalización/proyección; `reviewer-back` inmediato |
| P4 | QA único `qa-reliability-engineer`: fixture negativo y cobertura DTO | `apps/api/src/modules/need-records/dto/validators.test.ts` | P3 PASS; corregir extra sin casts inseguros, conservar 86 tests y completar fronteras/no mutación/formats; `reviewer-back` inmediato, QA verde y seguridad DTO PASS; commit del proceso P3+P4 |
| P5a | `dev-back`: moderación de reconocimientos | `docs/openapi.json`, artefactos generados; documentación acotada por separado | P2: levantamiento a sin_publicar según línea base; publicar no vacío; reviewer backend y frontend generado; QA schema negativas |
| P5b | `dev-back`: precondición de versión al retirar | Misma fuente canónica/derivados, en slice distinto | P2: transporte exacto aprobado, conflicto/versión descritos sin inventar HTTP productivo; review+QA; commit de cada proceso contractual aceptado |
| P6a | `dev-back`: variantes de solicitudes | Canon/derivados, sin implementar corrección real | RequestedFields coherentes por tipo; schema cerrado y proyección minimizada; review+QA+privacidad |
| P6b | `dev-back`: coherencia DTO de reto MFA | Canon/derivados, sin auth real | Decisión P2; challenge requerido cuando aplique, sin fijar nuevo TTL/refresh ni rol; review+QA+seguridad |
| P7 | `dev-back`: información legal por estado | Canon/derivados | P2; impedir conclusiones no aprobadas con variante explícita y conservar aviso; pruebas aprobado/borrador/retirado/ausente, review+gate aplicable; no afirmar aprobación profesional |
| P8 | `dev-back`: salida UTC y entrada temporal explícita | Canon/derivados; tests del generador a QA si cambian restricciones revisadas | P2; distinguir entradas/salidas/shared schemas; no imponer Z indiscriminadamente. Cambiar prueba que preserva Need general solo con decisión registrada; review+QA |
| P9 | `dev-back`: precisión numérica contractual | `scripts/prism-contract.mjs`; otros puntos solo si lectura demuestra necesidad y se asignan | 1000/1000 muestras tres decimales, rechazar precisión adicional/rangos/tipos; QA dueño `scripts/prism-contract.test.mjs`; review inmediato por slice, seguridad ubicación y commit |
| P10 | `solution-architect` consulta, luego `dev-back` contrato de sedes propias | Canon y derivados; inventario runner/Bruno por QA en slices siguientes | P2; scope derivado, sedes activas/aprobadas, campos públicos allowlisted, vacío/errores/límite definido; no autorizar acceso Supabase directo |
| P11a | `dev-back`: catálogo sintético scoped en mock | `apps/mock-api/src/domain/model.ts`, `infrastructure/demo-state.ts`, `app.ts` | P10 PASS; nueva operación explícita, no negocio real ni bypass roles; `reviewer-back` inmediato; QA tests backend/Bruno y seguridad |
| P11b | `frontend-accessibility-engineer`: selección accesible de sede | `apps/web/src/api/client.ts`, `pages/HospitalPages.tsx` | P11a PASS; carga/vacío/error/retry, selector teclado, primer borrador con lista needs vacía; `reviewer-front` inmediato; QA único tests/E2E front y reviewer front; commit del proceso local completo |
| P12-n | Arquitectura/usuario, luego `dev-back`: DTO runtime por módulo ratificado | Generador y `apps/api/src/modules/<modulo>/dto/`, acotados por operación | Inventario/ratificación previa; snapshot local sin imports web/mock/docs runtime, entrada/salida/errores/params cerrados; ampliar vocabulario generador solo necesario y probado; review+QA y gates riesgo; commit por lote pequeño |
| P13 | `solution-architect` documentación, QA único regresión; Senior cierre | README root, docs README/API/Backend/Handoff en slices acotados; Senior solo esta bitácora | Estados/conteos actuales y comandos; reviewers docs backend/frontend, regresión verde, hashes, matriz evidencia y límites; commit documental |

Orden P12 propuesto: identidad/instituciones → perfiles/onboarding/altas → necesidades → invitaciones/lotes/respuestas → privacidad/grants → reconocimientos → legal. No es ratificación global ni obligación de terminar módulos suspendidos por AP. La documentación de inventario se asignará con path concreto después de P1, no se crea un contrato alternativo.

## Protocolo de ejecución por proceso

1. Senior registra inicio, responsable, paths exclusivos, exclusiones, skills, aceptación y pruebas en este plan antes de asignar escritor.
2. Implementador reproduce RED pertinente, hace cambio mínimo y reporta paths/comandos/bloqueos. No delega, no conversa con usuario, no stagea ni comitea.
3. Reviewer independiente de área revisa inmediatamente el diff completo de la asignación antes del siguiente escritor. Generado web exige reviewer-front adicional. BLOCKED retorna al autor, con cada hallazgo registrado y nueva revisión posterior.
4. QA único ejecuta aceptación; si escribe tests obtiene revisión inmediata de área. Fallos vuelven al autor correspondiente, nueva revisión y reejecución.
5. Seguridad exige PASS/BLOCKED explícito por auth/PII/ubicación/integración. Clínica se convoca solo por compatibilidad/elegibilidad/copy clínico, no automáticamente para cambios puramente mecánicos. Evidencia legal profesional faltante no se sustituye por revisión técnica.
6. Sincronizar documentación afectada; staged diff solo contiene artefactos autorizados revisados. Commit por proceso cerrado; registrar hash y siguiente paso. No pasar al siguiente proceso saltando gate pendiente.

## Skills por alcance

- Coordinación: planning-and-task-breakdown, incremental-implementation, documentation-and-adrs y code-review-and-quality.
- Dominio/contratos: save-a-life-domain, api-and-interface-design, save-a-life-api-database; spec-driven-development cuando falte especificación/decisión.
- Lógica/pruebas: test-driven-development; debugging-and-error-recovery para fallos reproducidos.
- Seguridad: save-a-life-security-privacy y security-and-hardening.
- UI: frontend-ui-engineering; webapp-testing/agent-browser para navegador; frontend-design solo si cambia dirección visual.
- Context7 para documentación de librerías/CLI actualizada; no aprueba decisiones de producto.

## Verificación prevista (no ejecutada en esta fase)

```bash
TMPDIR=/tmp/opencode npm run test:api:generator
npm run openapi:lint
npm run openapi:api:check
npm run test:backend:dto
npm run test:contract
npm run typecheck
npm run build
npm run test:bruno
npm run test:e2e -- --trace=off
npm run audit:production
git diff --check
```

Pruebas focalizadas en cada slice; no repetir suites sobre código sin cambios por rutina. E2E pertinente para P11 y consumidores modificados; snapshots/trazas/HAR/cookies no se comparten. Prism/mock no prueban Auth/RLS/DB/transacciones reales. Si cambia inventario de operaciones, revisar fixture de cobertura conscientemente, no autoajustar conteos para fabricar verde.

## Decisiones y riesgos pendientes

| ID | Tema | Tratamiento |
| --- | --- | --- |
| D0 | Permisos Bash/pruebas/stage/commit | Usuario habilita ejecución necesaria; no cambiar configuración ni usar otro canal/subagente para eludir prohibición |
| D1 | Prerrequisitos previos sin commit | Solicitar permiso de incorporación de base ya revisada; excluir config/ADR y runtime no aceptado |
| D2 | Transporte de expectedVersion en DELETE | Arquitectura recomienda y usuario decide; no cambiar errores/status sin contrato |
| D3 | Legal por estado y MFA | Concretar variantes sin nuevo comportamiento de Auth ni conclusiones profesionales |
| D4 | UTC en salida vs fechas de entrada | Ratificar política antes de romper schemas compartidos/tests aprobados |
| D5 | Ruta y DTO de sedes propias | Definir contrato nuevo, efectos/inventario y ratificación acotada |
| D6 | P12 alcance productivo | Ratificación individual de operaciones; no habilitar 68 endpoints por una orden genérica |
| R1 | Writer/QA comparten canon/generados/runner | Secuencial; solo consultas read-only independientes pueden paralelizarse |
| R2 | Tolerancia numérica acepta precisión indebida | Justificar configuración y probar fronteras, no ampliar precisión silenciosamente |
| R3 | Cambios de usuario durante ejecución | Reconsultar estado/diff; detener slice en conflicto y preservar, sin reset/stash |

## Criterios de terminado

- [ ] A1: matriz completa y decisiones afectadas resueltas antes de sus implementaciones.
- [ ] A2: módulo creación compila, mantiene entrada/salida exactas y pruebas pertinentes verdes.
- [ ] A3: reconocimientos/solicitudes/MFA/legal/fechas alineados con fuente aprobada y ejemplos negativos cubiertos.
- [ ] A4: precisión numérica correcta, sin tolerancia excesiva ni afirmación de validación geográfica real.
- [ ] A5: selección propia de sedes y primera creación local verificadas por rol/teclado/móvil.
- [ ] A6: operaciones ratificadas con DTO runtime/pruebas; otras y AP bloqueadas identificadas honestamente.
- [ ] A7: reviewers y gates pertinentes PASS, regresión pertinente aprobada, documentación sincronizada.
- [ ] A8: commit por proceso cerrado con paths revisados y evidencia, sin incluir cambios ajenos.

## Bitácora

| Fecha | Inicio/fin / agente | Archivos, evidencia, veredicto y hallazgos | Siguiente paso |
| --- | --- | --- | --- |
| 2026-10-04 | P0 inicio / Senior | Solicitud explícita de implementar y commitear por proceso. Leídos AGENTS, workflow, requisitos, matriz de agentes y planes existentes. Skills pertinentes cargadas. | Preservación, plan y permisos |
| 2026-10-04 | Estado inicial / Senior | `git status --short` y `git diff --stat` permitidos: 11 tracked modificados, 179 inserciones/47 eliminaciones, más API/scripts/contrato/plan/Bruno nuevos previos. Sin stage/commit ni edición producto. Configuración y ADR previos excluidos. | Acordar base de commits |
| 2026-10-04 | Bloqueo operativo / Senior | `git log --oneline -10` fue denegado por política Bash. Solo tres consultas básicas permitidas. No tests/stage/commit intentados ni restricción eludida. | Usuario habilita permisos |
| 2026-10-04 | Plan nuevo / Senior | Plan persistido antes de cualquier implementación, con tareas P0–P13, gates, verificaciones y commits por proceso. No sobrescribe backend-inside-out ni tasks/plan.md. | Consulta arquitectónica read-only y preguntas D0/D1 |

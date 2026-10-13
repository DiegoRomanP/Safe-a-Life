# Revalidación y cierre de mock-contract-alignment con Pi

Fecha: 2026-10-11 (host de la sesión).
Estado: En progreso — arquitectura contrastada; recuperación de evidencia QA y baseline actual.
Coordinación: Senior.
Solicitud: ejecutar [el plan del 08-10](2026-10-08-mock-contract-alignment.md), con apoyo del [checklist ODD](../../odd/tasks/mock-contract-alignment.md).

## Objetivo, autoridad y situación encontrada

Cerrar la alineación contractual autorizada, preservando el trabajo existente y sin confundir un contrato draft con implementación real. Solo `createHospitalNeed` está ratificado. La persona usuaria autorizó contrato/verificación y eligió `deliveryCounts` como estados actuales excluyentes cuya suma es `createdInvitationCount`. AP-02 sobre reintentos y fallos continúa abierta.

El arquitecto Pi verificó que las seis correcciones y sus regresiones ya están presentes. La [reanudación del 10-10](2026-10-10-reanudacion-mock-contract-alignment.md) registra implementación, RED/GREEN y gates, pero detuvo el cierre por trabajos posteriores de API/traslado. El plan del 08-10 y ODD conservan estados anteriores. No se rehace la implementación ni se atribuyen sus deltas a esta sesión: primero se comprueba la evidencia histórica y el estado actual.

## Alcance y exclusiones

- QA: único dueño de pruebas; `scripts/prism-contract.test.mjs` si se detecta un hueco pertinente. Primero solo recuperación/checkpoint/ejecución, sin editar el repositorio.
- Backend: único dueño de contrato/tooling; `docs/openapi.json`, `docs/Api-Rules.md`, `scripts/prism-contract.mjs`. Generados exclusivamente por `scripts/generate-api-contract.mjs`: `apps/api/src/modules/need-records/dto/openapi.ts`, `apps/api/src/modules/need-records/dto/contract.generated.json`, `apps/web/src/api/openapi.ts`, `apps/mock-api/src/api/openapi.ts`.
- Senior: bitácoras en `docs/plans/`. El checklist ODD se conserva como histórico y se enlaza desde el cierre; no se modifica `tasks/plan.md`.
- Reviewers y auditor: solo lectura, independientes del autor.
- Excluir handlers/UI, backend productivo, traslado API/backend, Bruno, persistencia/RLS/correo, configuración, dependencias/locks, requisitos funcionales y ADR. No cambiar el POST ratificado.
- Sin reset/revert/stage/commit/publicación. Checkpoint Git y snapshots no destructivos antes de cualquier cambio no trivial. No copiar secretos ni registrar PII, tokens, coordenadas exactas o cuerpos de solicitudes.

## Criterios de aceptación

1. Moderación: request y respuesta específicos coherentes con `suspendida`/`sin_publicar`; levantar suspensión no republica.
2. DELETE de política: query `expectedVersion` requerida, integer mínimo 0; `Idempotency-Key`, `204` vacío y `409` intactos; errores uniformes.
3. GET de sedes hospitalarias: propias y activas, DTO cerrado `{siteId, publicName}`, institución de identidad/membresía, sin selector de hospital; paginación y revalidación al crear necesidad.
4. Consulta contextual: `currentValues` y `proposedValues` separados, limitados ambos al grant actor/solicitud/donante/acción/campos y allowlist existente. Sin valores sensibles en summaries/auditoría; sin nueva política de acciones de grant.
5. Conteos: cuatro buckets excluyentes, enteros no negativos; ejemplos suman el total, AP-02 expresamente abierta.
6. CSRF de salida: `readOnly`, no `writeOnly`, límites 32–512 intactos; no relajar schema ni omitir operaciones para Prism.
7. Evidencia de regresiones RED históricas verificable, GREEN actual, inventario efectivo y generación sincronizados. No fabricar un nuevo RED ni deshacer correcciones para producirlo.
8. PASS independiente de pruebas/backend, tipos frontend y privacidad para sus alcances; comandos pertinentes aprobados. Si alguna verificación pertinente falla, corregir con su autor, revisar de inmediato y repetir afectados.

## Secuencia eficiente y responsabilidades

Un solo escritor por slice; ninguna escritura paralela sobre contratos compartidos. Solo lecturas independientes sobre una baseline estable pueden correr juntas. Después de cualquier asignación que cambie código, reviewer de área inmediato antes de otro escritor; pruebas también requieren reviewer-back. Si no hay delta nuevo, revisar el artefacto existente completo y distinguirlo de la evidencia histórica.

| ID | Responsable Pi | Asignación, límites y pruebas | Dependencia | Estado |
| --- | --- | --- | --- | --- |
| A0 | `pi-solution-architect` | Contrastar seis decisiones y fuentes; recomendar sin autoaprobar ni editar | Preparación | Hecha: encontró correcciones existentes y límites draft |
| Q1 | `pi-qa-reliability-engineer` | Baseline/checkpoint local allowlisted; recuperar RED/GREEN del 10-10 y snapshots; ejecutar solo regresión estática actual; no editar repo | A0 | Iniciada |
| R1 | `pi-reviewer-back` | Revisión independiente de todo el test existente y evidencia RED/contramutaciones; PASS o BLOCKED con hallazgos localizados | Inmediato Q1 | Pendiente |
| B1 | `pi-backend-data-engineer` | Verificar cambios existentes C1–C6, inventario, salidas oficiales y preservación del POST; ninguna edición salvo defecto concreto autorizado | R1 PASS | Pendiente |
| R2 | `pi-reviewer-back` | Revisión completa contractual/tooling/generados API/mock sobre baseline y snapshots; PASS/BLOCKED | Inmediato B1 | Pendiente |
| F2 | `pi-reviewer-front` | Revisar tipos web generados y consumidores existentes; no escribir UI | R2; diff estable | Pendiente |
| S2 | `pi-security-privacy-auditor` | Gate explícito PASS/BLOCKED del contrato: sedes, grants, versión, CSRF, minimización y límites mock | R2; paralelo F2 solo lectura | Pendiente |
| Q2 | `pi-qa-reliability-engineer` | Dueño único de QA final: lint, generador/check, contrato/Prism, typecheck y tests mock/DTO pertinentes; preservación y diff propio | R1/R2/F2/S2 PASS | Pendiente |
| C0 | Senior | Sincronizar estado en plan origen, bitácora y reporte; registrar pendientes externos sin declararlos resueltos | Todos los gates pertinentes PASS | Pendiente |

## Skills y formato de reporte

Todos leen `AGENTS.md`, `docs/Agent-Workflow.md` y su perfil `.pi/agents/pi-*.md`; usan `subagent` solo desde Senior y no delegan ni hablan al usuario. Skills mediante `read` sobre `.opencode/skills/<nombre>/SKILL.md`.

Arquitectura: dominio/API/documentación. QA: TDD/API/privacidad/hardening (navegador solo si surge una dependencia real). Backend: dominio/API/base de datos/incremental/documentación/TDD/privacidad/hardening. Reviewers: calidad y skills pertinentes de área. Auditor: privacidad/hardening. Coordinación: planning/incremental/documentación/calidad y skills de dominio/contrato/seguridad ya cargadas.

Cada reporte: veredicto y alcance, paths propios/excluidos, archivos modificados, checkpoint/diff/base usados, comandos/resultados/exit codes, hallazgos, limitaciones y siguiente paso. No considerar el bloqueo de perfiles OpenCode anteriores evidencia de bloqueo de perfiles Pi actuales.

## Comandos y evidencia requerida

- Baseline/recuperación: Git status/HEAD/índice, hashes allowlisted y checkpoint seguro; validar evidencia `/tmp/opencode/save-a-life-e1-*`, `save-a-life-e3b-*` si existe, sin depender de su disponibilidad para afirmar hechos no observados.
- Q1: `node --test scripts/prism-contract.test.mjs`; si RED histórico no es recuperable, informar la limitación y verificar contramutaciones existentes sin simular una cronología.
- B1: verificación de inputs/outputs con generador oficial `--check`, no regenerar sin necesidad.
- Q2: `npm run openapi:lint`, `npm run test:api:generator`, `npm run openapi:api:check`, `npm run test:contract`, `npm run typecheck`, `npm run test:api`, `npm run test:backend:dto` según scripts actuales.
- Inventario efectivo esperado documentado: 55 paths/70 operaciones; cobertura runner 377 HTTP (70 éxitos, 34 variantes, 273 errores), 16 colecciones. Debe comprobarse, no derivarse silenciosamente de un canon defectuoso.
- No E2E de UI ni Supabase/Resend reales para un cambio exclusivamente contractual; no afirmaciones de auth/RLS/transacciones reales desde Prism.

## Riesgos y pendientes fuera de este cierre

- Branch `feat/backend-developing`, HEAD inicial `9ccf41d16bf847f5ce7055d19ff99ac440196c55`; 17 tracked modificados sin stage y 16 entradas untracked observados por A0. Preservar todos los cambios ajenos.
- `.opencode/references/project-requirements.md` conserva inventario histórico 54/69, frente al draft actual 55/70. Reanudación anterior excluyó fuentes funcionales/ADR: registrar como desfase de inventario no funcional, sin modificar una decisión aprobada ni bloquear/redefinir conducta por una cifra histórica.
- Acción concreta del grant sigue siendo requisito; no convertir ejemplos opcionales `review`/`execute` en una política nueva.
- Traslado API/backend y reparación de configuración Pi son trabajos independientes; no resolverlos ni declarar sus gates cerrados aquí.
- AP-02/04/06/07/08 abiertas. No se alteran compatibilidad/elegibilidad ni reglas clínicas; no se dispara gate clínico por estos cambios contractuales operativos.
- Engram falla en este host por binario sin soporte `instance-id`; bitácora local conserva la evidencia, sin cambios globales.

## Bitácora

### A0 — Arquitectura inicial y descubrimiento de implementación previa

- Inicio/fin: 2026-10-11, asignación read-only a `pi-solution-architect`; reporte recibido antes de Q1.
- Herramientas: lectura y Bash read-only disponibles; Node `v24.19.0`; lectura de requisitos y planes desde disco. `npm --version` fue rechazado por política read-only; no se eludió ni se considera prueba ejecutada.
- Resultado: recomendación, no autoPASS de arquitectura. C1–C6 y regresiones ya presentes; recuperar ejecución del 10-10 antes de atribuir nuevos cambios. Ningún archivo modificado.
- Evidencia localizada: `docs/openapi.json` sedes 761–798, DELETE 1289–1312, moderación 1866–1906/2798–2801, conteos 2273–2287, CSRF 2346–2350, contextual 2745–2781; tests 425–915; reglas 373–377.
- Hallazgos: inventario histórico excluido 54/69 vs draft55/70; mantener límites del grant sin inventar mapeo de acciones. No contradicción funcional que requiera nueva decisión para continuar el alcance mínimo aprobado.
- Leída reanudación del 10-10: documenta RED y reviews, C1–C6 entregados y cierre pausado por trabajos independientes. Debe revalidarse en Q1–Q2, no atribuir PASS nuevo solo por lectura del plan.
- Siguiente paso: Q1 recuperación y baseline, seguido inmediatamente de R1 independiente. No nuevas escrituras de producto.

### Q1 — Inicio

- 2026-10-11: asignación específica a `pi-qa-reliability-engineer`, recovery/baseline/current-regression; repo read-only, checkpoint local permitido solo con paths allowlisted no sensibles. Preservar HEAD/índice/worktree; no reescribir pruebas existentes.
- Registrar retorno y lanzar R1 antes de otra asignación escritora. Si se detecta un defecto, definir corrección acotada y revisión independiente correspondiente.

### Q1 — Resultado e inicio inmediato R1

- Fin 2026-10-11: `pi-qa-reliability-engineer` devolvió BLOCKED de ejecución, no fallo de producto. Cero archivos modificados; lecturas y consultas Git permitidas exit0, HEAD/status/stat/índice sin drift observable.
- Modo efectivo del hijo `ask`: `sha256sum`, creación de checkpoint incluso bajo `/tmp` y `node --test scripts/prism-contract.test.mjs` rechazados. El proceso de tests no inició; no hay exitcode/counts/duración ni hashes de contenido certificados.
- Los tres checkpoints históricos consultados no existen en este host (`ls` exit2). RED57/23, RED72/24 y GREEN72/377 figuran en bitácora del10-10, pero no se acredita evidencia bruta aquí ni se fabrica RED nuevo.
- Cobertura C1–C6 y contramutaciones presentes por lectura del test425–915; no ejecutadas. No se cuenta PASS de pruebas.
- R1 se asigna inmediatamente, independiente y read-only, sobre todo el test existente y esta limitación. Su veredicto distingue calidad estática de test de la ejecución QA pendiente.
- Próximo paso: comprobar un mecanismo legítimo de herencia/cambio de modo para ejecución; no evadir la política `ask`, cambiar configuración ni usar canales alternativos para comandos rechazados.

### R1 — BLOCKED y corrección específica Q1c

- Fin 2026-10-11: `pi-reviewer-back`, BLOCKED de cobertura/calidad estática, cero escrituras y comandos. Leyó íntegramente test1–915; no revisó diff Git completo ni acreditó provenance histórica. No PASS de tests ni de ejecución.
- Required1/Media, test676–681: no se rechaza `proposedValues:null`; cubrir null/array/escalares para ambas proyecciones del200 efectivo y contramutación nullable con control conforme.
- Required2/Media, test715: checker de grant omite descripciones efectivas de propiedades. Incluir ambas y detectar contradicción `proposedValues no se limita al grant`, sin rechazar exclusiones legítimas de campos.
- Required3/Media, test872–874: AP-02 se controla solo en Markdown. Verificar apertura/no cierre en cláusula pertinente JSON y reglas; contramutación del JSON real conservando reglas abiertas.
- Required4/Media, test430–452 y897–913: moderación entrada y CSRF200 inspeccionan componentes pero no schemas efectivos. Cubrir restricciones del endpoint y sustituciones permisivas dejando componentes intactos, con controles conformes.
- Corrección vuelve al único dueño QA, solo `scripts/prism-contract.test.mjs`; no tocar canon/API ni bajar severidad. Exigir snapshot/checkpoint, RED de contramutaciones, GREEN y reviewer-back inmediato sobre diff completo.
- Se comprueba herencia legítima mediante `session:fork`, porque la asignación depende de hallazgos/contexto de esta sesión autorizada. No se instruye al hijo a ignorar `ask`; si su política efectiva lo conserva, debe detener escrituras/ejecución y reportar. No cambiar configuración ni usar canales alternativos.

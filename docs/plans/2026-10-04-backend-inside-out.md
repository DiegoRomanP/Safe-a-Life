# Backend de Save a Life: inicio inside-out

**Fecha:** 2026-10-04  
**Coordinador:** Senior  
**Estado general:** En progreso — primer slice ratificado por usuario; T4a contrato antes de código de aplicación  
**Solicitud:** Iniciar el backend siguiendo `docs/`, contratos primero, persistencia, servicios independientes de HTTP con unitarias, controladores delgados e integración/E2E; probar campos/endpoints con Bruno CLI y consultar Context7 cuando corresponda.

## Objetivo

Construir el backend real del prototipo académico por módulos y slices verificables, sin convertir los mocks ni los borradores contractuales en decisiones productivas implícitas. En cada caso de uso respetar el orden **DTO/esquemas → entidades y repositorios → servicios y unitarias → transporte HTTP → integración/E2E con Bruno**.

## Fuentes y estado inicial

- `AGENTS.md` y `docs/Agent-Workflow.md`: Senior coordina, solo escribe este plan, delega mediante IDs exactos y exige revisión independiente inmediata de cada diff de código/pruebas.
- `docs/1_Primeros_Alcances.md` v1.2: línea base aprobada, exclusivamente datos sintéticos.
- `docs/2_Especificaciones_De_Software.md` v0.4: borrador controlado; no reemplaza la línea base.
- `docs/decisions/ADR-001-stack-del-prototipo.md`: Node.js/Express, PostgreSQL/Supabase Auth, Resend, monolito modular y adaptadores aprobados.
- `docs/decisions/ADR-002-design-first-mock-tooling.md`: tooling fijado para frontend/mock local; no decide el acceso real a datos ni la sesión productiva.
- `docs/Api-Rules.md` y `docs/openapi.json`: contrato de trabajo con 54 paths/69 operaciones, explícitamente pendiente de ratificación Sprint 0.
- `.opencode/references/project-requirements.md`: consultar sincronización en cada módulo; AP-02/AP-04/AP-06/AP-07/AP-08 continúan abiertas.
- `package.json`, README e índice documental: actualmente solo workspaces `apps/mock-api` y `apps/web`; no existe `apps/api` ni `apps/worker` en el inventario inicial. T1/T2 detectaron además `backend/`, `frontend/` y `database/esquema.sql` fuera del workspace. T1b ya contrastó backend y SQL: scaffold y esquema preliminar incompatibles, no base real aprobada. DB remota y procedencia histórica no verificadas. No afirmar que todo el repositorio carece de backend.
- Git inicial: `git status --short` muestra únicamente una modificación preexistente de `.opencode/opencode.json`; `git diff --stat` indica ocho inserciones. Conservarla sin editar/stagear. No commits, push, deploy ni cambios de configuración OpenCode solicitados.
- El plan de entrega frontend del 2026-10-03 está completado solo para mocks locales; sus PASS y comandos históricos no son pruebas del backend real.

## Alcance y exclusiones

### Alcance inicial

1. Consultar arquitectura de solo lectura para proponer mapa de capacidades, dependencias, primer módulo y decisiones mínimas que requieran aprobación.
2. Comprobar Bruno CLI y viabilidad del entorno de prueba sin instalar, arrancar servicios ni leer secretos.
3. Someter a la persona usuaria las decisiones que cambien contrato/comportamiento antes de delegar implementación; primer slice, base/entorno y anclaje aprobados en T3.
4. Congelar el contrato del primer módulo y detallar sus paths/slices y pruebas sin reemplazar planes existentes. Las demás operaciones y las decisiones de sesión/refresh siguen pendientes.

### Exclusiones

- No implementar HTTP o lógica antes de definir y revisar DTO de entrada/salida.
- No copiar auth/MFA/cookies demo, reset HTTP, simulación de matching o estado RAM como implementación real.
- No modificar un ADR aprobado ni ratificar globalmente el OpenAPI sin aprobación.
- No decidir unilateralmente AP abiertas, TTL de sesión, carreras, jitter, backups, polígono Lima o integración operativa de proveedores.
- No introducir datos reales, pacientes, diagnósticos, historial/fecha de donación, certificación clínica o afirmación de cumplimiento legal.
- No tocar `.opencode/opencode.json`, `tasks/plan.md`, planes previos, frontend ni mock durante el análisis.
- No instalar dependencias, exponer servicios, ejecutar migraciones remotas, enviar email real ni pedir credenciales en el chat.

## Criterios de aceptación

- [x] A1: inventario y precedencia documental contrastados; mapa de capacidades y primer módulo propuestos con dependencias y riesgos; R0 PASS limitado a preparación.
- [x] A2a: usuario aprobó primer slice y ratificación acotada, `apps/api` + Supabase local y plazo desde creación mediante tres respuestas explícitas.
- [ ] A2b: decisiones de sesión/refresh y detalles de persistencia elegidos/revisados antes de sus capas; no inferir aprobación de todas las rutas.
- [x] A3a: Bruno CLI verificado con `bru --help`, `bru --version` y `bru run --help`: versión 4.2.0 y flags confirmados.
- [ ] A3b: ejecución efectiva y estrategia de pruebas de campos, status, headers, payload y errores segura y reproducible; no basta verificar ayuda.
- [ ] A4: cada caso de uso implementado tiene Input/Output DTO cerrados, restricciones y errores documentados antes de persistencia/lógica/HTTP.
- [ ] A5: entidades/repositorios desacoplados, inyección de dependencias y unitarias de éxito/error/fronteras antes de transporte; persistencia real con migraciones/RLS verificadas cuando corresponda.
- [ ] A6: controladores solo validan/parsean, invocan, mapean errores y responden DTO; nunca serializan filas ni aceptan rol/hospital del cliente.
- [ ] A7: cada slice y cambio de pruebas obtiene PASS independiente de ReviewerBack; seguridad PASS para auth/RLS/PII/integraciones y clínica PASS cuando aplique, siempre con alcance/evidencia.
- [ ] A8: QA único para flujos críticos ejecuta pruebas pertinentes y Bruno contra el backend real, sin considerar Prism/mock prueba de RLS/auth/transacciones; no cerrar con pruebas pertinentes fallidas/no ejecutadas.
- [ ] A9: contratos/documentación/README sincronizados y reporte en español con archivos, comandos, veredictos, límites y enlace al plan.

## Tareas, responsables y secuencia

T3 aprobó únicamente el primer módulo/slice, la base y el entorno. T4a queda autorizado dentro de sus paths; T4b–T9 requieren aún detalle/asignación y gates previos. El mapa de ocho capacidades sigue propuesto para siguientes módulos, no ratificado globalmente.

| ID | Objetivo / responsable | Paths propios / exclusiones | Dependencias | Verificación / gate | Estado |
| --- | --- | --- | --- | --- | --- |
| T0 | Análisis documental inicial / Senior | Solo lectura docs/requisitos/manifiestos; escritura exclusiva de este plan | Ninguna | Autoridad documental, estado Git y tareas previas | Completada |
| T1 | Recomendación de arquitectura / `solution-architect` | Solo lectura docs, ADR, requisitos, manifiestos, apps y estructura; ningún cambio de archivos | T0 | Mapa, primer módulo, supuestos/trade-offs, decisiones abiertas con referencias; no autoaprobación | Completada — recomendación, no aprobación |
| T1b | Contrastar artefactos backend fuera del workspace / mismo `solution-architect` | Lectura acotada `backend/` y `database/esquema.sql`; excluir secretos/dependencias/builds; sin ediciones | T1 hallazgo | Determinar vigencia y discrepancias relevantes antes de decidir reutilización | Completada — scaffold/SQL preliminar contrastados |
| R0 | Revisión independiente de recomendación/plan / `reviewer-back` | Solo lectura de este plan, contrato propuesto y evidencias T1/T1b; sin cambios/comandos | T1/T1b/T2 | PASS/BLOCKED acotado a preparación, no aprobación del contrato/producto | Completada — PASS preparación |
| T2 | Viabilidad de pruebas / `qa-reliability-engineer` | Solo lectura Bruno/scripts/configs/manifiestos; comandos de ayuda/versión/disponibilidad; sin leer `.env`, escribir ni instalar | T0; independiente de T1 | `bru --help`, `bru --version`, `bru run --help`; herramientas DB/test y límites de reporte | Completada — binarios, no pruebas funcionales |
| T3 | Acordar primer slice/base/plazo / Senior + usuario | Registrar únicamente en este plan; alcance completo/API/session pendientes | T1/T2 | Tres respuestas explícitas; frenar solo partes afectadas | Completada — decisiones acotadas, no mapa/API global |
| T4a | Ratificación contractual canónica / `dev-back` | `docs/openapi.json`, `docs/Api-Rules.md`, nuevo `docs/Backend-Contracts.md`, `README.md`, dos tipos web/mock solo generación; corrección tipada mínima en `apps/mock-api/src/app.ts`; sin API real/repos/dependencias | T3 | Lint/types/contract/typecheck/build verdes; ReviewerBack y ReviewerFront | Completada — PASS de área; QA regresión en T4q |
| T4q | Regresión CLI del contrato/radio normalizado / único QA `qa-reliability-engineer` | Tres solicitudes `.bru` de hospital: guardar mínimos de resultado creación y añadir omitido/default/replay; sin producto/runner/config/secrets | T4a PASS | CLI24requests29tests, contract27+369 y typecheck; ReviewerBack PASS pruebas. Alcance exclusivamente mock local | Completada |
| T4d | Concretar DTO runtime/generación y dependencias / `solution-architect` | Solo lectura contrato/manifiestos/lock; ningún cambio | T4a/T4q PASS | Recomendación de validador y versions, límites de slices; aprobación nueva dependencia antes de instalar | Completada — recomendación, aprobación de dependencia pendiente |
| T4b1 | Base API y generación canónica / `dev-back` | Root `package.json`/lock; `apps/api/package.json`/tsconfigs; generador+tests bajo scripts; tipos/snapshot API generados; JSON201UTC y web/mock tipos solo regeneración | T4a/T4q PASS, Ajv autorizado | RED→GREEN generador, driftcheck, tipos/build/tests/audit; ReviewerBack y ReviewerFront PASS | Completada — revisión área PASS; QA independiente en curso |
| T4b1q | Verificación independiente de generación/base / QA único | Sin escritura; comandos focalizados generator/drift/typecheckAPI y disponibilidad daemonDocker sanitizada | T4b1 PASS | 18pruebas generador y drift sin escritura; herramientas no implicanDBreal; no tests pertinentes fallidos | Completada |
| T4b2 | Validadores DTO estrictos / mismo `dev-back` | Validadores/types/tests bajo `apps/api/src/modules/need-records/dto/`; scripts test de API en manifest/root alias; sin repo/servicios/HTTP | T4b1/T4b1q PASS | Unitarias input/output cerrado/fronteras/formats/error seguro/no mutación, Ajv strict sin coerción/default/remoción; ReviewerBack inmediato | Bloqueada — hay archivos parciales sin verificación ni revisión; asignación cancelada sin reporte |
| V-DTO | Verificar todos los DTO sin corregir / `reviewer-back` y QA único | Solo lectura de schemas OpenAPI, tipos generados y validadores presentes; QA ejecuta únicamente comprobaciones existentes focalizadas, sin escritura de código/contratos/config/deps | Solicitud nueva: “solo verifica eso” | Inventario de DTO, coherencia entrada/salida/restricciones/proyección, deriva, typecheck y tests DTO existentes; reporte con límites sin implementar | En progreso |
| T4v | Aceptación independiente y seguridad de fase DTO / QA único + `security-privacy-auditor` | QA lectura/ejecución y tests solo si cobertura insuficiente; auditor read-only | T4b2 PASS | Pruebas fase1/Bruno/audit/drift y PASS seguridad limitado DTO/dependencias; revisión backend si QA escribe tests | Pendiente |
| T4s | Sincronizar documentación de fase1 / `solution-architect` autor | README, API rules, Backend-Contracts, Frontend-Handoff (conteos), ADR-003 nuevo acotado a decisiones explícitas; sin producto | Gates fase1 | Revisión independiente documental, versiones/conteos/comandos/límites actuales | Pendiente |
| T5 | Entidades/puertos y persistencia / `backend-data-engineer` | Módulo de dominio/repositorios y migraciones versionadas acordadas; sin frontend/mock/HTTP | T4 PASS | Constraints, RLS, clean/upgrade/rollback; ReviewerBack inmediato + seguridad | Bloqueada — T3/T4 |
| T6 | Servicios independientes de HTTP / `dev-back` (o especialista si centro transaccional) | Aplicación/dominio del módulo, dobles de prueba; sin controladores ni contratos ajenos | T5 PASS | Unitarias felices/negativas/fronteras, DI, sin req/res/status HTTP; ReviewerBack inmediato | Bloqueada — T4/T5 |
| T7 | Transporte delgado / `dev-back` | Controladores/rutas/mapeo seguro/configuración del módulo aprobado; sin cambiar contrato ni reglas de negocio | T6 unitarias aprobadas | Status, headers, errores y DTO; ReviewerBack inmediato + seguridad pertinente | Bloqueada — T6 |
| T8 | Pruebas de aceptación críticas / único dueño `qa-reliability-engineer` | Tests unit/integración/RLS y colección/runner Bruno específicos del backend; no producto | Implementación PASS | Bruno obligatorio para campos/endpoints; matriz roles/IDOR/CSRF y DB real según módulo; ReviewerBack inmediato si escribe tests | Bloqueada — implementación |
| T9 | Documentación y cierre del módulo / `solution-architect` autor documental + Senior bitácora | README/API/ADR nuevos o sincronización autorizada; no sustituir ADR aceptado; Senior solo este plan | T8 y gates PASS | Revisión independiente del artefacto; comandos y límites trazables | Bloqueada — aceptación |

Para cada implementación, Senior reducirá estas fases a slices de tamaño revisable con un solo writer por paths. T1 y T2 pueden ejecutarse en paralelo porque son solo lectura y no fijan contratos. No paralelizar writers mientras haya contratos o archivos compartidos.

## Skills

- Cargadas por Senior: `planning-and-task-breakdown`, `incremental-implementation`, `spec-driven-development`, `save-a-life-domain`, `api-and-interface-design`, `save-a-life-api-database`, `documentation-and-adrs`, `code-review-and-quality`, `save-a-life-security-privacy`, `security-and-hardening`, `test-driven-development`.
- Arquitectura: dominio, spec/plan, API/database, ADR y seguridad antes de recomendar.
- QA: TDD, API/database y seguridad; `webapp-testing` solo si se prueba navegador; matching-notificaciones solo al entrar en ese módulo.
- Implementadores/reviewers cargarán las skills del área en cada asignación. Ningún subagente delega ni conversa con usuario.
- Context7 se usa para documentación técnica actualizada; no resuelve ni aprueba decisiones de producto, clínicas o de privacidad.

## Pruebas previstas

- Contratos: campos mínimos/obligatorios, tipos, longitudes, enums, UUID, campos desconocidos y prohibidos, Input/Output DTO y errores seguros.
- Servicios: unitarias sin servidor/red, DI con repositorios en memoria o dobles acotados, casos felices y de error; evidencia RED→GREEN donde corresponda.
- Persistencia: PostgreSQL/Supabase de prueba aislado, migraciones desde cero/versión anterior, restricciones, RLS directa, scope y transacciones pertinentes. No declarar aprobada la persistencia si no se ejecuta.
- HTTP: Bruno CLI contra servidor real local aislado, assertions de status, headers y JSON; unitarias/Supertest complementan pero no sustituyen Bruno.
- Reportes: no imprimir/guardar cuerpos, cookies, tokens, claves idempotentes, PII, URLs/query sensibles ni coordenadas. Artifacts temporales solo en ubicación aprobada; sin trazas/HAR con secretos.
- Regresión del paquete existente: comandos actuales de test/typecheck/build/OpenAPI/Bruno conforme al alcance y después de cambios que los afecten; no reinstalar por rutina.

## Riesgos y decisiones por consultar

| Riesgo / decisión | Tratamiento |
| --- | --- |
| OpenAPI y convenciones aún en borrador | Arquitecto propone ratificación acotada; usuario decide antes de implementar rutas. |
| Backend/persistencia no integrados en el workspace | Contrastar el `backend/` externo y SQL existentes antes de elegir base; no reemplazar ni migrar artefactos silenciosamente. |
| SDK/driver, migraciones, sesión/cookie/CSRF/CORS no concretados | Recomendar opciones con documentación actualizada y escalar las que cambien conducta/contrato. |
| AP-02/04/06/07/08 abiertas | Mantener bloqueadas solo cláusulas afectadas; no resolverlas usando ejemplos del mock. |
| Fuentes con advertencias históricas de sincronización | Contrastar contenido actual y registrar discrepancias concretas, sin modificar ADR aprobado unilateralmente. |
| Preservación de modificación de usuario en configuración | Excluir `.opencode/opencode.json` de todas las asignaciones de escritura. |
| Seguridad de evidencia | Ningún comando imprime secretos o PII; Bruno/reporters sin bodies/headers. |
| Alcance «todo el backend» demasiado amplio | Mapa de capacidades y aceptación por módulo; no afirmar entrega total de MVP al completar un slice. |

## Bitácora

| Fecha | Inicio/fin / agente | Archivos, evidencia, veredicto y hallazgos | Siguiente paso |
| --- | --- | --- | --- |
| 2026-10-04 | T0 inicio/fin / Senior | Leídos AGENTS, workflow, requisitos, línea base, secciones ERS pertinentes, API rules, ADR-001/002, README, manifiesto y plan frontend previo. `git status --short`/`git diff --stat`: configuración del usuario modificada, preservada. Un comando compuesto de Git fue denegado por permisos antes de ejecutarse; se usaron los dos comandos individuales permitidos. | Plan nuevo y consultas read-only |
| 2026-10-04 | Plan creado / Senior | Único archivo nuevo de coordinación. No implementación, instalación, migración ni prueba de endpoints ejecutada. Borrador API y decisiones productivas pendientes detectados. | T1/T2 |
| 2026-10-04 | T1 inicio / `solution-architect` | Recomendación read-only antes de arquitectura/contratos; inventariar capacidades y decisiones mínimas con evidencia. Sin permiso de escritura en esta asignación. | Registrar resultado y consultar usuario |
| 2026-10-04 | T2 inicio / `qa-reliability-engineer` | Descubrir CLI Bruno y herramientas del entorno para futura aceptación real; solo ayudas/versiones y lecturas sanitizadas, sin instalar/iniciar servicios ni ejecutar pruebas de endpoints todavía. | Registrar comandos/resultados y bloqueos |
| 2026-10-04 | T1 fin / `solution-architect` | Task `ses_ef853bc05fferwTnEgub1DKvmp`. Recomendación: mapa de ocho capacidades y primer slice propuesto `need-records/create-need-draft`, contrato `POST /api/v1/hospitals/me/needs`, sin activación/matching/email. Dependencia identidad real/RLS para HTTP. Usuario debe ratificar; no PASS ni implementación. Hallazgo: `backend/` fuera workspace con dos locks y `database/esquema.sql`; fuentes aún sin inspección. Context7 consultado por agente para Ajv/Supabase/pg. | T1b y aprobación T3 |
| 2026-10-04 | T2 fin / `qa-reliability-engineer` | Task `ses_ef853bbefffeU7q9xsbR2mcEg1`. Ejecutó ayudas/versiones: Bruno4.2.0, Node24.19.0, npm12.0.2, DockerCLI29.8.2, SupabaseCLI2.119.0, psql18.6. Sin error visible; el adaptador no expuso exit numérico (N/D). No daemon/DB/servicios/tests verificados. Confirmados `--sandbox safe`, `--tests-only`, `--reporter-skip-all-headers`, `--reporter-skip-body`. Flags no eliminan URLs ni mensajes de assertions: saneamiento canario sigue pendiente. | Elegir entorno y runner real solo tras T3 |
| 2026-10-04 | Corrección de interpretación del inventario / Senior | README distingue 22 requests de escenarios y 18 operaciones distintas; T2 llamó erróneamente discrepancia a esos dos conteos. No hay evidencia de discrepancia solo por esa diferencia; no editar README ni contrato por este motivo. | Pedir aclaración acotada a QA |
| 2026-10-04 | T1b inicio / `solution-architect` | Ampliación read-only al código fuente backend externo y SQL ya existentes, sin secretos, ejecución ni escritura. Verificar si es scaffold/legado y su relación con decisiones vigentes; no escoger ni borrar base por rutina. | Actualizar hallazgos y consultar usuario |
| 2026-10-04 | T1b fin / `solution-architect` | Mismo task T1. Backend externo: scaffold JS de conectividad, GET informativo y GET diagnóstico Supabase; no capas/DTO/auth de usuario/tests. `backend/index.js` CORS sin allowlist, entidades/errores proveedor directos; SQL preliminar con unidades, estados distintos, última donación, sin sedes/membresías/RLS/idempotencia/auditoría. No ejecutado ni confirmado proyecto DB remoto. No adoptar este SQL ni handler protegido. Recomendación: implementación separada integrada, preservando referencia. | Usuario decide base y contrato; no borrar ni migrar legado |
| 2026-10-04 | Aclaración T2 fin / QA | Retira supuesta discrepancia: 22 llamadas/18 operaciones distintas, como Api-Rules:313; no recuento independiente nuevo. Sin archivos editados ni pruebas. | Inventario sin falso defecto documental |
| 2026-10-04 | R0 inicio / `reviewer-back` | Revisar de forma independiente coherencia de preparación, recomendación de primer slice y decisiones por ratificar; no emitir PASS de backend ni ratificar OpenAPI. Sin escritura/comandos. | Registrar veredicto y preguntar decisiones T3 |
| 2026-10-04 | R0 fin / `reviewer-back` | Task `ses_ef8394492ffe7mLkZ6j9swRPaH`: PASS exclusivamente de preparación/recomendación, sin Required/Critical. Observaciones: estado T1b desactualizado y `radiusKm` entero/opcional con default10 deben precisarse; este registro corrige estado y explicita que default de schema no ejecuta normalización. Sin comandos/tests. | Consultar T3, no interpretar PASS como ratificación |
| 2026-10-04 | T3 preguntas preparadas / Senior | Elección del primer slice/ratificación acotada; base integrada y entorno Supabase local; anclaje creación/activación de plazo. Antes de T4 consolidar respuesta segura de sede y política de radio omitido/hash. Sesión/refresh/CORS/CSRF se diseñan antes de HTTP, no se copian del mock. | Esperar decisiones; no asignar escritor aún |
| 2026-10-04 | T3 decisión / usuario | Eligió “Necesidades en borrador (Recommended)”, “apps/api + Supabase local (Recommended)” y “Desde la creación (Recommended)”. Ratifica acotadamente POST/DTO, radio entero omitido→10, salida borrador/conteo0, reloj UTC PostgreSQL y no extensión al activar. No todas las operaciones ni sesión productiva. | T4a contrato canónico |
| 2026-10-04 | T4a inicio / `dev-back` | Registrar ratificación parcial en operación/docs, entrada estricta, salida creación especializada a borrador/conteo0, radio normalizado antes de hash y plazo desde creación/replay original; sede no utilizable con error genérico uniforme422 conforme a POST actual. Sin producto/HTTP/repos/deps; dos tipos solo por generador. | ReviewerBack inmediato al terminar; frontend generado si cambia |
| 2026-10-04 | T4a fin escritor / `dev-back` | Task `ses_ef76590b3ffe9YJifJCgYjYwhH`. Seis archivos permitidos: OpenAPI, API rules, nuevo Backend-Contracts, README y dos tipos generados. Lint/types/contract27+369/typecheck web/diffcheck pasan. `npm run typecheck` FALLÓ TS2322 en `apps/mock-api/src/app.ts:708`, radio optional DTO vs requerido modelo mock; autor no editó fuera alcance. No Bruno/endpoints reales. | ReviewerBack y ReviewerFront inmediatos; corregir regresión antes de otro writer |
| 2026-10-04 | T4a revisión inicio / `reviewer-back` + `reviewer-front` | Diff contractual completo y dos tipos; frontend verifica impacto generado, backend verifica contrato/seguridad/aceptación y fallo compile conocido. Solo lectura, sin aprobar por tests estáticos. | Registrar veredictos/hallazgos y reasignar corrección |
| 2026-10-04 | T4a ReviewerBack BLOCKED / ReviewerFront PASS | B1 Required: app mock:693 ensancha salida Zod normalizada al DTO externo con `radiusKm?`; asignación app:708 incumple radio requerido en DemoNeed. Cambio recomendado: conservar inferencia salida parser + `satisfies`, sin casts/`!`/editar gen ni hacer radio obligatorio. ReviewerFront PASS exclusivo generado/consumidores, no gate global. | Corrección autor acotada; nueva revisión backend inmediata |
| 2026-10-04 | T4a B1 corrección inicio / `dev-back` | Se autoriza adicionalmente solo `apps/mock-api/src/app.ts` para conservar tipo normalizado del parser en creación. No semántica nueva/cambio contrato/duración/session/HTTP real; sin tests escritos por autor en esta corrección. Repro typecheck→corrección→typecheck/build/API actuales. | ReviewerBack inmediato; luego QA regresión Bruno |
| 2026-10-04 | T4a B1 corrección fin / `dev-back` | Una línea `const needInput = input.data satisfies ApiSchemas['CreateNeedRequest']` preserva tipo parser normalizado. Repro RED TS2322 confirmado; GREEN typecheck global/build/API50/50/diffcheck. Contrato/modelo/default/hash sin cambios. | ReviewerBack inmediato sobre diff completo T4a+corrección |
| 2026-10-04 | T4a B1 re-review inicio / `reviewer-back` | Diff de siete archivos contando app mock, no solo microedición. Verificar B1 y regresiones contractuales previas; no autoconfirmación del autor. | Registrar PASS/BLOCKED antes de siguiente escritor |
| 2026-10-04 | T4a B1 re-review fin / `reviewer-back` | PASS T4a completo+corrección: salida parser garantiza radio requerido antes de hash/replay/persistencia, DTO exterior sigue optional; sin otros Required/Critical. ReviewerFront PASS continúa válido, sin nuevas modificaciones frontend. | QA CLI de regresión antes de ampliar implementación |
| 2026-10-04 | T4q inicio / `qa-reliability-engineer` | Tests Bruno: creación omitiendo radio produce10; misma intención omitido vs10 explícito reproduce ID/plazo originales; status/content-type/allowlist de201borrador/conteo0. Solo mock local; aún no Auth/DB/backend real. No logs de bodies/headers/tokens ni assertion failures con datos. | ReviewerBack inmediato sobre tests; sincronizar conteos si cambian |
| 2026-10-04 | T4q fin QA | Tres tests requests hospital: `05_create_need.bru` modificado, `08_replay_create_need.bru` y `09_create_need_default_radius.bru` nuevos. CLI24/24requests,29/29tests; hospital9requests14tests; contract27+369/typecheck/diffcheck pasan. Assertions booleanas/mensajes fijos sin bodies/headers ni URLs sensibles observadas; sin reporter crudo. No RED lógico nuevo ni DB/Auth/RLS real. | ReviewerBack inmediato de archivos de prueba |
| 2026-10-04 | T4q revisión inicio / `reviewer-back` | Tres archivos Bruno completos, intención distinta/replay/default10/envelopeexacto/headers. No delegar pruebas al autor para aprobación. | Registrar PASS/BLOCKED; luego siguiente slice |
| 2026-10-04 | T4q revisión fin / `reviewer-back` | PASS exclusivo regresión mock: default antes de hash, ID/plazo guardados existen, segunda clave distinta estable;10fields/headers/UTCvalidados, no logs body y secuencias no dañan flujo. No prueba cálculo temporalDB/concurrencia. Docs deben actualizar24llamadas/18ops (dos repiten misma operación). | T4d recomendaciones técnicas; mantener Docs sync pendiente |
| 2026-10-04 | T4d inicio / `solution-architect` | Consulta técnica read-only para concretar runtimeDTO sin duplicar JSON canónico, versiones del lock, nueva dependencia y generación reproducible dentro apps/api. No Auth/HTTP/repos ni ADR aceptado nuevos. | Autorizar dependencia y subdividir T4b antes de writer |
| 2026-10-04 | T4d fin / `solution-architect` | Recomienda Ajv2020 (`ajv@8.20.0`) + `ajv-formats@2.1.1`, versiones MIT presentes en lock como dev-transitivas, declaradas runtime directas tras autorización. Snapshot JSON acotado refs->$defs y tipos generados con openapi-typescript7.13.0; no importar web/mock ni docs en runtime; generador sin red, driftcheck. Alternativa Zod4.6.5 duplica schemas. Hallazgo D1: `date-time` permite offset; doc pide UTCZ, concretar restricción canónica201 sin modificar otros DTO. | Preguntar aprobación de dos dependencias; T4b subdividido después |
| 2026-10-04 | Decisión Ajv / usuario | Eligió “Ajv canónico (Recommended)”: autoriza ajv8.20.0+ajv-formats2.1.1 runtime directos, snapshot del JSON canónico y actualización revisada del lock único. No nuevas libs/SDK/driver/session aprobadas por esta decisión. | T4b1 base/generación y restricción201UTC |
| 2026-10-04 | T4b1 inicio / `dev-back` | Único writer de base apps/api sin rutas ni lógica aplicación. Generación local determinista de tipos/snapshot alcanzable de input/201/errores; refs fail-closed y driftcheck. Corregir D1 canónico inline201UTCZ, regenerar consumidores; tests del generador RED→GREEN. Root npm lock/policy preservados, instalación sin scripts no revisados, audit runtime obligatorio. | ReviewerBack inmediato y ReviewerFront si toca generado web |
| 2026-10-04 | T4b1 fin escritor / `dev-back` | Workspace/config/scripts+tests y cuatro artefactos generados; Ajv8.20.0/formats2.1.1 runtime directos deduplicados, instalación --ignore-scripts, política intacta. D1 patternZ$ solo201. RED stubs→GREEN generador9/9; tipos/drift/lint/contract27+369/typecheck/build/API50/auditproduction0/diffcheck pasan. Una corrida previa de contract antes de gen falló TYPE_DRIFT y timeout readiness Prism; rerun secuencial posterior a gen verde, sin ocultar primer fallo. DTO runtime todavía no implementado. | ReviewerBack y Front inmediatos |
| 2026-10-04 | Autoría de cambios concurrentes aclarada / Senior | Los tres archivos Bruno observados por DevBack corresponden a T4q de QA, registrados y revisados PASS antes de T4b1. No son cambios desconocidos; DevBack no los tocó. | Conservar tests QA e historial de ownership |
| 2026-10-04 | T4b1 revisión inicio / `reviewer-back` + `reviewer-front` | Diff completo de base/gen/lock/JSON201/tipos; frontend scope tipo regenerado UTC sin UI; backend incluye generador y sus tests, instalación/deps y root scripts. No otros writers antes del gate. | Registrar PASS/BLOCKED y corregir si procede |
| 2026-10-04 | T4b1 ReviewerBack BLOCKED / ReviewerFront PASS | R1 Required/P2 generator:133–137,249–271: siblings restrictivos de requestBody.schema junto al$ref se pierden; exigir $refúnico o proyectarSchemaObjectcompleto. R2 Required/P2:342–351,385–386: auditoría indiscriminada trata `$ref` literal de annotations/extension metadata como referencia externa; auditar por contexto estructural sin omitir propiedades legítimas. Front PASS UTCtipo/consumidores, no backend. | DevBack corrige R1/R2 y añade negativas, repeatgate |
| 2026-10-04 | T4b1 corrección R1/R2 inicio / `dev-back` | Escritura acotada generador+sus tests y artefactos solo si generación legítima cambia. RED sibling restrictivo/unsupported, literalrefmetadata, structuralexternal/broken; ampliar negativas archivo faltante/tuple/ratificación. No nuevas deps/paths/refactorproducto ni reducir severidad. | ReviewerBack inmediato del diff completo al terminar |
| 2026-10-04 | T4b1 corrección R1/R2 fin / `dev-back` | Solo dos scripts: R1reject siblingconREQUEST_SCHEMA_SIBLINGS anteswrite; R2recorrido contextual, valoresdeproperties seSchemas aunque campoexample, annotations/extcomo literal. RED reprodujo ambos; GREENgenerador14/14/drift/typecheck/build/contract27+369/diffcheck. Snapshot/tipos no cambiaron; no reinstalación/audit repetidos. Bruno observado correspondeQA T4qya registrado, intacto. | ReviewerBack inmediato T4b1 completo+corrección |
| 2026-10-04 | T4b1 re-review inicio / `reviewer-back` | Revisar resoluciónR1/R2 y regresiones fullbase/generador/tests, no solo microdiff; frontend generado sin cambio desdePASS. | Registrar veredicto antes T4b2 |
| 2026-10-04 | T4b1 re-review BLOCKED / `reviewer-back` | R1 cerrado. R2 residual Required/P2 generator:299–343: recolector `scanOpenApiReferences` usado por projectApiTypesSpec aún interpreta metadata$refcomoReference y omite properties llamadasexample/examples/value. Extensión literalPOST todavía rompefullpipeline; schema.properties.example conreflocal pierdecomponente enproyección. Pruebas anteriores cubrían auditoría aislada, no interacción. | Compartir recorrido contextual auditor/recolector y negativas fullpipeline |
| 2026-10-04 | T4b1 corrección R2 residual inicio / `dev-back` | Mismos dos scripts; reemplazar recorrido duplicado por contexto correcto, metadata literalPOST harmless y propiedad schema llamadaexample/refcomponente incluidaclosure. TDD end-to-end buildGeneratedArtifacts/projectApiTypesSpec, sin tocarcanon/deps/producto. | ReviewerBack inmediato nuevamente; no pasar siguiente slice conR2abierto |
| 2026-10-04 | T4b1 R2 residual corrección fin / `dev-back` | REDfullpipeline literalPOST/propSchemaexample confirmado; sharedcontextwalk auditor+collector y extensionesOAS retiradas solo de copiaparatypes(toolmetadataliteralnoReference). GREEN16generator/drift trasregen/typecheck/build/contract27+369/diffcheck. Snapshot/APItypes regenerados al detectarderiva; web/mockdiffsin delta desdePASSfrontend. Sin deps/lock/Bruno cambios. | ReviewerBack inmediato fullslice; frontendPASSpara delta sin cambios |
| 2026-10-04 | T4b1 segunda re-review inicio / `reviewer-back` | RevisarR1yR2completepipeline y artefactos actualizados, sin aceptar solohelpersaislados. | PASS/BLOCKED antes T4b2 |
| 2026-10-04 | T4b1 segunda re-review BLOCKED / `reviewer-back` | R1/R2cerrados. R3 Required/P2 `generate-api-contract.mjs:440–475`: stripOpenApiExtensions aplica prefijox- a mapas components.parameters/responses/securitySchemes y puede borrarcomponentes legítimos llamadosx-idempotency. Copiatipos pierdeclausura/header/seguridad aunqueoriginalválido. | Distinguir mapasdenombres vs metadata delobjeto, pruebas fullpipeline preservaciónheader/security |
| 2026-10-04 | T4b1 corrección R3 inicio / `dev-back` | Mismos dos scripts. Recorrer VALORES de mapas componentesseguros sin removernombresx-prefixed y preservar referencias de securityrequirements/header; eliminar solo extensiones internas en contextoOASowner. Testpipeline renombradovalidox-idempotency ysecurityschemex-prefixconrequirements antesfix. | ReviewerBack inmediato, no rebajar Required para cerrar |
| 2026-10-04 | T4b1 R3 corrección fin / `dev-back` | Dos scripts: stripcontextual preservacomponentsmaps/securityrequirementkeys/response.headers/schema.properties x-prefix. REDmapkeys antesfix→GREEN18generator/drift/typecheck/contract27+369/diffcheck. Sinregeneración por nodrift; build no repetido porque generado/productobuild no cambiaron. | ReviewerBack inmediato tercera re-review fullslice |
| 2026-10-04 | T4b1 tercera re-review inicio / `reviewer-back` | VerificarR3 y R1/R2 previos enpipelinecomplete; generadoFrontintacto. | GateantesT4b2 |
| 2026-10-04 | T4b1 tercera re-review fin / `reviewer-back` | PASS completo base/generación/lock/config/canon201/tipos: R1,R2yresidual,R3 cerrados. 18tests inclfullpipeline x-prefixed names y literalmetadata; sin otros Required/Critical. FrontPASSdelta intacto. No códigoHTTP/servicios/Auth/RLS ni DTO runtime aceptados por eseveredicto. | QA independiente focalizada, después T4b2 |
| 2026-10-04 | T4b1q inicio / `qa-reliability-engineer` | Ejecutar generator18 y drift/typecheck API propios, no escribirtests ni repetirallbuildporrutina; comprobar daemonDocker solo versiónsanitizada sin iniciarstack. | Registrar evidencias/límites antes próximo writer |
| 2026-10-04 | T4b1q fin QA | Independiente: `TMPDIR=/tmp/opencode npm run test:api:generator`18/18, driftcheck sinwrite ytypecheckAPI pasan; dockerdaemon29.8.2 disponible. Adaptador sin exitnumérico(N/D), sin error visible. No stack Supabase/DB/Auth inició ni verificó, noHTTP/PII/logs muestras. | T4b2 validaciónruntime |
| 2026-10-04 | T4b2 inicio / `dev-back` | DTO inputs normalizados explícitamente (radio10), output201 completo/UTCZ, categorías de error shape/rule/output sin HTTPniAjv.errors ni valores; Ajv2020snapshotcanónico strict sincoerce/removal/defaults; testsRED→GREEN/fronteras/massassignment/no mutación. Solo DTO+tests/manifestaliases, sinservices/query/auth/HTTP. | ReviewerBack inmediato; QA y seguridad después |
| 2026-10-04 | T4b2 consulta de estado / Senior | La invocación de implementación quedó como `Task cancelled` sin reporte del agente; lectura posterior encontró `validators.ts` y `validators.test.ts` en worktree, por lo que existen cambios parciales y su autoría/proceso final no se pudo confirmar. `apps/api/package.json` leído no declara script `test`, aunque root `test:backend:dto` lo invoca. No se ejecutaron las pruebas ni typecheck de esos artefactos; no PASS y no se avanzará a T4v/T5 hasta auditar/reproducir/completar la asignación. | Revisión del código presente y comando; conservar artefactos sin resetearlos |
| 2026-10-04 | Discrepancia de worktree / Senior | `git status --short` muestra `docs/decisions/ADR-001-stack-del-prototipo.md` modificado. Comparación con la lectura inicial de esta sesión: apareció una nueva bullet «Usar Typescript para el backend y frontend». Senior/agentes no tenían ese path autorizado para T4a/T4b1/T4b2; no se atribuye autoría ni se edita/restaura. Se consulta al usuario antes de aceptarlo como una modificación de decisión. | Usuario confirma autoría/intención; revisión separada antes de tocar ADR |
| 2026-10-04 | V-DTO instrucción / usuario | Pide verificar si todos los DTO están bien definidos y nada más. Queda pausada cualquier implementación/corrección, incluso de T4b2; no avanzar persistencia/servicios/HTTP ni alterar ADR/contratos/deps. Solo bitácora de coordinación y auditoría. | Revisiones read-only y pruebas DTO focalizadas |
| 2026-10-04 | V-DTO inicio / `reviewer-back` + `qa-reliability-engineer` | Reviewer inspecciona globalmente schemas/operaciones/DTO existentes y permisos/proyecciones; QA ejecuta checks de deriva/typecheck/tests presentes sin nuevos archivos de pruebas ni instalaciones. Ningún writer de producto asignado. | Registrar hallazgos verificables y reportar sin corregir |

## Inicio del primer slice aprobado y propuestas restantes

### Mapa de capacidades recomendado por arquitectura

| ID | Responsabilidad | Proveedores / dependencias |
| --- | --- | --- |
| `identity-institutions` | Identidad validada, membresías vigentes, hospitales/sedes autorizadas | Ninguna funcional; infraestructura de Auth/DB |
| `email-delivery` | Outbox, intentos, proveedor y webhook, sin acceso general al padrón | Infraestructura compartida; no consulta perfiles |
| `donor-records` | Perfil, onboarding, disponibilidad y comunicaciones de alta/verificación | Identidad; entrega solo para comunicaciones |
| `need-records` | Parámetros, borrador y reglas puras de estado de necesidad | Identidad/institución |
| `invitation-coordination` | Matching/lotes/respuestas y consecuencias transaccionales entre recursos | Identidad, perfiles, necesidades, entrega |
| `privacy-requests` | Solicitudes, grants/corrección/eliminación y coordinación de purga | Identidad, perfiles, invitaciones, entrega |
| `recognition-policies` | Políticas institucionales versionadas y moderación | Identidad |
| `legal-information` | Artefacto jurídico versionado y proyección según aprobación | Identidad para acceso/administración |

Propuesta de orden: contexto mínimo de identidad/institución → borrador de necesidad → perfiles/contratos de entrega → invitaciones/respuestas → solicitudes. Las reglas puras de necesidad pueden especificarse/probarse antes de habilitar HTTP protegido. Reconocimientos/información laboral después de identidad; mapa geográfico Could excluido del inicio. La orquestación de efectos entre recursos debe evitar dependencias circulares.

### Primer slice aprobado en T3: `need-records/create-need-draft`

- Ratificación acotada del POST `/api/v1/hospitals/me/needs`, Input `CreateNeedRequest`, Output basado en `NeedEnvelope`/`Need` con creación especializada y `ErrorResponse`, sin aprobar implícitamente las demás operaciones. Aún no hay endpoint real implementado.
- Entrada aprobada para el slice: `RBC`, grupo entre ocho enums, meta entera1–50, sede UUID, `radiusKm` entero opcional1–50, urgencia cerrada e intervalo1–72 horas. Rechazar extras y campos de propietario/hospital/estado calculado. Omitir radio equivale a10, normalizado antes del hash idempotente; la anotación default no basta por sí sola.
- Salida proyectada explícitamente, sin entidad SQL: creación en `borrador` y `confirmedIntentCount=0`. Actor admin hospitalario AAL2, membresía hospitalaria vigente y sede propia activa derivados en servidor/base, nunca del input.
- Borrador solamente: no activar necesidad, preseleccionar, crear invitaciones/outbox ni enviar correo. Idempotencia/auditoría transaccionales de la creación, con RLS real antes de HTTP/Bruno de aceptación.
- Usuario aprobó el anclaje desde creación: `expiresAt` se fija con reloj UTC PostgreSQL al crear, sin extensión al activar. Replay devuelve salida original, sin recalcular vencimiento.
- Detalle técnico de error seguro alineado al POST actual: sede inexistente/ajena/inactiva devuelve el mismo422 genérico, sin existencia/detalles; no añadir404 no declarado. Confirmar en revisión contractual antes del código.
- Base aprobada: `apps/api` dentro del workspace npm actual, preservando `backend/` y `database/esquema.sql` como referencia incompatible no aplicada. Nuevas dependencias/driver aún por concretar/revisar.
- Entorno aprobado: Supabase local aislado (Auth/PostgREST/PostgreSQL), sujeto a disponibilidad Docker daemon. Binarios presentes no equivalen a stack disponible. No migraciones remotas ni secretos en chat.
- DTO/puertos/unitarias pueden empezar según secuencia/revisiones; HTTP protegido no puede publicarse con sesiones falsas mientras Auth/RLS permanezcan pendientes. La política de sesión/refresh requiere diseño y decisión aparte antes de esa fase.

### Opciones técnicas pendientes

- Usuario aprobó Ajv8.20.0 + ajv-formats2.1.1 como runtime directos y snapshot derivado del JSON único. Generación local/tipos/driftcheck y configuración strict sin coerción/remoción/default mutante se revisan antes del runtime. Zod no se adopta para el nuevo módulo.
- Evaluar Supabase/PostgREST por identidad de usuario + RPC atómica frente a SQL directo `pg` con rol/contexto transaction-local y RLS sin bypass. Varios calls SDK no constituyen transacción. No adoptar driver/SDK por referencia al scaffold.
- Bruno confirmó helpers/flags, pero el runner real debe verificar sanitización de URLs y mensajes de assertion mediante canarios, además de omitir headers/cuerpos. No reutilizar reset HTTP ni `stdio: inherit` indiscriminado en escenarios sensibles.

## Resultados y límites actuales

- Hay base `apps/api` y artefactos parciales de validación DTO bajo `apps/api/src/modules/need-records/dto/`; su último writer fue interrumpido/cancelado sin reporte. No se ejecutaron ni revisaron esos artefactos, por lo que siguen sin aceptación. No hay endpoint real de negocio ni migraciones ejecutadas.
- Los PASS anteriores pertenecen al mock y no se reutilizan como aceptación productiva.
- ReviewerBack dio PASS a T4a contractual, T4q pruebas mock y T4b1 generación/base; T4b1q QA independiente pasó generación/drift/typecheck API. T4b2 runtime DTO sigue pendiente de verificación y PASS; ningún veredicto acredita HTTP/Auth/RLS/DB real.
- Herramientas CLI disponibles; no DB/Auth activos ni pruebas de endpoints reales acreditadas.
- El mapa de ocho capacidades sigue propuesto. Primer slice, base, entorno y plazo ratificados explícitamente en T3.
- T1b/R0/T3/T4a/T4q/T4b1/T4b1q completados. T4b2 contiene artefactos parciales sin verificar; root script apunta a `npm run test` del workspace, no presente en el manifiesto leído. `ADR-001` tiene una modificación posterior al inventario inicial cuya autoría está pendiente. No iniciar persistencia/servicios/HTTP hasta estabilizar estos dos puntos y conseguir PASS de T4b2.

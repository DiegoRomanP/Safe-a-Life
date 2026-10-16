# API y backend completo: entrega incremental por capacidades

Fecha: 2026-10-12. Coordinación: Senior. Harness: OpenCode (`task`).
Estado general: En progreso — base verificada comprometida en90c203a; A2 spec privada/ADR RPC asignada para primer servicio. No HTTP/Auth/RLS completos.

## Solicitud, objetivo y límites de autoridad

Después de continuar y cerrar el traslado, el usuario solicita implementar API/backend completo y lógica de negocio conforme a las especificaciones elaboradas, parte por parte, con revisión independiente, ejecución/testeo constante y Bruno CLI reutilizando `bruno/`. Solicita commits atómicos Conventional Commits tras unidades grandes verificadas y aviso de lo que falte.

Antecedentes preservados: `2026-10-04-backend-inside-out.md` y `2026-10-11-continuacion-traslado-backend-monolito-modular.md`. No se sobrescriben ni convierten sus estados históricos en aprobaciones nuevas. El traslado está cerrado CA1–CA5; no es backend HTTP terminado.

Fuentes: AGENTS/Workflow, línea base funcional `1_Primeros_Alcances.md` v1.2 aprobada, ERS v0.4 en borrador controlado, ADR-001/002, requisitos normalizados, Api-Rules, OpenAPI único y Backend-Contracts. ERS organiza la línea base, no reemplaza decisiones aprobadas. Fuente clínica/legal competente sigue necesaria para uso real.

Autorización general de implementar no ratifica silenciosamente **69 operaciones OpenAPI en borrador**, AP pendientes ni elecciones que cambien conducta. Primer POST `createHospitalNeed` ya ratificado, con radio omitido→10, salida borrador/conteo0 y vencimiento UTC PostgreSQL desde creación. Supabase **local aislado** ya fue aprobado en T3 del antecedente; acceso real a datos, políticas de sesión/CSRF y detalles de RLS requieren diseño/decisión antes de HTTP.

## Estado técnico y preservación

- `backend/src/modules/need-records/dto/` contiene validadores/tests/tipos/snapshot canónicos aprobados; root npm12/Node24/TypeScript5.9, único lock y grafo preservado, scaffold legacy separado.
- Backend HTTP/controladores/repositorios/servicios/RLS/migraciones/outbox reales no implementados. `backend/index.js`, `backend/config/` y `database/esquema.sql` son referencias legacy incompatibles/no aceptadas como solución productiva; no ejecutarlas/copiar su lógica a producción.
- Todo dataset funcional sintético; no pacientes/diagnósticos/contacto directo, historia de donación, elegibilidad ni certificación clínica/legal. No iniciar emails reales, leer secretos o migrar BD remota por rutina.
- Tree sucio recibido con cambios anteriores en contrato/tooling/web/mock/Bruno/docs/agents y cinco planes históricos eliminados. No stagear todo, restaurar eliminaciones ni incluir trabajo ajeno. Antes de commit inspeccionar status/diff/log; tests/docs junto a unidad lógica, sin secrets/config global.
- Audit producción observado 0 conocidas; completo dev18 entradas (2 Critical/10 High/6 Moderate) preexistentes. Seguimiento separado antes de release, sin rebajar/aceptar diferimiento/forzar updates.

## Mapa de capacidades aprobado, reutiliza IDs existentes

Se toma el mapa recomendado en el antecedente y **aprobado por el usuario en D1 de esta iniciativa**, sin ratificación global de operaciones. Las specs de cada módulo preservan estos límites/dependencias, sin crear ciclos ni renombrar IDs arbitrariamente.

| ID | Responsabilidad | Dependencias propuestas |
| --- | --- | --- |
| `identity-institutions` | Identidad real, membresías vigentes, hospitales/sedes y controles server/RLS | Infraestructura Auth/DB |
| `email-delivery` | Puerto/provider falso, outbox, intentos y webhook mínimo auditado | Infraestructura; sin acceso general al padrón |
| `donor-records` | Alta/autoregistro/perfil/disponibilidad/onboarding | Identidad; entrega para comunicaciones |
| `need-records` | Borrador y ciclo de necesidades, repositorios/servicios sin HTTP | Identidad/instituciones |
| `invitation-coordination` | Preselección académica, lotes, tokens/respuestas y efectos atómicos | Identidad, perfiles, necesidades, entrega |
| `privacy-requests` | Solicitudes/grants/corrección/eliminación/purga auditables | Identidad, perfiles, invitaciones, entrega |
| `recognition-policies` | Política cerrada/versionada y moderación | Identidad |
| `legal-information` | Información jurídica versionada y límites de proyección | Identidad para administración |

Orden propuesto: contrato/puertos y reglas aprobadas del borrador → contexto mínimo real identidad/institución/persistencia → POST borrador real → perfiles/entrega → invitaciones/respuestas → privacidad → capacidades secundarias. El mapa agregado geográfico Could no bloquea MVP. La propuesta no habilita HTTP con sesiones falsas ni matching clínico sin gate.

## Criterios de aceptación por slice y de entrega

1. Trazabilidad RF/RNF/contrato/decisión y casos negativos explícitos; DTO cerrados antes de lógica/HTTP y ninguna entidad de persistencia en respuesta.
2. Dominio/aplicación puros e independientes, DI/composición, servicios/repositories/controllers/config/utilities/tests separados. Tiempo, identidad y efectos provistos por puertos/adaptadores, no globales.
3. PostgreSQL/Supabase sintético real para aceptar persistencia: migraciones versionadas desde cero/versión anterior, constraints/transacciones/RLS y negativos acceso directo por roles/hospitales/donantes.
4. QA único por slice crítico: unitarias→integración→Bruno real→E2E pertinentes. Endpoints deben probarse con Bruno CLI, no usar Prism/mock como prueba de backend real. Reusar colección sin destruir escenarios/env actuales, reports sanitizados sin cuerpos/cookies/tokens/PII.
5. Reviewer-back inmediato por todo código backend/pruebas; reviewer-front si generados/UI realmente cambian. Seguridad PASS para auth/RLS/PII/integración; clínica PASS con evidencia suficiente para compatibilidad/elegibilidad/copy. BLOCKED vuelve al autor, con re-review y reejecución afectada.
6. Documentación/API/ADR sincronizados en cada unidad. Commit atómico Conventional Commits tras PASS/tests pertinentes, respetando dependencias y sin commits que necesiten archivos no comprometidos para compilar/generar/probar.
7. Entrega total solo al aceptar todas las capacidades de alcance aprobado; reportar AP/no implementado/evidencia faltante, nunca declarar backend completo tras un slice.

## Tareas iniciales y responsables

| ID | Dueño | Objetivo y paths | Dependencias | Estado |
| --- | --- | --- | --- | --- |
| B0 | Senior | Nuevo plan, autoridad, inventario y cierre del traslado antecedente | Solicitud | Completada |
| A1 | `solution-architect` | Read-only: mapa/dependencias, primer slice viable, decisiones mínimas y unidades de commit/prerrequisitos del tree sucio | B0 | Completada — recomendación, no PASS |
| D1 | Senior/usuario | Aprobar mapa/base/RPC y límites; sesión/AP/otros contratos se resuelven antes de sus capas | A1 | Completada — tres respuestas explícitas |
| G0p | `dev-back` | Metadata Api-Rules únicamente; preparar candidato base A+B y planes referenciados en índice temporal, no stage/commit real | D1 | Completada — candidato preparado, no aprobado |
| R0b | `reviewer-back` | Revisión inmediata HEAD→candidato completo y metadata G0p/F0 | G0p/F0 | Completada — PASS completo/B1cerrado |
| R0f | `reviewer-front` | Independiente de generados/consumidores frontend del candidato base | G0p | Completada — PASS gen/consumidores |
| S0 | `security-privacy-auditor` | Gate PII/proyecciones/deps del candidato completo y nuevo cierre headersrefs; no solo traslado | G0p/F0 | Completada — PASS recheck |
| F0q | `qa-reliability-engineer` | Regresiones B1 solo scripts/generate-api-contract.test.mjs, RED seguro sin red/compensaciones | R0b B1 | Completada — RED22+3/RF0qPASS calidad |
| RF0q | `reviewer-back` | Revisión inmediata calidad tests B1, no GREEN de fix aún | F0q | Completada — PASS tests |
| F0 | `dev-back` | Fix B1 solo generador, rebuild candidato nativo mismas rutas, no modificar tests/contrato/dep | RF0q PASS | Completada —25GREEN/R0bS0PASS |
| Q0 | `qa-reliability-engineer` | Candidato aislado reproducible desde árbol Git seleccionado, suites pertinentes y Bruno | Reviews/gates PASS | Completada — candidatoGREEN/RQAPASS |
| RQA | `reviewer-back` | Revisión inmediata de código QA/contexto nuevo y evidencia candidato | Q0 | Completada — PASS |
| G0 | Senior + reviewers de área | Congelar candidatos de commit intencionados, revisar diff completo/prerrequisitos sin autoaprobar trabajo previo | A1/Q0/RQA | Completada — Tree2132cdd…aprobado/probado |
| C0 | `dev-back` | Git únicamente: commits de unidades verificadas, stage solo intencionado; no fuente producto nueva | G0/tests pertinentes PASS | Completada —90c203a treeexacto |
| A2 | `solution-architect` | Spec privada need-records y ADR003 RPC, dos documentos nuevos; sin producto/SQL/Auth | D1/C0 | En progreso |
| RA2 | `reviewer-back` | Revisión independiente spec/ADR antes de código, autor no autoaprueba | A2 | Pendiente |
| B1 | Escritor backend según slice | Primer slice acotado, paths exactos y contrato congelado tras RA2; sin HTTP inseguro | D1/RA2 | Pendiente |
| R1 | `reviewer-back` | Revisión independiente inmediata B1 y correcciones | B1 | Pendiente |
| T1 | `qa-reliability-engineer` | Único dueño aceptación crítica + Bruno real/persistencia según alcance | R1 y gates PASS | Pendiente |

La tabla se ampliará por módulo al aprobar su spec/slices. Elegir dev-back general o backend-data-engineer para esquema/RLS/transacciones/concurrencia, nunca ambos writers mismos paths. No subdelegación/interlocución usuario. Senior escribe solo este plan; paths nuevos de producto se congelan en la asignación y no antes de decisiones necesarias.

## Verificaciones y riesgos

- Antes de instalar nuevo SDK/driver: decisión explícita, versiones/provenance/policy y lock nativo auditado; no hoisting accidental ni updates de oportunidad.
- Herramientas ya observadas: Bruno4.2, SupabaseCLI2.119, psql18.6 y DockerCLI29.8; verificar disponibilidad actual, no confundir binario con daemon/stack listo. No habilitar autostart/servicios globales ni conectar BD remota sin autorización.
- Para backend real definir runner local sanitizado de Bruno con `--sandbox safe`/omit headers/bodies según CLI actual; verificar canarios/URLs/errores. No reset demo como autenticación real.
- Commit: status/diff/log y diff staged antes de cada commit; evaluación del candidato con dependencias comprometidas, no esconder fallos previos/no amend/force/hooks omitidos.
- Bloqueos abiertos no se resuelven desde mock: AP-02/04/06/07/08, sesión/refresh/cookie/CSRF/CORS, driver/transacción/RPC/grants y operación de email/polígono/fuentes clínicas. Arquitectura distinguirá decisiones ya resueltas en la línea base de resúmenes obsoletos antes de preguntar.

## Bitácora

### B0 — inicio de nueva iniciativa

- 2026-10-12: solicitud completa registrada, skills spec-driven/planning/incremental/dominio/API/database/security/TDD/docs/review/Bruno/webapp y work-unit-commits cargadas según alcance.
- Antecedente traslado cerrado con R1/R2/S1/RQ/R2c/RQ2 PASS y Q1/Q2 reales GREEN. `git status --short`/`git diff --stat` posteriores corroboran rutas intencionadas y deltas previos conservados; no commits aún.
- Leídas línea base/ERS/plan inside-out: Supabase local y primer POST ya aprobados T3; ocho capacidades propuestas y driver/sesión restantes aún pendientes. No volver a preguntar decisiones ya aprobadas ni inferir ratificación global.

### A1 — asignación arquitectura/commits, solo lectura

- Agente `solution-architect`, consulta directa task: mínimo contexto/paths aprobados, ninguna fuente/ADR/spec producto escrita, ninguna instalación/servicio/BD/commit/stage. Recomendar mapa/primer slice/decisiones y commits independientes basándose en status/diff/log y autoridad, no autoaprobar. Resultado pendiente.

### A1 — resultado y decisiones acotadas

- Task `ses_ed09b434effe9Xu5MIs41Unrzt`; recomienda mantener ocho IDs/orden sin ciclos y empezar **dominio+puertos+aplicación/unitarias de create-need-draft** sin HTTP/DB adaptador, ya ratificado en T3. Propuestos cinco archivos domain/entity, application/ports, application/service y dos tests; principal validado separado, hash tras radio normalizado, puerto creación/idempotencia/auditoría atómicos con reloj DB y proyección diez campos. Dobles no prueban Auth/RLS/atomicidad real.
- RF-NEC01–05/06estado inicial/08, RF-ORG01 y RNF ARC/SEC/API/REL/AUD/OBS trazables. Ningún Date.now/plazo recalculado, sede ajena/inactiva/inexistente uniforme422, sin activación/matching/outbox/email/historial donación. Directorio módulo existente need-records, sin sourcefrontend compartida.
- Supabase local ya aprobado; acceso recomendado RPC con identidad de usuario y SDK2.117.1 existente, varias llamadas SDK no son una transacción. Auth/sesión/grants caros de revertir requieren aprobación/ADR nuevo antes de HTTP. RF-EML ya fija seis llamadas/10s/backoff; no reabrir desde resúmenes obsoletos.
- Git read-only status/diff/cached/log10/ls-tree/diff-check ejecutados por consultor, exit numérico N/D del adaptador. HEAD carece de ratificación/201 requeridos por generador final; commit solo traslado sería no reproducible. Recomienda **una base cohesiva contrato+regresiones+workspace+DTO**, no separación por tipo de archivo.
- Candidato A+B: OpenAPI/Api-Rules/Backend-Contracts/README, tipos generados web/mock/parser mínimo mock, runners/generadores y tests, tres Bruno hospital, manifest/lock raíz/backend, configs/cuatroDTO y retiro locks legacy. Incluir planT3 no versionado por link solo con autorización. Excluir AGENTS/Workflow/ADR1/5D previas/config/resto trabajo ajeno. Metadata antigua Api-Rules395–397/412 a corregir sin semántica nueva.
- Antes de commit nuevo G0 debe revisar **HEAD→candidato completo**, frontend por generados y seguridad PII/proyecciones/deps, más QA de candidato aislado. PASS traslado no aprueba automáticamente toda incorporación previa.
- Disponibilidad read-only actual: Node24.19/npm12/Bruno4.2, SupabaseCLI2.120, psql18.6, Docker cliente/daemon29.9; stack local no verificado/iniciado, sin autostart ni cambios globales.
- D1: preguntar solo incorporación preexistente seleccionada para commit reproducible, mapa de capacidades propuesto y driver/RPC antes de persistencia. Primer borrador/Supabase local/plazo ya aprobados no se preguntan otra vez. No escritor nuevo asignado aún.

### D1 — autorizaciones y G0p

- Usuario eligió **Incluir base (Recommended)**: incorporar previos seleccionados A+B/planes referenciados previa revisión completa/pruebas; corregir solo metadata vieja Api-Rules. Excluir AGENTS/Workflow/ADR1/5D históricas/config/trabajo ajeno.
- Eligió **Ocho módulos (Recommended)**: mapa aprobado, iniciar borrador ya ratificado y contratos restantes por módulo; no70enbloque ni cierreAP. Eligió **Supabase RPC (Recommended)**: SDK existente/identidad de usuario/RLS, necesidad/idempotencia/auditoría atómicas; migraciones/grants diseñados/revisados antes de ejecutar, sin service_role ordinario.
- Dirección RPC aprobada no equivale a SQL/políticas/sesión diseñados o ejecutados. ADR nuevo acotado y spec privada del primer servicio deben revisarse independientemente antes de código/adaptador.
- G0p asignado a único dev-back: `docs/Api-Rules.md` solo conteos/metadatos y preparación de candidato A+B congelado con archivos/planes realmente necesarios por links; ningún código/contrato funcional nuevo, stage/commit real o configuración global. Snapshot/índice temporal bajo /tmp/opencode, status/diff/log inspeccionados antes. Tras resultado R0b inmediato; front y seguridad pueden leer mismo candidato congelado en paralelo sin escritores.

### G0p — candidato congelado y reviews inmediatos

- Task `ses_ed001333affee5L6U9Mr03xiy8`; fecha2026-10-12, duración no medida. Única edición fuente Api-Rules metadata395–397/412, sin contrato/requisitos/casos/schema nuevos. Índice real/stage/HEAD/trabajo ajeno no mutados.
- Parent HEAD actual `a6fc65b6afa9273f1cfaf211e963ef604ff6eaa1`; árbol base previo metadata `d8eea34e13be7f6bb4774afe1e4a6be1c612c5f4`, candidato final **`536da397af7eccf325d2cac1996a359c25897069`**. Treinta paths: 13M/15A/2D autorizados, cuatro planes referenciados incluidos; excludes AGENTS/Workflow/ADR1/5D ajenas/config/caches/env.
- Bundle `/tmp/opencode/save-a-life-g0p-20261012-6baluAAN/`: manifest/diff completo, delta metadata/inputhashes/candidate-source.tar. Export de pruebas excluye env.example legacy y outputs; árbol Git preserva archivos HEAD no modificados. Planes de candidato congelados en versión de preparación; nuevas entradas de bitácora posteriores se conservan sin alterar esa prueba.
- Checks autor: generación check PASS, cinco tests focalizados inventario/AP02 PASS, cuatro node-check PASS; inventario exacto55/70/96 ystats70/68/2/26/34/16/273/35/377. Rootlock hash8a0a671f…a27d648 estable; status/hashíndice intactos.
- Diff-check G0p PASS; diff-check candidato completo reporta tres hard breaks Markdown de dos espacios al final líneas3–5 del plan T3 nuevo referenciado (baseline original, no editado). Reviewer evaluará observación, no se oculta ni se modifica historia por rutina.
- R0b inmediato sobre **HEAD→candidato íntegro**, R0f generado/consumidores y S0 privacidad/contrato/deps en paralelo read-only del mismo diff congelado; ningún escritor durante gates. QA/commit todavía pendientes, no se hereda aprobación automática del traslado.

### R0b/R0f/S0 — resultados y regresión B1

- R0b task `ses_ecff04460ffemlJWGppAL3b64h`: **BLOCKED** candidato completo8166líneas/30paths; B1 Required Media/P2 `generate-api-contract.mjs:352–375` especialmente361. visitDocument descarta clavesx-* también cuando son nombres legítimos del mapaheaders: headerx-custom-trace.schema.$ref local mantiene referencia pero omite clausura HeaderValue; externa/noresuelta elude audit previo. Test203–213 solo inline string no cubre caso. Escenario de trazado estático, no ejecución/red observada.
- Corrección solicitada: recorrido contextual de valores headers para audit/clausura, positivos refs locales y negativos external/unresolved +pipeline, sin contrato/generados manuales nuevos. R0b no halló otros bloqueantes; hardbreaks Markdown T3 no bloquean, no ocultar aviso diffcheck ni reescribir historia.
- R0f task `ses_ecff0444affeyk2XA2qbiuiGZC`: **PASS** estático dos generados iguales +compatibilidad consumidores, sin cambiosUI/no visual requerido. Otras69draft, proyecciones/contextos aprobados fuenteRF; futurosclientes deberán formas nuevas, no backwardscompat universal. Sin tests propios.
- S0 task `ses_ecff0443affeOzsweq0KCbTXdE`: **PASS** fullfundamento30paths/PII/proyecciones/DTO/deps/reporters, sin Required causales identificados en ese alcance; no autorización real ni release. ReusóauditmismoLockS1, runtime0/full18residuales, sin rebajasseveridad. Backend legacy inseguro sigue excluido/no aceptado. Ese PASS no anula B1 ni reemplaza fix/re-review.
- Inicio F0q al único QA: escribir solo tests generador B1, clonar spec en memoria sin canonical/sourcewrites; comprobar RED con audit/proyección puros evitando cualquier fetch externo en código defectuoso. Reviewer RF0q inmediato después antes de autor fix. Base global sigue bloqueada/Q0 y commits pendientes.

### F0q — RED seguro y RF0q inmediato

- QA task `ses_ecfdb7904ffeRY79wiSUyHkvmN`: único source modificado gen.test.mjs215–258 **+45/-0**, preserva22tests anteriores; tres regresiones localclosure/types+metadatax literal, externalref y unresolvedref por audit/proyección/pipeline.
- Baseline npmrun test:api:generator exit0 **22/22**; posterior exit1 **22GREEN+3RED**, sin skips/cancel/todo. Positivo HeaderValueundefined, negativos auditnoexception: abortaron antes de builder/URLs, ningún contacto externo. Fullpipeline posterior todavía no alcanzado hasta fix.
- Node-check exit0, git diff-check tracked exit0; no-index diffs exit1 normal por diferencias sin diagnosticswhitespace, no presentación falsePASS. TestSHA before4105a213…/after308b301e…; generador/canonical/generated/manifests/lock/índice/diffajeno/5D recibidas intactos, sin stage/commit/productfix.
- Evidencia íntegra `/tmp/opencode/save-a-life-f0q-20261012-evidence.md`. RF0q reviewer-back inmediato a tests, calidad scope sin aprobar GREEN global; F0 sourceautor no asignado hasta ese gate.

### RF0q PASS y F0 asignado

- Reviewer `ses_ecff04460ffemlJWGppAL3b64h`: **PASS** calidad tres tests45líneas y preservación22anteriores; sin bloqueantes. Estructurales/regex positivo apropiadas para generador fijado, negativos exactos rechazados antesresolver enRED. Fullpipeline debe ejecutarseGREEN trasfix; no aprobaciónG0ni commit.
- Inicio F0 mismo autor G0p: editar **solo scripts/generate-api-contract.mjs**, reconocer mapaheaders por contexto/recorrer valores sin confundir claves x-* con metadata propietaria. No tests/canonical/DTO/generadosmanuales/dependencias nuevos; después25testsGREEN+check generación y nuevo candidato nativo mismas30rutas con sourcefix/testsQA. R0b re-review inmediata del conjunto al terminar, antes de otro escritor/commit.

### F0 — GREEN25 y candidato actualizado; gates inmediatos

- Autor `ses_ed001333affee5L6U9Mr03xiy8`, fecha2026-10-12/duraciónN/D; único sourcegen.mjs **+2/-0**: reconocer headersmap yvisitarvalores convisitDocument común, sinmetadataowner literal ni ampliacióncomponents.headersRefObjects.
- Testgenerador **25/25exit0** sin skip, incluidosfullbuilderslocal/negativos auditfailfast; checkcanónico/syntax/fixdiffcheckPASS, sin regenerar/no red. TestQASHA308b301e…/OpenAPI/4DTO/snapshot/webmock/manifests/rootLockSHA8a0a671f… idénticos. Índice real/HEAD ajenos sin cambios.
- ParentHEADa6fc65b6…; nuevoTree **2132cddbe117af8ce37a047cab92463b7e0d0ca1**, mismas30rutas. Delta vsG0p trespaths(genF0/testF0q/planSenioractualizado) yfix-only2líneas. Bundle `/tmp/opencode/save-a-life-f0-20261012-eT3SnQQW/` fullcandidate/manifest/deltas/hashes/archive paraQ0. Exportenvexampleexcluido comoantes; candidateGitunchangedheadfiles preserved.
- Blobs génicos clienteweb/mock **03af4ca6502e65e6887daf260da84688e95d8a91**, DTOOpenAPI94f0156dc4417e89a6913c4e65cd61f35995a61b/snapshot8791a4832438df7c653f9b019c6e424c4ddcb304 idénticos aR0f/G0p. R0f sigue limitado a esosblobs/consumidores sin escriturasfrontendnuevas.
- Auxiliaryrevparse primero fallóquotingzsh, repeticióncorregida confirmaIDs sin mutaciones. WhitespacehistóricoT3 hardbreaks documentado/sinocultar.
- R0b re-reviewfullcandidate yS0refsfix recheck inmediato enparaleloread-only frozen. Q0/commits/purebusinesscase pendientes; no se asigna escritor nuevo hasta gates.

### R0b/S0 PASS y Q0 asignada

- R0b `ses_ecff04460ffemlJWGppAL3b64h`: **PASS** fullHEAD→Tree2132cdd…30rutas ydelta3completo, B1cerrado, sin nuevosRequired. Sharedwalk/audit/clausura/headerOwners literal/failfast before resolver verificados. Q0 sigueobligatorio; sin tests/hashes ejecutadosporReviewer.
- S0 `ses_ecff0443affeOzsweq0KCbTXdE`: **PASS** corrección+fundamentoenteroactualizado poridentidadGitresto, sinRequiredCritical/High/Medium adicionales. No nuevospermisos/PII niRefexternos permisivos; auditruntimedevprevio mismoLock conservado, sinrelease ni Auth/RLS reales.
- R0f anterior se conserva solo parablobscliente03af4ca…idénticos/consumidores sin nuevaescritura frontend. Tree actual aprobado paraaceptaciónQA, no para commit antesdepruebas.
- Inicio Q0 al mismoúnicorolQA deF0q: copia fresca desdeexport/árbolGit seleccionado, nocopiaindiscriminada workingtree; ci/25gen/drift/151workspaces/type/lint/build/contrato/Bruno/E2E pertinentes, comparacióncandidate manifest/provenance/rootlock/preservacióny recursos. No nueva infraestructura/harness masivo ni fixerproductivo; si scriptspruebasQA nuevos Reviewerárea inmediato antesC0. Resultado pendiente.

### Q0 — candidato Git fresco GREEN y RQA inmediato

- QA task `ses_ecfdb7904ffeRY79wiSUyHkvmN`; bundle `/tmp/opencode/save-a-life-q0-20261012-4tBlci04/REVIEW-INDEX.md`, controls/inventory ylogs/recibos. ProbóTree2132cdd…parenta6fc…30paths exactos13M15A2D: tarSHAa752026d…/diffSHA3ecabab…; 255files322members contraGit/28hashesantesdespués, soloenvexampleHeadunchangedomitido safeexport.17docs58links sinfaltantes (anchorsnoverificados), inventario55/70/96 únicoPOSTratificado.
- Todos18comandos críticos exit/childExit0, sin timeout/señales/reintentos: ci480,workspaces mock/web/backend, grafoparaconsumidor7 perfiles477registry/71opcionalplataformadrift0,gen**25/25**,checkdrift,unit**151=50+15+86**,type/lint/build3workspaces,OpenAPIlint5prevwarnings,NodeNextJSON/negativosDTO,listCompileinputs3soloDTO,repeatedbuild3outputsdeterministic,contrato**72+377HTTP+35schema** con70/68/2/26/34/16/273,postbuildDTO**86**,Bruno**24requests/29tests**,E2Etraceoff**10/10** Chromiumexistente/sindownload.
- Lock8a0a671f…/testQASHA308b301e…/sourcepurity/HEAD/índice/diffajeno/cached/5D reales intactos; sin sourcewrites reales/candidato,stage/commit/provider. Recursos propiosninguno y4010/4011/5173 libres;8PNGsynthetic,sintrace/HAR/video/logsdebodyheaders/tokens.
- Fullcandidate diffcheckexit2 exclusivo3MarkdownhardbreaksT3 aceptadosporreviewer, registrado sinfalsePASS. DeprecationsCI yavisosNO_COLOR registrados,no ocultos. No nuevoauditmisma lock;dev18preexisten sinrebaj/release.
- Escrituras soloTemp: tresverificadores/contexto nuevos77/12/30líneas, grafoproofQ1copiadoidéntico yrunOwnedlatest revisado sinmodificar; evidencia mínima11JSON/18logpairs. RQA reviewer-back inmediato de código yproofantesC0; aceptaciónglobalcandidate pendiente esequalitygate, no selfapproval.

### RQA PASS, G0 cerrado y C0 commit asignado

- Reviewer `ses_ecff04460ffemlJWGppAL3b64h`: **PASS** código QA completo ylegitimidad18recibosQ0 delárbol2132cdd…; sin checksobligatoriosfaltantes ni Required. Comprueba source-proof255blobs28hashes manifest/exceptionenvHEAD, snapshotwx, smokerealcompilado/negativeDTO/outputsdeterministas ysyntax/provenance/recursos. No ejecución propia; habilitaSeniorprepararC0 sinagregarajenos.
- G0/Q0 cerrados enalcancefundaciónA+B30paths. R0b/S0 PASSfullcandidate yR0f blobsidénticos, Q0actualtestsGreen/RQAapproved; no release ni backend completo.
- Inicio C0 mismodev-back: operacionesGit solamente. Inspeccionarstatus/diff/cached/log10, HEADa6fc…/índicevacío guard; stage **exactTree2132cdd…** y30pathsapproved snapshot, noworkingfilesajenos/planeslegitposteriores. Verificarwrite-tree==candidateantescommit/nativehooks,noamend/skipconfig/push. Mensajepropuesto `feat(backend): add canonical need draft DTO foundation`.
- Bitácoras posterioresalfreeze sepreservanunstaged yseincorporarán conunidadsiguiente/documentación, nofalseprovenancecandidato. SiHEAD/índices/fuente/hookcambian inesperadamente, detener/restaralcance sineludirgate; no ejecutarcommit distinto porconveniencia. Resultado pendiente.

### C0 — commit atómico base verificado

- Autor `ses_ed001333affee5L6U9Mr03xiy8`: commit **90c203afc4b565c9a5c2718db32d6603e76b2f41** — `feat(backend): add canonical need draft DTO foundation`. Parenta6fc65b6…/Tree**2132cddbe117af8ce37a047cab92463b7e0d0ca1** exactamenteQ0/reviews;30paths13M15A2D/4841insertions2427deletions. Ramaexistente `feat/backend-developing` sin cambio, sinpush.
- Antes status/diffs/cached/log10 inspeccionados, índicevacío, stageexact30 desdeTreefrozen, manifest/write-tree/diffstagedcoinciden; scanner sincredencialesJWT/correosfueraejemplossintéticos. NativeGitcommitnormal,sin skiphooks/config/mod fuentes; hooks solomuestras. Índicefinal limpio, lockhashestable; no suites repetidas sobreTreeidéntico.
- Preservadosunstaged AGENTS/Workflow/ADR1/5Dhistóricas/otrosplanes ybitácoraSenioractualposteriorfreeze, ninguna fuente/caches movidos. Commitcontieneplansnapshotaprobado, currentworkingregistrocontinúa másreciente. Bundle `/tmp/opencode/save-a-life-c0-20261012-9jIw7Sln/` sourcecandidateF0/Q0referenciados; dosauxshellquotingerrorscorregidossinwrites reportados.
- No backendcompleto/HTTP/RLS real ni release. Basecohesiva reproducibleya versionada; siguienteunidad negocio puro+test/docs concommitseparado trasPASS.

### A2 — asignación documentación de interfaces y decisión RPC

- Inicio `solution-architect`, autorúnico **docs/Need-Draft-Application-Spec.md** y **docs/decisions/ADR-003-persistencia-rpc-supabase.md** nuevos (verificar no colisión). Congelar exactamente firmas privadas/errores/entidad/puerto/boundaries paraQA-first y servicio3paths sinHTTP/DBadapter. Registrar direcciónRPC aprobada conSQL/grants/session pendientes, no cambiarADR001/002 ni autorevisar.
- Debe leerDTOexports actuales/BackendContracts/lineabase y concretar contratosinternos sin inventar nuevoscomportamientos; decisiones abiertas que cambienconducta seescalaantesescritor. RA2 reviewer-back independiente alresultado antes de implementar/pruebasque consuman interfaz; luegoB1 delegadono códigoSenior.

# Ejecución de pendientes con agentes

Fecha: 2026-10-20. Coordinación: Senior. Estado: En progreso.

## Objetivo y autoridad

Continuar el plan de auditoría del 20 de octubre mediante delegación real,
revisión independiente, pruebas pertinentes y commits locales por hitos.
La sincronización de decisiones existentes está autorizada («Sí, sincronizar»).
Esta ejecución no ratifica F7/F8, no decide el destino frontend ni la topología
de borde y no implica validación clínica/legal profesional.

Fuentes: `AGENTS.md`, `docs/Agent-Workflow.md`, el plan de auditoría y
`docs/pending/2026-10-20-bloqueos-y-decisiones.md`. Consultar requisitos y ADR
vigentes para cada asignación. Mantener F6 → F7 → F8 → F9 y sus dependencias.

## Alcance, exclusiones y preservación

- Primero comprobar delegación, recomendar límites F6 y sincronizar fuentes;
  revisar correcciones F2b–F5 y ejecutar baseline crítico antes de F6.
- Cada slice tiene un escritor, paths explícitos y reviewer de área inmediato.
- Excluir datos reales, correo real, despliegues, secretos, `supabase db push`,
  instalaciones/actualizaciones no revisadas, nuevas reglas clínicas y ADR nuevos.
- Preservar sin stage los cambios iniciales en `.opencode/agent/*.md`,
  `.opencode/opencode.json`, `AGENTS.md`, `CLAUDE.md`, `docs/Agent-Workflow.md`,
  el plan de auditoría y los planes no seguidos del 16 de octubre. No restaurar
  ni incluirlos incidentalmente en commits. El registro de pendientes se puede
  actualizar por esta solicitud, pero su commit requiere separar su contenido
  preexistente; preferir evidencias nuevas en este plan.

## Aceptación

1. Evidencia de invocación real; avisar inmediatamente si falla delegación.
2. Fuentes sincronizadas con ADR/ratificaciones existentes sin conducta nueva,
   conteos reproducibles y trazabilidad histórica; revisión independiente.
3. Correcciones relevantes F2b–F5 con PASS de backend/seguridad y pruebas críticas
   actuales, no conteos históricos; todo fallo o comando no ejecutado queda abierto.
4. F6 solo tras arquitectura, baseline y evidencia clínica suficiente; cada slice
   debe revisar y probar su diff completo antes del siguiente escritor.
5. Commits explícitos allowlisted, sin secretos ni cambios ajenos, después de sus
   gates. No declarar terminado un módulo con gates pendientes.

## Tareas ordenadas

| ID | Responsable y paths | Dependencias | Criterio / verificación | Estado |
| --- | --- | --- | --- | --- |
| E0 | Senior; este nuevo plan | Ninguna | Status inicial preservado; delegación efectiva | Completada |
| E1 | `solution-architect`; consulta read-only de requisitos/ADRs/planes/contrato | E0 | Mapa exacto de sincronización AP y recomendación F6; supuestos/decisiones abiertas, sin autoaprobación | Completada |
| E2a | `solution-architect`; D1: Alcances, ERS, docs/README y Backend-Contracts; excluye ADR/contrato/código | E1 | Sincronizar AP aprobadas conservando historial; `reviewer-back` independiente | Completada |
| E2b | `dev-back`; referencias/skills e inventarios, hasta cinco archivos por asignación | E2a | Inventarios comprobables, sin alterar contrato ni decisiones; review inmediato | Pendiente |
| E3 | `reviewer-back`; solo lectura F2b/F3/F4/F5 y sus tests/migraciones | E0 | PASS o BLOCKED con rutas/líneas, distinguir arreglos de riesgos residuales | Bloqueada |
| E4 | `security-privacy-auditor`; solo lectura mismo baseline congelado, paralelo a E3 | E0 | PASS o BLOCKED explícito de auth/RLS/PII/email, evidencia adversarial | Bloqueada |
| E5 | `qa-reliability-engineer`; ejecución baseline, dueño único de pruebas críticas | E3/E4 PASS | Contrato/unitarias/pgTAP/integración/Bruno actuales; si escribe pruebas, reviewer-back inmediato | Pendiente |
| E5pre | `qa-reliability-engineer`; solo ejecución de backend unit/typecheck/lint/build, sin source ni DB | E0; código backend congelado | Diagnóstico reproducible actual, no cierra E3/E4 ni omite regresiones faltantes | Completada |
| EQ1 | `qa-reliability-engineer`; diseño read-only de regresión B1 sobre helpers/tests actuales | E3 | Proponer prueba con dos conexiones y barreras explícitas, sin sleeps arbitrarios ni cambios durante D1 | Completada |
| ECL | `clinical-safety-reviewer`; lectura de matriz/requisitos, sin código ni nuevas reglas | E0 | PASS o BLOCKED explícito de evidencia para preselección académica RBC y límites; no habilita uso real | Completada |
| E6a | `dev-back`; compatibilidad/Haversine y tests nuevos F6, máximo cinco archivos | E1–E5 y gate clínico | 64 pares RBC y bordes distancia; TDD, reviewer-back y clínica | Bloqueada |
| E6b | `dev-back`; ranking/lotes y tests nuevos F6 | E6a PASS | Orden/cuotas/tamaño según línea base, TDD/review/QA | Pendiente |
| E6c+ | `backend-data-engineer`; SQL/RPC/RLS/worker F6, desglose nuevo antes de escribir | E6b PASS | Atomicidad, concurrencia, idempotencia, seguridad y QA real por slice | Pendiente |
| E7–E9 | Dueño por módulo según matriz, desglose y plan antes de implementar | F6 PASS y ratificaciones/decisiones | F7/F8 ratificados por módulo; frontend/borde resueltos para F9 | Bloqueada |
| EC | Senior; stage explícito y commits de archivos propios | Gates pertinentes | Diff revisado, `git diff --check`, pruebas aprobadas y hash registrado | En progreso |
| EM | `dev-back`; `.engram/config.json`, `.engram/.gitignore`, `docs/Memory-Project.md` | Solicitud usuaria y gate del escritor anterior | Crear `save-a-life-oficial` mediante init soportado, sin borrar/mezclar historiales; lectura/guardado confirmados, review y commit acotado | En progreso |
| EA | `solution-architect`; consulta read-only SP-01, fuera de D1/F6 | E4 | Recomendar barrera auth también RPC/RLS, contratos/ADRs afectados y decisión a solicitar antes de implementación | Completada |

Skills: planificación/incrementos/documentación/review/Git transversalmente;
dominio/API/datos/seguridad/TDD según área. Matching y pruebas web al activarse.
No paralelizar escritores ni paths compartidos; consultas read-only pueden
realizarse mientras Senior lee fuentes, sin modificar el artefacto auditado.

## Verificaciones previstas

- Documentación: comparar ADR-004/005/006 y ratificaciones; conteos OpenAPI y
  rutas reales, links/rutas y `git diff --check`.
- Contrato: `npm run openapi:lint`, `npm run openapi:api:check`,
  `npm run test:api:generator`, `npm run test:contract`.
- Baseline crítico: `npm run test --workspace backend`,
  `npm run test:backend:db`, `npm run test:backend:integration`,
  `npm run test:bruno:backend`; typecheck/lint/build pertinentes.
- Bases solo locales sintéticas y destino confirmado antes de reset; evidencia
  sanitizada sin tokens, PII, coordenadas ni cuerpos completos.
- Commit: `git diff --check`, inspección del diff staged y nombres allowlisted;
  nunca `git add -A`, push, amend ni inclusión de trabajo ajeno.

## Riesgos y decisiones abiertas

- Permisos recargados aún deben probarse; presencia del tool no demuestra éxito.
- Engram mantiene identidad ambigua; contexto/búsqueda/summary fallaron al inicio.
  No elegir alias silenciosamente; el registro local es la evidencia recuperable.
- Clínica insuficiente bloquea matching; F7/F8 y frontend/borde siguen abiertos.
- Un fallo de baseline bloquea F6, no justifica omitir tests ni rebajar gates.

## Bitácora

| Paso / fecha | Inicio/fin, agente | Archivos, resultado, evidencia y siguiente paso |
| --- | --- | --- |
| Preflight / 2026-10-20 | Inicio/fin, Senior | Leídos AGENTS, workflow, requisitos, planes adjuntos y package.json. Status muestra cambios preexistentes solo de agentes/docs; sin cambios productivos iniciales. Tool `subagent` disponible; falta invocación efectiva. |
| Memoria / 2026-10-20 | Inicio/fin, Senior | `mem_current_project` informa cuatro identidades; contexto/búsqueda/summary fallan por identidad segura. No se selecciona alias ni se mezcla historial. |
| Delegación E1 / 2026-10-20 | Inicio, `solution-architect` | Lanzamiento real aceptado mediante `subagent`; sesión hija `ses_ea54ab97bffeiJiYhv1P4yFF7c`. Consulta sin escritura. Esperar resultado sin atribuir aún PASS ni permisos de implementación. |
| Revisión E3 / 2026-10-20 | Inicio, `reviewer-back` | Se asigna auditoría read-only de correcciones tardías F2b–F5: sedes, idempotencia, tokens/Auth, email directo y scope worker. Independiente de la consulta F6; no escritores en backend mientras se audita. |
| Lanzamiento E3 / 2026-10-20 | `reviewer-back` | `subagent` aceptó sesión `ses_ea54a24eaffecWk19Utbb5mw7w`; revisión en curso, sin veredicto todavía. |
| Preflight ejecución / 2026-10-20 | Inicio/fin, Senior | Shell funciona: Node v24.19.0, npm 12.0.2, ejecutables Supabase/Docker presentes; índice Git inicialmente vacío. Esto no demuestra tests ni permisos de commit. Los runners de integración/Bruno hacen reset local: confirmar destino antes de usarlos. |
| Consulta clínica ECL / 2026-10-20 | Inicio, `clinical-safety-reviewer` | Se solicita gate de evidencia para F6 académico, sin implementar ni inventar reglas. La skill matching todavía menciona bloqueos/fecha de donación incompatibles con RF-PRO-05; pedir distinguir texto obsoleto de requisitos vigentes. |
| Lanzamiento ECL / 2026-10-20 | `clinical-safety-reviewer` | `subagent` aceptó sesión `ses_ea5493ee6ffeyyZCBdE0zx0eaG`; gate en curso sin resultado. |
| Entorno local / 2026-10-20 | Inicio/fin, Senior | Docker accesible; contenedores Supabase del backend ya activos. Rama inicial `feat/backend-developing`, HEAD `1956d63`, índice vacío. No se reseteó ni alteró la base. |
| Auditoría E4 / 2026-10-20 | Inicio, `security-privacy-auditor` | Consulta adversarial read-only sobre el baseline congelado de E3. Se paralelizan únicamente revisiones sin escritores y con perspectivas distintas; no depende de editar/aceptar la consulta F6. |
| Lanzamiento E4 / 2026-10-20 | `security-privacy-auditor` | Lanzamiento real aceptado, sesión `ses_ea5487bd8ffeBZSgprFYTc2m52`; no hay veredicto aún. |
| Decisión usuaria / 2026-10-20 | Inicio/fin, Senior/usuario | F9: «Dejar F9 pendiente»; no se decide frontend ni se adelanta integración. Memoria: solicita intentar unificar identidades o crear una oficial y documentarla para evitar nuevas pérdidas; investigar mecanismo soportado sin sobrescribir historiales. |
| Resultado ECL / 2026-10-20 | Fin, `clinical-safety-reviewer` | PASS solo documental/académico RBC sintético: cuatro fuentes coherentes, 64 pares (27 coincidencias, 37 negativas), sin validación profesional. Uso real BLOCKED. Exige nueva revisión del código F6, no incorporar filtro postdonación y no dar por ratificada copia incompleta F6. Skill matching obsoleta: hallazgo documental alto. Sin escrituras ni pruebas. |
| Resultado E3 / 2026-10-20 | Fin, `reviewer-back` | BLOCKED: B1 alta, cleanup de usuario puede borrar cuenta recién vinculada por snapshot/FK; B2 alta, worker exige secretos API; B3 media, email aplicado con timeout omite revocación; B4 media, carrera sede/desactivación produce 500 vs 422 contratado. Ubicaciones: action_tokens.sql:370–373; config/env.ts:75–117; donor-records-service.ts:239–244; need_records.sql:147–164. Retención F7 y bypass GoTrue F9 siguen diferidos aceptados, no se inventan nuevos bloqueos. Se requieren corrección, nueva review, seguridad y QA antes de F6. |
| Resultado E1 / 2026-10-20 | Fin, `solution-architect` | Consulta ejecutada con read/glob/grep/skills/shell; sin escritura/commit ni auto-PASS. Inventario: 58 paths, 73 operaciones, 100 schemas, 57 ratificadas, 47 registros HTTP, 8 migraciones/17 tablas. Propone sync D1–D5 y primer slice F6 de cuatro archivos puros. Detecta tests contractuales que exigen AP-02 abierta; sync completa requiere test independiente + texto JSON/generados. F6 posterior bloqueado por payload de dos tokens vs consumidor de uno, replay/409/410, orden de locks, eventos de outbox antiguo y allowlist RPC. No resolver silenciosamente; requerir consulta/decisión antes de esos slices. |
| Asignación D1 / 2026-10-20 | Inicio, `solution-architect` | Un único escritor para cuatro docs actuales de autoridad/inventario; sin tocar código/contrato/pruebas/ADRs ni planes históricos. Solicitar también recomendación read-only de contrato worker para B2. Tras su resultado, reviewer-back inmediato antes de otro escritor. |
| Lanzamiento D1 / 2026-10-20 | `solution-architect` | Continuación aceptada en sesión `ses_ea54ab97bffeiJiYhv1P4yFF7c`; paths documentales habilitados para esta asignación, escritura efectiva por confirmar. |
| Investigación memoria / 2026-10-20 | Inicio/fin, Senior | `engram --help` confirma v3.5.1, `init [name]` crea `.engram/config.json`; `projects merge --dry-run` rechaza safe/save y prototype/save porque no son variantes de separador/Unicode. No existe config local. No se aplicó merge, borrado ni migración. La alternativa autorizada será una identidad oficial nueva documentada, preservando los cuatro historiales; ejecutar mediante escritor tras gate D1. |
| Alcance memoria / 2026-10-20 | Inicio/fin, Senior | El inventario de proyectos demuestra que uno de los historiales ambiguos mezcla otros repositorios; fusionar todo contaminaría Save a Life. Se elige la alternativa autorizada de crear `save-a-life-oficial` como nombre nuevo, con `.engram/config.json` versionado y artefactos privados ignorados. No mover/borrar memoria antigua ni atribuir migración completa. Senior verificará persistencia con tools tras review. |
| Asignación E5pre / 2026-10-20 | Inicio, `qa-reliability-engineer` | Diagnóstico exclusivamente ejecutor del backend actual (unitarias/typecheck/lint/build); ningún archivo fuente, prueba, contrato o DB editable. Independiente de D1 documental. No se convierte en gate de aceptación ni sustituye regresiones para B1–B4. |
| Resultado E5pre / 2026-10-20 | Fin, `qa-reliability-engineer`, sesión `ses_ea540cabeffe02ns5wmukQKrla` | Exit 0: `npm run test --workspace backend` (63 archivos, 715 pruebas), typecheck/lint/build del workspace backend. Lint y typecheck son el mismo tsc, no evidencia independiente. Sin cambios fuente en 256 archivos comparados; dist ignorado. No DB/integración/Bruno/E2E ni aceptación del baseline; faltan regresiones B1–B4. |
| Resultado E4 / 2026-10-20 | Fin, `security-privacy-auditor` | BLOCKED. Confirma B2/SP-02 (worker privilegiado) y B3/SP-03 (email incierto sin revocación). Añade SP-01 alta: JWT previo al reset sigue autorizado directamente en RPC/RLS al levantar password_setup_required; eliminar sesiones no invalida JWT. Añade SP-04 media: replay create_assisted_signup no revalida hospital tras reasignar admin. Sin exploits ejecutados; exigir reproducción real y diseño auth para SP-01. Retención/F7, bypass GoTrue/F9 y carrera sede permanecen separados; no se consideran resueltos por 715 unitarias. |
| Preparación EQ1 / 2026-10-20 | Inicio, `qa-reliability-engineer` | Consulta sin escritura para diseñar regresión determinista B1 y precisar paths/runner. No autoriza fix ni toca source mientras termina D1; mismo dueño de QA crítico. |
| Resultado EQ1 / 2026-10-20 | Fin, `qa-reliability-engineer` | Propone un archivo nuevo `backend/test/integration/inert-user-cleanup.integration.ts`, psql persistente con dos conexiones, barrera verificando pg_blocking_pids y Lock antes de COMMIT, límites/cleanup scoped. Sin dependencia pg, resets ni ejecución todavía. RED previsto con vitest directo (el wrapper hace reset). No es reproducción confirmada aún. |
| Consulta EA / 2026-10-20 | Inicio, `solution-architect` en contexto independiente | Consulta sin escritura sobre SP-01 (JWT anterior al reset); no duplicar D1 ni su recomendación B2. Identificar diseño mínimo y decisiones que requieran aprobación antes de auth/RLS/ADR. |
| Resultado D1 / 2026-10-20 | Fin, `solution-architect` | Editados exactamente Alcances/ERS/docs-README/Backend-Contracts: 313 inserciones/152 borrados, sincronización AP fechada y 58/73/100/57/47 distinguidos. Conserva 50 RF/57 RNF; cambia solo filas RF-EML-01 y RNF-PRV-04 conforme a resoluciones; links relativos y diff-check sin errores, cero cambios en contrato/backend/scripts. Sin pruebas ni auto-PASS. Recomienda ApiConfig/WorkerConfig separados y parsers explícitos, cinco paths productivos + fixtures/tests en asignación propia para B2. Review D1 inmediata a continuación. |
| Revisión D1 / 2026-10-20 | Inicio, `reviewer-back` | Revisar diff documental completo de cuatro paths contra ADR/ratificaciones; validar la recomendación B2 sin autoaprobación del arquitecto. Ningún siguiente escritor hasta resultado. |
| Resultado review D1 / 2026-10-20 | Fin, `reviewer-back` | PASS acotado a cuatro docs actuales; conserva autoridad/historia/107 requisitos y distingue 58/73/100/57/47. Sin bloqueantes D1. Sugerencia no bloqueante: enlazar B1/B3 junto a garantías absolutas en Backend-Contracts. B2 propuesto consistente con mínimo privilegio, no aprueba código futuro; preservar parseEnv API/server.ts y validaciones. Baseline y P03 global siguen abiertos. |
| Lanzamiento EA / 2026-10-20 | `solution-architect` | Sesión read-only `ses_ea536e03bffeDryK30gHp3mKGc` aceptada para SP-01, sin escritor paralelo. |
| QA D1 / 2026-10-20 | Inicio, `qa-reliability-engineer` | Ejecutar contrato/lint/check/generator sobre snapshot D1 aprobado, sin modificar pruebas/source ni DB; cuatro docs en gate previo al primer commit. |
| Resultado QA D1 / 2026-10-20 | Fin, `qa-reliability-engineer` | Exit 0: openapi:lint, openapi:api:check, test:api:generator (29/29), test:contract (72/72; 585 checks HTTP/73 operaciones/35 ejemplos), diff-check allowlisted. Sin source changes (263 archivos comparados). Check auxiliar no-index del plan nuevo devolvió 1 por diferencias, sin diagnósticos; lectura complementaria 0 problemas. No acredita backend/RLS ni cierra P03. D1 listo para commit acotado de cuatro docs y plan nuevo. |
| Resultado EA / 2026-10-20 | Fin, `solution-architect` | Recomienda generación protegida por sesión capturada antes de Auth, barrera reset pendiente, enforcement Express/RPC/RLS antes de replay y refresh sin readmisión; descarta iat por precisión/carreras. Comprobar auth.sessions sería reparación menor con nueva excepción privilegiada y no cerraría emisión tardía. SP-01 exige decisión usuaria, ADR nuevo propuesto complementando 003/004, RPC/grants y re-login de corte; no ampliar service_role. Sin implementación ni autoaprobación. Detener esta parte hasta consultar; demás fixes de invariantes existentes no quedan autorizados a cambiar política auth. |
| Commit D1 / 2026-10-20 | Inicio/fin, Senior | `fd5b7d2` — `docs: sync approved decisions and backend implementation inventory`. Cinco paths propios explícitos (cuatro docs D1 + este plan), índice previamente vacío, diff/staged-check sin errores. No incluidos agentes/config previa/CLAUDE/planes históricos ni pendiente preexistente. Reviewer D1 PASS y QA contractual aprobado; no cierre de baseline/F6/P03 global. |
| Asignación EM / 2026-10-20 | Inicio, `dev-back` | Crear identidad oficial nueva con CLI soportado y tres paths propios; preservar memoria histórica, ignorar artefactos locales, sin modificar configuración global/AGENTS/producto. Review backend inmediato al regresar. |
| Lanzamiento EM / 2026-10-20 | `dev-back` | Sesión `ses_ea52f4333ffebp6FKPkyKpio0a` aceptada. No se presume aún edición efectiva, gate o persistencia MCP. |
| Decisión SP-01 / 2026-10-20 | Inicio/fin, usuario/Senior | Autoriza **preparar ADR**, no su aceptación ni implementación: propuesta de barrera por generación/sesión, revisión independiente y aprobación posterior antes de código. F6 sigue bloqueado. |
| Resultado EM / 2026-10-20 | Fin, `dev-back` | Generados únicamente `.engram/config.json` (`project_name`), `.engram/.gitignore` y `docs/Memory-Project.md`. JSON/ignore/diff-check aprobados; mem_current_project devuelve oficial/config desde raíz y backend. Sin migrar/borrar/fusionar historiales. Mem_save del autor aceptado con aviso de nombre similar, sin follow-up de lectura ni declaración MCP raíz. Sin tests producto. Reviewer-back inmediato; luego Senior prueba root save/read. |
| Review EM / 2026-10-20 | Inicio, `reviewer-back` | Revisar tres archivos propios completos, alcance del init, exclusión de artefactos privados y no contaminación de historiales; no confundir autor con gate. |
| Resultado review EM / 2026-10-20 | Fin, `reviewer-back` | PASS estático de los tres archivos nuevos, sin hallazgos. No acredita persistencia operativa: debe guardarse y recuperarse observación inocua desde root; EM no completada hasta esa comprobación. No toca los gates backend/auth. |

## Hallazgos E3 y correcciones pendientes

| ID | Severidad / evidencia | Responsable y límites previstos | Aceptación y prueba | Estado |
| --- | --- | --- | --- | --- |
| B1 | Alta; `20261013050000_action_tokens.sql:370–373`, cascadas platform/donor | `backend-data-engineer`; nueva migración correctiva y regresiones acotadas; no reescribir migraciones aplicadas | Bloquear auth.users antes de revalidar cuenta; dos conexiones con barreras, cuenta viva no borrada; review inmediato + seguridad/QA | Pendiente |
| B2 | Alta; `backend/src/config/env.ts:75–117` | Consulta `solution-architect` antes de contrato de configuración; luego `dev-back` en config/worker/test fixtures definidos | Worker mínimo y producción arrancan sin service_role/CSRF/HMAC/webhook/borde API; review + seguridad/QA | Pendiente |
| B3 | Media; `donor-records-service.ts:239–244` | `dev-back`; servicio y unitarias propias, sin alterar política de tokens | Auth aplica email y pierde respuesta: revocar sesiones/refresh; errores seguros, no éxito si revocación falla; review + seguridad/QA | Pendiente |
| B4 | Media; `20261013030000_need_records.sql:147–164` | `backend-data-engineer`; migración correctiva y pruebas acotadas tras B1 | Serializar sede/create/desactivar; replay original y rechazo 422 consistente; concurrencia real + review/seguridad/QA | Pendiente |
| SP-01 | Alta; donor_records.sql:635–640,780–790 y platform_base.sql:166–184 | Consulta `solution-architect` antes de cualquier cambio auth/RLS; no inventar una nueva política | JWT anterior al reset rechazado en Express y PostgREST con hash válido, propietario nuevo autorizado; probar fallo revocación final | Bloqueada |
| SP-04 | Media; donor_records.sql:288–319 y identity_hardening.sql:15–20 | `backend-data-engineer`; nueva migración y regresiones QA scoped | Replay tras reasignación A→B no expone alta A ni produce email; replay autorizado conserva DTO | Pendiente |

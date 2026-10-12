# Traslado del desarrollo backend al monolito modular

Fecha: 2026-10-11.
Coordinación: Senior (Pi, modo build).
Estado general: P5a parcial y RP5a BLOCKED — traslado y checks funcionales GREEN; lock raíz aún desincronizado por EALLOWREMOTE. Se investigará vía nativa aislada sin debilitar políticas antes de continuar.

## Solicitud y objetivo

El usuario pide planificar, delegar y verificar un traslado cuidadoso del desarrollo ubicado en `apps/` hacia `backend/`, porque el backend debe residir allí y respetar el monolito modular aprobado. El resultado debe conservar código, DTOs, pruebas, contratos y cambios preexistentes, y reportar los estados y gates reales.

Este es un plan nuevo para esta solicitud. No sustituye ni sobrescribe el antecedente `2026-10-10-traslado-api-a-backend.md` ni planes de contratos, DTOs o configuración.

## Inventario y autoridad

- `apps/api/`: paquete `@save-a-life/api`, DTOs/validadores de `need-records`, pruebas, snapshot contractual y tipos generados; tsconfigs. No implementa todavía controladores, repositorios, servicios ni el endpoint HTTP productivo.
- `apps/web/`: frontend React y tipos OpenAPI cliente.
- `apps/mock-api/`: mock stateful local y tipos HTTP sintéticos; ADR-002 lo mantiene separado como tooling, no como backend productivo.
- `backend/`: scaffold Express existente, `index.js`, `config/`, manifest con `pnpm@10.33.0`, `package-lock.json` y `pnpm-lock.yaml`. Debe preservarse. No leer `.env`, iniciar el servidor ni conectar Supabase.
- Raíz: npm `12.0.2`, Node `24.19.0`, workspaces `apps/api`, `apps/mock-api`, `apps/web` y lockfile npm preexistente.
- ADR-001: TypeScript, Node/Express, Resend, monolito modular con dominio independiente. ADR-002: workspace npm único para frontend/mock, contrato único `docs/openapi.json` y mock separado. No modificar ADRs/stack ni elegir un gestor productivo silenciosamente.
- Working tree sucio antes de esta solicitud: cambios en OpenAPI, root manifiesto/lockfile, generador, web/mock, Bruno y documentación; `apps/api/` y varios planes son untracked. El baseline para comparación es el estado inicial real, no solamente HEAD.

## Alcance aprobado y decisiones de ejecución

Después de presentar la recomendación de **solo `apps/api` y npm raíz**, el usuario solicita implementar este plan. Se ejecuta esa opción: trasladar el backend de `apps/api/` a `backend/src/modules/need-records/dto/`, conservar web/mock separados, integrar `backend/` al workspace npm raíz y usar únicamente el `package-lock.json` raíz como autoridad. Retirar los dos locks legacy dentro de backend después de su checkpoint. No sustituir ADR-001/002 ni mezclar runtimes.

- Mantener el nombre existente del paquete `backend`, licencia, versión y scripts `dev`/`start`; añadir los scripts DTO/typecheck/build/lint y dependencias AJV ya utilizadas, sin reemplazar el manifiesto legacy.
- Raíz mantiene Node `24.19.0`, npm `12.0.2`, TypeScript `5.9.3` y políticas `allowScripts`. Actualizar selector DTO a workspace `backend`, declaración del gestor backend a npm coherente y rutas del generador. Declarar AJV/formats para el generador raíz sin depender accidentalmente de hoisting.
- Preservar versiones exactas actualmente bloqueadas; unificar resolución no autoriza actualizar dependencias directas/transitivas por conveniencia. Si npm necesita resolver versiones diferentes, detener ese cambio y escalar.
- Sin fuentes API duplicadas ni workspace vacío en origen. No mover `dist/`, `node_modules/`, caches o logs: son outputs locales y podrán regenerarse donde corresponda.

Fuera de alcance: crear HTTP productivo, auth/RLS, persistencia, matching, email, nuevos DTOs, cambios de contrato, cambios de frontend/mock, actualizaciones de dependencias, refactors del scaffold, secretos, configuración global, git reset/stage/commit/push o aplicar/eliminar stashes. Se permite exclusivamente un checkpoint Git no destructivo con `git stash create` e índice temporal, sin cambiar árbol, índice, branch ni pila de stashes, más snapshot allowlisted de archivos untracked. No quitar trabajo ajeno.

### Allowlist de escritura congelada

- `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json` y los cuatro archivos de `apps/api/src/modules/need-records/dto/`: retirar origen solamente después de preparar/verificar destino.
- `backend/package.json`, `backend/tsconfig.json`, `backend/tsconfig.build.json`, `backend/src/modules/need-records/dto/{validators.ts,validators.test.ts,openapi.ts,contract.generated.json}`.
- `backend/package-lock.json`, `backend/pnpm-lock.yaml`: retiro aprobado al unificar npm; bytes preservados en checkpoint.
- `package.json`, `package-lock.json`, `scripts/generate-api-contract.mjs`; `.gitignore` solo para outputs build trasladados si hace falta y `/.vitest/` (report local generado durante verificaciones, observado nuevo en P4).
- `README.md` y `docs/Backend-Contracts.md`: sincronización acotada de ubicación/comandos/boundary, sin cambiar contrato ni historias.
- `scripts/generate-api-contract.test.mjs` y contenido de `validators.test.ts`: exclusivamente QA; el escritor backend puede mover el test con bytes intactos, no modificar su contenido.
- Este plan: exclusivamente Senior. No escribir OpenAPI, web/mock, Bruno, planes históricos, ADRs, scaffold `backend/index.js`/`backend/config/`, agentes/skills o configuración global.

## Criterios de aceptación

1. Todo el desarrollo backend autorizado queda bajo `backend/`, sin dos fuentes/API workspaces activos. Fuentes, pruebas, snapshots y tipos conservan bytes salvo ajustes de rutas/configuración necesarios y aprobados.
2. `backend/index.js`, `backend/config/` y sus capacidades existentes no se sobrescriben ni se arrancan en verificaciones; los cambios preexistentes ajenos quedan intactos.
3. Generación oficial desde OpenAPI escribe/checkea el destino correcto; DTO runtime, contrato JSON y tipos no cambian semánticamente. Frontend/mock y contrato fuente permanecen intactos.
4. Manifiestos, imports, extends de TypeScript, scripts, locks y documentación activa son coherentes con el boundary autorizado. No quedan referencias ejecutables a `apps/api` ni symlinks/workspaces API obsoletos.
5. Unitarias DTO/generador, chequeo de generación, lint OpenAPI, typecheck/build y regresiones pertinentes pasan con evidencia y códigos de salida. No desactivar tests/casts ni ocultar fallos previos.
6. Cada slice de producción o pruebas recibe reviewer de área independiente inmediato; auditoría de seguridad para el traslado de los DTOs sensibles/boundary, QA independiente para aceptación. Arquitectura asesora, no autoaprueba. Ningún gate obligatorio pendiente se presenta como tarea terminada.

## Herramientas y skills

Disponibles: `read`, `find`, `grep`, `edit`, `write`, Bash, `codemode`, Pi `subagent` con perfiles `pi-*`, diagnósticos LSP. Senior coordina y escribe exclusivamente este plan; `pi-dev-back` es el escritor de producción de los slices autorizados. No usar acp_delegate/OpenCode task ni agentes sin prefijo.

Skills: `planning-and-task-breakdown`, `incremental-implementation`, `documentation-and-adrs`, `save-a-life-domain`, `save-a-life-api-database`, `api-and-interface-design`, `test-driven-development`, `code-review-and-quality`, `save-a-life-security-privacy`, `security-and-hardening`. Leer mediante `read`; rutas de plan de AGENTS/Workflow prevalecen sobre defaults de skills. Pruebas de navegador solo si el cambio autorizado alcanza ejecución web; no se prevén cambios UI.

## Secuencia, propietarios y checkpoints

| ID | Dueño | Trabajo y rutas | Dependencia | Estado |
| --- | --- | --- | --- | --- |
| P1 | Senior | Inventario read-only y estado inicial del árbol real; identificar destinos, colisiones, referencias y artefactos generados | Solicitud | Completada |
| P2 | `pi-solution-architect` | Consulta read-only: recomendar topology/rutas/gestor/locks, confirmar decisiones pendientes; no escribir ni instalar | P1 | Completada (consulta, no PASS del traslado) |
| P3 | Senior/usuario | Congelar alcance, boundary/gestor/locks y archivos exactos autorizados; registrar decisión | P2 | Completada — opción recomendada aceptada al pedir implementar |
| P4 | `pi-qa-reliability-engineer` | Baseline independiente DTO/generación y regresiones de traslado; único dueño de cambios de contenido de tests | P3 | Completada — 86 DTO + 18 generador baseline PASS; 4 RED nuevos esperados |
| RP4 | `pi-reviewer-back` | Revisión inmediata si P4 escribe tests; no iniciar writer siguiente antes del gate | P4 | PASS independiente de calidad del slice de tests, no GREEN del traslado |
| P5a | `pi-dev-back` | Traslado hash-equivalente de fuentes/configuración API al destino aprobado, adaptación de generador/manifiestos/locks/scripts por slice congelado | P3/P4/RP4 | Parcial — lock pendiente; corrección vuelve al mismo autor |
| RP5a | `pi-reviewer-back` | Revisión inmediata del diff completo del traslado, incluyendo tests movidos sin edición de contenido | P5a | BLOCKED — manifiesto/lock desincronizados; re-review obligatorio |
| SP5a | `pi-security-privacy-auditor` | Auditoría read-only del boundary/DTO/salida y preservación de privacidad, secretos y scripts | P5a estable | Pendiente |
| P5b | `pi-dev-back` | Sincronizar referencias/documentación activa necesarias, sin reescribir bitácoras históricas o ADRs | RP5a | Pendiente |
| RP5b | `pi-reviewer-back` | Revisión independiente inmediata de ajustes finales backend/tooling; front solo si realmente cambia artefacto frontend | P5b | Pendiente |
| P6 | `pi-qa-reliability-engineer` | Aceptación final independiente y comparación contra baseline; no corregir código productivo | Reviews/gates | Pendiente |
| P7 | Senior | Registrar resultados, comprobar preservación final y reportar en español con gates/limitaciones | P6 | Pendiente |

No escritores paralelos ni cambios en contratos compartidos. Revisores read-only pueden evaluar un diff congelado en paralelo. Cada BLOCKED vuelve al mismo autor y se revisa nuevamente.

## Verificaciones previstas

Antes de traslado, registrar inventario/hashes de fuentes y archivos legacy, git status/index/diff, resultados actuales. Snapshot allowlisted fuera del repo si es necesario; nunca secretos ni outputs ignorados.

Con comando definitivo según gestor aprobado:

- Unitarias DTO: actualmente `npm run test:backend:dto`.
- Generación: `npm run openapi:api:check`, `npm run test:api:generator`; modificar rutas de salida en generador, no tipos a mano.
- Contrato: `npm run openapi:lint`; las pruebas HTTP mock/Prism/Bruno solo en loopback y datos sintéticos cuando sean pertinentes al delta.
- Typecheck/build/lint del paquete backend y regresión de workspaces web/mock.
- Comparación de hashes para archivos movidos y los preservados; inventario de referencias ejecutables obsoletas excluyendo planes históricos y artefactos generados locales.
- Verificar NodeNext/JSON/imports sobre el build trasladado sin arrancar Express/Supabase.

Los nombres finales de workspace y scripts se congelan en P3; no afirmar éxito por los nombres provisionales.

## Riesgos y mitigaciones

- Ambigüedad sobre web/mock: consulta explícita antes de mover runtimes distintos.
- Dos gestores/tres locks: arquitectura recomienda alternativas; autorización antes de conversión/eliminación.
- Manifiesto destino ya existe: fusionar únicamente lo aprobado, no reemplazar por el de API.
- TypeScript extends/imports relativos y generador pueden quedar apuntando al origen: pruebas de rutas/build más inventario de referencias.
- Tree dirty/API untracked: hashes/snapshot del estado real; no usar checkout/reset, no commits.
- Scaffold Express legado tiene CORS amplio y ruta de prueba Supabase no auditada: conservar, no conectarlo con DTOs ni promoverlo como API productiva; reportar limitación fuera del traslado.

## Bitácora

### Inicio — P1

- Nueva autorización de traslado recibida, distinta de la consulta anterior de solo lectura.
- Modo Pi build confirmado; Node `v24.19.0`, npm `12.0.2`; listado real de cambios previos registrado sin modificación.
- Leídos AGENTS, Workflow, ADR-001/002, requisitos, plan antecedente, manifiestos root/API/backend, tsconfigs API e index legacy.
- La consulta anterior verificó DTOs, no implementó API HTTP; no convertir esa evidencia en aprobación del traslado.
- Se detectaron dos decisiones antes de implementar: alcance web/mock y boundary de gestor/locks. Este plan no presume sus respuestas.

### Resultado P2 — consulta independiente de arquitectura

- Delegado mediante `subagent` a `pi-solution-architect`, sesión nueva, solo lectura. Encargo: inventario, colisiones, rutas de traslado, gestores/locks, límites web/mock y preguntas mínimas. No se autorizó writer, conversión de gestores ni cambios de decisiones aprobadas.
- Recomendación: mover solamente el desarrollo backend de `apps/api/` a `backend/src/modules/need-records/dto/`; mantener `apps/web/` y `apps/mock-api/` separados. Conservar los cuatro archivos DTO y dos tsconfigs, adaptar `extends` a `../tsconfig.base.json`; fusionar el manifiesto existente, no sobrescribirlo. Los validadores no incorporan Express/Supabase ni crean un servidor nuevo.
- Alternativa A preferida técnicamente, condicionada a autorización: incorporar `backend` al workspace npm raíz, conservar nombre legacy `backend`, actualizar selectores y generador, usar lock raíz como autoridad y resolver explícitamente declaración pnpm y locks legacy.
- Alternativa B: backend autónomo pnpm; retirar workspace API raíz, declarar tooling propio y adaptaciones explícitas para que tests/build raíz no omitan backend. Resolver lock npm legacy. No se decidió una alternativa.
- Descubrimiento: el generador raíz importa AJV/ajv-formats disponibles hoy mediante hoisting del workspace API; revisar declaración/resolución reproducible al definir boundary, sin actualizar versiones por oportunidad.
- Arquitectura ejecutó `node scripts/generate-api-contract.mjs --check`, sin escritura. Resultado informado: `Canonical API contract artifacts are current.`; finalización correcta. Es check del estado origen, no aceptación del traslado.
- No se ejecutaron todavía suites, build ni aceptación de migración. No se instalaron dependencias, arrancaron servidores o conectaron servicios.
- Verificación Senior posterior: `git status --short`, `git diff --cached --name-only`, `git diff --numstat` y status focalizado; únicos archivos nuevos de esta solicitud en el producto: este plan. `apps/api/` y backend permanecen en su ubicación original; índice sin cambios.
- P3 bloqueada para preguntar al usuario: confirmar solo `apps/api` frente a web/mock; elegir npm raíz o pnpm autónomo y autorizar tratamiento de los locks legacy. P4–P7 y reviews/auditoría/aceptación siguen pendientes. No se declara PASS ni tarea completada.

### Autorización de implementación — P3

- Después del reporte que recomienda solo `apps/api` y npm raíz, el usuario solicita implementar este plan. Senior comunica esa opción de ejecución y la registra arriba; no se amplía a frontend/mock ni se crean endpoints.
- Checkpoint recuperable previo: `/tmp/save-a-life-backend-migration-20261011-71d5m5ca/`. Guarda snapshot allowlisted, hashes de 85 archivos seguros (7 de API), status/diffs iniciales, índice temporal y HEAD inicial `9ccf41d16bf847f5ce7055d19ff99ac440196c55`.
- Checkpoint Git: `d731a985bf8f25c5e5b60cd9b575c7029c9c79c9`, creado con `git stash create` usando índice temporal. Comprobados índice real y working tree sin modificaciones por el checkpoint; no commit en branch, stage, reset, push ni cambio de pila de stashes.
- Los dos locks legacy y todos los archivos origen están en `baseline/`; `hashes-before.json` permite comprobar preservación del estado real, incluidos cambios preexistentes. Se excluyeron secretos, symlinks y outputs ignorados.
- P4 se asignará a QA para baseline y regresiones del traslado antes del writer; reviewer-back inmediato si QA escribe tests. Los siguientes gates siguen pendientes hasta sus resultados reales.

### P4 y RP4 — baseline y RED-GREEN preparado

- QA único autor de pruebas añadió cuatro regresiones a `scripts/generate-api-contract.test.mjs:281-324`; diff efectivo +45/-0 contando separador. Los 18 tests anteriores y los siete archivos API conservaron bytes; `validators.test.ts` SHA-256 `cd3e94f7a61312e3f63569c70d4e9fa0f78daac1d1dc8c043f9c49aa3b991ddc`.
- Baseline y posterior: `npm run test:backend:dto` 86/86 exit 0; `npm run typecheck --workspace @save-a-life/api`, `npm run openapi:api:check`, `npm run openapi:lint` exit 0; lint con cinco warnings previos. Generador baseline 18/18 exit 0; posterior 18 PASS + cuatro RED esperados exit 1. Fallan destino generado backend, fixture backend-only, workspace y selector DTO todavía antiguos. No GREEN final declarado.
- `node --check scripts/generate-api-contract.test.mjs` exit 0. LSP QA: un archivo/cero diagnósticos. Los filtros negativos de test-name no aislaron suites; no se contabilizan como GREEN. Evidencia: `qa-baseline/qa-report.json`, logs y diff bajo el checkpoint.
- RP4 `pi-reviewer-back`: **PASS** independiente para calidad del slice de tests; lee snapshot y evidencia, no ejecuta pruebas ni recalcula hashes. Sin bloqueantes. Aserciones corresponden al alcance congelado; fixture usa checker real y limpieza `finally`; no hubo desactivaciones. No certifica migración ni HTTP/auth/RLS.
- Residual nuevo `.vitest/json/output.json` de 700 bytes/0 tests identificado por QA. Reviewer encontró mecanismo de salida JSON default de Vitest, sin atribuir invocación concreta ni leer cuerpo. Senior comprobó ausencia en status inicial y Git tracked, y eliminó solo ese archivo generado y padres vacíos. No borró código ni trabajo previo. Se autoriza ignore puntual `/.vitest/` para futuras verificaciones.
- Preparación de locks: backend conserva Supabase 2.117.1, cors 2.8.6, dotenv 18.0.3, Express 5.2.1 y nodemon 3.1.14. Hay diez rutas transitivas con versiones distintas preexistentes entre árboles raíz/backend; se debe verificar versión por consumidor/nesting, no igualar por ruta hoistada. No autoriza upgrades.
- P5a se delega a un único writer backend después de RP4. RP5a inmediato antes de P5b; demás gates siguen pendientes.

### P5a parcial y RP5a — bloqueo de consolidación npm

- `pi-dev-back` trasladó los cuatro archivos DTO, test/snapshot/tipos hash-equivalentes y retiró los siete archivos fuente/manifiesto/config de `apps/api`. Fusionó manifest legacy, scripts/typecheck/build/lint, workspace backend, dependencia AJV/formats explícita en raíz, generador a rutas backend e ignore local Vitest. No modificó contenido de tests, documentación, scaffold, web/mock u OpenAPI.
- Ajuste acotado de build: `exclude: ["src/**/*.test.ts"]` evita nuevas emisiones de tests; una primera ejecución descubrió fuente+test compilado (172) y, tras corregir/excluir ese output generado, la suite vuelve a 86. QA final debe verificar build limpio y repetido sin duplicación.
- Verificado por autor: 86/86 DTO, 22/22 generador (cuatro RED pasan a GREEN), check generación, lint OpenAPI (cinco warnings previos), `npm run typecheck`, `npm run build`, `npm run lint` y import DTO NodeNext/JSON con fixture sintético exit 0. Sin arrancar Express/Supabase. Evidencia `p5a/` bajo checkpoint. Estos resultados no equivalen a reproducibilidad ni PASS independiente.
- BLOQUEO: regeneración nativa `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`, también offline, falla `EALLOWREMOTE` al obtener `@tailwindcss/oxide-wasm32-wasi-4.3.3.tgz`. Lock raíz conserva bytes y referencias API anteriores; los dos locks legacy siguen intactos y NO se eliminaron ni editaron manualmente. Directas y transitivas legacy no se han actualizado. Instalación reproducible no verificada.
- RP5a `pi-reviewer-back`: **BLOCKED** por `package-lock.json:11-14,42-50` frente a `package.json:16-19`; no encontró otro bloqueante en código examinado. Comparó texto DTO/test/index contra snapshot; no ejecutó pruebas, instalaciones ni recalculó hashes. Docs pendientes pertenecen a P5b; no se aprueba seguridad productiva de scaffold legacy.
- Causa delimitada por reviewer: npm 12 `--package-lock-only` y `--dry-run` activan `complete`; Arborist requiere `pacote.extract(node.resolved, ...)` para bundles WASM, y safeguard `remote` se aplica antes de caché. No se cambian políticas ni se habilitan remotos.
- Recomendación no probada: evaluar `npm install --package-lock-only=false --ignore-scripts --offline --no-audit --no-fund` sin dry-run, exclusivamente en copia aislada allowlisted. Debe comparar versiones/integridades por consumidor contra ambos árboles baseline; si cambian, detener/escalar. No fusión manual de lock. Corrección vuelve a `pi-dev-back`; RP5a re-review inmediato antes de P5b y auditor/QA finales.

### Corrección P5a — intento nativo offline aislado

- Mismo autor `pi-dev-back`, sin ediciones al repositorio, evaluó vía nativa en copia temporal allowlisted sin fuentes, node_modules, env/config secretas. `npm install --package-lock-only=false --ignore-scripts --offline --no-audit --no-fund` exit 1 `ENOTCACHED`: falta metadata registry de `@supabase/supabase-js`. No generó lock candidato ni node_modules, no copió nada ni retiró locks legacy. Status conservó exactamente 37 entradas P5a; pruebas y locks intactos.
- Evidencia: `p5a-fix/native-lock-install.log` bajo checkpoint. No repitió suites/builds porque no cambió código y lock no se generó; los GREEN previos no prueban este intento. RP5a sigue BLOCKED; no hubo un slice nuevo de código que autoaprobar.
- Senior permite como siguiente investigación una **instalación npm nativa normal en copia aislada, sin offline**, para obtener metadata/dependencias de las versiones ya aprobadas mediante el registry npm configurado. Es una descarga ordinaria de dependencias del plan, no permiso para habilitar remote installs, cambiar `allowRemote`/`allowScripts`, usar URLs arbitrarias, leer credenciales/configuración global, ejecutar hooks o instalar versiones nuevas. Si el safeguard vuelve a bloquear o requiere credenciales/permisos nuevos, detener/escalar. Se mantiene comparación estricta de versiones/integridades y ningún candidato pasa al repo antes de validación.

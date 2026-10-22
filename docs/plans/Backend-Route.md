# Backend-Route: ruta de trabajo para cerrar el backend (verificación, F6, F8 y limpieza de docs)

Fecha de redacción: 2026-10-21. Autor: Claude Code (sesión Senior). Estado general: **Pendiente** (nada de este plan se ha ejecutado).
Este documento está escrito para que **cualquier agente** (Claude Code, OpenCode o Pi) pueda tomar una tarea sin haber visto la conversación que lo originó. No sustituye `AGENTS.md`, `CLAUDE.md`, `docs/Agent-Workflow.md`, los ADR ni la especificación; los enlaza.

---

## 0. Cómo usar este documento

1. Lee primero §1 (contexto), §2 (reglas inamovibles) y §3 (estado verificado). Luego ve **solo** a la ficha de tu tarea (§6 a §10) y a las fuentes que ella cita (con líneas).
2. Una tarea solo puede empezar si sus **dependencias** están en estado `Completada` en §13 (bitácora/tablero) y si su **gate de aprobación** (§11) está resuelto.
3. Cada tarea tiene un **único agente escritor**, **paths permitidos** y **paths prohibidos**. Si necesitas salir de ellos, detente y reporta `BLOCKED`.
4. Si algo contradice un ADR, un requisito aprobado o una decisión de la persona usuaria, **detente y reporta `BLOCKED`**: no elijas por tu cuenta.
5. Reporta en el formato de §5.3. No uses PII, tokens, coordenadas exactas ni cuerpos de solicitudes en nada que escribas (logs, plan, commits, reportes).
6. Nunca declares un PASS que no ocurrió. Un gate no ejecutado se anota como `pendiente`. Un PASS solo cuenta si el agente que lo emite **no escribió** el artefacto revisado.
7. La persona usuaria aprueba el cierre de cada módulo. Los commits se hacen solo cuando ella lo pida o ya lo haya autorizado para esa unidad, y se usan Conventional Commits con stage explícito (nunca `git add -A`).

---

## 1. Contexto del proyecto y de esta ruta

**Producto.** Save a Life es un prototipo académico que conecta hospitales autorizados con donantes de sangre compatibles y cercanos en Lima: el hospital publica una necesidad, el sistema preselecciona candidatos, envía invitaciones por email y registra la *intención* de asistir. No hay contacto paciente–donante. Todo dato es **sintético**; el uso con datos reales está bloqueado (RNF-SAF-03).

**Arquitectura.** Monolito modular con dos carpetas productivas: `backend/` (Node 24 + Express + Supabase/PostgreSQL + Resend tras adaptadores) y `frontend/` (React 18 + TypeScript + Vite + Tailwind 4). `apps/web` (React) y `apps/mock-api` (Express con estado en memoria) son la **demo** contra mocks, no producción. Contrato único: `docs/openapi.json` (OpenAPI 3.1); los seis archivos generados no se editan a mano. Persistencia: funciones PostgreSQL llamadas por RPC de Supabase detrás de puertos/adaptadores (ADR-003); cliente por petición con el JWT del usuario + RLS; `service_role` solo en la allowlist de ADR-006.

**Por qué existe esta ruta.** El backend tiene F2a, F2b, F3, F4, F5 y F7 implementados, y F6 solo con su dominio puro. F8 no existe. Hay hallazgos de seguridad abiertos (B1–B4, SP-01, SP-04, P-12) que los planes de octubre marcan como bloqueantes **antes de F6**, y ningún gate independiente (reviewer-back, security-privacy-auditor, clinical-safety-reviewer) se ha ejecutado sobre F5/F6/F7. Además `docs/plans/` acumula planes cerrados. La persona usuaria pidió cinco cosas:

| # | Petición | Dónde se resuelve |
| --- | --- | --- |
| 1 | Planear cómo lanzar agentes gastando pocos tokens y cargándolos con las skills correctas | §5 |
| 2 | Investigar la parte legal en dos etapas (investigación y construcción) y decir qué aprobar para construir `legal-information` | §8 y §11 |
| 3 | Verificar el backend paso a paso y a detalle | §6 y §7 |
| 4 | Ordenar los documentos y borrar los que no sirven | §9 |
| 5 | La conexión con el frontend queda **congelada** hasta que la persona usuaria la confirme | §10 |

**Decisiones ya tomadas por la persona usuaria (2026-10-21):**

- Verificar: backend ya hecho F2a–F7, gates independientes pendientes, cada slice nuevo (F6/F8) al construirlo, y el borrado de cuentas de Auth (P-12).
- Borrado de docs: solo planes cerrados y documentos duplicados, con lista archivo por archivo para su OK antes de borrar. **No** se toca `.pi/`, `.claude/skills` ni `.opencode/`.
- Legal: mecánica del módulo + semilla `0.1-borrador` con fuentes investigadas; nunca `aprobado` sin abogado.
- Orden: **Verificar → F6 → F8**.
- Frontend: lo terminan sus compañeros; su implementación e integración esperan su confirmación explícita.

**Decisiones previas que siguen vigentes** (ver `docs/pending/2026-10-20-bloqueos-y-decisiones.md`): «Sí, sincronizar» las fuentes con los ADR aceptados; F9 queda pendiente; se autorizó **preparar** (no aceptar ni implementar) un ADR para SP-01; F7 se implementó sin borrado de cuentas de Auth (ADR-006); identidad oficial de memoria `save-a-life-oficial`.

---

## 2. Reglas inamovibles (resumen de `AGENTS.md`)

- Grupo sanguíneo, ubicación, correo, disponibilidad y donaciones son datos personales sensibles. Autorización en servidor + RLS; la UI no autoriza.
- Un donante nunca ve datos de otros donantes; un hospital solo lo mínimo y de su institución. Sin pacientes, diagnósticos ni historias clínicas.
- El matching **preselecciona candidatos**; nunca certifica elegibilidad ni seguridad transfusional. No se hardcodean intervalos clínicos. La matriz ABO/Rh es académica (V6).
- Nunca PII, tokens, coordenadas exactas ni cuerpos completos en logs, métricas, errores o analítica.
- Email y confirmaciones: idempotentes y auditables.
- Stack aprobado por ADR-001 (Node/Express, Supabase, Resend); no se cambia sin ADR nuevo y aprobación.
- No afirmar cumplimiento legal ni clínico; listar lo pendiente de validación profesional en Perú.
- Un ADR aprobado solo lo cambia la persona usuaria.
- Convenciones de código: `docs/plans/2026-10-12-especificacion-faltante-backend.md` Anexo C (líneas 2254–2276): ESM/NodeNext con sufijo `.js`, `import type`, errores con mensaje fijo sin PII, vitest junto al código, pruebas HTTP con `serve(app)` + `fetch`, logger solo con campos permitidos, composición sin singletons.
- Repo: Conventional Commits; un commit atómico por unidad verificada; el árbol suele tener cambios ajenos, así que se agregan al stage solo archivos propios.
- Docs, planes y copy de UI en español con tildes.

---

## 3. Estado verificado al 2026-10-21 (lectura de docs y código; **no** se ejecutaron tests)

| Módulo | Estado | Evidencia |
| --- | --- | --- |
| `platform` (health) | Implementado | `backend/src/modules/platform` |
| `identity-institutions` F2a (21 ops) y F2b (5 ops) | Implementado | `docs/README.md` inventario 2026-10-20 |
| `need-records` F3 (4 ops) | Implementado | idem |
| `email-delivery` F4 (webhook Resend, outbox, worker) | Implementado | idem |
| `donor-records` F5 (14 ops) | Implementado | idem |
| `privacy-requests` F7 (9 ops) | Implementado **sin** borrado de cuentas de Auth (503 en eliminación aprobada) | `docs/plans/2026-10-20-privacy-requests.md`, ADR-006, P-12 |
| `invitation-coordination` F6 (10 ops ratificadas) | **Solo dominio puro**: `backend/src/modules/invitation-coordination/domain/{batch-size,compatibility,haversine,invitation-state,need-donor-code,ranking}.ts` + `domain.test.ts` (commit `da425c0`). Sin migración, RPC, router ni Bruno | `docs/plans/2026-10-20-invitation-coordination.md` |
| `recognition-policies` + `legal-information` F8 (7 ops sin ratificar) | **No existe** | `docs/README.md` |
| Frontend `frontend/` | Vistas públicas, de acceso y del donante con **datos demo**; sin cliente HTTP, sin guard de sesión; carpetas `hospital`, `superadmin`, `invitation` vacías | pruebas Playwright del 2026-10-21 |

Inventario de contrato (script reproducible en `docs/README.md`): 58 paths, 73 operaciones, 100 schemas; 66 ratificadas (56 registradas en 8 routers + 10 de F6); 7 de F8 sin ratificar.

**Cifras históricas, no vigentes hasta re-ejecutar (V2–V7):** F7 reportó pgTAP 684, unitarias 766, integración 208 y Bruno backend en verde; el diagnóstico QA del 2026-10-20 dio 715 unitarias backend y typecheck/lint/build con exit 0. `test:contract` no terminó en F7 (Prism se cuelga en este entorno).

**Hallazgos abiertos** (fuente: `docs/plans/2026-10-20-ejecucion-de-pendientes-con-agentes.md`, sección «Hallazgos E3»; **su estado actual en HEAD se determina en la tarea V1**, no se asume):

| ID | Sev. | Qué | Dónde |
| --- | --- | --- | --- |
| B1 | Alta | El cleanup de usuarios inertes puede borrar una cuenta recién vinculada (carrera por snapshot/FK) | `backend/supabase/migrations/20261013050000_action_tokens.sql:370–373` |
| B2 | Alta | El worker exige secretos de API (service_role/CSRF/HMAC/webhook/borde) que no necesita | `backend/src/config/env.ts:75–117` |
| B3 | Media | Si Auth aplica el cambio de email y se pierde la respuesta, no se revocan sesiones | `backend/src/modules/donor-records/application/donor-records-service.ts:239–244` |
| B4 | Media | Carrera crear necesidad / desactivar sede: 500 en vez del 422 contratado | `backend/supabase/migrations/20261013030000_need_records.sql:147–164` |
| SP-01 | Alta | Un JWT anterior al reset de contraseña sigue autorizado directo en RPC/RLS al levantar `password_setup_required` | `...donor_records.sql:635–640,780–790`; `...platform_base.sql:166–184` |
| SP-04 | Media | El replay de `create_assisted_signup` no revalida el hospital tras reasignar al admin | `...donor_records.sql:288–319`; `...identity_hardening.sql:15–20` |
| P-12 | Urgente | Sin borrado de cuentas Auth no se cumple el derecho de eliminación de punta a punta | ADR-006; pendientes P-12 |
| P-11 | — | Discrepancias de contrato F6: payload de dos tokens vs consumidor de uno, replay/409/410, orden de locks, eventos de outbox anteriores, allowlist RPC | pendientes P-11 |

---

## 4. Fuentes de verdad y orden de lectura

| Tema | Archivo (líneas relevantes) |
| --- | --- |
| Reglas de agentes | `AGENTS.md`, `CLAUDE.md`, `docs/Agent-Workflow.md` |
| Requisitos normalizados | `.opencode/references/project-requirements.md`; ERS `docs/2_Especificaciones_De_Software.md` (§7.5 límites de reconocimientos/laboral; RF-LAB-01 ~549; RNF-LGL-01 ~977; RNF-SAF-03 ~975) |
| Spec de ejecución backend | `docs/plans/2026-10-12-especificacion-faltante-backend.md`: decisiones V1–V20 (119–203), Bloque A correcciones (204–354), F6 (1524–1697), F7 (1698–1787), **F8 (1788–1835)**, guards (1858–1873), verificación (1874–1906), Anexo A contrato (1907–2099), Anexo B reglas (2100–2253), Anexo C convenciones (2254–2276), Anexo E riesgos (2367–2386) |
| Mapa de capacidades | `docs/plans/2026-10-12-api-backend-completo-incremental.md` |
| Pendientes y bloqueos | `docs/pending/2026-10-20-bloqueos-y-decisiones.md` (P-01…P-12) |
| Bitácora de la verificación previa | `docs/plans/2026-10-20-ejecucion-de-pendientes-con-agentes.md` |
| F6 slice status | `docs/plans/2026-10-20-invitation-coordination.md` |
| F7 | `docs/plans/2026-10-20-privacy-requests.md` |
| ADRs | `docs/decisions/ADR-001…006` (stack; tooling; RPC/Supabase; sesión/CSRF/CORS/topología; outbox+worker; allowlist `service_role`) |
| Contrato | `docs/openapi.json`, `docs/Backend-Contracts.md`, `docs/Api-Rules.md` |
| Skills (se leen con Read) | `.opencode/skills/<nombre>/SKILL.md` |
| Roles de agente | `.opencode/agent/<id>.md` |

---

## 5. Protocolo de lanzamiento de agentes (ahorro de tokens + skills correctas)

> En Claude Code los roles de `.opencode/agent/*.md` **no son subagentes registrados**. Se lanza `Agent(subagent_type: "general-purpose", prompt: …)` y el prompt hace que el agente lea el rol. En OpenCode V2 se usa `subagent`; en Pi, `subagent({agent:"pi-…", task})` (IDs `pi-*` en `docs/Agent-Workflow.md`). Usa solo la herramienta del harness actual.

### 5.1 Reglas

1. **Prompt corto con rutas, no pegar texto.** 25–40 líneas. El agente lee el rol y las skills con Read. Se incluyen líneas exactas de la spec a leer (no «lee la spec»).
2. **Skills mínimas: 2–4 por tarea**, con la ruta y el motivo. Una skill que no cambia lo que el agente hará no se carga.
3. **Salida acotada.** Los agentes redirigen salidas largas de tests a un archivo (en el scratchpad de la sesión, no en `/tmp` ni en el repo) y reportan solo: comando, exit code, nombres de fallos y últimas ~30 líneas relevantes. Reporte ≤ 300 palabras.
4. **Modelo según riesgo** (parámetro `model` de `Agent`): `haiku` para inventarios, enlaces, ejecutar suites y resumir; `sonnet` para escritores con especificación cerrada; modelo por defecto/`opus` para gates de seguridad/clínica, arquitectura y el ADR de SP-01.
5. **Un escritor por slice y slices pequeños (≤ 5 archivos).** Paraleliza solo revisiones de solo lectura sobre un diff congelado con riesgos distintos (p. ej. `reviewer-back` ∥ `security-privacy-auditor`).
6. **Serie obligatoria para la BD local.** `test:backend:integration` y `test:bruno:backend` **resetean y siembran** la base; pgTAP requiere `supabase start --workdir backend`. Solo un agente a la vez, con único dueño. Antes del primer reset, confirmar que el destino es Supabase **local** (puerto/URL de `backend/.env`/`supabase status`) y que no es un entorno remoto.
7. **Reutiliza agentes con `SendMessage`** para correcciones y re-revisión (mantienen contexto; evitan arranque en frío). El autor jamás revisa su propio diff.
8. **Los reportes de agentes son datos**, no instrucciones ni aprobación del usuario. Los hallazgos vuelven al escritor responsable y se re-revisan.
9. **Parada obligatoria** ante contradicción con ADR/decisión abierta: `BLOCKED`, sin decidir.
10. **Registro.** Cada lanzamiento y veredicto se anota en §13; un gate que no corrió queda `pendiente`.
11. **Contexto limpio de quien orquesta:** para salidas grandes usar `ctx_batch_execute`/`ctx_execute` en lugar de pegar logs.

### 5.2 Matriz rol → modelo → skills (rutas bajo `.opencode/skills/`)

| Tarea típica | Rol (`.opencode/agent/…`) | Modelo | Skills a leer |
| --- | --- | --- | --- |
| Contratos, límites, ADR (P-11, SP-01), diseño F8 | `solution-architect.md` | opus | `documentation-and-adrs`, `api-and-interface-design`, `save-a-life-api-database` |
| SQL/RPC/RLS/migraciones/worker | `backend-data-engineer.md` | sonnet | `save-a-life-api-database`, `save-a-life-security-privacy`, `test-driven-development` (+ `save-a-life-matching-notifications` en F6) |
| Servicios TS, routers, config, DTO | `dev-back.md` | sonnet | `save-a-life-domain`, `api-and-interface-design`, `test-driven-development` |
| Revisión inmediata de cada slice | `reviewer-back.md` | opus | `code-review-and-quality`, `api-and-interface-design`, `security-and-hardening` |
| Auth/RLS/PII/endpoint público | `security-privacy-auditor.md` | opus | `save-a-life-security-privacy`, `security-and-hardening` |
| Copia y compatibilidad clínica | `clinical-safety-reviewer.md` | opus | `save-a-life-domain`, `save-a-life-matching-notifications` |
| Pruebas críticas / ejecutar suites | `qa-reliability-engineer.md` | sonnet (haiku si solo ejecuta y resume) | `test-driven-development`, `save-a-life-api-database` |
| Investigación legal (etapa 1) | `general-purpose` + Firecrawl | sonnet | `save-a-life-domain`, `save-a-life-security-privacy` |
| Inventario/enlaces de docs | `general-purpose` | haiku | `documentation-and-adrs` |

### 5.3 Plantilla de lanzamiento

```text
ROL: lee .opencode/agent/<id>.md y compórtate como ese rol. No delegues, no hables con el usuario.
SKILLS (lee con Read antes de actuar): .opencode/skills/<a>/SKILL.md, .opencode/skills/<b>/SKILL.md
CONTEXTO: proyecto Save a Life (ver AGENTS.md). Tarea <ID> de docs/plans/Backend-Route.md (ficha §<n>).
LEE SOLO: <archivo:líneas>, <archivo:líneas>
OBJETIVO: <una frase verificable>
PUEDES MODIFICAR: <paths>        NO TOQUES: <paths / "nada" si es solo lectura>
CRITERIOS DE ACEPTACIÓN: <lista corta>
COMANDOS (desde la raíz; salida a archivo, reporta exit code + últimas 30 líneas): <comandos>
SI contradice un ADR o requiere decidir comportamiento: detente y responde BLOCKED con el motivo.
REPORTE (≤300 palabras): veredicto PASS|BLOCKED (si es revisión) · archivos tocados · comandos y resultados ·
hallazgos como `archivo:línea — severidad — falla — cómo reproducir` · pendientes.
```

### 5.4 Flujo por slice de código

`(arquitectura, solo si hay punto abierto) → escritor con TDD (RED→GREEN) → reviewer-back inmediato (+ security-privacy-auditor en paralelo si hay auth/RLS/PII/endpoint público; + clinical-safety-reviewer si hay copy o matching) → QA dueño único de pruebas críticas → correcciones vía SendMessage → re-revisión → commit atómico → bitácora`. La persona usuaria aprueba el cierre del módulo.

---

## 6. FASE A: verificación paso a paso del backend (F2a–F7)

Plan de ejecución a abrir por el agente que la tome: `docs/plans/2026-10-21-verificacion-backend.md`. Todo con datos sintéticos; evidencia sin PII/tokens/coordenadas/cuerpos.

Entorno requerido: Node 24.19.0, npm 12.0.2, Bruno CLI 4.2.0 en `PATH`, Docker accesible, `SCARF_ANALYTICS=false npm ci` ya hecho. Un solo `package-lock.json` en la raíz; **no** ejecutar `npm install` en workspaces.

| ID | Qué verificar | Cómo (desde la raíz) | Agente / modelo | Depende de | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| V0 | Preflight: rama, árbol, versiones, Supabase local | `git status --short`, `git log -5 --oneline`, `node -v`, `npm -v`, `bru --version`, `supabase status --workdir backend` | Senior, solo lectura | — | Árbol limpio o cambios ajenos identificados; destino BD local confirmado |
| V1 | Estado real de B1, B2, B3, B4, SP-01, SP-04, P-12 en HEAD | Para cada uno: leer el archivo:línea de §3, `git log -S"<símbolo>" -- <path>`, buscar prueba de regresión | general-purpose / haiku, solo lectura | V0 | Tabla `corregido / abierto / bloqueado` con commit y prueba; **sin** inferir «corregido» por tests históricos |
| V2 | Estático | `npm run openapi:lint`, `npm run openapi:api:check`, `npm run test:api:generator`, `npm run typecheck`, `npm run lint`, `npm run build` | qa / haiku | V0 | exit 0 en todos; si no, lista de errores |
| V3 | Unitarias | `npm test` | qa / haiku | V2 | Conteos reales por workspace (el diagnóstico previo: 715 backend) |
| V4 | pgTAP | `npm run test:backend:db` (requiere `supabase start --workdir backend`) | qa, **serie** | V3 | Conteo real (histórico 684) |
| V5 | Integración contra Supabase local | `npm run test:backend:integration` (**resetea y siembra**) | qa, **serie, único dueño** | V4 | Conteo real (histórico 208) |
| V6 | Bruno contra el backend real y contra el mock | `npm run test:bruno:backend`; `npm run test:bruno` | qa, **serie** | V5 | Todas las requests pasan; Prism/mock **no** cuentan como evidencia del backend |
| V7 | Contrato Prism + Ajv | `timeout 600 npm run test:contract` | qa | V2 | Si se cuelga: diagnosticar causa (Prism) y registrar «no verificado»; no afirmar PASS |
| V8 | Cerrar abiertos de V1 uno por vez (ver §7) | ver §7 | según §7 | V1–V7 | Cada hallazgo con prueba RED→GREEN, review, seguridad y QA |
| V9 | Gates independientes sobre HEAD congelado (F5, F7 y lo corregido en V8) | `reviewer-back` ∥ `security-privacy-auditor` (solo lectura); luego `qa-reliability-engineer` como dueño de pruebas críticas | opus ∥ opus; sonnet | V8 | PASS/BLOCKED con evidencia por alcance |
| V10 | Registro | Actualizar bitácora (§13), inventario de `docs/README.md` con su script reproducible, `mem_save` de decisiones | Senior | V9 | Plan y README coherentes con lo ejecutado |

**Criterio de cierre de la Fase A:** cada paso con comando y resultado reales; todo fallo o comando no ejecutado queda abierto en §13. F6 no empieza hasta cerrar §7 o hasta que la persona usuaria acepte por escrito los residuos.

---

## 7. FASE B: cierre de hallazgos (se ejecuta dentro de V8)

Regla general: **prueba RED que reproduce → un solo escritor → `reviewer-back` → `security-privacy-auditor` → QA**. Migraciones aplicadas nunca se reescriben: se añaden migraciones correctivas nuevas (`backend/supabase/migrations/<timestamp>_<slug>.sql`).

| ID | Escritor | Paths permitidos | Aceptación (debe probarse) |
| --- | --- | --- | --- |
| B1 | `backend-data-engineer` | nueva migración correctiva; `backend/supabase/tests/**`; `backend/test/integration/inert-user-cleanup.integration.ts` | Bloquear `auth.users` antes de revalidar la cuenta; con dos conexiones y barreras explícitas (`pg_blocking_pids`, sin `sleep`) una cuenta viva no se borra. Diseño de la prueba ya propuesto por QA (EQ1 en la bitácora previa): psql persistente, límites y cleanup acotados |
| B2 | `solution-architect` primero (contrato de config) y luego `dev-back` | `backend/src/config/env.ts`, `backend/src/config/env.test.ts`, `backend/src/composition-worker.ts`, `backend/src/worker.ts`, fixtures `backend/src/test-support/**` | `ApiConfig`/`WorkerConfig` separados con parsers explícitos; el worker arranca sin service_role/CSRF/HMAC/webhook/borde de API; `parseEnv` de API y `server.ts` se preservan |
| B3 | `dev-back` | `donor-records-service.ts` y sus tests | Si Auth aplica el email y se pierde la respuesta: revocar sesiones/refresh; errores seguros; no devolver éxito si la revocación falla |
| B4 | `backend-data-engineer` | nueva migración correctiva (tras B1) + pgTAP/integración | Serializar sede/crear/desactivar; replay original y rechazo 422 consistentes; prueba de concurrencia real |
| SP-04 | `backend-data-engineer` | nueva migración + regresión QA acotada | Replay tras reasignar admin A→B no expone la alta de A ni genera email; replay autorizado conserva el DTO |
| SP-01 | `solution-architect` (**solo ADR propuesto**) | un ADR nuevo en `docs/decisions/` marcado «Propuesto» | Barrera por generación/sesión capturada antes de Auth, enforcement Express + RPC + RLS, sin `iat`, sin ampliar `service_role`. **No se acepta ni implementa sin decisión de la persona usuaria**; luego revisión independiente |
| P-12 | `solution-architect` (opciones) → decisión usuaria → `backend-data-engineer`/`dev-back` | ADR-006, ADR-003, `AuthAdmin` | Presentar: (a) ampliar `AuthAdmin` con borrado de cuentas, (b) DEFINER de `postgres` equivalente; impacto en allowlist y purgas (`reclamada_incompleta` > 30 días, inertes > 24 h, eliminación V15). Implementar solo tras OK y con auditor de seguridad |

---

## 8. FASE C: F6 `invitation-coordination` y FASE D: F8 `legal-information` / `recognition-policies`

### 8.1 F6 (camino crítico; empieza solo cuando §6–§7 cierren)

Autoridad: spec F6 `…especificacion-faltante-backend.md:1524–1697` y `docs/plans/2026-10-20-invitation-coordination.md`. La matriz RBC es **académica**, no elegibilidad (PASS clínico solo documental/sintético; uso real BLOQUEADO).

Prerrequisitos:
- **C0 (arquitectura):** `solution-architect` reconcilia P-11 (payload de dos tokens vs consumidor de uno, replay/409/410, orden de locks, eventos de outbox viejos, allowlist RPC) y propone contrato; la persona usuaria decide.
- **C1 (clínico):** `clinical-safety-reviewer` re-revisa el código F6 existente y la copia; no se añade filtro post-donación ni intervalos (RF-PRO-05). La skill `save-a-life-matching-notifications` tiene texto obsoleto sobre bloqueos/fecha de donación: tratarlo como hallazgo documental, no como requisito.

Slices (cada uno con su flujo de §5.4, un escritor, ≤ 5 archivos salvo SQL):

| Slice | Contenido | Escritor | Gates |
| --- | --- | --- | --- |
| F6-2 | Migración `<ts>_invitation_coordination.sql`: `app.rbc_compatibility` (27 filas) con prueba de paridad TS↔SQL; `app.haversine_m` (paridad ≤ 1e-6 m); `app.invitation_batches`, `app.invitations` (ejes `validity`/`delivery`/`response`, `unique(need_id,donor_id)`, `unique(need_id,need_donor_code)`, índice `(donor_id,created_at)`), `app.invitation_response_history` append-only. pgTAP | `backend-data-engineer` | reviewer-back, security, QA |
| F6-3 | `api.request_invitation_batch` (DEFINER, un solo tx: autorización admin+aal2+membresía, `for update` de la necesidad, idempotencia, candidatos por radio incluido, cuota 3/24 h con `pg_advisory_xact_lock`, outbox sin destinatario, auditoría), `api.respond_invitation_by_token`, `api.change_own_invitation_response`, lecturas, `api.retry_invitation_delivery` (superadmin + step-up) | `backend-data-engineer` | reviewer-back, security, clinical (copy neutral de instrucciones), QA (carreras) |
| F6-4 | Cascadas: reemplazos de `transition_own_need`, `update_own_participation`, `worker_expire_needs`, `list/get_own_need(s)` con `confirmedIntentCount`, `worker_record_attempt`/`ingest_email_event` actualizan `invitations.delivery` | `backend-data-engineer` | reviewer-back, QA |
| F6-5 | Módulo TS `backend/src/modules/invitation-coordination/{application,http,infrastructure}` (puertos, servicio, gateway RPC, router de las 10 ops), registro en `composition.ts`, Bruno `bruno/backend/invitation-coordination/**` | `dev-back` | reviewer-back, security, QA |
| F6-6 | Semilla de 500 donantes sintéticos + prueba PER-02 (p95 < 2 s, 5 concurrentes) | `qa-reliability-engineer` | reviewer-back |

Pruebas obligatorias de F6: las 64 parejas, Haversine con borde `distance == radius`, `batchSize` 1/2/3/25/26/50 → 5/5/6/50/50/50, ranking mixto; pgTAP de aislamiento entre hospitales/donantes y cuota; integración con 2 lotes concurrentes, 20 respuestas con el mismo token → un efecto, última plaza en carrera → un solo `meta_alcanzada`, outbox `cancelado` al cerrar. Los textos de plantilla y de «instrucciones» pasan por `clinical-safety-reviewer`; urgencia y reconocimientos **no** influyen.

### 8.2 F8: `legal-information` primero, `recognition-policies` después

Autoridad: spec F8 `…:1788–1835` (V16: contenido legal versionado por migración, sin endpoint de gestión; mientras esté en `borrador` se muestra el aviso neutral), ERS RF-LAB-01 (~549) y RNF-LGL-01 (~977), §7.5 de la ERS, Anexo A fila `getDonationWorkInformation` (línea 2088): `GET /api/v1/legal-information/donation-work`, sin auth/CSRF, 200 `{status: borrador|aprobado|retirado, version ≤40, notice ≤500, content? ≤5000|null, sources?[{title,url,article?,checkedAt}]}`, 404/500.

**Etapa 1: investigación (solo lectura; puede correr en paralelo con la Fase A)**

- Tarea **L0**: agente `general-purpose` (sonnet) con Firecrawl sobre fuentes oficiales (leyes.congreso.gob.pe, SPIJ/El Peruano).
- Entregable: tabla en `docs/plans/2026-10-21-legal-information.md` con: norma, artículo, URL oficial, **fecha de consulta**, cita literal corta, vigencia (modificaciones, derogaciones, reglamento), y «límites: lo que NO dice». Debe verificar las dos normas que cita la ERS (Ley N.° 26454 «donación voluntaria y gratuita de sangre humana» y Ley N.° 27282, «capítulo II: donación de sangre, constancia y permiso laboral»), confirmar que existen tal como se citan y buscar reglamentos o normas posteriores.
- Prohibido: concluir derechos laborales o dar asesoría legal; solo reunir y citar. Marcar lo que debe validar un abogado peruano.

**Etapa 2: construcción (TDD; tras las aprobaciones de §11)**

| Slice | Contenido | Escritor | Gates |
| --- | --- | --- | --- |
| L1 Contrato | Añadir `x-ratification` a `getDonationWorkInformation` en `docs/openapi.json`; luego `npm run openapi:lint`, `npm run openapi:types`, `npm run openapi:api:check`, `npm run test:contract` | `solution-architect` propone texto; `dev-back` edita | reviewer-back |
| L2 Datos | Migración `<ts>_legal_information.sql`: `app.legal_information(version text pk, status check in (borrador,aprobado,retirado), notice text ≤500, content text ≤5000 null, sources jsonb, reviewer_role text, reviewed_at timestamptz, created_at)`; semilla `0.1-borrador`, `content` nulo, aviso neutral; función de lectura `api.*` **SECURITY INVOKER** (ADR-003) con grant mínimo para el rol anónimo/autenticado; escritura denegada a roles de la aplicación; sin `service_role`. pgTAP: estados, límites, semilla, inmutabilidad | `backend-data-engineer` | reviewer-back, security |
| L3 Módulo | `backend/src/modules/legal-information/{domain,application,http,infrastructure}` (plantilla: `privacy-requests`/`donor-records`): dominio puro `project(row)` — `content` solo si `aprobado`; `borrador` → `notice`; `retirado` → aviso de retiro; `sources` según decisión §11-4; router público; registro en `backend/src/composition.ts` | `dev-back` | reviewer-back, security |
| L4 Pruebas | Unitarias de proyección en los 3 estados (más ausencia de fila → 404 coherente con el contrato), integración, Bruno `bruno/backend/legal-information/**` | `qa-reliability-engineer` | reviewer-back sobre las pruebas |
| L5 Gates | `reviewer-back`, `security-privacy-auditor` (endpoint público: sin PII, límites de tasa, sin enumeración), `clinical-safety-reviewer` (copia del aviso) | — | **La revisión de un abogado peruano es humana y externa**: el módulo nunca se marca `aprobado` desde código |

Invariantes de `legal-information`: no contiene datos de donantes; sin afirmaciones de cumplimiento legal; el segmento es común e independiente de hospital, invitación, reconocimiento y respuesta; la plataforma no emite constancias ni decide permisos.

**Segundo slice de F8 (`recognition-policies`, 6 operaciones):** `getOwnRecognitionPolicy`, `publishOwnRecognitionPolicy`, `withdrawOwnRecognitionPolicy`, `listPublishedRecognitionPolicies`, `listRecognitionPoliciesForModeration`, `moderateRecognitionPolicy`. Reglas en la spec `:1799–1832` (ítems `refrigerio|diploma|pin`, `expectedVersion`, 409 si obsoleta o `suspendida`, `moderateRecognitionPolicy` solo `publicada→suspendida` y `suspendida→sin_publicar`, prueba de aislamiento: ningún archivo de `modules/invitation-coordination/` importa `recognition-policies`). Requiere su propia ratificación y se hace tras L5.

---

## 9. FASE E: ordenar y limpiar documentos (solo docs; nada se borra sin OK)

Plan de ejecución: `docs/plans/2026-10-21-limpieza-docs.md`. Agente: `general-purpose` haiku para inventario; `dev-back`/Senior para editar; revisión independiente del diff.

| ID | Paso | Detalle |
| --- | --- | --- |
| D1 | Inventario (solo lectura) | Para cada archivo de `docs/` y `docs/plans/`: tamaño, fecha, estado, **enlaces entrantes** (buscar en `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/**`, `.opencode/**`, ADRs) y si fue superado |
| D2 | Clasificar | Conservar / consolidar en `docs/plans/HISTORIAL.md` / eliminar. Candidatos a revisar: `2026-10-04-backend-inside-out.md`, `2026-10-12-plan-maestro-backend-ocho-capacidades.md` (903 líneas), `2026-10-12-identity-institutions.md`, `2026-10-13-{need-records,email-delivery,donor-records,identity-tokens,decisiones-backend}.md`, `2026-10-16-analisis-estado-proyecto.md`, `2026-10-16-diagramas-uml-arquitectura.md`. Los planes de auditoría/ejecución del 2026-10-20 se consolidan **después** de la Fase A |
| D3 | **Compuerta de aprobación** | Presentar a la persona usuaria la tabla archivo por archivo (acción, motivo, enlaces que rompe). **No borrar nada hasta su OK explícito** |
| D4 | Ejecutar | Consolidar resumen en `HISTORIAL.md`; corregir enlaces; `git rm` de lo aprobado (el historial de git conserva todo); actualizar `docs/README.md` (mapa e inventario) y el mapa de `CLAUDE.md` solo si cambia; `git diff --check`; commit `docs:` atómico |

**Intocables:** `docs/1_Primeros_Alcances.md`, `docs/2_Especificaciones_De_Software.md`, `docs/openapi.json`, `docs/Api-Rules.md`, `docs/Backend-Contracts.md`, `docs/decisions/*`, `docs/pending/*`, `docs/Memory-Project.md`, `docs/plans/2026-10-12-especificacion-faltante-backend.md` y `…api-backend-completo-incremental.md` (los cita `CLAUDE.md`), y todo lo de frontend/mock (`docs/Frontend-*.md`, planes `*frontend*`): es trabajo de los compañeros.
**Fuera de alcance:** `.pi/`, `.claude/skills/`, `.opencode/`.

---

## 10. FASE F: conexión con el frontend (**CONGELADA**)

- No se modifica `frontend/` ni `apps/web`; no se escribe cliente HTTP, guard de sesión, E2E contra backend ni se mueven rutas, hasta que la persona usuaria diga explícitamente «implementa la conexión».
- Lo que el backend deja listo mientras tanto: contrato OpenAPI estable y generado, pruebas Bruno contra el backend real y `ALLOWED_ORIGINS` documentado para `http://127.0.0.1:5174` (el proxy de `frontend/vite.config.ts` apunta a `http://127.0.0.1:3000`).
- Cuando se confirme se abre un plan propio que incluya: cliente HTTP, guard de `/donante/*`, login real/MFA/step-up, páginas por fragmento de token, paginación y `Retry-After`, estados de carga/error/conflicto, E2E contra backend (F9), y coordinación con la rama de los compañeros.

---

## 11. Aprobaciones que necesita la persona usuaria (compuertas)

| # | Para qué | Qué se aprueba | Bloquea |
| --- | --- | --- | --- |
| A1 | Cerrar Fase B | Correcciones B1–B4 y SP-04 (ya autorizadas en espíritu; confirmar al presentarlas) | F6 |
| A2 | SP-01 | Aceptar el ADR propuesto (barrera por generación/sesión) antes de cualquier cambio de auth/RLS | F6 |
| A3 | P-12 | Elegir (a) ampliar `AuthAdmin` o (b) DEFINER equivalente; actualizar ADR-006 y ADR-003 | Borrado de cuentas, datos reales |
| A4 | P-11 | Contrato F6 reconciliado (tokens, replay/409/410, locks, outbox, allowlist) | F6-2 en adelante |
| A5 | Ratificar `getDonationWorkInformation` | Añadir `x-ratification` (recomendado: solo esta operación primero) | L1 |
| A6 | Modelo de datos | `app.legal_information` tal como en la spec | L2 |
| A7 | Copia del aviso (≤ 500 car.) | Propuesta: «Información sobre constancia de donación y permiso laboral en Perú pendiente de validación profesional. Esta plataforma no emite constancias, no decide permisos ni garantiza su concesión.» | L2 |
| A8 | `sources` en `borrador` | Recomendado: guardarlas en BD y devolverlas solo en `aprobado` | L3 |
| A9 | Revisor legal | Quién es y cómo se registra (`reviewer_role`, `reviewed_at`) cuando llegue el momento | Pasar a `aprobado` |
| A10 | Auditoría del contenido legal | RNF-AUD-01 lo menciona; decidir si se audita o basta migración con revisor/fecha | L2/L5 |
| A11 | Borrado de docs | Tabla archivo por archivo de D3 | D4 |
| A12 | Cierre de cada módulo | Confirmación final por módulo | Commit/merge del módulo |
| A13 | Frontend | «Implementa la conexión» | Fase F |

---

## 12. Comandos de referencia (desde la raíz del repo)

```bash
SCARF_ANALYTICS=false npm ci            # solo si faltan dependencias
npm test                                # vitest en todos los workspaces
npm run test --workspace backend -- src/modules/<mod>/<archivo>.test.ts -t "<nombre>"   # prueba única
npm run test:backend:dto                # validadores DTO
npm run test:backend:db                 # pgTAP (supabase start --workdir backend)
npm run test:backend:integration        # Supabase local (resetea + siembra)
npm run test:bruno:backend              # Bruno contra el backend real (bruno/backend/**)
npm run test:bruno                      # Bruno contra el mock
npm run test:contract                   # Prism + Ajv (puede colgarse; usar timeout)
npm run test:api:generator              # node:test del generador
npm run openapi:lint | openapi:types | openapi:api:check
npm run typecheck | lint | build
npm run dev:backend | dev:worker        # backend real :3000 y worker de outbox
```

No ejecutar `npm run test:e2e` aquí (es de la demo y exige parar `npm run dev`). Los archivos generados de contrato no se editan a mano: editar `docs/openapi.json`, luego `openapi:lint`, `openapi:types` y re-ejecutar contrato/Bruno.

---

## 13. Tablero y bitácora (actualizar tras cada asignación, resultado, revisión, prueba o decisión)

**Estados permitidos:** `Pendiente`, `En progreso`, `Bloqueada`, `Completada`.

| ID | Descripción | Estado | Agente | Veredicto de gate | Evidencia / commit |
| --- | --- | --- | --- | --- | --- |
| V0–V6 | Verificación baseline | Completada | Senior | n/a | `docs/plans/2026-10-21-verificacion-backend.md` (V4 y V5 con una corrida fallida previa; ver plan) |
| V7 | Contrato Prism + Ajv | Completada | Senior | n/a | Inventario del runner actualizado (510 errores, 617 casos); 72/72 |
| V8 (B1, B2, B3, B4, SP-04) | Correcciones | Completada | subagentes sonnet | reviewer-back PASS; security **pendiente** | `docs/plans/2026-10-21-verificacion-backend.md` |
| V8 (SP-01, P-12 V15) | Seguridad | Completada | subagentes sonnet | reviewer-back PASS; security PASS | `a9193aa`, `c4aab53`; purgas del worker siguen abiertas |
| V9 | Gates independientes F5/F7 | Completada (clinical pendiente) | subagentes opus | F5 PASS, F7 PASS tras documentar el 409 (`c864044`); security PASS | clinical-safety-reviewer no ejecutado |
| C0, C1 | Reconciliar P-11; gate clínico | Pendiente | — | — | — |
| F6-2 … F6-6 | Slices F6 | Bloqueada (A4; Fase A/B cerrada salvo purgas del worker) | — | — | — |
| L0 | Investigación legal | Pendiente (puede iniciar ya) | — | — | — |
| L1 … L5 | legal-information | Bloqueada (A5–A8, F6) | — | — | — |
| F8-RP | recognition-policies | Bloqueada (L5, ratificación) | — | — | — |
| D1–D4 | Limpieza de docs | Pendiente (D3 espera A11) | — | — | — |
| Fase F | Frontend | Congelada | — | — | — |

| Fecha | Agente / paso | Resultado, evidencia y siguiente paso |
| --- | --- | --- |
| 2026-10-21 | Senior / redacción | Plan creado; sin ejecución ni cambios al repositorio |
| 2026-10-21 | Senior / Fase A | V0–V7 ejecutados y V1 clasificado: B1–B4, SP-01, SP-04 y P-12 siguen abiertos. V8/V9 esperan A1–A3. Detalle en `docs/plans/2026-10-21-verificacion-backend.md` |

---

## 14. Riesgos y notas

- `test:contract` (Prism) ya se colgó en este entorno: puede quedar «no verificado»; no se debe afirmar PASS sin ejecución real.
- Los runners de integración/Bruno **destruyen y re-siembran** la BD local: solo contra Supabase local y con confirmación previa del destino.
- SP-01 y P-12 requieren decisión de seguridad de la persona usuaria; sin ella F6 sigue bloqueada y el derecho de eliminación incompleto (no operar con datos reales).
- Contenido legal: sin abogado el módulo permanece en `borrador` (comportamiento correcto según RNF-LGL-01); ninguna etapa de este plan acredita cumplimiento legal ni clínico.
- Documentos de octubre contienen afirmaciones desactualizadas (README/Backend-Contracts/JSON heading); si un conteo contradice el script reproducible de `docs/README.md`, prevalece lo ejecutado.
- Engram: usar la identidad oficial `save-a-life-oficial`; no fusionar ni borrar historiales anteriores.
- Los planes de otras tareas no se sobrescriben; este archivo (`Backend-Route.md`) es el tablero de la ruta, y cada fase abre su propio plan fechado `docs/plans/YYYY-MM-DD-<slug>.md`.
| 2026-10-22 | Senior / Fase A y B | V7–V9 cerradas; SP-01 (ADR-007) y P-12 (a) implementados y commiteados; ver `2026-10-21-verificacion-backend.md` |

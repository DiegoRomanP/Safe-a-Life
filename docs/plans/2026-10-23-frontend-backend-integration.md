# Plan: integración frontend–backend por módulos

Fecha: 2026-10-23. Rama: `feat/frontend-backend-integration`.
Estado: **Smoke Playwright no ejecutado por MCP del hijo detenido; T3 bloqueada y T14 pausada. Handoff guardado para compactación nativa antes de continuar**. Primaria MCPready25 no implica conexiónworker; no navegador/producto verificados ni nuevos cambios. Senior solo coordina.
Seguimiento canónico: [odd/tasks/frontend-backend-integration.md](../../odd/tasks/frontend-backend-integration.md), T1–T14.
La solicitud literal S1–S5 y las autorizaciones acotadas S6/S7 están en ese documento. No se reemplazan planes anteriores.

## Objetivo y límites

Conectar las vistas de `frontend/` al backend real de `backend/`, paso a paso,
con Luna 6 como escritor y revisión independiente antes del siguiente slice.
La solicitud actual levanta la congelación de integración de
[Backend-Route.md](Backend-Route.md), no las decisiones abiertas de otros módulos.

- Conservar Node/Express, Supabase y Resend y los ADR vigentes.
- Consumir los contratos existentes de `docs/openapi.json`; no inventar endpoints.
- `apps/web` y `apps/mock-api` siguen como demostración separada: no son el destino de esta integración.
- No migraciones, cambios de RLS, nuevos módulos backend, dependencias, hosting,
  eliminación de archivos, secretos, push, PR ni merge dentro de este primer alcance.
- Si conectar exige alterar contratos/arquitectura: consulta read-only a
  `pi-solution-architect` antes de escribir; cambios de decisiones aprobadas vuelven a la persona usuaria.
- Solo datos sintéticos. No afirmar cumplimiento legal ni aptitud clínica.

## Autorización acotada de entorno de pruebas (T14)

La persona usuaria eligió **«Autorizar entorno local descartable»**: permite preparar
solo dentro de este proyecto una instancia Supabase independiente y fixtures nuevos
(técnicos y sintéticos), sin modificar/resetear la base actual, instalar paquetes,
cambiar configuración global ni contratos backend. Se aplican las migraciones
vigentes únicamente a la base nueva; no se editan migraciones productivas.

Autorización adicional S7: **«Autorizar imágenes oficiales fijadas»**. Solo pueden
descargarse las imágenes oficiales Supabase necesarias que falten, fijando versión
y digest antes de descargarlas. No permite paquetes npm/OS, actualizar la CLI,
cambios globales, tocar la base actual ni ampliar ADR-006. El intento fallido se
conserva; no hay otro arranque antes de corregir y revisar sus hallazgos.

T14 precede a la aceptación runtime de T3, no a corregir sus defectos ya
reproducidos por tests revisados. Un único backend-data-engineer prepara el entorno; reviewer-back
y security-privacy-auditor revisan inmediatamente sus artefactos de setup y controles
de aislamiento. QA verifica después el flujo público con credenciales de test nuevas.
No se convierte la indisponibilidad anterior en un PASS. La corrección de login y
los nuevos tests de incertidumbre siguen pendientes de sus propios gates.

Allowed edit surfaces del único writer T14:
- `.playwright-mcp/frontend-backend-fixture/**` (directorio nuevo, realpath confinado
  al root y confirmado ignorado por `.gitignore:17`; solo configuración/SQL copiado,
  helpers efímeros de setup, metadatos públicos, README y credenciales test-only
  protegidas con permisos owner-only; nada de ese directorio se stagea/commitea).
- Las migraciones copiadas deben coincidir con las vigentes en backend/supabase;
  jamás se edita el origen ni se ejecuta el runner compartido que resetea la base.
- No source/tests/contratos/config productiva, root .env, backend/.env, globales,
  otros contenedores/volúmenes/proyectos o árboles de skills.

Los secretos del fixture son nuevos, test-only y nunca se imprimen/commitean.
El resto de exclusiones del alcance inicial sigue vigente.

### Reparación T14 por etapas

**PAUSADA por S9.** Este plan queda conservado, no se ejecuta. El prep entregado no
recibió review independiente: gate pendiente, nunca PASS. S8 prohíbe acceder a Docker,
incluidas consultas, pulls, status, start/stop y otros sockets. No se retoma sin decisión humana.

1. Preparación estructural pequeña por backend-data-engineer, solo
   `.playwright-mcp/frontend-backend-fixture/attempt-02/**`: copia derivada, raíz/imports
   correctos, main directo sin efectos al importar y seams explícitos no-arranque.
   El original no se puede importar como RED seguro porque ejecuta bootstrap;
   no se corrigen aún los comportamientos auditados ni se exporta el bootstrap.
2. Review backend/seguridad inmediato del prep; QA es único autor de tests Auth/guardas,
   obtiene RED por los seams públicos seguros y recibe review independiente antes del corefix.
3. Corefix por único backend-data-engineer, GREEN y re-reviews antes de cualquier arranque.
   Alta mediante signUp anon permitido, sin ampliar ADR-006; datos de dominio solo nuevos.
4. Fijar endpoint y daemonID seleccionados, lista oficial de imágenes/digests y namespace
   nuevos. No asumir socket, localidad o un pin ausente; no pulls adicionales/CLI upgrade.
5. Un intento controlado solo al resolver los hallazgos; journal sanitizado y contención
   acreditada. QA verifica aislamiento/readiness y luego cookies reales de T3.

El árbol/metadata/red del intento anterior se conserva. Prep/import/self-test no son
readiness. Un digest de contenedores no prueba contenido de datos de la base original.

## Evidencia y mapa de capacidades

| Capacidad | Backend observado | Frontend observado / conexión |
| --- | --- | --- |
| Transporte | `backend/src/app.ts`, `shared/http`, health | `frontend/vite.config.ts` ya hace proxy a 3000; falta cliente HTTP |
| Identidad F2a | `identity-institutions/http/auth.router.ts` | Login, VerifyIdentity y layouts sin sesión real |
| Tokens F2b/F5 | `action-tokens.router.ts`, `donor-records.router.ts` | Recuperación, invitación admin, registro, activación y correo con vistas demo |
| Donantes F5 | `donor-records/http/donor-records.router.ts` | `DonorDemoContext.tsx`, onboarding y perfil |
| Necesidades F3 | `need-records/http/needs.router.ts` | `HospitalDemoContext.tsx`, necesidades, detalle y resumen |
| Instituciones F2a | `identity-institutions/http/institutions.router.ts` | Hospitales, sedes, admins, tareas/configuración/auditoría del superadmin |
| Altas asistidas F5 | `donor-records/http/donor-records.router.ts` | Hospital AssistedSignupsPage |
| Privacidad F7 | `privacy-requests/http/privacy-requests.router.ts` | Solicitudes del donante y revisión/ejecución del superadmin |
| Invitaciones/matching F6 | Solo `invitation-coordination/domain/`; sin router montado | Invitaciones, historial, respuestas y lotes NO conectables aún |
| Información legal/reconocimientos F8 | No aparece en la composición | No fabricar lecturas ni escrituras exitosas |

El código y el contrato se contrastan antes de cada slice: los README conservan
descripciones históricas como «frontend sin vistas». No se toma ese texto como
prueba de ausencia de las vistas que sí existen.

## Modelo y disponibilidad de delegación

- ID confirmado por `pi --list-models luna`: **`openai-codex/gpt-6-luna`**.
- La persona usuaria autorizó migrar **solo la configuración local de todos los
  perfiles** a Gentle Pi y Luna/max; ver [migración local](2026-10-23-local-gentle-pi-migration.md).
- Delegación objetivo: `subagent_list_agents` y `subagent_run` nativos, IDs pi-*.
  Todos los escritores, reviewers y especialistas usan Luna/max en sesiones
  independientes. Senior sigue siendo el primario y nunca un hijo.
- El host actual ya adoptó el puente local y descubre los 11 workers permitidos.
  El smoke test previo completó una tarea read-only de pi-dev-frontier (Engram 1757).
  Antes de T3 se verifica independientemente la preparación y se contrasta el
  contrato de sesión. No se confunde una declaración local con telemetría del modelo efectivo.
- No se instala pi-open-agents ni se guardan rutas/perfiles globales. Los perfiles
  activos pueden prevalecer sobre el archivo; comprobar la ruta efectiva del
  inventario antes del lanzamiento y reportar desajustes.

## Orden de ejecución y aceptación

Todas las filas de escritura tienen un único autor y se ejecutan **en serie**.
Cada slice acompaña comportamiento con sus pruebas/docs y se subdivide si supera
aproximadamente 400 líneas autoradas. No se paralelizan contratos ni contextos compartidos.

| Tarea | Alcance permitido principal | Aceptación y dependencia |
| --- | --- | --- |
| T1–T2 | Este plan y documento ODD | Inventario reproducible, rama fuera de main, tareas/espejo existentes |
| T14 | `.playwright-mcp/frontend-backend-fixture/**`, solo artefactos de setup de test ignorados | Instancia/cuentas nuevas, puertos/proyecto distintos, credenciales protegidas, base actual intacta; prerequisito autorizado de T3 |
| T3 | `frontend/src/lib/api/**`, `frontend/src/features/auth/session/**`, LoginPage y tests asociados | Petición real de login → sesión observable; CSRF en memoria; error no se presenta como éxito; sin mocks de respaldo |
| T4 | Session anterior, VerifyIdentityPage, StepUpPanel, layouts y `app/routes*.tsx` | Restaurar sesión y autorizar ruta por rol/AAL; MFA y step-up reales; expirar sesión sin mostrar datos previos; depende de T3 |
| T5 | RegisterPage, ActivateAccountPage, VerifyEmailPage, ConfirmEmailChangePage, `useFragmentToken*` y adaptador API de auth | Leer/limpiar token antes de exposición; preview no consume; confirmar consume solo al enviar; registro y errores públicos seguros; depende de T3 |
| T6 | RecoverAccessPage, ResetPasswordPage, AdminInvitationPage y adaptador API de auth | Recuperación/restablecimiento/reclamo reales sin filtrar existencia de cuentas ni duplicar consumos; depende de T4 |
| T7 | `frontend/src/features/donor/**` (solo onboarding/perfil), adaptador API del donante | Datos propios; persistencia mediante API; disponibilidad solo cambia después de éxito; no exponer coordenadas exactas; depende de T4–T5 |
| T8 | `frontend/src/features/hospital/**` (necesidades/sedes/resumen), adaptador API del hospital | Listar/crear/consultar/transicionar necesidad propia y elegir sede real; mantener intención y estado ante fallo; depende de T4 |
| T9 | AssistedSignupsPage, componentes específicos y adaptador API correspondiente | Crear/listar/consultar alta y reemitir enlace según contrato, sin simular envío exitoso; depende de T5,T8 |
| T10 | `frontend/src/features/superadmin/**` (instituciones/admins/tareas/config/auditoría), adaptadores específicos | Operaciones disponibles persistidas; scope y membresías reales; confirmación explícita para mutaciones sensibles; depende de T4,T6 |
| T11 | RequestsPage/NewRequestPage del donante, RequestsPage/RequestDetailPage y StepUpPanel del superadmin, adaptador de privacidad | Listas propias, decisiones explícitas, grants acotados y ejecución con step-up; eliminación es irreversible y exige confirmación expresa en UI; depende de T7,T10 |
| T12 | Contextos demo/layouts y vistas de capacidades no implementadas afectadas | Flujos integrados sin fallback demo; F6/F8 muestran indisponibilidad honesta sin POST falso; depende de T7–T11 |
| T13 | Tests de aceptación/browsers y documentación de esta integración | Veredictos por S#, pruebas de roles/errores y cobertura real documentada; depende de T3–T12 |

En T5, la limpieza temprana de fragmentos respeta los enlaces ya existentes; no
se cambia su formato. En T8, no se implementan lotes/respuestas F6 ni se presenta
activar una necesidad como envío ya efectuado.

## Contrato del primer slice (T3)

**Rol:** `pi-dev-frontier`. **Modelo:** el de su perfil Luna 6. Sin otros escritores.
**Spec:** leer `odd/tasks/frontend-backend-integration.md`, T3, S1/S3/S5,
hasta `## Log`; este plan concreta los límites operativos, no sustituye la solicitud.

### Acceptance fixed after the read-only map

- Login calls `POST /api/v1/auth/sessions` with `{email,password}` and a fresh
  `Idempotency-Key` for each explicit submission (16–255 chars); no automatic retry.
  Cookies use same-origin fetch, no-store and no-referrer. Password bounds follow
  the existing 12–128 contract. `GET /api/v1/auth/csrf-token` bootstraps the token
  after a successful login; token and session state stay only in memory.
- Expose a locally verified session only after login and CSRF bootstrap succeed.
  Initial/pending and failed/ambiguous attempts have **no locally verified session**,
  not a proven server logout. A rejected re-login, network/parse/DTO failure or failed
  CSRF bootstrap may retain a prior/new HttpOnly server session. State this uncertainty
  explicitly in UI and docs; discard trusted local payload, never show role/demo data
  or successful access on failure. Do not auto-logout, clear HttpOnly cookies in JS,
  restore via GET/session early, or add backend endpoints. T4 owns restoration/guards.
  Keep pending/unverified announcements accessible and prevent duplicate submits.
  Warning text chosen by QA's RED: «Este intento no verificó la sesión localmente.
  Puede quedar una sesión activa en el servidor.» It must not be mistaken for a
  verified-success or logout claim.
- **No role navigation in T3.** Existing panels are unguarded demos; T4 owns
  restore/role/AAL guards, enrollment, MFA and step-up. T3 reports that the session
  is established without rendering donor/hospital/superadmin demo data as live.
- Do not import generated backend types into the frontend runtime or change
  OpenAPI. Use minimal DTO types matching the implemented auth router/service.
- The reload/MFA challenge gap is documented for T4: current-session DTO lacks
  `mfaChallengeId`; the existing contract requires a new login to obtain it.
  Do not silently invent a challenge endpoint or a backend contract extension.

### Allowed edit surfaces
- `frontend/src/lib/api/**`
- `frontend/src/features/auth/session/**`
- `frontend/src/features/auth/pages/LoginPage.tsx`
- `frontend/src/features/auth/pages/LoginPage.test.tsx`
- `frontend/src/features/auth/components/LoginForm.tsx`
- `frontend/src/features/auth/components/LoginForm.test.tsx`
- `frontend/README.md`

**No editar:** backend, contrato OpenAPI, generados, demo apps, lockfiles, perfiles
Pi, otros módulos, planes/ODD ni estado Git. Si falta una ruta necesaria, informar
y acotar el siguiente slice, no ampliar por cuenta propia.

**Lecturas previas:** `AGENTS.md`, `docs/Agent-Workflow.md`,
`docs/decisions/ADR-004-sesion-csrf-cors-topologia.md`,
`docs/Frontend-Design.md`, los routers de auth y esquemas concretos consumidos.
Skills con `read`: frontend-ui-engineering, save-a-life-domain,
api-and-interface-design, save-a-life-security-privacy, test-driven-development,
webapp-testing. Paths: `.opencode/skills/<nombre>/SKILL.md`.

**Transporte:** URLs relativas, cookies mediante fetch, sesión/CSRF solo en memoria;
`cache: 'no-store'` y `referrerPolicy: 'no-referrer'`; no loguear URL con token,
body, contraseña, correo, coordenadas ni datos del donante. No Supabase en navegador.
Mutaciones autenticadas usan X-CSRF-Token conforme a ADR-004. No reintentar
automáticamente mutaciones, consumo de token ni operaciones ambiguas.

**Test-first y autoría:** por ser auth/sesión un flujo crítico,
`pi-qa-reliability-engineer` es el único autor de sus pruebas nuevas. Primero
escribe RED dentro de los paths de tests autorizados; `pi-reviewer-front` revisa
ese slice antes de entregar producción a `pi-dev-frontier`. El escritor no
modifica esas pruebas: implementa GREEN y conserva validación/foco previos.
Rechazos no muestran éxito ni estado persistido falso. Después ejecuta tests del
workspace, typecheck y lint. Fetch simulado no demuestra conexión contra
Express/Supabase: esa evidencia se recoge explícitamente. QA verifica después
el comportamiento público y los riesgos de auth/roles; no se autoaprueba.

**Reporte:** S# cubiertos, archivos, comandos y exit codes RED/GREEN, errores,
riesgos y bloqueos. No emitir PASS independiente, no commit/push ni delegación hija.

## Gates y pruebas

1. Inmediatamente después de cada escritor: `pi-reviewer-front`, solo lectura;
   añadir `pi-security-privacy-auditor` por auth/PII/integración.
2. Si se autoriza un cambio backend: `pi-reviewer-back` inmediato; especialistas
   adicionales solo por el riesgo efectivamente tocado.
3. `pi-qa-reliability-engineer` es el único autor de pruebas críticas de roles,
   tokens/email/idempotencia. Sus cambios también reciben revisión de área.
4. Revisor clínico si se modifica comunicación clínica, compatibilidad o
   elegibilidad; no se infieren reglas médicas al cablear DTO existentes.
5. No se marca tarea terminada sin pruebas pertinentes y PASS independientes.
   Si el revisor no puede ejecutarse, se registra pendiente y se detiene ese gate.
6. Commits Conventional Commit en esta rama, por unidad verificada, alrededor
   de 400 líneas, stage explícito y hash registrado en ODD. Nunca push/merge automático.
   Se preservan cambios previos de migración en AGENTS.md y docs/Agent-Workflow.md:
   no se incluyen en commits de integración sin pertenecer al slice.

### Comandos funcionales previstos (todavía NO ejecutados)

```bash
npm run test --workspace @save-a-life/frontend
npm run typecheck --workspace @save-a-life/frontend
npm run lint --workspace @save-a-life/frontend
npm run build --workspace @save-a-life/frontend
npm run openapi:api:check
npm run test --workspace backend
npm run typecheck --workspace backend
```

- Browser real sobre `npm run dev:frontend` (5174) + `npm run dev:backend` (3000),
  no sobre `apps/web`. Comprobar cookies locales, sesión tras recarga, navegación por
  rol, CSRF, teclado/foco, móvil y estados de error sin trazas de datos sensibles.
- Un solo dueño de la BD local. Antes de integración/Bruno: comprobar destino
  aislado y autorización de reset; esos scripts borran/siembran datos. No ejecutar
  contra un entorno remoto ni reutilizar una BD compartida sin permiso.
- Servidores, builds y pruebas largas mediante ejecución en background con evento
  de finalización; no polling ni retry automático tras timeout.
- RDD solo si el switch humano está habilitado, mediante ASSESS/continuación nativa
  al cerrar cada work-unit; nunca reemplaza pruebas funcionales ni gates de área.

## Riesgos y decisiones abiertas

- Seguridad (item 2): cookies, CSRF, AAL2, guards, tokens y grants. Revisión y QA independientes obligatorios.
- Datos irreversibles (item 1) en T11: ejecutar borrado de cuenta; nunca activar por navegación,
  reintento o carga. Tests solo con cuentas sintéticas aisladas y confirmación.
- Contratos compartidos (item 3): comprobar cada DTO; no romper helpers usados por otras vistas.
- F6: su propuesta de reconciliación todavía exige A4; sin router ni persistencia
  de invitaciones no hay conexión real de invitaciones/lotes/respuestas/historial.
  Fuente: `docs/plans/2026-10-22-f6-contrato-reconciliado.md`.
- F8: no hay backend montado. Implementarlo/ratificarlo es otra decisión; no está
  autorizado implícitamente por pedir conectar las vistas existentes.
- Los PASS históricos de frontend demo no aprueban sesión ni autorización productivas.
- No se inventan credenciales de Supabase, cuentas técnicas, dominio Resend ni configuración remota.

## Bitácora

- S11 exige: resultado Playwright → guardar estado/compactar primaria → retomar. Smoke mvlyzom8-1-p6fs no ejecutado: childMCPstopped/0tools, no servidor/contexto/captura/evidencia/archivos; primariaREADY25 constatada. No fallo navegador demostrado ni PASS. No retry/verificador nuevo. Compacción primaria no expuesta como tool; requiere interfaz, resumenEngram no la sustituye. Estado completo/IDs/límites guardados antes de handoff.
- QA smoke mvlyzom8-1-p6fs activo, Luna6/max proyecto, solo evidencia nueva playwright-smoke/**. Intento real de navegador con servidorREADY propio/contextoaislado/login vacío; no runner bloqueado, source edits, Auth/DB/Docker/T14/install/retry. Reportará herramienta/render/cierre por separado, nunca T3done.
- S10 literal: "a ver ahora intenta usar playwright"; luego "ahora creo que lo active". Se conecta MCP playwright lazy/stopped: ready/tools activos, no browserPASS aún. Solo smoke delegado/contexto fresco/origenREADY real/frontenddist/login vacío, sin runner bloqueado/correcciones/credenciales/API/Docker/T14. Todo viejo restaurado desde decisiones actuales; memoria leída se truncaba enL80, archivo completo preservado por páginas. Sin nuevo Completado.
- Front mvlv5a2h-y-dv3v / seguridad mvlv5a3d-z-v3hx **BLOCKED solo artefactos**. Tres Medium: runner35363 no ligado a servidorlisten0/READY; segundo envío pendiente y verbs/order no afirmados; listenersduplicados/consola sinmensajes UNKNOWN/finalomitida. Low: closeerror tragado yBoolean(context) sobreafirma cierre. Predicado final no prueba pagecount/history.360/focovisible/contraste/reducedmotion/screenreader ydeny/SW no establecidos. No defecto/compromiso/fuga confirmado. Reviews readonly; no nueva prueba.
- T3 Bloqueada esperando decisión: delegar corrección pequeña al QA autor y una nueva pasada aislada explícita, o pausar conservando avance parcial. No falsoPASS ni reactivarT14 ni productoWriter. Código previo31/247/build ycode-reviews no se confunden con aceptación real. No Express/cookies/Supabase probados.
- Review artefactos QA readonly: Front mvlv5a2h-y-dv3v, seguridad mvlv5a3d-z-v3hx. Sin comandos/browser/nueva verificación ni T14/product changes. Juzgan diseño/aislamiento/evidencia, no T3done. No se infiere permiso para reintentar: tras gates se presenta una decisión concreta con proof incompleto.
- QA mvlub7ce-x-vkpg **INCOMPLETE**:36 aserciones frontend reportadas;4 capturas consola/2 listeners, mensajes perdidos y conteo no único, una final no ejecutada, sin pageerror ni producto defectuoso confirmado. Selector inicial corregido antes de segunda pasada incompleta; no tercera corrida. Express auth harness no disponible, no cookies/Supabase real. Solo4 artefactos QA, checks syntax0 y limpieza/frozen hashes según autor; requieren review frontend/seguridad readonly.
- ASSESS read-only rechazado sin plan/veredicto/diagnóstico recuperable (serialización Error vacía); no se inventa causa ni tier ni se reintenta/START. No autoridad nativa. Las reviews siguientes no son una nueva prueba funcional ni pueden transformar INCOMPLETE en PASS.
- QA T3 mvlub7ce-x-vkpg activo, proyecto Luna6/max declarado, único escritor de nuevos tests .playwright-mcp/t3-browser-qa/**; producto/frozen tests intactos. Verifica UI real/teclado/responsive/Unicode/CSRF/remonte vía HTTP controlado sin Docker ni T14; opcional Express solo con harness ya disponible/glue mínimo sin DB ni endpoints nuevos, no otro framework. No repite31/247/build. Reporta límites sin T3done; nuevos artefactos pasan review de área/seguridad y cualquier fallo vuelve al escritor frontend. Senior solo coordina.
- S8: "Solo preparar, sin acceder a Docker". S9 literal: "deja la tarea t14 y empieza a vanzar con las tareas t3 delegando subagente para complementar mejor el proceso, tu solo delega y diles que hacer". T14 bloqueada/pausada por la persona usuaria, no dropped/done; no reviews/corefix/QA/start de T14. T3 En progreso solo por subagentes; Senior coordina y registra, no ejecuta producto. QA completará pruebas frontend/navegador aisladas, sin presentar mocks como Supabase real ni avanzar T4.
- Prep mvlqe927-w-bxwa ya entregó solo attempt-02/setup/config/README con checks estructurales reportados0; primer smoke1 por instrumentación ESM lector, luego detector corregido. Ninguna metadata/credencial/env/migración; core inseguro intacto. Back/Security pendientes por pausa explícita, no PASS ni readiness. No se usa ese helper para T3.
- Prep writer mvlqe927-w-bxwa activo, solo attempt-02/**, namespace a2/puertos propuestos5544x, no corefix ni recursos. Checks syntax/import-umask/selftest después de preparación; sin backendruntime/Docker. QA será único autor de tests antes corefix; Back/Security inmediatos al retornar. Endpoint/daemonID aún sin selección, ningún pull/start.
- Mapa mvlpsozs-v-iogf adoptado: prep seguro antes de RED, helper original no-importable/ejecutable, candidato solo attempt-02; luego QA/corefix/reviews. Signup anon existente permite evitar excepciónADR006 y sembrar roles nuevos bajo S6. Endpoint/daemonID aún no seleccionados, no arranque/pulls. No PASS/readiness del arquitecto.
- Arquitecto readonly mvlpsozs-v-iogf delimita seam seguro de tests (helper actual no-importable) y alta anon sin excepciónADR006 antes de escribir T14. No comandos/Docker/import/privateenv/phase ni readiness. Futuro candidato solo attempt-02/**, viejo árbol/red intactos; evitar framework/proxy y corefix sin RED seguro. T14 En progreso, ningún writer/pull/start activo.
- Front mvlp6wjg-t-lydu y seguridad mvlp6wkz-u-t680 **PASS solo código T3**, cierran carrera mismo runtime: operación compartida/memoria antes de release/estado observable tras remonte, sin cola ni rollback falso. Parent31/247/build0 ya observados aunque reviewers no conocían todos los recibos. T3 vuelve Pendiente por aceptación/cookies dependiente de T14; T14 En progreso para reparar. No nuevo Completado ni arranque. Auditor llamó por error la fase UI, sin otros efectos; parent restablece su propia fase y prohíbe repetición.
- Job4 lint/build **exit0/24s** incluye typecheck. Comparación con snapshot: auth.ts unchanged=true, LoginForm Unicode unchanged=true; inventario untracked completo e índice sin staging. Focal31/suite247 ya GREEN, no se repiten. Front/seguridad aún pendientes, T3 no completa ni runtime probado; T14 pendiente.
- Parent suite actual **exit0,39 archivos/247 pruebas**,14.77s; focal31 ya GREEN. No se repite ninguno sin cambios. Front mvlp6wjg-t-lydu/seguridad mvlp6wkz-u-t680 y recibo job4 lint/build pendientes. T3 abierta por revisión/runtime; resto del plan sin cierres nuevos.
- Reviews inmediatos sobre código dejado en disco: Front mvlp6wjg-t-lydu, seguridad mvlp6wkz-u-t680, read-only y sin otro escritor. Parent ejecuta suite/lint/build, focal31 ya observado no se repite. No runtime/T3 PASS ni nuevo setup T14.
- Writer mvl7q38r-s-cbz9 FAILED: error genérico, sin diagnóstico/checks recuperables; no retry. Dejó Page/session/README con operación compartida. Parent confirmó QA hashes intactos, índice vacío/rama/diff-check0 y ejecutó focal **exit0,31/31,1.16s**. Historia de runs del writer desconocida; no se inventa. No source Senior. ASSESS high4/binary missing sin autoridad; T3 sigue abierta, reviewers/suite/runtime pendientes. Sin T14 start.
- Corrector mvl7q38r-s-cbz9 activo: Page/session/(opcional login-flow)/README, fuente única y tests congelados con hashes L63. Focal+suite después de editar, exits exactos; parent lint/build y Front/security inmediatos al retornar. No fixture/runtime ni Git writes.
- Reviewer-front mvl7idb2-r-fud1 **PASS solo diseño**: caso de fallo original post-remonte cerrado, sin espera indefinida; no producción/runtime PASS. Se habilita fix mínimo: exclusión de login completo/mutaciones de memoria más estado observable por remonte en el mismo runtime, sin cola/abort-rollback/T4/backend. Tests QA congelados; RED15/13/2 es evidencia previa válida.
- QA mvl7bdnx-q-nzog agregó52/0: caso original POST fallido tras remonte sin duplicado, warning accesible/memoria null/no replay y siguiente intento explícito/key nueva. Focal una vez exit1:15 tests/13pass/2fail conductuales, sin error sync. Parent diff-check0; producción intacta. Re-review de diseño mvl7idb2-r-fud1 antes de fix; no browser/cookies/T3 PASS.
- Corrección QA mvl7bdnx-q-nzog activa como único writer, solo LoginPage.test.tsx y caso faltante de fallo original post-remonte. Debe entregar RED conductual con exit exacto y re-review inmediato. Producción/fixture permanecen intactos.
- Reviewer-front mvl71t99-p-ancz **BLOCKED solo test-design**: falta el fallo del único flujo original después de remonte; con lock correcto no existe segundo POST y la rama condicional no lo cubre. Contadores/cleanup son válidos. QA agrega solo ese caso, incertidumbre accesible/memoria no verificada y nuevo intento explícito; producción sigue congelada y luego habrá re-review. Sin nuevo alcance T4 ni runtime PASS.
- QA mvl6jr6b-o-oykr añadió63/0 a LoginPage.test.tsx: RED final exit1,14 tests/13pass/1fail por solapamiento/remonte y memoria borrada. Primer borrador corregido por sincronización; dos runs, no retry infra. Parent diff-check0; fuente intacta. Diseño reviewer-front mvl71t99-p-ancz; solo después fix. Fallos de wrappers antes de invocación se corrigieron sin reviewer duplicado; store de script fallido no persistió. ASSESS high por4, binario nativo ausente/sin autoridad. No cookies reales ni T3 completada.
- S7 autorizado por selección explícita: «Autorizar imágenes oficiales fijadas», solo faltantes necesarias, versión/digest fijados; sin paquetes npm/OS, update CLI, globales, base actual o ampliación ADR006. Intento fallido conservado; sin pull/start aún. T14 vuelve Pendiente, no Bloqueada por autorización. Reconciliados los14 estados:2 completados previos, T3 en reproducción QA, resto pendiente; no nuevos PASS/cierres inferidos.
- QA mvl6jr6b-o-oykr escribe reproducción RED de remonte/operación concurrente, solo LoginPage.test.tsx, sin producción/fixture. Fuente queda congelada; después revisión de diseño y corrección por dev-frontier. No se confunde mock fetch con cookies reales.
- Seguridad T3 mvl0oolb-n-td26 **BLOCKED**: cierra Unicode y warning local, nuevo Medium por login concurrente al navegar/remontar (pendingRef por instancia y callbacks obsoletos que mutan memoria). No bypass demostrado. QA debe reproducir con peticiones diferidas/remonte, revisarse el test, y el autor serializar operación/mutaciones fuera del ciclo de componente. No aborto/ignorar callbacks como falso rollback. Risk2/4; cookies reales y T14 aún pendientes.
- Corrector mvl0fuy1-l-zbk6: focales29/29 y suite245/245 reportadas, sin exit numérico de tests; parent diff-check0, índice vacío y auth.ts sin cambios desde snapshot inicial. Reviewer-front mvl0ookf-m-dw0k **PASS solo código corregido** (Unicode/uncertainty cerrados). Job3 lint/build **exit0** incluye typecheck; no se repiten tests ni se afirma runtime. Seguridad mvl0oolb-n-td26 pendiente. ASSESS nuevo high por item2 pero nativeRisk unassessable/binary missing, sin autoridad.
- T14 espera decisión de política de imágenes: permitir solo oficiales Supabase faltantes con versión/digest fijados o mantener offline estricto y esperar entorno aislado preaprovisionado. No se infieren pulls de la autorización de continuar. No nuevos writers/arranques; target fallido conservado, sin tocar base original/ADR006/global/packages.
- Corrector T3 mvl0fuy1-l-zbk6 sigue como único writer. Help read-only de Supabase start exit0, versión2.121.0, sin flag no-pull anunciado; no arranque/update/bypass de --agent/--yes/health checks. Esto no diagnostica el fallo perdido. Estrategia offline T14 aún pendiente; writers siguientes serializados, reviews solo lectura pueden concurrir.
- Corrector frontend del mismo autor en ejecución: mvl0fuy1-l-zbk6; solo LoginForm/LoginPage/session.ts/README, tests congelados, sin arranque/infraestructura. Debe volver GREEN con los dos grupos revisados y suite; reviewers frontend/seguridad inmediatos al retornar. No cierra T3 ni prueba cookies.
- Nueva instrucción literal: «sigue con la implementación del plan». Se ejecutan ahora correcciones mínimas frontend de Unicode/aviso con RED y PASS de test-design ya obtenidos. T3 pasa En progreso; T14 Pendiente para reparar su diseño, sin nuevo arranque. Cookie real sigue gate de aceptación, no se sustituye con stubs.
- Seguridad setup mvky4x63-k-fj6c: BLOCKED (redirect/apikey, identidad daemon, discordancia docker.context/dockerContext, no-pull no garantizado, createUser fuera ADR006, fallos/contención/retención incompletos, claims y permisos). No diagnostica fallo real ni demuestra exfiltración/target remoto. ADR006 completo confirmado: no excepción implícita. Futuro fixture debe usar alta permitida sin ampliar service_role. Target/red/metadata fallidos conservados y sin reintentos automáticos.
- Reviewer-back mvky4x53-j-wmk9: **BLOCKED de artefactos**, no runtime: Medium por descartar diagnóstico/status y no producir failure record, Medium por sobreafirmar integridad de datos con digest de contenedores/captura after solo en éxito, Low por no medir/exigir modo0700 del directorio. SQL15 copias idénticas confirmado por lectura. Causa del bootstrap desconocida. Seguridad mvky4x63-k-fj6c sigue pendiente; sin nuevo intento, writer ni verificador. Correcciones/reintento no están ejecutados ni aprobados.
- Reviewer aviso mvkxu68r-i-j2sz: **PASS de diseño** (no runtime/producción); ambos grupos T3 test-design aprobados. Se comprobó T14 una vez en ese límite de decisión; el worker terminó antes del steering, que no se entregó.
- Writer T14 mvkx563p-d-ndu7: **bootstrap falló**, código numérico/diagnóstico perdidos, sin retry. No fixture ready/cuentas/env/credenciales/migraciones aplicadas/browser. Target stop reporta0 contenedores/volúmenes; red propia retenida confirmada read-only por ID/nombre/internal/loopback. Snapshot original12 identidades/status igual en metadata, no prueba de datos. Helper886/config108 líneas: carga de revisión elevada para el prerequisito, sin aceptación.
- Reviews de artefactos, no otro intento/verificación runtime: backend `mvky4x53-j-wmk9`, seguridad `mvky4x63-k-fj6c`; sin comandos/mutaciones/secretos. ASSESS high por item5, nativeRisk unassessable/binary missing, candidate null, independiente requerido pero readiness no disponible. Cualquier nuevo intento requiere primero diagnóstico y disposición explícita del target parcial. T14 y T3 no completadas.
- QA corrección mvkxqhfm-h-28z2: +2/-1 en LoginPage.test.tsx; éxito exige «Sesión iniciada» y warning ausente por rol. Focal RED exit1, seis fallidas/siete aprobadas, sin tocar producción/Form. Re-review de diseño en ejecución: mvkxu68r-i-j2sz; T14 aún prepara el fixture.
- Reviewer mvkxls3n-g-3bg4: **BLOCKED tests aviso**, matcher positivo también acepta «sesión activa» del warning. QA corrige solo ese matcher/ausencia de warning en éxito en LoginPage.test.tsx; se requiere re-review antes de producción. El resto del diseño fue considerado correcto; no cambia la aceptación ni el contrato.
- QA aviso de incertidumbre mvkxbrgj-f-oth7: +38/-2 solo LoginPage.test.tsx; RED focal exit1, seis fallos por mensaje ausente/siete aprobadas. Cubiertos rechazo repetido/HTTP/red/CSRF503/DTO y CSRF malformados; stubs no prueban cookies. Mensaje esperado registrado en aceptación operativa. Re-review frontend iniciado, sin corrector productivo y sin tocar tests Unicode.
- Reviewer mvkx75fh-e-xozs: **PASS de diseño de tests Unicode**, no de producción/runtime. QA agrega en un slice independiente los RED de aviso de sesión no verificada solo en LoginPage.test.tsx; T14 continúa escribiendo únicamente el fixture ignorado, sin rutas/contratos compartidos. Ambos hallazgos productivos y cookie/browser proof siguen abiertos; no se lanza corrector de producción aún.
- T14 preflight exit0: realpath confinado, destino nuevo, ignore local .gitignore:17. Writer único pi-backend-data-engineer `mvkx563p-d-ndu7` lanzado con skill security-and-hardening explícita; superficie exclusiva .playwright-mcp/frontend-backend-fixture/**. Instancia/cuentas nuevas y puertos propios; no tocar el proyecto actual, root .env/globales, paquetes ni contratos. Reviews backend/seguridad antes de usar credenciales del fixture.
- Autorización humana explícita: «Autorizar entorno local descartable». Se agrega S6/T14 al seguimiento (14 tareas), solo Supabase local nuevo/fixtures sintéticos, sin tocar/resetear la base existente ni instalar paquetes/globales o cambiar contratos. T3 vuelve a Pendiente por T14; Unicode/estado parcial y pruebas no están resueltos. Plan actualizado antes de cualquier escritura de setup.
- QA Unicode mvkwj8ul-c-pa0t: +30 líneas únicamente LoginForm.test.tsx; RED focal exit1, 3 fallidas/13 aprobadas (6/65/128 emoji). Test-design review pendiente. El steering posterior de UI no se entregó al task terminado; no existe aún esa nueva cobertura.
- QA runtime mvkwauvx-a-b2vc: **SIN PASS/S1 bloqueado**. Supabase status y sockets confirman loopback, pero faltan cuenta técnica API y fixture descartable aislado autorizado; no se ejercieron Express/Vite/navegador/cookie ni se crearon datos. Sin .env/reset/seed/instalaciones/cambios de usuarios. No se repiten verificadores ni se lanzan correcciones mientras falte esa prueba requerida.
- **Necesita decisión:** autorizar preparación de un entorno local descartable con credenciales técnicas y usuarios sintéticos nuevos, o mantener el bloqueo. No tocar/resetear la base actual, no compartir secretos por chat ni modificar globales. T3 Bloqueada; T4–T13 Pendientes por dependencia. Sin commits/push/merge; código y evidencia preservados.
- Arquitecto mvkwgqy4-b-8h9u: no hace falta decisión de producto para representar sesión local no verificada y posible cookie servidor retenida. Senior adopta ese límite: no se garantiza logout/revocación, no auto-cleanup ni restauración anticipada; éxito local solo tras POST+CSRF. Aceptación T3 aclarada, sin S#/backend/ADR nuevos. QA real-cookie aún debe reproducir antes de corrección productiva.
- Reviewer producción mvkw7kxz-8-bi92 terminó antes de la notificación adicional (no entregada); resultado leído: **BLOCKED Medium**, longitud UTF-16 vs puntos de código Unicode en LoginForm:23–24. Ejemplos6/65 emoji y límites12/128/129 se reproducen primero por QA en LoginForm.test.tsx, sin producción. La cookie retenida fue no bloqueante para ese reviewer, pero el auditor independiente mantiene su BLOCKED; se deben resolver ambos. Consulta arquitecto `mvkwgqy4-b-8h9u` y QA runtime `mvkwauvx-a-b2vc` en ejecución.
- Auditoría seguridad producción mvkw7kyr-9-zx8x: **BLOCKED Medium**, desajuste entre estado cliente descartado y cookie servidor posible tras fallo de bootstrap/re-login. No bypass demostrado. QA runtime y reviewer existentes informados; se exige reproducción con cookie real antes de corregir. Consulta acotada al arquitecto para modelar estado no verificado/posible sesión retenida sin cambiar contrato backend ni borrar HttpOnly desde JS. T3 no cerrada; fuente intacta hasta propuesta/evidencia.
- Producción T3 mvkvsbkr-7-1ufx: GREEN focal22/22 y suite238/238, exit0; tests QA idénticos al diff revisado; scope y whitespace comprobados. Iniciales fallos/timeouts de anuncio resueltos tras cambios a estados terminales con flushSync, pendientes de criterio del reviewer. Reviews independientes inmediatos: frontend `mvkw7kxz-8-bi92`, seguridad `mvkw7kyr-9-zx8x`.
- job-2 lint/typecheck/build frontend exit0 (12s), Vite8.3.4/118 módulos; no prueba runtime integrado. ASSESS directo con item2 devuelve high por escalación, nativeRisk unassessable por binary missing, RDD unknown y plan con independentVerifier=true; las llamadas previas vía codemode no habían ejecutado evaluación. QA independiente `mvkwauvx-a-b2vc` verifica el código escrito por otro agente mediante la interfaz pública y runtime local si puede aislar fixtures sin reset/seed/secretos; sin edición de repo. T3 sigue abierta.
- Escritor productivo único T3 lanzado: pi-dev-frontier `mvkvsbkr-7-1ufx`. Superficies: lib/api, auth/session, LoginPage, LoginForm y frontend/README; tests QA excluidos. Debe entregar código real, GREEN y suite frontend; lint/build/browser y gates independientes siguen pendientes.
- Re-review mvkvlyf5-6-2ch3: **PASS de diseño de tests**, cuatro hallazgos resueltos. No es GREEN ni aprobación productiva. Se habilita escritor único pi-dev-frontier para T3; sin editar tests QA ni ampliar rutas/contrato.
- QA corrección mvkvak9a-5-14b5: +218/-12 (230 diff lines); focal RED exit 1, 10 fallidas/12 aprobadas; scope y whitespace verificados, índice intacto. Cuatro hallazgos atendidos según autor, sin autoaprobación. Re-review independiente en ejecución: `mvkvlyf5-6-2ch3` (pi-reviewer-front). Supabase local observado corresponde a project_id save-a-life-backend y contenedores con salud reportada; sin reset/seed/secretos ni prueba E2E todavía.
- Reviewer-front mvkv1ap6-4-hqzz: **BLOCKED de tests** por sincronización no observable, no detección de retries diferidos, cobertura incompleta de no-demo/no-rol y falta de mensaje accesible de longitud. QA corrige únicamente sus dos tests en `mvkvak9a-5-14b5`; no hay escritor productivo hasta re-review. RED esperado no es el defecto y T3 no está completada.
- QA mvkuqwhk-3-4rlw: RED observado (exit 1, 8 fallidas/12 aprobadas), +173/-13 en dos tests autorizados, sin producción. `git diff --check` focal exit 0. ASSESS de ese candidato rechazado/no disponible; sin nativeRisk/plan/veredicto, no se reintenta ni se abre review nativo sobre RED parcial. Reviewer-front `mvkv1ap6-4-hqzz` ya revisa diseño de tests read-only; no equivale a PASS de integración.
- QA RED `mvkuqwhk-3-4rlw` en ejecución, único autor de LoginPage/LoginForm tests de T3. `npm run openapi:api:check` exit 0: artefactos vigentes. Listeners 54321/54322 observados, sin servidores 3000/5174; propiedad/salud de servicios y cuentas aisladas no verificadas. Sin reset, seed, .env ni configuración modificada.
- Arquitecto mvkugzld-1-yohj entregó mapa read-only: endpoints reales y CSRF contrastados; T3 acotado a login/sesión observable sin navegación, porque rutas/layouts actuales siguen demo. T4 conserva guards/MFA/enrollment; brecha de reanudar challenge tras recarga registrada sin ampliar contrato. F6/F8 no montados. Prerrequisitos Supabase/cuentas sintéticas sin verificar; .env no leído. T1 completada; T3 pasa a test-first con QA como único autor de tests críticos.
- Baseline antes de source writes: `npm run test --workspace @save-a-life/frontend` (job-1), exit 0: **39 archivos, 227 pruebas**, duración 4.88 s. No prueba conexión HTTP real y no se repite sobre el mismo código.
- Auditor mvkugzm0-2-yvad: **PASS de preparación local**, no de integración. Sin cambios; rutas/roles/gates preservados. Medium no bloqueante sobre skill ausente en pi-backend-data-engineer: adjuntarla explícitamente en futuras asignaciones pertinentes, no cambiar configuración aquí. Entorno observado Luna/max sin prometer telemetría de futuros hijos. Baseline frontend job-1 en ejecución; mapa contractual sigue en curso.
- Reanudación 2026-10-23: auditor de preparación `mvkugzm0-2-yvad` y mapa contractual read-only `mvkugzld-1-yohj` lanzados con perfiles project Luna/max; sin escritores concurrentes ni source writes. T1 reabierta para esta evidencia. Se conserva el plan de 13 tareas. El comando de estado RDD no está disponible en PATH (127), sin inferir ni cambiar el switch. Se aclara autoría única de tests críticos por QA.
- 2026-10-23: T1 completada mediante lectura de código/contratos y listado local de modelos.
- 2026-10-23: rama creada desde main limpio; sin cambios previos que preservar.
- 2026-10-23: se redactan plan y ODD; sin cambios de código, configuración o dependencias.
- 2026-10-23: T2 completada tras comprobación estructural Node/assert y `git diff --check` (exit 0): rama correcta, main intacto, solicitud literal, 13 tareas, enlaces y whitespace válidos; solo dos documentos nuevos, sin código/index modificados.
- 2026-10-23: T3–T13 bloqueadas por falta de herramienta `subagent` para
  escritores y gates independientes. No se ejecutó ningún subagente/review.
  El espejo Engram usa `odd/frontend-backend-integration/tasks` (observación 1754).
- No aplica RED/GREEN a este cambio documental sin comportamiento. Suites y browser
  no ejecutados: no hay implementación y no demuestran un resultado todavía inexistente.

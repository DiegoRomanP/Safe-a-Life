# Pendientes, incertidumbres y bloqueos — 2026-10-20

Estado: abierto. Registro de Senior para la solicitud de completar tareas de
`docs/` con delegación y commits. No es ratificación ni revisión independiente.
Plan: [auditoría y cierre de pendientes](../plans/2026-10-20-auditoria-y-cierre-de-pendientes.md).

## P-01 — Delegación obligatoria no disponible en el runtime actual

- Situación inicial: la sesión no expuso `task`; su búsqueda en el catálogo
  tampoco la encontró. Los perfiles exactos existían en `.opencode/agent/`, pero
  eso no demostraba que fueran invocables.
- Impacto: no se puede asignar implementación a `dev-back`,
  `backend-data-engineer`, `dev-frontier` o accesibilidad, ni obtener los gates
  obligatorios de reviewers, seguridad, clínica y QA.
- Restricción: las instrucciones activas prohíben implementar producto desde
  Senior y delegar mediante otra herramienta. No se sustituye `task` ni se
  inventa un PASS.
- Cambio local realizado: retirada la denegación global, habilitado `subagent`
  para Senior con allowlist de los IDs del proyecto, convertidos los permisos a
  V2 y expuestos los perfiles quitando `hidden: true`. Writers pueden editar;
  no pueden editar archivos `.env` (salvo `.env.example`). Shell queda en `ask`
  para operaciones no preaprobadas (Tester conserva allowlist de comandos de
  verificación y edita solo pruebas/configs de prueba). Reviewers tienen allowlist
  estricta de lectura; el auditor y arquitecto no pueden editar y mantienen
  `shell: ask`. Los subagentes no pueden delegar.
- Pendiente de confirmar: reiniciar OpenCode y comprobar que el runtime ofrece
  `subagent` y carga los perfiles/configuración editados. La herramienta no
  aparece en el catálogo de esta sesión actual.
- Si continúa bloqueado después del reinicio, revisar configuración global/de
  sistema y políticas administradas: un `deny` de mayor precedencia no puede
  desbloquearse desde el archivo del proyecto.
- Respuesta del 2026-10-20: la persona usuaria eligió **«Reabrir con
  herramientas»**. La disponibilidad efectiva debe comprobarse; no hay todavía
  una asignación ejecutada por esa respuesta.
- Comprobación previa a los cambios: `task` no estaba expuesto. La edición de
  archivos no puede activar por sí misma una herramienta ausente en el runtime.

## P-02 — Pruebas y commits sin permisos efectivos

- Situación: el perfil consultado deniega comandos generales; inicialmente
  permitió tres comandos Git de lectura por separado. Tras continuar, también
  fueron denegados `git status --short` y las búsquedas glob.
- Impacto: no hay nueva ejecución de tests, lint, compilación, auditoría,
  migraciones ni commits. La autorización funcional de la persona usuaria no
  elimina las restricciones efectivas de herramienta.
- Cambio local realizado: Tester puede ejecutar sin prompt los comandos
  frecuentes de pruebas, lint, build y comprobación de diff ya enumerados en su
  perfil; los demás comandos piden aprobación. Writers y Senior mantienen
  `shell: ask` para comandos no preaprobados.
- Comprobación previa a los cambios: `git status --short` y `git diff --stat`
  funcionaban, pero `git diff --check` estaba denegado. Senior y writers ahora
  preguntan para comandos shell no preaprobados; Tester mantiene allowlist para
  comandos frecuentes de pruebas. El runtime debe reiniciarse antes de verificar
  permisos efectivos. Se preservaron instrucciones y alcances preexistentes.
- Pendiente: reiniciar y verificar el efecto real. Senior puede pedir aprobación
  para `git add`/`git commit`; no se habilitó una regla automática amplia para
  esos comandos. Ninguna prueba o commit de producto ocurrió en esta sesión.

## P-03 — Fuentes discrepantes sobre AP y ratificaciones

- Evidencia: `1_Primeros_Alcances.md:303-305`, ERS, `docs/README.md`, la
  referencia normalizada y algunas skills aún describen AP-02/AP-04/AP-06/
  AP-07/AP-08 como abiertas. ADR-005 está aceptado y declara resueltas AP-02,
  AP-06, AP-07 y AP-08; la especificación y planes de módulos registran V6 para
  carreras, mientras la tabla del plan maestro aún lo marca pendiente.
- Otras discrepancias: README, `Backend-Contracts.md`, el encabezado del JSON
  y la entrega frontend conservan inventarios o afirmaciones de ausencia de
  backend anteriores a las 47 rutas observadas y a 73/57 operaciones/marcas.
- Incertidumbre: qué documentos deben actualizarse como reflejo de decisiones
  ya aprobadas; no tratar documentos desactualizados como tareas nuevas ni
  cambiar conducta seleccionando una fuente silenciosamente.
- Pregunta: ¿se confirma sincronizar los textos con los ADR aceptados y las
  decisiones ratificadas de octubre, conservando sus referencias históricas?
- **Decisión recibida el 2026-10-20: «Sí, sincronizar».** La duda de autoridad
  queda resuelta para reflejar esas decisiones existentes; permanece pendiente
  realizar/verificar la sincronización. No fijar políticas de carrera,
  retención o reintento nuevas ni convertir esto en ratificación de F7/F8.

## P-04 — F6 es el camino crítico sin implementación

- Situación: diez operaciones de `invitation-coordination` tienen
  `x-ratification`, pero no existe el módulo productivo ni sus tablas/RPC.
- Trabajo: dominio RBC/Haversine/ranking/lotes; unicidad y cuotas; outbox y
  auditoría atómicos; respuestas por token/sesión, historial, proyecciones
  mínimas; cascadas y vencimientos; entrega y reintento manual; pruebas de
  concurrencia y rendimiento con datos sintéticos.
- Dependencias: arquitectura antes de límites/contratos, reviewer-back por
  slice, auditor de seguridad, revisor clínico y QA crítico como dueño único
  de aceptación. La evidencia clínica insuficiente bloquea su gate.
- Límite: matriz académica para RBC, no elegibilidad ni seguridad transfusional;
  no usar intervalos ni recopilar historial de donación.

## P-05 — F7 y F8 aún requieren ratificación por módulo

- Situación: nueve operaciones de privacidad y siete de reconocimientos/
  información legal no tienen `x-ratification`; el proceso aprobado exige
  ratificarlas al iniciar cada módulo.
- Pregunta: confirmar su inventario y aceptación antes de modificar el contrato
  o implementar handlers. La solicitud general de continuar no se registra
  como aprobación clínica/legal ni de cambios de comportamiento implícitos.
- F7 pendiente: solicitudes, grants contextuales, ejecución, purgas y ledger,
  con plazos documentados y pruebas reales de roles, retención y restauración.
- F8 pendiente: mecánica de políticas y semilla `0.1-borrador`; la decisión 12
  permite aviso neutral y `content` nulo, no conclusiones legales aprobadas.

## P-06 — Destino e integración del frontend

- Evidencia: la aclaración registrada en el plan F0/F1 y `CLAUDE.md` preservan
  `frontend/` como destino productivo y `apps/web` como demo. F9 de la
  especificación todavía propone integrar `apps/web`; el diagnóstico del
  16 de octubre propone un traslado, expresamente sin aprobación.
- Además, la plantilla de `frontend/` declara React 19/JS, frente al stack
  TypeScript/React 18 aprobado. No reutilizarla silenciosamente ni borrarla.
- Pregunta: ¿se actualiza F9 para construir/reutilizar la interfaz en
  `frontend/` con React 18/TypeScript y conservar `apps/web` como demo?
- Trabajo posterior: login real, MFA/step-up, páginas por fragmento de token,
  sedes y transiciones, paginación, `Retry-After`, accesibilidad y E2E backend.
- Orden: mantener F6 → F7 → F8 → F9; no adelantar frontend conforme a una
  propuesta no aprobada.

## P-07 — Correcciones existentes y riesgos de seguridad por verificar

- F2b/F3/F4/F5 documentan correcciones posteriores a revisiones; algunas rondas
  fueron FAIL o PASS condicionado y no se repitieron después del rework.
- No afirmar que las correcciones siguen vulnerables sin revisarlas, ni que
  están aprobadas por tener tests históricos. Pedir reviewer-back y auditoría
  independientes sobre el alcance actualizado, y QA sobre los flujos críticos.
- Riesgos documentados: carrera creación/desactivación de sede, retención de
  respuestas idempotentes, consumo de token antes de fallos de Auth y cambio de
  email directo en GoTrue. Distinguir lo aceptado de lo pendiente de prueba.
- `config/env.ts` todavía exige secretos compartidos en el scope worker:
  verificar mínimo privilegio; no ampliar ni cambiar su contrato sin diseño.

## P-08 — Salida, CI y topología pendientes

- Existe `.github/workflows/security.yml` (gitleaks sobre el rango de commits y
  `npm audit --omit=dev`, 2026-10-20); no hay CI de pruebas, ni benchmark backend
  ni configuración Playwright contra backend; la suite actual usa el mock.
- ADR-004 exige inyección de `X-Edge-Secret` desde el borde; ADR-004 también
  excluye Edge Functions. La capacidad exacta de rewrite/header y los proxies
  deben verificarse, no suponerse ni resolverse debilitando el guard.
- Trabajo F9: CI con escaneo de secretos/audit, pruebas reales, migración y
  rollback/roll-forward, manifest de release, matriz requisito→prueba,
  rendimiento y smoke del proveedor con inbox permitido.
- Deploy, `supabase db push`, cambios de secretos y correo real quedan sujetos
  a autorización operativa específica; no forman parte de este desbloqueo.
- Swagger Editor 5 visual, compatibilidad de navegadores y validaciones
  profesionales clínica/legal requieren evidencia propia; lint no las acredita.

## P-09 — Memoria persistente sin identidad segura

- Engram devolvió conflicto de identidad del proyecto; contexto/búsqueda y
  guardado no tienen persistencia confirmada. No seleccionar un alias a ciegas
  ni mezclar historiales. Este registro local y el plan se guardaron y releyeron
  correctamente; son la evidencia recuperable de esta sesión.
- Desbloqueo: confirmar la identidad del proyecto antes de reintentar guardados.

## Estado de ejecución

- No se ha delegado ningún agente ni se ha modificado código productivo o tests.
- No se han ejecutado pruebas pertinentes ni realizado commits en esta sesión.
- Ningún reviewer, auditor o revisor clínico ha emitido un PASS nuevo.
- El trabajo de producto sigue abierto; no se rebajan los gates para cerrarlo.

## Actualización de ejecución — 2026-10-20

El estado anterior describe la sesión de auditoría, no la ejecución nueva.
Bitácora vigente: [ejecución con agentes](../plans/2026-10-20-ejecucion-de-pendientes-con-agentes.md).

- P-01: delegación real comprobada con `solution-architect`, `reviewer-back` y
  `clinical-safety-reviewer`; el auditor de seguridad también fue lanzado.
  Ya no está ausente `subagent`. No equivale a probar edición, QA o commits.
- P-02: shell, Node/npm aprobados y Docker local accesibles; Supabase local ya
  activo. Sin reset, pruebas de producto ni commit nuevos todavía.
- P-06: la persona usuaria eligió **«Dejar F9 pendiente»**; no se decide traslado,
  stack alternativo ni topología de borde.
- P-09: la persona usuaria autorizó intentar unificar memorias o crear una
  identidad oficial y documentarla. `projects merge --dry-run` rechaza esos alias
  por no ser variantes de separador/Unicode. Se investigará la alternativa de
  configuración oficial nueva, sin borrar ni mezclar historiales a ciegas.
- Clínica: **PASS documental solo académico/sintético** para la matriz RBC;
  **uso real BLOCKED**. No es aprobación del código F6 ni validación médica.

### P-10 — Baseline bloqueado por revisión independiente actual

`reviewer-back` emitió **BLOCKED** sobre P-07: carrera del cleanup que puede
borrar una cuenta recién vinculada (alta), secretos API exigidos al worker
(alta), revocación omitida si Auth aplica email y pierde la respuesta (media),
y carrera crear necesidad/desactivar sede con 500 en vez del 422 contratado
(media). Evidencia y correcciones B1–B4 en el plan vigente. No son vulnerabilidades
inferidas únicamente de revisiones antiguas. Requieren regresiones, corrección,
nueva revisión, seguridad y QA antes de F6.

### P-11 — Sincronización completa y siguientes contratos F6

La consulta de arquitectura detectó pruebas que exigen AP-02 abierta, texto
OpenAPI obsoleto y generados que deben mantenerse reproducibles. La sincronización
no puede cerrarse editando solo Markdown. También quedan discrepancias F6 sobre
payload de dos tokens frente al consumidor de uno, replay/409/410, orden de
bloqueos, eventos de entrega anteriores y allowlist RPC. No se elige conducta
silenciosamente; detener esos slices hasta reconciliar contrato y decisiones.

La auditoría de seguridad actual emitió además **BLOCKED** por SP-01 (alta): un
JWT anterior al reset puede volver a operar directamente en RPC/RLS al levantar
el bloqueo de onboarding; y SP-04 (media): replay de alta asistida no revalida el
hospital tras reasignar al admin. SP-01 requiere diseño de autenticación previo
a cambios de contrato/RLS, no una política improvisada. B2 y B3 coinciden con
hallazgos del reviewer. Son revisiones estáticas; sus regresiones aún deben
ejecutarse. El diagnóstico QA actual sí ejecutó 715 unitarias backend,
typecheck/lint/build con exit 0; no ejecutó DB, integración, Bruno ni E2E y no
levanta estos bloqueos.

### P-12 — F7 implementada sin el borrado de cuentas de Auth

**Prioridad: 🔴 URGENTE** (clasificada en la auditoría de seguridad del
historial, 2026-10-20). Mientras el borrado de Auth no esté resuelto, el derecho
de eliminación no se puede cumplir de punta a punta: una eliminación aprobada
responde 503 y el correo y la cuenta de Auth siguen almacenados. Las cuentas
`reclamada_incompleta` y los usuarios inertes se acumulan sin purga. Debe
resolverse antes de operar con datos reales de donantes.

F7 se implementó en el backend por solicitud explícita (adelantada a F6; detalle y
verificación en [`plans/2026-10-20-privacy-requests.md`](../plans/2026-10-20-privacy-requests.md)).
Quedan bloqueadas por ADR-006 las operaciones que borran cuentas de Auth con rol:
eliminación V15, cuentas `reclamada_incompleta` > 30 días y usuarios inertes > 24 h.
Decisión pendiente de la persona usuaria: ampliar el adaptador `AuthAdmin` con un
borrado de cuentas (o una DEFINER de `postgres` equivalente), actualizar ADR-006 y
ADR-003 y pasar la revisión de `security-privacy-auditor`. Mientras tanto una
eliminación aprobada responde 503 sin cambiar el estado. Los gates de F7
(`reviewer-back`, `security-privacy-auditor`) no se han ejecutado.

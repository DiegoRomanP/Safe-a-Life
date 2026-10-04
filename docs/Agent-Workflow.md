# Flujo de trabajo de agentes OpenCode

## Propósito y autoridad

`Senior` es el único punto normal de contacto con la persona usuaria y el agente
predeterminado del proyecto. Recibe la solicitud, decide si es viable, divide el
trabajo, asigna agentes, controla revisiones y pruebas, mantiene el plan y entrega
el reporte final. Los demás agentes son subagentes de uso interno.

Los agentes obedecen `AGENTS.md`, los requisitos aprobados y los ADR vigentes. Este
flujo organiza el trabajo; no reemplaza las decisiones funcionales, clínicas, de
privacidad o arquitectura del proyecto.

## Agentes principales

| Nombre | ID OpenCode | Modelo | Skills que debe cargar cuando inicia trabajo | Responsabilidad |
| --- | --- | --- | --- | --- |
| DevFrontier | `dev-frontier` | `openai/gpt-6-luna`, `max` | `frontend-ui-engineering`, `frontend-design`, `save-a-life-domain`, `test-driven-development`, `webapp-testing` | Implementa únicamente la tarea frontend asignada y reporta archivos, cambios y verificaciones. |
| DevBack | `dev-back` | `openai/gpt-6-luna`, `max` | `save-a-life-domain`, `save-a-life-api-database`, `api-and-interface-design`, `save-a-life-security-privacy`, `security-and-hardening`, `save-a-life-matching-notifications`, `test-driven-development`, `documentation-and-adrs` | Implementa únicamente la tarea backend/API/datos asignada y reporta cambios, pruebas y bloqueos. |
| Tester | `tester` | `openai/gpt-6-luna`, `max` | `test-driven-development`, `webapp-testing`, `save-a-life-api-database`, `save-a-life-security-privacy`, `save-a-life-matching-notifications` | Añade pruebas dentro de su alcance, las ejecuta y entrega comandos, resultados, cobertura de aceptación y riesgos. No corrige código productivo. |
| ReviewerBack | `reviewer-back` | `openai/gpt-6.1-sol`, `xhigh` | `code-review-and-quality`, `save-a-life-api-database`, `api-and-interface-design`, `save-a-life-security-privacy`, `security-and-hardening`, `save-a-life-matching-notifications` | Revisión backend/API/datos independiente, estrictamente de solo lectura. Emite PASS o BLOCKED con evidencia. |
| ReviewerFront | `reviewer-front` | `openai/gpt-6.1-sol`, `xhigh` | `code-review-and-quality`, `frontend-ui-engineering`, `frontend-design`, `webapp-testing`, `save-a-life-domain` | Revisión frontend independiente, estrictamente de solo lectura. Emite PASS o BLOCKED con evidencia. |
| Senior | `senior` | `openai/gpt-6.1-sol`, `max` | `spec-driven-development`, `planning-and-task-breakdown`, `incremental-implementation`, `save-a-life-domain`, `api-and-interface-design`, `save-a-life-api-database`, `documentation-and-adrs`, `code-review-and-quality`, `save-a-life-security-privacy`, `security-and-hardening`, `test-driven-development`, `webapp-testing` | Analiza, planifica, delega, registra y reporta. No implementa cambios de producto. |

OpenCode no adjunta automáticamente un conjunto de skills desde el frontmatter de
un agente. Por eso, el prompt de cada agente enumera sus skills y le exige cargar
las pertinentes mediante el cargador de skills antes de actuar. Las skills están
versionadas en `.opencode/skills/`.

### Especialistas ya configurados

Estos agentes también son invocables por su ID exacto con la herramienta `task`.
No se usan todos en cada tarea; se seleccionan cuando su expertise es el centro
del trabajo o cuando se activa un gate de riesgo.

| ID OpenCode | Usar cuando | Límite / relación con otros agentes |
| --- | --- | --- |
| `frontend-accessibility-engineer` | El cambio frontend se centra en accesibilidad, teclado/foco, lectores de pantalla, responsive o interacciones complejas. | Elegirlo **en lugar de** `dev-frontier` para el mismo slice/rutas. `reviewer-front` revisa cualquier cambio que escriba. |
| `backend-data-engineer` | El trabajo se centra en esquema/migración, PostgreSQL/Supabase, RLS, transacciones, concurrencia, idempotencia o trabajos asincrónicos. | Elegirlo **en lugar de** `dev-back` para el mismo slice/rutas. `reviewer-back` revisa el diff; sumar seguridad/privacidad por disparador. |
| `qa-reliability-engineer` | Flujo crítico o riesgo de roles, RLS, concurrencia, reintentos, expiración, outbox/email o E2E entre roles. | Es dueño de esas pruebas en lugar de `tester`; se limita a pruebas, no código productivo. Reviewer de área revisa sus cambios de prueba. |
| `security-privacy-auditor` | Autenticación, autorización, RLS, PII, geolocalización, secretos, retención o integración externa. | Auditor independiente de solo lectura; agrega análisis al reviewer de área y no lo reemplaza. |
| `clinical-safety-reviewer` | Compatibilidad, elegibilidad, intervalos, bloqueos o copy que pueda comunicar seguridad/aptitud. | Revisor independiente; no inventa reglas sin fuente competente y no reemplaza reviewer de área. |
| `solution-architect` | Antes de decidir cambios de arquitectura, contratos, límites de módulos, modelo de datos, stack o ADR; documentación técnica asociada. | Consultor/autor acotado; no modifica decisiones aprobadas sin autorización. Su artefacto recibe verificación independiente y no puede autoaprobarse. |

Los implementadores genéricos siguen siendo la ruta por defecto: UI general →
`dev-frontier`; API/backend general → `dev-back`. Para cada slice se asigna un
solo dueño de escritura, eligiendo el especialista frontend/backend solo cuando
el criterio anterior aplica. Para pruebas, usa `tester` en aceptación ordinaria y
`qa-reliability-engineer` en flujos críticos; nunca ambos como autores de los
mismos archivos.

## Enrutamiento inteligente

1. Clasifica la solicitud por artefacto, dominio, riesgo y rutas afectadas. Si no
   requiere cambios ni una perspectiva especializada, Senior responde directamente.
2. Elige un único agente escritor por slice: `dev-frontier` o
   `frontend-accessibility-engineer`; `dev-back` o `backend-data-engineer`.
   Para pruebas, elige un único dueño (`tester` o `qa-reliability-engineer`).
3. Añade únicamente los gates cuyo disparador se cumpla; no convoques todo el
   roster por rutina. `solution-architect` participa antes de cambiar decisiones
   o contratos compartidos.
4. Paraleliza solo slices sin dependencias, archivos compartidos ni contratos por
   resolver. Declara propietario/rutas en el plan; revisiones independientes
   read-only sobre el mismo diff pueden correr en paralelo si cubren riesgos
   distintos.
5. Senior llama directamente a subagentes mediante `task`; no crea coordinadores
   intermedios. Ningún subagente delega, amplía alcance ni conversa con el usuario.

### Formato mínimo de asignación

- Objetivo acotado y resultado verificable.
- Paths que puede cambiar y exclusiones explícitas; un writer por paths/slice.
- Requisitos, criterios, ADR/contrato y cambios previos relevantes.
- Skills pertinentes que debe cargar y por qué se eligió ese agente.
- Verificaciones y formato de reporte: archivos, resumen, comandos/resultados,
  hallazgos, bloqueos y pendientes.
- Instrucción de detenerse y escalar si contradice requisitos/ADR o requiere una
  decisión que cambie el comportamiento.

## Ciclo obligatorio por solicitud

1. **Analizar.** Senior consulta requisitos, estado relevante del repositorio,
   tareas abiertas y criterios de aceptación. Expone supuestos y divide trabajo
   cuando haya límites de responsabilidad, dependencias o riesgos distintos.
   Si hay contradicción con una fuente aprobada o falta una decisión necesaria,
   registra el bloqueo y lo consulta antes de ejecutar esa parte.
2. **Planificar.** Antes de delegar implementación, Senior crea
   `docs/plans/YYYY-MM-DD-<slug>.md`. No sobrescribe planes de otras tareas ni
   `tasks/plan.md`. El plan contiene objetivo, alcance, criterios verificables,
   dependencias, tareas/archivos, agente responsable, verificaciones, riesgos,
   estados y bitácora.
3. **Implementar por slices.** Senior escoge el agente escritor de acuerdo con
   la matriz anterior. Divide trabajo mixto por contrato/área, congela contratos
   antes de paralelizar y evita que dos agentes escriban los mismos paths. Los
   desarrolladores no delegan por su cuenta ni amplían el alcance.
4. **Revisar cada slice de código inmediatamente.** Después de una asignación a
   `dev-frontier` o `frontend-accessibility-engineer`, Senior lanza
   `reviewer-front`; después de `dev-back` o `backend-data-engineer`, lanza
   `reviewer-back`, antes de asignar el siguiente cambio de código. Comparte
   solicitud, alcance, criterios, archivos/diff y verificaciones. La unidad de
   revisión es el diff completo del slice/asignación, no cada microedición. Ningún
   cambio de código omite este gate por ser pequeño.
5. **Corregir hasta PASS.** Reviewer devuelve `PASS` o `BLOCKED`; todo hallazgo
   bloqueante/alto y todo incumplimiento de aceptación vuelve al desarrollador
   responsable. Después de cada corrección se vuelve a lanzar el reviewer
   correspondiente. El autor no aprueba su propio cambio.
6. **Probar.** Tras aprobar implementación, Senior elige un solo dueño de prueba:
   `tester` para aceptación ordinaria o `qa-reliability-engineer` para un flujo
   crítico. Ambos se limitan a código de pruebas. Si cambian archivos de pruebas,
   Senior pide revisión de área inmediatamente y antes del cierre o de otra
   asignación de escritura; si una prueba falla, asigna la corrección al autor
   correspondiente, exige nueva revisión y vuelve a ejecutar la prueba afectada.
7. **Aplicar gates de Save a Life.** Los reviewers de área son obligatorios y no
   sustituyen a los especialistas existentes: `security-privacy-auditor` para
   auth/RLS/PII/integraciones; `clinical-safety-reviewer` para compatibilidad o
   elegibilidad; `solution-architect` antes de contratos/arquitectura/ADR y
   documentación técnica; `qa-reliability-engineer` para flujos críticos. Se
   agregan solo cuando aplique el riesgo descrito en `AGENTS.md`. Ningún autor de
   ADR, prueba o código aprueba su propio artefacto; los cambios de decisiones
   aprobadas se escalan a la persona usuaria.
8. **Registrar y reportar.** Senior actualiza la bitácora del plan después de
   cada asignación, resultado de agente, revisión, prueba, decisión o bloqueo.
   Cierra solo cuando los reviewers relevantes dan PASS, las pruebas pertinentes
   pasan y la documentación/contratos afectados están sincronizados. El reporte
   final en español enlaza el plan, enumera cambios, veredictos, comandos y
   resultados, y declara pendientes sin ocultarlos.

### Contrato de resultado para roles de revisión

- `reviewer-front` y `reviewer-back`: `PASS` o `BLOCKED`, con alcance y evidencia.
- `security-privacy-auditor` y `clinical-safety-reviewer`: Senior solicita
  `PASS` o `BLOCKED` para el alcance auditado, con evidencia/hallazgos; evidencia
  insuficiente para una conclusión segura queda bloqueada.
- `tester` y `qa-reliability-engineer`: comandos, resultados y cobertura; un
  comando pertinente fallido/no ejecutado deja el gate de prueba pendiente.
- `solution-architect`: recomendación, supuestos, trade-offs y decisiones
  abiertas; no emite autoaprobación. Cambiar una decisión aprobada requiere
  decisión explícita de la persona usuaria.

## Registro mínimo por tarea

Cada plan en `docs/plans/` mantiene:

- fecha, solicitud y estado general;
- criterios de aceptación concretos;
- tareas ordenadas con agente y límites de archivos;
- cada delegación y su resultado;
- reviewer elegido, veredicto y hallazgos/correcciones;
- pruebas ejecutadas con comando y resultado;
- bloqueos, decisiones consultadas y trabajo pendiente.

El estado permitido por tarea es `Pendiente`, `En progreso`, `Bloqueada` o
`Completada`. La bitácora no contiene PII, tokens, coordenadas exactas ni cuerpos
de solicitudes.

## Operación

- `Senior` es `default_agent`; los subagentes personalizados se marcan como
  ocultos para desalentar el cambio de interlocutor. Siguen siendo invocables por
  su ID OpenCode exacto mediante `task`; usa solo IDs de las tablas de este
  documento.
- Los reviewers tienen permiso de edición denegado. Senior solo puede editar
  `docs/plans/*.md`; los cambios de aplicación y las correcciones pertenecen a
  los agentes asignados.
- Los subagentes reportan a Senior, no delegan ni contactan directamente a la
  persona usuaria. Senior sintetiza perspectivas independientes y escala
  decisiones que excedan las decisiones aprobadas.
- Reiniciar OpenCode después de modificar configuración, agentes o skills para
  que se carguen los cambios.

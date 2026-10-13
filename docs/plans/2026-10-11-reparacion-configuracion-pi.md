# Plan: reparar la configuración de Pi Agent

Fecha: 2026-10-11  
Estado: Implementación y verificación estructural hechas; revisión independiente pendiente  
Responsable: Senior  
Solicitud: hacer que Pi ejecute los planes con las herramientas realmente instaladas y no se detenga por instrucciones heredadas de otro harness.

## Hallazgos verificados

- Pi 1.1.0 tiene instalados `pi-open-agents` y `pi-agent-modes`; no se encontró una extensión activa `gentle-pi`/Gentle Agents. `gentle-engram` es la integración de memoria, no el ejecutor de subagentes.
- `.pi/README.md` todavía atribuye los agentes a Gentle y prescribe `subagent_run`/`subagent_list_agents`.
- `pi-open-agents` registra `subagent({ agent, task })`, descubre `.pi/agents/` y `.opencode/agent/`, y cuando hay nombres repetidos la definición que se carga después reemplaza a la anterior. Como `.opencode/agent/` se procesa después, los nombres compartidos de `.pi/agents/` no garantizan que Pi use sus modelos `openai-codex` ni sus instrucciones adaptadas.
- El Senior OpenCode contiene restricciones y herramientas `task`/`skill`; la adaptación de Pi necesita un perfil primario propio y una ruta directa si la delegación no está disponible.
- `.pi/settings.json` declara `gpt-6-luna`, mientras el README y la decisión de adaptación declaraban `gpt-6.1-sol` como modelo principal.
- `.pi/agent/trust.json` ya confía en este proyecto. El flujo `/mode plan implement` de `pi-agent-modes` cambia a modo `build`; la modalidad `plan` es intencionalmente de solo lectura.
- No existían `modes.config.json` global ni de proyecto. `pi-agent-modes` registra `ask` primero, así que el modo inicial era read-only; `pi-open-agents` lanza hijos con `--mode json` (formato de salida), pero no les pasa `--modes build`. Los 11 workers Pi no declaran `tools` ni `permission`; el recorte inicial procedía del modo de workflow, no de `mode: subagent`.
- Los perfiles revisores/auditores contienen instrucciones de no editar/no implementar; salvo el permiso core explícito de `pi-senior`, no configuran una whitelist técnica. Esas instrucciones describen la responsabilidad del rol y no son aislamiento. Los perfiles implementadores y de pruebas mantienen sus límites por asignación.
- El cargador actual también emite un warning no bloqueante al importar el `tester` OpenCode modificado: su parser de frontmatter interpreta el `:` en `npm run openapi:lint` como separador YAML. El `pi-tester` propio carga sin warnings; se preservó el archivo OpenCode preexistente.
- Queda un comentario generado por Gentle en `.atl/skill-registry.md` y referencias Gentle en documentos históricos. Pi no los carga como instrucciones de sesión; los planes de adaptación antiguos quedaron marcados como históricos.

## Decisiones

- Mantener intactos los agentes y permisos propios de OpenCode; dar nombres Pi únicos (`pi-*`) a los perfiles adaptados para impedir colisiones con los perfiles que `pi-open-agents` importa desde `.opencode/agent/`.
- Configurar `pi-senior` como agente primario predeterminado y limitar su lista de delegación a los 11 perfiles Pi declarados en el proyecto.
- Fijar `defaultMode: build` en `.pi/modes.config.json` para la sesión primaria y subagentes nuevos; conservar `ask`/`plan`/`review` como modos de solo lectura explícitos.
- Autorizar sin confirmación por llamada las herramientas core de coordinación y coding en `pi-senior`; dejar otras tools de extensión con la confirmación predeterminada.
- Usar `subagent({ agent, task })` en Pi y `task` en OpenCode solo cuando el harness actual lo proporcione. No asumir `subagent_run`, `subagent_list_agents` ni `skill`.
- Si el harness no ofrece delegación compatible, Senior puede ejecutar directamente con las herramientas autorizadas; eso no permite afirmar que una revisión independiente ocurrió si no está disponible.
- No cambiar configuración global, credenciales, configuración de MCP, producto ni archivos OpenCode ajenos a esta reparación.

## Tareas y aceptación

### T1. Corregir el contrato compartido de coordinación
- [x] Localizar referencias activas a herramientas incompatibles y revisar el flujo de agentes canónico.
- [x] Añadir el mapeo OpenCode/Pi y el fallback de ejecución directa en `AGENTS.md` y `docs/Agent-Workflow.md`.
- [x] Mantener los gates de revisión; registrar como pendiente el gate independiente que no pueda ejecutarse.

### T2. Corregir el runtime Pi y los perfiles
- [x] Crear un perfil Pi `pi-senior` en modo `primary`, con delegación acotada a IDs `pi-*` y fallback directo.
- [x] Renombrar los 11 perfiles Pi para evitar que las definiciones OpenCode cargadas después los sobrescriban; establecer `mode: subagent`.
- [x] Configurar `defaultAgent: pi-senior` y alinear `defaultModel` con la documentación aprobada.
- [x] Configurar `defaultMode: build` sin añadir una whitelist que quite herramientas.
- [x] Permitir `read`, búsqueda/listado, `edit`, `write`, `bash` y `subagent` en `pi-senior` sin aprobación repetida.
- [x] Actualizar `.pi/APPEND_SYSTEM.md` y `.pi/README.md` con herramientas, trust, reinicio y ejecución de planes correctos.

### T3. Verificar y registrar
- [x] Validar JSON, modelos, frontmatter, IDs permitidos y rutas de skills.
- [x] Resolver el modo inicial con la lógica instalada de `pi-agent-modes` y verificar que Build permite escritura, Bash y tools de extensión; comprobar los permisos core `allow` de `pi-senior`.
- [x] Confirmar que `pi list` muestra ambos paquetes necesarios y que no quedan instrucciones activas que exijan herramientas incompatibles.
- [x] Revisar el diff contra el estado previo y registrar comandos, resultados y límites de verificación en esta bitácora.
- [ ] Obtener revisión independiente del área cuando el harness actual permita invocar subagentes.

## Criterios de aceptación

1. El prompt efectivo de Pi no ordena llamar `task`, `subagent_run`, `subagent_list_agents` ni `skill` como herramientas disponibles.
2. Pi arranca con `pi-senior` y modo `build`; la delegación muestra solo IDs `pi-*` del proyecto y cada perfil hijo no es seleccionable como agente primario.
3. Si falta `subagent`, la ejecución directa es una ruta válida; no se falsifica PASS de revisión independiente ni de pruebas no ejecutadas.
4. Las instrucciones de Save a Life, límites de privacidad, roles, gates clínicos y stack siguen vigentes.
5. Configuración JSON y referencias comprobables pasan; no se requiere una llamada facturable al modelo para verificar archivos.

## Riesgos y límites

- Los agentes existentes de `.opencode/agent/` también se descubren en Pi. Se conservan; los perfiles `pi-*` y `allowedAgents` evitan que sustituyan o se mezclen con el flujo predeterminado de Pi.
- `.gitignore` ahora excluye `.pi/` y `.opencode/`. La persona usuaria confirmó que desea mantenerlos locales; no se cambia esa regla. La adaptación Pi funciona en este checkout, pero esos archivos no se versionan.
- No se ejecutará una sesión TUI/modelo desde este harness. Se verificará la carga estructural y se dejarán pasos manuales concretos para confirmar la interfaz Pi.
- Los gates independientes no pueden delegarse desde este harness porque no expone herramienta de subagentes; se reportará el estado real, sin autoaprobar.

## Bitácora

- 2026-10-11: estado inicial revisado. El repositorio contiene otros cambios preexistentes; no se tocarán. `pi list` confirma `pi-open-agents` y `pi-agent-modes`. La búsqueda encontró el mapping obsoleto de Gentle en `.pi/README.md`, más las instrucciones OpenCode `task`/`skill` que Pi también descubre.
- 2026-10-11: implementación directa completada. El loader instalado descubrió exactamente `pi-senior` (`primary`) y 11 hijos `pi-*` (`subagent`); la allowlist de Senior coincide con esos 11. El parser no notificó errores en `.pi/agents/`; sí reportó el warning descrito para el archivo OpenCode Tester preexistente.
- 2026-10-11: atendiendo la observación del usuario sobre falta de edición, se identificó el modo de sesión `ask` por defecto como bloqueo efectivo. Se agregó `.pi/modes.config.json` con `defaultMode: build`. La lógica instalada elige `build` con `allowWriteTools: true`, `bash: allow` y `blockUnknownTools: false`; los 11 workers no declaran `tools`/`permission`, mientras que `pi-senior` tiene `allow` para herramientas core. Una sesión reanudada aún puede conservar un modo persistido: cambiarla con `/mode build`.
- Se añadieron reglas `allow` core a `pi-senior` para que lectura/edición/escritura/Bash/delegación no queden detrás del default `ask` de `pi-open-agents`; los tools de extensión no listados siguen pidiendo aprobación. Los 11 workers carecen de whitelists y el executor no les pasa `--tools`.
- Clasificación de acceso: `pi-reviewer-front`/`pi-reviewer-back` prohíben editar y ejecutar comandos en su prompt; `pi-security-privacy-auditor`/`pi-clinical-safety-reviewer` prohíben implementar; `pi-solution-architect` es consultivo. `pi-tester`/`pi-qa-reliability-engineer` pueden modificar y ejecutar pruebas, no producto. `pi-dev-frontier`, `pi-dev-back`, `pi-frontend-accessibility-engineer`, `pi-backend-data-engineer` y `pi-senior` (fallback) implementan sus slices. Ninguno de esos límites por rol está impuesto como sandbox; los perfiles tienen las tools disponibles en `build`.
- Verificación: el bloque de orientación generado por el plugin lista los 11 IDs permitidos y no expone IDs OpenCode sin prefijo. JSON de settings/MCP válido; 17 skills referenciadas existen; los cuatro MCP siguen `enabled: false`; `pi --version` devuelve `1.1.0`; `pi list` muestra `pi-open-agents` y `pi-agent-modes`. No se hizo llamada de modelo, conexión MCP, sesión TUI ni cambio global.
- La regla `.pi/` de `.gitignore` apareció durante la sesión; la persona usuaria eligió mantener la configuración Pi local. No se tocó `.gitignore`.
- Al cierre también apareció `docs/plans/2026-10-11-verificacion-mock-contract-alignment-pi.md` en el worktree. Es ajeno a esta reparación y quedó intacto.
- Gate pendiente: este harness no expone `task` ni `subagent`, así que no fue posible solicitar reviewer independiente. Se verificó el diff de forma directa, pero no se atribuye PASS independiente ni se declara terminada la tarea hasta ejecutar ese gate en un harness compatible.

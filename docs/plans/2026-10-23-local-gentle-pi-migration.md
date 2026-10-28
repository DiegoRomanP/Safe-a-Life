# Plan: migración local de todos los agentes a Gentle Pi

Fecha: 2026-10-23. Estado: cambios locales aplicados y comprobados; smoke test/review bloqueados por recarga. Rama: `feat/frontend-backend-integration`.
Especificación y progreso: [odd/tasks/local-gentle-pi-migration.md](../../odd/tasks/local-gentle-pi-migration.md).
No reemplaza ni ejecuta el [plan de integración](2026-10-23-frontend-backend-integration.md).

## Resultado

Usar las herramientas nativas de Gentle Pi y configurar Luna 6/max en los
12 perfiles locales. Senior conserva su rol primario y nunca se lanza como hijo.
Los 11 workers conservan sus instrucciones, skills y límites por rol.

## Allowed edit surfaces

- `.pi/APPEND_SYSTEM.md`, `.pi/agents/pi-*.md`, `.pi/settings.json`.
- `.pi/subagents.json` (nuevo, defaults/perfiles de los 11 workers).
- `.pi/README.md`, `AGENTS.md`, `docs/Agent-Workflow.md`.
- Este plan y los documentos ODD/plan de integración afectados por el cambio de ruta.

## Exclusiones

- No salir del root ni leer/copiar/modificar configuración global.
- Sin pi install/remove/update, /gentle:models save, activación global de
  perfiles, symlinks, instalación de paquetes ni cambios de permisos runtime.
- No .opencode, MCP, modos, código frontend/backend, contratos, dependencias,
  lockfiles, .gitignore, secretos, push, PR ni merge.
- .pi/ permanece ignorada; no se fuerza su incorporación a Git.
- No cambiar el modelo del proceso primario en caliente; los defaults locales
  y el perfil Senior usarán Luna/max al ser adoptados por el host.

## Tareas y aceptación

| Tarea | Dueño | Aceptación | Verificación |
| --- | --- | --- | --- |
| T1 | Senior | Paths resueltos dentro del root, plan/espejo y baseline preservados | realpath, manifiesto de hashes locales |
| T2 | Senior, fallback autorizado | Herramientas nativas coherentes, 12 perfiles Luna/max, 11 workers compatibles, Senior primario, skills intactas | readback y controles de configuración |
| T3 | Senior | Ningún archivo protegido cambió; JSON y enlaces válidos; guías sincronizadas | Node/assert y git diff --check |
| T4 | Auditor independiente, solo lectura | Lanzamiento real informa ruta efectiva Luna/max; revisión independiente sin escrituras | Solo tras /reload/nueva sesión; no simular PASS |

La comparación estructural previa debe mostrar el problema actual y volver a
pasar después de la corrección. Esto no constituye prueba de un lanzamiento real
ni demuestra credenciales; no se ejecutan suites de producto ajenas a estos archivos.

## Compatibilidad y permisos

Gentle Pi acepta `subagent_mode: task` antes de `mode`; se conserva
`mode: subagent` para interoperabilidad del worker. Senior conserva
`mode: primary` y no recibe modo de worker. Los defaults y perfiles locales usan
`default_model`, `default_effort`, `model_profiles`; cada worker fija su ruta.
Un perfil de sesión explícito puede prevalecer: se verifica la ruta efectiva
después de recargar, sin alterar archivos globales.

Los metadatos legacy `permission`/`allowedAgents` no son un sandbox ni
autorización runtime en Gentle Pi. Se mantienen restricciones explícitas por rol,
un escritor por slice y los gates independientes. Los comandos de pi-agent-modes
se describen solo como condicionales a que esa extensión esté disponible.

## Riesgo y cierre

Risk: item 5 (configuración del entorno local de agentes y selección de modelos).
La revisión y el smoke test real quedan bloqueados hasta que el host adopte las
nuevas instrucciones. No se declarará PASS independiente antes de ejecutarlos.

## Bitácora

- Se preservan los ajustes manuales ajenos salvo el subagent_mode agregado a
  Senior, cuya corrección está expresamente incluida.
- La configuración global no se usa como baseline: no se lee ni se toca.
- T1/T2/T3 completadas: prueba estructural previa exit 1 por la incompatibilidad reproducida; posterior exit 0. Preservación de 375 archivos, cuerpos de 11 workers y 17 rutas de skills: exit 0; git diff --check: exit 0. Se conserva .pi/ ignorada, sin commits/push.
- Solicitud adicional de verificar que los workers entreguen código: inspección estática completa de los 11 perfiles. Cuatro implementadores escriben producto, dos roles de QA escriben/ejecutan pruebas, cuatro reviewers/auditores son read-only y un arquitecto asesora sin coordinar. No se halló mandato de crear planes generales en workers; Senior mantiene el plan. No se alteraron esos cuerpos ni se confundió lectura de instrucciones con comportamiento demostrado.
- Pendiente T4: recargar el puente, comprobar ruta efectiva y ejecutar smoke test/review independiente. El primer slice real debe producir diff y resultados de pruebas; una respuesta solo de planificación no lo cumple. Suites de producto/browser no ejecutadas porque no cambió producto.

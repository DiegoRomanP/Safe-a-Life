# Plan: enrutamiento inteligente de agentes por Senior

**Estado:** Completado
**Fecha:** 2026-10-03
**Solicitud:** Permitir que Senior aproveche inteligentemente todos los agentes ya establecidos para mejorar la efectividad del desarrollo.

## Objetivo

Dar a Senior criterios concretos para seleccionar un agente dueño por slice, convocar especialistas y gates según riesgos, paralelizar solo trabajo independiente y preservar revisión independiente.

## Alcance

- Sincronizar `.opencode/agent/senior.md`, `docs/Agent-Workflow.md`, `AGENTS.md` y la guía de patrones de orquestación.
- Enlazar el inventario completo de agentes y sus disparadores de uso.
- Verificar que OpenCode resuelve a Senior y a los agentes nombrados.

## Fuera de alcance

- Crear, eliminar o cambiar modelos/permisos de agentes existentes.
- Cambiar contratos, decisiones de producto o archivos de aplicación.
- Reemplazar los gates existentes de seguridad, privacidad, clínica y revisión de área.

## Criterios de aceptación

- [x] Cada agente existente tiene responsabilidad, criterios explícitos de activación y límites de responsabilidad.
- [x] El enrutamiento diferencia agente dueño de implementación, especialista consultivo, tester/QA y reviewer independiente.
- [x] Un slice tiene un solo escritor; solo se paralelizan slices sin archivos ni contratos compartidos.
- [x] Cualquier agente que escriba código queda sujeto a revisión independiente de área; los gates de alto riesgo se conservan.
- [x] Senior usa la herramienta `task` directamente, sin crear un coordinador intermedio ni permitir delegación anidada.
- [x] README, AGENTS, Senior y Agent-Workflow enlazan la misma guía y no se contradicen.
- [x] OpenCode reconoce los 12 agentes; Senior conserva `task` habilitado; diff y formato pasan. Se preservó el trabajo previo ajeno.

## Decisión de coordinación

`docs/Agent-Workflow.md` será la fuente operativa canónica. Senior seguirá
coordinando directamente con la persona usuaria y llamará a los agentes en un
nivel mediante `task`; no se agregará un meta-orquestador ni fan-out por defecto.
Para cada slice se seleccionará un solo agente escritor. Los agentes especialistas
se escogen por disparadores explícitos, no como una lista de consulta obligatoria.

## Tareas y responsables

1. **Diseño operativo — completado.** `solution-architect` revisó el inventario, encontró solapamientos de escritura/pruebas y el conflicto entre la guía genérica y las reglas específicas del proyecto. Recomendó un solo escritor por slice, activadores claros y la adaptación local de orquestación.
2. **Documentación de coordinación — completada.** Actualizados el prompt de Senior, la matriz Agent-Workflow, las reglas AGENTS, README y la adaptación de orquestación específica del proyecto.
3. **Verificación — completada.** Los 12 IDs pasan `opencode debug agent`; Senior mantiene delegación `task` habilitada; `git diff --check` y validación de whitespace/EOF pasan. Sin tests de aplicación: no cambió código de producto.

## Riesgos y mitigaciones

- **Sobred elegación y latencia:** invocar solo los agentes que aportan criterio distinto a la tarea; no hacer fan-out rutinario.
- **Escrituras concurrentes:** declarar un único agente escritor por slice; separar por rutas y cerrar contratos antes de paralelizar.
- **Autoaprobación o gates omitidos:** cualquier writer usa reviewer independiente y se mantienen gates de seguridad/privacidad, clínica, arquitectura y QA crítica cuando correspondan.
- **Fuentes desincronizadas:** `docs/Agent-Workflow.md` será la fuente operativa canónica; los otros documentos la referencian y resumen sin inventar reglas.

## Bitácora

| Fecha | Acción | Resultado |
| --- | --- | --- |
| 2026-10-03 | Inspección de agentes y reglas existentes | OpenCode reconoce los agentes configurados; faltan criterios de selección/solapamiento para que Senior use explícitamente los especialistas de implementación y QA. Existe una tensión con la guía genérica de orquestación que se debe resolver como adaptación específica del proyecto. |
| 2026-10-03 | Consulta de arquitectura de solo lectura a `solution-architect` | Confirmó brechas de selección para frontend accesible, backend de datos, QA crítico y autoría de docs; recomendó diferenciar roles de implementación, gates y aprobación. Sin cambios en archivos. |
| 2026-10-03 | Actualización de prompt/matriz/reglas y reconciliación de orquestación | PASS; Senior tiene selección por disparadores, propiedad única por slice y gates de revisión independientes. README, `AGENTS.md` y guía canónica sincronizados. |
| 2026-10-03 | Validación final | PASS; `opencode debug agent` reconoció los 12 IDs y confirmó `task` habilitado en Senior; `git diff --check` y control de espacios/nueva línea pasaron. No se ejecutaron suites de aplicación por ser un cambio de documentación/configuración. Se conservaron los cambios de trabajo previos no relacionados. |

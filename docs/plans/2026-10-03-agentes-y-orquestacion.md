# Plan de trabajo: agentes y orquestación Senior

**Estado:** Completado
**Fecha:** 2026-10-03
**Solicitud:** Configurar DevFrontier, DevBack, Tester, ReviewerBack, ReviewerFront y Senior en OpenCode.

## Objetivo

Dejar a Senior como agente predeterminado y único punto de coordinación: analiza cada solicitud, la divide cuando sea necesario, escribe el plan en `docs/plans/`, delega implementación, exige revisión independiente después de cada cambio de código y registra el resultado de cada paso.

## Criterios de aceptación

- [x] Los seis agentes existen con los modelos y variantes pedidos.
- [x] Senior es el agente principal predeterminado; los trabajadores son subagentes.
- [x] DevFrontier/DevBack tienen skills de implementación adecuadas; Tester tiene skills y permisos para crear/ejecutar pruebas.
- [x] ReviewerBack y ReviewerFront tienen skills específicas, son de solo lectura y responden PASS/BLOCKED con hallazgos verificables.
- [x] Senior crea un plan por solicitud, actualiza su bitácora tras cada delegación y no declara terminado sin revisión y pruebas pertinentes.
- [x] El flujo y el enrutamiento quedan documentados en `docs/` y en las instrucciones del proyecto.
- [x] Configuración y agentes son reconocidos por OpenCode; `git diff --check` pasa.

## Tareas

1. **Inspección — completada.** Revisar estado actual, modelos/variantes, skills existentes, agentes y fuentes del proyecto. Mantener intacto el plan activo `tasks/plan.md`.
2. **Diseño — completado.** Usar los cinco roles trabajadores más Senior como agentes nuevos; mantener los seis especialistas existentes y sus gates de seguridad/arquitectura como apoyo. Usar `docs/plans/<fecha>-<slug>.md` por solicitud.
3. **Configuración y documentación — completada.** Añadir definiciones OpenCode, dejar Senior como predeterminado, formalizar permisos/gates y sincronizar `AGENTS.md` y `README.md`.
4. **Validación — completada.** `opencode debug agent` comprobó los seis modelos/modos/variantes; `opencode debug config` confirmó `default_agent=senior`; reviewers no tienen shell/escritura; Tester conserva permisos de pruebas delimitados; JSON válido y `git diff --check` limpio.

## Riesgos y decisiones

- OpenCode no tiene un campo de agente para adjuntar una lista de skills; cada prompt de agente instruirá cargar explícitamente los skills disponibles mediante el cargador de skills.
- Los reviewers deben conservar `edit: deny`; Senior solo puede editar los planes/bitácoras bajo `docs/plans/`.
- Tester puede cambiar escenarios `.bru` sintéticos, pero no editar entornos ni la configuración general de Bruno; su edición de código queda limitada a rutas de pruebas.
- La implementación de cada agente de escritura (DevFrontier, DevBack y Tester si cambia pruebas) será revisada inmediatamente por el reviewer de área antes de la siguiente asignación.
- Se preserva el plan incompleto `tasks/plan.md` y otros cambios que ya estaban en el árbol de trabajo.

## Bitácora

| Fecha | Acción | Resultado |
| --- | --- | --- |
| 2026-10-03 | Inspección de configuración, skills, fuentes del proyecto y estado Git | Completada; hay trabajo previo sin commit, preservado. |
| 2026-10-03 | Confirmación de modelos y variantes con `opencode models openai --verbose` | GPT-6 Luna admite `max`; GPT-6.1 Sol admite `xhigh` y `max`. |
| 2026-10-03 | Diseño de roles, flujo de revisión y formato de plan | Completado y aplicado; validación final PASS. |
| 2026-10-03 | Creación de los seis agentes nuevos y asignación de Senior como predeterminado | Completada; prompts enumeran skills, y los reviewers no tienen permiso de edición. |
| 2026-10-03 | Sincronización de `AGENTS.md`, `README.md` y `docs/Agent-Workflow.md` | Completada y validada en OpenCode. |
| 2026-10-03 | Validación OpenCode, modelos, permisos, JSON y diff | PASS; configuración resuelta con `default_agent=senior`, seis agentes detectados, reviewers sin bash/escritura, Tester restringido a pruebas, JSON válido y `git diff --check` limpio. |

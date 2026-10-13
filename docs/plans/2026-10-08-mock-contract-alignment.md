# Plan: alinear el contrato OpenAPI del mock

Fecha: 2026-10-08
Estado: En progreso — reanudación con los IDs Pi canónicos; verificación de arquitectura inicial
Coordinación: Senior / el Gentleman
Checklist de recuperación: odd/tasks/mock-contract-alignment.md

## Objetivo

Resolver, punto por punto, los hallazgos de la revisión del OpenAPI frente a los requisitos y ADR-002, sin convertir operaciones draft en decisiones aprobadas ni implementar el mock stateful. El JSON sigue siendo la fuente Design-First.

## Decisiones

- deliveryCounts son buckets de estado actual mutuamente excluyentes; la suma es createdInvitationCount (selección explícita de la persona usuaria).
- El expected-version de DELETE será un parámetro requerido de la operación (recomendación de arquitectura: query entero no negativo); conservar idempotencia y respuesta vacía 204.
- Agregar consulta hospitalaria minimizada de sedes activas propias; resolver institución desde sesión/membresía.
- El DTO contextual tendrá currentValues y proposedValues, ambos limitados por grant/campos.
- El token CSRF de salida se expresará como readOnly, no writeOnly.
- No se decide política de reintentos ni cuándo un fallo transitorio se vuelve terminal (AP-02).

## Alcance y no objetivos

Incluye docs/openapi.json, la documentación de reglas API que hoy contradice el schema, artefactos generados por scripts/generate-api-contract.mjs, inventario/cobertura estática de contrato y pruebas contractuales.

No incluye handlers Express, UI, tablas/RLS, email, Bruno importado, cambios de producción ni pruebas que pretendan probar autorización o concurrencia real. El flujo contextual de grants todavía no está implementado en el mock; su contrato no constituye evidencia de aplicación efectiva.

## Criterios de aceptación

1. Transición de moderación coherente con publicada -> suspendida -> sin_publicar; la publicación nueva sigue en el endpoint hospitalario versionado.
2. DELETE exige expectedVersion, informa 409 por versión obsoleta y conserva 204 sin body.
3. GET hospitalario devuelve solo sedes activas propias con campos mínimos; seguridad de servidor/RLS queda como requisito de implementación posterior.
4. Lectura contextual compara valores actuales/propuestos bajo el grant y allowlist; ningún resumen general agrega valores PII.
5. Cuatro conteos mutuamente excluyentes, ejemplo aritméticamente consistente y descripción explícita, sin cerrar AP-02.
6. Token CSRF de respuesta no usa writeOnly; ejemplo y bounds siguen.
7. Contrato válido, artefactos generados sincronizados, regresiones en RED antes del cambio y GREEN después.
8. Revisión de área PASS, auditoría de privacidad PASS y checks registrados.

## Asignaciones y secuencia

| Tarea | Dueño | Paths autorizados | Estado |
| --- | --- | --- | --- |
| T1: tests regresivos RED | pi-qa-reliability-engineer | scripts/prism-contract.test.mjs | Pendiente: verificación de arquitectura/capacidades Pi |
| T2: contrato + reglas + generación | pi-backend-data-engineer | rutas OpenAPI/tooling/generados enumeradas en checklist | Pendiente |
| T3: revisión independiente | pi-reviewer-back + pi-security-privacy-auditor | Solo lectura | Pendiente |
| T4: verificación | pi-qa-reliability-engineer | Read-only/ejecución de checks; cambios de tests solo si vuelven a revisión | Pendiente |

## Verificación

Tras cada slice: reviewer-back inmediato. Si cambia código de prueba, reviewer-back revisa antes de aceptar la prueba. Gates finales: npm run openapi:lint, npm run test:api:generator, npm run openapi:api:check, npm run test:contract, npm run typecheck. No ejecutar full E2E para un cambio solo contractual, salvo que un reviewer identifique una dependencia.

## Riesgos y límites

- Working tree/branch contiene cambios previos no relacionados, incluidos cambios en archivos de tipos/OpenAPI; los agentes solo deben editar los paths indicados y preservar su contenido previo.
- Las nuevas operaciones son draft salvo ratificación expresa. No confundir schema, Prism, generación de tipos o mock con seguridad productiva, RLS, atomicidad o concurrencia.
- La comparación contextual toca PII sensible. El esquema debe mantener el grant ligado al actor/solicitud/campos/acción, pero no demuestra enforcement.
- La importación interactiva de Bruno/Swagger no es parte del runner automatizado.

## Bitácora

- 2026-10-08: plan creado antes de cualquier cambio contractual; usuario confirmó semántica de conteos y alcance contract-only.
- Arquitectura consultada en solo lectura; seguridad/privacidad consultada en solo lectura; mapping de mock/cobertura completado.
- Delegación histórica de QA bloqueada por Ask/read-only mode: informó lecturas de instrucciones/tests, pero no escribió ni ejecutó pruebas. No hay RED ni cambios de producto.

### 2026-10-11 — Ejecución ordenada solicitada

- Plan de ejecución específico: [2026-10-11-ejecucion-mock-contract-alignment.md](2026-10-11-ejecucion-mock-contract-alignment.md). Desglosa T1–T4 en QA RED/review, dos slices backend con gates inmediatos, auditoría y QA final; conserva alcance y criterios originales.
- Lanzado `solution-architect` (E0): recomendaciones provisionales, verificación BLOQUEADA por hijo Ask/read-only sin herramientas de lectura/shell; ningún archivo modificado ni comando ejecutado.
- Lanzado `qa-reliability-engineer` (E1p, preflight solo lectura): BLOCKED por la misma falta de herramientas y modo; ningún archivo leído/modificado, ningún comando.
- No se lanzaron escritores backend ni reviewers de código sin baseline/diff. T1 continúa bloqueada; T2–T4 pendientes. No hay checkpoint, RED/GREEN ni tests ejecutados en esta reanudación.
- Cambiar solo el modo anunciado del padre no demuestra capacidades de hijos. Pendiente habilitar herramientas/mode efectivo en sesiones hijas y revalidar E0/E1p, sin evadir permisos ni tocar configuración global.

### Reanudación — perfiles Pi canónicos

- La persona usuaria solicita ejecutar este plan apoyado en el checklist ODD. Se conserva el alcance, los criterios y las decisiones originales.
- Releídos AGENTS, workflow, ambos planes y skills pertinentes. El workflow actual exige IDs `pi-*`, para evitar colisiones con perfiles OpenCode; los roles existen en `.pi/agents/`.
- Las llamadas anteriores sin prefijo son evidencia histórica de bloqueo, no una prueba de las capacidades actuales de los perfiles Pi. No se asume que el bloqueo persista ni que esté resuelto hasta comprobarlo.
- Inicio de asignación read-only a `pi-solution-architect`: verificar seis decisiones contra fuentes, baseline/fecha/runner disponibles, límites de DTO contextual y sedes; sin editar archivos ni aprobar su propia recomendación.
- Próximo paso, si herramientas y fuentes están verificadas: checkpoint no destructivo y T1 QA RED, seguido de reviewer-back inmediato. Sin escrituras productivas por Senior ni cambios de configuración.

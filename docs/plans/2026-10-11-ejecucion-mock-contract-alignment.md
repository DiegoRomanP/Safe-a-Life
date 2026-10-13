# Ejecución ordenada: alineación contractual del mock

Fecha: 2026-10-11
Estado: Bloqueada — E0 y E1p sin herramientas en las sesiones hijas. Sin cambios de código ni pruebas ejecutadas.
Coordinación: Senior
Planes de origen: [plan del 08-10](2026-10-08-mock-contract-alignment.md) y [checklist ODD](../../odd/tasks/mock-contract-alignment.md).

## Objetivo y autorización

Ejecutar las tareas QA/backend/review de los dos planes, con encargos concretos, secuencia verificable y preservación del trabajo existente. La persona usuaria pidió organizar y lanzar las tareas ordenadamente y posteriormente continuar. Se conserva la autorización anterior: solo contrato/verificación, y `deliveryCounts` como estados actuales excluyentes cuya suma es `createdInvitationCount`.

No se cambian requisitos aprobados, stack ni ADR. Solo `createHospitalNeed` está ratificado. Las demás operaciones siguen siendo borrador; definirlas aquí no es implementarlas ni aprobar seguridad productiva.

## Alcance y exclusiones

- QA, único dueño de pruebas: `scripts/prism-contract.test.mjs`.
- Backend, único dueño de contrato/tooling: `docs/openapi.json`, `docs/Api-Rules.md`, `scripts/prism-contract.mjs`.
- Generados oficiales, sin edición manual: `apps/api/src/modules/need-records/dto/openapi.ts`, `apps/api/src/modules/need-records/dto/contract.generated.json`, `apps/web/src/api/openapi.ts`, `apps/mock-api/src/api/openapi.ts`.
- Senior solo coordina y mantiene bitácoras en `docs/plans/`.
- Excluir handlers Express, UI, Bruno, persistencia, RLS real, configuración, dependencias, fuentes funcionales y ADR. No modificar ni ratificar el POST de creación de necesidad.
- No hacer reset, stage, commits de trabajo ajeno ni publicación. Crear antes de cambios no triviales un checkpoint local no destructivo de Git y una copia de los archivos propios no rastreados si los hubiera; nunca incluir secretos. Si falta shell/Git, informar el bloqueo antes de escribir código.

## Criterios de aceptación

1. Moderación usa exactamente `suspendida`/`sin_publicar`, nunca republica al levantar suspensión.
2. DELETE de política requiere query `expectedVersion` entero no negativo; conserva `Idempotency-Key`, `204` vacío y `409` por conflicto.
3. GET `/api/v1/hospitals/me/sites` expone únicamente sedes propias activas, DTO cerrado mínimo `{siteId, publicName}`; institución derivada de identidad y revalidación posterior al crear necesidad. Errores uniformes, sin selectores de hospital enviados por el cliente.
4. Consulta contextual separa `currentValues` y `proposedValues`, ambos limitados al grant actor/solicitud/donante/acción/campos. Resúmenes y auditoría siguen sin valores PII. Sin nuevas categorías de datos.
5. Conteos actuales excluyentes, no negativos y ejemplos consistentes, sin resolver AP-02 sobre reintentos/fallos.
6. Token CSRF de salida `readOnly`, no `writeOnly`, límites 32–512 intactos; no relajar schema para Prism.
7. Regresiones reproducidas en RED antes del cambio y GREEN al terminar; generación oficial y checks sincronizados.
8. PASS independiente backend y seguridad; revisión frontend de los tipos web generados si cambian. Todas las verificaciones pertinentes ejecutadas; limitaciones explícitas.

## Secuencia y dependencias

No paralelizar escrituras: contrato, inventario y tipos son compartidos. Cada asignación es un slice completo, con su diff respecto al snapshot previo; el reviewer de área se invoca inmediatamente al devolver el escritor, antes de otro escritor. Solo se pueden paralelizar lecturas independientes sobre un diff estable.

| ID | Responsable | Encargo / paths | Dependencia y gate | Estado |
| --- | --- | --- | --- | --- |
| E0 | solution-architect | Solo lectura: contrastar supuestos de los seis cambios, precisar DTO contextual/mínimo de sedes, comprobar fuentes y baseline Git/tooling | Antes de cambios contractuales; recomendación, no autoaprobación | Bloqueada: hijo Ask/read-only sin herramientas |
| E1p | qa-reliability-engineer | Preflight de capacidades del escritor: solo lectura y comandos read-only si están disponibles; sin editar tests todavía | Diagnóstico del bloqueo de herramientas, no omite E0 | Bloqueada: hijo Ask/read-only sin herramientas |
| E1 | qa-reliability-engineer | Checkpoint no destructivo; baseline; regresiones de los seis hallazgos, solo `scripts/prism-contract.test.mjs` | E0/E1p verificadas; demostrar RED por los defectos, no por imports/tooling | Pendiente |
| R1 | reviewer-back | Solo lectura: diff completo de pruebas E1, calidad, casos negativos y RED esperado | Inmediato tras E1; PASS de pruebas en fase RED no significa contrato aprobado | Pendiente |
| E2 | backend-data-engineer | Slice sensible: consulta mínima de sedes y proyección contextual grant-bound; actualizar reglas/inventario y regenerar outputs oficiales | R1 PASS; solo criterios 3/4, sin cambios de los otros cuatro | Pendiente |
| R2 | reviewer-back | Diff completo E2, requisitos, generación, regresiones enfocadas | Inmediato tras E2; corregir con autor hasta PASS | Pendiente |
| F2 | reviewer-front | Solo lectura: tipos generados web y compatibilidad de consumidores, sin exigir handlers/UI fuera de alcance | Diff estable E2; si hay cambios en tipos web | Pendiente |
| S2 | security-privacy-auditor | Solo lectura: minimización/grants/sedes/catálogos, explícito PASS o BLOCKED del contrato | Complementa R2; no sustituye R2 ni prueba RLS real | Pendiente |
| E3 | backend-data-engineer | Slice semántico: moderación, versión DELETE, deliveryCounts y CSRF; reglas/inventario y generación oficial | R2/F2/S2 PASS; criterios 1/2/5/6 | Pendiente |
| R3 | reviewer-back | Diff completo E3 y resultado final de los seis criterios | Inmediato tras E3; correcciones revisadas de nuevo | Pendiente |
| F3 | reviewer-front | Solo lectura: delta de tipos web generados y consumidores | Diff estable E3; si cambian | Pendiente |
| S3 | security-privacy-auditor | Solo lectura: delta versión/idempotencia/CSRF y regresión de restricciones de S2 | Contrato final estable; PASS o BLOCKED | Pendiente |
| E4 | qa-reliability-engineer | Único dueño de validación final; ejecutar comandos, cubrir aceptación y reportar evidencia | Revisiones pertinentes PASS; si escribe tests, reviewer-back inmediato y reejecutar afectados | Pendiente |
| E5 | Senior | Registrar cierre, cambios propios, veredictos, resultados y pendientes en este plan y el original | Todo gate pertinente PASS; no aprobar trabajo propio | Pendiente |

## Skills y formato de asignación

Todos leen `AGENTS.md`, su rol `.pi/agents/<ID>.md` y los planes relevantes; sin delegar ni hablar al usuario. Arquitectura: dominio/API/documentación. QA: TDD/API/privacidad/hardening. Backend: dominio/API/base de datos/privacidad/hardening/incremental/documentación/TDD. Reviewers: calidad y skills del área; auditor: privacidad/hardening.

Cada encargo especificará objetivo, criterios exactos, propios/excluidos, baseline/diff, dependencias, skills y checks. Reporte obligatorio: veredicto o recomendación según rol, archivos modificados, resumen por criterio, comandos/resultados con exit codes, hallazgos y limitaciones. No registrar PII, tokens, coordenadas, claves ni cuerpos de solicitudes.

## Verificación

- Descubrir stack y comandos desde `package.json`; no instalar dependencias ni cambiar lockfile.
- Baseline: Git status/diff y tests existentes antes de editar; guardar snapshot de paths autorizados para distinguir cambios previos de esta ejecución.
- RED: `node --test scripts/prism-contract.test.mjs` o equivalente oficial, con fallos enumerados por criterio. Los casos de controles ya conformes pueden pasar; no inventar fallos.
- GREEN enfocado después de cada slice; mientras queden otros hallazgos, documentar sus RED esperados sin declararlos aprobación final.
- Final: `npm run openapi:lint`, `npm run test:api:generator`, `npm run openapi:api:check`, `npm run test:contract`, `npm run typecheck` y test enfocado si el script global no lo incluye. Pruebas existentes de mock/backend afectadas por tipos según evaluación de QA/reviewers.
- No duplicar checks sobre archivos sin cambios sin razón; reutilizar evidencia válida. No atribuir a Prism garantías de auth/RLS/concurrencia. Navegador/E2E de UI no pertinente salvo dependencia descubierta.
- Verificar preservación de cambios ajenos con snapshot inicial y estado final; diff de cierre relativo al baseline, no solo HEAD.

## Riesgos y decisiones abiertas

- Modificaciones preexistentes incluso en los archivos autorizados: no reemplazarlas ni usar HEAD como única base del review.
- El padre tiene instrucciones actuales de Build; E0 informó que el hijo se inicia en Ask/read-only sin herramientas, incluso de lectura. No eludir permisos; comprobar dueño QA antes de pedir escritura.
- `subagent_run`/`skill` no se encontraron en el registro actual; las instrucciones actuales del host habilitan la herramienta nativa `subagent` con los IDs del proyecto y la carga de skills mediante `read`. No se asume que `task` exista.
- El shell PowerShell del padre no funciona en Linux y no apareció otro shell en discovery. Sin baseline/checkpoint comprobado todavía; ningún cambio de entorno global.
- AP-02/04/06/07/08 siguen abiertos. No crear reglas clínicas o de email para llenar huecos.
- Si fuentes aprobadas discrepan o una decisión cambia conducta fuera de lo aprobado, detener esa parte y consultar al usuario.

## Bitácora

### 2026-10-11 — Preparación e inicio de E0

- Nueva solicitud: organizar ejecución y asignaciones específicas a los agentes; posterior instrucción de continuar.
- Releídos `AGENTS.md`, workflow, ambos planes, requisitos normalizados, ADR-002 y contrato backend; cargadas skills de coordinación, dominio, contrato, seguridad, revisión y TDD.
- Los planes originales conservan T1 bloqueada y T2–T4 pendientes; no hay evidencia nueva de RED/implementación. Su frase «bloqueado antes de leer» es imprecisa: el QA histórico sí informó lecturas, pero no escribió ni ejecutó pruebas.
- Descubiertos los roles exactos en `.pi/agents/` y `.opencode/agent/`; el host actual autoriza delegación nativa mediante `subagent`. `subagent_run`/cargador `skill` no aparecieron.
- Dos intentos de batching de lectura fueron abortados; las lecturas directas funcionan. PowerShell rechazó ejecución en Linux; no se afirma Git limpio ni checkpoint aún.
- E0 asignado a `solution-architect`, solo lectura y recomendación; comprobar baseline Git/fechas/tooling del hijo y concretar decisiones antes de QA.

### Resultado E0 e inicio E1p

- `solution-architect` devolvió «BLOQUEADO para verificación; recomendaciones provisionales, no autoPASS de arquitectura».
- Evidencia: hijo Ask/read-only, sin herramientas de lectura o shell expuestas. Ningún archivo leído desde disco, ninguno modificado; cero comandos. Git/fecha/scripts y cambios posteriores al bloqueo histórico siguen desconocidos.
- Sus recomendaciones coinciden provisionalmente con los seis criterios, pero derivan del encargo y no de una verificación nueva de fuentes. No se cuentan como PASS ni como prueba ejecutada.
- No se crea checkpoint ni se asigna implementación backend mientras falte evidencia. Próximo paso: E1p, una comprobación exclusivamente read-only por `qa-reliability-engineer`, para distinguir falta de capacidades del consultor frente a la del dueño escritor. Si también está bloqueado, detener delegaciones dependientes y solicitar habilitar herramientas en el host de hijos.
- Engram: `mem_save` del plan de ejecución falló por binario sin soporte `instance-id` (requiere v2.0.0-rc.11+). Se conserva bitácora local; no se alteró la configuración.

### Resultado E1p y pausa obligatoria

- `qa-reliability-engineer` devolvió «BLOCKED — E1p (capacidades; no evaluación del producto)».
- Evidencia: modo efectivo Ask/read-only, ninguna herramienta invocable expuesta, ni lectura ni shell. Cero archivos leídos/modificados y cero comandos; no existen exit codes, baseline, checkpoint ni RED de esta ejecución.
- Dos roles distintos confirman el mismo bloqueo; no se asume una restricción exclusiva del consultor. No se asignaron E1/E2/E3 ni reviewers/auditor de código sin diff verificable.
- La preparación del plan y ambas delegaciones están registradas; la alineación contractual NO está completada. Solo se escribieron bitácoras en `docs/plans/`.
- Siguiente paso: habilitar modo/herramientas reales en las sesiones hijas, incluyendo lectura y shell Linux; verificar E0/E1p nuevamente y recién entonces ejecutar E1 con checkpoint, RED y review inmediato. No evadir permisos ni modificar configuración global.
- El intento de guardar en Engram el descubrimiento del bloqueo también falló por la incompatibilidad `instance-id`; seguimiento local conservado.

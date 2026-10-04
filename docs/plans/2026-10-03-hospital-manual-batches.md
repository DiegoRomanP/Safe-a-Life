# Plan de trabajo: solicitud manual de lotes hospitalarios

**Estado:** Completada — slice local sintética, cerrada mediante plan de handoff
**Fecha:** 2026-10-03
**Solicitud:** Continuar los flujos del hospital con el registro de una petición manual de lote para una necesidad propia.

## Objetivo

Habilitar la revisión del historial de peticiones de lote y el registro idempotente
de una acción manual para una necesidad activa propia, sin simular matching,
selección de donantes, entrega de email ni seguridad clínica.

## Alcance

- Implementar `GET/POST /api/v1/hospitals/me/needs/{needId}/invitation-batches`
  sobre fixtures sintéticos.
- Derivar hospital desde sesión; ocultar necesidades de otra institución con 404.
- Mutación requiere Origin, CSRF e idempotency key.
- La demostración registra un batch sintético con cero invitaciones/queued emails;
  el estado expresa únicamente que el hospital solicitó una acción manual.
- Añadir UI hospitalaria “Lotes”, explicación persistente de que no hubo matching
  ni envío y estados de carga/vacío/error.
- Probar ownership, cierre/vencimiento, replay/conflicto y ausencia de PII.

## Fuera de alcance

- Compatibilidad ABO/Rh, radio/distance, selección/ranking/cuotas/candidatos.
- Crear invitaciones reales, outbox, email o webhooks.
- Resolver AP-02/AP-04/AP-06/AP-08 ni retención/ejecución productiva.
- Persistencia real o datos personales.

## Tareas

| Tarea | Archivos | Estado |
| --- | --- | --- |
| Verificar contrato API y reglas de matching/email | `docs/openapi.json`, API Rules, matching-notifications skill | Completada |
| Escribir pruebas de ownership, active state, replay/conflict y minimización | `apps/mock-api/src/app.test.ts` | Completada — 21 pruebas API |
| Implementar records sintéticos, list y request de lote | `apps/mock-api/src/domain/model.ts`, `infrastructure/demo-state.ts`, `app.ts` | Completada |
| Tipar API client con schemas generados | `apps/web/src/api/client.ts` | Completada |
| Añadir vista y navegación “Lotes” del hospital | `apps/web/src/components/Workspace.tsx`, `apps/web/src/pages/HospitalPages.tsx` | Completada |
| Añadir Bruno/E2E con copy de límite visible | `bruno/scenarios/hospital/`, `apps/web/e2e/app.e2e.ts` | Completada |
| Revisión de seguridad/QA y ejecutar suites | revisores independientes, tests del repo | Completada — cierre en plan API JSON/mocks/frontend handoff |

## Criterios de aceptación

- [x] Un hospital solo puede listar/solicitar batches de sus necesidades.
- [x] `POST` crea un registro solo ante una necesidad propia activa y exige
  cookie/CSRF/Origin/idempotency.
- [x] Replay con la misma intención no duplica el registro; otro payload con la
  misma clave produce conflicto.
- [x] El mock devuelve 0 invitaciones/0 correos y no consulta datos de donantes.
- [x] UI dice que no se ejecutó matching ni envío; foco/responsive/error/vacío.
- [x] Pruebas relevantes y reviewers dan PASS.

## Bitácora

| Fecha | Acción | Resultado |
| --- | --- | --- |
| 2026-10-03 | Revisión de `save-a-life-matching-notifications` y contrato de batches | El POST no requiere body; el mock registrará una solicitud manual y retornará conteos cero para no fingir matching/email. |
| 2026-10-03 | Implementación/tests/Bruno/E2E | 21 pruebas API, 22 requests Bruno y 5 E2E pasan; revisión independiente pendiente. |
| 2026-10-03 | Hallazgos bloqueantes y cierre posterior | GET mutante/replay terminal/paginación/falso fallo UI corregidos y revisados en [plan handoff](2026-10-03-api-json-mocks-frontend-handoff.md), T2/T3/T4. ReviewerBack/Front PASS; seguridad PASS local, API50/web15/Bruno22/E2E10 y runner27+369 pasan. Sin matching/email/RLS reales. |

# Plan de trabajo: autoservicio de historial y solicitudes del donante

**Estado:** Completado
**Fecha:** 2026-10-03
**Solicitud:** Continuar el slice Design-First con historial propio y solicitudes de corrección/eliminación del donante.

## Objetivo

Habilitar al donante a consultar su propio historial de respuestas y crear/seguir
solicitudes de datos dentro del mock sintético, respetando el contrato OpenAPI y
sin almacenar los valores propuestos de corrección.

## Alcance

- Implementar `GET /api/v1/donors/me/responses`.
- Implementar `GET/POST /api/v1/donors/me/correction-requests` y
  `GET /api/v1/donors/me/correction-requests/{requestId}`.
- Derivar propietario desde sesión; aplicar Origin, CSRF e idempotencia en POST.
- En la creación, validar el cuerpo del contrato y conservar solo tipo/campos
  solicitados/estado/timestamps. No conservar el nombre/correo/grupo enviados.
- La UI no captura valores del usuario: envía placeholders sintéticos fijos para
  satisfacer el schema de demo; la API los descarta.
- Añadir navegación y pantallas propias de Historial y Mis solicitudes.
- Añadir pruebas negativas de propietario, `additionalProperties`, idempotencia
  y no retorno/retención de valores enviados.

## Fuera de alcance

- Decidir/aprobar/ejecutar solicitudes desde superadmin.
- Cambiar datos del perfil como efecto de la solicitud; este mock solo recibe y
  muestra su estado pendiente.
- Almacenamiento persistente o datos reales.
- AP-02/AP-04/AP-06/AP-07/AP-08 y obligaciones legales/clínicas pendientes.

## Tareas

| Tarea | Archivos | Estado |
| --- | --- | --- |
| Confirmar esquema y operaciones existentes de OpenAPI | `docs/openapi.json`, API Rules | Completada |
| Escribir pruebas de historial/solicitudes e aislamiento | `apps/mock-api/src/app.test.ts` | Completada — 20 pruebas API totales PASS |
| Implementar historia y requests minimizados en memoria | `apps/mock-api/src/domain/model.ts`, `infrastructure/demo-state.ts`, `app.ts` | Completada |
| Exponer métodos web tipados | `apps/web/src/api/client.ts` | Completada |
| Añadir Historial/Mis solicitudes al nav y formularios | `apps/web/src/components/Workspace.tsx`, `pages/DonorPages.tsx` | Completada |
| Añadir escenarios Bruno/E2E | `bruno/scenarios/donor/`, `apps/web/e2e/app.e2e.ts` | Completada — Bruno/E2E PASS |
| Ejecutar typecheck, unitarias, Bruno y E2E | suites del workspace | Completada — typecheck/build/test PASS |
| Revisar auth/PII y QA de flujo crítico | `security-privacy-auditor`, `qa-reliability-engineer`, `frontend-accessibility-engineer` | Completada — PASS |

## Criterios de aceptación

- [x] Historial devuelve solo eventos del donante autenticado y no se mezcla con
  los perfiles de otros donantes.
- [x] Solicitud de corrección/eliminación requiere Origin, CSRF e idempotency key;
  lista y detalle se limitan al propietario.
- [x] El mock almacena únicamente tipo/campos/estado/timestamps; valores de
  ejemplo no aparecen en respuesta ni estado local; el borde rechaza valores que
  no coinciden con los placeholders sintéticos del mock.
- [x] UI permite ver historial, crear ambos tipos de solicitud y seguir estado,
  con foco y anuncios accesibles.
- [x] API unit/integration, Bruno y E2E pertinentes pasan.
- [x] Revisión independiente de seguridad/privacidad, QA y frontend para este slice da PASS.

## Bitácora

| Fecha | Acción | Resultado |
| --- | --- | --- |
| 2026-10-03 | Revisión del OpenAPI y schemas `OwnResponseHistoryEnvelope`/`CreateCorrectionRequest` | El contrato ya define requested-fields allowlist y respuesta sin valores anteriores/nuevos; no se modifica el contrato. |
| 2026-10-03 | Tests-first para historial, propietario y creación minimizada de solicitud | Casos RED en endpoints aún no implementados. |
| 2026-10-03 | Mock, cliente y UI | Historial guarda eventos inmutables; solicitudes guardan solo field labels y respuesta pending; valores sintéticos se descartan. |
| 2026-10-03 | Cierre de pruebas de abuso y no-retención | Lista ajena vacía, DELETE de historial 404 y valores no-allowlisted 422; replay deja un solo registro. |
| 2026-10-03 | Bruno/E2E y verificación | Bruno 20 requests/test hooks; Playwright incluye historial, corrección, eliminación y retry de solicitudes; API/typecheck/build PASS. |
| 2026-10-03 | Revisión independiente de seguridad y QA | PASS; se acotaron los valores propuestos a literales sintéticos exactos y se probaron aislamiento, retries y estados. |

## Verificaciones

- `npm run test:api` — 20 pruebas PASS.
- `npm run test --workspace @save-a-life/web` — 1 prueba PASS.
- `npm run test:bruno` — 20 requests/tests PASS.
- `npm run test:e2e` — 5 pruebas PASS.
- `npm run typecheck`, `npm run build`, OpenAPI lint y `npm run audit:production` — PASS.

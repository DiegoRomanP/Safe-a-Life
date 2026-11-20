# Frontend: solicitudes de corrección del donante contra el backend real (F5)

Rama `feat/frontend-donante-solicitudes` (desde `feat/frontend-hospital-real`). Plan maestro: `/home/diego/.claude/plans/mira-lo-que-veo-eventual-karp.md`.

## Alcance
`listOwnCorrectionRequests` y `createOwnCorrectionRequest` (ratificadas, F7 privacidad) dejan de ser demo en memoria. `getOwnCorrectionRequest` no tiene pantalla de detalle. Invitaciones, respuesta e historial del donante siguen en demo hasta F6/F7.

## Qué cambió
- `lib/api/correctionRequest.ts`: validador `CorrectionRequestSummary` compartido con superadmin (antes duplicado en `superadmin/api.ts`).
- `features/donor/api.ts`: `fetchOwnRequests` (todas las páginas) y `createOwnRequest` (CSRF + Idempotency-Key).
- `DonorDemoContext`: `listRequests`/`createRequest` reales; la alta recarga la lista.
- `test/donorApi.ts`: el backend simulado sirve las solicitudes (CSRF, Idempotency-Key, `readStatus`/`writeStatus`).

## Verificación
`npm run lint` (0 errores), 326/326 tests del frontend, build OK. `fetch` simulado: **no prueba cookies ni el backend real**.

## Pendiente
- Revisión independiente (reviewer-front) de F5: **no realizada**.
- Smoke real con cuenta de donante y Bruno contra el backend (F8).
- Aprobación del usuario para cerrar el módulo.

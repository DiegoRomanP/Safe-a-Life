# Frontend: invitaciones y respuestas contra el backend real (F7)

Rama `feat/frontend-invitaciones` (desde `feat/frontend-donante-solicitudes`, que ya incluye F6 del backend). Plan maestro: `/home/diego/.claude/plans/mira-lo-que-veo-eventual-karp.md`.

## Alcance
- **Donante:** `listOwnInvitations`, `getOwnInvitation`, `changeOwnInvitationResponse`, `listOwnResponseHistory` reales. `DonorDemoContext` ya no tiene datos demo (el nombre se conserva por el selector de escenarios heredado, que se retira del layout). Se quita el aviso «Datos de ejemplo» de toda el área.
- **Enlace del correo** (`/invitaciones#token`): `getInvitationActionPreview` al abrir (sin efectos) y `recordInitialInvitationResponse` solo al pulsar el botón; 404 → no disponible, 410 → «ya no admite respuestas», otro fallo → reintentar.
- **Hospital:** páginas reales de **lotes** (`listOwnInvitationBatches`, `requestInvitationBatch`) y **respuestas** (`listOwnNeedResponses`), que sustituyen a `ComingSoonPage`. Las confirmadas muestran nombre y grupo *declarado*; las demás, solo código, estado y entrega; una clave de más en la respuesta hace fallar la lectura.

## Verificación
`npm run lint` (0 errores), 334/334 tests del frontend, build OK. Los tests usan `fetch` simulado (`src/test/donorApi.ts`, `hospitalApi.ts`, `InvitationLinkPage.test.tsx`): **no prueban cookies reales ni el backend**. El backend de estas rutas sí se verificó con Bruno CLI real (F6-5b).

## Atajos y límites
- Sin botón de reintento de entrega en la cola del superadmin (`delivery_failure`): la operación existe en el backend; falta pantalla.
- Sin estado «ocupado» uniforme en todos los botones (solo los nuevos lo llevan).
- Las listas del donante recargan todo tras cada cambio (sin invalidación fina).
- Falta E2E (Playwright) con cuentas sintéticas: F8.
- Sin revisión independiente (reviewer-front) de F7.

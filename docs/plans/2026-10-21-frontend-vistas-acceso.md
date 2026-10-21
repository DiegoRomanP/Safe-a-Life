# Plan: vistas de acceso del frontend real

| Campo | Valor |
| --- | --- |
| Estado | En curso |
| Fecha | 2026-10-21 |
| Rama | `feat/frontend-vistas-acceso` (desde `main` en `503bea7`) |
| Plan padre | [`2026-10-20-frontend-estructura-por-componentes.md`](2026-10-20-frontend-estructura-por-componentes.md) |
| Decisiones | D-4, ADR-004, RNF-SEC-13, versión «+» de Penpot, prioridad de escritorio |
| Gate | `reviewer-front` independiente del autor y revisión visual a 1440 px |

## 1. Alcance

| Vista | Ruta | Operaciones del contrato (sin llamar todavía, D-4) |
| --- | --- | --- |
| AUTH-02 Registro, paso 1 | `/registro` | `createDonorRegistration` (correo y contraseña de 12 a 128 caracteres) |
| AUTH-03 Reclamar cuenta asistida | `/activar-cuenta#token` | `getAssistedActivationPreview`, `claimAssistedRegistration` |
| AUTH-04 Recuperar acceso | `/recuperar-acceso` | `requestPasswordRecovery` |
| AUTH-04 Completar recuperación | `/restablecer-contrasena#token` | `completePasswordReset` |
| AUTH-05 MFA y step-up | `/verificar-identidad` | `verifyMfaChallenge`, `verifyStepUp` (código `^[0-9]{6,8}$`) |

Las rutas con token coinciden con las de los correos del backend
(`backend/src/modules/email-delivery/templates/common.ts`). El botón
«Reclamar alta asistida» de PUB-01 pasa a `/activar-cuenta`.

Excluido:

- Llamadas HTTP.
- `/verificar-correo` y los pasos 2 a 4 del registro. El contrato los separa
  en `verifyDonorEmail` y `completeDonorOnboarding` (DON-01), y van con el
  slice del donante.
- LINK-01, vistas de donante y diseño móvil específico.

## 2. Decisiones

- **AUTH-02 hasta el paso 1.** Penpot («+») muestra un asistente de 4 pasos
  que mezcla registro y perfil. El contrato solo recibe correo y contraseña al
  registrar; nombre, grupo, disponibilidad y ubicación van después de verificar
  el correo. Se mantiene el indicador de 4 pasos con el paso 1 activo.
- **Composición «+».** AUTH-01 a AUTH-04 comparten `AuthShell`: aside petróleo
  con marca, título, detalle y contenido propio, más la tarjeta en la columna
  principal. AUTH-05 usa un encabezado mínimo con «Acceso administrativo», como
  en Penpot.
- **Tokens en el fragmento.** Al montar una vista con `#token`, el token se lee
  una vez, se guarda en memoria y se borra de la dirección con
  `history.replaceState`. No se registra ni se muestra.
- **Selector de estados solo en desarrollo.** Sin backend no se sabe si un
  enlace es válido, usado, vencido o inválido. En `npm run dev:frontend`
  (`import.meta.env.DEV`) AUTH-03 muestra un selector para ver los cuatro
  estados. No aparece en el build.
- **Sin envío.** Los formularios validan en el cliente y, al enviar, muestran
  el resultado neutral o un aviso de que la conexión llega con el backend.

## 3. Criterios de aceptación

- Textos de Penpot («+», y «SaL» cuando no hay versión «+»), sin promesas
  clínicas.
- Recuperación de acceso con resultado neutral que no revela si la cuenta
  existe.
- Un `h1` por vista, foco al primer error y foco blanco sobre petróleo.
- `autocomplete` correcto: `new-password` y `one-time-code`. El código usa
  `inputmode="numeric"`.
- Sin overflow a 320 px. Composición de Penpot a 1440 px.
- Pasan `npm run lint`, `npm run test` y `npm run build`.

## 4. Bitácora

- 2026-10-21: plan aprobado por la persona usuaria.

# Plan: vistas secundarias del donante

| Campo | Valor |
| --- | --- |
| Estado | En curso |
| Fecha | 2026-10-21 |
| Rama | `feat/frontend-donante-secundarias` (desde `main` en `38892dc`) |
| Plan previo | [`2026-10-21-frontend-vistas-donante.md`](2026-10-21-frontend-vistas-donante.md) |
| Decisiones | D-4, versión «+» de Penpot (contenido «SaL» cuando no hay «+»), prioridad de escritorio |
| Gate | `reviewer-front` independiente del autor y revisión visual a 1440 px |

## 1. Alcance

La persona usuaria pidió terminar el área del donante en esta iteración.

| Vista | Ruta | Operaciones del contrato (sin llamar todavía, D-4) |
| --- | --- | --- |
| AUTH-02 paso 2, verificar correo | `/verificar-correo#token` | `getDonorEmailVerificationPreview`, `verifyDonorEmail` |
| DON-01 Bienvenida y onboarding (pasos 2 a 4 del registro) | `/donante/bienvenida` | `completeDonorOnboarding` |
| DON-05 Nueva solicitud | `/donante/solicitudes/nueva` | `createOwnCorrectionRequest` |
| LINK-01 Enlace de invitación del correo | `/invitaciones#token` | `getInvitationActionPreview`, `recordInitialInvitationResponse` |
| Confirmar cambio de correo | `/cambiar-correo#token` | `getEmailChangePreview`, `verifyEmailChange` |

Las rutas con token coinciden con `ROUTES` de
`backend/src/modules/email-delivery/templates/common.ts`. El login suma, solo
en desarrollo, «Entrar como donante nuevo», que lleva al onboarding.

## 2. Decisiones

- **Abrir un enlace no consume el token.** Cada vista con token muestra primero
  la vista previa (GET) y solo con un botón explícito hace la acción (POST),
  como piden el contrato y `Frontend-Handoff.md`. El token se lee del
  fragmento y se borra de la dirección (`useFragmentToken`).
- **LINK-01 desde el correo:** el token ya trae la acción (`intendedAction`) y
  `recordInitialInvitationResponse` no acepta otra. La vista muestra un solo
  botón con esa acción y ofrece cambiar la respuesta desde la cuenta.
- **Onboarding:** pide los cuatro campos obligatorios de
  `completeDonorOnboarding`: nombre, grupo declarado, disponibilidad y
  ubicación con hasta tres decimales.
- **Nueva solicitud:** sigue el contrato (`oneOf`).
  - Corrección: nombre y/o grupo nuevos, con al menos uno.
  - Cambio de correo: correo nuevo.
  - Eliminación: sin datos, con una confirmación explícita antes de enviar.
  - El texto de `Frontend-Design.md` sobre «placeholders sintéticos fijos» se
    refería al mock. El contrato ratificado (F7) recibe los valores nuevos, y
    la UI solo pide los campos que se corrigen.
- **Estados de enlace en desarrollo:** se reutiliza `DevStatusPicker`.

## 3. Criterios de aceptación

- Mismos criterios que los planes previos: un `h1` por vista, foco al primer
  error o al resultado, `aria-live` sin regiones anidadas, fechas con zona,
  «intención de asistir» y sin promesas clínicas.
- El token nunca se pinta ni se registra.
- Sin overflow a 320 px. Composición de Penpot a 1440 px.
- Pasan `npm run lint`, `npm run test` y `npm run build`.

## 4. Bitácora

- 2026-10-21: alcance acordado con la persona usuaria.

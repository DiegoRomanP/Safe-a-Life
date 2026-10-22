# Plan: vistas secundarias del donante

| Campo | Valor |
| --- | --- |
| Estado | Implementado; gate PASS de reviewer-front (segunda ronda) |
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

## 4. Revisión

`reviewer-front` (subagente independiente, solo lectura):

1. **Primera ronda: BLOCKED.**
   - **B1:** LINK-01 mostraba «Componente: Glóbulos rojos (RBC)», un dato que
     `InvitationActionPreview` no entrega, en una vista sin sesión.
   - **B2:** el enlace vencido de `/verificar-correo` pedía una invitación al
     hospital, aunque en el registro propio no interviene un hospital.
2. **Corrección `2522e5b`.**
   - LINK-01 muestra solo los campos de la vista previa.
   - El enlace vencido pide registrarse otra vez.
   - El aviso de LINK-01 depende de la acción.
   - Nueva solicitud valida el tipo que llega por estado de navegación.
3. **Segunda ronda: PASS** sobre los 6 commits del slice.

Observaciones pendientes:

- **Para decidir con la persona usuaria:** la disponibilidad inicial del
  onboarding arranca en «Disponible»; conviene decidir si debe arrancar en «No
  disponible» o sin elegir.
- El error de una corrección vacía solo marca el campo Nombre.
- La ayuda de ubicación no se enlaza con `aria-describedby` a latitud y
  longitud (también en DON-02).
- Un aviso enfocado dentro de `aria-live` puede leerse dos veces en algunos
  lectores de pantalla.
- El detalle de invitación con sesión (slice anterior) muestra «Glóbulos rojos
  (RBC)», que `getOwnInvitation` tampoco entrega como campo. Hay que revisarlo
  con el cliente HTTP.

Verificación del autor a 1440 px: `/donante/bienvenida`,
`/donante/solicitudes/nueva` y `/invitaciones#token`, con el token borrado de
la dirección. Las entradas de desarrollo no están en `dist`. No verificado:
lector de pantalla real, E2E y gitleaks local; el revisor buscó literales
largos en el diff.

## 5. Bitácora

- 2026-10-21: alcance acordado con la persona usuaria.
- 2026-10-21: vistas implementadas, con 133 pruebas, lint y build en verde.
  Gate PASS en la segunda ronda. Con esto se completa el área del donante de
  la página 01 de Penpot.

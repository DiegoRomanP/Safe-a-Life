# Plan: vistas principales del donante

| Campo | Valor |
| --- | --- |
| Estado | En curso |
| Fecha | 2026-10-21 |
| Rama | `feat/frontend-vistas-donante` (desde `feat/frontend-vistas-acceso`; se rebasa sobre `main` cuando ese PR se fusione) |
| Plan padre | [`2026-10-20-frontend-estructura-por-componentes.md`](2026-10-20-frontend-estructura-por-componentes.md) |
| Decisiones | D-4, versión «+» de Penpot, prioridad de escritorio, primero lo principal |
| Gate | `reviewer-front` independiente del autor y revisión visual a 1440 px |

## 1. Contexto

La persona usuaria pidió terminar la parte del usuario de la página «01 -
Público y donante» empezando por lo principal: vistas y recorrido navegable.
Lo secundario queda para después: onboarding, confirmación de correo, crear
solicitud, enlace del correo y estados especiales.

## 2. Alcance

| Vista | Ruta | Operaciones del contrato (sin llamar todavía, D-4) |
| --- | --- | --- |
| AppLayout del donante | `/donante/*` | — |
| DON-03 Invitaciones | `/donante/invitaciones` | `listOwnInvitations` |
| Detalle de invitación (diseño de LINK-01) | `/donante/invitaciones/:invitationId` | `getOwnInvitation`, `changeOwnInvitationResponse` |
| DON-02 Mi perfil | `/donante/perfil` | `getOwnDonorProfile`, `updateOwnDonorParticipation` |
| DON-04 Historial de respuestas | `/donante/historial` | `listOwnResponseHistory` |
| DON-05 Mis solicitudes | `/donante/solicitudes` | `listOwnCorrectionRequests` |

Para recorrer sin backend:

- El login muestra, solo en desarrollo, «Entrar como donante de prueba».
- El área del donante usa datos sintéticos en memoria con la forma del
  contrato. Responder una invitación actualiza la lista y el historial;
  cambiar la disponibilidad actualiza el perfil. Al recargar vuelve al estado
  inicial.

## 3. Decisiones por diferencias entre Penpot y el contrato

- **Historial:** `listOwnResponseHistory` solo devuelve cambios de respuesta.
  Los eventos «Invitación recibida» y «Disponibilidad pausada» de Penpot no se
  muestran.
- **Ubicación:** el contrato usa `latitude` y `longitude`. Se editan como dos
  números de hasta tres decimales, en lugar del texto «San Borja · Punto
  SB-014».
- **LINK-01:** el enlace del correo (`/invitaciones#token`) ya trae la acción
  y no admite elegir otra (`recordInitialInvitationResponse`). El diseño de
  Penpot, con dos botones, se usa para el detalle dentro de la cuenta, donde
  `changeOwnInvitationResponse` sí permite confirmar o rechazar. La vista del
  enlace queda como secundaria.
- **Solicitudes:** el código visible («SOL-7F21») sale del inicio del
  `requestId`. El tipo se describe con `type` y `requestedFields`. El botón
  «Nueva solicitud» queda para el slice secundario de crear solicitud.
- **DON-04** existe solo en la versión «SaL» y toma el estilo «+».

## 4. Criterios de aceptación

- `AppLayout` con «Saltar al contenido», `nav` con nombre, ruta activa con
  `aria-current` e indicador visible, y foco blanco sobre petróleo.
- Fechas absolutas con zona horaria («24 sep 2026, 18:00 · Lima, UTC−5»).
- «Intención de asistir», nunca donación ni asistencia confirmada. Sin
  promesas clínicas.
- Datos mínimos: sin contacto ni datos de otras personas.
- Un `h1` por vista y resultados anunciados con `aria-live`.
- Pasan `npm run lint`, `npm run test` y `npm run build`.

## 5. Bitácora

- 2026-10-21: alcance acordado con la persona usuaria («lo principal»).

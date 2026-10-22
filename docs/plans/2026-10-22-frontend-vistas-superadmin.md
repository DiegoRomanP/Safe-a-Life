# Plan: vistas del superadmin

| Campo | Valor |
| --- | --- |
| Estado | En curso |
| Fecha | 2026-10-22 |
| Rama | `feat/frontend-vistas-superadmin` (desde `main` en `438a66b`) |
| Plan padre | [`2026-10-20-frontend-estructura-por-componentes.md`](2026-10-20-frontend-estructura-por-componentes.md) |
| Decisiones | D-4, versión «+» de Penpot (SA-03 solo existe en «SaL»), prioridad de escritorio |
| Gate | `reviewer-front` independiente del autor y revisión visual a 1440 px |

## 1. Alcance

Página «03 - Superadmin» de Penpot completa.

| Vista | Ruta | Operaciones del contrato (sin llamar todavía, D-4) |
| --- | --- | --- |
| AppLayout del superadmin | `/superadmin/*` | — |
| SA-01 Tareas | `/superadmin` | `listSuperadminTasks` |
| SA-02 Hospitales | `/superadmin/hospitales` | `listHospitals`, `createHospital`, `updateHospital` |
| SA-03 Sedes | `/superadmin/sedes` | `listHospitalSites`, `createHospitalSite`, `updateHospitalSite` |
| SA-04 Administradores | `/superadmin/administradores` | `listHospitalMemberships`, `inviteHospitalAdmin`, `revokeHospitalMembership` |
| SA-05 Solicitudes | `/superadmin/solicitudes`, `/superadmin/solicitudes/:requestId` | `listCorrectionRequests`, `getCorrectionRequest`, `createContextualAccessGrant`, `getContextualDonorData`, `decideCorrectionRequest`, `executeApprovedCorrectionRequest` |
| SA-06 Configuración | `/superadmin/configuracion` | `getSuperadminConfiguration`, `setFinalDemoAt` |
| SA-07 Auditoría | `/superadmin/auditoria` | `listAuditEvents` |

El login suma, solo en desarrollo, «Entrar como superadmin de prueba». El login
propio por rol no está en Penpot y queda como decisión pendiente de la persona
usuaria.

## 2. Step-up

El contrato exige AAL2 y step-up reciente (5 minutos) para `updateHospital`,
`inviteHospitalAdmin`, `revokeHospitalMembership`,
`createContextualAccessGrant`, `executeApprovedCorrectionRequest` y
`setFinalDemoAt`. Un componente `StepUpPanel` (estilo de AUTH-05) pide el
código antes de esas acciones. En la demo la verificación queda vigente 5
minutos en memoria.

## 3. Decisiones por diferencias entre Penpot y el contrato

- **SA-01:** los contadores salen de `kind` (`correction_request`,
  `hospital_review`, `recognition_policy`, `delivery_failure`). Las políticas
  de reconocimiento son borrador en el contrato: se cuentan, pero no tienen
  vista.
- **SA-02:** no hay «Última actualización». Se muestran razón social,
  autorización y fecha de creación. Sedes y administradores se cuentan desde
  sus propias listas.
- **SA-04:** no hay nombre, MFA ni último acceso. Se muestra `emailHint`,
  hospital y estado. Revocar exige motivo.
- **SA-05:** la solicitud no trae código de donante ni motivo de quien la
  creó. Los valores actuales y propuestos solo se ven tras step-up y grant
  contextual (10 minutos). Aprobar o rechazar exige motivo; ejecutar solo
  aplica a solicitudes aprobadas.
- **SA-06:** solo `finalDemoAt` e `isImmutable`. Los textos de matriz, entorno
  y límites de Penpot no se pueden verificar contra el contrato y quedan
  fuera.
- **SA-07:** el contrato no filtra en el servidor (solo `limit` y `cursor`).
  Los filtros de evento y resultado se aplican sobre los eventos cargados.

## 4. Criterios de aceptación

- Los mismos de los planes previos: un `h1` por vista, foco al primer error o
  al resultado, sin soltar el foco al body, `aria-live` sin regiones anidadas,
  fechas con zona horaria, sin datos fuera del contrato y datos de demo
  coherentes.
- El superadmin no navega el padrón de donantes (Frontend-Design.md).
- Pasan `npm run lint`, `npm run test` y `npm run build`.

## 5. Bitácora

- 2026-10-22: plan aprobado por la persona usuaria.

# Plan: vistas del superadmin

| Campo | Valor |
| --- | --- |
| Estado | Implementado; gate PASS de reviewer-front (segunda ronda) |
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
- **SA-05, grants:** se sigue `CreateAccessGrantRequest`.
  - Ver los valores de una corrección pendiente pide motivo, step-up y un
    grant `review` con los campos pedidos.
  - Ejecutar una solicitud aprobada pide motivo, step-up y un grant `execute`
    antes de `executeApprovedCorrectionRequest`.
  - En estados terminales no se ofrece consultar datos, y decidir o ejecutar
    revoca el grant.
  - **Punto abierto:** el contrato exige al menos un campo en `allowedFields`
    y no define cuál usar para una eliminación. La demo usa los tres (`name`,
    `email`, `declaredBloodType`); hay que confirmarlo con el responsable del
    backend.
- **SA-01, fallos de entrega:** la demo no siembra tareas
  `delivery_failure`, porque reintentar el envío (`retryInvitationDelivery`)
  no tiene vista todavía.
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

## 5. Revisión

`reviewer-front` (subagente independiente, solo lectura):

1. **Primera ronda: BLOCKED.**
   - **B1:** el grant y la ejecución no seguían `CreateAccessGrantRequest`.
     Faltaban motivo, acción y campos, y se ejecutaba sin grant `execute`.
   - **B2:** una solicitud cerrada ofrecía consultar datos y el aviso no se
     correspondía con la vista.
   - **B3:** la tarea «Fallo de entrega» no se podía resolver.
2. **Corrección `be26c58`.** Grants con motivo, campos y acción; sin consulta
   en estados terminales; sin fallos de entrega en la demo. Observaciones
   aplicadas:
   - el propósito del step-up se asocia al código;
   - los motivos quedan en la auditoría;
   - los códigos opacos de la demo son únicos.
3. **Segunda ronda: PASS** sobre los 9 commits. Después del PASS se aplicaron,
   sin revisión aparte, en `d44e68b`: el motivo de consulta obligatorio con su
   ayuda, dos aserciones restituidas y un código de demo alineado.

Observaciones pendientes:

- El grant vence solo cuando la vista vuelve a renderizar.
- Una segunda acción con el panel de step-up abierto reemplaza a la primera.
- SA-06 acepta una fecha final en el pasado.
- SA-01 no genera tareas para lo que se crea.
- SA-03 permite crear sedes de hospitales no autorizados.
- Faltan pruebas de vencimiento (5 y 10 minutos) y de cancelar el step-up en
  SA-04, SA-05 y SA-06.

No verificado: composición a 1440 px (el panel del navegador era pequeño),
lector de pantalla real y E2E.

## 6. Bitácora

- 2026-10-22: plan aprobado por la persona usuaria.
- 2026-10-22: SA-01 a SA-07 implementadas, con 190 pruebas, lint y build en
  verde. Gate PASS en la segunda ronda.

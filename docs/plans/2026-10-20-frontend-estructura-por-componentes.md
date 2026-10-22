# Plan: estructura por componentes del frontend real

| Campo | Valor |
| --- | --- |
| Estado | Aprobado por la persona usuaria; slice 1 (estructura) en curso |
| Fecha | 2026-10-20 |
| Rama | `chore/frontend-estructura` (desde `main` en `529594b`) |
| Fuente de diseño | Archivo Penpot `Save_a_Life.penpot` (export 2026-10-20, Penpot 2.18.4); no se versiona en el repo |
| Decisiones | ADR-001 (TypeScript, React 18, Tailwind), ADR-004 (mismo origen, cookies, CSRF), D-4 del plan maestro del backend |
| Gate | `reviewer-front` independiente del autor, por slice |

## 1. Contexto

`frontend/` ya es el workspace `@save-a-life/frontend` con una base sin vistas
([`2026-10-19-frontend-typescript-base.md`](2026-10-19-frontend-typescript-base.md)).
El diseño de las vistas está en Penpot. Este plan ordena el trabajo **antes de
escribir lógica**: inventario de vistas, componentes compartidos, estructura de
carpetas y orden de slices.

D-4 del plan maestro del backend condiciona la integración del frontend con el
backend real a que estén las ocho capacidades. Hasta entonces, los componentes se
construyen con entradas tipadas y se prueban con ejemplos del contrato, como
indica [`Frontend-Handoff.md`](../Frontend-Handoff.md).

## 2. Decisiones de diseño (2026-10-20)

- **Tipografía:** Manrope y Newsreader, las ya instaladas y descritas en
  [`Frontend-Design.md`](../Frontend-Design.md). Penpot usa Source Sans 3; esa
  diferencia se acepta.
- **Versión de las vistas:** se toma la versión original de Penpot (marca «+»)
  de las páginas 01 a 04. La versión «SaL» (OpenDesign) no es la referencia.
- **Colores, espaciado y radios:** los de Penpot coinciden con los tokens de
  `frontend/src/styles.css`. Espaciado 4–48 px y radios 4/8/12/16 px.
- **Vistas solo en «SaL»:** las 7 vistas que no existen en la versión «+» (§3,
  columna «Versión») toman su contenido de «SaL» con el estilo de «+», para que
  todo sea coherente.
- **Tipos del contrato:** `frontend/` los genera con su propio script,
  `openapi:types` en `frontend/package.json`, que llama a `openapi-typescript`
  (ya fijado en la raíz) sobre `../docs/openapi.json` y escribe
  `frontend/src/api/openapi.ts`. Solo lee el contrato. No se modifica
  `scripts/generate-api-contract.mjs`, que mantiene el responsable del backend.
  Si cambia el contrato, se regenera; un tipo desactualizado aparece como error
  de typecheck en `frontend/`. Centralizarlo en el generador queda como opción
  futura del responsable del backend.

## 3. Inventario de vistas

27 vistas. Tamaños de referencia: 320×800, 360×800, 768×1024, 1024×768 y
1440×900. Todas las operaciones listadas están ratificadas en
`docs/openapi.json`.

| Grupo | Vista | Versión | Operaciones |
| --- | --- | --- | --- |
| Público | PUB-01 Inicio público | + | ninguna |
| Auth | AUTH-01 Inicio de sesión | + | `getCsrfToken`, `createSession`, `getCurrentSession`, `deleteCurrentSession` |
| Auth | AUTH-02 Registro de donante | + (4 pasos) | `createDonorRegistration`, `getDonorEmailVerificationPreview`, `verifyDonorEmail` |
| Auth | AUTH-03 Reclamar cuenta asistida (válido, usado, vencido, inválido) | SaL | `getAssistedActivationPreview`, `claimAssistedRegistration` |
| Auth | AUTH-04 Recuperar acceso y solicitud neutral | SaL | `requestPasswordRecovery`, `completePasswordReset` |
| Auth | AUTH-05 MFA y step-up | + | `enrollMfaFactor`, `verifyMfaChallenge`, `verifyStepUp` |
| Enlace | LINK-01 Responder invitación | + | `getInvitationActionPreview`, `recordInitialInvitationResponse` |
| Donante | DON-01 Onboarding | SaL | `completeDonorOnboarding` |
| Donante | DON-02 Mi perfil | + | `getOwnDonorProfile`, `updateOwnDonorParticipation` |
| Donante | DON-03 Invitaciones | + | `listOwnInvitations`, `getOwnInvitation`, `changeOwnInvitationResponse` |
| Donante | DON-04 Historial de respuestas | SaL | `listOwnResponseHistory` |
| Donante | DON-05 Mis solicitudes y crear solicitud | + / SaL | `listOwnCorrectionRequests`, `createOwnCorrectionRequest`, `getOwnCorrectionRequest` |
| Hospital | HOS-01 Resumen operativo | + | `listOwnHospitalNeeds` |
| Hospital | HOS-02 Crear necesidad | + | `listOwnHospitalSites`, `createHospitalNeed` |
| Hospital | HOS-03 Detalle de necesidad | + | `getOwnHospitalNeed`, `transitionOwnHospitalNeed` |
| Hospital | HOS-04 Lotes y entregas | + | `listOwnInvitationBatches`, `requestInvitationBatch` |
| Hospital | HOS-05 Respuestas opacas | + | `listOwnNeedResponses` |
| Hospital | HOS-06 Altas asistidas | + | `listOwnAssistedSignups`, `createAssistedSignup`, `getOwnAssistedSignup`, `reissueAssistedActivationLink` |
| Superadmin | SA-01 Bandeja de tareas | + | `listSuperadminTasks` |
| Superadmin | SA-02 Hospitales autorizados | + | `listHospitals`, `createHospital`, `getHospital`, `updateHospital` |
| Superadmin | SA-03 Sedes autorizadas | SaL | `listHospitalSites`, `createHospitalSite`, `updateHospitalSite` |
| Superadmin | SA-04 Administradores | + | `listHospitalMemberships`, `inviteHospitalAdmin`, `retryInvitationDelivery`, `revokeHospitalMembership` |
| Superadmin | SA-05 Resolver solicitud | + | `listCorrectionRequests`, `getCorrectionRequest`, `decideCorrectionRequest`, `getContextualDonorData`, `executeApprovedCorrectionRequest`, `createContextualAccessGrant` |
| Superadmin | SA-06 Configuración | + | `getSuperadminConfiguration`, `setFinalDemoAt` |
| Superadmin | SA-07 Auditoría | + | `listAuditEvents` |
| Sistema | SYS-01 Acceso neutro | + | ninguna |
| Sistema | SYS-02 Red no disponible | + | ninguna |

La invitación de administradores de hospital (`getHospitalAdminInvitationPreview`,
`claimHospitalAdminInvitation`) y el cambio de correo del donante
(`getEmailChangePreview`, `verifyEmailChange`) no tienen vista propia en Penpot.
Reutilizan la vista de enlace con token de AUTH-03.

## 4. Componentes compartidos

Los únicos componentes definidos en Penpot son los 4 botones. El resto se deduce
de lo que se repite entre vistas.

- **UI base** (`components/ui/`): `Button` (primario, secundario, fantasma,
  peligro), `Field`, `Input`, `Select`, `Alert` (info, aviso, error), `Badge`
  de estado, `Card`, `StatCard`, `Stepper`, `Table`, `Pagination`.
- **Layout** (`components/layout/`): `PublicLayout` (header con Ingresar y
  Registrarme), `AppLayout` (barra lateral por rol, «Saltar al contenido»,
  «Cerrar sesión»), `DemoBanner` («Prototipo académico · Datos sintéticos»).
- **Estados** (`components/states/`, de la «Galería de estados»): `Loading`,
  `EmptyState`, `SuccessNotice`, `ConflictNotice`.
- **Dominio:** `TokenStatusView` (AUTH-03, LINK-01 y los demás enlaces con
  token) y `CodeInput` (MFA y step-up).

Reglas:

- Los componentes de `components/` y `features/*/components/` no hacen HTTP.
  Reciben datos por props tipadas y avisan con callbacks.
- Las páginas (`features/*/pages/`) llaman al backend y entregan
  `data`/`loading`/`error` a los componentes.
- Cada componente se prueba con carga, vacío, error y datos del contrato; con
  teclado y foco; y sin overflow a 320 y 390 px. Errores seguros y sin PII.
- El código pasa `npm run lint` (ESLint con `jsx-a11y`) y el typecheck.

## 5. Estructura de carpetas

```
frontend/src/
  app/            App, router y providers
  api/            cliente HTTP, CSRF, errores y tipos del contrato
  auth/           sesión y guards por rol, AAL2 y step-up
  components/
    ui/
    layout/
    states/
  features/
    public/       PUB-01
    auth/         AUTH-01 a AUTH-05
    invitation/   LINK-01
    donor/        DON-01 a DON-05
    hospital/     HOS-01 a HOS-06
    superadmin/   SA-01 a SA-07
    system/       SYS-01 y SYS-02
  styles/         tokens y estilos globales
  test/           fixtures sacados de los ejemplos del contrato
```

Cada `features/<grupo>/` tendrá `pages/`, `components/` y `api.ts`, con las
pruebas al lado de cada archivo. En este slice solo se crean las carpetas con
`.gitkeep`. `App.tsx`, `main.tsx` y `styles.css` se mueven cuando un slice los
necesite.

## 6. Orden de slices

Una rama y un PR a `main` por slice.

1. `chore/frontend-estructura`: este plan y las carpetas vacías.
2. `feat/frontend-api-client`: script `openapi:types` de `frontend/`, cliente
   HTTP, CSRF y sesión.
3. `feat/frontend-ui-base`: componentes de `ui/` y `states/` con pruebas.
4. `feat/frontend-layout-router`: router, layouts, guards, SYS-01 y SYS-02.
5. `feat/frontend-auth`: AUTH-01, AUTH-04 y AUTH-05.
6. `feat/frontend-hospital`: HOS-01 a HOS-03, después HOS-04 a HOS-06.
7. `feat/frontend-donor`: DON-01 a DON-05, AUTH-02, AUTH-03 y LINK-01.
8. `feat/frontend-superadmin`: SA-01 a SA-07.

Dependencias como `react-router-dom` se agregan en el slice que las usa, con
versión fijada (ADR-002).

## 7. Fuera de alcance

Integración con el backend real (D-4), vistas de reconocimientos e información
legal (operaciones en borrador), cambios en `apps/web`, `apps/mock-api`,
`backend/`, `scripts/`, `docs/openapi.json` y ADRs.

## 8. Bitácora

- 2026-10-20: inventario del Penpot y decisiones de tipografía, versión de las
  vistas y origen de los tipos del contrato. Plan aprobado por la persona
  usuaria; se crea la estructura de carpetas vacía.

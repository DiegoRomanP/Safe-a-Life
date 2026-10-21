# Plan: vistas públicas del frontend real

| Campo | Valor |
| --- | --- |
| Estado | Implementado; gate PASS de reviewer-front (segunda ronda) |
| Fecha | 2026-10-21 |
| Rama | `feat/frontend-vistas-publicas` (desde `main` en `af7df69`, tras fusionarse `feat/frontend-ui-base` en el PR #8) |
| Plan padre | [`2026-10-20-frontend-estructura-por-componentes.md`](2026-10-20-frontend-estructura-por-componentes.md) |
| Decisiones | ADR-001, ADR-002 (pines), [`Frontend-Design.md`](../Frontend-Design.md), versión «+» de Penpot, D-4 |
| Gate | `reviewer-front` independiente del autor y revisión visual a 320 y 1440 px |

## 1. Contexto

La persona usuaria pidió ver vistas antes del cliente HTTP. Las vistas se arman
con los componentes de `feat/frontend-ui-base` y no llaman al backend, que queda
para `feat/frontend-api-client` (D-4).

## 2. Alcance

Incluido:

1. `react-router-dom` 7.18.4 (la versión que ya fija el lockfile para
   `apps/web`) como dependencia de `frontend/`, con un router en `src/app/`.
2. `components/layout/PublicLayout` y `Brand`. El header lleva marca «+»,
   «Cómo funciona», Ingresar y Registrarme.
3. Tono `brand` en `Alert` (fondo `brand-soft`) para el aviso «Prototipo
   académico».
4. Vistas:
   - **PUB-01** (`/`): hero, acciones, «Así funciona», aviso académico y
     compromisos.
   - **AUTH-01** (`/ingresar`): contexto petróleo y formulario de acceso.
   - **SYS-01** (cualquier otra ruta): recurso no disponible, con lenguaje
     neutral.
5. `LoginForm` presentacional. Valida que el correo y la contraseña no estén
   vacíos, muestra los errores con `Field` y entrega los datos por `onSubmit`.
   La página todavía no los envía; muestra un aviso de que el acceso real
   llega con la conexión al backend.

Excluido: llamadas HTTP, CSRF, sesión, guards, `AppLayout`, el resto de vistas
y la corrección de B2 del slice anterior.

## 3. Criterios de aceptación

- Los textos salen de Penpot (versión «+»). Sin datos reales ni promesas
  clínicas o de elegibilidad.
- Encabezados en orden, un `h1` por vista, `nav` con nombre y foco visible.
  El formulario se puede usar con teclado.
- Sin overflow horizontal a 320 px. Composición de Penpot a 1440 px.
- Pasan `npm run lint` y `npm run test` del workspace y `npm run build`.

## 4. Revisión

`reviewer-front` (subagente independiente, solo lectura):

1. **Primera ronda: BLOCKED.**
   - **B1:** el foco azul sobre el aside petróleo de AUTH-01 daba 1,54:1.
   - **B2':** el error de `LoginForm` no estaba en el DOM cuando el campo
     recibía el foco.
2. **Corrección `73e0655`.** `Brand` en tono oscuro usa foco blanco (9,11:1) y
   `LoginForm` aplica los errores con `flushSync` antes del foco. Las dos
   correcciones tienen pruebas.
3. **Segunda ronda: PASS** sobre los 6 commits del slice. Cubre semántica,
   teclado y foco, contraste, privacidad y copy.

Observaciones no bloqueantes:

- Las rutas aún inexistentes (`/registro`, `/alta-asistida`,
  `/recuperar-acceso`) caen en SYS-01, cuyo texto menciona «tu cuenta».
- El enlace «Cómo funciona» no coincide con el título «Así funciona».
- La región aria-live de AUTH-01 solo anuncia el primer envío.
- En AUTH-01, `Brand` va dentro del `aside` y no de un `header`.

Verificación visual del autor en navegador: composición a 1440 px, sin
overflow a 320 px y foco blanco sobre petróleo. No verificado: lector de
pantalla real, E2E y axe. B2 del slice anterior (borde de los campos) sigue
pendiente por decisión de la persona usuaria.

## 5. Bitácora

- 2026-10-21: plan aprobado por la persona usuaria.
- 2026-10-21: PUB-01, AUTH-01 y SYS-01 implementadas, con 60 pruebas, lint y
  build en verde. Gate PASS en la segunda ronda. La persona usuaria prioriza
  escritorio; el diseño móvil específico queda para después.

# Plan: vistas públicas del frontend real

| Campo | Valor |
| --- | --- |
| Estado | En curso |
| Fecha | 2026-10-21 |
| Rama | `feat/frontend-vistas-publicas` (desde `feat/frontend-ui-base`; se rebasa sobre `main` cuando ese PR se fusione) |
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

## 4. Bitácora

- 2026-10-21: plan aprobado por la persona usuaria.

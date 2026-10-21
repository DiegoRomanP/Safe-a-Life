# Plan: componentes de UI base del frontend real

| Campo | Valor |
| --- | --- |
| Estado | En curso |
| Fecha | 2026-10-21 |
| Rama | `feat/frontend-ui-base` (desde `chore/frontend-estructura`; se rebasa sobre `main` cuando ese PR se fusione) |
| Plan padre | [`2026-10-20-frontend-estructura-por-componentes.md`](2026-10-20-frontend-estructura-por-componentes.md), slice 3 adelantado |
| Decisiones | ADR-001, [`Frontend-Design.md`](../Frontend-Design.md), versión «+» de Penpot |
| Gate | `reviewer-front` independiente del autor |

## 1. Contexto

La persona usuaria decidió adelantar los componentes base al cliente HTTP. Estos
componentes no hacen HTTP: reciben props tipadas y avisan con callbacks, así que
no dependen del slice `feat/frontend-api-client`.

## 2. Alcance

Incluido:

1. Tokens de fondos suaves de Penpot en `frontend/src/styles.css`: `soft-blue`
   `#EAF3F6`, `success-soft` `#F0FDF4`, `warning-soft` `#FFFBEB`, `danger-soft`
   `#FEF2F2`, `neutral-soft` `#EEF2F4` y `brand-soft` `#FBECEF`.
2. Ayuda de pruebas `frontend/src/test/render.tsx`, con el mismo patrón que
   `App.test.tsx`: `react-dom/client`, `act` y jsdom.
3. `components/ui/`: `Button`, `Field`, `Input`, `Select`, `Alert`, `Badge`,
   `Card` y `StatCard`.
4. `components/states/`: `Loading`, `EmptyState`, `SuccessNotice` y
   `ConflictNotice`.

Excluido: `Stepper`, `Table` y `Pagination` (van con la vista que los use),
layouts, router, cliente HTTP, vistas y dependencias nuevas.

## 3. Especificación tomada de Penpot (página 00 - Fundamentos)

- **Button:** 44 px de alto, radio 8, borde de 1 px.
  - Primario: fondo `brand` y texto blanco; `brand-deep` en hover.
  - Secundario: fondo `surface`, borde y texto `petrol`.
  - Fantasma: fondo `surface`, borde `line` y texto `ink`.
  - Peligro: fondo `surface`, borde y texto `danger`.
- **Badge:** 28 px de alto, píldora, siempre con texto.
  - Activa: `soft-blue`.
  - Meta alcanzada: `success-soft`.
  - Pendiente: `warning-soft`.
  - Cancelada: `danger-soft`.
  - Borrador: `neutral-soft`.
- **Field:** label arriba y control de 44 px con radio 8 y borde `line`. Debajo
  va el texto de ayuda. En error, el borde pasa a `danger` y el mensaje se
  enlaza con `aria-describedby` y `aria-invalid`.
- **Alert:** radio 8 con ícono, título y detalle. Éxito (✓ sobre
  `success-soft`), aviso (! sobre `warning-soft`) y error (× sobre
  `danger-soft`). Los íconos son decorativos (`aria-hidden`); el tono se dice
  con texto.
- **Card:** fondo `surface`, borde `line` y radio 12.
- **Estados** («Galería de estados», página 04): carga con `aria-busy` y sin
  ocultar la estructura; vacío; éxito con `role="status"`; conflicto
  concurrente.

## 4. Criterios de aceptación

- Los props son tipados, no hay HTTP y no hay PII en textos de ejemplo.
- Foco visible y uso por teclado. El estado nunca se comunica solo con color.
  Los resultados se anuncian con `aria-live`.
- Las pruebas de cada componente cubren sus variantes y su accesibilidad.
- Pasan `npm run lint --workspace @save-a-life/frontend` (ESLint con
  `jsx-a11y` + typecheck) y `npm run test --workspace @save-a-life/frontend`.

## 5. Bitácora

- 2026-10-21: plan aprobado por la persona usuaria.

# Mejoras de UI/UX del frontend real (2026-11-20)

Rama: `fix/revision-seguridad-ui`. Alcance: solo `frontend/` y este plan. No se tocó `backend/`, `package.json`
ni `package-lock.json`. Origen: la revisión UI/UX del mismo día, que estaba en el scratchpad de la sesión y no se
versionó. Este plan resume sus hallazgos (A1–A4, M1–M6, B1–B7).

**Estado de los gates:** ninguno. No se lanzó ningún revisor (`reviewer-front`, accesibilidad). La persona usuaria
decide el cierre del módulo.

## Qué se hizo (un commit por unidad)

| Hallazgo | Estado | Commit | Cambio |
|---|---|---|---|
| A1 select con aspecto de solo lectura | Corregido | `6df5320` | `read-only:*` acotado a `[&:is(input,textarea):read-only]` en `controlClass`. |
| A3 borde de control < 3:1 | Corregido | `6df5320` | Token `--color-control-border: #7b8c99` en Input y Select. `line` se queda para divisores. |
| A2 desbordamiento horizontal en móvil | Corregido | `9029784` | `relative` en `TableScroll`. |
| A4 marca = error | Corregido | `5989374` | `danger #b42318`, nuevos `urgent #9a3412` y `critical #7f1d1d`. `Alert` ya no acepta `tone="brand"`: los avisos informativos pasan a `info`. La marca queda para identidad, CTA e insignia «Prototipo académico». |
| B1 aviso académico con tonos distintos | Corregido | `d92a543` | Todos los avisos académicos usan `info`. |
| M1 urgencia y estado en texto plano | Corregido | `1dec4ea` | `Badge` con el tono de `urgencyLabel` y `needStatusLabel` en `NeedsTable`. |
| M2 acentos sin significado | Corregido | `2fe590e` | Confirmadas → `success`; administradores activos → `petrol`; `accentWhenPending()` deja `danger` o `warning` solo si el valor es mayor que 0 (si no, `muted`). |
| B4 indicadores apilados en móvil | Corregido | `658a6f1` | `grid-cols-2` desde la base y `p-4 sm:p-5` en `StatCard`. |
| B5 terminología | Corregido | `476af41` | «Meta de intenciones», como `targetConfirmations` en `docs/openapi.json` y `docs/2_Especificaciones_De_Software.md`. |
| B7 destello del foco | Corregido | `b65e139` | `transition-[color,background-color,border-color]` en Button, la navegación y Switch. |
| M3 navegación móvil sin pista | Corregido | `59fceae`, `f254fd1` | Utilidad `scroll-shadow-x` (sombra solo en el lado con contenido oculto, solo CSS) y pestaña activa centrada al cambiar de ruta y al cargar la fuente. La última pestaña visible puede quedar cortada a propósito: es la pista de que hay más. La activa nunca se corta (medido). |
| M4 objetivos táctiles | Corregido | `59fceae`, `a05d933` | «Cerrar sesión» medía 90×20 y ahora mide 106×44. Los enlaces de código de las tablas pasan de unos 77×22 a 78×44 sin cambiar el alto de la fila (`-my-2.5 min-h-11`). |
| M5 columnas ocultas en móvil | Corregido | `a05d933` | `TableScroll` lleva la sombra de desplazamiento y, por debajo de `sm`, el aviso «Desliza la tabla…». `NeedsTable` fija la columna «Necesidad». |
| B3 estado vacío sin acción | Corregido | `55ea9a2` | `EmptyState` acepta `title`. Un donante sin invitaciones y sin perfil ve «Aún no tienes invitaciones» y el CTA «Completar perfil», que lleva a `/donante/bienvenida`. |
| B6 auditoría sin paginación | Corregido (en cliente) | `956eea8` | «Mostrar N más» de 50 en 50 sobre los eventos que ya carga `listAll` (limit/cursor). El contrato no cambia y los filtros siguen aplicándose a todos. |
| 404 de `/donors/me/profile` | Parcial | `1aff4a8` | El código ya lo trataba como estado (`null`) sin `console.error` propio. `rememberNull` evita volver a pedirlo en cada vista. El mensaje «Failed to load resource» lo emite Chrome por cualquier 4xx y no se puede quitar desde JS. Quitarlo exige cambiar el contrato (p. ej. 200 con estado), y eso no se hizo. |
| M6 modo oscuro | Corregido | `e215cf6` | Tokens redefinidos en `@media (prefers-color-scheme: dark)` y `color-scheme: light dark`. Nuevo token `panel` para paneles y rail con texto blanco (petróleo pasa a ser texto claro en modo oscuro) y `brand-text` para la insignia. |

## Contrastes de la paleta final (WCAG 2.x, calculados sobre los hex)

| Par | Claro | Oscuro | Umbral |
|---|---|---|---|
| ink / canvas | 13,67 | 14,63 | 4,5 |
| ink / surface | 14,55 | 13,12 | 4,5 |
| muted / surface | 6,28 | 6,96 | 4,5 |
| muted / neutral-soft | 5,57 | 5,85 | 4,5 |
| petrol / surface (enlaces) | 9,11 | 8,26 | 4,5 |
| petrol / soft-blue (info) | 8,09 | 7,29 | 4,5 |
| success / success-soft | 6,81 | 9,82 | 4,5 |
| warning / warning-soft | 6,61 | 9,19 | 4,5 |
| danger / danger-soft | 6,01 | 7,05 | 4,5 |
| danger / surface | 6,57 | 6,80 | 4,5 |
| urgent / warning-soft | 7,05 | 9,05 | 4,5 |
| critical / danger-soft | 9,16 | 11,12 | 4,5 |
| brand-text / brand-soft | 7,81 | 8,17 | 4,5 |
| blanco / brand (CTA) | 6,47 | 6,47 | 4,5 |
| blanco / brand-deep (hover) | 8,94 | 8,94 | 4,5 |
| blanco / panel | 9,11 | 9,11 | 4,5 |
| control-border / surface | 3,47 | 4,17 | 3 |
| control-border / canvas | 3,26 | 4,64 | 3 |
| focus / surface | 5,93 | 6,91 | 3 |
| focus / canvas | 5,57 | 7,70 | 3 |

Hex oscuros: canvas `#0f1c25`, surface `#16262f`, ink `#e6edf1`, muted `#9fb0bc`, line `#2b3d48`, control-border
`#71879a`, petrol `#7cc8de`, success `#7ee2a8`, warning `#f2c25b`, danger `#ff8a80`, urgent `#fdba74`,
critical `#fecaca`, focus `#56b6f0`, soft-blue `#12313d`, success-soft `#11291c`, warning-soft `#2e2410`,
danger-soft `#3a1614`, neutral-soft `#22333d`, brand-soft `#3a1a22`, brand-text `#f4a7b5`. Brand, brand-deep y panel no
cambian.

## Evidencia

- `npm run test --workspace @save-a-life/frontend`: 47 archivos, 357 pruebas aprobadas (antes eran 342). Hay pruebas
  nuevas para A1/A3, A4, M1, M2, B3, B6 y `rememberNull`.
- `npm run typecheck`: 0. `npm run lint`: 0 errores y 14 avisos, todos previos y en `apps/web`. `npm run build`: 0.
- `npm run test:e2e -- --trace=off`: 10 aprobadas. Esta suite cubre `apps/web` contra el mock, no `frontend/`.
- Verificación visual con Playwright contra el backend real y el **Supabase local** (entorno de
  `backend/test/support/local-env.ts`, sin editar `backend/.env`). Se recorrieron tres vistas públicas, 6 de superadmin,
  4 de hospital y 4 de donante, a 1440 y 390 px, en modo claro y oscuro (68 mediciones):
  - `scrollWidth` = 390 en todas las vistas móviles (antes llegaba a 829 en `/superadmin/hospitales`).
  - Ningún `<select>` tiene borde discontinuo: el borde es `solid` en `rgb(123,140,153)` (claro) y `rgb(113,135,154)`
    (oscuro).
  - La pestaña activa siempre queda visible y «Cerrar sesión» mide 106×44.
  - En modo oscuro el fondo del `body` es `rgb(15,28,37)`.
  - El foco de «Ingresar» queda en `solid 3px rgb(3,105,161)` sin transición de `outline-color`.
  - Consola: sin errores en las vistas públicas, de superadmin ni de hospital. En donante solo aparece el 404 esperado
    de `/donors/me/profile` (ver arriba).
  - Capturas «después» en el scratchpad de la sesión (`frontend-fix/`, no versionadas).
- Durante la verificación, otro agente reinició la base local. Hubo 500 transitorios en el login y hubo que reiniciar
  el backend propio. Las capturas del donante son de la última pasada, que salió limpia.

## Pendiente o no verificado

- **Gates:** no hubo revisión independiente (`reviewer-front` ni accesibilidad). Ninguno está en PASS.
- **404 del perfil:** sigue apareciendo en la consola del navegador mientras el contrato responda 404. Cambiarlo es una
  decisión de contrato.
- **B6:** la paginación es en cliente. Una paginación con cursor hacia el servidor cambiaría el sentido de los filtros
  (solo verían los eventos cargados).
- **Pendientes de verificar:** vistas del donante con datos (`donor1` no tiene perfil), lectores de pantalla reales,
  axe-core (no está instalado), 320/768/1024 px y el estado `hover`.
- **Atajo documentado en el código (`TableScroll`):** el aviso «Desliza…» supone que toda tabla tiene `min-w` ≥ 640 px.
- **Historial:** la prueba de M2 entró en el commit de M1 (`1dec4ea`), así que ese commit aislado tiene una prueba que
  falla hasta `2fe590e`.

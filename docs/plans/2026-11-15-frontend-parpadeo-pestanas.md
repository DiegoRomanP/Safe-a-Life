# Plan: quitar el salto de contenido al cambiar de pestaña

| Campo | Valor |
| --- | --- |
| Estado | Propuesto, pendiente de aprobación |
| Fecha | 2026-11-15 |
| Rama | `fix/frontend-parpadeo-pestanas` (local, desde `main` en `1c32033`) |
| Alcance | `frontend/` (capa de datos de demostración y área del donante) |
| Gate | `reviewer-front` independiente del autor |

## 1. Problema observado

Al cambiar de pestaña en el área del donante, la sección que se actualiza
"salta". Medido en `127.0.0.1:5174` a 1440 px, de Invitaciones a Mi perfil:

| Momento | Alto de la región |
| --- | --- |
| Antes del clic (Invitaciones) | 439 px |
| Inmediatamente después (panel «Cargando») | 138 px |
| Al llegar los datos (~1 s) | 624 px |

Causas:

1. `demoRead` simula 450 ms de latencia y cada vista monta `QueryView` desde
   cero: siempre muestra el panel «Cargando», mucho más bajo que el contenido.
2. `useDemoQuery` no recuerda nada entre pestañas: volver a una pestaña ya vista
   repite la carga completa.

El hospital y el superadmin todavía leen sus datos de forma síncrona (punto 5
pendiente), así que hoy no presentan este salto. Este plan deja la solución en
la capa compartida para que la reutilicen.

## 2. Cambios

1. **Indicador de carga diferido y espacio reservado** (`QueryView`):
   - Mientras carga, la región reserva un alto mínimo y marca `aria-busy`.
   - El panel visual «Cargando» aparece solo si la carga supera 500 ms. Antes de
     eso, un `role="status"` con texto solo para lectores de pantalla anuncia la
     carga, así la accesibilidad no espera.
   - El retardo es un parámetro con valor por defecto; en pruebas es 0, igual
     que la latencia de `demoRead`, y una prueba dedicada usa temporizadores falsos.
2. **Memoria de lecturas por área, opcional** (`useDemoQuery`):
   - Un `QueryCacheProvider` en memoria, montado en `DonorLayout`. Se descarta al
     salir del área; nada va a `localStorage` ni `sessionStorage`.
   - Una vista lo activa explícitamente. Si ya hay datos para el mismo recurso,
     se muestran al instante con `refreshing: true` mientras se revalidan; es el
     mismo contrato que ya se usa tras una escritura.
   - Solo lo activan las listas de solo lectura: Invitaciones, Historial y Mis
     solicitudes. **Mi perfil** y el **detalle de invitación** no lo usan,
     porque su formulario o sus acciones toman los valores al montarse y podrían
     quedar con datos viejos.
   - La clave incluye la vista y el escenario de demostración (por ejemplo,
     `invitaciones:normal`). Las vistas que hoy pasan solo el escenario cambian
     a una clave propia, para no mezclar datos entre pestañas.

## 3. Fuera de alcance

Hospital y superadmin (punto 5), cambio de la latencia simulada, prefetch,
skeletons por vista, cliente HTTP y conexión con el backend.

## 4. Aceptación

- Volver a Invitaciones, Historial o Mis solicitudes ya visitadas muestra los
  datos al instante, sin el panel «Cargando».
- La primera visita no encoge la región por debajo del alto reservado, y no
  aparece el panel visual si la carga dura menos de 500 ms.
- Los escenarios DEV `cargando`, `error`, `sin_permiso` y `conflicto` siguen
  mostrando sus estados; reintentar sigue mostrando «Cargando».
- Mi perfil y el detalle de invitación conservan su comportamiento actual.
- `typecheck`, `lint`, `test` y `build` del workspace `frontend` pasan. Se
  añaden pruebas para el retardo, la memoria y su ausencia en las vistas con
  formulario.
- Se repite la medición en el navegador y se registra aquí.
- Con cliente HTTP, la memoria debe vaciarse al cerrar o cambiar la sesión. Al
  vivir en el layout del área, hoy se vacía al salir de ella; queda anotado
  para T4.

## 5. Bitácora

- 2026-11-15: rama creada desde `main` (`1c32033`). Parpadeo reproducido y
  medido. Plan escrito; pendiente de aprobación.

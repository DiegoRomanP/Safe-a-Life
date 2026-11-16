# Plan: quitar el salto de contenido al cambiar de pestaña

| Campo | Valor |
| --- | --- |
| Estado | Implementado y revisado (PASS); pendiente de aprobación de la persona usuaria |
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
   - Una entrada solo se muestra si sus datos no cambiaron desde que se guardó:
     guarda la lectura (`load`) que la produjo y, en la demo, `load` cambia de
     identidad con cada escritura. Tras responder una invitación, marcarse no
     disponible o crear una solicitud, la lista vuelve a cargar.
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
- 2026-11-16: plan aprobado por la persona usuaria (`46fbd7e`). Implementado:
  - `lib/queryCache.tsx` (nuevo), `useDemoQuery` con `{ cache }`, y `QueryView`
    con `loadingDelayMs` (500 ms), `aria-busy` y `min-h-96` mientras carga.
  - Invitaciones, Historial y Mis solicitudes usan la memoria con claves por
    vista. `DonorLayout` monta el `QueryCacheProvider`.
- 2026-11-16: verificación. `frontend`: lint + typecheck, 251/251 pruebas (4
  nuevas) y build OK. Medición en el navegador a 1440 px (alto de la región):

  | Recorrido | Antes | Después |
  | --- | --- | --- |
  | Invitaciones → Mi perfil (sin memoria) | 439 → 138 con panel → 624 | 384 reservado, sin panel → 624 |
  | Volver a Invitaciones o Historial ya vistas | panel «Cargando», ~450 ms | alto final desde el primer cuadro, sin panel |
  | Primera visita a Mis solicitudes | panel «Cargando» → contenido | 384 reservado → 226 |

  El escenario DEV `cargando` muestra el panel a los 500 ms y antes lo anuncia
  solo a lectores de pantalla. Queda un ajuste menor: en la primera visita, una
  vista más baja que el alto reservado (Mis solicitudes, 226 px) se encoge una
  vez.
- 2026-11-16: revisión `reviewer-front` (subagente de contexto separado), ronda
  1: **PASS** con observaciones. Se atendieron:
  - O1 (media): la memoria mostraba ~450 ms datos de antes de una escritura
    hecha en otra vista (responder, marcarse no disponible, una segunda visita
    a Mis solicitudes). Ahora la entrada guarda su `load` y solo se usa si
    coincide. Se quitó el caso especial `cache: !created` de RequestsPage.
  - O2: el estado del plan estaba desactualizado; ya se corrigió.
  - O3: se añadieron pruebas de la invalidación tras una escritura y de
    reintentar con memoria disponible.

  Quedan anotadas sin cambio O4 (al usar la memoria no hay `aria-busy`, igual
  que la revalidación tras escribir) y O5 (preexistente: un `role="status"`
  insertado con texto puede no anunciarse en algunos lectores). Resultado:
  253/253 pruebas, lint + typecheck y build OK. Pendiente: ronda 2.
- 2026-11-16: ronda 2 de `reviewer-front`: **PASS**. Confirmó que `listInvitations`,
  `listHistory` y `listRequests` cambian de identidad con cada escritura que
  las afecta, y que retener `load` en la memoria del área es aceptable. Observó
  que la prueba de reintento en `DonorStates.test.tsx` no ejercía `tries === 0`
  (el recurso en error nunca tiene memoria). Se reemplazó por
  `lib/useDemoQuery.test.tsx`, que prueba el hook dentro de un
  `QueryCacheProvider` con un `load` controlado: memoria vigente, memoria vieja,
  reintento con memoria vigente y sin la opción `cache`. Resultado: 256/256,
  lint + typecheck y build OK. Pendiente: ronda 3 sobre ese cambio de pruebas.
- 2026-11-16: ronda 3 de `reviewer-front`: **PASS** sin hallazgos abiertos.
  Confirmó que cada prueba de `useDemoQuery.test.tsx` fallaría sin lo que
  cubre (incluido `tries === 0`) y que no son frágiles. El PASS de las rondas
  1 a 3 cubre todos los archivos del cambio. No verificado: lector de pantalla
  real.
- 2026-11-16: la persona usuaria aclaró que el problema principal era un
  "descuadre" al cambiar de sección en Edge. Causa medida a 1440×800: la barra
  de scroll (15 px) aparecía en vistas largas (Mi perfil, Invitaciones) y
  desaparecía en las cortas (Historial, Mis solicitudes) o mientras cargaban.
  El título se corría 7 px y `main` cambiaba de 1185 a 1200 px de ancho.
  Corrección en `frontend/src/styles.css`: `html { scrollbar-gutter: stable; }`,
  que reserva siempre el espacio de la barra en todas las áreas. Medido
  después: título fijo en 289 px y `main` en 1185 px en las cuatro vistas,
  también durante la carga. La persona usuaria lo confirmó en Edge. Build OK.
- 2026-11-16: ronda 4 de `reviewer-front`: **PASS**. No hay elementos `fixed`,
  `sticky` ni `100vw` que se descuadren. En vistas sin scroll queda una franja
  de 15 px con el color del lienzo, casi igual al blanco de la cabecera.
  Soporte: Chromium/Edge 94+, Firefox 97+, Safari 18.2+; sin efecto con barras
  superpuestas. Nota: si se agrega un fondo de color a sangre, dar a `html` ese
  mismo fondo. El PASS de las rondas 1 a 4 cubre todo el cambio.

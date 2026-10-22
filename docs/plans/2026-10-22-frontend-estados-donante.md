# Plan: estados de carga, error, permiso y conflicto (área del donante)

| Campo | Valor |
| --- | --- |
| Estado | Listo para PR |
| Fecha | 2026-10-22 |
| Rama | `feat/frontend-estados-donante` (desde `feat/frontend-titulos-a11y`) |
| Origen | Lista de pendientes externa, punto 5 (primer PR de tres: donante, hospital, superadmin) |
| Gates | `reviewer-front` y `security-privacy-auditor`: PASS con observaciones (corregidas) |

## 1. Objetivo

Que las vistas sepan mostrar lo que pasará con el backend real, no solo el
caso feliz:

- **Cargando:** el dato aún no llega.
- **Error:** falla la red o el servidor. Se puede reintentar.
- **Sin permiso:** 403 o 404, con el mismo mensaje neutro que SYS-01.
- **Conflicto:** 409, otro cambio llegó antes.

Sin backend (D-4) todo sigue en memoria, pero con la forma asíncrona de una
llamada HTTP.

## 2. Diseño

- **`lib/demoApi.ts`:**
  - `demoRead` y `demoWrite` simulan latencia (450 ms; 0 en pruebas).
  - Fallan con `ApiError` (`red`, `sin_permiso`, `conflicto`) según el
    escenario.
  - Una escritura fallida no cambia nada.
  - Es la pieza que se reemplaza por el cliente HTTP.
- **`lib/useDemoQuery.ts`:**
  - Estados `loading`, `ready` y `error`, más `retry`.
  - Al revalidar el mismo recurso tras una escritura se conservan los datos
    mostrados (`refreshing`), sin volver a «Cargando» ni perder el foco.
  - `retry`, que se usa tras un error o un conflicto, siempre muestra
    «Cargando» para no actuar sobre datos viejos.
  - Una respuesta tardía de una petición anterior se descarta.
- **`lib/useDemoMutation.ts`:**
  - `pending` (y un bloqueo síncrono con ref) evita el doble envío, y `error`
    guarda el motivo del fallo.
  - `run` devuelve `{ ok }`.
- **Componentes en `components/states/`:**
  - `QueryView` elige el estado. Su región enfocable recibe el foco al
    reintentar o recargar, para que no se caiga al `body`.
  - `ErrorState` usa `role="alert"` y ofrece «Reintentar».
  - `ForbiddenState` usa el texto neutro de SYS-01.
  - `SaveErrorNotice` dice «no se registró ningún cambio» y, ante un conflicto,
    usa `ConflictNotice`.
- **`components/dev/DevScenarioPicker.tsx`:**
  - Selector «Normal / Cargando / Error de red / Sin permiso / Conflicto al
    guardar».
  - Solo aparece en DEV, a través del hueco `devTools` de `AppLayout`.
  - Se verificó que no está en el build (`frontend/dist` no contiene sus
    textos).
- **Área del donante:** `DonorDemoContext` expone operaciones asíncronas:
  - `listInvitations`, `getInvitation`, `listHistory`, `getProfile` y
    `listRequests`;
  - `respond`, `updateParticipation`, `completeOnboarding` y `createRequest`.

  Las siete vistas pasan por `QueryView` o `useDemoMutation`.
- **Pruebas:** `test/render.tsx` suma `settle()` para dejar terminar las
  respuestas.

## 3. Verificación

- **Pruebas:** 227/227 en el frontend, ESLint y typecheck sin errores, y build
  correcto.
- **`DonorStates.test.tsx` cubre:**
  - la carga con la cabecera visible;
  - el escenario «cargando»;
  - el error con reintento, que mantiene el foco en la región;
  - sin permiso, sin datos;
  - un conflicto al responder, que no cambia la respuesta ni el historial y
    mantiene el foco al revisar;
  - el doble envío;
  - un conflicto en el perfil y en «Nueva solicitud», donde el foco vuelve al
    botón de envío.
- **Navegador real** (`dev:frontend` :5174, 1440 px):
  - «Cargando tus invitaciones…» aparece y luego la lista;
  - el error, sin permiso (sin filtrar «Sede San Borja») y el conflicto se ven
    bien;
  - «Guardando tu respuesta…» con `aria-disabled`;
  - consola sin errores.
  - **Hallazgo:** al pulsar «Reintentar» o «Revisar cambios» el foco caía al
    `body`. Se corrigió y se verificó de nuevo en el navegador.

## 4. Límites y pendientes

- El escenario «Error de red» también hace fallar las lecturas, así que un
  error de red al guardar solo se prueba en `SaveErrorNotice`
  (`states.test.tsx`).
- **Hospital y superadmin:** van en PR propios con la misma capa.
- **Cliente HTTP real (D-4):**
  - mapear 403 y 404 a `sin_permiso`, 409 a `conflicto` y 5xx o fallo de red a
    `red`;
  - usar `cache: 'no-store'` y no registrar URLs (L-2 del plan de revisiones).

- La revalidación depende hoy de la identidad de `load`. Con HTTP hará falta
  una clave o versión explícita.
- **Pendientes de diseño para el cliente HTTP** (observaciones de
  `security-privacy-auditor`):
  - 401, 403 y 404 se tratan como `sin_permiso`, sin conservar el cuerpo de la
    respuesta;
  - 409 nunca se reintenta solo;
  - 422 es un error de validación y no un error de red;
  - el `requestId` solo se muestra como código de soporte;
  - nada de esto se guarda en storage;
  - `Idempotency-Key` en las escrituras.

## 5. Bitácora

- 2026-10-22: capa de datos demo y estados del donante (`99ec921`,
  `9c208e4`).
- 2026-10-22: revisiones con subagentes independientes de solo lectura, que no
  escribieron el código.
  - **`reviewer-front`: PASS con observaciones.** 225/225 tests, ESLint,
    typecheck y build correctos; el selector DEV no está en el build.
    - Media: tras guardar, durante la revalidación se podía volver a enviar
      (entrada duplicada en el historial).
    - Media: tras un conflicto, el perfil se rearmaba con los datos viejos.
    - Baja: un 404 se veía distinto de un 403.
    - Baja: el botón de la cabecera del perfil no marcaba el envío.
    - Baja: `demoWrite` no producía `sin_permiso`.
  - **`security-privacy-auditor`: PASS con observaciones.** Sin almacenamiento
    en el navegador ni PII; las escrituras fallidas nunca se muestran como
    guardadas.
    - Low: 404 y 403 se distinguían.
    - Low: el bloqueo del doble envío dependía solo del estado.
  - **Se corrigió todo:**
    - `refreshing` bloquea las respuestas mientras se revalida, con un test que
      falla sin la corrección;
    - `retry` vuelve a «Cargando», así que el perfil se rearma con los datos
      del reintento;
    - una invitación inexistente responde `sin_permiso` y se ve igual que un
      403, con su test;
    - `aria-disabled` en el botón de la cabecera;
    - `sin_permiso` también en las escrituras;
    - bloqueo síncrono en `useDemoMutation`.

    Se verificó de nuevo en el navegador (perfil con conflicto y ruta
    inexistente). 227/227 tests.

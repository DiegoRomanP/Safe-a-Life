# 2026-10-20 — ESLint en todos los workspaces

| Campo | Valor |
|---|---|
| Estado | Implementado; pendiente de aprobación de la persona usuaria |
| Origen | Revisión del PR #4 (punto 3): `lint` era solo `tsc --noEmit` |

## Decisión (persona usuaria)

- **Alcance:** `frontend`, `apps/web`, `apps/mock-api`, `backend` y los archivos de la
  raíz (`scripts/`, `playwright.config.ts`).
- **Reglas:** base + accesibilidad (`@eslint/js` recommended, `typescript-eslint`
  recommended, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`). Sin reglas con
  tipos y sin Prettier.
- **CI:** job `lint` en `.github/workflows/security.yml`.
- **Registro:** este plan; no se modifica ningún ADR.

## Versiones fijadas (devDependencies de la raíz, exactas)

`eslint` 9.39.5, `@eslint/js` 9.39.5, `typescript-eslint` 8.71.1,
`eslint-plugin-react-hooks` 7.1.1, `eslint-plugin-jsx-a11y` 6.10.2, `globals` 17.13.0.
Todas con más de 14 días de publicadas y sin scripts de instalación; `allowScripts`
no cambia. Se eligió ESLint 9 porque `eslint-plugin-jsx-a11y` solo declara peer
hasta ESLint 9. El lockfile añade 217 paquetes y no cambia ninguna versión existente.

## Configuración

`eslint.config.mjs` en la raíz. `lint` de cada workspace = `eslint .` + su typecheck;
la raíz agrega `lint:root` para `scripts/`, `playwright.config.ts` y la propia config.

Ajustes y su razón (ninguno desactiva una regla sin alcance acotado):

- `no-unused-vars`: se ignoran los nombres que empiezan con `_` (argumentos, variables
  y `catch`); el `_next` de los handlers de errores de Express existe por aridad.
- `no-explicit-any`: apagada solo en `*.test.*` y `backend/test/**`, que leen JSON
  arbitrario de las respuestas.
- `jsx-a11y/label-has-associated-control`: `depth: 3`; en `DonorPages.tsx` el texto de
  la etiqueta está en `label > span > strong > {expresión}` y con la profundidad
  por defecto no lo detecta (no era un fallo real).
- `react-hooks/set-state-in-effect` y `react-hooks/purity` (reglas del React Compiler)
  en `warn` solo para `apps/web`, que es la demo contra el mock y será reemplazada por
  `frontend/`. En `frontend/` rigen como error.

## Hallazgos del código existente

Medición inicial: 28 errores y 2 avisos en 30 puntos. Corregidos en código:

- `no-loss-of-precision` en dos pruebas (`create-need-draft.test.ts`,
  `idempotency-key.test.ts`): el número de prueba pasó a `Number.MAX_SAFE_INTEGER`
  (sigue siendo un número que debe rechazarse).
- `no-unexpected-multiline` en `validators.test.ts`: el `(` de `it.each(...)(...)` iba
  en otra línea; solo se juntaron.
- `no-unsafe-finally` en `scripts/test-prism-contract.mjs`: el `throw` en `finally`
  es intencional (un cierre fallido debe prevalecer), por eso lleva un
  `eslint-disable-next-line` acotado con motivo, sin cambiar el comportamiento.

Quedan **14 avisos** (0 errores), todos en `apps/web`: 12 de las reglas del React
Compiler y 2 de `react-hooks/exhaustive-deps` en `HospitalPages.tsx` (líneas 240-241,
el ref de `readRevision` y la dependencia `readBatches`). No se tocaron porque
cambiar las dependencias de un efecto altera cuándo se ejecuta y la demo se
reemplaza.

## Verificación

- `npm run lint`: salida 0 (0 errores, 14 avisos).
- `npm run typecheck`, `npm run build`, `npm run test:api:generator` (29/29) y
  `npm test`: mock-api 50, web 15, backend 766, frontend 1; todos pasan.
- Prueba negativa en `frontend/`: una variable sin usar, un hook condicional y un
  `<img>` sin `alt` producen 3 errores; el archivo se borró después.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- No ejecutado: el job `lint` en GitHub Actions (se valida con el primer push), E2E
  de Playwright, `test:backend:db` ni integración contra Supabase local.
- Gate `reviewer-back`: no se lanzó. Los únicos cambios en `backend/src` son tres
  archivos de prueba (valores de prueba y un salto de línea), sin tocar lógica.

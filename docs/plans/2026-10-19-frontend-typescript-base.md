# Plan: base TypeScript del frontend real en `frontend/`

| Campo | Valor |
| --- | --- |
| Estado | En curso |
| Fecha | 2026-10-19 |
| Rama | `feat/frontend-typescript-base` (local, desde `origin/feat/backend-developing` en `1956d63`) |
| Decisiones | ADR-001 (TypeScript, React 18, Tailwind), ADR-002 (pines y scripts de instalación), ADR-004 (mismo origen, cookies, CSRF) |
| Gate | `reviewer-front` independiente del autor |

## 1. Contexto

`frontend/` es la carpeta del frontend real (decisión registrada el 2026-10-12 en
`CLAUDE.md` y `2026-10-12-ejecucion-plan-maestro-f0-f1.md`). Hoy contiene la
plantilla de Vite en JavaScript con React 19, ESLint y `pnpm-lock.yaml` propio,
fuera del workspace npm. Eso contradice ADR-001 ("TypeScript para el backend y
el frontend", React 18) y la política de lockfile único de ADR-002.

`apps/web` sigue siendo la web de demostración contra el mock y no se modifica.

Este plan deja la base lista **antes de construir cualquier vista**. No integra el
frontend con el backend real; esa integración sigue condicionada por D-4 del
plan maestro del backend.

## 2. Alcance

Incluido:

1. Retirar la plantilla JS de `frontend/`: `src/*.jsx`, `App.css`, `index.css`,
   `src/assets/`, `vite.config.js`, `eslint.config.js`, `pnpm-lock.yaml`,
   `public/icons.svg` y el README de plantilla. Se conservan la carpeta,
   `.gitignore` y `public/favicon.svg`.
2. Crear la base TS: `package.json` (`@save-a-life/frontend`), `tsconfig.json`
   que extiende `tsconfig.base.json`, `vite.config.ts`, `index.html`,
   `src/main.tsx`, `src/App.tsx` (marcador, sin pantallas), `src/styles.css` con
   los tokens de `docs/Frontend-Design.md`, una prueba de humo y un README propio.
3. Sumar `frontend` a `workspaces` del `package.json` raíz y añadir
   `dev:frontend`; actualizar `package-lock.json` solo con la entrada del nuevo
   workspace.
4. Documentar en `CLAUDE.md` y README que `frontend/` ya es workspace TS.

Excluido: vistas, routing por rol, cliente HTTP, CSRF, login, tipos generados
para `frontend/` (cambio en `scripts/generate-api-contract.mjs`), E2E, cambios en
`apps/web`, `apps/mock-api`, `backend/`, `docs/openapi.json` y ADRs.

## 3. Decisiones de la base

- **Dependencias:** solo versiones ya fijadas en el lockfile raíz: `react` y
  `react-dom` 18.3.1, `@fontsource-variable/manrope` y `newsreader` 5.3.0; en
  la raíz ya están `vite` 8.3.2, `@vitejs/plugin-react` 6.1.1,
  `@tailwindcss/vite` 4.3.3, `typescript` 5.9.3, `vitest` 5.0.3 y `jsdom`
  30.1.1. Ninguna dependencia nueva. `react-router-dom` y `lucide-react` se
  añadirán con la slice que los use.
- **Lint:** `lint` = `tsc --noEmit`, igual que los demás workspaces. ESLint se
  retira porque no forma parte del tooling fijado; un linter real requiere una
  decisión aparte.
- **Servidor de desarrollo:** `127.0.0.1:5174` (5173 es de `apps/web`), con
  `strictPort`. Proxy de `/api` y `/health` a `http://127.0.0.1:3000` (backend
  real), para que navegador y API compartan origen como en ADR-004. Para
  mutaciones, `backend/.env` debe incluir `http://127.0.0.1:5174` en
  `ALLOWED_ORIGINS`.
- **Almacenamiento:** la base no usa `localStorage` ni `sessionStorage`.

## 4. Aceptación

- `npm run typecheck`, `npm test` y `npm run build` del workspace `frontend`
  pasan.
- `typecheck` y `test` globales siguen pasando para `apps/web`, `apps/mock-api`
  y `backend`.
- El diff de `package-lock.json` solo agrega el workspace `frontend` y sus
  enlaces; no cambia versiones existentes ni añade paquetes de registro nuevos.
- El servidor de desarrollo renderiza el marcador en `http://127.0.0.1:5174`.
- `reviewer-front` da PASS sin hallazgos abiertos.

## 5. Bloqueos y riesgos

- **Versiones locales de Node y npm.** El repo exige Node `>=24.19.0 <25` y
  npm `>=12 <13` (`engines`, ADR-002). El equipo local tiene Node 24.14.1 y npm
  11.11.0. `allowScripts` de `package.json` es una función de npm 12: con npm 11
  no se garantiza que se bloqueen los scripts de `@scarf/scarf` y `protobufjs`,
  y el lockfile podría reescribirse con otro formato. **No se instala hasta usar
  las versiones fijadas.**
- `frontend/node_modules/` local fue instalado con pnpm; se borra antes de
  instalar con npm para que no interfiera con la resolución del workspace. No
  está versionado.

## 6. Bitácora

- 2026-10-19: rama local creada desde `origin/feat/backend-developing`. Plan
  escrito. Detectado el bloqueo de versiones de Node/npm antes de instalar.

# Plan: mapa de ubicación del donante + buzón web local para verificar cuentas

## Contexto

1. **Ubicación.** Hoy el donante busca su dirección con Mapbox (`frontend/src/features/donor/AddressSearch.tsx`, `frontend/src/lib/mapbox.ts`). El formulario guarda lat/lng con 3 decimales (~110 m) sin mostrar dónde quedó el punto. El usuario quiere ver su ubicación en un mapa y poder **ajustarla** con un clic o arrastrando el punto (decisión: «Ver y ajustar», sin GPS: `Permissions-Policy: geolocation=()` no se toca).
2. **Verificación de correo.** En local, `EMAIL_PROVIDER=dev-mailbox` guarda cada correo como HTML en `backend/.dev-mailbox/` (`backend/src/modules/email-delivery/infrastructure/dev-mailbox-sender.ts`). El registro necesita 2 correos: verificar (`/verificar-correo#token`) y después crear la contraseña (`/restablecer-contrasena#token`). Esa segunda barrera es intencional y se mantiene. Hoy hay que abrir los archivos a mano. Decisión: un **buzón web local** tipo Mailpit (`npm run dev:mailbox`, solo 127.0.0.1) que lista los correos con botones a sus enlaces. En modo DEV, las pantallas de registro, verificación y recuperación muestran el enlace «Abrir buzón de desarrollo». El buzón es complementario: no toca el backend ni `docs/openapi.json`, y deja de usarse al pasar a `EMAIL_PROVIDER=resend`. Cuando exista el OTP de 6 dígitos, el código aparecerá dentro del mismo correo en el buzón sin más trabajo.

Rama nueva: `feat/mapa-ubicacion-y-buzon-dev` desde `main`. No se tocan los archivos sin seguimiento que ya existen (`docs/Informe-Tipos-De-Errores.pdf`, `docs/plans/2026-11-24-informe-tipos-de-errores.md`).

## Lo que ya existe y se reutiliza

- Leaflet 1.9 ya es dependencia de `frontend`. `frontend/src/features/hospital/components/CoverageMap.tsx` ya resuelve las teselas OSM con `referrerPolicy: 'origin'`, `circleMarker` sin imágenes, el `useEffect` con `map.remove()` y el `role="img"`. La CSP de `vercel.json` ya permite `img-src https://tile.openstreetmap.org`, así que `npm run check:headers` no cambia.
- `LIMA_BBOX` en `frontend/src/lib/mapbox.ts` (es el polígono DEMO_ONLY-1 del backend) y `latitudeError`/`longitudeError` en `frontend/src/features/donor/location.ts`.
- El patrón solo-DEV `import.meta.env.DEV && <DevStatusPicker/>` de `frontend/src/features/auth/pages/VerifyEmailPage.tsx`.
- El nombre de archivo del buzón, `idempotencyKey` saneado a `[A-Za-z0-9_-]+.html`, y su cabecera `Para:`/`Asunto:` ya escapada. `scripts/test-e2e-real.mjs:61-65` ya lee el buzón con la regex `href="…<ruta>#…"`, y el buzón web usa el mismo criterio.
- `concurrently` ya es devDependency de la raíz.

## Skills

- **Búsqueda con find-skills (`npx skills find`)**: «leaflet map» solo dio skills con menos de 100 instalaciones (descartadas por calidad). «email verification» dio skills de otras plataformas que no aplican. «otp authentication» dio `better-auth/skills@two-factor-authentication-best-practices` (37.6K), que solo sirve como referencia para la **fase futura del OTP** y está atada a better-auth: no se instala ahora y se preguntará antes. «playwright e2e» dio skills que no hacen falta porque ya existe `webapp-testing`. **No se instala ninguna skill nueva.**
- **Skills instaladas que se asignan a los agentes** (el agente las invoca con la herramienta `Skill`): `frontend-ui-engineering`, `test-driven-development`, `incremental-implementation`, `security-and-hardening`, `code-review-and-quality`, `webapp-testing`, `verification-before-completion`, `git-workflow-and-versioning`, `documentation-and-adrs`.
- **Skills del proyecto (no son de Claude Code; se abren con `Read`)**: `.opencode/skills/save-a-life-security-privacy/SKILL.md`, `.opencode/references/project-requirements.md`, `AGENTS.md`. Los roles de revisión están en `.opencode/agent/*.md`.

## Reglas para todos los agentes (van en cada prompt)

1. Lee `AGENTS.md` y `CLAUDE.md`. Escribe en español el código de UI, los comentarios de dominio y la documentación.
2. Trabaja solo en los archivos de tu fase. **No hagas commit, push ni `npm install`**: el agente principal hace los commits después del gate. No ejecutes `git add -A`.
3. Usa solo datos sintéticos (`*.example.test`). No registres tokens, coordenadas ni cuerpos de correo en logs, en la salida ni en los informes. No compartas trazas, HAR ni cookies.
4. Usa TDD: primero la prueba roja, después lo mínimo para ponerla en verde. Sin dependencias nuevas.
5. Termina con un informe de 300 palabras como máximo: archivos tocados, comandos ejecutados con su resultado real (sin inventar un PASS) y lo que no se verificó.
6. Cada agente tiene un límite de tiempo. Si lo supera, o si algo falla 2 veces seguidas, se detiene y lo informa en lugar de improvisar.
7. Lanzamiento: con `Agent`, `subagent_type: general-purpose`. Los implementadores corren en segundo plano y los revisores trabajan en solo lectura. Si el clasificador rechaza la llamada porque un hook la modificó (pasó en esta sesión con context-mode), se reintenta una vez con el input exacto. Si vuelve a fallar, se avisa al usuario para que lo apruebe o desactive el hook.

## Fase 0: Preparación (agente principal, sin subagentes, ~10 min)

**Propósito:** partir de una base verde y dejar registrado el trabajo.
- `git switch -c feat/mapa-ubicacion-y-buzon-dev`.
- Crear `docs/plans/2026-11-24-mapa-ubicacion-y-buzon-dev.md` con este plan (en español) y una bitácora por fase.
- Línea base: `npm run typecheck`, `npm test --workspace @save-a-life/frontend` y `npm run lint`. Se anotan en la bitácora los fallos que ya existían.

**Revisión:** la línea base queda anotada. Si algo ya estaba rojo antes de empezar, se informa y no se atribuye a esta rama.

## Fase 1: Implementación (2 agentes en paralelo, segundo plano, ~45 min cada uno)

Los dos agentes no comparten archivos, así que pueden trabajar a la vez en el mismo árbol.

### Agente 1A: mapa de ubicación (frontend)
Skills: `frontend-ui-engineering`, `test-driven-development`, `incremental-implementation` + Read de `save-a-life-security-privacy/SKILL.md`. Para la API de Leaflet (`L.marker` con `draggable`, `divIcon`, `maxBounds`, evento `click`) puede consultar context7.

- **Nuevo** `frontend/src/features/donor/LocationMap.tsx`. Props: `latitude`, `longitude` (string, puede estar vacía) y `onChange(lat, lon)`. Copia el patrón de `CoverageMap`: OSM con `referrerPolicy: 'origin'`, `map.remove()` al desmontar y `scrollWheelZoom: false`.
  - Sin ubicación, el mapa se centra en Lima (zoom 11) con el aviso «Haz clic en el mapa para marcar tu zona aproximada».
  - Con ubicación, muestra un `L.marker` arrastrable con `divIcon` (CSS, sin imágenes) y un `L.circle` de 110 m, con zoom ~15.
  - Con un clic o al soltar el marcador, se llama a una **función pura exportada** `toApproximate(lat, lng)`. Devuelve `{latitude, longitude}` con `toFixed(3)`, o `null` si el punto cae fuera de `LIMA_BBOX`, y en ese caso se muestra el mensaje «Elige un punto dentro de Lima».
  - `maxBounds` = bbox de Lima.
  - Para que el bbox se pueda reutilizar, `frontend/src/lib/mapbox.ts` exporta los 4 límites numéricos y la cadena se construye a partir de ellos.
- **Accesibilidad:** contenedor con `role="group"`, `aria-label` y un estado `aria-live` («Ubicación aproximada marcada en el mapa»). La búsqueda de dirección y los campos lat/lng siguen siendo la alternativa sin ratón, y el mapa es una mejora encima de ellos.
- **Privacidad:** texto visible bajo el mapa: «El mapa se carga desde OpenStreetMap; guardamos solo una zona aproximada (~110 m)».
- **Integración:**
  - `OnboardingPage.tsx`: va debajo de `AddressSearch`. `onChange` hace `setLatitude`/`setLongitude`, así que el error «Busca tu dirección…» desaparece al marcar en el mapa.
  - `ProfilePage.tsx`: va debajo de `AddressSearch` y además hace `setSaved(false)`.
  - Los campos manuales siguen sincronizados en las dos direcciones.
- **Pruebas:** `LocationMap.test.tsx` con `toApproximate`: redondeo, bordes del bbox y fuera de rango. También comprueba que el componente se renderiza con su etiqueta y que, sin coordenadas, muestra el aviso (copia la preparación de jsdom de `CoverageMap.test.tsx`). Se ajustan `OnboardingPage*.test.tsx` y `ProfilePage.test.tsx` si se rompen.
- **Comandos:** `npm run test --workspace @save-a-life/frontend`, `npm run typecheck --workspace @save-a-life/frontend` y `npm run lint`.

### Agente 1B: buzón web local + enlaces DEV
Skills: `test-driven-development`, `security-and-hardening`, `documentation-and-adrs` + Read de `save-a-life-security-privacy/SKILL.md`.

- **Nuevo** `scripts/dev-mailbox.mjs`, con `node:http` y sin dependencias. Exporta `createMailboxServer(dir)` y, cuando se ejecuta directamente, escucha en **`127.0.0.1` solamente**, en el puerto `DEV_MAILBOX_PORT` (por defecto 4025). Si `NODE_ENV=production`, se niega a arrancar.
  - `GET /`: lista los `.html` de `backend/.dev-mailbox/` del más nuevo al más antiguo, con Para, Asunto, hora y un **botón por cada enlace `href`** a las rutas conocidas (`/verificar-correo`, `/restablecer-contrasena`, `/activar-cuenta`, `/cambiar-correo`, `/invitacion-administrador`, `/invitaciones`). Acepta el filtro opcional `?para=`. Se refresca solo cada 5 s con `<meta refresh>`. Si el directorio está vacío o no existe, explica: «arranca `npm run dev:worker` con EMAIL_PROVIDER=dev-mailbox».
  - `GET /m/<nombre>`: sirve el correo guardado. El nombre se valida con `^[A-Za-z0-9_-]+\.html$`; si no coincide, responde 404 (esto impide el path traversal). Cabeceras: `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` y `Cache-Control: no-store`.
  - Todo lo que se pinta en la lista se escapa. Nunca se loguean el contenido ni los tokens.
- **Nuevo** `scripts/dev-mailbox.test.mjs` (`node:test`). Comprueba: el orden de la lista, que extrae los enlaces, el filtro `?para=`, el 404 ante `../` y nombres inválidos, las cabeceras CSP/nosniff y el escape de un asunto con `<script>`.
- **`package.json` (raíz):**
  - `"dev:mailbox": "node scripts/dev-mailbox.mjs"`.
  - `"dev:local": "concurrently -k -n api,worker,front,mail \"npm:dev:backend\" \"npm:dev:worker\" \"npm:dev:frontend\" \"npm:dev:mailbox\""`.
  - Incluir el test nuevo en `test:api:generator`, o crear `test:scripts` y engancharlo donde CI ya ejecuta los tests de `scripts/`.
- **Frontend:** nuevo `frontend/src/features/auth/components/DevMailboxLink.tsx`. Solo se renderiza si `import.meta.env.DEV`, apunta a `import.meta.env.VITE_DEV_MAILBOX_URL ?? 'http://127.0.0.1:4025'`, se abre en una pestaña nueva con `rel="noreferrer"` y dice «Abrir buzón de desarrollo». Se usa en el éxito de `RegisterPage.tsx` («Revisa tu correo»), en el `doneDetail` de `VerifyEmailPage.tsx` y en la confirmación de `RecoverAccessPage.tsx`. Prueba: no aparece fuera de DEV (con `vi.stubEnv`) y aparece en DEV.
- **Documentación:** en la sección de desarrollo local de `docs/Deploy-Runbook.md`, un párrafo con «Cómo verificar cuentas en local: `npm run dev:local` → registrarse → botón *Abrir buzón* → *Verificar correo* → segundo correo → *Crear contraseña*». En `frontend/.env.example`, si existe, la variable `VITE_DEV_MAILBOX_URL`.
- **Comandos:** `node --test scripts/dev-mailbox.test.mjs`, `npm run test --workspace @save-a-life/frontend` y `npm run lint`.

**Revisión de la Fase 1 (agente principal, ~10 min):** leer los dos informes y el `git diff --stat`. Confirmar que cada agente tocó solo sus archivos y repetir yo mismo los comandos clave. Si algo falla, se le devuelve al mismo agente con `SendMessage`, no se lanza uno nuevo.

## Fase 2: Gates de revisión independiente (3 agentes en paralelo, solo lectura, ~20 min)

A cada revisor se le pasa en el prompt el contenido de su rol en `.opencode/agent/<rol>.md`, el alcance (`git diff main...HEAD -- <rutas>`) y la instrucción «no escribas archivos; responde PASS / PASS con observaciones / FAIL con hallazgos `archivo:línea`». Ningún revisor puede haber escrito el artefacto que revisa.

| Revisor | Rol + skills | Alcance |
|---|---|---|
| R1 front + accesibilidad | `reviewer-front.md` + `frontend-accessibility-engineer.md`; `code-review-and-quality`, `frontend-ui-engineering` | `LocationMap`, Onboarding/Profile, `DevMailboxLink` |
| R2 seguridad y privacidad | `security-privacy-auditor.md`; `security-and-hardening` + Read de `save-a-life-security-privacy/SKILL.md` | buzón: solo loopback, path traversal, CSP, escape, guard de producción, que no exponga nada en el build de producción (`npm run build` y grep de `dev-mailbox`/`4025` en `frontend/dist`); mapa: coordenadas redondeadas, datos que van a OSM, texto de privacidad |
| R3 QA y fiabilidad | `qa-reliability-engineer.md`; `code-review-and-quality`, `test-driven-development` | si las pruebas cubren los bordes, si `dev:local` arranca, el estado vacío del buzón y que `test:e2e:real` no se rompa |

**Ciclo de corrección:** los hallazgos FAIL vuelven al implementador original (1A o 1B) con `SendMessage`. Después se revisan de nuevo **solo los cambios nuevos**, con el mismo revisor. Como máximo hay 2 ciclos; si quedan hallazgos, se informan al usuario. Las observaciones no bloqueantes se anotan en la bitácora.

## Fase 3: Verificación E2E real (1 agente, ~30 min)

Agente `general-purpose` con las skills `webapp-testing` y `verification-before-completion`. Necesita backend + worker + Supabase local (`supabase start --workdir backend`) con `EMAIL_PROVIDER=dev-mailbox`.
1. `npm run test:e2e:real`: sirve como prueba de regresión del registro existente, que sigue leyendo `.dev-mailbox`.
2. Recorrido con Playwright MCP sobre `npm run dev:local`: registro con `donante.mapa@example.test` → el botón «Abrir buzón de desarrollo» abre `:4025` → «Verificar correo» → aparece el segundo correo → «Crear contraseña» → ingresar → onboarding: buscar dirección, **arrastrar o hacer clic en el mapa**, comprobar que el punto se mueve, guardar → el perfil muestra el mapa con el punto guardado → hacer clic fuera de Lima y ver el mensaje.
3. Las capturas van a `/tmp/claude-1000/-home-diego-Documentos-UNI-Clases-Desarrollo-De-Software-proyecto/bad6d3f0-d3f7-424a-86e8-08980953265b/scratchpad/` y nunca al repo. No se guardan trazas ni HAR.

**Revisión:** el agente principal mira las capturas y el informe. Si algo no se pudo verificar (por ejemplo, porque Supabase local no arrancó), se dice así y no se marca PASS.

## Fase 4: Cierre (agente principal, ~15 min)

Skills: `verification-before-completion` y `git-workflow-and-versioning`.
- Ejecutar en verde `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` y `npm run check:headers`, más `node --test scripts/dev-mailbox.test.mjs`.
- Commits atómicos con Conventional Commits, preparando solo los archivos de cada unidad y **sin la línea Co-Authored-By de Claude** (memoria del usuario):
  1. `feat(frontend): mapa para ver y ajustar la ubicación aproximada del donante`
  2. `feat(dev): buzón web local para abrir los correos de desarrollo y enlaces DEV`
  3. `docs: cómo verificar cuentas en local y bitácora del plan`
- Bitácora final en `docs/plans/2026-11-24-mapa-ubicacion-y-buzon-dev.md` con los gates reales. **El usuario aprueba el cierre del módulo.** Sin push ni merge hasta que lo pida.

## Fase futura (no se implementa ahora): Resend + OTP de 6 dígitos

Requiere su propia aprobación. Incluye: una operación nueva en `docs/openapi.json` (empieza como borrador y hay que ratificarla), una RPC que guarde el **hash** del código con TTL de 10 min, un máximo de 5 intentos y una cuota por correo/IP (`AUTH_QUOTA`), una plantilla `verificacion_email` con el código y una pantalla para introducirlo. El buzón local mostrará ese correo igual que los demás. En ese momento se decidirá si se instala `better-auth/skills@two-factor-authentication-best-practices` como referencia.

## Verificación (resumen)

- Unitarias: `npm run test --workspace @save-a-life/frontend` (mapa, enlaces DEV) y `node --test scripts/dev-mailbox.test.mjs`.
- Calidad: `npm run lint`, `npm run typecheck`, `npm run build`, `npm run check:headers` (sin cambios en la CSP).
- Real: `npm run test:e2e:real` y el recorrido con Playwright MCP de la Fase 3.

## Bitácora

### Fase 0: preparación (2026-11-24)

- Rama `feat/mapa-ubicacion-y-buzon-dev` creada desde `main` (`a153259`). Node 24.19.0 y npm 12.0.2.
- Línea base antes de tocar código:
  - `npm run typecheck`: sin errores.
  - `npm test --workspace @save-a-life/frontend`: 53 archivos y 393 pruebas en verde.
  - `npm run lint`: 0 errores y 14 advertencias preexistentes.
- Archivos sin seguimiento ajenos a esta rama (no se tocan): `docs/Informe-Tipos-De-Errores.pdf` y `docs/plans/2026-11-24-informe-tipos-de-errores.md`.

### Fase 1: implementación (2026-11-24)

Dos subagentes `general-purpose` en paralelo y sin commits. El primer lanzamiento fue rechazado porque un hook modificó la llamada; el reintento con el input exacto pasó (regla 7).

- **1A (mapa):** `LocationMap.tsx` y su prueba, `LIMA_BOUNDS` en `lib/mapbox.ts`, integración en `OnboardingPage` y `ProfilePage`, ajuste de sus pruebas. Elegir un punto borra los errores de ubicación.
- **1B (buzón):** `scripts/dev-mailbox.mjs` y su prueba (sumada a `test:api:generator`, CI sin cambios), scripts `dev:mailbox` y `dev:local`, `DevMailboxLink` en registro, verificación y recuperación (`doneDetail` pasa a `ReactNode`), `.env.example` y `Deploy-Runbook.md`.
- Añadidos fuera de la especificación (1B): 403 si el `Host` no es `127.0.0.1` ni `localhost` (DNS rebinding), cabeceras en todas las respuestas y `VITE_DEV_MAILBOX_URL` comentada en `.env.example`.

**Revisión de la Fase 1** (agente principal; no es el gate independiente de la Fase 2). Cada agente tocó solo sus archivos. Comandos repetidos:

| Comando | Resultado |
|---|---|
| `node --test scripts/dev-mailbox.test.mjs` | 10/10 |
| `npm run test:api:generator` | 39/39 |
| `npm test --workspace @save-a-life/frontend` | 55 archivos, 412 pruebas en verde |
| `npm run typecheck` | sin errores |
| `npm run lint` | 0 errores, 14 advertencias (las de la línea base) |
| `npm run build --workspace @save-a-life/frontend` | correcto; sin `dev-mailbox`, `4025` ni «Abrir buzón» en `frontend/dist` |

**Sin verificar:** navegador real, arrastre del marcador y su reversión fuera de Lima (sin prueba automática: la prueba opcional falló 2 veces y se retiró), `npm run dev:local`, `test:e2e:real` y CI.

### Verificación real (2026-11-25, a pedido del usuario, antes de la Fase 2)

Cubre la Fase 3. La ejecutó el agente principal, sin subagente; no es un gate de revisión independiente.

| Verificación | Resultado |
|---|---|
| `npm run test:e2e:real` (reinicia la base local) | 16/16 PASS |
| Jobs de `ci.yml` en una copia limpia sin `.env` (`npm ci`, `npm test`, `openapi:lint`, `openapi:api:check`, `test:api:generator`, `build`, `check:headers`, `docker build`) | los 8 pasos con exit 0; pruebas: 52, 15, 862 y 412 |
| `npm run dev:local` contra el Supabase local | arrancan API, worker, frontend y buzón; buzón solo en `127.0.0.1`, 404 ante path traversal, 403 con `Host` ajeno, cabeceras correctas |
| Recorrido en Chromium con ventana, con Mapbox | 24/24 PASS: registro, buzón, los dos correos, búsqueda, arrastre y clic (punto guardado comprobado en la base), rechazo fuera de Lima, 360 px sin desplazamiento horizontal, enlace en recuperación |
| Recorrido sin token de Mapbox | 5/5 PASS: sincronización mapa ↔ campos de latitud y longitud |

- `backend/.env` apunta al Supabase **remoto**: para el recorrido se sobrescribieron las variables del proceso con las del Supabase local. `npm run dev:local` sin sobrescribirlas usa el remoto.
- Consola del navegador: dos 404 de `/api/v1/donors/me/profile` en la fase con Mapbox; esta rama no cambia esa petición.
- La búsqueda «Parque Kennedy Miraflores» devolvió un punto en otra zona de Lima (resultado de Mapbox); el mapa permite verlo y corregirlo.
- Sin verificar: la ejecución de CI en GitHub (requiere push o PR), otros navegadores y un dispositivo móvil físico. El arrastre sigue sin prueba automática en el repo.

### Fase 2: gates de revisión independiente (2026-11-25)

Tres subagentes `general-purpose` en solo lectura, que no escribieron lo que revisan; el árbol quedó idéntico tras la primera ronda (hash). Cada revisor leyó su archivo de rol en `.opencode/agent/` (R1 sumó `reviewer-front` y `frontend-accessibility-engineer`). Sin commits todavía, el alcance fue `git diff main` más los archivos sin seguimiento.

| Revisor | Ronda 1 | Ciclo 1 |
|---|---|---|
| R1 front y accesibilidad | **FAIL** (2 bloqueantes) | **PASS con observaciones** |
| R2 seguridad y privacidad | **PASS con observaciones** | no aplica |
| R3 QA y fiabilidad | **PASS con observaciones** | no aplica |

**Bloqueantes corregidos por 1A** (ciclo 1 de 2):

- H1 (WCAG 2.1.1 y 4.1.2): con token de Mapbox el punto no se podía ajustar con teclado. Ahora el mapa es `role="application"` con nombre e instrucciones, flechas finas, mira central y Enter para marcar. Los campos manuales siguen ocultos con token.
- H2: el mapa aceptaba el rectángulo y la base valida un polígono. `location.ts` replica `app.in_lima_demo_1` sobre el punto redondeado; una prueba compara los vértices con el backend.

Tras la corrección: 427/427 pruebas, typecheck sin errores y lint con 0 errores y 14 advertencias.

**Corrección del agente principal, sin revisión posterior:** advertencia en `Deploy-Runbook.md` de que `dev:local` usa el Supabase de `backend/.env`, aunque sea remoto (R2 H1, R3 1).

**Observaciones no bloqueantes pendientes (decide el usuario):**

| Origen | Observación |
|---|---|
| R2 H1, R3 1 (alta/media) | No hay guarda que impida `dev:local` o `dev-mailbox` contra un Supabase remoto; solo la advertencia. |
| R1 a | El `<meta refresh>` de 5 s que pide el plan incumple WCAG 2.2.1 y quita el foco; propuesta: enlace «Actualizar». Cambia el plan. |
| R1 2 | La búsqueda de Mapbox no filtra por polígono: un resultado fuera queda sin marcador y el servidor lo rechaza. |
| R1 1 | A zoom 11 y mapa ancho, las flechas no desplazan en horizontal hasta pulsar `+`. |
| R1 b, 3, 4 | Coordenadas fuera de Lima piden «Haz clic»; mover el punto no se reanuncia; «Escribe latitud y longitud a mano» sin campos (preexistente). |
| R2 H2 | OpenStreetMap recibe IP y zona vista (más fina que 110 m al acercar) y el texto no lo dice; propuesta: `maxZoom` 16 y texto. |
| R2 H3, H4, info | Falta `frame-ancestors 'none'`; otros procesos locales pueden leer el buzón; `/m/` sigue symlinks. |
| R3 2–4 | Faltan pruebas del arrastre (con prototipo viable), de los errores y la búsqueda en el perfil y de varios bordes del buzón. |
| R3 5, 6 | Puerto 4025 ocupado muestra traza cruda y `-k` detiene todo; `VITE_DEV_MAILBOX_URL` vacía deja `href=""`. |
| R3 preexistente | `test-e2e-real.mjs` usaría cualquier servidor ya activo en 3000/5174. |
| Fase 3 | La mira central del mapa aparece también tras un clic de ratón y se superpone al marcador (efecto de la corrección H1; probable arreglo: mostrarla solo con foco de teclado). |

### Fase 3: verificación E2E real tras la corrección (2026-11-25)

Un subagente `general-purpose` con `webapp-testing` y `verification-before-completion`, sin editar archivos, contra el Supabase local (variables sobrescritas) y con Playwright MCP.

| Paso | Resultado |
|---|---|
| `npm run test:e2e:real` | 16/16 PASS |
| Registro → buzón → verificar → segundo correo → crear contraseña → ingresar | PASS |
| Onboarding: búsqueda, arrastre, clic y guardado (base coincide con el marcador) | PASS |
| Perfil muestra el punto guardado | PASS |
| Rechazo fuera del polígono (esquina), fuera del rectángulo y arrastre fuera sin escrituras | PASS |
| Teclado: Tab, flechas, Enter y guardado | PASS |
| Sin verificar | rechazo fuera de Lima con Enter en navegador, otros navegadores, CI en GitHub |

El enlace en recuperación y la vista de 360 px se comprobaron en la verificación anterior a la corrección, no en esta. Consola: dos 404 de `/api/v1/donors/me/profile` y un aviso informativo del formulario de contraseña.

Revisión del agente principal: capturas 08, 11 y 13 vistas; puertos libres, árbol idéntico al de antes de la fase (hash) y sin `backend/.dev-mailbox`. Capturas en el scratchpad de la sesión, fuera del repo.

La copia local de CI y los 8 pasos de `ci.yml` se ejecutaron antes de la corrección; la Fase 4 los repite.

### Correcciones pedidas por el usuario tras la Fase 3 (2026-11-25)

El usuario pidió corregir tres observaciones. Las escribió el agente principal, con prueba en rojo primero.

1. **Mira tras un clic de ratón.** `:focus-visible` no bastó (3 fallos seguían en Chromium, porque Leaflet enfoca el mapa por código). La mira se muestra ahora solo en modo teclado (`keyup` / `pointerdown` / `blur`). Sonda en Chromium: 3 fallos antes, 10/10 después. Firefox no arrancó.
2. **`dev:local` contra un Supabase remoto.** Nueva guarda `scripts/check-local-supabase.mjs`: solo arranca si `SUPABASE_URL` es local. `dev:backend` y `dev:worker` no cambian.
3. **Recarga cada 5 s del buzón.** **Cambia el plan, con aprobación del usuario:** donde la sección «Agente 1B» pide `<meta refresh>` cada 5 s, vale ahora un enlace «Actualizar» que conserva `?para=` (WCAG 2.2.1).

| Revisor | Alcance | Veredicto |
|---|---|---|
| R1 | 1 y 3 | PASS (1) y PASS con observaciones (3: anotar el cambio de plan, hecho aquí) |
| R2 | 2, ronda 1 | **FAIL**: `package.json` había quedado en `concurrently -k-n` (se perdían los nombres y `-k`) |
| R2 | 2, tras corregir | PASS |

El recorrido en Chromium pasó 24/24 con el fallo `-k-n` presente, así que no lo detectaba; la prueba ahora asevera `-k -n`. Tras el arreglo se comprobó el arranque real: los cuatro prefijos y, con el puerto 4025 ocupado, salida 1 con todos los procesos detenidos.

El clasificador de permisos denegó un comando que incluía `npm run dev:local` con el `backend/.env` real; el rechazo de un destino remoto queda probado solo con valores sintéticos.

Observaciones no bloqueantes nuevas (R2): la guarda no mira `EMAIL_PROVIDER` ni `APP_PUBLIC_URL`; una API remota ya activa en `:3000` podría usarse; ejecutada por un symlink la guarda no comprueba nada.

### Fase 4: cierre (2026-11-25)

Commits, sin push ni merge:

1. `9cd7ea9` `feat(frontend): mapa para ver y ajustar la ubicación aproximada del donante`
2. `1d50b84` `feat(dev): buzón web local para abrir los correos de desarrollo y enlaces DEV` (incluye la guarda de `dev:local`)
3. `docs: cómo verificar cuentas en local y bitácora del plan` (el commit que contiene esta bitácora)

Verificación sobre el contenido versionado, en copias creadas con `git archive` (sin `.env`) y con `npm ci`:

| Alcance | Comando | Resultado |
|---|---|---|
| Commit 1 aislado | `npm ci`, pruebas del frontend, `typecheck`, `lint`, `build` | exit 0; 54 archivos y 425 pruebas; lint 0 errores y 14 advertencias |
| Commit 2 | `npm ci`, `npm test` | exit 0; 52, 15, 862 y 428 pruebas |
| Commit 2 | `openapi:lint`, `openapi:api:check`, `test:api:generator` | exit 0; 46/46 pruebas de `scripts/` |
| Commit 2 | `build`, `check:headers`, `docker build` | exit 0; sin rastro del buzón en `frontend/dist` |
| Commit 2 | `typecheck`, `lint`, `node --test scripts/dev-mailbox.test.mjs` | exit 0; 0 errores y 14 advertencias; 11/11 |
| Árbol de trabajo | `npm run test:e2e:real` (Supabase local, reiniciado) | 16/16 PASS |

Estado de los gates: R1 **PASS con observaciones**, R2 **PASS** en su última ronda (con las observaciones no bloqueantes anotadas) y R3 **PASS con observaciones**. R3 revisó antes de las correcciones posteriores.

Sin verificar: CI en GitHub (requiere push o PR), Firefox, lector de pantalla, dispositivo móvil físico y el rechazo de `dev:local` con el `backend/.env` real.

**Pendiente: la aprobación del usuario para cerrar el módulo.** Push y merge solo cuando lo pida.

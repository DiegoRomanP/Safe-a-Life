# Correcciones de la revisión de código de F6 y registro E2E real

Rama `feat/frontend-invitaciones`. Origen: dos pasadas de `/code-review` sobre `731d1b0` y la rama.

## Correcciones (commits `8ef97b1` backend, `4ad1322` frontend)
- **Replay del lote vs. tope:** `authorize_invitation_batch(p_need_id, p_key, p_hash)` consulta la idempotencia del admin antes del tope y del estado; un replay devuelve el lote guardado (antes 429/409) y no emite ni audita otra concesión. El servicio autoriza primero y solo lee la necesidad si no es replay.
- **Tope saltable:** `request_invitation_batch` revalida los 20 lotes/hora bajo el lock global de cuota. Índice `(requested_by, created_at)`.
- **Perfil activo coherente:** la vista previa y el reintento manual exigen `activo` como la respuesta por token; el reintento devuelve 409 si hay una eliminación en ejecución.
- **Retiro de confirmación:** `change_own_invitation_response` vuelve a permitir pasar a `rechazada` con el perfil no activo (RF-INV-06); solo confirmar lo exige.
- Comentario de `20261022100000` corregido: no existe `suspendido` y hoy ningún flujo saca un perfil de `activo` (defensa en profundidad).
- Frontend: 429 de la vista previa del enlace muestra «Espera unos minutos» sin reintento inmediato; comentario de `respondWithToken` corregido; correos `@example.test`; `vercel.json` con el fallback de la SPA.
- Migración nueva `20261022110000_review_fixes.sql`; `EXPECTED_SCHEMA_VERSION` actualizado.

## Registro E2E real (`npm run test:e2e:real`)
Paso 0 nuevo: `/registro` → buzón local (`/verificar-correo`) → barrera de sesión (`incompleto` + `password_setup_required`) → segundo enlace (`/restablecer-contrasena`) → ingreso → `/donante/bienvenida` → perfil `activo` en la base → el hospital pide un lote y el donante registrado recibe la invitación.

## Verificación (2026-11-20, Supabase local)
- pgTAP 1169+ PASS (casos nuevos: 19→ok, replay con clave, tope en el paso 2, retiro con perfil no activo, preview/token 410, reintento con eliminación).
- Backend vitest 829/829, integración 227/227, frontend 337/337, `npm run lint` 0.
- Bruno CLI contra el backend real: todas las colecciones PASS.
- E2E real en Chromium: 15/15 PASS (con `E2E_CHROMIUM` apuntando a `~/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome`: falta el headless shell 1248 que pide la versión instalada de Playwright).

## Verificación manual con Playwright (navegador, 3 roles, Supabase local)
- **Donante nuevo:** registro → verificación → (ingreso antes de fijar contraseña: 401) → contraseña con el segundo enlace → ingreso → perfil obligatorio → `activo` en la base.
- **Bug encontrado y corregido (`36a6871`):** un 401 del login mostraba «No fue posible confirmar la sesión… puede quedar una sesión activa», que confunde; ahora 401 da un mensaje neutro de credenciales (indica crear la contraseña si recién verificó) y 429 pide esperar.
- **Superadmin:** contraseña + TOTP → tareas, hospitales, administradores (correos enmascarados); todas las llamadas 200.
- **Admin de hospital:** contraseña + TOTP → crea y activa necesidad A+ → lote de 9 invitaciones `enviada`.
- **Ciclo completo:** el donante registrado confirma por el enlace del correo; reabrir el enlace muestra «Enlace ya utilizado» (410); el hospital ve su nombre y grupo declarado y solo códigos para el resto; el donante retira la confirmación desde su sesión (historial `confirmada/token → rechazada/sesion`, auditoría con ambos eventos).

## Pendiente / límites
- La migración `20261022110000` **no** está aplicada al Supabase remoto.
- `list_superadmin_tasks` sigue mostrando fallos de entrega de donantes no activos o en eliminación: es INVOKER y el superadmin no lee `donor_profiles` por RLS; el reintento responde 409.
- El rewrite `/api/*` → Render con `X-Edge-Secret` sigue en F9 (ADR-004): sin origen de Render no se agrega.
- Sin revisión independiente (gate) de estas correcciones.

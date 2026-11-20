# E2E real de 3 roles y revisiones independientes del frontend (F8)

Fecha: 2026-11-20. Rama: `feat/frontend-invitaciones`.

## Alcance
- Botón «Reintentar entrega» en la cola de tareas del superadmin (`delivery_failure`: el `taskId` es el `invitationId`; exige step-up ≤ 5 min).
- `npm run test:e2e:real` (`scripts/test-e2e-real.mjs`): Chromium contra el backend REAL (Express + worker con buzón local `dev-mailbox` + Vite :5174) y Supabase **local**. Reinicia la base, siembra cuentas sintéticas `*.example.test` y recorre los tres roles con cookies, CSRF, MFA TOTP y correo reales. Requiere `supabase start --workdir backend`. Variables: `E2E_CHROMIUM` (ruta de un Chromium si el de Playwright no coincide), `E2E_SHOTS` (carpeta de capturas), `E2E_HEADED=1`.
- Decisión: **no** se corre contra el Supabase remoto. Su auditoría es append-only (no se puede limpiar) y crear cuentas con rol superadmin/admin allí exige el alta permitida por ADR-006; queda para cuando la persona usuaria lo pida.

## Recorrido verificado (8/8 PASS)
1. Superadmin: contraseña + TOTP → «Tareas administrativas»; ve los hospitales de la siembra.
2. Admin de hospital: contraseña + TOTP → crea y activa una necesidad → solicita un lote → aparece en la tabla.
3. Donante 1: abre el enlace del correo (leído del buzón local, sin sesión) y confirma con el botón.
4. Donante 2: confirma con su enlace, entra con su cuenta, ve la invitación y cambia a «No podré asistir» (PATCH 200).
5. Hospital: en «Respuestas» ve el nombre del donante que confirmó y no el del que rechazó.

Hallazgo de diseño confirmado: la primera respuesta solo se registra con el enlace del correo; la sesión solo cambia una respuesta ya dada (409 si no hay respuesta previa).

## Revisiones independientes (subagentes de solo lectura; no escribieron el código; revisión estática)
- **reviewer-front (F2, F3, F4, F5, F7 + botón):** PASS con observaciones, sin Critical/High; 335 tests y typecheck OK. Medium: (1) el 410 del reintento mostraba el copy del acceso contextual → corregido; (2) `SaveErrorNotice` usa copy de perfil en lotes y cambio de respuesta, y un 429 se muestra como error de conexión → pendiente. Low: Idempotency-Key nueva en cada intento, sin estado ocupado en el botón de reintento, 400/403/429 en la vista previa caen en «Reintentar». No verificó cookies reales, contraste ni lector de pantalla, ni leyó línea a línea LoginForm, RecoverAccess, ActivateAccount, NeedsPage, CreateNeedPage, AssistedSignups, Profile, NewRequest, Onboarding ni el resto del superadmin.
- **security-privacy-auditor (hospital F4):** PASS con observaciones, sin Critical/High. Medium: (M1) el SPA no declara CSP ni cabeceras propias (depende del hosting); (M2) sin tope por correo destinatario en altas asistidas (20/h por hospital). Low: el hospital exige AAL2 pero no step-up en acciones masivas; Idempotency-Key por intento; la concesión del lote no revalida la barrera de sesión en el paso 2 (ventana 2 min, documentado); lock advisory global en lotes. No ejecutó pgTAP, integración, Bruno ni Playwright; no es cumplimiento legal.
- Con el E2E real se cubre lo que los tests con `fetch` simulado no probaban: cookies, CSRF, MFA y correo reales en el flujo principal.

## Pendiente / decisiones de la persona usuaria
- Aprobar el cierre de los módulos F2 a F7 (sin merge a main ni push).
- Corregir o aceptar: M2 de seguridad (tope por correo en altas), step-up en acciones masivas del hospital, CSP del SPA, copy de `SaveErrorNotice`, claves de idempotencia por intento.
- F1: correo real a Gmail con Resend (necesita `RESEND_API_KEY` y Gmail permitido).
- Demo contra el Supabase remoto con cuentas sintéticas.

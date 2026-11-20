# Frontend: acceso completo por rol (F2)

Rama `feat/frontend-acceso-por-rol` (desde `feat/demo-e2e-donante`). Plan maestro: `/home/diego/.claude/plans/mira-lo-que-veo-eventual-karp.md` (fases F0–F8, demo local completa).

## Alcance
Sustituir los stubs de acceso del frontend real (`frontend/`) por llamadas al backend real y exigir MFA (aal 2) en hospital y superadmin. Los datos de esas áreas siguen siendo demo hasta F3/F4.

## Estado

| Slice | Commit | Contenido | Estado |
|---|---|---|---|
| A | `785760c` | `RequireRole` exige aal 2 para `admin_hospitalario`/`superadmin` (aal 1 → `/verificar-identidad`); guards en `/hospital` y `/superadmin`; login redirige por rol (`session/destination.ts`); se quitan los atajos DEV a áreas demo; `renderRoute` siembra sesión por área | Verificado localmente |
| B | `64e3164` | MFA real: `enrollMfa`/`verifyMfa` (`lib/api/auth.ts`, `session.ts`), `VerifyIdentityPage` (reto del login o alta del factor, CSRF nuevo tras elevar la sesión); recuperación de acceso real (`POST /auth/password-recovery-requests`) | Verificado localmente |
| C | `6275c82` | Enlaces por token reales: cambio de correo (`POST donor-email-change-actions`), alta asistida (`POST .../claim`), invitación de administrador (GET vista previa + `POST .../claim` + sesión aal 1 en memoria) con `PasswordClaimForm` compartido | Verificado localmente |

## Verificación realizada
`npm run lint` (0 errores, 14 avisos previos), `npm run test --workspace @save-a-life/frontend` (315/315), `npm run build --workspace @save-a-life/frontend`. Los tests usan `fetch` simulado: **no prueban cookies reales ni el backend**.

## Decisiones y atajos (`shortcut:`)
- Tras recargar con aal 1 no se puede reanudar el reto MFA (`GET /auth/session` no devuelve `mfaChallengeId`): sin reto, la página ofrece enrolar; si ya hay factor el backend responde 409 y se pide ingresar de nuevo.
- La clave TOTP se muestra como texto (sin código QR); añadir QR si se incorpora una librería aprobada.
- Sin GET de vista previa en `/activar-cuenta`, `/cambiar-correo` y `/verificar-correo`: el estado del enlace se conoce al confirmar.
- Step-up por acción sensible (`POST /auth/step-up-verifications`) queda para F3 (superadmin).
- `/invitaciones` (enlace de invitación a donante) sigue demo: depende de F6.

## Revisión independiente (solo lectura; los revisores no escribieron el código)
- **reviewer-front: PASS** con hallazgos no bloqueantes; vitest 315/315 verificado por el revisor. No cubre navegador, lector de pantalla ni backend real.
- **security-privacy-auditor: PASS** sin Critical/High (2 Medium, 4 Low). No cubre la neutralidad de la recuperación en el backend, los logs del proxy ni Bruno contra el backend real.
- **Corregido tras las revisiones** (commit de seguimiento): 401 de «sesión perdida» distinto del de código incorrecto (`SESSION_LOST`) con vuelta a `/ingresar`; fallo del CSRF tras elevar la sesión o tras reclamar la invitación ya no se presenta como fallo; foco al campo de código tras enrolar; `aria-disabled` en lugar de `disabled` en los botones de envío; el aviso de fallo se limpia al reenviar. Tests nuevos: doble envío, sesión perdida durante la verificación, CSRF fallido tras verificar y tras reclamar, foco tras enrolar.
- **Sin corregir (aceptado/pendiente):** `setAuthSession` no incrementa `epoch` ni limpia `signedOutLocally` (inocuo hoy); la sesión aal 1 se pierde al recargar `/verificar-identidad` (UX, requiere reanudar reto: brecha de contrato); el estado «usado/vencido» de `/activar-cuenta` y `/cambiar-correo` solo se ve al confirmar (sin GET de vista previa).

## Pendiente
- Smoke real con cookies: login de administrador + MFA contra Supabase remoto requiere cuentas sintéticas (F8) y Bruno contra el backend real.
- Cierre del módulo: aprobación del usuario.

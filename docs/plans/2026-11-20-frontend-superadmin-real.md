# Frontend: área superadmin contra el backend real (F3)

Rama `feat/frontend-superadmin-real` (desde `feat/frontend-acceso-por-rol`). Plan maestro: `/home/diego/.claude/plans/mira-lo-que-veo-eventual-karp.md`.

## Alcance
Sustituir el contexto demo en memoria del superadmin (`SuperadminDemoContext`) por llamadas a las 20 operaciones ratificadas de identidad-instituciones y privacidad (F2a/F7): tareas, hospitales, sedes, membresías, invitación de administradores, configuración, auditoría, solicitudes de corrección (decidir, grant contextual, ver datos, ejecutar) y el step-up real.

## Qué cambió

| Commit | Contenido |
|---|---|
| `8b6c9ca` | `lib/api/http.ts` acepta cabeceras (p. ej. `X-Contextual-Grant`); `verifyStepUp` en `lib/api/auth.ts`; `session.ts` guarda hasta cuándo vale el step-up (`verifiedUntil`, solo pista de UX), lo olvida al cerrar/expirar sesión o con `STEP_UP_REQUIRED` |
| `708ab50` | `features/superadmin/api.ts` (cliente con validadores y paginación por cursor, límite de 20 páginas); `SuperadminContext.tsx` (carga todo, recarga tras cada escritura, acciones devuelven `null/false` y dejan el motivo en `actionError`); `SuperadminGate` (carga/error con reintento, ruta pathless sobre las páginas); `StepUpPanel` verifica contra el backend; `ActionError`; páginas adaptadas a acciones asíncronas (el aviso de éxito solo aparece si la acción terminó); se retira el contexto demo |

## Decisiones
- El servidor es la fuente: tareas, auditoría y códigos opacos (`SOL-xxxx`, `ACT-xxxx`) los produce el backend; el cliente ya no los inventa.
- No hay listado global de sedes: se piden `GET /superadmin/hospitals/{id}/sites` por hospital (N+1 aceptado para la demo).
- `inviteHospitalAdmin` responde 202 neutro sin membresía: se recarga `GET /memberships`.
- El grant contextual: `X-Contextual-Grant` lleva el `grantId` (confirmado en `backend/.../privacy-requests.router.ts`). Los datos del donante viven solo en memoria del provider, ligados a `expiresAt` del grant, y se descartan al decidir o ejecutar.
- `STEP_UP_REQUIRED` y `MFA_REQUIRED` no están en `docs/openapi.json` (solo en `Api-Rules.md` / `Backend-Contracts.md`): se distinguen por `error.code`.
- Los fixtures de la demo pasan a `src/test/superadminFixtures.ts`; los tests usan un backend simulado (`src/test/superadminApi.ts`) que reproduce CSRF, step-up de 5 min, grants y 409.

## Verificación realizada
`npm run lint` (0 errores), `npm run test --workspace @save-a-life/frontend` (326/326), `npm run build`. Los tests usan `fetch` simulado: **no prueban cookies reales ni el backend**.

## Atajos y límites (`shortcut:`)
- Paginación: se siguen todas las páginas (limit 100, tope 20); con más de 2000 registros la lista falla en vez de truncarse.
- Carga completa al entrar y tras cada escritura (6 listas + sedes por hospital): simple pero con tráfico alto si crece.
- `POST /superadmin/invitations/{id}/delivery-retries` no tiene pantalla (depende de F6).
- Políticas de reconocimiento (`recognition_policy` en tareas): sin pantalla (drafts, fuera de alcance).

## Revisión independiente (solo lectura; los revisores no escribieron el código)
- **reviewer-front: PASS con observaciones**, sin bloqueos; suite 326/326 verificada por el revisor. Contrato (rutas, cuerpos, cabecera de grant, paginación, step-up, errores) conforme a `docs/openapi.json`. No cubre E2E, Bruno contra el backend real ni verificación visual.
- **security-privacy-auditor: PASS** sin Critical/High (1 Medium, 3 Low). No verificó AAL2/step-up/grant en el servidor (eso es evidencia de Bruno contra el backend real).
- **Corregido tras las revisiones** (commit de seguimiento): purga por temporizador de los datos del donante al vencer el grant (tope de 10 min medido en el cliente) con test de tiempo; tope local de 5 min para el step-up; sesión perdida durante el step-up vuelve a `/ingresar` (antes decía «código incorrecto»); la última carga pedida gana (contador de secuencia); el backend simulado valida el cuerpo de revocar.
- **Aceptado / pendiente:**
  - Una acción pulsada mientras otra está en curso se descarta sin indicador (los botones no tienen `aria-busy`).
  - El aviso de éxito anterior no se limpia si una acción posterior falla (cada página tiene su `notice`).
  - `ActionError` anida `role=alert` dentro de `aria-live` (posible doble anuncio): probar con lector de pantalla.
  - `MFA_REQUIRED` solo muestra texto, sin redirigir a `/verificar-identidad`.
  - El backend simulado no valida cuerpos contra los esquemas generados ni la expiración del grant (410); sin tests de 401 a mitad de uso ni de paginación con `nextCursor`.
  - Una eliminación pide grant sobre `DELETION_FIELDS`: punto abierto del plan de privacidad.

## Pendiente
- Smoke real con cookies y cuenta de superadmin sintética (F8) y Bruno contra el backend real (`npm run test:bruno:backend`).
- Cierre del módulo: aprobación del usuario.

# 2026-10-20 — F7 privacy-requests (backend)

| Campo | Valor |
| --- | --- |
| Rama | `feat/backend-developing` |
| Spec | `2026-10-12-especificacion-faltante-backend.md` §F7 y Anexo B |
| Solicitud | La persona usuaria pidió implementar F7 en el backend (2026-10-20), sin frontend, con commits por parte |
| Orden | **Adelanta F7 a F6** (el orden ratificado era F6 → F7 → F8 → F9). F6 solo tiene su dominio puro (`da425c0`) |
| Revisión independiente | **Ninguna.** `reviewer-back` y `security-privacy-auditor` (gate de F7) **no se han ejecutado**; esto no es un PASS |

## Alcance entregado

| Parte | Commit | Contenido |
| --- | --- | --- |
| Ratificación | `0a710e1` | `x-ratification` (2026-10-20) en las 9 operaciones + respuestas 400/429/500/503; artefactos regenerados |
| SQL 1 | `0b0f32b` | `correction_requests`, `access_grants`, `deletion_ledger`; RLS; RPC INVOKER de alta, lectura, decisión y grants; `get_contextual_donor_data` (DEFINER) |
| SQL 2 | `f870534` | `execute_correction_request` (DEFINER #9), `get_execution_subject`, `issue_email_change`, `finish_email_change`, `finish_deletion`, `fail_correction_request`, `worker_purge_expired` |
| TypeScript | `9c54df3` | Módulo `privacy-requests` (puertos, gateway, servicio, router, job de purga), cableado en API y worker, cierre de la solicitud desde el cambio de correo de F5 |
| Integración | `6b442f5` | `privacy-requests.integration.ts` (7 pruebas) |
| Bruno | `a378838` | `bruno/backend/privacy-requests/{donor,superadmin}` (14 y 20 peticiones) |

## Decisiones de diseño

- **Cambio de correo en dos pasos.** La ejecución deja la solicitud `en_ejecucion`; la sesión técnica abre el correo propuesto (cifrado con el id de la solicitud), emite el token `cambio_email` (el correo nuevo viaja re-cifrado con el hash del token) y el correo al buzón nuevo. Al verificar el enlace (F5), `finish_email_change` la pasa a `completada`; si el correo está ocupado, a `fallida`. El worker la marca `fallida` si no se emitió enlace en 15 min, el enlace venció o se anuló, o quedó consumido sin cierre 1 h.
- **Lectura contextual.** Exige AAL2 y un grant `review` vigente del mismo superadmin y solicitud; **no exige step-up en la lectura** (sí en el grant y la ejecución). Proyecta la intersección grant ∩ campos pedidos; `newEmail` se muestra como `email`. Respuesta `no-store`. La auditoría guarda solo `grant.usado`.
- **Eliminación.** La base corta lo que podría seguir tocando a la persona (disponibilidad, tokens, correos pendientes) y devuelve `next: deletion`. El borrado de Auth y el ledger los cierra la aplicación (`finish_deletion` con HMAC del id, clave derivada `deletion-ledger`). Un cierre perdido lo recupera el worker.
- **Purga del worker** (`worker_purge_expired`, cada 10 min): idempotencia (72 h), tokens vencidos hace más de 24 h, `rate_limit_events` > 1 día, grants vencidos > 1 día, altas sin reclamar tras `purge_at`.
- **`donor_id` legible** por `authenticated` en `correction_requests` (las RPC INVOKER filtran por él); el esquema `app` no se expone por PostgREST y ninguna RPC lo devuelve. `proposed_*` y `decided_by` no son legibles.

## Verificación

- `npm run test:backend:db`: 10 archivos pgTAP, 684 aserciones, PASS (08 y 09 son nuevos).
- `npm run test --workspace backend`: 766 pruebas, PASS. `npm run typecheck`, `npm test` (todos los workspaces), `openapi:api:check` y `openapi:lint`: sin errores.
- `npm run test:backend:integration`: 7 archivos, 208 pruebas, PASS.
- `npm run test:bruno:backend`: todos los escenarios PASS, incluidos los dos nuevos.
- **No ejecutado:** `npm run test:contract` (el paso `scripts/prism-contract.test.mjs` se cuelga en este entorno al arrancar Prism; no se comprobó si ocurre también en el commit anterior), E2E de Playwright, rendimiento.

## No implementado y bloqueado por decisión de la persona usuaria

Ver `docs/pending/2026-10-20-bloqueos-y-decisiones.md` (P-12).

**Prioridad: 🔴 URGENTE.** Sin el borrado de Auth la eliminación de cuentas no se
cumple de punta a punta (responde 503) y los datos personales siguen guardados.
Resolver antes de operar con datos reales.

1. **Borrado de la cuenta de Auth (eliminación V15).** `AuthAdmin` (ADR-006) solo permite 4 métodos y `deleteInertUser` no borra cuentas con rol. Sin adaptador, `executeApprovedCorrectionRequest` sobre una eliminación responde 503 **antes** de tocar nada. Ampliar ADR-006 requiere decisión y revisión de seguridad.
2. **Borrado de cuentas `reclamada_incompleta` > 30 días y usuarios de Auth inertes > 24 h.** Mismo motivo; el job de purga lista las cuentas pero no las borra. Listar usuarios inertes exige además una DEFINER de `postgres` fuera de las cuatro fijadas.
3. **Purga final (`final_demo_at` + 30 días).** Solo con autorización explícita; no hay script.
4. **Anonimización de invitaciones e historial de respuestas** dentro de la eliminación: dependen de las tablas de F6 (no existen).
5. **ADR-003:** las DEFINER nuevas (`get_contextual_donor_data`, `execute_correction_request`, `get_execution_subject`, `issue_email_change`, `finish_email_change`, `finish_deletion`, `fail_correction_request`, `worker_purge_expired`) se cubren con los ítems 9 y 10, pero el texto del ADR no las enumera; no se editó el ADR. Las allowlists de pgTAP (02 y 04) sí se actualizaron.
6. Los valores propuestos de solicitudes terminales (cifrados) siguen guardados hasta la purga final; no se anulan al decidir.

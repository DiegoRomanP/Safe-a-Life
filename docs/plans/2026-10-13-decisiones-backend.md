# Decisiones de la persona usuaria para completar el backend

| Campo | Valor |
| --- | --- |
| Estado | Ratificadas |
| Fecha | 2026-10-13 |
| Rama | `feat/backend-developing` |
| Alcance | Cierra las decisiones abiertas de F2a, F2b, F3, F4 y F5, y fija el alcance de F6 a F9 |
| Origen | Ronda de preguntas punto por punto en la sesión del 2026-10-13 |

## 1. Decisiones

| # | Tema | Decisión | Módulos que afecta |
| --- | --- | --- | --- |
| 1 | F3 D-1 (catálogo de `createHospitalNeed`) | La operación declara también 429 y 503. Se cambia `docs/openapi.json`, se regeneran los seis artefactos y el inventario de Prism | F3, contrato |
| 2 | Tope de necesidades creadas por hospital y hora | 60 (antes 30) | F3 |
| 3 | Altas asistidas por hospital y hora | 20 (se mantiene) | F5 |
| 4 | Excepciones DEFINER propiedad de postgres | Aprobadas las cuatro: `app.user_email`, `app.user_id_by_email(text, interval)`, `api.worker_revoke_sessions` y `api.worker_delete_inert_user(uuid, text, interval)`. Solo `service_role`; se documentan en ADR-003 | F2a, F2b, F5 |
| 5 | F4 M-2 (identidad del worker de correo) | Identidad técnica restringida a `ingest_email_event` para el webhook, con migración y pgTAP | F4 |
| 6 | Auditoría de denegaciones (RNF-AUD-01) | Se auditan también `forbidden`, `conflict`, `site_unusable` y `rate_limited`, sin PII. Para no inflar la tabla, `rate_limited` deja una fila por actor, acción y minuto | F2a, F3, F5 |
| 7 | Pre-secuestro del correo en el autorregistro | Al verificar el correo se revocan todas las sesiones de la cuenta, se emite un enlace de recuperación al correo verificado y `complete_own_onboarding` queda bloqueado hasta fijar contraseña (indicador de cuenta). `verifyDonorEmail` sigue sin recibir contraseña (C-12) | F5 |
| 8 | Retención | Se respeta B.9 (altas asistidas 30 días, idempotencia 72 h, usuarios de Auth inertes 24 h, `reclamada_incompleta` 30 días) y se acorta lo que no define: cuentas sin verificar 48 h, tokens usados o vencidos 48 h | F7 |
| 9 | Necesidades abiertas por hospital | Tope de 20 abiertas a la vez, con 409 y código estable | F6 |
| 10 | `Retry-After` | Se añade a todos los 429, desde el manejador de errores central | Transversal |
| 11 | Texto neutral de las instrucciones de la invitación | Se ratifica: «Preséntate en la sede indicada antes del plazo. El personal de salud verificará tu grupo y tu aptitud.» | F6 |
| 12 | Revisión clínica o legal de F8 | Queda pendiente y documentada, porque el proyecto aún no es público. La información legal se queda en `0.1-borrador`, con aviso neutral y `content` nulo | F8 |
| 13 | Revisión final | Una ronda consolidada de `reviewer-back` y `security-privacy-auditor` (subagentes de solo lectura) al terminar F9. No se declara ningún PASS que no ocurra | Todos |
| 14 | Operaciones remotas | Solo runbook y archivos (`vercel.json`, comandos de Render, guía de migración). No se ejecuta `supabase db push`, despliegue ni cambio de secretos. El `git push` de la rama se hace al final y se detiene ante conflictos | F9 |

## 2. Cómo se aplican

- Las decisiones 1, 2, 5, 6 y 10 son transversales y se entregan como commits propios antes de F6.
- Las decisiones 7 y 8 modifican F5 (7) y definen el worker de F7 (8).
- La decisión 12 no bloquea F8: la mecánica y la semilla en borrador se implementan; el contenido aprobado no existe.

## 3. Plan de trabajo aprobado

Copia en el repositorio del plan aprobado el 2026-10-13 (la original está en `~/.claude/plans/`, fuera del repo).

1. **Fijar decisiones**: este documento, enlazado desde los planes de módulo.
2. **Cerrar F5**: repetir la verificación completa (typecheck, unitarias, `openapi:api:check`, integración, Bruno), aplicar las decisiones 7 y 8 que le afectan, completar `docs/plans/2026-10-13-donor-records.md` y commitear en unidades atómicas (contrato; BD; módulo; integración y Bruno; docs).
3. **Transversal**: decisiones 1, 2, 5, 6 y 10, cada una en su commit (contrato F3, tope de 60, identidad restringida del webhook, auditoría de denegaciones, `Retry-After`).
4. **F6** invitation-coordination, con el tope de 20 abiertas y la cascada de la transición.
5. **F7** privacy-requests y worker de purga con los plazos de la decisión 8.
6. **F8** recognition-policies y legal-information (mecánica y semilla en borrador).
7. **F9** integración, E2E, alineación del mock, rendimiento y runbook.
8. **Ronda final de revisión**, corrección de hallazgos, verificación completa y push.

Verificación por módulo: `npm run typecheck`, `npm run test --workspace backend`, `npm run test:backend:db`, `npm run test:backend:integration`, `npm run test:bruno:backend` y `npm run test:contract`. Al final: `npm test`, E2E contra el backend, informe de rendimiento y las revisiones independientes.

### Bitácora

- 2026-10-13: verificación de F5 tras el rework. `typecheck` verde, 703 pruebas unitarias del backend en verde y `openapi:api:check` sin deriva. Pendientes: integración y Bruno.

## 4. Lo que sigue sin decidir

- Revisión clínica y legal humana de F8 (decisión 12).
- Correcciones tardías de F2b, F3, F4 y F5 que ningún revisor independiente ha visto (se cubren con la decisión 13).
- Riesgos residuales de F5 que se aceptan y se documentan: retención de PII en `idempotency_records`, pérdida del token de cambio de correo si falla la actualización, y el cambio de correo directo contra GoTrue (runbook de F9).

# 2026-10-20 — F6 invitation-coordination

Rama `feat/backend-developing`. Spec: `2026-10-12-especificacion-faltante-backend.md` (F6, Anexo B). Orden pedido por la persona usuaria; primer slice.

## Estado por slice

| Slice | Estado |
| --- | --- |
| 1. Dominio puro con pruebas | **Hecho** |
| 2. Migración (`rbc_compatibility`, `haversine_m`, tablas) y pgTAP | **Hecho** en `feat/backend-developing` (F6-2, `20261022020000`); traído a esta cadena por merge `190b6e4` |
| 3a. RPC de lote, token y concesión | **Hecho** (`20261022030000`, pgTAP 14); sin pruebas de carreras de integración ejecutadas aquí |
| 3b. Reintento, lecturas del donante, cambio de respuesta e historial | **Hecho 2026-11-20** (`20261022040000_invitation_rpc_b.sql`, pgTAP `14b`, 51 pruebas). Sin revisión independiente |
| 4a. Cascadas de cierre/cancelación e indisponibilidad, `worker_expire_needs`, `confirmedIntentCount` | **Hecho 2026-11-20** (`20261022050000_invitation_cascades.sql`, pgTAP `15`, 25 pruebas). Sin revisión independiente |
| 4b. Proyección de `delivery` (trigger + `worker_record_attempt`/`ingest_email_event` con bloqueo invitación→outbox), `finish_deletion` (V15), `delivery_failure` en tareas, `worker_purge_invitation_grants` | **Hecho 2026-11-20** (`20261022060000_invitation_delivery.sql`, pgTAP `16`, 22 pruebas). La RPC de purga aún no la llama el worker (F6-5a). Sin revisión independiente; carreras de integración (interbloqueos) sin ejecutar |
| 5a. Consumidor de correo (dos tokens, `display`, el worker vence necesidades y purga concesiones) | **Hecho 2026-11-20** (`20261022070000_invitation_claim_display.sql`, pgTAP `17`, vitest backend 809). Sin revisión independiente ni clínica de la copia |
| 5b. Módulo HTTP (10 operaciones), composición y Bruno | **Hecho 2026-11-20**: `application/`, `infrastructure/`, `http/` + `composition.ts`; vitest backend 828; integración local 227/227; Bruno CLI contra el backend real (`bruno/backend/invitation-coordination/{hospital,donor}`, 40 requests PASS). Bruno del reintento (superadmin con step-up) añadido: `bruno/backend/invitation-coordination/superadmin`, PASS. Sin revisión independiente |
| 6. Semilla de 500 donantes y PER-02 | **Hecho 2026-11-20** (`npm run perf:invitations`, `backend/scripts/perf-invitation-batch.ts`): 500 donantes sintéticos, 3 hospitales, 5 lotes concurrentes, 10 calentamientos excluidos, 110 muestras: p50 60 ms, p95 75 ms, máx 80 ms, 0 fallos, 0 `55P03`/timeout/interbloqueos, 0 donantes sobre la cuota (600 invitaciones). Cumple p95 < 2 s y la puerta interna A4.3 (p95 ≤ 1 s). Mide `request_invitation_batch` en la base local (sin red ni Express); no cubre varios lotes sobre la misma necesidad |
| 7. Gates: `reviewer-back`, `clinical-safety-reviewer`, `security-privacy-auditor` | **Ejecutados 2026-11-20** por subagentes `general-purpose` de solo lectura que no escribieron el código. Los tres: **PASS con observaciones**, sin Critical/High. Revisión **estática**: no ejecutaron pgTAP, integración ni Bruno (eso lo verificó el autor, ver slices 5b y 6). Ver «Revisiones independientes» abajo |

## Slice 1

`backend/src/modules/invitation-coordination/domain/`: `compatibility`, `haversine`, `batch-size`, `ranking`, `invitation-state`, `need-donor-code` y `domain.test.ts`.

- Verificado: `npm run test --workspace backend -- src/modules/invitation-coordination` (17 pruebas) y `npm run typecheck`, ambos sin errores.
- La matriz se prueba contra una regla ABO/Rh independiente en las 64 parejas (27 permitidas).
- Sin revisión independiente. Matriz académica, no clínica (RNF-SAF-01).

## Revisiones independientes (2026-11-20)
Alcance: migraciones `20261022020000..070000`, `modules/invitation-coordination/**`, `email-delivery/**`, `composition.ts`, pgTAP 13–17, Bruno.

| Gate | Veredicto | Resumen |
|---|---|---|
| reviewer-back | PASS con observaciones | M1 replay del lote falla (409) si la necesidad dejó de estar activa porque el paso 1 se ejecuta siempre; M2 barrido de leases (40P01 posible, ya anotado); M3 faltan pruebas de concurrencia (cascada de meta vs indisponibilidad, `finish_deletion` vs cascada, barrido vs cascada); Low: sin test unitario del router, `delivery` queda `pendiente` en invitaciones invalidadas, `expire()` encadena 3 RPC |
| security-privacy-auditor | PASS con observaciones | M-1 vista previa sin límite por IP → **corregido** (60/15 min); L-1 el token viaja en la ruta (riesgo de logs del borde, a documentar en el despliegue); L-2 perfil no `activo` no se comprueba en token/cambio de sesión; L-3 el límite del POST se consume antes de validar el token (NAT compartida); L-4 sin plazo de retención del nombre al hospital; L-5 sin límite de lotes por admin |
| clinical-safety-reviewer | PASS con observaciones | Matriz de 27 pares verificada contra ABO/Rh; urgencia y reconocimientos no influyen. Obs. 1 el correo no mencionaba la verificación del hospital → **corregido** (línea «El hospital verificará tu identidad y tu elegibilidad…»); obs. 2 «Preséntate» podía leerse como cita → **corregido** (migración `20261022080000`, «Si decides asistir, acude…»); obs. 3 `sites.public_instructions` es texto libre sin filtro (brecha de gobernanza); la copia sigue pendiente de ratificación clínica humana (C1) |

**Pendiente tras las revisiones:** M1, M3, L-2, L-3, L-5 y los Low del reviewer-back (decisión de la persona usuaria si se corrigen antes de cerrar el módulo).

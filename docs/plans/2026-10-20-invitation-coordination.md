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
| 4b. Proyección de `delivery` (`worker_record_attempt`, `ingest_email_event`), `finish_deletion` (V15), `delivery_failure` en tareas, purga de concesiones | Pendiente |
| 5. Routers y Bruno | Pendiente |
| 6. Semilla de 500 donantes y PER-02 | Pendiente |
| 7. Gates: `reviewer-back`, `clinical-safety-reviewer`, `security-privacy-auditor` | **No ejecutados** |

## Slice 1

`backend/src/modules/invitation-coordination/domain/`: `compatibility`, `haversine`, `batch-size`, `ranking`, `invitation-state`, `need-donor-code` y `domain.test.ts`.

- Verificado: `npm run test --workspace backend -- src/modules/invitation-coordination` (17 pruebas) y `npm run typecheck`, ambos sin errores.
- La matriz se prueba contra una regla ABO/Rh independiente en las 64 parejas (27 permitidas).
- Sin revisión independiente. Matriz académica, no clínica (RNF-SAF-01).

# 2026-10-20 — F6 invitation-coordination

Rama `feat/backend-developing`. Spec: `2026-10-12-especificacion-faltante-backend.md` (F6, Anexo B). Orden pedido por la persona usuaria; primer slice.

## Estado por slice

| Slice | Estado |
| --- | --- |
| 1. Dominio puro con pruebas | **Hecho** |
| 2. Migración (`rbc_compatibility`, `haversine_m`, tablas) y pgTAP | Pendiente |
| 3. RPC de lote y de respuesta, pruebas de carreras | Pendiente |
| 4. Cascadas, `worker_expire_needs`, `confirmedIntentCount` | Pendiente |
| 5. Routers y Bruno | Pendiente |
| 6. Semilla de 500 donantes y PER-02 | Pendiente |
| 7. Gates: `reviewer-back`, `clinical-safety-reviewer`, `security-privacy-auditor` | **No ejecutados** |

## Slice 1

`backend/src/modules/invitation-coordination/domain/`: `compatibility`, `haversine`, `batch-size`, `ranking`, `invitation-state`, `need-donor-code` y `domain.test.ts`.

- Verificado: `npm run test --workspace backend -- src/modules/invitation-coordination` (17 pruebas) y `npm run typecheck`, ambos sin errores.
- La matriz se prueba contra una regla ABO/Rh independiente en las 64 parejas (27 permitidas).
- Sin revisión independiente. Matriz académica, no clínica (RNF-SAF-01).

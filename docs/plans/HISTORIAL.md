# Historial consolidado de planes cerrados (2026-10-03 → 2026-10-12)

Resumen de las bitácoras de octubre que ya cumplieron su objetivo o quedaron
superadas. Los originales se retiraron el 2026-10-20 y siguen en el historial
de git (`git log --diff-filter=D -- docs/plans/`). Este archivo no acredita
pruebas actuales: los resultados son los que cada bitácora registró.

## 1. Mock y contrato OpenAPI (03–11 oct)

| Plan | Resultado |
| --- | --- |
| `2026-10-03-hospital-manual-batches` | Slice sintético de `GET/POST /hospitals/me/needs/{needId}/invitation-batches` en el mock y UI «Lotes». Registra un lote con cero invitaciones y cero correos; no simula matching ni envío. Completada. |
| `2026-10-08-mock-contract-alignment` y sus tres ejecuciones (`10-10-reanudacion`, `10-11-ejecucion`, `10-11-verificacion-…-pi`) | Seis correcciones del OpenAPI: `deliveryCounts` como buckets excluyentes cuya suma es `createdInvitationCount`; versión esperada como parámetro requerido del DELETE; consulta de sedes activas propias; DTO contextual con `currentValues` y `proposedValues` limitados por grant; CSRF de salida `readOnly`. No se decidió la política de reintentos (AP-02, luego resuelta por ADR-005). Gates E1–E3 en PASS; las ejecuciones intermedias se bloquearon por falta de herramientas en subagentes y por el traslado a `backend/`. |
| `2026-10-04-correccion-y-cierre-dtos` | Corrección de los validadores DTO de `createHospitalNeed` (compilación, precisión geográfica, selección de sedes) con OpenAPI como única fuente. Quedó bloqueada por permisos; el trabajo se absorbió en las fases F2a/F3. |
| `2026-10-10-correccion-typecheck-validadores-api` | Eliminó 14 diagnósticos de `npm run typecheck` en los validadores sin alterar el contrato ratificado. Revisiones PASS; la QA final se pausó por el traslado. |

## 2. Traslado de `apps/api` a `backend/` (10–11 oct)

| Plan | Resultado |
| --- | --- |
| `2026-10-10-traslado-api-a-backend` | Inventario y decisión: el desarrollo API vive en `backend/`, no en `apps/`. |
| `2026-10-11-traslado-backend-monolito-modular` | Movió DTOs, pruebas y generador a `backend/`. Bloqueó brevemente por el lock raíz (`EALLOWREMOTE`). |
| `2026-10-11-continuacion-traslado-backend-monolito-modular` | Cerró el traslado: el workspace raíz con un único `package-lock.json` es la frontera de instalación, `backend/` es el workspace productivo. Aceptación CA1–CA5 con PASS. No implicó backend completo. |

## 3. Configuración del agente Pi (07–11 oct)

| Plan | Resultado |
| --- | --- |
| `2026-10-07-pi-project-adaptation` | Adaptación `.pi/` de los doce roles, manteniendo `.opencode/`. Histórico: ya no se usa el mapeo Gentle. |
| `2026-10-11-reparacion-configuracion-pi` | Alineó la configuración con `pi-open-agents` y `pi-agent-modes` (`subagent({agent, task})`, perfil primario propio, modelo coherente). Revisión independiente quedó pendiente. |

El harness vigente para este trabajo es Claude Code (`docs/Agent-Workflow.md`).

## 4. Arranque del backend: F0 y F1 (12 oct)

Plan `2026-10-12-ejecucion-plan-maestro-f0-f1`: se construyó lo que no dependía
de votos del usuario, cada unidad con su commit tras sus pruebas:

| Unidad | Commit |
| --- | --- |
| Configuración de entorno validada (`config/env.ts`) | `926dc7d` |
| Errores, `correlationId` y guardas HTTP (`shared/http`) | `2de6784` |
| Logger con allowlist (`shared/observability`) | `a20688a` |
| Primitivas criptográficas (`shared/crypto`) | `c4b63b5` |
| `createApp` sin rutas de negocio y `server.ts` | `458e60f` |
| Retiro del legacy y `.env.example` | `b4d0cac` |
| Retiro de `nodemon`, `dotenv` y `cors` | `fcd8f58` |
| Script raíz `dev:backend` | `6c974e3` |

Cierre registrado: backend 152/152, generador 25/25, typecheck sin errores. Los
gates de revisión de esas unidades no se ejecutaron entonces. Lo que dependía
de votos (ADR-003 a ADR-005, Supabase, health) se resolvió después en los
planes de módulo vigentes.

## 5. Dónde está lo vigente

| Tema | Documento |
| --- | --- |
| Estado y prioridades | [`2026-10-16-analisis-estado-proyecto.md`](2026-10-16-analisis-estado-proyecto.md) |
| Bloqueos y decisiones abiertas | [`../pending/2026-10-20-bloqueos-y-decisiones.md`](../pending/2026-10-20-bloqueos-y-decisiones.md) |
| Mapa de capacidades | [`2026-10-12-api-backend-completo-incremental.md`](2026-10-12-api-backend-completo-incremental.md) |
| Especificación de ejecución | [`2026-10-12-especificacion-faltante-backend.md`](2026-10-12-especificacion-faltante-backend.md) |
| F6 (en curso) y F7 | [`2026-10-20-invitation-coordination.md`](2026-10-20-invitation-coordination.md), [`2026-10-20-privacy-requests.md`](2026-10-20-privacy-requests.md) |

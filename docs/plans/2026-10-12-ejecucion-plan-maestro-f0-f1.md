# Ejecución del plan maestro: unidades desbloqueadas de F0 y F1

| Campo | Valor |
| --- | --- |
| Fecha | 2026-10-12 |
| Harness | Claude Code (implementación directa, sin subagentes: no se pidieron explícitamente) |
| Plan padre | [`2026-10-12-plan-maestro-backend-ocho-capacidades.md`](2026-10-12-plan-maestro-backend-ocho-capacidades.md) |
| Rama | `feat/backend-developing`; base `90c203a` |
| Alcance | Solo lo que no depende de votos V1–V12 ni de ratificación pendiente |

## 1. Por qué este alcance

El plan maestro exige votos del usuario antes de cada fase (§5 y D-2). Esta
tanda cubre lo que se puede construir y verificar sin esos votos. No registra
ningún voto en nombre del usuario.

## 2. Unidades ejecutadas

Cada unidad es un commit Conventional tras pasar sus pruebas. Solo se stagean
sus propios archivos.

| # | Unidad | Commit | Estado |
| --- | --- | --- | --- |
| U1 | Este plan | `docs(backend)` (ver historial) | hecho |
| U2 | Configuración de entorno validada (`config/env.ts`) | `926dc7d` | hecho, 15 pruebas |
| U3 | Errores, correlationId y guardas HTTP (`shared/http/*`) | `2de6784` | hecho, 16 pruebas |
| U4 | Logger con allowlist (`shared/observability/*`) | `a20688a` | hecho, 6 pruebas |
| U5 | Primitivas criptográficas (`shared/crypto/*`) | `c4b63b5` | hecho, 23 pruebas |
| U6 | `createApp` sin rutas de negocio y `server.ts` | `458e60f` | hecho, 6 pruebas de app y prueba de humo |
| U7a | Retiro del legacy y `.env.example` | `b4d0cac` | hecho |
| U7b | Retiro de `nodemon`, `dotenv` y `cors` | `fcd8f58` | hecho, lock solo con borrados |
| U7c | Script raíz `dev:backend` y `dev` sin `.env` | `6c974e3` | hecho |

Estado final de verificación: backend 152/152, generador 25/25, contrato sin
drift, typecheck del monorepo sin errores y build de `backend` correcto.

## 3. Qué queda fuera y por qué

| Item del plan maestro | Estado | Motivo |
| --- | --- | --- |
| F0.1 gobierno Claude Code en `AGENTS.md` y `Agent-Workflow.md` | Pendiente | Son reglas vinculantes y tienen cambios sin commit del usuario. Editarlas requiere su aprobación |
| F0.2 registrar votos V1–V11 | Bloqueado | Decisión del usuario |
| F0.3–F0.5 ADR-001 consolidado, ADR-003 aceptado, ADR-004, ADR-005 | Bloqueado | Requieren V1, V2, V3, V4, V5 y V7 |
| F0.6 sincronizar `project-requirements.md` y xlsx | Pendiente | Hay que verificar cada contradicción contra la línea base v1.2 y el xlsx es binario |
| F0.7 generador generalizado | Diferido | Solo `createHospitalNeed` está ratificada. Generalizar sin una segunda operación ratificada es especular, y sus pruebas están atadas a esa migración |
| F0.8 borrar `frontend/` | Bloqueado | Requiere confirmación explícita del usuario (§3.6). El resto del legacy ya se retiró |
| F1 migraciones, RPC, `app_owner`, grants, `supabase init` | Bloqueado | V2 (seguridad RPC) y V10 (ubicación de Supabase) |
| F1 `GET /health/live` y `ready` | Bloqueado | Operaciones en borrador: requieren ratificación (D-2) |
| F1 `worker.ts`, `test:integration`, `test:bruno:backend` | Bloqueado | Dependen del outbox (F4), de Supabase local (V10) y de los escenarios Bruno del backend (F9) |
| F2–F9 | Bloqueado | Votos de cada fase y ratificación de su módulo |

## 4. Gates de revisión

Todos pendientes. No se declara ningún PASS independiente.

- `reviewer-back`: pendiente para U2–U7c.
- `security-privacy-auditor`: pendiente para U2 (secretos y clave de Supabase),
  U3 (origen, CSRF y errores), U5 (criptografía) y U6 (composición y logs).

Un subagente revisor requiere que el usuario lo pida explícitamente.

## 5. Desviaciones y decisiones propias

Todas quedan a la vista para que el usuario las corrija.

- **`dev` usa `--env-file-if-exists=.env`** en lugar de `--env-file=.env` del
  plan (§3.7). Con `--env-file`, Node falla si no existe `backend/.env`, aunque
  las variables estén en la shell (CI, Render). Verificado con `tsx` y con
  `npm run dev:backend`.
- **Logs de finalización** usan el evento `peticion.finalizada`, con
  `correlationId` y `durationMs`. El plan no fija el nombre del evento.
- **Tope del cuerpo JSON** de 16 KB. El plan no fija cifra.
- **Cuerpo demasiado grande o JSON malformado** responde 400 `BAD_REQUEST`.
  El 413 no está en el catálogo público, así que no se usa.
- **`correlationId` se genera en el servidor** y nunca se acepta del cliente,
  para no permitir inyección en logs. No se añade cabecera de respuesta, porque
  el contrato no la define.
- **Guardia de origen:** sin cabecera `Origin` la petición pasa. La exigencia
  de `Origin` para peticiones con cookie corresponde a F2 (ADR-004).
- **`createApp` expone `mount`** para que los módulos monten sus routers antes
  del 404. Así las rutas de negocio entran sin tocar el composition root.
- **Claves de Supabase:** `SUPABASE_ANON_KEY` se rechaza si es `sb_secret_*` o
  un JWT con `role=service_role`. Es una comprobación defensiva que va más allá
  del plan, para cumplir la regla de no usar `service_role` en operaciones
  ordinarias.
- **Orden de pruebas:** en U2, U3 y U5 se observó el RED antes de implementar.
  En U4 se escribieron el logger y su prueba antes de ejecutar la prueba
  aislada; la evidencia de fallo previo no existe para esa unidad.
- **Error de ruta:** al crear `env.ts` escribí una vez en una ruta mal escrita
  fuera del repo. Se movió a la ruta correcta con `mv` y se borró el directorio
  vacío que creó la escritura. No quedó nada fuera del repo.
- **Regresión corregida:** `458e60f` (U6) dejó roto
  `scripts/generate-api-contract.test.mjs` porque fijaba los scripts legacy. Se
  corrigió en `b4d0cac`. Mi verificación de U6 no incluyó `test:api:generator`
  y debió incluirlo.

## 6. Qué falta para completar las ocho capacidades

Lo que bloquea, con el voto o decisión que lo desbloquea:

1. **V1** (aceptar la spec `Need-Draft-Application-Spec.md`): desbloquea F3.
2. **V2** (seguridad de las RPC): desbloquea la migración base de F1 y ADR-003.
3. **V10** (ubicación de Supabase en `backend/supabase/`): desbloquea F1.
4. **V3 y V4** (topología de cookies y vida del JWT): desbloquean F2 y ADR-004.
5. **V5 y V7** (estado de entrega y AP-06/07/08): desbloquean F4 y ADR-005.
6. **V11** (polígono de Lima): desbloquea F5.
7. **V6 y V8** (carreras y huecos de estado): desbloquean F6, F8 y el resto.
8. **Ratificación por módulo** (V12): antes de cada fase se marca `x-ratification`
   y se generan los artefactos. Cuando haya una segunda operación ratificada,
   se hace F0.7.
9. **Confirmación para borrar `frontend/`** (F0.8).
10. **Aprobación para editar `AGENTS.md` y `Agent-Workflow.md`** (F0.1). Tienen
    cambios sin commit del usuario.

## 7. Bitácora

- 2026-10-12: plan de la tanda. Línea base verde (86 backend, 25 generador,
  contrato sin drift).
- 2026-10-12: U2–U7c ejecutadas y verificadas, con los commits de la tabla
  de §2. Sin reviews independientes. Sin votos registrados.

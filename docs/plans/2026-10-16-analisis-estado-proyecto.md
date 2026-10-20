# 2026-10-16 — Análisis del estado del proyecto y de lo que falta para que sea funcional

| Campo | Valor |
| --- | --- |
| Fecha y hora | 2026-10-16, cerca de las 03:30 (UTC−05:00, Lima) |
| Rama | `feat/backend-developing` |
| Commit analizado (HEAD) | `1956d638c16ef0f1fcf67e997471b95e6e802528`, «fix: new fix of openapi, more secure and stable», 2026-10-16 02:33 |
| Árbol de trabajo | Solo `CLAUDE.md` modificado sin commit (no es parte de este análisis) |
| Entorno | Node 24.19.0, npm 12.0.2 |
| Autor del análisis | Claude Code (modelo Opus 5.5), a pedido de la persona usuaria (Diego Roman) |
| Tipo de trabajo | Análisis de solo lectura. No se escribió código de producto, ni migraciones, ni pruebas |
| Estado | **Diagnóstico entregado. La hoja de ruta de la §7 es una propuesta y no está aprobada** |
| Revisión independiente | **Ninguna.** Este documento no es un PASS de ningún gate |

## 1. Solicitud

Texto literal de la persona usuaria:

> necesito que analices el estado del proyecto y me digas que es lo que falta implementar para que llegue a ser
> funcional y qué ya está listo

El análisis se hizo en modo plan de Claude Code, sin permiso de escritura salvo el archivo del plan. Al
presentarlo, la persona usuaria no lo aprobó para ejecución. Pidió en cambio guardarlo en `docs/` con contexto,
fecha y detalles para que otra IA pueda auditarlo. Por eso **la hoja de ruta de la §7 no autoriza a empezar
ninguna fase**: solo deja el diagnóstico y una recomendación.

## 2. Método y evidencia

### 2.1 Cómo se recopiló

1. Se leyeron `CLAUDE.md`, `AGENTS.md`, `docs/plans/2026-10-12-api-backend-completo-incremental.md`,
   `docs/plans/2026-10-13-decisiones-backend.md` y las secciones F6–F9, §2.3 y la bitácora de
   `docs/plans/2026-10-12-especificacion-faltante-backend.md`. También la tabla de votos del plan maestro
   (`docs/plans/2026-10-12-plan-maestro-backend-ocho-capacidades.md` §5) y el diff del último commit `1956d63`.
2. Se lanzaron tres subagentes `Explore` de solo lectura, en paralelo:
   - **Backend frente al contrato:** cada operación de `docs/openapi.json` con su ratificación, contrastada con
     los routers montados en `backend/src/modules/*/http/` y `backend/src/composition.ts`. También el worker, las
     migraciones y la búsqueda de código de matching.
   - **Frontend:** `apps/web`, `frontend/`, `apps/mock-api`, `docs/Frontend-Design.md`,
     `docs/Frontend-Handoff.md`, ADR-004 y E2E.
   - **Requisitos, pruebas y despliegue:** RF de `docs/1_Primeros_Alcances.md` y la ERS, AP abiertos,
     inventario de suites, CI y artefactos de despliegue.
3. Se consultó la memoria persistente del proyecto (engram). La observación #1250, del 2026-10-12, registra que
   la persona usuaria **aceptó todos los votos de la §2.3 de la especificación con la recomendación**. Eso
   incluye V5 (AP-02), V6 (AP-04) y V7 (AP-06/07/08).

### 2.2 Verificado en vivo en esta sesión

| Comando o comprobación | Resultado |
| --- | --- |
| `npm run openapi:api:check` | exit 0: «Canonical API contract artifacts are current.» |
| `npm run typecheck` (mock-api, web, backend) | Sin errores |
| Conteo de operaciones en `docs/openapi.json` con `node -e` | 73 en total, 57 `ratified-for-implementation`, 16 sin ratificar. `info.version = 0.2.0-draft` |
| Conteo de rutas registradas en `backend/src/modules/*/http/*.router.ts` | 47: donor-records 14, institutions 14, auth 7, action-tokens 5, needs 4, health 2, webhook 1 |
| Archivos de prueba | 62 `*.test.ts` en `backend/src`, 6 `*.integration.ts`, 8 archivos pgTAP (`00`–`07`), 130 `.bru` en `bruno/backend` |
| `git status --short` | Solo ` M CLAUDE.md` |

### 2.3 Tomado de documentos o commits, sin re-ejecutar

- No se re-ejecutaron las pruebas unitarias (unas 703), de integración (unas 184), pgTAP (580 aserciones) ni
  Bruno contra el backend. Las de integración resetean la BD local y la sesión era de solo lectura.
  - La cifra de 703 viene de la bitácora de `docs/plans/2026-10-13-decisiones-backend.md`.
  - Las otras cifras vienen del conteo de `it`/`test` y del `plan(n)` hecho por el subagente.
  - El último commit `1956d63` cambió el contrato, ratificó F6 y añadió 400, 429 y 503 a varias operaciones.
    Después de ese cambio solo se comprobó que no hay deriva y que el typecheck pasa. **Conviene re-ejecutar
    `npm run test:contract` y las suites del backend antes de empezar F6.**
- Las referencias `archivo:línea` de este documento corresponden al commit `1956d63`.

## 3. Resumen

El backend tiene una base sólida y probada: 47 de las 73 operaciones del contrato. Aun así, **el producto todavía
no funciona de punta a punta**, por dos motivos:

1. No existe el matching ni las invitaciones (F6), que son el corazón del sistema.
2. Ningún frontend está conectado al backend real; la web actual solo habla con el mock.

## 4. Flujo central del MVP, paso a paso

| Paso | Estado | Evidencia |
| --- | --- | --- |
| 1. Superadmin crea hospital y sede, e invita al admin | ✅ Backend (F2a/F2b) | `institutions.router.ts`, `action-tokens.router.ts` |
| 2. Donante se registra, verifica email y completa perfil, ubicación y disponibilidad | ✅ Backend (F5) | `donor-records.router.ts` |
| 3. Hospital crea la necesidad en borrador y la activa | ✅ Backend (F3) | `needs.router.ts` |
| 4. El sistema elige candidatos compatibles y cercanos (ABO/Rh, Haversine, cuota) | ❌ No existe código | Ni `haversine`, ni matriz, ni ranking en `backend/src` ni en SQL |
| 5. Se envían los emails de invitación | ⚠️ El outbox, el worker y la plantilla existen, pero nadie encola invitaciones | `email-delivery/templates/invitacion.ts` sin uso; `email_outbox.invitation_id` sin FK |
| 6. El donante confirma o rechaza, por enlace o por sesión | ❌ F6 | — |
| 7. El hospital ve las respuestas y llega a la meta, con cascadas de cierre y vencimiento | ❌ F6 | `confirmedIntentCount` siempre 0; `transition_own_need` sin cascada |
| 8. Todo lo anterior desde una web real contra el backend | ❌ | `apps/web/vite.config.ts` solo apunta al mock en `:4011` |

## 5. Lo que ya está listo

### 5.1 Backend de producción (`backend/`)

| Módulo | Operaciones | Contenido |
| --- | --- | --- |
| F1 plataforma | 2 (health) | `createApp`, `config/env.ts` validado, catálogo de errores, headers de seguridad, `TRUSTED_PROXIES`, edge guard, keyring del outbox, `/health/live` y `/health/ready` |
| F2a identidad e instituciones | 21 | Sesión con cookies `__Host-sal_at`/`__Host-sal_rt`, CSRF firmado, MFA TOTP, step-up, hospitales, sedes, membresías, configuración, auditoría y cola de tareas |
| F2b | 5 | Invitación de admins de hospital y recuperación de contraseña |
| F3 need-records | 4 | Crear borrador, listar, ver y transicionar necesidades propias. Tope de 60 por hora |
| F4 email-delivery | 1 (webhook) y worker | Outbox cifrado, worker separado (`npm run dev:worker`), Resend o falso, reintentos con backoff, allowlist de buzones, identidades técnicas separadas para la API y el worker |
| F5 donor-records | 14 | Autorregistro, verificación (con contraseña pendiente, D-13), onboarding, disponibilidad, altas asistidas y cambio de email |

Además, de forma transversal:
- auditoría de denegaciones (`api.record_denial`);
- `Retry-After` en todos los 429;
- RPC SECURITY INVOKER con RLS de escritura y una allowlist cerrada de DEFINER (ADR-003);
- `service_role` solo en un adaptador con 4 métodos (ADR-006).

### 5.2 Base de datos

- 8 migraciones en `backend/supabase/migrations/`, de `20261013000000_platform_base` a
  `20261013070000_audit_denials`.
- 17 tablas en el esquema `app`, más las RPC en `api`.
- La semilla `backend/supabase/seed.sql` es mínima: solo hospitales y sedes, sin donantes.

### 5.3 Pruebas

- Unitarias, integración contra Supabase local, pgTAP y Bruno contra el backend real, para los cinco módulos
  implementados (cifras en la §2).
- E2E con Playwright: 10 pruebas en `apps/web/e2e/app.e2e.ts`, **solo contra el mock**.

### 5.4 Contrato

- `docs/openapi.json` (OpenAPI 3.1) es la fuente única. Tiene un generador y 6 artefactos derivados, todos sin
  deriva.
- Las 10 operaciones de F6 quedaron ratificadas en el commit `1956d63`.

### 5.5 Web demo (`apps/web`)

- 12 vistas accesibles para los tres roles.
- Cliente tipado (`apps/web/src/api/client.ts`) con CSRF solo en memoria, `Idempotency-Key` por intención y
  manejo de 401.

### 5.6 Documentación

- ADR-001 a ADR-006.
- La especificación operativa con F6–F9 detallados.
- Las decisiones del 2026-10-13.
- Los diagramas UML de la PC2 (`docs/evidence_pc2/`).

## 6. Lo que falta, por prioridad

### 6.1 F6 invitation-coordination — camino crítico, bloquea el producto

- **Spec:** `docs/plans/2026-10-12-especificacion-faltante-backend.md:1524-1694`.
- **Reglas:** anexos B.2 (matriz), B.3 (matching), B.4 (visibilidad) y B.5 (máquinas de estado).
- **Decisiones ya tomadas que lo afectan:**
  - V5 (AP-02), V6 (AP-04, carreras) y V14 (`needDonorCode`), aceptadas el 2026-10-12;
  - decisión 9 (tope de 20 necesidades abiertas por hospital) y decisión 11 (texto neutral de instrucciones),
    del 2026-10-13.
- **Operaciones ratificadas sin implementar (10):**
  - Hospital: `listOwnInvitationBatches`, `requestInvitationBatch`, `listOwnNeedResponses`.
  - Por token: `getInvitationActionPreview`, `recordInitialInvitationResponse`.
  - Donante: `listOwnInvitations`, `getOwnInvitation`, `changeOwnInvitationResponse`, `listOwnResponseHistory`.
  - Superadmin: `retryInvitationDelivery`.
- **Dominio puro**, en un módulo nuevo `backend/src/modules/invitation-coordination/domain/`:
  - matriz RBC 8×8 con 27 pares permitidos;
  - Haversine con R = 6 371 008,8 m y el borde incluido;
  - `batchSize = min(50, max(5, 2×meta))`;
  - ranking: exactos, luego distancia, luego `donorId`;
  - tres ejes de estado;
  - `needDonorCode` en Crockford base32 de 10 caracteres.
- **Migración:**
  - `app.rbc_compatibility` (27 filas) y `app.haversine_m`, con pruebas de paridad TS↔SQL;
  - `invitation_batches`, `invitations` e `invitation_response_history` (append-only).
- **RPC nuevas:**
  - `request_invitation_batch`: atómica, con `FOR UPDATE` sobre la necesidad y una cuota de 3 invitaciones por
    donante en 24 h con advisory lock;
  - `respond_invitation_by_token`, `change_own_invitation_response`, las lecturas con proyección RF-VIS y
    `retry_invitation_delivery`.
- **Reemplazos de RPC existentes:**
  - cascada en `transition_own_need` (RF-INV-08);
  - RF-INV-07 en `update_own_participation`;
  - nueva `worker_expire_needs`;
  - `confirmedIntentCount` real;
  - `invitations.delivery` actualizado desde el worker y el webhook.
- **Datos y pruebas:**
  - semilla de 500 donantes sintéticos;
  - pgTAP;
  - integración: carreras, 20 respuestas con el mismo token, última plaza;
  - Bruno contra el backend;
  - PER-02 (p95 < 2 s).
- **Gates:** `reviewer-back`, `clinical-safety-reviewer` y `security-privacy-auditor`.

### 6.2 Frontend conectado al backend real

- **Decisión pendiente de la persona usuaria:** dónde vive el frontend de producción.
  - `CLAUDE.md` dice `frontend/`, pero hoy ahí solo hay una plantilla Vite de React 19 en JS. Viene del commit
    `550875b` (2026-09-24), no es workspace y choca con React 18 de ADR-001.
  - F9 de la especificación (`:1838`, `:1853`) apunta a `apps/web`.
  - Recomendación de este análisis: llevar el código de `apps/web` a `frontend/` como workspace TS, para
    reutilizar el cliente, las pruebas y el diseño.
- **Proxy:** `API_TARGET=mock|backend`, más el proxy de `/health`. Además, `ALLOWED_ORIGINS` debe incluir
  `http://127.0.0.1:5173`; hoy está vacío en `backend/.env.example`.
- **Login real** con email y contraseña. Hoy es un selector de rol con correos fijos y la contraseña
  `synthetic-demo-only` (`apps/web/src/pages/AccessPages.tsx:7-37`).
- **MFA y step-up.** El backend responde `mfaRequired` y `mfaChallengeId`, y `App.tsx` toma esa sesión a medias
  como iniciada, así que admins y superadmin recibirían 403 `MFA_REQUIRED`.
- **Flujos públicos por token (no tienen ruta):**
  - registro y verificación de email, con el aviso de D-13;
  - recuperación y restablecimiento de contraseña;
  - activación asistida;
  - reclamo de invitación de admin;
  - verificación de cambio de email;
  - respuesta a una invitación desde el enlace del correo.
- **Pantallas y acciones que faltan:**
  - selector de sede (hoy se toma la `siteId` de la primera necesidad, `HospitalPages.tsx:124,135`);
  - activar, cerrar o cancelar una necesidad (el cliente no tiene el PATCH);
  - altas asistidas;
  - escrituras del superadmin;
  - pantallas de F7 y F8.
- **Manejo de errores:** 429 con `Retry-After`, y paginación por cursor en todas las listas (hoy solo los lotes
  paginan).
- **E2E contra el backend:** `playwright.backend.config.ts` y una semilla o reset que no dependa de
  `/__mock/reset`.
- **Estado del mock:** cubre 23 operaciones de 73 y difiere del contrato en el nombre de la cookie (`session`),
  en `CSRF_VALIDATION_FAILED` y en `IDEMPOTENCY_CONFLICT`.

### 6.3 F7 privacy-requests — 9 operaciones en borrador

- **Spec:** `especificacion-faltante-backend.md:1698-1784`.
- Requiere ratificar el contrato al inicio de la fase (V12).
- **Alcance:** solicitudes de corrección y eliminación, decisión con motivo, grants contextuales de 10 minutos
  (`X-Contextual-Grant`) y ejecución: perfil, email por token o borrado con ledger (V15).
- **Worker de purga** con los plazos de la decisión 8:
  - idempotencia, 72 h;
  - tokens, 48 h;
  - cuentas sin verificar, 48 h;
  - usuarios inertes, 24 h;
  - `reclamada_incompleta`, 30 días;
  - `rate_limit_events`, 1 día;
  - purga final a `final_demo_at` + 30 días.
- Hoy no existe ningún worker de purga. `assisted_signups.purge_at` se guarda, pero nadie la ejecuta.

### 6.4 F8 recognition-policies y legal-information — 7 operaciones en borrador

- **Spec:** `especificacion-faltante-backend.md:1788-1832`.
- Se pueden implementar la mecánica y la semilla `0.1-borrador`.
- La revisión clínica y legal humana sigue pendiente por la decisión 12.

### 6.5 F9 salida y operación

- **Spec:** `especificacion-faltante-backend.md:1836-1854`.
- **Faltan:**
  - `vercel.json` con rewrites;
  - comandos de Render para la API y el worker;
  - runbook de migración y rollback;
  - `scripts/perf-backend.mjs`;
  - `playwright.backend.config.ts`;
  - alineación del mock.
- **No hay CI.** No existe `.github/` ni otro pipeline, así que no se ejecuta nada de forma automática. Tampoco
  hay secret scan, que exige RNF-DEP-01.
- **Riesgo a validar:** ADR-004 exige que Vercel inyecte `X-Edge-Secret` en las peticiones que reenvía a Render.
  No está comprobado que un rewrite de `vercel.json` pueda agregar headers de request, y ADR-003 descarta Edge
  Functions.
- **Entregables de la línea base §5.7** (`1_Primeros_Alcances.md`, cerca de las líneas 917-929):
  - manifest de release;
  - semilla y reset reproducibles;
  - guía de operación;
  - matriz requisito→prueba;
  - smoke de Resend.
- **Ronda final de revisión (decisión 13):** `reviewer-back` y `security-privacy-auditor` sobre F6–F9 y sobre
  las correcciones tardías de F2b–F5, que ningún revisor ha visto.

### 6.6 Fuera del alcance técnico

- Validación clínica y legal: la matriz es académica y el contenido legal está en borrador.
- Polígono real de Lima: hoy es la envolvente sintética `DEMO_ONLY-1` (V11).
- Deploy remoto y `supabase db push`: solo con autorización explícita (decisión 14).
- Mapa agregado RF-MAP-01/02: prioridad Could, no bloquea el MVP.

## 7. Hoja de ruta recomendada (propuesta, no aprobada)

1. **F6 completo**, en slices con commits atómicos:
   1. dominio puro con TDD;
   2. migración y pgTAP;
   3. RPC de lote y de respuesta, con pruebas de carreras;
   4. cascadas y worker de vencimiento;
   5. routers y Bruno;
   6. semilla de 500 donantes y PER-02;
   7. gates de revisión.
2. **Integración del frontend con el flujo central**, después de decidir entre `frontend/` y `apps/web`:
   login real, MFA, flujos por token, necesidades, lotes y respuestas, y E2E contra el backend. Al terminar este
   paso el producto ya es **funcional de punta a punta en local**.
3. **F7 y F8:** ratificar sus contratos y luego implementarlos, con sus pantallas.
4. **F9:**
   - CI con typecheck, unitarias y `openapi:api:check`, más pgTAP, integración y Bruno con Supabase en el runner;
   - `vercel.json` y prueba del edge secret;
   - runbook;
   - rendimiento;
   - alineación del mock.
5. **Ronda final de revisión**, corrección, verificación completa y push. El deploy remoto queda sujeto a autorización.

**Desviación respecto al orden ratificado.** La propuesta adelanta la integración del frontend (paso 2) antes
de F7 y F8. El orden aprobado el 2026-10-13 era F6 → F7 → F8 → F9. El motivo es que este es el camino más corto
a un producto que se pueda demostrar: F7 y F8 son Must en la línea base, pero no forman parte del flujo central.
**Este cambio de orden necesita aprobación de la persona usuaria.**

**Primer slice sugerido, si se aprueba:**
- Crear `docs/plans/2026-10-16-invitation-coordination.md`.
- Implementar el dominio puro de F6 con TDD, siguiendo el patrón de `backend/src/modules/need-records/domain/`.
  Las pruebas obligatorias son:
  - los 64 pares de la matriz;
  - Haversine con el borde `distance == radius`;
  - `batchSize` con 1, 2, 3, 25, 26 y 50, que debe dar 5, 5, 6, 50, 50 y 50;
  - el ranking con una mezcla de exactos y compatibles.

## 8. Documentación desactualizada detectada

| Documento | Problema |
| --- | --- |
| `docs/plans/2026-10-12-plan-maestro-backend-ocho-capacidades.md` §5 | Muestra V1 y V4–V12 como `_pendiente_`, pero se aceptaron el 2026-10-12 (engram #1250, ADR-005) |
| `docs/1_Primeros_Alcances.md`, ERS y `docs/README.md` | Siguen marcando AP-02, AP-04, AP-06, AP-07 y AP-08 como pendientes, pero ADR-005 y V6 los resuelven |
| `docs/plans/2026-10-12-especificacion-faltante-backend.md` | Habla de 70 operaciones; hoy son 73. Su bitácora termina el 2026-10-12 |
| `docs/Frontend-Handoff.md` | Corte del 2026-10-03: dice 69 operaciones y «API futura sin servidor» |
| `docs/plans/2026-10-12-api-backend-completo-incremental.md` | Se quedó en la tarea A2 («En progreso»), aunque F2a–F5 ya están implementados |
| `docs/openapi.json` `servers` | Todavía llama «placeholder» al puerto 3000 del backend |

## 9. Guía para auditar este documento

Para comprobar las afirmaciones desde el commit `1956d63`:

- **Operaciones del contrato:**
  `node -e` sobre `docs/openapi.json`, contando métodos y `x-ratification.status`. Debe dar 73, 57 y 16.
- **Rutas montadas:**
  `grep -cE "\.(get|post|put|patch|delete)\(\s*['\"]/" backend/src/modules/*/http/*.router.ts`. Deben sumar 47.
- **Ausencia de matching:**
  `grep -rniE "haversine|rbc_compat|batchSize" backend/src backend/supabase`. No debe haber resultados de código.
- **Ausencia de tablas de F6–F8:**
  `grep -n "create table" backend/supabase/migrations/*.sql`.
- **Sin CI:** `ls .github` debe fallar.
- **Proxy solo al mock:** `apps/web/vite.config.ts`.
- **Suites:** `npm run test --workspace backend`. Además, con Supabase local (`supabase start --workdir backend`):
  `npm run test:backend:db`, `npm run test:backend:integration` y `npm run test:bruno:backend`.

## Bitácora

- 2026-10-16 ~03:00: solicitud de análisis recibida en modo plan.
  - Lecturas directas de los planes y del diff de `1956d63`.
  - Tres subagentes `Explore` de solo lectura (backend frente al contrato, frontend, y requisitos/pruebas/despliegue).
  - Consulta de memoria engram.
- 2026-10-16 ~03:20: verificación en vivo.
  - `openapi:api:check` exit 0 y `typecheck` sin errores.
  - Conteos de operaciones (73/57/16) y de rutas (47).
- 2026-10-16 ~03:26: se presentó el plan para aprobación. La persona usuaria no lo aprobó para ejecución y pidió
  guardarlo en `docs/` con contexto para auditoría. Se crea este documento y no se modifica ningún otro archivo
  del repositorio. No hubo commit.

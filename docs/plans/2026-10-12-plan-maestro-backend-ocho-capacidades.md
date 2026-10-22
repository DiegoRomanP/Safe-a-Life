# Plan maestro: backend completo de las ocho capacidades en `backend/`

| Campo | Valor |
| --- | --- |
| Fecha | 2026-10-12 |
| Harness | Claude Code (sesión de planificación; sin código productivo escrito) |
| Rama | `feat/backend-developing`; base comprometida `90c203a` (`feat(backend): add canonical need draft DTO foundation`) |
| Estado | **Plan propuesto.** Las decisiones D-1 a D-4 ya las tomó el usuario. Los votos V1–V12 siguen pendientes y deben registrarse en §5 antes de iniciar las fases que los necesitan |
| Relación con otros planes | Continúa [`2026-10-12-api-backend-completo-incremental.md`](2026-10-12-api-backend-completo-incremental.md) (mapa D1 de ocho capacidades y dirección RPC). No reemplaza su bitácora histórica. Especificación operativa de lo que falta: [`2026-10-12-especificacion-faltante-backend.md`](2026-10-12-especificacion-faltante-backend.md) |

Este documento es **autocontenido**: describe la situación, las fuentes, las
decisiones tomadas, lo que queda por votar, la arquitectura y las fases con
tareas concretas. Se puede retomar sin la conversación que lo originó. Está
sujeto a `AGENTS.md`, la línea base v1.2 y los ADR vigentes. Si hay conflicto,
mandan esas fuentes y se detiene el trabajo para pedir sincronización.

---

## 1. Contexto

### 1.1 Objetivo

Implementar en `backend/`, como **monolito modular** (Node.js 24 + Express 5 +
TypeScript, Supabase PostgreSQL/Auth y Resend detrás de adaptadores), la API y
la lógica de negocio de Save a Life. El alcance son las ocho capacidades del
mapa aprobado y el contrato `docs/openapi.json`. Se integra con el frontend
(`apps/web`) solo después de completar las ocho.

### 1.2 Estado actual del repositorio (2026-10-12)

**Lo que existe y se reutiliza**

- `backend/src/modules/need-records/dto/`:
  - `validators.ts`: exporta `parseCreateNeedInput`, `parseCreatedNeedEnvelope`
    y `NeedDtoError` (categorías `shape`, `rule`, `output`). Usa AJV 2020 con
    esquemas cerrados, sin coerción, y normaliza `radiusKm` omitido a 10.
  - `validators.test.ts`: 86 pruebas.
  - `openapi.ts` y `contract.generated.json`: generados por
    `scripts/generate-api-contract.mjs`.
- `backend/package.json`:
  - Dependencias fijadas: `@supabase/supabase-js@2.117.1`, `ajv@8.20.0`,
    `ajv-formats@2.1.1`, `cors@2.8.6`, `dotenv@18.0.3`, `express@5.2.1`.
  - Dev: `typescript@5.9.3`, `vitest@5.0.3`, `nodemon`.
  - Módulos NodeNext.
- El workspace npm raíz tiene un **único lock** (`package-lock.json`) con la
  policy `allowScripts` de ADR-002. Se instala solo desde la raíz con
  `SCARF_ANALYTICS=false npm ci`.
- `docs/Need-Draft-Application-Spec.md` es la spec privada (A2) del caso de uso
  `create-need-draft`:
  - firmas de dominio, puertos y servicio;
  - fingerprint SHA-256 de 7 campos en orden fijo;
  - matriz de pruebas QA-first.

  Está pendiente de la revisión RA2.
- `docs/decisions/ADR-003-persistencia-rpc-supabase.md` fija la dirección:
  - funciones PostgreSQL vía RPC de Supabase;
  - cliente por request con el JWT del usuario;
  - sin `service_role` ordinario.

  Está pendiente de RA2. La seguridad invoker/definer queda por votar (V2).
- Herramientas locales disponibles: Supabase CLI (≈2.120), Docker, psql 18 y
  Bruno CLI 4.2 (`bru`).

**Lo que no existe**

- HTTP productivo, controladores, servicios y repositorios.
- Auth/AAL2, CSRF, CORS y RLS.
- Migraciones, outbox, worker, email y purga.

**Código legacy que no se reutiliza ni se ejecuta**

- `backend/index.js` y `backend/config/supabase.js`: cliente global con la anon
  key, `cors()` abierto y `error.message` expuesto.
- `database/esquema.sql`: esquema incompatible.
- `frontend/`: plantilla Vite fuera del workspace.

**Otros elementos del repo**

- `apps/mock-api`: mock Express stateful de demo con 25 operaciones. Se
  conserva para el frontend y no es evidencia de backend.
- `apps/web`: React 18, cuyo proxy `/api` apunta al puerto 4011 (mock).
- `bruno/`: colección importada de OpenAPI más `scenarios/{donor,hospital,superadmin,health}`.
  Hoy corre contra el mock con `npm run test:bruno`.

**Working tree sin commit (no es parte de este plan; no stagear salvo la unidad correspondiente)**

- Cambios en `AGENTS.md`, `docs/Agent-Workflow.md` y ADR-001 (añade "Usar
  Typescript para el backend y frontend").
- Cinco planes del 2026-10-03 eliminados.
- Planes nuevos sin seguimiento: `Need-Draft-Application-Spec.md` y ADR-003.

### 1.3 Fuentes de autoridad, en orden

1. `AGENTS.md`: reglas no negociables de PII, RLS, clínica, stack y Definition
   of Done.
2. `docs/1_Primeros_Alcances.md` v1.2: **línea base funcional aprobada**.
   Prevalece sobre la ERS, el xlsx y `project-requirements.md`.
3. ADR-001 (stack y despliegue Vercel/Render/Supabase), ADR-002 (tooling y
   pins) y ADR-003 (RPC).
4. `docs/2_Especificaciones_De_Software.md` v0.4: ERS en borrador. Organiza la
   línea base, no la reemplaza.
5. `docs/openapi.json` (contrato canónico, `0.2.0-draft`, 55 paths, 70
   operaciones y 96 schemas) y `docs/Api-Rules.md`.
6. `docs/Backend-Contracts.md`: contrato ratificado de `createHospitalNeed`.
7. `.opencode/references/project-requirements.md` y `.opencode/skills/*/SKILL.md`.
   Leer las skills `save-a-life-*` aplicables antes de cada módulo.

---

## 2. Decisiones ya tomadas por el usuario (2026-10-12)

| ID | Decisión | Consecuencia |
| --- | --- | --- |
| D-1 | **Proceso ligero con revisión** | Claude Code implementa por módulo con TDD. La revisión independiente la hacen subagentes de Claude Code en un contexto separado del autor, con prompts tomados de `.opencode/agent/reviewer-back.md`, `security-privacy-auditor.md` y `clinical-safety-reviewer.md` según el riesgo. Cada módulo tiene un plan en `docs/plans/` y el usuario lo aprueba al cerrarlo. Requiere ajustar `AGENTS.md`/`Agent-Workflow.md` (tarea F0.1) |
| D-2 | **Ratificación por módulo** | Al inicio de cada fase, el usuario vota las operaciones OpenAPI de ese módulo y las correcciones propuestas. Se marca `x-ratification` en `openapi.json` y se regeneran los tipos. No se implementa ninguna operación sin ratificar |
| D-3 | **Sesión con el JWT de Supabase en cookie** | Cookies HttpOnly con el access token y el refresh token. CSRF de doble envío **firmado** y ligado a la sesión, emitido por `GET /api/v1/auth/csrf-token`. Se documenta en ADR-004 (F0.4) |
| D-4 | **Alcance: las ocho capacidades** | Plan completo de identidad, email, donantes, necesidades, invitaciones, privacidad, reconocimientos e información legal antes de integrar el frontend con el backend real |

Decisiones anteriores que siguen vigentes y no se vuelven a preguntar:

- Mapa de ocho capacidades y dirección RPC Supabase (D1 del plan
  incremental).
- Supabase **local aislado** como entorno (T3 de
  `2026-10-04-backend-inside-out.md`).
- Contrato de `createHospitalNeed`: radio omitido igual a 10, borrador con
  conteo 0 y vencimiento calculado con el reloj UTC de PostgreSQL desde la
  creación.

---

## 3. Qué se debe cambiar (antes o durante la fase 0)

1. **`AGENTS.md` y `docs/Agent-Workflow.md`.**
   - Añadir el harness **Claude Code**. La delegación usa la herramienta
     `Agent`, con subagentes cuyo prompt incluye el rol de `.opencode/agent/<id>.md`.
   - Un PASS de un subagente revisor cuenta como gate si el revisor no fue el
     autor (contexto separado).
   - El usuario aprueba al cerrar cada módulo.
   - Sincronizar `CLAUDE.md`.
2. **ADR-001.** Consolidar el cambio TypeScript que está en el working tree.
   Sincronizar los valores de email que ya fija RF-EML-01..03, porque la ERS
   dice que ADR-001 los lista como pendientes.
3. **ADR-003.** Pasarlo a *Aceptado* con la elección de V2. Aceptar o corregir
   la spec A2 (V1).
4. **ADR-004 (nuevo): sesión, CSRF, CORS y topología.**
   - Cookies `__Host-sal_at` (access) y `__Host-sal_rt` (refresh), con
     `HttpOnly`, `Secure`, `SameSite=Lax` y `Path=/`.
   - CSRF = HMAC-SHA256(secreto de servidor, claim `session_id` del JWT ‖
     nonce). Se valida con el header `X-CSRF-Token` en toda mutación con
     cookie, junto con un `Origin` dentro de una allowlist exacta.
   - Vida del JWT y refresh según V4.
   - Topología según V3.
   - Los nombres `session` y `csrfToken` de `openapi.json` están marcados
     `x-pending-sprint0` y se actualizan.
5. **ADR-005 (nuevo): email, outbox y worker.**
   - Adaptador Resend con `fetch` a la API REST, sin SDK nuevo, más un
     adaptador falso.
   - Outbox cifrado AES-256-GCM con `node:crypto`, clave de entorno y rotación
     documentada.
   - Worker como proceso separado `src/worker.ts`, que solo tiene `EXECUTE`
     sobre las RPC del outbox y la entrega.
   - Resolución de AP-02, AP-06 y AP-08.
6. **Retirar el legacy.**
   - Borrar `backend/index.js`, `backend/config/` y `database/esquema.sql`.
   - Borrar `frontend/` con confirmación del usuario en el commit.
7. **`backend/package.json`.**
   - Scripts:
     - `dev`: `tsx watch --env-file=.env src/server.ts`
     - `start`: `node dist/server.js`
     - `worker`: `node dist/worker.js`
     - `test:integration`
   - Quitar `nodemon` y `dotenv`. Node 24 trae `--env-file`.
   - `cors`: reemplazarlo por un middleware propio con allowlist, o mantenerlo
     configurado con allowlist estricta.
   - **Ninguna dependencia de runtime nueva** sin el voto V9. `tsx` ya es
     devDependency de la raíz.
   - Raíz: añadir `dev:backend` y `test:bruno:backend`.
8. **`scripts/generate-api-contract.mjs`.**
   - Generalizarlo: emitir los tipos completos en
     `backend/src/contract/openapi.ts`.
   - Emitir un snapshot JSON Schema por **cada operación con `x-ratification`**
     en `backend/src/contract/schemas/<operationId>.json`.
   - Mantener los artefactos web y mock, y `openapi:api:check`.
   - Mover o redirigir los imports de `need-records/dto` sin romper sus 86
     pruebas.
9. **Huecos del contrato `docs/openapi.json`** (se votan con su módulo):
   - **No existe la operación de webhook de Resend** (RF-EML-03). Hay que
     añadir `POST /api/v1/email-delivery/webhooks/resend`: pública, con firma y
     sin cookie.
   - `/health/ready` debe reflejar la DB y las migraciones vigentes (OPS),
     respondiendo 503 si fallan.
   - `listOwnHospitalSites` ya está en el contrato, pero falta en
     `Frontend-Handoff.md`.
   - Discrepancias del mock con el contrato ratificado. El backend sigue el
     contrato; el mock se alinea en la fase 9:
     - 422 en lugar de **400** para errores de shape;
     - `IDEMPOTENCY_CONFLICT` en lugar de **`STATE_CONFLICT`**;
     - `CSRF_VALIDATION_FAILED` sin documentar;
     - `expiresAt` calculado con `Date.now()`;
     - sin 409 para una clave que todavía está en curso.
10. **Sincronizar los requisitos** (bloqueo §6 de la línea base, B:949-960):
    corregir `project-requirements.md` y `Save_a_Life.xlsx` donde contradicen
    la v1.2.
    - P:42-43: el donante cambia su grupo solo mediante solicitud
      (RF-PRO-01/02).
    - P:51: la respuesta se puede alternar (RF-INV-04).
    - P:16: los admins los invita el superadmin, no se precargan (RF-IAM-05).
    - P:140-152: ya hay versiones fijadas por ADR-002, y los valores de email,
      precisión y retención ya están fijados en v1.2.

---

## 4. Requisitos resumidos que guían la implementación

### 4.1 Roles

- **Donante.** Solo accede a lo propio.
  - Edita directamente disponibilidad y ubicación sintética (polígono de Lima,
    máximo 3 decimales).
  - Nombre, email y grupo sanguíneo solo cambian mediante solicitud.
  - Responde invitaciones y consulta su historial y las políticas.
- **Admin hospitalario.** Pertenece a exactamente un hospital, que se deriva de
  la membresía vigente y nunca del cliente.
  - Requiere AAL2.
  - Gestiona necesidades, lotes manuales, altas asistidas y su política de
    reconocimiento.
  - Nunca elige candidatos individuales.
- **Superadmin.** Requiere AAL2.
  - Gestiona hospitales, sedes, invitaciones de admins, membresías,
    `final_demo_at` (una sola vez), solicitudes, auditoría y moderación.
  - Las acciones privilegiadas requieren step-up de 5 min o menos.
  - Solo accede a PII mediante un grant contextual de 10 min o menos.
- **Portador de token.** Contexto sin sesión: registro, recuperación, claim y
  primera respuesta.
- **Worker.** Rol técnico con `EXECUTE` sobre RPC concretas, sin `service_role`.

### 4.2 Requisitos funcionales por capacidad (línea base v1.2, todos M salvo MAP = C)

- **identity-institutions**
  - RF-IAM-01..05: autorregistro con email verificado y perfil completo.
  - Alta asistida con respuesta neutra, token de un uso de 24 h, reemisión y
    purga de no reclamadas a los 30 días.
  - Invitación de admins por el superadmin.
  - RF-ORG-01: hospitales y sedes los gestiona solo el superadmin.
- **donor-records**
  - RF-PRO-01..05: perfil propio.
  - Edición directa de disponibilidad y ubicación.
  - Correcciones por solicitud.
  - Cambio de email con token de 24 h.
  - **Nunca** se recopila fecha ni historial de donación.
- **need-records**
  - RF-NEC-01..08: solo `RBC` y ocho grupos.
  - Meta de 1–50 confirmaciones de intención.
  - Urgencia informativa.
  - Sede propia activa, radio 1–50 km (default 10) y vencimiento 1–72 h.
  - Máquina de estados.
  - `meta_alcanzada` vuelve a `activa` sin lote automático.
  - Vigente mientras `now() < expires_at`, con el reloj de PostgreSQL.
- **invitation-coordination**
  - RF-MAT-01..05:
    - filtros de elegibilidad operativa con el filtro postdonación
      desactivado;
    - matriz académica de 64 pares, 27 permitidos, en dirección
      donante→receptor;
    - orden por coincidencia exacta, luego distancia y luego ID opaco;
    - Haversine con R = 6 371 008,8 m y borde incluido (`<=`);
    - punto dentro o en el borde del polígono de Lima.
  - RF-BAT-01..04:
    - tamaño de lote `min(50, max(5, 2×meta))`;
    - lotes **solo manuales**;
    - como máximo 3 invitaciones lógicas por donante en la ventana móvil
      `(t-24h, t]`, sumando todos los hospitales;
    - unicidad (necesidad, donante);
    - invitaciones, outbox y auditoría en una sola transacción.
  - RF-INV-01..08:
    - tres ejes de estado;
    - tokens separados de confirmar y rechazar, de un uso, que invalidan al
      hermano y vencen con la necesidad;
    - el GET no muta y el primer POST es atómico;
    - el cambio de respuesta con sesión deja historial inmutable;
    - al alcanzar la meta se invalidan las invitaciones sin respuesta y se
      cancela el outbox no enviado;
    - al perder una confirmación la necesidad vuelve a `activa` sin lote nuevo;
    - si el donante se marca no disponible se invalidan sus invitaciones
      activas sin respuesta;
    - cerrar o cancelar deja la invitación `invalidada` y vencer la deja
      `vencida`, cancelando el outbox en ambos casos.
  - RF-VIS-01..03:
    - antes de confirmar, el hospital solo ve datos opacos;
    - con una confirmación vigente ve nombre, código por necesidad, grupo
      declarado, respuesta y hora;
    - el donante solo ve hospital verificado, sede pública, plazo, urgencia e
      instrucciones.
- **email-delivery**
  - RF-EML-01: un intento más 5 reintentos, timeout de 10 s y backoff de
    1/2/5/10/20 min con jitter (AP-08). Nunca se envía al vencer o después.
  - RF-EML-02: errores transitorios (red, timeout, 408, 429, 5xx) frente a
    permanentes (otros 4xx). Un resultado incierto se reconcilia durante 5 min
    con la misma clave de idempotencia.
  - RF-EML-03: webhook con firma sobre el body crudo, antigüedad máxima de
    5 min, deduplicación y estado que nunca retrocede.
  - RF-EML-04: allowlist de bandejas verificada justo antes de llamar a Resend.
- **privacy-requests**
  - RF-PRO-03/04: solicitudes de corrección o eliminación con estados.
  - Grants contextuales.
  - RNF-PRV-02..04: `final_demo_at` inmutable, purga total como máximo a los
    30 días de esa fecha, solo agregados irreversibles y backups (AP-07).
- **recognition-policies**
  - RF-REC-01..04: política versionada con valores cerrados {refrigerio,
    diploma, pin}.
  - Se muestra al donante de forma neutral.
  - No afecta al matching.
  - Suspensión y levantamiento por el superadmin, con motivo.
- **legal-information**
  - RF-LAB-01 y RNF-LGL-01: segmento legal-laboral con estados `borrador`,
    `aprobado` y `retirado`.
  - Se publica solo con revisión legal profesional.
- **Mapa (C, stretch).**
  - RF-MAP-01/02: celdas de 1 km con k ≥ 5.
  - No bloquea el MVP. Fuera de este plan salvo voto.

### 4.3 RNF críticos para el backend

- **Seguridad**
  - SEC-01..04: PKCE mediado por Express, cookie `Secure`/`HttpOnly`,
    `SameSite` Lax o None, `Origin` exacto más CSRF, y validación completa del
    JWT.
  - SEC-05/06: AAL2 para admins, step-up de 5 min o menos y grant de PII de
    10 min o menos.
  - SEC-07/08: membresía comprobada en cada request y deny-by-default en API y
    RLS.
  - SEC-09/10: `service_role` solo dentro de una allowlist; el worker solo con
    `EXECUTE`; `search_path` fijo y `PUBLIC` revocado.
  - SEC-11: recuperación sin enumeración, de un uso, 1 h, que revoca las
    sesiones.
  - SEC-12/13: tokens de 256 bits o más con CSPRNG, guardados solo como hash.
    Páginas de token con `no-store` y `no-referrer`, y sin logs.
  - SEC-14: payload del outbox cifrado y autenticado, destruido al terminar
    (AP-06).
  - SEC-15/16: rate limit de 10 por 15 min por IP y por HMAC del email, con
    contadores atómicos compartidos y solo proxies enumerados como confiables.
  - SEC-17/18: secretos solo en el servidor y CORS con allowlist exacta.
- **Fiabilidad.** REL-01/02: `Idempotency-Key` sobre (actor, operación, hash
  del payload). Replay o 409 si el payload difiere o la petición sigue en
  curso. Retención de 72 h tras el estado terminal.
- **API.** API-01/02: esquemas cerrados y `ErrorResponse`
  `{error:{code,message,correlationId}}` en `application/json`. No se usa
  problem+json.
- **Observabilidad y auditoría.**
  - OBS-01/02: telemetría con allowlist de campos, sin PII, tokens, bodies,
    query strings ni claves.
  - AUD-01: auditoría append-only con IDs opacos y sin valores PII.
- **Datos y privacidad.** DAT-01: migraciones versionadas reproducibles desde
  una DB limpia y desde la versión anterior. PRV-01: solo datos sintéticos.
- **Rendimiento.** PER: matching p95 < 2 s con 5 concurrentes; API común
  p95 < 500 ms con 10 concurrentes; respuesta visible en el dashboard en 5 s o
  menos; primer intento del outbox en 60 s o menos.
- **Operación y arquitectura.**
  - OPS: liveness y readiness (503).
  - ARC-01..05: dominio puro con puertos y adaptadores.
- **Seguridad clínica.** SAF-01..04: matriz académica con disclaimer, sin datos
  reales y sin pacientes ni diagnósticos.

### 4.4 Máquinas de estado

- **Necesidad.**
  - `borrador → activa`.
  - `activa → {meta_alcanzada, cerrada, cancelada, vencida}`.
  - `meta_alcanzada → {activa, cerrada, cancelada, vencida}`.
  - Estados terminales: `cerrada`, `cancelada` y `vencida`.
  - La salida de `borrador` está por votar (V8).
- **Alta asistida.**
  - `pendiente → {reclamada_incompleta, vencida}`.
  - `vencida → pendiente`, solo por reemisión antes de la purga original. La
    fecha de purga no se reinicia.
  - `reclamada_incompleta → activa`.
- **Solicitud de corrección o eliminación.**
  - `pendiente → {aprobada, rechazada}`.
  - `aprobada → en_ejecucion`.
  - `en_ejecucion → {completada, fallida}`.
  - Estados terminales: `rechazada`, `completada` y `fallida`.
- **Invitación, eje vigencia.**
  - `activa → invalidada`, por cierre, cancelación, meta alcanzada o
    indisponibilidad.
  - `activa → vencida`.
- **Invitación, eje entrega.**
  - `pendiente → {enviada, fallida}`.
  - `enviada → {entregada, fallida}`.
  - `fallida → pendiente`, solo por reintento manual auditado antes del
    vencimiento, con un par de tokens nuevo (AP-02 y V5).
- **Invitación, eje respuesta.**
  - `sin_respuesta → {confirmada, rechazada}`.
  - `confirmada ↔ rechazada`, con sesión y mientras la necesidad no sea
    terminal.
- **Política de reconocimiento.**
  - `sin_publicar ↔ publicada`, por el admin.
  - `publicada → suspendida` y `suspendida → sin_publicar`, solo por el
    superadmin.
  - Toda mutación usa `expectedVersion` y responde 409 si está obsoleta.

### 4.5 Límites clínicos y legales (no negociables)

- Solo `MATRIZ_RBC_ACADEMICA_V1`. Es una declaración académica, no una fuente
  clínica.
- No se usan intervalos de donación, historial ni inferencia de elegibilidad.
  Cualquier intervalo futuro debe ser configurable y aprobado por una fuente
  clínica.
- El matching genera candidatos para contactar. No certifica grupo,
  elegibilidad ni seguridad transfusional.
- No hay pacientes, diagnósticos, historias clínicas ni contacto
  paciente–donante.
- El sistema no afirma cumplimiento legal ni clínico. Para usar datos reales
  se requiere revisión clínica, legal y de privacidad en Perú (Leyes 26454,
  27282 y 29733).

---

## 5. Votaciones pendientes (registrar el resultado aquí antes de usarlas)

| # | Decisión | Recomendación | Fase que bloquea | Resultado |
| --- | --- | --- | --- | --- |
| V1 | Aceptar `Need-Draft-Application-Spec.md` (sustituye RA2) | Aceptar como base de `need-records` | F3 | _pendiente_ |
| V2 | Seguridad de funciones RPC (ADR-003) | Ver detalle bajo la tabla | F1 | **Decidido 2026-10-12: SECURITY INVOKER + RLS de escritura**, con allowlist cerrada de excepciones DEFINER (ver especificación §2.2). Reemplaza la recomendación DEFINER de abajo |
| V3 | Topología de las cookies | **Rewrite de Vercel `/api/*` hacia Render** (same-origin, `SameSite=Lax`). Alternativa: `SameSite=None` con CORS con credenciales, de mayor riesgo | F2 | **Decidido 2026-10-12: rewrite de Vercel + `TRUSTED_PROXIES` por saltos o CIDR** |
| V4 | Vida del JWT y refresh | Access token de 10 min (`jwt_expiry` en `config.toml`), refresh rotativo con detección de reuso, refresh server-side transparente cuando el access token ha vencido, y `signOut({scope:'global'})` en recuperación y logout | F2 | _pendiente_ |
| V5 | AP-02: estado de entrega | Estado agregado por invitación separado de la tabla de intentos. `fallida` solo cuando se agotan los 5 reintentos o el error es permanente. El reintento manual lo ejecuta el **superadmin**, se audita y genera tokens nuevos | F4 | _pendiente_ |
| V6 | AP-04: carreras | Ver detalle bajo la tabla | F6 | _pendiente_ |
| V7 | AP-06, AP-07 y AP-08 | AP-06: destruir el payload al llegar a un estado terminal, o como máximo al vencer la necesidad, verificado por pgTAP o integración. AP-07: backups de 7 días como máximo, documentados, con el ledger de borrados reaplicado al restaurar. AP-08: *full jitter* acotado a ±20 % del retardo base | F4/F7 | _pendiente_ |
| V8 | Huecos sin dueño en los documentos | Ver detalle bajo la tabla | F2/F3/F5/F8 | _pendiente_ |
| V9 | Dependencias nuevas | Ninguna de runtime. pgTAP viene con el CLI de Supabase (`supabase test db`). Cualquier otra dependencia requiere voto y lock auditado | todas | _pendiente_ |
| V10 | Ubicación de Supabase | `backend/supabase/` (`config.toml`, `migrations/`, `seed.sql` sintético, `tests/*.sql`), para que todo el backend viva en `backend/` | F1 | _pendiente_ |
| V11 | Polígono de Lima | Fijar un GeoJSON con versión y hash en `backend/src/modules/donor-records/domain/lima-polygon.json`. Mientras tanto, usar una envolvente sintética marcada `DEMO_ONLY` | F5 | _pendiente_ |
| V12 | Ratificación del contrato de cada módulo | Votar las operaciones de §7 al inicio de cada fase | cada fase | _pendiente por fase_ |

Decisiones adicionales del 2026-10-12, detalladas en
[`2026-10-12-especificacion-faltante-backend.md`](2026-10-12-especificacion-faltante-backend.md) §2.1:

- **V-Auth:** `service_role` solo dentro de un adaptador allowlisted, para 4
  acciones de Supabase Auth Admin: contraseña, email, borrado de usuario y
  revocación de sesiones.
- **V-MFA:** nueva operación de contrato para enrolar TOTP.

Los votos nuevos (V13–V20) están en la §2.3 de ese documento.

**Detalle de V2 (seguridad de las RPC).**

- Las funciones son `SECURITY DEFINER` y pertenecen a un rol dedicado
  `app_owner`, sin `BYPASSRLS` ni superusuario.
- Las tablas tienen `FORCE ROW LEVEL SECURITY`.
- Cada función fija `SET search_path = ''` y usa nombres calificados.
- Cada RPC comprueba `auth.uid()`, el claim AAL, la membresía vigente y la
  propiedad del recurso.
- `authenticated` solo tiene `EXECUTE` sobre las RPC permitidas y `SELECT`
  sobre vistas y políticas mínimas. No tiene `INSERT`, `UPDATE` ni `DELETE`
  directos.
- Se revoca todo a `PUBLIC` y a `anon`.

**Detalle de V6 (AP-04, carreras).**

- Vence el primer commit, con `SELECT … FOR UPDATE` sobre la necesidad.
- Una confirmación cuando la meta ya está alcanzada responde 409
  `STATE_CONFLICT`.
- Cerrar, cancelar o vencer cancela el outbox no enviado.
- Un envío ya en curso termina, pero sus tokens quedan inválidos por el estado
  de la necesidad.
- Un cambio `rechazada → confirmada` en `meta_alcanzada` responde 409.

**Detalle de V8 (huecos sin dueño).**

- Desde `borrador` se puede cancelar, y vence a `expires_at`.
- Una política `sin_publicar` no se puede suspender.
- Retención de `reclamada_incompleta`: 30 días, igual que la alta no
  reclamada.
- La única configuración editable es `final_demo_at`.

---

## 6. Arquitectura objetivo en `backend/`

```
backend/
  src/
    server.ts              # raíz de composición HTTP: env validado → adaptadores → createApp → listen
    worker.ts              # proceso del outbox, reconciliación y purgas (intervalos configurables)
    app.ts                 # createApp(deps): middlewares comunes + routers de módulos; sin I/O global
    config/env.ts          # parse/validación/congelado del entorno; nunca loguear valores
    contract/              # GENERADO: openapi.ts + schemas/<operationId>.json (no editar)
    shared/
      http/                # correlationId, envelope {data}, ErrorResponse y mapeo de códigos,
                           # origin allowlist, csrf, cookies, Idempotency-Key (16–255 code points),
                           # no-store/no-referrer en rutas de token, body limit, 404 genérico
      auth/                # verifyAccessToken (supabase.auth.getClaims vía JWKS), Principal,
                           # guards requireRole/requireAal2/requireStepUp/requireMembership
      persistence/         # createRequestClient(jwt) por request; callRpc(name,args) → unknown validado
      observability/       # logger JSON con allowlist (evento, módulo, código, correlationId, duración)
      crypto/              # tokens CSPRNG 256 bits + sha256, HMAC CSRF/email, AES-256-GCM outbox
      kernel/              # Result/errores de dominio, puertos Clock/IdGenerator si aplica
    modules/<capacidad>/
      domain/              # puro: entidades, máquinas de estado, reglas (sin Express/Supabase/Resend)
      application/         # casos de uso con puertos inyectados; *.ports.ts
      infrastructure/      # adaptadores RPC/Resend/fake
      http/                # router + controladores: parse DTO → caso de uso → {data}/error
      dto/                 # validadores AJV por operación ratificada (patrón need-records/dto)
  supabase/
    config.toml            # jwt_expiry, MFA TOTP habilitado, auth email local (inbucket)
    migrations/            # NNNN_<capacidad>_<desc>.sql versionadas
    seed.sql               # 3 hospitales/sedes, 1 superadmin, admins y donantes *.example.test
    tests/                 # pgTAP: RLS, grants, acceso directo negativo por rol/hospital/donante
  test/integration/        # vitest contra Supabase local (se salta si no hay SUPABASE_TEST_URL)
```

**Reglas de arquitectura**

- **Dominio puro.** Compatibilidad, Haversine, polígono, ranking, tamaño de
  lote y máquinas de estado son funciones puras con pruebas unitarias
  exhaustivas.
- **Aplicación.** No lee `req`/`res`, cookies ni el entorno. Recibe body,
  contexto (principal) y metadata (clave de idempotencia) por separado, como en
  la spec A2.
- **Escrituras.** Cada comando con efectos es **una sola RPC atómica** que hace:
  1. revalidar el sujeto, AAL, membresía y recurso;
  2. reclamar `idempotency_records (actor_id, operation, key)` con una
     restricción única y comparar `payload_hash`;
  3. aplicar los efectos;
  4. guardar el resultado original;
  5. escribir `audit_events`.

  Una secuencia de llamadas SDK **no** es una transacción.
- **Lecturas.** Van por vistas o RPC de solo lectura con RLS. Sin `SELECT *`,
  con scoping dentro de la consulta y sin N+1. La paginación usa `limit`
  (1–100, por defecto 20) y un `cursor` opaco firmado sin PII, devolviendo
  `nextCursor`.
- **Proyecciones.** Los adaptadores validan la respuesta `unknown` con guards
  cerrados y con el validador DTO de salida. Nunca se serializan filas.
- **Errores.** Los códigos públicos son `BAD_REQUEST` (400 para
  shape/JSON), `AUTHENTICATION_REQUIRED` (401), `ACCESS_DENIED` (403),
  `RESOURCE_NOT_FOUND` (404, que también oculta recursos ajenos),
  `STATE_CONFLICT` (409), `ACTION_UNAVAILABLE` (410), `VALIDATION_FAILED`
  (422 semántico), `RATE_LIMITED` (429 + `Retry-After`), `INTERNAL_ERROR`
  (500) y `SERVICE_UNAVAILABLE` (503). Siempre llevan `correlationId`. Cada
  operación respeta su propio catálogo; por ejemplo, `createHospitalNeed` no
  devuelve 404 ni 429.
- **Tokens.** Los de acción (verificación, alta asistida, invitación,
  recuperación, cambio de email e invitación de admin) son de 256 bits; en la
  DB solo se guarda su `sha256`. GET es una vista previa sin efectos y POST
  consume el token de forma atómica.
- **Rate limit.** RPC `consume_rate_limit(bucket, subject_hmac)` con contador
  atómico en PostgreSQL: 10 cada 15 min por IP y por HMAC del email. Se usa
  `trust proxy` solo con los proxies enumerados.
- **Logs.** Nunca incluyen body, query, URL completa, cookies, tokens, claves
  de idempotencia, emails ni coordenadas. Las pruebas de canarios lo
  verifican.

**Reutilización obligatoria**

- `parseCreateNeedInput` y `parseCreatedNeedEnvelope`
  (`backend/src/modules/need-records/dto/validators.ts`) y su patrón AJV 2020
  cerrado para los DTO nuevos.
- Las firmas de `docs/Need-Draft-Application-Spec.md` §3:
  - `createNeedDraft`, `projectNeedDraft`, `AtomicNeedDraftGateway`,
    `createNeedDraftService` y `fingerprintNeedDraftInput`;
  - el orden del hash: `component`, `requiredBloodType`,
    `targetConfirmations`, `siteId`, `radiusKm`, `urgency`,
    `expiresInHours`.

  El patrón de fingerprint canónico se replica para las demás operaciones
  idempotentes.
- `apps/mock-api/src/app.ts` solo sirve como referencia de **forma** de
  respuestas, CSRF e idempotencia. No se copia su lógica de demo.

---

## 7. Fases e inventario de operaciones por módulo

Cada fase sigue el **ciclo estándar**:

1. Crear el plan de la fase en `docs/plans/YYYY-MM-DD-<modulo>.md`.
2. El usuario vota el contrato y las correcciones del módulo (V12). Se marca
   `x-ratification` y se ejecuta `npm run openapi:types`.
3. Pruebas RED:
   - unitarias de dominio y aplicación;
   - pgTAP de RLS, grants y acceso directo negativo;
   - integración.
4. Implementar en este orden: migración → RPC → dominio → aplicación →
   adaptador → HTTP, hasta GREEN.
5. Integración contra Supabase local:
   - matriz de rol, AAL, hospital y propietario;
   - IDOR;
   - 20 solicitudes concurrentes con la misma clave;
   - rollback ante un fallo intermedio;
   - canarios en logs.
6. Ejecutar Bruno contra el backend real (entorno `local-backend`), con
   reportes sanitizados.
7. Revisión por un subagente `reviewer-back` y, cuando aplique, por
   `security-privacy-auditor` o `clinical-safety-reviewer`. Corregir los
   hallazgos y volver a revisar.
8. Sincronizar la documentación: README, `Backend-Contracts.md`, ADR y la
   bitácora.
9. Commit atómico con Conventional Commits, stageando solo los paths de la
   unidad (nunca `git add -A`). El usuario aprueba el cierre del módulo.

### F0 — Gobierno y sincronización (sin código de producto)

- F0.1: cambios en `AGENTS.md`, `Agent-Workflow.md` y `CLAUDE.md` para Claude
  Code (§3.1).
- F0.2: registrar los votos V1–V11 en §5.
- F0.3: ADR-001 consolidado y ADR-003 aceptado.
- F0.4: ADR-004 de sesión.
- F0.5: ADR-005 de email.
- F0.6: sincronizar `project-requirements.md` y el xlsx (§3.10).
- F0.7: generalizar el generador (§3.8) con sus pruebas
  `scripts/generate-api-contract.test.mjs`.
- F0.8: retirar el legacy y ajustar los scripts de `package.json` (§3.6–3.7).
- **Salida:** commits `docs(...)` y `build(backend): ...`. `npm test`,
  `npm run typecheck` y `npm run openapi:api:check` en verde.

### F1 — Plataforma

- `config/env.ts` con estas variables:
  - `PORT`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publicable),
    `SUPABASE_JWKS_URL` o el emisor;
  - `ALLOWED_ORIGINS`, `TRUSTED_PROXIES`;
  - `CSRF_SECRET`, `EMAIL_HMAC_SECRET`, `OUTBOX_KEY`;
  - `EMAIL_PROVIDER=fake|resend`, `RESEND_API_KEY`, `EMAIL_INBOX_ALLOWLIST`.

  Actualizar `backend/.env.example` solo con los nombres de las variables.
- `shared/http`, `shared/observability`, `shared/crypto` y
  `shared/persistence`, con pruebas unitarias.
- `GET /health/live` y `GET /health/ready` (`getLiveness` y `getReadiness`).
  `ready` comprueba la conexión y la versión de las migraciones, y responde 503
  si fallan.
- `supabase init --workdir backend` y la migración base:
  - esquemas `app` (tablas) y `api` (RPC y vistas expuestas);
  - rol `app_owner`;
  - `REVOKE ALL … FROM PUBLIC, anon`;
  - `audit_events` append-only, con trigger que impide `UPDATE` y `DELETE`;
  - `idempotency_records`;
  - `rate_limit_counters`.
- Seed sintético: 3 hospitales y sus sedes, con emails `*.example.test`.
- **Gate:** `reviewer-back` y `security-privacy-auditor` (grants y base de
  RLS).

### F2 — identity-institutions (seguridad obligatoria)

Operaciones de autenticación:

- `createSession`, `getCurrentSession`, `getCsrfToken`,
  `deleteCurrentSession`;
- `verifyMfaChallenge`, `verifyStepUp`;
- `requestPasswordRecovery`, `completePasswordReset`;
- `getHospitalAdminInvitationPreview`, `claimHospitalAdminInvitation`.

Operaciones del superadmin:

- `listHospitals`, `createHospital`, `getHospital`, `updateHospital`;
- `listHospitalSites`, `createHospitalSite`, `updateHospitalSite`;
- `inviteHospitalAdmin`, `listHospitalMemberships`,
  `revokeHospitalMembership`;
- `getSuperadminConfiguration`, `setFinalDemoAt` (una sola vez);
- `listAuditEvents`, `listSuperadminTasks`.

Puntos clave:

- El login se hace con Supabase Auth desde Express y emite las cookies de
  ADR-004.
- MFA con TOTP de Supabase (`aal2`).
- Step-up con un timestamp verificado dentro de la sesión, de 5 min como
  máximo.
- La membresía se resuelve desde `app.hospital_memberships` en cada request.
- Recuperación sin enumeración, 1 h y revocación global.
- Rate limit SEC-15.

### F3 — need-records

Operaciones:

- `createHospitalNeed` (ya ratificada), implementada según la spec A2:
  `domain/need-draft.ts`, `application/create-need-draft.ports.ts`,
  `application/create-need-draft.ts` y sus dos tests. Además, la RPC
  `api.create_need_draft` y el router HTTP.
- `listOwnHospitalNeeds`, `getOwnHospitalNeed`,
  `transitionOwnHospitalNeed` y `listOwnHospitalSites`.

Puntos clave:

- Sede inexistente, ajena o inactiva produce el mismo 422.
- `expires_at` lo calcula la DB.
- Un replay devuelve el `expiresAt` original aunque ya haya pasado.
- La transición sigue la máquina §4.4. Los efectos sobre invitaciones se
  conectan en F6.
- Antes del adaptador, resolver los pendientes de la spec A2 §7: equivalencia
  de mayúsculas en los UUID y replay tras desactivar la sede.

### F4 — email-delivery

- Puerto `EmailSender` con dos adaptadores:
  - `FakeEmailSender`, que registra solo metadatos;
  - `ResendEmailSender`, con `fetch`, timeout de 10 s y header de
    idempotencia de Resend.
- Tablas `app.email_outbox` (payload AES-256-GCM) y `app.email_attempts`.
- RPC del worker: `claim_due_outbox`, `record_attempt` y `cancel_outbox_for`.
- Worker: backoff de 1/2/5/10/20 min con jitter (V7); clasifica los errores
  según RF-EML-02; reconcilia resultados inciertos durante 5 min; no envía si
  `now() >= expires_at`.
- Allowlist de bandejas (RF-EML-04).
- Webhook `POST /api/v1/email-delivery/webhooks/resend`: requiere contrato
  nuevo (§3.9). Valida la firma sobre el body crudo y una antigüedad de 5 min
  o menos, deduplica y nunca retrocede el estado.
- **Gate:** seguridad (cifrado, secretos y webhook).

### F5 — donor-records (privacidad obligatoria)

Operaciones de alta y verificación:

- `createDonorRegistration`;
- `getDonorEmailVerificationPreview`, `verifyDonorEmail`;
- `getAssistedActivationPreview`, `claimAssistedRegistration`;
- `getEmailChangePreview`, `verifyEmailChange`.

Operaciones del donante:

- `completeDonorOnboarding`;
- `getOwnDonorProfile`, `updateOwnDonorParticipation`.

Operaciones del hospital:

- `listOwnAssistedSignups`, `createAssistedSignup`, `getOwnAssistedSignup`,
  `reissueAssistedActivationLink`.

Puntos clave:

- Ubicación con 3 decimales dentro del polígono (V11).
- El PATCH solo acepta disponibilidad y ubicación.
- Respuesta neutra cuando el email ya existe.
- Los tokens de 24 h y la purga a 30 días de las altas no reclamadas los
  ejecuta el worker.
- Pasar a no disponible invalida las invitaciones activas sin respuesta. Esta
  regla se conecta en F6.

### F6 — invitation-coordination (clínica y seguridad obligatorias)

Operaciones:

- `listOwnInvitationBatches`, `requestInvitationBatch`,
  `listOwnNeedResponses`;
- `getInvitationActionPreview`, `recordInitialInvitationResponse`;
- `listOwnInvitations`, `getOwnInvitation`,
  `changeOwnInvitationResponse`, `listOwnResponseHistory`.

Dominio puro en `modules/invitation-coordination/domain/`:

- `compatibility.ts` con la matriz de 64 pares;
- `haversine.ts`;
- `ranking.ts`;
- `batch-size.ts`;
- `invitation-state.ts`.

RPC `api.request_invitation_batch`, en una sola transacción:

1. Bloquear la necesidad.
2. Seleccionar candidatos con los filtros y el límite de 3 en 24 h.
3. Insertar las invitaciones con unicidad (necesidad, donante).
4. Generar los hashes de los tokens.
5. Escribir el outbox y la auditoría.

Puntos clave:

- La selección puede hacerse en SQL con la misma fórmula, o calcular en
  dominio sobre un conjunto mínimo proyectado. Elegir en el plan de la fase
  según PER-01, con pruebas de equivalencia contra la función pura.
- Efectos de meta, cierre y vencimiento según RF-INV-05..08 y V6.
- Visibilidad según RF-VIS-01..03, sin datos de rechazados.

### F7 — privacy-requests (seguridad obligatoria)

Operaciones del donante:

- `listOwnCorrectionRequests`, `createOwnCorrectionRequest`,
  `getOwnCorrectionRequest`.

Operaciones del superadmin:

- `listCorrectionRequests`, `getCorrectionRequest`,
  `decideCorrectionRequest`;
- `createContextualAccessGrant`;
- `getContextualDonorData` y `executeApprovedCorrectionRequest`, ambas con
  `X-Contextual-Grant` de 10 min o menos, step-up y AAL2.

Worker:

- Purga de idempotencia a las 72 h del estado terminal.
- Purga total a `final_demo_at` + 30 días, conservando solo agregados
  irreversibles.
- Ledger de borrados para restauraciones (V7).

### F8 — recognition-policies y legal-information

Operaciones:

- `getOwnRecognitionPolicy`, `publishOwnRecognitionPolicy`
  (`expectedVersion` en el body) y `withdrawOwnRecognitionPolicy`
  (`expectedVersion` en la query, 204 con replay y 400 si falta);
- `listPublishedRecognitionPolicies`;
- `listRecognitionPoliciesForModeration`, `moderateRecognitionPolicy`;
- `getDonationWorkInformation`.

Puntos clave:

- La política no influye en el matching.
- La moderación lleva motivo auditado.
- El contenido legal muestra solo el estado `aprobado` y usa un placeholder
  sintético hasta tener revisión legal.

### F9 — Integración y salida

- `apps/web/vite.config.ts`: destino del proxy configurable con
  `API_TARGET=mock|backend`, por defecto el mock para no romper el flujo
  actual.
- Alinear las discrepancias del mock (§3.9) o documentarlas.
- Bruno: nuevo `bruno/environments/local-backend.bru` y
  `scripts/test-bruno-backend.mjs`.
  - El script levanta `supabase start`, `db reset`, la siembra y el backend.
  - Ejecuta `bru run` con `--sandbox safe` sin volcar bodies, headers ni
    cookies.
  - Reutiliza `bruno/scenarios` y crea escenarios nuevos por módulo sin borrar
    los existentes.
- E2E con Playwright contra el backend en un config separado. El config actual
  del mock se conserva.
- Mediciones p95 (PER-01..06) con un script local sintético.
- Despliegue en Render:
  - `npm ci`, `npm run build --workspace backend` y
    `node backend/dist/server.js`, más un worker como servicio separado;
  - migraciones con `supabase db push` solo con autorización explícita;
  - health checks y rollback documentados en el README.

---

## 8. Verificación

Comandos desde la raíz:

```bash
SCARF_ANALYTICS=false npm ci
npm run openapi:lint && npm run openapi:api:check && npm run test:api:generator
npm run typecheck --workspace backend && npm run lint --workspace backend && npm run build --workspace backend
npm run test --workspace backend                                  # unitarias (dominio/aplicación/http con dobles)
supabase start --workdir backend && supabase db reset --workdir backend   # migraciones desde cero + seed
supabase test db --workdir backend                                # pgTAP: RLS/grants/acceso directo negativo
npm run test:integration --workspace backend                      # vitest contra Supabase local
npm run test:bruno:backend                                        # Bruno CLI contra backend real (nuevo)
npm test && npm run typecheck && npm run build                    # regresión monorepo: mock/web siguen verdes
npm run test:bruno && npm run test:e2e -- --trace=off             # regresión del flujo mock existente
```

**Definición de terminado global** (de `AGENTS.md`):

- Las ocho capacidades con su contrato ratificado.
- Aceptación y casos de abuso cubiertos.
- Pruebas unitarias, de integración, pgTAP, Bruno y E2E pertinentes en verde.
- Negativos de rol y RLS probados por acceso directo.
- Idempotencia concurrente y rollback verificados.
- Errores seguros con `correlationId`.
- Logs con canarios y sin PII.
- Documentación, API y ADR sincronizados.
- PASS de revisión registrados por módulo y aprobación del usuario.
- Sin declarar cumplimiento clínico ni legal.

## 9. Riesgos

- **Cookies entre Vercel y Render.** Sin el rewrite same-origin de V3,
  `SameSite=Lax` no funciona. Decidir V3 antes de F2.
- **Revocación con JWT en cookie (D-3).** El access token sigue siendo válido
  hasta que expira. Se mitiga con una vida corta (V4) y comprobando la
  membresía vigente en cada request y RPC (SEC-07).
- **`SECURITY DEFINER` mal configurado** puede saltarse RLS. Se mitiga con el
  rol `app_owner` sin bypass, `FORCE RLS`, `search_path` vacío, checks
  explícitos y pgTAP de acceso directo.
- **Rendimiento del matching (PER-01)** con 500 donantes: medir pronto en F6.
- **Cold starts de Render** pueden afectar los p95. Medir en la demo, según
  ADR-001.
- **Working tree con cambios ajenos.** Stagear solo la unidad. No restaurar ni
  commitear los planes eliminados sin decisión.
- **Requisitos por sincronizar (§3.10).** Bloquean F5–F7 según la línea base
  §6.

## 10. Bitácora

- 2026-10-12: sesión de planificación en Claude Code.
  - Leídos `README.md`, `AGENTS.md`, `Backend-Contracts.md`,
    `Need-Draft-Application-Spec.md`, ADR-001/003 y el plan incremental.
    Inventario de requisitos (línea base, ERS y `project-requirements`) y del
    contrato (`openapi.json`, `Api-Rules`, mock).
  - El usuario decidió D-1 a D-4.
  - Detectados huecos: no hay webhook de email en el contrato, hay
    divergencias del mock y contradicciones en `project-requirements`.
  - No se escribió código productivo. Próximo paso: F0 (votos V1–V11 y
    sincronización).
- 2026-10-12: revisión de la tanda F0/F1 (`90c203a..cd8d2b3`) y especificación
  detallada de todo lo que falta, con rutas, SQL, RPC, guards, pruebas y anexos
  de contrato y reglas, en
  [`2026-10-12-especificacion-faltante-backend.md`](2026-10-12-especificacion-faltante-backend.md).
  - El usuario decidió V2 (INVOKER), V3 (rewrite + saltos), V-Auth y V-MFA.
  - Esa especificación es la guía operativa para continuar.

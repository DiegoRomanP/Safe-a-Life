# Especificación de lo que falta para terminar el backend

| Campo | Valor |
| --- | --- |
| Fecha | 2026-10-12 |
| Harness | Claude Code (planificación; este documento no implementa código) |
| Rama | `feat/backend-developing` (HEAD `cd8d2b3`) |
| Plan padre | [`2026-10-12-plan-maestro-backend-ocho-capacidades.md`](2026-10-12-plan-maestro-backend-ocho-capacidades.md) |
| Ejecución previa | [`HISTORIAL.md`](HISTORIAL.md) §4 (U2–U7c) |
| Estado | **Especificación propuesta.** Las decisiones de §2.1 ya están tomadas; las de §2.3 siguen pendientes de voto |

## Cómo usar este documento

Este documento dice **qué falta, dónde va, cómo se hace y cómo se verifica**,
desde el estado actual del repositorio hasta tener las ocho capacidades.

1. Ejecuta los bloques en orden: **A** (correcciones) → **C** (F0: ADR,
   contrato y generador) → **D** (plataforma) → **módulos** en el orden de
   §6.0 → **F9** (integración).
2. Antes de cada módulo:
   - vota sus operaciones (§2.3, V12) y las decisiones que bloquea;
   - lee las skills `.opencode/skills/save-a-life-*` que apliquen;
   - lee el Anexo A (contrato) y el Anexo B (reglas).
3. Cada módulo pasa por el ciclo de §6.0: RED → GREEN → pgTAP e integración →
   Bruno → revisión por subagente → documentación → commit.
4. Todo lo marcado **"verificar con Context7"** depende del comportamiento de
   una librería externa. Hay que confirmarlo con la documentación vigente antes
   de escribir el código.
5. Los anexos son el contexto completo para trabajar sin releer los documentos
   fuente:
   - **A:** contrato por operación.
   - **B:** reglas y valores.
   - **C:** convenciones del código actual.
   - **D:** generador.
   - **E:** riesgos y puntos a verificar.

**Fuentes de autoridad**, en orden de precedencia. Si se contradicen, se
detiene el trabajo y se pide sincronizar.

1. `AGENTS.md`.
2. `docs/1_Primeros_Alcances.md` v1.2 (línea base aprobada, abreviada **PA**).
3. ADR-001, ADR-002 y ADR-003.
4. `docs/2_Especificaciones_De_Software.md` v0.4 (ERS, abreviada **ERS**).
5. `docs/openapi.json` (contrato canónico) y `docs/Api-Rules.md` (**AR**).
6. `docs/Backend-Contracts.md` (**BC**) y `docs/Need-Draft-Application-Spec.md` (spec **A2**).
7. `.opencode/references/project-requirements.md` y `.opencode/skills/*`.

---

## 1. Estado actual verificado (2026-10-12)

### 1.1 Qué existe en `backend/`

Verificado: `npm run test --workspace backend` da 152/152; el generador 25/25;
`openapi:api:check` sin drift; typecheck y build correctos.

| Ruta | Qué es | Exporta |
| --- | --- | --- |
| `backend/src/config/env.ts` | Entorno validado y congelado | `parseEnv(source)`, `AppConfig`, `ConfigError` (mensaje solo con nombres de variables), `EmailProvider` |
| `backend/src/app.ts` | Composición Express sin rutas | `createApp({config, logger, mount?})`. Orden: `x-powered-by` off → `trust proxy` → correlationId → log `peticion.finalizada` → originGuard → `express.json({limit:'16kb'})` → `mount` → 404 → error handler |
| `backend/src/server.ts` | Punto de entrada | Lee el entorno; si es inválido sale con 1; `listen(PORT)`; SIGINT/SIGTERM → `server.close` |
| `backend/src/shared/http/errors.ts` | Catálogo de errores | `ERROR_STATUS`, `ApiError(code, message?)`, `toPublicError`, `notFoundHandler`, `createErrorHandler(onUnexpected?)` |
| `backend/src/shared/http/correlation-id.ts` | ID por petición | `correlationIdMiddleware`: `randomUUID` generado en servidor, nunca leído del cliente |
| `backend/src/shared/http/origin-guard.ts` | Origin en mutaciones | `originGuard(allowed)`: un `Origin` presente y no permitido → 403. Sin `Origin` → pasa |
| `backend/src/shared/http/idempotency-key.ts` | Cabecera | `parseIdempotencyKey(raw)`: 16–255 puntos de código o `undefined` |
| `backend/src/shared/http/sensitive-response.ts` | SEC-13 | `noStoreNoReferrer` (no está montado) |
| `backend/src/shared/crypto/tokens.ts` | Tokens de acción | `generateActionToken()` (32 bytes base64url), `hashToken` (sha256 hex), `safeEqual` |
| `backend/src/shared/crypto/hmac.ts` | HMAC | `hmacSha256Hex`, `hmacEmailSubject` (trim + lowercase) |
| `backend/src/shared/crypto/csrf.ts` | CSRF | `createCsrfToken(secret, sessionId)` → `nonce.mac`; `verifyCsrfToken` |
| `backend/src/shared/crypto/outbox-cipher.ts` | AES-256-GCM | `sealPayload(key, plaintext, context)` → `v1.iv.tag.ct`; `openPayload`; `SealedPayloadError` |
| `backend/src/shared/observability/logger.ts` | Logger con allowlist | `createLogger(write, now?)`. Solo `event`, `module`, `code`, `correlationId` y `durationMs` |
| `backend/src/modules/need-records/dto/validators.ts` | DTO de `createHospitalNeed` | `parseCreateNeedInput`, `parseCreatedNeedEnvelope`, `NeedDtoError('shape'\|'rule'\|'output')` |
| `backend/src/modules/need-records/dto/openapi.ts`, `contract.generated.json` | Generados | No se editan a mano |

`backend/package.json`:

- Scripts: `dev` = `tsx watch --env-file-if-exists=.env src/server.ts`;
  `start` = `node dist/server.js`; `test` = `vitest run`;
  `typecheck`/`lint` = `tsc --noEmit -p tsconfig.json`;
  `build` = `tsc -p tsconfig.build.json`.
- Dependencias: `@supabase/supabase-js@2.117.1` (todavía sin usar),
  `ajv@8.20.0`, `ajv-formats@2.1.1` y `express@5.2.1`.
- `tsx`, `supertest` y `@types/express` viven en el `package.json` raíz.

### 1.2 Qué no existe todavía

- Ninguna ruta de negocio. Tampoco `/health/live` ni `/health/ready`.
- Sesión, cookies, verificación del JWT, middleware de CSRF, AAL2 y step-up.
- Rate limit, almacén de idempotencia y cliente de Supabase en uso.
- `backend/supabase/`: migraciones, RLS, RPC, semilla y pgTAP.
- Worker, outbox, envío de email y webhook.
- Cabeceras de seguridad. Además, `NeedDtoError` no está mapeado (hoy acabaría en 500).
- Bruno contra el backend real y E2E contra el backend.

### 1.3 Árbol de trabajo (no tocar sin decisión)

- Cambios tuyos sin commit en `AGENTS.md`, `docs/Agent-Workflow.md`, ADR-001
  y `docs/plans/2026-10-12-api-backend-completo-incremental.md`.
- Cinco planes del 2026-10-03 aparecen eliminados.
- Archivos sin versionar: `CLAUDE.md`, `docs/Need-Draft-Application-Spec.md`,
  ADR-003, varios planes y `.claude/`.
- `frontend/` (plantilla Vite fuera del workspace): borrarlo requiere tu
  confirmación.
- `apps/mock-api` y `apps/web` siguen funcionando contra el mock. No se rompen.

### 1.4 Herramientas locales comprobadas

| Herramienta | Versión |
| --- | --- |
| Node | 24.19.0 |
| npm | 12.0.2 |
| Supabase CLI | 2.120.0 |
| Docker daemon | 29.9.0 (activo) |
| Bruno CLI | 4.2.0 |
| psql | 18.6 |

---

## 2. Decisiones

### 2.1 Tomadas por el usuario

| ID | Fecha | Decisión |
| --- | --- | --- |
| D-1 | 2026-10-12 | Proceso ligero: TDD por módulo, revisión independiente por subagentes de Claude Code con los prompts de `.opencode/agent/*.md`, y tu aprobación al cerrar cada módulo |
| D-2 | 2026-10-12 | Ratificación del contrato **por módulo**, con `x-ratification` en `docs/openapi.json` |
| D-3 | 2026-10-12 | Sesión con el JWT de Supabase en cookies HttpOnly, más CSRF firmado ligado a la sesión |
| D-4 | 2026-10-12 | Alcance: las 8 capacidades antes de integrar la web con el backend real |
| **V2** | 2026-10-12 | **SECURITY INVOKER + RLS de escritura** como regla general de las RPC (consecuencias en §2.2) |
| **V-Auth** | 2026-10-12 | `service_role` **solo** dentro de un adaptador allowlisted, para 4 acciones de Supabase Auth Admin: cambiar contraseña, cambiar email, borrar usuario y revocar sesiones |
| **V3** | 2026-10-12 | Vercel reescribe `/api/*` y `/health/*` hacia Render (mismo origen, `SameSite=Lax`). `TRUSTED_PROXIES` admite número de saltos o CIDR |
| **V-MFA** | 2026-10-12 | Se añade al contrato una operación para enrolar el factor TOTP (C-2) |

Decisiones anteriores que siguen vigentes:

- Mapa de 8 capacidades y dirección RPC Supabase (D1 del plan incremental).
- Supabase local aislado como entorno (T3).
- Contrato ratificado de `createHospitalNeed`.

### 2.2 Consecuencia de V2 (INVOKER). Se registra en ADR-003 (tarea C3)

1. **Tablas fuera del alcance de los clientes.** Las tablas viven en el
   esquema `app`, que **no** se expone a PostgREST
   (`backend/supabase/config.toml` → `[api] schemas = ["api"]`). Ningún cliente
   con la anon key o un JWT puede leer ni escribir `app.*`; solo puede llamar
   funciones del esquema `api`.
2. **Funciones INVOKER, la regla general.**
   - Se ejecutan como `authenticated`, con el JWT del usuario.
   - `authenticated` tiene `USAGE` en `app` y solo los privilegios de tabla
     estrictamente necesarios, cada uno respaldado por políticas RLS
     (`USING` / `WITH CHECK`) por rol, hospital y propietario.
   - Nadie tiene `UPDATE`/`DELETE` sobre `app.audit_events`, y además un
     trigger lo impide.
3. **Excepciones DEFINER, con allowlist cerrada.**
   - Funciones propiedad del rol `app_privileged` (`NOLOGIN NOBYPASSRLS`).
   - `SET search_path = ''` y nombres de objetos calificados.
   - Políticas RLS `TO app_privileged` por tabla.
   - Comprobación explícita del llamador dentro de la función.
   - Solo para operaciones que cruzan propietarios o no tienen JWT:
     1. `api.consume_rate_limit`.
     2. `api.readiness`.
     3. Funciones de token, vista previa y consumo: verificación de email,
        alta asistida, cambio de email, recuperación, invitación de admin y
        respuesta a invitación.
     4. Vinculación de cuentas nuevas: `user_accounts`, membresía y perfil.
     5. `api.request_invitation_batch` (lee perfiles de donantes).
     6. `api.list_own_need_responses` (nombre y grupo de los confirmados).
     7. Cambios de respuesta y de disponibilidad que afectan a la necesidad o
        al outbox.
     8. Transición de necesidad con cascada a invitaciones y outbox.
     9. Ejecución de solicitudes de corrección o eliminación.
     10. Funciones `worker_*`: outbox, webhook, vencimientos y purgas.
   - Cualquier DEFINER nueva requiere actualizar esta lista en ADR-003 y pasar
     revisión de `security-privacy-auditor`.
4. **Conexión de los superusuarios.** Las tablas son propiedad de `postgres`,
   que es superusuario y se salta RLS. Por eso las migraciones hacen
   `alter function … owner to app_privileged` en cada DEFINER, y las pgTAP
   verifican que ninguna función DEFINER pertenece a `postgres`.

### 2.3 Votos pendientes (recomendación incluida)

| # | Decisión | Recomendación | Bloquea |
| --- | --- | --- | --- |
| V1 | Aceptar `docs/Need-Draft-Application-Spec.md` (sustituye la revisión RA2) | Aceptar | F3 |
| V4 | Vida de la sesión | Access JWT de 600 s. Refresh rotativo (`refresh_token_reuse_interval = 10`). `inactivity_timeout = 12h`. Cookie de refresh `Max-Age=43200` | F2a |
| V5 | AP-02: estado de entrega | Estado agregado en la invitación + tabla de intentos. `fallida` al agotar 6 llamadas o ante un error permanente. El reintento manual lo hace el **superadmin** (operación C-4) | F4/F6 |
| V6 | AP-04: carreras | Bloqueo `SELECT … FOR UPDATE` de la necesidad: gana el primer commit. Confirmar con la meta alcanzada → 409. Cerrar, cancelar o vencer → se cancela el outbox no enviado. Un envío en curso termina, pero sus tokens quedan inválidos por el estado | F6 |
| V7 | AP-06/07/08 | **AP-06:** `sealed_payload = NULL` al llegar a un estado final o al vencer. **AP-07:** backups de 7 días como máximo, documentados, con el ledger de borrados reaplicado al restaurar. **AP-08:** jitter uniforme de ±20 % sobre el retardo base | F4/F7 |
| V8 | Huecos de estado | `borrador → cancelada` permitido, y un `borrador` también vence. Una política `sin_publicar` no se suspende. `reclamada_incompleta` se purga a los 30 días. Solo `final_demo_at` es editable | F3/F5/F8 |
| V10 | Ubicación de Supabase | `backend/supabase/` | F1 |
| V11 | Polígono de Lima | GeoJSON con versión y SHA-256 en el dominio. Mientras no exista, envolvente sintética marcada `DEMO_ONLY` | F5 |
| V12 | Ratificación por módulo | Votar las operaciones de cada fase al inicio de esa fase | Todas |
| V13 | Identidad del worker | Usuario técnico de Supabase Auth (`WORKER_EMAIL`/`WORKER_PASSWORD`) con rol interno `worker` en `app.user_accounts`. Las funciones `worker_*` y `ingest_email_event` exigen ese rol | F4 |
| V14 | `needDonorCode` | 10 caracteres Crockford base32 aleatorios, únicos por necesidad. El contrato admite 8–64 | F6 |
| V15 | Semántica de eliminación | Borrar el usuario de Auth y su perfil. Las invitaciones se anonimizan (`donor_id NULL`) y se conservan los conteos. El historial de respuestas se borra. Entrada en el ledger con HMAC del id | F7 |
| V16 | Contenido legal | Sin endpoint de gestión: se versiona por migración SQL, con revisor y fecha. Mientras esté en `borrador`, se muestra el aviso neutral | F8 |
| V17 | Coordenadas e instrucciones de sede | Cambio de contrato C-3 | F2a |
| V18 | Vigencias de token no fijadas | Verificación de email 24 h. Invitación de admin 72 h. Recuperación 1 h (ya fijado en PA) | F2b/F5 |
| V19 | `X-Contextual-Grant` | La cabecera lleva el `grantId`, ligado en la BD a superadmin, solicitud, acción, campos y expiración | F7 |
| V20 | Interpretación de `listSuperadminTasks` | `correction_request` = solicitudes `pendiente`; `hospital_review` = sedes con `isApproved=false`; `recognition_policy` = políticas `publicada`; `delivery_failure` = invitaciones con entrega `fallida` (si se adopta C-4) | F2a |

---

## 3. Bloque A: correcciones de la revisión de U2–U7c (hacer primero)

Cada punto es un commit Conventional con su prueba. Origen: la revisión de
2026-10-12 sobre `90c203a..cd8d2b3`.

### A1. Mensajes de error alineados con el contrato

- **Archivo:** `backend/src/shared/http/errors.ts`, constante `DEFAULT_MESSAGES`.
- **Cambio:**
  - `INTERNAL_ERROR` → `"No se pudo completar la solicitud."`
  - `RATE_LIMITED` → `"Intenta nuevamente más tarde."`
  - `SERVICE_UNAVAILABLE` → `"El servicio no está listo para aceptar solicitudes."`
- **Por qué:** el contrato (`docs/openapi.json` →
  `components.responses.*.content["application/json"].example`) y BC:210 fijan
  esos mensajes. Los demás ya coinciden.
- **Prueba:** nueva prueba de paridad en `backend/src/shared/http/errors.test.ts`.
  Lee `docs/openapi.json` con `fs`, recorre las 10 respuestas
  (BadRequest…ServiceUnavailable) y comprueba que `code` y `message` de cada
  ejemplo coinciden con `toPublicError(new ApiError(code), 'x')`.

### A2. Errores de body-parser 4xx → 400

- **Archivo:** `errors.ts`, función `fromBodyParserError`.
- **Cambio:** clasificar como `BAD_REQUEST` cualquier error que tenga `type`
  string **y** `status` entero entre 400 y 499. Cubre `entity.parse.failed`,
  `entity.too.large`, `encoding.unsupported`, `charset.unsupported`,
  `request.aborted`, `request.size.invalid` y `parameters.too.many`. Esos casos
  **no** llaman a `onUnexpected`.
- **Por qué:** reproducido el 2026-10-12. Con `Content-Encoding: br-x` hoy se
  responde 500 `INTERNAL_ERROR` y queda registrado como `peticion.fallida`.
- **Prueba:** en `errors.test.ts`:
  - `Content-Encoding: br-x` → 400;
  - `Content-Type: application/json; charset=latin1` → 400;
  - body de 17 KB → 400;
  - JSON roto → 400;
  - en ninguno aparece `peticion.fallida` en el log falso.

### A3. `TRUSTED_PROXIES` por saltos o CIDR (V3)

- **Archivos:** `backend/src/config/env.ts`, `backend/src/app.ts` y `backend/.env.example`.
- **Cambio:**
  - Formas aceptadas:
    - vacío → `false`, no se confía en ningún proxy;
    - entero `1`–`5` → número de saltos;
    - lista separada por comas de IP o CIDR (`10.0.0.0/8`, `::1/128`).
  - Validar la IP con `isIP` y el prefijo (≤32 en IPv4, ≤128 en IPv6).
  - Tipo: `AppConfig.trustedProxies: false | number | readonly string[]`. Se
    pasa tal cual a `app.set('trust proxy', …)`.
- **Prueba:** casos en `env.test.ts`:

  | Valor | Resultado |
  | --- | --- |
  | `1` | ok |
  | `0` | error |
  | `6` | error |
  | `10.0.0.0/8` | ok |
  | `10.0.0.0/33` | error |
  | `abc` | error |

  En `app.test.ts`: con 1 salto y `X-Forwarded-For: 203.0.113.7`, `req.ip`
  devuelve `203.0.113.7`.

### A4. Errores cuando las cabeceras ya se enviaron

- **Archivo:** `errors.ts`, función `createErrorHandler`.
- **Cambio:** si `res.headersSent`:
  1. llamar a `onUnexpected(error, correlationId)`;
  2. ejecutar `req.socket.destroy()`.

  No usar `next(error)`: el manejador final de Express imprime el stack en
  stderr y se salta OBS-01.
- **Prueba:** una ruta que hace `res.write('x')` y luego lanza un error. El log
  recoge exactamente un `peticion.fallida` y no se escribe nada en stderr
  (capturarlo con un spy).

### A5. Cabeceras de seguridad

- **Archivo nuevo:** `backend/src/shared/http/security-headers.ts`, exporta
  `securityHeaders`. Se monta primero en `createApp`. Además, `app.set('etag', false)`.
- **Cabeceras:**

  | Cabecera | Valor |
  | --- | --- |
  | `X-Content-Type-Options` | `nosniff` |
  | `X-Frame-Options` | `DENY` |
  | `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` |
  | `Referrer-Policy` | `no-referrer` |
  | `Cache-Control` | `no-store` |
  | `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |

- **Prueba:** en `app.test.ts`, un 404 trae todas.

### A6. Robustez del proceso

- **Archivo:** `backend/src/server.ts`.
- **Cambio:**
  - `process.on('unhandledRejection')` y `process.on('uncaughtException')`
    registran `proceso.error_no_controlado`, sin mensaje ni stack, y hacen
    `process.exit(1)`.
  - En SIGTERM/SIGINT, `server.close()` con un temporizador de 10 s
    (`unref()`) que hace `exit(1)` si vence.
- **Prueba:** humo manual (`npm run dev:backend` y Ctrl+C).

### A7. Keyring del outbox (antes de que exista nada cifrado)

- **Archivos:** `backend/src/shared/crypto/outbox-cipher.ts`, `env.ts` y `.env.example`.
- **Cambio:**
  - Formato `v1.<kid>.<iv>.<tag>.<ct>`, con `kid` `^[a-z0-9]{1,16}$`.
  - Tipo `OutboxKeyring = Readonly<{ currentKid: string; keys: ReadonlyMap<string, Buffer> }>`.
  - `sealPayload(keyring, plaintext, context)` cifra con la clave actual.
  - `openPayload(keyring, sealed, context)` busca la clave por `kid`.
  - Variables `OUTBOX_KEYS=kid:base64,kid2:base64` (32 bytes cada una, base64
    canónico) y `OUTBOX_KEY_CURRENT=kid`, que sustituyen a `OUTBOX_KEY`.
- **Prueba:**
  - cifrar con k1, cambiar la actual a k2 y abrir el payload antiguo;
  - `kid` desconocido → `SealedPayloadError`;
  - `OUTBOX_KEY_CURRENT` fuera del keyring → `ConfigError`.

### A8. Documentación desactualizada

- `docs/Backend-Contracts.md:14-15` y `:52-56`: quitar "el scaffold legacy
  `backend/index.js`/`backend/config/` se conserva". Describir que
  `backend/src/server.ts` + `createApp` son el punto de entrada y que todavía
  no hay rutas.
- `CLAUDE.md`:
  - sección *Legacy*: dejar solo `frontend/`, pendiente de borrar;
  - sección *backend*: mencionar `src/app.ts`, `src/server.ts`,
    `shared/*` y `npm run dev:backend`.

### A9. Nombre de prueba obsoleto

`scripts/generate-api-contract.test.mjs:360` → renombrar a
`backend package: wires DTO tests and TypeScript entrypoint scripts`.

### A10. Versionar el plan maestro

`docs/plans/2026-10-12-plan-maestro-backend-ocho-capacidades.md` está enlazado
desde el commit `cd8d2b3`, pero no está versionado. Va en un commit
`docs(backend): add master backend plan` junto con este documento.

### A11. Registrar la revisión y lanzar la de seguridad

- Añadir a la bitácora de `docs/plans/HISTORIAL.md`:
  - la revisión equivale a `reviewer-back` para U2–U7c;
  - los hallazgos A1–A9 están resueltos;
  - la sesión de ejecución omitió los subagentes, aunque D-1 los exigía.
- Lanzar un subagente con el rol `.opencode/agent/security-privacy-auditor.md`
  sobre U2–U7c + A1–A7.

---

## 4. Bloque C: F0 pendiente (documentos, contrato y generador)

### C1. Gobierno de agentes

Afecta a `AGENTS.md`, `docs/Agent-Workflow.md` y `CLAUDE.md`. Los dos
primeros tienen cambios tuyos sin commit: necesita tu aprobación.

- Añadir el harness **Claude Code**:
  - la delegación usa la herramienta `Agent`;
  - el prompt del revisor = contenido de `.opencode/agent/<id>.md` + alcance + diff o rutas.
- El PASS de un subagente que **no** escribió el artefacto cuenta como gate.
- Tú apruebas el cierre de cada módulo.
- En `CLAUDE.md`, sustituir "list required independent reviews as pending"
  por la regla anterior.

### C2. ADR-001

- Consolidar la línea "Usar Typescript para el backend y frontend" (hoy en el
  working tree).
- Indicar que los valores de email (RF-EML-01..04) ya están fijados en la
  línea base v1.2. La ERS dice que ADR-001 los lista como pendientes.

### C3. ADR-003 → Aceptado

Registrar:

- V2 = INVOKER;
- la allowlist DEFINER de §2.2;
- el rol `app_privileged`;
- `[api] schemas = ["api"]`;
- la convención de respuesta de las RPC (§5.2, "Convención");
- la fórmula del hash canónico en SQL (F3).

### C4. ADR-004 nuevo: sesión, CSRF, CORS y topología

- Cookies `__Host-sal_at` (access token) y `__Host-sal_rt` (refresh token),
  ambas `HttpOnly; Secure; SameSite=Lax; Path=/`.
  - `Max-Age` del access = `expires_in` de Supabase.
  - `Max-Age` del refresh según V4.
- CSRF = `nonce.HMAC(CSRF_SECRET, JSON.stringify([session_id, nonce]))`, ya
  implementado en `shared/crypto/csrf.ts`.
  - Se emite en `GET /api/v1/auth/csrf-token`.
  - Se exige en `X-CSRF-Token` en toda mutación con cookie, junto con un
    `Origin` **obligatorio** que esté en la allowlist.
- Refresh transparente en el servidor (§5.5).
- Step-up = el claim `amr` contiene `method: 'totp'` con
  `timestamp ≥ now − 300 s`.
- Topología V3 y `trust proxy` por saltos en Render.
- CORS: no hace falta en producción (mismo origen). En desarrollo, el proxy de
  Vite.

### C5. ADR-005 nuevo: email, outbox y worker

- Resend vía `fetch` (sin SDK) con la cabecera `Idempotency-Key`, más un
  adaptador falso.
- Outbox cifrado con el keyring (A7).
- Tokens y payloads generados en la aplicación (§6.F2b y §6.F6). La clave
  nunca entra en la BD.
- Worker con identidad V13.
- AP-02/06/08 según V5 y V7.
- Webhook firmado al estilo Svix (C-1).

### C6. ADR-006 nuevo: allowlist de `service_role`

- Solo `backend/src/modules/identity-institutions/infrastructure/supabase-auth-admin.ts`,
  con 4 métodos (§5.5).
- Variable `SUPABASE_SERVICE_ROLE_KEY`.
- Una prueba estática impide usarla en otros archivos.

### C7. Sincronizar requisitos

Bloquea perfil, matching, auth y retención según PA §6.

En `.opencode/references/project-requirements.md`:

| Línea | Corrección |
| --- | --- |
| P:42-43 | El grupo declarado cambia solo mediante solicitud (RF-PRO-01/02) |
| P:51 | La respuesta se puede alternar (RF-INV-04) |
| P:16 | El superadmin invita a los admins; no se precargan (RF-IAM-05) |
| P:140-152 | Versiones fijadas por ADR-002. Los valores de email, la precisión de 3 decimales y la purga de 30 días ya están en v1.2 |

`Save_a_Life.xlsx` es binario: lo actualizas tú en las mismas filas.

### C8. Cambios en `docs/openapi.json`

Cada cambio se ratifica junto con su módulo. Secuencia obligatoria tras
editar: `npm run openapi:lint` → `npm run openapi:types` →
`npm run test:contract` → `npm run test:bruno`.

| # | Cambio | Módulo |
| --- | --- | --- |
| C-1 | Webhook de Resend (detalle bajo la tabla) | F4 |
| C-2 | Enrolamiento MFA (detalle bajo la tabla) | F2a |
| C-3 | Sede: coordenadas e instrucciones (detalle bajo la tabla) | F2a |
| C-4 | Reintento manual de entrega (detalle bajo la tabla) | F6 |
| C-5 | `components.securitySchemes.sessionCookie.name` = `__Host-sal_at`. Quitar `x-pending-sprint0` de `sessionCookie` y `csrfToken` cuando se acepte ADR-004 | F2a |
| C-6 | Códigos 403 específicos: `MFA_REQUIRED` (sin AAL2) y `STEP_UP_REQUIRED` (step-up ausente o vencido), con el mensaje genérico de 403. Política suspendida → 409 `STATE_CONFLICT`. Documentarlo en `docs/Api-Rules.md` | F2a |
| C-7 | `X-Contextual-Grant`: descripción "lleva el `grantId` devuelto por `createContextualAccessGrant`" (V19) | F7 |
| C-8 | `transitionOwnHospitalNeed`: documentar la matriz manual (detalle bajo la tabla) | F3 |
| C-9 | Añadir `x-ratification: {status:'ratified-for-implementation', date:'YYYY-MM-DD'}` a cada operación cuando se vote su módulo | Todos |
| C-10 | En `bruno/scenarios/hospital/05_create_need.bru` y `08_replay_create_need.bru`, cambiar el `Idempotency-Key` literal `55555555-…` por `{{idempotencyKey}}-create` en ambos | F3 |
| C-11 | `createHospitalSite` y `updateHospitalSite`: añadir 422 a sus respuestas | F2a |
| C-12 | `verifyDonorEmail`: quitar `Set-Cookie` del 200 (detalle bajo la tabla) | F5 |

**Detalle de C-1 (webhook de Resend).**

- `POST /api/v1/email-delivery/webhooks/resend`, `operationId receiveResendWebhook`, `security: []`.
- Cabeceras requeridas: `svix-id`, `svix-timestamp` y `svix-signature`.
- Body: objeto abierto `{type, created_at, data:{email_id}}`.
- Respuestas: 204; 400; 401 (firma inválida o `timestamp` con más de 300 s de diferencia); 500.
- Sin `Idempotency-Key`: se deduplica por `svix-id`.

**Detalle de C-2 (enrolamiento MFA).**

- `POST /api/v1/auth/mfa-enrollments`, `operationId enrollMfaFactor`.
- Seguridad cookie + CSRF, con `Idempotency-Key`. Sin body.
- 201: `data:{factorId:uuid, otpauthUri:string(format uri), challengeId:uuid}`, con `Cache-Control: no-store`.
- Errores: 401; 403 (donante); 409 (ya hay un factor verificado); 429; 500.
- Se completa con `verifyMfaChallenge{challengeId, code}`.

**Detalle de C-3 (sede).**

- `createHospitalSite` exige `coordinates:{latitude:-90..90, longitude:-180..180}` (`multipleOf 0.000001`) y admite `publicInstructions?` (0..1000).
- `updateHospitalSite` admite ambos campos como opcionales.
- `Site` los devuelve.
- Las `instructions` que ve el donante salen de `publicInstructions`, o de un texto neutral fijo si es null.
- **Por qué:** Haversine necesita coordenadas de la sede (PA:457) y las instrucciones no tienen origen definido (PA:353).

**Detalle de C-4 (reintento manual de entrega, V5).**

- `POST /api/v1/superadmin/invitations/{invitationId}/delivery-retries`, `operationId retryInvitationDelivery`.
- Cookie + CSRF, `Idempotency-Key`, AAL2 y step-up.
- 202 `NeutralMessage`. Errores: 401, 403, 404, 409 y 410.
- Añadir `delivery_failure` al enum `SuperadminTask.kind`.

**Detalle de C-8 (matriz manual de transición).**

- `borrador → activa | cancelada`.
- `activa → cerrada | cancelada`.
- `meta_alcanzada → cerrada | cancelada`.
- Los estados terminales no se reabren.
- `meta_alcanzada` y `vencida` no se pueden asignar desde el cliente.

**Detalle de C-12 (`verifyDonorEmail`).**

- Quitar `Set-Cookie` del 200. La web pide login después.
- **Por qué:** emitir una sesión sin contraseña exigiría ampliar la allowlist de `service_role`.
- `claimAssistedRegistration` y `claimHospitalAdminInvitation` conservan `Set-Cookie`, porque reciben la contraseña.

### C9. Generador y validador genérico

El detalle técnico está en el **Anexo D**.

**Resumen**

- Se mantienen intactos los 4 artefactos actuales (`createHospitalNeed`).
- Se añaden 2 artefactos:
  - `backend/src/contract/openapi.ts`: tipos del spec completo;
  - `backend/src/contract/ratified-schemas.generated.json`: JSON Schema de
    todas las operaciones con `x-ratification`.
- Nuevo validador `backend/src/shared/validation/contract-validator.ts`.

---

## 5. Bloque D: plataforma (resto de F1)

Requiere V10 y la ratificación de `getLiveness` y `getReadiness`.

### 5.1 Supabase local en `backend/supabase/`

- **Creación:** `supabase init --workdir backend`. Genera `backend/supabase/config.toml`.
- **`.gitignore`:** añadir `backend/supabase/.temp/`, `backend/supabase/.branches/` y `backend/.local/`.
- **`config.toml`.** Verificar con Context7 (`/supabase/supabase`) el nombre exacto de cada clave antes de escribirla.

  | Sección | Claves |
  | --- | --- |
  | `[api]` | `schemas = ["api"]`, `extra_search_path = ["extensions"]`, `max_rows = 100` |
  | `[auth]` | `site_url = "http://127.0.0.1:5173"`, `jwt_expiry = 600` (V4), `enable_refresh_token_rotation = true`, `refresh_token_reuse_interval = 10`, `enable_signup = true` |
  | `[auth.email]` | `enable_confirmations = false`: Supabase no envía correos; todos salen por nuestro outbox. La verificación de email es nuestra (F5) |
  | `[auth.sessions]` | `inactivity_timeout = "12h"` (V4) |
  | `[auth.mfa]` | `max_enrolled_factors = 1` |
  | `[auth.mfa.totp]` | `enroll_enabled = true`, `verify_enabled = true` |

- **Arranque:** `supabase start --workdir backend` (requiere Docker). No se
  configura ningún autostart ni servicio global.

### 5.2 Migración base `backend/supabase/migrations/20261013000000_platform_base.sql`

Las migraciones se nombran `YYYYMMDDHHMMSS_<capacidad>_<descripcion>.sql`.
Cada una termina con `insert into app.schema_version(version) values ('<timestamp>');`.

**Extensiones, esquemas y roles**

```sql
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext   with schema extensions;
create schema app;
create schema api;
revoke all on schema app, api from public, anon, authenticated;
grant usage on schema api to anon, authenticated;
grant usage on schema app to authenticated;
alter default privileges in schema api revoke execute on functions from public;
create role app_privileged nologin nobypassrls;
grant usage on schema app to app_privileged;
```

**Tipos**

- `app.actor_role` = enum `donante`, `admin_hospitalario`, `superadmin`, `worker`.
- `worker` no existe en el contrato: nunca se proyecta hacia la API.

**Tablas** (todas con `alter table … enable row level security; alter table … force row level security;`)

| Tabla | Columnas | Acceso |
| --- | --- | --- |
| `app.user_accounts` | `user_id uuid pk references auth.users(id) on delete cascade`, `role app.actor_role not null`, `display_name text check (char_length(display_name) between 1 and 120)`, `created_at timestamptz not null default now()` | `select` del propio registro. Sin `insert`/`update` para `authenticated`: solo DEFINER de vinculación |
| `app.configuration` | `id boolean pk default true check (id)`, `final_demo_at timestamptz` | Fila semilla. Trigger `BEFORE UPDATE`: si `OLD.final_demo_at is not null` → `raise exception`. `select` superadmin |
| `app.audit_events` | `event_id uuid pk default gen_random_uuid()`, `actor_id uuid`, `actor_kind text check in ('usuario','token','worker','sistema')`, `event text check (event ~ '^[a-z0-9_.]{1,100}$')`, `resource_type text`, `resource_id uuid`, `result text check in ('ok','denegado','fallido')`, `reason text check (char_length(reason) <= 300)`, `occurred_at timestamptz not null default now()` | Índice `(occurred_at, event_id)`. `insert` para `authenticated` (RLS `actor_id = auth.uid()`). `select` solo superadmin. Trigger que lanza error en `UPDATE`/`DELETE`. **Nunca** guarda body, valores PII, clave ni hash |
| `app.idempotency_records` | `actor_ref text` (`user:<uuid>` \| `token:<sha256>` \| `email:<hmac>`), `operation text`, `idem_key text check (char_length(idem_key) between 16 and 255)`, `payload_hash text check (payload_hash ~ '^[0-9a-f]{64}$')`, `status text check in ('en_curso','completado')`, `response jsonb`, `created_at timestamptz default now()`, `completed_at timestamptz`, `terminal_at timestamptz`, `primary key (actor_ref, operation, idem_key)` | RLS `authenticated`: `actor_ref = 'user:' \|\| auth.uid()::text`. Los demás `actor_ref`, solo vía DEFINER |
| `app.rate_limit_events` | `bucket text`, `subject text check (subject ~ '^[0-9a-f]{64}$')`, `occurred_at timestamptz default now()` | Índice `(bucket, subject, occurred_at)`. Solo DEFINER |
| `app.schema_version` | `version text pk` | Solo DEFINER (`api.readiness`) |

**Helpers internos** (`app.*`, INVOKER, `stable`, `set search_path = ''`)

- `app.current_user_id()` → `auth.uid()`.
- `app.current_aal()` → `auth.jwt()->>'aal'`.
- `app.current_role()` → rol de `app.user_accounts` del usuario actual.
- `app.step_up_fresh(max_age interval)` → existe un elemento de `auth.jwt()->'amr'` con `method = 'totp'` y `timestamp >= extract(epoch from now() - max_age)`. Verificar con Context7 el formato de `amr` en Supabase.
- `app.require(p_roles app.actor_role[], p_aal2 boolean, p_step_up boolean) returns text`:
  - `null` si se cumple todo;
  - si no, en este orden: `'unauthenticated'`, `'forbidden'` (rol), `'mfa_required'`, `'step_up_required'`.
- `app.claim_idempotency(p_actor_ref, p_operation, p_key, p_hash) returns jsonb`:
  1. `SET LOCAL lock_timeout = '2s'`.
  2. `insert … values (…, 'en_curso') on conflict do nothing`.
  3. Si no hubo conflicto → `null`.
  4. Si lo hubo y el hash difiere → `{"kind":"payload_conflict"}`.
  5. Si lo hubo con el mismo hash y `completado` → `{"kind":"replayed","response":<jsonb>}`.
  6. Si el bloqueo excede el timeout (`lock_not_available`) → `{"kind":"in_progress"}`.
- `app.complete_idempotency(p_actor_ref, p_operation, p_key, p_response jsonb)` → `status = 'completado'`, `completed_at = now()`.
- `app.write_audit(p_event, p_resource_type, p_resource_id, p_result, p_reason)`.

**API base**

- **`api.consume_rate_limit(p_bucket text, p_subject text, p_limit int, p_window interval) returns jsonb`**, con forma `{"allowed":bool,"retryAfterSeconds":int}`.
  - DEFINER #1. `grant execute … to anon, authenticated`.
  - Pasos:
    1. `pg_advisory_xact_lock(hashtextextended(p_bucket || ':' || p_subject, 0))`.
    2. `delete` de los eventos de esa clave con `occurred_at <= now() - p_window`.
    3. `count`.
    4. Si `count < p_limit`: `insert` y `allowed = true`.
    5. Si no: `retryAfterSeconds` = segundos hasta que caduque el evento más antiguo.
  - `subject` es un HMAC de servidor (`EMAIL_HMAC_SECRET`) de la IP o del email. Quien llame directamente con la anon key no puede apuntar a una víctima.
- **`api.readiness() returns text`**: DEFINER #2 (`anon`). Devuelve `max(version)` de `app.schema_version`.

**Convención: respuesta de toda RPC con efectos** (se registra en ADR-003)

- **Forma.** Devuelve `jsonb` con uno de estos valores:
  - `{"kind":"created"|"replayed"|"ok", …proyección}`;
  - `{"kind":"<fallo>"}`, con `<fallo>` ∈ `unauthenticated`, `forbidden`,
    `mfa_required`, `step_up_required`, `not_found`, `conflict`,
    `payload_conflict`, `in_progress`, `gone`, `invalid`, más los fallos
    propios de cada operación (por ejemplo `site_unusable`).
- **Orden.** Las validaciones y rechazos ocurren **antes** de escribir. Cada
  `raise` es un fallo interno y provoca rollback automático (una RPC = una
  transacción).
- **Lado TypeScript.** El adaptador valida el `jsonb` con guards cerrados y
  nunca reenvía mensajes, SQLSTATE ni detalles de PostgreSQL.

**pgTAP** (`backend/supabase/tests/database/00_platform.test.sql`)

- `anon` no tiene `USAGE` en `app`.
- `authenticated` no puede hacer `update` ni `delete` en `audit_events`.
- `final_demo_at` no cambia una vez fijado.
- Rate limit: el intento 10 pasa y el 11 bloquea.
- Las 3 ramas de `claim_idempotency`.
- Ninguna función de `api` con `prosecdef = true` pertenece a `postgres`.
- Simulación de usuario: `set local role authenticated; set local request.jwt.claims = '{"sub":"…","role":"authenticated","aal":"aal2","amr":[{"method":"totp","timestamp":…}]}';`.

### 5.3 Persistencia: `backend/src/shared/persistence/`

| Archivo | Contenido |
| --- | --- |
| `supabase-client.ts` | `createSupabaseFactory(config)` → `{ forUser(accessToken), anonymous() }`. Usa `createClient(url, anonKey, { auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false }, db:{ schema:'api' }, global:{ headers:{ Authorization:`Bearer ${jwt}` } } })`. **Un cliente por petición**: nunca un cliente global con sesión mutable |
| `rpc.ts` | `callRpc(client, name, args): Promise<unknown>`. Si la red falla, PostgREST responde 5xx o hay timeout (5 s por defecto) → `PersistenceUnavailableError`. Cualquier otro error → `PersistenceError`. Ninguno incluye el mensaje del proveedor |
| `rpc-reply.ts` | `parseRpcReply(value: unknown, allowedKinds)`: objeto plano con propio prototipo `Object.prototype`, sin claves extra, `kind` dentro de la allowlist. Si no, lanza. `mapFailureToApiError(kind)` (tabla bajo esta) |
| `cursor.ts` | `encodeCursor(scope, {createdAt, id}, secret)` / `decodeCursor`. Base64url de `JSON + HMAC`, ligado al ámbito (actor u hospital y operación). Máximo 512 caracteres. Uno manipulado → 400 |
| `schema-version.ts` | `EXPECTED_SCHEMA_VERSION`. Una prueba compara su valor con el último archivo de `backend/supabase/migrations/` |

Mapeo de `mapFailureToApiError(kind)`:

| Fallo | Respuesta |
| --- | --- |
| `unauthenticated` | 401 |
| `forbidden` | 403 |
| `mfa_required` | 403 `MFA_REQUIRED` |
| `step_up_required` | 403 `STEP_UP_REQUIRED` |
| `not_found` | 404 |
| `conflict`, `payload_conflict`, `in_progress` | 409 `STATE_CONFLICT` |
| `gone` | 410 |
| `invalid` | 422 |
| Cualquier otro | 500 |

Las pruebas inyectan un `fetch` falso con `createClient(…, { global:{ fetch } })`.

### 5.4 HTTP compartido (añadidos)

| Archivo | Contenido |
| --- | --- |
| `shared/http/cookies.ts` | `parseCookies(header)`: primera ocurrencia; ignora nombres fuera de `[A-Za-z0-9_-]` y valores con comillas o `;`. `serializeCookie(name, value, {maxAge, httpOnly, secure, sameSite, path})`. Constantes `ACCESS_COOKIE = '__Host-sal_at'` y `REFRESH_COOKIE = '__Host-sal_rt'`. Sin dependencia nueva |
| `shared/http/csrf-guard.ts` | `requireCsrf(secret, allowedOrigins)`: exige `Origin` presente y en la allowlist, y que `X-CSRF-Token` verifique con `verifyCsrfToken(secret, principal.sessionId, token)`. Si falla → 403 `ACCESS_DENIED` |
| `shared/http/idempotency.ts` | `requireIdempotencyKey(req)` → string, o lanza `ApiError('BAD_REQUEST')`; usa `parseIdempotencyKey`. `fingerprint(fields: readonly (readonly [string, unknown])[])` → SHA-256 hex de un JSON compacto con el **orden dado**. Generaliza `fingerprintNeedDraftInput` (spec A2 §4) |
| `shared/http/respond.ts` | `sendData(res, status, data)` → `{data}`; `sendNoContent(res)` → 204 |
| `shared/http/client-ip.ts` | `clientIpSubject(req, secret)` → HMAC de `req.ip`, para el rate limit |
| `app.ts` | Nuevo hook `mountBeforeJson?: (app) => void`, que se ejecuta antes de `express.json` (para el body crudo del webhook). `mount` se mantiene |

### 5.5 Autenticación: `backend/src/shared/auth/`

**`principal.ts`**

```ts
export type Principal = Readonly<{
  userId: string;
  sessionId: string;
  aal: 'aal1' | 'aal2';
  amr: readonly Readonly<{ method: string; timestamp: number }>[];
  accessToken: string;
  role: 'donante' | 'admin_hospitalario' | 'superadmin';
  displayName: string;
  hospital: Readonly<{ hospitalId: string; hospitalName: string; membershipActive: boolean; hospitalAuthorized: boolean }> | null;
}>;
```

**`supabase-session.ts`** (adaptador de Supabase Auth con la **anon key**)

- Métodos: `signIn(email, password)`, `signUp(email, password)`,
  `refresh(refreshToken)`, `signOut(accessToken)`, `getClaims(accessToken)`,
  `listFactors(session)`, `enrollTotp(session)`, `challenge(session, factorId)`,
  `verify(session, factorId, challengeId, code)` y
  `challengeAndVerify(session, factorId, code)`.
- Para MFA usa un cliente efímero con `auth.setSession({access_token, refresh_token})`.
- Verificar con Context7 las firmas de `@supabase/supabase-js@2.117.1`:
  `auth.getClaims`, `auth.mfa.enroll` / `challenge` / `verify` /
  `challengeAndVerify` / `listFactors`, y el formato de `amr` en el JWT.

**`authenticate.ts`** (middleware que se monta para `/api`)

1. Lee `__Host-sal_at` y `__Host-sal_rt`.
2. `getClaims(at)`. Si es válido, sigue.
3. Si falta, es inválido o venció **y** hay refresh: llama a `refresh(rt)`,
   reescribe ambas cookies y continúa con el token nuevo. Si el refresh falla,
   expira ambas cookies y no hay principal.
4. Con el cliente del usuario llama a `api.current_actor()` **en cada
   petición** (SEC-07): rol, nombre visible y membresía.
5. Si no hay `user_accounts` → sin principal.
6. Guarda el resultado en `res.locals.principal`.

**`guards.ts`** (además de los checks en SQL, como defensa doble)

| Guard | Fallo |
| --- | --- |
| `requireSession` | 401 `AUTHENTICATION_REQUIRED` |
| `requireRole(...roles)` | 403 `ACCESS_DENIED` |
| `requireAal2` | 403 `MFA_REQUIRED` |
| `requireStepUp(maxAgeSeconds = 300)` | 403 `STEP_UP_REQUIRED` |
| `requireActiveMembership` | 403 si la membresía no está activa o el hospital no está autorizado |

**`auth-admin.port.ts`** y su adaptador allowlisted (V-Auth / C6)

```ts
export interface AuthAdmin {
  updatePassword(userId: string, password: string): Promise<void>;
  updateEmail(userId: string, email: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  revokeAllSessions(userId: string): Promise<void>;
}
```

- **Adaptador:** `backend/src/modules/identity-institutions/infrastructure/supabase-auth-admin.ts`, con `createClient(url, serviceRoleKey, {auth:{persistSession:false}})`.
- **`revokeAllSessions`:** verificar con Context7 si Supabase Auth Admin tiene
  un endpoint de revocación por usuario.
  - Si no lo tiene: función DEFINER `api.worker_revoke_sessions(p_user_id)` que
    borra `auth.sessions` del usuario. Solo la invoca el adaptador y exige
    revisión de seguridad.
  - Los access JWT emitidos siguen siendo válidos hasta que expiran (≤600 s, V4).
  - SEC-07 lo mitiga: en cada petición se vuelve a resolver el actor.
- **Prueba estática** `backend/src/shared/auth/service-role-allowlist.test.ts`:
  recorre `backend/src/**/*.ts` y falla si `serviceRoleKey` aparece fuera de
  `config/env.ts`, `composition.ts` y el adaptador.

**Variables nuevas en `backend/src/config/env.ts`** (y en `.env.example`, solo los nombres)

| Variable | Regla |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Requerida y distinta de la anon key |
| `WORKER_EMAIL`, `WORKER_PASSWORD` | Requeridas en `worker.ts` y en la ruta del webhook |
| `RESEND_WEBHOOK_SECRET` | Formato `whsec_<base64>`, requerida si `EMAIL_PROVIDER=resend` |
| `EMAIL_FROM` | Email válido |
| `APP_PUBLIC_URL` | Base de los enlaces de correo. https, o http solo con localhost |
| `CURSOR_SECRET` | ≥32 caracteres y distinta de las otras |
| `WORKER_POLL_MS` | Entero 1000–60000, por defecto 5000 |

### 5.6 Health: `backend/src/modules/platform/http/health.router.ts`

- `GET /health/live` → 200 `{"data":{"status":"ok"}}`. Sin dependencias ni red.
- `GET /health/ready`:
  - llama a `api.readiness()` con el cliente anónimo y timeout de 2 s;
  - si la versión es igual a `EXPECTED_SCHEMA_VERSION` → 200 `{"data":{"status":"ready"}}`;
  - en cualquier otro caso → 503 `SERVICE_UNAVAILABLE`, sin detalle.
- **Pruebas:** unitarias con un gateway falso (ok, versión distinta, timeout).
  Integración contra Supabase local.

### 5.7 Composición

- Nuevo `backend/src/composition.ts`.
  - Exporta `buildApplication(config, logger)`.
  - Crea la fábrica de Supabase, `AuthAdmin`, `EmailSender` (falso o Resend
    según `EMAIL_PROVIDER`), el reloj y el keyring.
  - Devuelve `{ mountBeforeJson, mount }`:
    - `mountBeforeJson` registra el webhook;
    - `mount` registra `authenticate` y llama a `register<Modulo>Routes(app, deps)` de cada módulo.
- `server.ts` pasa ambos hooks a `createApp`.
- Sin barrels ni singletons de sesión.

### 5.8 Infraestructura de pruebas reales

**Vitest de integración**

- `backend/vitest.integration.config.ts` incluye `test/integration/**/*.integration.ts`.
- Esa extensión no coincide con el patrón por defecto, así que `vitest run`
  unitario la ignora.

**Utilidades** (`backend/test/support/`)

| Archivo | Contenido |
| --- | --- |
| `totp.ts` | RFC 6238 con `node:crypto` |
| `users.ts` | Login, MFA, CSRF y cookies para cada usuario semilla |
| `http.ts` | Servidor efímero, mismo patrón `serve()` de `backend/src/app.test.ts:20-37` |
| `db.ts` | Helpers SQL vía `supabase db` o psql local |

**`scripts/test-backend-integration.mjs`**

1. Ejecuta `supabase status --workdir backend -o json`. Si no está levantado,
   falla con instrucciones y **no** lo arranca.
2. `supabase db reset --workdir backend`.
3. `node backend/scripts/seed-auth-local.mjs`.
4. `vitest run -c backend/vitest.integration.config.ts` con las variables de `status`.

**`backend/scripts/seed-auth-local.mjs`**

- Se niega a correr si `SUPABASE_URL` no es `127.0.0.1` o `localhost`.
- Usa la service key **local** que da `supabase status`.
- Crea los usuarios sintéticos `*.example.test`:
  - 1 superadmin;
  - 3 admins, uno por hospital semilla;
  - 6 donantes (2 activos y compatibles, 1 no disponible, 1 incompleto, 1 sin verificar, 1 fuera de radio);
  - el usuario `worker`.
- Inserta sus filas `app.*` con UUID fijos.
- Enrola TOTP para el superadmin y los admins: inicia sesión → `enroll` → `challengeAndVerify` con el código calculado.
- Guarda los secretos TOTP en `backend/.local/totp-secrets.json` (ignorado por git).

**`backend/supabase/seed.sql`**

- Solo datos `app.*` que no son de Auth:
  - 3 hospitales autorizados;
  - sus sedes, con coordenadas reales de Lima con 6 decimales, una inactiva y una no aprobada;
  - la configuración vacía.
- UUID fijos, reutilizados por Bruno.

**Scripts raíz**

- `test:backend:db` = `supabase test db --workdir backend`.
- `test:backend:integration` = `node scripts/test-backend-integration.mjs`.

### 5.9 Bruno contra el backend real

**Entorno nuevo** `bruno/environments/local-backend.bru`:

- `baseUrl = http://127.0.0.1:3000`
- `appOrigin = http://127.0.0.1:5173`
- `demoPassword` y los emails semilla
- `demoSiteId`, `demoNeedId` y `demoInvitationId` con los UUID de la semilla

**Runner nuevo** `scripts/test-bruno-backend.mjs`, que replica `scripts/test-bruno.mjs`:

- Mismos flags: `--tests-only --reporter-skip-all-headers --reporter-skip-body`
  e `idempotencyKey` por carpeta.
- En lugar de `/__mock/reset`, ejecuta `supabase db reset --workdir backend` + `seed-auth-local.mjs`.
- Arranca `backend` con las variables de `supabase status` y
  `ALLOWED_ORIGINS=http://127.0.0.1:5173`, y espera a `/health/live`.
- Antes de cada carpeta calcula `mfaCode` con TOTP (si quedan menos de 10 s
  en la ventana de 30 s, espera a la siguiente) y lo pasa con
  `--env-var mfaCode=…`.

**Paso MFA**

- Nuevos `bruno/scenarios/hospital/01b_mfa.bru` y `bruno/scenarios/superadmin/01b_mfa.bru`:
  `POST /api/v1/auth/mfa-verifications` con `{challengeId: {{mfaChallengeId}}, code: {{mfaCode}}}`.
- Pre-request `if (!bru.getVar("mfaChallengeId")) { bru.runner.skipRequest(); }`,
  para que con el mock se salte. Verificar `bru.runner.skipRequest` en Bruno 4.2.
- `01_login.bru` guarda `mfaChallengeId` si viene en la respuesta.

**Script raíz:** `test:bruno:backend`.

---

## 6. Módulos

### 6.0 Patrón y ciclo comunes

**Estructura de archivos** (rutas relativas a `backend/src/modules/<modulo>/`)

| Ruta | Contenido |
| --- | --- |
| `domain/*.ts` + `*.test.ts` | Puro: sin Express, Supabase, Resend, reloj ni I/O |
| `application/<caso>.ts` | Casos de uso. Reciben `(input, principal, metadata)` y dependen de puertos inyectados |
| `application/<modulo>.ports.ts` | Puertos del módulo |
| `infrastructure/<modulo>-rpc-gateway.ts` | Llama a `callRpc` y valida con `parseRpcReply` |
| `http/<modulo>.router.ts` | Exporta `register<Modulo>Routes(app, deps)` |

**Orden de middlewares en cada ruta:**
`requireSession` → guards → `requireCsrf` (solo en mutaciones) →
`requireIdempotencyKey` → `compileOperation(opId).parseParams/parseQuery/parseBody` →
caso de uso → `assertSuccess` → `sendData`.

**Otros artefactos por módulo**

| Artefacto | Ruta |
| --- | --- |
| Migración | `backend/supabase/migrations/<timestamp>_<modulo>.sql` |
| pgTAP | `backend/supabase/tests/database/NN_<modulo>.test.sql` |
| Integración | `backend/test/integration/<modulo>.integration.ts` |

**Convenciones** (Anexo C)

- Imports relativos con sufijo `.js` e `import type`.
- `Object.freeze` en las salidas.
- Errores con `this.name` y mensaje fijo sin PII.
- Títulos de las pruebas en español.
- Canarios para comprobar que no hay fugas.
- Datos sintéticos `*.example.test`.

**Ciclo por módulo** (D-1, D-2)

1. Votar el contrato del módulo (V12) y los cambios C-x que le afectan. Añadir
   `x-ratification` y ejecutar `npm run openapi:types`.
2. Crear el plan del módulo en `docs/plans/YYYY-MM-DD-<modulo>.md`.
3. Pruebas RED: unitarias de dominio y aplicación, pgTAP e integración.
4. Migración → dominio → aplicación → adaptador → HTTP, hasta GREEN.
5. Integración:
   - matriz rol × AAL × hospital × propietario;
   - IDOR;
   - 20 peticiones concurrentes con la misma clave;
   - rollback forzado;
   - canarios en logs y auditoría.
6. Bruno contra el backend (`npm run test:bruno:backend`).
7. Revisión por subagente: `reviewer-back`, más `security-privacy-auditor` y/o
   `clinical-safety-reviewer` según el gate. Corregir y volver a revisar.
8. Documentación: sección del módulo en `docs/Backend-Contracts.md`, README y
   bitácora del plan del módulo.
9. Commits atómicos solo con los archivos del módulo. Tú apruebas el cierre.

**Orden de los módulos:** F2a → F3 → F4 → F2b → F5 → F6 → F7 → F8 → F9.
F4 (email) va antes que los flujos que envían correo (F2b, F5, F6, F7).

---

### F2a. identity-institutions: sesión, MFA, instituciones, configuración y auditoría

**Gate:** `reviewer-back` + `security-privacy-auditor`.

**Operaciones a ratificar** (detalle en el Anexo A):

- `createSession`, `getCurrentSession`, `getCsrfToken`, `deleteCurrentSession`;
- `enrollMfaFactor` (nueva, C-2), `verifyMfaChallenge`, `verifyStepUp`;
- `listHospitals`, `createHospital`, `getHospital`, `updateHospital`;
- `listHospitalSites`, `createHospitalSite`, `updateHospitalSite`;
- `listHospitalMemberships`, `revokeHospitalMembership`;
- `getSuperadminConfiguration`, `setFinalDemoAt`;
- `listAuditEvents`, `listSuperadminTasks`, `listOwnHospitalSites`;
- `getLiveness`, `getReadiness` (plataforma).

**Migración `<ts>_identity_institutions.sql`**

Tablas:

- `app.hospitals`: `hospital_id uuid pk default gen_random_uuid()`,
  `public_name text check 1..160`, `legal_name text check 1..200`,
  `is_authorized boolean not null default false`, `created_at`.
- `app.sites`:
  - `site_id uuid pk`, `hospital_id uuid references app.hospitals`;
  - `public_name 1..160`, `public_address 1..240`;
  - `latitude numeric(9,6) check -90..90`, `longitude numeric(9,6) check -180..180`;
  - `public_instructions text check ≤1000 null`;
  - `is_active`, `is_approved`, `created_at`, `updated_at`.
- `app.hospital_memberships`:
  - `membership_id uuid pk`, `user_id uuid references auth.users`, `hospital_id uuid references app.hospitals`;
  - `status text check in ('pendiente','activa','revocada')`;
  - `revoke_reason text check ≤300`, `created_at`, `revoked_at`;
  - índice único parcial `on (user_id) where status <> 'revocada'`: un admin, un hospital.

RLS:

| Tabla | `select` | Escritura |
| --- | --- | --- |
| `hospitals` | Superadmin todo; admin solo su hospital (vía membresía `activa`) | `insert`/`update`: superadmin con `aal2` |
| `sites` | Superadmin todo; admin las de su hospital | Superadmin |
| `hospital_memberships` | Superadmin todo; el usuario la suya | `update` superadmin (solo `status`, `revoke_reason`, `revoked_at`) |

**RPC** (INVOKER salvo indicación; toda escritura llama a `app.write_audit`)

- `api.current_actor()`
  - Devuelve `{role, displayName, hospital:{hospitalId, hospitalName, membershipActive, hospitalAuthorized}|null}`.
  - `displayName`: admin → `public_name` del hospital; superadmin → "Superadministración"; donante → `donor_profiles.name` o "Donante" si falta.
- `api.list_hospitals(p_limit, p_cursor_created_at, p_cursor_id)`:
  - orden `(created_at, hospital_id)`;
  - devuelve los items y el último par para el cursor.
- `api.create_hospital(p_key, p_hash, p_public_name, p_legal_name)`.
  - Recalcula el hash en SQL (§F3, patrón `format`); si no coincide → `invalid`.
  - `claim_idempotency` → `insert` → auditoría (`hospital.creado`) → `complete`.
- `api.get_hospital(p_id)` → `not_found` si no existe.
- `api.update_hospital(p_key, p_hash, p_id, p_public_name, p_legal_name, p_is_authorized)`:
  - argumentos nulos = sin cambio;
  - exige step-up.
- `api.list_hospital_sites(p_hospital_id)`, sin paginar (contrato).
- `api.create_hospital_site(p_key, p_hash, p_hospital_id, p_public_name, p_public_address, p_latitude, p_longitude, p_public_instructions)`.
- `api.update_hospital_site(p_key, p_hash, p_site_id, …opcionales, p_is_active, p_is_approved)`.
- `api.list_memberships(p_limit, cursor…)`: `emailHint` = primera letra + `***@` + dominio.
- `api.revoke_membership(p_key, p_hash, p_id, p_reason)`: solo `activa|pendiente → revocada`; si no, `conflict`.
- `api.get_configuration()` → `{finalDemoAt, isImmutable: finalDemoAt is not null}`.
- `api.set_final_demo_at(p_key, p_hash, p_at)`:
  - exige step-up;
  - si ya está fijado → `conflict`;
  - si `p_at <= now()` → `invalid`.
- `api.list_audit_events(p_limit, cursor…)`:
  - `actorCode` y `resourceCode` = 16 hex de `hmac(id, <clave fija de la migración>)`;
  - nunca el UUID.
- `api.list_superadmin_tasks()`: según V20.
- `api.list_own_hospital_sites(p_limit, p_cursor_site_id)`:
  - solo sedes `is_active and is_approved` del hospital de la membresía activa, con el hospital autorizado;
  - orden `site_id` ascendente.

**HTTP** (`http/auth.router.ts`, `http/institutions.router.ts`, `http/configuration.router.ts`)

- **`createSession`**
  1. Rate limit `login:ip` y `login:email`: 10 en `(t-15 min, t]` (SEC-15). Si se supera → 429 + `Retry-After`.
  2. `signIn`. Cualquier fallo de credenciales o usuario sin `user_accounts` → 401 con el mensaje genérico.
  3. Donante con estado `pendiente_verificacion` → 401 genérico. `incompleto` → sesión válida, solo para el onboarding.
  4. Admin o superadmin:
     - con factor verificado → `challenge`, `mfaRequired: true`, `mfaChallengeId`;
     - sin factor → `mfaRequired: true`, sin `challengeId`.
  5. Fija las cookies y responde 200 `AuthSession`.
  - Idempotencia:
    - `actor_ref = 'email:' || hmac(email)`;
    - hash = HMAC del payload (nunca la contraseña en claro);
    - un replay repite la autenticación;
    - la misma clave con otro payload → 409.
- **`getCurrentSession`:** `AuthSession` a partir de `principal`. Se omite `expiresAt`, que el contrato marca "solo mock".
- **`getCsrfToken`:** `createCsrfToken(CSRF_SECRET, principal.sessionId)`.
- **`deleteCurrentSession`:** `signOut(at)`, expira las dos cookies (`Max-Age=0`) y responde 204. Es idempotente.
- **`enrollMfaFactor`:**
  - solo admin o superadmin con un factor verificado ausente;
  - `enrollTotp` + `challenge` → 201 `{factorId, otpauthUri, challengeId}` con `no-store`.
- **`verifyMfaChallenge`:**
  - busca el `factorId` con `listFactors` (máximo un factor TOTP por usuario);
  - `verify` → cookies nuevas (`aal2`) → 200 `AuthSession`.
- **`verifyStepUp`:**
  - `challengeAndVerify` con el factor verificado → cookies nuevas;
  - devuelve `verifiedUntil = timestamp(amr.totp) + 300 s`.
  - Rate limit `mfa:user`: 10 cada 15 min.
- **Guards**

  | Rutas | Guards |
  | --- | --- |
  | `/api/v1/superadmin/*` | `requireRole('superadmin')` + `requireAal2` |
  | `updateHospital`, `setFinalDemoAt` (y luego `inviteHospitalAdmin`, F2b) | + `requireStepUp` |
  | `/api/v1/hospitals/me/*` | `requireRole('admin_hospitalario')` + `requireAal2` + `requireActiveMembership` |

**Pruebas**

- **Unitarias:** `cookies`, `csrf-guard` (sin Origin, Origin ajeno, token de otra sesión), `guards` y el cálculo de step-up desde `amr`.
- **pgTAP:**
  - un admin no ve otro hospital ni sus sedes;
  - un donante no ve hospitales;
  - con `aal1` no se puede escribir;
  - `final_demo_at` se fija una sola vez.
- **Integración:**
  - login → MFA → CSRF → `createHospital` → replay idéntico → misma clave con otro payload → 409;
  - revocar la membresía y, con la misma sesión, la siguiente petición → 403;
  - 11 logins → 429.
- **Bruno:** `health/*`, `superadmin/01_login`, `01b_mfa`, `03_hospitals`, `04_audit`.

**Riesgo**

- Las cookies `__Host-` exigen `Secure`. Verificar que Chrome (`http://127.0.0.1`)
  y Bruno las aceptan en local.
- Si no las aceptan: variable `COOKIE_SECURE=false`, permitida **solo** si
  `ALLOWED_ORIGINS` contiene únicamente orígenes locales, con nombres sin el
  prefijo `__Host-`. Documentarlo en ADR-004.

---

### F3. need-records

**Requisitos:** V1 y V8. **Gate:** `reviewer-back` (+ seguridad, porque toca RLS).

**Operaciones**

- `createHospitalNeed`: ya ratificada.
- `listOwnHospitalNeeds`, `getOwnHospitalNeed` y `transitionOwnHospitalNeed`: a ratificar.

**Dominio y aplicación**, exactamente según `docs/Need-Draft-Application-Spec.md` §3–4:

| Archivo | Contenido |
| --- | --- |
| `domain/need-draft.ts` | `NeedBloodType`, `NeedUrgency`, `NormalizedNeedDraftInput`, `NeedDraftProjection` (10 campos), `NeedDraftOwner`, `NeedDraft`, `createNeedDraft`, `projectNeedDraft` |
| `application/create-need-draft.ports.ts` | `ValidatedNeedDraftPrincipal`, `CreateNeedDraftContext`, `CreateNeedDraftIdempotency`, `NeedDraftFailureCode`, `CreateNeedDraftResult`, `AtomicNeedDraftCommand`, `AtomicNeedDraftReply`, `AtomicNeedDraftGateway` |
| `application/create-need-draft.ts` | `createNeedDraftService(gateway)` y `fingerprintNeedDraftInput` |
| `domain/need-state.ts` (nuevo) | Matriz manual C-8, `isTerminal(status)` y `projectStatus(status, expiresAt, now)` |

`fingerprintNeedDraftInput` = SHA-256 hex del JSON compacto con el orden
`component`, `requiredBloodType`, `targetConfirmations`, `siteId`, `radiusKm`,
`urgency`, `expiresInHours`, después de normalizar `radiusKm` omitido a 10.

Pruebas: `domain/need-draft.test.ts` y `application/create-need-draft.test.ts`,
con la matriz QA de A2 §5 completa.

**Migración `<ts>_need_records.sql`**

- Tabla `app.needs`:

  | Columna | Tipo y restricción |
  | --- | --- |
  | `need_id` | `uuid pk default gen_random_uuid()` |
  | `hospital_id` | `uuid not null references app.hospitals` |
  | `site_id` | `uuid not null references app.sites` |
  | `created_by` | `uuid not null` |
  | `component` | `text check = 'RBC'` |
  | `required_blood_type` | `text check in (8 valores)` |
  | `target_confirmations` | `int check 1..50` |
  | `radius_km` | `int check 1..50` |
  | `urgency` | `text check in ('Normal','Urgente','Critica')` |
  | `status` | `text check in (6 estados) default 'borrador'` |
  | `created_at` | `timestamptz not null default now()` |
  | `expires_at` | `timestamptz not null` |
  | `updated_at` | `timestamptz` |
  | `version` | `int not null default 0` |

  Además: `check (expires_at > created_at)`.
- Índices: `(hospital_id, created_at, need_id)` y `(status, expires_at)`.
- RLS:
  - `select`: admin `aal2` con membresía activa del mismo hospital;
  - `insert` con `WITH CHECK`: hospital de la membresía y `site_id` de una sede del mismo hospital, activa y aprobada;
  - `update` solo de `status`, `updated_at` y `version` (`grant update(status, updated_at, version)`).

**RPC**

**`api.create_need_draft(p_key, p_hash, p_component, p_required_blood_type, p_target, p_site_id, p_radius_km, p_urgency, p_expires_in_hours)`** (INVOKER)

1. `app.require('{admin_hospitalario}', true, false)`.
2. Comprueba la membresía activa y el hospital autorizado. Si no → `forbidden`.
3. Recalcula el hash canónico en SQL y lo compara con `p_hash`. Si difiere → `invalid`:

   ```sql
   encode(extensions.digest(convert_to(format(
     '{"component":%s,"requiredBloodType":%s,"targetConfirmations":%s,"siteId":%s,"radiusKm":%s,"urgency":%s,"expiresInHours":%s}',
     to_json(p_component)::text, to_json(p_required_blood_type)::text, p_target,
     to_json(p_site_id::text)::text, p_radius_km, to_json(p_urgency)::text, p_expires_in_hours
   ), 'UTF8'), 'sha256'), 'hex')
   ```

   Hay que resolver antes el *casing* del UUID (A2 §7): `p_site_id` llega como
   `text` y se compara literal; el cast a `uuid` solo se usa para la búsqueda.
4. `claim_idempotency('user:'||uid, 'createHospitalNeed', p_key, p_hash)`:
   - `replayed` → devolver la respuesta guardada (el mismo `expiresAt`, aunque ya haya pasado);
   - `payload_conflict` / `in_progress` → devolverlo tal cual.
5. Si la sede no existe, es ajena, está inactiva o no aprobada → `{"kind":"site_unusable"}`. Es una única rama y no deja rastro de cuál fue el caso.
6. `insert` con `expires_at = now() + make_interval(hours => p_expires_in_hours)`.
7. `write_audit('necesidad.creada', 'need', need_id, 'ok', null)`.
8. `complete_idempotency` y devolver `{kind:'created', owner:{actorId, hospitalId}, need:{10 campos}}`:
   - `expiresAt` = `to_char(expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
   - `confirmedIntentCount: 0` y `status: 'borrador'`.

**Lecturas**

- `api.list_own_needs(p_limit, cursor…, p_status)` y `api.get_own_need(p_id)`.
  - Si el estado no es terminal y `now() >= expires_at`, proyectan `vencida`.
  - `confirmedIntentCount` = 0 hasta F6.
  - El filtro `p_status` se aplica sobre el estado proyectado.

**`api.transition_own_need(p_key, p_hash, p_id, p_status)`**

- Matriz C-8. `borrador → activa` exige `now() < expires_at`; si no → `conflict`.
- Un estado terminal → `conflict`.
- `version + 1` y auditoría `necesidad.transicion`.
- En F6 se reemplaza (`create or replace`) para añadir la cascada.

**HTTP** (`http/needs.router.ts`)

- `NeedDtoError`: `shape` → 400 `BAD_REQUEST`; `rule` → 422 `VALIDATION_FAILED`.
- Reply → error:

  | Reply | Error |
  | --- | --- |
  | `site_unusable` | 422 |
  | `payload_conflict`, `in_progress` | 409 |
  | `forbidden`, `mfa_required` | 403 |
  | `unauthenticated` | 401 |
  | Otro o corrupto | 500 |

- Catálogo exacto del POST: 400/401/403/409/422/500. Sin 404 ni 429 (BC:212).

**Pruebas de integración**

- Paridad del hash TS↔SQL con 10 fixtures, incluido el radio omitido.
- Sede inexistente, ajena e inactiva → mismo status, código y mensaje.
- 20 POST concurrentes con la misma clave → 1 fila y 20 respuestas iguales.
- Replay después de `expiresAt` conserva el instante original.
- Rollback: una auditoría forzada a fallar (trigger de prueba) deja 0 filas.
- `hospitalId` en el body → 400.

**Bruno:** `hospital/03_needs`, `05_create_need`, `08_replay_create_need`, `09_create_need_default_radius` (tras C-10).

---

### F4. email-delivery

**Requisitos:** V5, V7 y V13, más el cambio C-1. **Gate:** `reviewer-back` + `security-privacy-auditor`.

**Dominio** (`backend/src/modules/email-delivery/domain/`)

- **`retry-policy.ts`**
  - `MAX_CALLS = 6` y `BACKOFF_MINUTES = [1, 2, 5, 10, 20]`.
  - `nextDelayMs(callsMade, random)` = `BACKOFF_MINUTES[callsMade-1] * 60000 * (1 + (random*0.4 - 0.2))` (V7, ±20 %).
  - `classify(outcome)`:

    | Resultado | Clase |
    | --- | --- |
    | `ok` (2xx) | `ok` |
    | error de red sin envío, timeout antes de enviar, 408, 429, 5xx | `transitorio` |
    | otros 4xx | `permanente` |
    | timeout o conexión cortada después de enviar el body | `incierto` |

- **`delivery-state.ts`**
  - Orden `pendiente(0) < enviada(1) < entregada(2)`.
  - `fallida` es final, salvo el reintento manual.
  - `advance(current, event)` nunca retrocede.

**Plantillas** (`templates/<tipo>.ts`)

- Funciones puras `(data) → {subject, text, html}`.
- Tipos: `invitacion`, `verificacion_email`, `alta_asistida`, `cambio_email`, `recuperacion`, `invitacion_admin`.
- Contenido permitido:
  - nombre del hospital verificado y sede pública;
  - convocatoria general y plazo;
  - enlaces `APP_PUBLIC_URL/<ruta>#<token>`, con el token en el *fragment* para que no viaje en el `Referer` ni en los logs;
  - disclaimer de la matriz académica (SAF-01);
  - "confirmar = intención de asistir" (SAF-02).
- **Prohibido:** datos del paciente, grupo del donante, ubicación, distancia, reconocimientos y promesas de seguridad transfusional.

**Puertos y adaptadores**

```ts
export interface EmailSender {
  send(msg: { to: string; subject: string; text: string; html: string; idempotencyKey: string }):
    Promise<{ kind: 'ok' | 'transitorio' | 'permanente' | 'incierto'; providerMessageId?: string; httpStatus?: number }>;
}
```

- `infrastructure/resend-sender.ts`:
  - `fetch('https://api.resend.com/emails', { method:'POST', headers:{ Authorization:`Bearer ${RESEND_API_KEY}`, 'Idempotency-Key': key, 'Content-Type':'application/json' }, body, signal: AbortSignal.timeout(10_000) })`;
  - verificar con Context7 la cabecera de idempotencia y el formato de la respuesta.
- `infrastructure/fake-sender.ts`:
  - guarda en memoria solo `{kind, idempotencyKey, at}`;
  - nunca guarda el destinatario ni el cuerpo.

**Migración `<ts>_email_delivery.sql`**

- `app.email_outbox`:

  | Columna | Tipo y restricción |
  | --- | --- |
  | `outbox_id` | `uuid pk` |
  | `kind` | `text check in (6 tipos)` |
  | `invitation_id` | `uuid null` |
  | `recipient_user_id` | `uuid null` |
  | `idempotency_key` | `text unique` |
  | `sealed_payload` | `text null` |
  | `status` | `text check in ('pendiente','en_curso','enviado','fallido','cancelado','vencido')` |
  | `attempt_count` | `int default 0` |
  | `next_attempt_at` | `timestamptz` |
  | `not_after` | `timestamptz` |
  | `lease_until` | `timestamptz` |
  | `uncertain_since` | `timestamptz` |
  | `provider_message_id` | `text` |
  | `created_at` | `timestamptz` |
  | `finalized_at` | `timestamptz` |

- `app.email_attempts(outbox_id, attempt_no, started_at, finished_at, outcome, http_status)`.
- `app.email_webhook_events(event_id text pk, received_at, provider_message_id, type)`.
- Sin privilegios para `authenticated` ni `anon`; solo `app_privileged`.

**Funciones DEFINER** (exigen `app.current_role() = 'worker'`, V13)

- **`api.worker_claim_due_outbox(p_limit int default 10)`**
  - `select … where status = 'pendiente' and next_attempt_at <= now() and not_after > now() for update skip locked limit p_limit`.
  - Marca `status = 'en_curso'` y `lease_until = now() + 60 s`.
  - Devuelve `{outboxId, kind, sealedPayload, attemptNo, idempotencyKey, recipient}`:
    - `recipient` = email de `auth.users` cuando `recipient_user_id` no es nulo (invitaciones);
    - en los demás tipos, `recipient` va dentro de `sealedPayload`.
  - También recupera las filas con lease vencido.
- **`api.worker_record_attempt(p_outbox_id, p_attempt_no, p_outcome, p_http_status, p_provider_message_id, p_next_attempt_at)`**
  - Inserta el intento y aplica la transición:
    - `ok` → `enviado`;
    - `permanente` → `fallido`;
    - `transitorio` → `pendiente` con `next_attempt_at` si `attempt_count < 6` y `p_next_attempt_at < not_after`; si no → `fallido`;
    - `incierto` → `pendiente` con `next_attempt_at = now() + 30 s` mientras `now() - uncertain_since < 5 min`; si no, se trata como `transitorio`.
  - En estado final: `sealed_payload = NULL`, `finalized_at = now()` (AP-06).
  - A partir de F6, actualiza también `invitations.delivery`.
- **`api.worker_expire_outbox()`**: las filas pendientes con `not_after <= now()` pasan a `vencido` con el payload a `NULL`.
- **`api.ingest_email_event(p_event_id, p_provider_message_id, p_type, p_occurred_at)`**
  - `insert … on conflict do nothing` sobre `email_webhook_events`. Si ya existía → `{"kind":"ok","duplicate":true}`.
  - Busca el outbox por `provider_message_id` y avanza `invitations.delivery` con `advance()` en SQL, sin retroceder.

**Worker** (`backend/src/worker.ts`; scripts `worker` = `node dist/worker.js` y `dev:worker`)

1. Inicia sesión con `WORKER_EMAIL`/`WORKER_PASSWORD` (sesión técnica) y la refresca antes de que expire.
2. Cada `WORKER_POLL_MS`:
   1. `claim`.
   2. Por cada fila:
      - `openPayload(keyring, sealed, outboxId)`;
      - comprobar la allowlist RF-EML-04 (`EMAIL_INBOX_ALLOWLIST`). Si el destinatario no está → `record_attempt(permanente)` **sin** llamar al proveedor;
      - renderizar;
      - `send`;
      - `record_attempt`.
3. Cada 60 s: `worker_expire_outbox` y, desde F6/F7, los demás vencimientos y purgas.
4. Logs: solo `event`, `code` y `durationMs`. Nunca el destinatario, el asunto ni el token.

**Webhook** (`http/resend-webhook.router.ts`, montado en `mountBeforeJson`)

- Body crudo: `express.raw({ type: 'application/json', limit: '64kb' })`.
- Firma:
  - `secret = base64decode(RESEND_WEBHOOK_SECRET sin 'whsec_')`;
  - `expected = base64(HMAC_SHA256(secret, `${svix-id}.${svix-timestamp}.${rawBody}`))`;
  - `svix-signature` es una lista separada por espacios de `v1,<base64>`; basta con que **una** coincida (`safeEqual`).
- `|now - svix-timestamp| <= 300 s`. Si falla la firma o el plazo → 401.
- Parsear el JSON **después** de verificar.
- Llamar a `ingest_email_event` con la sesión técnica.
- Mapeo de eventos:

  | Evento | Estado |
  | --- | --- |
  | `email.sent` | `enviada` |
  | `email.delivered` | `entregada` |
  | `email.bounced`, `email.failed` | `fallida` |
  | Otros | Se ignoran (204) |

- Verificar con Context7 el esquema de firma y los tipos de evento de Resend.

**Pruebas**

- **Unitarias:**
  - backoff con `random` fijo (0 y 1);
  - clasificación de los 6 casos;
  - plantillas con canarios (no aparecen el grupo, coordenadas, `@` del donante ni el token en el `subject`);
  - firma: válida, alterada, antigua, futura y varias firmas.
- **Integración** (worker con `FakeEmailSender` programable):
  - 2 workers concurrentes no reclaman la misma fila;
  - máximo 6 llamadas;
  - nada se envía tras `not_after`;
  - `sealed_payload` queda `NULL` al terminar;
  - webhook duplicado → un solo efecto;
  - `delivered` antes que `sent` no retrocede.

---

### F2b. identity-institutions: invitación de admins y recuperación de contraseña

**Requisitos:** F4 y V18. **Gate:** `reviewer-back` + `security-privacy-auditor`.

**Operaciones:** `inviteHospitalAdmin`, `getHospitalAdminInvitationPreview`,
`claimHospitalAdminInvitation`, `requestPasswordRecovery` y `completePasswordReset`.

**Migración `<ts>_action_tokens.sql`**

- `app.action_tokens`:

  | Columna | Tipo y restricción |
  | --- | --- |
  | `token_hash` | `text pk check (~ '^[0-9a-f]{64}$')` |
  | `kind` | `text check in ('verificacion_email','alta_asistida','cambio_email','recuperacion','invitacion_admin')` |
  | `subject_id` | `uuid` (usuario, alta o invitación) |
  | `data` | `jsonb` (sin PII en claro) |
  | `expires_at` | `timestamptz` |
  | `consumed_at` | `timestamptz` |
  | `invalidated_at` | `timestamptz` |
  | `created_at` | `timestamptz` |

- `app.admin_invitations(invitation_id uuid pk, hospital_id, email citext, membership_id null, created_by, created_at)`.
- Solo acceso vía DEFINER.

**Patrón de todo flujo por token** (lo reutilizan F5 y F7)

1. La aplicación genera:
   - `token = generateActionToken()`;
   - `outboxId = randomUUID()`;
   - `sealed = sealPayload(keyring, JSON.stringify({to, link: `${APP_PUBLIC_URL}/<ruta>#${token}`}), outboxId)`.
2. Una sola RPC guarda `token_hash = hashToken(token)`, la fila del outbox con
   `sealed_payload` y la auditoría.
3. El token en claro nunca se guarda ni se registra en logs.
4. Vista previa (`GET`): RPC DEFINER de solo lectura por `token_hash`. Si no
   existe → 404; si venció o se consumió → 410. Respuesta con
   `noStoreNoReferrer`.
5. Consumo (`POST`): RPC DEFINER que hace `select … for update`, comprueba que
   no esté consumido ni vencido, marca `consumed_at` y aplica el efecto.
   Actor de idempotencia `token:<hash>`.

**Operaciones**

- **`inviteHospitalAdmin`** (superadmin + AAL2 + step-up)
  - RPC `api.invite_hospital_admin(p_key, p_hash, p_email, p_hospital_id, p_token_hash, p_outbox_id, p_sealed)`.
  - Exige hospital autorizado.
  - Si el email ya tiene una membresía no revocada → `conflict` (409, decisión a ratificar: alternativa 202 neutral).
  - Token de 72 h y auditoría `admin.invitado` → 202 neutral.
- **`getHospitalAdminInvitationPreview`:** `{hospitalName, role:'admin_hospitalario', expiresAt}`.
- **`claimHospitalAdminInvitation`**
  1. Consulta la invitación.
  2. `signUp(email de la invitación, password)` con la anon key.
  3. RPC DEFINER `api.link_admin_account(p_token_hash, p_key, p_hash)`, ejecutada con la sesión del `signUp`: crea `user_accounts(admin_hospitalario)` y la membresía `activa`, y consume el token.
  4. Cookies AAL1 → 201 `AuthSession` con `mfaRequired: true`.
  - Si el email ya existe en Auth → 409.
- **`requestPasswordRecovery`**
  - Rate limit `recovery:ip` y `recovery:email` (10 cada 15 min).
  - Siempre 202 con el mismo mensaje.
  - Si el email corresponde a un usuario con `user_accounts`: token `recuperacion` de 1 h y outbox. Si no, no se hace nada, pero se consume un tiempo similar (`await` de una espera fija de 150 ms) para reducir la diferencia de tiempos.
- **`completePasswordReset`**
  1. RPC DEFINER que consume el token y devuelve `userId`.
  2. `AuthAdmin.updatePassword`.
  3. `AuthAdmin.revokeAllSessions`.
  4. 200 neutral.
  - Token inexistente → 404; vencido o consumido → 410.

**Pruebas**

- El segundo consumo del mismo token → 410.
- Las respuestas de recuperación son idénticas (status, body y cabeceras) para un email existente y otro inexistente.
- Las sesiones previas quedan inválidas tras el reset (el refresh antiguo falla).
- El token no aparece en logs, auditoría ni outbox en claro.

---

### F5. donor-records

**Requisitos:** F4, V11, V18 y C-12, más C7 (sincronizar requisitos).
**Gate:** `reviewer-back` + `security-privacy-auditor` (PII y ubicación).

**Operaciones**

- `createDonorRegistration`;
- `getDonorEmailVerificationPreview`, `verifyDonorEmail`;
- `getAssistedActivationPreview`, `claimAssistedRegistration`;
- `getEmailChangePreview`, `verifyEmailChange`;
- `completeDonorOnboarding`, `getOwnDonorProfile`, `updateOwnDonorParticipation`;
- `listOwnAssistedSignups`, `createAssistedSignup`, `getOwnAssistedSignup`, `reissueAssistedActivationLink`.

**Dominio**

| Archivo | Contenido |
| --- | --- |
| `domain/lima-polygon.ts` | `LIMA_POLYGON = {version, sha256, coordinates: [lon, lat][]}` (V11). Mientras no haya archivo oficial: envolvente sintética con `version: 'DEMO_ONLY-1'`. Una prueba recalcula el SHA-256 de las coordenadas serializadas |
| `domain/location.ts` | `hasAtMostThreeDecimals(n)` (comparación entera: `Math.round(n*1000) === n*1000` con tolerancia `1e-9`), `isInsideOrOnBoundary(lat, lon, polygon)` (ray casting + punto sobre un segmento = dentro) y `validateApproximateLocation` |
| `domain/donor-profile.ts` | Estados `pendiente_verificacion` → `incompleto` → `activo`. `canActivate(profile)` exige nombre, grupo, disponibilidad y ubicación válida. `EDITABLE_DIRECTLY = ['isAvailable','approximateLocation']` |

**Migración `<ts>_donor_records.sql`**

- `app.donor_profiles`:

  | Columna | Tipo y restricción |
  | --- | --- |
  | `donor_id` | `uuid pk references auth.users on delete cascade` |
  | `name` | `text check 1..120 null` |
  | `declared_blood_type` | `text check in (8 valores) null` |
  | `is_available` | `boolean null` |
  | `latitude` | `numeric(6,3) check -90..90 null` |
  | `longitude` | `numeric(7,3) check -180..180 null` |
  | `location_polygon_version` | `text null` |
  | `status` | `text check in ('pendiente_verificacion','incompleto','activo')` |
  | `email_verified_at` | `timestamptz` |
  | `created_at`, `updated_at` | `timestamptz` |

  Además: `check (status <> 'activo' or (name is not null and declared_blood_type is not null and is_available is not null and latitude is not null and longitude is not null))`.
- `app.assisted_signups`:

  | Columna | Tipo y restricción |
  | --- | --- |
  | `signup_id` | `uuid pk` |
  | `hospital_id` | `uuid references app.hospitals` |
  | `email` | `citext` |
  | `name` | `text 1..120 null` |
  | `status` | `text check in ('pendiente','vencida','reclamada_incompleta','activa')` |
  | `donor_id` | `uuid null` |
  | `created_at` | `timestamptz` |
  | `activation_expires_at` | `timestamptz` |
  | `purge_at` | `timestamptz` (`created_at + 30 días`; no cambia al reemitir) |

- RLS:
  - el donante hace `select` de su propio perfil;
  - `update` por columnas, solo `(is_available, latitude, longitude, location_polygon_version, updated_at)`, con `donor_id = auth.uid()` y `status = 'activo'`;
  - el onboarding es una RPC aparte;
  - el admin hace `select` de las altas asistidas de su hospital (solo `signup_id`, `status` y fechas en la proyección).

**Operaciones**

- **`createDonorRegistration`**
  1. Rate limit `registro:ip`: 10 cada 15 min.
  2. Genera el token y el sello del outbox (patrón F2b).
  3. `signUp(email, password)` con la anon key.
     - Si el email ya existe: no se crea nada ni se envía correo; misma respuesta.
     - Con `enable_confirmations = false`, `signUp` devuelve una sesión.
  4. Con esa sesión, RPC DEFINER `api.link_donor_account(p_token_hash, p_outbox_id, p_sealed)`: `user_accounts(donante)`, perfil `pendiente_verificacion`, token `verificacion_email` de 24 h y outbox.
  5. Descarta la sesión. Responde 202 neutral.
  - Idempotencia: `actor_ref = 'email:' || hmac(email)`.
- **`getDonorEmailVerificationPreview` / `verifyDonorEmail`**
  - Preview `{action:'verificar_email', expiresAt}`.
  - El consumo pone `email_verified_at` y `status = 'incompleto'`, y devuelve 200 `{status:'reclamada_incompleta'|'activa', emailVerified:true}` **sin cookies** (C-12).
  - Interpretación del enum: `reclamada_incompleta` = perfil incompleto.
- **`completeDonorOnboarding`** (cookie + CSRF; perfil `incompleto`)
  - Valida la ubicación en dominio (3 decimales y polígono) y fija `location_polygon_version`.
  - RPC INVOKER `api.complete_own_onboarding(...)` pasa a `activo`.
  - Si el perfil ya está `activo` → 409.
- **`getOwnDonorProfile`**
  - Lee el perfil con una RPC INVOKER.
  - El `email` sale del claim `email` del JWT, no de una copia en `app`.
  - Sin perfil → 404.
- **`updateOwnDonorParticipation`**
  - El body solo puede traer `isAvailable` y/o `approximateLocation`; el schema es cerrado, y nombre, email o grupo → 400.
  - Valida el polígono.
  - Hasta F6: RPC INVOKER `api.update_own_participation`.
  - F6 la reemplaza por una DEFINER con el efecto RF-INV-07 (pasar a no disponible invalida las invitaciones activas sin respuesta y cancela su outbox).
- **`createAssistedSignup`** (admin; rate limit `alta_asistida:hospital` de 20 cada hora, cifra a ratificar)
  - Siempre crea la fila `pendiente` y responde 202 con la misma forma.
  - Si el email ya es una cuenta de donante: no crea token ni correo. El estado llega a `vencida` como cualquier alta no reclamada; no hay enumeración.
  - Si no: token `alta_asistida` de 24 h y outbox.
- **`listOwnAssistedSignups` / `getOwnAssistedSignup`**: solo las de su hospital; si son ajenas → 404.
- **`reissueAssistedActivationLink`**
  - Solo si `now() < purge_at` y el estado es `pendiente` o `vencida`; si no → 409.
  - Invalida los tokens anteriores (`invalidated_at`), emite un token nuevo de 24 h y vuelve a `pendiente`.
  - `created_at` y `purge_at` no cambian (AP-01).
- **`getAssistedActivationPreview` / `claimAssistedRegistration`**
  1. `signUp(email del alta, password)`.
  2. RPC DEFINER `api.link_assisted_account`: `user_accounts(donante)`, perfil `incompleto` con `email_verified_at = now()` (el token demuestra el email) y nombre inicial si se dio. Alta → `reclamada_incompleta`.
  3. Cookies → 201 `DonorOnboarding`.
- **`getEmailChangePreview` / `verifyEmailChange`**
  - El token `cambio_email` se crea en F7.
  - Al consumirlo: `AuthAdmin.updateEmail(userId, nuevoEmail)`, luego la solicitud pasa a `completada` → 200 neutral.
  - El nuevo email va dentro de `action_tokens.data`, cifrado con el keyring. Contexto = `token_hash`.

**Pruebas**

- Polígono: vértice, borde, interior, exterior y 4 decimales.
- `PATCH` con `name` → 400.
- Un donante no lee el perfil de otro (pgTAP).
- Registro con un email existente: respuesta idéntica y sin outbox.
- Reemisión: `purge_at` intacto.
- El alta asistida de otro hospital → 404.

---

### F6. invitation-coordination

**Requisitos:** F3, F4, F5, V5, V6, V14 y C-4.
**Gate:** `reviewer-back` + `clinical-safety-reviewer` + `security-privacy-auditor`.

**Operaciones**

- `listOwnInvitationBatches`, `requestInvitationBatch`, `listOwnNeedResponses`;
- `getInvitationActionPreview`, `recordInitialInvitationResponse`;
- `listOwnInvitations`, `getOwnInvitation`, `changeOwnInvitationResponse`, `listOwnResponseHistory`;
- `retryInvitationDelivery` (nueva, C-4).

**Dominio** (`backend/src/modules/invitation-coordination/domain/`), todo puro

| Archivo | Contenido |
| --- | --- |
| `compatibility.ts` | `MATRIZ_RBC_ACADEMICA_V1` (Anexo B.2): 8×8, 27 pares permitidos. `isCompatible(donor, recipient)` e `isExactMatch` (mismo valor) |
| `haversine.ts` | `haversineMeters(lat1, lon1, lat2, lon2)`, R = 6 371 008,8 m, sin redondeo |
| `batch-size.ts` | `batchSize(meta) = Math.min(50, Math.max(5, 2*meta))` |
| `ranking.ts` | Comparador: exactas primero, distancia ascendente y luego `donorId` ascendente |
| `invitation-state.ts` | Tres ejes y transiciones permitidas (Anexo B.5) |
| `need-donor-code.ts` | Generador Crockford base32 de 10 caracteres (V14), con aleatoriedad inyectada |

Pruebas obligatorias:

- las 64 parejas de la matriz;
- Haversine con puntos conocidos y el borde `distance == radius`;
- `batchSize` con 1, 2, 3, 25, 26 y 50 → 5, 5, 6, 50, 50 y 50;
- el ranking de una mezcla de exactos y compatibles.

**Migración `<ts>_invitation_coordination.sql`**

- `app.rbc_compatibility(donor text, recipient text, is_exact boolean, primary key (donor, recipient))`. Semilla de **27 filas**. Una prueba de paridad compara la tabla con la matriz TS.
- `app.haversine_m(lat1, lon1, lat2, lon2) returns double precision immutable`. Prueba de paridad TS↔SQL con fixtures: diferencia ≤ 1e-6 m.
- `app.invitation_batches`: `batch_id uuid pk`, `need_id`, `hospital_id`, `requested_by`, `created_at`, `created_invitation_count int check 0..50`, `queued_email_count int check 0..50`.
- `app.invitations`:

  | Columna | Tipo y restricción |
  | --- | --- |
  | `invitation_id` | `uuid pk` |
  | `need_id`, `batch_id` | `uuid` |
  | `donor_id` | `uuid null` (null tras una eliminación, V15) |
  | `need_donor_code` | `text` |
  | `validity` | `text check in ('activa','invalidada','vencida')` |
  | `delivery` | `text check in ('pendiente','enviada','entregada','fallida')` |
  | `response` | `text check in ('sin_respuesta','confirmada','rechazada')` |
  | `response_recorded_at` | `timestamptz` |
  | `confirm_token_hash`, `reject_token_hash` | `text null` |
  | `token_consumed_at` | `timestamptz` |
  | `created_at` | `timestamptz` |

  Más `unique (need_id, donor_id)`, `unique (need_id, need_donor_code)` y un índice `(donor_id, created_at)` para la cuota.
- `app.invitation_response_history(id bigserial pk, invitation_id, donor_id, response check in ('confirmada','rechazada'), channel check in ('token','sesion'), changed_at)`. Append-only: trigger que impide `UPDATE`/`DELETE`, salvo la purga.

**`api.request_invitation_batch(p_key, p_hash, p_need_id, p_slots jsonb)`** (DEFINER #5)

- **Slots que prepara la aplicación**, sin ver candidatos:
  - `n = batchSize(meta)`, con la meta leída antes mediante `get_own_need`;
  - por cada slot: `{outboxId, invitationId, confirmHash, rejectHash, sealedPayload}`;
  - `sealedPayload` = `sealPayload(keyring, JSON.stringify({confirmToken, rejectToken}), outboxId)`.
  - **No** lleva destinatario. El worker lo obtiene de `auth.users` mediante `recipient_user_id`.
- **Dentro de la función, en una sola transacción:**
  1. Comprueba al llamador: admin, `aal2` y membresía activa del hospital de la necesidad. Si no → `forbidden`. Una necesidad inexistente o ajena → `not_found`.
  2. `select … from app.needs where need_id = p_need_id for update`. Debe estar `activa` con `now() < expires_at`; si no → `conflict`.
  3. `claim_idempotency('user:'||uid, 'requestInvitationBatch:'||p_need_id, p_key, p_hash)`.
  4. Candidatos:

     ```sql
     select p.donor_id,
            c.is_exact,
            app.haversine_m(p.latitude, p.longitude, s.latitude, s.longitude) as d
     from app.donor_profiles p
     join app.rbc_compatibility c
       on c.donor = p.declared_blood_type and c.recipient = n.required_blood_type
     join app.sites s on s.site_id = n.site_id
     where p.status = 'activo'
       and p.is_available
       and p.location_polygon_version = <versión vigente>
       and app.haversine_m(...) <= n.radius_km * 1000
       and not exists (select 1 from app.invitations i
                       where i.need_id = n.need_id and i.donor_id = p.donor_id)
     order by c.is_exact desc, d asc, p.donor_id asc
     ```

  5. Recorre los candidatos en ese orden:
     - `pg_advisory_xact_lock(hashtextextended('cuota:'||donor_id, 0))`;
     - cuenta las invitaciones del donante con `created_at > now() - interval '24 hours'`; si son 3 o más, lo salta;
     - sigue hasta llenar `n` o quedarse sin candidatos.
  6. Inserta el lote, las invitaciones (con `need_donor_code` generado en SQL con `gen_random_bytes` + alfabeto Crockford, reintentando si colisiona), las filas del outbox (`kind='invitacion'`, `recipient_user_id`, `not_after = n.expires_at`) y la auditoría `lote.solicitado`.
  7. `complete_idempotency` y devuelve `{batchId, createdInvitationCount, queuedEmailCount}`. Puede ser 0.

**`api.respond_invitation_by_token(p_token_hash, p_key, p_hash)`** (DEFINER #3, para `recordInitialInvitationResponse`)

1. Busca la invitación cuyo `confirm_token_hash` o `reject_token_hash` coincide; la acción queda determinada por cuál de los dos coincide. Sin coincidencia → `not_found`.
2. `for update` sobre la invitación y la necesidad.
3. Debe cumplirse todo esto; si no → `gone` (410):
   - `validity = 'activa'`;
   - `response = 'sin_respuesta'`;
   - la necesidad en `activa` o `meta_alcanzada`;
   - `now() < n.expires_at`.
4. Pone la respuesta y `response_recorded_at`, anula **ambos** hashes y fija `token_consumed_at`.
5. Inserta en el historial (`channel = 'token'`) y la auditoría.
6. Si la respuesta es `confirmada`:
   - recuenta las confirmadas;
   - si son `>= target_confirmations`: la necesidad pasa a `meta_alcanzada`, el resto de invitaciones `activa`/`sin_respuesta` → `invalidada`, y sus filas de outbox `pendiente` → `cancelado` con el payload a `NULL` (RF-INV-05).
   - Si la meta ya estaba alcanzada antes de esta confirmación → `conflict` (V6).
7. Devuelve `{response, recordedAt, needStatus}`.

Idempotencia: `actor_ref = 'token:'||p_token_hash`.

**`api.change_own_invitation_response(p_key, p_hash, p_invitation_id, p_response)`** (DEFINER #7)

- Solo el donante dueño. Si no → `not_found`.
- La necesidad no puede estar en estado terminal; si lo está → `conflict`.
- Efectos:
  - pasar a `confirmada` con la meta ya alcanzada → `conflict`;
  - pasar de `confirmada` a `rechazada` con la necesidad en `meta_alcanzada` → vuelve a `activa`, **sin** lote nuevo (RF-NEC-07 / RF-INV-06).
- Historial con `channel = 'sesion'`.

**Lecturas**

- `api.list_own_invitation_batches(p_need_id, p_limit, cursor…)`:
  - orden `(created_at, batch_id)`;
  - `deliveryCounts` = conteo por `invitations.delivery` del lote (suma = `createdInvitationCount`).
- `api.list_own_need_responses(p_need_id, p_limit, cursor…)` (DEFINER #6), según RF-VIS-01/02:

  | Respuesta actual | Campos expuestos |
  | --- | --- |
  | `confirmada` | `{needDonorCode, donorName, declaredBloodType, response:'confirmada', responseRecordedAt}` |
  | Resto | `{needDonorCode, validity, delivery, response}` (opaco) |

  Nunca expone email, ubicación, distancia ni ID global. Añade `confirmedIntentCount`.
- `api.list_own_invitations`, `api.get_own_invitation` y `api.list_own_response_history` (INVOKER, RLS por `donor_id = auth.uid()`):
  - `hospitalName` = `hospitals.public_name`;
  - `publicSiteName` = `sites.public_name`;
  - `instructions` = `sites.public_instructions`, o el texto neutral fijo `"Preséntate en la sede indicada antes del plazo. El personal de salud verificará tu grupo y tu aptitud."` (a ratificar);
  - `validity` proyectada como `vencida` si `now() >= expires_at`.

**Reemplazos de F3, F4 y F5** (`create or replace` en esta migración)

- `api.transition_own_need`: al pasar a `cerrada` o `cancelada`, las invitaciones `activa` → `invalidada` y el outbox `pendiente` → `cancelado` con el payload a `NULL` (RF-INV-08).
- `api.update_own_participation` pasa a DEFINER con el efecto RF-INV-07.
- `api.worker_expire_needs()` (worker):
  - necesidades no terminales con `expires_at <= now()` → `vencida`;
  - invitaciones `activa` → `vencida`;
  - outbox → `vencido`.
- `api.list_own_needs` / `api.get_own_need`: `confirmedIntentCount` real.
- `api.worker_record_attempt` / `api.ingest_email_event` actualizan `invitations.delivery`.

**`api.retry_invitation_delivery(p_key, p_hash, p_invitation_id, p_slot jsonb)`** (superadmin + step-up)

- Solo si `delivery = 'fallida'`, la invitación está `activa` y la necesidad vigente; si no → `conflict`. Si ya pasó el plazo → `gone`.
- Invalida los hashes anteriores y registra los nuevos del slot.
- Crea una fila de outbox nueva y deja `delivery = 'pendiente'`.
- Auditoría `entrega.reintento_manual`.

**Pruebas**

- **pgTAP:**
  - el admin de otro hospital no puede lanzar un lote;
  - un donante no lee invitaciones ajenas;
  - la cuarta invitación en 24 h queda bloqueada;
  - el borde del radio está incluido;
  - un donante fuera del polígono o no disponible queda excluido.
- **Integración:**
  - dos lotes concurrentes de hospitales distintos respetan la cuota;
  - 20 respuestas con el mismo token → un solo efecto;
  - la última plaza en carrera → un único `meta_alcanzada`;
  - tras cerrar, el outbox queda `cancelado`;
  - PER-02: p95 < 2 s con 500 donantes sintéticos y 5 concurrentes.
- **Revisión clínica:** la copia de la plantilla, la matriz y que urgencia y reconocimientos no influyen.

---

### F7. privacy-requests

**Requisitos:** F5, F6, V15, V19 y C-7. **Gate:** `reviewer-back` + `security-privacy-auditor`.

**Operaciones**

- `listOwnCorrectionRequests`, `createOwnCorrectionRequest`, `getOwnCorrectionRequest`;
- `listCorrectionRequests`, `getCorrectionRequest`, `decideCorrectionRequest`;
- `createContextualAccessGrant`, `getContextualDonorData`, `executeApprovedCorrectionRequest`.

**Migración `<ts>_privacy_requests.sql`**

- `app.correction_requests`:

  | Columna | Tipo y restricción |
  | --- | --- |
  | `request_id` | `uuid pk` |
  | `donor_id` | `uuid` |
  | `type` | `text check in ('correccion','eliminacion')` |
  | `requested_fields` | `text[]` (subconjunto de `{name, email, declaredBloodType, deletion}`) |
  | `proposed_name` | `text` |
  | `proposed_email_sealed` | `text` (cifrado en la aplicación) |
  | `proposed_blood_type` | `text` |
  | `status` | `text check in ('pendiente','aprobada','rechazada','en_ejecucion','completada','fallida')` |
  | `decision_reason` | `text ≤300` |
  | `decided_by` | `uuid` |
  | `created_at`, `updated_at` | `timestamptz` |

- `app.access_grants`:

  | Columna | Tipo y restricción |
  | --- | --- |
  | `grant_id` | `uuid pk` |
  | `superadmin_id` | `uuid` |
  | `request_id` | `uuid` |
  | `action` | `text check in ('review','execute')` |
  | `allowed_fields` | `text[]` |
  | `reason` | `text 1..300` |
  | `expires_at` | `timestamptz` (`created_at + 10 min`) |
  | `created_at` | `timestamptz` |

- `app.deletion_ledger(entry_id uuid pk, subject_hmac text, scope text, executed_at timestamptz)`.

**Reglas**

- **`createOwnCorrectionRequest`** (donante)
  - `correccion` con `changes` (1 a 3 campos) o `eliminacion`.
  - Si ya hay una solicitud no terminal del mismo tipo → 409.
  - El email propuesto se cifra en la aplicación.
- **`list` / `get` propios:** proyección `CorrectionRequestSummary`, sin valores.
- **Superadmin (`list` / `get`):** misma proyección, sin PII.
- **`decideCorrectionRequest`:** `pendiente → aprobada | rechazada` con motivo y auditoría. Cualquier otra transición → 409.
- **`createContextualAccessGrant`** (AAL2 + step-up)
  - `allowedFields` ⊆ campos de la solicitud.
  - Acción `execute` solo si la solicitud está `aprobada`.
  - Devuelve `{grantId, requestId, action, allowedFields, expiresAt}`.
- **`getContextualDonorData`** (cabecera `X-Contextual-Grant` = `grantId`)
  - El grant debe pertenecer al mismo superadmin y a la misma solicitud, tener acción `review` y no haber vencido. Vencido → 410; ajeno → 403.
  - Proyecta `currentValues` y `proposedValues` solo con los campos de `allowedFields ∩ requestedFields`.
  - `newEmail` se muestra como `email`; una eliminación devuelve `proposedValues = {}`.
  - Auditoría `grant.usado`, sin valores.
- **`executeApprovedCorrectionRequest`** (DEFINER #9; AAL2 + step-up + grant `execute`; solicitud `aprobada` → `en_ejecucion`)
  - nombre o grupo → `update` del perfil → `completada`;
  - email → token `cambio_email` de 24 h + outbox al email **nuevo**:
    - la solicitud queda `en_ejecucion` hasta que se verifica (F5) y entonces pasa a `completada`;
    - si el token vence, el worker la pasa a `fallida` (RF-PRO-04: una solicitud nueva es obligatoria);
  - eliminación (V15) → `AuthAdmin.deleteUser`, anonimización de invitaciones, borrado del historial, entrada en el ledger con `hmac(user_id)` → `completada`.
  - Si `AuthAdmin` falla → `fallida`.
- **Purgas del worker**

  | Qué se purga | Cuándo |
  | --- | --- |
  | `idempotency_records` | `terminal_at + 72 h` (RNF-REL-02) |
  | Altas asistidas no reclamadas | `now() >= purge_at` |
  | `reclamada_incompleta` | 30 días (V8) |
  | `action_tokens` | Vencidos hace más de 24 h |
  | Usuarios de Auth sin `user_accounts` | Más de 24 h → `AuthAdmin.deleteUser` |
  | `rate_limit_events` | Más de 1 día |
  | Purga final | `now() >= final_demo_at + interval '30 days'`: borrar todo salvo agregados irreversibles sin IDs (RNF-PRV-02/03). El script se ejecuta solo con tu autorización explícita |

**Pruebas**

- Grant vencido → 410; grant de otro superadmin → 403.
- Los campos fuera del grant no aparecen.
- Ejecutar sin aprobación → 409.
- Replay de la ejecución → mismo resultado.
- Canarios: el email nuevo no aparece en auditoría, logs ni respuestas de lista.

---

### F8. recognition-policies + legal-information

**Requisitos:** V8 y V16. **Gate:** `reviewer-back` (+ revisión clínica de la copia de la política).

**Operaciones**

- `getOwnRecognitionPolicy`, `publishOwnRecognitionPolicy`, `withdrawOwnRecognitionPolicy`;
- `listPublishedRecognitionPolicies`;
- `listRecognitionPoliciesForModeration`, `moderateRecognitionPolicy`;
- `getDonationWorkInformation`.

**Migración `<ts>_recognition_legal.sql`**

- `app.recognition_policies`:
  - `hospital_id uuid pk`;
  - `status text check in ('sin_publicar','publicada','suspendida')`;
  - `offered_items text[] check (cardinality(offered_items) <= 3 and offered_items <@ array['refrigerio','diploma','pin'])`;
  - `version int not null default 0`;
  - `updated_at timestamptz`;
  - `moderation_reason text ≤300`.
- `app.legal_information`:
  - `version text pk`;
  - `status text check in ('borrador','aprobado','retirado')`;
  - `notice text ≤500`;
  - `content text ≤5000 null`;
  - `sources jsonb`;
  - `reviewer_role text`, `reviewed_at timestamptz`, `created_at`.
  - Semilla: versión `0.1-borrador`, estado `borrador`, aviso neutral y `content` nulo.

**Reglas**

- **`getOwnRecognitionPolicy`:** si no hay fila → `{status:'sin_publicar', offeredItems:[], version:0}` con 200, nunca 404.
- **`publishOwnRecognitionPolicy`**
  - Exige `expectedVersion`; si no coincide → 409. Si está `suspendida` → 409 (C-6).
  - Una lista vacía equivale a `sin_publicar`.
  - `version + 1`.
- **`withdrawOwnRecognitionPolicy`**
  - Query `expectedVersion` obligatoria; si falta → 400.
  - 204. Replay con la misma clave → 204 sin incrementar.
- **`listPublishedRecognitionPolicies`:** solo las `publicada`, ordenadas por `hospital_id`.
- **`moderateRecognitionPolicy`** (superadmin)
  - Solo `publicada → suspendida` y `suspendida → sin_publicar`, con motivo y `expectedVersion`.
  - Levantar la suspensión no republica.
- **`getDonationWorkInformation`** (pública): `content` solo si `status = 'aprobado'`; si no, `notice`.
- **Prueba de aislamiento:** ningún archivo de `modules/invitation-coordination/` importa `recognition-policies` (RF-REC-03).

---

### F9. Integración y salida

- **Proxy de la web:** `apps/web/vite.config.ts` con `API_TARGET = mock` (por defecto, `http://127.0.0.1:4011`) o `backend` (`http://127.0.0.1:3000`), para `/api` y `/health`. El flujo actual no cambia.
- **E2E contra el backend:** `playwright.backend.config.ts` con `webServer` = backend + worker + web (`API_TARGET=backend`) y el script raíz `test:e2e:backend`. `playwright.config.ts` del mock no se toca.
- **Alinear el mock** con el contrato:
  - shape → 400 (`apps/mock-api/src/app.ts:689-690`);
  - `IDEMPOTENCY_CONFLICT` → `STATE_CONFLICT` (`:176`, `:337`);
  - 403 genérico en lugar de `CSRF_VALIDATION_FAILED`.
  - Actualizar `apps/mock-api/src/app.test.ts`.
- **Rendimiento:** `scripts/perf-backend.mjs`, con 3 hospitales, 500 donantes sintéticos, 10 calentamientos excluidos y ≥100 muestras. Mide p95 nearest-rank de PER-02..06.
- **Render:**
  - build `npm ci && npm run build --workspace backend`;
  - start `node backend/dist/server.js`;
  - background worker `node backend/dist/worker.js`;
  - health check `/health/ready`;
  - `TRUSTED_PROXIES=1`;
  - variables desde el panel, nunca en el repo.
- **Vercel:** `vercel.json` (en `apps/web`) con rewrites de `/api/:path*` y `/health/:path*` hacia el dominio de Render (V3).
- **Migraciones remotas:** `supabase db push` **solo** con tu autorización explícita. Documentar en el README el rollback (roll-forward con una migración correctiva).

---

## 7. Matriz de guards por grupo de operaciones

| Grupo | Rol | AAL2 | Step-up | CSRF + Origin | Rate limit | Actor de idempotencia |
| --- | --- | --- | --- | --- | --- | --- |
| `POST /auth/sessions` | — | — | — | — | `login:ip`, `login:email` | `email:<hmac>` |
| `/auth/*` (resto) | sesión | — | — | En mutaciones | `mfa:user` en verificaciones | `user:<uuid>` |
| `/superadmin/*` | superadmin | Sí | `updateHospital`, `setFinalDemoAt`, `inviteHospitalAdmin`, `createContextualAccessGrant`, `executeApprovedCorrectionRequest`, `retryInvitationDelivery` | En mutaciones | — | `user:<uuid>` |
| `/hospitals/me/*` | admin + membresía activa + hospital autorizado | Sí | — | En mutaciones | `requestInvitationBatch`, `createAssistedSignup` | `user:<uuid>` |
| `/donors/me/*` | donante | — | — | En mutaciones | — | `user:<uuid>` |
| `/*-actions/{token}` | — (token) | — | — | — | `registro:ip`, `recovery:*`, respuesta por token | `token:<sha256>` |
| `/donor-registrations` | — | — | — | — | `registro:ip` | `email:<hmac>` |
| `/legal-information/*`, `/health/*` | — | — | — | — | — | — |
| `/email-delivery/webhooks/resend` | Firma Svix | — | — | — | — | `svix-id` |

---

## 8. Verificación y criterio de terminado

**Comandos** (desde la raíz)

```bash
SCARF_ANALYTICS=false npm ci
npm run openapi:lint && npm run openapi:api:check && npm run test:api:generator
npm run typecheck && npm run build --workspace backend
npm run test --workspace backend                 # unitarias backend
supabase start --workdir backend                  # una vez por sesión (Docker)
npm run test:backend:db                          # pgTAP: RLS, grants, acceso directo
npm run test:backend:integration                 # vitest contra Supabase local
npm run test:bruno:backend                       # Bruno CLI contra la API real
npm test && npm run test:contract && npm run test:bruno && npm run test:e2e -- --trace=off   # regresión mock/web
npm run test:e2e:backend -- --trace=off          # tras F9
```

**Terminado** (según `AGENTS.md`, sección *Definición de terminado*)

- Las 72 operaciones (70 + `enrollMfaFactor` + `retryInvitationDelivery`) y el
  webhook están ratificados, implementados y probados.
- Casos de aceptación y abuso cubiertos.
- Pruebas negativas de rol y RLS, incluido el acceso directo (pgTAP).
- Idempotencia concurrente y rollback verificados.
- Errores seguros, siempre con `correlationId`.
- Canarios: sin PII en logs, auditoría ni respuestas de lista.
- PASS de los subagentes revisores en cada módulo y tu aprobación.
- `Backend-Contracts.md`, README, ADR y `CLAUDE.md` sincronizados.
- Ninguna afirmación de cumplimiento clínico ni legal.
- Datos siempre sintéticos.

---

## Anexo A. Contrato por operación

Fuente: `docs/openapi.json` 0.2.0-draft, leído el 2026-10-12.

### A.0 Leyenda y convenciones globales

**Leyenda de autenticación**

| Código | Significado |
| --- | --- |
| `none` | Pública |
| `C` | Cookie de sesión |
| `C+X` | Cookie + `X-CSRF-Token` |
| `T` | Token de un uso en el path: string de 43–256 caracteres, nunca se registra |

**Convenciones globales**

- Toda mutación exige `Idempotency-Key` (16–255 caracteres).
- `Q[pg]` = `limit` entero 1–100 (por defecto 20) + `cursor` string de ≤512 caracteres.
- Las páginas devuelven `{data:{items:T[], pagination:{nextCursor:string|null}}}`.
- Éxito siempre `{data:…}`; error `{error:{code, message, correlationId}}`.
- **Todos los objetos son cerrados** (`additionalProperties:false`).
- `*` = campo requerido.
- `[NS]` = respuesta con `Cache-Control: no-store` + `Referrer-Policy: no-referrer`.
- `[SC]` = la respuesta emite `Set-Cookie`.
- `ApproximateLocation` usa `multipleOf 0.001`: configurar Ajv con `multipleOfPrecision`.

### A.1 Schemas compartidos

**Enums**

| Enum | Valores |
| --- | --- |
| `BloodType` | `O_NEG`, `O_POS`, `A_NEG`, `A_POS`, `B_NEG`, `B_POS`, `AB_NEG`, `AB_POS` |
| `NeedStatus` | `borrador`, `activa`, `meta_alcanzada`, `cerrada`, `cancelada`, `vencida` |
| `Urgency` | `Normal`, `Urgente`, `Critica` |
| `InvitationValidity` | `activa`, `invalidada`, `vencida` |
| `InvitationDelivery` | `pendiente`, `enviada`, `entregada`, `fallida` |
| `InvitationResponse` | `sin_respuesta`, `confirmada`, `rechazada` |
| `ActorRole` | `donante`, `admin_hospitalario`, `superadmin` |
| `CorrectionRequestType` | `correccion`, `eliminacion` |
| `CorrectionRequestStatus` | `pendiente`, `aprobada`, `rechazada`, `en_ejecucion`, `completada`, `fallida` |
| `RecognitionItem` | `refrigerio`, `diploma`, `pin` |
| `RecognitionPolicyStatus` | `sin_publicar`, `publicada`, `suspendida` |
| `AssistedSignupStatus` | `pendiente`, `vencida`, `reclamada_incompleta`, `activa` |

**Objetos**

| Schema | Campos |
| --- | --- |
| `ApproximateLocation` | `{latitude:-90..90, longitude:-180..180}` (`multipleOf .001`) |
| `OwnDonorProfile` | `{name 1..120*, email ≤254*, declaredBloodType*, isAvailable*, approximateLocation*}` |
| `Need` | `{needId*, component:'RBC'*, requiredBloodType*, targetConfirmations 1..50*, confirmedIntentCount ≥0*, siteId*, radiusKm 1..50*, urgency*, status*, expiresAt*}` |
| `InvitationListItem` | `{invitationId*, hospitalName ≤160*, publicSiteName ≤160*, requiredBloodType*, urgency*, instructions ≤1000*, expiresAt*, validity*, delivery*, response*}` |
| `InvitationResponseResult` | `{response:confirmada\|rechazada*, recordedAt*, needStatus*}` |
| `AuthSession` | `{actor:{role*, displayName ≤120*, hospitalName? ≤160}*, aal:1\|2*, mfaRequired*, mfaChallengeId?, expiresAt?}` |
| `NeutralMessage` | `{message ≤240*}` |
| `DonorOnboarding` | `{status:reclamada_incompleta\|activa*, emailVerified*}` |
| `EmailActionPreview` | `{action:verificar_email\|reclamar_alta\|cambiar_email*, expiresAt*, hospitalName?}` |
| `CorrectionRequestSummary` | `{requestId*, type*, requestedFields:[name\|email\|declaredBloodType\|deletion]*, status*, createdAt*, updatedAt*, decisionReason? ≤300}` |
| `RecognitionPolicy` | `{hospitalId*, hospitalName*, status*, offeredItems ≤3 únicos*, version ≥0*, updatedAt*}` |
| `AssistedSignup` | `{signupId*, status*, createdAt*, activationExpiresAt*, purgeAt*}` |
| `Hospital` | `{hospitalId*, publicName 1..160*, legalName? ≤200, isAuthorized*, createdAt*}` |
| `Site` | `{siteId*, hospitalId*, publicName*, publicAddress? ≤240, isActive*, isApproved*}` (+ C-3) |
| `OwnHospitalSite` | `{siteId*, publicName*}` |
| `Membership` | `{membershipId*, hospitalId*, role:'admin_hospitalario'*, status:pendiente\|activa\|revocada*, emailHint ≤100*}` |
| `InvitationBatchRecord` | `{batchId*, createdAt*, createdInvitationCount 0..50*, deliveryCounts:{pendiente, enviada, entregada, fallida}*}` |
| `OpaqueHospitalResponse` | `{needDonorCode 8..64*, validity*, delivery*, response:sin_respuesta\|rechazada*}` |
| `ConfirmedHospitalResponse` | `{needDonorCode*, donorName ≤120*, declaredBloodType*, response:'confirmada'*, responseRecordedAt*}` |
| `AuditEvent` | `{eventId*, actorCode ≤64*, event ≤100*, resourceCode ≤64*, result:ok\|denegado\|fallido*, occurredAt*, reason? ≤300}` |
| `SuperadminTask` | `{taskId*, kind:correction_request\|hospital_review\|recognition_policy*, createdAt*, resourceCode?}` (+ `delivery_failure`, C-4) |
| `Configuration` | `{finalDemoAt: date-time\|null*, isImmutable*}` |
| `HealthEnvelope` | `{status:ok\|ready*}` |

### A.2 Operaciones

**Plataforma**

| Operación | Auth | Entrada | Éxito | Errores |
| --- | --- | --- | --- | --- |
| `GET /health/live` `getLiveness` | none | — | 200 Health | 404, 500 |
| `GET /health/ready` `getReadiness` | none | — | 200 Health | 404, 500, 503 |

**identity-institutions**

| Operación | Auth | Entrada | Éxito | Errores |
| --- | --- | --- | --- | --- |
| `POST /api/v1/auth/sessions` `createSession` | none | `{email ≤254*, password 12..128*}` | 200 AuthSession [SC] | 400, 401, 409, 429, 500 |
| `GET /api/v1/auth/session` `getCurrentSession` | C | — | 200 AuthSession | 401, 500 |
| `GET /api/v1/auth/csrf-token` `getCsrfToken` | C | — | 200 `{token 32..512}` | 401, 500 |
| `DELETE /api/v1/auth/sessions/current` `deleteCurrentSession` | C+X | — | 204 | 400, 401, 403, 500 |
| `POST /api/v1/auth/mfa-verifications` `verifyMfaChallenge` | C+X | `{challengeId:uuid*, code:^[0-9]{6,8}$*}` | 200 AuthSession (aal 2) | 401, 409, 429, 500 |
| `POST /api/v1/auth/step-up-verifications` `verifyStepUp` | C+X | `{code*}` | 200 `{verifiedUntil}` | 401, 403, 429, 500 |
| **`POST /api/v1/auth/mfa-enrollments` `enrollMfaFactor` (nueva, C-2)** | C+X | — | 201 `{factorId, otpauthUri, challengeId}` [NS] | 401, 403, 409, 429, 500 |
| `POST /api/v1/auth/password-recovery-requests` `requestPasswordRecovery` | none | `{email*}` | 202 Neutral | 400, 429, 500 |
| `POST /api/v1/auth/password-reset-actions/{token}` `completePasswordReset` | T | `{newPassword 12..128*}` | 200 Neutral | 404, 409, 410, 422, 500 |
| `GET /api/v1/hospital-admin-invitation-actions/{token}` `getHospitalAdminInvitationPreview` | T | — | 200 `{hospitalName*, role:'admin_hospitalario'*, expiresAt*}` | 404, 410 |
| `POST /api/v1/hospital-admin-invitation-actions/{token}/claim` `claimHospitalAdminInvitation` | T | `{password 12..128*}` | 201 AuthSession [SC] | 400, 404, 409, 410, 422 |
| `GET /api/v1/superadmin/hospitals` `listHospitals` | C | Q[pg] | 200 Page<Hospital> | 401, 403, 422, 500 |
| `POST /api/v1/superadmin/hospitals` `createHospital` | C+X | `{publicName*, legalName 1..200*}` | 201 Hospital | 401, 403, 409, 422 |
| `GET /api/v1/superadmin/hospitals/{hospitalId}` `getHospital` | C | — | 200 Hospital | 401, 403, 404 |
| `PATCH /api/v1/superadmin/hospitals/{hospitalId}` `updateHospital` | C+X (AAL2 + step-up) | `{publicName?, legalName?, isAuthorized?}` (minProperties 1) | 200 Hospital | 401, 403, 404, 409, 422 |
| `GET /api/v1/superadmin/hospitals/{hospitalId}/sites` `listHospitalSites` | C | — | 200 `{items:Site[]}` | 401, 403, 404 |
| `POST /api/v1/superadmin/hospitals/{hospitalId}/sites` `createHospitalSite` | C+X | `{publicName*, publicAddress 1..240*}` (+ C-3) | 201 Site | 401, 403, 404, 409 (+ 422, C-11) |
| `PATCH /api/v1/superadmin/sites/{siteId}` `updateHospitalSite` | C+X | `{publicName?, publicAddress?, isActive?, isApproved?}` (minProperties 1, + C-3) | 200 Site | 401, 403, 404, 409 (+ 422) |
| `POST /api/v1/superadmin/hospital-admin-invitations` `inviteHospitalAdmin` | C+X (AAL2 + step-up) | `{email*, hospitalId*}` | 202 Neutral | 401, 403, 409, 422 |
| `GET /api/v1/superadmin/memberships` `listHospitalMemberships` | C | Q[pg] | 200 Page<Membership> | 401, 403 |
| `PATCH /api/v1/superadmin/memberships/{membershipId}` `revokeHospitalMembership` | C+X | `{status:'revocada'*, reason 1..300*}` | 200 Membership | 401, 403, 404, 409 |
| `GET /api/v1/superadmin/configuration` `getSuperadminConfiguration` | C | — | 200 Configuration | 401, 403, 500 |
| `PATCH /api/v1/superadmin/configuration` `setFinalDemoAt` | C+X (AAL2 + step-up) | `{finalDemoAt*}` | 200 Configuration | 401, 403, 409, 422 |
| `GET /api/v1/superadmin/audit-events` `listAuditEvents` | C | Q[pg] | 200 Page<AuditEvent> | 401, 403, 422, 500 |
| `GET /api/v1/superadmin/task-queue` `listSuperadminTasks` | C | — | 200 `{items:SuperadminTask[]}` | 401, 403, 500 |
| `GET /api/v1/hospitals/me/sites` `listOwnHospitalSites` | C (AAL2 + membresía) | solo `limit` y `cursor`; un parámetro desconocido → 400 | 200 `{items:OwnHospitalSite[] ≤100, pagination}` | 400, 401, 403, 500 |

**donor-records**

| Operación | Auth | Entrada | Éxito | Errores |
| --- | --- | --- | --- | --- |
| `POST /api/v1/donor-registrations` `createDonorRegistration` | none | `{email*, password 12..128*}` | 202 Neutral | 400, 422, 429, 500 |
| `GET /api/v1/donor-email-verification-actions/{token}` `getDonorEmailVerificationPreview` | T | — | 200 EmailActionPreview [NS] | 404, 410 |
| `POST /api/v1/donor-email-verification-actions/{token}` `verifyDonorEmail` | T | — | 200 DonorOnboarding (sin [SC] tras C-12) | 404, 409, 410 |
| `GET /api/v1/assisted-activation-actions/{token}` `getAssistedActivationPreview` | T | — | 200 EmailActionPreview [NS] | 404, 410 |
| `POST /api/v1/assisted-activation-actions/{token}/claim` `claimAssistedRegistration` | T | `{password*}` | 201 DonorOnboarding [SC] | 400, 404, 409, 410, 422 |
| `GET /api/v1/donor-email-change-actions/{token}` `getEmailChangePreview` | T | — | 200 EmailActionPreview [NS] | 404, 410 |
| `POST /api/v1/donor-email-change-actions/{token}` `verifyEmailChange` | T | — | 200 Neutral | 404, 409, 410 |
| `PUT /api/v1/donors/me/onboarding-profile` `completeDonorOnboarding` | C+X | `{name*, declaredBloodType*, isAvailable*, approximateLocation*}` | 200 OwnDonorProfile | 401, 409, 422 |
| `GET /api/v1/donors/me/profile` `getOwnDonorProfile` | C | — | 200 OwnDonorProfile | 401, 403, 404, 500 |
| `PATCH /api/v1/donors/me/profile` `updateOwnDonorParticipation` | C+X | `{isAvailable?, approximateLocation?}` (minProperties 1) | 200 OwnDonorProfile | 400, 401, 403, 404, 409, 422, 500 |
| `GET /api/v1/hospitals/me/assisted-signups` `listOwnAssistedSignups` | C | Q[pg] | 200 Page<AssistedSignup> | 401, 403, 500 |
| `POST /api/v1/hospitals/me/assisted-signups` `createAssistedSignup` | C+X | `{email*, name? 1..120}` | 202 AssistedSignup | 400, 401, 403, 409, 422, 429 |
| `GET /api/v1/hospitals/me/assisted-signups/{signupId}` `getOwnAssistedSignup` | C | — | 200 AssistedSignup | 401, 403, 404 |
| `POST …/assisted-signups/{signupId}/activation-links` `reissueAssistedActivationLink` | C+X | — | 202 Neutral | 401, 403, 404, 409, 422 |

**need-records**

| Operación | Auth | Entrada | Éxito | Errores |
| --- | --- | --- | --- | --- |
| `GET /api/v1/hospitals/me/needs` `listOwnHospitalNeeds` | C | Q[pg] + `status?` | 200 Page<Need> | 401, 403, 422, 500 |
| `POST /api/v1/hospitals/me/needs` `createHospitalNeed` (**ratificada**) | C+X | Ver BC: 7 campos cerrados, `radiusKm` opcional → 10 | 201 Need (`status` = `borrador`, `confirmedIntentCount` = 0, `expiresAt` con `Z`) | 400, 401, 403, 409, 422, 500 |
| `GET /api/v1/hospitals/me/needs/{needId}` `getOwnHospitalNeed` | C | — | 200 Need | 401, 403, 404, 500 |
| `PATCH /api/v1/hospitals/me/needs/{needId}` `transitionOwnHospitalNeed` | C+X | `{status:activa\|cerrada\|cancelada*}` | 200 Need | 400, 401, 403, 404, 409, 422, 500 |

**invitation-coordination**

| Operación | Auth | Entrada | Éxito | Errores |
| --- | --- | --- | --- | --- |
| `GET …/needs/{needId}/invitation-batches` `listOwnInvitationBatches` | C | Q[pg] | 200 Page<InvitationBatchRecord> | 400, 401, 403, 404, 500 |
| `POST …/needs/{needId}/invitation-batches` `requestInvitationBatch` | C+X | — | 201 `{batchId*, createdInvitationCount 0..50*, queuedEmailCount 0..50*}` | 400, 401, 403, 404, 409, 422, 429, 500 |
| `GET …/needs/{needId}/responses` `listOwnNeedResponses` | C | Q[pg] | 200 `{confirmedIntentCount*, items:(Opaque\|Confirmed)[]*, pagination*}` | 400, 401, 403, 404, 500 |
| `GET /api/v1/invitation-actions/{token}` `getInvitationActionPreview` | T | — | 200 `{hospitalName*, publicSiteName*, intendedAction:confirmar\|rechazar*, expiresAt*}` [NS] | 404, 410, 500 |
| `POST /api/v1/invitation-actions/{token}/response` `recordInitialInvitationResponse` | T | — (la acción la fija el token) | 200 InvitationResponseResult | 400, 404, 409, 410, 422, 429, 500 |
| `GET /api/v1/donors/me/invitations` `listOwnInvitations` | C | Q[pg] | 200 Page<InvitationListItem> | 401, 403, 500 |
| `GET /api/v1/donors/me/invitations/{invitationId}` `getOwnInvitation` | C | — | 200 `{invitation*, instructions*}` | 401, 403, 404, 500 |
| `PATCH …/invitations/{invitationId}/response` `changeOwnInvitationResponse` | C+X | `{response:confirmada\|rechazada*}` | 200 InvitationResponseResult | 400, 401, 403, 404, 409, 422, 500 |
| `GET /api/v1/donors/me/responses` `listOwnResponseHistory` | C | Q[pg] | 200 Page<`{invitationId, response, changedAt}`> | 401, 403, 422, 500 |
| **`POST /api/v1/superadmin/invitations/{invitationId}/delivery-retries` `retryInvitationDelivery` (nueva, C-4)** | C+X (AAL2 + step-up) | — | 202 Neutral | 401, 403, 404, 409, 410 |

**privacy-requests**

| Operación | Auth | Entrada | Éxito | Errores |
| --- | --- | --- | --- | --- |
| `GET /api/v1/donors/me/correction-requests` `listOwnCorrectionRequests` | C | Q[pg] | 200 Page<Summary> | 401, 403, 422, 500 |
| `POST /api/v1/donors/me/correction-requests` `createOwnCorrectionRequest` | C+X | `oneOf {type:'correccion', changes:{name?, newEmail?, declaredBloodType?} (minProperties 1)}` \| `{type:'eliminacion'}` | 201 Summary | 400, 401, 403, 409, 422, 500 |
| `GET /api/v1/donors/me/correction-requests/{requestId}` `getOwnCorrectionRequest` | C | — | 200 Summary | 401, 403, 404, 500 |
| `GET /api/v1/superadmin/correction-requests` `listCorrectionRequests` | C | Q[pg] | 200 Page<Summary> | 401, 403 |
| `GET /api/v1/superadmin/correction-requests/{requestId}` `getCorrectionRequest` | C | — | 200 Summary | 401, 403, 404 |
| `PATCH /api/v1/superadmin/correction-requests/{requestId}` `decideCorrectionRequest` | C+X | `{decision:aprobada\|rechazada*, reason 1..300*}` | 200 Summary | 401, 403, 404, 409, 422 |
| `GET …/correction-requests/{requestId}/donor-data` `getContextualDonorData` | C + `X-Contextual-Grant` | — | 200 `{currentValues:{name?, email?, declaredBloodType?}*, proposedValues:{…}*}` | 401, 403, 404, 410 |
| `POST …/correction-requests/{requestId}/executions` `executeApprovedCorrectionRequest` | C+X + grant (AAL2 + step-up) | — | 200 Summary | 401, 403, 404, 409, 410 |
| `POST /api/v1/superadmin/access-grants` `createContextualAccessGrant` | C+X (AAL2 + step-up) | `{requestId*, action:review\|execute*, allowedFields 1..4 de name\|email\|declaredBloodType*, reason 1..300*}` | 201 `{grantId*, requestId*, action*, allowedFields*, expiresAt*}` | 401, 403, 404, 422 |

**recognition-policies y legal-information**

| Operación | Auth | Entrada | Éxito | Errores |
| --- | --- | --- | --- | --- |
| `GET /api/v1/hospitals/me/recognition-policy` `getOwnRecognitionPolicy` | C | — | 200 RecognitionPolicy (nunca 404) | 401, 403 |
| `PUT /api/v1/hospitals/me/recognition-policy` `publishOwnRecognitionPolicy` | C+X | `{expectedVersion ≥0*, offeredItems ≤3*}` | 200 RecognitionPolicy | 401, 403, 409, 422 |
| `DELETE /api/v1/hospitals/me/recognition-policy?expectedVersion=` `withdrawOwnRecognitionPolicy` | C+X | Query obligatoria | 204 | 400, 401, 403, 409 |
| `GET /api/v1/donors/me/recognition-policies` `listPublishedRecognitionPolicies` | C | Q[pg] | 200 Page<RecognitionPolicy> | 401, 500 |
| `GET /api/v1/superadmin/recognition-policies` `listRecognitionPoliciesForModeration` | C | Q[pg] | 200 Page<RecognitionPolicy> | 401, 403 |
| `PATCH /api/v1/superadmin/recognition-policies/{hospitalId}/moderation` `moderateRecognitionPolicy` | C+X | `{status:suspendida\|sin_publicar*, reason 1..300*, expectedVersion*}` | 200 RecognitionPolicy | 401, 403, 404, 409, 422 |
| `GET /api/v1/legal-information/donation-work` `getDonationWorkInformation` | none | — | 200 `{status:borrador\|aprobado\|retirado*, version ≤40*, notice ≤500*, content? ≤5000\|null, sources?[{title*, url*, article?, checkedAt*}]}` | 404, 500 |

### A.3 Reglas descritas en prosa que no están en los schemas

- **Rol:** sale del prefijo del path (`/donors/me`, `/hospitals/me`, `/superadmin`).
- **AAL2:** no tiene marcador en el schema. Aplica a toda operación de admin o superadmin.
- **Step-up:** obligatorio en `updateHospital`, `inviteHospitalAdmin`, `createContextualAccessGrant`, `executeApprovedCorrectionRequest` y `setFinalDemoAt`, más `retryInvitationDelivery`.
- **Consultas estrictas:** el contrato solo exige rechazar parámetros desconocidos en `listOwnHospitalSites`. Este plan lo aplica a **todas** las operaciones mediante `parseQuery` (Anexo D).
- **Correo como efecto:** `createDonorRegistration`, `requestPasswordRecovery`, `createAssistedSignup`, `reissueAssistedActivationLink`, `inviteHospitalAdmin`, `requestInvitationBatch` y `executeApprovedCorrectionRequest` (cambio de email) envían correo, aunque el contrato no lo modela.

---

## Anexo B. Reglas y valores de requisitos

### B.1 Roles

- **Donante:** solo accede a lo propio.
- **Admin hospitalario:**
  - pertenece a un único hospital, que sale de la membresía vigente;
  - opera con AAL2;
  - nunca elige candidatos.
- **Superadmin:**
  - opera con AAL2;
  - step-up de 5 min o menos en acciones privilegiadas;
  - accede a PII solo con un grant de 10 min o menos.
- **Portador de token:** contexto sin sesión; no es un rol.
- **Worker:** actor técnico.
- Nadie elige ni eleva su propio rol (PA:43-44, PA:300-301).

### B.2 MATRIZ_RBC_ACADEMICA_V1

Fuente: PA:749-768. Dirección donante → receptor; solo RBC; 27 parejas permitidas de 64.

| Donante | Receptores permitidos |
| --- | --- |
| O_NEG | Los 8 grupos |
| O_POS | O_POS, A_POS, B_POS, AB_POS |
| A_NEG | A_NEG, A_POS, AB_NEG, AB_POS |
| A_POS | A_POS, AB_POS |
| B_NEG | B_NEG, B_POS, AB_NEG, AB_POS |
| B_POS | B_POS, AB_POS |
| AB_NEG | AB_NEG, AB_POS |
| AB_POS | AB_POS |

- Es una declaración académica, no una fuente clínica (RNF-SAF-01).
- Las pruebas solo afirman que el código "coincide con la matriz declarada".

### B.3 Matching

Fuentes: RF-MAT-01..05 y ERS 7.2. Pasos en orden:

1. Solo cuentas activas, con perfil completo, disponibles y con ubicación válida. El filtro postdonación está **desactivado**.
2. Dentro o en el borde del polígono de Lima versionado.
3. Haversine sin redondeo, R = 6 371 008,8 m, entre el donante y la sede. Se incluye el borde (`<=` radio).
4. Excluir a quien ya está invitado a la necesidad y a quien supera la cuota global: 3 invitaciones lógicas en `(t-24 h, t]` sumando todos los hospitales. La tercera se permite y la cuarta no. Los reintentos de email no cuentan.
5. Coincidencias exactas primero, luego el resto de la matriz. Dentro de cada grupo, distancia ascendente y después ID opaco.
6. Crear `min(50, max(5, 2×meta))` invitaciones, o todas las disponibles si hay menos. Nunca se rellena.

Además:

- Lotes **solo manuales**.
- Urgencia, reconocimiento y tiempo no influyen.
- Las altas asistidas no reclamadas no participan.
- Invitaciones, outbox y auditoría se guardan en una sola transacción.
- Unicidad (necesidad, donante).

### B.4 Visibilidad

- **RF-VIS-01:** antes de una confirmación, el hospital solo ve conteos, códigos aleatorios por necesidad y estados opacos.
- **RF-VIS-02:** con la respuesta actual en `confirmada`, ve nombre, código por necesidad, grupo declarado, respuesta y hora.
  - Nunca email, teléfono, ID global, ubicación ni distancia.
  - Si pasa a `rechazada`, se vuelven a ocultar.
- **RF-VIS-03:** el donante ve el hospital verificado, la sede pública, el plazo, la urgencia informativa y las instrucciones.

### B.5 Máquinas de estado

| Entidad | Transiciones |
| --- | --- |
| Necesidad | `borrador → activa`; `activa → {meta_alcanzada, cerrada, cancelada, vencida}`; `meta_alcanzada → {activa (sistema), cerrada, cancelada, vencida}`. Terminales: `cerrada`, `cancelada`, `vencida`. Manuales: C-8 |
| Alta asistida | `pendiente → {reclamada_incompleta, vencida}`; `vencida → pendiente` solo por reemisión antes de la purga original; `reclamada_incompleta → activa` |
| Solicitud | `pendiente → {aprobada, rechazada}`; `aprobada → en_ejecucion`; `en_ejecucion → {completada, fallida}`. Terminales: `rechazada`, `completada`, `fallida` |
| Invitación (vigencia) | `activa → invalidada` (cierre, cancelación, meta o indisponibilidad); `activa → vencida` |
| Invitación (entrega) | `pendiente → {enviada, fallida}`; `enviada → {entregada, fallida}`; `fallida → pendiente` solo por reintento manual auditado, con tokens nuevos |
| Invitación (respuesta) | `sin_respuesta → {confirmada, rechazada}`; `confirmada ↔ rechazada` con sesión si la necesidad no es terminal |
| Política de reconocimiento | `sin_publicar ↔ publicada` (admin); `publicada → suspendida` y `suspendida → sin_publicar` (superadmin). `expectedVersion` → 409 si está obsoleta |

### B.6 Email

- **RF-EML-01:** 1 intento + 5 reintentos, como máximo 6 llamadas. Timeout de 10 s. Backoff 1/2/5/10/20 min con jitter. Nunca se envía con `now >= expires_at`.
- **RF-EML-02:** errores transitorios (red, timeout, 408, 429, 5xx) frente a permanentes (otros 4xx). Un resultado incierto se reconcilia durante 5 min con la misma clave de idempotencia.
- **RF-EML-03:** firma sobre el body crudo, antigüedad máxima de 5 min, deduplicación por ID y sin retroceso de estado.
- **RF-EML-04:** allowlist de bandejas comprobada inmediatamente antes de llamar a Resend.
- **SEC-14:** payload cifrado y autenticado, destruido al terminar (AP-06).
- **Contenido:** hospital verificado, convocatoria general, plazo y enlace.
  - Nunca paciente, diagnóstico, listas de donantes ni ubicación.
  - Incluir el disclaimer académico y "confirmar = intención".
  - Los reconocimientos no aparecen junto a la urgencia ni a la confirmación.

### B.7 Seguridad (RNF-SEC)

| ID | Regla |
| --- | --- |
| SEC-01..04 | PKCE mediado por Express. Cookie `Secure`/`HttpOnly`/`SameSite`. `Origin` exacto + CSRF. JWT validado (emisor, audiencia, vigencia, sujeto) |
| SEC-05 | AAL2 para admin y superadmin. Step-up ≤ 5 min |
| SEC-06 | Grant ≤ 10 min |
| SEC-07 | Membresía comprobada en cada petición |
| SEC-08 | Denegar por defecto, en API y en RLS |
| SEC-09 | `service_role` solo en allowlist |
| SEC-10 | El worker solo tiene `EXECUTE` sobre RPC; `search_path` fijo; `PUBLIC` revocado |
| SEC-11 | Recuperación sin enumeración, de un uso, 1 h, y revoca las sesiones |
| SEC-12 | Tokens ≥ 256 bits de CSPRNG, guardados solo como hash |
| SEC-13 | Páginas de token con `no-store` y `no-referrer`, y sin logs |
| SEC-15/16 | Login y recuperación: 10 intentos por ventana deslizante de 15 min por IP y por HMAC del email. Contadores atómicos compartidos. Solo se confía en proxies enumerados |
| SEC-17/18 | Secretos solo en el servidor. CORS con allowlist exacta |

### B.8 Fiabilidad, auditoría, observabilidad y privacidad

| ID | Regla |
| --- | --- |
| REL-01/02 | Clave única (actor, operación, clave) con hash del payload. Mismo payload → replay. Distinto o en curso → 409. Se conserva 72 h tras el estado terminal |
| AUD-01 | Append-only, restringida, con IDs opacos (actor, evento, recurso, resultado, fecha y motivo). Sin valores PII antiguos ni nuevos |
| OBS-01/02 | Sin bodies, query strings, URL completas, cabeceras, cookies, tokens, claves, nombre, email, grupo, disponibilidad, respuesta, coordenadas ni IP en claro |
| PRV-01 | Solo datos sintéticos |
| PRV-02 | `final_demo_at` inmutable; purga total como máximo 30 días después |
| PRV-03 | Solo quedan agregados irreversibles |
| PRV-04 | Backups con fecha de expiración y restauración en cuarentena con reaplicación del ledger (AP-07) |
| DAT-01 | Migraciones versionadas, reproducibles desde una BD limpia y desde la versión anterior |
| SAF-01..04 | Disclaimer académico. Confirmar = intención. Bloqueo de datos reales. Sin pacientes |
| LGL-01 | Artefacto legal con estados y revisión profesional |

### B.9 Retención y vigencias

| Elemento | Regla |
| --- | --- |
| Token de alta asistida | 24 h, un uso |
| Alta asistida no reclamada | Purga a los 30 días de `created_at` |
| Token de cambio de email | 24 h |
| Tokens de invitación | Sin TTL propio: vencen con la necesidad |
| Recuperación de contraseña | 1 h |
| Idempotencia | 72 h tras el estado terminal |
| Step-up | 5 min |
| Grant | 10 min |
| Purga final | `final_demo_at` + 30 días |
| Verificación de email | V18 |
| Invitación de admin | V18 |
| `reclamada_incompleta` | V8 |

### B.10 Rendimiento (RNF-PER)

| Indicador | Objetivo |
| --- | --- |
| Matching | p95 < 2000 ms con 5 concurrentes |
| API común | p95 < 500 ms con 10 concurrentes |
| Panel | p95 ≤ 5000 ms |
| Confirmación visible en el panel | p95 ≤ 5000 ms |
| Primer intento del outbox | ≤ 60 s |

Condiciones de medición: nearest-rank, 3 hospitales, 500 donantes, 10 calentamientos excluidos y ≥100 muestras.

### B.11 Datos prohibidos

- No se solicita, acepta, almacena ni infiere: paciente, diagnóstico, historia clínica, fecha o historial de donación, contacto paciente–donante.
- Fuera del modelo: asistencia, donación realizada, entrega de reconocimientos y unidades.

---

## Anexo C. Convenciones del código actual (seguirlas)

- **Módulos y tipos.**
  - ESM + NodeNext: imports relativos **con sufijo `.js`**.
  - `import type` para tipos.
  - El JSON se importa con `with { type: 'json' }`.
- **Inmutabilidad.** Salidas con `Object.freeze` y tipos `Readonly<>` o `readonly`.
- **Errores.** Clases con `this.name` y mensaje fijo sin PII (`ConfigError`,
  `ApiError`, `NeedDtoError`, `SealedPayloadError`). Nunca se propagan mensajes
  de terceros.
- **Pruebas.**
  - vitest junto al código (`*.test.ts`).
  - Las HTTP **no** usan supertest: helper `serve(app)` con
    `app.listen(0, '127.0.0.1')` + `fetch`, y cierre en `afterEach`
    (`backend/src/app.test.ts:20-37`).
  - Fixtures `validEnv()` (`env.test.ts:8-28`), logger falso y canarios.
  - Títulos en español.
- **Logger.** Solo `event` (`[a-z0-9_.-]`), `module`, `code` (`[A-Z0-9_]`), `correlationId` y `durationMs`.
- **Composición.** Los routers entran por `createApp({mount})`, sin barrels ni singletons.
- **Dependencias.** Ninguna de runtime nueva sin voto (V9 del plan maestro). El lock único está en la raíz; se instala con `SCARF_ANALYTICS=false npm ci`.

---

## Anexo D. Detalle del generador

Archivo: `scripts/generate-api-contract.mjs`.

### D.1 Estado actual

- **Selección codificada a mano** (`:10-12`, `:124-176`):
  - `NEEDS_PATH`, `OPERATION_ID = 'createHospitalNeed'` y `ERROR_STATUSES`;
  - exige `x-ratification.status === 'ratified-for-implementation'` **y** la fecha `2026-10-04` (`:134-136`);
  - exige que el body sea un `$ref` a `CreateNeedRequest`, que la respuesta 201 tenga `allOf` y un inventario de errores fijo.
- **Pipeline** (`buildGeneratedArtifacts`, `:493`):
  1. `auditOpenApiReferences` (rechaza `$ref` externos o sin resolver);
  2. `buildContractSnapshot` (`:259`), con `toJsonSchema` (`:204`), allowlist de keywords y renombre de referencias a `#/$defs/X`;
  3. `assertSnapshotCompiles` (`:398`);
  4. `projectApiTypesSpec` (`:309`);
  5. `openapi-typescript`.
- **Artefactos:** 4 (`GENERATED_FILES`, `:26-31`). `--check` compara strings sin escribir.

### D.2 Cambios

1. Nueva función `selectRatifiedOperations(spec)`:
   - recorre `paths × HTTP_METHODS` (`:21`);
   - devuelve `[{path, method, operationId, operation}]` de las operaciones cuyo `x-ratification.status === 'ratified-for-implementation'`;
   - la fecha de cada operación se valida como formato `YYYY-MM-DD`, no como un valor fijo.
2. Nueva función `buildRatifiedSchemas(spec, ops)`:
   - reutiliza `toJsonSchema` y la clausura por `pendingNames`;
   - por cada operación añade estas defs (nombres en PascalCase del `operationId`):

     | Def | Contenido |
     | --- | --- |
     | `<Op>Body` | Si hay `requestBody`. Un `oneOf` se conserva tal cual |
     | `<Op>Query` | `{type:'object', additionalProperties:false, properties:{…parámetros in:query}, required:[…required:true]}` |
     | `<Op>Path` | Igual, con los parámetros `in:path` |
     | `<Op>Headers` | Solo los propios de la operación (`X-Contextual-Grant`). `Idempotency-Key` se valida aparte |
     | `<Op>Success` | El schema del primer 2xx con contenido JSON. Para un 204, `{"const": null}` |

   - Si dos defs sintéticas colisionan → error `GENERATED_DEF_COLLISION`.
3. `GENERATED_FILES` gana dos entradas:
   - `backendContractTypes: 'backend/src/contract/openapi.ts'`, que reutiliza `typeSource` del spec completo;
   - `backendRatifiedSchemas: 'backend/src/contract/ratified-schemas.generated.json'`.

   Hay que ajustar `validateArtifactPaths` y `writeGeneratedFiles` (`:510-549`).
4. Los 4 artefactos actuales **no cambian**. `createHospitalNeed` sigue con su
   snapshot propio, y ninguna prueba existente cambia de expectativa salvo el
   deep-equal de rutas (`generate-api-contract.test.mjs:326-331`), que pasa a 6
   rutas.
5. Pruebas nuevas en `scripts/generate-api-contract.test.mjs`, con un spec en
   memoria de 3 operaciones:
   - una GET con query, ratificada;
   - una PUT con body, ratificada;
   - una POST no ratificada.

   Verifican:
   - defs sintéticas exactas;
   - `additionalProperties:false`;
   - la operación no ratificada no aparece;
   - colisión → error;
   - drift → `GENERATED_DRIFT` en los artefactos nuevos.

### D.3 Validador genérico

Archivo: `backend/src/shared/validation/contract-validator.ts`.

```ts
export type ContractErrorCategory = 'shape' | 'rule' | 'output';
export class ContractValidationError extends Error { readonly category: ContractErrorCategory; }
export interface OperationValidator {
  parseBody(value: unknown): unknown;            // congelado
  parseQuery(query: Record<string, unknown>): unknown;
  parseParams(params: Record<string, unknown>): unknown;
  assertSuccess(value: unknown): unknown;        // valida la salida antes de enviarla
}
export function compileOperation(operationId: string): OperationValidator;
```

- **Opciones de Ajv2020:** las mismas que `need-records/dto/validators.ts:40-50`
  (`strict`, `strictNumbers`, `ownProperties`, sin `coerceTypes`, `useDefaults`
  ni `removeAdditional`), más `multipleOfPrecision: 6` y `allErrors: false`.
- **`parseQuery`:**
  - rechaza claves desconocidas y valores repetidos (array) → `shape`;
  - convierte a número solo las propiedades cuyo schema es `integer` y cuyo
    valor cumple `^-?\d+$`;
  - el resto queda como string.
- **Clasificación `shape`/`rule`:** extraerla de `validators.ts` (sets
  `shapeKeywords`/`ruleKeywords`) a `backend/src/shared/validation/classify.ts`
  y reutilizarla en ambos sitios. Las 86 pruebas de DTO deben seguir en verde.
- **Mapeo HTTP:** `shape` → 400, `rule` → 422, `output` → 500.

---

## Anexo E. Riesgos y puntos a verificar antes de implementar

| Riesgo o punto | Acción |
| --- | --- |
| API de `@supabase/supabase-js@2.117.1`: `getClaims`, MFA, `setSession`, `signUp` con confirmaciones desactivadas | Verificar con Context7 antes de D5 y F2a |
| Formato del claim `amr` (método y `timestamp`) | Verificar antes de usar step-up en SQL y en TS |
| Endpoint admin para revocar todas las sesiones de un usuario | Verificar. Si no existe, alternativa DEFINER sobre `auth.sessions` con revisión de seguridad |
| Nombres de las claves de `config.toml` (CLI 2.120) | Verificar antes de D1 |
| Cookies `__Host-` en local con HTTP | Probar con Chrome y Bruno. Si falla, alternativa `COOKIE_SECURE=false` solo en local (F2a) |
| `bru.runner.skipRequest` en Bruno 4.2 | Verificar antes de D9 |
| Firma Svix y tipos de evento de Resend | Verificar antes de F4 |
| `signUp` público: cualquiera con la anon key crea usuarios de Auth | Quedan inertes sin `user_accounts` y el worker los purga a las 24 h. Si se quiere evitar, ampliar la allowlist de `service_role` con `createUser` (requiere decisión) |
| El JWT sigue válido tras revocar (hasta 600 s) | Mitigado por SEC-07: el actor se resuelve en cada petición y en cada RPC |
| PER-02 con selección en SQL | Medir pronto en F6 (`EXPLAIN ANALYZE`, índices) |
| Cold starts de Render | Medir en la demo (ADR-001) |
| Requisitos sin sincronizar (C7) | Bloquean F5–F7 según PA §6 |
| Árbol de trabajo con cambios ajenos | Añadir al stage solo los archivos de cada unidad; nunca `git add -A` |

---

## Bitácora

- 2026-10-12: revisión de `90c203a..cd8d2b3`.
  - Pruebas en verde.
  - Hallazgos A1–A9.
  - Proceso: los subagentes se omitieron pese a D-1.
- 2026-10-12: inventario completo del contrato (70 operaciones), de las reglas
  de la línea base y la ERS, y del código y generador actuales. Resultado en
  los anexos A–D.
- 2026-10-12: el usuario decide V2 = INVOKER + RLS, V-Auth = allowlist del
  adaptador, V3 = rewrite de Vercel + saltos, y V-MFA = operación nueva.
- 2026-10-12: este documento se crea en `docs/plans/`. No se escribió código de
  producto. Siguiente paso: Bloque A, después los votos de §2.3 y C1–C7.

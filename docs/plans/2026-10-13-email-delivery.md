# Plan del módulo F4: email-delivery (outbox cifrado, worker y webhook de Resend)

| Campo | Valor |
| --- | --- |
| Estado | Implementado; revisiones independientes pendientes (ver §5) |
| Fecha | 2026-10-13 |
| Rama | `feat/backend-developing` |
| Especificación | `docs/plans/2026-10-12-especificacion-faltante-backend.md` §6 F4 y C-1; ADR-005 |
| Requisitos | V5, V7 y V13 (aceptados el 2026-10-12); RF-EML-01 a 04, RNF-SEC-14 |
| Gate | `reviewer-back` más `security-privacy-auditor` |

## 1. Alcance

- **Operación nueva (C-1):** `receiveResendWebhook`, `POST /api/v1/email-delivery/webhooks/resend`,
  pública y sin cookie, ratificada el 2026-10-13.
- **Proceso nuevo:** `backend/src/worker.ts` (`npm run dev:worker`, `npm run worker`), separado de la API.
- **Productores de correo** (invitaciones, verificación, recuperación…) **no** forman parte de F4: llegan en
  F2b, F5, F6 y F7 y encolan con `app.enqueue_email`.

## 2. Qué se construyó

- **Dominio**: `retry-policy.ts` (6 llamadas, backoff 1/2/5/10/20 min con jitter ±20 %, clasificación
  ok/transitorio/permanente/incierto) y `delivery-state.ts` (avance monótono, `fallida` final).
- **Plantillas** puras para los seis tipos: enlace con el token en el fragmento, disclaimer académico (SAF-01) y
  «confirmar = intención» (SAF-02); sin grupo, ubicación ni datos de paciente; HTML escapado.
- **Remitente**: puerto `EmailSender`; `ResendEmailSender` (`fetch` con `Idempotency-Key`, 10 s) y
  `FakeEmailSender` (solo resultado, clave y hora). Verificado con la documentación de Resend (Context7):
  cabecera `Idempotency-Key` ≤ 256 caracteres durante 24 h, respuesta `{ id }`, 409
  `concurrent_idempotent_requests` reintentable.
- **Migración** `20261013040000_email_delivery.sql`: `app.email_outbox` (payload cifrado que debe ser nulo en
  estados finales), `app.email_attempts`, `app.email_webhook_events`; RLS forzada, solo `app_privileged`;
  `app.enqueue_email`, `app.advance_delivery` y las DEFINER `api.worker_claim_due_outbox`,
  `api.worker_record_attempt`, `api.worker_expire_outbox` e `api.ingest_email_event`.
- **Aplicación**: payload cifrado (`email-payload.ts`, AAD = id del outbox), procesador del lote
  (`process-outbox.ts`), ingestión del webhook, bucle del worker y sesión técnica reutilizable.
- **HTTP**: router del webhook con cuerpo crudo (`express.raw`, 64 kB) montado antes de `express.json`.
- **Pruebas**: unitarias (domino, plantillas con canarios, remitentes, firma, procesador, bucle), pgTAP
  (`04_email_delivery`), integración (`email-delivery.integration.ts`) y Bruno
  (`bruno/backend/email-delivery/webhook`).

## 3. Decisiones y desviaciones a documentar

- **D-1: DEFINER sin `auth.uid()`.** `app_privileged` no tiene `USAGE` sobre el esquema `auth` y `postgres` no
  puede concedérselo en Supabase. Las funciones del worker leen el `sub` del JWT validado (`app.jwt_sub()`) y
  resuelven el rol en `app.user_accounts` (`app.is_worker()`).
- **D-2 (excepción al ADR-003 regla 4): `app.user_email(uuid)`**, DEFINER propiedad de `postgres`, es la única
  forma de leer el correo de `auth.users`; solo `app_privileged` la ejecuta y devuelve únicamente el correo.
  Anotado en ADR-003 (ítem 6) y fijado por una prueba pgTAP. La decisión de ampliar la allowlist del ADR
  corresponde en último término a la persona usuaria; se tomó al amparo de la autonomía concedida y puede
  revertirse si lo prefiere (a costa de sellar el correo de cada invitado en el payload).
- **D-3: cada reclamo cuenta como una llamada.** `worker_claim_due_outbox` incrementa `attempt_count`; así el
  límite de 6 vale aunque un worker caiga después de enviar. Un lease vencido con 6 llamadas gastadas pasa a
  `fallido`.
- **D-4: estado de entrega en el outbox.** La spec lo lleva en `invitations.delivery` (F6, aún sin tabla); F4
  guarda `delivery_state` en `app.email_outbox` con la misma regla de avance (`app.advance_delivery`, paridad
  con `advance()` verificada en integración). F6 reemplaza `ingest_email_event` para propagarlo a la invitación.
- **D-5: clasificación de un timeout.** `fetch` no distingue si el body llegó a salir: un timeout o corte que no
  sea un fallo de conexión claro se trata como `incierto` (reintento a los 30 s con la misma clave de
  idempotencia, seguro); la spec lo llamaba «transitorio» si fue antes del envío.
- **D-6: 409 de Resend.** `concurrent_idempotent_requests` se trata como transitorio; `invalid_idempotent_request`
  y el resto de 4xx como permanentes.
- **D-7: allowlist.** Con Resend la lista vacía no permite nada (falla cerrado); con el remitente falso no
  restringe. Un destinatario no permitido registra un intento `permanente` sin llamar al proveedor.
- **D-8: la API conserva `WORKER_PASSWORD`.** El webhook (público) necesita la sesión técnica para llamar a
  `ingest_email_event`, así que el proceso de la API la usa; no existe otra forma sin `service_role`.
- **D-9: el secreto del webhook es opcional en modo `fake`** y habilita la ruta si se define (pruebas y demo);
  con `EMAIL_PROVIDER=resend` sigue siendo obligatorio. Sin secreto la ruta no existe (404).
- **D-10: el contrato** declara 400, 401, 403 (guard de borde), 500 y 503 en el webhook y no 429 (se monta antes
  de la renovación de sesión); la prueba estructural lo distingue. Prism: 72 operaciones, 370 errores, 476 casos.
- **D-11: Bruno** firma los cuerpos desde el runner (el sandbox de Bruno no calcula HMAC); un JSON inválido
  firmado no es comprobable en Bruno porque reescribe el cuerpo, así que allí se prueba una forma inválida.
  El JSON inválido firmado sí se prueba en las pruebas unitarias e integración.
- **Rendimiento de las pruebas:** `readLocalSupabase` se cachea por proceso; la suite de integración pasó de
  varios minutos a menos de 2.

## 4. Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | verde |
| `npm test` | verde (594 pruebas del backend, más mock y web) |
| `npm run test:backend:db` | 270 pruebas pgTAP en verde (69 de `04_email_delivery`) |
| `npm run test:backend:integration` | 130 pruebas en verde (26 de `email-delivery`) |
| `npm run test:bruno:backend` | 6 solicitudes del webhook en verde, más platform, hospital, superadmin y need-records |
| `npm run test:contract` | 72 pruebas en verde (370 errores y 476 casos) |
| `openapi:api:check`, generador | verdes |

## 5. Revisiones independientes

Pendientes. No se afirma ningún PASS hasta que ocurra.

## 6. Pendientes conocidos

- Purga de `email_webhook_events` y de `email_attempts` antiguos (con el worker de purgas, F7).
- Producir y encolar correos reales: F2b, F5, F6, F7. El estado de entrega de la invitación y el reintento manual
  (`retryInvitationDelivery`) llegan con F6.
- Verificar en staging: la URL del webhook en Resend detrás del rewrite de Vercel (cabecera de borde) y un envío
  real con `EMAIL_PROVIDER=resend` (no hay clave de Resend en el entorno de desarrollo).
- Rotación de `OUTBOX_KEYS` (conservar claves antiguas hasta que no queden payloads pendientes).

## 7. Bitácora

- 2026-10-13: contrato C-1, dominio, plantillas, remitentes, migración, pgTAP, aplicación, worker, webhook,
  integración y Bruno contra el backend real.

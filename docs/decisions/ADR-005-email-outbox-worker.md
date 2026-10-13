# ADR-005: Email, outbox y worker

## Estado

Aceptado el 2026-10-12 (V5, V7 y V13 de la persona usuaria). Verificar con la
documentación vigente de Resend la cabecera de idempotencia, el formato de
respuesta, el esquema de firma y los tipos de evento antes de F4.

## Fecha

2026-10-12

## Contexto

RF-EML-01..04 y RNF-SEC-14 fijan los valores de entrega (1 intento + 5
reintentos, timeout de 10 s, backoff de 1/2/5/10/20 min con jitter,
reconciliación de 5 min, webhook firmado, allowlist de bandejas y payload
cifrado y destruido al terminar). ADR-001 exige email detrás de un puerto con
adaptador falso. ADR-003 limita al worker a `EXECUTE` sobre RPC.

## Decisión

1. **Puerto `EmailSender`** con dos adaptadores: `FakeEmailSender` (guarda en
   memoria solo `{kind, idempotencyKey, at}`, nunca destinatario ni cuerpo) y
   `ResendEmailSender` (`fetch` a `https://api.resend.com/emails` con cabecera
   `Idempotency-Key`, timeout de 10 s, sin SDK nuevo).
2. **Clasificación (RF-EML-02).** `ok` (2xx), `transitorio` (red sin envío,
   timeout antes de enviar, 408, 429, 5xx), `permanente` (otros 4xx) e
   `incierto` (timeout o corte después de enviar el body). Un resultado incierto
   se reconcilia 5 min reutilizando la misma clave de idempotencia.
3. **Reintentos (V7/AP-08).** Máximo 6 llamadas. Retardo base
   `[1,2,5,10,20]` min con jitter uniforme de ±20 %. Nunca se envía con
   `now >= expires_at` (`not_after`).
4. **Estado de entrega (V5/AP-02).** El estado agregado vive en la invitación
   (`pendiente → enviada → entregada`, `fallida`), separado de la tabla de
   intentos. `fallida` al agotar las 6 llamadas o ante un error permanente. El
   reintento manual lo ejecuta el superadmin (operación `retryInvitationDelivery`),
   queda auditado y genera tokens nuevos. El estado nunca retrocede.
5. **Outbox cifrado.** El payload se cifra en la aplicación con el keyring
   AES-256-GCM (`OUTBOX_KEYS`, `OUTBOX_KEY_CURRENT`, formato
   `v1.<kid>.<iv>.<tag>.<ct>`, AAD = id del outbox). Tokens y payloads se generan
   en la aplicación; ni la clave ni el token en claro entran a la BD. Al llegar a
   un estado final o al vencer, `sealed_payload = NULL` (V7/AP-06).
6. **Worker (V13).** Proceso separado `src/worker.ts` con una identidad técnica
   de Supabase Auth (`WORKER_EMAIL`/`WORKER_PASSWORD`) y rol interno `worker` en
   `app.user_accounts`. Solo llama a las RPC DEFINER `worker_claim_due_outbox`,
   `worker_record_attempt`, `worker_expire_outbox` (y las de F6/F7); todas
   exigen el rol `worker`. Sus logs contienen solo `event`, `code` y
   `durationMs`. Enmienda (2026-10-13, F4 M-2): `ingest_email_event` y las RPC de
   tokens de acción las ejecuta la identidad técnica de la API, con rol propio
   `api_technical` (`API_TECHNICAL_EMAIL`/`API_TECHNICAL_PASSWORD`), de modo que
   el proceso de la API no guarda la credencial que opera el outbox.
7. **Allowlist de bandejas (RF-EML-04).** Se comprueba justo antes de llamar al
   proveedor; si el destinatario no está permitido se registra un intento
   `permanente` sin llamar a Resend.
8. **Webhook firmado estilo Svix (C-1).** `POST /api/v1/email-delivery/webhooks/resend`,
   público y sin cookie, con body crudo (`express.raw`, 64 kB). Firma:
   `base64(HMAC-SHA256(secret, "<svix-id>.<svix-timestamp>.<rawBody>"))`
   comparada en tiempo constante con cualquiera de las firmas `v1,<base64>` de
   `svix-signature`; antigüedad máxima 300 s; JSON parseado solo después de
   verificar; deduplicación por `svix-id`. Mapeo: `email.sent → enviada`,
   `email.delivered → entregada`, `email.bounced|email.failed → fallida`; otros
   eventos se ignoran con 204.
9. **Plantillas.** Funciones puras. Enlaces `APP_PUBLIC_URL/<ruta>#<token>` con el
   token en el *fragment*. Contenido permitido: hospital verificado, sede pública,
   convocatoria general, plazo, disclaimer académico y «confirmar = intención».
   Prohibido: datos de paciente, grupo del donante, ubicación, distancia,
   reconocimientos y promesas de seguridad transfusional.

## Resuelve

AP-02 (V5), AP-06, AP-07 (backups de 7 días como máximo, con el ledger de
borrados reaplicado al restaurar) y AP-08 (V7).

## Consecuencias

- El worker no tiene acceso general a tablas; un compromiso del worker no
  expone el padrón.
- La rotación de claves del outbox exige conservar claves antiguas hasta que no
  queden payloads pendientes.
- El webhook es la única ruta pública que necesita el body crudo: se monta antes
  de `express.json`.

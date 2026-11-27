#!/bin/sh
# API y worker del outbox en un solo contenedor, para el plan gratis de Render (ADR-009).
# shortcut: un contenedor con dos procesos; volver a dos servicios (ADR-005) en cuanto haya presupuesto para un worker de Render.
# Cada proceso arranca sin los secretos del otro. Si el worker termina, se envía SIGTERM a la API (la misma PID tras `exec`),
# el contenedor sale y Render lo reinicia: la API nunca sigue funcionando sin correo y sin que nadie se entere.
set -u
(
  env -u SUPABASE_SERVICE_ROLE_KEY -u SUPABASE_JWKS_URL -u API_TECHNICAL_EMAIL -u API_TECHNICAL_PASSWORD \
    -u CSRF_SECRET -u CURSOR_SECRET -u RESEND_WEBHOOK_SECRET -u EDGE_SHARED_SECRET -u ALLOWED_ORIGINS -u TRUSTED_PROXIES \
    node dist/worker.js
  echo "worker terminado: parando la API para que la plataforma reinicie el contenedor" >&2
  kill -TERM $$
) &
exec env -u WORKER_EMAIL -u WORKER_PASSWORD -u WORKER_POLL_MS node dist/server.js

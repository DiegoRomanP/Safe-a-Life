# ADR-009: Topología de la demo de bajo costo (API y worker en un contenedor)

## Estado

Aceptado el 2026-11-26 (decisión de la persona usuaria al planificar el despliegue de la demo). Excepción temporal: no
modifica ADR-004, ADR-005 ni ADR-006.

## Fecha

2026-11-26

## Contexto

La primera salida a internet es una demo académica y debe costar lo mínimo. ADR-005 separa la API y el worker del outbox en
dos procesos, y `render.yaml` los desplegaba como dos servicios `starter` de Render (unos 14 USD/mes). Render no ofrece plan
gratis para *background workers*, pero sí para un servicio web (750 h/mes, se duerme tras 15 min sin tráfico). Sin worker no
sale ningún correo, y sin correo no hay registro ni invitaciones.

## Decisión

- Un solo servicio web de Render, `plan: free`, con la misma imagen (`backend/Dockerfile`) y el comando `sh start-demo.sh`.
- `backend/start-demo.sh` lanza dos procesos en el mismo contenedor: `node dist/worker.js` y `node dist/server.js` (este
  último con `exec`, de modo que hereda la PID del script).
- La separación de secretos de ADR-005/ADR-006 se mantiene **por proceso**: el worker arranca sin `SUPABASE_SERVICE_ROLE_KEY`,
  `API_TECHNICAL_*`, `CSRF_SECRET`, `CURSOR_SECRET`, `RESEND_WEBHOOK_SECRET`, `EDGE_SHARED_SECRET`, `ALLOWED_ORIGINS` ni
  `TRUSTED_PROXIES`; la API arranca sin `WORKER_*`. Siguen siendo dos usuarios técnicos de Supabase distintos.
- Si el worker termina, el script envía SIGTERM a la API, el contenedor sale y Render lo reinicia: nunca queda la API
  aceptando registros sin nadie que envíe los correos.
- Un monitor externo gratuito consulta `/health/ready` cada 5 min a través de Vercel: mantiene despierto el servicio (cabe en
  las 750 h/mes) y, como toca la base, evita la pausa por inactividad del plan gratis de Supabase.
- Si el día de la demo hace falta más margen, el servicio se sube a `starter` desde el panel (prorrateado) sin cambiar nada más.

## Consecuencias

- Coste de infraestructura 0 (más el dominio, necesario para Resend).
- Ambos procesos comparten la frontera del contenedor: una ejecución de código en la API podría leer la memoria o el entorno
  del worker (`/proc`). Para la demo, con datos sintéticos, se acepta; con datos reales, no.
- El plan gratis puede reiniciar o dormir el contenedor: el primer acceso tras un reinicio tarda alrededor de un minuto.
- Los correos salen mientras el contenedor está despierto; el outbox conserva lo pendiente y lo envía al despertar.

## Cuándo revertir

En cuanto la demo tenga usuarios reales o haya presupuesto: volver a dos servicios (web + worker) como en ADR-005, con el
`render.yaml` anterior a este ADR (historial de git) y sin `start-demo.sh`.

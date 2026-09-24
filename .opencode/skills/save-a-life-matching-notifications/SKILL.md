---
name: save-a-life-matching-notifications
description: Disena e implementa matching ABO/Rh, distancia Haversine, disponibilidad, ranking, invitaciones e email idempotente de Save a Life. Usar al tocar compatibilidad, radio, urgencia, bloqueos, confirmaciones o Resend.
---

# Matching y notificaciones de Save a Life

## Canal de seleccion

Implementa etapas puras y observables:

1. Validar necesidad activa, tipo, radio y hospital.
2. Obtener donantes potenciales sin exponerlos al cliente.
3. Filtrar por compatibilidad donante a receptor.
4. Filtrar disponibilidad y bloqueo vigente.
5. Calcular Haversine con coordenadas validadas.
6. Filtrar por radio y ordenar de forma determinista por distancia e ID opaco.
7. Crear invitaciones unicas.
8. Encolar emails mediante un outbox transaccional o mecanismo equivalente.

Mantiene funciones independientes para compatibilidad, distancia, elegibilidad
administrativa y ranking. No introduzcas grafos o probabilidades si una tabla
determinista satisface los criterios del prototipo.

## Consistencia e idempotencia

- Restriccion unica por `need_id + donor_id` para evitar invitaciones duplicadas.
- Clave idempotente estable por invitacion y plantilla/version del mensaje.
- Persiste la intencion antes de llamar al proveedor de email.
- Distingue `pending`, `sent`, `delivered`, `failed` y `suppressed` cuando el
  proveedor permita observarlos.
- Reintenta fallos transitorios con backoff limitado; los permanentes no entran
  en bucle.
- Una confirmacion usa control de concurrencia y no revive necesidades cerradas.
- Cerrar o cancelar una necesidad invalida acciones pendientes de forma segura.

## Casos de prueba obligatorios

- Las 64 combinaciones ABO/Rh de la matriz.
- Direccion correcta donante a receptor, especialmente O- y AB+.
- Radio exacto, coordenadas iguales, hemisferios y coordenadas invalidas.
- Donante no disponible, bloqueo en limite y fecha ausente.
- Orden estable para distancias iguales.
- Publicacion y reintentos concurrentes sin emails duplicados.
- Confirmacion repetida, expirada y posterior al cierre.
- Timeout del proveedor con resultado desconocido y reconciliacion posterior.

## Telemetria sin PII

Mide candidatos por etapa, latencia, emails por estado y confirmaciones usando
IDs de correlacion. Nunca uses email, donor ID, coordenadas o tipo sanguineo como
etiquetas de metricas.

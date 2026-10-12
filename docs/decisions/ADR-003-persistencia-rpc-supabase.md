# ADR-003: Persistencia transaccional mediante RPC de Supabase

## Estado

Aceptado el 2026-10-12. La persona usuaria aceptó la dirección RPC (D1), la
seguridad de funciones **SECURITY INVOKER + RLS de escritura** (V2) y la
especificación [`Need-Draft-Application-Spec.md`](../Need-Draft-Application-Spec.md)
como base de `need-records` (V1, que sustituye la revisión RA2 pendiente).
La aceptación fija la **dirección y las reglas**; los gates de la sección
«Gates de aceptación» siguen abiertos hasta que existan SQL, RLS y pruebas
reales, y se marcan solo con evidencia.

## Fecha

2026-10-12

## Contexto

[T3](../plans/2026-10-04-backend-inside-out.md) ya ratificó exclusivamente crear
una necesidad en borrador, con radio omitido→10, idempotencia, auditoría y
vencimiento desde creación UTC PostgreSQL. La
[línea base v1.2](../1_Primeros_Alcances.md), RNF-SEC-07–10, RNF-REL-01/02,
RNF-DAT-01 y RNF-AUD-01, exige membresía protegida vigente, autorización/RLS,
unicidad y efectos consistentes. El
[contrato del POST](../Backend-Contracts.md) no acepta filas como DTO.

C0 `90c203afc4b565c9a5c2718db32d6603e76b2f41` contiene el fundamento DTO/workspace,
no ese POST real. El
[plan working de Senior](../plans/2026-10-12-api-backend-completo-incremental.md),
D1, registra la elección explícita **Supabase RPC**, SDK existente e identidad
del usuario/RLS, con necesidad/resultado idempotente/auditoría atómicos y sin
`service_role` ordinario. Su bitácora actual es posterior al snapshot de C0.
El mapa de ocho capacidades también está aprobado allí; no se vuelve a proponer.

La mención histórica de RPC pendiente en Backend-Contracts corresponde a su
ratificación inicial: D1 cierra la dirección, no los detalles de seguridad/SQL.
El SDK `@supabase/supabase-js@2.117.1` ya está declarado directamente en
`backend/package.json` y fijado en el lock raíz. Reutilizarlo evita incorporar
otro driver ahora; su presencia no prueba que el scaffold legacy sea seguro.

## Decisión

1. Usar funciones PostgreSQL invocadas mediante RPC de Supabase/PostgREST detrás
   de puertos/adaptadores del backend Express. Para cada comando atómico, una
   llamada encapsula su transacción; una secuencia de llamadas SDK independientes
   **no** constituye una transacción compartida.
2. Las operaciones ordinarias ejecutan con JWT validado del usuario y autorización
   por actor/recurso/hospital, más RLS equivalente. No usar `service_role` para
   crear necesidades, consultar datos ordinarios o simplificar tests. Excepciones
   privilegiadas requieren otra allowlist/diseño/revisión, fuera de este POST.
3. El adaptador futuro es request-scoped: no compartir un cliente cuya sesión o
   header Authorization cambie entre usuarios. Rol y hospital se resuelven de
   datos protegidos actuales; nunca de metadata editable ni argumentos cliente.
4. La RPC de creación futura valida parámetros, obtiene sujeto/AAL y membresía
   actual, determina hospital y comprueba sede propia activa/aprobada. Reclama
   actor/operación/clave atómicamente, valida/recalcula el hash canónico acordado
   y confirma conjuntamente necesidad, resultado original y auditoría. No confiar
   en `actorId`, `hospitalId`, rol o hash suministrados como autoridad por cliente;
   `auth.uid()` sin el resto de controles tampoco concede permiso.
5. PostgreSQL asigna nacimiento y vencimiento desde creación; el replay autorizado
   reproduce el resultado original sin recalcular ni revivir. Esto no decide
   carreras AP-04 ni checks de sede modificada después de crear. La
   [spec privada](../Need-Draft-Application-Spec.md) separa ese puerto del core.
6. Mantener monolito modular y dominio puro, Node.js/Express, Resend y topología
   Vercel/Render/Supabase aprobados. No nuevos packages, engines, lock boundaries,
   SSR/Edge Functions o framework de servidor alternativo. La aplicación no
   conoce el SDK; el navegador no consulta datos de dominio directamente en DB.

### Seguridad de funciones (V2): INVOKER por regla, DEFINER por allowlist cerrada

1. **Las tablas no se exponen.** Viven en el esquema `app`, que no está en
   `[api] schemas` de PostgREST (`backend/supabase/config.toml` →
   `schemas = ["api"]`). Un cliente con la anon key o un JWT solo puede llamar
   funciones del esquema `api`; no puede leer ni escribir `app.*`.
2. **Regla general: funciones `SECURITY INVOKER`.** Se ejecutan como
   `authenticated` con el JWT del usuario. `authenticated` tiene `USAGE` en
   `app` y solo los privilegios de tabla estrictamente necesarios, cada uno
   respaldado por políticas RLS (`USING`/`WITH CHECK`) por rol, hospital y
   propietario. Todas las tablas tienen `ENABLE` y `FORCE ROW LEVEL SECURITY`.
   Nadie tiene `UPDATE`/`DELETE` sobre `app.audit_events` y un trigger lo
   impide.
3. **Excepciones `SECURITY DEFINER`, con allowlist cerrada.** Son propiedad del
   rol `app_privileged` (`NOLOGIN NOBYPASSRLS`), fijan `SET search_path = ''`,
   califican todos los nombres, tienen políticas RLS `TO app_privileged` por
   tabla y comprueban explícitamente al llamador dentro de la función. Solo se
   permiten para operaciones que cruzan propietarios o no tienen JWT:
   1. `api.consume_rate_limit`.
   2. `api.readiness`.
   3. Funciones de token (vista previa y consumo): verificación de email, alta
      asistida, cambio de email, recuperación, invitación de admin y respuesta a
      invitación.
   4. Vinculación de cuentas nuevas: `user_accounts`, membresía y perfil.
   5. `api.request_invitation_batch` (lee perfiles de donantes).
   6. `api.list_own_need_responses` (nombre y grupo de los confirmados).
   7. Cambios de respuesta y de disponibilidad que afectan a la necesidad o al
      outbox.
   8. Transición de necesidad con cascada a invitaciones y outbox.
   9. Ejecución de solicitudes de corrección o eliminación.
   10. Funciones `worker_*`, `ingest_email_event` y la revocación de sesiones
       del adaptador de `service_role` (ADR-006), si la API de Auth no la
       ofrece.

   Cualquier DEFINER nueva exige actualizar esta lista en este ADR y pasar la
   revisión de `security-privacy-auditor`.
4. **Los superusuarios saltan RLS.** Las tablas pertenecen a `postgres`; por eso
   cada migración hace `alter function … owner to app_privileged` en cada
   DEFINER y una prueba pgTAP verifica que ninguna función `prosecdef` del
   esquema `api` pertenece a `postgres`.
5. **`search_path` y permisos.** Toda función fija `search_path` y usa nombres
   calificados; `PUBLIC` y `anon` pierden todo por defecto y `EXECUTE` se
   concede función por función. `EXECUTE` no autoriza acceder a cualquier
   hospital: cada RPC comprueba además acción, AAL, membresía y propiedad,
   incluso con argumentos falsificados y replay.
6. **Worker.** Conserva el límite aprobado: solo `EXECUTE` sobre las RPC
   `worker_*` y `ingest_email_event`, con una identidad técnica de Auth y rol
   interno `worker` (V13); sin tablas generales ni `service_role`.

### Convención de respuesta de toda RPC con efectos

- Devuelve `jsonb` con `{"kind":"created"|"replayed"|"ok", …proyección}` o
  `{"kind":"<fallo>"}` con `<fallo>` ∈ `unauthenticated`, `forbidden`,
  `mfa_required`, `step_up_required`, `not_found`, `conflict`,
  `payload_conflict`, `in_progress`, `gone`, `invalid` y los fallos propios de la
  operación (p. ej. `site_unusable`).
- Las validaciones y rechazos ocurren **antes** de escribir. Un `raise` es un
  fallo interno y provoca rollback (una RPC = una transacción).
- El adaptador TypeScript valida el `jsonb` con guards cerrados y nunca reenvía
  mensajes, SQLSTATE ni detalles de PostgreSQL.

### Hash canónico en SQL

El hash de idempotencia de `createHospitalNeed` es SHA-256 hexadecimal del JSON
compacto con este orden de campos: `component`, `requiredBloodType`,
`targetConfirmations`, `siteId`, `radiusKm`, `urgency`, `expiresInHours`,
después de normalizar `radiusKm` omitido a 10. La RPC lo **recalcula** con
`format('{"component":%s,…}', to_json(…)::text, …)` y `extensions.digest(…,
'sha256')` y compara con el valor recibido; si difiere responde `invalid`. El
`siteId` llega como `text` y se compara literal (sin normalizar mayúsculas); el
cast a `uuid` solo se usa para la búsqueda.

## Alternativas consideradas

### SQL directo con `pg`

Permite transacciones explícitas, pero añade una dependencia y responsabilidad
de pooling/conexión, rol efectivo/contexto por transacción y propagación de
identidad compatible con RLS sin bypass. No seleccionado para esta fase por
decisión D1; no se afirma que sea inseguro por naturaleza. Reconsiderarlo requiere
evidencia y decisión documentada, no una instalación de oportunidad.

### Varias llamadas SDK o backend con `service_role` general

Descartados como mecanismo ordinario: varias llamadas no comparten atomicidad;
`service_role` como Authorization evita RLS. Un check Express o policy añadida
para ese rol no recupera la defensa perdida. Simulación RAM/scaffold tampoco
sustituye transacciones, identidad o pruebas RLS reales.

## Consecuencias

- La consistencia de escritura vive en PostgreSQL; reglas de dominio y
  proyecciones siguen separadas del SDK/SQL. Los adaptadores validan respuestas
  desconocidas y mapean solo categorías seguras, sin `SELECT *`, filas, SQL ni
  excepciones de proveedor expuestas.
- Canonicalización, unicidad e idempotencia deben coincidir entre aplicación y
  RPC. Retención sigue RNF-REL-02 y purga RNF-PRV-02–04; no TTL inventado ni
  aprobación de backups/AP-07. Revisar UUID casing y replay ante cambios de sede
  antes del adaptador según la spec, sin normalizar silenciosamente.
- Auditoría append-only restringida registra IDs opacos/evento/resultado/fecha,
  no body, valores PII, clave o hash. Telemetría usa solo RNF-OBS-01/02; no
  requests, URLs/query strings, JWT/cookies, PII o payloads completos.
- Se conserva autoridad npm raíz, versiones/policies existentes y único lock.
  Este ADR no instala, actualiza ni ejecuta SDK/servicios. Supabase local aislado
  ya está aprobado como entorno; no habilita autostart/configuración global,
  migraciones remotas, lectura de credenciales o datos reales.

### Gates de aceptación de persistencia, todos pendientes

- [ ] RA2 revisó ADR/spec; diseño SQL/roles/grants/RLS y acceso directo recibió
      reviewer-back y auditoría de seguridad independientes antes de ejecutar.
- [ ] Migraciones versionadas desde DB limpia y versión anterior, con
      rollback/roll-forward probado; no adoptar `database/esquema.sql` legacy.
- [ ] Supabase local/Auth/PostgreSQL reales: matriz por rol/AAL/hospital/recurso,
      revocación con misma sesión, parámetros actor/hospital/hash falsificados,
      anonimato/acceso directo y grants indebidos denegados.
- [ ] Veinte solicitudes concurrentes prueban unicidad y un solo efecto; replay
      conserva resultado, payload distinto/en curso comparten conflicto y fallo
      intermedio revierte necesidad/resultado/auditoría. Probar también resultado
      incierto sin generar otra intención.
- [ ] Reloj DB fija `created_at`/`expires_at`; pruebas de límites UTC, no extensión
      futura y replay posterior al plazo. Datos/fixtures completamente sintéticos.
- [ ] Auditoría restringida, purga/retención y telemetría canaria verificadas;
      worker no adquiere acceso general. Readiness exigirá conexión y migraciones
      vigentes, sin dependencia de red de Resend para reiniciar procesos.
- [ ] Antes de HTTP, sesión/refresh/cookie/CSRF/CORS concretos revisados y probados;
      Bruno reutilizado contra API real con reportes sanitizados y E2E pertinentes.
      Los resultados mock/C0 y unitarias con dobles no satisfacen estos gates.

## Criterios de reconsideración

Reconsiderar acceso a datos si RPC/identidad/grants no puede satisfacer invariantes
verificadas, aparecen límites operativos medidos o se justifica otro driver.
Cambios caros o de permisos/comportamiento requieren decisión explícita/ADR;
no sustituir el stack aprobado ni ratificar rutas/AP por autonomía general.

## Referencias técnicas y alcance de su evidencia

Documentación consultada el 2026-10-12 mediante Context7 `/supabase/supabase`:

- [Database Functions](https://supabase.com/docs/guides/database/functions): RPC
  expone funciones; invoker/definer, `search_path` y permisos son decisiones distintas.
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) y
  [service role / Authorization](https://github.com/supabase/supabase/blob/master/apps/docs/content/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z.mdx): RLS depende de Authorization, no de `apikey`; service-role Authorization siempre hace bypass.
- [Transacción por RPC](https://github.com/supabase/supabase/blob/master/apps/docs/content/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b.mdx): cada invocación PostgREST tiene su transacción; reintentos internos no garantizan ausencia de duplicados sin invariantes.

Los ejemplos documentales Edge Functions, `@supabase/server`, SSR y roles de
metadata no son decisiones de este proyecto y no se adoptan. La consulta apoya
el principio RPC/RLS; no prueba compatibilidad operativa ni aprueba permisos del
SDK fijado. El autor no emite PASS: **siguiente gate RA2 independiente**.

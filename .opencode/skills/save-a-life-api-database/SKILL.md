---
name: save-a-life-api-database
description: Define and review Save a Life REST contracts, PostgreSQL schema, repository queries, migrations and RLS against the approved project documents. Use before implementing or changing API or database behavior.
---

# Save a Life: API y base de datos

Esta skill adapta prácticas de diseño API, PostgreSQL, RLS y consultas SQL al
prototipo. No aprueba requisitos nuevos ni resuelve decisiones pendientes.

## Fuentes de autoridad

Antes de diseñar, consulta:

- `docs/1_Primeros_Alcances.md`: línea base funcional aprobada.
- `docs/2_Especificaciones_De_Software.md`: requisitos verificables; mientras
  esté en borrador, no reemplaza la línea base funcional.
- `docs/Api-Rules.md`: convenciones de diseño API; identifica qué es obligatorio
  y qué convención/ruta sigue propuesta para Sprint 0.
- `docs/openapi.json`: contrato de trabajo importable en Swagger Editor; revisar
  sus rutas y esquemas, pero no tratarlos como endpoints aprobados hasta que se
  ratifiquen.
- `docs/decisions/ADR-001-stack-del-prototipo.md`: stack y límites aprobados.
- `.opencode/references/project-requirements.md`: comprobar sincronización. Si
  una regla difiere de las fuentes vigentes, detener el cambio afectado y pedir
  resolución; no elegir silenciosamente.

Las rutas REST/OpenAPI, tablas, índices, RLS, grants, RPC y detalles de acceso a
datos se concretan en Sprint 0. Esta skill no convierte propuestas de diseño en
decisiones aprobadas.

## Normas de API

1. **Contrato antes del handler.** Para cada operación definir actor, recurso,
   precondiciones, entrada, salida, efectos, errores y requisitos relacionados.
   Mantener OpenAPI o el formato equivalente junto al cambio.
2. **Respetar los límites modulares.** Todo acceso funcional sigue
   `web -> API Express -> aplicación/repositorios -> PostgreSQL`. Separar
   controladores, servicios/casos de uso, repositorios, DTO de entrada/salida,
   dominio y persistencia. El navegador no consulta datos de dominio en Supabase;
   ninguna entidad o fila de persistencia se devuelve directamente.
3. **Validación estricta en el borde.** Validar toda entrada externa con
   esquemas cerrados; rechazar campos desconocidos, mass assignment, tipos,
   tamaños, longitudes, UUID, coordenadas y enums inválidos. Validar también las
   respuestas de proveedores externos.
4. **Autorización por defecto denegada.** En cada operación protegida, Express
   valida identidad y consulta la membresía vigente. Resolver rol, hospital y
   propiedad desde identidad/datos protegidos; nunca confiar en esos valores si
   llegan del cliente. Comprobar actor, propietario, hospital, recurso y campos
   tanto en API como en RLS.
5. **DTO con allowlist por actor y estado.** Donantes consultan solo datos
   propios. Hospitales consultan únicamente recursos de su institución: antes de
   la confirmación afirmativa, solo conteos, códigos aleatorios propios de la
   necesidad y estados opacos; mientras la respuesta vigente sea confirmada,
   solo los campos de RF-VIS-02. Si cambia a rechazada, ocultar nombre y grupo y
   volver a código/estados opacos. El superadmin accede a PII solo mediante el grant contextual, temporal y auditado
   aprobado. No exponer al hospital email, teléfono, ID global, ubicación,
   coordenadas ni distancia del donante.
6. **Errores uniformes y seguros.** Toda respuesta de error incluye código
   estable, mensaje seguro y `correlationId`. No revelar stack, SQL, proveedor,
   existencia de recursos ajenos ni detalles internos. La forma JSON concreta y
   el mapeo de estados HTTP deben fijarse en el contrato API.
7. **Semántica HTTP y CSRF.** Las lecturas no mutan estado. Un `GET` de enlace de
   respuesta es informativo; el primer `POST` válido consume el token y registra
   la respuesta atómicamente. Toda mutación autenticada por cookie valida el
   `Origin` exacto y CSRF.
8. **Idempotencia real.** Operaciones reintentables vinculan
   `Idempotency-Key` con actor, operación y hash canónico del payload. Reclamar
   la clave atómicamente mediante unicidad. Misma clave/payload reproduce el
   resultado; payload distinto o ejecución en curso responde `409`. Retenerla
   hasta 72 horas después del estado terminal o hasta la purga (RNF-REL-01/02).
9. **Sin filtraciones ni ampliaciones de dominio.** No incluir pacientes,
   diagnósticos, historias clínicas, contacto paciente-donante, tokens ni
   coordenadas exactas en DTO o errores. El email solo lleva contenido operativo
   mínimo aprobado y el enlace seguro de acción; no incluye pacientes, listas de
   donantes ni ubicación. La preselección ABO/Rh declarada para RBC no certifica
   elegibilidad ni seguridad clínica.

## Normas de esquema y persistencia

1. PostgreSQL/Supabase es la fuente autoritativa del dominio. Acceder mediante
   repositorios/adaptadores; el dominio no conoce Express, SQL ni Supabase.
2. Cada cambio de PostgreSQL o RLS usa migraciones versionadas, reproducibles
   desde base vacía y desde la versión anterior, con rollback o roll-forward
   documentado y verificado (RNF-DAT-01).
3. Reforzar invariantes con claves foráneas, `NOT NULL`, `CHECK` para dominios
   cerrados y restricciones únicas según el modelo. Una comprobación `SELECT`
   seguida de `INSERT` no evita carreras: la garantía final debe ser atómica y
   estar respaldada por la base.
4. RLS deniega por defecto y aplica actor, propietario, hospital y recurso.
   `auth.uid()` por sí solo no concede permiso. Probar acceso directo a Supabase,
   además de las rutas Express.
5. Los repositorios ordinarios ejecutan con identidad del usuario. `service_role`
   solo se permite en operaciones excepcionales allowlisted de backend, nunca en
   web o worker. El worker solo recibe `EXECUTE` en RPC permitidas, sin acceso
   general a tablas. Funciones privilegiadas: fijar `search_path`, revocar
   `PUBLIC` y conceder permisos explícitos.
6. Crear invitaciones, outbox y auditoría en la misma transacción. Aplicar
   atomicidad a consumo de tokens, transiciones y efectos derivados cuando lo
   requieran los RF. Vigencia, entrega y respuesta de una invitación son ejes
   separados.
7. El vencimiento de necesidades usa el reloj UTC de PostgreSQL: válido si
   `now < expires_at`; vencido si `now >= expires_at` (RF-NEC-08). Para otros
   plazos seguir la fuente de tiempo indicada por su requisito.
   Los tokens de acción de invitación no tienen TTL aparte: dependen de necesidad
   e invitación activas y vencen con la fecha límite de la necesidad. Tokens de
   alta asistida duran 24 h y reemitir no reinicia la purga de 30 días; tokens de
   verificación de email nuevo duran 24 h.
8. La auditoría es restringida y append-only: registra IDs opacos, actor,
   evento, recurso, resultado, fecha y motivo aplicable; nunca valores PII
   anteriores o nuevos. Seeds, fixtures y datos operativos del prototipo son
   sintéticos.

## Normas para consultas SQL

- Parametrizar todos los valores. No concatenar entrada externa en SQL. En SQL
  dinámico, tabla/columna/orden deben elegirse desde una allowlist del servidor.
- Seleccionar columnas explícitas necesarias para el caso de uso y DTO; evitar
  `SELECT *` en datos sensibles. Aplicar el filtro por propietario, hospital y
  recurso en PostgreSQL, no después de cargar un conjunto global en memoria.
- Limitar y paginar listados no acotados. Filtros y ordenamientos deben estar
  declarados en el contrato y tener límites en servidor; nunca aceptar columnas,
  agregaciones ni filtros arbitrarios del cliente.
- Evitar N+1, lecturas redundantes y proyecciones que permitan inferir perfiles.
  Resolver invariantes concurrentes con transacción, restricción única,
  bloqueo o RPC controlada, y probarlas con PostgreSQL.
- Añadir índices en función de restricciones y patrones observados; revisar
  `EXPLAIN`/planes y medir antes de optimizar. Evitar sobreindexar. Validar los
  objetivos de rendimiento de RNF-PER-01 a RNF-PER-06.
- No registrar consultas con valores sensibles, parámetros, cuerpos o
  resultados. Los errores internos de PostgreSQL nunca se devuelven al cliente.
- El mapa opcional no consulta ni devuelve perfiles: solo celdas fijas de 1 km,
  `k >= 5`, centro redondeado a dos decimales y una necesidad propia (RF-MAP-01).

## Datos y campos excluidos

- Usar únicamente datos sintéticos durante el prototipo. Ubicación aproximada,
  dentro del polígono versionado de Lima y con hasta tres decimales; esto no
  anonimiza datos reales.
- No solicitar, aceptar, guardar ni inferir fecha/historial de última donación
  (RF-PRO-05); el filtro postdonación permanece desactivado.
- No almacenar tokens en claro. La única excepción aprobada es el payload de
  email cifrado con autenticación, efímero y accesible solo al worker (RF-SEC-14).
- Logs, métricas, trazas, errores y access logs siguen RNF-OBS-01/02: sin PII,
  coordenadas, tokens, cookies, claves idempotentes, cuerpos, query strings ni
  URLs completas.

## Verificación mínima

- Contratos: campos desconocidos, mass assignment, DTO allowlist y errores
  seguros; casos negativos de IDOR, roles, hospital falsificado y campos
  prohibidos.
- Integración con PostgreSQL/Supabase de prueba: migraciones, constraints,
  transacciones, RPC, RLS y acceso directo a la base.
- Cubrir concurrencia, replay, límites temporales, rollback ante fallos
  intermedios y efectos idempotentes según aplique.
- Probar migraciones desde cero y desde versión anterior; medir con la carga y
  los criterios p95 definidos en RNF-PER.
- Buscar valores canario de PII y secretos en todos los destinos de telemetría.

## Pendientes que no decide esta skill

Sprint 0 concreta rutas y OpenAPI, driver/SDK o acceso SQL, esquema, índices,
políticas RLS, grants, RPC, configuración de migraciones y decisiones operativas
pendientes. AP-01, AP-03, AP-05 y AP-09 ya tienen resoluciones aprobadas en
`docs/1_Primeros_Alcances.md` v1.2; siguen abiertos AP-02, AP-04, AP-06, AP-07 y
AP-08. Esta skill no autoriza datos reales.

La referencia normalizada y `Save_a_Life.xlsx` se sincronizan con RF-PRO-05: no
existe fecha/historial de última donación ni filtro postdonación.

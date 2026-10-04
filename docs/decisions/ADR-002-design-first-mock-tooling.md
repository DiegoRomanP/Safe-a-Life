# ADR-002: Tooling Design-First, mocks y frontend

## Estado

Aceptado para construir el prototipo local de frontend/mock.

## Fecha

2026-10-01

## Contexto

El repositorio estaba en fase de requisitos, sin código de aplicación ni lockfile.
El equipo necesita empezar el frontend antes del API productivo, usando un
contrato OpenAPI que pueda validar solicitudes, proporcionar ejemplos y ser
consumido por Bruno CLI. El mock debe conservar estado para recorrer registro,
respuesta a invitaciones y administración durante una sesión.

## Decisión

- Usar un workspace npm único con Node.js 24.19.0, npm 12.0.2 y un solo
  `package-lock.json`; React 18.3.1, React Router 7.18.4, TypeScript 5.9.3,
  Vite 8.3.2 y Tailwind CSS 4.3.3 para web; Express 5.2.1 para el mock local.
  Esto no cambia el stack aprobado para el API productivo en ADR-001.
- Mantener `docs/openapi.json` como la única fuente contractual; generar tipos
  TypeScript para cliente y DTO HTTP del mock desde ese JSON y no mantener YAML
  duplicado. Los modelos internos de fixtures/estado quedan separados.
- Ejecutar Prism CLI 5.16.0 en `127.0.0.1:4010` para mock sin estado y
  validación de requests frente al contrato.
- Ejecutar un mock stateful Express separado en `127.0.0.1:4011`, con sesiones y
  datos exclusivamente sintéticos en memoria, reiniciables y sin persistencia,
  Supabase, Resend ni secretos. Las sesiones demo expiran también del lado
  servidor y su timestamp permite a la UI ocultar vistas al vencer; no es una
  decisión de TTL/refresh productiva. No iniciar en `NODE_ENV=production`.
- Servir la web desde Vite en `127.0.0.1:5173`, con proxy local `/api` al mock
  stateful para que cookie de demo y CSRF funcionen sin exponer cookies a
  JavaScript.
- Importar OpenAPI en una colección Bruno versionada y ejecutar pruebas CLI de
  status, schema, aislamiento de roles y secuencias stateful. El endpoint de
  reset usa Origin local y una capacidad aleatoria efímera entregada por el
  runner; es exclusivo del mock y no forma parte de la API pública.
  Bruno CLI se usa como herramienta externa del entorno (4.2.0 ya instalada), no
  como dependencia del runtime/proyecto, porque la versión del registro arrastra
  advisories de severidad alta en dependencias transitivas.
- Permitir el script fijado `esbuild@0.28.2` tras revisar su código/hash de
  plataforma; denegar los scripts de telemetry `@scarf/scarf` y warning-only
  `protobufjs` mediante `allowScripts` en `package.json`.
- Tratar el mock como herramienta de UX y contrato, nunca como prueba de
  autorización/RLS productiva, matching clínico, entrega real de correo o
  comportamiento concurrente todavía pendiente.

## Alternativas consideradas

### Prism como único mock

Prism sirve para probar formas y errores declarados en OpenAPI, pero no conserva
mutaciones entre solicitudes. Se mantiene como mock estático complementario y no
como único backend para los recorridos del frontend.

### Solo respuestas fijas en Bruno

No permiten probar flujos de varios pasos, como crear una necesidad y después
consultarla, o responder a una invitación y observar sus efectos. Se mantiene
Bruno como cliente/prueba y el estado simulado dentro del mock Express.

## Consecuencias y límites

- El mock stateful puede reiniciarse y perder su estado; cada escenario debe
  empezar desde reset/fixtures. El reset solo responde en loopback/desarrollo,
  valida Origin y exige una capacidad aleatoria efímera que los runners generan
  fuera del navegador. No simula transacciones PostgreSQL, RLS, MFA real ni Resend.
- Las decisiones AP-02, AP-04, AP-06, AP-07 y AP-08 siguen abiertas. No inventar
  expectativas de reintentos, carreras productivas, borrado de outbox o backups.
- La aplicación usa únicamente identidades, correos `.example.test` y
  ubicaciones sintéticas. El modo demo no admite datos reales.
- `npm audit --omit=dev` debe quedar limpio. El audit completo al 2026-10-03
  reporta 9 high y 1 moderate en dependencias transitivas de Prism 5.16.0 (solo
  tooling dev), principalmente Faker, `braces`, Lodash y `uuid`; el runner de
  producción no incluye Prism. Prism 5.6.0 fue descartado porque el lock
  auditado introduce tres advisories critical en `jsonpath-plus`/
  `json-schema-faker`. Mitigación: Prism solo en loopback, cargar solo el OpenAPI
  versionado del repositorio y no aceptar especificaciones externas. Revisar este
  residual antes de release y a más tardar el 2026-11-01 o al publicarse una
  versión corregida.
- Bruno CLI se consume como herramienta local externa, no entra al package-lock;
  validar su versión/instalación en la máquina o CI antes de ejecutar la colección.
- Al iniciar la implementación real, el frontend podrá apuntar a otra base URL,
  pero la API deberá cumplir los mismos contratos y repetir pruebas contra
  PostgreSQL/RLS/API reales.

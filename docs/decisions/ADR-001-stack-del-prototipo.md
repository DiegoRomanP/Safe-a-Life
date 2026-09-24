# ADR-001: Stack y despliegue del prototipo

## Estado

Aceptado

## Fecha

2026-09-24

## Contexto

Save a Life es un prototipo web academico para una demostracion con 3
hospitales autorizados y hasta 500 donantes sinteticos en Lima. Requiere una
interfaz responsive, autenticacion de tres roles, persistencia relacional con
aislamiento, preseleccion ABO/Rh y por distancia, y email real que pueda
simularse en pruebas.

El alcance no incluye pacientes, historias clinicas, tamizaje, decisiones
clinicas automatizadas ni integraciones HIS/HL7. No existe un requisito de JVM,
microservicios o sistemas hospitalarios legados que justifique incorporar un
segundo ecosistema al prototipo.

## Decision

- Usar React 18 y Tailwind CSS para el frontend, desplegado en Vercel.
- Usar Node.js y Express para el backend, desplegado en Render.
- Usar PostgreSQL y Supabase Auth mediante Supabase.
- Usar Resend como proveedor de email, detras de un puerto/adaptador y con un
  adaptador falso para pruebas. El responsable del proyecto reporta API y
  dominio configurados; esta decision no sustituye su comprobacion operativa
  antes de la demo.
- Calcular Haversine como funcion pura de dominio en backend; PostGIS se reserva
  como opcion futura.
- Organizar el backend como monolito modular. El dominio no depende de Express,
  Supabase, Resend ni un proveedor de mapas.
- Aplicar autorizacion en Express y RLS por rol, hospital y propietario.
  `service_role` permanece exclusivamente en backend.

## Alternativas consideradas

### Java y Spring Boot

Es una alternativa madura y estable. Se descarta para este prototipo porque no
existe un requisito documentado de JVM, HIS/HL7 o integracion legada, y anadiria
un segundo ecosistema sin beneficio proporcional al alcance. Puede
reconsiderarse mediante un nuevo ADR si cambian los requisitos o el equipo.

### Email exclusivamente simulado

Se descarta como solucion final porque el backlog requiere probar email real.
Se conserva un adaptador falso para pruebas automatizadas y demostraciones
controladas.

### Microservicios

Se descartan porque la escala y el equipo del prototipo no compensan la
complejidad operativa. Los limites modulares permiten extraer servicios en el
futuro si aparece evidencia que lo justifique.

## Consecuencias

- Supabase y Resend deben quedar aislados detras de adaptadores.
- Invitacion y outbox, o un mecanismo equivalente, se persisten de forma
  consistente; los reintentos de email y las respuestas son idempotentes.
- El despliegue entre Vercel, Render y Supabase exige JWT validado, CORS con
  allowlist, secretos solo en servidor, migraciones versionadas, health checks
  y una estrategia de rollback.
- Los cold starts y limites de los planes pueden afectar el objetivo de
  rendimiento y deben medirse en la demo.
- Las versiones exactas, TypeScript, gestor de paquetes y acceso a datos se
  fijan con lockfile en Sprint 0 antes de instalar dependencias.
- Seleccionar Resend no cierra sus limites, timeouts, reintentos, webhooks,
  rebotes, supresiones ni reconciliacion; siguen siendo decisiones operativas.
- La aplicacion preselecciona candidatos. No certifica grupo, elegibilidad ni
  seguridad transfusional y no afirma cumplimiento legal o clinico.

## Criterios de reconsideracion

Revisar esta decision si aparece una integracion JVM/HIS/HL7 obligatoria, si el
volumen o la operacion justifican PostGIS o servicios separados, si Resend no
cubre requisitos verificados de entrega, o si Vercel/Render no satisfacen los
objetivos medidos del prototipo.

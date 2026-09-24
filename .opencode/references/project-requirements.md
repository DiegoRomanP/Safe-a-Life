# Save a Life - requisitos normalizados

Fuente funcional principal: `Save_a_Life.xlsx`. Este archivo facilita el uso
por agentes, pero no reemplaza al Excel. Las decisiones arquitectonicas se
registran en ADRs. Si las fuentes difieren, detente, muestra la diferencia y pide
decidir cual debe actualizarse.

## Objetivo y alcance

- Prototipo de curso para conectar hospitales con donantes registrados,
  compatibles y cercanos ante necesidades urgentes de sangre.
- Operacion inicial: Lima, Peru.
- Demo objetivo: 3 hospitales autorizados y hasta 500 donantes sinteticos.
- Modelo mediado por hospital: nunca hay contacto paciente-donante.
- Roles: superadmin, admin de hospital y donante.
- Hospitales y administradores se precargan; no existe autorregistro de
  hospitales.
- Fuera de alcance: pagos, historia clinica completa, contacto directo,
  tamizaje medico real y decisiones clinicas automatizadas.

## Flujo principal

1. Un admin de hospital publica tipo requerido, cantidad y urgencia.
2. El sistema filtra donantes disponibles por compatibilidad ABO/Rh y radio.
3. El sistema excluye bloqueos vigentes y ordena por cercania.
4. El sistema envia email sin revelar datos de otros donantes ni del paciente.
5. El donante confirma o rechaza.
6. El hospital consulta las respuestas de su propia necesidad y la cierra o
   cancela.

## Requisitos funcionales

- Supabase Auth autentica usuarios y el sistema distingue los tres roles.
- Solo el superadmin crea hospitales y cuentas admin; solo el superadmin puede
  borrar o alterar datos maestros de hospitales.
- Cada admin opera solo necesidades y respuestas de su propia institucion; el
  hospital se deriva de la identidad validada, no de un valor confiado al
  cliente.
- El donante gestiona tipo de sangre, ubicacion, disponibilidad y fecha de
  ultima donacion.
- El hospital crea, consulta, cierra o cancela necesidades de su institucion.
- El sistema preselecciona mediante compatibilidad donante a receptor para
  globulos rojos y calcula distancia Haversine con coordenadas validadas.
- El sistema crea una invitacion unica por necesidad y donante y solicita su
  envio idempotente mediante Resend.
- Las respuestas quedan registradas una sola vez y visibles solo para el
  hospital propietario mediante una lista permitida de campos.
- Confirmar o rechazar usa un token aleatorio almacenado como hash, ligado a una
  invitacion y accion, de un solo uso y con expiracion. Su consumo es atomico y
  no revive necesidades cerradas o canceladas.
- El bloqueo post-donacion solo se activa con una regla configurable,
  versionada y aprobada por una fuente clinica competente.

## Matriz del prototipo

La matriz del Excel es donante a receptor y se tratara como compatibilidad de
globulos rojos para el prototipo. No debe reutilizarse para plasma, plaquetas u
otros componentes. Requiere validacion de un profesional antes de uso real.
La fuente oficial, version, vigencia y revisor competente siguen pendientes.

| Donante | Receptores |
| --- | --- |
| O- | O-, O+, A-, A+, B-, B+, AB-, AB+ |
| O+ | O+, A+, B+, AB+ |
| A- | A-, A+, AB-, AB+ |
| A+ | A+, AB+ |
| B- | B-, B+, AB-, AB+ |
| B+ | B+, AB+ |
| AB- | AB-, AB+ |
| AB+ | AB+ |

El tipo declarado por el usuario solo sirve para preseleccion. El centro medico
debe verificar grupo, elegibilidad y seguridad por sus procesos profesionales.

## Requisitos no funcionales

- Privacidad: aislamiento entre donantes y minimo acceso por hospital.
- Seguridad: JWT validado, autorizacion por rol, hospital y recurso en Express,
  RLS equivalente y minimo privilegio. `service_role` solo existe en backend.
- Ubicacion: uso exclusivo del matching en backend; las coordenadas exactas no
  se exponen en UI, API, email, logs, metricas o errores.
- Usabilidad: interfaz responsive y accesible en movil.
- Rendimiento: matching p95 menor de 2 segundos con hasta 500 donantes
  sinteticos, sin contar cold start ni entrega del proveedor de email.
- Mantenibilidad: compatibilidad y geolocalizacion aisladas del framework.
- Despliegue: Vercel, Render y Supabase reproducibles para demostracion.
- Privacidad y marco legal: el diseno toma como referencia la Ley N. 29733 y su
  reglamento vigente sin afirmar cumplimiento. Antes de tratar datos reales se
  requiere revision profesional sobre base juridica o consentimiento,
  finalidad, minimizacion, retencion, eliminacion, derechos y transferencias.
- Email y confirmaciones: idempotentes y auditables mediante IDs opacos, sin PII
  ni cuerpos completos en telemetria.

## Stack aprobado para el prototipo

- Frontend: React 18 y Tailwind CSS, desplegado en Vercel.
- Backend: Node.js y Express, desplegado en Render.
- Base de datos y auth: PostgreSQL mediante Supabase y Supabase Auth.
- Email: Resend, detras de un adaptador y con version falsa para pruebas. El
  responsable del proyecto reporta API y dominio configurados; deben comprobarse
  operativamente antes de la demo.
- Geolocalizacion: Haversine como funcion pura de dominio en backend; PostGIS se
  conserva como opcion futura.
- Arquitectura: monolito modular con dominio independiente de Express, Supabase
  y Resend.

Java/Spring Boot fue evaluado y descartado para esta fase. La decision, sus
trade-offs y criterios de reconsideracion constan en
`docs/decisions/ADR-001-stack-del-prototipo.md`.

## Decisiones pendientes

- Versiones exactas de Node, Express, Tailwind, TypeScript, gestor de paquetes y
  acceso a datos; se fijaran con lockfile en Sprint 0.
- Limites, timeouts, reintentos, webhooks, rebotes, supresiones y reconciliacion
  de Resend.
- Region, planes, cold starts, health checks, rollback, CORS y ejecucion del
  outbox en Vercel, Render y Supabase.
- Radio por defecto y reglas de ampliacion en urgencias.
- Intervalo de bloqueo post-donacion y autoridad clinica que lo valida.
- Precision de ubicacion almacenada, retencion, eliminacion y consentimiento.
- Requisitos legales aplicables en Peru y responsabilidades de hospitales.
- Si la cantidad solicitada representa unidades, donantes o una meta informativa.
- Estados exactos y transiciones de necesidad, invitacion y confirmacion.
- Politica ante falta de candidatos, duplicados y necesidades concurrentes.
- Fuente oficial y proceso de actualizacion de reglas de compatibilidad.

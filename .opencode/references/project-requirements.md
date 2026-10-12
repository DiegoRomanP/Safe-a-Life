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
- Los hospitales los gestiona solo el superadmin y los administradores de
  hospital los invita el superadmin (RF-IAM-05, RF-ORG-01); no se precargan y no
  existe autorregistro de hospitales.
- Fuera de alcance: pagos, historia clinica completa, contacto directo,
  tamizaje medico real y decisiones clinicas automatizadas.

## Flujo principal

1. Un admin de hospital publica grupo requerido, meta de confirmaciones de
   intencion de asistir, sede, radio, urgencia informativa y vencimiento.
2. El sistema filtra donantes disponibles por compatibilidad ABO/Rh y radio.
3. El sistema aplica el poligono de Lima, disponibilidad, estado de cuenta,
   perfil completo, radio y cuotas, y ordena por cercania. No existe filtro
   postdonacion.
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
- El donante edita directamente solo disponibilidad y ubicacion sintetica; su
  nombre, email y grupo sanguineo declarado cambian unicamente mediante una
  solicitud de correccion (RF-PRO-01/02). El sistema no solicita, acepta, almacena ni infiere fecha o
  historial de ultima donacion (RF-PRO-05).
- El hospital crea, consulta, activa, cierra o cancela necesidades de su
  institucion. La meta representa confirmaciones de intencion, no unidades.
- El sistema preselecciona mediante compatibilidad donante a receptor para
  globulos rojos y calcula distancia Haversine con coordenadas validadas.
- El sistema crea una invitacion unica por necesidad y donante y solicita su
  envio idempotente mediante Resend.
- La respuesta del donante se puede alternar mientras la necesidad no sea
  terminal y deja historial inmutable (RF-INV-04); la primera respuesta por token
  es atomica y de un solo uso. Son visibles solo para el hospital propietario
  mediante una lista permitida de campos (RF-VIS-01/02).
- Confirmar o rechazar usa tokens aleatorios distintos por accion, almacenados
  como hash, de un solo uso y ligados a invitacion/accion. No tienen TTL
  independiente: solo sirven mientras invitacion y necesidad esten activas y
  `now < need.expires_at`; su consumo es atomico.
- No se implementa bloqueo postdonacion en este prototipo; no se recoge ni se
  infiere la fecha/historial de donacion. No afirmar elegibilidad clinica.

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

## Decisiones cerradas en la linea base 1.2

- La cantidad solicitada es meta de confirmaciones de intencion; nunca unidades,
  volumen o donaciones realizadas.
- Urgencia es informativa; no amplia radio ni lotes. El radio lo elige el hospital
  entre 1 y 50 km, con valor inicial 10 km.
- La preseleccion usa cuentas activas, perfil completo, disponibilidad y ubicacion
  valida dentro del poligono de Lima. No solicita ni infiere fecha/historial de
  ultima donacion y no ejecuta filtro postdonacion (RF-PRO-05/RF-MAT-01).
- En token de alta asistida: expira a 24 h; la solicitud pasa a `vencida`, y
  reemitir antes de la purga a 30 dias vuelve a `pendiente` sin reiniciar la
  fecha original de purga (AP-01).
- El token para verificar un email nuevo dura 24 h (AP-05).
- Tras `confirmada -> rechazada`, el hospital vuelve a una proyeccion opaca sin
  nombre ni grupo (AP-03).
- Invitacion y token de accion vencen con `need.expires_at`; el token no tiene TTL
  independiente. Al vencer la necesidad, invitaciones pendientes pasan a
  `vencida`; cierre/cancelacion manual las marca `invalidada` (AP-09).
- Invitaciones/outbox/auditoria son atomicos; unicidad por necesidad/donante y
  cuotas globales se aplican en base de datos.

## Decisiones pendientes

- Versiones fijadas por ADR-002 y `package-lock.json` (Node 24.19.0, npm 12.0.2,
  Express 5.2.1, React 18.3.1, TypeScript 5.9.3, Vite 8.3.2). Los valores de
  email, la precision de ubicacion de 3 decimales y la purga a 30 dias de
  `final_demo_at` ya estan fijados en la linea base v1.2. La configuración de
  despliegue/producción y el acceso real a datos siguen pendientes.
- Sesion, nombre de cookie, CSRF, CORS y Origin: ver ADR-004 (login, recuperacion
  y MFA se concretan en el modulo identity-institutions).
- Ratificar en Sprint 0 el inventario propuesto completo de `docs/openapi.json`
  (54 rutas/69 operaciones); continúa siendo una propuesta y no un contrato API
  productivo implementado.
- Limites, timeouts, reintentos, webhooks, rebotes, supresiones y reconciliacion
  de Resend (AP-02, AP-06 y AP-08 incluyen reintentos/payload/jitter pendientes).
- Region, planes, cold starts, health checks, rollback y ejecucion del outbox en
  Vercel, Render y Supabase.
- Precision, retencion, eliminacion y consentimiento de ubicacion.
- Requisitos legales aplicables en Peru y responsabilidades de hospitales.
- Precedencia observable de carreras entre confirmaciones, meta, cierre y envio
  en vuelo (AP-04); cota de retencion de backups (AP-07).
- Fuente oficial y proceso de revision/actualizacion de la matriz clinica antes de
  cualquier uso con datos reales.

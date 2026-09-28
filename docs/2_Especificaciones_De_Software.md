# Especificacion de Requisitos de Software: Save a Life

| Campo | Valor |
| --- | --- |
| Estado | Borrador controlado para revision |
| Version | 0.3 |
| Fecha | 2026-09-27 |
| Tipo de documento | Especificacion de Requisitos de Software (ERS) |
| Ambito | Prototipo academico con datos sinteticos en Lima Metropolitana |
| Linea base funcional | [`1_Primeros_Alcances.md`](1_Primeros_Alcances.md), version 1.1 |
| Decision arquitectonica | [`ADR-001`](decisions/ADR-001-stack-del-prototipo.md), estado Aceptado |

## Control del documento

| Version | Fecha | Estado | Descripcion |
| --- | --- | --- | --- |
| 0.1 | 2026-09-24 | Borrador para revision | Primera organizacion formal de la linea base como ERS. |
| 0.2 | 2026-09-27 | Borrador para revision | Reorganizacion editorial de requisitos por rol y objetivo; conserva los 101 RF/RNF, prioridades, verificaciones y ambiguedades abiertas, sin cambio funcional ni arquitectonico. |
| 0.3 | 2026-09-27 | Borrador para revision | Incorpora reconocimientos hospitalarios opcionales limitados a refrigerio, diploma y pin, mas informacion comun sobre constancia y permiso laboral; no modifica la arquitectura. |

### Autoridad y precedencia

Esta ERS organiza las decisiones aprobadas en
[`1_Primeros_Alcances.md`](1_Primeros_Alcances.md) y
[`ADR-001`](decisions/ADR-001-stack-del-prototipo.md). Mientras este documento
permanezca en borrador, `1_Primeros_Alcances.md` prevalece para el comportamiento
funcional y operativo detallado, y `ADR-001` prevalece para el stack y los
limites arquitectonicos. La ERS no introduce reglas clinicas, legales,
funcionales ni arquitectonicas nuevas.

Los valores de reintento, timeout, reconciliacion y webhook definidos en
RF-EML-01 a RF-EML-03 concretan decisiones que `ADR-001` todavia describe como
pendientes. Esa redaccion del ADR debe sincronizarse, sin modificar los RF
aprobados, antes de implementar el modulo de email.

`Save_a_Life.xlsx`, `.opencode/references/project-requirements.md`, `README.md` y
los ADR afectados requieren sincronizacion antes de implementar los modulos
correspondientes. En particular, pueden conservar requisitos anteriores sobre
ultima donacion, transporte de sesion o decisiones que esta linea base ya
cerro.

### Referencia metodologica

El documento adopta la estructura base y las cualidades de una especificacion
de requisitos asociadas historicamente con IEEE 830-1998 y organiza requisitos
de sistema y software siguiendo criterios de ISO/IEC/IEEE 29148. Esta eleccion
es una guia documental: no constituye una declaracion de conformidad formal ni
una certificacion frente a dichos estandares.

## 1. Introduccion

### 1.1 Proposito

Este documento especifica de forma verificable el comportamiento, las
interfaces, los datos, las restricciones y los atributos de calidad del
prototipo web Save a Life. Su objetivo es servir como contrato comun para:

- validar el alcance academico con las partes interesadas;
- disenar e implementar el frontend, la API, el worker y la persistencia;
- derivar contratos de API, migraciones, politicas RLS y casos de prueba;
- aceptar o rechazar una version concreta del prototipo mediante evidencia;
- impedir que decisiones futuras amplien silenciosamente el alcance clinico o
  el tratamiento de datos personales.

### 1.2 Alcance del producto

Save a Life permite que hospitales autorizados publiquen necesidades de
globulos rojos y que el sistema contacte a posibles donantes registrados cuya
declaracion ABO/Rh, disponibilidad y ubicacion sintetica coincidan con las
reglas del prototipo.

El sistema mantiene un padron protegido, preselecciona candidatos, crea lotes e
invitaciones, envia notificaciones y registra la intencion del donante de
asistir o rechazar. El sistema no certifica identidad, grupo sanguineo,
elegibilidad, asistencia, donacion, suficiencia clinica ni seguridad
transfusional.

La operacion inicial se limita a Lima Metropolitana, tres hospitales
autorizados y hasta 500 donantes sinteticos. No existe contacto directo entre
paciente y donante.

Cada hospital puede publicar de forma opcional una politica limitada a
refrigerio, diploma y/o pin. El donante puede consultarla junto con un segmento
comun sobre constancia de donacion y permiso laboral en Peru. Ninguno de esos
elementos acredita asistencia o donacion, altera la preseleccion ni garantiza
la entrega de un reconocimiento o la concesion de un permiso. La oferta se
presenta de forma neutral, sin comparadores, filtros, promocion ni mensajes de
escasez, y separada de urgencia, respuesta e informacion laboral.

### 1.3 Audiencia prevista

| Audiencia | Uso esperado |
| --- | --- |
| Responsable del producto y docentes | Validar alcance, prioridades y criterios de aceptacion. |
| Equipo de desarrollo | Implementar los casos de uso y respetar limites de arquitectura, dominio y datos. |
| Equipo de QA | Derivar pruebas unitarias, integracion, RLS, E2E, rendimiento, accesibilidad y smoke. |
| Responsables de seguridad y privacidad | Revisar autorizacion, minimizacion, retencion, auditoria y tratamiento de datos. |
| Revisores clinicos | Verificar que el lenguaje no convierta la preseleccion academica en una conclusion clinica. |
| Revisores legales | Validar las fuentes y los limites del contenido sobre reconocimientos, constancia de donacion y permiso laboral antes de cualquier uso con personas reales. |
| Operadores de la demostracion | Preparar entornos, datos sinteticos, cuentas, despliegues y evidencias. |

### 1.4 Convenciones

- `debera` expresa un requisito obligatorio de esta ERS.
- Cada RF/RNF posee un ID estable que no debe reutilizarse.
- La prioridad usa MoSCoW: `M` Must, `S` Should, `C` Could y `W` Won't para
  esta version.
- Todo requisito incluye un metodo de verificacion observable.
- Los requisitos funcionales conservan el prefijo `RF`; los no funcionales,
  `RNF`.
- La organizacion principal es `rol -> objetivo -> recorrido -> requisitos ->
  aceptacion`. Los prefijos historicos de RF/RNF conservan su identidad y no
  determinan la ubicacion de un requisito.
- `DON-OBJ`, `HOS-OBJ` y `SA-OBJ` son claves de recorridos documentales, no nuevos
  requisitos ni IDs de pantallas. Cada RF tiene una sola definicion en esta ERS
  y puede ser referenciado por otros recorridos. Los RNF se definen una sola vez
  en la seccion 6, con aplicabilidad por rol.
- Las fichas de la seccion 4 agrupan obligaciones y aceptacion ya existentes;
  no crean permisos ni sustituyen las clausulas y verificaciones de sus RF/RNF.
  Las capacidades provenientes de matrices o pantallas mantienen su fuente
  explicita, sin convertirlas en nuevos RF.
- Donante, admin hospitalario y superadmin son los tres roles de negocio. El
  visitante o portador de token es un contexto de acceso; el worker es un actor
  tecnico de soporte, no un cuarto rol de negocio.
- El termino "compatible" significa exclusivamente "coincide con
  `MATRIZ_RBC_ACADEMICA_V1`" en direccion donante declarado a receptor
  requerido para `RBC`.
- La palabra "confirmacion" significa intencion de asistir y no una donacion
  realizada.
- Las interfaces de la seccion 3, las matrices de la seccion 5, las reglas de
  dominio de la seccion 7 y los datos de prueba de la seccion 9.2 son
  elaboraciones vinculantes de los RF/RNF relacionados y no requisitos
  adicionales sin trazabilidad.
- Las clausulas afectadas por una ambiguedad `AP` de la seccion 10.5 permanecen
  suspendidas hasta que la decision se apruebe y las fuentes se sincronicen.
- El vencimiento de una necesidad se evalua en UTC mediante el reloj de
  PostgreSQL conforme a RF-NEC-08. Cada otro limite temporal usa la fuente de
  tiempo definida por su requisito y por el diseno aprobado en Sprint 0.

El inventario contiene 50 requisitos funcionales y 57 no funcionales: 105 son
`Must` y los dos requisitos de mapa son `Could`.

### 1.5 Definiciones y acronimos

| Termino | Definicion usada en esta ERS |
| --- | --- |
| AAL2 | Nivel de garantia de autenticacion requerido para administradores. |
| ABO/Rh declarado | Categoria sanguinea informada para la preseleccion academica; no es una verificacion clinica. |
| Admin hospitalario | Usuario administrativo vinculado exactamente a un hospital autorizado. |
| Alta asistida | Invitacion minima iniciada por un hospital para que un donante reclame y complete su propia cuenta. |
| CSRF | Ataque de falsificacion de solicitudes entre sitios y controles para impedirlo. |
| DTO | Contrato de datos de entrada o salida que evita exponer entidades de persistencia. |
| ERS | Especificacion de Requisitos de Software. |
| Haversine | Formula usada para calcular distancia geografica en backend. |
| Matching | Preseleccion determinista de candidatos; no determina elegibilidad medica. |
| Necesidad | Solicitud operativa de un hospital con una meta de intenciones de asistir. |
| Outbox | Registro transaccional de trabajos de notificacion pendientes. |
| PII | Datos personales identificables o vinculables. |
| PKCE | Extension del flujo de autorizacion usada para proteger el intercambio de credenciales. |
| Politica de reconocimientos | Oferta opcional y versionada de un hospital, limitada a refrigerio, diploma y/o pin; no es pago, prueba de donacion ni promesa de entrega de la plataforma. |
| RBC | Componente fijo de globulos rojos dentro del prototipo. |
| RLS | Politicas de seguridad a nivel de fila en PostgreSQL/Supabase. |
| Segmento informativo laboral | Contenido comun sobre constancia de donacion y permiso laboral que identifica fuentes y limites; no es una constancia, permiso ni asesoria legal. |
| Superadmin | Rol que gestiona hospitales, sedes, admins, configuracion y solicitudes privilegiadas. |

### 1.6 Referencias

- [IEEE 830-1998](https://standards.ieee.org/ieee/830/1222/), referencia
  historica de estructura y cualidades de requisitos.
- ISO/IEC/IEEE 29148, referencia metodologica para ingenieria de requisitos.
- [`1_Primeros_Alcances.md`](1_Primeros_Alcances.md), linea base funcional y de
  prototipo.
- [`ADR-001: Stack y despliegue del prototipo`](decisions/ADR-001-stack-del-prototipo.md).
- [Ley N. 26454](https://www.leyes.congreso.gob.pe/Documentos/Leyes/26454.pdf),
  marco peruano de donacion voluntaria y gratuita de sangre humana.
- [Ley N. 27282](https://www.leyes.congreso.gob.pe/Documentos/Leyes/27282.pdf),
  capitulo II sobre donacion de sangre, constancia y permiso laboral.
- `AGENTS.md`, invariantes de dominio, privacidad, arquitectura y calidad.

## 2. Descripcion general

### 2.1 Perspectiva del producto

Save a Life es un sistema web nuevo y autocontenido para una demostracion
academica. Se implementara como monolito modular TypeScript dentro de un
monorepo. La API y el worker seran procesos desplegables separados que comparten
contratos, aplicacion y dominio.

```mermaid
flowchart LR
    U[Donante / Admin hospital / Superadmin]
    WEB[React 18 + Tailwind CSS\nVercel]
    API[Node.js + Express REST\nRender]
    AUTH[Supabase Auth\nPKCE + MFA]
    DB[(PostgreSQL\nSupabase + RLS)]
    WORKER[Worker de outbox\nRender]
    RESEND[Resend]
    INBOX[Inbox allowlisted]
    MAP[Adaptador de mapas]
    MAPBOX[Mapbox]
    OSM[MapLibre + OpenStreetMap]

    U -->|HTTPS| WEB
    WEB -->|Cookie Secure/HttpOnly + CSRF| API
    API -->|Flujo Auth mediado| AUTH
    API -->|Identidad vigente + SQL/RPC| DB
    DB -->|Outbox pendiente| WORKER
    WORKER -->|Envio idempotente| RESEND
    RESEND --> INBOX
    RESEND -->|Webhook firmado| API
    API -->|Solo agregados k >= 5| MAP
    MAP --> MAPBOX
    MAP --> OSM
```

### 2.2 Funciones principales

1. Registrar donantes o permitirles reclamar un alta asistida.
2. Gestionar perfil propio, disponibilidad y ubicacion sintetica aproximada.
3. Administrar hospitales, sedes, admins y membresias con controles
   privilegiados.
4. Crear y gestionar necesidades hospitalarias de `RBC`.
5. Preseleccionar candidatos por estado, matriz declarada, distancia, radio,
   disponibilidad y cuotas.
6. Crear lotes manuales, invitaciones, outbox y auditoria de manera consistente.
7. Enviar email real mediante Resend o usar un adaptador falso en pruebas.
8. Registrar confirmacion o rechazo inicial mediante enlaces seguros y permitir
   cambios posteriores autenticados mientras corresponda.
9. Mostrar al hospital solo informacion minima y contextual.
10. Permitir que cada hospital publique o retire una politica opcional limitada
    a refrigerio, diploma y/o pin, sin afectar el flujo de invitaciones.
11. Mostrar al donante esa politica y un segmento comun sobre constancia de
    donacion y permiso laboral, con supervision administrativa acotada.
12. Tramitar solicitudes auditables de correccion y eliminacion.
13. Ofrecer, como alcance opcional, una visualizacion agregada con alternativa
    tabular accesible.

### 2.3 Clases de usuario

| Actor | Responsabilidad | Restriccion principal |
| --- | --- | --- |
| Donante | Completar su perfil, gestionar disponibilidad y ubicacion sintetica, consultar invitaciones, reconocimientos e informacion laboral, y responder. | Solo accede a sus propios datos y nunca a otros donantes; la informacion institucional no acredita donacion ni permiso. |
| Admin hospitalario | Gestionar necesidades y lotes de su institucion, iniciar altas asistidas, consultar respuestas permitidas y publicar reconocimientos opcionales. | Pertenece exactamente a un hospital y no opera recursos ni politicas ajenas. |
| Superadmin | Gestionar hospitales, sedes, admins, configuracion, solicitudes privilegiadas y supervision de politicas de reconocimiento. | El acceso a PII es contextual, temporal, auditado y no permite explorar el padron; supervisar politicas no concede acceso a donantes. |
| Worker | Procesar el outbox y reconciliar estados de entrega. | Solo usa RPC de minimo privilegio y no consulta el padron general. |
| Visitante o portador de token | Registrarse, autenticarse, recuperar acceso, reclamar una cuenta o emitir la primera respuesta. | Recibe respuestas neutras y solo informacion minima del flujo. |

Ningun usuario puede elegir ni elevar su propio rol.

### 2.4 Entorno operativo

| Elemento | Entorno aprobado |
| --- | --- |
| Cliente web | Navegadores modernos desktop y mobile indicados en RNF-COMP-01. |
| Frontend | React 18 y Tailwind CSS en Vercel. |
| API | Node.js y Express en Render. |
| Worker | Proceso Node.js separado en Render. |
| Identidad | Supabase Auth. |
| Persistencia | PostgreSQL administrado por Supabase con RLS. |
| Email | Resend con inboxes de prueba allowlisted. |
| Mapas opcionales | Mapbox mediante adaptador; MapLibre/OpenStreetMap como fallback aprobado. |
| Entornos de datos | `test` y `demo` aislados. |

Las versiones exactas y el gestor de paquetes se fijaran con un unico lockfile
durante Sprint 0.

### 2.5 Restricciones de diseno e implementacion

- El backend sera un monolito modular; no se introduciran microservicios para
  esta fase.
- El dominio no dependera de Express, Supabase, Resend ni un proveedor de mapas.
- La autorizacion se aplicara en servidor y se reforzara con RLS.
- La aplicacion `web` no consultara datos de dominio directamente en Supabase;
  todo acceso funcional pasara por la API Express y sus DTO.
- `service_role` permanecera exclusivamente en backend y fuera del worker.
- Supabase, Resend y mapas se aislaran detras de puertos o adaptadores.
- La distancia se calculara con Haversine en backend; PostGIS queda fuera de
  esta version.
- Todas las migraciones y cambios de RLS seran versionados.
- Las invitaciones, el outbox y la auditoria se persistiran atomicamente.
- El prototipo operara solo con datos funcionales sinteticos.
- La arquitectura no se sustituira por Java/Spring Boot ni por microservicios
  sin una nueva decision que reemplace `ADR-001`.

### 2.6 Supuestos y dependencias

- La demostracion dispone de tres hospitales autorizados y hasta 500 donantes
  sinteticos.
- Resend, Vercel, Render y Supabase estaran configurados y disponibles para las
  pruebas que dependen de ellos.
- Los inboxes reales usados en el smoke de Resend pertenecen a una allowlist de
  pruebas.
- El poligono de Lima sera un artefacto GeoJSON versionado y con hash fijado en
  Sprint 0.
- Los cold starts y limites de planes se mediran y reportaran; no existe un SLA
  productivo.
- Una autoridad clinica competente y una revision legal y de privacidad serian
  obligatorias antes de cualquier uso con datos reales.
- La matriz declarada es un artefacto academico interno, no una fuente clinica
  oficial.

### 2.7 Fuera de alcance

- Datos reales de donantes durante el prototipo.
- Pacientes, diagnosticos, historias clinicas o contacto paciente-donante.
- Certificacion de identidad, grupo sanguineo, elegibilidad o tamizaje.
- Registro de asistencia efectiva o donacion realizada.
- Inventario de sangre, unidades, volumen o suficiencia clinica.
- Fecha o historial de ultima donacion y bloqueo postdonacion activo.
- Pagos, dinero, vales, descuentos, sorteos, puntos, creditos o beneficios
  canjeables o distintos de refrigerio, diploma y pin.
- Emision de constancias de donacion, decision sobre permisos laborales o
  verificacion del cumplimiento de obligaciones del empleador.
- Integraciones HIS, HL7, FHIR o sistemas hospitalarios legados.
- Plasma, plaquetas u otros componentes distintos de `RBC`.
- Ampliacion automatica de radio o lotes por urgencia.
- Un SLA productivo o afirmaciones de cumplimiento legal o clinico.

## 3. Requisitos de interfaces externas

### 3.1 Interfaz de usuario

La aplicacion debera proporcionar interfaces responsive diferenciadas por rol.
Todas las pantallas aplicables contemplaran carga, vacio, error recuperable,
exito, conflicto concurrente y permiso insuficiente.

| Familia | Interfaces requeridas |
| --- | --- |
| Publica y autenticacion | Introduccion, login, registro, verificacion, reclamo asistido, recuperacion, MFA y step-up. |
| Donante | Onboarding, perfil propio, disponibilidad, ubicacion sintetica, invitaciones, respuestas, historial, solicitudes, reconocimientos e informacion laboral. |
| Hospital | Dashboard, necesidades, detalle, lotes, entregas, respuestas, altas asistidas y politica de reconocimientos. |
| Superadmin | Tareas, hospitales, sedes, admins, membresias, solicitudes, configuracion, auditoria y supervision de politicas de reconocimiento. |
| Sistema | Acceso denegado o recurso no revelado, indisponibilidad y recuperacion. |
| Mapa opcional | Visualizacion agregada de una necesidad propia y tabla accesible equivalente. |

La interfaz sera funcional y de alta fidelidad para la demostracion, sin exigir
una identidad visual definitiva. Usara lenguaje sobrio, confiable y operativo,
y el rojo se aplicara con moderacion, nunca como fondo dominante ni unico
indicador. No usara imagenes explicitas de sangre, presion emocional ni promesas
clinicas.

Los estados se comunicaran mediante texto y, cuando aporte valor, iconos ademas
de color. Las fechas seran absolutas y mostraran zona horaria; los tiempos
relativos solo seran complementarios. La navegacion incluira teclado, foco
visible y gestionado, landmarks, enlace para saltar al contenido y anuncios
accesibles de cambios. Las tablas usaran encabezados semanticos y una adaptacion
movil que no dependa solo de desplazamiento horizontal.

### 3.2 Interfaces de software

| Sistema | Interfaz y datos | Restricciones |
| --- | --- | --- |
| Supabase Auth | Identidad, PKCE, email verificado, recuperacion y MFA. | No sera fuente autoritativa de rol u hospital. |
| PostgreSQL/Supabase | SQL y RPC controladas para membresias, dominio, outbox y auditoria. | RLS, minimo privilegio, transacciones y restricciones unicas. |
| Resend | Envio idempotente y webhooks de estado. | Solo inboxes allowlisted; firma y cuerpo crudo validados. |
| Adaptador falso de email | Simulacion con estado para pruebas repetibles. | Debe preservar la semantica de idempotencia y errores verificables. |
| Mapbox | Recepcion de celdas sinteticas agregadas. | Nunca recibe perfiles ni coordenadas individuales. |
| MapLibre/OpenStreetMap | Fallback de visualizacion opcional. | Mantiene el mismo contrato minimizado. |

El frontend no usara el SDK de Supabase para consultar o modificar datos de
dominio. Las capacidades publicas estrictamente necesarias de autenticacion se
mantendran mediadas por Express conforme a RNF-SEC-01 y RNF-SEC-09.

Las rutas REST, los esquemas OpenAPI o equivalentes y el acceso a datos concreto
se cerraran en Sprint 0 sin modificar los requisitos de esta ERS.

### 3.3 Interfaces de comunicacion

- El navegador se comunicara con la API exclusivamente mediante HTTPS.
- La API Express intermediara la autenticacion y mantendra la sesion en cookie
  `Secure` y `HttpOnly`.
- Las mutaciones autenticadas por cookie requeriran `Origin` permitido y token
  CSRF valido.
- CORS usara una allowlist exacta y nunca `*` con credenciales.
- Los webhooks de Resend validaran firma sobre el cuerpo crudo, antiguedad,
  deduplicacion y progresion monotona de estado.
- El worker accedera al outbox mediante RPC permitidas y no mediante privilegios
  generales sobre tablas.
- Ninguna interfaz registrara tokens, cookies, query strings, PII, coordenadas
  exactas ni cuerpos completos.

### 3.4 Interfaces de hardware

No se requieren dispositivos medicos, sensores ni hardware especializado. El
prototipo depende unicamente de dispositivos capaces de ejecutar los
navegadores admitidos y de la infraestructura cloud indicada.

### 3.5 Trazabilidad de interfaces

| Area de interfaz | RF/RNF que aportan su verificacion |
| --- | --- |
| UI por rol y estados | Familias RF-IAM, RF-PRO, RF-NEC, RF-INV y RF-VIS; RNF-A11Y-01, RNF-A11Y-02, RNF-COMP-01 y RNF-COMP-02. |
| Auth, sesion y recuperacion | RNF-SEC-01 a RNF-SEC-16. |
| API, PostgreSQL y RLS | RNF-ARC-03, RNF-ARC-05, RNF-DAT-01, RNF-SEC-07 a RNF-SEC-10, RNF-API-01 y RNF-API-02. |
| Email, outbox y webhook | RF-EML-01 a RF-EML-04; RNF-SEC-10, RNF-SEC-14, RNF-REL-01, RNF-REL-02 y RNF-OPS-05. |
| Mapa opcional | RF-MAP-01, RF-MAP-02, RNF-ARC-05 y RNF-PRV-01. |
| Reconocimientos e informacion laboral | RF-REC-01 a RF-REC-04, RF-LAB-01, RNF-LGL-01, RNF-A11Y-01 y RNF-A11Y-02. |
| Errores, telemetria y auditoria | RNF-API-02, RNF-OBS-01, RNF-OBS-02 y RNF-AUD-01. |

## 4. Requisitos funcionales por rol y objetivo

Cada ficha identifica el objetivo del actor, las condiciones de entrada, el
resultado observable, las restricciones y la aceptacion derivada. Las tablas
RF conservan literalmente las obligaciones, prioridades y verificaciones de la
linea base. Los RNF particulares se complementan con la matriz de aplicabilidad
de la seccion 6. Los AP referenciados mantienen suspendidas unicamente las
clausulas afectadas, conforme a 1.4 y 10.5.

### 4.1 Donante

El donante gestiona su propia participacion y nunca consulta perfiles ni
respuestas de otros donantes. La primera respuesta mediante token y el reclamo
se rigen por su contexto de acceso, sin exigirles una sesion por esta agrupacion.

#### DON-OBJ-01: Registrarse y activar su cuenta

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Obtener una cuenta activa mediante autorregistro o reclamo de alta asistida valida; CU-01 describe el contexto. |
| Accion y resultado | Registrar o reclamar, verificar email y completar el perfil; el sistema solo activa la cuenta con los datos obligatorios completos. |
| Restricciones y relaciones | Una cuenta incompleta o un alta no reclamada no participa en matching. HOS-OBJ-02 inicia el alta; el hospital no completa el perfil del donante. Aplican tambien RF-PRO-01 y RF-PRO-05. |
| RNF particulares | RNF-SEC-01 a RNF-SEC-04, RNF-SEC-12 y RNF-SEC-13. |
| Aceptacion derivada | Cuenta completa incluida cuando cumple los demas filtros; incompleta excluida; replay rechazado; purga a los 30 dias de alta no reclamada. |
| Pendientes y fuente | AP-01 mantiene pendiente la semantica del estado vencida. CU-01; AUTH-02, AUTH-03 y DON-01 del Anexo A. |

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RF-IAM-01 | El sistema debera permitir que un donante se autorregistre y active su cuenta unicamente despues de verificar su email y completar nombre, grupo declarado, disponibilidad y ubicacion sintetica aproximada. | M | E2E con cuenta incompleta excluida y cuenta completa incluida en matching. |
| RF-IAM-03 | El alta asistida debera usar los estados `pendiente`, `reclamada_incompleta`, `activa` y `vencida`; su token durara 24 horas, sera de un uso y una reemision invalidara tokens anteriores sin reiniciar el plazo de conservacion. | M | Pruebas con reloj controlado, replay y reemision. |
| RF-IAM-04 | Un alta asistida no reclamada debera purgarse a los 30 dias de su creacion y nunca participar en matching; una cuenta reclamada solo pasara a `activa` al completar el perfil obligatorio. | M | Integracion antes y despues de los limites y prueba de exclusion del matching. |

#### DON-OBJ-02: Consultar su perfil y gestionar disponibilidad y ubicacion

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Consultar el perfil propio y actualizar campos permitidos desde una sesion de donante. |
| Accion y resultado | Cambiar disponibilidad o ubicacion; al marcarse no disponible, el sistema impide nuevas invitaciones e invalida las activas sin respuesta, sin modificar confirmaciones existentes. |
| Restricciones y relaciones | Solo datos propios, ubicacion sintetica dentro de Lima con hasta tres decimales; sin historial de donacion. RF-MAT-01 y RF-BAT-03 relacionan participacion y cuotas con HOS-OBJ-04. |
| RNF particulares | RNF-SEC-07, RNF-SEC-08 y RNF-API-01. |
| Aceptacion derivada | Cambio propio permitido; acceso ajeno denegado; ubicacion invalida rechazada; invitacion sin respuesta invalidada y confirmacion previa conservada al desactivar disponibilidad. |
| Fuente | Matriz 5.3; DON-02 del Anexo A. |

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RF-PRO-01 | El donante debera poder consultar solo su perfil y modificar directamente unicamente su disponibilidad y ubicacion sintetica aproximada dentro del poligono de Lima y con un maximo de tres decimales. | M | E2E propio, acceso ajeno denegado y validacion geografica. |
| RF-PRO-05 | El prototipo no debera solicitar, aceptar, almacenar ni inferir fecha o historial de ultima donacion. | M | Contrato DTO/esquema, mass assignment y busqueda en persistencia. |
| RF-INV-07 | Si un donante se marca no disponible, el sistema debera impedir nuevas invitaciones e invalidar las activas sin respuesta, sin modificar una confirmacion existente. | M | Integracion con los tres estados de respuesta. |

#### DON-OBJ-03: Consultar sus invitaciones

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Consultar lista y detalle propios autenticado; el enlace de primera respuesta tiene el contexto especifico de DON-OBJ-04. |
| Accion y resultado | Abrir una invitacion y recibir informacion operativa minima, sin afirmaciones de elegibilidad. |
| Restricciones y relaciones | Matriz 5.3 y RF-INV-01 para estados; RF-VIS-03 limita el contenido. No se muestran datos de otros donantes ni pacientes. |
| RNF particulares | RNF-SEC-08 y RNF-SAF-01 a RNF-SAF-04. |
| Aceptacion derivada | Consulta propia permitida y ajena denegada; contenido limitado a los campos permitidos; ausencia de paciente, diagnostico y promesas clinicas. |
| Pendientes y fuente | AP-09 afecta la vigencia; matriz 5.3 y DON-03 del Anexo A. |

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RF-VIS-03 | El donante solo vera hospital verificado, sede publica, plazo, urgencia informativa e instrucciones; nunca paciente, diagnostico ni afirmacion de elegibilidad. | M | Snapshot de API/UI y busqueda de campos prohibidos. |

#### DON-OBJ-04: Confirmar o rechazar una invitacion por primera vez

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Emitir la primera respuesta como portador legitimo del token; invitacion activa y no vencida, necesidad activa. |
| Accion y resultado | Consultar por GET y responder por POST; el sistema consume el token y registra una respuesta atomica, invalidando el token hermano. |
| Restricciones y relaciones | No mutar por GET ni aceptar replay. RF-INV-05 y RF-INV-08 en HOS-OBJ-06 regulan meta y terminales; RF-INV-01 distingue los ejes de estado. |
| RNF particulares | RNF-SEC-12, RNF-SEC-13, RNF-REL-01 y RNF-REL-02. |
| Aceptacion derivada | GET sin efectos; un unico efecto entre POST concurrentes del mismo token; accion cruzada, replay y respuesta tras meta o terminal rechazados. |
| Pendientes y fuente | AP-04 para carreras entre operaciones distintas y AP-09 para vigencias; CU-03 y LINK-01 del Anexo A. |

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RF-INV-02 | Confirmar y rechazar deberan usar tokens distintos de un uso, ligados a invitacion y accion; consumir uno invalidara su token hermano. | M | Accion cruzada, replay e invalidacion del token alternativo. |
| RF-INV-03 | Un `GET` del enlace debera ser informativo y no mutar estado; el primer `POST` valido solo podra consumir el token y registrar la respuesta atomicamente cuando la invitacion este activa, no haya vencido y la necesidad permanezca `activa`. | M | Escaner GET, dos POST concurrentes con un solo efecto y rechazo tras meta o estado terminal. |

#### DON-OBJ-05: Cambiar su respuesta y consultar su historial

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Revisar una respuesta inicial valida desde una sesion del donante propietario, mientras la necesidad no sea terminal. |
| Accion y resultado | Alternar confirmada/rechazada y consultar historial propio; cada cambio agrega historial inmutable. |
| Restricciones y relaciones | RF-NEC-07 y RF-INV-06 en HOS-OBJ-06 regulan el retorno a activa sin revalidar invitaciones ni crear lotes; HOS-OBJ-05 consulta la proyeccion permitida. |
| RNF particulares | RNF-SEC-08 y RNF-AUD-01. |
| Aceptacion derivada | Cambio propio permitido en el contexto aprobado; cambio ajeno o tras terminal denegado; historial conservado; perdida de meta sin lote automatico. |
| Pendientes y fuente | AP-03 para visibilidad posterior, AP-04 para carreras y AP-09 para vigencias; CU-03, DON-03 y DON-04 del Anexo A. |

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RF-INV-04 | Tras una respuesta inicial valida, solo el donante autenticado podra alternar entre `confirmada` y `rechazada` hasta que la necesidad sea terminal; cada cambio agregara historial inmutable. | M | E2E antes y despues del estado terminal. |

#### DON-OBJ-06: Solicitar y seguir una correccion o eliminacion

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Solicitar correccion o eliminacion de datos propios desde una sesion de donante. |
| Accion y resultado | Crear y seguir la solicitud; el donante no ejecuta la correccion privilegiada ni sustituye directamente nombre, email o grupo. |
| Restricciones y relaciones | RF-PRO-03 y RF-PRO-04 se definen en SA-OBJ-03, que resuelve la solicitud con SA-OBJ-04. El email nuevo requiere verificacion. |
| RNF particulares | RNF-SEC-12, RNF-SEC-13 y RNF-AUD-01. |
| Aceptacion derivada | Solicitud propia creada y consultable; PATCH directo rechazado; email no sustituido antes de verificacion; ejecucion sin aprobacion denegada. |
| Pendientes y fuente | AP-05 para vigencia del token de cambio de email; CU-05, matriz 5.3 y DON-05 del Anexo A. |

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RF-PRO-02 | Los cambios de nombre, email o grupo declarado deberan iniciarse mediante una solicitud; el email nuevo debera verificarse antes de sustituir al anterior. | M | `PATCH` directo rechazado y flujo de solicitud exitoso. |

#### DON-OBJ-07: Consultar reconocimientos e informacion laboral

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Consultar la politica publicada por un hospital y el segmento informativo comun desde el contexto de donante. |
| Accion y resultado | Distinguir refrigerio, diploma y/o pin publicados, o la ausencia valida de oferta, y acceder por separado a informacion general sobre constancia de donacion y permiso laboral. |
| Restricciones y relaciones | Una eventual entrega solo se decide despues de una donacion efectiva determinada por el hospital fuera de la plataforma. HOS-OBJ-08 publica la politica y SA-OBJ-07 puede suspender o levantar la suspension. La consulta no acredita asistencia, donacion, entrega ni derecho individual a un permiso. |
| RNF particulares | RNF-LGL-01, RNF-SAF-02, RNF-A11Y-01 y RNF-A11Y-02. |
| Aceptacion derivada | Cada opcion y sus combinaciones se muestran con version y fecha; no ofrecer ninguna es valido; no existen comparadores, filtros, promocion o escasez; el segmento comun permanece independiente y muestra solo contenido juridico aprobado o el aviso correspondiente. |
| Fuente | CU-07; DON-06 del Anexo A. |

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RF-REC-02 | El donante debera poder consultar si la politica publicada de cada hospital ofrece refrigerio, diploma y/o pin, o si no ofrece ninguno. La interfaz identificara version y fecha de actualizacion, explicara que una eventual entrega solo se decide despues de una donacion efectiva determinada fuera de la plataforma y presentara la oferta de forma neutral y separada de urgencia, controles de respuesta e informacion laboral, sin comparar, ordenar, filtrar, promocionar ni anunciar escasez por reconocimiento. | M | E2E con cada opcion, combinaciones, ausencia, version y separacion visual/semantica; busqueda de comparadores, filtros, promocion, escasez, promesa de entrega o registro de donacion. |
| RF-LAB-01 | La plataforma debera ofrecer al donante un segmento informativo comun sobre constancia de donacion y permiso laboral en Peru, accesible con independencia del hospital, invitacion, reconocimiento o respuesta. Mostrara unicamente contenido juridico aprobado conforme a RNF-LGL-01 o, en su ausencia, un aviso de validacion profesional pendiente; siempre indicara que la plataforma no emite constancias, decide permisos ni garantiza su concesion. | M | Revision de contenido y E2E independiente desde hospitales con y sin reconocimientos, con contenido aprobado, ausente y no aprobado. |

### 4.2 Admin hospitalario

El admin opera exclusivamente dentro de su hospital, derivado de la identidad
vigente. Solicita las acciones del recorrido; el sistema realiza la preseleccion
y la entrega automatica, sin concederle exploracion del padron.

#### HOS-OBJ-01: Acceder y operar dentro de su hospital

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Acceder como admin invitado, con membresia vigente en un unico hospital activo y AAL2. |
| Accion y resultado | Aceptar invitacion administrativa y autenticarse conforme a AUTH-05; operar recursos de su institucion. |
| Restricciones y relaciones | RF-IAM-05 y RF-ORG-01 se definen en SA-OBJ-02 y SA-OBJ-01; no puede elegir rol, administrar datos maestros ni operar recursos ajenos. |
| RNF particulares | RNF-SEC-05, RNF-SEC-07 y RNF-SEC-08. |
| Aceptacion derivada | AAL1 denegado; hospitalId falsificado y recurso ajeno denegados sin revelar existencia; revocacion efectiva usando la misma sesion. |
| Fuente | Matriz 5.3 y AUTH-05 del Anexo A. Reune requisitos existentes, sin agregar un RF. |

#### HOS-OBJ-02: Iniciar y dar seguimiento a un alta asistida

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Iniciar una invitacion minima desde el contexto autorizado de HOS-OBJ-01. |
| Accion y resultado | Enviar email y nombre opcional; consultar estado o reemitir conforme a HOS-06; obtener respuesta neutra exista o no la cuenta. |
| Restricciones y relaciones | Sin contrasena, grupo ni ubicacion. DON-OBJ-01 contiene RF-IAM-03 y RF-IAM-04 para reclamo, estados, reemision y purga. El alta no hace al hospital propietario del perfil. |
| RNF particulares | RNF-SEC-12, RNF-SEC-13 y RNF-SEC-08. |
| Aceptacion derivada | Emails nuevos, repetidos y concurrentes no enumerables; reemision invalida tokens anteriores sin reiniciar conservacion. |
| Pendientes y fuente | AP-01 conserva la decision sobre vencimiento y reemision; CU-01 y HOS-06 del Anexo A. |

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RF-IAM-02 | El sistema debera permitir que un admin hospitalario inicie un alta asistida con email y nombre opcional, sin contrasena, grupo ni ubicacion, devolviendo la misma respuesta neutra aunque el email ya exista. | M | Integracion con email nuevo, repetido y concurrente, sin enumeracion. |

#### HOS-OBJ-03: Crear y activar una necesidad propia

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Publicar una necesidad de su hospital con membresia vigente, AAL2 y sede propia activa. |
| Accion y resultado | Completar parametros y activar desde borrador; el sistema valida componente, grupo, meta, sede, radio, urgencia y vencimiento. |
| Restricciones y relaciones | RF-ORG-01 en SA-OBJ-01 limita sedes; RF-NEC-06 y RF-NEC-08 en HOS-OBJ-06 regulan transicion y vencimiento. Urgencia informativa; meta de intenciones, no unidades. |
| RNF particulares | RNF-API-01 y RNF-SAF-02. |
| Aceptacion derivada | RBC y ocho grupos admitidos; meta 0/1/50/51; radio y plazo en sus limites; sede ajena/inactiva rechazada; urgencia sin alterar seleccion. |
| Fuente | CU-02; HOS-02 y HOS-03 del Anexo A. |

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RF-NEC-01 | Toda necesidad debera usar el componente fijo `RBC`; cualquier otro componente sera rechazado. | M | API con `RBC` y componentes fuera de alcance. |
| RF-NEC-02 | El grupo requerido debera ser uno de `O_NEG`, `O_POS`, `A_NEG`, `A_POS`, `B_NEG`, `B_POS`, `AB_NEG` o `AB_POS`; la UI mostrara sus simbolos habituales. | M | Ocho casos validos y valores libres rechazados. |
| RF-NEC-03 | La meta debera ser un entero de 1 a 50 confirmaciones de intencion y nunca se describira como unidades, volumen, donaciones realizadas o suficiencia clinica. | M | Fronteras `0/1/50/51` y revision de textos. |
| RF-NEC-04 | La urgencia debera ser `Normal`, `Urgente` o `Critica` y sera solo informativa: no alterara matriz, radio, ranking, lote ni cuota. | M | Comparar resultados identicos cambiando unicamente urgencia. |
| RF-NEC-05 | El admin debera seleccionar una sede activa de su hospital, un radio manual de 1 a 50 km con valor inicial de 10 km y un vencimiento de 1 a 72 horas. | M | Pruebas de frontera, sede ajena/inactiva y ausencia de ampliacion automatica. |

#### HOS-OBJ-04: Solicitar lotes de invitaciones y su procesamiento

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Solicitar un lote para una necesidad propia activa desde HOS-OBJ-01. |
| Accion y resultado | El hospital solicita manualmente; el sistema filtra, ordena, crea invitaciones/outbox/auditoria y procesa email conforme a las reglas de abajo. |
| Restricciones y relaciones | No selecciona personas individuales ni ejecuta intentos del worker. DON-OBJ-02 aporta disponibilidad; HOS-OBJ-05 consulta estados; HOS-OBJ-06 limita envios por meta y terminales. |
| RNF particulares | RNF-REL-01, RNF-REL-02, RNF-PER-02, RNF-PER-06, RNF-SEC-10, RNF-SEC-14 y RNF-OPS-05. |
| Aceptacion derivada | Orden exactos/otras coincidencias y desempate estable; lote limitado y sin duplicados; tercera invitacion global admitida y cuarta bloqueada; conjunto insuficiente sin completar artificialmente; fallo intermedio revierte el lote. Entrega con reintentos acotados, destinatario externo bloqueado y webhook validado. |
| Pendientes y fuente | AP-02, AP-04, AP-06, AP-08 y AP-09 conservan sus decisiones; CU-02 y CU-06, reglas de la seccion 7 y HOS-04 del Anexo A. |

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RF-MAT-01 | El matching debera considerar solo cuentas activas, perfil completo, disponibilidad vigente y ubicacion sintetica valida; el filtro postdonacion permanecera desactivado. | M | Exclusion independiente por cada precondicion. |
| RF-MAT-02 | El sistema debera evaluar los 64 pares ordenados donante a receptor conforme a `MATRIZ_RBC_ACADEMICA_V1`; las pruebas solo afirmaran "coincide con la matriz declarada". | M | 64/64 pares, 27 admitidos y 37 rechazados segun la declaracion. |
| RF-MAT-03 | Cada lote debera seleccionar primero coincidencias exactas y luego otras coincidencias de la matriz; dentro de cada grupo ordenara por distancia ascendente y, en empate, por ID opaco. | M | Fixtures con exactos, coincidentes y distancias empatadas. |
| RF-MAT-04 | La distancia debera calcularse con Haversine, radio terrestre medio `6 371 008.8 m`, entre la ubicacion del donante y la sede elegida; se incluira el borde cuando la distancia no redondeada sea menor o igual al radio. | M | Casos conocidos, borde exacto, fuera de rango y coordenadas invalidas. |
| RF-MAT-05 | Solo deberan participar puntos dentro o sobre el limite del poligono versionado de Lima. | M | Casos interior, borde y exterior contra el artefacto GeoJSON. |
| RF-BAT-01 | Cada solicitud manual debera intentar crear hasta `min(50, max(5, 2 x meta))` invitaciones nuevas y unicas, excluyendo donantes ya invitados y quienes excedan cuotas; si hay menos candidatos preseleccionables conforme a estos filtros y a la matriz declarada, creara solo los disponibles. | M | Metas 1, 2, 3, 25, 26 y 50, mas conjunto insuficiente. |
| RF-BAT-02 | Cualquier lote posterior debera requerir una accion manual del hospital; urgencia, tiempo transcurrido o perdida de una confirmacion no generaran lotes automaticamente. | M | Prueba con reloj y cambios de estado sin nuevo outbox. |
| RF-BAT-03 | Cada donante podra recibir como maximo tres invitaciones logicas globales en la ventana movil `(t - 24 h, t]`; se permitira la tercera y se bloqueara la cuarta, sin contar reintentos. | M | Concurrencia entre hospitales y bordes exactos de 24 horas. |
| RF-BAT-04 | Debera existir como maximo una invitacion por necesidad y donante; invitaciones, outbox y auditoria deberan confirmarse o revertirse en una sola transaccion. | M | Restriccion unica, solicitudes concurrentes y fallo intermedio. |

Reglas de entrega que soportan el mismo recorrido:

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RF-EML-01 | El worker debera realizar un intento inicial y hasta cinco reintentos, seis llamadas maximas, con timeout de 10 s y backoff con jitter de 1, 2, 5, 10 y 20 minutos, sin intentar en o despues del vencimiento. | M | Proveedor falso y reloj controlado. |
| RF-EML-02 | Red, timeout, `408`, `429` y `5xx` seran transitorios; otros `4xx` seran permanentes. Un resultado incierto se reconciliara durante 5 minutos con la misma clave idempotente antes de reintentar. | M | Casos por categoria sin segundo envio logico. |
| RF-EML-03 | El webhook debera validar firma sobre cuerpo crudo y una antiguedad maxima de 5 minutos, deduplicar por ID y aceptar unicamente transiciones que no hagan retroceder el estado. | M | Firma alterada, evento antiguo, replay y desorden. |
| RF-EML-04 | El worker debera comprobar la allowlist de inboxes de prueba inmediatamente antes de llamar a Resend. | M | Destinatario permitido y externo bloqueado. |

#### HOS-OBJ-05: Consultar entregas y respuestas permitidas

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Consultar seguimiento de una necesidad perteneciente a su hospital, con membresia vigente y AAL2. |
| Accion y resultado | Abrir dashboard o detalle y recibir conteos, estados y solo los campos permitidos segun la respuesta. |
| Restricciones y relaciones | DON-OBJ-04 y DON-OBJ-05 registran respuestas; HOS-OBJ-04 procesa entregas. Ningun estado de entrega equivale a confirmacion o asistencia. |
| RNF particulares | RNF-SEC-08, RNF-PER-04 y RNF-PER-05. |
| Aceptacion derivada | Ejes de estado independientes; antes de confirmacion solo opacos; confirmacion afirmativa con lista cerrada; recurso ajeno denegado; respuesta reflejada dentro del umbral aprobado. |
| Pendientes y fuente | AP-03 para visibilidad tras retractacion; AP-02 y AP-09 para estados. CU-04; HOS-01, HOS-04 y HOS-05 del Anexo A. |

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RF-INV-01 | Cada invitacion debera mantener por separado vigencia (`activa`, `invalidada`, `vencida`), entrega (`pendiente`, `enviada`, `entregada`, `fallida`) y respuesta (`sin_respuesta`, `confirmada`, `rechazada`). | M | Cambiar un eje sin sobrescribir los otros. |
| RF-VIS-01 | Antes de una confirmacion afirmativa, el hospital solo vera conteos, codigos aleatorios propios de la necesidad y estados opacos; rechazo, expiracion y falta de respuesta no revelaran identidad. | M | DTO y pruebas entre necesidades/hospitales. |
| RF-VIS-02 | Tras una confirmacion afirmativa, el hospital solo vera nombre, codigo por necesidad, grupo declarado, respuesta y hora; nunca email, telefono, ID global, ubicacion, coordenadas ni distancia. | M | Allowlist contractual del DTO. |

#### HOS-OBJ-06: Seguir el ciclo de vida, cerrar o cancelar una necesidad

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Gestionar el ciclo de una necesidad propia desde HOS-OBJ-01, segun los estados permitidos. |
| Accion y resultado | El hospital cierra o cancela; el sistema refleja meta, perdida de meta y vencimiento, e invalida invitaciones/cancela outbox cuando corresponde. |
| Restricciones y relaciones | Terminales sin reapertura; retorno a activa sin nuevo lote ni revalidacion. DON-OBJ-04 y DON-OBJ-05 aportan respuestas; HOS-OBJ-04 requiere accion manual para otro lote. |
| RNF particulares | RNF-REL-01, RNF-REL-02 y RNF-AUD-01. |
| Aceptacion derivada | Meta alcanzada invalida pendientes; perdida de confirmacion retorna a activa sin fan-out; cerrar/cancelar/vencer conserva historial y rechaza respuestas posteriores; verificar antes, en y despues de expires_at. |
| Pendientes y fuente | AP-04 para carreras y envio en vuelo; AP-09 para vigencias. CU-04, transiciones 5.4 y HOS-03 del Anexo A. |

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RF-NEC-06 | El sistema debera usar `borrador`, `activa`, `meta_alcanzada`, `cerrada`, `cancelada` y `vencida`; las tres ultimas seran terminales y no reabribles. | M | Tabla completa de transiciones en integracion. |
| RF-NEC-07 | Una necesidad debera pasar de `meta_alcanzada` a `activa` si sus confirmaciones vigentes bajan de la meta, sin generar automaticamente otro lote. | M | Cambio de una respuesta confirmada y comprobacion de ausencia de fan-out. |
| RF-NEC-08 | Todo vencimiento debera evaluarse con el reloj UTC de PostgreSQL: sera valido unicamente cuando `now < expires_at` y estara vencido cuando `now >= expires_at`. | M | Reloj controlado antes, en y despues del limite. |
| RF-INV-05 | Al alcanzar la meta, el sistema debera pasar a `meta_alcanzada`, invalidar invitaciones sin respuesta y cancelar trabajos de outbox aun no enviados en la misma transaccion. | M | Confirmacion que completa la meta con invitaciones pendientes. |
| RF-INV-06 | Si luego se pierde una confirmacion, el sistema debera volver a `activa` sin revalidar invitaciones ni crear un lote automaticamente. | M | `confirmada` a `rechazada` y comprobacion de estados. |
| RF-INV-08 | Al cerrar, cancelar o vencer una necesidad, el sistema debera invalidar sus invitaciones activas sin respuesta, cancelar el outbox aun no enviado y rechazar toda respuesta o reintento posterior, sin eliminar el historial previo. | M | Integracion transaccional para los tres estados terminales y replay posterior. |

#### HOS-OBJ-07: Consultar informacion geografica agregada opcional

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Consultar una necesidad propia en mapa o tabla, si se habilita este alcance Could. |
| Accion y resultado | Mostrar celdas agregadas y alternativa tabular equivalente; el fallback mantiene el mismo contrato. |
| Restricciones y relaciones | Sin perfiles, coordenadas individuales ni filtros arbitrarios diferenciables. No convierte el mapa en un padron consultable. |
| RNF particulares | RNF-PRV-01, RNF-A11Y-01 y RNF-A11Y-02. |
| Aceptacion derivada | Celda de cuatro elementos no expuesta; de cinco admitida conforme al contrato; necesidad ajena denegada; tabla equivalente y fallback minimizado. Ausencia del mapa no bloquea MVP. |
| Fuente | MAP-01 del Anexo A y criterio 9.5. |

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RF-MAP-01 | Si se habilita el mapa, un admin hospitalario solo podra consultar una necesidad propia y el servidor enviara celdas sinteticas fijas de 1 km con `k >= 5` despues de filtros, centro redondeado a dos decimales y conteo; nunca perfiles ni filtros arbitrarios diferenciables. La misma informacion estara disponible en una tabla accesible. | C | Inspeccion de autorizacion, trafico y alternativa tabular con celdas de 4 y 5 elementos. |
| RF-MAP-02 | MapLibre/OpenStreetMap podra actuar como fallback sin cambiar el contrato de minimizacion del mapa. | C | Fallo simulado de Mapbox e inspeccion del payload. |

#### HOS-OBJ-08: Gestionar reconocimientos opcionales del hospital

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Publicar o retirar la politica opcional de su propia institucion desde una sesion con membresia vigente y AAL2, siempre que no este suspendida. |
| Accion y resultado | Seleccionar una o mas opciones de la lista cerrada, o retirar la publicacion; DON-OBJ-07 recibe la proyeccion vigente. |
| Restricciones y relaciones | No ofrecer ninguno es valido. La politica es independiente de necesidades, candidatos, invitaciones y respuestas; la plataforma no registra donacion efectiva, entrega ni canje. SA-OBJ-07 puede suspender o levantar la suspension. |
| RNF particulares | RNF-SEC-07, RNF-SEC-08, RNF-API-01 y RNF-AUD-01. |
| Aceptacion derivada | Politica propia publicada o retirada con nueva version y fecha; recurso ajeno, tipo no permitido, suspension y version obsoleta rechazados; mismos candidatos y estados con o sin politica; ausencia de estados de entrega o canje. |
| Fuente | CU-07; HOS-07 del Anexo A. |

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RF-REC-01 | El admin hospitalario debera poder publicar o retirar, solo para su propio hospital y mientras no exista una suspension, una politica opcional versionada que seleccione uno o mas valores de la lista cerrada `refrigerio`, `diploma` y `pin`; no publicar reconocimientos sera valido y cada cambio conservara version y fecha de actualizacion. | M | E2E propio, acceso entre hospitales y mutacion suspendida denegados, combinaciones admitidas, ausencia valida, version incrementada y cualquier otro tipo rechazado. |
| RF-REC-03 | La existencia, ausencia o contenido de una politica de reconocimientos no debera alterar matching, ranking, radio, urgencia, lotes, cuotas, invitaciones ni respuestas; la plataforma no condicionara la confirmacion, registrara la donacion efectiva ni gestionara la entrega o canje del reconocimiento. | M | Comparacion determinista con/sin politica, prueba de DTO/esquema y busqueda de estados de entrega o canje inexistentes. |

### 4.3 Superadmin

El superadmin gestiona instituciones, administradores y solicitudes concretas.
Sus recorridos no habilitan navegacion rutinaria del padron identificable; los
accesos excepcionales mantienen finalidad y tiempo acotados.

#### SA-OBJ-01: Gestionar hospitales y sedes autorizadas

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Gestionar datos maestros desde una sesion de superadmin en AAL2. |
| Accion y resultado | Crear o modificar hospitales y aprobar sedes; quedan disponibles segun su estado para la seleccion hospitalaria. |
| Restricciones y relaciones | HOS-OBJ-03 solo selecciona sedes propias activas; no administra los datos maestros. |
| RNF particulares | RNF-SEC-05, RNF-SEC-08 y RNF-AUD-01. |
| Aceptacion derivada | Accion autorizada del superadmin; gestion denegada a donante y admin hospitalario; sede ajena/inactiva no seleccionable; evento auditable. |
| Fuente | Matriz 5.3; SA-02 y SA-03 del Anexo A. |

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RF-ORG-01 | Solo el superadmin debera crear o modificar hospitales y aprobar sus sedes; el admin hospitalario solo podra seleccionar una sede activa de su propia institucion. | M | Pruebas positivas propias y negativas entre hospitales. |

#### SA-OBJ-02: Invitar administradores y gestionar membresias

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Gestionar administradores con sesion AAL2 y step-up para crear admins o cambiar membresias. |
| Accion y resultado | Invitar y asignar exactamente un hospital activo; HOS-OBJ-01 recibe el acceso resultante. |
| Restricciones y relaciones | Sin autoseleccion de rol ni segunda membresia hospitalaria; varios admins pueden pertenecer al mismo hospital. |
| RNF particulares | RNF-SEC-05, RNF-SEC-07 y RNF-AUD-01. |
| Aceptacion derivada | Segunda membresia y rol manipulado rechazados; step-up vencido denegado; revocacion efectiva en operacion posterior con la misma sesion; auditoria minimizada. |
| Fuente | Matriz 5.3 y SA-04 del Anexo A. |

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RF-IAM-05 | El superadmin debera invitar a los admins hospitalarios y asignarles exactamente un hospital activo; un hospital podra tener varios admins y ningun usuario podra autoseleccionar su rol. | M | API/RLS: segunda membresia y manipulacion de rol rechazadas. |

#### SA-OBJ-03: Resolver solicitudes de correccion o eliminacion

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Resolver una solicitud creada por el donante, con AAL2 y controles de acceso contextual para las acciones privilegiadas. |
| Accion y resultado | Revisar, aprobar o rechazar y ejecutar una solicitud aprobada; registrar completada o fallida sin reabrir estados terminales. |
| Restricciones y relaciones | DON-OBJ-06 inicia y sigue la solicitud; RF-PRO-02 exige verificar email nuevo; SA-OBJ-04 delimita acceso. Una ejecucion fallida requiere nueva solicitud. |
| RNF particulares | RNF-SEC-05, RNF-SEC-06 y RNF-AUD-01. |
| Aceptacion derivada | Transiciones permitidas y prohibidas cubiertas; ejecucion sin aprobacion denegada; terminal no reabierto; decision y ejecucion auditadas. |
| Pendientes y fuente | AP-05 para token de cambio de email; CU-05, matriz 5.3 y SA-05 del Anexo A. |

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RF-PRO-03 | Las solicitudes de correccion y eliminacion deberan usar `pendiente`, `aprobada`, `rechazada`, `en_ejecucion`, `completada` y `fallida`. | M | Prueba de cada transicion permitida y prohibida. |
| RF-PRO-04 | `rechazada`, `completada` y `fallida` seran terminales; una ejecucion fallida requerira una nueva solicitud y ninguna ejecucion podra comenzar sin una solicitud aprobada. | M | Integracion y prueba concurrente. |

#### SA-OBJ-04: Acceder a datos solo para una solicitud concreta

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Acceder a PII necesaria para una solicitud y accion concretas, en AAL2 y tras step-up de antiguedad maxima de cinco minutos. |
| Accion y resultado | Usar el grant contextual de maximo diez minutos, ligado al superadmin, solicitud, donante, campos y accion. |
| Restricciones y relaciones | No concede busqueda general ni navegacion del padron; soporta SA-OBJ-03. |
| RNF particulares | RNF-SEC-05, RNF-SEC-06 y RNF-AUD-01, definidos en 6. |
| Aceptacion derivada | Step-up o grant vencidos, replay y acceso fuera de accion o campos denegados; acceso autorizado auditable sin valores PII. |
| Fuente | Matriz 5.3, CU-05 y SA-05 del Anexo A. Reune obligaciones existentes, sin agregar un RF. |

#### SA-OBJ-05: Gestionar la configuracion permitida

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Gestionar configuracion permitida y versionada desde una sesion de superadmin en AAL2. |
| Accion y resultado | Fijar final_demo_at una sola vez; el sistema conserva la fecha y aplica las obligaciones de purga y retencion existentes. |
| Restricciones y relaciones | No habilita nuevos parametros editables ni asigna al superadmin la ejecucion de la purga. La retencion afecta a los tres roles. |
| RNF particulares | RNF-PRV-02 a RNF-PRV-04, RNF-SEC-05 y RNF-AUD-01. |
| Aceptacion derivada | Fecha no modificable tras fijarse; inventario purgado dentro del plazo; solo agregados irreversibles posteriores; restauracion en cuarentena reaplica eliminaciones. |
| Pendientes y fuente | AP-07 mantiene pendiente la cota de retencion de backups; entidades 5.1, matriz 5.3 y SA-06 del Anexo A. No agrega RF ni permisos de operacion de backups al rol. |

#### SA-OBJ-06: Consultar auditoria minimizada

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Consultar la auditoria administrativa prevista para superadmin autenticado en AAL2. |
| Accion y resultado | Consultar evidencia minimizada con IDs opacos; no se muestran valores PII anteriores o nuevos. |
| Restricciones y relaciones | Acceso restringido; no permite actualizar ni borrar eventos. Relaciona acciones de SA-OBJ-01 a SA-OBJ-05 sin dar acceso general a perfiles. |
| RNF particulares | RNF-AUD-01, RNF-SEC-05 y RNF-SEC-08. |
| Aceptacion derivada | Evento verificable por clase; denegacion de actualizacion/borrado y de acceso no autorizado; ausencia de PII innecesaria. |
| Fuente | RNF-AUD-01 y SA-07 del Anexo A. Reune obligaciones existentes, sin agregar un RF ni ampliar el alcance de consulta. |

#### SA-OBJ-07: Supervisar politicas de reconocimiento

| Campo | Descripcion |
| --- | --- |
| Objetivo y precondiciones | Revisar politicas institucionales desde una sesion de superadmin en AAL2. |
| Accion y resultado | Consultar, suspender o levantar la suspension de una publicacion con motivo auditable. |
| Restricciones y relaciones | No puede publicar beneficios adicionales, volver obligatoria una oferta, acreditar su entrega ni consultar donantes por este recorrido. La suspension cambia la visibilidad y bloquea mutaciones hospitalarias, no el flujo de invitaciones. |
| RNF particulares | RNF-SEC-05, RNF-SEC-08 y RNF-AUD-01. |
| Aceptacion derivada | Consulta autorizada; suspension o levantamiento sin motivo rechazados; oferta suspendida no visible ni mutable por el hospital; version obsoleta en conflicto; matching, invitaciones, respuestas e historial sin cambios; auditoria minimizada. |
| Fuente | CU-07; SA-08 del Anexo A. |

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RF-REC-04 | El superadmin debera poder consultar, suspender o levantar la suspension de una politica de reconocimiento, registrando un motivo auditable; la suspension ocultara la oferta e impedira que el hospital la publique o modifique hasta su levantamiento, sin modificar matching, invitaciones, respuestas ni historial. | M | E2E de consulta, suspension y levantamiento, motivo obligatorio, mutacion hospitalaria bloqueada, oferta no publicada y flujo de invitacion sin cambios. |

### 4.4 Recorridos compartidos y condiciones de acceso

| Recorrido | Participacion | Requisitos y aceptacion derivados |
| --- | --- | --- |
| Acceso, cierre y recuperacion de sesion | Los tres roles; AAL2 para administradores. | AUTH-01, AUTH-04 y AUTH-05 del Anexo A; RNF-SEC-01 a RNF-SEC-05, RNF-SEC-11 a RNF-SEC-13 y RNF-SEC-15 a RNF-SEC-16. Recuperacion neutra, credencial de un uso, revocacion de sesiones previas y conservacion de rol, hospital y MFA. |
| Alta asistida | HOS-OBJ-02 inicia; DON-OBJ-01 reclama y completa. | RF-IAM-02 se define en hospital; RF-IAM-03 y RF-IAM-04 en donante. Probar ambos lados sin trasladar propiedad del perfil al hospital. AP-01 abierto. |
| Respuesta y seguimiento | DON-OBJ-04 y DON-OBJ-05 responden; HOS-OBJ-05 consulta y HOS-OBJ-06 refleja efectos. | RF-INV-01 a RF-INV-06, RF-INV-08 y RF-VIS-01 a RF-VIS-03. Verificar cambio de estado y proyeccion autorizada sin duplicar definiciones; AP-03, AP-04 y AP-09 abiertos. |
| Correccion o eliminacion | DON-OBJ-06 solicita; SA-OBJ-03 decide y ejecuta con SA-OBJ-04. | RF-PRO-02 en donante; RF-PRO-03 y RF-PRO-04 en superadmin; RNF-SEC-05, RNF-SEC-06 y RNF-AUD-01. Verificar seguimiento, autorizacion y resultado; AP-05 abierto. |
| Reconocimientos e informacion laboral | HOS-OBJ-08 publica una oferta opcional; DON-OBJ-07 la consulta junto con el segmento comun; SA-OBJ-07 puede suspender o levantar la suspension. | RF-REC-01 y RF-REC-03 en hospital; RF-REC-02 y RF-LAB-01 en donante; RF-REC-04 en superadmin; RNF-LGL-01 comun. Verificar tambien la ausencia valida de oferta y que el flujo de invitacion no cambie. |

Los requisitos de soporte automatico se leen dentro del objetivo al que sirven.
Por ejemplo, RF-EML-01 a RF-EML-04 pertenecen documentalmente a HOS-OBJ-04,
pero el worker y el proveedor conservan su responsabilidad tecnica original.
La organizacion por rol no modifica la matriz de acceso ni los estados.

## 5. Requisitos de datos y reglas de acceso

### 5.1 Entidades conceptuales

| Entidad | Responsabilidad de datos | Restriccion destacada |
| --- | --- | --- |
| Identidad y membresia | Vincular una identidad autenticada con rol y, cuando corresponda, hospital. | Rol y hospital no se derivan de metadata editable. |
| Perfil de donante | Nombre, email verificado, grupo declarado, disponibilidad y ubicacion sintetica aproximada. | No incluye ultima donacion; solo el propietario accede al perfil. |
| Hospital y sede | Mantener instituciones y sedes autorizadas. | Solo el superadmin gestiona datos maestros. |
| Politica de reconocimientos | Mantener la oferta institucional opcional, estado, version y fecha de actualizacion. | Pertenece a un hospital; se limita a refrigerio, diploma y/o pin y no contiene donantes, donaciones, entregas ni canjes. |
| Necesidad | Guardar `RBC`, grupo requerido, meta, sede, radio, urgencia, vencimiento y estado. | Pertenece a un hospital y no contiene datos de paciente. |
| Lote | Registrar una seleccion manual y sus resultados deterministas. | No crea duplicados ni evade cuotas globales. |
| Invitacion | Relacionar necesidad y donante con vigencia, entrega y respuesta separadas. | Unica por necesidad y donante. |
| Historial de respuesta | Registrar cambios inmutables de intencion. | No prueba asistencia ni donacion. |
| Outbox | Conservar el trabajo minimo para entregar email. | Payload sensible cifrado, efimero y accesible solo al worker. |
| Solicitud privilegiada | Tramitar correccion o eliminacion de datos. | Exige estados, step-up, grant contextual y auditoria. |
| Idempotencia | Vincular clave, actor, operacion, payload y resultado. | La restriccion unica es el control final de concurrencia. |
| Auditoria | Registrar actor opaco, evento, recurso, resultado, fecha y motivo. | Append-only y sin valores PII anteriores o nuevos. |
| Configuracion | Versionar reglas operativas permitidas y fecha final de demo. | `final_demo_at` se fija una sola vez. |
| Contenido juridico | Versionar fuentes, fecha de consulta, revision profesional, estado y texto del segmento laboral. | Solo contenido aprobado puede mostrar conclusiones; no contiene datos de donantes. |

### 5.2 Clasificacion y minimizacion

| Clase | Ejemplos | Tratamiento requerido |
| --- | --- | --- |
| Datos personales sensibles del prototipo | Nombre, email, grupo declarado, disponibilidad, respuesta y ubicacion sintetica. | Minimo privilegio, RLS, proyecciones cerradas, cifrado aplicable y ausencia en telemetria. |
| Datos operativos restringidos | Hospital, sede, necesidad, invitacion, outbox, membresia y auditoria. | Aislamiento por propietario u hospital y acceso por caso de uso. |
| Datos publicos controlados | Nombre del hospital verificado, sede publica, instrucciones y politica de reconocimientos publicada. | Exponer solo en el contexto previsto; la politica no revela donantes ni acredita entregas. |
| Datos prohibidos | Paciente, diagnostico, historia clinica, ultima donacion y contacto paciente-donante. | No solicitar, aceptar, almacenar ni inferir. |

La precision maxima de tres decimales de una coordenada sintetica no se
considerara anonimizacion para datos reales.

### 5.3 Matriz de acceso

| Actor | Acciones permitidas | Campos visibles |
| --- | --- | --- |
| No autenticado o portador de token | Registro, login, recuperacion, reclamo asistido y primera respuesta. | Respuestas no enumerables e informacion operativa minima de su invitacion. |
| Donante | Su perfil, disponibilidad, ubicacion sintetica, invitaciones, respuestas, solicitudes, reconocimientos publicados e informacion laboral comun. | Solo sus propios datos; nunca datos de otros donantes. Las politicas institucionales publicadas no revelan PII. |
| Admin hospitalario | Alta asistida minima; necesidades, lotes, invitaciones y politica de reconocimientos de su hospital. | Antes de confirmacion: opacos. Tras confirmacion afirmativa: lista cerrada de RF-VIS-02. Solo gestiona la politica de su institucion. |
| Superadmin | Hospitales, sedes, admins, configuracion, solicitudes y supervision de politicas de reconocimiento. | PII solo mediante grant de 10 minutos ligado a usuario, solicitud y accion, tras step-up de maximo 5 minutos; las politicas no habilitan acceso a donantes. |
| Worker | Reclamar outbox, enviar y actualizar entrega mediante RPC permitidas. | Email destinatario y payload minimo cifrado; sin consulta general de perfiles, ubicaciones o necesidades. |

### 5.4 Transiciones normativas

| Recurso | Transiciones permitidas |
| --- | --- |
| Necesidad | `borrador -> activa`; `activa -> meta_alcanzada, cerrada, cancelada o vencida`; `meta_alcanzada -> activa, cerrada, cancelada o vencida`; terminales sin salida. |
| Alta asistida | `pendiente -> reclamada_incompleta o vencida`; `reclamada_incompleta -> activa`; un token vencido no cambia el estado y puede reemitirse antes de la purga. |
| Solicitud | `pendiente -> aprobada o rechazada`; `aprobada -> en_ejecucion`; `en_ejecucion -> completada o fallida`; terminales sin salida. |
| Vigencia de invitacion | `activa -> invalidada o vencida`; terminales sin salida. |
| Entrega | `pendiente -> enviada o fallida`; `enviada -> entregada o fallida`; `fallida -> pendiente` solo por reintento manual auditado antes del vencimiento, invalidando los hashes anteriores y emitiendo un nuevo par de tokens de accion. |
| Respuesta | `sin_respuesta -> confirmada o rechazada` antes del vencimiento; `confirmada <-> rechazada` autenticado mientras la necesidad no sea terminal. |
| Politica de reconocimientos | `sin_publicar -> publicada` y `publicada -> sin_publicar` por un admin del hospital; `publicada -> suspendida` y `suspendida -> sin_publicar` solo por superadmin. Cada mutacion compara la version esperada, incrementa la version y rechaza con conflicto una version obsoleta; una suspension bloquea mutaciones hospitalarias. |

La semantica aun no determinada de alta asistida, vigencia de invitacion,
reintentos, visibilidad posterior y carreras queda suspendida por AP-01 a AP-04
y AP-09.

### 5.5 Integridad, retencion y eliminacion

- PostgreSQL sera la fuente autoritativa de estados, membresias, outbox y
  auditoria.
- Las restricciones unicas impediran invitaciones y ejecuciones idempotentes
  duplicadas incluso bajo concurrencia.
- Invitacion, outbox y auditoria de un lote se confirmaran o revertiran en una
  sola transaccion.
- Los tokens se validaran mediante hash; el valor requerido para email solo
  podra conservarse cifrado y temporalmente en el outbox.
- Un alta asistida no reclamada se purgara a los 30 dias de su creacion.
- Los registros de idempotencia se conservaran hasta 72 horas despues del
  estado terminal o hasta la purga general.
- A mas tardar 30 dias despues de `final_demo_at` se purgaran los datos activos
  y metadatos controlables indicados por RNF-PRV-02.
- Despues de la purga solo podran conservarse agregados irreversibles no
  atribuibles.

## 6. Requisitos no funcionales

### Aplicabilidad por rol y recorrido

Los RNF se definen una sola vez a continuacion. Esta matriz y las fichas de la
seccion 4 permiten leerlos desde los objetivos de los roles sin duplicar sus
clausulas ni convertir restricciones tecnicas en permisos de usuario. Una
referencia particular no exime del resto de obligaciones aplicables.

| Aplicabilidad | Referencias y resultado verificable |
| --- | --- |
| Los tres roles: acceso y aislamiento | RNF-SEC-01 a RNF-SEC-04, RNF-SEC-07 a RNF-SEC-09, RNF-SEC-11 a RNF-SEC-13 y RNF-SEC-15 a RNF-SEC-18: sesiones, recuperacion y acceso limitado al recurso autorizado. |
| Los tres roles: interaccion y calidad | RNF-API-01 a RNF-API-02, RNF-REL-01 a RNF-REL-02, RNF-PER-01, RNF-PER-03 a RNF-PER-04, RNF-A11Y-01 a RNF-A11Y-02 y RNF-COMP-01 a RNF-COMP-02: validacion, errores seguros, reintentos consistentes e interaccion accesible. |
| Los tres roles: privacidad y limites | RF-PRO-05, RNF-PRV-01 a RNF-PRV-04, RNF-SAF-01 a RNF-SAF-04, RNF-LGL-01, RNF-OBS-01 a RNF-OBS-02 y RNF-AUD-01: datos sinteticos minimizados, retencion, informacion legal acotada y evidencia sin PII innecesaria. |
| Admin hospitalario y superadmin | RNF-SEC-05: AAL2 y step-up para las acciones que el requisito enumera. RNF-SEC-06: acceso contextual exclusivo del superadmin. |
| Hospital y donante: invitaciones | RNF-SEC-10, RNF-SEC-14, RNF-PER-02, RNF-PER-05 a RNF-PER-06 y RNF-OPS-05: soporte automatico del recorrido, entrega y reflejo de respuestas. No asignan permisos humanos del worker. |
| Soporte de todos los recorridos | RNF-ARC-01 a RNF-ARC-05, RNF-DAT-01, RNF-OPS-01 a RNF-OPS-04, RNF-QLT-01 y RNF-DEP-01: restricciones tecnicas y de verificacion existentes, conservadas sin reasignarlas como acciones de un usuario. |

### 6.1 Arquitectura, mantenibilidad y datos

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RNF-ARC-01 | El prototipo debera usar React 18 y Tailwind CSS en Vercel, Node.js y Express en Render, PostgreSQL y Supabase Auth mediante Supabase, y Resend detras de un adaptador. | M | Inspeccion de manifiestos, configuracion y smoke de despliegues. |
| RNF-ARC-02 | El codigo debera organizarse como monorepo TypeScript con aplicaciones `web`, `api` y `worker`, dentro de un monolito modular. | M | Revision de estructura y grafo de dependencias. |
| RNF-ARC-03 | Controladores, servicios, repositorios, DTO, entidades de dominio, configuracion, utilidades y pruebas deberan permanecer separados; ninguna entidad de persistencia podra exponerse directamente por API. | M | Revision arquitectonica y contract tests de DTO. |
| RNF-ARC-04 | Compatibilidad, Haversine, ranking y transiciones deberan ser funciones de dominio puras, independientes de Express, Supabase, Resend y mapas. | M | Pruebas unitarias sin red, framework ni proveedor. |
| RNF-ARC-05 | Supabase, Resend y proveedores de mapa deberan quedar detras de puertos/adaptadores sustituibles por versiones falsas en pruebas. | M | Ejecutar integracion con adaptadores falsos. |
| RNF-DAT-01 | Todo cambio de PostgreSQL/RLS debera usar migraciones versionadas, reproducibles desde una base limpia y desde la version anterior, con rollback o roll-forward documentado. | M | CI sobre ambos caminos y ensayo previo a la demo. |

### 6.2 Autenticacion y autorizacion

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RNF-SEC-01 | Express debera intermediar el flujo Supabase Auth con PKCE y conservar la sesion persistente unicamente en cookie `Secure` y `HttpOnly`; JavaScript no podra leer refresh tokens persistentes. | M | E2E, inspeccion de almacenamiento y cookies. |
| RNF-SEC-02 | La cookie usara `SameSite=Lax` cuando frontend y API sean same-site; `SameSite=None` solo se permitira para un despliegue cross-site explicito y siempre con `Secure`. | M | Pruebas en ambos perfiles de despliegue. |
| RNF-SEC-03 | Toda mutacion autenticada por cookie debera exigir coincidencia exacta de `Origin` con la allowlist y un token CSRF valido. | M | Ataques CSRF, origen parecido, ausente y autorizado. |
| RNF-SEC-04 | Todo JWT o sesion de Supabase debera validar criptograficamente firma, algoritmo permitido, emisor, audiencia, expiracion, `nbf` y sujeto; decodificar sin validar no sera suficiente. | M | Tokens alterados, expirados, de otro proyecto y con algoritmo invalido. |
| RNF-SEC-05 | Admins hospitalarios y superadmins deberan operar en AAL2; crear admins, cambiar membresias o ejecutar una solicitud privilegiada requerira step-up de antiguedad maxima de 5 minutos. | M | AAL1 denegado, AAL2 valido y step-up vencido. |
| RNF-SEC-06 | El acceso contextual a PII debera usar un grant maximo de 10 minutos ligado al superadmin, solicitud, donante, campos y accion concretos, sin capacidad de busqueda general. | M | Uso fuera de alcance, replay y grant vencido denegados. |
| RNF-SEC-07 | Express debera consultar la membresia protegida vigente en cada operacion; rol y hospital no podran derivarse de metadata editable ni de parametros confiados al cliente. | M | Revocacion inmediata usando la misma sesion y `hospitalId` falsificado. |
| RNF-SEC-08 | API y RLS deberan aplicar denegacion por defecto segun actor, propietario, hospital, recurso y proyeccion de campos. | M | Matriz negativa completa mediante API y acceso directo a Supabase. |
| RNF-SEC-09 | Los repositorios ordinarios deberan ejecutar con identidad del usuario; `service_role` solo podra usarse en operaciones excepcionales incluidas en una allowlist, nunca en el navegador ni en el worker. | M | Pruebas de permisos y escaneo del bundle. |
| RNF-SEC-10 | El worker debera disponer unicamente de `EXECUTE` sobre RPC permitidas para outbox y entrega, sin acceso general a tablas; las funciones privilegiadas deberan fijar `search_path` y revocar `PUBLIC`. | M | Intentos del worker sobre tablas y RPC no permitidas. |

### 6.3 Sesiones, tokens, abuso e idempotencia

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RNF-SEC-11 | Recuperacion de contrasena debera responder sin enumerar cuentas, usar redirect exacto permitido y credencial de un uso valida por 1 hora; al completarse revocara sesiones anteriores y no cambiara rol, hospital ni MFA. | M | Cuenta existente/inexistente, replay, redirect hostil y sesion previa. |
| RNF-SEC-12 | Tokens de reclamo, confirmacion, rechazo, recuperacion y cambio de email deberan usar al menos 256 bits generados por CSPRNG, estar ligados a recurso y accion, y persistirse para validacion solo mediante hash. | M | Entropia/configuracion, accion cruzada, replay y busqueda de texto plano. |
| RNF-SEC-13 | Las paginas que reciben tokens deberan usar `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, no cargar terceros y no registrar query strings, URL completa ni encabezados sensibles. | M | Inspeccion de headers y telemetria canaria. |
| RNF-SEC-14 | El outbox podra conservar el token necesario para email solo como payload cifrado con autenticacion y clave exclusiva del worker; debera destruirlo tras entrega definitiva, fallo final o vencimiento. | M | Inspeccion de DB, permisos, ciclo de vida y rotacion simulada. |
| RNF-SEC-15 | Login y recuperacion deberan permitir 10 intentos y bloquear el once durante la ventana movil `(t - 15 min, t]` si alcanza el limite el contador independiente por IP o por HMAC del email normalizado. | M | Concurrencia entre instancias, rotacion de IP/email y bordes temporales. |
| RNF-SEC-16 | Los contadores deberan ser compartidos y atomicos, confiar solo en proxies enumerados y no aceptar `X-Forwarded-For` arbitrario. | M | Dos instancias y encabezado forjado. |
| RNF-REL-01 | Toda operacion reintentable debera vincular `Idempotency-Key` a actor, operacion y hash canonico del payload mediante una restriccion unica. | M | Veinte solicitudes concurrentes con una sola ejecucion. |
| RNF-REL-02 | Misma clave y payload debera reproducir el resultado original; payload distinto o ejecucion en curso debera devolver `409`; el registro se conservara hasta 72 horas despues del estado terminal o hasta la purga. | M | Replay, conflicto, carrera y avance de reloj. |

### 6.4 Secretos, API, errores y telemetria

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RNF-SEC-17 | Solo claves explicitamente publicas de Supabase y Mapbox podran aparecer en el cliente, restringidas por RLS, origen y cuota; `service_role`, claves Resend, webhook, HMAC, cifrado y base privilegiada permaneceran en gestores servidor separados por entorno. | M | Escaneo de fuente, bundle, source maps, artefactos e historial. |
| RNF-SEC-18 | CORS debera aceptar unicamente origenes exactos configurados y nunca `*` junto con credenciales. | M | Preflight y solicitudes desde origenes no autorizados. |
| RNF-API-01 | Toda entrada externa debera validarse con esquemas cerrados que rechacen campos desconocidos, longitudes, enums, UUID, coordenadas o tamanos invalidos. | M | Fuzzing, mass assignment y pruebas de frontera. |
| RNF-API-02 | Los errores deberan usar un esquema unico con codigo estable, mensaje seguro y `correlationId`; no revelaran stack, SQL, proveedor, existencia de recursos ajenos ni detalles internos. | M | Errores 400/401/403/404/409/422/500 y comparacion IDOR. |
| RNF-OBS-01 | Logs, metricas, trazas, errores y access logs deberan usar una allowlist cerrada: evento, resultado, codigo HTTP, duracion, entorno, plantilla de ruta y correlation ID opaco. | M | Inspeccion de salidas reales de cada flujo. |
| RNF-OBS-02 | Telemetria no debera contener cuerpos, query strings, URLs completas, headers, cookies, tokens, claves idempotentes, nombre, email, grupo, disponibilidad, respuesta, coordenadas, IP sin transformar ni contenido completo de emails o webhooks. | M | Valores canario buscados en todos los destinos. |
| RNF-AUD-01 | La auditoria append-only y restringida debera registrar con IDs opacos actor, evento, recurso, resultado, fecha y motivo aplicable para roles, membresias, sedes, configuracion, politicas de reconocimiento, contenidos legales, necesidades, lotes, invitaciones, outbox, respuestas y accesos privilegiados, sin guardar valores PII anteriores o nuevos. | M | Un evento verificable por clase y actualizacion/borrado denegados. |

### 6.5 Privacidad, seguridad clinica y contenido legal

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RNF-PRV-01 | Todos los fixtures, perfiles y coordenadas del prototipo deberan ser sinteticos; una precision de tres decimales no debera describirse como anonimizacion para datos reales. | M | Revision de fixtures, capturas y textos. |
| RNF-PRV-02 | `final_demo_at` debera ser fijada una sola vez por superadmin y ser inmutable; a mas tardar 30 dias despues deberan purgarse Auth, DB, perfiles, membresias, ubicaciones, necesidades, invitaciones, respuestas, solicitudes, tokens, outbox, caches, archivos y metadatos controlables de proveedores. | M | Reloj controlado e inventario antes/despues por almacen. |
| RNF-PRV-03 | Despues de la purga solo podran permanecer conteos agregados irreversibles sin IDs, pseudonimos ni dimensiones que permitan vinculacion. | M | Intento de busqueda y reidentificacion con datos previos. |
| RNF-PRV-04 | Cada backup debera tener fecha maxima de expiracion documentada; una restauracion debera ejecutarse en cuarentena y reaplicar el ledger de eliminaciones antes de habilitar acceso. | M | Ensayo de restauracion de un backup anterior a la purga. |
| RNF-SAF-01 | `MATRIZ_RBC_ACADEMICA_V1` debera identificarse como declaracion academica para datos sinteticos, no como fuente oficial, recomendacion ni validacion clinica. | M | Revision de UI, API, email, pruebas e informes. |
| RNF-SAF-02 | El sistema debera mostrar en los flujos y mensajes pertinentes que matching significa unicamente preseleccion academica y que confirmar significa intencion de asistir. Ante cualquier eventual proceso real, el hospital debera verificar mediante sus procesos profesionales la identidad, el grupo sanguineo y la elegibilidad antes de una donacion efectiva. El prototipo no realiza ni registra esa evaluacion y no certifica asistencia, donacion ni seguridad transfusional. | M | Revision de textos en flujos de ambos roles y presencia del aviso de verificacion profesional externa. |
| RNF-SAF-03 | Todo uso con datos reales debera permanecer bloqueado hasta contar con fuente oficial versionada, revision clinica competente y revision legal/privacidad aplicable en Peru; cumplir esos gates no constituira por si solo certificacion. | M | Gate de configuracion y checklist documental. |
| RNF-SAF-04 | Formularios, API, email, logs y reportes no deberan incluir identidad de pacientes, diagnosticos, historias clinicas ni contacto paciente-donante. | M | Contract tests y busqueda automatizada de campos prohibidos. |
| RNF-LGL-01 | El segmento de RF-LAB-01 debera provenir de un artefacto juridico versionado que registre articulos y URLs oficiales, fecha de consulta, fecha y rol del revisor, y estado `borrador`, `aprobado` o `retirado`. Solo el estado `aprobado` tras revision legal profesional aplicable en Peru podra mostrar conclusiones; los otros estados mostraran un aviso de validacion pendiente o contenido retirado, sin asesoria legal ni garantia individual. | M | Contrato y revision de fuentes, metadatos, estados y textos; contenido ausente, borrador o retirado sin conclusiones y publicacion aprobada con evidencia profesional. |

### 6.6 Rendimiento

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RNF-PER-01 | Las metricas p95 deberan medirse por nearest-rank en staging caliente con exactamente 3 hospitales, 500 donantes sinteticos, 10 warmups excluidos y al menos 100 muestras. | M | Reporte reproducible con dataset, revision y muestras. |
| RNF-PER-02 | El matching debera alcanzar `p95 < 2 000 ms` desde la aceptacion del comando hasta el commit de invitaciones y outbox, con 5 solicitudes concurrentes, sin cold start ni entrega de Resend. | M | Benchmark conforme a RNF-PER-01. |
| RNF-PER-03 | Las operaciones API comunes sin matching ni proveedor externo deberan alcanzar `p95 < 500 ms` con concurrencia 10: perfil propio, listas y detalles propios, actualizaciones permitidas y transiciones simples. | M | Benchmark por operacion y agregado. |
| RNF-PER-04 | El dashboard debera quedar utilizable en `p95 <= 5 000 ms`, medido desde navegacion hasta datos principales visibles y acciones habilitadas. | M | Medicion de navegador en staging. |
| RNF-PER-05 | Una respuesta confirmada debera reflejarse en el dashboard hospitalario en `p95 <= 5 000 ms`, desde el commit hasta su representacion visible. | M | Medicion correlacionada extremo a extremo. |
| RNF-PER-06 | Con el worker caliente, el primer intento de un outbox debera comenzar como maximo 60 segundos despues del commit; los cold starts se mediran y reportaran aparte. | M | Timestamps correlacionados y reporte separado. |

### 6.7 Accesibilidad y compatibilidad

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RNF-A11Y-01 | Los flujos criticos de los tres roles deberan satisfacer los criterios aplicables de WCAG 2.1 AA. | M | Matriz criterio-flujo con evidencia. |
| RNF-A11Y-02 | Los flujos criticos no deberan presentar hallazgos automaticos criticos o serios y deberan completarse por teclado, con foco visible y gestionado, contraste AA, reflow/zoom y prueba basica con lector de pantalla. | M | Auditoria automatizada mas checklist manual. |
| RNF-COMP-01 | Antes de la demo se ejecutara smoke en las dos ultimas versiones disponibles de Chrome, Edge, Firefox y Safari, desktop y mobile cuando aplique, mediante dispositivos reales o servicio cloud. | M | Matriz fechada con version, dispositivo y resultado. |
| RNF-COMP-02 | Los viewports normativos seran `320x800`, `360x800`, `768x1024`, `1024x768` y `1440x900`, sin perdida de contenido ni acciones por desbordamiento. | M | Capturas y pruebas funcionales en los cinco tamanos. |

### 6.8 Operacion, calidad y dependencias

| ID | Requisito | Prioridad | Verificacion |
| --- | --- | ---: | --- |
| RNF-OPS-01 | Liveness debera indicar unicamente que el proceso esta ejecutandose y no depender de Supabase, Resend ni Mapbox. | M | Dependencias caidas con proceso vivo. |
| RNF-OPS-02 | Readiness de API debera exigir configuracion obligatoria, conexion DB y migraciones vigentes; readiness del worker debera exigir ademas acceso a sus RPC/outbox. Un fallo debera devolver `503` sin detalles sensibles. | M | Fallo independiente de cada condicion. |
| RNF-OPS-03 | La disponibilidad de red de Resend o Mapbox no debera reiniciar procesos mediante readiness; se comprobara por smoke y telemetria segura. | M | Proveedor caido con proceso listo y alerta observable. |
| RNF-OPS-04 | Antes de la demo debera ejecutarse un smoke sin PII que compruebe web, API, Auth, DB, worker y Resend usando un inbox permitido. | M | Evidencia fechada y correlation IDs opacos. |
| RNF-OPS-05 | Debera existir un procedimiento probado de reinicio, recuperacion y replay idempotente del outbox sin emails logicos duplicados. | M | Detener/reiniciar worker y reconciliar resultado incierto. |
| RNF-QLT-01 | La verificacion minima debera incluir unitarias de las 64 combinaciones y Haversine; integracion real de DB/transacciones/outbox; pruebas negativas API/RLS; E2E de los tres roles; concurrencia, replay, purga, rendimiento, accesibilidad y smoke. | M | Matriz requisito a prueba sin requisitos Must huerfanos. |
| RNF-DEP-01 | Sprint 0 debera fijar version de Node.js, gestor, TypeScript y dependencias con un unico lockfile e instalacion inmutable; CI debera detectar secretos y vulnerabilidades Critical/High alcanzables no mitigadas. | M | Instalacion limpia reproducible, secret scan y auditoria documentada. |

No se establece SLA productivo. Los cold starts y limites de los planes se
registraran como condiciones de la demostracion y no como garantias de
disponibilidad.

## 7. Reglas de dominio

### 7.1 Matriz academica declarada

`MATRIZ_RBC_ACADEMICA_V1` describe unicamente el resultado esperado del
prototipo para globulos rojos en direccion donante declarado a receptor
requerido.

| Donante declarado | Receptores declarados admitidos por la matriz |
| --- | --- |
| `O_NEG` | `O_NEG`, `O_POS`, `A_NEG`, `A_POS`, `B_NEG`, `B_POS`, `AB_NEG`, `AB_POS` |
| `O_POS` | `O_POS`, `A_POS`, `B_POS`, `AB_POS` |
| `A_NEG` | `A_NEG`, `A_POS`, `AB_NEG`, `AB_POS` |
| `A_POS` | `A_POS`, `AB_POS` |
| `B_NEG` | `B_NEG`, `B_POS`, `AB_NEG`, `AB_POS` |
| `B_POS` | `B_POS`, `AB_POS` |
| `AB_NEG` | `AB_NEG`, `AB_POS` |
| `AB_POS` | `AB_POS` |

La declaracion produce 27 pares admitidos y 37 rechazados entre 64 pares
ordenados. Esa cuenta verifica cobertura frente a la tabla y no validez
clinica.

### 7.2 Orden de preseleccion

Para cada lote, el sistema aplicara este orden sin omitir filtros previos:

1. Excluir cuentas inactivas, perfiles incompletos, indisponibles y ubicaciones
   invalidas.
2. Excluir puntos fuera del poligono versionado de Lima.
3. Excluir puntos cuya distancia Haversine no redondeada supere el radio.
4. Excluir donantes ya invitados a la necesidad o que excedan la cuota global.
5. Separar coincidencias exactas ABO/Rh de otras coincidencias admitidas por la
   matriz.
6. Ordenar primero las exactas y despues las demas coincidencias.
7. Dentro de cada grupo, ordenar por distancia ascendente y luego por ID opaco.
8. Crear como maximo la cantidad determinada por
   `min(50, max(5, 2 x meta))` o todos los candidatos disponibles si son menos.

La urgencia no altera ningun paso del orden.

### 7.3 Calculo de distancia

Haversine se ejecutara como funcion pura de dominio con radio terrestre medio
`6 371 008.8 m`. La comparacion con el radio de la necesidad usara la distancia
no redondeada e incluira el borde `distancia <= radio`.

### 7.4 Limites clinicos y de comunicacion

- El grupo informado es una declaracion para preseleccion y no un resultado de
  laboratorio.
- La matriz no se reutilizara para plasma, plaquetas ni otros componentes.
- El sistema no inferira aptitud, contraindicaciones ni intervalos de donacion.
- Confirmar solo expresa intencion de asistir.
- Cualquier proceso real exigiria verificacion profesional externa de identidad,
  grupo y elegibilidad.
- Ninguna pantalla, email, API o reporte afirmara que el prototipo garantiza una
  transfusion segura o satisface una necesidad clinica.

### 7.5 Limites de reconocimientos e informacion laboral

- La ausencia de una politica publicada es valida y no reduce las funciones del
  hospital ni la participacion del donante.
- Solo se admiten `refrigerio`, `diploma` y `pin`; no se modelan dinero, vales,
  descuentos, sorteos, puntos, creditos, canjes ni otros beneficios.
- La politica no participa en filtros, ranking, radio, urgencia, lotes, cuotas,
  invitaciones o respuestas y no puede usarse para presionar una confirmacion.
  Tampoco habilita comparadores, orden, filtros, promocion o escasez entre
  hospitales.
- Preseleccion, intencion de asistir, asistencia, evaluacion profesional externa,
  donacion efectiva y entrega son etapas distintas. La plataforma solo registra
  las dos primeras y ninguna etapa acredita la siguiente.
- El hospital determina fuera de la plataforma una eventual donacion efectiva y
  decide la entrega. El sistema no registra asistencia, evaluacion, donacion,
  entrega ni canje.
- El segmento comun es independiente de hospital, invitacion, reconocimiento y
  respuesta. La plataforma no emite constancias, no decide permisos y solo
  muestra conclusiones provenientes del contenido juridico aprobado.

## 8. Casos de uso de alto nivel

Los casos de uso de esta seccion son una vista informativa. Los RF/RNF de las
secciones 4 y 6 son el inventario normativo primario; las elaboraciones
vinculantes se identifican en la seccion 1.4.

Se agrupan por el rol que persigue el objetivo y conservan sus IDs. Los
recorridos de la seccion 4 tambien cubren capacidades provenientes de matrices
y pantallas que no tienen un CU independiente. No se crean CU para completar
artificialmente el inventario.

### 8.1 Donante

#### CU-01: Registrar y activar un donante

| Campo | Descripcion |
| --- | --- |
| Actor | Donante. |
| Precondicion | El usuario no posee una cuenta activa o dispone de un alta asistida valida. |
| Flujo principal | Registrar o reclamar, verificar email, completar perfil obligatorio y activar cuenta. |
| Resultado | Perfil activo; puede ser considerado por la preseleccion academica cuando cumpla las condiciones operativas correspondientes. |
| Excepciones | Email no enumerable, token usado o vencido, perfil incompleto, ubicacion invalida. |
| Requisitos | RF-IAM-01 a RF-IAM-04; RF-PRO-01 y RF-PRO-05; RNF-SEC-01 a RNF-SEC-04; RNF-SEC-12 y RNF-SEC-13. |

#### CU-03: Responder una invitacion

| Campo | Descripcion |
| --- | --- |
| Actor | Donante o portador legitimo del token. |
| Precondicion | Invitacion activa y no vencida; necesidad activa para la primera respuesta. |
| Flujo principal | Consultar informacion por GET, enviar POST de confirmacion o rechazo, consumir token y registrar historial. |
| Resultado | Respuesta atomica; si se alcanza la meta, la necesidad y trabajos pendientes cambian consistentemente. |
| Excepciones | Token hermano, replay, vencimiento, meta alcanzada, necesidad terminal o dos POST concurrentes. |
| Requisitos | RF-INV-01 a RF-INV-08, RNF-SEC-12 a RNF-SEC-14. |

### 8.2 Admin hospitalario

#### CU-02: Crear una necesidad y ejecutar un lote

| Campo | Descripcion |
| --- | --- |
| Actor | Admin hospitalario. |
| Precondicion | Sesion AAL2, membresia vigente y sede activa de su hospital. |
| Flujo principal | Crear necesidad `RBC`, activarla, solicitar lote manual, preseleccionar y persistir invitaciones/outbox/auditoria. |
| Resultado | Invitaciones unicas creadas de forma atomica y trabajos listos para envio. |
| Excepciones | Sede ajena, parametros fuera de rango, necesidad no activa, cuota agotada, falta de candidatos o carrera concurrente. |
| Requisitos | RF-NEC-01 a RF-NEC-08; RF-MAT-01 a RF-MAT-05; RF-BAT-01 a RF-BAT-04; RNF-SEC-05 a RNF-SEC-10. |

#### CU-04: Consultar y cerrar una necesidad

| Campo | Descripcion |
| --- | --- |
| Actor | Admin hospitalario. |
| Precondicion | La necesidad pertenece al hospital derivado de la identidad vigente. |
| Flujo principal | Consultar conteos y estados, ver campos minimos de confirmaciones afirmativas y cerrar o cancelar. |
| Resultado | Estado terminal, invitaciones pendientes invalidadas y outbox no enviado cancelado. |
| Excepciones | Hospital ajeno, manipulacion de `hospitalId`, recurso no revelado o conflicto concurrente. |
| Requisitos | RF-NEC-06; RF-INV-08; RF-VIS-01 y RF-VIS-02; RNF-SEC-07 y RNF-SEC-08. |

### 8.3 Superadmin en colaboracion con el donante

#### CU-05: Resolver una solicitud privilegiada

| Campo | Descripcion |
| --- | --- |
| Actor | Donante y superadmin. |
| Precondicion | Solicitud creada; superadmin en AAL2 con step-up reciente. |
| Flujo principal | Revisar, aprobar o rechazar, emitir grant contextual, ejecutar y auditar. |
| Resultado | Correccion o eliminacion completada, o solicitud terminal fallida/rechazada sin acceso general al padron. |
| Excepciones | Step-up vencido, grant fuera de alcance, replay, solicitud no aprobada o fallo de ejecucion. |
| Requisitos | RF-PRO-02 a RF-PRO-04, RNF-SEC-05, RNF-SEC-06, RNF-AUD-01. |

### 8.4 Hospital, donante y superadmin

#### CU-07: Publicar, consultar y supervisar reconocimientos

| Campo | Descripcion |
| --- | --- |
| Actor | Admin hospitalario, donante y superadmin, cada uno dentro de su recorrido autorizado. |
| Precondicion | Hospital activo; admin con membresia propia y AAL2 para publicar; donante en el contexto previsto; superadmin en AAL2 para supervisar. |
| Flujo principal | El admin publica una seleccion cerrada o la retira; el donante consulta por separado la oferta neutral y el segmento comun; el superadmin puede suspender o levantar la suspension con motivo. |
| Resultado | Politica institucional versionada visible o ausencia explicita, contenido laboral gobernado y supervision auditable, sin cambios en matching ni estados de invitacion. |
| Excepciones | Tipo no permitido, hospital ajeno, version obsoleta, suspension o levantamiento sin motivo, mutacion hospitalaria suspendida o contenido juridico no aprobado; no ofrecer ninguno es un resultado valido, no una excepcion. |
| Requisitos | RF-REC-01 a RF-REC-04, RF-LAB-01, RNF-SEC-05, RNF-SEC-07, RNF-SEC-08, RNF-AUD-01 y RNF-LGL-01. |

### 8.5 Soporte automatico de las invitaciones

CU-06 soporta HOS-OBJ-04 y las invitaciones consultadas por el donante; sus
actores tecnicos no se convierten en roles de negocio.

#### CU-06: Entregar y reconciliar email

| Campo | Descripcion |
| --- | --- |
| Actor | Worker y Resend. |
| Precondicion | Trabajo de outbox reclamable, necesidad vigente y destinatario allowlisted. |
| Flujo principal | Reclamar, descifrar payload efimero, verificar allowlist, enviar con clave idempotente y procesar webhook. |
| Resultado | Estado de entrega actualizado sin duplicar el envio logico. |
| Excepciones | Timeout, resultado incierto, `408`, `429`, `5xx`, error permanente, webhook alterado, antiguo o duplicado. |
| Requisitos | RF-EML-01 a RF-EML-04; RNF-SEC-10; RNF-SEC-14; RNF-REL-01 y RNF-REL-02; RNF-OPS-05. |

## 9. Verificacion y aceptacion

### 9.1 Estrategia de verificacion

| Nivel | Objetivo minimo |
| --- | --- |
| Unitario | Cubrir las 64 combinaciones de la matriz, Haversine, ranking, formulas de lote, cuotas y transiciones puras. |
| Integracion | Usar PostgreSQL real para restricciones, RLS, RPC, transacciones, outbox, idempotencia, reloj y concurrencia. |
| Contrato/API | Verificar esquemas cerrados, DTO permitidos, errores seguros, campos prohibidos e interfaces de adaptadores. |
| Seguridad | Probar roles, propietario, hospital, RLS, CSRF, CORS, JWT, MFA, step-up, tokens, rate limits, secretos y telemetria. |
| E2E | Completar flujos criticos de donante, admin hospitalario y superadmin, incluidos estados negativos. |
| Rendimiento | Ejecutar benchmarks conforme a RNF-PER-01 a RNF-PER-06. |
| Accesibilidad | Combinar auditoria automatizada con teclado, foco, zoom/reflow, contraste y lector de pantalla. |
| Compatibilidad | Ejecutar la matriz de navegadores y viewports normativos. |
| Operacion | Verificar liveness, readiness, reinicio, replay del worker, purga, restauracion y smoke real de Resend. |

Cada requisito `Must` debera enlazarse en una matriz con prueba, nivel, comando,
resultado y artefacto. No se aceptaran requisitos `Must` sin evidencia ni
pruebas omitidas o en cuarentena.

Cuando un ID contenga varias clausulas, la matriz de pruebas debera demostrar
cada clausula por separado; aprobar una no implicara aprobar las demas.
La misma matriz incorporara las elaboraciones de las secciones 3, 5, 7 y 9.2
bajo sus RF/RNF relacionados.

La lectura vertical de esa evidencia usara:

`rol -> objetivo -> RF/RNF y clausula -> escenario -> prueba -> nivel -> comando -> resultado -> artefacto`.

- Para cada DON-OBJ, HOS-OBJ y SA-OBJ se verificaran las precondiciones, el
  resultado y los casos negativos o de frontera de su ficha en la seccion 4.
- Los recorridos compartidos tendran evidencia de ambos participantes; por
  ejemplo, solicitar una correccion no demuestra que su resolucion sea correcta.
- Una misma prueba puede respaldar varios recorridos mediante referencias,
  sin duplicar requisitos ni contabilizar una clausula como verificada por
  aprobar otra del mismo ID.
- Los RNF comunes tendran evidencia en los roles y flujos a los que aplican;
  comprobar accesibilidad o aislamiento en un solo rol no cubre los otros.
- Las clausulas afectadas por AP se marcaran pendientes de decision, nunca
  aprobadas ni omitidas silenciosamente. Se conservan los criterios de 9.5.
- HOS-OBJ-07 conserva su caracter opcional; la agrupacion por rol no eleva sus
  dos RF `Could` a `Must`.
- HOS-OBJ-08 es opcional respecto de publicar una oferta, pero sus RF son
  `Must`: el sistema debe admitir tanto una seleccion valida como la ausencia de
  reconocimientos sin alterar el resto del flujo.

### 9.2 Datos de prueba

- El seed contendra exactamente tres hospitales y 500 donantes sinteticos.
- Estaran representadas las ocho categorias ABO/Rh y ubicaciones dentro de Lima.
- Existira un superadmin, un admin por hospital y al menos un donante por grupo.
- El Hospital A ofrecera `refrigerio` y `diploma`, el Hospital B no publicara
  reconocimientos y el Hospital C ofrecera `pin`; esas variantes no cambiaran
  el oraculo de matching y conservaran versiones y fechas deterministas.
- El oraculo juridico incluira artefactos `borrador`, `aprobado` y `retirado`
  con fuentes y metadatos sinteticos; solo el fixture aprobado habilitara
  conclusiones en la prueba, sin representar una aprobacion profesional real del
  proyecto.
- El oraculo fijara candidatos, clasificacion exacta o coincidente, distancias
  relativas, orden, cuotas y estados esperados.
- El oraculo garantizara los seis candidatos del primer lote `A_POS`, al menos
  un candidato nuevo de reserva para el lote posterior y control determinista
  suficiente para conservar al menos un trabajo de outbox pendiente.
- Dos resets consecutivos produciran el mismo checksum semantico.
- El reset sera un comando privilegiado, no expuesto por HTTP, y abortara fuera
  de `test` o `demo`.
- El reset no recibira secretos mediante argumentos ni archivos versionados;
  usara configuracion inyectada desde el gestor de secretos del entorno.
- Credenciales e inboxes reales se entregaran por canal seguro y no apareceran
  en repositorio, capturas ni reportes.

### 9.3 Escenario principal de aceptacion

1. Registrar build, commit, version documental, entorno, migraciones y health.
2. Ejecutar el reset determinista.
3. Ingresar como admin del Hospital A con MFA.
4. Publicar `refrigerio` y `diploma` para el Hospital A; comprobar que otro tipo
   se rechaza y que no publicar reconocimientos para el Hospital B es valido.
5. Crear una necesidad `A_POS`, meta `3`, radio `10 km`, urgencia `Urgente`,
   vencimiento `24 h` y sede autorizada.
6. Ejecutar el lote manual y comprobar seis candidatos, exactos antes que otras
   coincidencias y con orden estable.
7. Procesar mediante API, DB, transaccion y worker al menos tres invitaciones
   usando el adaptador falso de Resend, y conservar de forma controlada al menos
   un trabajo de outbox sin enviar.
8. Consultar como donante la oferta vigente del Hospital A, neutral y separada
   de urgencia, respuesta e informacion laboral; comprobar version, fecha y que
   no compara hospitales, promete entrega ni acredita donacion. Verificar que el
   segmento comun solo muestra conclusiones con el fixture juridico aprobado y
   muestra validacion pendiente ante un borrador.
9. Registrar tres confirmaciones unicas y comprobar `meta_alcanzada`,
   invalidacion de invitaciones sin respuesta y cancelacion del outbox pendiente.
10. Comprobar la lista cerrada de campos visible para el hospital.
11. Cambiar una confirmacion a rechazo desde una sesion de donante y comprobar
   retorno a `activa`, conteo `2` y ausencia de lote automatico.
12. Solicitar manualmente otro lote y comprobar candidatos nuevos sin
     duplicados.
13. Registrar una nueva confirmacion, recuperar la meta y cerrar la necesidad.
14. Intentar responder o reintentar despues del cierre y comprobar que la
     necesidad no revive.
15. Ingresar como admin del Hospital B e intentar acceder a la necesidad del
     Hospital A alterando tambien `hospitalId`; UI, API y RLS deberan negar sin
     revelar existencia.
16. Ejecutar como superadmin un flujo breve de solicitud del donante y otro de
     suspension motivada de la politica del Hospital A; comprobar step-up,
     grant contextual solo donde corresponde, retiro de publicacion, bloqueo de
     una mutacion hospitalaria con version vigente, conflicto con version
     obsoleta, levantamiento motivado y auditoria.

### 9.4 Smoke real de Resend

- Se ejecutara separado del escenario principal.
- Usara un unico destinatario allowlisted y datos sinteticos.
- Producira exactamente un envio logico.
- Registrara un ID opaco del proveedor.
- Reconciliara el webhook sin duplicar estado.
- El mensaje debera aparecer en el inbox permitido dentro de cinco minutos.
- Si alguna condicion falla, el smoke no aprobara; el adaptador falso no
  sustituira esta evidencia.

### 9.5 Criterios de aceptacion de la version

- La linea base identificara version del documento, commit y despliegue
  evaluado.
- Todos los RF/RNF `Must` tendran evidencia aprobada.
- El escenario principal y el smoke real de Resend se completaran.
- No quedaran defectos `Critical` o `High` abiertos.
- Sera `Critical` un bypass de aislamiento o autorizacion, exposicion de
  secretos o PII, uso real no autorizado, destruccion irreversible o afirmacion
  clinica insegura.
- Sera `High` un flujo Must bloqueado, matching o estado incorrecto, email
  logico duplicado, perdida de consistencia, borrado incumplido o
  inaccesibilidad de un flujo critico; tambien un reconocimiento no permitido,
  una oferta que altere la preseleccion o informacion laboral presentada como
  constancia o permiso garantizado.
- Los riesgos `Medium` y `Low` quedaran documentados con responsable.
- La ausencia de RF-MAP-01 y RF-MAP-02 no bloqueara el MVP porque su prioridad
  es `Could`.

## 10. Trazabilidad y gestion de cambios

### 10.1 Trazabilidad de origen

| Elemento de esta ERS | Fuente de origen |
| --- | --- |
| Proposito, actores, flujo, alcance y exclusiones | `1_Primeros_Alcances.md`, secciones 1 y 2. |
| Arquitectura, topologia, componentes y despliegue | `1_Primeros_Alcances.md`, seccion 3; `ADR-001`. |
| Los 50 requisitos funcionales por rol de la seccion 4 | `1_Primeros_Alcances.md`, secciones 4.2.1 (donante), 4.2.2 (admin hospitalario) y 4.2.3 (superadmin). |
| Acceso y transiciones | `1_Primeros_Alcances.md`, secciones 4.3 y 4.4. |
| Los 57 requisitos no funcionales de la seccion 6 | `1_Primeros_Alcances.md`, seccion 4.5. |
| Matriz academica | `1_Primeros_Alcances.md`, seccion 4.6. |
| Pantallas, datos, guion y aceptacion | `1_Primeros_Alcances.md`, seccion 5. |
| Stack y criterios de reconsideracion | `ADR-001`. |

La trazabilidad descendente se completara con la matriz individual exigida en
la seccion 9.1. La columna `Verificacion` de cada RF/RNF define la evidencia
minima que esa matriz debe materializar.

#### Ubicacion principal y relaciones por objetivo

Esta matriz registra donde se define cada RF, una sola vez, y sus relaciones.
Los RNF particulares y criterios de aceptacion se encuentran en la ficha del
mismo objetivo; la aplicabilidad compartida se encuentra en la seccion 6.
Un guion en la columna RF significa que el recorrido reune RNF o elaboraciones
existentes, no que carezca de obligaciones ni que se haya creado un RF nuevo.

| Rol y objetivo | RF definidos en el recorrido | Referencias compartidas principales | CU o pantalla de origen |
| --- | --- | --- | --- |
| Donante / DON-OBJ-01 | RF-IAM-01, RF-IAM-03, RF-IAM-04 | RF-IAM-02; RF-PRO-01 y RF-PRO-05 | CU-01; AUTH-02, AUTH-03, DON-01 |
| Donante / DON-OBJ-02 | RF-PRO-01, RF-PRO-05, RF-INV-07 | RF-MAT-01 y RF-BAT-03 | Matriz 5.3; DON-02 |
| Donante / DON-OBJ-03 | RF-VIS-03 | RF-INV-01 | Matriz 5.3; DON-03 |
| Donante / DON-OBJ-04 | RF-INV-02, RF-INV-03 | RF-INV-01, RF-INV-05 y RF-INV-08 | CU-03; LINK-01 |
| Donante / DON-OBJ-05 | RF-INV-04 | RF-NEC-07, RF-INV-06 y RF-VIS-01 a RF-VIS-02 | CU-03; DON-03, DON-04 |
| Donante / DON-OBJ-06 | RF-PRO-02 | RF-PRO-03 y RF-PRO-04 | CU-05; DON-05 |
| Donante / DON-OBJ-07 | RF-REC-02, RF-LAB-01 | RF-REC-01, RF-REC-04; RNF-LGL-01 | CU-07; DON-06 |
| Hospital / HOS-OBJ-01 | — | RF-IAM-05, RF-ORG-01; RNF-SEC-05, RNF-SEC-07 y RNF-SEC-08 | Matriz 5.3; AUTH-05 |
| Hospital / HOS-OBJ-02 | RF-IAM-02 | RF-IAM-03 y RF-IAM-04 | CU-01; HOS-06 |
| Hospital / HOS-OBJ-03 | RF-NEC-01 a RF-NEC-05 | RF-ORG-01, RF-NEC-06 y RF-NEC-08 | CU-02; HOS-02, HOS-03 |
| Hospital / HOS-OBJ-04 | RF-MAT-01 a RF-MAT-05; RF-BAT-01 a RF-BAT-04; RF-EML-01 a RF-EML-04 | RF-INV-01, RF-INV-05, RF-INV-07 y RF-INV-08 | CU-02, CU-06; HOS-04 |
| Hospital / HOS-OBJ-05 | RF-INV-01, RF-VIS-01, RF-VIS-02 | RF-INV-02 a RF-INV-04; RF-EML-01 a RF-EML-04 | CU-04; HOS-01, HOS-04, HOS-05 |
| Hospital / HOS-OBJ-06 | RF-NEC-06 a RF-NEC-08; RF-INV-05, RF-INV-06, RF-INV-08 | RF-INV-03 y RF-INV-04; RF-BAT-02 | CU-04; HOS-03 |
| Hospital / HOS-OBJ-07 | RF-MAP-01, RF-MAP-02 | RNF-PRV-01; RNF-A11Y-01 y RNF-A11Y-02 | MAP-01 |
| Hospital / HOS-OBJ-08 | RF-REC-01, RF-REC-03 | RF-REC-02, RF-REC-04; RNF-SEC-07 y RNF-SEC-08 | CU-07; HOS-07 |
| Superadmin / SA-OBJ-01 | RF-ORG-01 | RF-NEC-05 | Matriz 5.3; SA-02, SA-03 |
| Superadmin / SA-OBJ-02 | RF-IAM-05 | RNF-SEC-05, RNF-SEC-07 y RNF-AUD-01 | Matriz 5.3; SA-04 |
| Superadmin / SA-OBJ-03 | RF-PRO-03, RF-PRO-04 | RF-PRO-02; RNF-SEC-05 y RNF-SEC-06 | CU-05; SA-05 |
| Superadmin / SA-OBJ-04 | — | RNF-SEC-05, RNF-SEC-06 y RNF-AUD-01 | CU-05; SA-05 |
| Superadmin / SA-OBJ-05 | — | RNF-PRV-02 a RNF-PRV-04 y RNF-AUD-01 | Entidades 5.1; SA-06 |
| Superadmin / SA-OBJ-06 | — | RNF-AUD-01 y RNF-SEC-08 | SA-07 |
| Superadmin / SA-OBJ-07 | RF-REC-04 | RF-REC-01 a RF-REC-03; RNF-SEC-05 y RNF-AUD-01 | CU-07; SA-08 |

La distribucion de definiciones es 13 RF en donante, 32 en admin hospitalario y
5 en superadmin: 50 en total. Esta cuenta indica ubicacion documental, no
exclusividad de aplicacion. Los 57 RNF conservan su definicion en la seccion 6.

### 10.2 Reglas de cambio

- Ningun ID eliminado se reutilizara para otro significado.
- Todo cambio funcional actualizara requisito, verificacion, prueba y
  trazabilidad en la misma entrega.
- Un cambio de stack, estilo arquitectonico o proveedor con impacto estructural
  requerira un ADR nuevo que reemplace la decision vigente.
- Una regla clinica nueva requerira fuente oficial versionada y revision
  profesional competente antes de entrar en la linea base.
- Un cambio que trate datos reales requerira revision legal, clinica, de
  seguridad y de privacidad aplicable en Peru.
- Las contradicciones entre fuentes se resolveran explicitamente; no se
  implementara el comportamiento en disputa mientras siga sin resolverse.

### 10.3 Criterios de reconsideracion arquitectonica

Se debera revisar `ADR-001` si aparece una integracion JVM, HIS o HL7
obligatoria; si el volumen o la operacion justifican PostGIS o servicios
separados; si Resend no cubre requisitos verificados de entrega; o si Vercel o
Render no satisfacen los objetivos medidos del prototipo. Una reconsideracion
requiere un ADR nuevo y no modifica esta ERS de forma implicita.

### 10.4 Detalles pendientes de Sprint 0

Los siguientes puntos concretan la implementacion, pero no autorizan cambios de
comportamiento respecto de esta ERS:

- versiones exactas de Node.js, TypeScript, Express, Tailwind y SDK;
- gestor de paquetes, unico lockfile e instalacion inmutable;
- estructura concreta del monorepo y comandos de build, lint, test y desarrollo;
- SQL de tablas, indices, RLS, grants y RPC;
- biblioteca o patron de acceso a datos;
- algoritmo y rotacion del cifrado autenticado del outbox;
- mecanismo concreto de CSRF y nombres de cookies;
- archivo GeoJSON, version y hash del poligono de Lima;
- implementacion acotada del jitter de reintentos, una vez resuelto AP-08;
- proveedor de pruebas en navegadores reales;
- perfiles reproducibles de carga, tasa de exito, infraestructura, region,
  navegador y red para medir los umbrales de rendimiento ya aprobados;
- rutas REST y esquemas OpenAPI o equivalentes;
- configuracion de health checks, intervalos del worker, regiones y rollback;
- limites operativos comprobados de Vercel, Render, Supabase y Resend.

### 10.5 Ambiguedades heredadas que requieren decision

Las siguientes diferencias ya existen en la linea base de origen. Esta ERS las
hace visibles y no elige una solucion por inferencia. Los modulos afectados no
deben implementarse hasta registrar la decision y sincronizar las fuentes.

| ID | Ambiguedad | Decision requerida |
| --- | --- | --- |
| AP-01 | RF-IAM-03 incluye el estado `vencida`, mientras la tabla de transiciones indica que el vencimiento de un token no cambia el estado y permite reemision antes de la purga. | Definir el evento que lleva el alta a `vencida`, el estado despues de las 24 horas del token y las transiciones de reemision. |
| AP-02 | RF-EML-01 y RF-EML-02 exigen reintentos automaticos, pero la transicion `fallida -> pendiente` se reserva al reintento manual. | Distinguir estado agregado de entrega y estado de intento; definir cuando un error transitorio se vuelve `fallida`. |
| AP-03 | RF-INV-04 permite `confirmada -> rechazada`; RF-VIS-01 oculta identidades de rechazos y RF-VIS-02 permite datos tras una confirmacion afirmativa. | Definir la proyeccion que recibe el hospital despues de que una confirmacion cambia a rechazo. |
| AP-04 | La linea base exige atomicidad, pero no fija precedencia para confirmaciones distintas que compiten por la ultima plaza; cierre, cancelacion o vencimiento frente a envio en vuelo; ni cambio de respuesta frente a meta alcanzada. | Definir el resultado observable esperado para cada carrera; el mecanismo tecnico de bloqueo, aislamiento o serializacion se decide en Sprint 0. |
| AP-05 | RNF-SEC-12 incluye el token de cambio de email, pero no fija su vigencia. | Aprobar un TTL y el comportamiento observable en el limite. |
| AP-06 | RNF-SEC-14 exige destruir el payload cifrado tras entrega definitiva, fallo final o vencimiento, pero no fija el plazo maximo de esa destruccion. | Aprobar el plazo observable y su verificacion. |
| AP-07 | RNF-PRV-04 exige una expiracion documentada para backups sin fijar su limite respecto de `final_demo_at`. | Aprobar la cota maxima de retencion y su aplicacion a restauraciones. |
| AP-08 | RF-EML-01 fija la secuencia base de backoff, pero no acota el jitter. | Aprobar el rango o algoritmo verificable del jitter. |
| AP-09 | RF-INV-01 contempla vigencia `vencida`, RF-INV-02 exige tokens de accion de un uso y RF-INV-08 invalida invitaciones cuando vence la necesidad, pero no define que evento produce `activa -> vencida` ni la vigencia temporal propia de esos tokens. | Definir la relacion entre expiracion de token, invitacion y necesidad, con resultados observables en los limites. |

#### Localizacion de pendientes en la lectura por rol

Esta asociacion facilita encontrar las clausulas afectadas; no resuelve ni
cambia ninguna de las decisiones pendientes anteriores.

| Pendiente | Recorridos afectados |
| --- | --- |
| AP-01 | DON-OBJ-01 y HOS-OBJ-02: reclamo, estado y reemision de alta asistida. |
| AP-02 | HOS-OBJ-04 y HOS-OBJ-05: reintento y estado agregado de entrega. |
| AP-03 | DON-OBJ-05 y HOS-OBJ-05: cambio de respuesta y visibilidad posterior. |
| AP-04 | DON-OBJ-04, DON-OBJ-05, HOS-OBJ-04 y HOS-OBJ-06: carreras entre respuestas, meta, terminales y envio en vuelo. |
| AP-05 | DON-OBJ-06 y SA-OBJ-03: vigencia del token de cambio de email. |
| AP-06 | HOS-OBJ-04: destruccion del payload sensible de notificacion. |
| AP-07 | SA-OBJ-05 y retencion comun de los tres roles: limite de backups. |
| AP-08 | HOS-OBJ-04: rango verificable de jitter. |
| AP-09 | DON-OBJ-03 a DON-OBJ-05 y HOS-OBJ-04 a HOS-OBJ-06: vigencia de invitacion y tokens. |

## Anexo A. Inventario de pantallas

| ID | Rol | Pantalla y responsabilidad |
| --- | --- | --- |
| PUB-01 | Publico | Proposito, limites academicos/sinteticos y accesos para ingresar, registrarse o reclamar cuenta. |
| AUTH-01 | Todos | Inicio de sesion, cierre y sesion vencida. |
| AUTH-02 | Donante | Registro y verificacion de email. |
| AUTH-03 | Donante | Reclamo de alta asistida y resultados de token valido, usado, vencido o invalido. |
| AUTH-04 | Todos | Solicitud y finalizacion de recuperacion de contrasena. |
| AUTH-05 | Admins | Aceptacion de invitacion administrativa, configuracion/desafio MFA y step-up. |
| LINK-01 | Donante | Primera confirmacion o rechazo mediante token, sin mutacion por GET. |
| DON-01 | Donante | Onboarding y finalizacion del perfil. |
| DON-02 | Donante | Perfil propio, disponibilidad y ubicacion sintetica aproximada. |
| DON-03 | Donante | Lista y detalle de invitaciones; respuesta y cambio posterior autenticado. |
| DON-04 | Donante | Historial inmutable de respuestas. |
| DON-05 | Donante | Creacion y seguimiento de solicitudes de correccion o eliminacion. |
| DON-06 | Donante | Reconocimientos opcionales por hospital y segmento comun sobre constancia de donacion y permiso laboral. |
| HOS-01 | Hospital | Dashboard operativo con necesidades, metas y tareas pendientes. |
| HOS-02 | Hospital | Lista y creacion de necesidades. |
| HOS-03 | Hospital | Detalle, estados, cierre, cancelacion y datos operativos de una necesidad. |
| HOS-04 | Hospital | Ejecucion manual e historial de lotes y entregas. |
| HOS-05 | Hospital | Respuestas opacas y campos minimos de confirmaciones afirmativas. |
| HOS-06 | Hospital | Alta asistida minima, estado y reemision de activacion. |
| HOS-07 | Hospital | Publicacion o retiro de la politica opcional de refrigerio, diploma y/o pin. |
| SA-01 | Superadmin | Bandeja de tareas administrativas. |
| SA-02 | Superadmin | Hospitales autorizados. |
| SA-03 | Superadmin | Sedes autorizadas. |
| SA-04 | Superadmin | Admins, invitaciones y membresias. |
| SA-05 | Superadmin | Solicitudes, step-up, acceso contextual, decision y ejecucion. |
| SA-06 | Superadmin | Configuracion permitida y versionada. |
| SA-07 | Superadmin | Auditoria minimizada sin PII innecesaria. |
| SA-08 | Superadmin | Revision, suspension y levantamiento auditable de politicas de reconocimiento. |
| SYS-01 | Todos | Acceso denegado o recurso inexistente con respuesta neutra. |
| SYS-02 | Todos | Red o servicio no disponible y recuperacion. |
| MAP-01 | Hospital | Stretch: mapa agregado de una necesidad propia y alternativa tabular equivalente. |

## Anexo B. Entregables de evidencia

- URLs desplegadas y manifiesto de release con commit, builds y migraciones.
- Migraciones, seed y reset reproducibles.
- Instrucciones de ejecucion, recuperacion y rollback sin secretos.
- Cuentas de demo entregadas por canal seguro.
- Escenario principal y smoke real de Resend.
- Matriz `RF/RNF Must -> prueba -> nivel -> comando -> resultado -> artefacto`.
- Reportes unitarios, integracion, RLS, E2E, rendimiento, accesibilidad,
  navegadores, secretos y dependencias.
- Evidencia saneada del escenario `A_POS`, outbox/adaptador falso y aislamiento.
- Informe de defectos y riesgos residuales.

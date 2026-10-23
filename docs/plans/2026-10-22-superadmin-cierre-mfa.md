# Superadmin: inscripción MFA y cierre funcional — 2026-10-22

Estado: en progreso; sin commits/pushes.

## Alcance
Exclusivamente Superadmin y el recorrido de autenticación necesario para acceder. Conservar páginas/componentes/arquitectura y endpoints existentes. No editar módulos Hospital/Donante/Invitación. Preservar todos los cambios previos y datos locales.

## Diagnóstico inicial MFA
VerifyIdentityPage solo renderiza el URI otpauth recibido de enrollMfa; no genera QR. Además, el superadmin local fue enrolado por QA antes de la entrega: ya tiene factor verificado y el servidor correctamente rechaza otro enrolamiento. No resetear ni desactivar ese factor. Resolver la interfaz para altas nuevas y ofrecer al usuario recuperación local privada del factor autorizado existente, sin exponer secretos al backend/frontend público ni Git.

## Slices
1. Investigación de requisitos, siete secciones y patrones: superadmin_spec_audit solo lectura; Senior revisa seguridad/contratos.
2. QR local en pantalla MFA existente: biblioteca específica revisada antes de instalar, sin servicios externos ni nuevos endpoints. Pruebas QR/errores/cancelación y backend real con cuenta nueva de prueba autorizada; conservar cuenta actual y MFA.
3. Resolver brechas funcionales de Superadmin por secciones, con un solo writer por slice. DTOs/rutas existentes. Revisar cada cambio inmediatamente por reviewer independiente y seguridad cuando aplique.
4. QA real de siete secciones, con datos sintéticos y sin reset. Nunca fijar fecha final inmutable ni ejecutar eliminación sobre datos del usuario para probar: usar base aislada si necesario o registrar esa prueba real pendiente. Mock y real se reportan por separado.
5. Informe docs/Superadmin-Entrega.md: requisito, existente, problemas, archivo/cambio, prueba realizada y pendiente por sección; patrones con archivos/evidencia; límites precisos.

## Seguridad y aceptación
- Cookies Secure/HttpOnly, CSRF, rol/AAL2, step-up, RLS y grants continúan activos.
- QR otpauth se genera localmente, solo en inscripción pendiente, sin red externa ni almacenamiento persistente. No mostrar QR de factor existente mediante una nueva ruta API.
- Secretos privados no salen en chat/logs/capturas. Cuenta QA nueva no reemplaza MFA de usuario. No convertir prueba mock en evidencia real.
- Persistencia/actualización de listas, reintentos idempotentes, permisos/carga/conflicto/validación y responsive/teclado.
- Simplificar solo cuando reduzca conceptos; sin patrones/capas artificiales ni rediseño.

## Bitácora
- Preflight: cambios anteriores preservados, Supabase esencial saludable y readiness5174 HTTP200. Sin migraciones ni reset.
- Aplicadas skills locales dominio, contratos, frontend, seguridad/privacidad, implementación incremental, pruebas y revisión de calidad.

## Progreso validado
- Diagnóstico MFA confirmado: URI sin QR + factor de usuario previamente enrolado por QA. Recuperado QR del MISMO factor en SVG privado ignorado; no se desactivó/resetió. Dependencia qrcode.react4.2.0 aprobada por revisión arquitectónica, +1paquete, npm audit0; Reactstack sin cambios.
- MFAQR frontend/securityreview PASS tras corregir inscripción tardía que reponía reto global. QA primera inscripción real1/1PASS6,7s con cuenta nueva dedicada: QR+manual, TOTP, AAL2, sin terceros/storage ylogout401. Usuariooriginal intacto.
- Edición de sedes/revocación implementadas en componentes existentes. Reviewer front/seguridad PASS19pruebas tras reparar restauración de foco después de render y fallbackal desaparecerbotón.
- Solicitudes: acceso contextual+ejecucióncorrección en páginaexistente. Revisión front/seguridad PASS12pruebas tras limpiarPII ante401/403de decisión y bloquearrespuestastardías. EliminacióncontinúabloqueadaporAccountEraser ausente; no se amplíaADR006.
- Tareas: enlaces aSedes; clases no ofrecidas nofabrican0; reconocimientossinruta falsa. Configuración requiereconfirmación yfechascambiadaslainvalidan. Fechausaformateadorcanónico. Reviewer front/seguridad PASS3mocks.
- Migración20261022000000 soloREPLACE RPCcola existente INVOKER/RLS: sedes+solicitudespendientes/aprobadas, sin tablas/rutas/grantsnuevos. Reviewbackend/seguridadPASS, aplicadaLOCALconmigrationup sinreset. RED omitíasolicitudes; GREEN7/7PGtransacciónrollback (claimsSQLsintéticos, noJWTHTTP).
- ConfiguraciónPG5/5 transacciónrollback: stepup,inmutabilidad,segundafechaconflictiva yprivilegiosauditoría. ReviewbackendPASS. FechaREALcomprobadasigueNULL; no se desactivarontriggers.
- Corte196/196frontend, lint/typecheck/buildPASS. Nuevaspruebasnavegador7seccionesyoperacionespendientesdegate/ejecución; no se confunden con mocks.
- No commits/pushes, no modificación de módulosHospital/Donante/Invitación. Fixtures nuevos únicamente sintéticos paraQAautorizado; conservar datos de trabajo.

## Resultado real final del corte
- QRinicial1/1realPASS concuentadedicada. Nuevoarchivo frontend/e2e/superadmin-operations-live.e2e.ts revisadoindependientemente por slices; se ejecutaron3casos realesadicionales3/3PASS55,5s:7vistas×5anchos, sedeeditar/estados/recarga+invitación202, revocaciónpersistente+misma sesión403+CSRF/rolnegativos.
- Solicitudes final1/1realPASS6,7s: metadatos, grantreviewname, decisión, rechazoexecuteconreviewgrant, grantsexecute yconfirmación, correccióncompletada recarga, limpiezaPII. PostgreSQLjoinrequest/profileconfirmóvalorescoincidentes sin imprimirPII. Primerensayo falló por expectativa400/403deheaderausente, corregido segúncontrato yrevisado; no bugproductivo ocultado.
- Repetirfixturesrevocados/resueltos seomite explícitamente; noreset ni falsa reacreditación. Controles ydatosdeotrascuentas intactos.
- Informe docs/Superadmin-Entrega.md incluye6campos×7secciones, patrones/evidenciaprecisa ypendientes. Revisión documental independientePASS.
- Pendientesimpiden afirmar módulo100%: AccountEraser nooperativo (ADR006), reconocimientoscontratosborrador/backendausente, correoexterno/worker, E2EHTTPfechafinalenbaseaislada, matrixRLSnegativacompleta yoperaciónretención/backups. No se simularon ni se extendióalcance de otros integrantes.
- No commits/pushes. Listo para revisión humana y entrega con límites explícitos.

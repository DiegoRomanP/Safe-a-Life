# Entrega de Superadmin — Save a Life

Corte: 22 de octubre de 2026. Alcance exclusivo: Superadmin y su acceso administrativo. No hay commits ni pushes. Este informe distingue implementación, pruebas aisladas y comprobaciones reales; no declara completo el sistema ni el trabajo de otros integrantes.

## Acceso MFA: causa y solución

La pantalla existente mostraba una URI `otpauth`, pero no un QR. Además, el ensayo anterior había enrolado el factor del superadmin local antes de que su usuario lo escaneara. El servidor rechazaba correctamente una segunda inscripción de un factor ya verificado.

Se conservó el factor existente. Su QR se recuperó exclusivamente en `backend/.local/superadmin-autenticador.svg`, ignorado por Git y privado de esta laptop. No se añadió una API para recuperar secretos existentes. La contraseña y la alternativa manual continúan en los archivos privados de configuración; no se incluyen en esta entrega.

`frontend/src/features/auth/pages/VerifyIdentityPage.tsx` ahora representa el QR de una inscripción pendiente mediante `qrcode.react@4.2.0`, fijado en el manifiesto y lockfile. Generación local, sin servicios externos; alternativa manual accesible dentro de un desplegable. `frontend/src/api/auth.ts` valida TOTP y limpia el reto temporal. Se corrigió una carrera en la que una respuesta tardía reponía el reto después de cancelar.

**Prueba real:** primera inscripción con otra cuenta sintética autorizada, QR visible y clave manual coherente, TOTP validado por Supabase, sesión superadmin AAL2 y cierre de sesión 401: PASS. La cuenta y MFA del usuario original permanecieron intactos.

## 1. Tareas

- **Requisito esperado:** SA-01 y recorridos SA-OBJ-01/03/07: identificar acciones pendientes y dirigir al recorrido correspondiente sin navegar el padrón.
- **Funcionalidad existente:** `TasksPage.tsx` consume `GET /api/v1/superadmin/task-queue`; controles de sesión y AAL2 en servidor.
- **Problemas encontrados:** la RPC solo emitía sedes sin aprobar; solicitudes pendientes se omitían. El enlace de revisión institucional iba a Hospitales. Se mostraban ceros de clases que el backend no proporcionaba, y reconocimientos enlazaba a Configuración sin gestionar políticas.
- **Archivo y cambio:** `frontend/src/features/superadmin/pages/TasksPage.tsx`: destino Sedes, indicadores solo de clases devueltas y ausencia de ruta falsa de moderación. `backend/supabase/migrations/20261022000000_superadmin_task_queue.sql`: amplía la RPC existente con solicitudes pendientes y aprobadas por ejecutar; conserva INVOKER/RLS y el DTO, sin rutas, tablas o privilegios nuevos.
- **Pruebas realizadas:** tres pruebas UI aisladas compartidas con Configuración; PostgreSQL real 7/7 en transacción revertida, con claims SQL sintéticos: incluye pendiente/aprobada, excluye completada, proyección mínima y denegación AAL1/otro rol. No equivale a validar un JWT real con esas pruebas SQL.
- **Pendientes de integración:** la cola aún no incorpora fallos de entrega ni moderación de reconocimientos. No se declara que la ausencia de esas clases signifique cero casos.

## 2. Hospitales

- **Requisito esperado:** RF-ORG-01, SA-OBJ-01: solo superadmin crea/modifica hospitales; autorización explícita, MFA, auditoría y validación en servidor/RLS.
- **Funcionalidad existente:** listado paginado, alta con nombre público y razón social; edición y autorización mediante GET/POST/PATCH existentes. Alta inicia sin autorización; PATCH requiere step-up.
- **Problemas encontrados:** no faltaba una página ni un contrato de eliminación. El refresco vuelve a la primera página y puede dejar registros nuevos fuera de los primeros veinte; se mantiene paginación y su alcance visible. No se añadió borrado no contratado.
- **Archivo y cambio:** `pages/HospitalsPage.tsx` y `components/InstitutionForm.tsx` se reutilizan; formularios compartidos tocados se hicieron más legibles. El cierre y foco preservan el recorrido existente.
- **Pruebas realizadas:** ensayo real anterior creó, recargó, comprobó el mismo UUID y autorizó un hospital; pruebas de mutación aisladas comprueban respuesta inválida, conflictos, borradores, duplicados y clave idempotente.
- **Pendientes de integración:** comprobar despliegue y paginación con volumen representativo. Las listas solo permiten `limit/cursor`; no se inventaron filtros de servidor.

## 3. Sedes

- **Requisito esperado:** RF-ORG-01: crear/modificar datos de sedes, aprobar y controlar su actividad; un administrador solo opera sedes de su hospital.
- **Funcionalidad existente:** selección de hospital, lista, alta con coordenadas y PATCH de aprobación/actividad.
- **Problemas encontrados:** faltaba edición de nombre, dirección, coordenadas e instrucciones, pese a existir el PATCH. Cerrar formularios intentaba enfocar un botón todavía deshabilitado.
- **Archivo y cambio:** `pages/SitesPage.tsx`, `components/InstitutionForm.tsx`: edición precargada, instrucciones públicas, coordenadas de hasta seis decimales y estados independientes. Foco restaurado después del render, con alternativa cuando la fila cambia. `httpGateway.ts` conserva validación de DTOs.
- **Pruebas realizadas:** pruebas aisladas de payload, precisión, estados y foco, incluidas en 19/19 de Sedes/Membresías; ensayo previo real de creación y recarga. Edición real, estados independientes y persistencia tras recargar: PASS; alcance detallado al final.
- **Pendientes de integración:** ninguna ruta nueva; permisos y autorización final siguen en servidor. No se introdujeron ubicaciones personales de donantes.

## 4. Administradores

- **Requisito esperado:** RF-IAM-05, SA-OBJ-02, RNF-SEC-05/07: invitar, asignar exactamente un hospital autorizado, revocar membresías con motivo y step-up; la revocación debe afectar la siguiente operación de la misma sesión.
- **Funcionalidad existente:** listado y POST de invitación con respuesta neutra 202. No crea registros ficticios en la UI.
- **Problemas encontrados:** faltaba revocar usando el PATCH existente. Un botón retirado por la revocación no podía recibir foco al cerrar.
- **Archivo y cambio:** `pages/AdministratorsPage.tsx`: confirmación y motivo, PATCH `{status:'revocada',reason}`, refresco tras respuesta validada y foco alternativo. `httpGateway.ts`: valida la membresía devuelta. No se añadió reasignación directa ni selección arbitraria de rol.
- **Pruebas realizadas:** pruebas aisladas de conflicto/permiso, conservación de motivo y clave, doble envío, refresco y foco; 19/19 junto con Sedes. Prueba real PASS con administrador sintético dedicado: revocación persistida y siguiente operación con la misma sesión denegada; controles negativos detallados al final.
- **Pendientes de integración:** `EMAIL_PROVIDER=fake` en local; una aceptación 202 no acredita entrega de correo, aceptación de invitación ni cuenta activada. Worker/proveedor y recorrido de Invitación permanecen bajo su responsabilidad correspondiente.

## 5. Solicitudes

- **Requisito esperado:** RF-PRO-03/04, SA-OBJ-03/04, RNF-SEC-06: revisar datos mínimos de una solicitud, decidir y ejecutar aprobadas mediante accesos contextuales temporales, delimitados por actor, solicitud, acción y campos.
- **Funcionalidad existente:** listado paginado, detalle minimizado y decisión administrativa con motivo.
- **Problemas encontrados:** decidir era la única operación conectada; faltaban grants, lectura contextual y ejecución. Una decisión rechazada por 401/403 podía dejar visibles valores personales ya consultados.
- **Archivo y cambio:** `pages/RequestDetailPage.tsx` se amplía, sin crear otra página. `privacyGateway.ts` valida/proyecta las respuestas de POST `/access-grants`, GET `.../donor-data` y POST `.../executions`. Grants distintos para revisar/ejecutar, campos autorizados, máximo diez minutos, cabecera `X-Contextual-Grant`, confirmación explícita de ejecución. Datos solo en memoria, limpieza por expiración, salida, cambio de solicitud, estado terminal o pérdida de autorización; respuestas tardías se descartan. No hay búsqueda general de donantes.
- **Pruebas realizadas:** 12/12 aisladas, con revisión independiente: scopes inválidos, expiración, payload de ejecución, ausencia de datos fuera de campos y limpieza inmediata/tardía ante 401/403. Corrección sintética de nombre ejecutada contra el backend y contrastada con PostgreSQL: PASS; alcance detallado al final.
- **Pendientes de integración:** **eliminación efectiva bloqueada:** `backend/src/composition.ts` no inyecta `AccountEraser` y el servicio devuelve 503 antes de mutar. No se amplió la allowlist administrativa del ADR-006. Cambio de email depende de outbox y verificación del buzón nuevo; `en_ejecucion` no es completada. No se simularon esos procesos ni se modificó el módulo Donante.

## 6. Configuración

- **Requisito esperado:** SA-OBJ-05, RNF-PRV-02/04: fijar `finalDemoAt` una vez, con step-up y auditoría, sin introducir reglas clínicas.
- **Funcionalidad existente:** GET/PATCH, interpretación Lima UTC−5, inmutabilidad y refresco. Matriz académica de solo lectura.
- **Problemas encontrados:** faltaba confirmación explícita de una decisión irreversible; existía un formateador de fecha duplicado.
- **Archivo y cambio:** `pages/ConfigurationPage.tsx`: confirmación requerida y reiniciada al cambiar fecha. `features/superadmin/format.ts` reutiliza `frontend/src/lib/format.ts`.
- **Pruebas realizadas:** prueba UI aislada de confirmación; PostgreSQL real 5/5 en una transacción revertida: step-up, inmutabilidad, segundo intento conflictivo y ausencia de privilegios UPDATE/DELETE de auditoría. Después se comprobó que la fecha real sigue sin fijar. Estas pruebas usan claims SQL de prueba, no constituyen un E2E de escritura HTTP.
- **Pendientes de integración:** E2E de fijación mediante HTTP en base aislada y verificación operativa de purga, backups/restauración. No se fijó la fecha de trabajo para probar ni se añadió un botón de purga.

## 7. Auditoría

- **Requisito esperado:** SA-OBJ-06, RNF-AUD-01: consulta restringida append-only, identificadores opacos y ausencia de valores personales en eventos.
- **Funcionalidad existente:** listado paginado; filtros por evento, resultado y fecha aplicados a registros cargados, con alcance explícito. No existen editar/borrar.
- **Problemas encontrados:** la cobertura anterior solo acreditaba los eventos de hospital/sede; no las restantes operaciones administrativas ni todos los controles negativos.
- **Archivo y cambio:** se conserva `pages/AuditPage.tsx`; no se inventan filtros API. Nuevas pruebas ejercitan operaciones y permisos. Los motivos no deben incluir datos personales.
- **Pruebas realizadas:** ensayo real anterior confirmó `hospital.creado`, `hospital.actualizado`, `sede.creada`. PostgreSQL comprueba falta de privilegios UPDATE/DELETE; esta comprobación no prueba todos los triggers append-only. Lectura real comprobada en los cinco anchos, sin ampliar la afirmación sobre triggers o telemetría.
- **Pendientes de integración:** prueba negativa completa por todos los roles y todos los destinos de telemetría, además de auditoría de los módulos aún no integrados.

## Patrones existentes y justificación

| Patrón o técnica | Archivos | Problema que resuelve |
|---|---|---|
| Puertos y adaptadores / Repository | `backend/src/modules/identity-institutions/application/institutions.ports.ts`, `backend/src/modules/identity-institutions/infrastructure/institutions-rpc-gateway.ts` | El servicio depende de un contrato; PostgreSQL/Supabase queda en un adaptador y puede sustituirse en pruebas. |
| Servicio de aplicación | `backend/src/modules/identity-institutions/application/institutions-service.ts`, `backend/src/modules/privacy-requests/application/privacy-requests-service.ts` | Coordina casos de uso, validaciones, idempotencia e integraciones sin cargar los routers con persistencia. |
| Inyección por composición | `backend/src/composition.ts` | Conecta repositorios, servicios y transporte explícitamente; conserva el monolito modular y dependencias de mínimo privilegio. |
| Pipeline de middleware y guards | `backend/src/shared/auth/guards.ts`, routers de instituciones/privacidad | Aplica sesión, rol, AAL2, CSRF y step-up antes de la operación; los botones no autorizan. |
| Adaptador HTTP y DTOs proyectados | `frontend/src/api/client.ts`, `frontend/src/features/superadmin/httpGateway.ts`, `frontend/src/features/superadmin/privacyGateway.ts` | Centraliza transporte seguro y valida respuestas externas antes de confirmar cambios o mostrar datos. React no consulta tablas de Supabase. |
| Composición de UI y hooks | `frontend/src/features/superadmin/components/AdminStates.tsx`, páginas de Superadmin | Comparte estados de lectura, paginación, mutación y errores sin repetir una infraestructura por página. |
| Fábricas simples | funciones `createInstitutionsService`, `createInstitutionsRpcGateway` | Construyen dependencias de forma explícita. No se presentan como Factory Method GoF, que requeriría otra estructura. |

No se añadieron capas ni patrones para cumplir una rúbrica. La nueva biblioteca solo codifica un QR estándar; el nuevo gateway contextual agrupa validación y transporte de operaciones que manejan datos sensibles.

## Evidencia y límites del corte

- Frontend: **196/196 pruebas aisladas**, lint, tipos y build PASS.
- QR inicial: **1/1 ensayo real PASS** con cuenta nueva, sin alterar el factor del usuario.
- PostgreSQL: **7/7 cola + 5/5 configuración**, en transacciones revertidas y con claims SQL sintéticos. Sin reset ni truncados.
- `npm audit --omit=dev`: cero vulnerabilidades reportadas en el corte.
- Los cinco casos E2E reales pasaron en ejecuciones separadas; el siguiente apartado identifica su alcance y las operaciones pendientes.

## Resultado de las comprobaciones reales ampliadas

Las siguientes comprobaciones utilizaron el backend local, Supabase Auth y PostgreSQL reales. Se ejecutaron por recorridos separados, no como una única corrida limpia. Las cuentas y los registros usados son sintéticos.

| Recorrido | Resultado y alcance |
|---|---|
| Primera inscripción MFA | 1/1 PASS: QR y alternativa manual, TOTP real, sesión AAL2 y cierre de sesión. |
| Siete secciones en cinco anchos | PASS: 35 combinaciones de 320, 360, 768, 1024 y 1440 px, contenido real, sin alertas de error ni desbordamiento horizontal; comprobación básica de teclado y enlace al contenido. No constituye una auditoría completa de accesibilidad. |
| Sedes | PASS: edición de campos públicos, aprobación y actividad independientes, persistencia después de recargar. |
| Invitación de administrador | PASS de aceptación HTTP 202 neutra. No demuestra entrega de correo ni activación. |
| Revocación de membresía | PASS: revocación desde la UI, lista actualizada tras recargar y siguiente operación del administrador con la misma sesión rechazada con 403. |
| Controles negativos | PASS en los casos ejercitados: administrador hospitalario sin acceso a cola/configuración/auditoría (403), CSRF ausente o incorrecto (403), intento de introducir un rol en el payload (400). No equivale a una matriz exhaustiva de todos los permisos. |
| Solicitud de corrección de nombre | 1/1 PASS: grant limitado a nombre, cabecera ausente 400 y grant ajeno 403, aprobación, grant de revisión rechazado para ejecutar, grant separado de ejecución, confirmación y estado completado tras recargar. Consulta directa de PostgreSQL confirmó que el perfil coincide con el nombre propuesto, sin imprimir sus valores. |
| Configuración irreversible | 5/5 PASS en PostgreSQL con transacción revertida y claims sintéticos. La fecha de trabajo permanece sin fijar; falta la escritura HTTP en una base aislada. |

Los cinco casos E2E están en `frontend/e2e/superadmin-operations-live.e2e.ts`, habilitados explícitamente mediante `SAVE_A_LIFE_LIVE=1`. Requieren preparación privada de cuentas y fixtures locales; no son una suite que reconstruya el entorno por sí sola. Una membresía ya revocada o una solicitud ya resuelta se omite explícitamente: esa omisión no acredita de nuevo la transición. Para repetir esas operaciones hace falta un fixture nuevo. Las trazas, capturas y vídeos están desactivados para no guardar secretos MFA o datos contextuales.

No se declara Superadmin completo al 100%: siguen pendientes la eliminación efectiva mediante AccountEraser, moderación de reconocimientos sin contrato ratificado, correo/worker y las comprobaciones de despliegue y seguridad exhaustiva señaladas en cada sección.

## Preparación para los compañeros

Aplicar la migración nueva con las herramientas locales del proyecto, sin `db reset`; instalar desde el lockfile raíz. Backend local de esta laptop en 3001 y frontend en 5174, con proxy configurado mediante `SAL_BACKEND_PORT`. Mantener secretos, cuentas y factores fuera de Git. La documentación de preparación está en `docs/Supabase-Local.md`.

Antes de declarar el módulo completo: resolver eliminación efectiva y reconocimiento con los responsables del backend/contratos, verificar email/worker y despliegue, y completar los casos reales aún pendientes. Esta entrega no modifica los módulos de Hospital, Donante o Invitación.

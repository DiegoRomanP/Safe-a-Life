# Tareas de implementación

- [x] Sincronizar línea base, ERS, referencia normalizada y Excel con decisiones RF-PRO-05/AP-01/AP-03/AP-05/AP-09.
- [x] Completar borrador OpenAPI 3.1 de auth, donante, hospital y superadmin (54 rutas / 69 operaciones); lint, referencias y requisitos de CSRF verificados.
- [x] Bootstrap npm workspace, fijar Node/paquetes y documentar ADR-002.
- [x] Configurar Prism estático sobre el JSON OpenAPI canónico.
- [x] Implementar slice stateful loopback con dos hospitales sintéticos, sesiones server-side con expiración, reset con Origin/capacidad efímera, perfil/invitaciones/historial/solicitudes donante, expiración AP-09, necesidades/respuestas y lote manual sin matching/email, y lecturas superadmin minimizadas.
- [x] Importar el OpenAPI a Bruno, retirar el API-key incorrecto y añadir escenarios/assertions para los tres roles.
- [x] Automatizar el ciclo de arranque, reset y cierre del mock + `bru run`; comprobar replay idempotente y AP-03 entre escenarios donante/hospital.
- [x] Implementar UI pública/auth, navegación por rol y pantallas de invitaciones/perfil/historial/solicitudes donante, necesidades/respuestas/lotes hospitalarios y tareas/hospitales/auditoría/configuración superadmin.
- [x] Implementar actualización de disponibilidad/respuesta propia y creación de necesidad en borrador; contemplar carga, vacío, error, conflicto, restricción de permisos y estados.
- [x] Implementar historial de respuestas y creación/seguimiento de solicitudes propias del donante, sin conservar valores propuestos.
- [ ] Completar flujos pendientes de producto: información pública/políticas del donante; altas asistidas y política hospitalaria; sedes, membresías, solicitudes contextuales/grants y moderación superadmin.
- [x] Validar suites finales tras lotes y handoff: API 50/50, web 15/15, contract runner 27/27 + 369 checks HTTP, Bruno 22/22, E2E 10 escenarios × 3 repeticiones en QA y 10/10 en auditoría de seguridad, responsive/teclado, typecheck, lint, build, OpenAPI y audit de producción runtime limpio.
- [x] Sincronizar README, reglas API, diseño visual y límites del mock.

## Límites del corte actual

- La lista OpenAPI de 69 operaciones sigue siendo borrador; Prism ofrece el contrato completo, mientras que el mock stateful solo implementa los recorridos enumerados arriba.
- El mock no conecta PostgreSQL/Supabase/RLS, Resend, matching ni servicios externos. La cookie, CSRF, sesión AAL2 administrativa, coordenadas de muestra y reset solo sirven para UX/pruebas locales.
- AP-02, AP-04, AP-06, AP-07 y AP-08 continúan abiertos; no se deben representar como comportamiento productivo.

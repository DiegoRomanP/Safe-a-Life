# Integración persistente de superadmin — 2026-10-22

Estado: en progreso. No sustituye los cambios anteriores ni sus planes.

## Objetivo autorizado
Conectar el área superadmin existente al backend Express/Supabase para leer y guardar registros, sin fixtures ni resultados simulados en el recorrido de usuario. Mantener diseño, responsive y límites académicos con datos sintéticos. No cambiar áreas hospital/donante de compañeros salvo entrada de autenticación compartida.

## Contratos y seguridad
Reutilizar docs/openapi.json y ADR-004; cookies HttpOnly Secure, CSRF, rol/AAL2 y step-up en servidor. Nunca service_role en frontend ni persistencia de credenciales/tokens en storage. Formularios recogerán campos exigidos por contrato; sin inventar identidad/validación médica. No aplicar migraciones remotas ni borrar/resetear bases existentes. Secretos en backend/.env ignorado, nunca en chat/logs.

## Slices / responsables
1. Senior: preflight de herramientas/servicios y guía reproducible Supabase. No hay backend/.env; Docker instalado pero daemon no disponible; CLI Supabase/psql no está en PATH actual. Pregunta pendiente local vs proyecto compartido.
2. integration_contract (arquitecto, solo lectura): mapear contratos backend actuales antes de implementar.
3. auth_connection (writer frontend): cliente HTTP same-origin, sesión real, login/MFA/step-up/guard superadmin/logout y pruebas focalizadas. Rutas auth y frontend/src/api; no editar módulo superadmin salvo integración final acordada por Senior.
4. Senior (writer superadmin): adaptador HTTP, traducir DTOs, formularios reales, quitar simulaciones del recorrido, lecturas paginadas y solicitudes protegidas según contrato. Fixtures solo pruebas. Guardar éxito solo después de respuesta servidor; errores de lectura posterior no afirmar fallo de escritura.
5. Reviewer front y auditor seguridad independientes inmediatamente tras slices; QA flujos críticos. Si herramientas/revisor no disponibles, registrar gate pendiente, no inventar PASS.

## Aceptación
- Hospital/sede/invitación/configuración leen/escriben backend; ninguna simulación de éxito o localStorage.
- Autenticación real por cookie, MFA y guard; rechazos 401/403/409/429 y red visibles, borradores conservados.
- Idempotency-Key estable en reintento de misma intención, diferente si cambia payload.
- No cargar padrón de donantes. Decisiones/accesos solo contra endpoints protegidos, ejecución irreversible no automática.
- Pruebas unitarias de cliente/gateway/autenticación, lint/typecheck/build. Prueba persistencia UI-recarga contra Supabase solo cuando entorno disponible; distinguir pruebas con interceptación de E2E real.
- Documentar configuración pendiente y resultado real, sin decir que BD está lista si no se ha comprobado.

## Bitácora
- Se conserva diff previo (superadmin y planes) sin commits/reset/merge.
- Se aplican skills de seguridad/privacidad, contratos, frontend, implementación incremental y pruebas de .opencode/skills.

### Resultados intermedios 22/10
- Contratos existentes investigados por integration_contract; sin contratos nuevos ni acceso Supabase desde React.
- auth_connection implementó cliente/sesión/MFA/guard/logout. review_auth BLOCKED inicialmente logout vencido; corregido y PASS independiente. Recuperación MFA de resultados inciertos revisada: PASS, 44/44 pruebas independientes.
- persistent_superadmin sustituyó snapshot/fixtures por consultas por recurso y formularios reales. review_persistent_superadmin BLOCKED inicialmente respuesta2xx inválida; corregido validando DTO antes de éxito/limpieza, PASS independiente, 12/12 pruebas.
- local_setup creó preparador sin reset y guía; review_setup backend/seguridad PASS con5/5 pruebas, antes de ejecutar bootstrap.
- Suite frontend intermedia152/152, lint y build PASS. Hubo cambios posteriores en recuperaciónMFA, cubiertos por pruebas focalizadas; se verificará corte final.
- Docker fallaba socket sailor-ingest1920 al iniciarse desde contexto app. Usuario lo cerró y abrió desde menúInicio; dockerinfo29.8.0. No se renombró/borró ningún objetoDocker ni se hizo reset.
- SupabaseCLI oficial2.120.0 descargado y SHA256 verificado en carpeta de herramientasusuario; no dependenciasnuevas. Primer start descargó componentes; se canceló SOLO ese proceso de preparación para volver a iniciar con serviciosesenciales y conservar imágenes/volúmenes. Pendiente stackdisponible+bootstrap+pruebaDBreal.

### Arranque y verificación real
- Supabase local completó migraciones y siembra base, sin reset. DB/Auth/Kong/PostgREST operativos; se excluyeron servicios no necesarios.
- Preparador ejecutado: creó3identidades sintéticas y archivos privados ignorados, sin sobrescribir cuentas/roles. No se imprimieron claves/contraseñas.
- Puerto3000 ocupado por Java ajeno; no se cerró. Backend usa3001, proxyconfigurable con SAL_BACKEND_PORT privado, destino fixedloopback. Review_auth front/seguridad PASS, no dependencia nueva.
- Backend iniciado puerto3001; readiness por frontend5174 HTTP200.
- Corte frontend158/158 +build PASS; se vuelve a verificar lint/build solo por ajusteconfig.
- QA browser interceptado8/8 PASS; testlive revisado independiente (paginación, MFAprivado, sinreset/trazas), ejecución real en curso.

## Resultado al entregar
Implementación y verificaciones realizadas; pendiente revisión humana del módulo, sin commit/merge.
- Corte final158/158frontend, lint/typecheck/build PASS. Setup5/5, revisiones independientes front/backend/seguridad PASS registradas arriba.
- Mockbrowser8/8 PASS; live final1/1 PASS18,4s: loginMFA, hospitalpersistente recarga mismoUUID, autorización, sedepersistente mismoUUID, auditoría, logout401guard.
- Testlive previo falló por clienteAPIcookiesSecure y selectores; corregidos y revisiónindependientePASS. Un intento adicional no completó recarga, repetición finalPASS; no se presenta toda la serie como sin fallos. Sin reset ni limpiezas destructivas. Se quitó el diagnóstico temporal de etapa/título, restaurando el test revisado.
- Arquitectura/contratos/stack conservados. No conectado donante/hospital; no ejecución irreversible de privacidad ni correo externo.
- Privados ignorados: backend/.env, frontend/.env.local, backend/.local/local-accounts.json y acceso-superadmin.txt, factorQA. No claves enchat/Git.
- Servicios dejados funcionando: Supabase esencial, backend3001 y frontend5174. Java3000 intacto.

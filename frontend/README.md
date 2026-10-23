# Frontend de Save a Life

Workspace real del prototipo: React 18, TypeScript, Vite y Tailwind 4. Se trabaja desde la raíz del repositorio; `apps/web` sigue siendo la demostración antigua contra un mock.

## Ejecución con persistencia

La preparación de Supabase local se describe en [Supabase-Local](../docs/Supabase-Local.md). Requiere Docker operativo, Supabase CLI y las migraciones locales del proyecto. El backend guarda en PostgreSQL; React no consulta directamente Supabase ni recibe claves administrativas.

```bash
npm run dev:backend
npm run dev:frontend
```

Abrir http://127.0.0.1:5174/ingresar. Vite redirige `/api` y `/health` al backend en 127.0.0.1:3000. `backend/.env` debe incluir ese origen en `ALLOWED_ORIGINS` y `APP_PUBLIC_URL`.

## Superadmin

El recorrido `/superadmin/*` usa los endpoints existentes de instituciones, solicitudes, tareas, configuración y auditoría. El acceso exige sesión real, rol superadmin y segundo factor. Las acciones críticas requieren autenticación reforzada reciente. Un hospital nuevo debe autorizarse explícitamente antes de operar como autorizado.

Los datos se confirman únicamente después de una respuesta del servidor. Los fallos conservan el borrador; ante una conexión interrumpida el resultado puede ser desconocido y se reutiliza la clave de la misma intención al reintentar. No hay registros de demostración ni escenarios de éxito simulados en las vistas de superadmin. Los listados respetan la paginación del contrato; los filtros locales afectan los registros cargados.

La decisión sobre una solicitud guarda aprobación o rechazo con motivo; no ejecuta por sí misma la corrección o eliminación ni revela datos personales del donante. Los accesos contextuales y ejecuciones son operaciones protegidas distintas. No afirmar que un usuario quedó eliminado al aprobar su solicitud.

En local, `EMAIL_PROVIDER=fake` guarda los cambios de dominio pero no entrega correos externos. Una invitación aceptada por el servidor no prueba que el destinatario haya recibido un mensaje. La operación del worker/proveedor se configura aparte.

## Autenticación y límites

El navegador envía credenciales al backend; recibe cookies Secure y HttpOnly, nunca access/refresh tokens en JSON. El cliente obtiene CSRF para mutaciones autenticadas. La sesión, los códigos MFA, los grants y los datos personales no se guardan en localStorage/sessionStorage. El rol lo valida el servidor y RLS; ocultar controles no autoriza una operación.

Si se recarga durante el segundo factor y ya no existe el reto en memoria, se debe volver a ingresar. Las cuentas nuevas pueden configurar TOTP desde la pantalla de verificación. El prototipo admite exclusivamente datos sintéticos y no determina elegibilidad médica.

Esta integración corresponde a autenticación compartida y superadmin. Las vistas locales de donante y las tareas de hospital mantienen su alcance de desarrollo separado; no se declara conectado todo el frontend.

## Verificación

```bash
npm run test --workspace @save-a-life/frontend
npm run lint --workspace @save-a-life/frontend
npm run typecheck --workspace @save-a-life/frontend
npm run build --workspace @save-a-life/frontend
```

Las pruebas con respuestas HTTP interceptadas verifican comportamiento del cliente, no demuestran persistencia real. Para comprobarla: ingresar con MFA, crear un hospital sintético, recargar y verificar que el backend devuelve el mismo identificador y datos. No ejecutar runners que resetean la base para comprobar un cambio de UI en una base con trabajo existente.

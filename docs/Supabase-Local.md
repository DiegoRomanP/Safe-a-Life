# Supabase local para el frontend

Esta guía conecta `frontend/` con el backend Express y PostgreSQL/Supabase de la laptop. Solo usa datos sintéticos. El navegador llama a `/api/v1/`; las claves de Supabase permanecen en el backend. No necesita un proyecto de Supabase en la nube.

## Requisitos

- Node 24.19.0 y npm 12.0.2, las versiones del proyecto.
- Dependencias instaladas desde la raíz con `npm ci`.
- Docker Desktop con el motor Linux funcionando. `docker info` debe responder.
- Supabase CLI disponible como `supabase`, o una ruta explícita en `SUPABASE_CLI`.

En esta laptop se descargó y verificó Supabase CLI 2.120.0 en:
`C:\Users\Ator\.local\share\save-a-life-tools\supabase.exe`.
Esto no significa que Docker o la base ya estén funcionando.

Referencias oficiales: [desarrollo local de Supabase](https://supabase.com/docs/guides/local-development) e [instalación de Docker Desktop para Windows](https://docs.docker.com/desktop/setup/install/windows-install/).

## 1. Iniciar la base local

Desde la raíz `Safe-a-Life-login`, en PowerShell:

```powershell
$env:SUPABASE_CLI = 'C:\Users\Ator\.local\share\save-a-life-tools\supabase.exe'
& $env:SUPABASE_CLI start --workdir backend --exclude realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
```

El proyecto existente está en `backend/supabase/`: incluye configuración, migraciones, RLS y una siembra institucional sintética. El primer arranque puede descargar imágenes grandes. El comando anterior usa solo PostgreSQL, Auth, PostgREST y el gateway necesarios para la aplicación; no inicia Studio, Storage ni servicios adicionales. Usa el identificador `save-a-life-backend`, la API local en 54321 y PostgreSQL en 54322.

No ejecutar `supabase db reset` para abrir la aplicación: borra la base local y elimina datos ingresados. Tampoco usar los runners de integración del backend contra una base con datos que quieras conservar; esos runners hacen reset para sus pruebas.

Si Docker muestra un error o permanece iniciando, hay que resolver ese mensaje antes de continuar. El preparador no instala componentes de Windows, reinicia WSL ni modifica la configuración global de Docker.

## 2. Preparar credenciales locales una vez

Con Supabase ya levantado:

```powershell
node scripts/setup-local-backend.mjs
```

El preparador valida el destino local y el contenedor del proyecto. No aplica migraciones, no resetea la base y no carga fixtures de frontend. Usa `psql` dentro del contenedor, por lo que no necesitas instalar PostgreSQL en Windows.

Crea únicamente tres cuentas sintéticas: un superadmin, una identidad técnica de API y una identidad de worker. Las contraseñas se generan al azar y se guardan antes de crear cuentas para poder recuperar una preparación interrumpida. No modifica contraseñas ni factores MFA de cuentas existentes; si no coinciden con las credenciales privadas guardadas, se detiene. Tampoco cambia un rol preexistente distinto.

Se generan dos archivos ignorados por Git:

- `backend/.env`: configuración privada de la API, orígenes locales, claves locales y secretos separados por propósito.
- `backend/.local/local-accounts.json`: credenciales sintéticas para esta laptop. Abre este archivo en tu editor y usa la entrada cuyo `role` es `superadmin`.

No pegues esos archivos en chats, capturas o commits. En Windows conservan los permisos de la carpeta del usuario; no los copies a una carpeta pública. Si `backend/.env` ya existe, el preparador lo conserva y sale sin tocar cuentas. Revisa su configuración de forma privada antes de reutilizarlo; no borres una configuración existente para forzar el preparador.

La API queda con `EMAIL_PROVIDER=fake`: los registros sí usan PostgreSQL, pero no se envían correos externos. La invitación de administrador registra la solicitud; no hay que afirmar que recibió un correo. La configuración del worker se mantiene separada por mínimo privilegio; para ejecutarlo hay que preparar su entorno propio a partir de `backend/.env.example` y de su cuenta privada. Este preparador inicia únicamente la configuración de la API.

## 3. Abrir backend y frontend

En dos terminales, desde la raíz:

```powershell
npm run dev:backend
```

```powershell
npm run dev:frontend
```

Abre `http://127.0.0.1:5174/ingresar`. Ingresa con la cuenta privada del superadmin y configura el autenticador en el primer acceso. El segundo factor se verifica en el servidor; no existe un botón para omitirlo. Si ya tienes un factor configurado, usa su código vigente. Una recarga a mitad del primer reto puede requerir volver a ingresar.

Editar o autorizar hospitales, invitar administradores o fijar la fecha final requiere autenticación reforzada reciente. El acceso al panel se valida por sesión, rol y AAL2. La sesión usa cookies Secure/HttpOnly, no `localStorage`.

## 4. Comprobar que guarda

1. Crea un hospital con nombre público y razón social sintéticos.
2. Comprueba la confirmación del servidor y recarga la página.
3. Verifica que el hospital sigue en el listado. Un hospital nuevo empieza sin autorizar; autorízalo explícitamente cuando corresponda.
4. Crea una sede para ese hospital, con dirección y coordenadas sintéticas válidas.
5. Recarga de nuevo y comprueba la sede y los eventos de auditoría.

Un error de red no prueba que una escritura no ocurrió: conserva el formulario y su clave de reintento. Si una operación ya fue aceptada pero falla el refresco del listado, vuelve a cargar los datos antes de crear otra operación.

No fijes la fecha final solo para probar: la decisión es inmutable y afecta la retención. Aprobar una solicitud no significa ejecutar una corrección o eliminación. La eliminación real depende de un adaptador que aún no está disponible por defecto en el backend.

La preparación automatizada y estas comprobaciones contra una base real quedan pendientes hasta que Docker/Supabase estén operativos. Las pruebas aisladas del cliente no sustituyen esa comprobación.

## Recuperación de Docker observada en esta laptop

El 22/10/2026 Docker no podía renombrar `sailor-ingest.sock` al iniciarse desde el contexto de la aplicación de desarrollo. Cerrar Docker y abrirlo desde el menú Inicio de Windows recuperó el motor; `docker info` respondió 29.8.0. No se borraron sockets, contenedores, imágenes, volúmenes ni registros WSL. Es consistente con el [reporte del mismo error de arranque](https://github.com/openai/codex/issues/52698); no es evidencia de daño en PostgreSQL.
## Puerto del backend en esta laptop

El puerto 3000 está ocupado por un proceso Java ajeno al proyecto. Se conservó y Save a Life usa `PORT=3001` en `backend/.env`. El archivo privado `frontend/.env.local` contiene `SAL_BACKEND_PORT=3001`; Vite mantiene el destino fijo en 127.0.0.1 y permite cambiar únicamente el puerto. El valor predeterminado sigue siendo 3000 para otras instalaciones. Esta variable no lleva prefijo VITE y no expone secretos al navegador. Si cambias el puerto, deben coincidir ambos archivos y reiniciarse los servidores.

## Resultado final de ejecución

El 22/10/2026 se ejecutó la prueba real del navegador contra Supabase local: PASS (18,4s). Se verificaron login/MFA AAL2, creación de hospital, recarga y mismo UUID, autorización, creación de sede, recarga y mismo UUID, auditoría de las tres operaciones, logout401 y guard. Se conservaron los registros sintéticos de las pruebas, incluidos hospitales de intentos anteriores. No se fijó fecha final, no se borraron datos ni se enviaron correos externos.

Las instrucciones privadas para ingresar e importar el autenticador están en `backend/.local/acceso-superadmin.txt`, ignorado por Git. El correo local configurado es `superadmin.local@example.test`; su contraseña se generó al azar. El factor TOTP se enroló durante QA y puede importarse manualmente con la clave del archivo privado. No se debe ejecutar de nuevo un enrolamiento para reemplazar ese factor.

Hubo fallos previos del ensayo por cookies del cliente API de pruebas y selectores exactos de controles, y un intento posterior no completó la recarga. El ensayo completo final pasó. Esto valida el recorrido ejercitado, no todos los flujos del sistema; el correo externo y las ejecuciones de privacidad siguen fuera de esa comprobación.

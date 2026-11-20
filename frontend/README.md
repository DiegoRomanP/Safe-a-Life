# Frontend de Save a Life

Frontend real del prototipo: TypeScript, React 18, Vite y Tailwind 4
([ADR-001](../docs/decisions/ADR-001-stack-del-prototipo.md)). Es un workspace
del monorepo npm; se instala y se prueba desde la raíz. `apps/web` sigue siendo la
web de demostración contra el mock.

## Qué cubre

Todas las vistas hablan con el backend real (`/api/v1`, cookies same-origin y CSRF):

- **Acceso:** registro de donante, verificación de correo, creación y recuperación de
  contraseña, activación de altas asistidas, invitación de administradores, login con
  MFA (TOTP) y step-up. Un 401 del login muestra un mensaje neutro de credenciales
  (no revela si la cuenta existe) y un 429 pide esperar.
- **Donante:** perfil obligatorio, disponibilidad y ubicación, invitaciones, historial
  y solicitudes de corrección o eliminación.
- **Enlace del correo** (`/invitaciones#token`): vista previa sin efectos; la respuesta
  se registra solo al pulsar el botón. El token viaja en el fragmento y se retira de la
  barra de direcciones.
- **Hospital:** necesidades, lotes de invitación, respuestas (nombre y grupo declarado
  solo de quien confirmó) y altas asistidas.
- **Superadmin:** tareas (con reintento manual de entrega), hospitales, sedes,
  administradores, solicitudes, configuración y auditoría.

La sesión vive en cookies HttpOnly; en memoria solo se guardan los datos mínimos de
sesión y el token CSRF. Tras recargar, la sesión se restaura pidiéndola al backend.

## Comandos

Desde la raíz del repositorio:

```bash
npm run dev:frontend
npm run test --workspace @save-a-life/frontend
npm run typecheck --workspace @save-a-life/frontend
npm run build --workspace @save-a-life/frontend
npm run test:e2e:real   # recorrido real de los tres roles (ver README raíz)
```

El servidor de desarrollo usa `http://127.0.0.1:5174` y redirige `/api` y
`/health` al backend en `http://127.0.0.1:3000` (`npm run dev:backend`), para
que navegador y API compartan origen ([ADR-004](../docs/decisions/ADR-004-sesion-csrf-cors-topologia.md)).
Para mutaciones, `ALLOWED_ORIGINS` de `backend/.env` debe incluir
`http://127.0.0.1:5174`.

`vercel.json` fija las cabeceras de seguridad y el fallback de la SPA a
`index.html` (los enlaces de correo abren rutas profundas). El rewrite de `/api` hacia
el backend con la cabecera de borde queda para el despliegue (F9, ADR-004).

## Estructura

- `src/components/ui/`: kit propio (`Button`, `Input`, `Select`, `Field`, `Alert`,
  `Badge`, `Card`, `Switch`, `TableScroll`…). Antes de crear un control, reutilizar
  uno de aquí.
- `src/components/states/`: carga, vacío, error, conflicto, éxito y
  `ActionErrorNotice`; `QueryView` resuelve los estados de una lectura.
- `src/components/layout/`: shell autenticado (`AppLayout`: rail lateral en `lg`,
  pestañas desplazables en móvil) y layout público.
- `src/features/<área>/`: páginas, contexto y cliente HTTP de cada rol.

## Reglas

- Sin `localStorage` ni `sessionStorage` para sesión, tokens o datos personales.
- Tokens visuales en `src/styles.css`, tomados de
  [Frontend-Design](../docs/Frontend-Design.md); sin colores sueltos.
- Animaciones cortas y con propósito (transiciones de color, interruptor, carga);
  `prefers-reduced-motion` las anula globalmente en `styles.css`.
- Las regiones `aria-live` que suelen estar vacías llevan la utilidad `live-slot`
  (no ocupan espacio vacías y siguen en el árbol de accesibilidad).
- Tablas anchas dentro de `TableScroll` (región nombrada y enfocable con teclado).
- Probar a 375 px y a 1280 px; sin scroll horizontal de página.
- Dependencias nuevas solo con revisión (ADR-002).

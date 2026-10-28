# Frontend de Save a Life

Frontend real del prototipo: TypeScript, React 18, Vite y Tailwind 4
([ADR-001](../docs/decisions/ADR-001-stack-del-prototipo.md)). Es un workspace
del monorepo npm; se instala y se prueba desde la raíz.

`apps/web` sigue siendo la web de demostración contra el mock. El login de este
paquete conecta `POST /api/v1/auth/sessions` y `GET /api/v1/auth/csrf-token` con
cookies same-origin; solo confirma la sesión tras validar ambas respuestas y
mantiene los datos mínimos de sesión/CSRF en memoria. La operación y su estado
pendiente/terminal se comparten en el mismo runtime para impedir otro POST+CSRF al
remontar el componente; no sincroniza pestañas ni sobrevive a recargas. No navega al
completar el login. Ante un fallo, descarta el estado verificado local y avisa que
puede quedar una sesión activa en el servidor; esto no confirma logout ni borra
cookies HttpOnly.

T3 no restaura sesiones tras recargar ni aplica guards de rol/AAL, MFA, step-up
ni logout: esos flujos pertenecen a T4. Las demás vistas continúan siendo demos
sin conexión productiva; los enlaces de demo del login están marcados Solo DEV.

## Comandos

Desde la raíz del repositorio:

```bash
npm run dev:frontend
npm run test --workspace @save-a-life/frontend
npm run typecheck --workspace @save-a-life/frontend
npm run build --workspace @save-a-life/frontend
```

El servidor de desarrollo usa `http://127.0.0.1:5174` y redirige `/api` y
`/health` al backend en `http://127.0.0.1:3000` (`npm run dev:backend`), para
que navegador y API compartan origen ([ADR-004](../docs/decisions/ADR-004-sesion-csrf-cors-topologia.md)).
Para mutaciones, `ALLOWED_ORIGINS` de `backend/.env` debe incluir
`http://127.0.0.1:5174`.

## Reglas

- Sin `localStorage` ni `sessionStorage` para sesión, tokens o datos personales.
- Tokens visuales en `src/styles.css`, tomados de
  [Frontend-Design](../docs/Frontend-Design.md).
- Dependencias nuevas solo con revisión (ADR-002).

# Frontend de Save a Life

Frontend real del prototipo: TypeScript, React 18, Vite y Tailwind 4
([ADR-001](../docs/decisions/ADR-001-stack-del-prototipo.md)). Es un workspace
del monorepo npm; se instala y se prueba desde la raíz.

`apps/web` sigue siendo la web de demostración contra el mock. Este paquete
todavía no tiene vistas, cliente HTTP ni sesión.

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

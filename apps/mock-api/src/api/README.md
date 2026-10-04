# Tipos de contrato para el mock

`openapi.ts` se genera desde `docs/openapi.json` con `npm run openapi:types`.
Úsalo para tipar DTOs HTTP del mock; los modelos internos de estado siguen siendo
locales y no exponen entidades de persistencia.

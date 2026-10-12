import { defineConfig } from 'vitest/config';

// Pruebas contra Supabase local real. Se lanzan con `npm run test:backend:integration`.
// La extensión `.integration.ts` no coincide con el patrón por defecto de `vitest run`.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.integration.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});

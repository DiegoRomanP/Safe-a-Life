import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const react = ['apps/web/**/*.{ts,tsx}', 'frontend/src/**/*.{ts,tsx}'];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      'playwright-report/**',
      'test-results/**',
      'backend/.local/**',
      'backend/supabase/**',
      // Generados por scripts/generate-api-contract.mjs; no se editan a mano.
      'apps/mock-api/src/api/openapi.ts',
      'apps/web/src/api/openapi.ts',
      'backend/src/contract/openapi.ts',
      'backend/src/modules/need-records/dto/openapi.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // `_x` marca lo que se declara por firma o aridad (p. ej. el `next` del handler de errores de Express).
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Las pruebas y sus helpers leen JSON arbitrario de las respuestas.
    files: ['**/*.test.{ts,tsx}', 'backend/test/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: { globals: globals.node },
  },
  { files: react, languageOptions: { globals: globals.browser } },
  { ...reactHooks.configs.flat.recommended, files: react },
  { ...jsxA11y.flatConfigs.recommended, files: react },
  {
    // El texto de la etiqueta puede quedar a tres niveles: label > span > strong > {expresión}.
    files: react,
    rules: { 'jsx-a11y/label-has-associated-control': ['error', { depth: 3 }] },
  },
  {
    // apps/web es la demo contra el mock y la reemplaza frontend/: se miden pero no bloquean.
    // frontend/ queda con el preset completo.
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: { 'react-hooks/set-state-in-effect': 'warn', 'react-hooks/purity': 'warn' },
  },
);

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Operation = { operationId?: string; 'x-ratification'?: unknown; security?: unknown[]; responses?: Record<string, unknown> };
type Spec = { paths: Record<string, Record<string, Operation>> };

const spec = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../docs/openapi.json'), 'utf8')) as Spec;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const operations = Object.entries(spec.paths).flatMap(([path, item]) =>
  Object.entries(item)
    .filter(([method]) => METHODS.includes(method))
    .map(([method, operation]) => ({ path, method: method.toUpperCase(), operation })),
);

/** Operaciones ratificadas que el backend ya sirve. Cada módulo añade las suyas al implementarse. */
const NOT_IMPLEMENTED_YET = new Set<string>();

function implemented(predicate: (path: string) => boolean) {
  return operations.filter(({ path, operation }) =>
    operation['x-ratification'] !== undefined && predicate(path) && !NOT_IMPLEMENTED_YET.has(operation.operationId ?? ''));
}

function missing(statuses: readonly string[], list: ReturnType<typeof implemented>): string[] {
  return list.flatMap(({ method, path, operation }) =>
    statuses.filter((status) => !(status in (operation.responses ?? {}))).map((status) => `${method} ${path} → falta ${status}`));
}

/**
 * Estados que emiten los middlewares globales, independientes de la operación (ver app.ts y
 * composition.ts): 400 (query/JSON/shape), 401 (sesión), 403 (guard de borde, Origin, CSRF o permisos),
 * 429 (límite de renovación o de tasa), 500 y 503 (base o proveedor de Auth no disponible).
 * Esta prueba es estructural: no depende de qué rutas recorran las pruebas de integración.
 */
describe('estados globales declarados en docs/openapi.json', () => {
  // `security: []` = operación pública (login, tokens de acción, recuperación): no exige sesión, así que no emite 401 por falta de ella.
  const isPublic = ({ operation }: { operation: Operation }) => Array.isArray(operation.security) && operation.security.length === 0;

  it('toda operación ratificada de /api con sesión declara 400, 401, 403, 429, 500 y 503', () => {
    const list = implemented((path) => path.startsWith('/api/')).filter((entry) => !isPublic(entry));
    expect(list.length).toBeGreaterThan(15);
    expect(missing(['400', '401', '403', '429', '500', '503'], list)).toEqual([]);
  });

  it('toda operación pública de /api declara 400, 403, 429, 500 y 503', () => {
    const list = implemented((path) => path.startsWith('/api/')).filter(isPublic);
    expect(list.length).toBeGreaterThan(3);
    expect(missing(['400', '403', '429', '500', '503'], list)).toEqual([]);
  });

  it('las rutas de /health declaran 400 (query desconocida o JSON inválido) y 500', () => {
    const list = implemented((path) => path.startsWith('/health/'));
    expect(list).toHaveLength(2);
    expect(missing(['400', '500'], list)).toEqual([]);
  });

  it('el control detecta un estado ausente (la prueba no es vacía)', () => {
    const fake = [{ method: 'GET', path: '/api/x', operation: { responses: { '200': {}, '400': {} } } }];
    expect(missing(['400', '403'], fake)).toEqual(['GET /api/x → falta 403']);
  });
});

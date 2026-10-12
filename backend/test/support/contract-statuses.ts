import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { observed } from './client.js';

interface Operation {
  readonly method: string;
  readonly template: string;
  readonly pattern: RegExp;
  readonly statuses: ReadonlySet<string>;
}

function loadOperations(): readonly Operation[] {
  const spec = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../docs/openapi.json'), 'utf8')) as {
    paths: Record<string, Record<string, { responses?: Record<string, unknown> } | unknown>>;
  };
  const operations: Operation[] = [];
  for (const [template, item] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      const responses = (operation as { responses?: Record<string, unknown> }).responses;
      if (!responses || !['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const pattern = new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`);
      operations.push({ method: method.toUpperCase(), template, pattern, statuses: new Set(Object.keys(responses)) });
    }
  }
  return operations;
}

/**
 * Respuestas observadas durante la prueba cuyo estado HTTP la operación NO declara en
 * docs/openapi.json (el contrato debe listar todo lo que el backend puede devolver).
 */
export function undeclaredStatuses(): string[] {
  const operations = loadOperations();
  const problems = new Set<string>();
  for (const { method, path, status } of observed) {
    const operation = operations.find((candidate) => candidate.method === method && candidate.pattern.test(path));
    if (!operation) problems.add(`${method} ${path} → ruta no declarada (${status})`);
    else if (!operation.statuses.has(String(status))) problems.add(`${method} ${operation.template} → ${status}`);
  }
  return [...problems].sort();
}

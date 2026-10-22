import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '../..');

/** Archivos de producción que pueden mencionar la clave `service_role` (ADR-006). */
const ALLOWED = new Set([
  'config/env.ts',
  'composition.ts',
  'modules/identity-institutions/infrastructure/supabase-auth-admin.ts',
]);

function productionFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return productionFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.includes('test-support') ? [path] : [];
  });
}

describe('allowlist de service_role (ADR-006)', () => {
  it('solo los archivos permitidos leen serviceRoleKey o SERVICE_ROLE', () => {
    const offenders = productionFiles(SRC)
      .filter((file) => /serviceRoleKey|SERVICE_ROLE/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file).split('\\').join('/'))
      .filter((file) => !ALLOWED.has(file));

    expect(offenders).toEqual([]);
  });

  it('ninguna ruta de código de petición usa la API de administración con clave elevada', () => {
    // El adaptador AuthAdmin es el único lugar donde se crea un cliente con la clave elevada.
    const adminClients = productionFiles(SRC)
      .filter((file) => /createClient\([^)]*(serviceRole|secretKey)/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file).split('\\').join('/'));

    expect(adminClients).toEqual(['modules/identity-institutions/infrastructure/supabase-auth-admin.ts']);
  });
});

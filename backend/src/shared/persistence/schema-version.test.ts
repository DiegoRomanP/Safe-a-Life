import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXPECTED_SCHEMA_VERSION } from './schema-version.js';

describe('EXPECTED_SCHEMA_VERSION', () => {
  it('coincide con la última migración de backend/supabase/migrations', () => {
    const files = readdirSync(new URL('../../../supabase/migrations/', import.meta.url))
      .filter((name) => name.endsWith('.sql'))
      .sort();

    expect(files.length).toBeGreaterThan(0);
    expect(files.at(-1)?.split('_')[0]).toBe(EXPECTED_SCHEMA_VERSION);
  });

  it('cada migración registra su propia versión en app.schema_version', async () => {
    const { readFileSync } = await import('node:fs');
    const dir = new URL('../../../supabase/migrations/', import.meta.url);
    for (const name of readdirSync(dir).filter((file) => file.endsWith('.sql'))) {
      const version = name.split('_')[0];
      expect(readFileSync(new URL(name, dir), 'utf8')).toContain(`insert into app.schema_version (version) values ('${version}')`);
    }
  });
});

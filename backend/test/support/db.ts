import { execFileSync } from 'node:child_process';
import { readLocalSupabase } from './local-env.js';

/** Ejecuta SQL como propietario en la base LOCAL (solo para preparar/inspeccionar fixtures). */
export function sql(statement: string): string {
  const { dbUrl } = readLocalSupabase();
  return execFileSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-At', '-q', '-c', statement], { encoding: 'utf8' }).trim();
}

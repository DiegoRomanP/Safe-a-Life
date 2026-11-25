// Guarda de `npm run dev:local`: con un Supabase remoto, el registro crearía cuentas allí (la auditoría no se borra) y el
// worker consumiría su cola, dejando en el buzón local correos que no llegarían al destinatario.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Misma precedencia que `node --env-file`: la variable del proceso gana a `backend/.env`. */
export function isLocalSupabase(env, envFile) {
  const url = env.SUPABASE_URL ?? parseEnv(envFile).SUPABASE_URL;
  return LOCAL_HOSTS.has(URL.parse(url ?? '')?.hostname);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let envFile = '';
  try {
    // El archivo (con secretos) solo se abre si el proceso no trae ya la variable.
    if (process.env.SUPABASE_URL === undefined) envFile = readFileSync(new URL('../backend/.env', import.meta.url), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!isLocalSupabase(process.env, envFile)) {
    console.error(`dev:local no arranca: SUPABASE_URL no apunta a este equipo (o falta).
Pon en backend/.env la URL, la JWKS y las claves que muestra \`supabase status --workdir backend\`.`);
    process.exit(1);
  }
}

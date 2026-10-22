// Pruebas de integración del backend contra Supabase LOCAL. No arranca Supabase: si no está
// levantado, falla con instrucciones. Reinicia la base, siembra usuarios y ejecuta vitest.
import { spawnSync } from 'node:child_process';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const status = spawnSync('supabase', ['status', '--workdir', 'backend', '-o', 'json'], { encoding: 'utf8' });
if (status.status !== 0) {
  process.stderr.write('Supabase local no está levantado. Ejecuta: supabase start --workdir backend\n');
  process.exit(1);
}

run('supabase', ['db', 'reset', '--workdir', 'backend']);
run('node_modules/.bin/tsx', ['backend/scripts/seed-auth-local.ts']);
const filter = process.argv.slice(2);
run('node_modules/.bin/vitest', ['run', '-c', 'backend/vitest.integration.config.ts', '--root', 'backend', ...filter]);

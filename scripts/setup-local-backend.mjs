import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT = 'save-a-life-backend';
const CONTAINER = `supabase_db_${PROJECT}`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROLES = ['superadmin', 'api_technical', 'worker'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateStatus(value) {
  const api = new URL(value.API_URL);
  const db = new URL(value.DB_URL);
  if (api.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(api.hostname) || api.port !== '54321' || api.username || api.password || api.pathname !== '/' || api.search || api.hash || !['postgres:', 'postgresql:'].includes(db.protocol) || !['localhost', '127.0.0.1'].includes(db.hostname) || db.port !== '54322' || db.pathname !== '/postgres' || db.search || db.hash) throw new Error('El preparador solo admite Supabase local en los puertos del proyecto.');
  const anonKey = value.PUBLISHABLE_KEY ?? value.ANON_KEY;
  const secretKey = value.SECRET_KEY ?? value.SERVICE_ROLE_KEY;
  if (typeof anonKey !== 'string' || !anonKey || typeof secretKey !== 'string' || !secretKey || anonKey === secretKey || /[\r\n]/.test(anonKey + secretKey)) throw new Error('Faltan las claves locales de Supabase.');
  return { apiUrl: api.origin, anonKey, secretKey };
}

export function validateContainer(value) {
  if (value?.Name !== `/${CONTAINER}` || value?.State?.Running !== true || value?.Config?.Labels?.['com.supabase.cli.project'] !== PROJECT) throw new Error('El contenedor local no pertenece al proyecto esperado.');
}

export function createLocalAccounts() {
  return ROLES.map((role) => ({ role, email: `${role.replaceAll('_', '-')}.local@example.test`, password: randomBytes(32).toString('base64url') }));
}

function validateAccounts(accounts) {
  if (!Array.isArray(accounts) || accounts.length !== ROLES.length) throw new Error('El archivo privado de cuentas no es válido.');
  for (const role of ROLES) {
    const matches = accounts.filter((account) => account.role === role);
    if (matches.length !== 1 || matches[0].email !== `${role.replaceAll('_', '-')}.local@example.test` || typeof matches[0].password !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(matches[0].password)) throw new Error('El archivo privado de cuentas no es válido.');
  }
}

export function buildAccountSql(accounts) {
  const statements = accounts.map(({ id, role }) => {
    if (!UUID.test(id) || !ROLES.includes(role)) throw new Error('Identidad local inválida.');
    return `do $$ begin
      if exists (select 1 from app.user_accounts where user_id = '${id}'::uuid and role <> '${role}') then
        raise exception 'bootstrap role conflict';
      end if;
      insert into app.user_accounts (user_id, role) values ('${id}'::uuid, '${role}') on conflict (user_id) do nothing;
    end $$;`;
  });
  return ['begin;', ...statements, 'commit;'].join('\n');
}

export function buildEnv(local, accounts) {
  validateAccounts(accounts);
  const technical = accounts.find((account) => account.role === 'api_technical');
  const secret = () => randomBytes(32).toString('hex');
  return [
    'PORT=3000', `SUPABASE_URL=${local.apiUrl}`, `SUPABASE_ANON_KEY=${local.anonKey}`,
    `SUPABASE_JWKS_URL=${local.apiUrl}/auth/v1/.well-known/jwks.json`, `SUPABASE_SERVICE_ROLE_KEY=${local.secretKey}`,
    'ALLOWED_ORIGINS=http://127.0.0.1:5174,http://localhost:5174', 'TRUSTED_PROXIES=',
    `CSRF_SECRET=${secret()}`, `EMAIL_HMAC_SECRET=${secret()}`, `CURSOR_SECRET=${secret()}`,
    `OUTBOX_KEYS=k1:${randomBytes(32).toString('base64')}`, 'OUTBOX_KEY_CURRENT=k1',
    `API_TECHNICAL_EMAIL=${technical.email}`, `API_TECHNICAL_PASSWORD=${technical.password}`,
    'APP_PUBLIC_URL=http://127.0.0.1:5174', 'EMAIL_FROM=no-responder@example.test', 'EMAIL_PROVIDER=fake', '',
  ].join('\n');
}

export async function ensureLocalAccounts(accounts, auth) {
  validateAccounts(accounts);
  const known = await auth.list();
  const result = [];
  for (const account of accounts) {
    const existing = known.find((user) => user.email === account.email);
    if (existing && !await auth.verify(account)) throw new Error('Una cuenta local existente no coincide con las credenciales privadas; no se modifica.');
    const user = existing ?? await auth.create(account);
    if (!UUID.test(user?.id)) throw new Error('Supabase no devolvió una identidad local válida.');
    result.push({ id: user.id, role: account.role });
  }
  return result;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', timeout: 30_000, windowsHide: true, ...options });
  if (result.status !== 0 || result.error) throw new Error(`No se pudo completar ${command === 'docker' ? 'la comprobación local de Docker/PostgreSQL' : 'la comprobación de herramientas locales'}. Consulta docs/Supabase-Local.md.`);
  return result.stdout.trim();
}
function noSymlink(path) {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error('No se escriben archivos privados mediante enlaces simbólicos.');
}

export async function setupLocalBackend() {
  const envPath = join(ROOT, 'backend', '.env');
  const localDirectory = join(ROOT, 'backend', '.local');
  const accountsPath = join(localDirectory, 'local-accounts.json');
  noSymlink(envPath); noSymlink(localDirectory); noSymlink(accountsPath);
  if (existsSync(envPath)) {
    process.stdout.write('backend/.env ya existe: se conserva sin cambios. Revisa docs/Supabase-Local.md antes de modificar la configuración.\n');
    return;
  }
  if (run('git', ['ls-files', '--', 'backend/.env', 'backend/.local/local-accounts.json'])) throw new Error('Un archivo privado está versionado; no se escriben credenciales.');
  run('git', ['check-ignore', '-q', '--no-index', 'backend/.env']);
  run('git', ['check-ignore', '-q', '--no-index', 'backend/.local/local-accounts.json']);
  const cli = process.env.SUPABASE_CLI || 'supabase';
  const raw = run(cli, ['status', '--workdir', 'backend', '-o', 'json']);
  let status;
  try { status = JSON.parse(raw); } catch { throw new Error('Supabase no devolvió un estado local válido.'); }
  const local = validateStatus(status);
  const inspection = JSON.parse(run('docker', ['inspect', CONTAINER]));
  validateContainer(inspection[0]);
  const schemaReady = run('docker', ['exec', '-i', CONTAINER, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A', '-f', '-'], { input: "select 'ready' from pg_catalog.pg_tables where schemaname = 'app' and tablename = 'user_accounts';" });
  if (schemaReady !== 'ready') throw new Error('Faltan las migraciones locales; no se crean cuentas.');
  // Preserve generated passwords before Auth changes, so an interrupted setup can resume.
  mkdirSync(localDirectory, { recursive: true, mode: 0o700 });
  if (!existsSync(accountsPath)) writeFileSync(accountsPath, `${JSON.stringify(createLocalAccounts(), null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  const accounts = JSON.parse(readFileSync(accountsPath, 'utf8'));
  validateAccounts(accounts);
  const { createClient } = await import('@supabase/supabase-js');
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const admin = createClient(local.apiUrl, local.secretKey, options);
  const identities = await ensureLocalAccounts(accounts, {
    async list() {
      const users = [];
      for (let page = 1; page <= 100; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
        if (error || !data) throw new Error('No se pudo comprobar Auth local.');
        users.push(...data.users);
        if (data.users.length < 100) return users;
      }
      throw new Error('Demasiadas cuentas para este preparador local.');
    },
    async create(account) {
      const { data, error } = await admin.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
      if (error || !data.user) throw new Error('No se pudo crear una cuenta local.');
      return data.user;
    },
    async verify(account) {
      const client = createClient(local.apiUrl, local.anonKey, options);
      const { data, error } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
      if (error || !data.session) return false;
      await client.auth.signOut({ scope: 'local' });
      return true;
    },
  });
  run('docker', ['exec', '-i', CONTAINER, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'], { input: buildAccountSql(identities) });
  writeFileSync(envPath, buildEnv(local, accounts), { flag: 'wx', mode: 0o600 });
  process.stdout.write('Configuración local creada en backend/.env. Credenciales privadas en backend/.local/local-accounts.json. No se reinició la base ni se cambiaron cuentas existentes.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  setupLocalBackend().catch(() => {
    process.stderr.write('No se completó la preparación local. No se muestran secretos. Comprueba Docker, Supabase y docs/Supabase-Local.md; los archivos existentes se conservan.\n');
    process.exitCode = 1;
  });
}

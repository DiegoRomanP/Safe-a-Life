/**
 * Crea los usuarios sintéticos del Supabase LOCAL (Auth + filas app.*) y enrola TOTP
 * para superadmin y admins. Solo corre contra 127.0.0.1/localhost. Los secretos TOTP
 * se guardan en backend/.local/totp-secrets.json (ignorado por git).
 */
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEMO_PASSWORD, readLocalSupabase, SEED_USERS, type SeedUser } from '../test/support/local-env.js';
import { secretFromOtpauthUri, totpCode } from '../test/support/totp.js';

const local = readLocalSupabase();
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const;
const admin = createClient(local.apiUrl, local.secretKey, clientOptions);

const ids = new Map<string, string>();
for (const user of Object.values(SEED_USERS) as SeedUser[]) {
  const { data, error } = await admin.auth.admin.createUser({ email: user.email, password: DEMO_PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`No se pudo crear un usuario de siembra (${user.role}).`);
  ids.set(user.email, data.user.id);
}

const sql: string[] = ['begin;'];
for (const user of Object.values(SEED_USERS) as SeedUser[]) {
  const id = ids.get(user.email) as string;
  sql.push(`insert into app.user_accounts (user_id, role) values ('${id}', '${user.role}');`);
  if (user.role === 'admin_hospitalario' && user.hospitalId) {
    const hint = `${user.email[0]}***@${user.email.split('@')[1]}`;
    sql.push(`insert into app.hospital_memberships (user_id, hospital_id, status, email_hint) values ('${id}', '${user.hospitalId}', 'activa', '${hint}');`);
  }
}
sql.push('commit;');
execFileSync('psql', [local.dbUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'], { input: sql.join('\n'), stdio: ['pipe', 'inherit', 'inherit'] });

const secrets: Record<string, string> = {};
for (const user of Object.values(SEED_USERS) as SeedUser[]) {
  if (!user.mfa) continue;
  const anon = createClient(local.apiUrl, local.publishableKey, clientOptions);
  const signIn = await anon.auth.signInWithPassword({ email: user.email, password: DEMO_PASSWORD });
  if (signIn.error) throw new Error('No se pudo iniciar sesión para enrolar TOTP.');
  const enrolled = await anon.auth.mfa.enroll({ factorType: 'totp', issuer: 'Save a Life' });
  if (enrolled.error || !enrolled.data.totp) throw new Error('No se pudo enrolar TOTP.');
  const secret = secretFromOtpauthUri(enrolled.data.totp.uri);
  const verified = await anon.auth.mfa.challengeAndVerify({ factorId: enrolled.data.id, code: totpCode(secret) });
  if (verified.error) throw new Error('No se pudo verificar el factor TOTP de siembra.');
  secrets[user.email] = secret;
}

const directory = resolve(import.meta.dirname, '../.local');
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, 'totp-secrets.json'), `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`Siembra local lista: ${ids.size} usuarios, ${Object.keys(secrets).length} con TOTP.\n`);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateStatus, validateContainer, buildAccountSql, createLocalAccounts, buildEnv, ensureLocalAccounts } from './setup-local-backend.mjs';

const status = { API_URL: 'http://127.0.0.1:54321', DB_URL: 'postgresql://postgres:local@127.0.0.1:54322/postgres', ANON_KEY: 'anon-fixture', SERVICE_ROLE_KEY: 'service-fixture' };
const container = { Name: '/supabase_db_save-a-life-backend', State: { Running: true }, Config: { Labels: { 'com.supabase.cli.project': 'save-a-life-backend' } } };

test('rejects remote, spoofed, credential-bearing API and wrong-port targets', () => {
  for (const API_URL of ['https://project.supabase.co', 'http://127.0.0.1.evil.test:54321', 'http://user:secret@localhost:54321', 'http://127.0.0.1:3000']) assert.throws(() => validateStatus({ ...status, API_URL }));
  assert.throws(() => validateStatus({ ...status, DB_URL: 'postgresql://postgres:local@remote.test:54322/postgres' }));
  assert.equal(validateStatus(status).apiUrl, status.API_URL);
});

test('rejects stopped or foreign database containers before SQL', () => {
  assert.doesNotThrow(() => validateContainer(container));
  assert.throws(() => validateContainer({ ...container, State: { Running: false } }));
  assert.throws(() => validateContainer({ ...container, Config: { Labels: {} } }));
});

test('SQL accepts only canonical UUIDs and allowlisted bootstrap roles and never overwrites roles', () => {
  const sql = buildAccountSql([{ id: '11111111-1111-4111-8111-111111111111', role: 'superadmin' }]);
  assert.match(sql, /on conflict \(user_id\) do nothing/i);
  assert.match(sql, /role <> 'superadmin'/);
  assert.doesNotMatch(sql, /update app\.user_accounts/i);
  assert.throws(() => buildAccountSql([{ id: "'; drop table app.user_accounts; --", role: 'superadmin' }]));
  assert.throws(() => buildAccountSql([{ id: '11111111-1111-4111-8111-111111111111', role: 'donante' }]));
});

test('generates separate strong credentials and purpose secrets with local-only configuration', () => {
  const accounts = createLocalAccounts();
  assert.equal(accounts.length, 3);
  assert.equal(new Set(accounts.map((account) => account.password)).size, 3);
  assert.ok(accounts.every((account) => account.password.length >= 32 && account.email.endsWith('@example.test')));
  const env = buildEnv(validateStatus(status), accounts);
  assert.match(env, /ALLOWED_ORIGINS=http:\/\/127\.0\.0\.1:5174,http:\/\/localhost:5174/);
  assert.match(env, /EMAIL_PROVIDER=fake/);
  assert.doesNotMatch(env, /VITE_|WORKER_PASSWORD=/);
  const values = Object.fromEntries(env.trim().split('\n').map((line) => line.split('=')));
  assert.equal(new Set([values.CSRF_SECRET, values.EMAIL_HMAC_SECRET, values.CURSOR_SECRET]).size, 3);
});

test('partial retries reuse credentials and leave existing Auth users unchanged', async () => {
  const accounts = createLocalAccounts();
  let created = 0;
  const known = accounts.map((account, index) => ({ email: account.email, id: `11111111-1111-4111-8111-11111111111${index}` }));
  const result = await ensureLocalAccounts(accounts, {
    list: async () => known,
    create: async () => { created++; throw new Error('must not create'); },
    verify: async () => true,
  });
  assert.equal(created, 0);
  assert.equal(result.length, 3);
  await assert.rejects(ensureLocalAccounts(accounts, { list: async () => known, create: async () => { throw new Error('must not create'); }, verify: async () => false }), /credenciales/);
});

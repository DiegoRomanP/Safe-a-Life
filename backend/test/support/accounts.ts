import { randomUUID } from 'node:crypto';
import { openEmailPayload } from '../../src/modules/email-delivery/application/email-payload.js';
import { sql } from './db.js';
import { readLocalSupabase } from './local-env.js';
import { workerConfig } from './worker.js';

/** Crea un usuario de Auth (sin cuenta de aplicación) con el endpoint público de registro. */
export async function signUpAuthOnly(email: string, password: string): Promise<string> {
  const local = readLocalSupabase();
  const response = await fetch(`${local.apiUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: local.publishableKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await response.json()) as { user?: { id: string }; id?: string };
  const id = body.user?.id ?? body.id;
  if (!response.ok || !id) throw new Error(`No se pudo crear el usuario de prueba (${response.status}).`);
  return id;
}

/** Donante sintético con contraseña conocida (no toca los usuarios de siembra compartidos con otras pruebas). */
export async function createDonorAccount(password: string): Promise<string> {
  const email = `donante-${randomUUID().slice(0, 8)}@example.test`;
  const id = await signUpAuthOnly(email, password);
  sql(`insert into app.user_accounts (user_id, role, display_name) values ('${id}', 'donante', 'Donante Sintético')`);
  return email;
}

/** Descifra el último correo del outbox de un tipo y devuelve su token y destinatario (solo las pruebas tienen el keyring). */
export function latestSealed(kind: string, recipient: string): { outboxId: string; token: string; hospitalName?: string } {
  const rows = sql(`select outbox_id || '|' || coalesce(sealed_payload, '') from app.email_outbox where kind = '${kind}' order by created_at desc, outbox_id limit 20`).split('\n');
  const keyring = workerConfig().secrets.outboxKeyring;
  for (const row of rows) {
    const [outboxId, sealed] = row.split('|');
    if (!sealed) continue;
    const payload = openEmailPayload(keyring, outboxId, sealed);
    if (payload.recipient === recipient) return { outboxId, token: payload.token, ...(payload.hospitalName ? { hospitalName: payload.hospitalName } : {}) };
  }
  throw new Error('No hay un correo encolado para ese destinatario.');
}

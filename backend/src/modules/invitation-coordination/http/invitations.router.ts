import type { Express } from 'express';
import { ApiError } from '../../../shared/http/errors.js';
import { sendData } from '../../../shared/http/respond.js';
import { guardsFor, requirePrincipal, requireIdempotencyKey, type HttpSecrets } from '../../../shared/http/route-helpers.js';
import { isCanonicalUuid } from '../../../shared/validation/uuid.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { callRpc } from '../../../shared/persistence/rpc.js';

function uuid(value: string): string {
  if (!isCanonicalUuid(value)) throw new ApiError('BAD_REQUEST');
  return value;
}
function result(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ApiError('INTERNAL_ERROR');
  return value as Record<string, unknown>;
}
function requireOk(value: unknown): Record<string, unknown> {
  const v = result(value);
  if (v.kind === 'ok') return v;
  if (v.kind === 'not_found') throw new ApiError('RESOURCE_NOT_FOUND');
  if (v.kind === 'conflict') throw new ApiError('STATE_CONFLICT');
  if (v.kind === 'invalid') throw new ApiError('VALIDATION_FAILED');
  if (v.kind === 'forbidden') throw new ApiError('ACCESS_DENIED');
  throw new ApiError('INTERNAL_ERROR');
}
export function registerInvitationRoutes(
  app: Express, dependencies: { secrets: HttpSecrets; forUser: (accessToken: string) => SupabaseClient },
): void {
  const guards = guardsFor(dependencies.secrets);
  const rpc = (res: Parameters<typeof requirePrincipal>[0], name: string, args: Record<string, unknown> = {}) =>
    callRpc(dependencies.forUser(requirePrincipal(res).accessToken), name, args);

  app.get('/api/v1/donors/me/invitations', ...guards.donorRead, async (_req, res) => {
    const rows = await rpc(res, 'f6_my_invitations');
    if (!Array.isArray(rows)) throw new ApiError('INTERNAL_ERROR');
    sendData(res, 200, { items: rows });
  });
  app.get('/api/v1/donors/me/response-history', ...guards.donorRead, async (_req, res) => {
    const rows = await rpc(res, 'f6_my_history');
    if (!Array.isArray(rows)) throw new ApiError('INTERNAL_ERROR');
    sendData(res, 200, { items: rows });
  });
  app.patch('/api/v1/donors/me/invitations/:invitationId/response', ...guards.donorWrite, async (req, res) => {
    requireIdempotencyKey(req);
    const invitationId = uuid(String(req.params.invitationId ?? ''));
    const response = req.body?.response;
    if (response !== 'confirmada' && response !== 'rechazada') throw new ApiError('VALIDATION_FAILED');
    requireOk(await rpc(res, 'f6_reply', { p_invitation_id: invitationId, p_response: response }));
    sendData(res, 200, { response });
  });
  app.post('/api/v1/hospitals/me/needs/:needId/invitations/generate', ...guards.adminWrite, async (req, res) => {
    requireIdempotencyKey(req);
    const needId = uuid(String(req.params.needId ?? ''));
    const data = requireOk(await rpc(res, 'f6_generate', { p_need_id: needId }));
    sendData(res, 200, { created: data.created });
  });
}

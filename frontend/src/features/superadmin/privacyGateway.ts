import { apiRequest, ApiError, isRecord } from '../../api/client.js';
import { adminPath, idPath, privacyRequest } from './httpGateway.js';
import type { PrivacyRequest } from './types.js';

export const grantFields = ['name', 'email', 'declaredBloodType'] as const;
export type GrantField = typeof grantFields[number];
export type GrantInput = { requestId: string; action: 'review' | 'execute'; allowedFields: GrantField[]; reason: string };
export type ContextualGrant = Omit<GrantInput, 'reason'> & { grantId: string; expiresAt: string };
export type ContextualData = { currentValues: Partial<Record<GrantField, string>>; proposedValues: Partial<Record<GrantField, string>> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid = () => new ApiError(502, 'INVALID_RESPONSE');

export function parseGrant(value: unknown, expected: Omit<GrantInput, 'reason'>): ContextualGrant {
  if (!isRecord(value) || typeof value.grantId !== 'string' || !uuid.test(value.grantId) || value.requestId !== expected.requestId || value.action !== expected.action || !Array.isArray(value.allowedFields) || typeof value.expiresAt !== 'string') throw invalid();
  const fields = value.allowedFields;
  if (!fields.length || fields.length > 3 || new Set(fields).size !== fields.length || fields.some((field) => !grantFields.includes(field as GrantField)) || fields.length !== expected.allowedFields.length || fields.some((field) => !expected.allowedFields.includes(field as GrantField))) throw invalid();
  const remaining = Date.parse(value.expiresAt) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 600_000) throw invalid();
  return { grantId: value.grantId, requestId: expected.requestId, action: expected.action, allowedFields: [...fields] as GrantField[], expiresAt: value.expiresAt };
}

export function parseContextualData(value: unknown, allowedFields: GrantField[]): ContextualData {
  if (!isRecord(value)) throw invalid();
  const values = (record: unknown): Partial<Record<GrantField, string>> => {
    if (!isRecord(record)) throw invalid();
    const result: Partial<Record<GrantField, string>> = {};
    for (const [field, text] of Object.entries(record)) {
      if (!allowedFields.includes(field as GrantField) || typeof text !== 'string' || text.length > 500) throw invalid();
      result[field as GrantField] = text;
    }
    return result;
  };
  return { currentValues: values(value.currentValues), proposedValues: values(value.proposedValues) };
}

function requireGrant(requestId: string, grant: ContextualGrant, action: 'review' | 'execute') {
  if (grant.requestId !== requestId || grant.action !== action) throw new ApiError(403, 'ACCESS_DENIED');
  if (Date.parse(grant.expiresAt) <= Date.now()) throw new ApiError(410, 'ACTION_UNAVAILABLE');
}
export async function createGrant(input: GrantInput, key: string, signal?: AbortSignal): Promise<ContextualGrant> {
  const value = await apiRequest<unknown>(adminPath + '/access-grants', { method: 'POST', body: input, idempotencyKey: key, signal });
  return parseGrant(value, input);
}
export async function loadContextualData(requestId: string, grant: ContextualGrant, signal?: AbortSignal): Promise<ContextualData> {
  requireGrant(requestId, grant, 'review');
  const value = await apiRequest<unknown>(adminPath + '/correction-requests/' + idPath(requestId) + '/donor-data', { headers: { 'X-Contextual-Grant': grant.grantId }, signal });
  requireGrant(requestId, grant, 'review');
  return parseContextualData(value, grant.allowedFields);
}
export async function executeCorrection(requestId: string, grant: ContextualGrant, key: string, signal?: AbortSignal): Promise<PrivacyRequest> {
  requireGrant(requestId, grant, 'execute');
  const value = await apiRequest<unknown>(adminPath + '/correction-requests/' + idPath(requestId) + '/executions', { method: 'POST', idempotencyKey: key, headers: { 'X-Contextual-Grant': grant.grantId }, signal });
  const result = privacyRequest(value);
  if (result.requestId !== requestId) throw invalid();
  return result;
}

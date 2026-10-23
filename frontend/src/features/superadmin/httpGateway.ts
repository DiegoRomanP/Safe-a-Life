import type { AuditEvent, Configuration, Hospital, Membership, Page, PrivacyRequest, Site, Task } from './types.js';

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Respuesta no válida del servidor.');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Respuesta no válida del servidor.');
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Respuesta no válida del servidor.');
  return value;
}
function timestamp(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error('Fecha no válida del servidor.');
  return result;
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error('Estado no válido del servidor.');
  return value as T;
}
function list<T>(value: unknown, parse: (entry: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error('Lista no válida del servidor.');
  return value.map(parse);
}
export function hospital(value: unknown): Hospital {
  const v = record(value);
  return { hospitalId: text(v.hospitalId), publicName: text(v.publicName), legalName: v.legalName === undefined ? '' : text(v.legalName), isAuthorized: bool(v.isAuthorized), createdAt: timestamp(v.createdAt) };
}
export function site(value: unknown): Site {
  const v = record(value), c = record(v.coordinates);
  if (typeof c.latitude !== 'number' || !Number.isFinite(c.latitude) || Math.abs(c.latitude) > 90 || typeof c.longitude !== 'number' || !Number.isFinite(c.longitude) || Math.abs(c.longitude) > 180) throw new Error('Coordenadas no válidas.');
  return { siteId: text(v.siteId), hospitalId: text(v.hospitalId), publicName: text(v.publicName), publicAddress: v.publicAddress === undefined ? '' : text(v.publicAddress), coordinates: { latitude: c.latitude, longitude: c.longitude }, publicInstructions: v.publicInstructions === undefined || v.publicInstructions === null ? null : text(v.publicInstructions), isActive: bool(v.isActive), isApproved: bool(v.isApproved) };
}
export const sites = (value: unknown): Site[] => list(record(value).items, site);
export function membership(value: unknown): Membership {
  const v = record(value);
  return { membershipId: text(v.membershipId), hospitalId: text(v.hospitalId), emailHint: text(v.emailHint), role: oneOf(v.role, ['admin_hospitalario']), status: oneOf(v.status, ['pendiente', 'activa', 'revocada']) };
}
export function privacyRequest(value: unknown): PrivacyRequest {
  const v = record(value);
  return { requestId: text(v.requestId), type: oneOf(v.type, ['correccion', 'eliminacion']), requestedFields: list(v.requestedFields, (f) => oneOf(f, ['name', 'email', 'declaredBloodType', 'deletion'])), status: oneOf(v.status, ['pendiente', 'aprobada', 'rechazada', 'en_ejecucion', 'completada', 'fallida']), createdAt: timestamp(v.createdAt) };
}
export function configuration(value: unknown): Configuration {
  const v = record(value);
  return { finalDemoAt: v.finalDemoAt === null ? null : timestamp(v.finalDemoAt), isImmutable: bool(v.isImmutable) };
}
export function auditEvent(value: unknown): AuditEvent {
  const v = record(value);
  return { eventId: text(v.eventId), actorCode: text(v.actorCode), resourceCode: text(v.resourceCode), event: text(v.event), result: oneOf(v.result, ['ok', 'denegado', 'fallido']), occurredAt: timestamp(v.occurredAt) };
}
function task(value: unknown): Task {
  const v = record(value);
  return { taskId: text(v.taskId), kind: oneOf(v.kind, ['correction_request', 'hospital_review', 'recognition_policy', 'delivery_failure']), resourceCode: v.resourceCode === undefined ? '' : text(v.resourceCode), createdAt: timestamp(v.createdAt) };
}
export const tasks = (value: unknown): Task[] => list(record(value).items, task);
export function paged<T>(parse: (entry: unknown) => T): (value: unknown) => Page<T> {
  return (value) => {
    const v = record(value), pagination = record(v.pagination);
    return { items: list(v.items, parse), pagination: { nextCursor: pagination.nextCursor === null ? null : text(pagination.nextCursor) } };
  };
}
export const hospitalsPage = paged(hospital);
export const membershipsPage = paged(membership);
export const requestsPage = paged(privacyRequest);
export const auditPage = paged(auditEvent);
export const adminPath = '/api/v1/superadmin';
export const idPath = (id: string) => encodeURIComponent(id);


export function assertMutationResult(path: string, value: unknown): void {
  if (/\/hospitals(?:\/[^/]+)?$/.test(path)) { hospital(value); return; }
  if (/\/(?:hospitals\/[^/]+\/sites|sites\/[^/]+)$/.test(path)) { site(value); return; }
  if (/\/memberships\/[^/]+$/.test(path)) { membership(value); return; }
  if (/\/correction-requests\/[^/]+$/.test(path)) { privacyRequest(value); return; }
  if (path === adminPath + '/configuration') { configuration(value); return; }
  if (path === adminPath + '/hospital-admin-invitations') {
    const message = text(record(value).message);
    if (message.length > 240) throw new Error('Mensaje no válido del servidor.');
    return;
  }
  throw new Error('Operación sin contrato de respuesta.');
}

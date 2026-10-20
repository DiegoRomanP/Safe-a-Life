import { describe, expect, it } from 'vitest';
import { fingerprint } from '../../../shared/crypto/fingerprint.js';
import { hashToken } from '../../../shared/crypto/tokens.js';
import { ApiError } from '../../../shared/http/errors.js';
import { createPrivacyRequestsService } from './privacy-requests-service.js';
import type { CorrectionRequestView, ExecutionStarted, ExecutionSubject, PrivacyRequestsRepository } from './privacy-requests.ports.js';

const ID = '90000000-0000-4000-8000-000000000001';
const GRANT = 'a0000000-0000-4000-8000-000000000001';
const NEW_ID = '90000000-0000-4000-8000-000000000002';
const TOKEN = 't'.repeat(43);
const VIEW: CorrectionRequestView = {
  requestId: ID, type: 'correccion', requestedFields: ['name'], status: 'pendiente', createdAt: '2026-10-20T10:00:00Z', updatedAt: '2026-10-20T10:00:00Z',
};

interface Options {
  started?: ExecutionStarted;
  subject?: ExecutionSubject | Error;
  view?: CorrectionRequestView;
  withEraser?: boolean;
  eraserError?: boolean;
  proposedEmailSealed?: string;
  openError?: boolean;
}

function harness(options: Options = {}) {
  const calls: string[] = [];
  const seen = { envelopes: [] as Array<{ key: string; hash: string }>, inputs: [] as unknown[], sealed: [] as Array<[string, string]>, payloads: [] as unknown[], ledger: [] as string[] };
  const repository = {
    createOwn: async (_t, envelope, input) => { seen.envelopes.push(envelope); seen.inputs.push(input); return VIEW; },
    listOwn: async () => ({ items: [VIEW], next: null }),
    getOwn: async () => VIEW,
    list: async () => ({ items: [VIEW], next: null }),
    get: async () => options.view ?? VIEW,
    decide: async (_t, envelope, requestId, decision, reason) => { seen.envelopes.push(envelope); seen.inputs.push([requestId, decision, reason]); return VIEW; },
    createGrant: async (_t, envelope, grant) => { seen.envelopes.push(envelope); seen.inputs.push(grant); return { grantId: GRANT, requestId: grant.requestId, action: grant.action, allowedFields: grant.allowedFields, expiresAt: 'x' }; },
    contextualData: async () => ({ currentValues: { name: 'Ana' }, proposedValues: { name: 'Bea' }, ...(options.proposedEmailSealed ? { proposedEmailSealed: options.proposedEmailSealed } : {}) }),
    execute: async (_t, envelope) => { calls.push('execute'); seen.envelopes.push(envelope); return options.started ?? { request: VIEW, next: 'none' as const }; },
    executionSubject: async () => {
      calls.push('subject');
      if (options.subject instanceof Error) throw options.subject;
      return options.subject ?? { type: 'correccion' as const };
    },
    issueEmailChange: async (_requestId, issue) => { calls.push('issue'); seen.inputs.push(issue); },
    finishDeletion: async (_requestId, hmac) => { calls.push('finishDeletion'); seen.ledger.push(hmac); },
    failExecution: async () => { calls.push('fail'); },
  } satisfies PrivacyRequestsRepository;
  const service = createPrivacyRequestsService({
    repository,
    sealEmailValue: (context, email) => { seen.sealed.push([context, email]); return `sellado:${context}`; },
    openEmailValue: (_context, sealed) => { if (options.openError) throw new Error('no abre'); return sealed.startsWith('prop') ? 'Nuevo@example.test' : 'x'; },
    seal: (outboxId, payload) => { seen.payloads.push([outboxId, payload]); return 'v1.k1.cifrado'; },
    ledgerHmac: (userId) => `hmac(${userId})`,
    ...(options.withEraser ? { eraser: { deleteAccount: async (id: string) => { calls.push(`erase:${id}`); if (options.eraserError) throw new Error('auth'); } } } : {}),
    newToken: () => TOKEN, newId: () => NEW_ID,
  });
  return { service, calls, seen };
}

describe('createOwn', () => {
  it('normaliza, cifra el correo con el id de la solicitud y manda un hash sin valores personales', async () => {
    const { service, seen } = harness();

    await service.createOwn('jwt', 'clave-solicitud-0001', { type: 'correccion', changes: { name: '  Ana  ', newEmail: ' Nuevo@Example.Test ' } });

    expect(seen.sealed).toEqual([[NEW_ID, 'nuevo@example.test']]);
    expect(seen.inputs[0]).toMatchObject({ type: 'correccion', name: 'Ana', declaredBloodType: null, emailSealed: `sellado:${NEW_ID}` });
    expect(seen.envelopes[0]?.hash).toBe(fingerprint([['type', 'correccion'], ['name', 'Ana'], ['newEmail', 'nuevo@example.test'], ['declaredBloodType', null]]));
    expect(JSON.stringify(seen.envelopes)).not.toMatch(/nuevo@example|Ana/);
  });

  it('una eliminación no lleva valores', async () => {
    const { service, seen } = harness();
    await service.createOwn('jwt', 'clave-solicitud-0002', { type: 'eliminacion' });
    expect(seen.inputs[0]).toMatchObject({ type: 'eliminacion', name: null, emailSealed: null, declaredBloodType: null });
  });

  it.each([
    ['sin cambios', { changes: {} }],
    ['nombre en blanco', { changes: { name: '   ' } }],
    ['correo mal formado', { changes: { newEmail: 'sin-arroba' } }],
  ])('rechaza una corrección %s como inválida', async (_label, body) => {
    const { service } = harness();
    await expect(service.createOwn('jwt', 'clave-solicitud-0003', { type: 'correccion', ...body })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('decisión y grants', () => {
  it('el hash de la decisión cubre solicitud, decisión y motivo recortado', async () => {
    const { service, seen } = harness();
    await service.decide('jwt', 'clave-decision-0001', ID, 'aprobada', '  Verificada.  ');
    expect(seen.envelopes[0]?.hash).toBe(fingerprint([['requestId', ID], ['decision', 'aprobada'], ['reason', 'Verificada.']]));
    expect(seen.inputs[0]).toEqual([ID, 'aprobada', 'Verificada.']);
    await expect(Promise.resolve().then(() => service.decide('jwt', 'clave-decision-0002', ID, 'aprobada', '   '))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('ordena y deduplica los campos del grant igual que la base', async () => {
    const { service, seen } = harness();
    await service.createGrant('jwt', 'clave-grant-000001', { requestId: ID, action: 'review', allowedFields: ['name', 'declaredBloodType', 'name'], reason: 'Revisión.' });
    expect(seen.inputs[0]).toMatchObject({ allowedFields: ['declaredBloodType', 'name'] });
    expect(seen.envelopes[0]?.hash).toBe(fingerprint([['requestId', ID], ['action', 'review'], ['allowedFields', 'declaredBloodType,name'], ['reason', 'Revisión.']]));
  });
});

describe('contextualData', () => {
  it('abre el correo propuesto y lo muestra como email', async () => {
    const { service } = harness({ proposedEmailSealed: 'propuesto' });
    expect(await service.contextualData('jwt', ID, GRANT)).toEqual({ currentValues: { name: 'Ana' }, proposedValues: { name: 'Bea', email: 'Nuevo@example.test' } });
  });

  it('si el correo no se puede abrir es un error interno genérico', async () => {
    const { service } = harness({ proposedEmailSealed: 'propuesto', openError: true });
    await expect(service.contextualData('jwt', ID, GRANT)).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});

describe('execute', () => {
  it('una corrección de perfil no necesita más pasos', async () => {
    const { service, calls, seen } = harness();
    await service.execute('jwt', 'clave-ejecuta-0001', ID, GRANT);
    expect(calls).toEqual(['execute']);
    expect(seen.envelopes[0]?.hash).toBe(fingerprint([['requestId', ID], ['grantId', GRANT]]));
  });

  it('un cambio de correo emite el enlace al buzón nuevo: token y correo cifrados, el token solo como hash', async () => {
    const { service, calls, seen } = harness({
      started: { request: { ...VIEW, status: 'en_ejecucion' }, next: 'email' }, subject: { type: 'correccion', proposedEmailSealed: 'propuesto' },
    });

    await service.execute('jwt', 'clave-ejecuta-0002', ID, GRANT);

    expect(calls).toEqual(['execute', 'subject', 'issue']);
    expect(seen.inputs[0]).toEqual({ tokenHash: hashToken(TOKEN), outboxId: NEW_ID, sealedEmail: `sellado:${hashToken(TOKEN)}`, sealedPayload: 'v1.k1.cifrado' });
    expect(seen.payloads[0]).toEqual([NEW_ID, { recipient: 'Nuevo@example.test', token: TOKEN }]);
    expect(JSON.stringify(seen.inputs)).not.toContain(TOKEN);
  });

  it('un replay posterior al cierre devuelve el estado actual en vez de fallar', async () => {
    const { service, calls } = harness({
      started: { request: { ...VIEW, status: 'en_ejecucion' }, next: 'email' }, subject: new ApiError('STATE_CONFLICT'),
    });
    await expect(service.execute('jwt', 'clave-ejecuta-0002', ID, GRANT)).resolves.toMatchObject({ requestId: ID });
    expect(calls).toEqual(['execute', 'subject']);
  });

  it('sin quien borre cuentas, una eliminación se rechaza antes de ejecutar nada', async () => {
    const { service, calls } = harness({ view: { ...VIEW, type: 'eliminacion', requestedFields: ['deletion'] } });
    await expect(service.execute('jwt', 'clave-ejecuta-0003', ID, GRANT)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(calls).toEqual([]);
  });

  it('una eliminación borra la cuenta y cierra con el HMAC del id, nunca con el id', async () => {
    const donor = '00000000-0000-4000-8000-0000000000a3';
    const { service, calls, seen } = harness({
      withEraser: true, view: { ...VIEW, type: 'eliminacion', requestedFields: ['deletion'] },
      started: { request: { ...VIEW, type: 'eliminacion', requestedFields: ['deletion'], status: 'en_ejecucion' }, next: 'deletion' },
      subject: { type: 'eliminacion', donorId: donor },
    });

    await service.execute('jwt', 'clave-ejecuta-0004', ID, GRANT);

    expect(calls).toEqual(['execute', 'subject', `erase:${donor}`, 'finishDeletion']);
    expect(seen.ledger).toEqual([`hmac(${donor})`]);
  });

  it('si Auth no puede borrar, la solicitud se marca fallida y la respuesta es 503', async () => {
    const { service, calls } = harness({
      withEraser: true, eraserError: true, view: { ...VIEW, type: 'eliminacion', requestedFields: ['deletion'] },
      started: { request: { ...VIEW, status: 'en_ejecucion' }, next: 'deletion' }, subject: { type: 'eliminacion', donorId: 'd-1' },
    });
    await expect(service.execute('jwt', 'clave-ejecuta-0005', ID, GRANT)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(calls).toEqual(['execute', 'subject', 'erase:d-1', 'fail']);
  });
});

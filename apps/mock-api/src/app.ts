import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { components } from './api/openapi.js';
import type { ActorRole, DemoInvitation, DemoInvitationBatchRecord, DemoNeed, DemoSession, DemoState } from './domain/model.js';
import { invitationBatchPage } from './domain/invitation-batch-page.js';
import { invitationValidityForRead, needStatusForRead } from './domain/read-projections.js';
import { ALTERNATE_HOSPITAL_ID, createDemoState, DEMO_HOSPITAL_ID } from './infrastructure/demo-state.js';

type ApiSchemas = components['schemas'];

const SESSION_COOKIE = 'session';
const SESSION_MAX_AGE_MS = 30 * 60 * 1000;
const LOGIN_PASSWORD = 'synthetic-demo-only';
const LOCAL_WEB_ORIGIN = 'http://127.0.0.1:5173';

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
}).strict();

const responseChangeSchema = z.object({
  response: z.enum(['confirmada', 'rechazada']),
}).strict();

const createNeedSchema = z.object({
  component: z.literal('RBC'),
  requiredBloodType: z.enum(['O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS']),
  targetConfirmations: z.number().int().min(1).max(50),
  siteId: z.string().uuid(),
  radiusKm: z.number().int().min(1).max(50).default(10),
  urgency: z.enum(['Normal', 'Urgente', 'Critica']),
  expiresInHours: z.number().int().min(1).max(72),
}).strict();

// This loose envelope is only a guard for synthetic local coordinates; it is not
// the versioned production Lima polygon required by the functional baseline.
const demoLocationSchema = z.object({
  latitude: z.number().min(-12.5).max(-11.5).multipleOf(0.001),
  longitude: z.number().min(-77.5).max(-76.5).multipleOf(0.001),
}).strict();

const donorProfileUpdateSchema = z.object({
  isAvailable: z.boolean().optional(),
  approximateLocation: demoLocationSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

// Demo-only allowlist: arbitrary names/emails are rejected, and proposed values
// are discarded after extracting the requested field labels.
const correctionProfileChangesSchema = z.object({
  name: z.literal('Nombre sintético actualizado').optional(),
  newEmail: z.literal('cambio.demo@example.test').optional(),
  declaredBloodType: z.literal('A_POS').optional(),
}).strict().refine((changes) => Object.keys(changes).length > 0);

const createCorrectionRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('correccion'), changes: correctionProfileChangesSchema }).strict(),
  z.object({ type: z.literal('eliminacion') }).strict(),
]);

const needStatusSchema = z.enum([
  'borrador', 'activa', 'meta_alcanzada', 'cerrada', 'cancelada', 'vencida',
]);

const needListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(512).optional(),
  status: needStatusSchema.optional(),
}).strict();

const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(512).optional(),
}).strict();

const uuidSchema = z.string().uuid();

function sendError(
  response: Response,
  status: number,
  code: string,
  message: string,
): void {
  response.status(status).json({
    error: { code, message, correlationId: randomUUID() },
  });
}

function readSession(request: Request, sessions: Map<string, DemoSession>): DemoSession | undefined {
  const sessionId = request.cookies?.[SESSION_COOKIE];
  if (typeof sessionId !== 'string') return undefined;
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  if (Date.now() >= session.expiresAt) {
    sessions.delete(sessionId);
    return undefined;
  }
  return session;
}

function actorForRole(
  request: Request,
  response: Response,
  sessions: Map<string, DemoSession>,
  roles: ActorRole[],
): DemoSession | undefined {
  const session = readSession(request, sessions);
  if (!session) {
    sendError(response, 401, 'AUTHENTICATION_REQUIRED', 'La sesión no está vigente.');
    return undefined;
  }
  if (!roles.includes(session.actor.role)) {
    sendError(response, 403, 'ACCESS_DENIED', 'La acción no está permitida.');
    return undefined;
  }
  return session;
}

function hasIdempotencyKey(request: Request, response: Response): boolean {
  const key = request.get('Idempotency-Key');
  if (key && key.length >= 16 && key.length <= 255) return true;
  sendError(response, 400, 'BAD_REQUEST', 'Solicitud malformada.');
  return false;
}

function hasValidResetToken(request: Request): boolean {
  const expectedToken = process.env.MOCK_RESET_TOKEN;
  const suppliedToken = request.get('X-Mock-Reset-Token');
  if (!expectedToken || !suppliedToken) return false;
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function validateMutationProtection(
  request: Request,
  response: Response,
  session: DemoSession,
): boolean {
  if (request.get('Origin') !== LOCAL_WEB_ORIGIN) {
    sendError(response, 403, 'ACCESS_DENIED', 'La acción no está permitida.');
    return false;
  }
  if (request.get('X-CSRF-Token') !== session.csrfToken) {
    sendError(response, 403, 'CSRF_VALIDATION_FAILED', 'La acción no está permitida.');
    return false;
  }
  return hasIdempotencyKey(request, response);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function requestHash(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value)).digest('hex');
}

function replayIdempotent(
  state: DemoState,
  actorId: string,
  operation: string,
  key: string,
  payload: unknown,
  response: Response,
): boolean {
  const recordKey = `${actorId}:${operation}:${key}`;
  const record = state.idempotency.get(recordKey);
  if (!record) return false;
  if (record.payloadHash !== requestHash(payload)) {
    sendError(response, 409, 'IDEMPOTENCY_CONFLICT', 'La clave ya se usó con otra solicitud.');
    return true;
  }
  response.status(record.status).json(structuredClone(record.responseBody));
  return true;
}

function rememberIdempotent(
  state: DemoState,
  actorId: string,
  operation: string,
  key: string,
  payload: unknown,
  status: number,
  responseBody: unknown,
): void {
  state.idempotency.set(`${actorId}:${operation}:${key}`, {
    payloadHash: requestHash(payload),
    status,
    responseBody: structuredClone(responseBody),
  });
}

function toNeedSummary(need: DemoNeed, invitations: DemoInvitation[], now = Date.now()): ApiSchemas['Need'] {
  const confirmedIntentCount = invitations.filter(
    (invitation) => invitation.needId === need.needId && invitation.response === 'confirmada',
  ).length;
  return {
    needId: need.needId,
    component: need.component,
    requiredBloodType: need.requiredBloodType,
    targetConfirmations: need.targetConfirmations,
    confirmedIntentCount,
    siteId: need.siteId,
    radiusKm: need.radiusKm,
    urgency: need.urgency,
    status: needStatusForRead(need, now),
    expiresAt: need.expiresAt,
  };
}

function expireActiveNeeds(state: DemoState): void {
  const now = Date.now();
  for (const need of state.needs) {
    if (need.status !== 'activa' || now < Date.parse(need.expiresAt)) continue;
    need.status = 'vencida';
    for (const invitation of state.invitations) {
      if (invitation.needId === need.needId
        && invitation.validity === 'activa'
        && invitation.response === 'sin_respuesta') {
        invitation.validity = 'vencida';
      }
    }
  }
}

function toHospitalResponse(
  invitation: DemoInvitation,
  state: DemoState,
): ApiSchemas['OpaqueHospitalResponse'] | ApiSchemas['ConfirmedHospitalResponse'] {
  if (invitation.response === 'confirmada') {
    const donor = state.donors.get(invitation.donorId);
    return {
      needDonorCode: invitation.needDonorCode,
      donorName: donor?.name ?? 'Donante Demo',
      declaredBloodType: donor?.declaredBloodType ?? invitation.requiredBloodType,
      response: 'confirmada' as const,
      responseRecordedAt: invitation.responseRecordedAt ?? new Date().toISOString(),
    };
  }
  return {
    needDonorCode: invitation.needDonorCode,
    validity: invitation.validity,
    delivery: invitation.delivery,
    response: invitation.response,
  };
}

function toAuthSession(session: DemoSession): ApiSchemas['AuthSessionEnvelope'] {
  return {
    data: {
      actor: {
        role: session.actor.role,
        displayName: session.actor.displayName,
        ...(session.actor.hospitalName ? { hospitalName: session.actor.hospitalName } : {}),
      },
      aal: session.aal,
      mfaRequired: false,
      expiresAt: new Date(session.expiresAt).toISOString(),
    },
  };
}

function toCorrectionRequestSummary(
  record: DemoState['correctionRequests'][number],
): ApiSchemas['CorrectionRequestSummary'] {
  return {
    requestId: record.requestId,
    type: record.type,
    requestedFields: [...record.requestedFields],
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.decisionReason ? { decisionReason: record.decisionReason } : {}),
  };
}

export function createApp(initialState: DemoState = createDemoState()) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('El mock local no puede ejecutarse en producción.');
  }
  let state = initialState;
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(express.json({ limit: '16kb', strict: true }));
  app.use(cookieParser());

  app.get('/health/live', (_request, response) => {
    response.json({ data: { status: 'ok' } });
  });

  app.get('/health/ready', (_request, response) => {
    response.json({ data: { status: 'ready' } });
  });

  app.post('/__mock/reset', (request, response) => {
    const remoteAddress = request.socket.remoteAddress?.replace(/^::ffff:/, '');
    const isLoopback = remoteAddress === '127.0.0.1' || remoteAddress === '::1';
    if (process.env.NODE_ENV === 'production' || !isLoopback || !process.env.MOCK_RESET_TOKEN) {
      sendError(response, 404, 'RESOURCE_NOT_FOUND', 'El recurso no está disponible.');
      return;
    }
    if (request.get('Origin') !== LOCAL_WEB_ORIGIN || !hasValidResetToken(request)) {
      sendError(response, 403, 'ACCESS_DENIED', 'La acción no está permitida.');
      return;
    }
    state = createDemoState();
    response.status(204).end();
  });

  app.post('/api/v1/auth/sessions', (request, response) => {
    if (!hasIdempotencyKey(request, response)) return;
    const input = loginSchema.safeParse(request.body);
    if (!input.success) {
      sendError(response, 400, 'BAD_REQUEST', 'Solicitud malformada.');
      return;
    }
    const loginInput: ApiSchemas['LoginRequest'] = input.data;

    const idempotencyKey = request.get('Idempotency-Key')!;
    const payloadHash = requestHash(loginInput);
    const previousLogin = state.loginIdempotency.get(idempotencyKey);
    if (previousLogin) {
      if (previousLogin.payloadHash !== payloadHash) {
        sendError(response, 409, 'IDEMPOTENCY_CONFLICT', 'La clave ya se usó con otra solicitud.');
        return;
      }
      const previousSession = state.sessions.get(previousLogin.sessionId);
      if (!previousSession || Date.now() >= previousSession.expiresAt) {
        state.sessions.delete(previousLogin.sessionId);
        sendError(response, 409, 'STATE_CONFLICT', 'La sesión ya no está vigente.');
        return;
      }
      response.cookie(SESSION_COOKIE, previousLogin.sessionId, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: Math.max(0, previousSession.expiresAt - Date.now()),
      });
      response.json(structuredClone(previousLogin.responseBody));
      return;
    }

    const actor = state.actorsByEmail.get(loginInput.email.toLowerCase());
    if (!actor || loginInput.password !== LOGIN_PASSWORD) {
      sendError(response, 401, 'AUTHENTICATION_REQUIRED', 'La sesión no está vigente.');
      return;
    }

    const sessionId = randomBytes(32).toString('base64url');
    const session: DemoSession = {
      actor,
      csrfToken: randomBytes(32).toString('base64url'),
      aal: actor.role === 'donante' ? 1 : 2,
      expiresAt: Date.now() + SESSION_MAX_AGE_MS,
    };
    state.sessions.set(sessionId, session);
    response.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_MS,
    });
    const responseBody = toAuthSession(session);
    state.loginIdempotency.set(idempotencyKey, {
      payloadHash,
      sessionId,
      responseBody: structuredClone(responseBody),
    });
    response.json(responseBody);
  });

  app.get('/api/v1/auth/session', (request, response) => {
    const session = readSession(request, state.sessions);
    if (!session) {
      sendError(response, 401, 'AUTHENTICATION_REQUIRED', 'La sesión no está vigente.');
      return;
    }
    response.json(toAuthSession(session));
  });

  app.get('/api/v1/auth/csrf-token', (request, response) => {
    const session = readSession(request, state.sessions);
    if (!session) {
      sendError(response, 401, 'AUTHENTICATION_REQUIRED', 'La sesión no está vigente.');
      return;
    }
    response.json({ data: { token: session.csrfToken } });
  });

  app.delete('/api/v1/auth/sessions/current', (request, response) => {
    const sessionId = request.cookies?.[SESSION_COOKIE];
    if (typeof sessionId !== 'string') {
      sendError(response, 401, 'AUTHENTICATION_REQUIRED', 'La sesión no está vigente.');
      return;
    }
    if (!hasIdempotencyKey(request, response)) return;
    if (request.get('Origin') !== LOCAL_WEB_ORIGIN) {
      sendError(response, 403, 'ACCESS_DENIED', 'La acción no está permitida.');
      return;
    }
    const key = request.get('Idempotency-Key')!;
    const recordKey = `${sessionId}:${key}`;
    const previousLogout = state.logoutIdempotency.get(recordKey);
    if (previousLogout) {
      if (Date.now() >= previousLogout.expiresAt) {
        state.logoutIdempotency.delete(recordKey);
        sendError(response, 401, 'AUTHENTICATION_REQUIRED', 'La sesión no está vigente.');
        return;
      }
      const csrfToken = request.get('X-CSRF-Token');
      if (!csrfToken || requestHash(csrfToken) !== previousLogout.csrfHash) {
        sendError(response, 403, 'CSRF_VALIDATION_FAILED', 'La acción no está permitida.');
        return;
      }
      response.clearCookie(SESSION_COOKIE, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      });
      response.status(204).end();
      return;
    }
    const session = readSession(request, state.sessions);
    if (!session) {
      sendError(response, 401, 'AUTHENTICATION_REQUIRED', 'La sesión no está vigente.');
      return;
    }
    if (!validateMutationProtection(request, response, session)) return;
    state.logoutIdempotency.set(recordKey, {
      csrfHash: requestHash(session.csrfToken),
      expiresAt: session.expiresAt,
    });
    state.sessions.delete(sessionId);
    response.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
    response.status(204).end();
  });

  app.get('/api/v1/donors/me/profile', (request, response) => {
    const session = actorForRole(request, response, state.sessions, ['donante']);
    if (!session) return;
    const profile = state.donors.get(session.actor.actorId);
    if (!profile) {
      sendError(response, 404, 'RESOURCE_NOT_FOUND', 'El recurso no está disponible.');
      return;
    }
    response.json({ data: structuredClone(profile) });
  });

  app.patch('/api/v1/donors/me/profile', (request, response) => {
    const session = actorForRole(request, response, state.sessions, ['donante']);
    if (!session) return;
    if (!validateMutationProtection(request, response, session)) return;
    const input = donorProfileUpdateSchema.safeParse(request.body);
    if (!input.success) {
      sendError(response, 422, 'VALIDATION_FAILED', 'Uno o más valores no cumplen las reglas del campo.');
      return;
    }
    const profileChanges: ApiSchemas['UpdateDonorProfileRequest'] = input.data;
    const key = request.get('Idempotency-Key')!;
    const operation = 'updateOwnDonorParticipation';
    if (replayIdempotent(state, session.actor.actorId, operation, key, profileChanges, response)) return;
    const profile = state.donors.get(session.actor.actorId);
    if (!profile) {
      sendError(response, 404, 'RESOURCE_NOT_FOUND', 'El recurso no está disponible.');
      return;
    }
    if (profileChanges.isAvailable !== undefined) profile.isAvailable = profileChanges.isAvailable;
    if (profileChanges.approximateLocation) {
      profile.approximateLocation = { ...profileChanges.approximateLocation };
    }
    const result = { data: structuredClone(profile) };
    rememberIdempotent(state, session.actor.actorId, operation, key, profileChanges, 200, result);
    response.json(result);
  });

  app.get('/api/v1/donors/me/invitations', (request, response) => {
    const session = actorForRole(request, response, state.sessions, ['donante']);
    if (!session) return;
    const now = Date.now();
    const items = state.invitations
      .filter((invitation) => invitation.donorId === session.actor.actorId)
      .map((invitation) => {
        const need = state.needs.find((candidate) => candidate.needId === invitation.needId)!;
        return {
          invitationId: invitation.invitationId,
          hospitalName: invitation.hospitalName,
          publicSiteName: invitation.publicSiteName,
          requiredBloodType: invitation.requiredBloodType,
          urgency: invitation.urgency,
          instructions: invitation.instructions,
          expiresAt: need.expiresAt,
          validity: invitationValidityForRead(invitation, need, now),
          delivery: invitation.delivery,
          response: invitation.response,
        };
      });
    response.json({ data: { items, pagination: { nextCursor: null } } });
  });

  app.get('/api/v1/donors/me/invitations/:invitationId', (request, response) => {
    const session = actorForRole(request, response, state.sessions, ['donante']);
    if (!session) return;
    const now = Date.now();
    const parsedId = uuidSchema.safeParse(request.params.invitationId);
    if (!parsedId.success) {
      sendError(response, 404, 'RESOURCE_NOT_FOUND', 'El recurso no está disponible.');
      return;
    }
    const invitation = state.invitations.find(
      (candidate) => candidate.invitationId === parsedId.data
        && candidate.donorId === session.actor.actorId,
    );
    const need = invitation
      ? state.needs.find((candidate) => candidate.needId === invitation.needId)
      : undefined;
    if (!invitation || !need) {
      sendError(response, 404, 'RESOURCE_NOT_FOUND', 'El recurso no está disponible.');
      return;
    }
    const { invitationId, hospitalName, publicSiteName, requiredBloodType, urgency,
      instructions, delivery, response: currentResponse } = invitation;
    response.json({
      data: {
        invitation: {
          invitationId,
          hospitalName,
          publicSiteName,
          requiredBloodType,
          urgency,
          instructions,
          expiresAt: need.expiresAt,
          validity: invitationValidityForRead(invitation, need, now),
          delivery,
          response: currentResponse,
        },
        instructions,
      },
    });
  });

  app.get('/api/v1/donors/me/responses', (request, response) => {
    const session = actorForRole(request, response, state.sessions, ['donante']);
    if (!session) return;
    const query = pageQuerySchema.safeParse(request.query);
    if (!query.success) {
      sendError(response, 422, 'VALIDATION_FAILED', 'Uno o más valores no cumplen las reglas del campo.');
      return;
    }
    const items = state.responseHistory
      .filter((event) => event.donorId === session.actor.actorId)
      .slice(-(query.data.limit ?? 20))
      .reverse()
      .map((event) => ({
        invitationId: event.invitationId,
        response: event.response,
        changedAt: event.changedAt,
      }));
    const data: ApiSchemas['OwnResponseHistoryEnvelope']['data'] = {
      items,
      pagination: { nextCursor: null },
    };
    response.json({ data });
  });

  app.get('/api/v1/donors/me/correction-requests', (request, response) => {
    const session = actorForRole(request, response, state.sessions, ['donante']);
    if (!session) return;
    const query = pageQuerySchema.safeParse(request.query);
    if (!query.success) {
      sendError(response, 422, 'VALIDATION_FAILED', 'Uno o más valores no cumplen las reglas del campo.');
      return;
    }
    const items = state.correctionRequests
      .filter((record) => record.donorId === session.actor.actorId)
      .slice(0, query.data.limit ?? 20)
      .map(toCorrectionRequestSummary);
    const data: ApiSchemas['CorrectionRequestListEnvelope']['data'] = {
      items,
      pagination: { nextCursor: null },
    };
    response.json({ data });
  });

  app.post('/api/v1/donors/me/correction-requests', (request, response) => {
    const session = actorForRole(request, response, state.sessions, ['donante']);
    if (!session) return;
    if (!validateMutationProtection(request, response, session)) return;
    const input = createCorrectionRequestSchema.safeParse(request.body);
    if (!input.success) {
      sendError(response, 422, 'VALIDATION_FAILED', 'Uno o más valores no cumplen las reglas del campo.');
      return;
    }
    const correctionInput: ApiSchemas['CreateCorrectionRequest'] = input.data;
    const key = request.get('Idempotency-Key')!;
    const operation = 'createOwnCorrectionRequest';
    if (replayIdempotent(state, session.actor.actorId, operation, key, correctionInput, response)) return;
    const requestedFields: ApiSchemas['CorrectionRequestSummary']['requestedFields'] =
      correctionInput.type === 'eliminacion'
        ? ['deletion']
        : [
          ...(correctionInput.changes.name ? ['name' as const] : []),
          ...(correctionInput.changes.newEmail ? ['email' as const] : []),
          ...(correctionInput.changes.declaredBloodType ? ['declaredBloodType' as const] : []),
        ];
    const createdAt = new Date().toISOString();
    const record: DemoState['correctionRequests'][number] = {
      requestId: randomUUID(),
      donorId: session.actor.actorId,
      type: correctionInput.type,
      requestedFields,
      status: 'pendiente',
      createdAt,
      updatedAt: createdAt,
    };
    state.correctionRequests.push(record);
    const result: ApiSchemas['CorrectionRequestEnvelope'] = {
      data: toCorrectionRequestSummary(record),
    };
    rememberIdempotent(state, session.actor.actorId, operation, key, correctionInput, 201, result);
    response.status(201).json(result);
  });

  app.get('/api/v1/donors/me/correction-requests/:requestId', (request, response) => {
    const session = actorForRole(request, response, state.sessions, ['donante']);
    if (!session) return;
    const parsedId = uuidSchema.safeParse(request.params.requestId);
    const record = parsedId.success
      ? state.correctionRequests.find((candidate) => candidate.requestId === parsedId.data
        && candidate.donorId === session.actor.actorId)
      : undefined;
    if (!record) {
      sendError(response, 404, 'RESOURCE_NOT_FOUND', 'El recurso no está disponible.');
      return;
    }
    const result: ApiSchemas['CorrectionRequestEnvelope'] = {
      data: toCorrectionRequestSummary(record),
    };
    response.json(result);
  });

  app.get('/api/v1/hospitals/me/needs', (request, response) => {
    const session = actorForRole(request, response, state.sessions, ['admin_hospitalario']);
    if (!session) return;
    const now = Date.now();
    const query = needListQuerySchema.safeParse(request.query);
    if (!query.success) {
      sendError(response, 422, 'VALIDATION_FAILED', 'Uno o más valores no cumplen las reglas del campo.');
      return;
    }
    const items = state.needs
      .filter((need) => need.hospitalId === session.actor.hospitalId)
      .filter((need) => !query.data.status || needStatusForRead(need, now) === query.data.status)
      .slice(0, query.data.limit ?? 20)
      .map((need) => toNeedSummary(need, state.invitations, now));
    response.json({ data: { items, pagination: { nextCursor: null } } });
  });

  app.post('/api/v1/hospitals/me/needs', (request, response) => {
    const session = actorForRole(request, response, state.sessions, ['admin_hospitalario']);
    if (!session) return;
    if (!validateMutationProtection(request, response, session)) return;
    const input = createNeedSchema.safeParse(request.body);
    const hospitalId = session.actor.hospitalId;
    if (!hospitalId) {
      sendError(response, 403, 'ACCESS_DENIED', 'La acción no está permitida.');
      return;
    }
    if (!input.success) {
      sendError(response, 422, 'VALIDATION_FAILED', 'Uno o más valores no cumplen las reglas del campo.');
      return;
    }
    const needInput = input.data satisfies ApiSchemas['CreateNeedRequest'];
    if (state.siteHospitalIds.get(needInput.siteId) !== hospitalId) {
      sendError(response, 422, 'VALIDATION_FAILED', 'Uno o más valores no cumplen las reglas del campo.');
      return;
    }
    const key = request.get('Idempotency-Key')!;
    const operation = 'createHospitalNeed';
    if (replayIdempotent(state, session.actor.actorId, operation, key, needInput, response)) return;
    const need: DemoNeed = {
      needId: randomUUID(),
      hospitalId,
      component: needInput.component,
      requiredBloodType: needInput.requiredBloodType,
      targetConfirmations: needInput.targetConfirmations,
      siteId: needInput.siteId,
      radiusKm: needInput.radiusKm,
      urgency: needInput.urgency,
      status: 'borrador',
      expiresAt: new Date(Date.now() + needInput.expiresInHours * 60 * 60 * 1000).toISOString(),
    };
    state.needs.push(need);
    const result = { data: toNeedSummary(need, state.invitations) };
    rememberIdempotent(state, session.actor.actorId, operation, key, needInput, 201, result);
    response.status(201).json(result);
  });

  app.get('/api/v1/hospitals/me/needs/:needId', (request, response) => {
    const session = actorForRole(request, response, state.sessions, ['admin_hospitalario']);
    if (!session) return;
    const parsedNeedId = uuidSchema.safeParse(request.params.needId);
    const need = parsedNeedId.success
      ? state.needs.find((candidate) => candidate.needId === parsedNeedId.data
        && candidate.hospitalId === session.actor.hospitalId)
      : undefined;
    if (!need) {
      sendError(response, 404, 'RESOURCE_NOT_FOUND', 'El recurso no está disponible.');
      return;
    }
    response.json({ data: toNeedSummary(need, state.invitations) });
  });

  app.get('/api/v1/hospitals/me/needs/:needId/invitation-batches', (request, response) => {
    const session = actorForRole(request, response, state.sessions, ['admin_hospitalario']);
    if (!session) return;
    const parsedNeedId = uuidSchema.safeParse(request.params.needId);
    if (!parsedNeedId.success) {
      sendError(response, 400, 'BAD_REQUEST', 'Solicitud malformada.');
      return;
    }
    const need = state.needs.find((candidate) => candidate.needId === parsedNeedId.data
      && candidate.hospitalId === session.actor.hospitalId);
    if (!need) {
      sendError(response, 404, 'RESOURCE_NOT_FOUND', 'El recurso no está disponible.');
      return;
    }
    const query = pageQuerySchema.safeParse(request.query);
    const page = query.success
      ? invitationBatchPage(state.invitationBatches, need, query.data.limit, query.data.cursor)
      : null;
    if (!page) {
      sendError(response, 400, 'BAD_REQUEST', 'Solicitud malformada.');
      return;
    }
    const items: ApiSchemas['InvitationBatchRecord'][] = page.items
      .map(({ batchId, createdAt, createdInvitationCount, deliveryCounts }) => ({
        batchId,
        createdAt,
        createdInvitationCount,
        deliveryCounts: { ...deliveryCounts },
      }));
    const data: ApiSchemas['InvitationBatchListEnvelope']['data'] = {
      items,
      pagination: { nextCursor: page.nextCursor },
    };
    response.json({ data });
  });

  app.post('/api/v1/hospitals/me/needs/:needId/invitation-batches', (request, response) => {
    const session = actorForRole(request, response, state.sessions, ['admin_hospitalario']);
    if (!session) return;
    if (!validateMutationProtection(request, response, session)) return;
    const parsedNeedId = uuidSchema.safeParse(request.params.needId);
    if (!parsedNeedId.success) {
      sendError(response, 400, 'BAD_REQUEST', 'Solicitud malformada.');
      return;
    }
    const need = state.needs.find((candidate) => candidate.needId === parsedNeedId.data
      && candidate.hospitalId === session.actor.hospitalId);
    if (!need) {
      sendError(response, 404, 'RESOURCE_NOT_FOUND', 'El recurso no está disponible.');
      return;
    }
    const key = request.get('Idempotency-Key')!;
    const operation = `requestInvitationBatch:${need.needId}`;
    if (replayIdempotent(state, session.actor.actorId, operation, key, null, response)) return;
    if (needStatusForRead(need, Date.now()) !== 'activa') {
      sendError(response, 409, 'STATE_CONFLICT', 'La operación entra en conflicto con el estado actual.');
      return;
    }
    const batch: DemoInvitationBatchRecord = {
      batchId: randomUUID(),
      hospitalId: need.hospitalId,
      needId: need.needId,
      createdAt: new Date().toISOString(),
      createdInvitationCount: 0,
      deliveryCounts: { pendiente: 0, enviada: 0, entregada: 0, fallida: 0 },
    };
    state.invitationBatches.push(batch);
    const result: ApiSchemas['InvitationBatchEnvelope'] = {
      data: { batchId: batch.batchId, createdInvitationCount: 0, queuedEmailCount: 0 },
    };
    rememberIdempotent(state, session.actor.actorId, operation, key, null, 201, result);
    response.status(201).json(result);
  });

  app.get('/api/v1/hospitals/me/needs/:needId/responses', (request, response) => {
    const session = actorForRole(request, response, state.sessions, ['admin_hospitalario']);
    if (!session) return;
    const now = Date.now();
    const parsedNeedId = uuidSchema.safeParse(request.params.needId);
    if (!parsedNeedId.success) {
      sendError(response, 400, 'BAD_REQUEST', 'Solicitud malformada.');
      return;
    }
    const need = state.needs.find(
      (candidate) => candidate.needId === parsedNeedId.data
        && candidate.hospitalId === session.actor.hospitalId,
    );
    if (!need) {
      sendError(response, 404, 'RESOURCE_NOT_FOUND', 'El recurso no está disponible.');
      return;
    }
    const invitations = state.invitations.filter((invitation) => invitation.needId === need.needId);
    const items = invitations.map((invitation) => toHospitalResponse({
      ...invitation,
      validity: invitationValidityForRead(invitation, need, now),
    }, state));
    const confirmedIntentCount = invitations.filter(
      (invitation) => invitation.response === 'confirmada',
    ).length;
    response.json({ data: { confirmedIntentCount, items, pagination: { nextCursor: null } } });
  });

  app.get('/api/v1/superadmin/task-queue', (request, response) => {
    const session = actorForRole(request, response, state.sessions, ['superadmin']);
    if (!session) return;
    response.json({
      data: {
        items: [{
          taskId: '14fc3c52-96b8-4aad-88b7-4e213c17bc97',
          kind: 'correction_request',
          createdAt: new Date().toISOString(),
          resourceCode: 'request-51a8f2',
        }],
      },
    });
  });

  app.get('/api/v1/superadmin/hospitals', (request, response) => {
    const session = actorForRole(request, response, state.sessions, ['superadmin']);
    if (!session) return;
    const query = pageQuerySchema.safeParse(request.query);
    if (!query.success) {
      sendError(response, 422, 'VALIDATION_FAILED', 'Uno o más valores no cumplen las reglas del campo.');
      return;
    }
    const items = [{
      hospitalId: DEMO_HOSPITAL_ID,
      publicName: 'Hospital Demo',
      legalName: 'Hospital Académico Demo',
      isAuthorized: true,
      createdAt: '2026-09-25T12:00:00.000Z',
    }, {
      hospitalId: ALTERNATE_HOSPITAL_ID,
      publicName: 'Hospital Norte Demo',
      legalName: 'Hospital Norte Académico Demo',
      isAuthorized: true,
      createdAt: '2026-09-26T12:00:00.000Z',
    }].slice(0, query.data.limit ?? 20);
    response.json({ data: { items, pagination: { nextCursor: null } } });
  });

  app.get('/api/v1/superadmin/configuration', (request, response) => {
    const session = actorForRole(request, response, state.sessions, ['superadmin']);
    if (!session) return;
    response.json({ data: { finalDemoAt: null, isImmutable: false } });
  });

  app.get('/api/v1/superadmin/audit-events', (request, response) => {
    const session = actorForRole(request, response, state.sessions, ['superadmin']);
    if (!session) return;
    const query = pageQuerySchema.safeParse(request.query);
    if (!query.success) {
      sendError(response, 422, 'VALIDATION_FAILED', 'Uno o más valores no cumplen las reglas del campo.');
      return;
    }
    const items = [{
      eventId: 'c49de2b2-e8ea-416a-8e43-6c2038f3fa3b',
      actorCode: 'actor-81a4d2',
      event: 'hospital.created',
      resourceCode: 'hospital-a8b517',
      result: 'ok',
      occurredAt: '2026-09-25T12:00:00.000Z',
    }].slice(0, query.data.limit ?? 20);
    response.json({ data: { items, pagination: { nextCursor: null } } });
  });

  app.patch('/api/v1/donors/me/invitations/:invitationId/response', (request, response) => {
    const session = actorForRole(request, response, state.sessions, ['donante']);
    if (!session) return;
    if (!validateMutationProtection(request, response, session)) return;
    expireActiveNeeds(state);
    const parsedId = uuidSchema.safeParse(request.params.invitationId);
    const input = responseChangeSchema.safeParse(request.body);
    if (!parsedId.success || !input.success) {
      sendError(response, 422, 'VALIDATION_FAILED', 'Uno o más valores no cumplen las reglas del campo.');
      return;
    }
    const requestedChange: ApiSchemas['ChangeInvitationResponseRequest'] = input.data;
    const key = request.get('Idempotency-Key')!;
    const operation = `changeInvitationResponse:${parsedId.data}`;
    if (replayIdempotent(state, session.actor.actorId, operation, key, requestedChange, response)) return;
    const invitation = state.invitations.find(
      (candidate) => candidate.invitationId === parsedId.data
        && candidate.donorId === session.actor.actorId,
    );
    if (!invitation) {
      sendError(response, 404, 'RESOURCE_NOT_FOUND', 'El recurso no está disponible.');
      return;
    }
    const need = state.needs.find((candidate) => candidate.needId === invitation.needId);
    if (!need || need.status !== 'activa' || Date.now() >= Date.parse(need.expiresAt)) {
      sendError(response, 409, 'STATE_CONFLICT', 'La operación entra en conflicto con el estado actual.');
      return;
    }
    invitation.response = requestedChange.response;
    invitation.responseRecordedAt = new Date().toISOString();
    state.responseHistory.push({
      donorId: session.actor.actorId,
      invitationId: invitation.invitationId,
      response: invitation.response,
      changedAt: invitation.responseRecordedAt,
    });
    const result = {
      data: {
        response: invitation.response,
        recordedAt: invitation.responseRecordedAt,
        needStatus: need.status,
      },
    };
    rememberIdempotent(state, session.actor.actorId, operation, key, requestedChange, 200, result);
    response.json(result);
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
      sendError(response, 400, 'BAD_REQUEST', 'Solicitud malformada.');
      return;
    }
    sendError(response, 500, 'INTERNAL_ERROR', 'No se pudo completar la solicitud.');
  });

  app.use((_request, response) => {
    sendError(response, 404, 'RESOURCE_NOT_FOUND', 'El recurso no está disponible.');
  });

  return app;
}

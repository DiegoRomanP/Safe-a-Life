export type ActorRole = 'donante' | 'admin_hospitalario' | 'superadmin';

export type LoginSession = Readonly<{
  role: ActorRole;
  aal: 1 | 2;
  mfaRequired: boolean;
  mfaChallengeId?: string;
}>;

type Credentials = Readonly<{ email: string; password: string }>;
type LoginResult = Readonly<{ session: LoginSession; csrfToken: string }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function parseSession(value: unknown): LoginSession {
  if (!isRecord(value) || !hasOnlyKeys(value, ['data']) || !isRecord(value.data)) throw new Error();
  const data = value.data;
  if (!hasOnlyKeys(data, ['actor', 'aal', 'mfaRequired', 'mfaChallengeId', 'expiresAt']) || !isRecord(data.actor)) throw new Error();
  const actor = data.actor;
  const role = actor.role;
  const roles: ActorRole[] = ['donante', 'admin_hospitalario', 'superadmin'];
  if (!hasOnlyKeys(actor, ['role', 'displayName', 'hospitalName']) || !roles.includes(role as ActorRole)) throw new Error();
  if (typeof actor.displayName !== 'string' || actor.displayName.length > 120) throw new Error();
  if (actor.hospitalName !== undefined && (typeof actor.hospitalName !== 'string' || actor.hospitalName.length > 160)) throw new Error();
  if ((data.aal !== 1 && data.aal !== 2) || typeof data.mfaRequired !== 'boolean') throw new Error();
  if (data.mfaChallengeId !== undefined && (typeof data.mfaChallengeId !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(data.mfaChallengeId))) throw new Error();
  if (data.expiresAt !== undefined && (typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt)))) throw new Error();
  return {
    role: role as ActorRole,
    aal: data.aal,
    mfaRequired: data.mfaRequired,
    ...(typeof data.mfaChallengeId === 'string' ? { mfaChallengeId: data.mfaChallengeId } : {}),
  };
}

function parseCsrfToken(value: unknown): string {
  if (!isRecord(value) || !hasOnlyKeys(value, ['data']) || !isRecord(value.data)) throw new Error();
  const { data } = value;
  if (!hasOnlyKeys(data, ['token']) || typeof data.token !== 'string' || data.token.length < 32 || data.token.length > 512) throw new Error();
  return data.token;
}

async function readOkJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error();
  return response.json();
}

function idempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return [...globalThis.crypto.getRandomValues(new Uint8Array(16))]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function loginAndBootstrap(credentials: Credentials): Promise<LoginResult> {
  const response = await fetch('/api/v1/auth/sessions', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() },
    body: JSON.stringify(credentials),
  });
  const session = parseSession(await readOkJson(response));
  const csrfResponse = await fetch('/api/v1/auth/csrf-token', {
    credentials: 'same-origin',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  });
  const csrfToken = parseCsrfToken(await readOkJson(csrfResponse));
  return { session, csrfToken };
}

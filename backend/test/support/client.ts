import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEMO_PASSWORD } from './local-env.js';
import { freshTotpCode } from './totp.js';

export const APP_ORIGIN = 'http://127.0.0.1:5173';

export interface ApiResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
  readonly json: any;
}

export interface SendOptions {
  readonly body?: unknown;
  /** Clave de idempotencia; por defecto se genera una nueva en mutaciones. */
  readonly key?: string | null;
  /** Adjunta Origin y X-CSRF-Token (por defecto, en toda mutación con sesión). */
  readonly csrf?: boolean;
  readonly origin?: string | null;
  readonly headers?: Record<string, string>;
}

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Cliente HTTP mínimo con cookie jar manual. Cada instancia simula un navegador con su propia IP. */
export class ApiClient {
  readonly cookies = new Map<string, string>();
  private csrfToken: string | undefined;
  private readonly ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

  constructor(readonly baseUrl: string, ip?: string) {
    if (ip) this.ip = ip;
  }

  async send(method: string, path: string, options: SendOptions = {}): Promise<ApiResponse> {
    const headers: Record<string, string> = { 'x-forwarded-for': this.ip };
    if (this.cookies.size > 0) headers.cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    if (options.body !== undefined) headers['content-type'] = 'application/json';

    if (MUTATIONS.has(method)) {
      if (options.key !== null) headers['idempotency-key'] = options.key ?? randomUUID();
      const withCsrf = options.csrf ?? this.cookies.size > 0;
      if (withCsrf) {
        if (options.origin !== null) headers.origin = options.origin ?? APP_ORIGIN;
        headers['x-csrf-token'] = this.csrfToken ?? '';
      } else if (options.origin) {
        headers.origin = options.origin;
      }
    }

    // Las cabeceras explícitas de la prueba mandan sobre las automáticas.
    Object.assign(headers, options.headers);
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    const text = await response.text();
    this.storeCookies(response.headers);
    let json: any;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: response.status, headers: response.headers, text, json };
  }

  private storeCookies(headers: Headers): void {
    for (const line of headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(';').map((part) => part.trim());
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      const expired = attributes.some((attribute) => attribute.toLowerCase() === 'max-age=0');
      if (expired || value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async fetchCsrf(): Promise<string> {
    const response = await this.send('GET', '/api/v1/auth/csrf-token');
    if (response.status !== 200) throw new Error('No se pudo obtener el token CSRF.');
    this.csrfToken = response.json.data.token as string;
    return this.csrfToken;
  }

  /** Login con la contraseña de siembra; si el usuario exige MFA, completa el reto con su TOTP. */
  async login(email: string, options: { mfa?: boolean; password?: string } = {}): Promise<ApiResponse> {
    const response = await this.send('POST', '/api/v1/auth/sessions', {
      body: { email, password: options.password ?? DEMO_PASSWORD },
    });
    if (response.status !== 200) return response;
    await this.fetchCsrf();
    if (options.mfa !== false && response.json.data.mfaRequired && response.json.data.mfaChallengeId) {
      const code = await freshTotpCode(totpSecretFor(email));
      const verified = await this.send('POST', '/api/v1/auth/mfa-verifications', {
        body: { challengeId: response.json.data.mfaChallengeId, code },
      });
      if (verified.status !== 200) throw new Error(`MFA de siembra rechazado (${verified.status}).`);
      await this.fetchCsrf();
      return verified;
    }
    return response;
  }

  /** Step-up con un TOTP nuevo (la ventana anterior ya se usó en el login). */
  async stepUp(email: string): Promise<ApiResponse> {
    const code = await freshTotpCode(totpSecretFor(email));
    const response = await this.send('POST', '/api/v1/auth/step-up-verifications', { body: { code } });
    if (response.status === 200) await this.fetchCsrf();
    return response;
  }
}

export function totpSecretFor(email: string): string {
  const file = resolve(import.meta.dirname, '../../.local/totp-secrets.json');
  const secrets = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
  const secret = secrets[email];
  if (!secret) throw new Error('Sin secreto TOTP de siembra para este usuario.');
  return secret;
}

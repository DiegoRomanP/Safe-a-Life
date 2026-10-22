import type { EmailMessage, EmailSender, SendResult } from '../application/email-sender.js';
import { classify, type CallOutcome } from '../domain/retry-policy.js';

const ENDPOINT = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

export interface ResendSenderOptions {
  readonly apiKey: string;
  readonly from: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

/** Errores de conexión anteriores al envío del body: se pueden reintentar sin riesgo de duplicado. */
const BEFORE_SEND = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID']);

function causeCode(error: unknown): string | undefined {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  return typeof cause?.code === 'string' ? cause.code : undefined;
}

function isTimeout(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

/**
 * Sin forma fiable de saber si el body llegó a salir, un timeout o un corte que no sea un fallo de conexión
 * claro se trata como «después de enviar» (incierto): el reintento con la misma clave de idempotencia es seguro.
 */
function outcomeOfFailure(error: unknown): CallOutcome {
  const code = causeCode(error);
  const bodySent = !(code !== undefined && BEFORE_SEND.has(code));
  return { type: isTimeout(error) ? 'timeout' : 'network', bodySent };
}

async function providerMessageId(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { id?: unknown };
    return typeof body.id === 'string' ? body.id : undefined;
  } catch {
    return undefined;
  }
}

/** 409 `concurrent_idempotent_requests`: otra petición con la misma clave sigue en curso; es seguro reintentar más tarde. */
async function isConcurrentIdempotency(response: Response): Promise<boolean> {
  try {
    const body = (await response.json()) as { name?: unknown };
    return body.name === 'concurrent_idempotent_requests';
  } catch {
    return false;
  }
}

/**
 * Adaptador de Resend por `fetch` (sin SDK nuevo, ADR-005). Nunca lanza ni registra destinatario, asunto, cuerpo
 * ni la clave de API.
 */
export function createResendSender({ apiKey, from, fetch: fetchImpl = fetch, timeoutMs = TIMEOUT_MS }: ResendSenderOptions): EmailSender {
  return {
    async send({ to, subject, text, html, idempotencyKey }: EmailMessage): Promise<SendResult> {
      let response: Response;
      try {
        response = await fetchImpl(ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Idempotency-Key': idempotencyKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from, to: [to], subject, text, html }),
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        return { kind: classify(outcomeOfFailure(error)) };
      }

      const httpStatus = response.status;
      if (httpStatus === 409 && (await isConcurrentIdempotency(response))) return { kind: 'transitorio', httpStatus };
      const kind = classify({ type: 'response', status: httpStatus });
      if (kind === 'ok') {
        const id = await providerMessageId(response);
        return id === undefined ? { kind, httpStatus } : { kind, httpStatus, providerMessageId: id };
      }
      return { kind, httpStatus };
    },
  };
}

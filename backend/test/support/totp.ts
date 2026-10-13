import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = '';
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Secreto TOTP inválido.');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  return Buffer.from(bytes);
}

/** RFC 6238 (SHA-1, 30 s, 6 dígitos), igual que los autenticadores TOTP estándar. */
export function totpCode(base32Secret: string, atMs: number = Date.now(), digits = 6, stepSeconds = 30): string {
  const counter = Math.floor(atMs / 1000 / stepSeconds);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(base32Secret)).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

// Cada archivo de prueba es un módulo distinto en vitest: la última ventana usada por secreto se comparte por
// archivo para que dos archivos que inician sesión con el mismo usuario no reutilicen el código (Auth lo rechaza).
const WINDOWS_FILE = resolve(import.meta.dirname, '../../.local/totp-windows.json');

function lastWindow(secret: string): number | undefined {
  try {
    return (JSON.parse(readFileSync(WINDOWS_FILE, 'utf8')) as Record<string, number>)[secret];
  } catch {
    return undefined;
  }
}

function rememberWindow(secret: string, window: number): void {
  let windows: Record<string, number> = {};
  try {
    windows = JSON.parse(readFileSync(WINDOWS_FILE, 'utf8')) as Record<string, number>;
  } catch {
    // Sin archivo previo o ilegible: se empieza de cero.
  }
  windows[secret] = window;
  if (!existsSync(resolve(WINDOWS_FILE, '..'))) mkdirSync(resolve(WINDOWS_FILE, '..'), { recursive: true });
  writeFileSync(WINDOWS_FILE, JSON.stringify(windows));
}

/**
 * Código TOTP que no repite la ventana ya usada con ese secreto (los servidores rechazan reutilizar
 * un código) y con margen suficiente para no caducar en vuelo.
 */
export async function freshTotpCode(base32Secret: string, minRemainingMs = 4000, stepSeconds = 30): Promise<string> {
  const windowMs = stepSeconds * 1000;
  const currentWindow = () => Math.floor(Date.now() / windowMs);
  const remaining = () => windowMs - (Date.now() % windowMs);
  if (lastWindow(base32Secret) === currentWindow() || remaining() < minRemainingMs) {
    await new Promise((resolveWait) => setTimeout(resolveWait, remaining() + 50));
  }
  rememberWindow(base32Secret, currentWindow());
  return totpCode(base32Secret);
}

/** Extrae el secreto base32 de un URI otpauth://. */
export function secretFromOtpauthUri(uri: string): string {
  const secret = new URL(uri).searchParams.get('secret');
  if (!secret) throw new Error('El URI otpauth no trae secreto.');
  return secret;
}

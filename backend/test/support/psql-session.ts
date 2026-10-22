import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readLocalSupabase } from './local-env.js';

export interface Output { readonly out: string; readonly err: string }

/**
 * Conexión psql persistente a la base LOCAL para pruebas de concurrencia: cada `run` envía sentencias y espera un
 * marcador en stdout y en stderr (sin sleeps). Una sentencia bloqueada deja la promesa pendiente; no se envía nada más
 * a esa conexión hasta que resuelva.
 */
export class PsqlSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private out = '';
  private err = '';
  private seq = 0;
  private wake: (() => void) | undefined;

  constructor() {
    this.child = spawn('psql', [readLocalSupabase().dbUrl, '-At', '-q', '-v', 'ON_ERROR_STOP=0'], { stdio: 'pipe' });
    this.child.stdout.on('data', (c: Buffer) => { this.out += c.toString(); this.wake?.(); });
    this.child.stderr.on('data', (c: Buffer) => { this.err += c.toString(); this.wake?.(); });
  }

  run(statements: string): Promise<Output> {
    const marker = `@@END${this.seq++}@@`;
    this.out = '';
    this.err = '';
    this.child.stdin.write(`${statements}\n\\echo ${marker}\n\\warn ${marker}\n`);
    return new Promise((resolve) => {
      const check = (): void => {
        if (this.out.includes(marker) && this.err.includes(marker)) {
          this.wake = undefined;
          resolve({ out: this.out.replace(marker, '').trim(), err: this.err.replace(marker, '').trim() });
        }
      };
      this.wake = check;
      check();
    });
  }

  async pid(): Promise<number> {
    return Number((await this.run('select pg_backend_pid();')).out);
  }

  close(): void {
    this.child.stdin.end();
  }
}

/** Espera una condición (barrera explícita) sin dormir un tiempo fijo: sondea hasta cumplirse o agotar el plazo. */
export async function until(condition: () => Promise<boolean>, what: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`Barrera no alcanzada: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Barrera: `waiter` está bloqueado por `blocker` (según pg_blocking_pids desde una tercera conexión). */
export function isBlockedBy(observer: PsqlSession, waiterPid: number, blockerPid: number): () => Promise<boolean> {
  return async () => (await observer.run(`select ${blockerPid} = any(pg_blocking_pids(${waiterPid}));`)).out === 't';
}

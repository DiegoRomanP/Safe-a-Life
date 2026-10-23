from pathlib import Path
import shutil, datetime
root=Path.cwd()
p=root/'backend/src/modules/email-delivery/infrastructure/fake-sender.ts'
if not p.exists():
    raise SystemExit('ERROR: ejecuta desde la raíz de Safe-a-Life-login.')
s=p.read_text(encoding='utf-8')
needle="import type { EmailMessage, EmailSender, SendResult } from '../application/email-sender.js';"
if needle not in s:
    raise SystemExit('ERROR: fake-sender.ts no coincide con la versión revisada; no modifiqué nada.')
if 'SAL_DEV_MAILBOX' in s:
    raise SystemExit('El buzón local ya fue integrado. No se aplicaron cambios.')
old='''  async send(message: EmailMessage): Promise<SendResult> {
    const result = this.script(this.records.length + 1, { idempotencyKey: message.idempotencyKey });
    this.records.push(Object.freeze({ kind: result.kind, idempotencyKey: message.idempotencyKey, at: this.now() }));
    return result;
  }'''
if old not in s:
    raise SystemExit('ERROR: método send diferente; no modifiqué nada.')
backup=p.with_suffix('.ts.backup-'+datetime.datetime.now().strftime('%Y%m%d%H%M%S'))
shutil.copy2(p,backup)
s=s.replace(needle,needle+"\nimport { mkdir, writeFile } from 'node:fs/promises';\nimport { randomUUID } from 'node:crypto';\nimport { resolve } from 'node:path';")
new='''  async send(message: EmailMessage): Promise<SendResult> {
    // Buzón explícito de pruebas: solo en entorno local y nunca en producción.
    if (process.env.SAL_DEV_MAILBOX === '1') {
      if (process.env.NODE_ENV === 'production' || process.env.APP_PUBLIC_URL !== 'http://127.0.0.1:5174') {
        throw new Error('Buzón de desarrollo prohibido fuera del entorno local.');
      }
      const inbox = resolve(process.cwd(), '.local', 'mailbox');
      await mkdir(inbox, { recursive: true, mode: 0o700 });
      const record = JSON.stringify({ to: message.to, subject: message.subject, text: message.text }, null, 2);
      await writeFile(resolve(inbox, `${Date.now()}-${randomUUID()}.json`), record, { flag: 'wx', mode: 0o600 });
    }
    const result = this.script(this.records.length + 1, { idempotencyKey: message.idempotencyKey });
    this.records.push(Object.freeze({ kind: result.kind, idempotencyKey: message.idempotencyKey, at: this.now() }));
    return result;
  }'''
s=s.replace(old,new)
p.write_text(s,encoding='utf-8')
print('Parche aplicado:',p.relative_to(root))
print('Respaldo:',backup.name)
print('El buzón se activa únicamente con SAL_DEV_MAILBOX=1, para APP_PUBLIC_URL local.')

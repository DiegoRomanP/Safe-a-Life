import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resetToken = randomBytes(32).toString('base64url');
const executable = process.platform === 'win32' ? 'playwright.cmd' : 'playwright';
const result = spawnSync(executable, ['test', ...process.argv.slice(2)], {
  cwd: root,
  env: { ...process.env, MOCK_RESET_TOKEN: resetToken },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

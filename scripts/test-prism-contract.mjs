import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript';
import { ContractError, buildPlan, assertCoverage, assertResponse } from './prism-contract.mjs';

// No CLI target/spec options: only the trusted repository JSON, loopback, port 0.
// This proves static contracts, NOT production auth/RLS, matching or email delivery.
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const host = '127.0.0.1';
const totalMs = 90_000;
const requestMs = 3_000;
const maxResponseBytes = 1_048_576;

async function untilAbort(promise, signal) {
  if (signal.aborted) throw new ContractError('INTERRUPTED');
  let abort;
  const interrupted = new Promise((_resolve, reject) => {
    abort = () => reject(new ContractError('INTERRUPTED'));
    signal.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([promise, interrupted]); }
  finally { signal.removeEventListener('abort', abort); }
}

export async function waitForClose(closed, milliseconds) {
  let timer;
  try {
    return await Promise.race([closed.then(() => true), new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

export async function withPrism(task, { signal = AbortSignal.timeout(totalMs), readinessMs = 10_000 } = {}) {
  if (signal.aborted) throw new ContractError('INTERRUPTED');
  // Use ADR-002's normal static mode. Prism --errors additionally normalizes
  // writeOnly out of response schemas (CSRF example then yields 500). The
  // independent Ajv2020 checks below do NOT strip annotations or skip schemas.
  const child = spawn(process.execPath, [require.resolve('@stoplight/prism-cli/dist/index.js'),
    'mock', 'docs/openapi.json', '--host', host, '--port', '0', '--multiprocess', 'false'], {
    cwd: root,
    env: { PATH: process.env.PATH, NODE_ENV: 'development', NO_COLOR: '1', SCARF_ANALYTICS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = new Promise((resolve) => child.once('close', resolve));
  let failed = false;
  let port;
  let buffer = '';
  child.on('error', () => { failed = true; });
  // Never forward child logs (Prism writes paths/parameters). Keep only a bounded
  // readiness buffer and discard all output after extracting the assigned port.
  child.stderr.resume();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    if (port) return;
    buffer = (buffer + chunk).slice(-8192);
    const match = buffer.match(/Prism is listening on http:\/\/127\.0\.0\.1:(\d+)/);
    if (match) { port = Number(match[1]); buffer = ''; }
  });
  try {
    const deadline = Date.now() + readinessMs;
    while (!port) {
      if (signal.aborted) throw new ContractError('INTERRUPTED');
      if (failed || child.exitCode !== null || child.signalCode !== null) throw new ContractError('PRISM_START');
      if (Date.now() >= deadline) throw new ContractError('READINESS_TIMEOUT');
      await untilAbort(delay(Math.min(50, readinessMs)), signal);
    }
    const result = await untilAbort(Promise.resolve().then(() => task(port, signal)), signal);
    if (signal.aborted) throw new ContractError('INTERRUPTED');
    return result;
  } finally {
    buffer = '';
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    if (!await waitForClose(closed, 2000)) {
      child.kill('SIGKILL');
      if (!await waitForClose(closed, 2000)) throw new ContractError('CLEANUP_TIMEOUT');
    }
  }
}

export async function requestCase(port, item, signal = new AbortController().signal, timeoutMs = requestMs) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ContractError('LOOPBACK_TARGET');
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = AbortSignal.any([signal, timeout]);
  const query = item.request.query.toString();
  const prefer = `code=${item.status}${item.exampleName ? `, example=${item.exampleName}` : ''}`;
  try {
    const response = await new Promise((resolve, reject) => {
      // Native HTTP intentionally avoids environment proxies and redirects.
      const request = httpRequest({ hostname: host, port, method: item.request.method,
        path: `${item.request.route}${query ? `?${query}` : ''}`, signal: combined,
        headers: { ...item.request.headers, Prefer: prefer }, agent: false }, resolve);
      request.on('error', reject);
      request.end(item.request.body);
    });
    const chunks = [];
    let bytes = 0;
    try {
      for await (const chunk of response) {
        bytes += chunk.length;
        if (bytes > maxResponseBytes) throw new ContractError('RESPONSE_SIZE');
        chunks.push(chunk);
      }
      assertResponse(item, response.statusCode, response.headers['content-type'] ?? '', Buffer.concat(chunks).toString('utf8'));
    } finally { response.destroy(); }
  } catch (error) {
    if (signal.aborted) throw new ContractError('INTERRUPTED');
    if (timeout.aborted) throw new ContractError('REQUEST_TIMEOUT');
    if (error instanceof ContractError) throw error;
    throw new ContractError('REQUEST_FAILED');
  }
}

export async function assertTypeDrift(spec, savedTypes) {
  const generated = COMMENT_HEADER + astToString(await openapiTS(spec, { silent: true }));
  const sources = savedTypes ?? await Promise.all(['apps/web/src/api/openapi.ts', 'apps/mock-api/src/api/openapi.ts']
    .map((path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')));
  if (sources.length !== 2 || sources.some((source) => source !== generated)) {
    throw new ContractError('TYPE_DRIFT');
  }
}

export async function runContract(signal = AbortSignal.timeout(totalMs)) {
  const spec = JSON.parse(await readFile(new URL('../docs/openapi.json', import.meta.url), 'utf8'));
  const plan = buildPlan(spec); // All examples/refs/inputs validated BEFORE Prism requests.
  await untilAbort(assertTypeDrift(spec), signal); // In-memory only; never writes generated product types.
  const completed = new Set();
  await withPrism(async (port) => {
    process.stdout.write(`PRISM_READY:${port} (ephemeral loopback).\n`);
    for (const item of plan.cases) {
      try { await requestCase(port, item, signal); }
      catch (error) {
        // Only validated operationId + example label + status; no URL/query/body/headers.
        process.stderr.write(`Case ${item.id} failed.\n`);
        throw error;
      }
      completed.add(item.id);
    }
    assertCoverage(plan, completed);
  }, { signal });
  return { ...plan.stats, requests: completed.size };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  let exitSignal;
  const handlers = new Map(['SIGINT', 'SIGTERM'].map((name) => [name, () => {
    exitSignal = name;
    controller.abort();
  }]));
  for (const [name, handler] of handlers) process.on(name, handler);
  try {
    if (process.argv.length !== 2) throw new ContractError('CLI_ARGUMENTS');
    const stats = await runContract(AbortSignal.any([controller.signal, AbortSignal.timeout(totalMs)]));
    process.stdout.write(`Contract: ${stats.operations}/69 operations; ${stats.json}/67 JSON; ${stats.empty}/2 empty 204; ${stats.bodies}/26 media bodies; ${stats.variants}/32 selectable variants (${stats.variantCollections} collections); ${stats.errors} forced declared errors; ${stats.requests} HTTP checks; ${stats.schemaExamples} schema examples audited. Reviewed tuple inventory, license XOR and type drift checked.\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof ContractError ? error.message : 'Contract runner failed (details suppressed).'}\n`);
    process.exitCode = exitSignal === 'SIGINT' ? 130 : exitSignal === 'SIGTERM' ? 143 : 1;
  } finally {
    for (const [name, handler] of handlers) process.off(name, handler);
  }
}

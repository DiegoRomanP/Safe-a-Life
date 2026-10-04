import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildPlan, assertCoverage, assertResponse, schemaValidator } from './prism-contract.mjs';

const source = JSON.parse(await readFile(new URL('../docs/openapi.json', import.meta.url), 'utf8'));
const contract = () => structuredClone(source);

for (const substitution of ['path', 'method', 'operationId', 'swappedIds']) {
  test(`reviewed tuple inventory rejects ${substitution} substitution without changing cardinality`, () => {
    const spec = contract();
    if (substitution === 'path') {
      spec.paths['/health/replaced'] = spec.paths['/health/live'];
      delete spec.paths['/health/live'];
    } else if (substitution === 'method') {
      spec.paths['/health/live'].post = spec.paths['/health/live'].get;
      delete spec.paths['/health/live'].get;
    } else if (substitution === 'operationId') {
      spec.paths['/health/live'].get.operationId = 'getReplacement';
    } else {
      [spec.paths['/health/live'].get.operationId, spec.paths['/health/ready'].get.operationId] =
        [spec.paths['/health/ready'].get.operationId, spec.paths['/health/live'].get.operationId];
    }
    assert.throws(() => buildPlan(spec), { code: 'COVERAGE_INVENTORY' });
  });
}

test('schema example hidden by media variants still fails closed', () => {
  const spec = contract();
  spec.components.schemas.OwnInvitationsEnvelope.example = {};
  assert.throws(() => buildPlan(spec), { code: 'SCHEMA_EXAMPLE' });
});

test('schema example hidden by media example still fails closed', () => {
  const spec = contract();
  spec.components.schemas.HealthEnvelope.example = {};
  assert.throws(() => buildPlan(spec), { code: 'SCHEMA_EXAMPLE' });
});

test('schema examples arrays are all checked even beside a valid singular example', () => {
  const spec = contract();
  spec.components.schemas.OwnInvitationsEnvelope.examples = [
    structuredClone(spec.components.schemas.OwnInvitationsEnvelope.example), {},
  ];
  assert.throws(() => buildPlan(spec), { code: 'SCHEMA_EXAMPLE' });
});

test('deep schemas reached through refs validate each example against its own constraints', () => {
  const spec = contract();
  spec.components.schemas.ResponseHistoryItem.properties.changedAt.examples = ['2026-10-03T12:00:00Z', 'invalid'];
  assert.throws(() => buildPlan(spec), { code: 'SCHEMA_EXAMPLE' });
});

test('inline deep schema examples and unused component annotations are not silently skipped', () => {
  const spec = contract();
  spec.paths['/health/live'].get.responses['200'].content['application/json'].schema = {
    allOf: [{ $ref: '#/components/schemas/HealthEnvelope' }, {
      properties: { data: { properties: { status: { type: 'string', examples: [42] } } } },
    }],
  };
  assert.throws(() => buildPlan(spec), { code: 'SCHEMA_EXAMPLE' });
  const unused = contract();
  unused.components.schemas.UnusedExampleFixture = { type: 'integer', example: 'invalid' };
  assert.throws(() => buildPlan(unused), { code: 'SCHEMA_EXAMPLE' });
});

test('schema ref siblings retain constraints when their example is validated', () => {
  const spec = contract();
  spec.paths['/health/live'].get.responses['200'].content['application/json'].schema = {
    $ref: '#/components/schemas/HealthEnvelope',
    properties: { data: { properties: { status: { const: 'ok' } } } },
    example: { data: { status: 'ready' } },
  };
  assert.throws(() => buildPlan(spec), { code: 'SCHEMA_EXAMPLE' });
});

test('schema examples must be arrays; malformed annotation fails closed', () => {
  const spec = contract();
  spec.components.schemas.HealthEnvelope.examples = { data: { status: 'ok' } };
  assert.throws(() => buildPlan(spec), { code: 'SCHEMA_EXAMPLE' });
});

test('media example and examples are mutually exclusive on response and request', () => {
  const response = contract();
  response.paths['/api/v1/donors/me/invitations'].get.responses['200'].content['application/json'].example =
    structuredClone(response.components.schemas.OwnInvitationsEnvelope.example);
  assert.throws(() => buildPlan(response), { code: 'MEDIA_EXAMPLE_XOR' });
  const request = contract();
  const media = request.paths['/api/v1/auth/sessions'].post.requestBody.content['application/json'];
  media.examples = { default: { value: structuredClone(media.example) } };
  assert.throws(() => buildPlan(request), { code: 'MEDIA_EXAMPLE_XOR' });
});

test('unused media also fail closed on example/examples conflict', () => {
  const spec = contract();
  spec.components.responses.UnusedMediaFixture = { description: 'Synthetic fixture only', content: {
    'application/json': { schema: { $ref: '#/components/schemas/HealthEnvelope' },
      example: { data: { status: 'ok' } }, examples: { default: { value: { data: { status: 'ok' } } } } },
  } };
  assert.throws(() => buildPlan(spec), { code: 'MEDIA_EXAMPLE_XOR' });
});

test('valid schema annotations, literal example-like data and recursive refs do not alter media selection', () => {
  const baseline = buildPlan(contract());
  const spec = contract();
  spec.components.schemas.HealthEnvelope.example = { data: { status: 'ok' } };
  spec.components.schemas.HealthEnvelope.examples = [{ data: { status: 'ready' } }];
  spec.components.schemas.RecursiveFixture = {
    type: 'object', properties: { next: { $ref: '#/components/schemas/RecursiveFixture' } },
    additionalProperties: false, example: {}, examples: [{ next: {} }],
  };
  spec.components.schemas.LiteralFixture = {
    type: 'object', properties: { examples: { type: 'string' } }, required: ['examples'],
    example: { examples: 'synthetic literal data, not schema annotations' },
  };
  const plan = buildPlan(spec);
  assert.equal(plan.stats.schemaExamples, baseline.stats.schemaExamples + 5);
  assert.deepEqual(plan.cases.map((item) => item.id), baseline.cases.map((item) => item.id));
  assert.equal(plan.cases.every((item, index) =>
    JSON.stringify(item.example) === JSON.stringify(baseline.cases[index].example)), true);
});

test('TYPE_DRIFT rejects either changed type source and missing coverage without writing product files', async () => {
  const { assertTypeDrift } = await import('./test-prism-contract.mjs');
  assert.equal(typeof assertTypeDrift, 'function');
  const types = await Promise.all(['web', 'mock-api'].map((workspace) =>
    readFile(new URL(`../apps/${workspace}/src/api/openapi.ts`, import.meta.url), 'utf8')));
  await assertTypeDrift(contract(), types);
  for (const index of [0, 1]) {
    const changed = [...types];
    changed[index] += '\n// synthetic drift canary\n';
    await assert.rejects(assertTypeDrift(contract(), changed), { code: 'TYPE_DRIFT' });
  }
  await assert.rejects(assertTypeDrift(contract(), types.slice(0, 1)), { code: 'TYPE_DRIFT' });
});

test('preflight covers 69 operations, 67 JSON, 2 empty responses, 26 bodies and 32 selectable examples', () => {
  const plan = buildPlan(contract());
  assert.equal(plan.stats.operations, 69);
  assert.equal(plan.stats.json, 67);
  assert.equal(plan.stats.empty, 2);
  assert.equal(plan.stats.bodies, 26);
  assert.equal(plan.stats.variants, 32);
  assert.equal(plan.stats.variantCollections, 15);
  assert.equal(plan.stats.errors, 268);
  assert.equal(plan.cases.length, 369);
  assertCoverage(plan, new Set(plan.cases.map((item) => item.id)));
});

test('runner rejects a missing operation and a missing executed case rather than reporting partial success', () => {
  const spec = contract();
  delete spec.paths['/health/live'];
  assert.throws(() => buildPlan(spec), { code: 'COVERAGE_INVENTORY' });
  const plan = buildPlan(contract());
  const seen = new Set(plan.cases.map((item) => item.id));
  seen.delete(plan.cases[0].id);
  assert.throws(() => assertCoverage(plan, seen), { code: 'COVERAGE_EXECUTION' });
  seen.add('unplanned');
  assert.throws(() => assertCoverage(plan, seen), { code: 'COVERAGE_EXECUTION' });
  const missingError = contract();
  delete missingError.paths['/health/live'].get.responses['500'];
  assert.throws(() => buildPlan(missingError), { code: 'COVERAGE_INVENTORY' });
});

test('runner validates all media bodies before requests, including formats and unknown fields', () => {
  for (const body of [undefined, {}, { email: 'invalid', password: 'synthetic-demo-only' },
    { email: 'donante.demo@example.test', password: 'synthetic-demo-only', hospitalId: 'forged' }]) {
    const spec = contract();
    spec.paths['/api/v1/auth/sessions'].post.requestBody.content['application/json'].example = body;
    assert.throws(() => buildPlan(spec), { code: 'REQUEST_EXAMPLE' });
  }
});

test('runner rejects invalid selectable and error examples, never includes their values in diagnostic', () => {
  const spec = contract();
  const media = spec.paths['/api/v1/donors/me/invitations'].get.responses['200'].content['application/json'];
  media.examples.vacio.value = { secretCanary: 'synthetic-private-canary' };
  assert.throws(() => buildPlan(spec), (error) => error.code === 'RESPONSE_EXAMPLE'
    && !error.message.includes('synthetic-private-canary') && !error.message.includes('secretCanary'));
  const errors = contract();
  errors.components.responses.Unauthorized.content['application/json'].example.error.correlationId = '';
  assert.throws(() => buildPlan(errors), { code: 'RESPONSE_EXAMPLE' });
});

test('runner rejects unresolved/external refs and contradictory OAS 3.1 license', () => {
  for (const ref of ['#/components/schemas/Missing', 'https://untrusted.example/schema.json']) {
    const spec = contract();
    spec.paths['/health/live'].get.responses['200'].content['application/json'].schema.$ref = ref;
    assert.throws(() => buildPlan(spec), { code: 'LOCAL_REF' });
  }
  const spec = contract();
  spec.info.license.url = 'https://example.test/license';
  assert.throws(() => buildPlan(spec), { code: 'LICENSE_XOR' });
});

test('synthetic parameters, query and security are validated, unsupported inputs fail closed', () => {
  const spec = contract();
  spec.components.parameters.Limit.schema = { type: 'integer', minimum: 101, maximum: 100 };
  assert.throws(() => buildPlan(spec), { code: 'PARAMETER_INPUT' });
  const security = contract();
  security.paths['/health/live'].get.security = [{ missingScheme: [] }];
  assert.throws(() => buildPlan(security), { code: 'SECURITY_INPUT' });
  const plan = buildPlan(contract());
  assert.equal(plan.cases.some((item) => item.request.query.has('limit')), true);
  assert.equal(plan.cases.some((item) => item.request.query.has('cursor')), true);
  assert.equal(plan.cases.some((item) => item.request.headers.Cookie), true);
  assert.equal(plan.cases.some((item) => item.request.headers['X-CSRF-Token']), true);
});

test('schema validator enforces JSON Schema 2020-12 prefixItems and unevaluatedProperties', () => {
  const validate = schemaValidator(contract());
  const tuple = validate({ type: 'array', prefixItems: [{ const: 'demo' }], items: false });
  assert.equal(tuple(['demo']), true);
  assert.equal(tuple(['demo', 'extra']), false);
  const object = validate({ allOf: [{ properties: { demo: { type: 'string' } } }], unevaluatedProperties: false });
  assert.equal(object({ demo: 'synthetic' }), true);
  assert.equal(object({ demo: 'synthetic', extra: true }), false);
});

test('response checks reject wrong status/schema, nonempty 204 and wrong selectable example', () => {
  const plan = buildPlan(contract());
  const json = plan.cases.find((item) => item.kind === 'success' && item.status === 200);
  assert.throws(() => assertResponse(json, 201, 'application/json', JSON.stringify(json.example)), { code: 'RESPONSE_STATUS' });
  assert.throws(() => assertResponse(json, 200, 'application/json', '{}'), { code: 'RESPONSE_SCHEMA' });
  assert.throws(() => assertResponse(json, 200, 'text/html', 'synthetic'), { code: 'RESPONSE_MEDIA' });
  assert.throws(() => assertResponse(json, 200, 'application/json', '{'), { code: 'RESPONSE_JSON' });
  const empty = plan.cases.find((item) => item.status === 204);
  assertResponse(empty, 204, '', '');
  assert.throws(() => assertResponse(empty, 204, '', ' '), { code: 'RESPONSE_EMPTY' });
  const variant = plan.cases.find((item) => item.kind === 'variant');
  assert.throws(() => assertResponse(variant, variant.status, 'application/json', '{}'), { code: 'RESPONSE_SCHEMA' });
  assertResponse(json, json.status, 'application/json; charset=utf-8', JSON.stringify(json.example));
  const other = { ...json.example, data: { status: json.example.data.status === 'ok' ? 'ready' : 'ok' } };
  assert.throws(() => assertResponse(json, json.status, 'application/json', JSON.stringify(other)),
    { code: 'RESPONSE_EXAMPLE_SELECTION' });
});

test('real Prism cleanup releases ephemeral loopback port after failure, abort and readiness timeout', { timeout: 30_000 }, async () => {
  const { withPrism } = await import('./test-prism-contract.mjs');
  let port;
  await assert.rejects(withPrism(async (assignedPort) => {
    port = assignedPort;
    throw new Error('synthetic failure');
  }), /synthetic failure/);
  const probe = createServer();
  probe.listen(port, '127.0.0.1');
  await once(probe, 'listening');
  await new Promise((resolve) => probe.close(resolve));
  const controller = new AbortController();
  await assert.rejects(withPrism(async () => { controller.abort(); }, { signal: controller.signal }),
    { code: 'INTERRUPTED' });
  await assert.rejects(withPrism(async () => assert.fail('must not reach request phase'), { readinessMs: 1 }),
    { code: 'READINESS_TIMEOUT' });
});

test('per-request and total cancellation bound slow body reads and refuse non-loopback targets', { timeout: 5_000 }, async () => {
  const { requestCase } = await import('./test-prism-contract.mjs');
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{'); // Headers arrive, body intentionally never completes.
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const item = buildPlan(contract()).cases[0];
  try {
    await assert.rejects(requestCase(port, item, undefined, 30), { code: 'REQUEST_TIMEOUT' });
    await assert.rejects(requestCase(port, item, AbortSignal.timeout(30), 1000), { code: 'INTERRUPTED' });
    await assert.rejects(requestCase('https://untrusted.example', item), { code: 'LOOPBACK_TARGET' });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('CLI SIGINT/SIGTERM close the real Prism child before exit and print no sensitive evidence', { timeout: 20_000 }, async () => {
  const { waitForClose } = await import('./test-prism-contract.mjs');
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./test-prism-contract.mjs', import.meta.url))],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    const closed = once(child, 'close');
    let output = '';
    let timer;
    try {
      const port = await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('CLI readiness timeout')), 7000);
        child.once('error', reject);
        child.stdout.on('data', (chunk) => {
          output += chunk;
          const ready = output.match(/PRISM_READY:(\d+)/);
          if (ready) resolve(Number(ready[1]));
        });
      });
      child.stderr.on('data', (chunk) => { output += chunk; });
      child.kill(signal);
      assert.equal(await waitForClose(closed, 5000), true);
      const result = await closed;
      assert.equal(result[0], code);
      assert.equal(/example\.test|synthetic-contract|http:\/\/|Cookie|CSRF|\?/.test(output), false);
      const probe = createServer();
      probe.listen(port, '127.0.0.1');
      await once(probe, 'listening');
      await new Promise((resolve) => probe.close(resolve));
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      if (!await waitForClose(closed, 2000)) {
        child.kill('SIGKILL');
        assert.equal(await waitForClose(closed, 2000), true);
      }
    }
  }
});

test('CLI refuses target/spec overrides without launching a public server', { timeout: 6000 }, () => {
  const result = spawnSync(process.execPath,
    [fileURLToPath(new URL('./test-prism-contract.mjs', import.meta.url)), '--host', '0.0.0.0'],
    { timeout: 5000, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim(), 'Contract runner: CLI_ARGUMENTS.');
});

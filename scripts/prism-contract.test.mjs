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

// Final inventory manually reviewed in R1c, not derived from the candidate:
// 69 + 1 sites GET; 32 + 2 GET variants; 268 + 4 GET errors + 1 DELETE 400.
// Moderation replaces its singular response example; it adds no media variant.
const finalReviewedPreflight = Object.freeze({
  operations: 71, json: 69, empty: 2, bodies: 26, variants: 34,
  variantCollections: 16, errors: 322, cases: 427,
});

test('preflight covers reviewed final 71 operations, 69 JSON, 2 empty, 26 bodies, 34 variants, 16 collections, 322 errors and 427 cases', () => {
  const plan = buildPlan(contract());
  for (const [field, expected] of Object.entries(finalReviewedPreflight)) {
    assert.equal(field === 'cases' ? plan.cases.length : plan.stats[field], expected, `reviewed final inventory: ${field}`);
  }
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

// E1 regressions inspect the actual draft canon, not a corrected test copy.
// Schema/document assertions do NOT prove server authorization, grant enforcement,
// RLS, audit redaction or transitions. No GET->review / POST->execute mapping is assumed.
const apiRules = await readFile(new URL('../docs/Api-Rules.md', import.meta.url), 'utf8');

function canonicalNode(node, label, spec = source) {
  const seen = new Set();
  while (node?.$ref) {
    assert.equal(node.$ref.startsWith('#/'), true, `${label}: local reference required`);
    assert.equal(seen.has(node.$ref), false, `${label}: reference cycle`);
    seen.add(node.$ref);
    node = node.$ref.slice(2).split('/').reduce((value, key) =>
      value?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], spec);
  }
  assert.equal(Boolean(node), true, `${label}: canonical declaration missing`);
  return node;
}

function canonicalOperation(path, method, criterion, spec = source) {
  return canonicalNode(spec.paths[path]?.[method], `${criterion} ${method} operation`, spec);
}

function operationParameters(path, method, criterion) {
  const operation = canonicalOperation(path, method, criterion);
  return [...(source.paths[path].parameters ?? []), ...(operation.parameters ?? [])]
    .map((parameter) => canonicalNode(parameter, `${criterion} parameter`));
}

function responseMedia(operation, status, criterion, spec = source) {
  const response = canonicalNode(operation.responses?.[status], `${criterion} response ${status}`, spec);
  return canonicalNode(response.content?.['application/json'], `${criterion} JSON media ${status}`, spec);
}

function mediaExamples(media) {
  if (Object.hasOwn(media, 'example')) return [media.example];
  if (media.examples) return Object.values(media.examples)
    .map((example) => canonicalNode(example, 'media example').value);
  const schema = canonicalNode(media.schema, 'example schema');
  return [...(Object.hasOwn(schema, 'example') ? [schema.example] : []), ...(schema.examples ?? [])];
}

function closedShape(schema, fields, required = fields, spec = source) {
  const node = canonicalNode(schema, 'closed DTO', spec);
  assert.equal(node.type, 'object');
  assert.equal(node.additionalProperties, false, 'DTO must reject extra fields');
  assert.deepEqual(Object.keys(node.properties ?? {}).sort(), [...fields].sort(), 'DTO allowlist');
  assert.deepEqual([...(node.required ?? [])].sort(), [...required].sort(), 'DTO required fields');
  return node;
}

function assertValid(valid, value, label) {
  // Only boolean outcomes reach diagnostics; never include the synthetic payload.
  assert.equal(valid(value), true, `${label}: canonical schema must accept the valid control`);
}

function assertInvalidCases(valid, values, label) {
  for (const [index, value] of values.entries()) {
    assert.equal(valid(value), false, `${label}: reject negative case ${index + 1}`);
  }
}

function querySchema(parameters) {
  // This checks the typed declaration, NOT HTTP query parsing. Wire strings
  // such as expectedVersion=0 are legitimate; parsing/coercion belongs to the API.
  const query = parameters.filter((parameter) => parameter.in === 'query');
  return { type: 'object', additionalProperties: false,
    properties: Object.fromEntries(query.map((parameter) => [parameter.name, parameter.schema])),
    required: query.filter((parameter) => parameter.required).map((parameter) => parameter.name) };
}

function contractText(...values) {
  return values.filter((value) => typeof value === 'string').join(' ')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function assertClaims(text, claims, criterion) {
  for (const [label, pattern] of claims) {
    assert.equal(pattern.test(text), true, `${criterion}: contract must describe ${label}`);
  }
}

function assertUniformErrors(operation, statuses, criterion) {
  for (const status of statuses) {
    const media = responseMedia(operation, status, criterion);
    assert.equal(media.schema?.$ref, '#/components/schemas/ErrorResponse', `${criterion}: uniform ${status}`);
    const valid = schemaValidator(source)(media.schema);
    const value = { error: { code: 'SYNTHETIC_ERROR', message: 'Error de ejemplo.', correlationId: 'qa-opaque' } };
    assertValid(valid, value, criterion);
    assertInvalidCases(valid, [{ ...value, details: {} }, { error: { ...value.error, name: 'Canario sintético' } },
      { error: { code: 'SYNTHETIC_ERROR', message: 'Error de ejemplo.' } }], criterion);
    for (const example of mediaExamples(media)) assertValid(valid, example, `${criterion} error example`);
  }
}

test('C1 moderation enum is exactly suspended or unpublished, never published', () => {
  const schema = source.components.schemas.ModerateRecognitionPolicyRequest;
  assert.deepEqual(schema.properties.status.enum.slice().sort(), ['sin_publicar', 'suspendida']);
});

test('C1 lifting suspension accepts sin_publicar and suspension accepts suspendida', () => {
  const valid = schemaValidator(source)({ $ref: '#/components/schemas/ModerateRecognitionPolicyRequest' });
  for (const status of ['suspendida', 'sin_publicar']) {
    assertValid(valid, { status, reason: 'Motivo sintético QA.', expectedVersion: 0 }, 'C1');
  }
});

test('C1 moderation rejects republication and unknown statuses', () => {
  const valid = schemaValidator(source)({ $ref: '#/components/schemas/ModerateRecognitionPolicyRequest' });
  assertValid(valid, { status: 'suspendida', reason: 'Motivo sintético QA.', expectedVersion: 0 }, 'C1');
  assertInvalidCases(valid, ['publicada', 'activa', 'SUSPENDIDA', '', null].map((status) =>
    ({ status, reason: 'Motivo sintético QA.', expectedVersion: 0 })), 'C1 status');
});

test('C1 moderation remains closed with required reason and nonnegative integer version', () => {
  closedShape(source.components.schemas.ModerateRecognitionPolicyRequest, ['status', 'reason', 'expectedVersion']);
  const valid = schemaValidator(source)({ $ref: '#/components/schemas/ModerateRecognitionPolicyRequest' });
  const value = { status: 'suspendida', reason: 'x', expectedVersion: 0 };
  assertValid(valid, value, 'C1');
  assertValid(valid, { ...value, reason: 'x'.repeat(300), expectedVersion: 1 }, 'C1 bounds');
  assertInvalidCases(valid, [{ ...value, hospitalId: 'untrusted-selector' }, { ...value, reason: '' },
    { ...value, reason: 'x'.repeat(301) }, { ...value, expectedVersion: -1 }, { ...value, expectedVersion: 0.5 },
    { ...value, expectedVersion: '0' }, { status: 'suspendida', reason: 'x' }], 'C1 input');
});

test('C1 moderation response and its examples cannot promise republication', () => {
  const operation = canonicalOperation('/api/v1/superadmin/recognition-policies/{hospitalId}/moderation', 'patch', 'C1');
  const media = responseMedia(operation, '200', 'C1');
  const valid = schemaValidator(source)(media.schema);
  const value = structuredClone(source.components.schemas.RecognitionPolicyEnvelope.example);
  for (const status of ['suspendida', 'sin_publicar']) assertValid(valid, { data: { ...value.data, status } }, 'C1 response');
  assertInvalidCases(valid, [{ data: { ...value.data, status: 'publicada' } }], 'C1 response');
  const examples = mediaExamples(media);
  assert.equal(examples.length > 0, true, 'C1: moderation needs a specialized response example');
  for (const example of examples) {
    assertValid(valid, example, 'C1 response example');
    assert.equal(['suspendida', 'sin_publicar'].includes(example.data.status), true, 'C1 example must not republish');
  }
});

test('C2 policy DELETE declares required typed integer expectedVersion query with minimum zero', () => {
  const parameters = operationParameters('/api/v1/hospitals/me/recognition-policy', 'delete', 'C2');
  const versions = parameters.filter((parameter) => parameter.name === 'expectedVersion');
  assert.equal(versions.length, 1, 'C2: missing or duplicate expectedVersion query');
  assert.equal(versions[0].in, 'query');
  assert.equal(versions[0].required, true);
  assert.equal(versions[0].schema.type, 'integer');
  assert.equal(versions[0].schema.minimum, 0);
});

test('C2 typed DELETE query declaration rejects omitted, negative, fractional and unparsed string versions, not HTTP wire strings', () => {
  const parameters = operationParameters('/api/v1/hospitals/me/recognition-policy', 'delete', 'C2');
  const valid = schemaValidator(source)(querySchema(parameters));
  assertValid(valid, { expectedVersion: 0 }, 'C2 zero version');
  assertValid(valid, { expectedVersion: 2 }, 'C2 positive version');
  assertInvalidCases(valid, [{}, { expectedVersion: -1 }, { expectedVersion: 0.5 }, { expectedVersion: '0' },
    { expectedVersion: null }, { expectedVersion: 0, hospitalId: 'untrusted-selector' }], 'C2 typed version declaration');
});

test('C2 policy DELETE preserves idempotency, cookie CSRF, empty 204 and conflict 409', () => {
  const path = '/api/v1/hospitals/me/recognition-policy';
  const operation = canonicalOperation(path, 'delete', 'C2');
  const key = operationParameters(path, 'delete', 'C2').find((parameter) => parameter.name === 'Idempotency-Key');
  assert.equal(key?.in, 'header');
  assert.equal(key?.required, true);
  assertCookieCsrfSecurity(operation.security ?? source.security);
  const empty = canonicalNode(operation.responses['204'], 'C2 empty response');
  assert.equal(Object.hasOwn(empty, 'content'), false, 'C2 204 must have no JSON body');
  assertResponse({ status: 204 }, 204, '', '');
  assert.throws(() => assertResponse({ status: 204 }, 204, 'application/json', '{}'), { code: 'RESPONSE_EMPTY' });
  assertUniformErrors(operation, ['401', '403', '409'], 'C2');
});

function assertCookieCsrfSecurity(security) {
  assert.equal(Array.isArray(security) && security.length > 0, true, 'C2 security alternatives must be nonempty');
  assert.equal(security.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    && Object.hasOwn(entry, 'sessionCookie') && Object.hasOwn(entry, 'csrfToken')), true,
  'C2 every OR alternative must require both sessionCookie and csrfToken');
}

for (const [name, alternative] of [['anonymous', {}], ['cookie-only', { sessionCookie: [] }]]) {
  test(`E1d countermutation security rejects an OR ${name} alternative beside a conforming control`, () => {
    const control = [{ sessionCookie: [], csrfToken: [] }];
    assertCookieCsrfSecurity(control);
    assert.throws(() => assertCookieCsrfSecurity([...control, alternative]), { code: 'ERR_ASSERTION' });
  });
}

test('E1d countermutation security rejects an empty alternatives list after a conforming control', () => {
  assertCookieCsrfSecurity([{ sessionCookie: [], csrfToken: [] }]);
  assert.throws(() => assertCookieCsrfSecurity([]), { code: 'ERR_ASSERTION' });
});

test('C2 malformed DELETE query uses uniform 400, not a resource-specific error body', () => {
  assertUniformErrors(canonicalOperation('/api/v1/hospitals/me/recognition-policy', 'delete', 'C2'), ['400'], 'C2');
});

function ownSitesMedia() {
  return responseMedia(canonicalOperation('/api/v1/hospitals/me/sites', 'get', 'C3'), '200', 'C3');
}

test('C3 own sites GET declares session, AAL2, current membership and server-derived active ownership', () => {
  const operation = canonicalOperation('/api/v1/hospitals/me/sites', 'get', 'C3');
  assert.equal(operation.operationId, 'listOwnHospitalSites');
  assert.equal((operation.security ?? source.security).every((entry) => Object.hasOwn(entry, 'sessionCookie')), true);
  assert.equal((operation.security ?? source.security).length > 0, true);
  assertClaims(contractText(operation.summary, operation.description), [
    ['AAL2', /aal2/], ['current membership', /membresia.*vigent|vigent.*membresia/],
    ['server identity', /identidad|servidor/], ['institution ownership', /propia|institucion|hospital/],
    ['only active sites', /activas/], ['creation-time revalidation', /revalid|volver.*valid|valid.*nuevamente/],
  ], 'C3');
});

test('C3 own sites output is closed at envelope, page and minimal site levels', () => {
  const envelope = closedShape(ownSitesMedia().schema, ['data']);
  const page = closedShape(envelope.properties.data, ['items', 'pagination']);
  const item = closedShape(page.properties.items.items, ['siteId', 'publicName']);
  assert.equal(item.properties.siteId.type, 'string');
  assert.equal(item.properties.siteId.format, 'uuid');
  assert.equal(item.properties.publicName.type, 'string');
  assert.equal(item.properties.publicName.minLength, 1);
  assert.equal(item.properties.publicName.maxLength, 160);
  assert.equal(page.properties.pagination.$ref, '#/components/schemas/Pagination');
  const valid = schemaValidator(source)(ownSitesMedia().schema);
  const itemValue = { siteId: '00000000-0000-4000-8000-000000000003', publicName: 'Sede sintética QA' };
  const value = { data: { items: [itemValue], pagination: { nextCursor: null } } };
  assertValid(valid, value, 'C3 minimal site');
  assertValid(valid, { data: { items: [{ ...itemValue, publicName: 'x'.repeat(160) }], pagination: { nextCursor: 'x'.repeat(512) } } }, 'C3 limits');
  assertInvalidCases(valid, [{ ...value, hospitalId: itemValue.siteId }, { data: { ...value.data, hospitalId: itemValue.siteId } },
    { data: { ...value.data, items: [{ ...itemValue, publicAddress: 'Dato excluido' }] } },
    ...['hospitalId', 'isActive', 'isApproved', 'email', 'latitude'].map((field) =>
      ({ data: { ...value.data, items: [{ ...itemValue, [field]: 'Dato excluido' }] } })),
    ...[{ publicName: 'Sede QA' }, { siteId: itemValue.siteId }, { ...itemValue, siteId: 'invalid' },
      { ...itemValue, publicName: '' }, { ...itemValue, publicName: 'x'.repeat(161) }].map((item) =>
      ({ data: { ...value.data, items: [item] } })),
    { data: { items: [] } }, { data: { items: [], pagination: { nextCursor: null, email: 'canary@example.test' } } },
    { data: { items: [], pagination: { nextCursor: 'x'.repeat(513) } } }], 'C3 closed page');
});

test('C3 typed sites query declaration reuses only limit and cursor without client institution selectors, not HTTP parsing', () => {
  const path = '/api/v1/hospitals/me/sites';
  const operation = canonicalOperation(path, 'get', 'C3');
  const parameters = operationParameters(path, 'get', 'C3');
  assert.deepEqual(parameters.map(({ in: location, name }) => `${location}:${name}`).sort(), ['query:cursor', 'query:limit']);
  assert.equal(Object.hasOwn(operation, 'requestBody'), false);
  const valid = schemaValidator(source)(querySchema(parameters));
  assertValid(valid, {}, 'C3 default page');
  assertValid(valid, { limit: 1 }, 'C3 minimum limit');
  assertValid(valid, { limit: 100, cursor: 'x'.repeat(512) }, 'C3 maximum page');
  assertInvalidCases(valid, [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: '1' },
    { cursor: 'x'.repeat(513) }, { hospitalId: 'untrusted-selector' }, { role: 'superadmin' }], 'C3 query declaration');
});

test('C3 sites examples cover an empty list and a paginated minimal site without extra fields', () => {
  const media = ownSitesMedia();
  const examples = mediaExamples(media);
  const valid = schemaValidator(source)(media.schema);
  assert.equal(examples.some((example) => example?.data?.items?.length === 0), true, 'C3 empty example missing');
  assert.equal(examples.some((example) => example?.data?.items?.length > 0), true, 'C3 page example missing');
  for (const example of examples) assertValid(valid, example, 'C3 example');
});

test('C3 sites declare uniform 400, 401, 403, 500 and 503 errors', () => {
  const operation = canonicalOperation('/api/v1/hospitals/me/sites', 'get', 'C3');
  assert.deepEqual(Object.keys(operation.responses).sort(), ['200', '400', '401', '403', '500', '503']);
  assertUniformErrors(operation, ['400', '401', '403', '500', '503'], 'C3');
});

function contextualSchema(spec = source) {
  const operation = canonicalOperation('/api/v1/superadmin/correction-requests/{requestId}/donor-data', 'get', 'C4', spec);
  const schema = responseMedia(operation, '200', 'C4', spec).schema;
  assert.equal(schema?.$ref, '#/components/schemas/ContextualDonorDataEnvelope', 'C4 effective GET 200 must bind the reviewed DTO');
  return schema; // Validate the actual response, including any $ref sibling constraints.
}

function contextualPage(spec = source) {
  const envelope = closedShape(contextualSchema(spec), ['data'], ['data'], spec);
  return closedShape(envelope.properties.data, ['currentValues', 'proposedValues'], ['currentValues', 'proposedValues'], spec);
}

function assertContextualOutput(spec = source) {
  const page = contextualPage(spec);
  for (const name of ['currentValues', 'proposedValues']) {
    const projection = closedShape(page.properties[name], ['name', 'email', 'declaredBloodType'], [], spec);
    assert.equal(projection.properties.name.type, 'string');
    assert.equal(projection.properties.name.maxLength, 120);
    assert.equal(projection.properties.email.type, 'string');
    assert.equal(projection.properties.email.format, 'email');
    assert.equal(projection.properties.email.maxLength, 254);
    assert.deepEqual(canonicalNode(projection.properties.declaredBloodType, 'C4 blood enum', spec).enum,
      spec.components.schemas.BloodType.enum);
  }
  const valid = schemaValidator(spec)(contextualSchema(spec));
  const control = { data: { currentValues: {}, proposedValues: {} } };
  assertValid(valid, control, 'C4 effective response control');
  assertInvalidCases(valid, [{ data: {} }, { ...control, donorId: 'canary-opaque' },
    { data: { ...control.data, donorId: 'canary-opaque' } }], 'C4 effective response closure');
}

test('C4 contextual output requires separate closed current and proposed allowlisted projections', () => {
  assertContextualOutput();
});

function contextualControl() {
  // Conforming synthetic control for helper tests ONLY; canonical C4 tests above
  // and below always read source unchanged, even when it is already defective.
  const spec = contract();
  const projection = { type: 'object', additionalProperties: false, properties: {
    name: { type: 'string', maxLength: 120 },
    email: { type: 'string', format: 'email', maxLength: 254 },
    declaredBloodType: { $ref: '#/components/schemas/BloodType' },
  } };
  spec.components.schemas.ContextualDonorDataEnvelope = {
    type: 'object', additionalProperties: false, required: ['data'], properties: { data: {
      type: 'object', additionalProperties: false, required: ['currentValues', 'proposedValues'],
      properties: { currentValues: structuredClone(projection), proposedValues: structuredClone(projection) },
    } },
  };
  return spec;
}

for (const replacement of ['flattened', 'expanded']) {
  test(`E1d countermutation contextual 200 rejects ${replacement} schema with correct component intact`, () => {
    const control = contextualControl();
    assertContextualOutput(control);
    const changed = structuredClone(control);
    const media = responseMedia(canonicalOperation('/api/v1/superadmin/correction-requests/{requestId}/donor-data', 'get', 'C4', changed), '200', 'C4', changed);
    media.schema = replacement === 'flattened'
      ? { type: 'object', additionalProperties: false, required: ['data'], properties: {
        data: structuredClone(control.components.schemas.ContextualDonorDataEnvelope.properties.data.properties.currentValues),
      } }
      : { ...structuredClone(control.components.schemas.ContextualDonorDataEnvelope), additionalProperties: true };
    assert.deepEqual(changed.components.schemas.ContextualDonorDataEnvelope, control.components.schemas.ContextualDonorDataEnvelope);
    const leak = replacement === 'flattened' ? { data: { name: 'Canario sintético' } }
      : { data: { currentValues: {}, proposedValues: {} }, donorId: 'canary-opaque' };
    assertValid(schemaValidator(changed)(media.schema), leak, 'C4 mutated schema leak control');
    assert.throws(() => assertContextualOutput(changed), { code: 'ERR_ASSERTION' });
  });
}

test('C4 empty proposedValues remains valid when there is no proposal, including deletion', () => {
  const valid = schemaValidator(source)(contextualSchema());
  assertValid(valid, { data: { currentValues: { name: 'Donante sintético QA' }, proposedValues: {} } }, 'C4 no proposal');
  assertValid(valid, { data: { currentValues: {}, proposedValues: {} } }, 'C4 optional field projections');
});

test('C4 contextual output rejects missing, flattened, null or non-object projections', () => {
  const valid = schemaValidator(source)(contextualSchema());
  assertValid(valid, { data: { currentValues: {}, proposedValues: {} } }, 'C4 complete envelope');
  assertInvalidCases(valid, [{ data: {} }, { data: { currentValues: {} } }, { data: { proposedValues: {} } },
    { data: { name: 'Donante sintético QA' } }, { data: { currentValues: null, proposedValues: {} } },
    { data: { currentValues: {}, proposedValues: [] } }], 'C4 required projections');
});

for (const projection of ['currentValues', 'proposedValues']) {
  test(`C4 ${projection} preserves optional fields, email format, blood enum and length limits`, () => {
    const valid = schemaValidator(source)(contextualSchema());
    const value = (fields) => ({ data: { currentValues: {}, proposedValues: {}, [projection]: fields } });
    assertValid(valid, value({}), 'C4 optional fields');
    for (const fields of [{ name: 'x'.repeat(120) }, { email: 'qa.donor@example.test' },
      ...source.components.schemas.BloodType.enum.map((declaredBloodType) => ({ declaredBloodType }))]) {
      assertValid(valid, value(fields), 'C4 field control');
    }
    assertInvalidCases(valid, [{ name: 'x'.repeat(121) }, { name: null }, { email: 'invalid' },
      { email: `${'x'.repeat(255)}@example.test` }, { declaredBloodType: 'O+' },
      { declaredBloodType: null }, { approximateLocation: {} }, { isAvailable: true },
      { donorId: 'untrusted-id' }, { phone: 'Dato excluido' }].map(value), 'C4 projection allowlist');
  });
}

test('C4 contextual envelope rejects extra fields outside either authorized projection', () => {
  const valid = schemaValidator(source)(contextualSchema());
  const value = { data: { currentValues: {}, proposedValues: {} } };
  assertValid(valid, value, 'C4 closed envelope');
  assertInvalidCases(valid, [{ ...value, email: 'canary@example.test' }, { data: { ...value.data, name: 'Canario sintético' } },
    { data: { ...value.data, grantId: 'untrusted-id' } }], 'C4 envelope levels');
});

test('C4 contract binds both projections to a live actor-request-donor-action-fields grant without inventing action mapping', () => {
  const operation = canonicalOperation('/api/v1/superadmin/correction-requests/{requestId}/donor-data', 'get', 'C4');
  const parameters = operationParameters('/api/v1/superadmin/correction-requests/{requestId}/donor-data', 'get', 'C4');
  const grant = parameters.find((parameter) => parameter.name === 'X-Contextual-Grant');
  assert.equal(grant?.required, true);
  assert.equal(grant?.in, 'header');
  const envelope = source.components.schemas.ContextualDonorDataEnvelope;
  assertProjectionGrants(operation.description, envelope.description, envelope.properties.data.description);
});

function documentClauses(...descriptions) {
  // Keep sentence/semicolon/paragraph boundaries and independent descriptions.
  // Soft-wrapped Markdown lines stay together; unrelated clauses cannot donate keywords.
  return descriptions.filter((text) => typeof text === 'string').flatMap((text) =>
    contractText(text).replace(/`/g, '').split(/[.;]|\n\s*\n|\n\s*(?=[-#|])/).map((clause) => clause.trim()));
}

function assertProjectionGrants(...descriptions) {
  const clauses = documentClauses(...descriptions);
  for (const projection of ['currentvalues', 'proposedvalues']) {
    const other = projection === 'currentvalues' ? 'proposedvalues' : 'currentvalues';
    const subject = `\\b${projection}\\b(?:\\s*(?:y|and|,)\\s*${other})?`;
    const restrictedGrant = new RegExp(`${subject}\\s+(?:(?:esta[n]?|queda[n]?)\\s+)?(?:se limita[n]?|limitad[ao]s?|restringid[ao]s?|sujet[ao]s?)\\b[\\s\\S]*?\\bgrant\\b([\\s\\S]*)`);
    // Denial/exemption of this projection's grant is a contradiction anywhere,
    // even beside a valid affirmative clause. A field exclusion is not a denial.
    const deniedGrant = new RegExp(`${subject}\\s+(?:no\\s+(?:(?:esta[n]?|queda[n]?)\\s+)?(?:se limita[n]?|limitad[ao]s?|restringid[ao]s?|sujet[ao]s?|ligad[ao]s?|vinculad[ao]s?)|(?:esta[n]?|queda[n]?)\\s+exent[ao]s?)[\\s\\S]*?\\bgrant\\b`);
    const exceptedProjection = new RegExp(`\\b(?:excepto|salvo)\\s+${projection}\\b`);
    const negatedScope = /\bno\s+(?:(?:esta[n]?|es)\s+)?(?:vigente|ligad[ao]|vinculad[ao]|acotad[ao])\b|\bsin\s+(?:vinculo|grant)\b/;
    assert.equal(clauses.some((clause) => deniedGrant.test(clause)
      || (/\bgrant\b/.test(clause) && exceptedProjection.test(clause))
      || negatedScope.test(clause.match(restrictedGrant)?.[1] ?? '')), false,
    `C4 ${projection}: no explicit grant contradiction or exception permitted`);
    const affirmativeBinding = clauses.some((clause) => {
      const grant = clause.match(restrictedGrant)?.[1];
      if (!grant || !/\bvigente\b/.test(grant)) return false;
      const boundScope = grant.match(/\b(?:ligad[ao]|vinculad[ao]|acotad[ao])\b([\s\S]*)/)?.[1];
      return Boolean(boundScope) && [/\b(?:superadmin|actor)\b/, /\b(?:solicitud|request)\b/,
        /\b(?:donante|donor|usuario)\b/, /\b(?:accion|action)\b/, /\b(?:campos|fields|allowedfields)\b/]
        .every((pattern) => pattern.test(boundScope));
    });
    assert.equal(affirmativeBinding, true, `C4 ${projection}: affirmative same-clause live grant actor/request/donor/action/fields binding required`);
  }
}

for (const projection of ['currentValues', 'proposedValues']) {
  for (const mutation of ['negation', 'unbound']) {
    test(`E1d countermutation grant rejects ${mutation} of ${projection} despite global binding words`, () => {
      const clause = (name) => `${name} se limita al grant vigente ligado al actor superadmin, solicitud, donante, acción concreta y campos autorizados.`;
      const control = ['currentValues', 'proposedValues'].map(clause);
      assertProjectionGrants(...control);
      assertProjectionGrants('currentValues y proposedValues se limitan al grant vigente ligado al actor superadmin, solicitud, donante, acción concreta y campos autorizados.');
      const replacements = mutation === 'negation' ? [clause(projection).replace('se limita', 'no se limita')]
        : [`${projection} se expone libremente.`, ...['actor superadmin, ', 'solicitud, ', 'donante, ',
          'acción concreta y ', 'campos autorizados', 'vigente ', 'ligado '].map((binding) => clause(projection).replace(binding, ''))];
      for (const replacement of replacements) {
        const changed = control.map((text) => text.startsWith(projection) ? replacement : text);
        assert.throws(() => assertProjectionGrants(...changed), { code: 'ERR_ASSERTION' });
      }
      const other = projection === 'currentValues' ? 'proposedValues' : 'currentValues';
      assert.throws(() => assertProjectionGrants(`${projection} se expone libremente, ${clause(other)}`), { code: 'ERR_ASSERTION' });
    });
  }
}

test('E1e regression grant contradiction cannot be hidden by a preserved affirmative clause', () => {
  const control = 'currentValues y proposedValues se limitan al grant vigente ligado al actor superadmin, solicitud, donante, acción concreta y campos autorizados.';
  assertProjectionGrants(control);
  for (const projection of ['currentValues', 'proposedValues']) {
    for (const contradiction of [`${projection} no se limita al grant.`, `${projection} está exenta del grant.`,
      `Se requiere el grant salvo ${projection}.`, `${projection} se limita al grant no vigente.`,
      `${projection} se limita al grant vigente no ligado al actor.`]) {
      assert.throws(() => assertProjectionGrants(control, contradiction), { code: 'ERR_ASSERTION' });
      assert.throws(() => assertProjectionGrants(`${control} ${contradiction}`), { code: 'ERR_ASSERTION' });
    }
  }
});

test('E1e control grant permits legitimate exclusions of unauthorized fields without negating its binding', () => {
  const control = 'currentValues y proposedValues se limitan al grant vigente ligado al actor superadmin, solicitud, donante, acción concreta y campos autorizados';
  assertProjectionGrants(`${control} y no incluyen campos no autorizados.`);
  assertProjectionGrants(`${control}.`, 'currentValues y proposedValues no incluyen campos no autorizados.');
});

for (const [name, allowed, example] of [
  ['CorrectionRequestSummary', ['requestId', 'type', 'requestedFields', 'status', 'createdAt', 'updatedAt', 'decisionReason'],
    source.components.schemas.CorrectionRequestEnvelope.example.data],
  ['AuditEvent', ['eventId', 'actorCode', 'event', 'resourceCode', 'result', 'occurredAt', 'reason'],
    source.components.schemas.AuditEventListEnvelope.example.data.items[0]],
]) {
  test(`C4 ${name} remains a closed minimised DTO rejecting PII values and projection containers`, () => {
    const schema = source.components.schemas[name];
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(Object.keys(schema.properties).sort(), allowed.sort());
    const valid = schemaValidator(source)({ $ref: `#/components/schemas/${name}` });
    assertValid(valid, example, 'C4 minimised example');
    assertInvalidCases(valid, ['name', 'email', 'declaredBloodType', 'currentValues', 'proposedValues',
      'beforeValues', 'afterValues', 'donorId', 'requestBody'].map((field) =>
      ({ ...example, [field]: 'Canario sintético excluido' })), 'C4 minimised DTO');
    // Free-text redaction and actual audit output require later integration tests.
  });
}

test('C5 delivery buckets remain four closed nonnegative integer current-state counters', () => {
  const record = source.components.schemas.InvitationBatchRecord;
  const buckets = closedShape(record.properties.deliveryCounts, ['pendiente', 'enviada', 'entregada', 'fallida']);
  const valid = schemaValidator(source)(buckets);
  const value = { pendiente: 0, enviada: 0, entregada: 0, fallida: 0 };
  assertValid(valid, value, 'C5 zero buckets');
  for (const field of Object.keys(value)) {
    assert.equal(buckets.properties[field].type, 'integer');
    assert.equal(buckets.properties[field].minimum, 0);
    assertValid(valid, { ...value, [field]: 1 }, 'C5 positive bucket');
    assertInvalidCases(valid, [-1, 0.5, '0', null].map((invalid) => ({ ...value, [field]: invalid })), 'C5 numeric bucket');
    const missing = { ...value };
    delete missing[field];
    assertInvalidCases(valid, [missing], 'C5 required bucket');
  }
  assertInvalidCases(valid, [{ ...value, attempts: 0 }], 'C5 no cumulative attempt bucket');
});

function batchExampleRecords(node, records = []) {
  if (!node || typeof node !== 'object') return records;
  if (typeof node.createdInvitationCount === 'number' && node.deliveryCounts) records.push(node);
  for (const child of Object.values(node)) batchExampleRecords(child, records);
  return records;
}

test('C5 canon retains batch delivery examples so arithmetic assertions cannot pass vacuously', () => {
  assert.equal(batchExampleRecords(source).length > 0, true);
});

for (const [index, example] of batchExampleRecords(source).entries()) {
  test(`C5 canonical batch example ${index + 1} sums exclusive current buckets to createdInvitationCount`, () => {
    assertValid(schemaValidator(source)({ $ref: '#/components/schemas/InvitationBatchRecord' }), example, 'C5 example shape');
    const total = ['pendiente', 'enviada', 'entregada', 'fallida']
      .reduce((sum, field) => sum + example.deliveryCounts[field], 0);
    assert.equal(total, example.createdInvitationCount, 'C5 current-state buckets must sum to created invitations');
  });
}

test('C5 contract describes exclusive current-state buckets', () => {
  const record = source.components.schemas.InvitationBatchRecord;
  assertClaims(contractText(record.description, record.properties.deliveryCounts.description, apiRules), [
    ['mutually exclusive buckets', /excluyent|exclusiv|disjunt/],
    ['current states', /estado[s]? actual|estado[s]? vigente/],
    ['created invitation total', /createdinvitationcount/],
  ], 'C5 semantics');
});

function assertAp02Open(text) {
  const clauses = documentClauses(text);
  // Restricted documentation forms: one AP or a comma/y enumeration directly
  // followed by its state predicate. Another AP's predicate cannot be borrowed.
  const subject = '(ap-\\d{2}(?:\\s*(?:,|y)\\s*ap-\\d{2})*)';
  const stateVerb = '(?:sigue[n]?|permanece[n]?|continua[n]?|esta[n]?)';
  const openState = '(?:abiert[ao]s?|pendientes?)';
  const open = new RegExp(`\\b${subject}\\s+${stateVerb}\\s+${openState}\\b`, 'g');
  const closed = new RegExp(`\\b${subject}\\s+(?:${stateVerb}\\s+(?:cerrad[ao]s?|resuelt[ao]s?|aprobad[ao]s?)|no\\s+${stateVerb}\\s+${openState}|deja[n]?\\s+de\\s+(?:estar|seguir)\\s+${openState})\\b`, 'g');
  const hasAp02Subject = (pattern) => clauses.some((clause) =>
    [...clause.matchAll(pattern)].some((statement) => /\bap-02\b/.test(statement[1])));
  assert.equal(hasAp02Subject(open), true, 'C5 AP-02 must be the subject of an explicit open predicate');
  assert.equal(hasAp02Subject(closed), false, 'C5 AP-02 must not have a closing or negated predicate');
}

test('C5 AP-02 remains explicitly open in its own pending-policy clause', () => {
  assertAp02Open(apiRules);
});

test('E1d countermutation AP-02 rejects a closed clause while other policies remain pending', () => {
  const control = 'AP-02 sigue abierta. AP-04 y AP-06 siguen pendientes.';
  assertAp02Open(control);
  assert.throws(() => assertAp02Open(control.replace('AP-02 sigue abierta', 'AP-02 está cerrada')), { code: 'ERR_ASSERTION' });
  assert.throws(() => assertAp02Open('AP-02 está cerrada y AP-04 sigue pendiente.'), { code: 'ERR_ASSERTION' });
  assert.throws(() => assertAp02Open('AP-02 no sigue abierta; AP-04 sigue pendiente.'), { code: 'ERR_ASSERTION' });
});

test('E1e regression AP-02 cannot borrow another AP pending predicate after leaving pending state', () => {
  assertAp02Open(apiRules); // Positive control: the actual AP-02/04/06/07/08 list remains pending.
  const contradiction = 'AP-02 deja de estar pendiente y AP-04 sigue pendiente.';
  assert.throws(() => assertAp02Open(contradiction), { code: 'ERR_ASSERTION' });
  assert.throws(() => assertAp02Open(`AP-02 sigue pendiente. ${contradiction}`), { code: 'ERR_ASSERTION' });
});

test('E1e control AP-02 accepts its actual pending enumeration and independent states of other APs', () => {
  assertAp02Open(apiRules);
  assertAp02Open('AP-02, AP-04, AP-06, AP-07 y AP-08 siguen pendientes.');
  assertAp02Open('AP-02 sigue abierta y AP-04 está cerrada.');
});

test('C6 CSRF response token is readOnly and is never writeOnly', () => {
  const token = source.components.schemas.CsrfTokenEnvelope.properties.data.properties.token;
  assert.equal(token.readOnly, true, 'C6 output annotation must be readOnly');
  assert.equal(token.writeOnly === true, false, 'C6 output must not be writeOnly');
});

test('C6 CSRF output preserves 32-512 bounds, required token and closed envelope levels', () => {
  const envelope = closedShape(source.components.schemas.CsrfTokenEnvelope, ['data']);
  const data = closedShape(envelope.properties.data, ['token']);
  assert.equal(data.properties.token.minLength, 32);
  assert.equal(data.properties.token.maxLength, 512);
  const valid = schemaValidator(source)({ $ref: '#/components/schemas/CsrfTokenEnvelope' });
  for (const length of [32, 512]) assertValid(valid, { data: { token: 'x'.repeat(length) } }, 'C6 token boundary');
  assertInvalidCases(valid, [{ data: { token: 'x'.repeat(31) } }, { data: { token: 'x'.repeat(513) } },
    { data: {} }, { data: { token: null } }, { data: { token: 32 } },
    { data: { token: 'x'.repeat(32), donorId: 'untrusted-id' } },
    { data: { token: 'x'.repeat(32) }, email: 'canary@example.test' }], 'C6 output');
});

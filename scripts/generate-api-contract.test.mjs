import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  buildContractSnapshot,
  buildGeneratedArtifacts,
  checkGeneratedFiles,
  ContractGenerationError,
  GENERATED_FILES,
  auditOpenApiReferences,
  buildRatifiedSchemas,
  projectApiTypesSpec,
  selectRatifiedOperations,
} from './generate-api-contract.mjs';

const source = JSON.parse(await readFile(new URL('../docs/openapi.json', import.meta.url), 'utf8'));
const targetPath = '/api/v1/hospitals/me/needs';
const cloneSource = () => structuredClone(source);

test('snapshot preserves the approved closed request, create-only 201, UTC-Z rule, and declared errors', () => {
  const snapshot = buildContractSnapshot(source);
  const definitions = snapshot.$defs;

  assert.equal(snapshot.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.match(snapshot.$comment, /createHospitalNeed/);
  assert.equal(definitions.CreateNeedRequest.additionalProperties, false);
  assert.deepEqual([...definitions.CreateNeedRequest.required].sort(), [
    'component', 'expiresInHours', 'requiredBloodType', 'siteId', 'targetConfirmations', 'urgency',
  ]);
  assert.deepEqual(Object.keys(definitions.CreateNeedRequest.properties).sort(), [
    'component', 'expiresInHours', 'radiusKm', 'requiredBloodType', 'siteId', 'targetConfirmations', 'urgency',
  ]);
  assert.equal(definitions.CreateNeedRequest.properties.radiusKm.minimum, 1);
  assert.equal(definitions.CreateNeedRequest.properties.radiusKm.maximum, 50);
  assert.equal(definitions.CreateNeedRequest.properties.requiredBloodType.$ref, '#/$defs/BloodType');
  assert.equal(definitions.CreateNeedRequest.examples[0].radiusKm, 10);

  assert.equal(definitions.NeedEnvelope.additionalProperties, false);
  assert.equal(definitions.NeedEnvelope.properties.data.$ref, '#/$defs/Need');
  assert.equal(definitions.NeedEnvelope.examples[0].data.status, 'activa');
  assert.deepEqual(Object.keys(definitions.Need.properties).sort(), [
    'component', 'confirmedIntentCount', 'expiresAt', 'needId', 'radiusKm', 'requiredBloodType',
    'siteId', 'status', 'targetConfirmations', 'urgency',
  ]);
  assert.equal(definitions.Need.required.includes('expiresAt'), true);
  const response = definitions.CreateHospitalNeed201;
  assert.equal(response.allOf[0].$ref, '#/$defs/NeedEnvelope');
  assert.equal(response.allOf[1].properties.data.allOf[0].$ref, '#/$defs/Need');
  const creationConstraints = response.allOf[1].properties.data.allOf[1].properties;
  assert.equal(creationConstraints.status.const, 'borrador');
  assert.equal(creationConstraints.confirmedIntentCount.const, 0);
  assert.equal(creationConstraints.expiresAt.format, 'date-time');
  assert.equal(creationConstraints.expiresAt.pattern, 'Z$');
  assert.match(response.examples[0].data.expiresAt, /Z$/);
  assert.equal(definitions.Need.properties.expiresAt.pattern, undefined);

  const errors = definitions.CreateHospitalNeedErrorResponses;
  assert.deepEqual(Object.keys(errors.properties).sort(), ['400', '401', '403', '409', '422', '500']);
  assert.ok(Object.values(errors.properties).every((schema) => schema.$ref === '#/$defs/ErrorResponse'));
  assert.equal(definitions.ErrorResponse.additionalProperties, false);
  assert.equal(definitions.ErrorResponse.examples.length, 6);
});

test('type projection contains only the approved POST, and generated API DTO types are local and narrow', async () => {
  const projected = projectApiTypesSpec(source);
  assert.deepEqual(Object.keys(projected.paths).sort(), [targetPath]);
  assert.deepEqual(Object.keys(projected.paths[targetPath]).sort(), ['post']);
  assert.equal(projected.paths[targetPath].post.operationId, 'createHospitalNeed');
  assert.ok(projected.components.schemas.CreateNeedRequest);
  assert.ok(projected.components.schemas.NeedEnvelope);

  const artifacts = await buildGeneratedArtifacts(source);
  const apiTypes = artifacts.get(GENERATED_FILES.apiTypes);
  assert.match(apiTypes, /radiusKm\?: number/);
  assert.match(apiTypes, /status: "borrador"/);
  assert.match(apiTypes, /confirmedIntentCount: 0/);
  assert.doesNotMatch(apiTypes, /getOwnHospitalNeed|listOwnHospitalNeeds/);
  assert.equal(artifacts.get(GENERATED_FILES.webTypes), artifacts.get(GENERATED_FILES.mockTypes));
  assert.ok(artifacts.get(GENERATED_FILES.apiContract).includes('"$defs"'));
});

test('snapshot preserves JSON Schema default annotations without making them runtime defaults', () => {
  const spec = cloneSource();
  spec.components.schemas.CreateNeedRequest.properties.radiusKm.default = 10;
  const snapshot = buildContractSnapshot(spec);

  assert.equal(snapshot.$defs.CreateNeedRequest.properties.radiusKm.default, 10);
  assert.equal(snapshot.$defs.CreateNeedRequest.required.includes('radiusKm'), false);
});

test('creation output requires UTC Z while the shared Need schema remains date-time general', () => {
  const snapshot = buildContractSnapshot(source);
  const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: true, logger: false });
  addFormats(ajv);
  ajv.addSchema(snapshot);
  const responseValidator = ajv.compile({ $ref: `${snapshot.$id}#/$defs/CreateHospitalNeed201` });
  const needValidator = ajv.compile({ $ref: `${snapshot.$id}#/$defs/Need` });
  const utcResponse = structuredClone(snapshot.$defs.CreateHospitalNeed201.examples[0]);
  assert.equal(responseValidator(utcResponse), true);
  utcResponse.data.expiresAt = '2026-10-04T18:00:00+00:00';
  assert.equal(responseValidator(utcResponse), false);

  const sharedNeed = { ...snapshot.$defs.NeedEnvelope.examples[0].data, expiresAt: '2026-10-02T18:00:00+00:00' };
  assert.equal(needValidator(sharedNeed), true);
});

test('rejects external and unresolved schema references before producing artifacts', () => {
  const external = cloneSource();
  external.paths[targetPath].post.requestBody.content['application/json'].schema.$ref =
    'https://schemas.example.invalid/untrusted.json';
  assert.throws(() => buildContractSnapshot(external), { code: 'EXTERNAL_REF' });

  const missing = cloneSource();
  missing.paths[targetPath].post.requestBody.content['application/json'].schema.$ref =
    '#/components/schemas/NotPresent';
  assert.throws(() => buildContractSnapshot(missing), { code: 'UNRESOLVED_REF' });
});

test('rejects restrictive siblings on the request schema ref instead of dropping them', () => {
  const spec = cloneSource();
  spec.paths[targetPath].post.requestBody.content['application/json'].schema.maxProperties = 6;
  assert.throws(() => buildContractSnapshot(spec), { code: 'REQUEST_SCHEMA_SIBLINGS' });
});

test('audit ignores literal refs in extensions and annotations but follows a property schema named example', () => {
  const literals = cloneSource();
  const literalRef = { $ref: 'https://example.invalid/literal' };
  literals.info['x-audit-note'] = { example: structuredClone(literalRef) };
  literals.components.schemas.NeedEnvelope.example = structuredClone(literalRef);
  literals.components.schemas.NeedEnvelope.examples = [structuredClone(literalRef)];
  literals.components.schemas.CreateNeedRequest.properties.radiusKm.default = structuredClone(literalRef);
  literals.components.schemas.CreateNeedRequest.properties.radiusKm.examples = [structuredClone(literalRef)];
  assert.doesNotThrow(() => auditOpenApiReferences(literals));

  const structural = cloneSource();
  structural.components.schemas.CreateNeedRequest.properties.example = structuredClone(literalRef);
  assert.throws(() => auditOpenApiReferences(structural), { code: 'EXTERNAL_REF' });
});

test('audit rejects external and unresolved OpenAPI Reference Objects before type generation', () => {
  const externalReference = cloneSource();
  externalReference.paths[targetPath].post.responses['400'] = {
    $ref: 'https://example.invalid/response',
  };
  assert.throws(() => auditOpenApiReferences(externalReference), { code: 'EXTERNAL_REF' });

  const unresolvedReference = cloneSource();
  unresolvedReference.paths[targetPath].post.responses['400'] = {
    $ref: '#/components/responses/Missing',
  };
  assert.throws(() => auditOpenApiReferences(unresolvedReference), { code: 'UNRESOLVED_REF' });

  const external = cloneSource();
  external.paths[targetPath].post.requestBody.content['application/json'].schema.$ref =
    'https://schemas.example.invalid/untrusted.json';
  assert.throws(() => auditOpenApiReferences(external), { code: 'EXTERNAL_REF' });

  const unresolved = cloneSource();
  unresolved.components.schemas.CreateNeedRequest.properties.siteId.$ref = '#/components/schemas/Missing';
  assert.throws(() => auditOpenApiReferences(unresolved), { code: 'UNRESOLVED_REF' });
});

test('full artifact generation ignores external-looking refs inside operation extensions', async () => {
  const spec = cloneSource();
  spec.paths[targetPath].post['x-data'] = { $ref: 'https://example.invalid/literal' };
  const artifacts = await buildGeneratedArtifacts(spec);
  assert.ok(artifacts.has(GENERATED_FILES.apiTypes));
});

test('API type closure follows a schema-valued property named example', () => {
  const spec = cloneSource();
  spec.components.schemas.CreateNeedRequest.properties.example = {
    $ref: '#/components/schemas/ExampleProperty',
  };
  spec.components.schemas.ExampleProperty = { type: 'string', minLength: 2 };

  const projected = projectApiTypesSpec(spec);
  assert.deepEqual(projected.components.schemas.ExampleProperty, { type: 'string', minLength: 2 });
});

test('type generation preserves x-prefixed component and security requirement names', async () => {
  const spec = cloneSource();
  const operation = spec.paths[targetPath].post;
  const parameterName = 'x-idempotency';
  const schemeName = 'x-session';
  spec.components.parameters[parameterName] = structuredClone(spec.components.parameters.IdempotencyKey);
  operation.parameters[0].$ref = `#/components/parameters/${parameterName}`;
  spec.components.securitySchemes[schemeName] = {
    type: 'apiKey', in: 'cookie', name: 'x-session', description: 'Synthetic projection fixture',
  };
  operation.security[0][schemeName] = [];

  const projected = projectApiTypesSpec(spec);
  assert.ok(projected.components.parameters[parameterName]);
  assert.ok(projected.components.securitySchemes[schemeName]);
  assert.deepEqual(projected.paths[targetPath].post.security[0][schemeName], []);
  const apiTypes = (await buildGeneratedArtifacts(spec)).get(GENERATED_FILES.apiTypes);
  assert.match(apiTypes, /x-idempotency/);
});

test('type generation preserves x-prefixed response header names and schema property names', async () => {
  const spec = cloneSource();
  spec.paths[targetPath].post.responses['201'].headers = {
    'x-custom-trace': { description: 'Synthetic header-name fixture', schema: { type: 'string' } },
  };
  spec.components.schemas.CreateNeedRequest.properties['x-client-note'] = { type: 'string' };

  const apiTypes = (await buildGeneratedArtifacts(spec)).get(GENERATED_FILES.apiTypes);
  assert.match(apiTypes, /x-custom-trace/);
  assert.match(apiTypes, /x-client-note/);
});

test('x-prefixed response header refs retain local schema closure and generated types without following metadata', async () => {
  const spec = cloneSource();
  const headerRef = '#/components/schemas/HeaderValue';
  spec.paths[targetPath].post.responses['201'].headers = {
    'x-custom-trace': {
      schema: { $ref: headerRef },
      'x-audit-note': { $ref: 'https://example.invalid/literal' },
    },
  };
  spec.components.schemas.HeaderValue = { type: 'string' };

  assert.doesNotThrow(() => auditOpenApiReferences(spec));
  const projected = projectApiTypesSpec(spec);
  assert.equal(projected.paths[targetPath].post.responses['201'].headers['x-custom-trace'].schema.$ref, headerRef);
  assert.deepEqual(projected.components.schemas.HeaderValue, { type: 'string' });
  const apiTypes = (await buildGeneratedArtifacts(spec)).get(GENERATED_FILES.apiTypes);
  assert.match(apiTypes, /HeaderValue: string/);
  assert.match(apiTypes, /"x-custom-trace"\??: components\["schemas"\]\["HeaderValue"\]/);
});

test('x-prefixed response header external refs fail audit, projection, and full generation closed', async () => {
  const spec = cloneSource();
  spec.paths[targetPath].post.responses['201'].headers = {
    'x-custom-trace': { schema: { $ref: 'https://schemas.example.invalid/header.json' } },
  };
  const expectedError = new ContractGenerationError('EXTERNAL_REF');

  // A failed synchronous assertion must stop before the builder can resolve an external ref.
  assert.throws(() => auditOpenApiReferences(spec), expectedError);
  assert.throws(() => projectApiTypesSpec(spec), expectedError);
  await assert.rejects(() => buildGeneratedArtifacts(spec), expectedError);
});

test('x-prefixed response header unresolved local refs fail audit, projection, and full generation closed', async () => {
  const spec = cloneSource();
  spec.paths[targetPath].post.responses['201'].headers = {
    'x-custom-trace': { schema: { $ref: '#/components/schemas/MissingHeaderValue' } },
  };
  const expectedError = new ContractGenerationError('UNRESOLVED_REF');

  assert.throws(() => auditOpenApiReferences(spec), expectedError);
  assert.throws(() => projectApiTypesSpec(spec), expectedError);
  await assert.rejects(() => buildGeneratedArtifacts(spec), expectedError);
});

test('rejects schema keywords outside the explicitly supported JSON Schema projection', () => {
  const unsupported = cloneSource();
  unsupported.components.schemas.CreateNeedRequest.properties.radiusKm.nullable = true;
  assert.throws(() => buildContractSnapshot(unsupported), { code: 'UNSUPPORTED_SCHEMA_KEYWORD' });
});

test('rejects generated $defs collisions reached through a local schema ref', () => {
  const collision = cloneSource();
  collision.components.schemas.CreateHospitalNeed201 = { type: 'string' };
  collision.components.schemas.Need.properties.collisionProbe = {
    $ref: '#/components/schemas/CreateHospitalNeed201',
  };

  assert.throws(() => buildContractSnapshot(collision), { code: 'DEF_COLLISION' });
});

test('drift check fails closed without mutating generated files in a temporary root', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'save-a-life-contract-check-'));
  const relativePath = GENERATED_FILES.apiContract;
  const filePath = join(temporaryRoot, relativePath);
  const actualContent = '{"approved":false}\n';

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, actualContent, 'utf8');
    const before = await stat(filePath);
    await assert.rejects(
      checkGeneratedFiles(new Map([[relativePath, '{"approved":true}\n']]), temporaryRoot),
      { code: 'GENERATED_DRIFT' },
    );
    assert.equal(await readFile(filePath, 'utf8'), actualContent);
    assert.equal((await stat(filePath)).mtimeMs, before.mtimeMs);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('missing generated artifact fails check without creating the file', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'save-a-life-contract-missing-'));
  const relativePath = GENERATED_FILES.apiContract;
  const filePath = join(temporaryRoot, relativePath);
  try {
    await assert.rejects(checkGeneratedFiles(new Map([[relativePath, '{}\n']]), temporaryRoot),
      { code: 'GENERATED_FILE_MISSING' });
    await assert.rejects(readFile(filePath, 'utf8'), { code: 'ENOENT' });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects changed operation tuple and ratification metadata', () => {
  const tuple = cloneSource();
  tuple.paths[targetPath].post.operationId = 'createAnotherNeed';
  assert.throws(() => buildContractSnapshot(tuple), { code: 'OPERATION_TUPLE' });

  const ratification = cloneSource();
  ratification.paths[targetPath].post['x-ratification'].date = '2026-10-05';
  assert.throws(() => buildContractSnapshot(ratification), { code: 'OPERATION_RATIFICATION' });
});

test('generator errors expose stable codes rather than source content', () => {
  const error = new ContractGenerationError('UNRESOLVED_REF');
  assert.equal(error.code, 'UNRESOLVED_REF');
  assert.doesNotMatch(error.message, /CreateNeedRequest|schemas\.example/);
});

const backendGeneratedFiles = Object.freeze({
  apiTypes: 'backend/src/modules/need-records/dto/openapi.ts',
  apiContract: 'backend/src/modules/need-records/dto/contract.generated.json',
  webTypes: 'apps/web/src/api/openapi.ts',
  mockTypes: 'apps/mock-api/src/api/openapi.ts',
  backendContractTypes: 'backend/src/contract/openapi.ts',
  backendRatifiedSchemas: 'backend/src/contract/ratified-schemas.generated.json',
});

test('backend migration: generates exactly the backend DTO, contract artifacts and unchanged web/mock paths', async () => {
  const artifacts = await buildGeneratedArtifacts(source);
  assert.deepEqual([...artifacts.keys()].sort(), Object.values(backendGeneratedFiles).sort());
  assert.deepEqual(GENERATED_FILES, backendGeneratedFiles);
});

test('backend migration: checks backend-only fixtures without recreating apps/api', async () => {
  const artifacts = await buildGeneratedArtifacts(source);
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'save-a-life-contract-backend-'));
  try {
    for (const [key, relativePath] of Object.entries(backendGeneratedFiles)) {
      const filePath = join(temporaryRoot, relativePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, artifacts.get(GENERATED_FILES[key]), 'utf8');
    }
    await checkGeneratedFiles(artifacts, temporaryRoot);
    await assert.rejects(stat(join(temporaryRoot, 'apps/api')), { code: 'ENOENT' });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('backend migration: registers backend as the only production workspace and preserves web/mock', async () => {
  const rootPackage = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual([...rootPackage.workspaces].sort(), ['apps/mock-api', 'apps/web', 'backend']);
});

test('backend package: wires DTO tests and TypeScript entrypoint scripts', async () => {
  const rootPackage = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const backendPackage = JSON.parse(await readFile(new URL('../backend/package.json', import.meta.url), 'utf8'));
  assert.equal(backendPackage.name, 'backend');
  assert.equal(backendPackage.version, '1.0.0');
  assert.equal(backendPackage.license, 'ISC');
  assert.equal(backendPackage.scripts.dev, 'tsx watch --env-file-if-exists=.env src/server.ts');
  assert.equal(backendPackage.scripts.start, 'node dist/server.js');
  assert.equal(rootPackage.scripts['test:backend:dto'], `npm run test --workspace ${backendPackage.name}`);
});

function ratifiedFixture() {
  const ratified = (date = '2026-10-20') => ({ status: 'ratified-for-implementation', date });
  const error = { $ref: '#/components/responses/NotFound' };
  return {
    openapi: '3.1.0',
    info: { title: 'fixture', version: '0.0.0' },
    paths: {
      '/items': {
        get: {
          operationId: 'listItems',
          'x-ratification': ratified(),
          parameters: [{ $ref: '#/components/parameters/Limit' }, { name: 'kind', in: 'query', required: false, schema: { type: 'string', enum: ['a', 'b'] } }],
          responses: {
            200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/ItemPage' } } } },
            404: error,
          },
        },
        post: {
          operationId: 'createItem',
          parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 16 } }],
          requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/ItemInput' } } } },
          responses: { 201: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } } } },
        },
      },
      '/items/{itemId}': {
        parameters: [{ name: 'itemId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        put: {
          operationId: 'replaceItem',
          'x-ratification': ratified('2026-10-21'),
          parameters: [{ name: 'X-Contextual-Grant', in: 'header', required: true, schema: { type: 'string' } }],
          requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/ItemInput' } } } },
          responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } } } },
        },
        delete: { operationId: 'deleteItem', 'x-ratification': ratified(), responses: { 204: { description: 'ok' } } },
      },
    },
    components: {
      parameters: { Limit: { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100 } } },
      responses: { NotFound: { description: 'x', content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } } } },
      schemas: {
        Item: { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string' } } },
        ItemInput: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string', maxLength: 10 } } },
        ItemPage: { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: { $ref: '#/components/schemas/Item' } } } },
      },
    },
  };
}

test('ratified selection: includes only ratified operations and validates the date format, not a fixed date', () => {
  const ids = selectRatifiedOperations(ratifiedFixture()).map(({ operationId }) => operationId);
  assert.deepEqual(ids, ['deleteItem', 'listItems', 'replaceItem']);

  const badDate = ratifiedFixture();
  badDate.paths['/items'].get['x-ratification'].date = '20/10/2026';
  assert.throws(() => selectRatifiedOperations(badDate), { code: 'OPERATION_RATIFICATION' });
});

test('ratified schemas: emits closed synthetic defs per operation and skips unratified operations', () => {
  const snapshot = buildRatifiedSchemas(ratifiedFixture());

  assert.deepEqual(Object.keys(snapshot.operations), ['deleteItem', 'listItems', 'replaceItem']);
  assert.deepEqual(snapshot.operations.listItems, {
    method: 'get', path: '/items', body: null, query: 'ListItemsQuery', params: null, headers: null,
    success: { status: '200', def: 'ListItemsSuccess' }, errorStatuses: ['404'],
  });
  assert.equal(snapshot.operations.replaceItem.body, 'ReplaceItemBody');
  assert.equal(snapshot.operations.replaceItem.params, 'ReplaceItemPath');
  assert.equal(snapshot.operations.replaceItem.headers, 'ReplaceItemHeaders');

  const { $defs } = snapshot;
  assert.equal($defs.CreateItemBody, undefined);
  assert.deepEqual($defs.ListItemsQuery, {
    type: 'object', additionalProperties: false,
    properties: { limit: { type: 'integer', minimum: 1, maximum: 100 }, kind: { type: 'string', enum: ['a', 'b'] } },
  });
  assert.deepEqual($defs.ReplaceItemPath.required, ['itemId']);
  assert.deepEqual(Object.keys($defs.ReplaceItemHeaders.properties), ['X-Contextual-Grant']);
  assert.deepEqual($defs.DeleteItemSuccess, { const: null });
  assert.deepEqual($defs.ReplaceItemBody, { $ref: '#/$defs/ItemInput' });
  assert.ok($defs.Item && $defs.ItemInput && $defs.ItemPage);
});

test('ratified schemas: a synthetic def colliding with a component name fails closed', () => {
  const collision = ratifiedFixture();
  collision.components.schemas.ListItemsQuery = { type: 'object' };
  collision.paths['/items'].get.responses[200].content['application/json'].schema = {
    allOf: [{ $ref: '#/components/schemas/ItemPage' }, { $ref: '#/components/schemas/ListItemsQuery' }],
  };
  assert.throws(() => buildRatifiedSchemas(collision), { code: 'GENERATED_DEF_COLLISION' });
});

test('ratified schemas: the real contract includes createHospitalNeed and is part of the drift check', async () => {
  const snapshot = buildRatifiedSchemas(source);
  assert.ok(snapshot.operations.createHospitalNeed);

  const artifacts = await buildGeneratedArtifacts(source);
  const stale = new Map(artifacts);
  stale.set(GENERATED_FILES.backendRatifiedSchemas, '{"stale":true}\n');
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'save-a-life-contract-ratified-'));
  try {
    for (const [path, content] of stale) {
      const filePath = join(temporaryRoot, path);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf8');
    }
    await assert.rejects(checkGeneratedFiles(artifacts, temporaryRoot), { code: 'GENERATED_DRIFT' });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

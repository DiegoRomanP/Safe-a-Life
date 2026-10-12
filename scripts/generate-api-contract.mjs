import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OPENAPI_PATH = 'docs/openapi.json';
const NEEDS_PATH = '/api/v1/hospitals/me/needs';
const OPERATION_ID = 'createHospitalNeed';
const ERROR_STATUSES = ['400', '401', '403', '409', '422', '500'];
const COMPONENT_SECTIONS = new Set(['examples', 'parameters', 'responses', 'schemas', 'securitySchemes']);
const SCHEMA_MAP_KEYWORDS = new Set(['$defs', 'dependentSchemas', 'patternProperties', 'properties']);
const SCHEMA_ARRAY_KEYWORDS = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
const SCHEMA_CHILD_KEYWORDS = new Set([
  'additionalProperties', 'contains', 'contentSchema', 'else', 'if', 'items', 'not', 'propertyNames',
  'then', 'unevaluatedItems', 'unevaluatedProperties',
]);
const SCHEMA_LITERAL_KEYWORDS = new Set(['const', 'default', 'enum', 'example', 'examples']);
const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
const RESERVED_DEFINITIONS = new Set(['CreateHospitalNeed201', 'CreateHospitalNeedErrorResponses']);
const SCHEMA_ID = 'https://save-a-life.invalid/schemas/create-hospital-need.json';
const SCHEMA_URI = 'https://json-schema.org/draft/2020-12/schema';

export const GENERATED_FILES = Object.freeze({
  apiTypes: 'backend/src/modules/need-records/dto/openapi.ts',
  apiContract: 'backend/src/modules/need-records/dto/contract.generated.json',
  webTypes: 'apps/web/src/api/openapi.ts',
  mockTypes: 'apps/mock-api/src/api/openapi.ts',
});

const schemaKinds = { properties: 'map', allOf: 'array', additionalProperties: 'child' };
const schemaLiterals = new Set([
  '$schema', '$id', '$comment', 'title', 'description', 'default', 'deprecated', 'readOnly',
  'writeOnly', 'type', 'enum', 'const', 'format', 'pattern', 'multipleOf', 'minimum',
  'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'minItems',
  'maxItems', 'uniqueItems', 'minProperties', 'maxProperties', 'required', 'minContains', 'maxContains',
]);

export class ContractGenerationError extends Error {
  constructor(code) {
    super(`API contract generation: ${code}.`);
    this.name = 'ContractGenerationError';
    this.code = code;
  }
}

function fail(code) {
  throw new ContractGenerationError(code);
}

function ensure(condition, code) {
  if (!condition) fail(code);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sorted(values) {
  return [...values].sort();
}

function decodePointerToken(token) {
  ensure(!/~(?![01])/.test(token), 'INVALID_REF');
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

function escapePointerToken(token) {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

function pointerTokens(ref) {
  ensure(typeof ref === 'string' && ref.startsWith('#/'), 'EXTERNAL_REF');
  return ref.slice(2).split('/').map(decodePointerToken);
}

function resolvePointer(root, ref) {
  let value = root;
  for (const token of pointerTokens(ref)) {
    ensure(isRecord(value) || Array.isArray(value), 'UNRESOLVED_REF');
    ensure(Object.hasOwn(value, token), 'UNRESOLVED_REF');
    value = value[token];
  }
  ensure(value !== undefined, 'UNRESOLVED_REF');
  return value;
}

function parseComponentRef(ref) {
  const tokens = pointerTokens(ref);
  ensure(tokens.length === 3 && tokens[0] === 'components', 'UNSUPPORTED_REF');
  ensure(COMPONENT_SECTIONS.has(tokens[1]), 'UNSUPPORTED_REF');
  return { section: tokens[1], name: tokens[2] };
}

function resolveResponse(spec, response) {
  let value = response;
  const visited = new Set();
  while (isRecord(value) && Object.hasOwn(value, '$ref')) {
    const ref = value.$ref;
    const { section, name } = parseComponentRef(ref);
    ensure(section === 'responses', 'UNSUPPORTED_REF');
    ensure(!visited.has(name), 'REF_CYCLE');
    visited.add(name);
    value = resolvePointer(spec, ref);
  }
  ensure(isRecord(value), 'RESPONSE_SCHEMA');
  return value;
}

function mediaSchema(media) {
  ensure(isRecord(media) && isRecord(media.schema), 'RESPONSE_SCHEMA');
  return media.schema;
}

function mediaExamples(media) {
  ensure(isRecord(media), 'MEDIA_EXAMPLE');
  ensure(!(Object.hasOwn(media, 'example') && Object.hasOwn(media, 'examples')), 'MEDIA_EXAMPLE');
  if (Object.hasOwn(media, 'examples')) fail('UNSUPPORTED_MEDIA_EXAMPLES');
  return Object.hasOwn(media, 'example') ? [structuredClone(media.example)] : [];
}

function getContractParts(spec) {
  ensure(isRecord(spec) && spec.openapi === '3.1.0', 'OPENAPI_VERSION');
  ensure(isRecord(spec.info), 'OPENAPI_INFO');
  ensure(spec.info['x-contract-status'] === 'draft' && spec.info['x-sprint0-approval-required'] === true,
    'GLOBAL_DRAFT_STATE');
  ensure(isRecord(spec.paths) && isRecord(spec.paths[NEEDS_PATH]), 'OPERATION_MISSING');

  const pathItem = spec.paths[NEEDS_PATH];
  const operation = pathItem.post;
  ensure(isRecord(operation) && operation.operationId === OPERATION_ID, 'OPERATION_TUPLE');
  const ratification = operation['x-ratification'];
  ensure(isRecord(ratification) && ratification.status === 'ratified-for-implementation'
    && ratification.date === '2026-10-04', 'OPERATION_RATIFICATION');

  const requestBody = operation.requestBody;
  ensure(isRecord(requestBody) && requestBody.required === true, 'REQUEST_BODY');
  const requestMedia = requestBody.content?.['application/json'];
  const requestSchema = mediaSchema(requestMedia);
  ensure(Object.keys(requestSchema).length === 1 && Object.hasOwn(requestSchema, '$ref'),
    'REQUEST_SCHEMA_SIBLINGS');
  const requestRef = parseComponentRef(requestSchema.$ref);
  ensure(requestRef.section === 'schemas', 'REQUEST_SCHEMA');
  resolvePointer(spec, `#/components/schemas/${escapePointerToken(requestRef.name)}`);
  ensure(requestRef.name === 'CreateNeedRequest', 'REQUEST_SCHEMA');

  const response201 = operation.responses?.['201'];
  const responseMedia = response201?.content?.['application/json'];
  const responseSchema = mediaSchema(responseMedia);
  ensure(Array.isArray(responseSchema.allOf), 'RESPONSE_SCHEMA');

  const errorStatuses = sorted(Object.keys(operation.responses ?? {}).filter((status) => status !== '201'));
  ensure(JSON.stringify(errorStatuses) === JSON.stringify(ERROR_STATUSES), 'ERROR_STATUS_INVENTORY');
  const errorResponses = [];
  for (const status of errorStatuses) {
    const response = resolveResponse(spec, operation.responses[status]);
    const media = response.content?.['application/json'];
    const schemaRef = parseComponentRef(mediaSchema(media).$ref);
    ensure(schemaRef.section === 'schemas' && schemaRef.name === 'ErrorResponse', 'ERROR_SCHEMA');
    errorResponses.push({ status, examples: mediaExamples(media) });
  }

  return {
    pathItem,
    operation,
    requestMedia,
    requestName: requestRef.name,
    responseMedia,
    responseSchema,
    responseExamples: mediaExamples(responseMedia),
    errorStatuses,
    errorResponses,
  };
}

function componentSchemaRef(ref, pendingNames) {
  const target = parseComponentRef(ref);
  ensure(target.section === 'schemas', 'UNSUPPORTED_REF');
  pendingNames.add(target.name);
  return `#/$defs/${escapePointerToken(target.name)}`;
}

function cloneLiteral(value) {
  return structuredClone(value);
}

function schemaChild(schema, pendingNames) {
  ensure(typeof schema === 'boolean' || isRecord(schema), 'UNSUPPORTED_SCHEMA_SHAPE');
  return typeof schema === 'boolean' ? schema : toJsonSchema(schema, pendingNames);
}

function schemaMap(value, pendingNames) {
  ensure(isRecord(value), 'UNSUPPORTED_SCHEMA_SHAPE');
  return Object.fromEntries(Object.entries(value).map(([name, schema]) => [name, schemaChild(schema, pendingNames)]));
}

function schemaArray(value, pendingNames) {
  ensure(Array.isArray(value), 'UNSUPPORTED_SCHEMA_SHAPE');
  return value.map((schema) => schemaChild(schema, pendingNames));
}

function toJsonSchema(source, pendingNames) {
  if (typeof source === 'boolean') return source;
  ensure(isRecord(source), 'UNSUPPORTED_SCHEMA_SHAPE');
  const result = {};
  let openApiExample;

  for (const [keyword, value] of Object.entries(source)) {
    if (keyword === 'example') {
      openApiExample = cloneLiteral(value);
      continue;
    }
    const kind = schemaKinds[keyword];
    if (keyword === '$ref') {
      result.$ref = componentSchemaRef(value, pendingNames);
    } else if (kind === 'map') {
      result[keyword] = schemaMap(value, pendingNames);
    } else if (kind === 'array') {
      result[keyword] = schemaArray(value, pendingNames);
    } else if (kind === 'child') {
      result[keyword] = schemaChild(value, pendingNames);
    } else if (schemaLiterals.has(keyword)) {
      result[keyword] = cloneLiteral(value);
    } else if (keyword === 'examples') {
      ensure(Array.isArray(value), 'UNSUPPORTED_SCHEMA_EXAMPLES');
      result.examples = cloneLiteral(value);
    } else {
      fail('UNSUPPORTED_SCHEMA_KEYWORD');
    }
  }

  if (openApiExample !== undefined) {
    const existing = result.examples ?? [];
    ensure(Array.isArray(existing), 'UNSUPPORTED_SCHEMA_EXAMPLES');
    result.examples = [openApiExample, ...existing];
  }
  return result;
}

function appendExamples(schema, examples) {
  if (examples.length === 0) return;
  ensure(isRecord(schema), 'UNSUPPORTED_SCHEMA_EXAMPLES');
  const current = schema.examples ?? [];
  ensure(Array.isArray(current), 'UNSUPPORTED_SCHEMA_EXAMPLES');
  schema.examples = [...current, ...cloneLiteral(examples)];
}

function getErrorStatusMap(errorStatuses) {
  return {
    type: 'object',
    additionalProperties: false,
    required: [...errorStatuses],
    properties: Object.fromEntries(errorStatuses.map((status) => [status, { $ref: '#/$defs/ErrorResponse' }])),
  };
}

export function buildContractSnapshot(spec) {
  const parts = getContractParts(spec);
  const pendingNames = new Set([parts.requestName, 'ErrorResponse']);
  const processedNames = new Set();
  const definitions = Object.create(null);
  const responseDefinition = toJsonSchema(parts.responseSchema, pendingNames);

  definitions.CreateHospitalNeed201 = responseDefinition;
  appendExamples(definitions.CreateHospitalNeed201, parts.responseExamples);
  definitions.CreateHospitalNeedErrorResponses = getErrorStatusMap(parts.errorStatuses);

  while (pendingNames.size > 0) {
    const name = pendingNames.values().next().value;
    pendingNames.delete(name);
    ensure(typeof name === 'string', 'UNRESOLVED_REF');
    ensure(!RESERVED_DEFINITIONS.has(name), 'DEF_COLLISION');
    if (processedNames.has(name)) continue;
    processedNames.add(name);
    const rawSchema = resolvePointer(spec, `#/components/schemas/${escapePointerToken(name)}`);
    definitions[name] = toJsonSchema(rawSchema, pendingNames);
  }

  appendExamples(definitions[parts.requestName], mediaExamples(parts.requestMedia));
  appendExamples(definitions.ErrorResponse, parts.errorResponses.flatMap((response) => response.examples));
  const orderedDefinitions = Object.fromEntries(Object.keys(definitions).sort()
    .map((name) => [name, definitions[name]]));
  return {
    $schema: SCHEMA_URI,
    $id: SCHEMA_ID,
    $comment: 'Generated from docs/openapi.json for the ratified POST /api/v1/hospitals/me/needs (createHospitalNeed) contract only.',
    $defs: orderedDefinitions,
  };
}

function collectOpenApiComponents(spec, objects, security = []) {
  const result = Object.create(null);
  const seeds = [];
  for (const requirement of security) {
    ensure(isRecord(requirement), 'SECURITY_SCHEME');
    for (const name of Object.keys(requirement)) {
      seeds.push(`#/components/securitySchemes/${escapePointerToken(name)}`);
    }
  }
  visitOpenApiReferences(spec, objects, ({ section, name }, value) => {
    result[section] ??= Object.create(null);
    result[section][name] = structuredClone(value);
  }, seeds);
  return Object.fromEntries(Object.entries(result).map(([section, values]) => [section, values]));
}

export function projectApiTypesSpec(spec) {
  const parts = getContractParts(spec);
  const commonPathFields = Object.fromEntries(Object.entries(parts.pathItem)
    .filter(([key]) => !HTTP_METHODS.has(key))
    .map(([key, value]) => [key, structuredClone(value)]));
  const pathProjection = { ...commonPathFields, post: structuredClone(parts.operation) };
  const components = collectOpenApiComponents(spec, [pathProjection], parts.operation.security ?? []);
  const projection = {
    openapi: spec.openapi,
    info: { title: 'Save a Life createHospitalNeed DTO projection', version: spec.info.version },
    paths: { [NEEDS_PATH]: pathProjection },
    components,
  };
  stripOpenApiExtensions(projection);
  return projection;
}

function auditReference(spec, ref, allowedSections = COMPONENT_SECTIONS) {
  const target = parseComponentRef(ref);
  ensure(allowedSections.has(target.section), 'UNSUPPORTED_REF');
  return { target, value: resolvePointer(spec, ref) };
}

function visitOpenApiReferences(spec, roots, onReference = () => {}, seeds = []) {
  const visited = new Set();
  const seenDocuments = new WeakSet();
  const seenSchemas = new WeakSet();
  const visitSchema = (schema) => {
    if (!isRecord(schema) || seenSchemas.has(schema)) return;
    seenSchemas.add(schema);
    if (Object.hasOwn(schema, '$ref')) follow(schema.$ref, new Set(['schemas']));
    for (const [keyword, value] of Object.entries(schema)) {
      if (keyword === '$ref' || keyword.startsWith('x-') || SCHEMA_LITERAL_KEYWORDS.has(keyword)) continue;
      if (SCHEMA_MAP_KEYWORDS.has(keyword) && isRecord(value)) {
        for (const child of Object.values(value)) visitSchema(child);
      } else if (SCHEMA_ARRAY_KEYWORDS.has(keyword) && Array.isArray(value)) {
        for (const child of value) visitSchema(child);
      } else if (SCHEMA_CHILD_KEYWORDS.has(keyword)) visitSchema(value);
    }
  };
  const visitExample = (example) => {
    if (isRecord(example) && Object.hasOwn(example, '$ref')) follow(example.$ref, new Set(['examples']));
  };
  const visitDocument = (value) => {
    if (Array.isArray(value)) {
      for (const child of value) visitDocument(child);
      return;
    }
    if (!isRecord(value) || seenDocuments.has(value)) return;
    seenDocuments.add(value);
    if (Object.hasOwn(value, '$ref')) follow(value.$ref);
    for (const [key, child] of Object.entries(value)) {
      if (key === '$ref' || key.startsWith('x-') || ['example', 'value', 'externalValue'].includes(key)) continue;
      if (key === 'schema') visitSchema(child);
      else if (key === 'examples' && isRecord(child)) {
        for (const example of Object.values(child)) visitExample(example);
      } else if (key === 'headers' && isRecord(child)) {
        for (const header of Object.values(child)) visitDocument(header);
      } else if (key === 'components' && isRecord(child)) {
        for (const [section, components] of Object.entries(child)) {
          if (!isRecord(components)) continue;
          for (const component of Object.values(components)) {
            if (section === 'schemas') visitSchema(component);
            else if (section === 'examples') visitExample(component);
            else visitDocument(component);
          }
        }
      } else visitDocument(child);
    }
  };
  const follow = (ref, allowedSections) => {
    const { target, value } = auditReference(spec, ref, allowedSections);
    const key = `${target.section}/${target.name}`;
    onReference(target, value);
    if (visited.has(key)) return;
    visited.add(key);
    if (target.section === 'schemas') visitSchema(value);
    else if (target.section === 'examples') visitExample(value);
    else visitDocument(value);
  };

  for (const root of roots) visitDocument(root);
  for (const ref of seeds) follow(ref);
}

export function auditOpenApiReferences(spec) {
  visitOpenApiReferences(spec, [spec]);
}

function assertSnapshotCompiles(snapshot) {
  try {
    const ajv = new Ajv2020({
      allErrors: true,
      strict: true,
      validateFormats: true,
      useDefaults: false,
      coerceTypes: false,
      removeAdditional: false,
      logger: false,
    });
    addFormats(ajv);
    ajv.addSchema(snapshot);
    for (const name of Object.keys(snapshot.$defs)) {
      ajv.compile({ $ref: `${SCHEMA_ID}#/$defs/${escapePointerToken(name)}` });
    }
  } catch {
    fail('SCHEMA_COMPILE');
  }
}

function stripSchemaExtensions(schema, seen = new WeakSet()) {
  if (!isRecord(schema) || seen.has(schema)) return;
  seen.add(schema);
  for (const keyword of Object.keys(schema)) {
    if (keyword.startsWith('x-')) {
      delete schema[keyword];
    } else if (SCHEMA_LITERAL_KEYWORDS.has(keyword) || keyword === '$ref') {
      continue;
    } else if (SCHEMA_MAP_KEYWORDS.has(keyword) && isRecord(schema[keyword])) {
      for (const child of Object.values(schema[keyword])) stripSchemaExtensions(child, seen);
    } else if (SCHEMA_ARRAY_KEYWORDS.has(keyword) && Array.isArray(schema[keyword])) {
      for (const child of schema[keyword]) stripSchemaExtensions(child, seen);
    } else if (SCHEMA_CHILD_KEYWORDS.has(keyword)) {
      stripSchemaExtensions(schema[keyword], seen);
    }
  }
}

function stripExampleExtensions(example) {
  if (!isRecord(example)) return;
  for (const keyword of Object.keys(example)) {
    if (keyword.startsWith('x-')) delete example[keyword];
  }
}

function stripNamedMap(map, transform) {
  if (!isRecord(map)) return;
  for (const value of Object.values(map)) transform(value);
}

function stripOpenApiExtensions(value, seen = new WeakSet()) {
  if (Array.isArray(value)) {
    for (const child of value) stripOpenApiExtensions(child, seen);
    return;
  }
  if (!isRecord(value) || seen.has(value)) return;
  seen.add(value);
  for (const keyword of Object.keys(value)) {
    const child = value[keyword];
    if (keyword.startsWith('x-')) {
      delete value[keyword];
    } else if (keyword === 'schema') {
      stripSchemaExtensions(child);
    } else if (keyword === 'components' && isRecord(child)) {
      for (const [section, components] of Object.entries(child)) {
        if (!isRecord(components)) continue;
        if (section.startsWith('x-')) delete child[section];
        else if (section === 'schemas') stripNamedMap(components, stripSchemaExtensions);
        else if (section === 'examples') stripNamedMap(components, stripExampleExtensions);
        else stripNamedMap(components, (component) => stripOpenApiExtensions(component, seen));
      }
    } else if (keyword === 'examples' && isRecord(child)) {
      stripNamedMap(child, stripExampleExtensions);
    } else if (['callbacks', 'content', 'encoding', 'headers', 'links', 'responses'].includes(keyword)) {
      stripNamedMap(child, (entry) => stripOpenApiExtensions(entry, seen));
    } else if (keyword === 'security') {
      continue;
    } else if (['example', 'value', 'externalValue', 'default', 'enum', 'const'].includes(keyword)) {
      continue;
    } else stripOpenApiExtensions(child, seen);
  }
}

async function typeSource(spec) {
  try {
    const typeSpec = structuredClone(spec);
    stripOpenApiExtensions(typeSpec);
    const ast = await openapiTS(typeSpec, { silent: true });
    return COMMENT_HEADER + astToString(ast);
  } catch {
    fail('TYPE_GENERATION');
  }
}

export async function buildGeneratedArtifacts(spec) {
  auditOpenApiReferences(spec);
  const snapshot = buildContractSnapshot(spec);
  assertSnapshotCompiles(snapshot);
  const projectedSpec = projectApiTypesSpec(spec);
  const [apiTypes, fullTypes] = await Promise.all([
    typeSource(projectedSpec),
    typeSource(spec),
  ]);
  return new Map([
    [GENERATED_FILES.apiTypes, apiTypes],
    [GENERATED_FILES.apiContract, `${JSON.stringify(snapshot, null, 2)}\n`],
    [GENERATED_FILES.webTypes, fullTypes],
    [GENERATED_FILES.mockTypes, fullTypes],
  ]);
}

function validateArtifactPaths(artifacts) {
  ensure(artifacts instanceof Map, 'ARTIFACT_SET');
  for (const path of artifacts.keys()) ensure(Object.values(GENERATED_FILES).includes(path), 'ARTIFACT_PATH');
}

export function assertNoDrift(expected, actual) {
  validateArtifactPaths(expected);
  validateArtifactPaths(actual);
  if (expected.size !== actual.size) fail('GENERATED_DRIFT');
  for (const [path, content] of expected) {
    if (actual.get(path) !== content) fail('GENERATED_DRIFT');
  }
}

export async function checkGeneratedFiles(expected, root = ROOT) {
  validateArtifactPaths(expected);
  const actual = new Map();
  for (const path of expected.keys()) {
    try {
      actual.set(path, await readFile(resolve(root, path), 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') fail('GENERATED_FILE_MISSING');
      fail('GENERATED_FILE_READ');
    }
  }
  assertNoDrift(expected, actual);
}

async function writeGeneratedFiles(artifacts) {
  validateArtifactPaths(artifacts);
  ensure(artifacts.size === Object.keys(GENERATED_FILES).length, 'ARTIFACT_SET');
  for (const path of Object.values(GENERATED_FILES)) ensure(artifacts.has(path), 'ARTIFACT_SET');
  for (const [path, content] of artifacts) {
    try {
      await writeFile(resolve(ROOT, path), content, 'utf8');
    } catch {
      fail('GENERATED_FILE_WRITE');
    }
  }
}

async function main(args) {
  ensure(args.length === 1 && (args[0] === '--write' || args[0] === '--check'), 'USAGE');
  let spec;
  try {
    spec = JSON.parse(await readFile(resolve(ROOT, OPENAPI_PATH), 'utf8'));
  } catch {
    fail('OPENAPI_READ');
  }
  const artifacts = await buildGeneratedArtifacts(spec);
  if (args[0] === '--check') {
    await checkGeneratedFiles(artifacts);
    process.stdout.write('Canonical API contract artifacts are current.\n');
    return;
  }
  await writeGeneratedFiles(artifacts);
  process.stdout.write('Canonical API contract artifacts generated.\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    const code = error instanceof ContractGenerationError ? error.code : 'GENERATION_FAILED';
    process.stderr.write(`API contract generator failed: ${code}.\n`);
    process.exitCode = 1;
  });
}

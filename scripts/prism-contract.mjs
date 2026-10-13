import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';

// Reuse the locked Prism toolchain, not undeclared root/hoisted dependencies.
// A toolchain change must fail/escalate, never install dependencies from here.
const require = createRequire(import.meta.url);
const prismRequire = createRequire(require.resolve('@stoplight/prism-cli/package.json'));
const validatorRequire = createRequire(prismRequire.resolve('@stoplight/prism-http/package.json'));
const Ajv2020 = validatorRequire('ajv/dist/2020.js');
const addFormats = validatorRequire('ajv-formats');
const schemaId = 'urn:save-a-life:contract';
const methods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
// Frozen final E2/E3 inventory: 71 success + 34 variants (16 media collections)
// + 280 declared errors = 385 HTTP cases (before the F2a review hardening below). The sites GET adds one operation,
// two media variants and four errors to T4a; DELETE adds its uniform 400 in E3.
// F2a (2026-10-12) adds enrollMfaFactor (1 success, 5 errors) and the 422 of
// createHospitalSite/updateHospitalSite (2 errors).
// F2a review hardening (2026-10-12) declares 42 more errors (400 on the typed inputs, 503 on every
// non-health operation, and the specific 403/409/422 that the backend really returns): 322 / 427.
// Second review round adds 29 more (429, 500, the 403 of createSession and two 422): 351 / 456.
// Third review round adds 4 more (403 of csrf-token and session, 400 of the health pair): 355 / 460.
// F3 (2026-10-13) adds 10 more (400, 429 and 503 on the need list/get/transition and 429/503 on the create): 365 / 470.
// Updating coverage requires explicit review; never derive it from the candidate.
const expected = { operations: 71, json: 69, empty: 2, bodies: 26, variants: 34, variantCollections: 16, errors: 365 };

// Reviewed E2/E3 coverage fixture (method, path template, operationId), not a second
// contract: NO payloads, schemas or behavior. Never derive/refresh it from the
// candidate spec at runtime; any reviewed scope change must update this fixture.
const reviewedOperations = Object.freeze([
  ['get', '/health/live', 'getLiveness'],
  ['get', '/health/ready', 'getReadiness'],
  ['get', '/api/v1/auth/csrf-token', 'getCsrfToken'],
  ['get', '/api/v1/auth/session', 'getCurrentSession'],
  ['post', '/api/v1/auth/sessions', 'createSession'],
  ['delete', '/api/v1/auth/sessions/current', 'deleteCurrentSession'],
  ['post', '/api/v1/auth/password-recovery-requests', 'requestPasswordRecovery'],
  ['post', '/api/v1/auth/password-reset-actions/{token}', 'completePasswordReset'],
  ['post', '/api/v1/auth/mfa-verifications', 'verifyMfaChallenge'],
  ['post', '/api/v1/auth/mfa-enrollments', 'enrollMfaFactor'],
  ['post', '/api/v1/auth/step-up-verifications', 'verifyStepUp'],
  ['post', '/api/v1/donor-registrations', 'createDonorRegistration'],
  ['get', '/api/v1/donor-email-verification-actions/{token}', 'getDonorEmailVerificationPreview'],
  ['post', '/api/v1/donor-email-verification-actions/{token}', 'verifyDonorEmail'],
  ['get', '/api/v1/assisted-activation-actions/{token}', 'getAssistedActivationPreview'],
  ['post', '/api/v1/assisted-activation-actions/{token}/claim', 'claimAssistedRegistration'],
  ['put', '/api/v1/donors/me/onboarding-profile', 'completeDonorOnboarding'],
  ['get', '/api/v1/donors/me/profile', 'getOwnDonorProfile'],
  ['patch', '/api/v1/donors/me/profile', 'updateOwnDonorParticipation'],
  ['get', '/api/v1/donors/me/invitations', 'listOwnInvitations'],
  ['get', '/api/v1/donors/me/invitations/{invitationId}', 'getOwnInvitation'],
  ['patch', '/api/v1/donors/me/invitations/{invitationId}/response', 'changeOwnInvitationResponse'],
  ['get', '/api/v1/donors/me/responses', 'listOwnResponseHistory'],
  ['get', '/api/v1/donors/me/correction-requests', 'listOwnCorrectionRequests'],
  ['post', '/api/v1/donors/me/correction-requests', 'createOwnCorrectionRequest'],
  ['get', '/api/v1/donors/me/correction-requests/{requestId}', 'getOwnCorrectionRequest'],
  ['get', '/api/v1/donor-email-change-actions/{token}', 'getEmailChangePreview'],
  ['post', '/api/v1/donor-email-change-actions/{token}', 'verifyEmailChange'],
  ['get', '/api/v1/donors/me/recognition-policies', 'listPublishedRecognitionPolicies'],
  ['get', '/api/v1/legal-information/donation-work', 'getDonationWorkInformation'],
  ['get', '/api/v1/invitation-actions/{token}', 'getInvitationActionPreview'],
  ['post', '/api/v1/invitation-actions/{token}/response', 'recordInitialInvitationResponse'],
  ['get', '/api/v1/hospitals/me/sites', 'listOwnHospitalSites'],
  ['get', '/api/v1/hospitals/me/needs', 'listOwnHospitalNeeds'],
  ['post', '/api/v1/hospitals/me/needs', 'createHospitalNeed'],
  ['get', '/api/v1/hospitals/me/needs/{needId}', 'getOwnHospitalNeed'],
  ['patch', '/api/v1/hospitals/me/needs/{needId}', 'transitionOwnHospitalNeed'],
  ['get', '/api/v1/hospitals/me/needs/{needId}/invitation-batches', 'listOwnInvitationBatches'],
  ['post', '/api/v1/hospitals/me/needs/{needId}/invitation-batches', 'requestInvitationBatch'],
  ['get', '/api/v1/hospitals/me/needs/{needId}/responses', 'listOwnNeedResponses'],
  ['get', '/api/v1/hospitals/me/assisted-signups', 'listOwnAssistedSignups'],
  ['post', '/api/v1/hospitals/me/assisted-signups', 'createAssistedSignup'],
  ['get', '/api/v1/hospitals/me/assisted-signups/{signupId}', 'getOwnAssistedSignup'],
  ['post', '/api/v1/hospitals/me/assisted-signups/{signupId}/activation-links', 'reissueAssistedActivationLink'],
  ['get', '/api/v1/hospitals/me/recognition-policy', 'getOwnRecognitionPolicy'],
  ['put', '/api/v1/hospitals/me/recognition-policy', 'publishOwnRecognitionPolicy'],
  ['delete', '/api/v1/hospitals/me/recognition-policy', 'withdrawOwnRecognitionPolicy'],
  ['get', '/api/v1/hospital-admin-invitation-actions/{token}', 'getHospitalAdminInvitationPreview'],
  ['post', '/api/v1/hospital-admin-invitation-actions/{token}/claim', 'claimHospitalAdminInvitation'],
  ['get', '/api/v1/superadmin/task-queue', 'listSuperadminTasks'],
  ['get', '/api/v1/superadmin/hospitals', 'listHospitals'],
  ['post', '/api/v1/superadmin/hospitals', 'createHospital'],
  ['get', '/api/v1/superadmin/hospitals/{hospitalId}', 'getHospital'],
  ['patch', '/api/v1/superadmin/hospitals/{hospitalId}', 'updateHospital'],
  ['get', '/api/v1/superadmin/hospitals/{hospitalId}/sites', 'listHospitalSites'],
  ['post', '/api/v1/superadmin/hospitals/{hospitalId}/sites', 'createHospitalSite'],
  ['patch', '/api/v1/superadmin/sites/{siteId}', 'updateHospitalSite'],
  ['get', '/api/v1/superadmin/memberships', 'listHospitalMemberships'],
  ['post', '/api/v1/superadmin/hospital-admin-invitations', 'inviteHospitalAdmin'],
  ['patch', '/api/v1/superadmin/memberships/{membershipId}', 'revokeHospitalMembership'],
  ['get', '/api/v1/superadmin/correction-requests', 'listCorrectionRequests'],
  ['get', '/api/v1/superadmin/correction-requests/{requestId}', 'getCorrectionRequest'],
  ['patch', '/api/v1/superadmin/correction-requests/{requestId}', 'decideCorrectionRequest'],
  ['get', '/api/v1/superadmin/correction-requests/{requestId}/donor-data', 'getContextualDonorData'],
  ['post', '/api/v1/superadmin/correction-requests/{requestId}/executions', 'executeApprovedCorrectionRequest'],
  ['post', '/api/v1/superadmin/access-grants', 'createContextualAccessGrant'],
  ['get', '/api/v1/superadmin/configuration', 'getSuperadminConfiguration'],
  ['patch', '/api/v1/superadmin/configuration', 'setFinalDemoAt'],
  ['get', '/api/v1/superadmin/audit-events', 'listAuditEvents'],
  ['get', '/api/v1/superadmin/recognition-policies', 'listRecognitionPoliciesForModeration'],
  ['patch', '/api/v1/superadmin/recognition-policies/{hospitalId}/moderation', 'moderateRecognitionPolicy'],
].map((tuple) => JSON.stringify(tuple)));

export class ContractError extends Error {
  constructor(code) {
    super(`Contract runner: ${code}.`);
    this.code = code;
  }
}

function check(condition, code) {
  if (!condition) throw new ContractError(code);
}

function assertReviewedOperations(spec) {
  const actual = [];
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (methods.has(method)) actual.push(JSON.stringify([method, path, operation.operationId]));
    }
  }
  const reviewed = new Set(reviewedOperations);
  check(reviewed.size === expected.operations && actual.length === reviewed.size
    && new Set(actual).size === actual.length && actual.every((tuple) => reviewed.has(tuple)), 'COVERAGE_INVENTORY');
}

function localRef(spec, ref) {
  check(typeof ref === 'string' && ref.startsWith('#/'), 'LOCAL_REF');
  const value = ref.slice(2).split('/').reduce((node, key) =>
    node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], spec);
  check(value !== undefined, 'LOCAL_REF');
  return value;
}

function resolve(spec, object, seen = new Set()) {
  if (!object?.$ref) return object;
  check(!seen.has(object.$ref), 'LOCAL_REF');
  seen.add(object.$ref);
  return resolve(spec, localRef(spec, object.$ref), seen);
}

function auditRefs(spec, value) {
  if (!value || typeof value !== 'object') return;
  if (value.$ref) localRef(spec, value.$ref);
  check(!Object.hasOwn(value, 'externalValue'), 'LOCAL_REF');
  for (const child of Object.values(value)) auditRefs(spec, child);
}

export function schemaValidator(spec) {
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true, logger: false });
  addFormats(ajv);
  ajv.addSchema(spec, schemaId);
  return (schema) => {
    check(schema !== undefined, 'SCHEMA_MISSING');
    // Scope inline schemas to the canonical document, preserving $ref siblings.
    const scoped = JSON.parse(JSON.stringify(schema, (key, value) =>
      key === '$ref' && typeof value === 'string' && value.startsWith('#/') ? `${schemaId}${value}` : value));
    try { return ajv.compile(scoped); }
    catch { throw new ContractError('SCHEMA_COMPILE'); }
  };
}

function assertMediaExamplesExclusive(media) {
  check(!(media && Object.hasOwn(media, 'example') && Object.hasOwn(media, 'examples')), 'MEDIA_EXAMPLE_XOR');
}

function auditSchemaExamples(spec, validate) {
  const visited = new WeakSet();
  let count = 0;
  function visitSchema(schema) {
    if (!schema || typeof schema !== 'object' || visited.has(schema)) return;
    visited.add(schema);
    const values = Object.hasOwn(schema, 'example') ? [schema.example] : [];
    if (Object.hasOwn(schema, 'examples')) {
      check(Array.isArray(schema.examples), 'SCHEMA_EXAMPLE');
      values.push(...schema.examples);
    }
    if (values.length) {
      const valid = validate(schema); // Preserve $ref siblings and writeOnly annotations.
      for (const value of values) check(value !== undefined && valid(value), 'SCHEMA_EXAMPLE');
      count += values.length;
    }
    if (schema.$ref) visitSchema(localRef(spec, schema.$ref));
    // Traverse only schema-bearing vocabulary, never literal example/default data.
    for (const keyword of ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas']) {
      for (const child of Object.values(schema[keyword] ?? {})) visitSchema(child);
    }
    for (const keyword of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
      for (const child of schema[keyword] ?? []) visitSchema(child);
    }
    for (const keyword of ['items', 'contains', 'additionalProperties', 'unevaluatedProperties',
      'unevaluatedItems', 'propertyNames', 'not', 'if', 'then', 'else', 'contentSchema']) visitSchema(schema[keyword]);
  }
  function visitDocument(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['example', 'examples', 'value', 'schemas'].includes(key)) continue;
      if (key === 'schema') visitSchema(child);
      else {
        if (key === 'content') for (const media of Object.values(child ?? {})) assertMediaExamplesExclusive(media);
        visitDocument(child);
      }
    }
  }
  for (const schema of Object.values(spec.components?.schemas ?? {})) visitSchema(schema);
  visitDocument(spec); // Inline media/parameter/header schemas, including unused components.
  return count;
}

function selectedExamples(spec, media, request = false) {
  assertMediaExamplesExclusive(media);
  if (media?.example !== undefined) return [{ value: media.example }];
  if (media?.examples) return Object.entries(media.examples).map(([name, entry]) => {
    check(/^[a-zA-Z0-9_-]+$/.test(name), 'EXAMPLE_NAME');
    return { name, value: resolve(spec, entry)?.value };
  });
  if (request) return [];
  const schema = resolve(spec, media?.schema);
  if (schema?.example !== undefined) return [{ value: schema.example }];
  if (schema?.examples?.length) return schema.examples.map((value) => ({ value }));
  return [];
}

function parameterValue(spec, parameter) {
  const schema = resolve(spec, parameter.schema);
  if (parameter.example !== undefined) return parameter.example;
  if (schema.const !== undefined) return schema.const;
  if (schema.enum) return schema.enum[0];
  if (schema.default !== undefined) return schema.default;
  if (schema.type === 'integer' || schema.type === 'number') return schema.minimum ?? 1;
  if (schema.type === 'boolean') return true;
  check(schema.type === 'string', 'PARAMETER_INPUT');
  if (schema.format === 'uuid') return '00000000-0000-4000-8000-000000000001';
  return 'synthetic-contract-placeholder'.padEnd(schema.minLength ?? 0, 'x');
}

function requestFor(spec, path, pathItem, operation, validate) {
  const query = new URLSearchParams();
  const headers = { Accept: 'application/json' };
  const cookies = [];
  let route = path;
  const parameters = new Map();
  for (const raw of [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]) {
    const parameter = resolve(spec, raw);
    parameters.set(`${parameter.in}:${parameter.name}`, parameter);
  }
  for (const parameter of parameters.values()) {
    const value = parameterValue(spec, parameter);
    check(validate(parameter.schema)(value), 'PARAMETER_INPUT');
    check(!parameter.style || ['simple', 'form'].includes(parameter.style), 'PARAMETER_INPUT');
    if (parameter.in === 'path') {
      check(parameter.required && route.includes(`{${parameter.name}}`), 'PARAMETER_INPUT');
      route = route.replaceAll(`{${parameter.name}}`, encodeURIComponent(String(value)));
    } else if (parameter.in === 'query') query.set(parameter.name, String(value));
    else if (parameter.in === 'header') headers[parameter.name] = String(value);
    else if (parameter.in === 'cookie') cookies.push(`${parameter.name}=${encodeURIComponent(String(value))}`);
    else throw new ContractError('PARAMETER_INPUT');
  }
  check(!/[{}]/.test(route) && route.startsWith('/') && !route.startsWith('//') && !/[?#]/.test(route), 'PARAMETER_INPUT');
  const security = operation.security ?? spec.security ?? [];
  if (security.length) {
    for (const [name, scopes] of Object.entries(security[0])) {
      const scheme = resolve(spec, spec.components.securitySchemes[name]);
      check(scheme?.type === 'apiKey' && scopes.length === 0, 'SECURITY_INPUT');
      const value = 'synthetic-contract-security-placeholder';
      if (scheme.in === 'cookie') cookies.push(`${scheme.name}=${value}`);
      else if (scheme.in === 'header') headers[scheme.name] = value;
      else if (scheme.in === 'query') query.set(scheme.name, value);
      else throw new ContractError('SECURITY_INPUT');
    }
  }
  if (cookies.length) headers.Cookie = cookies.join('; ');
  if (!['get', 'head', 'options'].includes(operation.method)) headers.Origin = 'http://127.0.0.1:5173';
  let body;
  if (operation.requestBody) {
    const media = resolve(spec, operation.requestBody)?.content?.['application/json'];
    const values = selectedExamples(spec, media, true);
    check(values.length > 0, 'REQUEST_EXAMPLE');
    const bodyValidator = validate(media.schema);
    for (const example of values) check(example.value !== undefined && bodyValidator(example.value), 'REQUEST_EXAMPLE');
    body = JSON.stringify(values[0].value);
    headers['Content-Type'] = 'application/json';
  }
  return { route, query, headers, body, method: operation.method.toUpperCase() };
}

export function buildPlan(spec) {
  check(spec.openapi === '3.1.0', 'OPENAPI_VERSION');
  check(!(spec.info?.license?.identifier !== undefined && spec.info?.license?.url !== undefined), 'LICENSE_XOR');
  auditRefs(spec, spec);
  assertReviewedOperations(spec);
  const validate = schemaValidator(spec);
  const schemaExamples = auditSchemaExamples(spec, validate);
  const stats = { operations: 0, json: 0, empty: 0, bodies: 0, variants: 0, variantCollections: 0, errors: 0, schemaExamples };
  const cases = [];
  const operationIds = new Set();
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const [method, rawOperation] of Object.entries(pathItem)) {
      if (!methods.has(method)) continue;
      const operation = { ...rawOperation, method };
      check(/^[a-zA-Z0-9]+$/.test(operation.operationId) && !operationIds.has(operation.operationId), 'OPERATION_ID');
      operationIds.add(operation.operationId);
      stats.operations += 1;
      if (operation.requestBody) stats.bodies += 1;
      const request = requestFor(spec, path, pathItem, operation, validate);
      const responses = Object.entries(operation.responses);
      check(responses.filter(([status]) => /^2\d\d$/.test(status)).length === 1, 'SUCCESS_COVERAGE');
      for (const [statusText, rawResponse] of responses) {
        check(/^[245]\d\d$/.test(statusText), 'STATUS_COVERAGE');
        const status = Number(statusText);
        const response = resolve(spec, rawResponse);
        const kind = status < 300 ? 'success' : 'error';
        const base = { id: `${operation.operationId}:${kind}:${status}`, kind, operationId: operation.operationId, status, request };
        if (status === 204) {
          check(!response.content, 'RESPONSE_EMPTY');
          stats.empty += 1;
          cases.push(base);
          continue;
        }
        const media = response.content?.['application/json'];
        check(media, 'RESPONSE_MEDIA');
        const responseValidator = validate(media.schema);
        const values = selectedExamples(spec, media);
        check(values.length > 0, 'RESPONSE_EXAMPLE');
        for (const example of values) check(example.value !== undefined && responseValidator(example.value), 'RESPONSE_EXAMPLE');
        cases.push({ ...base, validate: responseValidator, example: values[0].value,
          exampleName: values[0].name });
        if (kind === 'success') stats.json += 1;
        else stats.errors += 1;
        if (values.some((value) => value.name)) stats.variantCollections += 1;
        for (const example of values.filter((value) => value.name)) {
          stats.variants += 1;
          cases.push({ ...base, kind: 'variant', id: `${operation.operationId}:variant:${status}:${example.name}`,
            validate: responseValidator, example: example.value, exampleName: example.name });
        }
      }
    }
  }
  for (const [key, count] of Object.entries(expected)) check(stats[key] === count, 'COVERAGE_INVENTORY');
  check(new Set(cases.map((item) => item.id)).size === cases.length, 'COVERAGE_INVENTORY');
  return { cases, stats };
}

export function assertCoverage(plan, completed) {
  check(completed.size === plan.cases.length && plan.cases.every((item) => completed.has(item.id)), 'COVERAGE_EXECUTION');
}

export function assertResponse(item, status, contentType, text) {
  if (status !== item.status) {
    const error = new ContractError('RESPONSE_STATUS');
    error.message += ` Expected ${item.status}, received ${status}.`;
    throw error;
  }
  if (item.status === 204) return check(text === '', 'RESPONSE_EMPTY');
  check(/^application\/json(?:\s*;|$)/i.test(contentType), 'RESPONSE_MEDIA');
  let body;
  try { body = JSON.parse(text); }
  catch { throw new ContractError('RESPONSE_JSON'); }
  check(item.validate(body), 'RESPONSE_SCHEMA');
  check(isDeepStrictEqual(body, item.example), 'RESPONSE_EXAMPLE_SELECTION');
}

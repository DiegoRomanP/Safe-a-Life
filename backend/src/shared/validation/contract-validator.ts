import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv/dist/2020.js';
import formatsModule from 'ajv-formats';
import ratifiedSnapshot from '../../contract/ratified-schemas.generated.json' with { type: 'json' };
import { classifyValidationFailure } from './classify.js';

export type ContractErrorCategory = 'shape' | 'rule' | 'output';

const MESSAGES: Readonly<Record<ContractErrorCategory, string>> = {
  shape: 'La forma de la solicitud no es válida.',
  rule: 'Uno o más valores no cumplen las reglas del campo.',
  output: 'La respuesta no es válida.',
};

/** Nunca incluye el valor inválido ni la ruta del error. shape → 400, rule → 422, output → 500. */
export class ContractValidationError extends Error {
  readonly category: ContractErrorCategory;

  constructor(category: ContractErrorCategory) {
    super(MESSAGES[category]);
    this.name = 'ContractValidationError';
    this.category = category;
  }
}

export interface OperationValidator {
  parseBody(value: unknown): unknown;
  parseQuery(query: Readonly<Record<string, unknown>>): unknown;
  parseParams(params: Readonly<Record<string, unknown>>): unknown;
  /** Cabeceras propias de la operación (p. ej. X-Contextual-Grant); los nombres no distinguen mayúsculas. */
  parseHeaders(headers: Readonly<Record<string, unknown>>): unknown;
  assertSuccess(value: unknown): unknown;
}

interface OperationEntry {
  readonly body: string | null;
  readonly query: string;
  readonly params: string | null;
  readonly headers: string | null;
  readonly success: { readonly def: string };
}

export interface RatifiedSnapshot {
  readonly $id: string;
  readonly operations: Readonly<Record<string, OperationEntry>>;
  readonly $defs: Readonly<Record<string, Record<string, unknown>>>;
}

const INTEGER_TEXT = /^-?\d+$/;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

/** PostgreSQL no admite U+0000 en texto: llegaría como 500 desde PostgREST. Es una entrada mal formada (400). */
function containsNul(value: unknown, depth = 0): boolean {
  if (typeof value === 'string') return value.includes('\u0000');
  if (depth > 32 || typeof value !== 'object' || value === null) return false;
  return Object.entries(value).some(([key, child]) => key.includes('\u0000') || containsNul(child, depth + 1));
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Copia solo propiedades propias y falla si el objeto trae un getter o un prototipo inesperado. */
function ownCopy(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  if (!isPlainRecord(value)) throw new ContractValidationError('shape');
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(value)) copy[key] = value[key];
  return copy;
}

export function createOperationCompiler(snapshot: RatifiedSnapshot): (operationId: string) => OperationValidator {
  const { operations: _operations, ...schema } = snapshot;
  const ajv = new Ajv2020({
    allErrors: false,
    strict: true,
    strictNumbers: true,
    validateFormats: true,
    ownProperties: true,
    useDefaults: false,
    coerceTypes: false,
    removeAdditional: false,
    multipleOfPrecision: 6,
    logger: false,
  });
  formatsModule.default(ajv);
  ajv.addSchema(schema);

  const compileDef = (name: string): ValidateFunction => ajv.compile({ $ref: `${snapshot.$id}#/$defs/${name}` });

  /** Las propiedades `integer` de la query llegan como texto: se convierten solo si son enteros decimales. */
  const integerProperties = (queryDef: string): ReadonlySet<string> => {
    const properties = (snapshot.$defs[queryDef]?.properties ?? {}) as Record<string, { type?: unknown; $ref?: unknown }>;
    const names = new Set<string>();
    for (const [name, property] of Object.entries(properties)) {
      const resolved = typeof property.$ref === 'string' ? snapshot.$defs[property.$ref.split('/').pop() ?? ''] : property;
      if (resolved?.type === 'integer') names.add(name);
    }
    return names;
  };

  const cache = new Map<string, OperationValidator>();

  return (operationId) => {
    const cached = cache.get(operationId);
    if (cached) return cached;
    if (!Object.hasOwn(snapshot.operations, operationId)) throw new Error('Operación no ratificada.');
    const entry = snapshot.operations[operationId];

    const body = entry.body ? compileDef(entry.body) : null;
    const query = compileDef(entry.query);
    const params = entry.params ? compileDef(entry.params) : null;
    const headers = entry.headers ? compileDef(entry.headers) : null;
    const success = compileDef(entry.success.def);
    const integers = integerProperties(entry.query);
    const headerNames = new Map(
      Object.keys((entry.headers ? snapshot.$defs[entry.headers]?.properties : {}) ?? {}).map((name) => [name.toLowerCase(), name]),
    );

    const check = (validate: ValidateFunction | null, value: unknown): unknown => {
      if (containsNul(value)) throw new ContractValidationError('shape');
      if (validate === null) {
        // Sin contrato para esta parte: cualquier valor presente es ajeno a la operación.
        if (isPlainRecord(value) && Object.keys(value).length === 0) return deepFreeze({});
        if (value === undefined) return undefined;
        throw new ContractValidationError('shape');
      }
      if (!validate(value)) throw new ContractValidationError(classifyValidationFailure(validate.errors));
      return deepFreeze(structuredClone(value));
    };

    const validator: OperationValidator = {
      parseBody: (value) => check(body, value),
      parseQuery(raw) {
        const copy = ownCopy(raw);
        for (const [key, value] of Object.entries(copy)) {
          if (typeof value !== 'string') throw new ContractValidationError('shape');
          if (integers.has(key) && INTEGER_TEXT.test(value)) copy[key] = Number(value);
        }
        return check(query, copy);
      },
      parseParams: (raw) => check(params, ownCopy(raw)),
      parseHeaders(raw) {
        const copy: Record<string, unknown> = {};
        for (const [name, value] of Object.entries(ownCopy(raw))) {
          const canonical = headerNames.get(name.toLowerCase());
          if (canonical !== undefined) copy[canonical] = value;
        }
        return check(headers, copy);
      },
      assertSuccess(value) {
        if (!success(value)) throw new ContractValidationError('output');
        return deepFreeze(structuredClone(value));
      },
    };
    cache.set(operationId, validator);
    return validator;
  };
}

export const compileOperation = createOperationCompiler(ratifiedSnapshot as unknown as RatifiedSnapshot);

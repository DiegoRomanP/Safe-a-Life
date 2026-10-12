import { describe, expect, it } from 'vitest';
import {
  compileOperation,
  ContractValidationError,
  createOperationCompiler,
  type RatifiedSnapshot,
} from './contract-validator.js';

const SNAPSHOT: RatifiedSnapshot = {
  $id: 'https://save-a-life.invalid/schemas/test.json',
  operations: {
    listThings: {
      body: null,
      query: 'ListThingsQuery',
      params: null,
      headers: null,
      success: { def: 'ListThingsSuccess' },
    },
    putThing: {
      body: 'PutThingBody',
      query: 'PutThingQuery',
      params: 'PutThingPath',
      headers: 'PutThingHeaders',
      success: { def: 'PutThingSuccess' },
    },
    dropThing: {
      body: null,
      query: 'DropThingQuery',
      params: null,
      headers: null,
      success: { def: 'DropThingSuccess' },
    },
  },
  $defs: {
    Limit: { type: 'integer', minimum: 1, maximum: 100 },
    ListThingsQuery: {
      type: 'object',
      additionalProperties: false,
      properties: { limit: { $ref: '#/$defs/Limit' }, cursor: { type: 'string', maxLength: 512 } },
    },
    ListThingsSuccess: {
      type: 'object',
      additionalProperties: false,
      required: ['data'],
      properties: { data: { type: 'array', items: { type: 'string' } } },
    },
    PutThingBody: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: { type: 'string', maxLength: 5 },
        score: { type: 'number', multipleOf: 0.001 },
        kind: { enum: ['a', 'b'] },
      },
    },
    PutThingQuery: { type: 'object', additionalProperties: false, properties: {} },
    PutThingPath: {
      type: 'object',
      additionalProperties: false,
      required: ['thingId'],
      properties: { thingId: { type: 'string', format: 'uuid' } },
    },
    PutThingHeaders: {
      type: 'object',
      additionalProperties: false,
      required: ['X-Contextual-Grant'],
      properties: { 'X-Contextual-Grant': { type: 'string' } },
    },
    PutThingSuccess: { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { const: true } } },
    DropThingQuery: { type: 'object', additionalProperties: false, properties: {} },
    DropThingSuccess: { const: null },
  },
};

const compile = createOperationCompiler(SNAPSHOT);

function categoryOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof ContractValidationError) return error.category;
    throw error;
  }
  return 'ok';
}

describe('validador genérico por operación', () => {
  it('convierte a número solo las propiedades integer de la query que son enteros decimales', () => {
    const list = compile('listThings');

    expect(list.parseQuery({ limit: '20', cursor: 'abc' })).toEqual({ limit: 20, cursor: 'abc' });
    expect(categoryOf(() => list.parseQuery({ limit: '2.5' }))).toBe('shape');
    expect(categoryOf(() => list.parseQuery({ limit: '1e2' }))).toBe('shape');
    expect(categoryOf(() => list.parseQuery({ limit: '0' }))).toBe('rule');
    expect(categoryOf(() => list.parseQuery({ limit: '101' }))).toBe('rule');
  });

  it('rechaza claves desconocidas y valores repetidos en la query', () => {
    const list = compile('listThings');

    expect(categoryOf(() => list.parseQuery({ extra: '1' }))).toBe('shape');
    expect(categoryOf(() => list.parseQuery({ limit: ['1', '2'] }))).toBe('shape');
    expect(categoryOf(() => list.parseQuery({ cursor: { a: 'b' } }))).toBe('shape');
  });

  it('clasifica el body: campos faltantes o ajenos son shape y valores fuera de regla son rule', () => {
    const put = compile('putThing');

    expect(put.parseBody({ name: 'ok', score: 1.5, kind: 'a' })).toEqual({ name: 'ok', score: 1.5, kind: 'a' });
    expect(categoryOf(() => put.parseBody({}))).toBe('shape');
    expect(categoryOf(() => put.parseBody({ name: 'ok', hospitalId: 'x' }))).toBe('shape');
    expect(categoryOf(() => put.parseBody({ name: 'ok', kind: 'z' }))).toBe('rule');
    expect(categoryOf(() => put.parseBody({ name: 'ok', score: 1.0005 }))).toBe('rule');
    expect(categoryOf(() => put.parseBody('texto'))).toBe('shape');
  });

  it('rechaza como shape cualquier texto con U+0000 (clave o valor, anidado o no) en body, query y params', () => {
    const put = compile('putThing');

    expect(categoryOf(() => put.parseBody({ name: 'a\u0000b' }))).toBe('shape');
    expect(categoryOf(() => put.parseBody({ 'na\u0000me': 'ok' }))).toBe('shape');
    expect(categoryOf(() => compile('listThings').parseQuery({ cursor: 'a\u0000' }))).toBe('shape');
    expect(categoryOf(() => put.parseParams({ thingId: '\u0000' }))).toBe('shape');
  });

  it('devuelve copias congeladas y no muta la entrada', () => {
    const input = { name: 'ok' };
    const parsed = compile('putThing').parseBody(input) as { name: string };

    expect(Object.isFrozen(parsed)).toBe(true);
    expect(parsed).not.toBe(input);
    expect(Object.isFrozen(input)).toBe(false);
  });

  it('valida los parámetros de ruta y las cabeceras propias sin distinguir mayúsculas', () => {
    const put = compile('putThing');
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';

    expect(put.parseParams({ thingId: id })).toEqual({ thingId: id });
    expect(categoryOf(() => put.parseParams({ thingId: 'no-uuid' }))).toBe('shape');
    expect(put.parseHeaders({ 'x-contextual-grant': 'g1', host: 'ignorada' })).toEqual({ 'X-Contextual-Grant': 'g1' });
    expect(categoryOf(() => put.parseHeaders({ host: 'solo-ajena' }))).toBe('shape');
  });

  it('rechaza partes que la operación no declara', () => {
    const list = compile('listThings');

    expect(list.parseParams({})).toEqual({});
    expect(categoryOf(() => list.parseParams({ x: '1' }))).toBe('shape');
    expect(list.parseBody(undefined)).toBeUndefined();
    expect(categoryOf(() => list.parseBody({ a: 1 }))).toBe('shape');
  });

  it('valida la salida antes de enviarla y la clasifica como output', () => {
    expect(compile('listThings').assertSuccess({ data: ['a'] })).toEqual({ data: ['a'] });
    expect(categoryOf(() => compile('listThings').assertSuccess({ data: 'x' }))).toBe('output');
    expect(categoryOf(() => compile('listThings').assertSuccess({ data: [], extra: 1 }))).toBe('output');
    expect(compile('dropThing').assertSuccess(null)).toBeNull();
    expect(categoryOf(() => compile('dropThing').assertSuccess({}))).toBe('output');
  });

  it('no incluye valores ni rutas en el mensaje del error', () => {
    try {
      compile('putThing').parseBody({ name: 'canario-secreto-demasiado-largo' });
      throw new Error('se esperaba un fallo');
    } catch (error) {
      expect((error as Error).message).not.toContain('canario');
    }
  });

  it('falla de forma explícita con una operación no ratificada', () => {
    expect(() => compile('noExiste')).toThrow('Operación no ratificada.');
    expect(() => compile('constructor')).toThrow('Operación no ratificada.');
  });
});

describe('contrato real ratificado', () => {
  it('compila createHospitalNeed y valida su cuerpo cerrado', () => {
    const create = compileOperation('createHospitalNeed');

    expect(categoryOf(() => create.parseBody({ hospitalId: 'x' }))).toBe('shape');
    expect(create.parseParams({})).toEqual({});
  });
});

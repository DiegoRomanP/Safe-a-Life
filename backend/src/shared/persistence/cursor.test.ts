import { describe, expect, it } from 'vitest';
import { ApiError } from '../http/errors.js';
import { decodeCursor, encodeCursor, MAX_CURSOR_LENGTH } from './cursor.js';

const SECRET = 'cursor-secret-'.padEnd(40, 'x');
const POSITION = { createdAt: '2026-10-12T19:47:33.511Z', id: '0f8fad5b-d9cb-469f-a165-70867728950e' };

describe('cursor firmado', () => {
  it('recupera la posición para el mismo ámbito y secreto', () => {
    const cursor = encodeCursor('user:1:listHospitals', POSITION, SECRET);

    expect(decodeCursor('user:1:listHospitals', cursor, SECRET)).toEqual(POSITION);
    expect(cursor.length).toBeLessThanOrEqual(MAX_CURSOR_LENGTH);
  });

  it('rechaza con 400 un cursor de otro ámbito, otro secreto o manipulado', () => {
    const cursor = encodeCursor('user:1:listHospitals', POSITION, SECRET);
    const [body, mac] = cursor.split('.');
    const forged = `${Buffer.from(JSON.stringify(['2020-01-01T00:00:00Z', POSITION.id])).toString('base64url')}.${mac}`;

    for (const bad of [cursor + 'x', forged, `${body}.`, body, '', 'a.b.c']) {
      expect(() => decodeCursor('user:1:listHospitals', bad, SECRET)).toThrowError(ApiError);
    }
    expect(() => decodeCursor('user:2:listHospitals', cursor, SECRET)).toThrowError(ApiError);
    expect(() => decodeCursor('user:1:listHospitals', cursor, 'otro-secreto'.padEnd(40, 'y'))).toThrowError(ApiError);
  });

  it('rechaza cursores demasiado largos y no expone PII en su contenido', () => {
    expect(() => decodeCursor('s', 'a'.repeat(MAX_CURSOR_LENGTH + 1), SECRET)).toThrowError(ApiError);
    const cursor = encodeCursor('s', POSITION, SECRET);
    expect(Buffer.from(cursor.split('.')[0], 'base64url').toString()).toBe(JSON.stringify([POSITION.createdAt, POSITION.id]));
  });
});

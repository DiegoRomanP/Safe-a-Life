/** UUID en su forma canónica (8-4-4-4-12 hexadecimales). `format: uuid` de ajv-formats también admite `urn:uuid:…`. */
export const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCanonicalUuid(value: string): boolean {
  return CANONICAL_UUID.test(value);
}

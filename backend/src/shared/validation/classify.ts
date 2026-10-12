export type ValidationFailureCategory = 'shape' | 'rule';

const shapeKeywords = new Set([
  'additionalProperties', 'format', 'maxLength', 'maxProperties', 'minLength', 'minProperties',
  'pattern', 'required', 'type',
]);
const ruleKeywords = new Set([
  'const', 'enum', 'exclusiveMaximum', 'exclusiveMinimum', 'maximum', 'minimum', 'multipleOf',
]);

/**
 * `shape` (400): la estructura no coincide con el contrato. `rule` (422): la
 * estructura es válida pero un valor incumple una regla del campo. Ante la duda
 * (sin errores o solo keywords desconocidos) gana `shape`.
 */
export function classifyValidationFailure(errors: readonly { keyword: string }[] | null | undefined): ValidationFailureCategory {
  if (!errors?.length || errors.some(({ keyword }) => shapeKeywords.has(keyword))) return 'shape';
  if (errors.some(({ keyword }) => ruleKeywords.has(keyword))) return 'rule';
  return 'shape';
}

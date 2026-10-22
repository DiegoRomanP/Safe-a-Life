import { Ajv2020 } from 'ajv/dist/2020.js';
import formatsModule from 'ajv-formats';
import { classifyValidationFailure } from '../../../shared/validation/classify.js';
import contractSnapshot from './contract.generated.json' with { type: 'json' };
import type { components, operations } from './openapi.js';

export type CreateNeedInputDto = Readonly<components['schemas']['CreateNeedRequest']>;
export type NormalizedCreateNeedInputDto = Readonly<Omit<CreateNeedInputDto, 'radiusKm'> & { radiusKm: number }>;
type CreatedNeedResponse = operations['createHospitalNeed']['responses'][201]['content']['application/json'];
export type CreatedNeedEnvelopeDto = Readonly<{ data: Readonly<CreatedNeedResponse['data']> }>;

export type NeedDtoErrorCategory = 'shape' | 'rule' | 'output';

const DEFAULT_RADIUS_KM = 10;
const requiredInputKeys: readonly string[] = contractSnapshot.$defs.CreateNeedRequest.required;
const requiredEnvelopeKeys: readonly string[] = contractSnapshot.$defs.NeedEnvelope.required;
const requiredNeedKeys: readonly string[] = contractSnapshot.$defs.Need.required;
const messages: Readonly<Record<NeedDtoErrorCategory, string>> = {
  shape: 'La forma de la solicitud no es válida.',
  rule: 'Uno o más valores no cumplen las reglas del campo.',
  output: 'La respuesta de la necesidad no es válida.',
};

export class NeedDtoError extends Error {
  readonly category: NeedDtoErrorCategory;

  constructor(category: NeedDtoErrorCategory) {
    super(messages[category]);
    this.name = 'NeedDtoError';
    this.category = category;
  }
}

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictNumbers: true,
  validateFormats: true,
  ownProperties: true,
  useDefaults: false,
  coerceTypes: false,
  removeAdditional: false,
  logger: false,
});

formatsModule.default(ajv);
ajv.addSchema(contractSnapshot);

const validateCreateNeedInput = ajv.compile<CreateNeedInputDto>({
  $ref: `${contractSnapshot.$id}#/$defs/CreateNeedRequest`,
});
const validateCreatedNeedEnvelope = ajv.compile<CreatedNeedResponse>({
  $ref: `${contractSnapshot.$id}#/$defs/CreateHospitalNeed201`,
});

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function hasOwnKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  try {
    return keys.every((key) => Object.hasOwn(value, key));
  } catch {
    return false;
  }
}

export function parseCreateNeedInput(value: unknown): NormalizedCreateNeedInputDto {
  if (!isPlainRecord(value) || !hasOwnKeys(value, requiredInputKeys)) throw new NeedDtoError('shape');
  if (!validateCreateNeedInput(value)) {
    throw new NeedDtoError(classifyValidationFailure(validateCreateNeedInput.errors));
  }

  const radiusKm = Object.hasOwn(value, 'radiusKm') ? value.radiusKm ?? DEFAULT_RADIUS_KM : DEFAULT_RADIUS_KM;
  return Object.freeze({
    component: value.component,
    requiredBloodType: value.requiredBloodType,
    targetConfirmations: value.targetConfirmations,
    siteId: value.siteId,
    radiusKm,
    urgency: value.urgency,
    expiresInHours: value.expiresInHours,
  });
}

export function parseCreatedNeedEnvelope(value: unknown): CreatedNeedEnvelopeDto {
  if (!isPlainRecord(value) || !hasOwnKeys(value, requiredEnvelopeKeys)) throw new NeedDtoError('output');
  const data = value.data;
  if (!isPlainRecord(data) || !hasOwnKeys(data, requiredNeedKeys)) throw new NeedDtoError('output');
  if (!validateCreatedNeedEnvelope(value)) throw new NeedDtoError('output');

  return Object.freeze({
    data: Object.freeze({
      needId: value.data.needId,
      component: value.data.component,
      requiredBloodType: value.data.requiredBloodType,
      targetConfirmations: value.data.targetConfirmations,
      confirmedIntentCount: value.data.confirmedIntentCount,
      siteId: value.data.siteId,
      radiusKm: value.data.radiusKm,
      urgency: value.data.urgency,
      status: value.data.status,
      expiresAt: value.data.expiresAt,
    }),
  });
}

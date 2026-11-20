import type { CorrectionRequest } from '../../features/donor/types.js';
import { malformed, oneOf, rec, str } from './validate.js';

const STATUS = ['pendiente', 'aprobada', 'rechazada', 'en_ejecucion', 'completada', 'fallida'] as const;
const FIELDS = ['name', 'email', 'declaredBloodType', 'deletion'] as const;

// CorrectionRequestSummary: lo comparten el donante (sus solicitudes) y el superadmin (la cola).
export const parseCorrectionRequest = (value: unknown): CorrectionRequest => {
  const v = rec(value);
  if (!Array.isArray(v.requestedFields)) malformed();
  return {
    requestId: str(v.requestId, 64),
    type: oneOf(v.type, ['correccion', 'eliminacion']),
    requestedFields: (v.requestedFields as unknown[]).map((field) => oneOf(field, FIELDS)),
    status: oneOf(v.status, STATUS),
    createdAt: str(v.createdAt, 40),
    updatedAt: str(v.updatedAt, 40),
    ...(v.decisionReason !== undefined ? { decisionReason: str(v.decisionReason, 300) } : {}),
  };
};

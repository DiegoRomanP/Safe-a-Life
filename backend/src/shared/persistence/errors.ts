/** El proveedor no respondió a tiempo o falló la red/5xx. Se presenta como 503. Sin mensajes del proveedor. */
export class PersistenceUnavailableError extends Error {
  constructor() {
    super('La persistencia no está disponible.');
    this.name = 'PersistenceUnavailableError';
  }
}

export type PersistenceFailureReason = 'jwt' | 'rejected' | 'shape';

/** Fallo no recuperable de persistencia o respuesta corrupta. Se presenta como 500 (o 401 si `reason` es `jwt`). */
export class PersistenceError extends Error {
  readonly reason: PersistenceFailureReason;

  constructor(reason: PersistenceFailureReason = 'rejected') {
    super('La operación de persistencia falló.');
    this.name = 'PersistenceError';
    this.reason = reason;
  }
}

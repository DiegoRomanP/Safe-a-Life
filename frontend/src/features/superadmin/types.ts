export type Hospital = { hospitalId: string; publicName: string; legalName: string; isAuthorized: boolean; createdAt: string };
export type Site = { siteId: string; hospitalId: string; publicName: string; publicAddress: string; coordinates: { latitude: number; longitude: number }; publicInstructions: string | null; isActive: boolean; isApproved: boolean };
export type Membership = { membershipId: string; hospitalId: string; role: 'admin_hospitalario'; status: 'pendiente' | 'activa' | 'revocada'; emailHint: string };
export type RequestStatus = 'pendiente' | 'aprobada' | 'rechazada' | 'en_ejecucion' | 'completada' | 'fallida';
export type PrivacyRequest = { requestId: string; type: 'correccion' | 'eliminacion'; requestedFields: ('name' | 'email' | 'declaredBloodType' | 'deletion')[]; status: RequestStatus; createdAt: string };
export type AuditEvent = { eventId: string; occurredAt: string; event: string; actorCode: string; resourceCode: string; result: 'ok' | 'denegado' | 'fallido' };
export type Task = { taskId: string; kind: 'correction_request' | 'hospital_review' | 'recognition_policy' | 'delivery_failure'; createdAt: string; resourceCode: string };
export type Configuration = { finalDemoAt: string | null; isImmutable: boolean };
export type Page<T> = { items: T[]; pagination: { nextCursor: string | null } };


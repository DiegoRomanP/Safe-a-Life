import type { ActorRole, LoginSession } from '../../../lib/api/auth.js';

const AREA: Record<ActorRole, string> = { donante: '/donante/perfil', admin_hospitalario: '/hospital', superadmin: '/superadmin' };

/** Hospital y superadmin completan MFA (aal 2) antes de entrar a su área. */
export function destinationFor(session: Pick<LoginSession, 'role' | 'aal'>): string {
  return session.role !== 'donante' && session.aal !== 2 ? '/verificar-identidad' : AREA[session.role];
}

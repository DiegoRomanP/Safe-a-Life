import type { Page, PageQuery } from '../../../shared/persistence/page.js';
import type { NeedBloodType, NeedUrgency } from '../domain/need-draft.js';
import type { ManualNeedStatus, NeedStatus } from '../domain/need-state.js';

export type { Page, PageQuery };

/** Clave de idempotencia y hash canónico que la RPC recalcula y compara. */
export type Envelope = Readonly<{ key: string; hash: string }>;

/** Los diez campos públicos de una necesidad con su estado visible. */
export type NeedView = Readonly<{
  needId: string;
  component: 'RBC';
  requiredBloodType: NeedBloodType;
  targetConfirmations: number;
  confirmedIntentCount: number;
  siteId: string;
  radiusKm: number;
  urgency: NeedUrgency;
  status: NeedStatus;
  expiresAt: string;
}>;

export type ListNeedsQuery = PageQuery & Readonly<{ status: NeedStatus | null }>;

/** Lecturas y transición de las necesidades del hospital del actor (el hospital sale de la membresía en SQL). */
export interface NeedsRepository {
  list(accessToken: string, query: ListNeedsQuery): Promise<Page<NeedView>>;
  get(accessToken: string, needId: string): Promise<NeedView>;
  transition(accessToken: string, envelope: Envelope, needId: string, status: ManualNeedStatus): Promise<NeedView>;
}

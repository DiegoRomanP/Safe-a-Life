import { createHash } from 'node:crypto';
import type { DemoInvitationBatchRecord } from './model.js';

type BatchScope = Readonly<{ hospitalId: string; needId: string }>;
const DEFAULT_PAGE_SIZE = 20;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function cursorFor(batch: DemoInvitationBatchRecord, scope: BatchScope): string {
  // A deterministic opaque anchor, not a credential: ownership is still checked
  // on every request. No cursor registry or write is needed for a GET.
  return createHash('sha256')
    .update(JSON.stringify(['mock-batches-v1', scope.hospitalId, scope.needId, batch.createdAt, batch.batchId]))
    .digest('base64url');
}

export function invitationBatchPage(
  batches: readonly DemoInvitationBatchRecord[],
  scope: BatchScope,
  limit = DEFAULT_PAGE_SIZE,
  cursor?: string,
): { items: DemoInvitationBatchRecord[]; nextCursor: string | null } | null {
  const ordered = batches
    .filter((batch) => batch.hospitalId === scope.hospitalId && batch.needId === scope.needId)
    .sort((left, right) => {
      // Ascending creation time, then UUID, so equal timestamps never lose rows.
      const leftKey = `${left.createdAt}:${left.batchId}`;
      const rightKey = `${right.createdAt}:${right.batchId}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
  let start = 0;
  if (cursor !== undefined) {
    if (!CURSOR_PATTERN.test(cursor)) return null;
    const anchor = ordered.findIndex((batch) => cursorFor(batch, scope) === cursor);
    if (anchor < 0) return null;
    start = anchor + 1;
  }
  const items = ordered.slice(start, start + limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: last && start + items.length < ordered.length ? cursorFor(last, scope) : null,
  };
}

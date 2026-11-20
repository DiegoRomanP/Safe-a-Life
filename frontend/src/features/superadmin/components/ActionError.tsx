import { ActionErrorNotice } from '../../../components/states/ActionErrorNotice.js';
import { useSuperadmin } from '../SuperadminContext.js';

export function ActionError() {
  return <ActionErrorNotice message={useSuperadmin().actionError} />;
}

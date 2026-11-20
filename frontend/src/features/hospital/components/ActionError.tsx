import { ActionErrorNotice } from '../../../components/states/ActionErrorNotice.js';
import { useHospital } from '../HospitalContext.js';

export function ActionError() {
  return <ActionErrorNotice message={useHospital().actionError} />;
}

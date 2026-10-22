import { Link } from 'react-router-dom';
import { bloodTypeLabel, formatDateTime } from '../../../lib/format.js';
import { needCode, needStatusLabel, urgencyLabel } from '../labels.js';
import type { HospitalNeed } from '../types.js';

export type NeedsTableProps = { needs: HospitalNeed[]; caption: string };

// Tabla de necesidades de HOS-01 (Penpot «+»). La meta se expresa en
// intenciones de asistir («2 de 3»), nunca en unidades.
export function NeedsTable({ needs, caption }: NeedsTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[720px] text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-sm text-muted">
            <th scope="col" className="px-4 py-4 font-semibold">Necesidad</th>
            <th scope="col" className="px-4 py-4 font-semibold">Grupo</th>
            <th scope="col" className="px-4 py-4 font-semibold">Meta de intenciones</th>
            <th scope="col" className="px-4 py-4 font-semibold">Urgencia</th>
            <th scope="col" className="px-4 py-4 font-semibold">Estado</th>
            <th scope="col" className="px-4 py-4 font-semibold">Vencimiento</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {needs.map((need) => (
            <tr key={need.needId} className="text-ink">
              <th scope="row" className="px-4 py-4 font-semibold">
                <Link to={`/hospital/necesidades/${need.needId}`} className="rounded text-petrol underline underline-offset-4">
                  {needCode(need.needId)}
                </Link>
              </th>
              <td className="px-4 py-4">{bloodTypeLabel(need.requiredBloodType)}</td>
              <td className="px-4 py-4">{`${need.confirmedIntentCount} de ${need.targetConfirmations}`}</td>
              <td className="px-4 py-4">{urgencyLabel[need.urgency].label}</td>
              <td className="px-4 py-4">{needStatusLabel[need.status].label}</td>
              <td className="px-4 py-4">{formatDateTime(need.expiresAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

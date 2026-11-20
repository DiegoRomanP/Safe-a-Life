import { Link } from 'react-router-dom';
import { bloodTypeLabel, formatDateTime } from '../../../lib/format.js';
import { needCode, needStatusLabel, urgencyLabel } from '../labels.js';
import type { HospitalNeed } from '../types.js';
import { TableScroll } from '../../../components/ui/TableScroll.js';
import { Badge } from '../../../components/ui/Badge.js';

export type NeedsTableProps = { needs: HospitalNeed[]; caption: string };

// Tabla de necesidades de HOS-01 (Penpot «+»). La meta se expresa en
// intenciones de asistir («2 de 3»), nunca en unidades.
export function NeedsTable({ needs, caption }: NeedsTableProps) {
  return (
    <TableScroll label={caption}>
      <table className="w-full min-w-[720px] text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-sm text-muted">
            <th scope="col" className="sticky left-0 bg-surface px-4 py-4 font-semibold">Necesidad</th>
            <th scope="col" className="px-4 py-4 font-semibold">Grupo requerido</th>
            <th scope="col" className="px-4 py-4 font-semibold">Meta de intenciones</th>
            <th scope="col" className="px-4 py-4 font-semibold">Urgencia (informativa)</th>
            <th scope="col" className="px-4 py-4 font-semibold">Estado</th>
            <th scope="col" className="px-4 py-4 font-semibold">Vencimiento</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {needs.map((need) => (
            <tr key={need.needId} className="text-ink">
              {/* Columna fija: al desplazar en móvil, la fila sigue identificada. */}
              <th scope="row" className="sticky left-0 bg-surface px-4 py-4 font-semibold">
                <Link to={`/hospital/necesidades/${need.needId}`} className="-my-2.5 inline-flex min-h-11 items-center rounded whitespace-nowrap text-petrol underline underline-offset-4">
                  {needCode(need.needId)}
                </Link>
              </th>
              <td className="px-4 py-4">{bloodTypeLabel(need.requiredBloodType)}</td>
              <td className="px-4 py-4">{`${need.confirmedIntentCount} de ${need.targetConfirmations}`}</td>
              <td className="px-4 py-4"><Badge tone={urgencyLabel[need.urgency].tone}>{urgencyLabel[need.urgency].label}</Badge></td>
              <td className="px-4 py-4"><Badge tone={needStatusLabel[need.status].tone}>{needStatusLabel[need.status].label}</Badge></td>
              <td className="px-4 py-4">{formatDateTime(need.expiresAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

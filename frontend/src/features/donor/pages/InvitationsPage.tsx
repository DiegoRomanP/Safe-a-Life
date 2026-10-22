import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/states/EmptyState.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { formatDateTime } from '../../../lib/format.js';
import { useDonorDemo } from '../DonorDemoContext.js';
import { responseLabel, urgencyLabel } from '../labels.js';

// DON-03 Mis invitaciones (Penpot «+»). Datos de listOwnInvitations.
export function InvitationsPage() {
  const { invitations } = useDonorDemo();
  const active = invitations.filter((item) => item.validity === 'activa').length;
  const answered = invitations.filter((item) => item.response !== 'sin_respuesta').length;

  return (
    <>
      <PageHeader
        title="Mis invitaciones"
        description="Consulta solicitudes de hospitales verificados y administra tu respuesta."
      />
      <Alert tone="info" title="Preselección académica">
        Tu grupo declarado se usa solo para preselección. El hospital debe verificar identidad, grupo y
        elegibilidad mediante sus procesos.
      </Alert>

      {invitations.length === 0 ? (
        <EmptyState message="No hay invitaciones activas" detail="Cuando un hospital envíe una, aparecerá aquí." />
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <Badge tone="info">{`${active} ${active === 1 ? 'activa' : 'activas'}`}</Badge>
            <Badge tone="success">{`${answered} ${answered === 1 ? 'respondida' : 'respondidas'}`}</Badge>
          </div>
          <section aria-label="Invitaciones" className="rounded-xl border border-line bg-surface px-6 py-2">
            <ul className="divide-y divide-line">
              {invitations.map((item) => {
                const urgency = urgencyLabel[item.urgency];
                const response = responseLabel[item.response];
                return (
                  <li
                    key={item.invitationId}
                    className="grid gap-4 py-5 md:grid-cols-[minmax(0,1.6fr)_auto_auto_minmax(0,1.4fr)] md:items-start"
                  >
                    <div>
                      <h2 className="text-lg font-semibold text-ink">{item.hospitalName}</h2>
                      <p className="text-sm text-muted">{item.publicSiteName}</p>
                    </div>
                    <Badge tone={urgency.tone} className="self-start">
                      {urgency.label}
                    </Badge>
                    <Badge tone={response.tone} className="self-start">
                      {response.label}
                    </Badge>
                    <div className="flex flex-col gap-4 md:items-end">
                      <p className="text-sm text-ink">{formatDateTime(item.expiresAt)}</p>
                      <LinkButton to={`/donante/invitaciones/${item.invitationId}`} variant="secondary">
                        Ver invitación<span className="sr-only"> de {item.hospitalName}</span>
                      </LinkButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </>
  );
}

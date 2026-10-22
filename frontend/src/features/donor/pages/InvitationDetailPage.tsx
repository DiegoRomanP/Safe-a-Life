import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QueryView } from '../../../components/states/QueryView.js';
import { SaveErrorNotice } from '../../../components/states/SaveErrorNotice.js';
import { SuccessNotice } from '../../../components/states/SuccessNotice.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { formatDateTime } from '../../../lib/format.js';
import { useDemoMutation } from '../../../lib/useDemoMutation.js';
import { useDemoQuery } from '../../../lib/useDemoQuery.js';
import { useDonorDemo } from '../DonorDemoContext.js';
import { responseLabel, urgencyLabel } from '../labels.js';
import type { DonorInvitation } from '../types.js';

const backLink = (
  <Link to="/donante/invitaciones" className="self-start rounded font-semibold text-petrol underline underline-offset-4">
    Volver a invitaciones
  </Link>
);

// Detalle de una invitación dentro de la cuenta, con el diseño de LINK-01
// (Penpot «+»). Datos de getOwnInvitation; responder usa
// changeOwnInvitationResponse, que permite confirmar o rechazar y cambiar la
// respuesta mientras la invitación siga activa.
export function InvitationDetailPage() {
  const { invitationId = '' } = useParams();
  const { scenario, getInvitation } = useDonorDemo();
  const load = useCallback(() => getInvitation(invitationId), [getInvitation, invitationId]);
  const query = useDemoQuery(load, `${scenario}:${invitationId}`);

  return (
    <>
      {backLink}
      <QueryView query={query} loadingMessage="Cargando la invitación…" backTo="/donante/invitaciones" backLabel="Ir a mis invitaciones">
        {(invitation, reload) => (
          <InvitationDetail invitation={invitation} refreshing={query.refreshing} onReload={reload} />
        )}
      </QueryView>
    </>
  );
}

type InvitationDetailProps = { invitation: DonorInvitation; refreshing: boolean; onReload: () => void };

function InvitationDetail({ invitation, refreshing, onReload }: InvitationDetailProps) {
  const { respond } = useDonorDemo();
  const save = useDemoMutation(respond);
  const [result, setResult] = useState<'confirmada' | 'rechazada' | null>(null);
  const urgency = urgencyLabel[invitation.urgency];
  const current = responseLabel[invitation.response];
  const canRespond = invitation.validity === 'activa';
  // Tras guardar, la invitación se revalida: hasta que llega no se actúa sobre
  // la respuesta anterior, para no repetir el envío.
  const busy = save.pending || refreshing;

  // La respuesta vigente y el envío en curso se marcan con aria-disabled y no
  // con disabled: un botón enfocado que se deshabilita suelta el foco al body.
  async function answer(response: 'confirmada' | 'rechazada') {
    if (busy || invitation.response === response) return;
    setResult(null);
    const saved = await save.run(invitation.invitationId, response);
    if (saved.ok) setResult(response);
  }

  // Tras un conflicto se recarga la invitación para responder sobre el estado actual.
  function review() {
    save.reset();
    onReload();
  }

  return (
    <>
      <section
        aria-labelledby="invitacion-titulo"
        className="mx-auto flex w-full max-w-[796px] flex-col gap-6 rounded-2xl border border-line bg-surface p-6 sm:p-12"
      >
        <div className="flex flex-wrap gap-3">
          <Badge tone={urgency.tone}>{`${urgency.label} · informativa`}</Badge>
          <Badge tone={current.tone}>{`Tu respuesta: ${current.label}`}</Badge>
        </div>
        <h1 id="invitacion-titulo" className="text-3xl font-bold text-ink">
          ¿Deseas registrar tu intención de asistir?
        </h1>
        <div>
          <h2 className="text-xl font-semibold text-petrol">{invitation.hospitalName}</h2>
          <p className="text-muted">{invitation.publicSiteName}</p>
        </div>
        <hr className="border-line" />
        <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-[120px_minmax(0,1fr)]">
          <dt className="text-sm font-semibold text-muted">Plazo</dt>
          <dd className="text-ink">{formatDateTime(invitation.expiresAt)}</dd>
          <dt className="text-sm font-semibold text-muted">Componente</dt>
          <dd className="text-ink">Glóbulos rojos (RBC)</dd>
          <dt className="text-sm font-semibold text-muted">Instrucciones</dt>
          <dd className="text-ink">{invitation.instructions}</dd>
        </dl>

        <div aria-live="polite">
          {result && (
            <SuccessNotice
              announce={false}
              message={result === 'confirmada' ? 'Confirmaste tu intención de asistir.' : 'Indicaste que no podrás asistir.'}
              detail="Puedes cambiar tu respuesta mientras la invitación siga activa."
            />
          )}
          {save.pending && <p className="text-sm text-muted">Guardando tu respuesta…</p>}
        </div>
        <SaveErrorNotice error={save.error} onReview={review} />

        {canRespond ? (
          <>
            <Alert tone="info" title="Antes de responder">
              Abrir esta invitación no registra una respuesta. Confirmar expresa únicamente intención de asistir. El hospital verificará tu identidad, grupo y elegibilidad antes de cualquier donación.
            </Alert>
            <div className="flex flex-wrap gap-4">
              <Button
                onClick={() => answer('confirmada')}
                aria-disabled={busy || invitation.response === 'confirmada'}
              >
                Confirmar intención de asistir
              </Button>
              <Button
                variant="ghost"
                onClick={() => answer('rechazada')}
                aria-disabled={busy || invitation.response === 'rechazada'}
              >
                No podré asistir
              </Button>
            </div>
          </>
        ) : (
          <Alert tone="warning" title="Invitación no disponible">
            Esta invitación ya no admite respuestas.
          </Alert>
        )}
      </section>
      <div>
        <LinkButton to="/donante/historial" variant="ghost">
          Ver historial de respuestas
        </LinkButton>
      </div>
    </>
  );
}

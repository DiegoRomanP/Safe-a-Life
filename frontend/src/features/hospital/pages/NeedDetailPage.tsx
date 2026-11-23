import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { SuccessNotice } from '../../../components/states/SuccessNotice.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { bloodTypeLabel, formatDateTime } from '../../../lib/format.js';
import { ActionError } from '../components/ActionError.js';
import { CoverageSection } from '../components/CoverageSection.js';
import type { BatchRequestResult } from '../types.js';
import { useHospital } from '../HospitalContext.js';
import { needCode, needStatusLabel, urgencyLabel } from '../labels.js';

const backLink = (
  <Link to="/hospital/necesidades" className="self-start rounded font-semibold text-petrol underline underline-offset-4">
    Volver a necesidades
  </Link>
);

const createdMessage = {
  activa: 'Necesidad publicada',
  borrador: 'Borrador guardado',
} as const;

// Qué pasó con el primer lote al publicar: nunca se promete un envío que el servidor no hizo.
function invitationDetail(invitation: BatchRequestResult | null | undefined): string {
  if (invitation === undefined) return '';
  if (invitation === null) return ' No se pudo solicitar el lote de invitaciones: pídelo desde «Lotes de invitación».';
  if (invitation.createdInvitationCount === 0) return ' No había donantes compatibles disponibles: no se envió ningún correo.';
  return ` ${invitation.createdInvitationCount} ${invitation.createdInvitationCount === 1 ? 'invitación' : 'invitaciones'} creadas y ${invitation.queuedEmailCount} correos en cola de envío.`;
}

// HOS-03 Detalle de necesidad (Penpot «+»). Datos de getOwnHospitalNeed y de
// la proyección de listOwnNeedResponses: de las respuestas solo se muestran
// las confirmadas, con nombre, código, grupo declarado y hora. «Publicar e
// invitar» activa el borrador y pide el primer lote en la misma acción (ADR-008);
// cancelar usa transitionOwnHospitalNeed y pide confirmación.
export function NeedDetailPage() {
  const { needId = '' } = useParams();
  const { needs, sites, transitionNeed, publishNeed } = useHospital();
  const location = useLocation();
  const navigate = useNavigate();
  // `extra`: lo que ocurrió con el lote de invitaciones (solo al publicar).
  const [notice, setNotice] = useState<{ message: string; extra: string } | undefined>(() => {
    const state = location.state as { created?: keyof typeof createdMessage; invitation?: BatchRequestResult | null } | null;
    return state?.created ? { message: createdMessage[state.created], extra: state.created === 'activa' ? invitationDetail(state.invitation) : '' } : undefined;
  });
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  // Al abrir o cerrar la confirmación, el botón pulsado desaparece: el foco va
  // al botón que lo reemplaza para no caer en el body.
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Marca que el cierre vino de «Volver» (y no de confirmar), para devolver el
  // foco a «Cancelar necesidad».
  const returnFocusRef = useRef(false);
  const need = needs.find((item) => item.needId === needId);

  useEffect(() => {
    if (!notice) return;
    noticeRef.current?.focus();
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [notice, location.state, location.pathname, navigate]);

  useEffect(() => {
    if (confirmingCancel) {
      confirmRef.current?.focus();
    } else if (returnFocusRef.current) {
      returnFocusRef.current = false;
      cancelRef.current?.focus();
    }
  }, [confirmingCancel]);

  if (!need) {
    return (
      <>
        {backLink}
        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-8">
          <h1 className="text-3xl font-bold text-ink">No pudimos abrir esta necesidad</h1>
          <p className="text-muted">Puede que no exista o que no pertenezca a tu hospital.</p>
        </section>
      </>
    );
  }

  const code = needCode(need.needId);
  const site = sites.find((item) => item.siteId === need.siteId)?.publicName ?? 'Sede';
  const status = needStatusLabel[need.status];
  const urgency = urgencyLabel[need.urgency];
  const progress = Math.min(100, Math.round((need.confirmedIntentCount / need.targetConfirmations) * 100));

  async function publish() {
    const outcome = await publishNeed(need!.needId);
    if (outcome) setNotice({ message: createdMessage.activa, extra: invitationDetail(outcome.invitation) });
  }

  async function cancel() {
    if (!(await transitionNeed(need!.needId, 'cancelada'))) return;
    setConfirmingCancel(false);
    setNotice({ message: 'Necesidad cancelada', extra: '' });
  }

  return (
    <>
      {backLink}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-ink">{`Necesidad ${code}`}</h1>
          <p className="text-muted">
            {`Glóbulos rojos · grupo requerido ${bloodTypeLabel(need.requiredBloodType)} · ${site} · vence ${formatDateTime(need.expiresAt)}`}
          </p>
          <div className="flex flex-wrap gap-3">
            <Badge tone={status.tone}>{status.label}</Badge>
            <Badge tone={urgency.tone}>{`${urgency.label} · informativa`}</Badge>
          </div>
        </div>
        {need.status === 'activa' && !confirmingCancel && (
          <Button ref={cancelRef} variant="danger" onClick={() => setConfirmingCancel(true)}>
            Cancelar necesidad
          </Button>
        )}
        {need.status === 'borrador' && <Button onClick={() => void publish()}>Publicar e invitar</Button>}
      </div>

      {confirmingCancel && (
        <Alert tone="warning" title={`¿Cancelar ${code}?`}>
          <p>La necesidad pasará a «Cancelada». Esta acción no se puede deshacer.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button ref={confirmRef} variant="danger" onClick={() => void cancel()}>
              Sí, cancelar necesidad
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                returnFocusRef.current = true;
                setConfirmingCancel(false);
              }}
            >
              Volver
            </Button>
          </div>
        </Alert>
      )}

      <ActionError />
      <div aria-live="polite" className="live-slot">
        {notice && (
          <div ref={noticeRef} tabIndex={-1} className="rounded-xl focus-visible:outline-focus">
            <SuccessNotice announce={false} message={notice.message} detail={`Estado actual: ${status.label}.${notice.extra}`} />
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section aria-labelledby="progreso-titulo" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-6">
          <h2 id="progreso-titulo" className="sr-only">
            Progreso de la meta
          </h2>
          <p className="text-3xl font-bold text-ink">{`${need.confirmedIntentCount} de ${need.targetConfirmations}`}</p>
          <p className="text-muted">confirmaciones de intención vigentes</p>
          <div
            role="progressbar"
            aria-label="Meta de intenciones"
            aria-valuemin={0}
            aria-valuemax={need.targetConfirmations}
            aria-valuenow={need.confirmedIntentCount}
            aria-valuetext={`${need.confirmedIntentCount} de ${need.targetConfirmations} intenciones`}
            className="h-3 overflow-hidden rounded-full bg-neutral-soft"
          >
            <div className="h-full rounded-full bg-success" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-sm text-muted">La meta no representa unidades ni suficiencia clínica.</p>
        </section>
        <section aria-labelledby="datos-titulo" className="rounded-xl border border-line bg-surface p-6">
          <h2 id="datos-titulo" className="sr-only">
            Datos de la necesidad
          </h2>
          <dl className="grid grid-cols-2 gap-6">
            <div>
              <dt className="text-sm font-semibold text-muted">Radio</dt>
              <dd className="font-semibold text-ink">{`${need.radiusKm} km`}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-muted">Meta</dt>
              <dd className="font-semibold text-ink">{`${need.targetConfirmations} intenciones`}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-muted">Componente</dt>
              <dd className="font-semibold text-ink">RBC</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-muted">Sede</dt>
              <dd className="font-semibold text-ink">{site}</dd>
            </div>
          </dl>
        </section>
      </div>

      {(need.status === 'borrador' || need.status === 'activa') && <CoverageSection needId={need.needId} version={need.status} />}

      <section aria-labelledby="confirmaciones-titulo" className="flex flex-col gap-3">
        <h2 id="confirmaciones-titulo" className="text-xl font-semibold text-ink">
          Invitaciones y respuestas
        </h2>
        <div className="flex flex-wrap gap-3">
          <LinkButton to={`/hospital/necesidades/${encodeURIComponent(need.needId)}/lotes`} variant="secondary">
            Lotes de invitación
          </LinkButton>
          <LinkButton to={`/hospital/necesidades/${encodeURIComponent(need.needId)}/respuestas`} variant="secondary">
            Ver respuestas
          </LinkButton>
        </div>
      </section>

      <Alert tone="warning" title="Verificación profesional externa">
        El hospital verifica identidad, grupo y elegibilidad con sus procedimientos antes de cualquier donación. El grupo que aparece es el declarado por la persona y una intención de asistir no confirma aptitud.
      </Alert>
    </>
  );
}

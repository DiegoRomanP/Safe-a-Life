import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { SuccessNotice } from '../../../components/states/SuccessNotice.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { bloodTypeLabel, formatDateTime } from '../../../lib/format.js';
import { useHospitalDemo } from '../HospitalDemoContext.js';
import { needCode, needStatusLabel, urgencyLabel } from '../labels.js';
import type { ConfirmedNeedResponse } from '../types.js';

const backLink = (
  <Link to="/hospital/necesidades" className="self-start rounded font-semibold text-petrol underline underline-offset-4">
    Volver a necesidades
  </Link>
);

const createdMessage = {
  activa: 'Necesidad activada',
  borrador: 'Borrador guardado',
} as const;

// HOS-03 Detalle de necesidad (Penpot «+»). Datos de getOwnHospitalNeed y de
// la proyección de listOwnNeedResponses: de las respuestas solo se muestran
// las confirmadas, con nombre, código, grupo declarado y hora. Activar y
// cancelar usan transitionOwnHospitalNeed; cancelar pide confirmación.
export function NeedDetailPage() {
  const { needId = '' } = useParams();
  const { needs, sites, responsesOf, transitionNeed } = useHospitalDemo();
  const location = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string | undefined>(() => {
    const created = (location.state as { created?: keyof typeof createdMessage } | null)?.created;
    return created ? createdMessage[created] : undefined;
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
  const confirmed = responsesOf(need.needId).filter(
    (item): item is ConfirmedNeedResponse => item.response === 'confirmada',
  );
  const progress = Math.min(100, Math.round((need.confirmedIntentCount / need.targetConfirmations) * 100));

  function apply(next: 'activa' | 'cancelada') {
    transitionNeed(need!.needId, next);
    setConfirmingCancel(false);
    setNotice(next === 'activa' ? 'Necesidad activada' : 'Necesidad cancelada');
  }

  return (
    <>
      {backLink}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-ink">{`Necesidad ${code}`}</h1>
          <p className="text-muted">
            {`Glóbulos rojos ${bloodTypeLabel(need.requiredBloodType)} · ${site} · vence ${formatDateTime(need.expiresAt)}`}
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
        {need.status === 'borrador' && <Button onClick={() => apply('activa')}>Activar necesidad</Button>}
      </div>

      {confirmingCancel && (
        <Alert tone="warning" title={`¿Cancelar ${code}?`}>
          <p>La necesidad pasará a «Cancelada». Esta acción no se puede deshacer.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button ref={confirmRef} variant="danger" onClick={() => apply('cancelada')}>
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

      <div aria-live="polite">
        {notice && (
          <div ref={noticeRef} tabIndex={-1} className="rounded-xl focus-visible:outline-focus">
            <SuccessNotice announce={false} message={notice} detail={`Estado actual: ${status.label}.`} />
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

      <section aria-labelledby="confirmaciones-titulo" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="confirmaciones-titulo" className="text-xl font-semibold text-ink">
              Confirmaciones afirmativas
            </h2>
            <p className="text-sm text-muted">Solo se muestran nombre, código por necesidad, grupo declarado y hora.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <LinkButton to={`/hospital/necesidades/${need.needId}/lotes`} variant="ghost">
              Ver lotes y entregas
            </LinkButton>
            <LinkButton to={`/hospital/necesidades/${need.needId}/respuestas`} variant="secondary">
              Ver todas las respuestas
            </LinkButton>
          </div>
        </div>
        {confirmed.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface p-6 text-muted">Todavía no hay confirmaciones.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[640px] text-left">
              <caption className="sr-only">{`Confirmaciones afirmativas de ${code}`}</caption>
              <thead>
                <tr className="border-b border-line text-sm text-muted">
                  <th scope="col" className="px-4 py-4 font-semibold">Nombre</th>
                  <th scope="col" className="px-4 py-4 font-semibold">Código</th>
                  <th scope="col" className="px-4 py-4 font-semibold">Grupo</th>
                  <th scope="col" className="px-4 py-4 font-semibold">Respuesta</th>
                  <th scope="col" className="px-4 py-4 font-semibold">Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {confirmed.map((item) => (
                  <tr key={item.needDonorCode} className="text-ink">
                    <th scope="row" className="px-4 py-4 font-semibold">{item.donorName}</th>
                    <td className="px-4 py-4">{item.needDonorCode}</td>
                    <td className="px-4 py-4">{bloodTypeLabel(item.declaredBloodType)}</td>
                    <td className="px-4 py-4">Confirmada</td>
                    <td className="px-4 py-4">{formatDateTime(item.responseRecordedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Alert tone="warning" title="Verificación profesional externa">
        Ante un proceso real, el hospital debe verificar identidad, grupo y elegibilidad con sus procedimientos.
      </Alert>
    </>
  );
}

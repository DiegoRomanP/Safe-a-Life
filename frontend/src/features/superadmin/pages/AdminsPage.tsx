import { useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/states/EmptyState.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { Select } from '../../../components/ui/Select.js';
import { emailError } from '../../auth/validation.js';
import { ResultNotice, type Notice } from '../components/ResultNotice.js';
import { useStepUpGate } from '../components/StepUpPanel.js';
import { membershipStatusLabel } from '../labels.js';
import { useSuperadminDemo } from '../SuperadminDemoContext.js';
import type { Membership } from '../types.js';

// SA-04 Administradores y membresías (Penpot «+»). listHospitalMemberships solo
// entrega pista del correo, hospital y estado: no hay nombre, MFA ni último
// acceso. Invitar (inviteHospitalAdmin) y revocar con motivo
// (revokeHospitalMembership) exigen step-up. La respuesta de invitar es neutral.
// Sin backend (D-4).
export function AdminsPage() {
  const { hospitals, memberships, inviteAdmin, revokeMembership } = useSuperadminDemo();
  const { requireStepUp, stepUpPanel } = useStepUpGate();
  const [email, setEmail] = useState('');
  const [hospitalId, setHospitalId] = useState('');
  const [inviteErrors, setInviteErrors] = useState<{ email?: string; hospital?: string }>({});
  const [revoking, setRevoking] = useState<Membership | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const [notice, setNotice] = useState<Notice | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const hospitalRef = useRef<HTMLSelectElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  // Botón «Revocar» que abrió el formulario, para devolverle el foco al volver.
  const revokeTriggerRef = useRef<HTMLElement | null>(null);
  const hospitalName = (id: string) => hospitals.find((h) => h.hospitalId === id)?.publicName ?? '—';
  const authorized = hospitals.filter((h) => h.isAuthorized).map((h) => ({ value: h.hospitalId, label: h.publicName }));

  useEffect(() => {
    if (revoking) reasonRef.current?.focus();
  }, [revoking]);

  function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = {
      email: email.trim() ? emailError(email) : 'Ingresa el correo de la persona.',
      hospital: hospitalId ? undefined : 'Selecciona un hospital autorizado.',
    };
    flushSync(() => setInviteErrors(found));
    if (found.email) return emailRef.current?.focus();
    if (found.hospital) return hospitalRef.current?.focus();
    requireStepUp('invitar un administrador', () => {
      inviteAdmin({ email: email.trim(), hospitalId });
      setEmail('');
      setHospitalId('');
      setNotice({
        message: 'Invitación procesada',
        detail: 'Si corresponde, la persona recibirá un enlace para activar su acceso al hospital.',
      });
    });
  }

  function handleRevoke(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = !reason.trim() ? 'Indica el motivo de la revocación.' : reason.trim().length > 300 ? 'Usa como máximo 300 caracteres.' : undefined;
    flushSync(() => setReasonError(found));
    if (found) return reasonRef.current?.focus();
    const target = revoking!;
    requireStepUp('revocar una membresía', () => {
      revokeMembership(target.membershipId);
      setRevoking(null);
      setReason('');
      setNotice({
        message: `Membresía de ${target.emailHint} revocada`,
        detail: 'La persona pierde el acceso al hospital en su siguiente petición.',
      });
    });
  }

  return (
    <>
      <PageHeader
        title="Administradores y membresías"
        description="Cada administrador pertenece exactamente a un hospital activo."
        actions={<Button onClick={() => emailRef.current?.focus()}>Invitar administrador</Button>}
      />
      <Alert tone="warning" title="AAL2 obligatorio">
        Invitar administradores o cambiar membresías requiere autenticación reforzada reciente.
      </Alert>
      {stepUpPanel}
      <ResultNotice notice={notice} />

      {revoking && (
        <section aria-labelledby="revocar-titulo" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6">
          <h2 id="revocar-titulo" className="text-xl font-semibold text-ink">
            {`Revocar la membresía de ${revoking.emailHint}`}
          </h2>
          <form noValidate onSubmit={handleRevoke} className="flex flex-col gap-4 sm:max-w-[560px]">
            <Field label="Motivo" hint="Queda en la auditoría. No incluyas datos personales." error={reasonError} required>
              {(control) => (
                <Input {...control} ref={reasonRef} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} />
              )}
            </Field>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="danger">
                Revocar membresía
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  flushSync(() => {
                    setRevoking(null);
                    setReason('');
                    setReasonError(undefined);
                  });
                  if (revokeTriggerRef.current?.isConnected) revokeTriggerRef.current.focus();
                }}
              >
                Volver
              </Button>
            </div>
          </form>
        </section>
      )}

      {memberships.length === 0 ? (
        <EmptyState message="Todavía no hay administradores" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[720px] text-left">
            <caption className="sr-only">Membresías de administradores de hospital</caption>
            <thead>
              <tr className="border-b border-line text-sm text-muted">
                <th scope="col" className="px-4 py-4 font-semibold">Correo (pista)</th>
                <th scope="col" className="px-4 py-4 font-semibold">Hospital</th>
                <th scope="col" className="px-4 py-4 font-semibold">Estado</th>
                <th scope="col" className="px-4 py-4 font-semibold"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {memberships.map((membership) => {
                const status = membershipStatusLabel[membership.status];
                return (
                  <tr key={membership.membershipId} className="text-ink">
                    <th scope="row" className="px-4 py-4 font-semibold">{membership.emailHint}</th>
                    <td className="px-4 py-4">{hospitalName(membership.hospitalId)}</td>
                    <td className="px-4 py-4">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="px-4 py-4 text-right">
                      {membership.status !== 'revocada' && (
                        <Button
                          variant="danger"
                          onClick={(event) => {
                            revokeTriggerRef.current = event.currentTarget;
                            setRevoking(membership);
                          }}
                        >
                          Revocar<span className="sr-only"> {membership.emailHint}</span>
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Card title="Invitar administrador">
        <form noValidate onSubmit={handleInvite} className="flex flex-col gap-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Correo" error={inviteErrors.email} required>
              {(control) => (
                <Input
                  {...control}
                  ref={emailRef}
                  type="email"
                  autoComplete="off"
                  placeholder="persona@example.test"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </Field>
            <Field label="Hospital" hint="Solo hospitales autorizados." error={inviteErrors.hospital} required>
              {(control) => (
                <Select
                  {...control}
                  ref={hospitalRef}
                  placeholder="Selecciona un hospital"
                  options={authorized}
                  value={hospitalId}
                  onChange={(event) => setHospitalId(event.target.value)}
                />
              )}
            </Field>
          </div>
          <div>
            <Button type="submit">Enviar invitación</Button>
          </div>
        </form>
      </Card>

      <Alert tone="info" title="Membresía protegida">
        El hospital se deriva de la identidad validada; nunca de parámetros enviados por el cliente.
      </Alert>
    </>
  );
}

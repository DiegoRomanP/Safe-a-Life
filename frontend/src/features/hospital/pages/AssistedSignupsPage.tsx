import { useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/states/EmptyState.js';
import { SuccessNotice } from '../../../components/states/SuccessNotice.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import type { Tone } from '../../../components/ui/tones.js';
import { formatDateTime } from '../../../lib/format.js';
import { emailError } from '../../auth/validation.js';
import { useHospitalDemo } from '../HospitalDemoContext.js';
import type { AssistedSignup } from '../types.js';

const statusLabel: Record<AssistedSignup['status'], { label: string; tone: Tone }> = {
  pendiente: { label: 'Pendiente', tone: 'warning' },
  vencida: { label: 'Vencida', tone: 'neutral' },
  reclamada_incompleta: { label: 'Reclamada incompleta', tone: 'info' },
  activa: { label: 'Activa', tone: 'success' },
};

/** Código visible a partir del identificador: «ALT-771A». */
const signupCode = (signupId: string) => `ALT-${signupId.slice(0, 4).toUpperCase()}`;

// HOS-06 Altas asistidas (Penpot «+»). createAssistedSignup recibe solo correo
// y nombre opcional, y responde igual aunque el correo ya exista (no
// enumerable); el hospital nunca crea contraseña, grupo ni ubicación. La
// lista (listOwnAssistedSignups) muestra solo estado y fechas. Reenviar usa
// reissueAssistedActivationLink. Sin backend (D-4).
export function AssistedSignupsPage() {
  const { signups, createSignup, reissueSignup } = useHospitalDemo();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<{ email?: string; name?: string }>({});
  const [notice, setNotice] = useState<{ message: string; detail: string } | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = {
      // El correo es de otra persona: el mensaje no dice «tu correo».
      email: email.trim() ? emailError(email) : 'Ingresa el correo de la persona.',
      name: name.trim().length > 120 ? 'El nombre puede tener como máximo 120 caracteres.' : undefined,
    };
    flushSync(() => setErrors(found));
    if (found.email) return emailRef.current?.focus();
    if (found.name) return nameRef.current?.focus();
    createSignup({ email: email.trim(), ...(name.trim() ? { name: name.trim() } : {}) });
    setEmail('');
    setName('');
    setNotice({
      message: 'Solicitud de alta procesada',
      detail: 'Si corresponde, la persona recibirá un enlace de un solo uso para reclamar su cuenta.',
    });
  }

  function handleReissue(signup: AssistedSignup) {
    reissueSignup(signup.signupId);
    setNotice({
      message: `Solicitud de reenvío procesada para ${signupCode(signup.signupId)}`,
      detail: 'Si corresponde, se emite un enlace nuevo de 24 horas y el anterior deja de servir.',
    });
  }

  return (
    <>
      <PageHeader title="Altas asistidas" description="Invita a una persona a reclamar y completar su propia cuenta." />
      <Alert tone="brand" title="Respuesta neutral">
        El resultado será el mismo aunque el correo ya exista, para evitar enumeración de cuentas.
      </Alert>
      <div aria-live="polite">
        {notice && (
          <div ref={noticeRef} tabIndex={-1} className="rounded-xl focus-visible:outline-focus">
            <SuccessNotice announce={false} message={notice.message} detail={notice.detail} />
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Nueva invitación">
          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
            <Field label="Correo" error={errors.email} required>
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
            <Field label="Nombre" hint="Opcional. No solicites grupo, contraseña ni ubicación." error={errors.name}>
              {(control) => (
                <Input
                  {...control}
                  ref={nameRef}
                  autoComplete="off"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
            <div className="flex flex-col items-start gap-2">
              <Button type="submit">Enviar invitación</Button>
              <p className="text-sm text-muted">El enlace de reclamo dura 24 horas y es de un solo uso.</p>
            </div>
          </form>
        </Card>

        <Card title="Invitaciones recientes">
          {signups.length === 0 ? (
            <EmptyState message="Todavía no hay altas asistidas" />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {signups.map((signup) => {
                const status = statusLabel[signup.status];
                const code = signupCode(signup.signupId);
                return (
                  <li key={signup.signupId} className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="flex flex-col gap-1">
                      <p className="font-semibold text-ink">{code}</p>
                      <p className="text-sm text-muted">{`Creada ${formatDateTime(signup.createdAt)}`}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      {(signup.status === 'pendiente' || signup.status === 'vencida') && (
                        <Button variant="secondary" onClick={() => handleReissue(signup)}>
                          Reenviar enlace<span className="sr-only"> de {code}</span>
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Alert tone="warning" title="Límite de demostración" className="mt-4">
            Los estados y el envío son sintéticos; no se envían correos reales.
          </Alert>
        </Card>
      </div>
    </>
  );
}

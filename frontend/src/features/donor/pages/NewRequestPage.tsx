import { useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { SaveErrorNotice } from '../../../components/states/SaveErrorNotice.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { cx } from '../../../components/ui/cx.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { Select } from '../../../components/ui/Select.js';
import { BLOOD_TYPES, bloodTypeLabel, type BloodType } from '../../../lib/format.js';
import { useDemoMutation } from '../../../lib/useDemoMutation.js';
import { emailError } from '../../auth/validation.js';
import { useDonorDemo, type NewCorrectionRequest } from '../DonorDemoContext.js';
import { requestCode } from '../labels.js';

export type RequestKind = 'correccion' | 'correo' | 'eliminacion';

const kinds: Array<{ value: RequestKind; title: string; detail: string }> = [
  { value: 'correccion', title: 'Corregir nombre o grupo', detail: 'Los cambios se revisan antes de aplicarse.' },
  { value: 'correo', title: 'Cambiar correo', detail: 'El nuevo correo deberá verificarse.' },
  {
    value: 'eliminacion',
    title: 'Eliminar mis datos',
    detail: 'La solicitud pasa por revisión y no se ejecuta automáticamente.',
  },
];

const bloodTypeOptions = BLOOD_TYPES.map((value) => ({ value, label: bloodTypeLabel(value) }));

type Errors = { correction?: string; email?: string; confirm?: string };

// DON-05 Nueva solicitud (contenido de Penpot «SaL» con estilo «+»). Arma el
// cuerpo de createOwnCorrectionRequest: corrección de nombre y/o grupo, cambio
// de correo o eliminación. Sin backend (D-4) la solicitud queda pendiente en
// memoria y se vuelve a «Mis solicitudes» con el aviso del resultado.
export function NewRequestPage() {
  const { createRequest } = useDonorDemo();
  const save = useDemoMutation(createRequest);
  const navigate = useNavigate();
  // Solo se aceptan los tres tipos conocidos; un estado de historial distinto
  // vuelve a la corrección.
  const stateKind = (useLocation().state as { kind?: unknown } | null)?.kind;
  const initialKind = kinds.some((option) => option.value === stateKind) ? (stateKind as RequestKind) : 'correccion';
  const [kind, setKind] = useState<RequestKind>(initialKind);
  const [name, setName] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [email, setEmail] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.pending) return;
    const found: Errors = {};
    if (kind === 'correccion') {
      if (!name.trim() && !bloodType) found.correction = 'Indica un nombre o un grupo nuevo.';
      else if (name.trim().length > 120) found.correction = 'El nombre puede tener como máximo 120 caracteres.';
    }
    if (kind === 'correo') found.email = emailError(email);
    if (kind === 'eliminacion' && !confirmed) found.confirm = 'Confirma que entiendes cómo se procesa la eliminación.';
    flushSync(() => setErrors(found));
    if (found.correction) return nameRef.current?.focus();
    if (found.email) return emailRef.current?.focus();
    if (found.confirm) return confirmRef.current?.focus();

    const body: NewCorrectionRequest =
      kind === 'eliminacion'
        ? { type: 'eliminacion' }
        : kind === 'correo'
          ? { type: 'correccion', changes: { newEmail: email.trim() } }
          : {
              type: 'correccion',
              changes: {
                ...(name.trim() ? { name: name.trim() } : {}),
                ...(bloodType ? { declaredBloodType: bloodType as BloodType } : {}),
              },
            };
    const created = await save.run(body);
    if (created.ok) navigate('/donante/solicitudes', { state: { created: requestCode(created.value.requestId) } });
  }

  // El aviso de conflicto desaparece al revisarlo: el foco vuelve al envío.
  function review() {
    flushSync(save.reset);
    submitRef.current?.focus();
  }

  return (
    <>
      <Link to="/donante/solicitudes" className="self-start rounded font-semibold text-petrol underline underline-offset-4">
        Volver a mis solicitudes
      </Link>
      <PageHeader title="Nueva solicitud" description="Elige una corrección o eliminación para tu propia cuenta." />
      <Card title="Tipo de solicitud">
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">Tipo de solicitud</legend>
            {kinds.map((option) => (
              <label
                key={option.value}
                className={cx(
                  'flex cursor-pointer gap-3 rounded-lg border p-4 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus',
                  kind === option.value ? 'border-petrol bg-soft-blue' : 'border-line bg-surface',
                )}
              >
                <input
                  type="radio"
                  name="tipo-solicitud"
                  value={option.value}
                  checked={kind === option.value}
                  onChange={() => {
                    setKind(option.value);
                    setErrors({});
                  }}
                  className="mt-1 size-4 accent-petrol"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold text-ink">{option.title}</span>
                  <span className="text-sm text-muted">{option.detail}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {kind === 'correccion' && (
            <div className="flex flex-col gap-3">
              <div className="grid gap-6 md:grid-cols-2">
                <Field label="Nombre nuevo" hint="Déjalo vacío si no cambia." error={errors.correction}>
                  {(control) => (
                    <Input {...control} ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} />
                  )}
                </Field>
                <Field label="Grupo declarado nuevo" hint="Déjalo sin elegir si no cambia.">
                  {(control) => (
                    <Select
                      {...control}
                      placeholder="Sin cambios"
                      options={bloodTypeOptions}
                      value={bloodType}
                      onChange={(event) => setBloodType(event.target.value)}
                    />
                  )}
                </Field>
              </div>
            </div>
          )}

          {kind === 'correo' && (
            <Field label="Correo nuevo" hint="Te enviaremos un enlace para confirmarlo." error={errors.email}>
              {(control) => (
                <Input
                  {...control}
                  ref={emailRef}
                  type="email"
                  autoComplete="email"
                  placeholder="nombre@ejemplo.test"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </Field>
          )}

          {kind === 'eliminacion' && (
            <div className="flex flex-col gap-2">
              <label className="flex items-start gap-3 text-ink">
                <input
                  ref={confirmRef}
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  aria-invalid={errors.confirm ? true : undefined}
                  aria-describedby={errors.confirm ? 'eliminacion-error' : undefined}
                  className="mt-1 size-4 accent-danger"
                />
                <span>Entiendo que la solicitud se revisa antes de ejecutarse y que no se puede deshacer una vez ejecutada.</span>
              </label>
              {errors.confirm && (
                <p id="eliminacion-error" className="text-sm text-danger">
                  {errors.confirm}
                </p>
              )}
            </div>
          )}

          <SaveErrorNotice error={save.error} onReview={review} />
          <div className="flex flex-wrap items-center gap-4">
            <Button
              ref={submitRef}
              type="submit"
              variant={kind === 'eliminacion' ? 'danger' : 'primary'}
              aria-disabled={save.pending}
            >
              Enviar solicitud
            </Button>
            <p aria-live="polite" className="text-sm text-muted">
              {save.pending ? 'Enviando solicitud…' : ''}
            </p>
          </div>
        </form>
      </Card>
      <Alert tone="info" title="Solo sobre tu propia cuenta">
        No ingreses datos reales en este prototipo. El seguimiento se muestra en «Mis solicitudes».
      </Alert>
    </>
  );
}

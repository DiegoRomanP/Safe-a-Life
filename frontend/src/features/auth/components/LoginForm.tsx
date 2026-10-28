import { useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { emailError } from '../validation.js';

export type LoginCredentials = { email: string; password: string };

export type LoginFormProps = {
  onSubmit: (credentials: LoginCredentials) => void;
  disabled?: boolean;
};

type Errors = Partial<Record<keyof LoginCredentials, string>>;

function validate({ email, password }: LoginCredentials): Errors {
  const errors: Errors = {};
  const emailMessage = emailError(email);
  const passwordLength = Array.from(password).length;
  if (emailMessage) errors.email = emailMessage;
  if (!password) errors.password = 'Ingresa tu contraseña.';
  else if (passwordLength < 12) errors.password = 'La contraseña debe tener al menos 12 caracteres.';
  else if (passwordLength > 128) errors.password = 'La contraseña no puede superar 128 caracteres.';
  return errors;
}

// Formulario de AUTH-01. Valida los límites existentes; quien lo
// usa decide qué hacer con las credenciales. Si hay errores, el foco va al
// primer campo inválido para que el lector de pantalla lo anuncie.
export function LoginForm({ onSubmit, disabled = false }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate({ email, password });
    // flushSync pinta el error y aria-describedby antes de mover el foco, para
    // que el lector de pantalla lea el mensaje junto con el campo.
    flushSync(() => setErrors(found));
    if (found.email) return emailRef.current?.focus();
    if (found.password) return passwordRef.current?.focus();
    onSubmit({ email: email.trim(), password });
    setPassword('');
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Field label="Correo" error={errors.email}>
        {(control) => (
          <Input
            {...control}
            ref={emailRef}
            type="email"
            autoComplete="email"
            placeholder="nombre@ejemplo.test"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={disabled}
          />
        )}
      </Field>
      <Field label="Contraseña" error={errors.password}>
        {(control) => (
          <Input
            {...control}
            ref={passwordRef}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={disabled}
          />
        )}
      </Field>
      <Link to="/recuperar-acceso" className="self-start rounded text-sm font-semibold text-petrol underline">
        ¿Olvidaste tu contraseña?
      </Link>
      <Button type="submit" fullWidth disabled={disabled}>
        Ingresar
      </Button>
    </form>
  );
}

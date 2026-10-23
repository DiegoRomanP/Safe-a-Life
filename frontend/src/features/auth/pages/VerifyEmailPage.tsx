import { useEffect, useRef, useState } from 'react';
import { apiRequest, errorMessage, ApiError } from '../../../api/client.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Button } from '../../../components/ui/Button.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { AuthCard, AuthShell } from '../components/AuthShell.js';

type Status = 'checking' | 'ready' | 'invalid' | 'submitting' | 'done' | 'error';

/** Enlaces de un solo uso: consultar no consume; confirmar sí. Nunca mostrar el secreto. */
export function VerifyEmailPage() {
  const tokenRef = useRef<string>(window.location.hash.slice(1));
  const intentRef = useRef<string>(crypto.randomUUID());
  const [status, setStatus] = useState<Status>('checking');
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Eliminar el fragmento del historial visible tan pronto como se capture.
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    const token = tokenRef.current;
    if (!/^[A-Za-z0-9_-]{20,256}$/.test(token)) {
      setStatus('invalid');
      return;
    }
    let cancelled = false;
    void apiRequest(`/api/v1/donor-email-verification-actions/${encodeURIComponent(token)}`)
      .then(() => { if (!cancelled) setStatus('ready'); })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && [400, 404, 409, 410].includes(error.status)) {
          setStatus('invalid');
        } else {
          setMessage(errorMessage(error));
          setStatus('error');
        }
      });
    return () => { cancelled = true; };
  }, []);

  async function confirm() {
    if (status !== 'ready' && status !== 'error') return;
    const token = tokenRef.current;
    setStatus('submitting');
    setMessage('');
    try {
      await apiRequest(`/api/v1/donor-email-verification-actions/${encodeURIComponent(token)}`, {
        method: 'POST', idempotencyKey: intentRef.current,
      });
      tokenRef.current = '';
      setStatus('done');
    } catch (error) {
      if (error instanceof ApiError && [400, 403, 404, 409, 410].includes(error.status)) {
        setStatus('invalid');
      } else {
        setStatus('error');
        setMessage(errorMessage(error));
      }
    }
  }

  return <AuthShell asideTitle="Verificación de correo" asideDetail="Confirma tu correo para completar el perfil de donante.">
    <AuthCard labelledBy="verificacion-correo-titulo" className="max-w-[640px]">
      <h1 id="verificacion-correo-titulo" className="text-3xl font-bold text-ink">Verifica tu correo</h1>
      <div aria-live="polite">
        {status === 'checking' && <p role="status" className="text-muted">Comprobando enlace…</p>}
        {status === 'ready' && <Alert tone="info" title="Enlace disponible">Confirma que deseas verificar este correo.</Alert>}
        {status === 'submitting' && <p role="status" className="text-muted">Confirmando correo…</p>}
        {status === 'done' && <Alert tone="info" title="Correo verificado">Tu correo quedó verificado. Ya puedes iniciar sesión y completar tu perfil.</Alert>}
        {status === 'invalid' && <Alert tone="warning" title="Enlace no disponible">El enlace es inválido, venció o ya fue utilizado. Solicita uno nuevo si corresponde.</Alert>}
        {status === 'error' && <Alert tone="warning" title="No se pudo confirmar">{message}</Alert>}
      </div>
      {(status === 'ready' || status === 'error') && <Button onClick={() => { void confirm(); }}>Confirmar correo</Button>}
      <LinkButton to="/ingresar" variant="secondary">Ir a iniciar sesión</LinkButton>
    </AuthCard>
  </AuthShell>;
}

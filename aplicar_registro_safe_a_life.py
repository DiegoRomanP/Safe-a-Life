from pathlib import Path
import shutil, sys, datetime
root = Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path.cwd()
frontend = root / 'frontend' / 'src'
register = frontend / 'features/auth/pages/RegisterPage.tsx'
client = frontend / 'api/client.ts'
routes = frontend / 'app/routes.tsx'
for p in (register,client,routes):
    if not p.is_file():
        sys.exit(f'NO SE CAMBIO NADA. Falta: {p}')
orig = {p:p.read_text(encoding='utf-8') for p in (register,client,routes)}
reg=orig[register]
old="import { emailError, newPasswordError, PASSWORD_HINT } from '../validation.js';"
assert reg.count(old)==1, 'La pantalla de registro es distinta; no aplicar automáticamente'
reg=reg.replace(old,old+"\nimport { apiRequest, errorMessage } from '../../../api/client.js';")
reg=reg.replace("  const [sent, setSent] = useState(false);", "  const [sent, setSent] = useState(false);\n  const [pending, setPending] = useState(false);\n  const [serverError, setServerError] = useState('');\n  const submitting = useRef(false);")
old='''  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Errors = { email: emailError(email), password: newPasswordError(password) };
    flushSync(() => setErrors(found));
    if (found.email) return emailRef.current?.focus();
    if (found.password) return passwordRef.current?.focus();
    setPassword('');
    setSent(true);
  }'''
new='''  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const found: Errors = { email: emailError(email), password: newPasswordError(password) };
    flushSync(() => setErrors(found));
    if (found.email) return emailRef.current?.focus();
    if (found.password) return passwordRef.current?.focus();
    submitting.current = true;
    setPending(true);
    setServerError('');
    try {
      await apiRequest('/api/v1/donor-registrations', {
        method: 'POST',
        body: { email: email.trim(), password },
        idempotencyKey: crypto.randomUUID(),
      });
      setPassword('');
      setSent(true);
    } catch (failure) {
      setServerError(errorMessage(failure));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }'''
assert reg.count(old)==1, 'handleSubmit ha cambiado; se cancela'
reg=reg.replace(old,new)
reg=reg.replace('Completa tu perfil con datos sintéticos para participar en la demostración.','Regístrate para completar tu perfil y recibir invitaciones de hospitales autorizados.')
reg=reg.replace('''          <Alert tone="brand" title="Prototipo académico">
            Esta pantalla no envía mensajes ni crea cuentas reales.
          </Alert>''','''          <Alert tone="brand" title="Registro enviado">
            El servidor recibió la solicitud. La activación de la cuenta depende de completar la verificación de correo configurada en el entorno.
          </Alert>''')
reg=reg.replace('Registra una cuenta de demostración para recibir invitaciones de hospitales autorizados.','Registra una cuenta para recibir invitaciones de hospitales autorizados.')
reg=reg.replace('Contraseña de demostración','Contraseña')
reg=reg.replace('''            <div className="flex flex-wrap justify-between gap-3">
              <LinkButton to="/" variant="ghost">''','''            <div aria-live="polite" role="status">
              {pending && <p>Creando solicitud de registro…</p>}
              {serverError && <Alert tone="warning" title="No pudimos registrar la cuenta">{serverError}</Alert>}
            </div>
            <div className="flex flex-wrap justify-between gap-3">
              <LinkButton to="/" variant="ghost">''')
reg=reg.replace('<Button type="submit">Continuar</Button>','<Button type="submit" disabled={pending}>{pending ? "Enviando…" : "Continuar"}</Button>')
cl=orig[client]
old="if (write && !(path === '/api/v1/auth/sessions' && options.method === 'POST')) {"
new="if (write && !(options.method === 'POST' && (path === '/api/v1/auth/sessions' || path === '/api/v1/donor-registrations'))) {"
assert cl.count(old)==1,'client.ts cambió; se cancela'
cl=cl.replace(old,new)
rt=orig[routes]
old="import { RequireSuperadmin } from '../features/auth/RequireSuperadmin.js';"
assert rt.count(old)==1,'routes.tsx cambió; se cancela'
rt=rt.replace(old,old+"\nimport { RequireDonor } from '../features/auth/RequireDonor.js';")
old="    element: <DonorLayout />,\n"
assert rt.count(old)==1,'ruta de donante cambió; se cancela'
rt=rt.replace(old,"    element: <RequireDonor><DonorLayout /></RequireDonor>,\n")
rt=rt.replace('// Área del donante. Sin backend (D-4) todavía no hay guard de sesión.','// Área del donante. Requiere sesión real con rol donante.')
guard=frontend/'features/auth/RequireDonor.tsx'
if guard.exists():sys.exit('Existe RequireDonor.tsx; no se sobrescribe nada')
guardtext='''import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getSession, type Session } from '../../api/auth.js';
import { ApiError, errorMessage } from '../../api/client.js';
import { Button } from '../../components/ui/Button.js';
import { LinkButton } from '../../components/ui/LinkButton.js';

type Result = { status: 'ready'; session: Session } | { status: 'anonymous' } | { status: 'error'; message: string };

export function RequireDonor({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ path: string; revision: number; value: Result }>();
  useEffect(() => {
    let active = true;
    void getSession().then(session => {
      if (active) setResult({ path: location.pathname, revision, value: { status: 'ready', session } });
    }).catch((error: unknown) => {
      if (active) setResult({ path: location.pathname, revision, value: error instanceof ApiError && error.status === 401
        ? { status: 'anonymous' } : { status: 'error', message: errorMessage(error) } });
    });
    return () => { active = false; };
  }, [location.pathname, revision]);
  const state = result?.path === location.pathname && result.revision === revision ? result.value : null;
  if (!state) return <main className="p-6" role="status">Comprobando sesión…</main>;
  if (state.status === 'anonymous') return <Navigate to="/ingresar" replace />;
  if (state.status === 'error') return <main className="p-6" role="alert"><p>{state.message}</p><Button onClick={() => setRevision(n => n + 1)}>Reintentar</Button></main>;
  if (state.session.actor.role !== 'donante') return <main className="p-6" role="alert"><p>No tienes permisos para acceder al área del donante.</p><LinkButton to="/">Inicio</LinkButton></main>;
  if (state.session.mfaRequired) return <Navigate to="/verificar-identidad" replace />;
  return <>{children}</>;
}
'''
backup=root / ('respaldo_registro_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
backup.mkdir(parents=True,exist_ok=True)
for p in (register,client,routes):
 target=backup / p.relative_to(root)
 target.parent.mkdir(parents=True,exist_ok=True)
 shutil.copy2(p,target)
for p,s in ((register,reg),(client,cl),(routes,rt),(guard,guardtext)):
 p.write_text(s,encoding='utf-8')
print('Parche aplicado. Respaldo:',backup)
print('Cambios: registro POST real, excepción CSRF solo para registro público, guard de sesión Donante.')
print('No cambia el backend, no salta verificación email y NO reemplaza DonorDemoContext.')

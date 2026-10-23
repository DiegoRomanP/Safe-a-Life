from pathlib import Path
from datetime import datetime
import shutil

root = Path.cwd()
frontend = root / 'frontend' / 'src'
needed = [frontend / 'app/routes.tsx', frontend / 'features/auth/pages/VerifyIdentityPage.tsx', frontend / 'features/auth/pages/LoginPage.tsx']
if not all(p.is_file() for p in needed):
    raise SystemExit('ERROR: ejecuta este archivo desde la raíz de Safe-a-Life-login. No se cambió nada.')

routes, verify, login = (p.read_text(encoding='utf-8') for p in needed)
old_redirect = "verified.actor.role === 'superadmin' ? returnTo : '/'"
old_check = "value.actor.role === 'superadmin' ? returnTo : '/'"
old_login = "session.actor.role === 'superadmin' ? '/superadmin/tareas' : '/'"
if verify.count(old_redirect) != 1 or verify.count(old_check) != 1 or login.count(old_login) != 1:
    raise SystemExit('ERROR: la versión local difiere de la revisada; no se cambió nada.')
if "path: 'hospital'" in routes:
    raise SystemExit('ERROR: ya hay una ruta hospital; no se aplicó el parche para evitar sobrescribirla.')
marker = "  { path: 'superadmin',"
if marker not in routes:
    marker = "  {\n    path: 'superadmin',"
if marker not in routes:
    raise SystemExit('ERROR: no encontré la ubicación de la ruta superadmin. No se cambió nada.')

files = {
 frontend / 'features/auth/pages/VerifyIdentityPage.tsx': verify.replace(old_redirect, "verified.actor.role === 'superadmin' ? returnTo : verified.actor.role === 'admin_hospitalario' ? '/hospital' : '/donante/perfil'").replace(old_check, "value.actor.role === 'superadmin' ? returnTo : value.actor.role === 'admin_hospitalario' ? '/hospital' : '/donante/perfil'"),
 frontend / 'features/auth/pages/LoginPage.tsx': login.replace(old_login, "session.actor.role === 'superadmin' ? '/superadmin/tareas' : '/hospital'"),
 frontend / 'app/routes.tsx': None,
 frontend / 'features/auth/RequireHospital.tsx': '''import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getSession, type Session } from '../../api/auth.js';
import { ApiError, errorMessage } from '../../api/client.js';

export function RequireHospital({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<{ session?: Session; error?: string; anonymous?: boolean }>();
  useEffect(() => {
    let active = true;
    void getSession().then(session => {
      if (active) setResult({ session });
    }).catch((error: unknown) => {
      if (active) setResult(error instanceof ApiError && error.status === 401
        ? { anonymous: true } : { error: errorMessage(error) });
    });
    return () => { active = false; };
  }, []);
  if (!result) return <main className="p-8" role="status">Comprobando acceso hospitalario…</main>;
  if (result.anonymous) return <Navigate to="/ingresar" replace />;
  if (result.error) return <main className="p-8" role="alert">{result.error}</main>;
  if (result.session?.actor.role !== 'admin_hospitalario')
    return <main className="p-8" role="alert">Tu cuenta no tiene acceso al área Hospital.</main>;
  if (result.session.aal !== 2 || result.session.mfaRequired)
    return <Navigate to="/verificar-identidad" replace />;
  return <>{children}</>;
}
''',
 frontend / 'features/hospital/pages/HospitalHomePage.tsx': '''import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, errorMessage } from '../../../api/client.js';

interface NeedsPage { items: unknown[]; pagination?: { nextCursor?: string | null } }

export function HospitalHomePage() {
  const [items, setItems] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<NeedsPage>('/api/v1/hospitals/me/needs?limit=20', { signal: controller.signal })
      .then(data => {
        if (!controller.signal.aborted) {
          if (!Array.isArray(data.items)) throw new Error('Respuesta de necesidades no válida');
          setItems(data.items);
          setError('');
        }
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorMessage(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [version]);
  return <main className="mx-auto flex max-w-5xl flex-col gap-6 p-8 text-ink">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-3xl font-bold">Hospital · Necesidades</h1>
        <p className="text-muted">Datos de tu hospital autorizado, consultados desde el servidor.</p></div>
      <div className="flex gap-3"><button className="rounded-lg border border-line px-4 py-2" onClick={() => { setLoading(true); setVersion(v => v + 1); }}>Actualizar</button>
        <Link className="rounded-lg border border-line px-4 py-2" to="/ingresar">Cambiar de cuenta</Link></div>
    </header>
    {loading ? <p role="status">Consultando necesidades…</p> : error ? <p role="alert">{error}</p> : items.length === 0 ?
      <section className="rounded-xl border border-line bg-surface p-6"><h2 className="text-xl font-semibold">Sin necesidades registradas</h2>
        <p className="text-muted">Tu hospital todavía no tiene necesidades. No se muestran datos ficticios.</p></section> :
      <section className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 text-xl font-semibold">Necesidades registradas: {items.length}</h2>
        <p className="text-muted">La consulta ya utiliza PostgreSQL. La creación y el cambio de estado se conectarán en la siguiente etapa.</p>
      </section>}
  </main>;
}
'''
}
routes = routes.replace("import { RequireDonor } from '../features/auth/RequireDonor.js';", "import { RequireDonor } from '../features/auth/RequireDonor.js';\nimport { RequireHospital } from '../features/auth/RequireHospital.js';\nimport { HospitalHomePage } from '../features/hospital/pages/HospitalHomePage.js';")
routes = routes.replace(marker, "  { path: 'hospital', element: <RequireHospital><HospitalHomePage /></RequireHospital> },\n" + marker, 1)
files[frontend / 'app/routes.tsx'] = routes

backup = root / ('respaldo_hospital_acceso_' + datetime.now().strftime('%Y%m%d_%H%M%S'))
for path, content in files.items():
    if path.exists():
        target = backup / path.relative_to(root)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
for path, content in files.items():
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8')
print('Redirección de administrador hospitalario y ruta /hospital integradas.')
print('Respaldo:', backup)
print('Sin cambios en backend, contraseñas ni PostgreSQL.')

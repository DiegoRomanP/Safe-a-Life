from pathlib import Path
from datetime import datetime
import shutil

root = Path.cwd()
files = {
 'login': root/'frontend/src/features/auth/pages/LoginPage.tsx',
 'guard': root/'frontend/src/features/auth/RequireDonor.tsx',
 'routes': root/'frontend/src/app/routes.tsx',
}
for key,path in files.items():
 if not path.is_file():
  raise SystemExit(f'No existe {path}. Ejecuta desde la raíz de Safe-a-Life-login.')

src={key:path.read_text(encoding='utf-8') for key,path in files.items()}

# Ediciones estrictamente limitadas para no sobrescribir trabajo posterior.
login=src['login']
old_import="import { errorMessage } from '../../../api/client.js';"
new_import="import { apiRequest, ApiError, errorMessage } from '../../../api/client.js';"
old_redirect="else navigate(session.actor.role === 'superadmin' ? '/superadmin/tareas' : session.actor.role === 'donante' ? '/donante/invitaciones' : '/', { replace: true });"
new_redirect="""else if (session.actor.role === 'donante') {
        // Consultamos el estado REAL del perfil, no demoData.ts.
        // 404 significa que aún no existe un perfil activo.
        try {
          await apiRequest('/api/v1/donors/me/profile');
          navigate('/donante/invitaciones', { replace: true });
        } catch (failure) {
          if (failure instanceof ApiError && failure.status === 404) {
            navigate('/donante/perfil', { replace: true });
          } else {
            throw failure;
          }
        }
      } else navigate(session.actor.role === 'superadmin' ? '/superadmin/tareas' : '/', { replace: true });"""
if old_import not in login or old_redirect not in login:
 raise SystemExit('LoginPage.tsx no coincide con la versión auditada. No se modificó nada.')
login=login.replace(old_import,new_import,1).replace(old_redirect,new_redirect,1)

guard=src['guard']
old_guard_import="import { ApiError, errorMessage } from '../../api/client.js';"
new_guard_import="import { apiRequest, ApiError, errorMessage } from '../../api/client.js';"
old_result="type Result = { status: 'ready'; session: Session } | { status: 'anonymous' } | { status: 'error'; message: string };"
new_result="type Result = { status: 'ready'; session: Session; needsOnboarding: boolean } | { status: 'anonymous' } | { status: 'error'; message: string };"
old_effect="""void getSession().then(session => {
      if (active) setResult({ path: location.pathname, revision, value: { status: 'ready', session } });
    }).catch((error: unknown) => {"""
new_effect="""void getSession().then(async session => {
      let needsOnboarding = false;
      if (session.actor.role === 'donante' && !session.mfaRequired) {
        try {
          await apiRequest('/api/v1/donors/me/profile');
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) needsOnboarding = true;
          else throw error;
        }
      }
      if (active) setResult({ path: location.pathname, revision, value: { status: 'ready', session, needsOnboarding } });
    }).catch((error: unknown) => {"""
old_end="""if (state.session.mfaRequired) return <Navigate to="/verificar-identidad" replace />;
  return <>{children}</>;"""
new_end="""if (state.session.mfaRequired) return <Navigate to="/verificar-identidad" replace />;
  if (state.needsOnboarding && location.pathname !== '/donante/perfil') {
    return <Navigate to="/donante/perfil" replace />;
  }
  return <>{children}</>;"""
for s in [old_guard_import,old_result,old_effect,old_end]:
 if s not in guard: raise SystemExit('RequireDonor.tsx no coincide con la versión auditada. No se modificó nada.')
guard=guard.replace(old_guard_import,new_guard_import,1).replace(old_result,new_result,1).replace(old_effect,new_effect,1).replace(old_end,new_end,1)

routes=src['routes']; old_idx='{ index: true, element: <Navigate to="invitaciones" replace /> },'
new_idx='{ index: true, element: <Navigate to="perfil" replace /> },'
if old_idx not in routes: raise SystemExit('routes.tsx no coincide con la versión auditada. No se modificó nada.')
routes=routes.replace(old_idx,new_idx,1)

backup=root/f'respaldo_navegacion_real_{datetime.now():%Y%m%d_%H%M%S}'
for key,path in files.items():
 dest=backup/path.relative_to(root)
 dest.parent.mkdir(parents=True,exist_ok=True)
 shutil.copy2(path,dest)
try:
 files['login'].write_text(login,encoding='utf-8')
 files['guard'].write_text(guard,encoding='utf-8')
 files['routes'].write_text(routes,encoding='utf-8')
except Exception:
 for key,path in files.items():
  shutil.copy2(backup/path.relative_to(root),path)
 raise
print('Navegación real conectada: login + protección Donante + ruta inicial.')
print('Respaldo:',backup)
print('No se cambiaron endpoints, base de datos, sesiones ni datos de negocio.')
print('Ejecuta: npm run typecheck --workspace @save-a-life/frontend')

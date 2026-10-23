from pathlib import Path
import re, shutil, datetime, sys
root=Path.cwd()
files={
'loop':root/'backend/src/modules/email-delivery/application/worker-loop.ts',
'worker':root/'backend/src/worker.ts',
'verify':root/'frontend/src/features/auth/pages/VerifyEmailPage.tsx',
}
for name,path in files.items():
    if not path.is_file():
        sys.exit(f'No se encontró {path}. Ejecuta desde la raíz Safe-a-Life-login.')
original={k:p.read_text(encoding='utf-8') for k,p in files.items()}
updated=original.copy()
# Revertir diagnósticos sin reemplazar otros cambios del usuario
updated['loop']=re.sub(r"\s*log\('worker\.ciclo', 'INICIO_PROCESAMIENTO', 0\);",'', updated['loop'])
updated['loop']=re.sub(r"\s*log\('worker\.ciclo', 'PROCESAMIENTO_TERMINADO', now\(\) - started\);",'', updated['loop'])
# Evita que el ciclo programado desaparezca cuando no hay más handles activos
if 'timer.unref();' not in updated['loop']:
    sys.exit('worker-loop.ts no tiene el temporizador esperado. Sin cambios.')
updated['loop']=updated['loop'].replace('    timer.unref();\n','').replace('    timer.unref();\r\n','')
# Quitar la ejecución manual que puede solaparse con la programada
if 'void worker.loop.tick();' not in updated['worker']:
    sys.exit('worker.ts no contiene la llamada diagnóstica esperada. Sin cambios.')
updated['worker']=re.sub(r'\r?\nvoid worker\.loop\.tick\(\);','',updated['worker'])
old=".catch(() => { if (!cancelled) setStatus('invalid'); });"
new=""".catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && [400, 404, 409, 410].includes(error.status)) {
          setStatus('invalid');
        } else {
          setMessage(errorMessage(error));
          setStatus('error');
        }
      });"""
if old not in updated['verify']:
    sys.exit('VerifyEmailPage.tsx cambió y no tiene el bloque esperado. Sin cambios.')
updated['verify']=updated['verify'].replace(old,new)
if 'const tokenRef = useRef<string>(window.location.hash.slice(1));' not in updated['verify']:
    sys.exit('La captura del token ha cambiado. Sin cambios.')
# Se conserva el componente y seguridad actuales; no imprimir ni persistir tokens
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
backup=root/f'respaldo_correccion_integracion_{stamp}'
for k,p in files.items():
    target=backup/p.relative_to(root)
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(p,target)
for k,p in files.items():
    p.write_text(updated[k],encoding='utf-8')
print('Se corrigió el ciclo periódico del worker, se retiraron los diagnósticos temporales y se diferencian los errores de verificación.')
print('Respaldo:',backup)
print('No se alteraron cuentas, datos, tokens, Supabase ni credenciales.')

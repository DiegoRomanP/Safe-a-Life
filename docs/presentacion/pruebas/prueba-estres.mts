// Prueba de carga y estrés de la API contra el backend LOCAL (127.0.0.1), nunca contra un servidor real.
// Inicia sesión UNA vez con un donante de prueba y, con esa sesión, lanza usuarios simultáneos que piden
// «mi perfil» y «mis invitaciones» durante unos segundos por nivel. Mide tiempos y códigos de respuesta.
//
//   node_modules/.bin/tsx docs/presentacion/pruebas/prueba-estres.mts
//   ESTRES_NIVELES=200,400 node_modules/.bin/tsx docs/presentacion/pruebas/prueba-estres.mts
//
// Requisitos: supabase start --workdir backend  +  npm run dev:local
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { DEMO_PASSWORD } from '../../../backend/test/support/local-env.ts';

const API = 'http://127.0.0.1:3000'; // backend local, nunca un servidor real
const EMAIL = process.env.ESTRES_EMAIL ?? 'prueba-1795661740538-1@example.test';
// Usuarios simultáneos por nivel. Se pueden cambiar: ESTRES_NIVELES=200,400
const NIVELES = (process.env.ESTRES_NIVELES ?? '1,10,25,50,100').split(',').map(Number);
const SEGUNDOS_POR_NIVEL = 10;
const RUTAS = ['/api/v1/donors/me/profile', '/api/v1/donors/me/invitations'];

// 1. Iniciar sesión una sola vez y guardar las cookies de la sesión.
const login = await fetch(`${API}/api/v1/auth/sessions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5174', 'Idempotency-Key': randomUUID() + randomUUID() },
  body: JSON.stringify({ email: EMAIL, password: DEMO_PASSWORD }),
});
if (login.status !== 200) throw new Error(`No se pudo iniciar sesión (${login.status}).`);
const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

// Percentil por «nearest-rank», como pide RNF-PER-01.
const percentil = (ms: number[], p: number) => [...ms].sort((a, b) => a - b)[Math.max(0, Math.ceil((p / 100) * ms.length) - 1)];

// 2. Un usuario virtual: pide las rutas una tras otra hasta que se acaba el tiempo del nivel.
async function usuario(hasta: number, tiempos: number[], codigos: Map<number, number>) {
  let i = 0;
  while (Date.now() < hasta) {
    const inicio = performance.now();
    let estado = 0;
    try {
      const res = await fetch(`${API}${RUTAS[i++ % RUTAS.length]}`, { headers: { Cookie: cookie } });
      await res.arrayBuffer();
      estado = res.status;
    } catch { estado = 0; } // 0 = sin respuesta (conexión rechazada o caída)
    tiempos.push(performance.now() - inicio);
    codigos.set(estado, (codigos.get(estado) ?? 0) + 1);
  }
}

// 3. Recorrer los niveles: cada uno lanza N usuarios a la vez durante unos segundos.
const resultados = [];
for (const n of NIVELES) {
  const tiempos: number[] = [];
  const codigos = new Map<number, number>();
  const hasta = Date.now() + SEGUNDOS_POR_NIVEL * 1000;
  await Promise.all(Array.from({ length: n }, () => usuario(hasta, tiempos, codigos)));
  const ok = codigos.get(200) ?? 0;
  const fila = {
    usuarios: n,
    peticiones: tiempos.length,
    porSegundo: Math.round(tiempos.length / SEGUNDOS_POR_NIVEL),
    ok,
    errores: tiempos.length - ok,
    p50: Math.round(percentil(tiempos, 50)),
    p95: Math.round(percentil(tiempos, 95)),
    max: Math.round(Math.max(...tiempos)),
    codigos: Object.fromEntries(codigos),
  };
  resultados.push(fila);
  console.log(`${String(n).padStart(3)} usuarios | ${String(fila.peticiones).padStart(6)} peticiones (${fila.porSegundo}/s) | ok ${fila.ok} | errores ${fila.errores} | p50 ${fila.p50} ms | p95 ${fila.p95} ms | máx ${fila.max} ms | ${JSON.stringify(fila.codigos)}`);
}

// Los resultados quedan en backend/.local/ (ignorado por git).
const carpeta = new URL('../../../backend/.local/', import.meta.url);
mkdirSync(carpeta, { recursive: true });
writeFileSync(new URL(`resultados-estres-${NIVELES.join('-')}.json`, carpeta), JSON.stringify({ fecha: new Date().toISOString(), resultados }, null, 2));
console.log('\nObjetivo RNF-PER-03: p95 < 500 ms con 10 usuarios simultáneos.');

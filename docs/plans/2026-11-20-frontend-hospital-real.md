# Frontend: área hospital contra el backend real (F4)

Rama `feat/frontend-hospital-real` (desde `feat/frontend-superadmin-real`). Plan maestro: `/home/diego/.claude/plans/mira-lo-que-veo-eventual-karp.md`.

## Alcance
Sustituir el contexto demo del hospital por las 9 operaciones ratificadas e implementadas del backend: sedes propias, necesidades (listar, crear, ver, transicionar) y altas asistidas (listar, crear, reenviar enlace). Lotes de invitación y respuestas dependen de la coordinación de invitaciones (F6), que el backend aún no implementa.

## Qué cambió

| Commit | Contenido |
|---|---|
| `937d947` | `lib/api/validate.ts`: validadores y paginación por cursor compartidos con superadmin (refactor sin cambio de comportamiento) |
| `88368f9` | `features/hospital/api.ts`, `HospitalContext.tsx` (carga todo, recarga tras cada escritura, acciones devuelven `null/false`), `HospitalGate` (carga, error con reintento, 403 = «sin acceso»), páginas adaptadas; `ComingSoonPage` para `/lotes` y `/respuestas`; sección de confirmaciones del detalle sustituida por un aviso; se retira el contexto demo; backend simulado `src/test/hospitalApi.ts` |
| seguimiento | el error de una pantalla ya no reaparece en otra (el del flujo «creada pero no activada» sobrevive a la navegación a propósito); se quita el texto «no se envían correos reales» y el 409 de creación ya no dice «cambió desde que abriste la pantalla» |

## Decisiones
- `createHospitalNeed` siempre crea un `borrador`: «Activar» es POST + PATCH. Si el PATCH falla, el borrador existe, se abre su detalle y se explica el motivo.
- El hospital, la sede autorizada y el propietario los deriva siempre el servidor de la membresía: el cliente envía un cuerpo cerrado (sin `hospitalId` ni `status`).
- Un 403 en toda el área (membresía no activa u hospital no autorizado) es «sin acceso», no una lista vacía.
- Lotes y respuestas: no se inventan datos; se muestra «Todavía no disponible». `confirmedIntentCount` vale 0 hasta F6 (la barra de progreso lo reflejará).
- El título de la cuenta pasa de «Hospital Nacional Central» (inventado) a «Cuenta del hospital»: la sesión del cliente no conserva el nombre del hospital.

## Verificación realizada
`npm run lint` (0 errores), `npm run test --workspace @save-a-life/frontend` (326/326), `npm run build`. Los tests usan `fetch` simulado: **no prueban cookies reales ni el backend**.

## Revisión independiente
- **reviewer-front (solo lectura, no escribió el código): PASS**, suite 325/325 verificada por el revisor. Contrato conforme. No cubre Bruno contra el backend real.
- **security-privacy-auditor: NO REALIZADA.** El lanzamiento del subagente fue rechazado dos veces por el clasificador de permisos de la herramienta. No se afirma PASS de seguridad para F4; queda pendiente de que el usuario lo autorice o lo ejecute por otra vía antes de cerrar el módulo.
- **Aceptado / pendiente (hallazgos del reviewer):**
  - Sin estado «enviando» en los botones; una acción pulsada mientras otra está en curso se descarta sin indicador.
  - Si falla la recarga tras crear un borrador, el aviso genérico pisa el del flujo parcial.
  - Una recarga descartada por `loadSeq` puede fijar `ready/error` fuera de orden (efecto visible mínimo).
  - El simulador no imita rangos de meta/horas, 409 por plazo vencido o sede inactiva, proyección a `vencida`, 429 ni 403 en escrituras.

## Pendiente
- Auditoría de seguridad de F4 (ver arriba).
- Smoke real con cookies y cuenta de administrador de hospital sintética (F8) y Bruno contra el backend real.
- Cierre del módulo: aprobación del usuario.

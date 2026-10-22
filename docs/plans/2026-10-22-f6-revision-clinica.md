# F6 — Revisión de seguridad clínica (C1)

- **Fecha:** 2026-10-22
- **Rol:** `clinical-safety-reviewer` (`.opencode/agent/clinical-safety-reviewer.md`), ejecutado como subagente `general-purpose` de solo lectura. No escribió el código revisado.
- **Autorización:** C1 de `docs/plans/Backend-Route.md` §8.1.
- **Skills leídas:** `save-a-life-domain`, `save-a-life-matching-notifications`.
- **Alcance:** `backend/src/modules/invitation-coordination/domain/*.ts` (incluido `domain.test.ts`); `backend/src/modules/email-delivery/templates/` (`invitacion.ts`, `common.ts`, `templates.test.ts` y revisión de las demás plantillas); spec F6 (`docs/plans/2026-10-12-especificacion-faltante-backend.md` líneas 1524-1697); `docs/2_Especificaciones_De_Software.md` §7.1-7.4, RF-PRO-05, RF-MAT-01..04, RF-NEC-04, RF-REC-03, RF-VIS-03, RNF-SAF-01..04; `.opencode/references/project-requirements.md`.
- **Fuera de alcance:** migración SQL, RPC y HTTP de F6 (aún no existen en el repositorio: no hay `rbc_compatibility` ni `invitation_batches`), BD, Bruno, E2E.
- **Evidencia ejecutada:** `npm run test --workspace backend -- src/modules/invitation-coordination` → 1 archivo, 17 pruebas, todas en verde (2026-10-22 11:07).

## Veredicto

**BLOCKED** — por un único hallazgo de severidad alta en la copia del email de invitación (H1, RNF-SAF-02). El dominio puro de F6 (matriz, Haversine, lote, ranking, estados, código por necesidad) **cumple** lo pedido y no tiene hallazgos bloqueantes. Al corregir H1 (y sin regresiones) esta revisión puede pasar a PASS sin repetir el análisis del dominio.

## Verificación por punto

| # | Pregunta | Resultado |
| --- | --- | --- |
| 1 | Matriz RBC: 27 permitidas / 64 parejas, regla académica, sin afirmar elegibilidad | Cumple. `compatibility.ts:6-15` coincide fila por fila con la tabla de §7.1 (8+4+4+2+4+2+2+1 = 27). Dirección donante → receptor correcta (`O_NEG` → todos; `AB_POS` → solo `AB_POS`). El comentario `compatibility.ts:3` la declara académica y «no es una fuente clínica (RNF-SAF-01)». Solo RBC: `NeedDraft.component` es el literal `'RBC'`. |
| 2 | Ranking: urgencia y reconocimientos no influyen | Cumple en el dominio. `ranking.ts:1` solo admite `{donorId, isExact, distanceM}`; urgencia y política de reconocimientos no pueden entrar por tipo. La prueba de invariancia (RF-NEC-04, RF-REC-03) corresponde a pgTAP/integración de F6-3 (pendiente, ver H6). |
| 3 | Sin filtro post-donación ni intervalos clínicos (RF-PRO-05) | Cumple. Ninguna búsqueda de `last_donation`, `ultima donacion`, `postdona`, `deferral`, `intervalo`, `cooldown` da resultados en el módulo ni en las plantillas. La spec F6 (paso 4) filtra solo estado, disponibilidad, polígono, radio y duplicados; la cuota 3/24 h es administrativa, no clínica. |
| 4 | Copia de email e instrucciones | **No cumple del todo** (H1, H2, H3). Lenguaje neutral, sin grupo, distancia, paciente ni diagnóstico, con aviso académico y aviso de intención; falta el aviso de preselección y de verificación hospitalaria de identidad, grupo y elegibilidad. |
| 5 | `batchSize` 1/2/3/25/26/50 → 5/5/6/50/50/50 | Cumple. `batch-size.ts:3` y `domain.test.ts:50`. |
| 6 | Distancia == radio incluida | Cumple. `haversine.ts:16` usa `<=`; `domain.test.ts:42-46` prueba el borde y el exceso de 1e-6 m. |
| 7 | Pruebas del dominio | Cubren las 64 parejas, el total de 27, el borde y los seis valores de lote. Ramas sin prueba en H4-H5. |

## Hallazgos

Formato: `archivo:línea — severidad — falla — cómo reproducir`.

### Alta

- **H1.** `backend/src/modules/email-delivery/templates/invitacion.ts:7-12` y `backend/src/modules/email-delivery/templates/common.ts:11` — **Alta** — El email de invitación no dice que la invitación es solo una **preselección académica** ni que **el hospital verificará identidad, grupo sanguíneo y elegibilidad** antes de una donación efectiva, como exige RNF-SAF-02 (verificación: «revisión de UI, API, email») y el rol revisor. El aviso actual («no sustituye la evaluación de un profesional de salud») es genérico y no menciona identidad ni grupo. — Reproducir: renderizar `renderTemplate('invitacion', SAMPLES.invitacion)` (`templates.test.ts:8-9`) y buscar `preselecci` o `verificar` en `text`: no aparecen.

### Media

- **H2.** `docs/plans/2026-10-12-especificacion-faltante-backend.md:1659` — **Media** — El texto fijo de instrucciones «Preséntate en la sede indicada antes del plazo. El personal de salud verificará tu grupo y tu aptitud.» (marcado «a ratificar») se muestra aunque el donante haya **rechazado** o no haya respondido, y en imperativo puede leerse como una cita o una indicación de acudir. Tampoco menciona la verificación de identidad. — Reproducir: leer la línea; la proyección de `list_own_invitations`/`get_own_invitation` no condiciona el texto a `response`.
- **H3.** `backend/supabase/migrations/20261013010000_identity_institutions.sql:21` (y `20261013020000_identity_hardening.sql:226`) — **Media** — `sites.public_instructions` es texto libre de hasta 1000 caracteres que F6 mostrará al donante sin ningún control de contenido. Quien administre la sede puede introducir intervalos de donación, contraindicaciones o promesas de aptitud que el código no puede detectar, contrario a RF-PRO-05 y §7.4. No es un defecto de código: es una decisión de gobierno de contenido (ver D2). — Reproducir: actualizar una sede con `publicInstructions = "Solo si donaste hace más de 3 meses"`; el valor se acepta.

### Baja

- **H4.** `backend/src/modules/invitation-coordination/domain/domain.test.ts:10-16` — **Baja** — El oráculo de las 64 parejas es una regla ABO/Rh reescrita en la prueba, no la tabla literal de §7.1. Si ambas se equivocaran igual, la prueba pasaría. Además, el comentario de la línea 10 («Rh- solo a Rh- o Rh+ si el ABO es compatible») es confuso: la regla real es «donante Rh− a cualquier Rh; donante Rh+ solo a Rh+». La aserción explícita de 37 rechazadas falta (se deduce de 64 − 27). — Reproducir: leer las líneas; cambiar a la vez `rule` y la matriz no rompe la prueba. Propuesta: tabla literal de 8 filas copiada de §7.1 como oráculo y `expect(rejected).toBe(37)`.
- **H5.** `backend/src/modules/invitation-coordination/domain/*.ts` — **Baja** — Ramas sin prueba:
  - `batch-size.ts:3`: `batchSize(NaN)` devuelve `NaN` y `batchSize(0)` devuelve 5. La meta se valida en F3 (1..50), así que no es explotable hoy; conviene un `it` o un guard.
  - `haversine.ts:11`: el `Math.min(1, …)` para puntos antipodales, hemisferios distintos y coordenadas inválidas (`NaN` → `isWithinRadius` devuelve `false`, falla cerrada) no tienen prueba. La skill y RF-MAT-04 piden «hemisferios y coordenadas inválidas».
  - `ranking.ts:6-7`: el empate de distancia entre no exactos y el retorno `0` para el mismo `donorId` no se prueban. El desempate por `donorId` con `<` de JS solo equivale al `order by p.donor_id` de SQL si los UUID llegan en minúsculas canónicas; anótese para la prueba de paridad de F6-3.
  - `invitation-state.ts`: `pendiente → fallida`, `enviada → fallida`, `vencida → invalidada` (debe ser `false`), `sin_respuesta → rechazada` y `rechazada → sin_respuesta` no se prueban.
  - `compatibility.ts:4-15`: `Object.freeze` solo congela el objeto externo; los arreglos internos (incluido `ALL`) siguen siendo mutables en tiempo de ejecución. Conviene congelarlos o probar `Object.isFrozen`.
- **H6.** `docs/plans/2026-10-12-especificacion-faltante-backend.md:1680-1694` — **Baja** (pendiente, no defecto) — La invariancia ante urgencia (RF-NEC-04: «comparar resultados idénticos cambiando únicamente urgencia») y ante política de reconocimientos (RF-REC-03) no figura en la lista de pgTAP/integración de F6. El dominio TS no puede recibir esos campos, pero la consulta SQL sí podría; debe probarse en F6-3.

### Documental (skill obsoleta, no es requisito)

- **H7.** `.opencode/skills/save-a-life-matching-notifications/SKILL.md:3, 15, 17, 30, 42` — **Documental** — La skill contradice la línea base vigente:
  - L3 y L15: «bloqueos» / «Filtrar disponibilidad y bloqueo vigente».
  - L42: «bloqueo en límite y fecha ausente».
  RF-PRO-05 y RF-MAT-01 prohíben la fecha de última donación y el filtro post-donación. Además:
  - L17 omite el orden «exactas primero» (RF-MAT-03), el polígono de Lima y la cuota.
  - L30 usa estados en inglés con `suppressed`, que no existe en RF-INV-01.
  **No debe tratarse como requisito.** Propuesta: sustituir L15 por «Filtrar cuentas activas, perfil completo, disponibilidad vigente y ubicación dentro del polígono; sin fecha ni filtro post-donación (RF-PRO-05)»; L42 por «Donante no disponible, fuera del polígono y que excede la cuota»; L17 por «ordenar exactas primero, luego distancia ascendente e ID opaco»; y L30 por los estados de RF-INV-01. Su edición queda a decisión de la persona usuaria (este revisor no edita).

## Copia que requiere cambio (propuesta de redacción neutral)

**Email `invitacion` (H1)**, cuerpo propuesto. Mantiene hospital, sede y plazo, y sigue sin grupo, distancia ni datos de paciente:

> {hospitalName} busca personas dispuestas a donar sangre y te invita a participar en {sitePublicName}.
>
> Recibes esta invitación porque tu perfil fue preseleccionado con una regla académica; esto no confirma que puedas donar.
>
> La convocatoria está abierta hasta {deadline}. Abre el enlace para ver los detalles y responder.
>
> Confirmar significa que tienes la intención de asistir; no es una cita médica ni garantiza una donación. El personal del hospital verificará tu identidad, tu grupo sanguíneo y si puedes donar.

**`ACADEMIC_DISCLAIMER` (`common.ts:11`)**, opcional. Evita la palabra «referencia», que suena a fuente autorizada (RNF-SAF-01):

> Este es un prototipo académico con datos sintéticos. La preselección usa una matriz académica declarada, que no es una fuente oficial ni una validación clínica, y no sustituye la evaluación de un profesional de salud.

Si se aplica, conviene añadir a `templates.test.ts` una aserción de que el email de invitación contiene «preseleccion» y «verificará tu identidad, tu grupo sanguíneo», además de un patrón prohibido para `apto|elegible|compatible contigo|garantiza`. La negación «ni garantiza» exige que el patrón sea exacto.

**Instrucciones por defecto (H2)**, propuesta para la línea 1659 de la spec:

> Si confirmas tu intención de asistir, acude a la sede indicada antes del plazo. El personal de salud verificará tu identidad, tu grupo sanguíneo y si puedes donar; esta invitación no lo garantiza.

Las demás plantillas (`verificacion_email`, `alta_asistida`, `cambio_email`, `recuperacion`, `invitacion_admin`) no mencionan donación más allá de «donante» y no requieren cambios clínicos. El disclaimer sobre «compatibilidad» resulta algo fuera de contexto en un correo de recuperación de contraseña, pero es inocuo.

## Decisiones para la persona usuaria

- **D1.** Aprobar o ajustar la redacción del email de invitación (H1) y la del aviso académico común. Sin esta decisión, F6 queda BLOCKED en la copia.
- **D2.** Gobierno de `sites.public_instructions` (H3). Opciones:
  - (a) aceptar el riesgo en el prototipo, documentando que el superadmin no debe escribir intervalos ni criterios clínicos;
  - (b) mostrar siempre el texto neutral fijo y relegar el texto de la sede a datos logísticos (dirección, horario);
  - (c) revisar el texto antes de publicarlo.
  Este revisor no puede inventar la regla correcta.
- **D3.** Ratificar el texto fijo de instrucciones (marcado «a ratificar» en la spec) con la propuesta de H2 o con otra redacción.
- **D4.** Actualizar o no la skill `save-a-life-matching-notifications` (H7).

## Límites

No constituye validación clínica ni legal; pendiente de revisión profesional en Perú. La matriz `MATRIZ_RBC_ACADEMICA_V1` se verificó solo frente a la declaración académica de §7.1, no frente a una fuente clínica. Todo uso con datos reales sigue bloqueado por RNF-SAF-03. No se revisaron el SQL, las RPC ni el HTTP de F6, que aún no existen; las pruebas de paridad TS↔SQL, invariancia ante urgencia y reconocimientos, y el texto final de las instrucciones deben pasar de nuevo por esta revisión en F6-3.

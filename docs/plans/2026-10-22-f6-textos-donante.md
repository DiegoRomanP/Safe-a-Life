# F6 — Textos fijos que ve el donante (D1–D3)

- **Fecha:** 2026-10-22
- **Estado:** propuesta de redacción. D1 **pendiente de tu aprobación** (la redacción está abajo); D2 decidido; D3 redactado, pendiente de que lo confirmes. No hay cambios de código: los textos se aplican en F6-5 (módulo TS) y F6-3 (RPC de lectura).
- **Origen:** hallazgos H1–H3 de `docs/plans/2026-10-22-f6-revision-clinica.md`.
- **Límite:** son textos de producto de un prototipo académico. No son validación clínica ni legal; pasan por `clinical-safety-reviewer` antes de cerrar F6.

## Reglas de redacción (aplican a todos los textos)

1. Nunca afirmar aptitud, elegibilidad, compatibilidad «contigo» ni garantía de donación (RNF-SAF-02).
2. Nunca decir ni insinuar intervalos, plazos entre donaciones ni criterios clínicos (RF-PRO-05).
3. Sin grupo sanguíneo, distancia, datos de paciente ni de otros donantes (RF-VIS-03).
4. Sin imperativo de acudir: «Preséntate» se lee como cita. Se usa condicional («si decides asistir…»).
5. La verificación de identidad, grupo sanguíneo y si puede donar la hace el personal del hospital, y se dice solo cuando la invitación sigue abierta.
6. Un rechazo o una invitación terminada nunca lleva instrucciones de acudir ni tono de reproche.

## D1 — Email de invitación (`templates/invitacion.ts`) · para aprobar

Asunto (sin cambio): `Convocatoria de donación de sangre`.

> {hospitalName} busca personas dispuestas a donar sangre y te invita a participar en {sitePublicName}.
>
> Recibes esta invitación porque tu perfil fue preseleccionado con una regla académica; esto no confirma que puedas donar.
>
> La convocatoria está abierta hasta {deadline}. Abre el enlace para ver los detalles y responder.
>
> Confirmar significa que tienes la intención de asistir; no es una cita médica ni garantiza una donación. El personal del hospital verificará tu identidad, tu grupo sanguíneo y si puedes donar.

Aviso común (`ACADEMIC_DISCLAIMER`, `common.ts:11`), opcional y recomendado; evita «referencia», que suena a fuente autorizada:

> Este es un prototipo académico con datos sintéticos. La preselección usa una matriz académica declarada, que no es una fuente oficial ni una validación clínica, y no sustituye la evaluación de un profesional de salud.

Pruebas a añadir en `templates.test.ts` (F6-5): el email de invitación contiene «preselecci» y «verificará tu identidad, tu grupo sanguíneo»; no contiene `apto|elegible|compatible contigo|garantizado`.

## D2 — `sites.public_instructions` · decidido: dejarlo (opción a)

Se acepta el riesgo en el prototipo: el texto de la sede se muestra tal cual. Queda documentado que quien administre una sede **no debe escribir intervalos de donación, contraindicaciones ni promesas de aptitud** en ese campo (RF-PRO-05, §7.4). No se añade control de contenido. Si `public_instructions` está vacío se usa el texto fijo de la tabla siguiente.

## D3 — Instrucciones por estado de la invitación

Se muestran en `list_own_invitations` y `get_own_invitation`. El texto depende de `validity` y `response`. Donde la sede tiene `public_instructions`, se muestra **después** del texto fijo, nunca en su lugar, salvo en los estados donde no se debe invitar a acudir (filas 3 a 6).

| # | Estado (vigencia / respuesta) | Texto fijo propuesto |
| --- | --- | --- |
| 1 | `activa` / `sin_respuesta` | «Aún no has respondido. Si decides asistir, confirma tu intención antes de {deadline}. El personal del hospital verificará tu identidad, tu grupo sanguíneo y si puedes donar; esta invitación no lo garantiza.» |
| 2 | `activa` / `confirmada` | «Registraste tu intención de asistir. Si acudes a {sitePublicName} antes de {deadline}, el personal del hospital verificará tu identidad, tu grupo sanguíneo y si puedes donar; esta invitación no lo garantiza. Puedes cambiar tu respuesta mientras la convocatoria siga abierta.» |
| 3 | `activa` / `rechazada` | «Indicaste que no podrás asistir. No tienes que hacer nada más. Si cambias de opinión, puedes confirmar tu intención mientras la convocatoria siga abierta.» |
| 4 | `vencida` (cualquier respuesta) | «La convocatoria terminó el {deadline}. Ya no es posible responder ni hace falta que acudas por esta invitación.» |
| 5 | `invalidada` / `sin_respuesta` o `rechazada` | «Esta convocatoria ya no está disponible. No hace falta que respondas ni que acudas.» |
| 6 | `invalidada` o necesidad terminal / `confirmada` | «Esta convocatoria terminó o fue cerrada. No hace falta que acudas por esta invitación; gracias por tu disposición.» |

Notas de diseño:

- **Fila 2 (confirmada):** es el único caso con «si acudes» y lo hace condicional; confirmar es intención, no cita (RNF-SAF-02, RF-INV-04).
- **Fila 3 (rechazada)**, el caso que pediste: no usa imperativo de acudir, no menciona verificación ni identidad (no aplica) y deja abierta la posibilidad de cambiar de respuesta, que RF-INV-04 permite mientras la necesidad no sea terminal.
- **Fila 6:** RF-INV-08 invalida solo las invitaciones activas *sin respuesta*; una confirmada puede seguir `activa` aunque la necesidad se cierre, se cancele o alcance su meta. La RPC de lectura debe por tanto componer el texto con el **estado de la necesidad**, no solo con `validity`. Esto es un requisito para F6-3: la proyección expone, sin datos adicionales, si la convocatoria sigue abierta.
- **Meta alcanzada** (necesidad en `meta_alcanzada`, invitación sin respuesta ya `invalidada`): usa la fila 5. Si el donante confirmado sigue dentro de la meta, usa la fila 2; si la meta se alcanzó *con* su confirmación, el texto de la fila 2 sigue siendo válido.
- **Entrega `fallida` o `pendiente`:** no se muestra al donante; no hay texto.

### Mensajes de error de acción por enlace (respuestas 409 y 410)

Se usan en la página de respuesta por token (F6-5 y frontend, cuando se descongele la Fase F).

| Caso | Código | Texto propuesto |
| --- | --- | --- |
| Convocatoria vencida o ya terminada (confirmar o rechazar, también al repetir) | 410 | «Esta convocatoria ya no está disponible. No se registró ningún cambio.» |
| Enlace ya usado y la convocatoria sigue abierta | 409 | «Ya registraste una respuesta con este enlace. Para cambiarla, inicia sesión en tu cuenta.» |
| Se confirma con la meta ya alcanzada | 409 | «La convocatoria ya reunió las personas que necesitaba. Tu respuesta no se registró, y no hace falta que acudas.» |
| Enlace no válido o manipulado | 404 | «Este enlace no es válido.» (sin pistas sobre existencia de invitación) |

## Casos probables evaluados y descartados

- Texto distinto según la urgencia de la necesidad: descartado. La urgencia no puede influir en el donante ni en la prioridad (RF-NEC-04).
- Mencionar la distancia o el grupo exacto en la invitación: descartado (RF-VIS-03; reduce el anonimato de la necesidad).
- Texto de «recordatorio»: F6 no envía recordatorios; si se añaden, requieren nueva revisión.
- Texto de «gracias» tras la donación: no hay registro de donación efectiva en el prototipo (sin fecha de última donación, RF-PRO-05).

## Qué sigue

1. Tu aprobación de D1 y de la tabla D3 (filas y errores).
2. Los textos entran en F6-3 (proyección) y F6-5 (plantilla), con las pruebas descritas.
3. `clinical-safety-reviewer` repasa el texto final en F6-3, como pide C1.

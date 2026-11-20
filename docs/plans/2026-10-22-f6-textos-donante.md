# F6 — Textos fijos que ve el donante (D1–D3)

- **Fecha:** 2026-10-22 (segunda versión, tras tu revisión)
- **Estado:** propuesta de redacción. D1 y D3 **pendientes de tu aprobación**; D2 decidido. No hay cambios de código: los textos se aplican en F6-3 (proyección) y F6-5 (plantilla).
- **Origen:** hallazgos H1–H3 de `docs/plans/2026-10-22-f6-revision-clinica.md`.
- **Límite:** son textos de producto de un prototipo académico. No son validación clínica ni legal; `clinical-safety-reviewer` los repasa antes de cerrar F6.

## Reglas de redacción (aplican a todos los textos)

1. Nunca afirmar aptitud, elegibilidad, compatibilidad «contigo» ni garantía de donación (RNF-SAF-02). Sí se puede **animar** a acudir.
2. Nunca decir ni insinuar intervalos entre donaciones ni criterios clínicos (RF-PRO-05).
3. Sin grupo sanguíneo, distancia al donante, datos de paciente ni de otros donantes (RF-VIS-03).
4. Tono que invita: «te esperamos», «te animamos», «tu ayuda cuenta». Sin fecha ni hora de cita (no es una cita médica) y sin presión ni culpa si rechazó.
5. La verificación de identidad, grupo sanguíneo y si puede donar la hace el personal del hospital en la sede; se dice como algo normal del proceso, no como advertencia.
6. Un rechazo, una invitación terminada o una convocatoria cerrada nunca llevan instrucciones de acudir.

## D1 — Email de invitación (`templates/invitacion.ts`) · para aprobar

Asunto: `Convocatoria de donación de sangre · {hospitalName}`.

> {hospitalName} necesita personas dispuestas a donar sangre y te invita a participar en {sitePublicName}.
>
> Eres un potencial donante registrado en Save a Life: tu perfil fue preseleccionado con una regla académica y aún no hemos verificado tus datos. El equipo del hospital lo hará contigo en la sede (identidad, grupo sanguíneo y si puedes donar).
>
> **Dónde:** {sitePublicName}, {siteAddress}
> **Cómo llegar:** {mapUrl}
> **Hasta cuándo:** la convocatoria está abierta hasta {deadline} (hora de Lima).
>
> Tu ayuda cuenta. Si puedes, te animamos a acercarte antes de esa fecha.
>
> Confirmo que asistiré: {confirmLink}
> No podré asistir: {rejectLink}
>
> Confirmar es avisarnos que piensas asistir; no es una cita médica. La donación se define en la sede, después de la verificación del equipo del hospital.

Datos que necesita la plantilla y su origen:

| Dato | Origen |
| --- | --- |
| `hospitalName`, `sitePublicName`, `siteAddress` | `hospitals.public_name`, `sites.public_name`, `sites.public_address`, devueltos por el `claim` del worker (A4.1, opción 1). |
| `mapUrl` | Se arma en la plantilla con `https://www.google.com/maps/search/?api=1&query={latitud},{longitud}` a partir de `sites.latitude` y `sites.longitude` (la **sede**, dato público; nunca la ubicación del donante). Las coordenadas se validan como números en rango antes de armar el enlace. |
| `deadline` | `needs.expires_at`, mostrado en hora de Lima (UTC-5). |
| `confirmLink`, `rejectLink` | Dos enlaces con token distinto (A4.1). |

Opcional, **por confirmar con el hospital**: añadir «Lleva tu documento de identidad», ya que el hospital verificará identidad. No lo incluyo en la versión base porque es un requisito administrativo que no me corresponde inventar.

Aviso común (`ACADEMIC_DISCLAIMER`, `common.ts:11`), recomendado; evita «referencia», que suena a fuente autorizada:

> Este es un prototipo académico con datos sintéticos. La preselección usa una matriz académica declarada, que no es una fuente oficial ni una validación clínica, y no sustituye la evaluación de un profesional de salud.

Pruebas a añadir en `templates.test.ts` (F6-5): contiene «potencial donante», «aún no hemos verificado» y el enlace `google.com/maps`; no contiene `apto|elegible|compatible contigo|garantizad`; el enlace de mapa no se arma si las coordenadas no son válidas.

## D2 — `sites.public_instructions` · decidido: dejarlo (opción a)

Se acepta el riesgo en el prototipo: el texto de la sede se muestra tal cual en la app (no en el email). Queda documentado que quien administre una sede **no debe escribir intervalos de donación, contraindicaciones ni promesas de aptitud** en ese campo (RF-PRO-05, §7.4). No se añade control de contenido. Si está vacío, se usa el texto fijo de la tabla siguiente.

## D3 — Instrucciones por estado de la invitación · para aprobar

Se muestran en `list_own_invitations` y `get_own_invitation`. El texto depende de la vigencia y la respuesta. Si la sede tiene `public_instructions`, se muestra **después** del texto fijo, solo en las filas 1 y 2.

| # | Estado (vigencia / respuesta) | Texto fijo propuesto |
| --- | --- | --- |
| 1 | `activa` / `sin_respuesta` | «Tu ayuda cuenta. Te esperamos en {sitePublicName}, {siteAddress}, hasta el {deadline}. Confirma que asistirás para que el hospital sepa que cuenta contigo. En la sede, el equipo verificará tu identidad, tu grupo sanguíneo y si puedes donar.» |
| 2 | `activa` / `confirmada` | «¡Gracias por confirmar! Te esperamos en {sitePublicName}, {siteAddress}, hasta el {deadline}. En la sede, el equipo verificará tu identidad, tu grupo sanguíneo y si puedes donar. Si surge un imprevisto, puedes cambiar tu respuesta aquí.» |
| 3 | `activa` / `rechazada` | «Gracias por avisarnos. Si tus planes cambian, aún estás a tiempo: puedes confirmar que asistirás hasta el {deadline}, y te recibiremos en {sitePublicName}.» |
| 4 | `vencida` (cualquier respuesta) | «Esta convocatoria ya terminó. ¡Gracias por tu disposición! Si mantienes tu disponibilidad activa en tu perfil, podrás recibir futuras convocatorias.» |
| 5 | `invalidada` / `sin_respuesta` o `rechazada` | «Esta convocatoria ya no está activa. ¡Gracias por tu disposición! Si mantienes tu disponibilidad activa en tu perfil, podrás recibir futuras convocatorias.» |
| 6 | necesidad terminal (cerrada, cancelada, vencida o meta alcanzada) / `confirmada` | «Esta convocatoria ya terminó, por lo que no necesitas acudir. ¡Gracias por haber confirmado!» |

Notas de diseño:

- **Filas 1–3** invitan y animan; el condicional que queda es solo el de la verdad del proceso (el hospital verifica en la sede). Ninguna usa imperativo («Preséntate») ni fija hora: «te esperamos hasta {deadline}» no es una cita.
- **Fila 3 (rechazada):** deja la puerta abierta sin presionar y respeta RF-INV-04 (puede cambiar mientras la necesidad no sea terminal).
- **Filas 4–6:** nunca invitan a acudir. La fila 6 es la excepción de seguridad: dice explícitamente que no necesita acudir.
- **Dependencia para F6-3:** RF-INV-08 invalida solo las invitaciones *sin respuesta*; una confirmada puede seguir `activa` aunque la necesidad se cierre. La proyección de lectura compone el texto con el **estado de la necesidad**, no solo con `validity`.
- **Entrega `fallida` o `pendiente`:** no se muestra al donante; no hay texto.

### Mensajes de error de acción por enlace (409, 410, 404)

| Caso | Código | Texto propuesto |
| --- | --- | --- |
| Convocatoria vencida o terminada (confirmar, rechazar o repetir) | 410 | «Esta convocatoria ya terminó. No se registró ningún cambio. ¡Gracias por tu disposición!» |
| Enlace ya usado y la convocatoria sigue abierta | 409 | «Ya registraste una respuesta con este enlace. Para cambiarla, inicia sesión en tu cuenta.» |
| Se confirma con la meta ya alcanzada | 409 | «La convocatoria ya reunió a las personas que necesitaba. Tu respuesta no se registró y no necesitas acudir. ¡Gracias por querer ayudar!» |
| Enlace no válido | 404 | «Este enlace no es válido.» (sin pistas sobre si la invitación existe) |

## Casos evaluados y descartados

- Texto distinto según la urgencia: descartado (RF-NEC-04: la urgencia no puede influir en el donante).
- Mostrar distancia o grupo exacto: descartado (RF-VIS-03).
- Recordatorios: F6 no los envía; si se añaden, requieren nueva revisión.
- «Gracias por donar»: no existe registro de donación efectiva en el prototipo (RF-PRO-05).
- Decir «no tienes que hacer nada más» al que rechazó (versión anterior): sustituido por la invitación abierta de la fila 3.

## Qué sigue

1. Tu aprobación de D1 (email) y de la tabla D3.
2. Los textos entran en F6-3 (proyección) y F6-5 (plantilla), con las pruebas descritas.
3. `clinical-safety-reviewer` revisa la copia final: en particular que «te esperamos» y «te animamos» no se lean como cita ni como promesa de aptitud.

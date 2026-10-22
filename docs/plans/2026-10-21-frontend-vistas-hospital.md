# Plan: vistas del hospital

| Campo | Valor |
| --- | --- |
| Estado | Implementado (página 02 completa); gate PASS de reviewer-front |
| Fecha | 2026-10-21 |
| Rama | `feat/frontend-vistas-hospital` (desde `main` en `9a2f20d`, tras fusionarse las vistas secundarias del donante en el PR #13) |
| Plan padre | [`2026-10-20-frontend-estructura-por-componentes.md`](2026-10-20-frontend-estructura-por-componentes.md) |
| Decisiones | D-4, versión «+» de Penpot, prioridad de escritorio, primero lo principal |
| Gate | `reviewer-front` independiente del autor y revisión visual a 1440 px |

## 1. Alcance

Página «02 - Hospital» de Penpot completa. Primero se hizo la parte
principal (HOS-01, HOS-02, HOS-03 y HOS-05, revisada con PASS). La persona
usuaria pidió sumar en la misma rama HOS-04 y HOS-06 (§4).

| Vista | Ruta | Operaciones del contrato (sin llamar todavía, D-4) |
| --- | --- | --- |
| AppLayout del hospital | `/hospital/*` | — |
| HOS-01 Resumen operativo | `/hospital` | `listOwnHospitalNeeds` |
| Lista de necesidades | `/hospital/necesidades` | `listOwnHospitalNeeds` |
| HOS-02 Crear necesidad | `/hospital/necesidades/nueva` | `listOwnHospitalSites`, `createHospitalNeed`, `transitionOwnHospitalNeed` |
| HOS-03 Detalle de necesidad | `/hospital/necesidades/:needId` | `getOwnHospitalNeed`, `transitionOwnHospitalNeed`, `listOwnNeedResponses` |
| HOS-05 Respuestas | `/hospital/necesidades/:needId/respuestas` | `listOwnNeedResponses` |

El login suma, solo en desarrollo, «Entrar como hospital de prueba». Los
datos son sintéticos y viven en memoria con la forma del contrato.

## 2. Decisiones por diferencias entre Penpot y el contrato

- **HOS-01:** «Entregas pendientes» y «Tareas por revisar» no salen de
  ninguna operación del hospital. Se muestran necesidades activas, metas
  alcanzadas, intenciones confirmadas y borradores.
- **HOS-02:** `createHospitalNeed` crea un borrador y no recibe estado.
  «Activar necesidad» crea y luego aplica `transitionOwnHospitalNeed` con
  `status: activa`. El componente es fijo (`RBC`), el radio va de 1 a 50 km
  (10 por defecto) y el vencimiento de 1 a 72 horas.
- **HOS-03:** la necesidad no tiene fecha de creación en el contrato, así que
  no se muestra. Cancelar pide una confirmación explícita.
- **HOS-05:** se usa la proyección de `listOwnNeedResponses`. Las respuestas
  no afirmativas muestran solo código opaco, vigencia, entrega y respuesta; las
  confirmadas muestran además nombre y grupo declarado. El código respeta el
  mínimo de 8 caracteres de `needDonorCode`.
- **Código visible de necesidad** («NEC-A104»): sale del inicio del `needId`.

## 3. Criterios de aceptación

- Los mismos de los planes previos: un `h1` por vista, foco al primer error o
  al resultado, `aria-live` sin regiones anidadas, fechas con zona horaria,
  «intenciones de asistir» (no unidades ni suficiencia) y sin promesas
  clínicas.
- Minimización: el hospital solo ve la proyección permitida.
- Pasan `npm run lint`, `npm run test` y `npm run build`.

## 4. Ampliación: HOS-04 y HOS-06

| Vista | Ruta | Operaciones del contrato (sin llamar todavía, D-4) |
| --- | --- | --- |
| HOS-04 Lotes y entregas | `/hospital/necesidades/:needId/lotes` | `listOwnInvitationBatches`, `requestInvitationBatch` |
| HOS-06 Altas asistidas | `/hospital/altas` | `listOwnAssistedSignups`, `createAssistedSignup`, `reissueAssistedActivationLink` |

Decisiones:

- **HOS-04:** el hospital solicita un lote pero no elige donantes. Solo se
  ofrece con la necesidad activa, y la urgencia no crea lotes automáticos. En
  la demo, cada lote suma invitaciones nuevas «Sin respuesta» a las
  respuestas de la necesidad; una prueba exige que las invitaciones de los
  lotes coincidan con las respuestas. La tabla «Estado de entrega» de Penpot
  es la misma proyección que HOS-05, que ya la muestra.
- **HOS-06:** solo correo y nombre opcional; nunca contraseña, grupo ni
  ubicación. El resultado es neutro aunque el correo ya exista. Reenviar el
  enlace devuelve el alta a «pendiente» sin reiniciar su fecha de creación
  (AP-01). «Ver detalle» de Penpot (`getOwnAssistedSignup`) queda fuera: la
  lista ya muestra los mismos campos.

## 5. Revisión

`reviewer-front` (subagente independiente, solo lectura):

1. **Primera ronda: BLOCKED.**
   - **B-1:** NEC-0221 decía «5 de 5» sin respuestas en los datos de demo.
2. **Corrección `562bbc9`.**
   - NEC-0221 suma sus cinco confirmadas, y `demoData.test.ts` exige que
     `confirmedIntentCount` coincida con las respuestas de cada necesidad.
   - Observaciones aplicadas: la confirmación de cancelar usa tono de aviso,
     sin «Error:» y sin afirmar comportamiento del backend; el progressbar
     tiene `aria-valuetext`; un radio vacío usa los 10 km por defecto.
3. **Segunda ronda: PASS** sobre los 5 commits del slice.

Observaciones pendientes:

- La confirmación de cancelar no se asocia a su pregunta para lectores de
  pantalla (`role="group"` con `aria-labelledby`).
- Falta una prueba del radio vacío.
- «Vence:» de HOS-02 se calcula con la hora de apertura del formulario, no con
  la del envío.
- Las fechas de demo son de septiembre de 2026 y siguen como «Activa».
- Tras cancelar, el texto dice «confirmaciones de intención vigentes».

Verificación del autor: contenido de HOS-01 con `get_page_text`. El panel del
navegador era pequeño, así que no se comprobó la composición a 1440 px. Las
entradas de desarrollo no están en `dist`. No verificado: composición a
1440 px, lector de pantalla real, E2E y gitleaks local.

### Revisión de la ampliación (HOS-04 y HOS-06)

`reviewer-front` dio **PASS** en la primera ronda sobre `31cd1fd` y `d8c411a`.
Revisó minimización y neutralidad de HOS-06, reenvío según AP-01, HOS-04 solo
con la necesidad activa y la coherencia de la demo tras solicitar un lote.

Después del PASS se aplicaron, sin revisión aparte, en «fix(frontend): textos
de altas asistidas y lotes»:

- el error de correo habla del correo de la persona;
- el aviso de reenvío es neutral;
- el resultado de un lote se redacta bien con 0 o 1 invitación;
- se corrigió la sangría del enlace en HOS-03.

Pendiente para el cliente HTTP:

- Reemitir solo antes de la purga original (409/422).
- La numeración LOT-00N supone orden ascendente por `createdAt`.
- La lista de altas no muestra `activationExpiresAt` ni `purgeAt`.

## 6. Bitácora

- 2026-10-21: plan aprobado por la persona usuaria.
- 2026-10-21: HOS-01, lista de necesidades, HOS-02, HOS-03 y HOS-05
  implementadas, con 151 pruebas, lint y build en verde. Gate PASS en la
  segunda ronda.
- 2026-10-21: la persona usuaria pidió sumar HOS-04 y HOS-06 en la misma rama.
  Implementadas con 162 pruebas, lint y build en verde. Gate PASS.

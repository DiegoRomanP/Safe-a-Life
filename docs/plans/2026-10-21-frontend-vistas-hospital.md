# Plan: vistas principales del hospital

| Campo | Valor |
| --- | --- |
| Estado | Implementado; gate PASS de reviewer-front (segunda ronda) |
| Fecha | 2026-10-21 |
| Rama | `feat/frontend-vistas-hospital` (desde `feat/frontend-donante-secundarias`; se rebasa sobre `main` cuando ese PR se fusione) |
| Plan padre | [`2026-10-20-frontend-estructura-por-componentes.md`](2026-10-20-frontend-estructura-por-componentes.md) |
| Decisiones | D-4, versión «+» de Penpot, prioridad de escritorio, primero lo principal |
| Gate | `reviewer-front` independiente del autor y revisión visual a 1440 px |

## 1. Alcance

Página «02 - Hospital» de Penpot, parte principal. HOS-04 (lotes) y HOS-06
(altas asistidas) quedan para `feat/frontend-hospital-secundarias`.

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

## 4. Revisión

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

## 5. Bitácora

- 2026-10-21: plan aprobado por la persona usuaria.
- 2026-10-21: HOS-01, lista de necesidades, HOS-02, HOS-03 y HOS-05
  implementadas, con 151 pruebas, lint y build en verde. Gate PASS en la
  segunda ronda.

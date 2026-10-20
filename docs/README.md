# Índice de documentación

Sincronización documental: **2026-10-20**, tras implementar F7 en el backend. No
ratifica operaciones nuevas ni acredita despliegues, revisiones independientes
(gates) o cierre del backend.

Esta carpeta reúne la línea base funcional, la especificación en borrador, el
contrato API de trabajo, las decisiones técnicas y las guías para desarrollar el
frontend local. Este índice ayuda a elegir la fuente adecuada y a iniciar los
mocks; no sustituye los documentos que enlaza.

## Por dónde empezar

| Si necesitas… | Consulta |
| --- | --- |
| Entender los requisitos funcionales aprobados | [Primeros alcances](1_Primeros_Alcances.md) |
| Consultar la ERS y sus requisitos verificables | [Especificación de software](2_Especificaciones_De_Software.md) — continúa en borrador |
| Conocer la forma propuesta de la API y sus reglas | [Reglas de API](Api-Rules.md) y el [contrato OpenAPI JSON](openapi.json) |
| Empezar a trabajar en el frontend usando los mocks | [Entrega frontend](Frontend-Handoff.md) |
| Consultar el sistema visual de la interfaz | [Diseño frontend](Frontend-Design.md) |
| Entender la asignación y revisión entre agentes | [Flujo de trabajo de agentes](Agent-Workflow.md) |
| Verificar una decisión de stack o de tooling local | [Decisiones de arquitectura](decisions/) |
| Consultar el avance y evidencia de una tarea | [Planes vigentes](plans/) y [historial consolidado](plans/HISTORIAL.md) |
| Ver bloqueos y decisiones abiertas | [Pendientes](pending/2026-10-20-bloqueos-y-decisiones.md) |

## Mapa de `docs/`

```text
docs/
├── README.md                       # Este índice y guía rápida de ejecución
├── 1_Primeros_Alcances.md          # Línea base funcional aprobada, v1.2
├── 2_Especificaciones_De_Software.md # ERS controlada, todavía en borrador
├── Agent-Workflow.md               # Selección de agentes, delegación y gates
├── Api-Rules.md                    # Reglas propuestas para API y mocks
├── Frontend-Design.md              # Dirección visual y aceptación de interfaz
├── Frontend-Handoff.md             # Setup, matriz de operaciones y trabajo frontend
├── openapi.json                    # Contrato OpenAPI 3.1 canónico de trabajo
├── decisions/                      # ADRs aceptados y sus límites
├── pending/                        # Bloqueos y decisiones abiertas
└── plans/                          # Planes vigentes; HISTORIAL.md resume los cerrados
```

La referencia de requisitos normalizada está en
`.opencode/references/project-requirements.md`; la instrucción general de agentes
está en `AGENTS.md`. El backlog y matriz funcional se conservan además en
`Save_a_Life.xlsx` en la raíz.

## Autoridad y estado

1. `1_Primeros_Alcances.md` es la línea base funcional aprobada.
2. `docs/decisions/ADR-001-stack-del-prototipo.md` determina el stack aprobado.
3. `2_Especificaciones_De_Software.md` organiza requisitos verificables, pero es
   un borrador controlado y no reemplaza la línea base.
4. `Api-Rules.md` y `openapi.json` definen una propuesta Design-First para que
   frontend, Prism, Bruno y el mock compartan modelos. El estado global sigue en
   borrador, con ratificación por operación: 66 ratificadas y 7 sin ratificar.
   Sus textos de estado aún requieren sincronización separada; no prevalecen
   sobre las decisiones posteriores aprobadas.
5. `docs/decisions/ADR-002-design-first-mock-tooling.md` acota las herramientas
   locales y los límites de sus respuestas sintéticas.

AP-02, AP-06, AP-07 y AP-08 están resueltas por
[`ADR-005`](decisions/ADR-005-email-outbox-worker.md), aceptado el 2026-10-12;
AP-04 por V6 de la [especificación backend](plans/2026-10-12-especificacion-faltante-backend.md)
§2.3/§6 F6 y la ratificación F6 registrada el 2026-10-13. El jitter aprobado es
**uniforme ±20 %**. La [línea base](1_Primeros_Alcances.md) y la ERS §10.5
detallan estas resoluciones, que no equivalen a implementación o verificación.
No deducir nuevas decisiones clínicas, legales o de producto desde el contrato.

## Inventario estático — 2026-10-20

| Medida | Recuento y alcance |
| --- | --- |
| OpenAPI | 58 paths, 73 operaciones y 100 schemas |
| Ratificación | 66 operaciones con `x-ratification.status = ratified-for-implementation` |
| Backend HTTP | 56 registros método/ruta en ocho routers de `backend/src/modules/**/http/*.router.ts` (plataforma 2, F2a 21, F2b 5, F3 4, F4 1, F5 14, F7 9) |
| F6 | Diez operaciones ratificadas sin registro HTTP; solo existe el dominio puro de `invitation-coordination` (`da425c0`) |
| F8 | Siete operaciones de reconocimientos e información legal sin ratificar ni módulo |
| F7 | Implementado sin borrado de cuentas de Auth (ADR-006, ver P-12 en pendientes) |

56 registrados + 10 de F6 = 66 ratificadas. El webhook depende de
configuración en la composición: contar su registro no prueba que esté activo.
El recuento no mide cobertura de pruebas ni equivale a 56 flujos aceptados.

Para reproducir las cantidades, ejecutar desde la raíz, sin leer secretos:

```bash
python3 - <<'PY'
import json, re
from pathlib import Path
j = json.loads(Path('docs/openapi.json').read_text())
methods = {'get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'}
ops = [o for v in j['paths'].values() for m, o in v.items() if m in methods]
routers = Path('backend/src/modules').glob('**/http/*.router.ts')
print('paths/operaciones/schemas:', len(j['paths']), len(ops), len(j['components']['schemas']))
print('ratificadas:', sum(o.get('x-ratification', {}).get('status') == 'ratified-for-implementation' for o in ops))
print('registros HTTP:', sum(len(re.findall(r'\bapp\.(?:get|post|put|patch|delete|head|options)\(', p.read_text())) for p in routers))
PY
```

Los planes conservan resultados históricos; no son pruebas actuales. Estado de
F7 (2026-10-20): pgTAP 684, unitarias 766, integración 208 y Bruno backend en
verde; `test:contract` no se completó (Prism se cuelga en este entorno) y no se
ejecutó ningún gate independiente. F7 se hizo antes que F6. Quedan F6 (resto),
F8 y F9 (frontend y borde sin decidir). No se anuncia backend completo ni uso
con datos reales.

## Preparar el entorno local

Desde la raíz del repositorio, usar Node `24.19.0`, npm `12.0.2` y Bruno CLI
`4.2.0` (herramienta local externa). Con nvm instalado:

```bash
nvm use
node --version
npm --version
bru --version
SCARF_ANALYTICS=false npm ci
```

No hacen falta claves de Supabase o Resend para el mock. No activar scripts de
dependencias globalmente ni sustituir el lockfile sin revisión.

La integración Penpot de OpenCode es opcional y lee `PENPOT_USER_TOKEN` del
entorno local. Configúrala fuera del repositorio solo si necesitas esa
integración; no se requiere para Prism ni para desarrollar el frontend. Reinicia
OpenCode después de cambiar `.opencode/opencode.json`.

## Iniciar Prism y los mocks

### Prism: respuestas estáticas del contrato

En una terminal desde la raíz:

```bash
npm run mock:prism
```

Prism escucha en `http://127.0.0.1:4010` y sirve ejemplos del JSON OpenAPI. No
conserva mutaciones entre solicitudes. El JSON contiene 73 operaciones; para
verificar el contrato con un proceso efímero, usar:

```bash
npm run test:contract
```

### Web con Express: subconjunto con estado sintético

En otra terminal:

```bash
npm run dev
```

Abrir `http://127.0.0.1:5173`. El comando inicia Vite y el mock Express en
`127.0.0.1:4011`; el estado es sintético, se conserva solo en memoria y se pierde
al reiniciar. El proxy de la web apunta únicamente a Express. Iniciar Prism no
conecta automáticamente la web a `4010`.

Este Express es el **mock**, no el backend de 56 registros del inventario
anterior. La [matriz histórica de entrega frontend](Frontend-Handoff.md#7-matriz-exacta-de-las-69-operaciones)
documenta el corte de 69 operaciones y 25 registros del mock; no es un inventario
actual del backend ni acredita sus 73 operaciones como flujos stateful. La
ejecución de `test:contract` sigue siendo necesaria para afirmar su resultado.

Para detener cada proceso, usa `Ctrl+C` en su terminal.

## Comandos de verificación

```bash
npm run openapi:lint
npm run test:contract
npm test
npm run test:bruno
npm run test:e2e -- --trace=off
npm run typecheck
npm run lint
npm run build
npm run audit:production
git diff --check
```

`npm run lint` actualmente ejecuta comprobación TypeScript, no un linter
independiente. En E2E se recomienda `--trace=off` porque Playwright está
configurado para conservar trazas ante fallos; pueden contener requests y
headers. No adjuntar trazas, HAR, cookies ni cuerpos de solicitudes.

## Límites importantes

- El contrato OpenAPI estático y el mock local no acreditan Supabase Auth, RLS,
  PostgreSQL, transacciones, concurrencia, matching, Resend ni entrega de email.
- Los lotes hospitalarios del mock registran solicitudes con cero invitaciones y
  cero correos; eso no significa que no haya candidatos.
- Se usan únicamente datos sintéticos. No incorporar pacientes, diagnósticos,
  historial/fecha de donación, PII real ni tokens reales.
- El matching propuesto preselecciona candidatos; no certifica elegibilidad ni
  seguridad transfusional. No se afirman cumplimiento legal o clínico.
- Swagger Editor 5 permite revisar visualmente OpenAPI 3.1, pero la importación y
  renderizado visual de este contrato siguen pendientes de una comprobación
  humana documentada en la [guía de entrega](Frontend-Handoff.md).

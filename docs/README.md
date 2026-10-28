# Índice de documentación

Sincronización documental: **2026-10-20**, tras implementar F7 en el backend. No
ratifica operaciones nuevas ni acredita despliegues, revisiones independientes
(gates) o cierre del backend.

Esta carpeta reúne la línea base funcional, la especificación en borrador, el
contrato API de trabajo, las decisiones técnicas y las guías para desarrollar el
frontend local. Este índice ayuda a elegir la fuente adecuada y a iniciar los
mocks; no sustituye los documentos que enlaza.

## Cómo está organizada

La documentación se organiza como una biblioteca de **libros**. Cada libro tiene un
propósito, una fuente de verdad y un estado. Los archivos conservan su ruta actual
porque scripts, `AGENTS.md`, `CLAUDE.md` y `.opencode/` los citan; este índice es la
estructura. Para encontrar algo, empieza por el libro, no por la carpeta.

Estados: **Aprobado** (línea base o ADR aceptado), **Borrador** (en revisión),
**Vigente** (se mantiene con el código), **Histórico** (registro de lo ocurrido, no
prueba el estado actual).

| Si necesitas… | Libro |
| --- | --- |
| Qué debe hacer el producto y con qué límites | [1. Producto y requisitos](#1-producto-y-requisitos) |
| Por qué se eligió una tecnología o patrón | [2. Decisiones de arquitectura](#2-decisiones-de-arquitectura) |
| Cómo es la API y qué está ratificado | [3. Contrato de API](#3-contrato-de-api) |
| Cómo se organiza el backend y su avance | [4. Backend](#4-backend) |
| Cómo construir o integrar el frontend | [5. Frontend](#5-frontend) |
| Cómo se trabaja con agentes y qué gates hay | [6. Proceso y agentes](#6-proceso-y-agentes) |
| Diagramas UML de arquitectura y clases | [7. Diagramas](#7-diagramas) |
| Ejecutar, probar y reproducir recuentos | [8. Operación](#8-operación-entorno-local-y-verificación) |
| Bloqueos y decisiones abiertas | [9. Pendientes](#9-pendientes-y-bitácora) |

### 1. Producto y requisitos

| Documento | Tipo | Estado | Fuente de verdad para |
| --- | --- | --- | --- |
| [Primeros alcances](1_Primeros_Alcances.md) | Línea base funcional | Aprobado (v1.2) | Alcance funcional y límites clínicos |
| [Especificación de software (ERS)](2_Especificaciones_De_Software.md) | Requisitos verificables | Borrador (v0.4) | Requisitos RF/RNF; no reemplaza la línea base |
| `.opencode/references/project-requirements.md` | Requisitos normalizados | Vigente | Referencia rápida para agentes |
| `Save_a_Life.xlsx` (raíz) | Backlog y matriz | Vigente | Historias y matriz funcional |

### 2. Decisiones de arquitectura

| ADR | Tema | Estado |
| --- | --- | --- |
| [ADR-001](decisions/ADR-001-stack-del-prototipo.md) | Stack y despliegue | Aprobado |
| [ADR-002](decisions/ADR-002-design-first-mock-tooling.md) | Tooling Design-First y mocks | Aprobado |
| [ADR-003](decisions/ADR-003-persistencia-rpc-supabase.md) | Persistencia por RPC de Supabase | Aprobado |
| [ADR-004](decisions/ADR-004-sesion-csrf-cors-topologia.md) | Sesión, CSRF, CORS y topología | Aprobado |
| [ADR-005](decisions/ADR-005-email-outbox-worker.md) | Email, outbox y worker | Aprobado |
| [ADR-006](decisions/ADR-006-allowlist-service-role.md) | Allowlist de `service_role` | Aprobado |
| [ADR-007](decisions/ADR-007-barrera-de-sesion-tras-reset-de-contrasena.md) | Barrera de sesión tras reset de contraseña | Aprobado |

Un ADR aceptado no se cambia sin decisión de la persona usuaria.

### 3. Contrato de API

| Documento | Tipo | Estado | Fuente de verdad para |
| --- | --- | --- | --- |
| [openapi.json](openapi.json) | Contrato OpenAPI 3.1 | Vigente (ratificación por operación) | La API; de él se generan los tipos y validadores |
| [Reglas de API](Api-Rules.md) | Convenciones | Borrador | Errores, paginación, idempotencia, seguridad |
| [Contratos backend](Backend-Contracts.md) | Ratificación por operación | Vigente | Qué operaciones están ratificadas |
| [Contrato de aplicación: necesidad en borrador](Need-Draft-Application-Spec.md) | Contrato privado | Aprobado como base de `need-records` (ADR-003) | Puertos y errores de `createHospitalNeed` |

### 4. Backend

| Documento | Tipo | Estado |
| --- | --- | --- |
| [Plan de backend incremental](plans/2026-10-12-api-backend-completo-incremental.md) | Mapa de capacidades | Vigente |
| [Especificación faltante del backend](plans/2026-10-12-especificacion-faltante-backend.md) | Especificación de ejecución | Vigente |
| [Backend-Route](plans/Backend-Route.md) | Ruta y compuertas | Vigente |
| [Decisiones del backend](plans/2026-10-13-decisiones-backend.md) | Decisiones por módulo | Vigente |
| Módulos: [identity-institutions](plans/2026-10-12-identity-institutions.md), [identity-tokens](plans/2026-10-13-identity-tokens.md), [need-records](plans/2026-10-13-need-records.md), [donor-records](plans/2026-10-13-donor-records.md), [email-delivery](plans/2026-10-13-email-delivery.md), [invitation-coordination](plans/2026-10-20-invitation-coordination.md), [privacy-requests](plans/2026-10-20-privacy-requests.md) | Plan y evidencia por módulo | Histórico |
| [Verificación del backend](plans/2026-10-21-verificacion-backend.md), [F6 contrato reconciliado](plans/2026-10-22-f6-contrato-reconciliado.md), [F6 revisión clínica](plans/2026-10-22-f6-revision-clinica.md), [F6 textos de donante](plans/2026-10-22-f6-textos-donante.md) | Verificación y F6 | Histórico |

### 5. Frontend

| Documento | Tipo | Estado |
| --- | --- | --- |
| [Entrega frontend (mocks y matriz)](Frontend-Handoff.md) | Guía de trabajo | Vigente |
| [Diseño de interfaz](Frontend-Design.md) | Sistema visual y aceptación | Vigente |
| [Base TypeScript](plans/2026-10-19-frontend-typescript-base.md), [estructura por componentes](plans/2026-10-20-frontend-estructura-por-componentes.md), [UI base](plans/2026-10-21-frontend-ui-base.md) | Plan | Histórico |
| Vistas: [acceso](plans/2026-10-21-frontend-vistas-acceso.md), [públicas](plans/2026-10-21-frontend-vistas-publicas.md), [donante](plans/2026-10-21-frontend-vistas-donante.md), [donante secundarias](plans/2026-10-21-frontend-donante-secundarias.md), [estados de donante](plans/2026-10-22-frontend-estados-donante.md), [hospital](plans/2026-10-21-frontend-vistas-hospital.md), [superadmin](plans/2026-10-22-frontend-vistas-superadmin.md) | Plan | Histórico |
| [Revisiones de seguridad y clínica](plans/2026-10-22-frontend-revisiones-seguridad-clinica.md), [títulos y accesibilidad](plans/2026-10-22-frontend-titulos-a11y.md) | Revisión | Histórico |
| [Integración frontend–backend](plans/2026-10-23-frontend-backend-integration.md) | Plan | Vigente (en curso) |

### 6. Proceso y agentes

| Documento | Tipo | Estado |
| --- | --- | --- |
| [Flujo de trabajo de agentes](Agent-Workflow.md) | Proceso y gates | Vigente |
| [Identidad de proyecto de Engram](Memory-Project.md) | Configuración de memoria | Vigente |
| [Migración local de Gentle Pi](plans/2026-10-23-local-gentle-pi-migration.md) | Plan | Histórico |
| [Historial consolidado de planes](plans/HISTORIAL.md) | Resumen de planes cerrados | Histórico |
| [Análisis del estado](plans/2026-10-16-analisis-estado-proyecto.md), [auditoría y cierre](plans/2026-10-20-auditoria-y-cierre-de-pendientes.md), [ejecución con agentes](plans/2026-10-20-ejecucion-de-pendientes-con-agentes.md), [ESLint por workspaces](plans/2026-10-20-eslint-workspaces.md), [opciones de borrado en Auth (P-12)](plans/2026-10-21-p12-opciones-borrado-auth.md), [backend inside-out](plans/2026-10-04-backend-inside-out.md) | Planes de proceso y calidad | Histórico |

Cada tarea lleva su plan en `plans/YYYY-MM-DD-<slug>.md`. Los planes registran
evidencia de su fecha; no son pruebas del estado actual.

### 7. Diagramas

| Documento | Contenido |
| --- | --- |
| [Diagramas UML (índice y explicación)](../evidence_pc2/diagramas_uml.md) | 25 páginas: arquitectura, patrones, clases y composición |
| [Archivo editable](../evidence_pc2/diagramas/save-a-life-uml.drawio) y [PNG](../evidence_pc2/diagramas/png/) | Fuente `.drawio` y exportaciones |
| [Plan de los diagramas](plans/2026-10-16-diagramas-uml-arquitectura.md) | Alcance y evidencia |

### 8. Operación: entorno local y verificación

Secciones de este mismo archivo: [inventario estático](#inventario-estático--2026-10-20),
[preparar el entorno](#preparar-el-entorno-local), [iniciar Prism y los mocks](#iniciar-prism-y-los-mocks),
[comandos de verificación](#comandos-de-verificación) y [límites importantes](#límites-importantes).

### 9. Pendientes y bitácora

| Documento | Estado |
| --- | --- |
| [Bloqueos y decisiones abiertas (2026-10-20)](pending/2026-10-20-bloqueos-y-decisiones.md) | Abierto |

## Cómo mantener esta documentación

- Un documento nuevo se añade a su libro en este índice en el mismo commit.
- Cada documento declara su estado (tabla de campos o sección «Estado»); si cambia,
  se actualiza aquí.
- No se duplican reglas: se enlaza a la fuente de verdad del libro.
- Se escribe en español, con datos sintéticos y sin PII.
- Los ADR y la ratificación de operaciones solo cambian con aprobación de la persona usuaria.

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

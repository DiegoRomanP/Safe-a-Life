# Corrección separada: typecheck de validadores API

Fecha: 2026-10-10 (coordinación del host).
Estado: Bloqueada — V1/V2 y reviews PASS; QA final pausada por traslado a backend solicitado por usuario.
Coordinación: Senior.
Relacionado: [reanudación contractual](2026-10-10-reanudacion-mock-contract-alignment.md).

## Objetivo y autorización

Eliminar los14diagnósticos preexistentes que bloquean `npm run typecheck`,
preservando la validación y el contrato ratificado `createHospitalNeed`. El
usuario eligió “Autorizar corrección (Recommended)” después de explicar que los
validadores estaban excluidos del plan contractual. Primero se completaron E3 y
reviews contractuales; esta reparación separada no ratifica otras operaciones.

## Alcance y exclusiones

- Producción, dueño `dev-back`: únicamente
  `apps/api/src/modules/need-records/dto/validators.ts`.
- Pruebas, dueño único `qa-reliability-engineer`: únicamente
  `apps/api/src/modules/need-records/dto/validators.test.ts`.
- Senior solo `docs/plans/*.md`; `reviewer-back`/auditor revisan read-only.
- Excluir canon/reglas API, todos los generados, tipos/DTO públicos ratificados,
  scripts contractuales, UI/mock/handlers, persistencia/RLS/servicios/repositorios,
  configuración/tsconfig/dependencias/lockfile, fuentes funcionales y ADR.
- Sin `any`, casts para ocultar errores, supresiones/compiler-ignore o relajación
  de schemas. Preferir imports ESM/tipos adecuados y narrowing real que conserve
  la salida discriminada y errores seguros. Si la reparación necesita cambiar
  contrato/comportamiento público o paths excluidos, parar y consultar.
- Preservar el trabajo previo no rastreado y checkpoints E1/E2/E3. Snapshot local
  allowlisted de ambos archivos antes de reparar, registrar HEAD/índice y hashes
  de canon/generados/QA contractual. Sin reset/stage/commit ni secretos/PII/logs
  de bodies. No usar permisos/canales alternativos para eludir restricciones.

## Criterios de aceptación

1. Typecheck API y global exit0 sin modificar configuración/dependencias/contrato.
2. Imports y narrowing consistentes con versiones instaladas; controles de forma,
   campos extra, límites, enums, fechas/salida y errores permanecen equivalentes.
3. Fixture de prueba corregido con tipos/valores sintéticos honestos; sin suprimir
   diagnósticos ni borrar/omitir pruebas para obtener GREEN.
4. Baseline de diagnóstico y casos pertinentes ejecutados, evidencia RED→GREEN
   de compilación/regresión según causa; suites API pertinentes aprobadas.
5. PASS independiente de backend para cada writer de tests y producción, y gate
   seguridad de validación en borde/sensibilidad; ningún autor aprueba su cambio.
6. Canon, outputs ratificados, contrato/pruebas contractuales y paths ajenos
   byteintactos respecto al inicio V0/V1; documentación y reporte honestos.

## Tareas y dependencias

| ID | Dueño | Encargo / paths / verificación | Dependencia | Estado |
| --- | --- | --- | --- | --- |
| V0 | `qa-reliability-engineer` | Diagnóstico sololectura y comandos API:14diagnósticos, causa, baseline tests, propuesta mínima y snapshots; sin editar | E3/R3/F3/S3 PASS | Completada — RED14compilación, runtime86PASS |
| V1 | `qa-reliability-engineer` | Snapshot y reparar solo fixture/tests si diagnóstico lo requiere; reproducción/controles existentes y compilación todavía RED de producción | V0 verificado | Completada — fixture fix,86PASS/13prodRED |
| RV1 | `reviewer-back` | Diff completo de pruebas y evidencia; PASS/BLOCKED | Inmediato V1 | Completada — PASS |
| V2 | `dev-back` | Reparar solo validators.ts: imports/narrowing y causas confirmadas; GREEN API/typecheck, conservar semántica | V0/RV1 PASS o V1 no pertinente | Completada — source revisado, ejecuciones declaradas pendientes QA independiente |
| RV2 | `reviewer-back` | Diff completo producción, aceptación/contrato/errores, PASS/BLOCKED | Inmediato V2 | Completada — PASS estático |
| SV2 | `security-privacy-auditor` | Validación en borde/PII/DTO/errores, PASS/BLOCKED; no auth/RLS real | V2 estable | Completada — PASS del delta |
| V3/E4 | `qa-reliability-engineer` | Dueño único de suites finales global/API/mock/contrato y preservación; si escribe pruebas, reviewer inmediato | Reviews pertinentes PASS | Bloqueada — primero traslado API a backend y gates nuevos |
| V4 | Senior | Registrar cierre separado y permitir cierre contractual E5 | Gates y pruebas pertinentes PASS | Pendiente |

No paralelizar writers. Mantener revisión inmediata después de cada asignación,
incluidas correcciones. Lecturas de reviewers/auditor sobre diff estable sí pueden
coincidir. Subagentes no delegan ni conversan con usuario.

## Skills y verificación

- QA: TDD, debugging, API/base de datos, privacidad/hardening; diagnóstico antes
  de decidir reparación. DevBack: dominio/API/TDD/debugging/documentación y
  privacidad/hardening. Reviewer: calidad/API/privacidad. Auditor: privacidad y
  hardening. Consultar documentación actual Context7 de Ajv/TypeScript si se
  necesita resolver sintaxis de imports/types, sin nuevas dependencias.
- Leer AGENTS/workflow, rol exacto y Backend-Contracts; no cambiar respuestas
  clínicas ni inventar elegibilidad. La reparación de tipos no activa por sí sola
  nuevas reglas clínicas/arquitectura; si aparecen, escalar antes de implementar.
- Diagnóstico: `npm run typecheck --workspace @save-a-life/api` y
  `npm run test:backend:dto`; capturar solo mensajes técnicos sanitizados.
- GREEN: typecheck API y `npm run typecheck`; tests API pertinentes.
- QA final E4: `npm run openapi:lint`, `npm run test:api:generator`,
  `npm run openapi:api:check`, `npm run test:contract`, `npm run typecheck`,
  `npm run test:backend:dto`, `npm run test:api`. Pruebas web si causalmente
  pertinentes; navegador/UI no modificado. Reusar evidencia válida cuando no
  haya inputs nuevos, con razón; ejecución QA final independiente justificada.
- No logs de datos/PII/tokens/cuerpos. Reportes: paths/diff/snapshot, criterios,
  comandos/resultados/exits, preservación, hallazgos/correcciones y pendientes.

## Riesgos y estado inicial

- Los dos archivos API son parte de `apps/api/` no rastreado preexistente; no usar
  HEAD como único baseline. Existían antes de esta solicitud.
- E2 observó imports Ajv, narrowing y propiedad de fixture entre14diagnósticos;
  es evidencia de fallo, no diagnóstico completo todavía.
- Typecheck web/mock y contrato72+377 ya PASS. Typecheck API/global es el bloqueo
  preciso; no presentar PASS de otros comandos como si lo resolviera.
- Fallos intermitentes del host `task` previamente impidieron retornos. Si vuelve
  a ocurrir, recuperar read-only y review antes de otra escritura; no asumir
  atomicidad. Permisos hijo QA Linux/Git verificados, Senior restringido.

## Bitácora

### Inicio V0

- Usuario autorizó alcance separado. Plan creado antes de delegar reparación.
- Ruta exacta y cuatro archivos DTO confirmados mediante lectura de directorio.
- V0 asignado a QA Reliability nueva sesión, solo lectura/diagnóstico y baseline,
  sin nuevos tests ni cambios productivos; debe justificar paths/fixes mínimos.
- Siguiente: registrar diagnóstico; V1 tests si necesario, reviewer-back inmediato,
  V2 producción y reviewer-back/auditor, QA final y cierre condicionado.

### Resultado V0 e inicio V1

- QA task `ses_ed6bba2a1ffe74oit8Mg4gGN8y`: diagnóstico read-only. Typecheck API
  exit2 con14errores: TS2339fixturetest:190; TS2351Ajvconstructor:40 y
  TS2349formatscall:52; TS2322DTOprojection:91 y nueveTS18046value.data:110–119,
  derivados de imports sin compile<T> guard correcto. No fallo runtime observado.
- `npm run test:backend:dto` exit0,86/86PASS. Node24.19.0/npm12.0.2 y versiones
  instaladas concordantes; NodeNextstrictESM/esModuleInterop actuales intactos.
- QA consultó Context7 Ajv/TS/formats y declarations instaladas. Recomienda
  namedexportAjv2020 y callableformats.default, conservar generics/narrowing;
  `.errors ?? null` satisface propiedad opcional sin cambiar clasificación.
- V1 reparación mínima propuesta: asignación extra fixture mediante Object.assign
  conserva caso negativo sin cast/any/ampliación pública. Production queda RED
  hasta V2;86testsconservados. No nuevos comportamientos de validación ni wrappers.
- Diagnóstico Git/hashes16inputs antes/después idénticos. Consulta hash inicial
  exit128por ruta inexistente, luego lectura corregida; no modificación/bypass.
  Vitest caché interna no se considera escritura productiva/manual.
- V1 asignado a QA único dueño de tests, nueva sesión para minimizar fallos de
  host; snapshot dosfiles y hashes protegidos antes de único fix fixture,
  runtime86PASS y nuevo REDcompileporproducción. RV1 inmediato después.

### Resultado V1 e inicio RV1

- QA task `ses_ed6b58fe8ffeXwQcXBfzJzsvZY`: único delta test:190,+1/−1,
  `envelope.extra` por `Object.assign(envelope, {extra:...})`; mismo objeto y
  campo sintético extra root rechazado, sin ampliar tipos ni any/cast/supresión.
- TypecheckAPI antes exit2/14diagnósticos, después exit2/13solo productivos;
  TS2339fixture desaparece. Recuento confirmado producción: TS2351×1,
  TS2349×1,TS2322×1,TS18046×10 (aclara recuento preliminar V0). Runtime86/86GREEN
  exit0, sin casos agregados/borrados/omitidos; RED es compilación, no funcional.
- Checkpoint `/tmp/opencode/save-a-life-v1-stm07khv/`: snapshotsbefore/after de
  dosfiles, `slice.diff`, manifest/resultados/preservation/Git. create/verify/
  close exit0; validators.ts y16inputs protegidos byteidénticos, HEAD/índice
  intactos. Rutas API untracked no comparadas solo con HEAD.
- RV1 asignado inmediatamente a ReviewerBack independiente, sololectura diff
  completo y evidencia. V2 solo después de PASS; globaltypecheck todavía RED.

### Resultado RV1 e inicio V2

- ReviewerBack task `ses_ed6b009a4ffe3t2oArruKArCOz`: PASS limitado V1test,
  Required0. Mismo objeto/campo extra enumerable, rechazooutput y nocanario,
 86testsconservados, validators.ts/16hashes/HEADíndice preservados. No compile
  GREEN global ni prueba de auth/RLS real.
- V2 asignado a `dev-back` (backend general/types, no DB/concurrencia): únicamente
  validators.ts, reparar imports/narrowing confirmado conservando firmas,
  compile<T>, clasificación/discriminantes, schemas/options y proyección segura.
  `.errors ?? null` si necesario según tipo instalado, sin casts/any/supresiones.
- TestV1 ycanon/generados excluidos e intactos; snapshot/diff previo, typecheck
  API/global y86unitruntime comoGREENpertinente. RV2 inmediato al retorno y SV2
  complementario read-only estable, antes de QA final/no writer paralelo.

### Resultado V2 e inicio RV2/SV2

- DevBack task `ses_ed6ae1142ffeJn84n6e4B2NNbL`: único archivo validators.ts,
  tres ajustes mínimos: importnamedAjv2020, formatsModule.default yerrors??null.
  Preserva compile<T>/guards/prechecks/options/proyección/clasificación y firmas;
  sin casts/any/supresiones ni cambios de contrato/config/deps.
- Reutilizó REDV1 porque fuente previa/test/16inputs protegidos coinciden.
  TypecheckAPI/global exit0;86/86DTOtest exit0; buildAPI aislado bajo
  `/tmp/opencode/save-a-life-v2-api-build-final` exit0; smokeNodeESM imports/formato
  pasó. Primer probe intentó `getFormat` inexistente; corrección del probe a
  compilar/validar formato, no un cambio productivo ni fallo ignorado del gate.
- Autor declara16hashes/HEAD/índice/testV1/workingtreeajeno preservados, diff
  relativo a snapshotV1, noHEADsolo. Se solicita recuperaciónread-only de
  comandos exactos/rutas de evidencias sin fabricar artefactos retrospectivos.
- RV2 asignado inmediatamente read-only sobre fuente actual versus snapshot
  V1preproducción y tests; SV2 complementario sobre delta estable. Autor recibe
  consulta sololectura en paralelo; ningún otro writer ni QAfinal aún.

### Resultados RV2/SV2, precisión de evidencia y nueva instrucción

- RV2 mismo ReviewerBack: PASS estático V2/Required0; constructor/plugin reales
  equivalentes según declarations/exports instalados, compile<T> guard recuperado,
  errors??null clasificación equivalente. TestV1intacto; sin recálculo hashes ni
  ejecución de comandos por reviewer. La existencia de JS emitido no prueba exit.
- SV2 auditor: PASS seguridad delta/Required0; schemas/options cerrados,
  normalización posterior, proyección de10campos y errores seguros permanecen.
  No certifica runtimeHTTP/autorización/RLS/clinica/legal ni ejecución global.
- DevBack recuperación read-only precisa **no existe artefacto V2 guardado** de
  snapshot/diff/resultados; reusó baselineV1 y diff terminal. No se fabrica
  checkpoint retrospectivo. Comandos declarados exitosos typecheck API/global y
  DTO86; transcript no retuvo exitsnuméricos/time de typecheck/build. El registro
  inicial exit0 queda como declaración del autor, no evidencia independiente.
- Build declarado:
  `npm run build --workspace @save-a-life/api -- --outDir /tmp/opencode/save-a-life-v2-api-build-final`.
  Smoke compiló formato con Ajv2020/formats.default; probe inicial getFormat
  inexistente no fue fallo de aplicación ni alteró source. QA final debe capturar
  evidencia verificable y preservaciónactual antes de afirmar cierre.
- **Usuario aclaró que API va dentro de `backend`, no app, y autorizó traslado
  ordenado de todo desarrollo API fuera de esa carpeta.** No se ejecutó V3/E4;
  cierre sobre apps/api pausado. Correcciones ya revisadas deben conservarse y
  trasladarse sin sobreescribir backend existente.
- Seguimiento en [plan de traslado](2026-10-10-traslado-api-a-backend.md);
  ubicación/tooling/gates finales se reconciliarán allí antes del cierre.

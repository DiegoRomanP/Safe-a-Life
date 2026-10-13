# Traslado ordenado del desarrollo API a backend

Fecha: 2026-10-10 (coordinación del host).
Estado: En progreso — M0 arquitectura/inventario; sin traslados todavía.
Coordinación: Senior.
Relacionados: [contrato](2026-10-10-reanudacion-mock-contract-alignment.md) y
[typecheck](2026-10-10-correccion-typecheck-validadores-api.md).

## Objetivo y autorización

El usuario aclaró “la api no se arma en app, sino … dentro de backend” y ordenó
trasladar ordenadamente los archivos API desarrollados fuera de esa carpeta.
El destino confirmado es `backend/` de este repositorio. Migrar el desarrollo de
`apps/api/` preservando el backend existente, correcciones revisadas, contrato
ratificado, generación oficial y pruebas; evitar dos fuentes API activas.

No se presume autorización para borrar scaffoldlegacy, sustituir stack, exponer
HTTP real o elegir silenciosamente gestor/boundary de instalación. Estas
decisiones se contrastarán antes de mover archivos. Sin reset/stage/commit/push.

## Estado previo y fuentes

- `apps/api/` contiene src, manifest, tsconfigs y outputs ignorados
  dist/node_modules. El desarrollo de código es DTO/generador/validators/tests;
  no hay evidencia de APIHTTP productiva implementada.
- `backend/` existente tiene index.js/config, package.json, package-lock.json y
  pnpm-lock.yaml; manifiesto declara pnpm10.33.0, Express/Supabase/cors/dotenv,
  dev/start de referencia. No leer .env ni iniciar conexiones reales.
- Root packageManager npm12.0.2 y workspace apps/api/web/mock. ADR-001 stackTS
  Node/Express/Resend y ADR-002 tooling local permanecen vigentes.
- Contrato E1–E3 revisadoPASS72tests/377HTTP; outputs API delPOSTratificado
  preservados. V1fixture/V2imports reparados yRV1/RV2/SV2PASS; QAglobal independiente
  aúnnoejecutada. Preservar exactamente estas correcciones al mover.
- Working tree dirty y API untracked previos; snapshots reales bajo/tmp/opencode
  en planes relacionados. No usarHEADsolo para review/preservación.

## Alcance provisional y exclusiones

- M0 inventario/arquitectura read-only: origenAPI, destinoexisting, referencias
  de workspace/generador/tests/docs/managers/locks y riesgos de colisión.
- Writer backend previsto `dev-back`: movimientos de fuentes API y configuración
  propia necesaria, generador y referencias ejecutables/manifests/docs permitidos
  **se concretarán por path después de M0/decisión**. Outputs oficiales se
  regeneran, no editan a mano. No cambiar JSONcontract semánticamente.
- QA `qa-reliability-engineer` es único dueño de cambios de contenido de pruebas;
  movimiento puro de test conserva bytes y se incluye en review de slice.
- ExcluirUI/web/mockhandlers, Brunos, BD/RLSreal/email, secrets, globals, requisitos
  yADRaceptados salvo decisión explícita que exija sincronización acotada.
- No mover dist/node_modules/cache/logs. Preservar scaffoldbackend y locks hasta
  decidir cuál boundary/manager es autoritativo. No instalar/sincronizarlock con
  cambios de dependencias no aprobados ni blanketapprove scripts.
- Senior solo planes; subagentes no delegan ni hablan conusuario. Reviewsread-only.

## Criterios de aceptación

1. Fuentes API originales incluidas las correcciones viven dentro de backend y
   no quedan dos implementaciones/APIworkspaces activos; copia hash-equivalente
   antes de retirar origen, sin pérdida ni sobrescritura de backendlegacy.
2. Boundary/manager/locks compatibles con decisión explícita y stackvigente;
   configuración/registros/workspaces/scripts apuntan a destino correcto.
3. Generador oficial escribe/checkea DTOs nuevos enbackend; entradas/salidaPOST
   ratificado byte-equivalentes y canon/reglas de los seisajustes preservados.
4. Unit/generador/lint/check/contract72+377/typecheck/build pertinentes aprobados
   porQA con evidencia/exits; negativos existentes conservados, no casts/skip.
5. ReviewerBack inmediato por cada writer y corrección PASS; reviewerFront si
   cambia tipo/códigofrontend; auditorseguridad por boundary/tooling y PII cuando
   aplique. Arquitectura recomienda pero no aprueba artefacto propio.
6. Docs/paths/contracts sincronizados dentro del alcance aprobado, snapshots y
   diffs relativos alworkingtree, HEAD/índice/ajenos intactos y limitaciones reales.

## Secuencia

| ID | Dueño | Encargo | Dependencia | Estado |
| --- | --- | --- | --- | --- |
| M0 | `solution-architect` | Read-only inventario y recomendación de traslado, collisions/managers/refs y decisiones necesarias | Nueva instrucción usuario | En progreso |
| M0d | Senior/usuario | Resolver boundary/manager/locks si fuentes aprobadas discrepan; concretar paths/slices | M0 | Pendiente |
| M1 | `qa-reliability-engineer` | Checkpoint/baseline y regresiones path/generador pertinentes, propios exactos a definir | Decisión/rutas congeladas | Pendiente |
| RM1 | `reviewer-back` | Review inmediato si M1 escribe pruebas | M1 | Pendiente |
| M2 | `dev-back` | Traslado/config/generación por slice delimitado; conservar baselinelegacy | M0d/RM1 | Pendiente |
| RM2 | `reviewer-back` | Review inmediato diff completo incluidos tests movidos | M2 | Pendiente |
| FM2/SM2 | Reviewerspecialistas | Front si cambia outputweb; seguridad por boundaries/PII/tooling | DiffM2estable | Pendiente |
| M3/E4 | `qa-reliability-engineer` | Verificación final independiente ypreservación de los tresplanes | ReviewsPASS | Pendiente |
| M4/E5 | Senior | Bitácoras/cierre condicionado, documentación ymemoria | Gates/testsPASS | Pendiente |

No writers paralelos: fuente/generador/workspaces/contratos compartidos. Mantener
gates inmediatos yvolver alautor porcadaBLOCKED, sinrebajarseveridad. Skills
planning/incremental/API/database/domain/documentación/calidad/TDD yprivacidad/
hardening/debugging por alcance; Context7actual si config/CLI/library necesarios.

## Riesgos y verificación prevista

- Colisiones de manifiestos y NodeNext/paths; dosgestores y doslocksbackend;
  no escoger/descartarlock por conveniencia. Consultaarquitectura antes decisión.
- El backendlegacy puede tener rutas/accesoSupabase no auditados; preservar pero
  no confundir trasladoDTO con autorización de integrarHTTP/APIreal o ejecutarDB.
- Hash de contenido de archivosmovidos ysnapshots antes/after; inventario de refs
  fuera de `apps/api/`, paths de generador/tests yscriptsglobales. Excluir outputs
  ignorados/secrets en checkpoint allowlisted.
- Verificaciones exactas se congelan tras M0d: generator/lint/check/contract,
  unit API/typecheck/build con gestorapproved; mock/websinregresiones, noHTTPreal.

## Bitácora

### Inicio M0

- Dos instrucciones nuevas de usuario registradas; destinobackend existente
  comprobado, alcance demigración autorizado, estrategia demanagers pendiente.
- Cierre deplanesanteriores pausado antes QAfinal, sintraslado/destrucciónaún.
- M0 asignado aarquitectura SOLOlectura; inventariar desarrollo yproponer
  estrategiaordenada/paths/decisionesabiertas. Registrarresultado anteswriter.

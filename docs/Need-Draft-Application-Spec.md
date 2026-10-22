# Crear una necesidad en borrador: contrato privado de aplicación

| Campo | Valor |
| --- | --- |
| Estado | Borrador técnico A2; revisión independiente RA2 pendiente |
| Fecha / versión | 2026-10-12 / 0.1 |
| Capacidad / slice | `need-records` / `create-need-draft` |
| Base comprometida | `90c203afc4b565c9a5c2718db32d6603e76b2f41`, tree `2132cddbe117af8ce37a047cab92463b7e0d0ca1` |
| Entrega siguiente | Tres fuentes privadas y dos archivos de pruebas; sin HTTP ni adaptador DB |

**Recomendación:** una entidad inmutable, un puerto atómico específico y una
factoría de servicio con inyección explícita. Tras RA2, QA puede escribir primero
las pruebas contra las firmas de §3. Estas declaraciones son documentación:
los archivos productivos todavía no existen y el autor no aprueba su artefacto.

## 1. Autoridad, objetivo y límites

El admin hospitalario prepara una necesidad propia `RBC`, en `borrador` y con
cero confirmaciones de intención. No activa, calcula candidatos, crea invitaciones
u outbox, envía email ni registra asistencia o donaciones.

Fuentes, en orden de autoridad aplicable:

- [Línea base v1.2](1_Primeros_Alcances.md), HOS-OBJ-03 y requisitos comunes;
  [ERS v0.4](2_Especificaciones_De_Software.md) organiza esa base, no la sustituye.
- [ADR-001](decisions/ADR-001-stack-del-prototipo.md) y
  [ADR-002](decisions/ADR-002-design-first-mock-tooling.md): stack, aislamiento y
  boundary npm raíz, sin nuevas dependencias.
- [Contrato del POST](Backend-Contracts.md), especialmente §§134–188 por líneas,
  y [OpenAPI canónico](openapi.json): entrada cerrada, radio omitido→10,
  creación UTC desde nacimiento, replay y catálogo de errores ya ratificados en
  [T3](plans/2026-10-04-backend-inside-out.md).
- [Plan actual de Senior](plans/2026-10-12-api-backend-completo-incremental.md):
  D1 aprobó el mapa de ocho IDs y la dirección RPC; C0 comprometió el fundamento.
  Su bitácora working es posterior al snapshot del commit. El mapa no se duplica
  aquí. [ADR-003](decisions/ADR-003-persistencia-rpc-supabase.md) registra la
  dirección, no SQL/grants/sesiones aprobados.

El único POST ratificado no aprueba sus operaciones vecinas ni las otras 69
operaciones draft. No se modifica body, DTO, OpenAPI, validadores ni enums
generados. Solo datos sintéticos; sin pacientes, historia/filtro postdonación,
reglas de elegibilidad ni afirmaciones de cumplimiento clínico/legal.

### Rutas y propietarios para la implementación posterior

Prefijo de todas las rutas: `backend/src/modules/need-records/`.

| Archivo exacto relativo al prefijo | Dueño único / cometido |
| --- | --- |
| `domain/need-draft.ts` | Escritor backend: tipos de dominio, entidad y proyección puras |
| `application/create-need-draft.ports.ts` | Mismo escritor: contexto, comando, protocolo y puerto |
| `application/create-need-draft.ts` | Mismo escritor: validación/orquestación/hash, sin transporte |
| `domain/need-draft.test.ts` | QA-reliability: entidad/copia/proyección |
| `application/create-need-draft.test.ts` | Mismo QA: servicio, dobles y negativos |

No cuarto archivo productivo, repositorio RAM de producto, barrel, SDK nuevo o
infraestructura en este slice. Dobles y fixtures se limitan a los dos tests.
Senior asigna los escritores secuencialmente y exige reviewer-back inmediato
también para las pruebas. Imports relativos NodeNext con sufijo `.js`, tipos con
`import type`; factorías/funciones pequeñas, sin clases/abstracciones adicionales
obligatorias, variables globales mutables ni supresión del compilador.

## 2. Fronteras existentes que se reutilizan

`dto/validators.ts` ya exporta:

| Export | Uso aquí |
| --- | --- |
| `parseCreateNeedInput(value: unknown): NormalizedCreateNeedInputDto` | Entrada cerrada; copia congelada de siete campos con radio efectivo |
| `parseCreatedNeedEnvelope(value: unknown): CreatedNeedEnvelopeDto` | Valida y copia `{ data: ... }` cerrado; se usa su `.data`, no la envoltura como salida de negocio |
| `NeedDtoError`, `NeedDtoErrorCategory` | Categorías existentes `shape`, `rule`, `output`; no propagar excepción/AJV/stack |
| `CreateNeedInputDto`, `NormalizedCreateNeedInputDto`, `CreatedNeedEnvelopeDto` | Tipado del borde de aplicación; nunca imports del dominio |

El snapshot `dto/contract.generated.json` exige `RBC`, ocho grupos, tres urgencias,
meta/radio enteros 1–50 y horas enteras 1–72. El radio es opcional solo en el
body. Los validadores no coaccionan tipos, eliminan extras ni aplican defaults
mutantes. `NaN`, infinitos, fracciones, UUID inválido, propiedades desconocidas
e heredadas se clasifican tal como lo hace el validador actual; no reinterpretar
sus categorías. Por ejemplo, límite fuera de rango→`rule`, fracción→`shape`.

La intersección generada del 201 conserva `expiresAt` requerido aunque una rama
inline lo marque opcional. La validación exige fecha RFC 3339 válida terminada
en `Z`; aceptar la precisión admitida por el DTO, incluidas seis cifras
fraccionarias. No convertir a `Date`, limitar a milisegundos o usar `toISOString()`
para truncar/reformatear el resultado.

## 3. Firmas privadas candidatas a congelar tras RA2

Exportar exactamente estos nombres desde sus archivos. No son una API HTTP,
un esquema SQL o un nuevo contrato público. Las declaraciones no incluyen
implementación ni obligan a copiar `declare` en el código futuro.

### 3.1 `domain/need-draft.ts`

```typescript
export type NeedBloodType =
  | 'O_NEG' | 'O_POS' | 'A_NEG' | 'A_POS'
  | 'B_NEG' | 'B_POS' | 'AB_NEG' | 'AB_POS';
export type NeedUrgency = 'Normal' | 'Urgente' | 'Critica';

export type NormalizedNeedDraftInput = Readonly<{
  component: 'RBC';
  requiredBloodType: NeedBloodType;
  targetConfirmations: number;
  siteId: string;
  radiusKm: number;
  urgency: NeedUrgency;
  expiresInHours: number;
}>;

export type NeedDraftProjection = Readonly<{
  needId: string;
  component: 'RBC';
  requiredBloodType: NeedBloodType;
  targetConfirmations: number;
  confirmedIntentCount: 0;
  siteId: string;
  radiusKm: number;
  urgency: NeedUrgency;
  status: 'borrador';
  expiresAt: string;
}>;

export type NeedDraftOwner = Readonly<{
  actorId: string;
  hospitalId: string;
}>;

export type NeedDraft = Readonly<{
  owner: NeedDraftOwner;
  projection: NeedDraftProjection;
}>;

export declare function createNeedDraft(
  projection: NeedDraftProjection,
  owner: NeedDraftOwner,
): NeedDraft;
export declare function projectNeedDraft(draft: NeedDraft): NeedDraftProjection;
```

Las factorías reciben valores internos ya validados, copian campos explícitos y
congelan entidad, propietario y proyección; `projectNeedDraft` devuelve otra
copia congelada de los diez campos, nunca `owner` ni la entidad. No hay reloj,
UUID generator, I/O, import de DTO/AJV/framework/proveedor o cálculo clínico.
La estructura propia del dominio se conecta mediante mapeo tipado explícito en
aplicación, no mediante casts ni dependencia del OpenAPI generado.

### 3.2 `application/create-need-draft.ports.ts`

```typescript
import type {
  NeedDraftOwner, NeedDraftProjection, NormalizedNeedDraftInput,
} from '../domain/need-draft.js';

export type HospitalMembershipSnapshot = Readonly<{
  hospitalId: string;
  isActive: boolean;
  hospitalIsActive: boolean;
}>;
export type ValidatedNeedDraftPrincipal = Readonly<{
  actorId: string;
  role: 'donante' | 'admin_hospitalario' | 'superadmin';
  aal: 'aal1' | 'aal2';
  membership: HospitalMembershipSnapshot | null;
}>;
export type CreateNeedDraftContext = Readonly<{
  principal: ValidatedNeedDraftPrincipal | null;
}>;
export type CreateNeedDraftIdempotency = Readonly<{ key: unknown }>;

export type NeedDraftFailureCode =
  | 'BAD_REQUEST' | 'AUTHENTICATION_REQUIRED' | 'ACCESS_DENIED'
  | 'STATE_CONFLICT' | 'VALIDATION_FAILED' | 'INTERNAL_ERROR';
export type CreateNeedDraftResult =
  | Readonly<{
      ok: true;
      outcome: 'created' | 'replayed';
      need: NeedDraftProjection;
    }>
  | Readonly<{ ok: false; code: NeedDraftFailureCode }>;

export type AtomicNeedDraftCommand = Readonly<{
  input: NormalizedNeedDraftInput;
  owner: NeedDraftOwner;
  idempotency: Readonly<{
    operation: 'createHospitalNeed';
    key: string;
    payloadHash: string;
  }>;
}>;
export type AtomicNeedDraftReply =
  | Readonly<{
      kind: 'created' | 'replayed';
      owner: NeedDraftOwner;
      need: NeedDraftProjection;
    }>
  | Readonly<{
      kind: 'unauthenticated' | 'forbidden' | 'site_unusable'
        | 'payload_conflict' | 'in_progress' | 'failed';
    }>;
export interface AtomicNeedDraftGateway {
  createDraft(command: AtomicNeedDraftCommand): Promise<unknown>;
}
```

`principal: null` representa autenticación ausente, inválida o vencida. El contexto
es producido únicamente por la futura identidad validada y membresía protegida,
no por metadata del cliente. El tipo amplio permite probar otros roles, AAL1 y
membresía nula sin `as any`, casts de roles, assertions no-null o `ts-ignore`.
La existencia del objeto no prueba criptografía ni vigencia real.

El snapshot solo permite un rechazo puro temprano. El gateway futuro deriva y
revalida sujeto/AAL/rol/membresía/hospital en DB dentro de la operación atómica,
incluido replay. `owner` es scope esperado del servidor, no autorización autónoma
ni un argumento confiable para `auth.uid()`. El adaptador será request-scoped al
JWT validado de ese sujeto; no cliente global con sesión mutable ni `service_role`.

`AtomicNeedDraftReply` describe el protocolo mínimo, **no filas de persistencia**.
`Promise<unknown>` obliga a validar su realización runtime; no convertirla mediante
cast a ese tipo. Un éxito tiene exactamente `kind/owner/need`, `owner` exactamente
`actorId/hospitalId`, y `need` los diez campos. Un fallo tiene solo `kind`.
Objetos con prototipo no plano, campos heredados/extra, getters que fallan,
valores inválidos o etiquetas desconocidas no se aceptan silenciosamente.

### 3.3 `application/create-need-draft.ts`

```typescript
import type { NormalizedNeedDraftInput } from '../domain/need-draft.js';
import type {
  AtomicNeedDraftGateway, CreateNeedDraftContext,
  CreateNeedDraftIdempotency, CreateNeedDraftResult,
} from './create-need-draft.ports.js';

export type CreateNeedDraft = (
  body: unknown,
  context: CreateNeedDraftContext,
  idempotency: CreateNeedDraftIdempotency,
) => Promise<CreateNeedDraftResult>;
export declare function createNeedDraftService(
  gateway: AtomicNeedDraftGateway,
): CreateNeedDraft;
export declare function fingerprintNeedDraftInput(
  input: NormalizedNeedDraftInput,
): string;
```

La factoría captura solo su dependencia inyectada. La función pública privada del
slice recibe **body, contexto y metadata separados**. No lee `req/res`, cookies,
JWT, variables de entorno ni datos de Supabase. El resultado exitoso es
`{ ok, outcome, need }`; `need` es la proyección de negocio sin envolver. Un futuro
controlador usa exclusivamente `need` para `{ data: need }`, no serializa el
resultado entero. El fallo solo contiene código; mensajes públicos y correlation
ID corresponden al transporte futuro.

## 4. Secuencia observable y obligaciones del puerto

1. Copiar el contexto/metadata por campos antes del primer `await`. Rechazar
   principal nulo con `AUTHENTICATION_REQUIRED`; otro rol, AAL1 o membresía
   nula/inactiva/hospital inactivo con `ACCESS_DENIED`. No llamar al gateway.
2. Exigir clave string de 16–255 caracteres según los límites actuales del header
   (contar puntos de código Unicode, no imponer UUID/ASCII). No generar, recortar,
   normalizar ni cambiar la clave. Clave inválida→`BAD_REQUEST`, sin gateway.
3. Llamar `parseCreateNeedInput(body)`. `shape`→`BAD_REQUEST`, `rule`→
   `VALIDATION_FAILED`; error inesperado→`INTERNAL_ERROR`. Copiar a
   `NormalizedNeedDraftInput`, congelar y calcular fingerprint después de radio10.
4. Construir comando de tres campos y sus copias congeladas, owner de identidad/
   membresía, operación literal del servidor. Invocar `createDraft` **una vez**.
   No hacer prelecturas de sede/clave, retries automáticos ni escrituras fuera
   del puerto. Un throw/reject, incluso con resultado incierto, produce error
   genérico; el llamador conserva su clave para un reintento posterior.
5. Validar respuesta desconocida con guards cerrados y el validador DTO actual
   sobre `{ data: rawNeed }` antes de quitar campos. No limpiar una fila con
   extras para hacerla pasar. Owner debe igualar actor/hospital esperados tanto
   en creación como en replay; desajuste→`INTERNAL_ERROR`, nunca datos ajenos.
   Comparar componente, grupo, meta, sede, radio y urgencia con intención
   normalizada; desajuste también es respuesta corrupta. Materializar entidad,
   proyectar/copiar y validar salida; retornar solo resultado congelado.

Esta precedencia es del servicio privado; no ratifica precedencias HTTP generales
entre autenticación, parser JSON y controles de transporte todavía pendientes.
El servicio no registra solicitudes, comandos, hashes, claves, respuestas,
excepciones o PII. No se añade logger en este slice.

### Canonicalización y binding

`fingerprintNeedDraftInput` acepta entrada interna ya normalizada. Devuelve
SHA-256 hexadecimal minúsculo de UTF-8 del JSON compacto de un objeto construido
con **exactamente este orden**: `component`, `requiredBloodType`,
`targetConfirmations`, `siteId`, `radiusKm`, `urgency`, `expiresInHours`.
Sin espacios, timestamps, actor, hospital, clave ni otros campos dentro del JSON.
Puede usar `node:crypto` en aplicación, sin dependencia nueva ni import en dominio.

El orden original del body no influye. Omisión/10 explícito dan el mismo hash;
cualquier diferencia en un campo normalizado da otra intención. El reclamo
atómico liga **actor + operación + clave**, comparando ese hash de payload; dos
actores pueden tener el mismo hash pero no compartir registro/resultado. La DB
no debe confiar en un hash entregado directamente por cliente: valida los siete
campos y verifica/recalcula la representación acordada en su diseño futuro.

No cambiar casing o representación de UUID, enum o texto. Este core conserva
los strings validados literalmente. La equivalencia entre representaciones UUID
con distinto casing y el mapping de salida de PostgreSQL deben resolverse antes
del adaptador (§7), no mediante normalización oculta.

### Atomicidad, tiempo y replay

El puerto promete una sola operación que revalida permisos/scope, reclama la
clave mediante unicidad y confirma o revierte **necesidad + resultado idempotente
original + auditoría minimizada**. La sede nueva debe ser activa/aprobada/propia.
Solo PostgreSQL fija nacimiento y `expires_at = created_at + expiresInHours`;
el comando no lleva reloj ni ID generado por aplicación. No hay outbox para esta
creación. Auditoría no lleva body, grupo, clave, hash o valores PII.

`replayed` devuelve los diez valores originales, ID y `borrador`/conteo0 incluidos,
aunque ya pasó `expiresAt`, conforme a Backend-Contracts186–188. No evaluar el
reloj del proceso, recomputar plazo, activar o crear efectos nuevos. El registro
idempotente sigue RNF-REL-02, 72 h después de terminal o hasta purga; no nuevo TTL.
Revalidar identidad/membresía actual y scope también en replay: revocación u otra
institución jamás autoriza recuperar el resultado anterior. La condición de sede
modificada después de crear permanece abierta; el servicio no decide esa carrera.

### Categorías seguras, sin dependencia HTTP

| Origen | Resultado privado | Mapping futuro ya declarado |
| --- | --- | --- |
| DTO `shape` / clave inválida | `BAD_REQUEST` | 400 |
| Principal nulo / reply `unauthenticated` | `AUTHENTICATION_REQUIRED` | 401 |
| Precheck denegado / reply `forbidden` | `ACCESS_DENIED` | 403 |
| Reply `payload_conflict` o `in_progress` | `STATE_CONFLICT` | 409 idéntico |
| DTO `rule` / reply `site_unusable` | `VALIDATION_FAILED` | 422 idéntico para sede inexistente/ajena/inactiva |
| Reply `failed`, corrupto, DTO `output`, throw/reject | `INTERNAL_ERROR` | 500 genérico |

No añadir razones de sede, hashes, claves, SQL, proveedor, `cause`, stack,
mensajes dinámicos, status HTTP o correlation ID a `CreateNeedDraftResult`.
No introducir 404/429/503 en el catálogo del POST ni disfrazar errores de DB como
violaciones de entrada. Respuesta corrupta posterior a un commit puede significar
resultado incierto, no prueba rollback: no reintentar dentro del servicio.

## 5. Matriz mínima QA-first y trazabilidad

Fixtures tipados para valores válidos y `unknown` para body/reply hostiles;
contextos negativos legales en el union, sin casts para fabricar roles. Capturar
comandos solo en el doble privado, sin reporter crudo con datos/keys/canarios.

| Casos / aceptación observable | RF/RNF | Pruebas |
| --- | --- | --- |
| Ocho grupos y tres urgencias; `RBC`; estado borrador/conteo0 y exactamente diez campos | NEC-01–04/06, ARC-03 | Dominio + aplicación; no afirma compatibilidad médica |
| Meta/radio `0/1/50/51`; horas `0/1/72/73`; fracciones/string/null/NaN/infinitos; cero calls inválidos | NEC-03/05, API-01 | Aplicación; categorías DTO actuales |
| Root nulo/array/string, requeridos ausentes, UUID inválido, enums fuera de dominio; prohibidos role/hospitalId/status/paciente/última donación/coordenadas; heredados/own `__proto__` | API-01, PRO-05, SAF-04 | Aplicación: sin persistencia ni detalles de parser |
| Principal null; donante/superadmin; AAL1; membresía null/inactiva/hospital inactivo | SEC-05/07/08 | Aplicación: código exacto y cero calls, sin casts |
| Radio omitido/10 y orden de propiedades producen hash idéntico; siete campos en orden fijado; cambio individual produce hash distinto | REL-01/02, NEC-05 | Helper + comando observado; owner/op/clave separados |
| Claves ausente/null/número, 15/16/255/256 puntos de código; estabilidad en retries/dos actores y sin normalizar UUID | REL-01/02, API-01 | Aplicación: sin generación silenciosa ni cache global |
| `created` y `replayed` entregan copias cerradas; replay con fecha pasada conserva ID/estado0/plazo; fecha `Z` sin fracción y `.123456Z` preservadas | NEC-08, REL-02, ARC-03 | Aplicación: sin reloj/cálculo temporal local |
| `payload_conflict`/`in_progress` indistinguibles; `site_unusable` único para tres motivos; `forbidden` tras precheck simula revocación | SEC-07/08, API-02, REL-02 | Dobles; no evidencia de consultas vigentes reales |
| Owner ajeno en created/replayed, campos visibles distintos, falta campo/extra en need o owner/root, fila SQL cruda, status activa/conteo1, fecha inválida/offset, prototipo/getter hostil | ARC-03, API-01/02, SEC-08 | `INTERNAL_ERROR`; no proyección parcial ni fuga |
| Throw/reject/failed con canarios de email/token/SQL/body/clave/hash; error seguro sin valores, sin retry ni logger | API-02, OBS-01/02 | Aplicación; observar console sinks/call count sin volcar el canario |
| Mutar body/context/membresía/metadata originales mientras el doble espera; mutar reply después de resolver | ARC-03/05, SEC-07 | Comando/output/copies no cambian; todas sus capas congeladas |
| Dos servicios con gateways independientes; factory/proyección no alteran sus inputs ni comparten referencias mutables | ARC-04/05 | Dominio + aplicación, sin singleton de sesión |

Un doble de operación atómica comprueba intención, protocolo y número de llamadas,
**no** criptografía, RLS, constraints, concurrencia20, rollback o reloj real DB.
No fijar oráculo para sede desactivada durante replay ni AP-04 sin decisión.

### Comandos posteriores, desde raíz, tras RA2 y asignación de Senior

```bash
npm run test --workspace backend -- src/modules/need-records/domain/need-draft.test.ts src/modules/need-records/application/create-need-draft.test.ts
npm run test --workspace backend -- src/modules/need-records/dto/validators.test.ts
npm run typecheck --workspace backend
npm run lint --workspace backend
npm run build --workspace backend
npm run openapi:api:check
node --test scripts/generate-api-contract.test.mjs
```

No se ejecutaron aquí. QA registra RED inicial por fuentes ausentes sin crear
stubs productivos; reviewer-back revisa los tests antes del writer de producto.
Luego exige GREEN y re-review del slice. Build conserva exclusión de
`src/**/*.test.ts`, NodeNext/JSON nativo y ausencia de scaffold emitido; nuevos
sources hacen crecer los outputs, no conservar un conteo artificial de tres.

C0 observó 86 DTO dentro de 151 unitarias, generador25, Bruno24requests/29tests y
E2E10. Son evidencia de ese fundamento, no conteos permanentes del nuevo backend.
`test:backend:dto` actualmente ejecuta todo el workspace: usar el comando focalizado
de arriba para separar DTO/core cuando crezcan los tests. Bruno existente sigue
contra **mock**; aceptación Bruno del POST requiere transporte/Auth/RLS/DB reales
en un slice posterior, no HTTP con autenticación falsa o reset demo.

## 6. Criterios de aceptación del core, pendientes

- [ ] RA2 revisó esta spec/ADR; Senior congeló firmas y autorizó los cinco paths.
- [ ] Matriz QA-first cubre casos mínimos y negativos con resultados/call counts,
      sin fuentes productivas escritas por QA; tests reciben revisión de área.
- [ ] Tres sources implementan §3–4 con DTO existentes, copias/freeze, DI, cero
      proveedores/red/relojes/efectos ajenos y errores cerrados; reviewer-back
      independiente y seguridad pertinente revisan el alcance privado.
- [ ] Unitarias, typecheck/lint/build/drift y regresiones pertinentes están
      ejecutados con comandos/resultado; sin tests emitidos ni artefactos manuales.
- [ ] Senior sincroniza después README/Backend-Contracts en una asignación
      documental separada; estos archivos no se modifican en A2.
- [ ] Reporte distingue core probado de gateway/RLS/HTTP no implementados. Ningún
      PASS propio o mock se presenta como aceptación de persistencia/producto.

## 7. Riesgos y decisiones abiertas antes del adaptador/transporte

| Pendiente | Límite de esta spec |
| --- | --- |
| UUID con casing distinto frente a tipo UUID PostgreSQL/serialización | Preservación literal en core; acordar equivalencia de intención/proyección antes de mapear DB, sin normalizar ni sobreconstriñir contrato ahora |
| Replay después de desactivar/reasignar sede u hospital | Backend-Contracts exige replay original y autorización vigente, pero no fija todos esos resultados; decidir checks de sede de intención nueva frente a replay antes del adaptador, sin relajar el scope actual |
| SQL, invoker/definer, owners/FORCE RLS, grants, restricciones, mecanismo de claim/concurrencia y auditoría | Dirección RPC aprobada; detalle requiere diseño/review/seguridad y DB real conforme ADR-003 |
| Sesión/refresh/cookie/CSRF/CORS | PKCE/cookie/AAL2 generales aprobados; parámetros/protocolo concreto pendientes antes de HTTP |
| AP-02/04/06/07/08 y clínica/legal reales | Solo bloquean cláusulas afectadas; no se resuelven desde fake ni esta creación académica |

**Próximo gate: RA2 por reviewer-back independiente sobre los dos documentos
completos, antes de QA/implementación que consuman las firmas.**

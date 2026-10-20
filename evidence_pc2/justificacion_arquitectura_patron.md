# Justificación de la arquitectura y de los patrones — Save a Life

Fecha: 2026-10-16. Alcance: backend productivo (`backend/`), contrato (`docs/openapi.json`) y
tooling de demostración (`apps/web`, `apps/mock-api`, `bruno/`). El análisis se basa en
`backend/src/composition.ts`, los módulos de `backend/src/modules/`, los ADR-001 a ADR-006 de
`docs/decisions/` y las migraciones de `backend/supabase/migrations/`.

Los diagramas UML de esta arquitectura y de cada patrón están en
[`diagramas_uml.md`](diagramas_uml.md).

## 1. Arquitectura aplicada

- **Monolito modular.** Una sola aplicación Express dividida en módulos por capacidad:
  `platform`, `identity-institutions`, `need-records`, `email-delivery` y `donor-records`
  (mapa de capacidades en `docs/plans/2026-10-12-api-backend-completo-incremental.md`).
- **Arquitectura hexagonal (puertos y adaptadores) dentro de cada módulo:**
  - `domain/`: reglas puras, sin reloj propio, Express, Supabase ni I/O.
  - `application/`: casos de uso y puertos (`*.ports.ts`).
  - `http/`: routers que solo parsean contra el contrato, aplican guards y serializan.
  - `infrastructure/`: adaptadores (`*-rpc-gateway.ts`, `resend-sender.ts`, `supabase-auth-admin.ts`).
    Son los únicos que conocen el SDK.
- **Contract-first.** `docs/openapi.json` (OpenAPI 3.1) es la fuente única. De ahí se generan
  los tipos y los esquemas, y los routers validan en tiempo de ejecución con `compileOperation`
  (`shared/validation/contract-validator.ts`).
- **Persistencia con lógica en la base de datos (ADR-003).** Cada comando atómico es una función
  PL/pgSQL invocada por RPC de Supabase:
  - Las tablas viven en el esquema `app`, que PostgREST no expone.
  - RLS está activada y forzada en todas las tablas.
  - Las funciones son `SECURITY INVOKER` por regla; `SECURITY DEFINER` solo si figuran en la
    allowlist del ADR, que una prueba pgTAP verifica.
- **Outbox transaccional con worker aparte (ADR-005)**, sesión por cookies con CSRF y CORS
  restringido (ADR-004), y `service_role` limitado a una allowlist (ADR-006).

## 2. ¿Está bien justificada?

Sí. Cada decisión tiene un ADR con contexto, decisión y consecuencias, y la aprobó la persona
responsable. Las razones de fondo son verificables en el código:

- **Monolito modular frente a microservicios.** El equipo es pequeño y hay una sola base de
  datos. Los microservicios añadirían red, despliegues y consistencia distribuida sin ningún
  beneficio en este alcance. Los módulos dejan la puerta abierta a separar más adelante si
  hiciera falta.
- **RPC PL/pgSQL.** `supabase-js` no ofrece transacciones entre llamadas: una secuencia de
  llamadas SDK no es atómica. Encapsular cada comando en una función resuelve la atomicidad
  (por ejemplo, necesidad + resultado idempotente + auditoría en una sola transacción).
- **RLS y defensa en profundidad.** El sistema maneja datos de salud y geolocalización de
  donantes, que son datos sensibles. Resolver rol y hospital desde datos protegidos (nunca desde
  el cliente), auditar las denegaciones y cifrar el outbox es proporcional al riesgo.

**Costo reconocido:** el rigor de seguridad y de proceso (gates de revisión, planes, ADRs) es
alto para un proyecto universitario. Es defendible por el tipo de dato, pero reduce la
velocidad de entrega.

## 3. Patrones aplicados y valoración

| Patrón | Dónde | Valoración |
|---|---|---|
| Monolito modular | `backend/src/modules/*` | Bien; sin ciclos entre módulos |
| Puertos y adaptadores | `*.ports.ts` + `*-rpc-gateway.ts` | Bien; el SDK solo vive en infraestructura |
| Composition root con inyección manual (funciones fábrica) | `composition.ts`, `composition-worker.ts` | Bien, aunque el archivo crece |
| Repository / Gateway | `NeedsRepository`, `createNeedsRpcGateway` | Bien |
| Capa anticorrupción | `closedRecord`/`oneOf` (`shared/persistence/guards.ts`), `toDraftReply` | Muy bien: lo que devuelve SQL se valida contra un esquema cerrado |
| Resultado como unión discriminada (`kind`) | respuestas de las RPC, `shared/persistence/rpc-reply.ts` | Bien; los resultados de negocio se devuelven como valores, no como excepciones |
| Máquina de estados | `need-records/domain/need-state.ts` | Correcta, pero quien decide en producción es SQL (ver 4.1) |
| Idempotency key, con el hash recalculado en SQL | `shared/http/idempotency*.ts` | Bien |
| Transactional outbox + worker que consulta la cola + política de reintentos | `email-delivery/*`, `domain/retry-policy.ts` | El patrón correcto para el email |
| Strategy | `FakeEmailSender` / `createResendSender` | Bien |
| Registro de plantillas (tabla de renderers) | `email-delivery/templates/index.ts` | Bien |
| Cadena de middlewares (chain of responsibility) | `authenticate`, `csrf-guard`, `origin-guard`, `guardsFor` | Bien |
| Paginación por cursor firmado (keyset) | `shared/persistence/cursor.ts`, `page.ts` | Bien |
| Vencimiento calculado al leer | `projectStatus` y su equivalente en SQL | Bien; evita un proceso programado (cron) |
| Dobles de prueba a nivel de sistema | `apps/mock-api`, Prism, Bruno | Útiles para el desarrollo Design-First del frontend |

## 4. Puntos débiles y mejoras propuestas

1. **Reglas de dominio duplicadas en TypeScript y SQL.** `evaluateManualTransition` y
   `projectStatus` solo se usan en pruebas; en producción la matriz C-8 se decide en SQL bajo
   bloqueo de fila. El polígono de Lima también está dos veces (`domain/lima-polygon.ts` y
   `app.in_lima_demo_1`), sincronizado por una prueba. Conviene declarar SQL como fuente de
   verdad y usar el dominio TypeScript como validación temprana u oráculo de pruebas, siempre
   con pruebas de paridad.
2. **Servicios que solo delegan.** `createNeedsService` apenas pasa las llamadas al repositorio,
   salvo el cálculo del hash. Es aceptable, pero no conviene añadir más capas sin lógica.
3. **`composition.ts` crece con cada módulo.** Cada módulo podría exportar
   `createXModule(deps) → { mount }`, y la raíz solo los ensamblaría.
4. **La excepción `SECURITY DEFINER` se volvió frecuente.** Solo
   `20261013060000_donor_records.sql` tiene 15 funciones DEFINER, cuando la regla general es
   INVOKER. Están en la allowlist del ADR-003 y cubiertas por pgTAP, pero conviene revisar si
   los privilegios de las altas asistidas pueden rediseñarse para volver a INVOKER.
5. **Migraciones muy grandes**, de hasta 834 líneas. Antes del despliegue está bien; después,
   la regla debe ser añadir migraciones nuevas y nunca editar las existentes.
6. **Comunicación entre módulos por callbacks.** Un módulo avisa a otro mediante funciones
   conectadas en la composición (por ejemplo `onPasswordChanged`), lo que evita ciclos. Si
   esas conexiones crecen, conviene migrar a eventos de dominio sobre el outbox.

## 5. Patrones previsibles a futuro

- **Matching e invitaciones (`invitation-coordination`):**
  - Specification para la compatibilidad ABO/Rh, el radio (Haversine) y la disponibilidad.
  - Strategy para el ranking.
  - Eventos de dominio sobre el outbox existente, por ejemplo "necesidad activa → lote de
    invitaciones".
  - Tokens de un solo uso, reutilizando la base de `action-tokens`.
- **Solicitudes de privacidad (`privacy-requests`):** una máquina de estados y un job de purga
  ejecutado por el worker.
- **Políticas de reconocimiento e información legal:** políticas versionadas e inmutables.
- **Frontend productivo (`frontend/`):** un cliente tipado generado desde OpenAPI; el backend ya
  actúa como BFF (cookies y CSRF).
- **No recomendados:** CQRS o Event Sourcing, microservicios, un contenedor de inyección de
  dependencias o un ORM. O contradicen el ADR-003 o son sobreingeniería para este alcance.

## 6. ¿Se cumplen los principios SOLID?

En general sí. TypeScript se usa aquí con funciones fábrica e interfaces más que con clases,
así que SOLID se aplica sobre módulos y funciones. El único principio que se cumple de forma
parcial es el de segregación de interfaces.

### S — Responsabilidad única: se cumple

Cada capa tiene una sola razón para cambiar: el router cambia si cambia HTTP, el gateway si
cambia SQL y el dominio si cambia la regla de negocio.

```ts
// need-records/http/needs.router.ts — el router solo parsea, aplica guards y serializa
app.post('/api/v1/hospitals/me/needs', ...guards.adminWrite, async (req, res) => {
  noQuery(createNeed, req);
  const principal = requirePrincipal(res);
  const result = await createDraft(principal.accessToken)(req.body, contextOf(principal), { key: req.get('idempotency-key') });
  if (!result.ok) throw new ApiError(result.code);
  sendData(res, 201, ok(createNeed, result.need));
});
```

El nombre de la función SQL y los argumentos `p_*` viven solo en `needs-rpc-gateway.ts`; las
transiciones válidas, solo en `domain/need-state.ts`.

### O — Abierto/cerrado: se cumple

Para añadir un tipo de email se agrega una plantilla y una entrada en la tabla, sin modificar
`renderTemplate`. El tipado obliga a que ninguna clave quede sin renderer.

```ts
// email-delivery/templates/index.ts
const RENDERERS: { readonly [K in EmailKind]: (data: EmailTemplateData[K]) => RenderedEmail } = {
  invitacion,
  verificacion_email: verificacionEmail,
  // ... nueva plantilla = nueva entrada
};
export function renderTemplate<K extends EmailKind>(kind: K, data: EmailTemplateData[K]): RenderedEmail {
  return RENDERERS[kind](data);
}
```

Lo mismo ocurre con un nuevo proveedor de email: basta con un nuevo adaptador de `EmailSender`.

### L — Sustitución de Liskov: se cumple

`FakeEmailSender` (pruebas) y `createResendSender` (producción) implementan el mismo contrato,
incluida su regla de comportamiento: "nunca lanza; todo fallo se clasifica en un `SendResult`".
El worker funciona igual con cualquiera de los dos.

```ts
// email-delivery/application/email-sender.ts
/** Puerto de envío (ADR-001). Nunca lanza: todo fallo se clasifica en un `SendResult`. */
export interface EmailSender {
  send(message: EmailMessage): Promise<SendResult>;
}

// infrastructure/fake-sender.ts
export class FakeEmailSender implements EmailSender { /* ... */ }
// infrastructure/resend-sender.ts
export function createResendSender(opts: ResendSenderOptions): EmailSender { /* ... */ }
```

### I — Segregación de interfaces: se cumple de forma parcial

**Bien:** `need-records` separa las lecturas y transiciones (`NeedsRepository`, con 3 métodos)
de la creación atómica (`AtomicNeedDraftGateway`, con 1 método). El caso de uso de creación no
depende de métodos que no usa.

```ts
// need-records/application/create-need-draft.ports.ts
export interface AtomicNeedDraftGateway {
  createDraft(command: AtomicNeedDraftCommand): Promise<unknown>;
}
```

**También bien:** `action-tokens` solo necesita `confirmPasswordSetup` y no recibe el
repositorio de donantes, sino una única función. `composition.ts` la construye así:
`onPasswordChanged: (userId) => donorRepository.confirmPasswordSetup(userId)`.

**Mejorable:** `DonorRecordsRepository` (`donor-records/application/donor-records.ports.ts`)
reúne 19 métodos de perfil, altas asistidas, verificación de correo, contraseña y cambio de
email, y `createDonorRecordsService` depende de todos. Un doble de prueba para un caso de uso
de perfil tiene que cubrir los 19. Conviene partirlo en puertos por caso de uso:
`DonorProfileRepository`, `DonorVerificationRepository`, `AssistedSignupRepository`,
`PasswordSetupRepository` y `EmailChangeRepository` (ver la página 18 de los diagramas).

### D — Inversión de dependencias: se cumple

Los casos de uso dependen de abstracciones (puertos) y no de Supabase. Las implementaciones
concretas se inyectan en un solo lugar, la composition root.

```ts
// need-records/application/needs-service.ts — depende del puerto, no del SDK
export function createNeedsService(repository: NeedsRepository) { /* ... */ }

// composition.ts — único lugar que conoce las implementaciones concretas
const needsGateway = createNeedsRpcGateway({ rpc, raw: /* ... */ });
const needs = createNeedsService(needsGateway.repository);
```

Gracias a esto, las pruebas unitarias sustituyen el repositorio por un doble sin levantar
Supabase.

### Resumen SOLID

| Principio | Estado | Evidencia |
|---|---|---|
| S | Cumple | Router, gateway y dominio separados por capa |
| O | Cumple | Tabla `RENDERERS`, adaptadores de `EmailSender` |
| L | Cumple | `FakeEmailSender` y `createResendSender` son intercambiables |
| I | Parcial | `need-records` y `action-tokens` bien segregados; `DonorRecordsRepository` con 19 métodos |
| D | Cumple | Servicios sobre puertos; inyección en `composition.ts` |

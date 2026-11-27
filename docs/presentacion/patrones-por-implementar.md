# Patrones por implementar: Builder y Abstract Factory

Guía para implementar los dos patrones de esta entrega que todavía no están en
Save a Life. Las rutas y líneas son las de `main` al 26-nov-2026 (commit `6dbacca`).

## Contexto

Patrones de esta entrega: **Facade, Builder, Abstract Factory y Prototype**.

| Patrón | Estado |
|---|---|
| Facade | Ya implementado: `apiRequest` en `frontend/src/lib/api/http.ts:34` |
| **Builder** | **Por implementar** (sección 1) |
| **Abstract Factory** | **Por implementar** (sección 2) |
| Prototype | Por decidir; queda fuera de esta guía |

Los dos patrones de esta guía **resuelven un problema que el código tiene hoy**,
y los dos caen en el mismo módulo, `backend/src/modules/email-delivery/`. Para
cada uno se deja también una alternativa en el frontend, por si se decide no
tocar el backend.

## Antes de empezar

- **Coordinar con Diego.** `backend/` es su código. Mostrarle esta guía y
  acordar si se hace en el backend o con las alternativas del frontend.
- Trabajar en la rama **`frontend`**, con un commit por unidad (Conventional
  Commits, en español). No hacer push sin acordarlo.
- **No cambiar el comportamiento.** Son refactorizaciones: los correos, lo que
  ve el usuario y lo que comprueban las pruebas existentes debe quedar igual.
- Solo datos sintéticos: correos `@example.test`.
- Registrar el trabajo en `docs/plans/AAAA-MM-DD-patrones-builder-abstract-factory.md`.
- Pedir revisión independiente antes de integrar (`reviewer-back` para el
  backend, `reviewer-front` para el frontend, según `AGENTS.md`).
- Verificar, desde la raíz del repositorio:

  ```bash
  npm run test --workspace backend
  npm run typecheck
  npm run lint
  ```

---

## 1. Builder: armar los correos paso a paso

### Qué es

Builder construye un objeto complejo **paso a paso** y separa **cómo se
construye** de **cómo se representa**. Agregas partes con métodos que se
encadenan y, al final, `build()` entrega el objeto terminado.

### El problema que tenemos hoy

Los 6 correos del sistema están en `backend/src/modules/email-delivery/templates/`:
`verificacion_email.ts`, `recuperacion.ts`, `invitacion.ts`,
`invitacion_admin.ts`, `alta_asistida.ts` y `cambio_email.ts`. Todos llaman a
una función con muchos parámetros por posición, `compose`, en
`templates/common.ts:31-43`:

```ts
export function compose(
  subject: string, paragraphs: readonly string[], link: string | null,
  extraLinks: readonly Readonly<{ label: string; url: string }>[] = [],
): RenderedEmail
```

Ejemplo de uso en `templates/invitacion.ts`:

```ts
return compose('Convocatoria de donación de sangre', [
  `${hospitalName} necesita donantes de sangre y te invita a participar en ${sitePublicName}.`,
  `La convocatoria está abierta hasta ${deadline}.`,
  INTENT_NOTICE,
  'El hospital verificará tu identidad y tu elegibilidad antes de cualquier donación.',
  'Si tienes la intención de asistir, abre este enlace para confirmarlo:',
], link, [{ label: 'Si no podrás asistir, abre este otro enlace para indicarlo:', url: rejectLink }]);
```

Problemas:

- Hay que recordar **el orden** de los parámetros y pasar `null` si no hay
  enlace principal.
- Al leer la llamada no se ve qué es cada cosa: ¿el tercer valor es un enlace o
  un párrafo?

Por dentro, `compose` arma **dos versiones del mismo correo**, texto plano y
HTML, escapa el HTML y agrega siempre el aviso académico
(`ACADEMIC_DISCLAIMER`). Por eso Builder encaja «de libro»: **el mismo proceso
de construcción produce dos representaciones.**

### Diseño

Archivo nuevo `templates/email-builder.ts`:

```ts
import { compose, type RenderedEmail } from './common.js';

// Builder de correos: se agregan las partes en orden y build() arma el texto y el HTML.
export class EmailBuilder {
  private readonly parrafos: string[] = [];
  private enlacePrincipal: string | null = null;
  private readonly extras: { label: string; url: string }[] = [];

  constructor(private readonly asunto: string) {}

  parrafo(texto: string): this { this.parrafos.push(texto); return this; }
  enlace(url: string): this { this.enlacePrincipal = url; return this; }
  enlaceExtra(label: string, url: string): this { this.extras.push({ label, url }); return this; }

  // El escape de HTML y el aviso académico se siguen agregando siempre en compose.
  build(): RenderedEmail { return compose(this.asunto, this.parrafos, this.enlacePrincipal, this.extras); }
}

export const unCorreo = (asunto: string) => new EmailBuilder(asunto);
```

Cómo queda `templates/invitacion.ts`:

```ts
return unCorreo('Convocatoria de donación de sangre')
  .parrafo(`${hospitalName} necesita donantes de sangre y te invita a participar en ${sitePublicName}.`)
  .parrafo(`La convocatoria está abierta hasta ${deadline}.`)
  .parrafo(INTENT_NOTICE)
  .parrafo('El hospital verificará tu identidad y tu elegibilidad antes de cualquier donación.')
  .parrafo('Si tienes la intención de asistir, abre este enlace para confirmarlo:')
  .enlace(link)
  .enlaceExtra('Si no podrás asistir, abre este otro enlace para indicarlo:', rejectLink)
  .build();
```

Cada línea dice qué es. En esta primera versión, `build()` reutiliza `compose`,
así el resultado queda **idéntico** y el riesgo es mínimo.

### Pasos

1. **Primero, una red de seguridad.** Las pruebas de hoy
   (`templates/templates.test.ts`) solo revisan partes del correo (el enlace, el
   aviso académico, que el asunto no tenga el token). Antes de tocar nada,
   agregar una prueba que guarde el **resultado exacto** de cada uno de los 6
   correos con datos fijos, por ejemplo con `toMatchInlineSnapshot`.
2. Crear `email-builder.ts` y su prueba `email-builder.test.ts`: `build()` da lo
   mismo que `compose` con los mismos datos, con y sin enlace principal, y con y
   sin enlaces extra.
3. Pasar las 6 plantillas al Builder, una por una, corriendo las pruebas después
   de cada una.
4. Las pruebas del paso 1 y `templates.test.ts` siguen pasando **sin cambios**.
   Eso demuestra que ningún correo cambió.

### Criterios de aceptación

- [ ] Existe `unCorreo(asunto)` con `parrafo`, `enlace`, `enlaceExtra` y `build`.
- [ ] Las 6 plantillas usan el Builder; ninguna llama a `compose` directamente.
- [ ] El asunto, el texto y el HTML de cada correo son idénticos a los de antes.
- [ ] Pasan `test`, `typecheck` y `lint`.

### Frase para la presentación

> «Builder separa la construcción de un objeto de su representación. Cada
> correo se arma paso a paso (asunto, párrafos y enlaces) y el mismo proceso
> produce dos versiones: texto plano y HTML, con el escape y el aviso académico
> siempre incluidos.»

### Alternativa en el frontend (si no se toca el backend)

Builder para los **datos de prueba**. Las pruebas copian sesiones con
`{ ...TEST_DONOR_SESSION, role: …, aal: … }` en 9 lugares
(`VerifyIdentityPage.test.tsx:14-15, 43`, `RequireRole.test.tsx:68, 107, 112, 121`,
`LoginPage.test.tsx:231`). Un `SessionBuilder` en
`frontend/src/test/builders/sessionBuilder.ts` permitiría escribir
`unaSesion().comoAdminHospital().conAal(1).pidiendoMfa().build()`. Riesgo casi
nulo, pero como ejemplo del patrón es menos fuerte que el de los correos.

---

## 2. Abstract Factory: el kit de cada proveedor de correo

### Qué es

Abstract Factory crea **familias de objetos que tienen que ir juntos**. Hay una
fábrica por familia, y cada fábrica entrega **todas las piezas de su familia, ya
coherentes entre sí**. Quien la usa no puede mezclar piezas de dos familias por
error.

### El problema que tenemos hoy

El worker de correos funciona con uno de tres proveedores (`EmailProvider` en
`backend/src/config/env.ts:4`): `'resend'` (envío real), `'dev-mailbox'` (buzón
local) o `'fake'` (pruebas). Según el proveedor hacen falta **dos piezas**:

1. **El enviador** (`EmailSender`), que envía el correo.
2. **La lista de destinatarios permitidos** (`inboxAllowlist`). Con Resend es
   obligatoria y **falla cerrada**: solo se envía a las bandejas permitidas
   (RF-EML-04). Con el buzón local y con el falso no se aplica, porque no hay
   envío real.

Hoy esas dos piezas se eligen **por separado**, con dos condiciones distintas,
en `backend/src/composition-worker.ts:50-56`:

```ts
const sender = overrides.sender ?? (config.email.provider === 'resend'
  ? createResendSender({ apiKey: config.email.resendApiKey as string, from: config.email.from })
  : config.email.provider === 'dev-mailbox'
    ? createDevMailboxSender(fileURLToPath(new URL('../.dev-mailbox/', import.meta.url)))
    : new FakeEmailSender());
// Con Resend la allowlist falla cerrada; con el remitente falso y el buzón local no hay envío real que restringir (RF-EML-04).
const inboxAllowlist = config.email.provider === 'resend' ? new Set(config.email.inboxAllowlist) : null;
```

Las dos decisiones **tienen que coincidir siempre**. Si mañana se agrega otro
proveedor real y se actualiza la primera condición pero se olvida la segunda, el
nuevo proveedor enviaría correos **sin la lista de destinatarios permitidos**: un
hueco de seguridad que nada detecta. La lista se aplica en
`modules/email-delivery/application/process-outbox.ts:59`.

### Diseño

Archivo nuevo `modules/email-delivery/infrastructure/email-kit.ts`:

```ts
import type { EmailSender } from '../application/email-sender.js';
import { createDevMailboxSender } from './dev-mailbox-sender.js';
import { FakeEmailSender } from './fake-sender.js';
import { createResendSender } from './resend-sender.js';

// Fábrica abstracta: cada proveedor entrega su familia completa y coherente.
export interface EmailKit {
  crearEnviador(): EmailSender;
  /** Bandejas permitidas, o null si el proveedor no envía correos reales. */
  destinatariosPermitidos(): ReadonlySet<string> | null;
}

// Fábrica concreta 1: envío real. La lista de destinatarios es obligatoria.
export function kitResend(options: { apiKey: string; from: string; inboxAllowlist: readonly string[] }): EmailKit {
  return {
    crearEnviador: () => createResendSender({ apiKey: options.apiKey, from: options.from }),
    destinatariosPermitidos: () => new Set(options.inboxAllowlist),
  };
}

// Fábrica concreta 2: buzón local de desarrollo. No hay envío real.
export function kitBuzonLocal(dir: string): EmailKit {
  return {
    crearEnviador: () => createDevMailboxSender(dir),
    destinatariosPermitidos: () => null,
  };
}

// Fábrica concreta 3: pruebas. No hay envío real.
export function kitDePruebas(): EmailKit {
  return {
    crearEnviador: () => new FakeEmailSender(),
    destinatariosPermitidos: () => null,
  };
}
```

Y en `composition-worker.ts` se elige **una sola vez**, en un solo lugar:

```ts
const kit: EmailKit = config.email.provider === 'resend'
  ? kitResend({ apiKey: config.email.resendApiKey as string, from: config.email.from, inboxAllowlist: config.email.inboxAllowlist })
  : config.email.provider === 'dev-mailbox'
    ? kitBuzonLocal(fileURLToPath(new URL('../.dev-mailbox/', import.meta.url)))
    : kitDePruebas();

const sender = overrides.sender ?? kit.crearEnviador();
const inboxAllowlist = kit.destinatariosPermitidos();
```

Ahora el enviador y la lista **salen siempre del mismo kit**: no se pueden
mezclar. Un proveedor nuevo obliga a escribir un kit con las dos piezas, porque
la interfaz `EmailKit` las exige.

**Notas de diseño:**

- `overrides.sender` se mantiene: las pruebas del worker lo usan para inyectar un
  enviador programable (`WorkerOverrides`, `composition-worker.ts:23-27`).
- Si se hace también el Builder, la elección del kit puede ir en una función
  `elegirKit(config)` dentro de `email-kit.ts`, para que `composition-worker.ts`
  quede todavía más corto.

### Pasos

1. Crear `email-kit.ts` y su prueba `email-kit.test.ts`:
   - `kitResend(...)` entrega un enviador de Resend y una lista con exactamente
     las bandejas configuradas.
   - `kitBuzonLocal(...)` y `kitDePruebas()` entregan su enviador y `null` como
     lista.
2. Reemplazar las líneas 50-56 de `composition-worker.ts` por la elección del
   kit.
3. Correr todas las pruebas del backend. Las del worker y del outbox
   (`process-outbox.test.ts`, `worker-loop.test.ts`) deben pasar **sin
   cambios**.

### Criterios de aceptación

- [ ] Existe la interfaz `EmailKit` con sus tres fábricas concretas.
- [ ] En `composition-worker.ts`, el enviador y la lista salen del mismo kit; no
      queda ninguna otra comparación `config.email.provider === …` en ese archivo.
- [ ] La prueba de `email-kit.ts` cubre los tres kits.
- [ ] Pasan `test`, `typecheck` y `lint`.

### Frase para la presentación

> «Abstract Factory crea familias de objetos que deben ir juntos. Cada proveedor
> de correo tiene su kit: el enviador y la lista de destinatarios permitidos.
> Antes se elegían por separado y podían desalinearse; ahora salen del mismo kit
> y es imposible enviar con Resend sin la lista de seguridad.»

### Alternativa en el frontend (si no se toca el backend)

Un **kit de ubicación** para el perfil del donante. Según haya token de Mapbox
o no, hoy se decide **en tres archivos distintos** qué buscador se muestra, qué
campos de coordenadas aparecen y cómo se valida:

- `features/donor/pages/OnboardingPage.tsx:53-58, 120-143`
- `features/donor/pages/ProfilePage.tsx:140-143`
- `features/donor/AddressSearch.tsx:20` (`enabled = mapboxEnabled`)

Un `LocationKit` con dos fábricas, «con Mapbox» (buscador + mapa) y «sin
Mapbox» (mapa + campos), entregaría juntas las tres piezas: buscador, campos y
validación. Es válido, pero el ejemplo del correo es más claro y tiene un
beneficio de seguridad.

---

## Diferencia con Factory Method (por si lo preguntan)

En el backend ya existe un **Factory Method**: `SupabaseFactory`
(`backend/src/shared/persistence/supabase-client.ts:4-35`). Crea **un solo tipo
de objeto**, el cliente de base de datos, en dos variantes: `forUser(token)` y
`anonymous()`.

**Abstract Factory** crea **varios objetos distintos que pertenecen a una
misma familia**: aquí, el enviador **y** la lista de destinatarios de un
proveedor.

| | Factory Method | Abstract Factory |
|---|---|---|
| Qué crea | Un producto | Una familia de productos |
| En el proyecto | `SupabaseFactory`: un cliente por petición | `EmailKit`: enviador + lista permitida por proveedor |
| Estado | Ya implementado | Por implementar |

## Orden sugerido

1. **Builder** (correos): es el cambio más visible y las pruebas de plantillas
   dan seguridad.
2. **Abstract Factory** (kit de correo): cambio pequeño y localizado en
   `composition-worker.ts`.
3. Actualizar la presentación con dónde quedó cada patrón y el resultado de las
   pruebas.

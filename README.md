# Save a Life

**Prototipo académico web para conectar hospitales autorizados con donantes de sangre compatibles y cercanos, ante necesidades urgentes de glóbulos rojos (RBC).**

![Estado](https://img.shields.io/badge/estado-prototipo%20acad%C3%A9mico-orange)
![Sprint](https://img.shields.io/badge/sprint-0%20(setup)-blue)
![Datos](https://img.shields.io/badge/datos-100%25%20sint%C3%A9ticos-lightgrey)

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React%2018-20232A?logo=react&logoColor=61DAFB)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-06B6D4?logo=tailwindcss&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)


> [!IMPORTANT]
> Prototipo **académico** con **datos sintéticos**. El *matching* es una preselección académica y confirmar solo expresa intención de asistir. No certifica grupo sanguíneo, elegibilidad ni donación, y no es apto para datos reales.

El modelo es **mediado por hospital** (sin contacto directo paciente ↔ donante): el hospital publica una necesidad, ejecuta un lote manual, el sistema preselecciona donantes por compatibilidad (Haversine + matriz declarada) y los notifica por email; el donante confirma o rechaza. Detalle completo en la [documentación](#documentación).

> [!NOTE]
> El stack, la arquitectura y la estructura descritos son la **arquitectura objetivo** aprobada en la línea base. El código actual (Sprint 0) usa una separación simple **frontend + backend** y se migrará progresivamente hacia el monorepo TypeScript con *worker*.

## Stack

| Capa | Tecnología | Despliegue |
| --- | --- | --- |
| Frontend | React 18 + Tailwind CSS | Vercel |
| API | Node.js + Express (REST) | Render |
| Worker | Node.js (outbox / email) | Render |
| Base de datos | PostgreSQL + RLS | Supabase |
| Autenticación | Supabase Auth (PKCE + MFA) | Supabase |
| Email | Resend (detrás de adaptador) | — |
| Mapas (opcional) | Mapbox · *fallback* MapLibre/OSM | — |
| Lenguaje | TypeScript (monorepo, monolito modular) | — |

## Arquitectura

```mermaid
flowchart LR
    U[Donante / Admin hospital / Superadmin]
    WEB["React 18 + Tailwind<br/>Vercel"]
    API["Express REST<br/>Render"]
    AUTH["Supabase Auth<br/>PKCE + MFA"]
    DB[("PostgreSQL<br/>Supabase + RLS")]
    WORKER["Worker de outbox<br/>Render"]
    RESEND[Resend]
    MAP[Mapbox / MapLibre]

    U -->|HTTPS| WEB
    WEB -->|Cookie Secure/HttpOnly + CSRF| API
    API -->|Auth mediado| AUTH
    API -->|SQL/RPC| DB
    DB -->|Outbox pendiente| WORKER
    WORKER -->|Envío idempotente| RESEND
    RESEND -->|Webhook firmado| API
    API -->|Solo agregados k ≥ 5| MAP
```

## Estructura

**Actual (Sprint 0):**

```
save-a-life/
├── frontend/    # React + Vite + Tailwind
└── backend/     # Express + Supabase
```

**Objetivo (línea base):**

```
save-a-life/
├── apps/        # web · api · worker
├── packages/    # domain · application · shared
└── supabase/    # migraciones + seed
```

## Puesta en marcha

**Requisitos:** Node.js (versión fijada en Sprint 0), pnpm, proyecto de Supabase, cuenta de Resend.

```bash
git clone https://github.com/DiegoRomanP/Safe-a-Life.git
cd save-a-life
pnpm install

# Variables de entorno (ver .env.example de cada app)
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env

pnpm supabase:migrate   # migraciones versionadas
pnpm seed               # datos sintéticos deterministas

pnpm dev:web            # http://localhost:5173
pnpm dev:api            # http://localhost:3000
pnpm dev:worker
```

> Solo claves públicas (Supabase, Mapbox) pueden ir en el cliente. `service_role`, Resend y las claves de cifrado permanecen en el servidor. Nombres exactos y *scripts* se cierran en Sprint 0.

## Documentación

| Documento | Contenido |
| --- | --- |
| [`1_Primeros_Alcances.md`](docs/1_Primeros_Alcances.md) | Línea base: descripción, alcance, arquitectura, requisitos y prototipo. |
| [`2_Especificaciones_De_Software.md`](docs/2_Especificaciones_De_Software.md) | ERS: 45 RF + 56 RNF, casos de uso, verificación y trazabilidad. |
| [`ADR-001`](docs/decisions/ADR-001-stack-del-prototipo.md) | Decisión de *stack* y despliegue. |
| `Save_a_Life.xlsx` | Backlog, requisitos y roadmap. |

## Estado

En desarrollo — **Sprint 0** (setup e infraestructura).

## Autores y licencia

Equipo Save a Life. Ver [`LICENSE`](LICENSE).
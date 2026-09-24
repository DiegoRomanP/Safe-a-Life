# Save a Life

Prototipo web de un curso de desarrollo de software para conectar hospitales
autorizados con donantes de sangre compatibles y cercanos en Lima. El flujo es
mediado por el hospital y contempla notificaciones por email y confirmacion de
asistencia.

## Estado

El repositorio esta en fase de definicion. `Save_a_Life.xlsx` contiene el
backlog, criterios de aceptacion, requisitos, matriz ABO/Rh y roadmap. El stack
del prototipo fue aprobado y esta documentado en
[`ADR-001`](docs/decisions/ADR-001-stack-del-prototipo.md).

## Stack aprobado

- Frontend: React 18 + Tailwind CSS en Vercel.
- Backend: Node.js + Express en Render.
- Datos y autenticacion: PostgreSQL y Supabase Auth mediante Supabase.
- Email: Resend mediante un adaptador; version falsa para pruebas.
- Distancia: Haversine como funcion de dominio en backend.

Java/Spring Boot se evaluo y descarto para este prototipo. Las versiones
exactas, politicas operativas de email y decisiones clinicas, legales y de
retencion pendientes se cerraran antes de implementar cada capacidad.

## OpenCode

La configuracion del proyecto vive en `.opencode/`:

- `agent/`: seis especialistas para arquitectura, backend/datos, frontend,
  seguridad/privacidad, seguridad clinica y QA.
- `skills/`: workflows externos revisados y skills propias del dominio.
- `references/project-requirements.md`: version normalizada de los requisitos.
- `THIRD_PARTY_SKILLS.md`: procedencia, revisiones y licencias.
- `opencode.json`: desactiva compartir sesiones y conserva snapshots locales.

`AGENTS.md` define las reglas transversales y el enrutamiento de skills/agentes.
Reinicia OpenCode despues de modificar cualquiera de estos archivos, porque la
configuracion y las skills no se recargan durante una sesion activa.

## Limites

La aplicacion solo preselecciona posibles donantes. No sustituye verificacion de
grupo sanguineo, tamizaje, elegibilidad ni decisiones de profesionales de salud.
Antes de usar datos reales se requiere revision clinica, legal y de privacidad
aplicable en Peru.

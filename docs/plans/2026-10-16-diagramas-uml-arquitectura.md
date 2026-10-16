# 2026-10-16 — Diagramas UML de la arquitectura y de los patrones (evidencia PC2)

## Objetivo

Representar en UML, con draw.io, la arquitectura aplicada y cada patrón descrito en
`docs/evidence_pc2/justificacion_arquitectura_patron.md`. Para cada patrón: primero el caso
del código y luego la interacción entre sus participantes.

## Alcance

Solo documentación. No se toca código, contrato ni migraciones.

## Entregables

- `docs/evidence_pc2/diagramas/save-a-life-uml.drawio`: 17 páginas editables.
  - 00: leyenda.
  - 01–07: arquitectura (despliegue, componentes, hexagonal, contract-first, persistencia,
    dos secuencias).
  - 10–18: patrones (puertos y adaptadores, anticorrupción, Strategy, registro de
    plantillas, Chain of Responsibility, máquina de estados, outbox, idempotencia y cursor,
    ISP).
- `docs/evidence_pc2/diagramas/png/*.png`: una exportación por página (CLI `drawio` 31.7.0;
  las páginas se numeran desde 1).
- `docs/evidence_pc2/diagramas_uml.md`: explicación de cada diagrama, con referencias
  `ruta:línea` al código.

## Bitácora

- **Convención UML.** Antes de dibujar se leyeron los archivos implicados. Las funciones
  fábrica se representan como «factory», los puertos como «interface» y las funciones SQL como
  «sql function».
- **Generación.** El `.drawio` se generó con un script (fuera del repositorio) y se verificó
  con el MCP de draw.io (`list_pages`: 17 páginas). Cada PNG se revisó visualmente y se
  corrigieron los cruces y solapes de líneas.
- **Nombres verificados.** Todos los identificadores citados existen: se comprobó con
  `grep -w` sobre `backend/src` y `backend/supabase/migrations`.
- **Corrección en la justificación.** La sección ISP decía que `action-tokens` recibe el
  repositorio de donantes completo. En realidad recibe solo la función `onPasswordChanged`
  (`composition.ts:94`). El texto y la tabla resumen se corrigieron: el problema real es que
  `createDonorRecordsService` depende de los 19 métodos.

## Gates

No aplica una puerta de revisión de backend: no hay cambios de comportamiento. No se declara
ningún PASS.

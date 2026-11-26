# Auditoría de seguridad con la skill `security-audit` de Cloudflare

Fecha: 2026-11-25 · Rama: `feat/mapa-ubicacion-y-buzon-dev` · Commit revisado: `156e34c`

## Objetivo
Instalar la skill (`npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit`), aplicarla al proyecto y guardar los fallos y huecos que encuentre en `docs/reports/security/`.

## Qué se hizo
- **Instalación.** La skill quedó en `.agents/skills/security-audit`, con un enlace simbólico para Claude Code, y se añadió a `skills-lock.json`. Antes de usarla se leyó su contenido.
- **Auditoría completa.** Se usó el perfil `quick` con un presupuesto de 20 agentes, de los que se gastaron 11.
- **Fases 1 y 2.**
  - Reconocimiento con 4 agentes.
  - 11 unidades de cobertura.
  - 6 cazadores trabajando en paralelo dentro de un sandbox `bwrap`, sin red y con el repositorio en solo lectura.
- **Crítico final.** Propuso 2 unidades más, que quedaron como diferidas.
- **Fases 3 y 5.** Hubo que salirse del procedimiento: el modo auto no pudo revisar el lanzamiento de los verificadores, porque el hook de context-mode reescribe el prompt de cada subagente. El usuario eligió que verificara el agente coordinador. Así queda reflejado en el informe, y la ejecución consta como `incomplete`.
- **Validación de artefactos.** `findings.json` y `coverage-ledger.json` pasan los validadores de la skill.

## Resultado
- **Hallazgos confirmados:** ninguno.
- **Pendientes de validación (3):**
  - tokens de recuperación que siguen vivos tras un cambio de correo;
  - oráculo de distancia en la cobertura (diferencia entre 0 y «1 a 4»);
  - tokens de acción en la ruta de la URL.
- **Notas de hardening:** 27.

El detalle está en `docs/reports/security/REPORT.md`, `NEEDS-VALIDATION.md` y `FINDINGS-DETAIL.md`.

## Pendiente (requiere decisión del usuario)
- Validar las pistas 1 y 2 contra Supabase local. En esta pasada no se hizo, porque resetea la base de datos local.
- Decidir la política de las pistas 1 y 2. La pista 3 implica cambiar un contrato ratificado.
- Hacer una pasada `standard` que empiece por las unidades diferidas: las RPC técnicas de enlace y el acceso directo a GoTrue con la clave anon.
- Ejecutar `npm run audit:production`, que no se ejecutó en esta pasada.
- No se hizo commit de nada.

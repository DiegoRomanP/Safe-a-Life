# Identidad de proyecto de Engram

> Libro: Proceso y agentes · Estado: Vigente · Índice: [README](README.md)

## Identidad oficial

La identidad predeterminada de Engram para este repositorio es
`save-a-life-oficial`. La fija `.engram/config.json`, creada con el comando
soportado `engram init save-a-life-oficial`; el archivo contiene solo el nombre
del proyecto, no credenciales ni contenido de memoria.

Engram usa este archivo como detección predeterminada desde la raíz del
repositorio y sus subdirectorios, en lugar de inferir el nombre desde Git. Una
selección explícita de proyecto en una llamada (`--project` o el argumento
equivalente de MCP), o un override de proceso (`engram mcp --project` /
`ENGRAM_PROJECT`), tiene precedencia para esa llamada según la ayuda de Engram.
No se debe usar un override para cambiar la identidad oficial del repositorio.

## Verificar la detección

La CLI Engram v3.5.1 no ofrece un subcomando `current-project`. Usa la
herramienta MCP `mem_current_project` en modo de lectura y comprueba el campo
`project`:

1. Invócala con `directory` igual a la raíz del repositorio; debe devolver
   `save-a-life-oficial`.
2. Invócala con `directory` igual a un subdirectorio del repositorio (por
   ejemplo, `backend`); debe devolver el mismo proyecto.

Si cualquiera devuelve otra identidad o ambigüedad, detente y revisa la
detección antes de guardar recuerdos. La comprobación del nombre no demuestra
que la integración MCP pueda guardar o recuperar memorias, ni que exista
sincronización remota; esas capacidades requieren una prueba operativa aparte.

Validación local del 2026-10-20: `mem_current_project` devolvió
`save-a-life-oficial` con `project_source: config` tanto para la raíz como para
`backend`. Esto verifica detección de identidad, no persistencia MCP.

## Historiales previos

Esta identidad nueva no fusiona, copia, mueve ni elimina historiales anteriores.
No se ejecutan `projects merge`, `projects consolidate`, `import`, `delete` ni
operaciones de sincronización como parte de esta configuración. La migración de
memorias antiguas no se ha realizado; esto no significa que se hayan eliminado.

Cuando sea necesario consultar un historial anterior, identifica primero su
nombre exacto y limita la lectura a ese proyecto, por ejemplo:

```sh
engram context --project '<identidad-historica>'
engram search '<consulta>' --project '<identidad-historica>'
```

Son consultas de solo lectura. No uses `--all` para una consulta ordinaria ni
guardes resultados históricos bajo la identidad oficial sin autorización
separada. El contexto recuperado puede contener información privada; no lo
copies a esta documentación, a logs ni a telemetría.

## Archivos locales y privacidad

`.engram/.gitignore` excluye todos los artefactos de Engram —incluidos chunks de
sync, exports, bases de datos, journals y logs— y permite versionar únicamente
`.engram/config.json` y `.engram/.gitignore`. No guardes secretos, PII, tokens ni
contenido privado de memoria en archivos versionados.

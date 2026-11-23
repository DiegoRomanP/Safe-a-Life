# Publicar e invitar, cobertura agregada y transporte seguro

Fecha: 2026-11-23. Rama: `main`. Decisiones de la persona usuaria: [ADR-008](../decisions/ADR-008-publicar-e-invitar-y-cobertura-agregada.md).

## Alcance

Las características 3 (envío automático al publicar y mapa de los más cercanos) y 10 (transferencia segura) de la revisión
del 2026-11-23. Este plan registra la **parte A** (publicar e invitar + cobertura) y el **primer paso de la parte B**
(cabeceras y HTTPS). El resto de la parte B queda pendiente.

## Unidades hechas

| Unidad | Commit | Qué |
| --- | --- | --- |
| B1 | `b692c95` | COOP, `X-Permitted-Cross-Domain-Policies`, HSTS de dos años (sin `preload`), middleware `https-only` en producción y pruebas de cabeceras y de que nunca hay `Access-Control-*`. |
| A2 base de datos | `e402498` | Migración `20261123000000_need_coverage.sql`, pgTAP `20_need_coverage` y alta de la función DEFINER en la lista cerrada de `02`. |
| A2 contrato y API | `198ec76` | Operación `getNeedCoverage` en `docs/openapi.json`, puerto/adaptador/servicio/ruta, mock y escenarios Bruno. |
| A2 frontend + A1 | `a3f4d89` | Leaflet, `CoverageMap`, `CoverageSection` (carga diferida), «Publicar e invitar» en el contexto y las páginas, CSP con teselas OSM. |
| Revisión y arreglo | (este commit) | Supresión k=3 de anillos y totales, un solo recorrido de candidatos, espera explícita en la E2E. |

## Revisión del 2026-11-23

**Esta revisión la hizo la misma sesión que escribió el código, no un subagente.** Se intentó delegar tres veces
(componente de mapa, documentación y revisión independiente) y las llamadas al subagente fallaron las tres: un hook cambia
el prompt de la llamada y el clasificador del modo automático no puede revisar la versión modificada. No se reenviaron con
el texto del hook. Por eso **no cuenta como la compuerta de revisión independiente** que exige `CLAUDE.md`
(security-privacy-auditor y clinical-safety-reviewer): sigue pendiente.

Hallazgos de la autorrevisión:

1. **Fuga por anillos pequeños (alto, corregido).** La primera versión solo suprimía celdas con menos de 3 donantes. Con
   radio de 1 km los anillos miden 250 m: un anillo con 1 o 2 donantes situaba a una persona en esa corona, y con varias
   sedes se podía afinar. Corregido: los anillos se fusionan hasta tener 3 o más por grupo y con 1 o 2 candidatos el total,
   el lote siguiente y el grupo valen `null`. Cubierto por pgTAP (8 casos nuevos) y por pruebas del adaptador, del
   validador del frontend y del mapa.
2. **Seis recorridos de candidatos por llamada (medio, corregido).** Ahora son dos (totales/anillos y celdas).
3. **Sin tope propio para la lectura de cobertura (medio, abierto).** Un admin puede comparar totales entre necesidades en
   borrador con radios distintos. Es la misma clase de dato que `createdInvitationCount`, pero sin cuota ni correos. Ver
   ADR-008, «Consecuencias». Requiere decisión de la persona usuaria.
4. **E2E real con una carrera previa (bajo, corregido).** El paso del superadmin leía el `h1` justo tras navegar y falló 2 de
   4 ejecuciones; ahora espera el título.

Verificado sin hallazgos: `search_path` vacío, propietario y privilegios de `api.get_need_coverage` (anon sin acceso:
pgTAP), `d_require` antes de cualquier helper, necesidad ajena = `not_found`, estados permitidos, paridad con
`request_invitation_batch` (el lote real crea los mismos 6 candidatos que cuenta la cobertura), forma cerrada en
adaptador y frontend, «Guardar borrador» no pide lote, el aviso solo promete lo que el servidor confirmó, `inFlight`
impide dos escrituras a la vez.

## Evidencia (ejecutada el 2026-11-23)

| Comando | Resultado |
| --- | --- |
| `npm test` | mock-api 52, web 15, backend 858, frontend 392: todos pasan |
| `npm run lint` | sin errores |
| `npm run openapi:api:check` | artefactos al día |
| `supabase test db --workdir backend` (base limpia) | 20 archivos, 1199 tests, PASS |
| `npm run test:backend:integration` | 13 archivos, 227 tests |
| `npm run test:bruno:backend` | todas las carpetas pasan, incluido `11a_coverage` |
| `npm run test:e2e:real` | 16 comprobaciones PASS (publicar e invitar, mapa agregado, lote, donantes) |

## No verificado o pendiente

- **Revisión independiente** (security-privacy-auditor y clinical-safety-reviewer) y la aprobación del cierre del módulo.
- `npm run test:contract` (Prism): no arranca en esta máquina (ya anotado en el CI); no se cuenta como evidencia.
- Teselas de OpenStreetMap: en el navegador sin interfaz de las capturas el fondo salió gris; no se comprobó que carguen.
  Si OSM las bloquea hay que cambiar de proveedor.
- **El Supabase remoto no tiene la migración**; `readiness` devuelve 503 contra él hasta `supabase db push`.
- Decisión abierta: tope por admin a `getNeedCoverage` o redondeo del total.
- Parte B (hecha en local, **nada desplegado**): ver `docs/Deploy-Runbook.md`. Queda por verificar en staging: que el transform
  `request.headers` de `routes` se aplique a un destino externo (la documentación no lo dice de forma expresa), los saltos de
  `TRUSTED_PROXIES` y el `keepAliveTimeout` de 5 s frente al balanceador de Render (no se tocó `server.ts`).
- Las dos fases de la parte B se intentaron delegar a subagentes en paralelo y fallaron por el mismo hook que bloquea las llamadas
  al subagente; las hizo la sesión principal siguiendo las skills `security-and-hardening`, `ci-cd-and-automation` y
  `shipping-and-launch`. La revisión independiente de la parte B tampoco existe todavía.

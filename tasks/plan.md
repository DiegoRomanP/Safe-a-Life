# Plan: contrato API, mocks Bruno y frontend Save a Life

## Objetivo

Convertir el contrato API actual, aún parcial, en una base Design-First para el
frontend: sincronizar decisiones de dominio aprobadas, completar OpenAPI,
publicar un mock Prism, ofrecer un mock stateful local, validar solicitudes con
Bruno CLI y construir una UI sintética por rol.

## Decisiones ya aprobadas por el usuario

- RF-PRO-05 prevalece: no recoger, aceptar, almacenar ni inferir historial de
  última donación; el filtro postdonación queda desactivado. Sincronizar la
  referencia normalizada y el Excel.
- AP-03: después de `confirmada -> rechazada`, ocultar identidad hospitalaria;
  conservar código opaco por necesidad y estado.
- AP-09: token sin TTL independiente; válido solo mientras invitación y necesidad
  están activas y antes del vencimiento de la necesidad. Al vencer la necesidad,
  invitaciones pendientes pasan a `vencida`; cierre/cancelación manual las marca
  `invalidada`. Sincronizar RF-INV-08/transiciones.
- AP-01: al vencer el token de alta asistida a las 24 h, la solicitud pasa a
  `vencida`; reemitir antes de la purga a 30 días invalida tokens anteriores y
  vuelve la solicitud a `pendiente`, sin reiniciar `createdAt` ni el plazo de
  purga.
- AP-05: token de verificación del nuevo email válido durante 24 h.
- El mock stateful usa exclusivamente datos sintéticos, estado en memoria y
  reinicio determinista; no reemplaza API real, auth de Supabase, RLS ni email.
- API JSON canónica: `docs/openapi.json`; no mantener YAML duplicado.

## Decisiones de implementación propuestas para Sprint 0

- Un workspace npm con un lockfile raíz; runtime local Node 24, usando React 18,
  Tailwind, Vite y Express según el stack aprobado.
- Prism en `127.0.0.1:4010` para mock estático/validación del contrato.
- Mock stateful Express en `127.0.0.1:4011`; UI Vite en `127.0.0.1:5173` con
  proxy `/api` al mock.
- Colección Bruno versionada que importe el OpenAPI y cubra recorridos positivos,
  negativos y cambios stateful. `bru run` es la interfaz CLI acordada.
- AP-02, AP-04, AP-06, AP-07 y AP-08 permanecen abiertos. No simular entrega de
  email real, garantías de concurrencia productiva ni política de backups/jitter.

## Fases y tareas

### Fase 1: sincronización de dominio y contrato

1. Actualizar `docs/1_Primeros_Alcances.md`, `docs/2_Especificaciones_De_Software.md`,
   `.opencode/references/project-requirements.md` y `Save_a_Life.xlsx` con
   RF-PRO-05 y las resoluciones AP-01/AP-03/AP-05/AP-09.
2. Completar `docs/openapi.json` para auth, donante, hospital y superadmin,
   conservando allowlists de salida y ejemplos solo sintéticos.
3. Actualizar `docs/Api-Rules.md`, README y la skill local con instrucciones de
   mock, ejecución de Bruno y estados ya resueltos.

**Checkpoint:** OpenAPI valida; no contiene campos prohibidos; las fuentes
funcionales y ejemplos son coherentes.

### Fase 2: entorno reproducible y mocks

4. Crear workspace npm con `apps/mock-api` y `apps/web`, comandos documentados,
   lockfile y `.nvmrc`; registrar el tooling en un ADR.
5. Añadir el comando Prism sobre `docs/openapi.json` y validar requests.
6. Implementar mock Express stateful, fixtures sintéticos, sesiones demo por rol,
   endpoint local de reset, transiciones aprobadas y errores del contrato.

**Checkpoint:** Prism sirve operaciones; mock stateful resetea y ejecuta los
recorridos sin red externa ni persistencia real.

### Fase 3: pruebas Bruno

7. Importar OpenAPI a una colección Bruno versionada; añadir tests de contratos,
   errores, aislamiento por rol y secuencias con estado.
8. Proveer un runner que levante y cierre el mock de forma finita y ejecute
   `bru run`; evitar depender de un servidor manual preexistente.

**Checkpoint:** Bruno termina con éxito desde un estado limpio y reporta fallos
por status/cuerpo esperado.

### Fase 4: frontend

9. Crear sistema visual sobrio y accesible y shell público/autenticación/demo.
10. Implementar los recorridos principales de donante (perfil, invitaciones,
    respuesta, solicitudes, políticas publicadas e información laboral).
11. Implementar recorridos de hospital (dashboard, necesidades, lotes, respuestas,
    altas asistidas y política opcional).
12. Implementar recorridos de superadmin (hospitales/sedes/admins, solicitudes,
    configuración/auditoría y supervisión de políticas) sin navegación abierta de
    PII.
13. Mantener estados de carga, vacío, error, conflicto, permiso insuficiente y
    responsive/teclado; conectar únicamente al mock por cliente tipado OpenAPI.

**Checkpoint:** cada rol puede completar sus recorridos aprobados con fixtures
sintéticos; no se presenta ningún comportamiento AP restante como real.

### Fase 5: verificación y documentación

14. Ejecutar unitarias, integración, typecheck, lint, build, OpenAPI/Prism, Bruno y
    navegador/a11y.
15. Documentar ejecución, fixtures, reset, límites de mocks y el paso posterior
    para cambiar de mock a API real.

## Avance verificado al 2026-10-03

### Completado en este corte

- Fuentes funcionales sincronizadas con RF-PRO-05 y AP-01/AP-03/AP-05/AP-09.
- Borrador OpenAPI 3.1 ampliado y válido para 54 rutas/69 operaciones; una sola
  especificación JSON y tipos TypeScript generados para cliente web y DTO HTTP del mock.
- Workspace npm, versiones Node/npm y tooling registrados en ADR-002; Prism
  estático disponible en `127.0.0.1:4010`.
- Mock Express local en loopback con datos sintéticos, sesiones demo con
  expiración server-side, reset con capability/Origin, CSRF, replay idempotente
  de login/logout y claves idempotentes para las mutaciones implementadas y
  proyecciones limitadas por rol. Los tests cubren AP-03.
- Bruno importado del contrato y runner finito. El escenario del donante cambia
  su respuesta; el escenario del hospital posterior confirma que identidad y
  grupo se ocultan al pasar a rechazo.
- UI pública, ingreso demo por roles y pantallas principales donante (perfil,
  invitaciones, historial, solicitudes propias), hospital (resumen, necesidades,
  respuestas) y superadmin (tareas, hospitales, configuración, auditoría).
- El mock de solicitudes de datos solo conserva tipo/campos solicitados; descarta
  valores sintéticos propuestos y no ejecuta correcciones.
- Verificación ampliada tras lotes/handoff: API 50/50, web 15/15, runner de
  contrato 27/27 + 369 checks HTTP, Bruno 22/22; E2E 10 casos × 3 repeticiones
  en QA y 10/10 en auditoría de seguridad. OpenAPI, typecheck, build y audit de
  producción pasan; `lint` equivale a typecheck.
- E2E cubre login, flujo por roles, POST exitoso con refresco fallido, paginación,
  error/carga/vacío, foco/teclado y responsive en 320–1440 px; se ejecutó con
  `--trace=off` para no conservar tráfico.
- Reviews independientes de API, frontend, documentación y seguridad dan PASS
  para el paquete local sintético; Swagger Editor visual continúa pendiente.

### Pendiente para terminar el alcance completo del plan

- Implementar y probar información pública/políticas del donante; altas y política
  hospitalaria; y sedes, membresías, grants/contexto y moderación superadmin.
- Cubrir el inventario de operaciones del mock stateful que todavía responde
  como recurso no disponible; Prism solo cubre ejemplos y contrato estático.
- Ampliar keyboard/screen-reader y matriz responsive por cada pantalla restante, y
  ejecutar revisión independiente de seguridad/privacidad y QA del flujo crítico.
- No resolver AP-02/AP-04/AP-06/AP-07/AP-08 ni desplegar datos reales como parte
  de este corte.

El proyecto sigue en curso: los checkboxes precisos están en `tasks/todo.md`.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Contrato se convierte en especificación demasiado grande | Agrupar schemas/errores y revisar por recorrido; una sola fuente OpenAPI JSON. |
| Mock discrepa de la API que se implemente luego | Validar contra OpenAPI, coleccionar Bruno y marcar toda conducta no incluida en RF como demo-only. |
| UI induce a pensar que la selección es clínica | Copy explícito de preselección sintética; no incluir pacientes ni afirmaciones de elegibilidad. |
| PII sintética parece real | Usar dominios `.test`, IDs fijos no vinculables a personas y ubicaciones demo documentadas. |
| AP-02/AP-04/AP-06/AP-07/AP-08 siguen abiertos | No implementar worker/email real ni aserciones de carreras productivas; registrar límite visible. |

## Fuera de alcance

- API backend productiva, Supabase, RLS productivo, Resend real, base de datos,
  mapas y datos reales.
- Resolución de AP-02/AP-04/AP-06/AP-07/AP-08.
- Pruebas de seguridad productivas: el mock solo verifica contratos/flujo visual.

## Aceptación global

- Contrato OpenAPI completo para las pantallas implementadas y válido para Prism.
- Bruno valida status, schemas y secuencias con estado sintético.
- Frontend por roles funciona en móvil y escritorio con teclado y estados accesibles.
- `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build` y la suite
  Bruno pasan desde checkout limpio.
- Fuentes sincronizadas, AP abiertos visibles, sin PII/secretos ni claims clínicos.

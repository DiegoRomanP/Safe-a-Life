# Superadmin: vistas, responsive y estados — 2026-10-21

Estado: Implementación y QA listas; pendiente revisión de la persona usuaria para cierre del módulo. Copia Safe-a-Life-login, rama feat/login-penpot, main integrado 04e813e; estado inicial limpio.

## Solicitud y fuentes
Usuario asigna superadmin + responsive + estados. Referencias: 8 capturas adjuntas (la última repite Tareas), docs/Frontend-Design.md, ERS/línea base, docs/openapi.json. Trabajar en frontend/, no apps/web. Diego hará conexión real; no tocar backend/auth/contratos ni trabajo de hospital/donante.

## Aceptación
- Siete secciones navegables y detalle de solicitud: Tareas, Hospitales, Sedes, Administradores, Solicitudes, Configuración, Auditoría. Penpot: cabecera blanca, rail petróleo, tarjetas, rojo moderado, datos sintéticos explícitos.
- Estados reales de demo comprobables: carga, vacío, error seguro con reintento, conflicto sin aplicar cambio, permiso insuficiente sin acción y éxito; estados de lectura y de acción separados. Selector solo en desarrollo claramente rotulado.
- Flujos locales coherentes, filtros funcionales y formularios con validación visible; contrato/interfaz de adaptador tipado para conexión posterior sin implementar backend.
- Responsive 320/360/768/1024/1440, rail Modo local y navegación colapsable móvil, sin scroll horizontal; títulos por ruta, teclado/foco, aria-live, movimiento reducido.
- No sesión/MFA/grant falsos, no padrón ni PII sensible, no almacenamiento persistente/logs; auditoría solo códigos opacos. Acceso contextual/step-up representado como pendiente de backend. Configuración fecha única, matriz solo lectura, sin reglas clínicas nuevas.

## Slices / responsables
1. Frontend accessibility engineer (único escritor producto): base local tipada y componentes comunes, shell responsive, Tareas e instituciones (Hospitales/Sedes/Administradores). Revisar slice inmediatamente con ReviewerFront.
2. Mismo escritor: Solicitudes/detalle, Configuración y Auditoría; completar rutas y documentación de integración. ReviewerFront inmediato y SecurityPrivacyAuditor de solo lectura; gate clínico si se modifica lenguaje/aptitud clínica.
3. QA reliability (único escritor tests): cobertura significativa de flujo/estado y cinco anchos. ReviewerFront revisa cambios de prueba antes del cierre.
4. Senior verifica capturas y registra resultados; no declarar gates ausentes. Persona usuaria revisa entrega.

## Verificación
Instalar dependencias fijadas con Node24.19/npm12.0.2 y allowScripts; sin actualizar lockfile. Compilar/frontend typecheck+lint y suite existente + tests nuevos; navegador cinco anchos, teclado, estados, no almacenamiento de datos. No hace falta probar conexión real, explicitamente pendiente.

## Bitácora
- Git limpio antes de empezar; main traído por merge. Nuevas vistas van en frontend/features/superadmin. AppLayout y estados UI existentes reutilizables; src/api vacío, se añade interfaz local de demo y documentación de correspondencias sin cambiar OpenAPI.
- Riesgo compartido: AppLayout usado por donante; cambios serán opcionales/acotados y regresión de tests existentes obligatoria.
- Aplicadas skills locales planificación, implementación incremental, dominio y seguridad. Writer frontend-accessibility-engineer asignado al primer slice; security/privacy preflight de solo lectura convocado.
- npm ci completado (682 paquetes) con Node24.19/npm12.0.2, lockfile conservado y allowScripts vigentes. Servidor Vite antiguo9860 de esta copia detenido tras verificar su ruta; bloqueaba el binario lightningcss. Se mantiene instalación global intacta.
- Lanzador temporal npm12 disponible en %TEMP%/save-a-life-tools. Sin cambios de dependencias ni scripts del proyecto.
- Auditoría runtime npm audit --omit=dev: 0 vulnerabilidades; alertas dev heredadas no se actualizaron fuera de alcance.
- Security preflight: invitación solo email sintético+hospital activo; listado emailHint. Solicitudes solo metadata/códigos sin valores antiguos/nuevos ni padrón. Step-up/MFA/grants pendientes, sin simulación de acceso a PII. Config finalDemoAt/isImmutable de una sola fijación local; matriz solo lectura; sin afirmar purga. Auditoría códigos minimizados.
- Se elige shell SuperadminLayout aislado para no modificar AppLayout del donante; controles de prueba solo DEV. Estados de lectura y mutación independientes, fallos preservan borrador y datos.
- Slice1 entregado por superadmin_frontend: gateway/context/tipos, shell aislado, estados, formularios e instituciones y Tareas. Lint frontend PASS (incluye types). Writer detenido; superadmin_reviewer convocado inmediatamente, review de archivos nuevos y rutas.
- QA superadmin_qa completó preparación de solo lectura: cobertura definida para cinco anchos, estados/acciones/drafts/inmutabilidad y teclado. Sin código de pruebas escrito aún; espera gates finales.
- ReviewerFront slice1 BLOCKED: aprobacion de sede en hospital inactivo y thead oculto con display:none en móvil. Writer corrigió guardia de hospital activo con conflicto sin mutación y mantuvo headers visualmente ocultos con roles de tabla explícitos. Lint frontend PASS tras correcciones. Solicitada re-revisión independiente.
- Verificación visual Senior con Chromium: Hospitales1440 y Sedes360 sin pageerrors ni scroll horizontal; capturas revisadas, estilo fiel al Penpot. Vite frontend temporal activo en5174; se detendrá para QA aislado.
- ReviewerFront re-review slice1 PASS. Delegado slice2 a mismo writer: Solicitudes/detalle, Configuración, Auditoría, rutas/documentación de conexión. Sin cambios de contratos/stack, no acceso privado simulado.
- QA autorizado a escribir exclusivamente pruebas unitarias del gateway del slice1 ya aprobado, en paths distintos mientras slice2 extiende API sin romper read/execute. Firmas existentes congeladas; gate de revisión inmediato al entregar ese slice de tests. UI/E2E esperan producto final.
- QA slice1 unitario entregado: demoGateway.test.ts, 8/8 PASS. Cobertura copias/aislamiento, fallos sin cambios y reintento, dependencias hospital, regresión sede/hospital y emails sintéticos minimizados. ReviewerFront revisó archivo de prueba independiente: PASS. No se repitió ejecución sin cambios.
- Slice2 entregado: Solicitudes/listado/detalle, Configuración, Auditoría, tipos/gateway, rutas, Tasks/shell/style y frontendREADME con mapa OpenAPI/pasos conexión. Writer frontend lint+build PASS. Solicitudes representa seis estados; solo decisiones metadata simuladas; config Lima→UTC y fecha única en instancia.
- ReviewerFront slice2 PASS; SecurityPrivacyAuditor PASS estático de todo el área local; mismo auditor cargó perfil clínico y emitió gate clínico acotado PASS para matriz académica readonly/RBC sin reglas nuevas.
- Senior inspeccionó capturas de las siete vistas desktop1440 sin desbordamiento ni errores JS. Vista previa5174 detenida para QA aislado.
- Autorizado QA final a ampliar pruebas y añadir configuración E2E frontend aislada sin paquetes/scripts nuevos. Producto congelado hasta hallazgos. Revisar testdiff inmediatamente antes del cierre.
- QA final entregó cuatro archivos de pruebas/config: gateway ampliado, interactions.test.tsx, frontend/e2e/superadmin.e2e.ts, frontend/playwright.config.ts. 12/12 pruebas enfocadas PASS; E2E preparado para ocho vistas × cinco anchos + diez flujos. Sin producto modificado.
- ReviewerFront tests finales BLOCKED por selector de heading del estado no disponible (StatePanel usa párrafo). QA corrigió solamente selector para h1 real + párrafo exacto; solicitada revisión acotada. Suite de navegador aún no ejecutada.
- QA tests finales ReviewerFront PASS después de corregir selector. Verificación ejecutada: suitefrontend 124/124 PASS en24archivos, lint+typecheck PASS, tipos standalone config/E2E PASS.
- E2E primeras40/40 combinaciones (ocho vistas×320/360/768/1024/1440) PASS: sin errores JS/desbordamiento, headers accesibles y sin storage. Flujos restantes detectaron expectativas de prueba de alerta ambigua y formato horario12h es-PE; QA corrige solo tests, producto no afectado. Revisión acotada pendiente antes de repetir afectados.

- ReviewerFront aprobó correcciones acotadas finales de E2E (alertas/combobox/hora literal Lima). QA repitió solo diez flujos afectados, sin repetir las40 comprobaciones de responsive ya aprobadas: 10/10 PASS en22.2s, total conjunto50/50. Producto intacto desde PASS.
- QA final: 124/124 pruebas frontend en24archivos PASS; lint+typecheckfrontend PASS; lintE2E y tsc standalone config/E2E PASS tras correcciones. Cero tracezip y sin storage/APIcalls imprevistas/errores consola. No certifica auth/backend real.
- Comandos de verificación con PATH Node24/npm12shim: npm run test --workspace @save-a-life/frontend; npm run lint --workspace @save-a-life/frontend; npm run build --workspace @save-a-life/frontend (writer); node node_modules/@playwright/test/cli.js test -c frontend/playwright.config.ts --trace=off (50casos), luego --grep-invert accesibilidad --output test-results/superadmin-flows para10flujos corregidos.
- Capturas7 conservadas en test-results/superadmin (cincoTareas porwidth, Config1440 y detalle360). QA inspeccionó cincoTareas; Senior verificó capturas320/768/1024+detalle360 además de siete vistasdesktop previas, sin cortes/solapamientos.
- Vista final iniciada en http://127.0.0.1:5174/superadmin/tareas, frontend/ real actualizado. Solo demo sintética en memoria; frontendREADME explica inyección gateway y correspondencia endpoints para Diego. Sin código backend, contrato, dependencias ni módulos hospital/donante modificados.
- Gates efectivos: ReviewerFront producto slice1/slice2 PASS; ReviewerFront pruebas slice1/final/correcciones PASS; seguridadprivacidad PASS; clínicoacotado PASS; QA PASS. Revisión visual de persona usuaria pendiente; no se registra aprobación inexistente. Cambios locales preparados para revisión, sin publicar.
- Limpieza final: writer eliminó exclusivamente línea vacía extra EOF en routes.tsx; git diff --check PASS. ReviewerFront verificó cambio no semántico y mantuvo PASS; no se repitieron pruebas sin justificación. Backend/appsweb/package/lockfile sin diffs.

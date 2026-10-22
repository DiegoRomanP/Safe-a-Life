# Login Penpot — 2026-10-12

Estado: Completada.

## Objetivo y alcance
Implementar la tercera captura de Penpot en el LoginPage existente: panel azul petróleo, marca con cruz roja, formulario correo/contraseña, aviso académico y enlaces de registro/recuperación. Mantener React, contrato, cliente y mock existentes. Registro y recuperación fuera de este slice: si no hay rutas operativas, indicar honestamente que están pendientes sin simular éxito.

## Criterios
- Responsive desktop/móvil, etiquetas, teclado/foco, carga/error y prevención de envíos duplicados.
- Ingreso con cuentas sintéticas existentes y rol devuelto por API; sin selector de rol ni autenticación inventada.
- Sin almacenamiento/log de credenciales ni datos reales; no confundir mock con auth productiva.
- No modificar backend, contrato, dependencias ni pantallas ajenas.

## Responsables y orden
1. DevFrontier: apps/web/src/pages/AccessPages.tsx y estilos específicos de login en apps/web/src/styles.css. Cargar skills frontend/domain/security aplicables.
2. ReviewerFront: revisión independiente inmediata del slice.
3. SecurityPrivacyAuditor: revisión auth/credenciales de solo lectura.
4. QA reliability: pruebas pertinentes, adaptación de tests de login existentes, verificación navegador desktop/móvil. Un único escritor de pruebas.
5. ReviewerFront: revisión de cambios de tests. Senior actualiza solo este plan.

## Verificación y riesgos
Build/typecheck, pruebas unitarias pertinentes, E2E de acceso por tres roles/error/carga, responsive y teclado. Herramientas requeridas Node 24.19.0/npm 12; sistema actual Node22/npm10. Revisar disponibilidad antes de instalar, conservar lockfile y allowScripts. No declarar checks no ejecutados.

## Bitácora
- Carpeta original en chore/specs_project con backend/ sin seguimiento: preservada.
- Fetch seguro usando certificados Windows; origin/main cc873f4.
- Creada copia aislada C:/Users/Ator/Safe-a-Life-login, rama feat/login-penpot.
- Login actual es selector de fixtures; se reutilizará onLogin y el cliente existente.
- Delegado slice UI a dev_frontier; solo AccessPages.tsx y styles.css. Skills locales frontend, dominio y seguridad aplicadas.
- Node 24.19.0 disponible en runtime de la app; npm 12.0.2 preparado temporalmente sin modificar instalación global.
- npm ci completado con lockfile y allowScripts conservados. Se usó --use-system-ca para confianza HTTPS de Windows, sin desactivar TLS. Audit de instalación reporta 17 vulnerabilidades (separación runtime/dev pendiente); no se aplicó upgrade fuera de alcance.
- Registro/recuperación no existen en App ni cliente: controles mostrarán aviso explícito pendiente, sin simular operación.
- DevFrontier entregó slice en AccessPages.tsx y styles.css; diff --check limpio. ReviewerFront convocado inmediatamente; SecurityPrivacyAuditor paralelo por auth.
- SecurityPrivacyAuditor PASS estático: callback/POST existentes, rol del servidor, sin persistencia/logs/roles suministrados; error genérico y bloqueo de doble envío. Gate productivo no aplica al mock.
- npm run build: PASS (mock TypeScript y web TypeScript/Vite). npm test en curso; 50 tests mock aprobados.
- npm audit --omit=dev: 0 vulnerabilidades. Las 17 alertas de instalación corresponden a tooling dev heredado; no se modificó lockfile.
- Chromium Playwright instalado para pruebas; Node24.19.0/npm12.0.2 aislados disponibles.
- npm test PASS: 50 mock + 15 web (65 total).
- ReviewerFront BLOCKED contraste de borde/placeholder y foco de marca. DevFrontier corrigió exclusivamente los tres colores y diff --check PASS. Revisión independiente repetida solicitada.
- ReviewerFront PASS después de corrección de contraste; sin otros hallazgos bloqueantes.
- Delegado a qa_reliability: adaptar accesos E2E existentes y pruebas enfocadas; único escritor en apps/web/e2e. Primer intento falló por cuota de agente; retomado tras petición del usuario de continuar.
- Senior inspeccionó capturas 1440x900 y 390x844 en Vite5174: no desbordamiento horizontal, diseño fiel y aviso académico visible. Capturas temporales sin datos ingresados.
- Compilación web repetida tras correcciones CSS: PASS.
- QA entregó cambios de prueba en app.e2e.ts y login.e2e.ts; se solicitó revisión inmediata antes de ejecutarlos.
- ReviewerFront detectó expectativa incorrecta de ruta de prueba: donante usa /app/donor/invitations. Devuelto a QA para corrección; implementación de producto no afectada.
- QA corrigió expectativas a /app/donor; ReviewerFront PASS del slice de pruebas. Suite E2E en ejecución con --trace=off.
- Runner existente Windows falló con spawnSync(playwright.cmd) EINVAL; ejecutor temporal equivalente y shim npm12 temporal permitieron iniciar suite sin cambiar scripts/config del repositorio ni imprimir la capacidad de reset.

- QA PASS: 20/20 E2E en 56s, 10 nuevos de login y 10 existentes adaptados; trace OFF, sin trazas guardadas. Suite en entorno sintético, no acredita auth productiva.
- Capturas desktop1440, mobile390 y narrow320 verificadas; sin recortes ni desbordamiento horizontal.
- Gates finales: ReviewerFront producto PASS, ReviewerFront pruebas PASS, SecurityPrivacyAuditor PASS, QA PASS. Build web final PASS; 65 unitarias previas PASS.
- Ejecución E2E Windows: temporal %TEMP%/save-a-life-login-e2e.cjs con Node24, shim npm12 %TEMP%/save-a-life-npm12-shim. Runner versionado original requiere reparación Windows en tarea independiente; no se modificó fuera del alcance.
- Vista local final activa en http://127.0.0.1:5173/login con mock4011; Vite temporal5174 cerrado.
- Copia original intacta; cambios sin commit/push en rama feat/login-penpot de Safe-a-Life-login. Registro/recuperación pendientes explícitos para próxima entrega. Tooling dev heredado con alertas; runtime audit 0; lockfile intacto.

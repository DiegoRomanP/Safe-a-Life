# Pistas pendientes de validación (run-1)

Estas tres pistas tienen una traza real en el código, pero ninguna es una vulnerabilidad confirmada. Por eso no llevan severidad, y el orden de la lista solo marca prioridad. Para cerrar cada una falta un dato que el código no muestra, o una ejecución contra la base de datos que esta pasada no hizo. La fuente canónica es `findings.json`, que está en inglés y es el esquema de la skill.

La verificación la hizo el agente coordinador. El verificador independiente que exige la skill no se pudo lanzar; los detalles están en REPORT.md, §1.

---

## 1. Al cambiar el correo de un donante no se invalidan los tokens de recuperación del correo antiguo

`fingerprint: donor-email-change-keeps-old-address-recovery-tokens`

**Frontera afectada.** El caso es una corrección de correo (F7): el buzón antiguo se ha perdido o está comprometido y el donante pide cambiarlo. La corrección debería quitarle la autoridad a ese buzón, pero quien lo controla puede seguir fijando la contraseña de la cuenta ya re-direccionada y cerrar las sesiones del dueño legítimo.

**Traza (verificada):**
1. `backend/src/modules/donor-records/http/donor-records.router.ts:101`: `POST /api/v1/donor-email-change-actions/:token`, una ruta pública con token.
2. `backend/src/modules/donor-records/application/donor-records-service.ts:228`: `verifyEmailChange` consume el token, ejecuta `admin.updateEmail` y revoca las sesiones. No toca los tokens de recuperación.
3. `backend/supabase/migrations/20261013060000_donor_records.sql:742`: `api.consume_email_change` solo marca como consumido su propio token `cambio_email`.
4. `backend/supabase/migrations/20261013050000_action_tokens.sql:310`: el token `recuperacion` emitido antes solo está ligado a `subject_id`, dura 1 h y se envió al correo vigente en ese momento.
5. `backend/src/modules/identity-institutions/http/action-tokens.router.ts:68`: `POST /api/v1/auth/password-reset-actions/:token`, la ruta pública de reset.
6. `backend/supabase/migrations/20261022010000_worker_auth_purges.sql:167`: `api.consume_password_reset`, en su definición vigente, solo comprueba si el token está consumido, invalidado o caducado.

**Evidencia adicional:**
- `20261020010000_privacy_execution.sql:134`: `issue_email_change` invalida solo los tokens `cambio_email`. Solo la eliminación (`:71`) los invalida todos.
- `:146`: `finish_email_change` tampoco invalida los tokens de recuperación.
- `action_tokens.sql:311`: el correo de recuperación se encola con `recipient_user_id` nulo.

**Precondición.** El token de recuperación tiene que pedirse mientras el correo antiguo sigue vigente, porque `request_password_recovery` resuelve el correo en el momento de la petición. La ventana va desde que se emite el token hasta que caduca (1 h), y debe solaparse con el cambio de correo.

**Bloqueadores:**
- En esta pasada no se ejecutó SQL ni pgTAP contra Supabase.
- El código no declara si el buzón antiguo debe considerarse no confiable tras una corrección.

**Plan local (acotado, con datos sintéticos `.example.test`):**
1. `supabase start --workdir backend`.
2. Como `api_technical`, llamar a `request_password_recovery` para el donante D (`old@example.test`) y guardar el token T.
3. Seguir el flujo de corrección: `issue_email_change` hacia `new@example.test` y después `POST /api/v1/donor-email-change-actions/:token`.
4. Llamar a `consume_password_reset(sha256(T))`.
   - Resultado esperado hoy: `ok`.
   - Resultado esperado con el arreglo: `gone`, y la fila `recuperacion` pendiente del outbox cancelada.

**Comprobación del dueño.** Decidir si una corrección de correo revoca la autoridad del buzón antiguo. Si la revoca, el arreglo mínimo es invalidar en `consume_email_change` los tokens `kind='recuperacion'` del `subject_id` y cancelar sus correos pendientes. Conviene añadir además un caso pgTAP de regresión.

---

## 2. La cobertura agregada distingue 0 de «1 a 4» y revela la banda de distancia de un donante

`fingerprint: need-coverage:zero-vs-null-radius-sweep-distance-oracle`

**Frontera afectada.** RF-VIS-01/02 y ADR-008 dicen que el hospital nunca ve distancias individuales. Un admin hospitalario (AAL2, membresía activa) puede saltarse esa garantía. Elige el tipo de sangre receptor (con O- solo cuentan donantes O-) y un radio entero entre 1 y 50 km por borrador, con un máximo de 60 borradores por hora. La cobertura responde `0` cuando no hay candidatos y `null` cuando hay entre 1 y 4. Una búsqueda binaria de unas 6 lecturas, por debajo del tope de 20 por hora, da la banda de 1 km del donante compatible más cercano medida desde una sede de coordenadas conocidas. Con dos sedes las bandas se cruzan.

**Traza (verificada):**
1. `backend/src/modules/invitation-coordination/http/invitations.router.ts:65`: `GET /api/v1/hospitals/me/needs/:needId/coverage`.
2. `backend/src/modules/invitation-coordination/application/invitations-service.ts:63`: aplica solo el tope de 20 por hora por admin.
3. `backend/supabase/migrations/20261123000000_need_coverage.sql:33`: `app.invitation_candidates` filtra por la matriz RBC y por `radius_km`, ambos elegidos por el admin.
4. `:89`: un total de 1 a 4 se convierte en el grupo `null`.
5. `:135`: `compatibleCount = coverage_bucket(v_total)`.

**Evidencia:**
- `need_coverage.sql:17`: `when p_n = 0 then 0 when p_n < 5 then null`.
- `20261021010000_need_site_race.sql:57`: tope de 60 borradores por hora.
- `invitations-service.ts:21`: `COVERAGE_LIMIT = 20`. El comentario de ese mismo fichero admite que se puede acotar la zona de una persona.
- `docs/decisions/ADR-008-…md:40`.
- `docs/openapi.json`: `radiusKm` es un entero con mínimo 1 y máximo 50.

**Bloqueadores:**
- No se puede ejecutar la función de Postgres en esta pasada.
- Es una cuestión de política: ¿el riesgo residual que acepta ADR-008 («acotar zonas gruesas») cubre la banda de 1 km de una sola persona?

**Plan local (acotado):**
1. Con Supabase local, sembrar 1 hospital y 1 sede aprobada, y un único donante O- disponible a unos 3,4 km.
2. Crear borradores O- de 3 km y de 4 km y pedir su cobertura. Resultado esperado: `0` con 3 km y `null` con 4 km.
3. Regresión: un caso pgTAP que exija la misma respuesta para 0 y para 1–4, o que rechace sondeos de tipo raro o radio pequeño.

**Arreglo sugerido (para la decisión del dueño):**
- Fusionar el 0 dentro de «menos de 5».
- O bien aplicar el tope por hospital y no por admin.

---

## 3. Los tokens de un solo uso viajan en la ruta de la URL de la API

`fingerprint: action-token-in-api-request-path`

**Frontera afectada.** El correo pone el token en el fragmento de la URL para que no llegue a ningún servidor (ADR-005). Después la SPA lo envía en la **ruta** de la petición a la API, en las 9 operaciones `{token}` del contrato. Esa ruta pasa por el rewrite de Vercel y por el ingress de Render, que pueden registrar URLs completas. El backend solo registra la plantilla de la ruta. La vista previa de la invitación de admin (GET) no consume el token. Si alguien ve el token en un log antes del claim, puede reclamar la cuenta de admin hospitalario. Lo mismo vale para el reset de contraseña.

**Traza (verificada):**
1. `frontend/src/features/auth/useFragmentToken.ts:17`: se lee el fragmento.
2. `frontend/src/lib/api/auth.ts:112`: `GET /hospital-admin-invitation-actions/${encodeURIComponent(token)}`. El claim está en `:123` y el reset en `ResetPasswordPage.tsx:86`.
3. `frontend/vercel.json:5`: `/api/(.*)` se reescribe hacia Render con la ruta completa.
4. `backend/src/modules/identity-institutions/http/action-tokens.router.ts:41`: el token se toma de `req.params`.

**Evidencia:**
- `backend/src/shared/observability/logger.ts:28`: el backend solo registra la plantilla de la ruta.
- `docs/openapi.json:1615`: el token es un parámetro de ruta en una operación ratificada.

**Bloqueador.** Depende de si Vercel (logs de rewrite, runtime y edge, y log drains) y Render (logs HTTP) guardan la ruta completa de `/api/*`, durante cuánto tiempo y quién puede leerla. Nada de eso se ve en el código, y no hay nada desplegado todavía.

**Plan local (solo por código).** Comprobar que las 9 operaciones envían el token en la ruta. Para ello, buscar `encodeURIComponent(token)` en `frontend/src/lib/api` y en las páginas.

**Comprobación del dueño (en staging, sin tráfico de auditoría):**
1. Enviar una petición sintética: `GET /api/v1/hospital-admin-invitation-actions/SYNTHETICMARKER0000000000000000000000000000`.
2. Buscar `SYNTHETICMARKER` en los logs de Vercel, en cualquier log drain y en los logs HTTP de Render.
3. Si aparece, mover el token al cuerpo (por ejemplo `POST …/preview` con `{token}`) o a una cabecera. Esto exige cambiar el contrato ratificado y, por tanto, la aprobación del usuario.

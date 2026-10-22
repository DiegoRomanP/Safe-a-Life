# ADR-006: Allowlist de `service_role`

## Estado

Aceptado el 2026-10-12 (V-Auth de la persona usuaria).

## Fecha

2026-10-12

## Contexto

ADR-001 y ADR-003 prohíben `service_role` para operaciones ordinarias.
Algunas acciones sobre Supabase Auth no existen con la anon key: cambiar la
contraseña de un usuario tras el reset, cambiar su email, borrar un usuario y
revocar todas sus sesiones.

## Decisión

1. `service_role` se usa **solo** en
   `backend/src/modules/identity-institutions/infrastructure/supabase-auth-admin.ts`
   (adaptador del puerto `AuthAdmin`), con exactamente **cinco** métodos:
   `updatePassword`, `updateEmail`, `deleteInertUser` (borrado condicional y atómico mediante
   `api.worker_delete_inert_user`, ADR-003), `revokeAllSessions` y `deleteAccount` (borrado
   definitivo de la cuenta de Auth de una donante cuya eliminación V15 está `en_ejecucion`; el
   id sale de `api.get_execution_subject`, nunca de la petición; un 404 es éxito).
2. La clave llega por `SUPABASE_SERVICE_ROLE_KEY` (requerida y distinta de la
   anon key) y solo la leen `config/env.ts`, `composition.ts` y el adaptador.
   Una prueba estática (`service-role-allowlist.test.ts`) recorre
   `backend/src/**/*.ts` y falla si `serviceRoleKey` aparece en otro archivo.
3. Si el cliente Auth Admin no ofrece revocación por usuario, se usa la función
   DEFINER `api.worker_revoke_sessions(p_user_id)` que borra las filas de
   `auth.sessions` del usuario; está en la allowlist DEFINER de ADR-003 y exige
   revisión de seguridad.
4. Ampliar la lista (p. ej. `createUser`) requiere decisión de la persona
   usuaria y una revisión de `security-privacy-auditor`.

## Registro de decisiones

- Aprobado el 2026-10-22 por la persona usuaria, solo V15: `deleteAccount`
  (opción (a) de `docs/plans/2026-10-21-p12-opciones-borrado-auth.md`). Las purgas del
  worker siguen abiertas (P-12 parcial) y el worker no recibe `service_role`.
- Pendiente: revisión de `security-privacy-auditor` sobre este punto.

## Consecuencias

- El adaptador crea el cliente con `persistSession: false`; nunca se reutiliza
  como cliente de petición.
- Los JWT ya emitidos siguen siendo válidos hasta expirar (≤ 600 s); SEC-07
  lo mitiga resolviendo el actor en cada petición.
- El `signUp` público deja usuarios de Auth inertes sin `user_accounts`. Su
  purga (> 24 h) y la de cuentas `reclamada_incompleta` (> 30 días) las hace la
  RPC `api.worker_purge_auth_accounts` con el JWT técnico del worker (opción b2,
  decisión de la persona usuaria del 2026-10-22): el worker no tiene
  `service_role` ni `eraser`, y `AuthAdmin` sigue en cinco métodos.

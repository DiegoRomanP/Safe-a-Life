# Onboarding obligatorio en pantalla única del donante

Fecha: 2026-11-20. Rama: `feat/onboarding-obligatorio` (parte de `feat/mapbox-direccion-perfil`).

## Qué y por qué

La especificación (RF-IAM-01, RF-IAM-04, DON-OBJ-01, CU-02) exige que la cuenta del donante solo se
active con el perfil obligatorio completo (nombre, grupo declarado, disponibilidad y ubicación
aproximada) y que una cuenta incompleta no participe en el matching. El backend ya lo hace cumplir.
El frontend solo lo sugería: `/donante/bienvenida` era una ruta más y el donante sin perfil podía
abrir Invitaciones, Historial o Solicitudes. Este cambio es de UX; no toca el contrato OpenAPI ni
ningún ADR.

## Decisión de diseño

- `DonorLayout` consulta el perfil (`getProfile`, `useDemoQuery`) y decide el modo:
  - **sin perfil** → `FocusLayout` (marca, etiqueta académica y «Cerrar sesión», sin menú) y cualquier
    ruta distinta de `/donante/bienvenida` redirige allí;
  - **con perfil** → `AppLayout` completo; `/donante/bienvenida` redirige a Invitaciones con el aviso
    «Perfil completo» (`state.onboarded`).
- **Falla cerrado:** si no se puede saber si hay perfil (error de red), el área no se abre y se ofrece
  reintentar; 403 muestra «sin acceso».
- Tras guardar, el dato anterior (`null`) sigue visible mientras se revalida: el shell muestra
  «Guardando tu perfil…» en lugar de rebotar a la bienvenida.
- Un 409 en el onboarding (perfil ya activo, p. ej. completado en otra pestaña) vuelve a pedir el
  perfil (`DonorDemoContext.completeOnboarding`) para salir de la pantalla de enfoque.
- `useSignOut` se extrajo de `AppLayout` para compartirlo con `FocusLayout`.

## Efectos colaterales conocidos

- La guarda y la página de perfil leen `getProfile` cada una: hay una petición de perfil extra por montaje
  (el 404 esperado del donante nuevo se recuerda con `rememberNull`).
- `scripts/test-e2e-real.mjs`: el frontend se lanza con `VITE_MAPBOX_TOKEN=''` para que el E2E use
  latitud y longitud sin depender del token local ni de la red; y la etiqueta «Meta de confirmaciones»
  pasó a «Meta de intenciones» (renombrada antes en B5, el script había quedado desactualizado).

## Evidencia

- `npm run typecheck`, `npx eslint frontend/src` y `npm run test --workspace @save-a-life/frontend`
  (369 pruebas, incluidas las nuevas de `DonorLayout.test.tsx`).
- Playwright contra el backend real con una cuenta nueva: al ingresar solo se ve el formulario; escribir
  `/donante/historial` vuelve a la bienvenida; sin dirección no deja guardar; con dirección elegida
  aterriza en Invitaciones con el menú completo y el aviso; recargar `/donante/bienvenida` ya con perfil
  lleva a Invitaciones.
- `npm run test:e2e:real`: 15/15 PASS contra la base local (registro, perfil obligatorio, superadmin, hospital y los dos donantes). La primera vez falló en el paso del hospital por la etiqueta antigua; un segundo intento inmediato falló en el TOTP del superadmin (misma ventana de 30 s) y el tercero pasó entero.

## Pendiente / fuera de alcance

- No se verificó en el backend que las invitaciones excluyan a las cuentas incompletas más allá de lo ya
  cubierto por sus pruebas (pgTAP e integración).
- Cuenta sintética de prueba creada en el Supabase remoto de desarrollo: `prueba2@example.test`.

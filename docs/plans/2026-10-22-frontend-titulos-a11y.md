# Plan: títulos por ruta y verificación de accesibilidad en navegador

| Campo | Valor |
| --- | --- |
| Estado | Listo para PR |
| Fecha | 2026-10-22 |
| Rama | `feat/frontend-titulos-a11y` (rebasada sobre `main` en `92a22f4`) |
| Origen | Lista de pendientes externa, punto 9 |
| Gates | `reviewer-front`: PASS con observaciones (corregidas) |

## 1. Alcance

1. **`<title>` por ruta:**
   - `app/DocumentTitle.tsx` es la ruta raíz y toma el título del `handle` de
     la ruta activa con el formato «Vista · Área · Save a Life».
   - Los títulos son fijos. Nunca llevan IDs, tokens ni datos de la persona,
     porque quedan en el historial y en las pestañas.
   - Un test exige título en toda vista final (salvo las redirecciones).
2. **Verificación en navegador real** (no jsdom), en `npm run dev:frontend`
   :5174.

## 2. Verificación en navegador (2026-10-22)

- **Títulos:**
  - `/donante/perfil` → «Mi perfil · Donante · Save a Life».
  - `/superadmin/solicitudes/<id>` → «Detalle de solicitud · Superadmin · Save
    a Life», sin el ID.
- **SA-05, envío sin decisión:**
  - el foco va al radio «Aprobar»;
  - su `aria-describedby` apunta al error «Elige si apruebas o rechazas la
    solicitud.»;
  - el error del motivo también se muestra.
- **SA-05, Enter real en el motivo:** con texto y la tecla Enter del teclado,
  la solicitud sigue «Pendiente», no hay aviso de aprobación y el foco va al
  radio. Confirma M-2 fuera de jsdom.
- **DON-02, aviso de guardado:**
  - la región `aria-live="polite"` existe vacía desde la carga y es el mismo
    nodo después de guardar;
  - se llena con «Cambios guardados»;
  - no tiene `role=status` ni `role=alert` anidados.

## 3. Fuera de alcance

- Anunciar el cambio de ruta a lectores de pantalla (el `<title>` solo no se
  anuncia en una SPA): se decide junto con el manejo de foco al navegar.
- Prueba con lectores de pantalla reales (NVDA/VoiceOver), que es manual.
- Responsive (320 a 1024), que queda pendiente porque por ahora solo se usa
  escritorio a 1440.

## 4. Bitácora

- 2026-10-22: títulos por ruta y verificación en navegador.
- 2026-10-22: `reviewer-front` (subagente independiente de solo lectura que no
  escribió el código): **PASS con observaciones**. 210/210 tests, ESLint y
  typecheck sin errores; cumple WCAG 2.4.2. El PASS cubre el código y los
  tests del diff, no la verificación en navegador de la sección 2, que hizo
  quien escribió el código.
  - Se corrigió: el test de títulos cubre cualquier hoja (`element`,
    `Component` o `lazy`) y hay un test de cambio de título al navegar.
  - El título de `verificar-identidad` coincide con su `<h1>` («Verifica tu
    identidad»).
  - Se acepta: en `/donante` se ve «Donante · Save a Life» un instante antes de
    redirigir.

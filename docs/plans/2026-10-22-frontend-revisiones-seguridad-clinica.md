# Plan: correcciones de las revisiones de seguridad y clínica del frontend

| Campo | Valor |
| --- | --- |
| Estado | Listo para PR |
| Fecha | 2026-10-22 |
| Rama | `fix/frontend-revisiones-seguridad-clinica` (desde `main` en `2371c9c`) |
| Origen | Lista de pendientes externa (punto 10) y gates de AGENTS.md |
| Gates | `security-privacy-auditor` y `clinical-safety-reviewer` (re-revisión), `reviewer-front` |

## 1. Revisiones ejecutadas sobre `main` en `2371c9c`

Las dos son subagentes independientes de solo lectura y ninguno escribió el
código.

### `security-privacy-auditor`

**Prototipo sin backend: PASS.** 0 Critical y 0 High. Despliegue: BLOCKED.

- **Deuda conocida que bloquea el despliegue:**
  - High: sin guard de sesión, AAL2 ni rol.
  - Medium: datos demo en el bundle.
  - Falta el cliente HTTP con CSRF y sesión.
- **M-1:** no existe `/invitacion-administrador`. El token del correo queda en
  la dirección y en el historial (cae en SYS-01, que no lo limpia).
- **M-2:** Enter en el motivo de SA-05 aprueba la solicitud.
- **M-3:** el hosting no define cabeceras de seguridad (CSP,
  `frame-ancestors`, `Referrer-Policy`, `no-store` en rutas con token).
- **L-1:** riesgo residual del fragmento en el historial global y en las
  extensiones. No se puede mitigar desde el cliente.
- **L-2:** el token irá en el path de la API, así que hace falta redactarlo en
  los logs.
- **L-3:** los motivos de texto libre pueden llevar PII.
- **Info:** `maxLength` 9 del código de step-up.

### `clinical-safety-reviewer`

**PASS.** Sin bloqueantes ni severidad alta.

- **Medio M1:** falta el aviso «el hospital verifica identidad, grupo y
  elegibilidad» en el detalle de invitación y en LINK-01.
- **Medio M2:** «Grupo requerido» es ambiguo sobre la dirección
  donante→receptor; la columna de confirmados debe decir «Grupo declarado».
- **Medio M3:** aprobar una corrección de grupo no es verificarlo. Además falta
  la regla del efecto sobre invitaciones vigentes.
- **Bajos:**
  - B1: «Crítica» sin «· informativa» en listas.
  - B2: la portada no dice quién verifica.
  - B3: «verificados» debe ser «autorizados».
  - B4: columna «Grupo».
  - B5: aviso hospitalario hipotético.
  - B6: fechas de demo incoherentes.
  - B7: la demo no invalida invitaciones al marcarse no disponible.

## 2. Alcance de esta rama

1. **M-1:**
   - vista `/invitacion-administrador#token` con vista previa
     (`getHospitalAdminInvitationPreview`) y reclamo con contraseña nueva
     (`claimHospitalAdminInvitation`), que luego lleva a MFA;
   - limpieza del fragmento también en SYS-01, para que ninguna ruta sin
     consumidor deje el token en la dirección.
2. **M-2:** la decisión se elige con un control explícito obligatorio y hay un
   solo botón de envío.
3. **Clínica:** M1, M2, M3 (solo el aviso) y B1 a B7.
4. **Info:** `maxLength` 8 en el código de step-up.

## 3. Fuera de alcance y decisiones abiertas

- **Guard de sesión, datos demo fuera del build y cliente HTTP/CSRF:** van con
  el slice de estados y cliente (punto 5) o con D-4.
- **M-3, cabeceras del hosting:** se configuran con el despliegue. Falta
  definir quién lo hace.
- **L-1:** riesgo aceptado. Se mitiga con tokens de un solo uso y corta
  duración, y con una vista previa que no consume el token.
- **L-2:** al crear el cliente HTTP, usar `cache: 'no-store'` y
  `referrerPolicy: 'no-referrer'`, y no registrar URLs; la redacción de
  `:token` en los logs del backend le corresponde al backend.
- **L-3:** revisar los motivos en la política de retención.
- **Decisión de dominio pendiente (M3):** qué pasa con las invitaciones y
  confirmaciones vigentes cuando se corrige el grupo declarado. La deciden la
  persona usuaria y el responsable del backend.

## 4. Bitácora

- 2026-10-22: revisiones ejecutadas y alcance aprobado por la persona usuaria.
- 2026-10-22: M-1 (`3306440`), M-2 con M3 y `maxLength` 8 (`4af03a3`) y
  clínica M1, M2 y B1 a B7 (`7f8f265`).
- 2026-10-22: re-revisión con tres subagentes independientes de solo lectura
  que no escribieron el código:
  - **`security-privacy-auditor`: PASS con observaciones.** M-1 y M-2
    cerrados, sin Critical/High/Medium nuevos.
    - Low: el fragmento se borra en `useEffect`, tras el primer render. Con
      backend, conviene borrarlo antes de montar el router.
  - **`clinical-safety-reviewer`: PASS con observaciones.** M1, M2, el aviso
    M3 y B1 a B7 cerrados, sin texto que implique aptitud, cita ni grupo
    verificado.
    - O1: la ayuda de HOS-02 debe hablar de compatibilidad.
    - O2: «instituciones verificadas» en SA-02.
  - **`reviewer-front`: PASS con observaciones.** 202/202 tests, ESLint y
    typecheck sin errores.
    - `aria-describedby`/`aria-invalid` del fieldset no llegan al radio.
    - El test de Enter no comprobaba el botón único sin `value`.
    - Info: el vencimiento de la demo de invitación de administrador es una
      fecha pasada.
- 2026-10-22: se corrigieron O1, O2, el `aria-describedby` en cada radio
  (`aria-invalid` no aplica al rol radio) y el test del botón único. Se acepta
  la fecha de demo de la invitación de administrador, coherente con el resto de
  los datos sintéticos (septiembre de 2026). Queda pendiente el borrado
  temprano del fragmento, que va con el cliente HTTP (punto 5 / D-4).

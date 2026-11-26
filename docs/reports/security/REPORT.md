# Informe de auditoría de seguridad — Save a Life (run-1)

Fecha: 2026-11-25. Herramienta: skill `security-audit` de Cloudflare (`cloudflare/security-audit-skill`, commit `c1c8a8c`), modo auditoría completa.

## 1. Alcance y condiciones de la pasada

- **Perfil:** `quick`. Es una **pasada parcial**: hubo una sola ola de cazadores y un crítico de cobertura final. Lo que el crítico encontró quedó `deferred` y no se revisó.
- **Alcance:** `backend/`, `frontend/`, `apps/web`, `apps/mock-api`, `scripts/`, `.github/`, `docs/openapi.json` y `package.json`.
- **Revisión de origen:** commit `156e34c` en la rama `feat/mapa-ubicacion-y-buzon-dev`. El árbol tenía cambios sin commit (dos documentos y `skills-lock.json`), pero ninguno es código revisado.
- **Ejecución:** solo código fuente y comprobaciones locales.
  - Todo lo que ejecutó código del repositorio corrió en un sandbox `bwrap`:
    - sin red;
    - con el entorno vacío;
    - con el repositorio y el toolchain en solo lectura;
    - con escritura solo en un `scratch` por agente;
    - con límites de CPU, memoria, procesos y tiempo (`prlimit`).
  - Las evidencias se promovieron con un copiador que no sigue enlaces (`O_NOFOLLOW`).
  - **No se ejecutó** nada contra Supabase (ni local ni remoto), ni contra Resend, Vercel o Render, ni `npm audit`, ni pgTAP.
- **Ejecuciones previas:** no había. Esta es la primera, así que no hay hallazgos arrastrados ni revalidaciones.
- **Presupuesto:** 20 invocaciones de agente; se gastaron 11.
  - 4 de reconocimiento.
  - 6 cazadores.
  - 1 crítico.
- **Desviación del procedimiento (importante):** la skill pide verificar cada candidato (fases 3 y 5) con un agente nuevo e independiente.
  - El modo auto no pudo revisar el lanzamiento de esos verificadores, porque un hook (context-mode) modifica el prompt de los subagentes.
  - Por decisión del usuario, **la verificación la hizo el agente coordinador**. Releyó todas las líneas citadas y corrigió dos referencias.
  - El coordinador no cazó esos candidatos, pero tampoco es un revisor "fresco".
  - Por eso `run-metadata.json` marca la ejecución como `incomplete` (`independent_verification_unavailable_parent_verified`).
- **Otra adaptación:** los prompts de cazadores y verificadores se entregaron como ficheros generados con los bloques literales de la skill. Los agentes los leyeron completos; no se les pasaron solo los nombres de los bloques.

## 2. Postura de seguridad

En esta pasada no se **confirmó** ninguna vulnerabilidad. El backend tiene controles sólidos y coherentes en todas sus capas:
- cookies `__Host-`;
- CSRF con HMAC ligado a la sesión;
- JWT verificado con JWKS;
- MFA/AAL2 y step-up repetidos en Express y en SQL;
- RLS y RPC con `app.require` en las 89 funciones `api.*`;
- tenant del hospital resuelto siempre en SQL;
- webhook Svix verificado antes de parsear;
- outbox cifrado con AES-GCM;
- HTML de correo escapado.

Quedan **tres pistas `needs_validation`**. Cada una tiene una traza de código real, pero confirmarla necesita la base de datos o el despliegue (sección 4). Además hay 27 notas de hardening.

## 3. Hallazgos confirmados

| Severidad | Título | Frontera | Resultado observado |
|---|---|---|---|
| — | Ninguno | — | — |

## 4. NEEDS VALIDATION (sin severidad: no son vulnerabilidades confirmadas)

| # | Pista | Traza | Bloqueador | Siguiente paso local | Comprobación del dueño |
|---|---|---|---|---|---|
| 1 | Cambiar el correo de un donante no invalida los tokens de recuperación ya enviados a la dirección antigua | `donor-records.router.ts:101` → `donor-records-service.ts:228` → `donor_records.sql:742` (`consume_email_change`) → `action_tokens.sql:310` → `action-tokens.router.ts:68` → `worker_auth_purges.sql:167` (`consume_password_reset`) | No se puede ejecutar SQL en esta pasada. Además falta saber si el buzón viejo deja de ser de confianza tras una corrección | En Supabase local con datos sintéticos: pedir una recuperación, cambiar el correo y consumir el token antiguo. Se espera `ok`; el arreglo debe devolver `gone` | Decidir si una corrección de correo revoca la autoridad del buzón viejo. Si es así, invalidar los tokens `recuperacion` en `consume_email_change` |
| 2 | La cobertura distingue 0 de 1–4, y con radio y tipo de sangre elegidos por el admin eso revela la banda de 1 km del donante compatible más cercano | `invitations.router.ts:65` → `invitations-service.ts:63` → `need_coverage.sql:33/89/135`, con `coverage_bucket` en `:17` | No se puede ejecutar SQL. Falta saber si el riesgo residual que acepta ADR-008 cubre la banda de distancia de una sola persona | Sembrar un donante O- a unos 3,4 km y crear borradores de 3 y 4 km. Se espera `0` frente a `null` | Política: fusionar 0 con «menos de 5», o aplicar el tope por hospital |
| 3 | Los tokens de un solo uso viajan en la ruta de la URL de la API (Vercel → Render), lo que anula el diseño de «solo en el fragmento» | `useFragmentToken.ts:17` → `lib/api/auth.ts:112` → `vercel.json:5` → `action-tokens.router.ts:41` | Hechos del despliegue: si Vercel o Render registran rutas completas, durante cuánto tiempo y quién puede leerlas | Por código: las 9 operaciones `{token}` de `docs/openapi.json` envían el token en la ruta | En staging, enviar un marcador sintético y buscarlo en los logs. Si aparece, mover el token al cuerpo o a una cabecera |

El detalle de cada pista está en [NEEDS-VALIDATION.md](NEEDS-VALIDATION.md).

## 5. Notas de hardening (no son hallazgos)

**Autenticación y sesión**
- `config.toml` deja abiertos `enable_signup=true`, `enable_confirmations=false` y `secure_password_change=false`, y la clave anon es pública. Por eso se puede registrar y cambiar la contraseña directamente en GoTrue, sin pasar por los límites del backend. Hay que revisar la configuración del proyecto alojado. El crítico abrió una unidad para esto y quedó diferida.
- `verifyMfa` usa `listTotpFactors()[0]` (`auth-service.ts:184`). No tiene impacto mientras `max_enrolled_factors=1`.
- `parseClaims` no comprueba `exp` por su cuenta; delega en auth-js.
- El step-up va ligado a la sesión (300 s), no a cada operación. Así lo define ADR-004.
- `api.current_actor` no comprueba `session_admitted()`. Por eso `GET /auth/session` y `/auth/csrf-token` aceptan una sesión no admitida. Las RPC de datos sí la rechazan.

**Autorización y datos**
- `api.list_own_hospital_sites` usa `member_hospital_id()` en lugar de `admin_hospital_id()`. Expone las sedes públicas del propio hospital aunque esté desautorizado. Solo es alcanzable por PostgREST directo.
- Las políticas RLS de SELECT del superadmin no exigen AAL2. Solo son alcanzables a través de `api.*`, que sí lo exige.
- Las celdas y anillos de cobertura también se pueden comparar entre borradores. Es un riesgo aceptado en ADR-008.
- `change_own_invitation_response` permite confirmar mientras la eliminación propia está `en_ejecucion`.
- Corregir `declaredBloodType` no revisa las invitaciones abiertas.
- `audit_events` conserva el uid del donante eliminado junto a la invitación hasta la purga final.
- La purga final de RNF-PRV-02 (final_demo + 30 días) no está implementada. Figura como pendiente en el plan.

**Disponibilidad y cuotas**
- Unos 15 IP o prefijos /64 pueden agotar el techo global `authquota:login` (50 cada 5 min). Es el riesgo O1 aceptado en ADR-004.
- `authquota:refresh` (80 cada 5 min) se consume con cookies de refresh falsas pero bien formadas. Unos 8 IP pueden impedir que las sesiones vivas se renueven, lo que contradice lo que espera ADR-004. Conviene cobrar el bucket global solo tras un refresh correcto.
- `login:email` permite bloquear el login de una víctima concreta. Es el compromiso habitual.
- El webhook mantiene `inflate` activado. El coste está acotado porque el HMAC se comprueba antes de parsear.

**Correo**
- Los nombres de hospital y sede van sin escapar en la parte `text/plain`. Solo los fija el superadmin.

**Cliente, CI y desarrollo**
- `frontend/vercel.json` mezcla `routes` con `rewrites` y `headers`. Según el cazador, Vercel rechaza esa combinación. Hay que confirmar que en el despliegue se aplican la CSP, XFO y `x-edge-secret`.
- `security.yml` fija las actions por tag, no por SHA, y no usa `persist-credentials: false`.
- El `Dockerfile` fija `node:24.19.0-slim` por tag, sin digest.
- `vitepress/node_modules/esbuild@0.21.5` tiene un install script bloqueado por `allowScripts`.
- `scripts/dev-mailbox.mjs` no envía `frame-ancestors`. Afecta solo al loopback de desarrollo.
- `frontend/package.json` usa `^` en `leaflet` y `@types/leaflet`.
- `.gitignore` no cubre `*.pem`, `*.key` ni `credentials.json`.
- `VITE_MAPBOX_TOKEN` va en el bundle. Debe ser un token `pk` con restricción de URL.
- La detección de producción depende de `NODE_ENV=production` o `RENDER`. En otro host sin esas variables se permitiría el proveedor fake y un secreto de edge vacío.
- No se pudo comprobar el estado de CVE de las dependencias sin red. Hay que ejecutar `npm run audit:production` o revisar el job de `security.yml`.

**Patrones positivos verificados**
- Tokens de 256 bits de CSPRNG, guardados como SHA-256 y comparados en tiempo constante.
- Claves HMAC separadas por propósito.
- AES-256-GCM con AAD igual al id del outbox, sin vuelta a texto plano.
- Errores públicos genéricos y logger con lista cerrada de campos.
- Sin CORS, sin redirecciones abiertas y sin `dangerouslySetInnerHTML`.
- CSP con `script-src 'self'` y `frame-ancestors 'none'`.
- CI con permisos de solo lectura y sin `pull_request_target`.
- Funciones de desarrollo (buzón, `/__mock/reset`, selectores DEV) bloqueadas en producción.
- Tests unitarios ejecutados en el sandbox: crypto, edge y env (85/85), guards y authenticate (29/29), plantillas y outbox (161), generador de contrato y buzón (40/40).

## 6. Cobertura (del ledger)

| Estado | Unidades |
|---|---|
| covered | 7 |
| candidate (las 3 pistas de la sección 4) | 3 |
| blocked | 1 |
| deferred | 2 |

- **Blocked:** «Obvious things». El estado de CVE de las dependencias necesita una base de avisos en red.
- **Deferred:**
  - (a) Las RPC técnicas `link_assisted_account` y `link_donor_account`. El cazador h1 las marcó como no cubiertas y el crítico pidió reasignarlas.
  - (b) Acceso directo a GoTrue con la clave anon (signup, user, recover, factors) como ruta paralela al cambio de correo, la recuperación, la barrera y el MFA. La añadió el crítico.
- **Excluidas:**
  - Memoria nativa: no hay código nativo.
  - IA/LLM: no hay funciones de modelo.
  - Escritorio/móvil/IPC: no hay app nativa.
  - Cloud: solo existen `render.yaml` y `vercel.json`; los hechos de despliegue se tratan como `needs_validation`.
- **Resultado del crítico final:** `stop=false`, con 1 unidad nueva y 1 reasignación. Ambas se registraron como `deferred` (`quick_profile_final_critic`). **No se afirma cobertura completa.** Una pasada `standard` debería empezar por esas dos unidades diferidas.

Artefactos en esta carpeta:
- `findings.json` (validado con `validate-findings.cjs`);
- `coverage-ledger.json` (validado con `validate-coverage-ledger.cjs`);
- `architecture.md`;
- `run-metadata.json`;
- [FINDINGS-DETAIL.md](FINDINGS-DETAIL.md);
- [NEEDS-VALIDATION.md](NEEDS-VALIDATION.md).

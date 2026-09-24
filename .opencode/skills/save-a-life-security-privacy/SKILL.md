---
name: save-a-life-security-privacy
description: Aplica privacidad y seguridad a datos de donantes, Supabase Auth, RLS, geolocalizacion, hospitales y emails de Save a Life. Usar en esquemas, endpoints, politicas, logs, integraciones o revisiones de acceso.
---

# Seguridad y privacidad de Save a Life

Combina esta skill con `security-and-hardening`.

## Flujo obligatorio

1. Inventaria campos y clasificalos: publico, interno, PII o sensible.
2. Declara proposito, actor autorizado, precision, retencion y eliminacion.
3. Dibuja limites de confianza entre navegador, API, Supabase y proveedor email.
4. Ejecuta STRIDE y escribe casos de abuso por rol.
5. Diseña controles en servidor y RLS; despues diseña la interfaz.
6. Agrega pruebas negativas de acceso y evidencia de auditoria.

## Politicas minimas

- `auth.uid()` nunca basta por si solo: valida rol, hospital y propiedad del
  recurso.
- El `service_role` de Supabase solo vive en backend y nunca llega al navegador.
- Las consultas del hospital deben estar limitadas por `hospital_id` derivado de
  la identidad, no aceptado ciegamente desde el cliente.
- Las respuestas API usan allowlists y no exponen entidades completas.
- No reveles listas de emails, coordenadas exactas ni tipos de sangre entre
  donantes.
- Evita coordenadas exactas en paneles si una distancia o zona aproximada cumple
  el proposito.
- Audita cambios de roles, hospitales, necesidades, envios y respuestas con IDs
  opacos; no guardes cuerpos completos ni secretos.
- Tokens de confirmacion son aleatorios, de un solo uso, con expiracion y ligados
  a una invitacion y accion concretas.
- Limita intentos en login, recuperacion, publicacion, confirmacion y reenvio.
- Define exportacion, correccion y eliminacion antes de almacenar datos reales.

## Email seguro

- Contenido minimo: hospital verificado, llamado general, vencimiento y enlace.
- No incluyas nombre de paciente, diagnostico, listas de donantes ni ubicacion del
  donante.
- No registres el contenido completo del correo ni direcciones sin redaccion.
- Verifica webhooks del proveedor y valida sus respuestas como entrada hostil.

## Bloqueos de salida

No apruebes una funcionalidad si falta aislamiento por rol/recurso, hay secretos
en cliente, se registra PII, no existe retencion o se afirma cumplimiento legal
sin revision competente para Peru.

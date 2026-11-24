# ADR-008: Publicar e invitar y cobertura agregada

## Estado

Aceptado el 2026-11-23 (decisión de la persona usuaria en la sesión de revisión de las características 3 y 10).

## Fecha

2026-11-23

## Contexto

La especificación (§B.3 de `docs/plans/2026-10-12-especificacion-faltante-backend.md`) fijaba «lotes solo manuales»:
publicar una necesidad (`transitionOwnHospitalNeed` a `activa`) y pedir invitaciones (`requestInvitationBatch`) eran dos
pasos separados del admin. La persona usuaria pidió que, al publicar, las invitaciones salgan a los donantes
compatibles más cercanos sin un paso aparte, y que el hospital vea de un vistazo cuántos hay y dónde, sin romper
RF-VIS-01/02 (el hospital nunca ve la ubicación, la distancia, el nombre ni el id de una persona antes de que confirme).

## Decisión

1. **Publicar e invitar en una sola acción de la interfaz.** El frontend encadena las dos operaciones ya ratificadas con
   la sesión y el AAL2 del mismo admin: primero `transitionOwnHospitalNeed` a `activa` y, si funciona,
   `requestInvitationBatch`. Cada una lleva su propia `Idempotency-Key`. Aplica a «Publicar e invitar» en la pantalla de
   creación y en el detalle de un borrador.
   - No hay actor de sistema, ni trigger, ni envío sin una acción del admin.
   - No cambian la RPC, el grant de un solo uso de 2 minutos (H1), la cuota de 3 invitaciones por donante cada 24 h, los
     techos de abuso ni la auditoría (`lote.autorizado`, `lote.solicitado`).
   - «Guardar borrador» no pide ningún lote. «Solicitar lote» se conserva para reintentar o pedir más lotes.
   - Si la activación funciona y el lote falla, la necesidad queda activa (no se deshace nada): la interfaz lo dice y
     remite a «Lotes de invitación». La excepción de B.3 es solo esta.
2. **Cobertura agregada (`getNeedCoverage`).** `GET /api/v1/hospitals/me/needs/{needId}/coverage`, módulo
   `invitation-coordination`, ratificada el 2026-11-23. Devuelve la sede, el radio, `compatibleCount`, `nextBatchCount`,
   grupos de anillos hasta el radio (cuatro anillos iguales de radio/4, fusionados) y celdas de rejilla de 0,01° (~1,1 km) con
   su centro y su conteo.
   - Mismos filtros que el lote real (`app.invitation_candidates`): grupo compatible por la matriz RBC, perfil activo y
     disponible, polígono `DEMO_ONLY-1`, radio con borde incluido, sin invitación previa a la necesidad, sin eliminación en
     ejecución y cuota 3/24 h. `request_invitation_batch` no se modificó; una prueba pgTAP comprueba la paridad.
   - **Supresión k-anónima (k = 5) y cubos gruesos en todo lo que se devuelve:** una celda con menos de 5 donantes no se
     devuelve; los anillos contiguos se fusionan hasta que cada grupo tiene al menos 5 (con radio de 1 km un anillo mide 250 m);
     todo conteo sale en un cubo hacia abajo (0, 5, 10 o 25, «al menos N») y `null` significa «menos de 5». Nunca hay ids,
     nombres, posiciones ni distancias individuales. La primera versión usaba k = 3 y conteos exactos; la revisión independiente
     del 2026-11-23 mostró que restando lecturas de borradores con radios, grupos o sedes distintos se podía aislar a una persona.
   - **Tope por administrador:** 20 consultas por hora (429 `RATE_LIMITED`), con el limitador compartido y un sujeto HMAC.
     La sede debe estar activa y aprobada (si no, 409), como al publicar.
   - Admin hospitalario con AAL2; una necesidad ajena es indistinguible de una inexistente (404); solo borrador o activa
     (otro estado, 409); `Cache-Control: no-store`. Función `SECURITY DEFINER` `api.get_need_coverage` (ADR-003 ítem 6),
     añadida a la lista cerrada de funciones DEFINER de la prueba pgTAP 02.
3. **Mapa.** Leaflet con teselas de OpenStreetMap, cargado de forma diferida (solo al abrir una necesidad). Se dibujan la
   sede, el radio y las celdas; no hay pines individuales. La tabla de anillos dice lo mismo para quien no pueda usar el mapa.
   La CSP del frontend permite `img-src https://tile.openstreetmap.org`.

## Alternativas descartadas

- **Hook en el backend que invoque el lote al activar:** obliga a cambiar la respuesta del `PATCH` ya ratificado para
  informar del lote y mezcla dos operaciones con grants distintos.
- **Disparo 100 % automático por un actor de sistema (trigger o worker):** cambia la regla «solo manuales», exige un actor
  técnico en la auditoría y retira al admin de la decisión de invitar.
- **Pines individuales de donantes en el mapa:** contradice RF-VIS-01/02 y el modelo de privacidad; exigiría reescribirlos.
- **Mapbox GL JS:** más pesado y exige workers `blob:` en la CSP.

## Consecuencias

- La activación puede quedar sin lote si falla el segundo paso (red, 409 por cupo agotado, 429): no es atómico. Se
  mitiga con el aviso explícito y con el botón manual.
- Tras un lote, los invitados dejan de ser candidatos: la cobertura mostrará «sin invitar» y puede bajar a cero.
- Riesgo residual aceptado: restar las celdas visibles al grupo de anillos revela que existen 1 o 2 donantes en celdas
  suprimidas dentro de ese grupo (de 3 o más), nunca su posición.
- Riesgo residual, **reducido pero no eliminado**: con cubos de 5/10/25, k = 5 y 20 consultas por hora por administrador, comparar
  lecturas de borradores distintos ya no da conteos exactos, pero un admin persistente con varias sedes y grupos puede seguir
  acotando zonas de forma gruesa. No hay auditoría específica de cada consulta (la función es `stable`); pendiente si se quiere
  detectar sondeos. El tope es por administrador, no por hospital.
- Las teselas de OpenStreetMap envían al proveedor el área consultada y el origen (`Referer` limitado al origen); no se
  envía ningún dato de personas. Para tráfico real conviene un proveedor de teselas con contrato.
- La migración `20261123000000_need_coverage.sql` sube la versión esperada del esquema: `readiness` responde 503 contra un
  Supabase al que aún no se aplicó (`supabase db push`).

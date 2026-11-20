-- invitation-coordination (F6-5a): el reclamo del worker añade, solo para `invitacion`, los nombres públicos de hospital y sede.
-- Contrato: docs/plans/2026-10-22-f6-contrato-reconciliado.md D1. El payload sellado lleva únicamente los dos tokens; los datos de
-- presentación salen siempre vigentes de la base al enviar. Decisión: solo dos campos (sin dirección ni coordenadas de la sede),
-- porque el correo no los usa y la matriz de datos del correo debe ser mínima.

create or replace function api.worker_claim_due_outbox(p_limit int default 10) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_items jsonb;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_limit is null or p_limit not between 1 and 50 then return jsonb_build_object('kind', 'invalid'); end if;

  -- Un lease vencido con las 6 llamadas gastadas ya no se reintenta.
  update app.email_outbox
  set status = 'fallido', sealed_payload = null, lease_until = null, finalized_at = now(),
      delivery_state = app.advance_delivery(delivery_state, 'fallida')
  where status = 'en_curso' and lease_until <= now() and attempt_count >= 6;

  with due as (
    select o.outbox_id from app.email_outbox o
    where ((o.status = 'pendiente' and o.next_attempt_at <= now()) or (o.status = 'en_curso' and o.lease_until <= now()))
      and o.not_after > now() and o.attempt_count < 6
    order by o.next_attempt_at, o.outbox_id
    limit p_limit
    for update skip locked
  ), claimed as (
    update app.email_outbox o
    set status = 'en_curso', lease_until = now() + interval '120 seconds', attempt_count = o.attempt_count + 1
    from due where o.outbox_id = due.outbox_id
    returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'outboxId', c.outbox_id, 'kind', c.kind, 'sealedPayload', c.sealed_payload, 'attemptNo', c.attempt_count,
           'idempotencyKey', c.idempotency_key, 'notAfter', app.iso(c.not_after),
           'recipient', app.user_email(c.recipient_user_id)
         ) || case when c.kind = 'invitacion' then
           -- Solo nombres públicos de hospital y sede (D1): el payload sellado lleva únicamente secretos.
           coalesce((select jsonb_build_object('display', jsonb_build_object('hospitalName', h.public_name, 'sitePublicName', s.public_name))
                     from app.invitations i
                     join app.needs n on n.need_id = i.need_id
                     join app.hospitals h on h.hospital_id = n.hospital_id
                     join app.sites s on s.site_id = n.site_id
                     where i.current_outbox_id = c.outbox_id), '{}'::jsonb)
         else '{}'::jsonb end
         order by c.next_attempt_at, c.outbox_id), '[]'::jsonb)
    into v_items
  from claimed c;

  return jsonb_build_object('kind', 'ok', 'items', v_items);
end;
$$;

insert into app.schema_version (version) values ('20261022070000');

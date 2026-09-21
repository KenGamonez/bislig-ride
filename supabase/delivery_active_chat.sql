-- Bislig Ride: Pa-Deliver active-trip chat (additive, idempotent).
-- Run this file in the Supabase SQL editor.
--
-- Scope (active-trip messaging only):
--
--   Redefines public.send_delivery_message so the sender and driver can
--   communicate throughout the ACTIVE delivery workflow — not only after
--   completion. A message may be sent whenever a driver is assigned
--   (assigned, quoted, confirmed, driver_on_way, driver_arrived, picked_up,
--   in_transit, delivered). Unassigned bookings (pending, dispatching, or
--   driver_id NULL) still cannot be messaged.
--
-- What this changes (minimum required):
--
--   - The status gate in send_delivery_message: was `status <> 'delivered'`
--     reject; now requires driver_id IS NOT NULL instead of a specific
--     status. The delivered-only behavior is preserved as a subset.
--
-- What this does NOT change:
--
--   - Same function name and signature: existing callers work unchanged.
--   - Same SECURITY DEFINER posture, search_path, and EXECUTE grants.
--   - Same dual authorization: passenger access-token match, or assigned
--     active driver from auth.uid(). The role argument still grants nothing.
--   - Same message validation (trimmed 1..1000 chars).
--   - list_delivery_messages already has no status gate; untouched.
--   - No RLS policy changes. No table GRANT changes. No new tables.
--   - No dispatch, lifecycle, proof, rating, fare, GPS, or Ride Now changes.

create or replace function public.send_delivery_message(
  p_delivery_id uuid,
  p_access_token uuid,
  p_sender_role text,
  p_message text
)
returns public.delivery_messages
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_delivery public.deliveries;
  v_driver_id uuid;
  v_actual_role text;
  v_text text;
  v_row public.delivery_messages;
begin
  if p_delivery_id is null or p_sender_role is null or p_message is null then
    raise exception 'Delivery reference, sender role, and message are required.';
  end if;

  if p_sender_role not in ('passenger', 'driver') then
    raise exception 'Delivery reference, sender role, and message are required.';
  end if;

  v_text := trim(both from p_message);

  if char_length(v_text) < 1 or char_length(v_text) > 1000 then
    raise exception 'Messages must be between 1 and 1000 characters.';
  end if;

  select * into v_delivery
    from public.deliveries
   where id = p_delivery_id;

  if not found then
    raise exception 'Delivery not found. Check your delivery reference and try again.';
  end if;

  -- Active-trip conversation: allowed once a driver is connected, across
  -- every assigned lifecycle state including delivered.
  if v_delivery.driver_id is null then
    raise exception 'Messages can only be sent once a driver has accepted this delivery.';
  end if;

  select d.id into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active';

  if p_sender_role = 'driver' then
    -- The role argument selects which proof is required; it grants nothing.
    if v_driver_id is null or v_delivery.driver_id is distinct from v_driver_id then
      raise exception 'You are not authorized to send messages for this delivery.';
    end if;

    v_actual_role := 'driver';
  else
    if p_access_token is null or v_delivery.access_token is distinct from p_access_token then
      raise exception 'Delivery not found. Check your delivery reference and try again.';
    end if;

    v_actual_role := 'passenger';
  end if;

  insert into public.delivery_messages (delivery_id, sender_role, message)
  values (v_delivery.id, v_actual_role, v_text)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.send_delivery_message(uuid, uuid, text, text) from public;
grant execute on function public.send_delivery_message(uuid, uuid, text, text) to anon, authenticated, service_role;

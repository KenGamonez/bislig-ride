-- Bislig Ride: Pa-Deliver driver fee quote + passenger confirmation.
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Scope (quote/confirm only — assigned driver quotes, passenger confirms):
--
--   Normal fee flow (single final fee, no negotiation, no bidding):
--
--     DRIVER ACCEPTS → DRIVER ENTERS FEE → quoted → PASSENGER CONFIRMS
--     → confirmed → driver_on_way → driver_arrived → picked_up
--     → in_transit → delivered (proof flow, unchanged)
--
--   1. Status values 'quoted' and 'confirmed' are added to the deliveries
--      status CHECK (every pre-existing value is preserved; existing rows
--      already satisfy the widened constraint).
--
--   2. public.set_delivery_driver_price(p_delivery_id uuid,
--      p_price_cents integer) [SECURITY DEFINER]
--      Mirrors set_pakyawan_driver_price: the assigned active driver (session
--      identity only, no driver_id parameter) sets a positive fee exactly
--      once while status is 'assigned'. Writes only price_cents +
--      status ('assigned' → 'quoted') + updated_at.
--
--   3. public.confirm_delivery_quote(p_delivery_id uuid,
--      p_access_token uuid) [SECURITY DEFINER]
--      Mirrors confirm_pakyawan_booking: the anonymous passenger confirms
--      with the existing per-booking access token. Requires status
--      'quoted' with a positive price; atomically moves quoted → confirmed.
--      No customer account required; the token model stays the sole customer
--      authorization path.
--
--   4. public.advance_delivery_status(...) is redefined narrowly (same
--      security posture, grants, and proof protections as
--      delivery_proof.sql): 'confirmed' → 'driver_on_way' replaces
--      'assigned' → 'driver_on_way', and assigned/quoted rows can no longer
--      advance at all. 'delivered' stays reachable ONLY through
--      complete_delivery_with_proof(); the generic advancer still cannot
--      produce it.
--
-- What this does NOT change:
--
--   - No pull/accept RLS changes. No table GRANT changes. No dispatch,
--     offer, redispatch, worker, trigger, scheduler, chat, rating, or
--     cancellation changes. No customer cancellation RPC (none exists).
--   - No Ride Now or Pakyawan changes of any kind.
--   - No anonymous SELECT policy. No DELETE grants. No GRANT ALL.

-- ---------------------------------------------------------------------------
-- 1. Widen the deliveries status CHECK with quoted/confirmed.
--
--   Exact-name replacement (no expression matching): the live constraint is
--   named deliveries_status_check, but PostgreSQL deparses its expression
--   as CHECK ((status = ANY (ARRAY[...]))) rather than the original
--   "status in (...)" text, so definition-text pattern matching
--   cannot reliably find it. Dropping by exact name is deterministic, and
--   re-adding is safe on reruns because every existing row already
--   satisfies the widened (superset) value set.
-- ---------------------------------------------------------------------------

alter table public.deliveries
  drop constraint if exists deliveries_status_check;

alter table public.deliveries
  add constraint deliveries_status_check check (status in (
    'pending',
    'dispatching',
    'quoted',
    'confirmed',
    'assigned',
    'driver_on_way',
    'driver_arrived',
    'picked_up',
    'in_transit',
    'delivered',
    'cancelled',
    'no_driver',
    'failed'
  ));

-- ---------------------------------------------------------------------------
-- 2. Driver fee submission: assigned → quoted (once, positive fee only).
-- ---------------------------------------------------------------------------

create or replace function public.set_delivery_driver_price(p_delivery_id uuid, p_price_cents integer)
returns setof public.deliveries
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_driver_id uuid;
  v_delivery public.deliveries;
begin
  -- Driver identity comes from the session only. There is no driver_id
  -- parameter, so pricing another driver's delivery is structurally impossible.
  select d.id
    into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active';

  if v_driver_id is null then
    raise exception 'You are not authorized to price this delivery.'
      using errcode = '42501';
  end if;

  if p_delivery_id is null then
    raise exception 'A delivery id is required.';
  end if;

  if p_price_cents is null then
    raise exception 'A delivery fee is required.';
  end if;

  if p_price_cents <= 0 then
    raise exception 'Please enter a valid delivery fee.'
      using errcode = 'XX001';
  end if;

  select b.*
    into v_delivery
    from public.deliveries b
   where b.id = p_delivery_id
   for update;

  if not found then
    raise exception 'Delivery not found.';
  end if;

  if v_delivery.driver_id is distinct from v_driver_id then
    raise exception 'This delivery is no longer assigned to you.'
      using errcode = 'XX001';
  end if;

  if v_delivery.status <> 'assigned' then
    if v_delivery.status = 'quoted' or v_delivery.status = 'confirmed' then
      raise exception 'The delivery fee has already been sent.'
        using errcode = 'XX001';
    end if;

    raise exception 'This delivery is no longer waiting for a delivery fee.'
      using errcode = 'XX001';
  end if;

  if v_delivery.price_cents is not null then
    raise exception 'The delivery fee has already been sent.'
      using errcode = 'XX001';
  end if;

  update public.deliveries
     set price_cents = p_price_cents,
         status = 'quoted',
         updated_at = now()
   where id = v_delivery.id;

  return query
    select b.* from public.deliveries b where b.id = v_delivery.id;
end;
$$;

revoke all on function public.set_delivery_driver_price(uuid, integer) from public;
grant execute on function public.set_delivery_driver_price(uuid, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Passenger confirmation: quoted → confirmed (token-gated, atomic).
-- ---------------------------------------------------------------------------

create or replace function public.confirm_delivery_quote(p_delivery_id uuid, p_access_token uuid)
returns public.deliveries
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row public.deliveries;
begin
  if p_delivery_id is null or p_access_token is null then
    raise exception 'Delivery reference and access token are required.';
  end if;

  update public.deliveries
     set status = 'confirmed',
         updated_at = now()
   where id = p_delivery_id
     and access_token = p_access_token
     and status = 'quoted'
     and price_cents is not null
     and price_cents > 0
  returning * into v_row;

  if not found then
    if not exists (select 1 from public.deliveries where id = p_delivery_id and access_token = p_access_token) then
      raise exception 'Delivery not found. Check your delivery reference and try again.';
    end if;

    raise exception 'Only quoted deliveries can be confirmed.';
  end if;

  return v_row;
end;
$$;

revoke all on function public.confirm_delivery_quote(uuid, uuid) from public;
grant execute on function public.confirm_delivery_quote(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Narrow the generic advancer to the quote flow (proof protections kept).
--
--   confirmed     → driver_on_way  (replaces assigned → driver_on_way)
--   driver_on_way → driver_arrived
--   driver_arrived → picked_up
--   picked_up     → in_transit
--
--   assigned and quoted rows can no longer advance through this RPC;
--   assigned → quoted belongs to set_delivery_driver_price() and
--   quoted → confirmed belongs to confirm_delivery_quote(). 'delivered'
--   remains reachable ONLY through complete_delivery_with_proof().
-- ---------------------------------------------------------------------------

create or replace function public.advance_delivery_status(p_delivery_id uuid, p_next_status text)
returns setof public.deliveries
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_driver_id uuid;
  v_delivery public.deliveries;
begin
  select d.id
    into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active';

  if v_driver_id is null then
    raise exception 'Only the assigned driver can update this delivery.'
      using errcode = '42501';
  end if;

  if p_delivery_id is null then
    raise exception 'A delivery id is required.';
  end if;

  if p_next_status is null
    or p_next_status not in ('driver_on_way', 'driver_arrived', 'picked_up', 'in_transit')
  then
    raise exception 'Invalid delivery status.'
      using errcode = 'XX001';
  end if;

  select b.*
    into v_delivery
    from public.deliveries b
   where b.id = p_delivery_id
   for update;

  if not found then
    raise exception 'Delivery not found.';
  end if;

  if v_delivery.driver_id is distinct from v_driver_id then
    raise exception 'This delivery is no longer assigned to you.'
      using errcode = 'XX001';
  end if;

  if v_delivery.status = 'confirmed' and p_next_status <> 'driver_on_way'
    or v_delivery.status = 'driver_on_way' and p_next_status <> 'driver_arrived'
    or v_delivery.status = 'driver_arrived' and p_next_status <> 'picked_up'
    or v_delivery.status = 'picked_up' and p_next_status <> 'in_transit'
  then
    raise exception 'This delivery cannot move to that status right now.'
      using errcode = 'XX001';
  end if;

  if v_delivery.status not in ('confirmed', 'driver_on_way', 'driver_arrived', 'picked_up') then
    raise exception 'This delivery cannot move to that status right now.'
      using errcode = 'XX001';
  end if;

  update public.deliveries
     set status = p_next_status,
         updated_at = now()
   where id = v_delivery.id;

  return query
    select b.* from public.deliveries b where b.id = v_delivery.id;
end;
$$;

revoke all on function public.advance_delivery_status(uuid, text) from public;
grant execute on function public.advance_delivery_status(uuid, text) to authenticated, service_role;

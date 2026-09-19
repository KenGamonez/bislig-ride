-- Bislig Ride: Pakyawan automated platform, PHASE B6 — driver price submission.
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Scope (B6 only — assigned driver submits the final trip price):
--
--   public.set_pakyawan_driver_price(p_booking_id uuid, p_price_cents integer)
--   SECURITY DEFINER RPC implementing the normal price flow:
--
--     DRIVER ACCEPTS → DRIVER ENTERS PRICE → quoted → (B7 customer confirms)
--
--   This is a single final price, not a negotiation: no counter-offers,
--   no mandatory chat, no bidding. Once quoted, this RPC rejects any
--   resubmission (emergency corrections, if ever needed, remain an explicit
--   future admin exception).
--
-- Rules enforced atomically (booking row locked FOR UPDATE):
--
--   - caller is an active driver (identity from auth.uid(); no driver_id
--     parameter, so pricing another driver's booking is impossible)
--   - booking exists
--   - booking.driver_id is the caller (wrong driver / unassigned rejected)
--   - booking.status is exactly 'assigned' (pending, quoted, confirmed,
--     scheduled, trip-day, completed, cancelled all rejected)
--   - price is not null and not negative (zero is allowed: no minimum fare
--     is invented here; cf. existing ₱0 matrix fares)
--
--   On success, exactly price_cents + status ('assigned' → 'quoted') +
--   updated_at change. Customer fields, dates, locations, vehicle fields,
--   driver_id are never touched.
--
-- What this does NOT implement (later phases):
--
--   - No customer price display/confirmation changes (B7).
--   - No trip lifecycle (scheduled/on-way/arrived/start/complete), no chat,
--     no ratings, no cancellation workflow.
--   - No change to admin_quote_pakyawan (kept as emergency/exception path),
--     driver self-assign, dispatch/accept/decline/expire/redispatch, or any
--     customer token RPC.
--   - No RLS policy changes. No table GRANT changes. No Ride Now changes
--     (dispatch core, offers, presence, GPS, fare, ratings, UI untouched).

create or replace function public.set_pakyawan_driver_price(p_booking_id uuid, p_price_cents integer)
returns setof public.pakyawan_bookings
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_driver_id uuid;
  v_booking public.pakyawan_bookings;
begin
  -- Driver identity comes from the session only. There is no driver_id
  -- parameter, so pricing another driver's booking is structurally impossible.
  select d.id
    into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active';

  if v_driver_id is null then
    raise exception 'You are not authorized to price this booking.'
      using errcode = '42501';
  end if;

  if p_booking_id is null then
    raise exception 'A booking id is required.';
  end if;

  if p_price_cents is null then
    raise exception 'A trip price is required.';
  end if;

  if p_price_cents < 0 then
    raise exception 'Please enter a valid trip price.'
      using errcode = 'XX001';
  end if;

  select b.*
    into v_booking
    from public.pakyawan_bookings b
   where b.id = p_booking_id
   for update;

  if not found then
    raise exception 'Pakyawan booking not found.';
  end if;

  if v_booking.driver_id is distinct from v_driver_id then
    raise exception 'This booking is no longer assigned to you.'
      using errcode = 'XX001';
  end if;

  if v_booking.status <> 'assigned' then
    if v_booking.status = 'quoted' then
      raise exception 'The trip price has already been sent.'
        using errcode = 'XX001';
    end if;

    raise exception 'This booking is no longer waiting for a trip price.'
      using errcode = 'XX001';
  end if;

  update public.pakyawan_bookings
     set price_cents = p_price_cents,
         status = 'quoted',
         updated_at = now()
   where id = v_booking.id;

  return query
    select b.* from public.pakyawan_bookings b where b.id = v_booking.id;
end;
$$;

revoke all on function public.set_pakyawan_driver_price(uuid, integer) from public;
grant execute on function public.set_pakyawan_driver_price(uuid, integer) to authenticated, service_role;

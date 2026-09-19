-- Bislig Ride: Pakyawan automated dispatch foundation, PHASES B1+B4.
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Scope:
--
--   1. public.pakyawan_trip_hours(p_trip_type, p_estimated_hours)
--      Centralized Pakyawan duration defaults (hours) used ONLY for
--      scheduling-conflict detection. Supplied estimated_hours wins;
--      otherwise One Way = 2, Round Trip = 4, Whole Day / Private Hire = 8.
--      Does not touch Ride Now fare or trip-duration logic.
--
--   2. public.br_pakyawan_dispatch_core(p_booking_id) [INTERNAL]
--      The single source of truth for Pakyawan eligibility + offer creation.
--      Locks the booking, requires status 'pending', short-circuits when a
--      live offer round already exists (idempotent), otherwise inserts one
--      30-minute 'offered' row per eligible driver at max(dispatch_round)+1
--      and returns the round. Never assigns the booking. Called by the
--      admin wrapper below and by the B4 redispatch worker; never called
--      directly by frontend code.
--
--   3. public.dispatch_pakyawan_booking(p_booking_id)
--      Admin-only SECURITY DEFINER wrapper around the core. Anonymous
--      customers must never be able to dispatch arbitrary bookings.
--
-- Eligibility (existing columns only, no new driver architecture):
--
--   - drivers.status = 'active'
--   - drivers.can_accept_pakyawan = true
--   - drivers.vehicle_capacity IS NOT NULL AND >= booking.passengers
--     (NULL capacity means unverified — never assumed, same rule as Ride Now)
--   - booking.vehicle_preference NULL/empty, or lower(driver.vehicle_type)
--     equals it (canonical types: motorcycle, tricycle, umbak)
--   - no overlapping held Pakyawan booking for that driver on the same
--     booking_date, where held = assigned, quoted, confirmed, scheduled,
--     driver_on_way, driver_arrived, in_progress. Completed/cancelled and
--     unassigned (pending, driver-less quoted) rows never conflict.
--
-- Deliberately NOT required (Pakyawan is scheduled; drivers need not be
-- online now): is_online, is_available, current Ride Now presence/location/
-- ride state.
--
-- What this does NOT implement:
--
--   - No accept/decline RPCs (B2/B3 files), no price proposal, no lifecycle
--     advance, no chat, no ratings, no UI of any kind.
--   - No RLS policy changes. No table GRANT changes (definer RPCs need none;
--     anon/authenticated table privileges stay exactly as they are).
--   - No Ride Now changes (dispatch core, offers, presence, GPS, fare,
--     ratings, UI all untouched).

-- ---------------------------------------------------------------------------
-- 1. Centralized Pakyawan trip-duration defaults (conflict detection only).
-- ---------------------------------------------------------------------------

create or replace function public.pakyawan_trip_hours(p_trip_type text, p_estimated_hours integer)
returns integer
language sql
immutable
as $$
  select coalesce(
    p_estimated_hours,
    case p_trip_type
      when 'One Way' then 2
      when 'Round Trip' then 4
      else 8
    end
  );
$$;

revoke all on function public.pakyawan_trip_hours(text, integer) from public;
grant execute on function public.pakyawan_trip_hours(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Internal dispatch core: eligibility + offer creation (no auth gate).
--    Only invoked by the admin wrapper below and the B4 worker, both of
--    which enforce their own authorization. Never exposed to frontends.
-- ---------------------------------------------------------------------------

create or replace function public.br_pakyawan_dispatch_core(p_booking_id uuid)
returns table (driver_id uuid, offer_id uuid, dispatch_round integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_booking public.pakyawan_bookings;
  v_round integer;
  v_window interval := interval '30 minutes';
begin
  if p_booking_id is null then
    raise exception 'A booking id is required.';
  end if;

  select * into v_booking
    from public.pakyawan_bookings
   where id = p_booking_id
   for update;

  if not found then
    raise exception 'Pakyawan booking not found.';
  end if;

  if v_booking.status <> 'pending' then
    raise exception 'Only pending Pakyawan bookings can be dispatched.';
  end if;

  -- A live round already exists: return it instead of stacking another one.
  if exists (
    select 1 from public.pakyawan_offers o
     where o.booking_id = p_booking_id
       and o.status = 'offered'
       and o.expires_at > now()
  ) then
    return query
      select o.driver_id, o.id, o.dispatch_round, o.expires_at
        from public.pakyawan_offers o
       where o.booking_id = p_booking_id
         and o.status = 'offered'
         and o.expires_at > now()
       order by o.driver_id;
    return;
  end if;

  select coalesce(max(o.dispatch_round), 0) + 1 into v_round
    from public.pakyawan_offers o
   where o.booking_id = p_booking_id;

  insert into public.pakyawan_offers (
    booking_id, driver_id, dispatch_round, status, offered_at, expires_at
  )
  select
    p_booking_id,
    d.id,
    v_round,
    'offered',
    now(),
    now() + v_window
  from public.drivers d
  where d.status = 'active'
    and d.can_accept_pakyawan = true
    and d.vehicle_capacity is not null
    and d.vehicle_capacity >= v_booking.passengers
    and (
      v_booking.vehicle_preference is null
      or v_booking.vehicle_preference = ''
      or lower(d.vehicle_type) = lower(v_booking.vehicle_preference)
    )
    and not exists (
      select 1
        from public.pakyawan_bookings b2
       where b2.driver_id = d.id
         and b2.booking_date = v_booking.booking_date
         and b2.status in (
           'assigned', 'quoted', 'confirmed', 'scheduled',
           'driver_on_way', 'driver_arrived', 'in_progress'
         )
         and b2.pickup_time < (
           v_booking.pickup_time
           + (public.pakyawan_trip_hours(v_booking.trip_type, v_booking.estimated_hours) || ' hours')::interval
         )
         and v_booking.pickup_time < (
           b2.pickup_time
           + (public.pakyawan_trip_hours(b2.trip_type, b2.estimated_hours) || ' hours')::interval
         )
    );

  return query
    select o.driver_id, o.id, o.dispatch_round, o.expires_at
      from public.pakyawan_offers o
     where o.booking_id = p_booking_id
       and o.dispatch_round = v_round
     order by o.driver_id;
end;
$$;

revoke all on function public.br_pakyawan_dispatch_core(uuid) from public;

-- ---------------------------------------------------------------------------
-- 3. Admin-triggered Pakyawan dispatch (offers only, never assigns).
-- ---------------------------------------------------------------------------

create or replace function public.dispatch_pakyawan_booking(p_booking_id uuid)
returns table (driver_id uuid, offer_id uuid, dispatch_round integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
begin
  -- Admin only. Automatic triggering belongs to the worker, never to
  -- anonymous customers (who must never dispatch arbitrary bookings).
  v_role := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');

  if v_role <> 'admin' then
    raise exception 'Only an administrator can dispatch Pakyawan bookings.';
  end if;

  return query
    select * from public.br_pakyawan_dispatch_core(p_booking_id);
end;
$$;

revoke all on function public.dispatch_pakyawan_booking(uuid) from public;
grant execute on function public.dispatch_pakyawan_booking(uuid) to authenticated;

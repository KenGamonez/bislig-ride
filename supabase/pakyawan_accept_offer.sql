-- Bislig Ride: Pakyawan automated platform, PHASE B2 — atomic first-valid accept.
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Scope (B2 only):
--
--   public.accept_pakyawan_offer(p_offer_id uuid): the single controlled
--   mutation path for converting a driver offer into a held booking:
--
--     DRIVER RECEIVES OFFER → DRIVER ACCEPTS → FIRST VALID ACCEPTANCE WINS
--     → BOOKING BECOMES ASSIGNED → OTHER ACTIVE OFFERS WITHDRAWN
--
--   Everything happens in one transaction with row locks, so two drivers
--   accepting the same booking concurrently cannot both succeed: the loser
--   blocks on the locks, then sees the booking is no longer pending (or the
--   offer is no longer offered) and receives a safe "no longer available"
--   error. Frontend timing is never trusted.
--
-- Atomic commit on success (and nothing else):
--
--   - winning offer → 'accepted' + decided_at
--   - sibling 'offered' offers for the same booking → 'withdrawn' + decided_at
--     (already declined/expired/withdrawn rows are never touched)
--   - booking → status 'assigned', driver_id = winner, updated_at = now()
--
-- What this does NOT implement (later phases):
--
--   - No decline RPC, no redispatch automation, no price proposal, no
--     lifecycle advance, no chat, no ratings, no UI of any kind.
--   - No change to the legacy direct-UPDATE self-assign path (retired later,
--     only after the automated workflow is proven end-to-end).
--   - No driver_locations writes: Pakyawan acceptance must never touch Ride
--     Now presence/availability state.
--   - No RLS policy changes. No table GRANT changes. No Ride Now changes
--     (dispatch core, ride_offers, presence, GPS, fare, ratings, UI untouched).

create or replace function public.accept_pakyawan_offer(p_offer_id uuid)
returns setof public.pakyawan_bookings
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_driver_id uuid;
  v_booking public.pakyawan_bookings;
  v_offer public.pakyawan_offers;
begin
  -- Driver identity comes from the session only. There is no driver_id
  -- parameter, so impersonation by argument is structurally impossible.
  select d.id
    into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active';

  if v_driver_id is null then
    raise exception 'Only an active driver can accept a Pakyawan offer.'
      using errcode = '42501';
  end if;

  if p_offer_id is null then
    raise exception 'An offer id is required.';
  end if;

  -- The driver's own offer, locked: serializes concurrent accept attempts
  -- on the same offer row.
  select o.*
    into v_offer
    from public.pakyawan_offers o
   where o.id = p_offer_id
     and o.driver_id = v_driver_id
   for update;

  if not found then
    raise exception 'This Pakyawan offer is no longer available.'
      using errcode = 'XX001';
  end if;

  if v_offer.status <> 'offered' then
    raise exception 'This Pakyawan offer is no longer available.'
      using errcode = 'XX001';
  end if;

  if v_offer.expires_at <= now() then
    update public.pakyawan_offers
       set status = 'expired', decided_at = now()
     where id = v_offer.id;

    raise exception 'This Pakyawan offer is no longer available.'
      using errcode = 'XX001';
  end if;

  -- The booking, locked: serializes concurrent accepts across different
  -- offer rows of the same booking (the race-condition guarantee).
  select b.*
    into v_booking
    from public.pakyawan_bookings b
   where b.id = v_offer.booking_id
   for update;

  if not found then
    raise exception 'Pakyawan booking not found.';
  end if;

  if v_booking.status <> 'pending' or v_booking.driver_id is not null then
    raise exception 'This Pakyawan booking is no longer available.'
      using errcode = 'XX001';
  end if;

  -- Re-verify the driver is still fit to take this booking right now
  -- (mirrors the B1 dispatch eligibility: active, Pakyawan-enabled,
  -- verified capacity, vehicle match, no new scheduling conflict).
  if not exists (
    select 1
      from public.drivers d
     where d.id = v_driver_id
       and d.status = 'active'
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
          where b2.driver_id = v_driver_id
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
       )
  ) then
    raise exception 'You are no longer eligible for this Pakyawan booking.'
      using errcode = 'XX001';
  end if;

  update public.pakyawan_offers
     set status = 'accepted', decided_at = now()
   where id = v_offer.id;

  update public.pakyawan_offers
     set status = 'withdrawn', decided_at = now()
   where booking_id = v_booking.id
     and status = 'offered'
     and id <> v_offer.id;

  update public.pakyawan_bookings
     set driver_id = v_driver_id, status = 'assigned', updated_at = now()
   where id = v_booking.id;

  return query
    select b.* from public.pakyawan_bookings b where b.id = v_booking.id;
end;
$$;

revoke all on function public.accept_pakyawan_offer(uuid) from public;
grant execute on function public.accept_pakyawan_offer(uuid) to authenticated, service_role;

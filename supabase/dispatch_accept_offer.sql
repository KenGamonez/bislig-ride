-- Bislig Ride: Driver Dispatch V1 — accept_ride_offer.
-- Run this file in the Supabase SQL editor after dispatch_ride_rpc.sql
-- (idempotent). A driver accepts a ride they were explicitly offered. The
-- whole hand-off is atomic and guarded at the database level:
--
--   * the ride row is locked FOR UPDATE (serializes with dispatch/cancel),
--   * only a live, unexpired offer issued to THIS driver may convert,
--   * eligibility + GPS freshness are re-verified at accept time, and
--   * the one-live-offer invariant means a second driver can never accept the
--     same ride — they get a controlled "no longer available" error instead.

create or replace function public.accept_ride_offer(
  p_ride_id uuid,
  p_driver_id uuid
)
returns setof public.rides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_ride public.rides%rowtype;
  v_offer public.ride_offers%rowtype;
begin
  select d.id
    into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active';

  if v_driver_id is null then
    raise exception 'Only an active driver can accept a ride offer.'
      using errcode = '42501';
  end if;

  if p_driver_id is not null and p_driver_id <> v_driver_id then
    raise exception 'You cannot accept an offer issued to another driver.'
      using errcode = '42501';
  end if;

  select r.*
    into v_ride
    from public.rides r
   where r.id = p_ride_id
   for update;

  if not found then
    raise exception 'Ride not found.';
  end if;

  if v_ride.status <> 'requested' or v_ride.driver_id is not null then
    raise exception 'This ride is no longer available.'
      using errcode = 'XX001';
  end if;

  -- The driver's offer must still be live. Expired offers are retired and
  -- reported as unavailable (the countdown expired on the driver's screen).
  select o.*
    into v_offer
    from public.ride_offers o
   where o.ride_id = p_ride_id
     and o.driver_id = v_driver_id
     and o.status = 'offered'
   order by o.dispatch_round desc
   limit 1
   for update;

  if not found then
    raise exception 'This ride is no longer available.'
      using errcode = 'XX001';
  end if;

  if v_offer.expires_at <= now() then
    update public.ride_offers
       set status = 'expired', decided_at = now()
     where id = v_offer.id;

    raise exception 'This ride is no longer available.'
      using errcode = 'XX001';
  end if;

  -- Re-verify the driver is still fit to take this ride right now.
  if not exists (
    select 1
    from public.drivers d
    join public.driver_locations dl on dl.driver_id = d.id
    where d.id = v_driver_id
      and d.status = 'active'
      and dl.is_online = true
      and dl.is_available = true
      and dl.current_ride_id is null
      and dl.latitude is not null
      and dl.longitude is not null
      and dl.updated_at >= now() - interval '60 seconds'
  ) then
    raise exception 'You are no longer eligible for this ride. Refresh your location and try again.'
      using errcode = 'XX001';
  end if;

  update public.ride_offers
     set status = 'accepted', decided_at = now()
   where id = v_offer.id;

  update public.ride_offers
     set status = 'withdrawn', decided_at = now()
   where ride_id = p_ride_id
     and status = 'offered'
     and id <> v_offer.id;

  update public.rides
     set driver_id = v_driver_id, status = 'accepted'
   where id = p_ride_id;

  update public.driver_locations
     set current_ride_id = p_ride_id, is_available = false
   where driver_id = v_driver_id;

  return query
    select r.* from public.rides r where r.id = p_ride_id;
end;
$$;

revoke all on function public.accept_ride_offer(uuid, uuid) from public;
grant execute on function public.accept_ride_offer(uuid, uuid) to authenticated, service_role;
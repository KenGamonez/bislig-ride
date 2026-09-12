-- Bislig Ride: Driver Dispatch V1 — decline_ride_offer.
-- Run this file in the Supabase SQL editor after dispatch_ride_rpc.sql and
-- dispatch_accept_offer.sql (idempotent). The driver declines the offered ride;
-- the engine then IMMEDIATELY dispatches the next nearest candidate for the same
-- ride inside the same transaction (no cron, no passenger wait).
--
-- Decline is never a state change to the ride itself: the ride stays
-- 'requested' while the core searches for the next driver, and falls back to
-- 'no_driver' only when the driver pool is exhausted.

create or replace function public.decline_ride_offer(
  p_ride_id uuid,
  p_driver_id uuid
)
returns table (
  ride_id uuid,
  ride_status text,
  driver_assigned uuid,
  offer_id uuid,
  no_driver_found boolean,
  no_driver_candidates integer
)
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
    raise exception 'Only an active driver can decline a ride offer.'
      using errcode = '42501';
  end if;

  if p_driver_id is not null and p_driver_id <> v_driver_id then
    raise exception 'You cannot decline an offer issued to another driver.'
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
    -- Nothing to decline (already taken, expired, or never offered to us).
    -- Report the ride's current dispatch state so the client stays in sync.
    return query
      select * from public.br_dispatch_ride_core(p_ride_id);
    return;
  end if;

  update public.ride_offers
     set status = 'declined', decided_at = now()
   where id = v_offer.id;

  -- Synchronously dispatch the next candidate for this ride.
  return query
    select * from public.br_dispatch_ride_core(p_ride_id);
end;
$$;

revoke all on function public.decline_ride_offer(uuid, uuid) from public;
grant execute on function public.decline_ride_offer(uuid, uuid) to authenticated, service_role;
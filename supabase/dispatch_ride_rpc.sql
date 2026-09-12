-- Bislig Ride: Driver Dispatch V1 — dispatch_ride + internal dispatch core.
-- Run this file in the Supabase SQL editor after dispatch_ride_offers.sql and
-- rides_no_driver_status.sql (idempotent).
--
-- dispatch_ride is the public entry point. The passenger calls it immediately
-- after createRide (or after tapping "Try Again" on a no-driver ride). It picks
-- the nearest ELIGIBLE driver (active + online + available + no active ride +
-- GPS fresher than 60s + no outstanding offer elsewhere) and either:
--   * auto-assigns the ride (driver has auto_accept on), or
--   * writes a single live ride_offers row for that driver (manual accept).
-- If no one can be reached it reports no_driver_found — and when there is not a
-- single online driver the ride itself is parked as 'no_driver' for the
-- passenger UI.
--
-- The heavy lifting lives in br_dispatch_ride_core so decline_ride_offer can
-- chain the next candidate synchronously without duplicating the logic. The
-- core is deliberately NOT exposed to any role (it assumes the caller already
-- passed dispatch_ride's owner/admin authorization).

create or replace function public.br_dispatch_ride_core(p_ride_id uuid)
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
  v_ride public.rides%rowtype;
  v_acceptance_window interval := interval '45 seconds';
  v_live_offer uuid;
  v_candidate record;
  v_candidate_pool integer;
  v_last_round integer;
  v_new_offer uuid;
begin
  select r.*
    into v_ride
    from public.rides r
   where r.id = p_ride_id
   for update;

  if not found then
    raise exception 'Ride not found.';
  end if;

  -- Already assigned (idempotent re-dispatch / passenger poll retry).
  if v_ride.driver_id is not null then
    return query
      select p_ride_id, v_ride.status, v_ride.driver_id, null::uuid, false, 0;
    return;
  end if;

  -- A ride that is no longer available cannot be dispatched.
  if v_ride.status not in ('requested') and v_ride.status <> 'no_driver' then
    return query
      select p_ride_id, v_ride.status, null::uuid, null::uuid, false, 0;
    return;
  end if;

  -- Someone already has a live, unanswered offer -> leave it alone.
  select o.id
    into v_live_offer
    from public.ride_offers o
   where o.ride_id = p_ride_id
     and o.status = 'offered'
     and o.expires_at > now();

  if v_live_offer is not null then
    return query
      select p_ride_id, v_ride.status, null::uuid, v_live_offer, false, 0;
    return;
  end if;

  -- Expired live offers (acceptance window elapsed with no decision) are
  -- retired lazily and the search rolls forward to the next candidate.
  update public.ride_offers
     set status = 'expired', decided_at = now()
   where ride_id = p_ride_id
     and status = 'offered'
     and expires_at <= now();

  -- Candidate pool = online active drivers with no active ride (regardless of
  -- GPS freshness). Used to distinguish "no drivers at all" from "drivers
  -- exist but none can be reached right now".
  select count(*)
    into v_candidate_pool
    from public.drivers d
    join public.driver_locations dl on dl.driver_id = d.id
   where d.status = 'active'
     and dl.is_online = true
     and dl.current_ride_id is null;

  select d.id, d.auth_user_id, dl.auto_accept,
         dl.latitude, dl.longitude, dl.updated_at
    into v_candidate
    from public.drivers d
    join public.driver_locations dl on dl.driver_id = d.id
   where d.status = 'active'
     and dl.is_online = true
     and dl.is_available = true
     and dl.current_ride_id is null
     and dl.latitude is not null
     and dl.longitude is not null
     and dl.updated_at >= now() - interval '60 seconds'
     and not exists (
       select 1 from public.ride_offers o
       where o.driver_id = d.id
         and o.status = 'offered'
         and o.expires_at > now()
     )
   order by
     case when v_ride.pickup_lat is not null and v_ride.pickup_lng is not null then
       (dl.latitude - v_ride.pickup_lat) * (dl.latitude - v_ride.pickup_lat)
       + (dl.longitude - v_ride.pickup_lng) * (dl.longitude - v_ride.pickup_lng)
     end asc nulls last,
     dl.updated_at asc
   limit 1;

  if v_candidate.id is null then
    if v_candidate_pool = 0 then
      update public.rides
         set status = 'no_driver'
       where id = p_ride_id;

      return query
        select p_ride_id, 'no_driver', null::uuid, null::uuid, true, 0;
    end if;

    -- Drivers are online but none currently eligible (stale GPS / all on a
    -- live offer for another ride). Keep the ride searchable on the passenger
    -- poll instead of parking it in a terminal state.
    return query
      select p_ride_id, v_ride.status, null::uuid, null::uuid, true, v_candidate_pool;
  end if;

  select coalesce(max(dispatch_round), 0)
    into v_last_round
    from public.ride_offers
   where ride_id = p_ride_id;

  if v_candidate.auto_accept then
    update public.ride_offers
       set status = 'withdrawn', decided_at = now()
     where ride_id = p_ride_id
       and status = 'offered';

    update public.rides
       set driver_id = v_candidate.id,
           status = 'accepted'
     where id = p_ride_id;

    update public.driver_locations
       set current_ride_id = p_ride_id,
           is_available = false
     where driver_id = v_candidate.id;

    insert into public.ride_offers
      (ride_id, driver_id, dispatch_round, status, offered_at, expires_at, decided_at)
    values
      (p_ride_id, v_candidate.id, v_last_round + 1, 'accepted', now(), now() + v_acceptance_window, now())
    on conflict (ride_id, driver_id, dispatch_round) do nothing;

    return query
      select p_ride_id, 'accepted', v_candidate.id, null::uuid, false, v_candidate_pool;
  else
    update public.ride_offers
       set status = 'withdrawn', decided_at = now()
     where ride_id = p_ride_id
       and status = 'offered';

    insert into public.ride_offers
      (ride_id, driver_id, dispatch_round, status, offered_at, expires_at)
    values
      (p_ride_id, v_candidate.id, v_last_round + 1, 'offered', now(), now() + v_acceptance_window)
    returning id into v_new_offer;

    return query
      select p_ride_id, v_ride.status, null::uuid, v_new_offer, false, v_candidate_pool;
  end if;
end;
$$;

create or replace function public.dispatch_ride(p_ride_id uuid)
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
  v_ride public.rides%rowtype;
  v_is_customer boolean;
  v_is_admin boolean;
begin
  select r.*
    into v_ride
    from public.rides r
   where r.id = p_ride_id;

  if not found then
    raise exception 'Ride not found.';
  end if;

  v_is_customer := v_ride.customer_auth_id is not null
    and v_ride.customer_auth_id = auth.uid();
  v_is_admin := (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or auth.role() = 'service_role';

  if not (v_is_customer or v_is_admin) then
    raise exception 'Only the ride owner can dispatch a ride.'
      using errcode = '42501';
  end if;

  return query
    select * from public.br_dispatch_ride_core(p_ride_id);
end;
$$;

revoke all on function public.br_dispatch_ride_core(uuid) from public;
revoke all on function public.dispatch_ride(uuid) from public;
grant execute on function public.dispatch_ride(uuid) to authenticated, service_role;
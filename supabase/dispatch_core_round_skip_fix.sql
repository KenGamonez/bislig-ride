-- Bislig Ride: Driver Dispatch V1 — FIX: skip already-asked drivers per round.
-- Run this file in the Supabase SQL editor AFTER dispatch_ride_rpc.sql (idempotent).
--
-- Defect found during the production integration audit:
-- the original br_dispatch_ride_core candidate query only excluded a driver
-- while they held a LIVE 'offered' offer for ANY ride. It did not exclude
-- drivers who had already received (and declined/expired/been withdrawn from)
-- the SAME ride. Because a decliner instantly has no live offer, the engine
-- would select them again — the SAME driver got the SAME ride re-offered on
-- the next dispatch round. "Nearest driver declines -> next driver gets the
-- offer" therefore never advanced.
--
-- Fix: a driver who already has an offer row for THIS ride at the CURRENT
-- dispatch round is not eligible again this round. dispatch_round still
-- ratchets up per offer, so with round-1 exclusion the nested decline chain
-- moves to a genuinely different driver. Once every candidate has been asked
-- this round the pool cycles (round-robin), so the ride is never stranded and
-- the passenger's poll / Try Again keeps making progress.
--
-- No schema or grant changes: the existing (ride_id, driver_id, dispatch_round)
-- unique index already prevents same-driver same-ride same-round duplicates.

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

  -- The round we are about to solicit as: every new offer for this ride is
  -- written at v_last_round + 1, so drivers already offered in round
  -- v_last_round must be excluded (declined/expired drivers get a real skip).
  select coalesce(max(dispatch_round), 0)
    into v_last_round
    from public.ride_offers
   where ride_id = p_ride_id;

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
     and not exists (
       select 1 from public.ride_offers o
       where o.ride_id = p_ride_id
         and o.driver_id = d.id
         and o.dispatch_round = v_last_round
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
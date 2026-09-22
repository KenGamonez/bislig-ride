-- ============================================================================
-- BISLIG RIDE — ADMIN RETRY DISPATCH v1 (P1.1 operational control)
-- Project: epsxgqoqfrwymktjvujs ("Bislig Ride", ap-northeast-1)
-- Date: 2026-09-22
--
-- PURPOSE
--   One safe, atomic Admin retry action for stuck Ride Now requests.
--   Recovers no_driver rides (which otherwise can neither proceed nor
--   cancel) by resetting no_driver -> requested and delegating to the
--   existing authoritative dispatch core. Requested rides are
--   re-dispatched without duplicating live offers.
--
-- SECURITY MODEL (mirrors admin_quote_pakyawan + dispatch_ride)
--   SECURITY DEFINER. Caller must be authenticated and carry
--   app_metadata.role = 'admin' (service_role also permitted, as in
--   dispatch_ride / cancel_ride). EXECUTE granted to authenticated +
--   service_role only. No anon access. The body enforces the role
--   independently of GRANTs.
--
-- DELEGATION (no duplicated business rules)
--   All eligibility, vehicle/capacity matching, distance ordering,
--   dispatch rounds, offer creation/expiry, auto-accept,
--   first-accept-wins, and no-driver detection remain solely inside
--   public.br_dispatch_ride_core. This function only: validates,
--   recovers no_driver -> requested, and delegates.
--
-- IDEMPOTENCY / SAFETY
--   - Row locked FOR UPDATE before any state decision.
--   - Assigned rides: no-op returning current state.
--   - Terminal/active states outside (requested, no_driver): no-op.
--   - Live offer (SAME definition as the core: status = 'offered'
--     AND expires_at > now()): no reset, no duplicate; existing
--     dispatch state returned.
--
-- WARNING — CANONICAL DEFINITION
--   This file is the authoritative definition of admin_retry_ride.
--   Frontend caller: src/lib/dispatch.ts adminRetryRide() (Admin
--   Active Rides detail panel only).
-- ============================================================================

create or replace function public.admin_retry_ride(p_ride_id uuid)
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
set search_path = public, auth
as $$
declare
  v_ride public.rides%rowtype;
  v_role text;
  v_live_offer uuid;
begin
  v_role := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');

  if v_role <> 'admin' and auth.role() <> 'service_role' then
    raise exception 'Only an administrator can retry dispatch.'
      using errcode = '42501';
  end if;

  if p_ride_id is null then
    raise exception 'A ride id is required.';
  end if;

  select r.*
    into v_ride
    from public.rides r
   where r.id = p_ride_id
   for update;

  if not found then
    raise exception 'Ride not found.';
  end if;

  -- Already assigned: safe no-op, report current state.
  if v_ride.driver_id is not null then
    return query
      select p_ride_id, v_ride.status, v_ride.driver_id,
             null::uuid, false, 0;
    return;
  end if;

  -- States the dispatch core cannot act on: safe no-op, report state.
  if v_ride.status not in ('requested', 'no_driver') then
    return query
      select p_ride_id, v_ride.status, null::uuid,
             null::uuid, false, 0;
    return;
  end if;

  -- Live offer uses the exact dispatch-core definition: offered and
  -- unexpired. Never duplicate it, never reset around it.
  select o.id
    into v_live_offer
    from public.ride_offers o
   where o.ride_id = p_ride_id
     and o.status = 'offered'
     and o.expires_at > now();

  if v_live_offer is not null then
    return query
      select p_ride_id, v_ride.status, null::uuid,
             v_live_offer, false, 0;
    return;
  end if;

  -- no_driver recovery: return to requested so that accept_ride_offer
  -- (which requires status = 'requested') can fire on the new offer.
  if v_ride.status = 'no_driver' then
    update public.rides
       set status = 'requested'
     where id = p_ride_id;

    v_ride.status := 'requested';
  end if;

  return query
    select * from public.br_dispatch_ride_core(p_ride_id);
end;
$$;

revoke all on function public.admin_retry_ride(uuid) from public;
grant execute on function public.admin_retry_ride(uuid) to authenticated, service_role;

-- End of admin_retry_ride v1. Re-applying this file is safe (idempotent).

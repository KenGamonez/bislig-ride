-- Bislig Ride: Driver Dispatch V1 — cancel_ride rides the dispatch invariants.
-- Run this file in the Supabase SQL editor (idempotent). Re-creates cancel_ride
-- with two additions required by the new dispatch model (everything else is
-- identical to the current live definition):
--
--   1. WITHDRAW outstanding ride_offers for the ride. A passenger cancelling a
--      'requested' ride must not leave a driver staring at a card for a ride
--      that no longer exists — the countdown should be retired immediately.
--   2. RELEASE the assigned driver. When the ride being cancelled is one the
--      driver is already committed to (accepted/arrived/in_progress), clear
--      driver_locations.current_ride_id and restore availability so the driver
--      can immediately receive the next dispatch without a manual re-login.

create or replace function public.cancel_ride(
  p_ride_id uuid,
  p_cancelled_by uuid,
  p_cancelled_by_role text,
  p_reason text
)
returns setof public.rides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides%rowtype;
  v_actor uuid;
  v_role text;
  v_is_customer boolean;
  v_is_driver boolean;
  v_is_admin boolean;
begin
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A cancellation reason is required.';
  end if;

  select r.*
    into v_ride
    from public.rides r
   where r.id = p_ride_id
   for update;

  if not found then
    raise exception 'Ride not found.';
  end if;

  if v_ride.status not in ('requested', 'accepted', 'arrived', 'in_progress') then
    raise exception 'This ride cannot be cancelled.';
  end if;

  -- Authorization is derived from the authenticated session, never from the
  -- passed-in actor id, so a participant cannot spoof who cancelled.
  v_is_customer := v_ride.customer_auth_id is not null
    and v_ride.customer_auth_id = auth.uid();
  v_is_driver := v_ride.driver_id is not null
    and exists (
      select 1 from public.drivers d
      where d.id = v_ride.driver_id
        and d.auth_user_id = auth.uid()
        and d.status = 'active'
    );
  v_is_admin := (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or auth.role() = 'service_role';

  if v_is_customer then
    v_actor := v_ride.customer_auth_id;
    v_role := 'customer';
  elsif v_is_driver then
    v_actor := v_ride.driver_id;
    v_role := 'driver';
  elsif v_is_admin then
    v_actor := p_cancelled_by;
    v_role := case when p_cancelled_by_role in ('customer', 'driver') then p_cancelled_by_role else null end;

    if v_actor is null or v_role is null then
      raise exception 'Invalid cancellation details.';
    end if;
  else
    raise exception 'Only the rider or the assigned driver can cancel a ride.'
      using errcode = '42501';
  end if;

  -- Dispatch V1: retire any unanswered offers for this ride immediately.
  update public.ride_offers
     set status = 'withdrawn', decided_at = now()
   where ride_id = p_ride_id
     and status = 'offered';

  update public.rides
     set status = 'cancelled'
   where id = p_ride_id;

  insert into public.ride_cancellations (ride_id, cancelled_by, cancelled_by_role, reason)
  values (p_ride_id, v_actor, v_role, trim(p_reason));

  -- Dispatch V1: if a driver was already committed, release them so they can
  -- take the next dispatch without a manual re-login.
  if v_ride.driver_id is not null then
    update public.driver_locations
       set current_ride_id = NULL, is_available = true
     where driver_id = v_ride.driver_id
       and current_ride_id = p_ride_id;
  end if;

  return query
    select r.* from public.rides r where r.id = p_ride_id;
end;
$$;

revoke all on function public.cancel_ride(uuid, uuid, text, text) from public;
grant execute on function public.cancel_ride(uuid, uuid, text, text) to anon, authenticated, service_role;
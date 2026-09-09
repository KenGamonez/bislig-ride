-- Bislig Ride: atomic rider/driver cancellation via RPC
-- Run this file in the Supabase SQL editor after rides_cancel_status.sql.

-- Background:
-- The previous client-side flow was two round-trips (update rides -> insert
-- ride_cancellations). If the second write failed, the ride was left
-- 'cancelled' with no cancellation record (misleading state).
--
-- Fix 1: this RPC performs the status change + cancellation insert atomically
-- in one transaction, so the two can never diverge.
--
-- Fix 3: the broad "Riders can cancel their own rides" UPDATE policy above could
-- only constrain the *final* status, so a rider could smuggle changes to
-- unrelated columns through their cancellation UPDATE. Cancellation no longer
-- goes through a client UPDATE at all; that policy is dropped and ALL
-- cancellations route through cancel_ride(), which performs a narrowly-scoped
-- UPDATE internally. Riders keep no direct UPDATE capability on rides.
--
-- Security model is unchanged: only the ride's customer (anonymous auth uid),
-- the assigned driver, or an admin/service role can cancel; cancelled_by is
-- forced to the authenticated actor (no spoofing); a reason is required.
-- Realtime is unaffected: the INSERT still fires and delivery is still gated by
-- the existing RLS SELECT policy on ride_cancellations.

drop policy if exists "Riders can cancel their own rides" on public.rides;

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

  update public.rides
     set status = 'cancelled'
   where id = p_ride_id;

  insert into public.ride_cancellations (ride_id, cancelled_by, cancelled_by_role, reason)
  values (p_ride_id, v_actor, v_role, trim(p_reason));

  return query
    select r.* from public.rides r where r.id = p_ride_id;
end;
$$;

revoke all on function public.cancel_ride(uuid, uuid, text, text) from public;
grant execute on function public.cancel_ride(uuid, uuid, text, text) to anon, authenticated, service_role;
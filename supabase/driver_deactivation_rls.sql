-- Bislig Ride: enforce "active driver" at the authorization boundary.
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Why: previously an admin deactivation only flipped drivers.status -> 'inactive'.
-- The RLS layer still let ANY authenticated user update drives/rides/locations,
-- so an inactive driver's browser session could keep accepting rides, updating
-- ride status, pushing location, etc. (the "kept dashboard usable" bug).
--
-- This file replaces those wide-open policies so every driver-only WRITE path
-- requires the actor to be linked to a drivers row with status = 'active'.
-- The Supabase Auth session itself is left untouched (no account deletion),
-- matching the existing architecture: auth.users -> drivers.auth_user_id.

-- ---------------------------------------------------------------------------
-- 1. drivers: remove open UPDATE + INSERT on the table.
--    The previous "Prototype users can update drivers" (qual=true) let ANY
--    authenticated user edit ANY driver row, including an inactive driver
--    flipping their own status back to 'active'. Admin CRUD is still covered
--    by the existing admin ALL policies; driver reads stay via their OWN-row
--    SELECT policies. The broad SELECT stays for cross-driver display (e.g.
--    cancellation notices), which is not a driver-only operation.
-- ---------------------------------------------------------------------------

drop policy if exists "Prototype users can update drivers" on public.drivers;
drop policy if exists "Prototype users can insert drivers" on public.drivers;

-- ---------------------------------------------------------------------------
-- 2. rides UPDATE: only active drivers (their assigned ride OR an unassigned
--    requested ride they are accepting), customers (their own ride), admins.
-- ---------------------------------------------------------------------------

drop policy if exists "Prototype users can update rides" on public.rides;

create policy "Admins can update all rides"
  on public.rides
  for update
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Customers can update their own rides"
  on public.rides
  for update
  to authenticated
  using (customer_auth_id = auth.uid())
  with check (customer_auth_id = auth.uid());

create policy "Active drivers can update their rides"
  on public.rides
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.drivers d
      where d.auth_user_id = auth.uid()
        and d.status = 'active'
        and (
          d.id = rides.driver_id
          or (rides.status = 'requested' and rides.driver_id is null)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.drivers d
      where d.auth_user_id = auth.uid()
        and d.status = 'active'
        and d.id = rides.driver_id
    )
  );

-- ---------------------------------------------------------------------------
-- 3. driver_locations: only an ACTIVE driver may write/read their own location.
-- ---------------------------------------------------------------------------

drop policy if exists "Drivers can manage their own location" on public.driver_locations;

create policy "Active drivers can manage their own location"
  on public.driver_locations
  for all
  to authenticated
  using (
    driver_id in (
      select id
      from public.drivers
      where auth_user_id = auth.uid() and status = 'active'
    )
  )
  with check (
    driver_id in (
      select id
      from public.drivers
      where auth_user_id = auth.uid() and status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- 4. pakyawan_bookings: eligible driver paths also require status = 'active'.
-- ---------------------------------------------------------------------------

drop policy if exists "Eligible drivers can view Pakyawan requests" on public.pakyawan_bookings;
drop policy if exists "Eligible drivers can accept Pakyawan requests" on public.pakyawan_bookings;

create policy "Eligible active drivers can view Pakyawan requests"
  on public.pakyawan_bookings
  for select
  to authenticated
  using (
    driver_id = (select id from public.drivers where auth_user_id = auth.uid())
    or (
      status = 'pending'
      and exists (
        select 1 from public.drivers d
        where d.auth_user_id = auth.uid()
          and d.can_accept_pakyawan = true
          and d.status = 'active'
      )
    )
  );

create policy "Eligible active drivers can accept Pakyawan requests"
  on public.pakyawan_bookings
  for update
  to authenticated
  using (
    status = 'pending'
    and exists (
      select 1 from public.drivers d
      where d.auth_user_id = auth.uid()
        and d.can_accept_pakyawan = true
        and d.status = 'active'
    )
  )
  with check (
    driver_id = (
      select id from public.drivers
      where auth_user_id = auth.uid() and status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- 5. ride_messages: driver read/write requires an ACTIVE driver.
-- ---------------------------------------------------------------------------

drop policy if exists "Drivers can send their ride messages" on public.ride_messages;
drop policy if exists "Drivers can read their ride messages" on public.ride_messages;

create policy "Active drivers can read their ride messages"
  on public.ride_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.rides r
      join public.drivers d on d.id = r.driver_id
      where r.id = ride_messages.ride_id
        and d.auth_user_id = auth.uid()
        and d.status = 'active'
    )
  );

create policy "Active drivers can send their ride messages"
  on public.ride_messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and sender_role = 'driver'
    and exists (
      select 1
      from public.rides r
      join public.drivers d on d.id = r.driver_id
      where r.id = ride_messages.ride_id
        and d.auth_user_id = auth.uid()
        and d.status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- 6. ride_ratings: a driver can only rate passengers while ACTIVE.
-- ---------------------------------------------------------------------------

drop policy if exists "Participants can rate completed rides" on public.ride_ratings;

create policy "Participants can rate completed rides"
  on public.ride_ratings
  for insert
  to public
  with check (
    exists (
      select 1 from public.rides r
      where r.id = ride_id
        and r.status = 'completed'
        and (
          (r.customer_auth_id = auth.uid() and rater_id = r.customer_auth_id and rated_user_id = r.driver_id)
          or (
            rated_user_id = r.customer_auth_id
            and rater_id = r.driver_id
            and exists (
              select 1 from public.drivers d
              where d.auth_user_id = auth.uid()
                and d.id = r.driver_id
                and d.status = 'active'
            )
          )
        )
    )
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ---------------------------------------------------------------------------
-- 7. cancel_ride RPC: the driver authorizer must be ACTIVE to cancel a ride.
-- ---------------------------------------------------------------------------

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
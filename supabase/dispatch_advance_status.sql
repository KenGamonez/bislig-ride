-- Bislig Ride: Driver Dispatch V1 — advance_ride_status + save_ride_rating.
-- Run this file in the Supabase SQL editor after dispatch_driver_locations.sql
-- (idempotent).
--
-- advance_ride_status replaces the direct client UPDATE(path) used by the
-- driver dashboard for lifecycle transitions (arrived -> in_progress -> completed).
-- It validates the actor is the assigned driver of the ride, enforces strict
-- forward progression, and releases the driver's availability on completion.
--
-- save_ride_rating absorbs the customer-side rides UPDATE that previously
-- lived in src/lib/rides.ts submitRideRating(), which wrote rating and
-- rating_comment columns. With RLS hardened to remove the broad customer
-- UPDATE policy, rating backfills now run through this security-definer RPC
-- while preserving the exact same read-before-write validation the client had.

-- ---------------------------------------------------------------------------
-- advance_ride_status
-- ---------------------------------------------------------------------------

create or replace function public.advance_ride_status(
  p_ride_id uuid,
  p_status text
)
returns setof public.rides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_ride public.rides%rowtype;
begin
  select r.*
    into v_ride
    from public.rides r
   where r.id = p_ride_id
   for update;

  if not found then
    raise exception 'Ride not found.';
  end if;

  select d.id
    into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active'
     and d.id = v_ride.driver_id;

  if v_driver_id is null then
    raise exception 'Only the assigned driver can update ride status.'
      using errcode = '42501';
  end if;

  case v_ride.status
    when 'accepted' then
      if p_status <> 'arrived' then
        raise exception 'Cannot transition from % to %.', v_ride.status, p_status;
      end if;
    when 'arrived' then
      if p_status <> 'in_progress' then
        raise exception 'Cannot transition from % to %.', v_ride.status, p_status;
      end if;
    when 'in_progress' then
      if p_status <> 'completed' then
        raise exception 'Cannot transition from % to %.', v_ride.status, p_status;
      end if;
    else
      raise exception 'Cannot update a ride in the ''%'' state.', v_ride.status;
  end case;

  update public.rides
     set status = p_status
   where id = p_ride_id;

  if p_status = 'completed' then
    update public.driver_locations
       set current_ride_id = NULL, is_available = true
     where driver_id = v_driver_id
       and current_ride_id = p_ride_id;
  end if;

  return query
    select r.* from public.rides r where r.id = p_ride_id;
end;
$$;

revoke all on function public.advance_ride_status(uuid, text) from public;
grant execute on function public.advance_ride_status(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- save_ride_rating (customer backfill that previously ran as a direct UPDATE)
-- ---------------------------------------------------------------------------

create or replace function public.save_ride_rating(
  p_ride_id uuid,
  p_stars integer,
  p_comment text
)
returns setof public.rides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides%rowtype;
begin
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'Rating must be between 1 and 5.';
  end if;

  select r.*
    into v_ride
    from public.rides r
   where r.id = p_ride_id
   for update;

  if not found then
    raise exception 'Ride not found.';
  end if;

  if v_ride.customer_auth_id is null or v_ride.customer_auth_id <> auth.uid() then
    raise exception 'Only the ride owner can submit a rating.'
      using errcode = '42501';
  end if;

  if v_ride.status <> 'completed' then
    raise exception 'Ratings can only be submitted after a ride is completed.';
  end if;

  insert into public.ride_ratings (ride_id, rater_id, rated_user_id, stars, comment)
  values (p_ride_id, v_ride.customer_auth_id, v_ride.driver_id, p_stars, nullif(trim(p_comment), ''))
  on conflict do nothing;

  update public.rides
     set rating = p_stars, rating_comment = nullif(trim(p_comment), '')
   where id = p_ride_id;

  return query
    select r.* from public.rides r where r.id = p_ride_id;
end;
$$;

revoke all on function public.save_ride_rating(uuid, integer, text) from public;
grant execute on function public.save_ride_rating(uuid, integer, text) to authenticated, service_role;
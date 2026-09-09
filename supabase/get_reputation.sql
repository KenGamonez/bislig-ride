-- Bislig Ride: server-side reputation aggregates with participant gating
-- Run this file in the Supabase SQL editor.
--
-- Why an RPC instead of client-side queries?
-- Cross-role reputation views must NOT leak trip history or rating rows.
-- The existing ride_ratings / rides RLS only lets a caller read rows for rides
-- they participate in, so a plain client-side aggregate would fail (or, if we
-- loosened RLS, expose unrelated data). This function aggregates server-side
-- under security definer and only returns counts/averages, gated so the caller
-- must be the target user themselves, a participant of a shared ride, or admin.

create or replace function public.get_reputation(
  p_user_id uuid,
  p_is_driver boolean
)
returns table (
  average_stars numeric,
  rating_count bigint,
  completed_rides bigint,
  cancelled_rides bigint,
  total_rides bigint,
  cancellation_rate numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_my_uid uuid := auth.uid();
  v_allowed boolean := false;
  v_avg numeric;
  v_count bigint;
  v_completed bigint;
  v_cancelled bigint;
  v_total bigint;
begin
  if p_user_id is null then
    raise exception 'A user id is required.';
  end if;

  if (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
     or auth.role() = 'service_role' then
    v_allowed := true;
  elsif p_is_driver then
    -- Target is a driver, identified by drivers.id.
    -- Allowed when the caller IS that driver, or shares a ride with the driver.
    v_allowed := exists (
      select 1 from public.drivers d
      where d.id = p_user_id
        and d.auth_user_id = v_my_uid
    )
    or exists (
      select 1 from public.rides r
      where r.driver_id = p_user_id
        and (
          r.customer_auth_id = v_my_uid
          or r.driver_id in (
            select d.id from public.drivers d where d.auth_user_id = v_my_uid
          )
        )
    );
  else
    -- Target is a rider, identified by customer_auth_id.
    -- Allowed when the caller IS that rider, or is a driver assigned to the
    -- rider on a shared ride.
    v_allowed := v_my_uid = p_user_id
      or exists (
        select 1 from public.rides r
        where r.customer_auth_id = p_user_id
          and r.driver_id in (
            select d.id from public.drivers d where d.auth_user_id = v_my_uid
          )
      );
  end if;

  if not v_allowed then
    raise exception 'Not authorized to view this reputation.' using errcode = '42501';
  end if;

  if p_is_driver then
    select count(*) filter (where status = 'completed'),
           count(*) filter (where status = 'cancelled')
      into v_completed, v_cancelled
      from public.rides
     where driver_id = p_user_id;

    select count(*), round(avg(stars)::numeric, 1)
      into v_count, v_avg
      from public.ride_ratings
     where rated_user_id = p_user_id;
  else
    select count(*) filter (where status = 'completed'),
           count(*) filter (where status = 'cancelled')
      into v_completed, v_cancelled
      from public.rides
     where customer_auth_id = p_user_id;

    select count(*), round(avg(stars)::numeric, 1)
      into v_count, v_avg
      from public.ride_ratings
     where rated_user_id = p_user_id;
  end if;

  v_total := v_completed + v_cancelled;

  return query select
    coalesce(v_avg, 0),
    v_count,
    v_completed,
    v_cancelled,
    v_total,
    case when v_total = 0 then 0
         else round((v_cancelled::numeric / v_total) * 100, 1)
    end;
end;
$$;

revoke all on function public.get_reputation(uuid, boolean) from public;
grant execute on function public.get_reputation(uuid, boolean) to anon, authenticated, service_role;
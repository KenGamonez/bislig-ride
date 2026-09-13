-- Bislig Ride: Driver Dispatch V1 — set_driver_presence.
-- Run this file in the Supabase SQL editor after dispatch_driver_locations.sql
-- (idempotent). The driver's go-online/go-offline and availability/auto-accept
-- toggles persist here. Everything is derived from the authenticated session
-- (drivers.auth_user_id), so a driver can only ever write their own row.
--
-- Going online is ATOMIC: when the client supplies the first GPS fix
-- (p_latitude/p_longitude), position + presence are written in this single
-- call. The driver is never marked online without a fresh recorded position.
-- Availability/auto-accept toggles and go-offline omit the coordinates and
-- fall back to an existing, already-shared driver_locations position.

create or replace function public.set_driver_presence(
  p_online boolean,
  p_available boolean,
  p_auto_accept boolean,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns setof public.driver_locations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_effective_available boolean := p_available;
  v_has_fix boolean;
begin
  select d.id
    into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active';

  if v_driver_id is null then
    raise exception 'Only an ACTIVE driver with a shared location can set presence.'
      using errcode = '42501';
  end if;

  if p_online then
    -- Publish the first fix together with presence (atomic go-online), so
    -- there is no window where the driver is online without a position.
    if p_latitude is not null and p_longitude is not null then
      insert into public.driver_locations (driver_id, latitude, longitude)
      values (v_driver_id, p_latitude, p_longitude)
      on conflict (driver_id)
      do update set
        latitude = excluded.latitude,
        longitude = excluded.longitude;
      v_has_fix := true;
    else
      -- No coordinates supplied: require an already-shared position before
      -- presence can be toggled (used by availability/auto-accept toggles).
      select exists (
        select 1 from public.driver_locations dl
        where dl.driver_id = v_driver_id
        and dl.latitude is not null and dl.longitude is not null
      ) into v_has_fix;
    end if;

    if not v_has_fix then
      raise exception 'A driver position is required before going online.'
        using errcode = '42501';
    end if;
  end if;

  -- Going offline means the driver can no longer accept anything: force
  -- is_available off and retire their unanswered offers. Offers are withdrawn
  -- BEFORE the location row is written so every dispatch RPC acquires offer
  -- locks before driver_locations locks (deadlock-free ordering).
  if not p_online then
    v_effective_available := false;

    update public.ride_offers
       set status = 'withdrawn',
           decided_at = now()
     where driver_id = v_driver_id
       and status = 'offered';
  end if;

  insert into public.driver_locations (driver_id, is_online, is_available, auto_accept)
  values (v_driver_id, p_online, v_effective_available, coalesce(p_auto_accept, false))
  on conflict (driver_id)
  do update set
    is_online = excluded.is_online,
    is_available = excluded.is_available,
    auto_accept = excluded.auto_accept
  returning *;
end;
$$;

revoke all on function public.set_driver_presence(boolean, boolean, boolean, double precision, double precision) from public;
grant execute on function public.set_driver_presence(boolean, boolean, boolean, double precision, double precision) to authenticated, service_role;
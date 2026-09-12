-- Bislig Ride: Driver Dispatch V1 — set_driver_presence.
-- Run this file in the Supabase SQL editor after dispatch_driver_locations.sql
-- (idempotent). The driver's go-online/go-offline and availability/auto-accept
-- toggles persist here. Everything is derived from the authenticated session
-- (drivers.auth_user_id), so a driver can only ever write their own row.

create or replace function public.set_driver_presence(
  p_online boolean,
  p_available boolean,
  p_auto_accept boolean
)
returns setof public.driver_locations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_effective_available boolean := p_available;
begin
  select d.id
    into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active'
     and exists (
       select 1 from public.driver_locations dl
       where dl.driver_id = d.id
       and dl.latitude is not null and dl.longitude is not null
     );

  if v_driver_id is null then
    raise exception 'Only an ACTIVE driver with a shared location can set presence.'
      using errcode = '42501';
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

revoke all on function public.set_driver_presence(boolean, boolean, boolean) from public;
grant execute on function public.set_driver_presence(boolean, boolean, boolean) to authenticated, service_role;
-- ============================================================================
-- BISLIG RIDE — ADMIN DRIVER FORCE-OFFLINE HOLDS v1 (P1.7B)
-- Project: epsxgqoqfrwymktjvujs ("Bislig Ride", ap-northeast-1)
-- Date: 2026-09-22
--
-- PURPOSE
--   Sticky Admin force-offline intervention + audit record. An open hold
--   keeps a driver offline across re-online attempts until an admin
--   releases it. All operational presence writes stay with the driver
--   workflow and the RPCs below; this file adds no other behavior.
--
-- SECURITY MODEL (mirrors dispatch_ride / cancel_ride)
--   New RPCs are SECURITY DEFINER with controlled search_path and an
--   explicit admin-or-service_role gate in the body. EXECUTE granted to
--   authenticated + service_role only. No direct table mutation is
--   granted to any client role. No existing RLS policy is altered.
--
-- IDEMPOTENCY
--   Table, index, policy, trigger-free design: every statement is
--   re-runnable (IF NOT EXISTS / OR REPLACE / IF EXISTS / ON CONFLICT
--   semantics for data — there is no data seeding here). Safe to re-apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Holds table: one open hold per driver, doubles as the audit record.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_driver_holds (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null
    references public.drivers(id) on delete cascade,
  action text not null
    check (action = 'force_offline'),
  reason text not null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  released_at timestamptz null,
  released_by uuid null
);

comment on table public.admin_driver_holds is
  'P1.7B Admin force-offline holds. Open hold (released_at IS NULL) blocks driver online transitions. Audit trail for interventions.';

create unique index if not exists admin_driver_holds_one_open_per_driver
  on public.admin_driver_holds (driver_id)
  where released_at is null;

-- ----------------------------------------------------------------------------
-- 2. RLS: enabled, Admin SELECT only. Mutation happens exclusively
--    through the DEFINER RPCs below. Drivers, customers, and anon get
--    nothing. Existing policies elsewhere are untouched.
-- ----------------------------------------------------------------------------
alter table public.admin_driver_holds enable row level security;

drop policy if exists "Admins can read driver holds"
  on public.admin_driver_holds;

create policy "Admins can read driver holds"
  on public.admin_driver_holds
  for select
  to authenticated
  using (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text
  );

-- Table-level grant required before RLS is evaluated. SELECT only.
grant select on public.admin_driver_holds to authenticated;

-- ============================================================================
-- 3. admin_force_driver_offline(p_driver_id, p_reason)
--    Lock order: drivers row -> ride_offers rows -> driver_locations row.
--    Shared-resource order (offers before locations) matches the
--    acceptance path (rides -> offers -> locations), so no deadlock
--    cycle is introduced. current_ride_id is never cleared.
-- ============================================================================
create or replace function public.admin_force_driver_offline(p_driver_id uuid, p_reason text)
returns table (
  driver_id uuid,
  success boolean,
  already_offline boolean,
  active_ride_id uuid,
  offers_withdrawn integer,
  hold_id uuid
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_driver public.drivers%rowtype;
  v_presence public.driver_locations%rowtype;
  v_hold_id uuid;
  v_already_offline boolean := false;
  v_withdrawn integer := 0;
  v_active_ride uuid := null;
  v_reason text;
begin
  if (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin')
     and auth.role() <> 'service_role' then
    raise exception 'Only an administrator can force drivers offline.'
      using errcode = '42501';
  end if;

  if p_driver_id is null then
    raise exception 'A driver id is required.';
  end if;

  v_reason := trim(both from coalesce(p_reason, ''));

  if v_reason = '' then
    raise exception 'An intervention reason is required.';
  end if;

  select d.*
    into v_driver
    from public.drivers d
   where d.id = p_driver_id
   for update;

  if not found then
    raise exception 'Driver not found.';
  end if;

  -- Idempotency: reuse the open hold, never duplicate it.
  select h.id
    into v_hold_id
    from public.admin_driver_holds h
   where h.driver_id = p_driver_id
     and h.released_at is null
   order by h.created_at desc
   limit 1
   for update;

  select l.*
    into v_presence
    from public.driver_locations l
   where l.driver_id = p_driver_id;

  if v_presence.driver_id is not null then
    v_already_offline := not v_presence.is_online;
    v_active_ride := v_presence.current_ride_id;
  end if;

  -- Withdraw ONLY live offers (core definition verbatim): offered and
  -- unexpired. Terminal states are never rewritten. Ride status untouched.
  update public.ride_offers
     set status = 'withdrawn',
         decided_at = now()
   where driver_id = p_driver_id
     and status = 'offered'
     and expires_at > now();

  get diagnostics v_withdrawn = row_count;

  -- Converge flags to offline/unavailable. current_ride_id is preserved
  -- exactly (including NULL); GPS coordinates are never touched.
  insert into public.driver_locations (driver_id, is_online, is_available, current_ride_id)
  values (p_driver_id, false, false, v_active_ride)
  on conflict (driver_id)
  do update set
    is_online = false,
    is_available = false;

  if v_hold_id is null then
    insert into public.admin_driver_holds (driver_id, action, reason, created_by)
    values (p_driver_id, 'force_offline', v_reason, auth.uid())
    returning id into v_hold_id;
  end if;

  return query
    select p_driver_id, true, v_already_offline, v_active_ride,
           v_withdrawn, v_hold_id;
end;
$$;

revoke all on function public.admin_force_driver_offline(uuid, text) from public;
grant execute on function public.admin_force_driver_offline(uuid, text) to authenticated, service_role;

-- ============================================================================
-- 4. admin_release_driver_hold(p_hold_id)
--    Closes a hold. Never changes presence, assignment, GPS, or dispatch
--    state — it only removes the intervention block.
-- ============================================================================
create or replace function public.admin_release_driver_hold(p_hold_id uuid)
returns table (
  hold_id uuid,
  driver_id uuid,
  released boolean,
  already_released boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_hold public.admin_driver_holds%rowtype;
  v_driver_id uuid;
begin
  if (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin')
     and auth.role() <> 'service_role' then
    raise exception 'Only an administrator can release driver holds.'
      using errcode = '42501';
  end if;

  if p_hold_id is null then
    raise exception 'A hold id is required.';
  end if;

  select h.*
    into v_hold
    from public.admin_driver_holds h
   where h.id = p_hold_id
   for update;

  if not found then
    raise exception 'Hold not found.';
  end if;

  -- Verify the driver still exists and lock the row before releasing.
  select d.id
    into v_driver_id
    from public.drivers d
   where d.id = v_hold.driver_id
   for update;

  if not found then
    raise exception 'Driver for this hold no longer exists.';
  end if;

  if v_hold.released_at is not null then
    return query
      select v_hold.id, v_hold.driver_id, true, true;
    return;
  end if;

  update public.admin_driver_holds
     set released_at = now(),
         released_by = auth.uid()
   where id = v_hold.id;

  return query
    select v_hold.id, v_hold.driver_id, true, false;
end;
$$;

revoke all on function public.admin_release_driver_hold(uuid) from public;
grant execute on function public.admin_release_driver_hold(uuid) to authenticated, service_role;

-- ============================================================================
-- 5. Hold gate on set_driver_presence (BOTH live overloads).
--    Rejects p_online = true while an open hold exists. Offline,
--    availability, auto_accept, GPS, and offer-withdrawal semantics are
--    otherwise byte-identical to the live bodies. Acceptance/dispatch
--    RPCs are NOT modified.
-- ============================================================================

-- 5a. Three-argument overload (live body transcribed verbatim + gate).
create or replace function public.set_driver_presence(p_online boolean, p_available boolean, p_auto_accept boolean)
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

  if p_online and exists (
    select 1 from public.admin_driver_holds h
     where h.driver_id = v_driver_id
       and h.released_at is null
  ) then
    raise exception 'This driver account is currently held offline by Admin.'
      using errcode = '42501';
  end if;

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

-- 5b. Five-argument overload (live body transcribed verbatim + gate).
create or replace function public.set_driver_presence(p_online boolean, p_available boolean, p_auto_accept boolean, p_latitude double precision default null, p_longitude double precision default null)
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

  if p_online and exists (
    select 1 from public.admin_driver_holds h
     where h.driver_id = v_driver_id
       and h.released_at is null
  ) then
    raise exception 'This driver account is currently held offline by Admin.'
      using errcode = '42501';
  end if;

  if p_online then
    -- Position is now OPTIONAL for going online. When the client shares one
    -- it is still recorded here (backward compatible with the old atomic
    -- go-online write); a driver can go online with no GPS fix at all. The
    -- ACTIVE-driver gate above remains the only presence requirement.
    if p_latitude is not null and p_longitude is not null then
      insert into public.driver_locations (driver_id, latitude, longitude)
      values (v_driver_id, p_latitude, p_longitude)
      on conflict (driver_id)
      do update set
        latitude = excluded.latitude,
        longitude = excluded.longitude;
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

  return query
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

-- End of admin_driver_holds v1. Re-applying this file is safe (idempotent).

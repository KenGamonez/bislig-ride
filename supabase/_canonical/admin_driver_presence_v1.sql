-- ============================================================================
-- BISLIG RIDE — ADMIN DRIVER PRESENCE PROJECTION v1 (P1.3)
-- Project: epsxgqoqfrwymktjvujs ("Bislig Ride", ap-northeast-1)
-- Date: 2026-09-22
--
-- PURPOSE
--   Safe Admin read/realtime boundary over authoritative driver
--   presence. Source of truth remains public.driver_locations.
--   Admin observes ONLY operational presence — never raw GPS.
--
-- SECURITY BOUNDARY (locked)
--   Projection columns: driver_id, is_online, is_available,
--   current_ride_id, updated_at. NO latitude. NO longitude.
--   Admin gets SELECT only. No INSERT/UPDATE/DELETE for any client
--   role. Drivers, customers, and anon get nothing.
--
-- IDEMPOTENCY
--   Every statement below is re-runnable (IF NOT EXISTS guards,
--   OR REPLACE, DROP IF EXISTS, ON CONFLICT backfill, conditional
--   publication membership). Re-applying converges state, changes
--   no semantics. Safe to re-apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Projection table: five approved fields only. Types mirror the live
--    public.driver_locations columns (verified live 2026-09-22).
-- ----------------------------------------------------------------------------
create table if not exists public.admin_driver_presence (
  driver_id uuid primary key
    references public.drivers(id) on delete cascade,
  is_online boolean not null default false,
  is_available boolean not null default true,
  current_ride_id uuid null
    references public.rides(id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.admin_driver_presence is
  'P1.3 Admin read/realtime boundary over driver_locations. No GPS columns by design.';

-- ----------------------------------------------------------------------------
-- 2. Synchronization: driver_locations INSERT/UPDATE/DELETE converge the
--    projection. SECURITY DEFINER because row writers (drivers via
--    presence RPCs) hold no privilege on this table; the function copies
--    ONLY the five approved fields — latitude/longitude never cross.
-- ----------------------------------------------------------------------------
create or replace function public.sync_admin_driver_presence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    delete from public.admin_driver_presence
     where driver_id = OLD.driver_id;
    return OLD;
  end if;

  insert into public.admin_driver_presence (
    driver_id, is_online, is_available, current_ride_id, updated_at
  )
  values (
    NEW.driver_id, NEW.is_online, NEW.is_available,
    NEW.current_ride_id, NEW.updated_at
  )
  on conflict (driver_id) do update set
    is_online = excluded.is_online,
    is_available = excluded.is_available,
    current_ride_id = excluded.current_ride_id,
    updated_at = excluded.updated_at;

  return NEW;
end;
$$;

revoke all on function public.sync_admin_driver_presence() from public;

drop trigger if exists admin_driver_presence_sync on public.driver_locations;

create trigger admin_driver_presence_sync
  after insert or update or delete on public.driver_locations
  for each row execute function public.sync_admin_driver_presence();

-- ----------------------------------------------------------------------------
-- 3. Initial backfill: copy existing rows only. Drivers without a
--    driver_locations row intentionally receive NO projection row
--    (Admin interprets that as no authoritative presence).
--    driver_locations itself is never modified.
-- ----------------------------------------------------------------------------
insert into public.admin_driver_presence (
  driver_id, is_online, is_available, current_ride_id, updated_at
)
select driver_id, is_online, is_available, current_ride_id, updated_at
  from public.driver_locations
on conflict (driver_id) do update set
  is_online = excluded.is_online,
  is_available = excluded.is_available,
  current_ride_id = excluded.current_ride_id,
  updated_at = excluded.updated_at;

-- ----------------------------------------------------------------------------
-- 4. RLS: enabled, Admin SELECT only. Drivers, customers, and anon get
--    nothing. Existing driver_locations RLS is untouched.
-- ----------------------------------------------------------------------------
alter table public.admin_driver_presence enable row level security;

drop policy if exists "Admins can read driver presence"
  on public.admin_driver_presence;

create policy "Admins can read driver presence"
  on public.admin_driver_presence
  for select
  to authenticated
  using (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text
  );

-- Table-level grant required before RLS is evaluated (same convention as
-- pakyawan_table_grants.sql). SELECT only; RLS remains the boundary.
grant select on public.admin_driver_presence to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Realtime: add the projection to the existing publication
--    (conditional, so re-application is safe).
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'admin_driver_presence'
  ) then
    alter publication supabase_realtime
      add table public.admin_driver_presence;
  end if;
end
$$;

-- End of admin_driver_presence v1.

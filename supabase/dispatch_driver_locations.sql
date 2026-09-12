-- Bislig Ride: Driver Dispatch V1 — driver_locations foundation.
-- Run this file in the Supabase SQL editor (idempotent, additive).
--
-- Extends the existing driver_locations store (created in the dashboard, used by
-- src/lib/driverLocations.ts with upsert on driver_id) with the presence + offer
-- columns the dispatch engine depends on:
--   is_online        whether the driver has an open driver session
--   is_available     whether the driver is taking new offers right now
--   auto_accept      automatic acceptance of dispatched offers (flag only; the
--                    decision is still made server-side by dispatch_ride)
--   current_ride_id  the active accepted/arrived/in_progress ride, so a driver
--                    can never be dispatched a second ride at the same time
--
-- Also adds the single-active-ride uniqueness guarantee on public.rides: a
-- driver can only ever hold ONE ride in accepted/arrived/in_progress. This is
-- the database-level backstop that makes the "no competing drivers" invariant
-- enforceable even if a future code path tries to double-book.

-- ---------------------------------------------------------------------------
-- 1. Presence columns (latitude/longitude/updated_at already exist)
-- ---------------------------------------------------------------------------

alter table public.driver_locations
  add column if not exists is_online boolean not null default false,
  add column if not exists is_available boolean not null default true,
  add column if not exists auto_accept boolean not null default false,
  add column if not exists current_ride_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.driver_locations'::regclass
      and conname = 'driver_locations_current_ride_id_fkey'
  ) then
    alter table public.driver_locations
      add constraint driver_locations_current_ride_id_fkey
      foreign key (current_ride_id) references public.rides (id) on delete set null;
  end if;
end $$;

-- updated_at is stamped by the server, so GPS freshness (used for dispatch
-- eligibility) can never be spoofed by a client-supplied timestamp.
create or replace function public.touch_driver_location_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists driver_locations_set_updated_at on public.driver_locations;
create trigger driver_locations_set_updated_at
  before insert or update on public.driver_locations
  for each row
  execute function public.touch_driver_location_updated_at();

-- ---------------------------------------------------------------------------
-- 2. One active ride per driver (DB-level invariant)
-- ---------------------------------------------------------------------------

create unique index if not exists rides_single_active_ride_idx
  on public.rides (driver_id)
  where status in ('accepted', 'arrived', 'in_progress');

-- ---------------------------------------------------------------------------
-- 3. Realtime membership (already broadcast today, but keep it explicit)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'driver_locations'
  ) then
    alter publication supabase_realtime add table public.driver_locations;
  end if;
end $$;
-- Bislig Ride: Vehicle type + passenger capacity for Ride Now dispatch.
-- Run this file in the Supabase SQL editor BEFORE dispatch_ride_rpc.sql (idempotent).
--
-- What this adds (schema only — no RLS changes, no destructive writes):
--
--   1. drivers.vehicle_capacity  — the driver's configured passenger capacity,
--      stored as DATA (integer, 1..5 where 5 means "5+"). NULL means "not
--      configured", and the dispatch engine NEVER matches a driver without a
--      capacity (no invented default that could create an unsafe dispatch rule).
--      Values are enforced with a CHECK so only 1..5 (or NULL) can be stored.
--
--   2. rides.vehicle_type  — the vehicle the passenger requested for Ride Now,
--      constrained to motorcycle / umbak / tricycle. Legacy rides keep NULL
--      (they remain readable) and are dispatched exactly as before (no vehicle
--      filter), so existing ride history is untouched.
--
-- The driver's vehicle TYPE is the existing free-text drivers.vehicle_type
-- column (kept as-is so legacy driver rows remain valid). Dispatch normalises
-- the match at query time with lower(d.vehicle_type) against the constrained
-- ride value. Existing drivers stay valid: NULL capacity simply excludes them
-- from new Ride Now dispatch until the admin records their real capacity via
-- the driver management UI. Rides and drivers are never rewritten.

alter table public.drivers
  add column if not exists vehicle_capacity integer;

do $$
begin
  alter table public.drivers add constraint drivers_vehicle_capacity_check
    check (vehicle_capacity is null or (vehicle_capacity between 1 and 5));
exception
  when duplicate_object then null;
end $$;

alter table public.rides
  add column if not exists vehicle_type text;

do $$
begin
  alter table public.rides add constraint rides_vehicle_type_check
    check (vehicle_type in ('motorcycle', 'umbak', 'tricycle'));
exception
  when duplicate_object then null;
end $$;

-- Refresh the rider-facing driver_profiles view to expose vehicle_capacity
-- (same safe column projection as driver_accounts.sql, which now matches).
create or replace view public.driver_profiles
as
select
  d.id,
  d.full_name,
  d.profile_photo_url,
  d.vehicle_type,
  d.vehicle_model,
  d.vehicle_color,
  d.vehicle_capacity,
  d.plate_number,
  d.rating_average,
  d.total_ratings
from public.drivers d;

revoke all on public.driver_profiles from anon, authenticated, public;
grant select on public.driver_profiles to anon, authenticated, service_role;
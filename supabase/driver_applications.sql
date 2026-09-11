-- Driver interest applications — Become a Bislig Ride Driver
-- Public visitors submit an expression of interest; only authenticated
-- admins (JWT app_metadata role = 'admin') can read or update records.
--
-- Status values are limited to: pending, approved, rejected.

create table if not exists public.driver_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  mobile_number text not null,
  barangay text not null,
  email text not null,
  facebook_profile text not null,
  vehicle_number text not null,
  vehicle_type text,
  plate_number text,
  driving_experience integer not null check (driving_experience >= 0),
  operating_area text not null,
  preferred_schedule text not null check (preferred_schedule in ('Morning', 'Afternoon', 'Evening', 'Flexible')),
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Idempotent migration for an EXISTING table created from an older schema.
-- Safe to run against both an existing table and a freshly created one.
-- ---------------------------------------------------------------------------

-- 1. Add the new required Facebook field (existing rows get an empty string).
alter table public.driver_applications
  add column if not exists facebook_profile text not null default '';

-- 1b. Vehicle Type (Become a Driver form). Plain text, nullable, matching the
--     existing drivers.vehicle_type convention. See
--     driver_applications_vehicle_type.sql for the full rationale.
alter table public.driver_applications
  add column if not exists vehicle_type text;

-- 2. Remove the Contact Preference column completely (no longer part of the product).
alter table public.driver_applications
  drop column if exists contact_preference;

-- 3. Restrict application statuses to pending / approved / rejected.
--    (Any legacy 'contacted' rows are normalized to 'pending'.)
update public.driver_applications
  set status = 'pending'
  where status = 'contacted';

alter table public.driver_applications
  drop constraint if exists driver_applications_status_check;

alter table public.driver_applications
  add constraint driver_applications_status_check
  check (status in ('pending', 'approved', 'rejected'));

-- 4. Email is now a required field (backfill any legacy empty values first).
update public.driver_applications
  set email = ''
  where email is null;

alter table public.driver_applications
  alter column email set not null;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.driver_applications enable row level security;

create policy "Anyone can submit driver applications"
  on public.driver_applications for insert
  to anon, authenticated
  with check (true);

create policy "Authenticated admins can review driver applications"
  on public.driver_applications for select
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Authenticated admins can update driver applications"
  on public.driver_applications for update
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
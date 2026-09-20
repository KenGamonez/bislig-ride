-- Bislig Ride: Pa-Deliver scheduled delivery bookings (additive, idempotent).
-- Run this file in the Supabase SQL editor.
--
-- Scope (Pa-Deliver Phase 1 — booking + secure customer access):
--
--   public.deliveries stores one scheduled package-delivery request per row.
--   Anonymous senders book without an account; ownership is proven per-row by
--   access_token (consumed through narrow SECURITY DEFINER RPCs, never by
--   direct anonymous table reads).
--
-- Columns mirror the PaDeliverExperience v1 form plus lifecycle fields that
-- later phases need, so no structural migration is required afterward:
--
--   - sender_name / sender_phone (required contact)
--   - package_type (constrained to the v1 form list), package_details
--     (optional), package_size (required free text for v1)
--   - pickup_address / delivery_address (required free text; Bislig senders
--     use barangay names, landmarks, and informal descriptions)
--   - preferred_date / preferred_time (required schedule)
--   - vehicle_preference (nullable; unused in v1, reserved for Phase 2
--     vehicle matching — same pattern as Pakyawan)
--   - price_cents (nullable; fee is confirmed with the driver in v1, column
--     reserved for later automated pricing without a rewrite)
--   - status (full lifecycle set declared now so later phases never rewrite
--     the constraint; v1 bookings live in 'pending')
--   - driver_id (nullable; assigned in later phases)
--   - access_token (per-booking secret, UNIQUE, DB-generated)
--
-- What this does NOT create (later phases):
--
--   - No delivery_offers / dispatch / lifecycle / proof / ratings objects.
--   - No driver or customer mutation paths beyond row creation via RPC.
--   - No anonymous SELECT RLS policy (anonymous reads happen only through
--     the token-gated RPC in delivery_customer_access.sql).
--   - No Ride Now or Pakyawan changes (tables, RPCs, policies, UI untouched).

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users(id) on delete set null,
  sender_name text not null,
  sender_phone text not null,
  package_type text not null check (package_type in ('Documents', 'Parcels', 'Food', 'Clothing', 'Gadgets', 'Other')),
  package_details text,
  package_size text not null,
  pickup_address text not null,
  delivery_address text not null,
  preferred_date date not null,
  preferred_time time not null,
  vehicle_preference text,
  price_cents integer check (price_cents is null or price_cents >= 0),
  status text not null default 'pending' check (status in (
    'pending',
    'dispatching',
    'assigned',
    'driver_on_way',
    'driver_arrived',
    'picked_up',
    'in_transit',
    'delivered',
    'cancelled',
    'no_driver',
    'failed'
  )),
  driver_id uuid references public.drivers(id) on delete set null,
  access_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table public.deliveries
    add constraint deliveries_access_token_key unique (access_token);
exception
  when duplicate_object then null;
end $$;

alter table public.deliveries enable row level security;

-- Anyone (including anonymous senders) may submit a delivery request.
-- Reads/writes beyond insertion go through narrow SECURITY DEFINER RPCs;
-- there is deliberately no anonymous SELECT policy on this table.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'deliveries'
      and policyname = 'Anyone can submit delivery requests'
  ) then
    create policy "Anyone can submit delivery requests"
      on public.deliveries for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'deliveries'
      and policyname = 'Authenticated admins can review deliveries'
  ) then
    create policy "Authenticated admins can review deliveries"
      on public.deliveries for select
      to authenticated
      using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
  end if;
end $$;

-- Realtime publication for future driver offer alerts. Customers keep using
-- the secure token-RPC path; no anonymous table SELECT is created to make
-- realtime work.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'deliveries'
  ) then
    alter publication supabase_realtime add table public.deliveries;
  end if;
end $$;

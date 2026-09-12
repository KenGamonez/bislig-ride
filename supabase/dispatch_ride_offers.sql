-- Bislig Ride: Driver Dispatch V1 — ride_offers (dispatch ledger).
-- Run this file in the Supabase SQL editor after dispatch_driver_locations.sql
-- and rides_no_driver_status.sql (idempotent, additive).
--
-- Every time the engine decides which driver should be asked about a ride, it
-- writes a row here. The two constraints below are what make dispatch safe:
--
--   * unique (ride_id, driver_id, dispatch_round)  — a driver is never offered
--     the same ride twice in the same round (retries advance the round).
--   * partial unique index on (ride_id) WHERE status = 'offered' — there can
--     only ever be ONE unanswered offer for a ride, so two drivers can never
--     both accept the same ride: accept_ride_offer() runs under that invariant.
--
-- Offer lifecycle (all writes happen inside the security-definer dispatch
-- RPCs, never from the client):
--   offered    waiting for the driver (expires_at)
--   accepted   driver took it -> rides.status becomes 'accepted'
--   declined   driver said no -> engine dispatches the next candidate
--   expired    acceptance window elapsed with no decision
--   withdrawn  the ride was cancelled/completed before a decision

create table if not exists public.ride_offers (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  driver_id uuid references public.drivers (id) on delete set null,
  dispatch_round integer not null default 1,
  status text not null default 'offered'
    check (status in ('offered', 'accepted', 'declined', 'expired', 'withdrawn')),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz
);

create unique index if not exists ride_offers_ride_driver_round_uniq
  on public.ride_offers (ride_id, driver_id, dispatch_round);

create unique index if not exists ride_offers_one_live_offer_idx
  on public.ride_offers (ride_id)
  where status = 'offered';

create index if not exists ride_offers_driver_live_idx
  on public.ride_offers (driver_id)
  where status = 'offered';

alter table public.ride_offers enable row level security;

drop policy if exists "Drivers can view their own ride offers" on public.ride_offers;
create policy "Drivers can view their own ride offers"
  on public.ride_offers
  for select
  to authenticated
  using (
    driver_id = (select id from public.drivers where auth_user_id = auth.uid())
  );

drop policy if exists "Admins can manage ride offers" on public.ride_offers;
create policy "Admins can manage ride offers"
  on public.ride_offers
  for all
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ride_offers'
  ) then
    alter publication supabase_realtime add table public.ride_offers;
  end if;
end $$;
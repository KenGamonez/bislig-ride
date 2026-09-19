-- Bislig Ride: pakyawan_offers ledger for automated driver dispatch (Phase A).
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Scope (Phase A foundation only):
--
--   Individual automated driver offers live here — one row per driver per
--   dispatch round. The booking itself stays pending while offers are
--   outstanding; an offer expiring never expires the booking, which can later
--   be redispatched in a new round.
--
--   Offer TTL is exactly 30 minutes PER INDIVIDUAL OFFER
--   (offered_at + 30 minutes = expires_at), set by the future dispatch logic.
--   Phase A creates no offers and no dispatch logic.
--
--   Phase B (NOT in this file) will add: dispatch core, offer-creation RPC,
--   atomic accept/decline RPCs, redispatch, and the retirement of the legacy
--   direct-UPDATE self-assign path.
--
-- What this does NOT change:
--
--   - No existing tables modified. No RLS policies on other tables touched.
--   - No anonymous access: no anon SELECT/INSERT/UPDATE/DELETE policies and
--     no table GRANTs for anon. All future offer writes go through
--     SECURITY DEFINER RPCs (Phase B), which is why this table intentionally
--     has NO INSERT/UPDATE/DELETE policies at all.
--   - No Ride Now changes (rides, ride_offers, driver_locations, dispatch_*
--     RPCs, fare, GPS, ratings all untouched).

create table if not exists public.pakyawan_offers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.pakyawan_bookings(id) on delete cascade,
  driver_id uuid not null references public.drivers(id),
  dispatch_round integer not null check (dispatch_round >= 1),
  status text not null check (status in ('offered', 'accepted', 'declined', 'expired', 'withdrawn')),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz
);

-- One offer per driver per booking per round (allows future redispatch rounds).
do $$
begin
  alter table public.pakyawan_offers
    add constraint pakyawan_offers_booking_driver_round_uniq
    unique (booking_id, driver_id, dispatch_round);
exception
  when duplicate_object then null;
end $$;

-- Foundation for eventual first-valid-acceptance: a booking can never hold
-- two simultaneously live offers. Redispatch rounds are unaffected because
-- only status = 'offered' rows are constrained.
do $$
begin
  create unique index if not exists pakyawan_offers_one_live_offer_idx
    on public.pakyawan_offers (booking_id)
    where status = 'offered';
exception
  when duplicate_object then null;
end $$;

-- Driver lookup of active offers.
do $$
begin
  create index if not exists pakyawan_offers_driver_live_idx
    on public.pakyawan_offers (driver_id)
    where status = 'offered';
exception
  when duplicate_object then null;
end $$;

-- Booking lookup.
do $$
begin
  create index if not exists pakyawan_offers_booking_idx
    on public.pakyawan_offers (booking_id);
exception
  when duplicate_object then null;
end $$;

-- Expiry scans.
do $$
begin
  create index if not exists pakyawan_offers_expires_idx
    on public.pakyawan_offers (expires_at);
exception
  when duplicate_object then null;
end $$;

alter table public.pakyawan_offers enable row level security;

-- Drivers see ONLY their own offers. No anonymous access.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pakyawan_offers'
      and policyname = 'Drivers can view their own Pakyawan offers'
  ) then
    create policy "Drivers can view their own Pakyawan offers"
      on public.pakyawan_offers for select
      to authenticated
      using (
        driver_id = (select d.id from public.drivers d where d.auth_user_id = auth.uid())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pakyawan_offers'
      and policyname = 'Authenticated admins can review Pakyawan offers'
  ) then
    create policy "Authenticated admins can review Pakyawan offers"
      on public.pakyawan_offers for select
      to authenticated
      using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
  end if;
end $$;

-- Realtime for future driver offer alerts (same pattern as pakyawan_bookings).
-- Customers keep using the secure token-RPC/polling path; no anonymous
-- table SELECT is created to make realtime work.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pakyawan_offers'
  ) then
    alter publication supabase_realtime add table public.pakyawan_offers;
  end if;
end $$;

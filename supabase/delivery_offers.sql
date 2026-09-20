-- Bislig Ride: delivery_offers ledger for automated driver dispatch (Phase 2).
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Scope (Phase 2 foundation only):
--
--   Individual automated driver offers live here — one row per driver per
--   dispatch round. The delivery itself stays pending/dispatching while offers
--   are outstanding; an offer expiring never expires the delivery, which can
--   later be redispatched in a new round.
--
--   Offer TTL is exactly 15 minutes PER INDIVIDUAL OFFER
--   (offered_at + 15 minutes = expires_at), set by the dispatch logic.
--   Pa-Deliver is a more immediate local service than Pakyawan, so the
--   30-minute Pakyawan TTL is deliberately NOT copied.
--
--   Acceptance is Phase 3 and is NOT implemented here (no accept RPC, no
--   assignment, no withdrawal in this file).
--
-- What this does NOT change:
--
--   - No existing tables modified. No RLS policies on other tables touched.
--   - No anonymous access: no anon SELECT/INSERT/UPDATE/DELETE policies and
--     no table GRANTs for anon. All future offer writes go through
--     SECURITY DEFINER RPCs, which is why this table intentionally has NO
--     INSERT/UPDATE/DELETE policies at all.
--   - No Ride Now or Pakyawan changes (dispatch cores, offers, presence,
--     GPS, fare, ratings, UI untouched). All new objects use delivery_*
--     naming and remain isolated.

create table if not exists public.delivery_offers (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  driver_id uuid not null references public.drivers(id),
  dispatch_round integer not null check (dispatch_round >= 1),
  status text not null check (status in ('offered', 'accepted', 'declined', 'expired', 'withdrawn')),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz
);

-- One offer per driver per delivery per round (allows future redispatch rounds).
do $$
begin
  alter table public.delivery_offers
    add constraint delivery_offers_delivery_driver_round_uniq
    unique (delivery_id, driver_id, dispatch_round);
exception
  when duplicate_object then null;
end $$;

-- Foundation for eventual first-valid-acceptance: a delivery can never hold
-- two simultaneously live offers. Redispatch rounds are unaffected because
-- only status = 'offered' rows are constrained.
do $$
begin
  create unique index if not exists delivery_offers_one_live_offer_idx
    on public.delivery_offers (delivery_id)
    where status = 'offered';
exception
  when duplicate_object then null;
end $$;

-- Driver lookup of active offers.
do $$
begin
  create index if not exists delivery_offers_driver_live_idx
    on public.delivery_offers (driver_id)
    where status = 'offered';
exception
  when duplicate_object then null;
end $$;

-- Delivery lookup.
do $$
begin
  create index if not exists delivery_offers_delivery_idx
    on public.delivery_offers (delivery_id);
exception
  when duplicate_object then null;
end $$;

-- Expiry scans.
do $$
begin
  create index if not exists delivery_offers_expires_idx
    on public.delivery_offers (expires_at);
exception
  when duplicate_object then null;
end $$;

alter table public.delivery_offers enable row level security;

-- Drivers see ONLY their own offers. No anonymous access.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'delivery_offers'
      and policyname = 'Drivers can view their own delivery offers'
  ) then
    create policy "Drivers can view their own delivery offers"
      on public.delivery_offers for select
      to authenticated
      using (
        driver_id = (select d.id from public.drivers d where d.auth_user_id = auth.uid())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'delivery_offers'
      and policyname = 'Authenticated admins can review delivery offers'
  ) then
    create policy "Authenticated admins can review delivery offers"
      on public.delivery_offers for select
      to authenticated
      using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
  end if;
end $$;

-- Realtime for future driver offer alerts (same pattern as pakyawan_offers).
-- Customers keep using secure token-RPC/polling paths; no anonymous table
-- SELECT is created to make realtime work.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'delivery_offers'
  ) then
    alter publication supabase_realtime add table public.delivery_offers;
  end if;
end $$;

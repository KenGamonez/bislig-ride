-- Bislig Ride: Pakyawan quoted price (schema only — no RLS changes, no destructive writes).
-- Run this file in the Supabase SQL editor (idempotent).
--
-- What this adds:
--
--   1. pakyawan_bookings.price_cents — the admin-quoted Pakyawan price,
--      stored as DATA (integer cents). NULL means "not yet quoted", which is
--      the correct state for every new pending booking and for all existing
--      rows (they are left untouched — no backfill).
--      Values are enforced with a CHECK so only NULL or >= 0 can be stored.
--
-- What this does NOT change:
--
--   - No existing columns are modified or renamed.
--   - No existing rows are rewritten (0-row table today; backfill explicitly skipped).
--   - No status values are added, removed, or renamed.
--   - No RLS policies are added, removed, or altered — the driver self-assign
--     path (eligible active drivers updating pending rows) works exactly as before.
--   - No frontend changes. No fare-engine changes. No dispatch/GPS changes.
--   - Nothing outside public.pakyawan_bookings is touched.

alter table public.pakyawan_bookings
  add column if not exists price_cents integer;

do $$
begin
  alter table public.pakyawan_bookings add constraint pakyawan_bookings_price_cents_check
    check (price_cents is null or price_cents >= 0);
exception
  when duplicate_object then null;
end $$;

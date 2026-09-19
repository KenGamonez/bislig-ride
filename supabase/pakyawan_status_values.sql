-- Bislig Ride: Pakyawan automated-platform status foundation (additive, idempotent).
-- Run this file in the Supabase SQL editor.
--
-- Scope (Phase A only):
--
--   Extend the pakyawan_bookings.status CHECK with exactly three new states:
--   scheduled, driver_on_way, driver_arrived. The seven existing states keep
--   their exact current meaning:
--
--     pending → quoted → confirmed → assigned → scheduled
--       → driver_on_way → driver_arrived → in_progress → completed
--     (plus cancelled from appropriate states in a later phase)
--
--   Deliberately NOT added: dispatching, negotiating, price_proposed, or any
--   other workflow state. Those are implementation concepts tracked elsewhere
--   (e.g. the pakyawan_offers ledger), not booking states.
--
-- What this does NOT change:
--
--   - No columns added, modified, or renamed. No rows rewritten (verified
--     0-row table before applying; the constraint is a superset so every
--     existing row stays valid regardless).
--   - No RLS policies added, removed, or altered.
--   - No RPCs created or redefined. No frontend changes. No Ride Now changes
--     (rides statuses, dispatch RPCs, and all Ride Now SQL untouched).

alter table public.pakyawan_bookings
  drop constraint if exists pakyawan_bookings_status_check;

do $$
begin
  alter table public.pakyawan_bookings
    add constraint pakyawan_bookings_status_check
    check (status in (
      'pending',
      'quoted',
      'confirmed',
      'assigned',
      'scheduled',
      'driver_on_way',
      'driver_arrived',
      'in_progress',
      'completed',
      'cancelled'
    ));
exception
  when duplicate_object then null;
end $$;

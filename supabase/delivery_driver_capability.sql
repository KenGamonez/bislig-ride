-- Bislig Ride: Pa-Deliver driver delivery capability (additive, idempotent).
-- Run this file in the Supabase SQL editor.
--
-- Scope (Pa-Deliver Phase 2):
--
--   Adds drivers.can_accept_deliveries boolean NOT NULL DEFAULT false.
--   Package delivery is a different driver capability/willingness than
--   passenger/private-hire work, so the existing can_accept_pakyawan flag is
--   NOT reused. Existing drivers default to FALSE; no driver is automatically
--   enabled for delivery. (Admin enablement UI is a later concern; the flag
--   can be set per driver when needed.)
--
-- What this does NOT change:
--
--   - No existing columns modified. No RLS policies touched. No RPCs.
--   - No Ride Now or Pakyawan changes.

alter table public.drivers
  add column if not exists can_accept_deliveries boolean not null default false;

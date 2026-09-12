-- Bislig Ride: Driver Dispatch V1 — RLS hardening.
-- Run this file in the Supabase SQL editor AFTER the Phase 2 dispatch RPCs are
-- live (dispatch_accept_offer.sql, dispatch_advance_status.sql). Idempotent.
--
-- Why: dispatch moved all assignment and lifecycle writes inside the
-- security-definer RPCs (dispatch_ride / accept_ride_offer /
-- decline_ride_offer / advance_ride_status / save_ride_rating / cancel_ride),
-- so the two broad rides UPDATE policies from driver_deactivation_rls.sql are
-- no longer needed in their old form and were actively dangerous:
--
--   1. "Active drivers can update their rides" — the `rides.status='requested'
--      and rides.driver_id is null` leg let ANY active driver first-come-first-
--      served claim ANY pending ride with a plain UPDATE, bypassing dispatch
--      entirely. That leg is removed: a driver can now only UPDATE rides they
--      are ALREADY assigned to (a legacy-session fallback only; the blessed
--      path is the RPCs which re-validate + re-check GPS + enforce transitions).
--   2. "Customers can update their own rides" — an UPDATE policy can only
--      constrain the *new* row, never diff old vs new, so a customer could
--      smuggle driver_id/status changes through their rating backfill UPDATE.
--      Customer write paths now run through cancel_ride() and save_ride_rating()
--      only, so this policy is dropped outright (same approach the codebase
--      already took for cancellations).
--
-- Rides INSERT and SELECT policies are left untouched (createRide/offers read
-- still work exactly as before). NOTE: live RLS policies could not be
-- introspected from this repo (no DB URL/service-role), so this file only
-- rewrites the two named policies above; nothing else is touched.

-- ---------------------------------------------------------------------------
-- 1. Remove the "claim any requested ride" leg for drivers
-- ---------------------------------------------------------------------------

drop policy if exists "Active drivers can update their rides" on public.rides;

create policy "Active drivers can update their assigned rides"
  on public.rides
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.drivers d
      where d.auth_user_id = auth.uid()
        and d.status = 'active'
        and d.id = rides.driver_id
    )
  )
  with check (
    exists (
      select 1
      from public.drivers d
      where d.auth_user_id = auth.uid()
        and d.status = 'active'
        and d.id = rides.driver_id
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Customers no longer hold any direct UPDATE capability on rides
-- ---------------------------------------------------------------------------

drop policy if exists "Customers can update their own rides" on public.rides;
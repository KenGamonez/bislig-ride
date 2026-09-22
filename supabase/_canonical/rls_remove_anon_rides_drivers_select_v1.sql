-- ============================================================================
-- BISLIG RIDE — REMOVE LEGACY ANON SELECT (P1.8B implementation)
-- Project: epsxgqoqfrwymktjvujs ("Bislig Ride", ap-northeast-1)
-- Date: 2026-09-22
--
-- PURPOSE (P1.8B audit step 1 — safe first step only)
--   Remove the legacy anonymous role from the two prototype SELECT
--   policies. Audit (P1.8B) verified every application read runs under
--   an authenticated session (customers via automatic anonymous
--   sign-in, drivers post-password, admins) and found zero true-anon
--   table readers, so no workflow depends on the anon role.
--
-- SCOPE — role list ONLY:
--   public.rides   "Prototype users can view rides":   {anon,authenticated} -> {authenticated}
--   public.drivers "Prototype users can view drivers": {anon,authenticated} -> {authenticated}
-- Unchanged: policy names, USING (true), all other policies, all
-- INSERT/UPDATE/DELETE policies, all RPCs, all grants, publication
-- membership, and the broader authenticated USING(true) exposure
-- (deliberately left for a later per-row-scoping hardening phase).
--
-- IDEMPOTENCY
--   ALTER POLICY ... TO is re-runnable. Safe to re-apply.
-- ============================================================================

alter policy "Prototype users can view rides"
  on public.rides
  to authenticated;

alter policy "Prototype users can view drivers"
  on public.drivers
  to authenticated;

-- End of rls_remove_anon_rides_drivers_select v1.

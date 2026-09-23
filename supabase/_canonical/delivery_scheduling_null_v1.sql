-- ============================================================================
-- BISLIG RIDE — PA-DELIVER NOW VS SCHEDULED (scheduling nullability)
-- Project: epsxgqoqfrwymktjvujs ("Bislig Ride", ap-northeast-1)
-- Date: 2026-09-23
--
-- PURPOSE
--   Let preferred_date / preferred_time be NULL for immediate (NOW)
--   deliveries, and gate driver self-assignment so future-scheduled
--   deliveries are not treated as immediate jobs.
--
-- SEMANTICS (Manila wall-clock; Bislig has no DST)
--   - preferred_date IS NULL  => ASAP immediate delivery, always eligible.
--   - preferred_date + preferred_time interpreted in Asia/Manila and
--     compared against now(): eligible only once due.
--   - Half-set rows (date without time or vice versa) evaluate to NULL
--     and are therefore excluded from dispatch — fail closed. The
--     customer form requires both together, so these cannot occur
--     through the UI.
--
-- SCOPE
--   1. Drop NOT NULL on both columns (existing rows all have values;
--      nothing is backfilled or altered).
--   2. Extend ONLY the eligible-driver UPDATE policy with the due
--      predicate. WITH CHECK, roles, and all other policies unchanged.
--   3. No RPC changes (create/accept/price/confirm read the columns
--      as-is; NULL flows through). No trigger/worker/cron changes.
--      No RLS changes beyond this one predicate. No dispatch-core
--      changes (dormant path; gated if ever wired).
--
-- IDEMPOTENCY
--   ALTER ... DROP NOT NULL is a safe no-op when already nullable.
--   DROP POLICY IF EXISTS + CREATE. Safe to re-apply.
-- ============================================================================

alter table public.deliveries
  alter column preferred_date drop not null;

alter table public.deliveries
  alter column preferred_time drop not null;

drop policy if exists "Eligible active drivers can accept delivery requests"
  on public.deliveries;

create policy "Eligible active drivers can accept delivery requests"
  on public.deliveries
  for update
  to authenticated
  using (
    (driver_id IS NULL)
    AND (status = ANY (ARRAY['pending'::text, 'dispatching'::text]))
    AND (
      (preferred_date IS NULL)
      OR ((preferred_date + preferred_time) AT TIME ZONE 'Asia/Manila' <= now())
    )
    AND (EXISTS (
      SELECT 1
        FROM drivers d
       WHERE ((d.auth_user_id = auth.uid())
         AND (d.can_accept_deliveries = true)
         AND (d.status = 'active'::text))
    ))
  )
  with check (
    (driver_id = (
      SELECT drivers.id
        FROM drivers
       WHERE ((drivers.auth_user_id = auth.uid())
         AND (drivers.status = 'active'::text))
    ))
  );

-- End of delivery_scheduling_null v1.

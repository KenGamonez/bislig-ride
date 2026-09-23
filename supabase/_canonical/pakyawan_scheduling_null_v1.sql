-- ============================================================================
-- BISLIG RIDE — PAKYAWAN NOW VS SCHEDULED (scheduling nullability)
-- Project: epsxgqoqfrwymktjvujs ("Bislig Ride", ap-northeast-1)
-- Date: 2026-09-24
--
-- PURPOSE
--   Let booking_date / pickup_time be NULL for immediate (NOW)
--   Pakyawan bookings, and gate driver self-assignment so future-
--   scheduled bookings are not treated as immediate jobs.
--
-- SEMANTICS (Manila wall-clock; Bislig has no DST)
--   - booking_date IS NULL  => ASAP immediate booking, always eligible.
--   - booking_date + pickup_time interpreted in Asia/Manila and
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
--   3. No RPC changes (create/accept read the columns as-is; NULL flows
--      through). No trigger/worker/cron changes.
--   4. No dispatch-core changes (dormant path; gated if ever wired).
--
-- IDEMPOTENCY
--   ALTER ... DROP NOT NULL is a safe no-op when already nullable.
--   DROP POLICY IF EXISTS + CREATE. Safe to re-apply.
-- ============================================================================

alter table public.pakyawan_bookings
  alter column booking_date drop not null;

alter table public.pakyawan_bookings
  alter column pickup_time drop not null;

drop policy if exists "Eligible active drivers can accept Pakyawan requests"
  on public.pakyawan_bookings;

create policy "Eligible active drivers can accept Pakyawan requests"
  on public.pakyawan_bookings
  for update
  to authenticated
  using (
    (status = 'pending'::text) AND (EXISTS (
      SELECT 1
        FROM drivers d
       WHERE ((d.auth_user_id = auth.uid())
         AND (d.can_accept_pakyawan = true)
         AND (d.status = 'active'::text))
    ))
    AND (
      (booking_date IS NULL)
      OR ((booking_date + pickup_time) AT TIME ZONE 'Asia/Manila' <= now())
    )
  )
  with check (
    (driver_id = (
      SELECT drivers.id
        FROM drivers
       WHERE ((drivers.auth_user_id = auth.uid())
         AND (drivers.status = 'active'::text))
    ))
    AND (status = 'assigned'::text)
  );

-- End of pakyawan_scheduling_null v1.

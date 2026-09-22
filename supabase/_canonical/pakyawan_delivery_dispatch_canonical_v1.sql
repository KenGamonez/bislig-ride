-- ============================================================================
-- BISLIG RIDE — PAKYAWAN/PA-DELIVER CANONICAL DISPATCH v1 (P1.12)
-- Project: epsxgqoqfrwymktjvujs ("Bislig Ride", ap-northeast-1)
-- Date: 2026-09-22
--
-- ARCHITECTURE DECISION: (A) LEGACY PULL CANONICAL
--   Production dispatch for Pakyawan and Pa-Deliver is driver legacy
--   pull (pending/dispatching + driverless -> assigned via direct
--   UPDATE). Verified live: zero offer rows have ever existed; the
--   dispatch wrappers/workers/sweepers have no UI, trigger, or
--   scheduler callers; no pg_cron/pg_net exists. Offer-dispatch RPCs
--   are preserved untouched for possible future work but are NOT the
--   production path. No worker, trigger, or background infrastructure
--   is introduced here.
--
-- SECURITY FIX IN THIS FILE (verified live P1.12 audit)
--   The eligible-driver UPDATE policies constrained driver_id but not
--   the target status, so a client could self-assign AND jump status in
--   one write (e.g. pending -> completed), bypassing price/confirm/
--   advance RPCs. WITH CHECK now additionally requires the new row to
--   be status = 'assigned'. The only legitimate direct-UPDATE writers
--   (acceptPakyawanBooking, acceptDeliveryBooking) write exactly
--   assigned + own driver_id, so no workflow changes.
--
-- SCOPE
--   Two UPDATE policies only. No RPC, trigger, RLS-SELECT, grant,
--   publication, UI, or state-machine changes.
--
-- IDEMPOTENCY
--   DROP IF EXISTS + CREATE. Safe to re-apply.
-- ============================================================================

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

drop policy if exists "Eligible active drivers can accept delivery requests"
  on public.deliveries;

create policy "Eligible active drivers can accept delivery requests"
  on public.deliveries
  for update
  to authenticated
  using (
    (driver_id IS NULL)
    AND (status = ANY (ARRAY['pending'::text, 'dispatching'::text]))
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
    AND (status = 'assigned'::text)
  );

-- End of pakyawan_delivery_dispatch_canonical v1.

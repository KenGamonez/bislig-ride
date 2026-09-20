-- Bislig Ride: Pa-Deliver driver pull / self-assign parity with Pakyawan
-- (additive, idempotent).
-- Run this file in the Supabase SQL editor.
--
-- Problem:
--
--   Pakyawan works in production through a driver pull model: an eligible
--   driver can SELECT pending pakyawan_bookings rows ("Eligible active
--   drivers can view Pakyawan requests"), sees them instantly via Realtime,
--   and self-assigns with a conditional UPDATE ("Eligible active drivers can
--   accept Pakyawan requests", first writer wins). No scheduler, trigger, or
--   dispatch core is involved in that path.
--
--   public.deliveries has no equivalent: drivers can only SELECT rows already
--   assigned to them ("Assigned drivers can view their deliveries"), so an
--   unassigned pending delivery is invisible to every driver and can only
--   reach one through delivery_offers rows produced by the (currently
--   unscheduled) dispatch worker.
--
-- What this adds (minimum required, mirrors Pakyawan exactly):
--
--   1. GRANT UPDATE ON public.deliveries TO authenticated
--      Driver self-assign performs a client-side UPDATE, so the new UPDATE
--      policy below can only take effect with this grant. Same requirement
--      as pakyawan_table_grants.sql item 3. SELECT was already granted in
--      delivery_driver_lifecycle.sql; GRANTs are re-runnable.
--
--   2. Policy "Eligible active drivers can view delivery requests" (SELECT)
--      Mirrors "Eligible active drivers can view Pakyawan requests"
--      (driver_deactivation_rls.sql): the caller's own assigned rows, plus
--      unassigned rows in a claimable status (pending/dispatching) when the
--      caller is an active driver with can_accept_deliveries = true.
--
--   3. Policy "Eligible active drivers can accept delivery requests" (UPDATE)
--      Mirrors "Eligible active drivers can accept Pakyawan requests": the
--      existing row must be unassigned (driver_id IS NULL) with status
--      pending/dispatching and the caller must be an active driver with
--      can_accept_deliveries = true; the resulting row must carry the
--      caller's own active driver id. First writer wins: a concurrent claim
--      matches zero rows under USING once driver_id/status moves.
--
-- What this does NOT change:
--
--   - No pg_cron. No triggers. No new dispatch system. No change to
--     delivery_dispatch.sql, delivery_lifecycle.sql, delivery_offers.sql,
--     delivery_accept_offer.sql, or delivery_customer_access.sql.
--   - No Pakyawan files. No Ride Now, fares, GPS/presence, proof, or
--     customer-booking-flow changes. No new tables or columns.
--   - No broad UPDATE access: the USING clause limits which existing rows
--     an eligible driver can update (unassigned + pending/dispatching
--     only), and WITH CHECK constrains the resulting driver_id to the
--     authenticated driver's own active driver record. RLS does NOT
--     provide column-level protection for other columns; the frontend
--     accept flow intentionally updates only driver_id and status. This
--     limitation mirrors the existing Pakyawan driver self-assign RLS
--     pattern exactly.
--   - No anonymous SELECT. No DELETE grants. No GRANT ALL.
--
-- Security boundary unchanged:
--
--   GRANTs only decide which roles may reach the table at all. Row-level
--   access is governed entirely by the RLS policies below plus the existing
--   delivery policies, which this file does not touch.

-- Table-level UPDATE grant required by the client-side self-assign UPDATE
-- (PostgreSQL checks GRANTs before RLS; mirrors pakyawan_table_grants.sql).
grant update on public.deliveries to authenticated;

drop policy if exists "Eligible active drivers can view delivery requests" on public.deliveries;
drop policy if exists "Eligible active drivers can accept delivery requests" on public.deliveries;

create policy "Eligible active drivers can view delivery requests"
  on public.deliveries
  for select
  to authenticated
  using (
    driver_id = (select id from public.drivers where auth_user_id = auth.uid())
    or (
      driver_id is null
      and status in ('pending', 'dispatching')
      and exists (
        select 1 from public.drivers d
        where d.auth_user_id = auth.uid()
          and d.can_accept_deliveries = true
          and d.status = 'active'
      )
    )
  );

create policy "Eligible active drivers can accept delivery requests"
  on public.deliveries
  for update
  to authenticated
  using (
    driver_id is null
    and status in ('pending', 'dispatching')
    and exists (
      select 1 from public.drivers d
      where d.auth_user_id = auth.uid()
        and d.can_accept_deliveries = true
        and d.status = 'active'
    )
  )
  with check (
    driver_id = (
      select id from public.drivers
      where auth_user_id = auth.uid() and status = 'active'
    )
  );

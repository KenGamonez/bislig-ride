-- Bislig Ride: Pakyawan automated platform, PHASE B4 — redispatch worker.
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Scope (B4 only — controlled automatic redispatch orchestration):
--
--   public.run_pakyawan_redispatch_worker()
--   A single orchestration point that, per invocation:
--
--     1. Retires lapsed offers: offered rows with expires_at <= now()
--        become expired + decided_at (accepted/declined/withdrawn untouched;
--        bookings never cancelled by this step).
--     2. Finds pending bookings with no assigned driver, no live offered
--        offer, and no accepted offer (declined/expired/withdrawn history
--        never blocks).
--     3. Runs each through br_pakyawan_dispatch_core(), the B1 single source
--        of truth for eligibility/rounds/offers. No eligibility, capacity,
--        preference, conflict, round, TTL, or offer-creation logic is
--        duplicated here.
--
-- Scheduling model (no in-database scheduler exists in this project — no
-- pg_cron/pg_net extension, no Edge Functions directory):
--
--   The worker itself carries no timer. Attach it with the first available
--   supported scheduler, in this order of preference:
--     a. Supabase Dashboard → Database → Cron Jobs (enables pg_cron), e.g.
--        every 5 minutes: SELECT run_pakyawan_redispatch_worker();
--        5 minutes keeps expired-offer recognition and redispatch prompt
--        without aggressive polling on small tables (indexed booking/status
--        and expires_at scans).
--     b. An Edge Function on a schedule (service_role key, server-side only)
--        calling the worker via RPC.
--   Until a scheduler is attached, the worker is directly testable and
--   manually invokable with full idempotency (see below).
--
-- Idempotency / overlapping executions:
--
--   - A transaction-scoped advisory lock
--     (pg_try_advisory_xact_lock(hashtext('pakyawan-redispatch-worker')))
--     makes overlapping runs safe: a second concurrent worker returns a
--     zeroed summary immediately instead of double-processing.
--   - Repeated sequential runs are safe: the B1 core short-circuits live
--     rounds, the unique (booking, driver, round) constraint backstops
--     duplicates, and only pending/unassigned bookings are considered — a
--     booking can never be double-assigned or cancelled by this worker.
--
-- Authorization:
--
--   No JWT role check inside (a scheduler runs without a user JWT). Instead,
--   EXECUTE is granted ONLY to service_role (plus the postgres owner by
--   default); anon and authenticated are revoked. No client can invoke it.
--
-- What this does NOT implement:
--
--   - No triggers, no cron job creation (extension unavailable), no
--     recursive dispatch, no immediate dispatch from decline/expiry.
--   - No accept/decline/price/lifecycle/chat/ratings/UI changes.
--   - No RLS policy or table GRANT changes. No Ride Now changes
--     (dispatch core, offers, presence, GPS, fare, ratings, UI untouched).

create or replace function public.run_pakyawan_redispatch_worker()
returns table (expired_offers integer, bookings_processed integer, rounds_created integer)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_expired integer := 0;
  v_processed integer := 0;
  v_rounds integer := 0;
  v_booking_id uuid;
  v_created integer;
begin
  -- Only one worker runs at a time; a concurrent invocation exits quietly.
  if not pg_try_advisory_xact_lock(hashtext('pakyawan-redispatch-worker')) then
    return query select 0, 0, 0;
    return;
  end if;

  -- 1. Retire lapsed offers. Bookings stay pending for redispatch below.
  update public.pakyawan_offers
     set status = 'expired', decided_at = now()
   where status = 'offered'
     and expires_at <= now();

  get diagnostics v_expired = row_count;

  -- 2-3. Redispatch each pending, unassigned booking with no live round.
  for v_booking_id in
    select b.id
      from public.pakyawan_bookings b
     where b.status = 'pending'
       and b.driver_id is null
       and not exists (
         select 1 from public.pakyawan_offers o
          where o.booking_id = b.id
            and o.status = 'offered'
            and o.expires_at > now()
       )
       and not exists (
         select 1 from public.pakyawan_offers o
          where o.booking_id = b.id
            and o.status = 'accepted'
       )
     order by b.booking_date, b.pickup_time
  loop
    v_processed := v_processed + 1;

    select count(*) into v_created
      from public.br_pakyawan_dispatch_core(v_booking_id);

    if v_created > 0 then
      v_rounds := v_rounds + 1;
    end if;
  end loop;

  return query select v_expired, v_processed, v_rounds;
end;
$$;

revoke all on function public.run_pakyawan_redispatch_worker() from public;
revoke all on function public.run_pakyawan_redispatch_worker() from anon, authenticated;
grant execute on function public.run_pakyawan_redispatch_worker() to service_role;

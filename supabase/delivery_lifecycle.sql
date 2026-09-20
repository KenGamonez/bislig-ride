-- Bislig Ride: Pa-Deliver offer expiry + redispatch foundation, PHASE 2.
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Scope (Phase 2 expiration/redispatch only):
--
--   1. public.expire_delivery_offers()
--      Admin-gated SECURITY DEFINER sweeper. Converts every currently
--      'offered' row with expires_at <= now() to 'expired' + decided_at and
--      returns the retired count. Never touches accepted/declined/withdrawn
--      rows and never cancels deliveries: expired offers leave the delivery
--      pending/dispatching for a future round.
--
--   2. public.delivery_redispatch_eligible(p_delivery_id uuid)
--      Admin-gated SECURITY DEFINER read helper. Reports whether a delivery
--      may take another dispatch round: status pending/dispatching, no
--      assigned driver, no live 'offered' offer, no 'accepted' offer.
--      Declined, expired, and withdrawn history never blocks redispatch.
--
--   3. public.run_delivery_redispatch_worker()
--      Controlled automatic redispatch orchestration (no timer of its own —
--      attach via Dashboard Cron Jobs or a service_role Edge Function when a
--      scheduler is available, same model as the Pakyawan worker). Per run:
--        a. Retire lapsed offers (same rule as the sweeper).
--        b. For each pending/dispatching delivery with no assigned driver,
--           no live offer, and no accepted offer: increment dispatch_attempts
--           and run it through br_delivery_dispatch_core().
--        c. If a round produces zero offers (no eligible drivers) and the
--           delivery has now reached 3 attempts, mark it no_driver.
--           Conservative limit, documented here: 3 empty rounds. The booking
--           is never cancelled by this worker.
--      Per-booking errors are contained so one bad row cannot abort the run.
--      A transaction-scoped advisory lock makes overlapping runs safe.
--
-- Authorization:
--
--   Sweeper and eligibility check follow the admin-gated pattern (grant to
--   authenticated, role verified inside). The worker carries no JWT check —
--   a scheduler runs without a user JWT — so EXECUTE is granted ONLY to
--   service_role (plus postgres by default); anon and authenticated are
--   revoked. No client can invoke it.
--
-- What this does NOT implement:
--
--   - No accept/decline RPCs (Phase 3), no price proposal, no lifecycle
--     advance, no chat, no ratings, no UI of any kind.
--   - No triggers, no cron job creation, no recursive dispatch, no immediate
--     dispatch from decline/expiry.
--   - No RLS policy changes beyond this file's scope (none needed). No table
--     GRANT changes. No Ride Now or Pakyawan changes (dispatch cores,
--     offers, presence, GPS, fare, ratings, UI untouched).

-- ---------------------------------------------------------------------------
-- 1. Controlled expiry sweep for lapsed offers.
-- ---------------------------------------------------------------------------

create or replace function public.expire_delivery_offers()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
  v_retired integer;
begin
  v_role := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');

  if v_role <> 'admin' then
    raise exception 'Only an administrator can expire delivery offers.';
  end if;

  update public.delivery_offers
     set status = 'expired', decided_at = now()
   where status = 'offered'
     and expires_at <= now();

  get diagnostics v_retired = row_count;
  return v_retired;
end;
$$;

revoke all on function public.expire_delivery_offers() from public;
grant execute on function public.expire_delivery_offers() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Redispatch-readiness check (read-only; dispatch itself stays in core).
-- ---------------------------------------------------------------------------

create or replace function public.delivery_redispatch_eligible(p_delivery_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
  v_delivery public.deliveries;
begin
  v_role := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');

  if v_role <> 'admin' then
    raise exception 'Only an administrator can check delivery redispatch eligibility.';
  end if;

  if p_delivery_id is null then
    raise exception 'A delivery id is required.';
  end if;

  select * into v_delivery
    from public.deliveries
   where id = p_delivery_id;

  if not found then
    raise exception 'Delivery not found.';
  end if;

  if (v_delivery.status <> 'pending' and v_delivery.status <> 'dispatching')
    or v_delivery.driver_id is not null
  then
    return false;
  end if;

  if exists (
    select 1 from public.delivery_offers o
     where o.delivery_id = p_delivery_id
       and o.status = 'offered'
       and o.expires_at > now()
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.delivery_offers o
     where o.delivery_id = p_delivery_id
       and o.status = 'accepted'
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.delivery_redispatch_eligible(uuid) from public;
grant execute on function public.delivery_redispatch_eligible(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Redispatch worker (orchestrates existing core; duplicates no logic).
-- ---------------------------------------------------------------------------

create or replace function public.run_delivery_redispatch_worker()
returns table (expired_offers integer, bookings_processed integer, rounds_created integer, marked_no_driver integer)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_expired integer := 0;
  v_processed integer := 0;
  v_rounds integer := 0;
  v_no_driver integer := 0;
  v_delivery_id uuid;
  v_attempts integer;
  v_created integer;
begin
  -- Only one worker runs at a time; a concurrent invocation exits quietly.
  if not pg_try_advisory_xact_lock(hashtext('delivery-redispatch-worker')) then
    return query select 0, 0, 0, 0;
    return;
  end if;

  -- 1. Retire lapsed offers. Deliveries stay pending/dispatching.
  update public.delivery_offers
     set status = 'expired', decided_at = now()
   where status = 'offered'
     and expires_at <= now();

  get diagnostics v_expired = row_count;

  -- 2-3. Redispatch each pending/dispatching delivery with no live round.
  for v_delivery_id in
    select b.id
      from public.deliveries b
     where (b.status = 'pending' or b.status = 'dispatching')
       and b.driver_id is null
       and not exists (
         select 1 from public.delivery_offers o
          where o.delivery_id = b.id
            and o.status = 'offered'
            and o.expires_at > now()
       )
       and not exists (
         select 1 from public.delivery_offers o
          where o.delivery_id = b.id
            and o.status = 'accepted'
       )
     order by b.preferred_date, b.preferred_time
  loop
    begin
      v_processed := v_processed + 1;

      update public.deliveries
         set dispatch_attempts = dispatch_attempts + 1,
             updated_at = now()
       where id = v_delivery_id
      returning dispatch_attempts into v_attempts;

      select count(*) into v_created
        from public.br_delivery_dispatch_core(v_delivery_id);

      if v_created > 0 then
        v_rounds := v_rounds + 1;
      elsif v_attempts >= 3 then
        update public.deliveries
           set status = 'no_driver',
               updated_at = now()
         where id = v_delivery_id
           and status in ('pending', 'dispatching')
           and driver_id is null;

        if found then
          v_no_driver := v_no_driver + 1;
        end if;
      end if;
    exception
      when others then
        -- One bad row (e.g. concurrently assigned/cancelled) must not abort
        -- the whole run; it will be reconsidered on the next invocation.
        continue;
    end;
  end loop;

  return query select v_expired, v_processed, v_rounds, v_no_driver;
end;
$$;

revoke all on function public.run_delivery_redispatch_worker() from public;
revoke all on function public.run_delivery_redispatch_worker() from anon, authenticated;
grant execute on function public.run_delivery_redispatch_worker() to service_role;

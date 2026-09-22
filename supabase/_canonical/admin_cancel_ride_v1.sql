-- ============================================================================
-- BISLIG RIDE — ADMIN RIDE CANCELLATION v1 (P1.8C)
-- Project: epsxgqoqfrwymktjvujs ("Bislig Ride", ap-northeast-1)
-- Date: 2026-09-22
--
-- PURPOSE
--   Narrow Admin operational cancellation for Ride Now rides. Supplements
--   (never replaces) the customer/driver path in public.cancel_ride, and
--   records the Admin as the ledger actor instead of attributing the
--   cancellation to a customer or driver.
--
-- SECURITY MODEL (mirrors dispatch_ride / cancel_ride)
--   SECURITY DEFINER with controlled search_path and an explicit
--   admin-or-service_role gate in the body. EXECUTE granted to
--   authenticated + service_role only. No anon access. The ledger actor
--   (cancelled_by) is always the authenticated admin UUID; service_role
--   callers without a JWT subject are rejected rather than recorded
--   against a fabricated actor (cancelled_by is NOT NULL by schema).
--
-- IDEMPOTENCY
--   The CHECK migration is conditional (no-op when already applied).
--   The function is CREATE OR REPLACE. Safe to re-apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ledger CHECK widening: allow 'admin' alongside customer/driver so an
--    Admin cancellation is attributable. Existing rows/values untouched.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.ride_cancellations'::regclass
       and conname = 'ride_cancellations_cancelled_by_role_check'
       and pg_get_constraintdef(oid) not like '%admin%'
  ) then
    alter table public.ride_cancellations
      drop constraint ride_cancellations_cancelled_by_role_check;

    alter table public.ride_cancellations
      add constraint ride_cancellations_cancelled_by_role_check
      check (cancelled_by_role = any (array['customer'::text, 'driver'::text, 'admin'::text]));
  end if;
end
$$;

-- ============================================================================
-- 2. admin_cancel_ride(p_ride_id, p_reason)
--    Cleanup semantics mirror the canonical cancel path
--    (dispatch_cancel_ride_cleanup.sql): withdraw live 'offered' offers,
--    set cancelled, insert the ledger row, release the driver's
--    current_ride_id. Lock order (ride row, then offers, then driver
--    location release) matches the existing cancellation path, so no
--    new deadlock class is introduced. no_driver/completed/terminal
--    states keep the existing invariant: rejected, never force-written.
-- ============================================================================
create or replace function public.admin_cancel_ride(p_ride_id uuid, p_reason text)
returns table (
  ride_id uuid,
  success boolean,
  already_cancelled boolean,
  previous_status text,
  new_status text,
  reason text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_ride public.rides%rowtype;
  v_actor uuid;
  v_reason text;
begin
  if (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin')
     and auth.role() <> 'service_role' then
    raise exception 'Only an administrator can cancel rides this way.'
      using errcode = '42501';
  end if;

  if p_ride_id is null then
    raise exception 'A ride id is required.';
  end if;

  v_reason := trim(both from coalesce(p_reason, ''));

  if v_reason = '' then
    raise exception 'A cancellation reason is required.';
  end if;

  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'Admin identity is required to record this cancellation.'
      using errcode = '42501';
  end if;

  select r.*
    into v_ride
    from public.rides r
   where r.id = p_ride_id
   for update;

  if not found then
    raise exception 'Ride not found.';
  end if;

  if v_ride.status = 'cancelled' then
    return query
      select p_ride_id, true, true, 'cancelled', 'cancelled', v_reason;
    return;
  end if;

  if v_ride.status not in ('requested', 'accepted', 'arrived', 'in_progress') then
    raise exception 'This ride cannot be cancelled.';
  end if;

  update public.ride_offers
     set status = 'withdrawn', decided_at = now()
   where ride_id = p_ride_id
     and status = 'offered';

  update public.rides
     set status = 'cancelled'
   where id = p_ride_id;

  insert into public.ride_cancellations (
    ride_id,
    cancelled_by,
    cancelled_by_role,
    reason
  )
  values (
    p_ride_id,
    v_actor,
    'admin',
    v_reason
  );

  if v_ride.driver_id is not null then
    update public.driver_locations
       set current_ride_id = NULL, is_available = true
     where driver_id = v_ride.driver_id
       and current_ride_id = p_ride_id;
  end if;

  return query
    select p_ride_id, true, false, v_ride.status, 'cancelled', v_reason;
end;
$$;

revoke all on function public.admin_cancel_ride(uuid, text) from public;
grant execute on function public.admin_cancel_ride(uuid, text) to authenticated, service_role;

-- End of admin_cancel_ride v1. Re-applying this file is safe (idempotent).

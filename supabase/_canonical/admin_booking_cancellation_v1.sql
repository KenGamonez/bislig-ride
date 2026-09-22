-- ============================================================================
-- BISLIG RIDE — ADMIN BOOKING CANCELLATION v1 (P1.11)
-- Project: epsxgqoqfrwymktjvujs ("Bislig Ride", ap-northeast-1)
-- Date: 2026-09-22
--
-- PURPOSE
--   Authoritative Admin cancellation for Pakyawan bookings and
--   Pa-Deliver deliveries. Both workflows define cancelled states but
--   previously had no live cancellation writer, leaving Admin with no
--   way to close them.
--
-- SCOPE
--   1. Missing table GRANT on public.pakyawan_cancellations (policies
--      exist but only postgres holds table privileges, so even Admin
--      reads fail with 42501 — same trap documented in
--      pakyawan_table_grants.sql).
--   2. New public.delivery_cancellations ledger mirroring
--      pakyawan_cancellations (admin SELECT + assigned-driver SELECT,
--      SELECT grant; writes go through the RPC below, never direct).
--   3. admin_cancel_pakyawan + admin_cancel_delivery RPCs (DEFINER,
--      admin-or-service_role gated, row-locked, idempotent).
--
-- NOT in scope: Ride Now cancellation (untouched), dispatch/accept
-- lifecycles (untouched), presence/GPS (untouched — neither workflow
-- pins driver_locations, so cancellation performs no location writes),
-- driver assignment clearing (driver_id is preserved as history),
-- payment/escrow (none exists), customer/driver cancel controls.
--
-- IDEMPOTENCY
--   GRANTs and policy creation are guarded; functions are
--   CREATE OR REPLACE; the ledger table uses IF NOT EXISTS. Safe to
--   re-apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. pakyawan_cancellations: table-level SELECT grant (policies alone
--    cannot function without it).
-- ----------------------------------------------------------------------------
grant select on public.pakyawan_cancellations to authenticated;

-- ----------------------------------------------------------------------------
-- 2. delivery_cancellations ledger (mirrors pakyawan_cancellations).
-- ----------------------------------------------------------------------------
create table if not exists public.delivery_cancellations (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  cancelled_by uuid,
  cancelled_by_role text check (cancelled_by_role in ('customer', 'driver', 'admin')),
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists delivery_cancellations_delivery_idx
  on public.delivery_cancellations (delivery_id);

alter table public.delivery_cancellations enable row level security;

drop policy if exists "Authenticated admins can review delivery cancellations"
  on public.delivery_cancellations;

create policy "Authenticated admins can review delivery cancellations"
  on public.delivery_cancellations for select
  to authenticated
  using (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text);

drop policy if exists "Assigned drivers can view their delivery cancellations"
  on public.delivery_cancellations;

create policy "Assigned drivers can view their delivery cancellations"
  on public.delivery_cancellations for select
  to authenticated
  using (
    exists (
      select 1
        from public.deliveries d
        join public.drivers dr on dr.id = d.driver_id
       where d.id = delivery_cancellations.delivery_id
         and dr.auth_user_id = auth.uid()
    )
  );

grant select on public.delivery_cancellations to authenticated;

-- ============================================================================
-- 3. admin_cancel_pakyawan(p_booking_id, p_reason)
--    Cancellable: pending, quoted, scheduled, driver_on_way,
--    driver_arrived, in_progress. completed/cancelled rejected
--    (cancelled returns an idempotent success row). driver_id is
--    preserved as assignment history. No location writes exist in
--    this workflow, so none are performed here.
-- ============================================================================
create or replace function public.admin_cancel_pakyawan(p_booking_id uuid, p_reason text)
returns table (
  booking_id uuid,
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
  v_booking public.pakyawan_bookings%rowtype;
  v_actor uuid;
  v_reason text;
begin
  if (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin')
     and auth.role() <> 'service_role' then
    raise exception 'Only an administrator can cancel Pakyawan bookings.'
      using errcode = '42501';
  end if;

  if p_booking_id is null then
    raise exception 'A booking id is required.';
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

  select b.*
    into v_booking
    from public.pakyawan_bookings b
   where b.id = p_booking_id
   for update;

  if not found then
    raise exception 'Pakyawan booking not found.';
  end if;

  if v_booking.status = 'cancelled' then
    return query
      select p_booking_id, true, true, 'cancelled', 'cancelled', v_reason;
    return;
  end if;

  if v_booking.status not in (
    'pending', 'quoted', 'scheduled',
    'driver_on_way', 'driver_arrived', 'in_progress'
  ) then
    raise exception 'This Pakyawan booking cannot be cancelled.';
  end if;

  update public.pakyawan_offers
     set status = 'withdrawn', decided_at = now()
   where booking_id = p_booking_id
     and status = 'offered'
     and expires_at > now();

  update public.pakyawan_bookings
     set status = 'cancelled',
         updated_at = now()
   where id = p_booking_id;

  insert into public.pakyawan_cancellations (
    booking_id,
    cancelled_by,
    cancelled_by_role,
    reason
  )
  values (
    p_booking_id,
    v_actor,
    'admin',
    v_reason
  );

  return query
    select p_booking_id, true, false, v_booking.status, 'cancelled', v_reason;
end;
$$;

revoke all on function public.admin_cancel_pakyawan(uuid, text) from public;
grant execute on function public.admin_cancel_pakyawan(uuid, text) to authenticated, service_role;

-- ============================================================================
-- 4. admin_cancel_delivery(p_delivery_id, p_reason)
--    Cancellable: every status except delivered/cancelled (pending,
--    dispatching, assigned, quoted, confirmed, driver_on_way,
--    driver_arrived, picked_up, in_transit, no_driver, failed).
--    no_driver/failed are closable dead ends with no other exit.
--    delivered is terminal (proof-complete); cancelled is idempotent.
-- ============================================================================
create or replace function public.admin_cancel_delivery(p_delivery_id uuid, p_reason text)
returns table (
  delivery_id uuid,
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
  v_delivery public.deliveries%rowtype;
  v_actor uuid;
  v_reason text;
begin
  if (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin')
     and auth.role() <> 'service_role' then
    raise exception 'Only an administrator can cancel deliveries.'
      using errcode = '42501';
  end if;

  if p_delivery_id is null then
    raise exception 'A delivery id is required.';
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

  select d.*
    into v_delivery
    from public.deliveries d
   where d.id = p_delivery_id
   for update;

  if not found then
    raise exception 'Delivery not found.';
  end if;

  if v_delivery.status = 'cancelled' then
    return query
      select p_delivery_id, true, true, 'cancelled', 'cancelled', v_reason;
    return;
  end if;

  if v_delivery.status in ('delivered') then
    raise exception 'This delivery cannot be cancelled.';
  end if;

  update public.delivery_offers
     set status = 'withdrawn', decided_at = now()
   where delivery_id = p_delivery_id
     and status = 'offered'
     and expires_at > now();

  update public.deliveries
     set status = 'cancelled',
         updated_at = now()
   where id = p_delivery_id;

  insert into public.delivery_cancellations (
    delivery_id,
    cancelled_by,
    cancelled_by_role,
    reason
  )
  values (
    p_delivery_id,
    v_actor,
    'admin',
    v_reason
  );

  return query
    select p_delivery_id, true, false, v_delivery.status, 'cancelled', v_reason;
end;
$$;

revoke all on function public.admin_cancel_delivery(uuid, text) from public;
grant execute on function public.admin_cancel_delivery(uuid, text) to authenticated, service_role;

-- End of admin_booking_cancellation v1. Re-applying this file is safe.

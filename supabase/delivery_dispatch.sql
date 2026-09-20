-- Bislig Ride: Pa-Deliver automated dispatch foundation, PHASE 2.
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Scope (Phase 2 — eligible-driver discovery + offer creation):
--
--   1. deliveries.dispatch_attempts integer NOT NULL DEFAULT 0
--      Counts dispatch rounds actually attempted for the row. Used ONLY by
--      the redispatch worker to apply the conservative no-driver limit
--      (Phase 2 lifecycle file). No existing rows are rewritten beyond the
--      harmless column default.
--
--   2. public.br_delivery_dispatch_core(p_delivery_id) [INTERNAL]
--      The single source of truth for delivery eligibility + offer creation.
--      Locks the row, requires status pending/dispatching, short-circuits
--      when a live offer round already exists (idempotent), otherwise inserts
--      one 15-minute 'offered' row per eligible driver at
--      max(dispatch_round)+1 and returns the round. Moves pending →
--      dispatching ONLY when a round with at least one offer is actually
--      created. Never assigns a driver. Called by the admin wrapper below
--      and by the redispatch worker; never called directly by frontend code.
--
--   3. public.dispatch_delivery_booking(p_delivery_id)
--      Admin-only SECURITY DEFINER wrapper around the core. Anonymous
--      customers must never be able to dispatch arbitrary deliveries.
--
-- Eligibility (existing columns only, no package logistics engine):
--
--   - drivers.status = 'active'
--   - drivers.can_accept_deliveries = true
--   - drivers.auth_user_id IS NOT NULL (a driver row without a login cannot
--     receive realtime offers or accept through a session RPC)
--   - no other active delivery held by that driver. Active = assigned,
--     driver_on_way, driver_arrived, picked_up, in_transit. Because v1
--     deliveries carry no duration data, overlap is evaluated per
--     preferred_date: one active delivery per driver per date. Completed,
--     cancelled, no_driver, and failed rows never conflict, and unassigned
--     (pending, dispatching) rows never conflict. Package size stays
--     informational in this phase (no string-matching rules).
--
-- Deliberately NOT required: Ride Now online/presence/GPS/location/ride
-- state. Pa-Deliver eligibility must never depend on Ride Now transient
-- state, and this query references none of it.
--
-- What this does NOT implement:
--
--   - No accept/decline RPCs (Phase 3), no price proposal, no lifecycle
--     advance, no chat, no ratings, no UI of any kind.
--   - No RLS policy changes. No table GRANT changes (definer RPCs need none;
--     anon/authenticated table privileges stay exactly as they are).
--   - No Ride Now or Pakyawan changes (dispatch cores, offers, presence,
--     GPS, fare, ratings, UI untouched).

-- ---------------------------------------------------------------------------
-- 1. Dispatch-attempt bookkeeping (redispatch limit basis only).
-- ---------------------------------------------------------------------------

alter table public.deliveries
  add column if not exists dispatch_attempts integer not null default 0;

-- ---------------------------------------------------------------------------
-- 2. Internal dispatch core: eligibility + offer creation (no auth gate).
--    Only invoked by the admin wrapper below and the redispatch worker, both
--    of which enforce their own authorization. Never exposed to frontends.
-- ---------------------------------------------------------------------------

create or replace function public.br_delivery_dispatch_core(p_delivery_id uuid)
returns table (driver_id uuid, offer_id uuid, dispatch_round integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_delivery public.deliveries;
  v_round integer;
  v_window interval := interval '15 minutes';
  v_created integer := 0;
begin
  if p_delivery_id is null then
    raise exception 'A delivery id is required.';
  end if;

  select * into v_delivery
    from public.deliveries
   where id = p_delivery_id
   for update;

  if not found then
    raise exception 'Delivery not found.';
  end if;

  if v_delivery.status <> 'pending' and v_delivery.status <> 'dispatching' then
    raise exception 'Only pending deliveries can be dispatched.';
  end if;

  -- A live round already exists: return it instead of stacking another one.
  if exists (
    select 1 from public.delivery_offers o
     where o.delivery_id = p_delivery_id
       and o.status = 'offered'
       and o.expires_at > now()
  ) then
    return query
      select o.driver_id, o.id, o.dispatch_round, o.expires_at
        from public.delivery_offers o
       where o.delivery_id = p_delivery_id
         and o.status = 'offered'
         and o.expires_at > now()
       order by o.driver_id;
    return;
  end if;

  select coalesce(max(o.dispatch_round), 0) + 1 into v_round
    from public.delivery_offers o
   where o.delivery_id = p_delivery_id;

  insert into public.delivery_offers (
    delivery_id, driver_id, dispatch_round, status, offered_at, expires_at
  )
  select
    p_delivery_id,
    d.id,
    v_round,
    'offered',
    now(),
    now() + v_window
  from public.drivers d
  where d.status = 'active'
    and d.can_accept_deliveries = true
    and d.auth_user_id is not null
    and not exists (
      select 1
        from public.deliveries held
       where held.driver_id = d.id
         and held.preferred_date is not distinct from v_delivery.preferred_date
         and held.id is distinct from p_delivery_id
         and held.status in (
           'assigned', 'driver_on_way', 'driver_arrived', 'picked_up', 'in_transit'
         )
    );

  get diagnostics v_created = row_count;

  -- pending → dispatching only when a round with offers was actually created.
  if v_created > 0 and v_delivery.status = 'pending' then
    update public.deliveries
       set status = 'dispatching',
           updated_at = now()
     where id = p_delivery_id;
  end if;

  return query
    select o.driver_id, o.id, o.dispatch_round, o.expires_at
      from public.delivery_offers o
     where o.delivery_id = p_delivery_id
       and o.dispatch_round = v_round
     order by o.driver_id;
end;
$$;

revoke all on function public.br_delivery_dispatch_core(uuid) from public;

-- ---------------------------------------------------------------------------
-- 3. Admin-triggered delivery dispatch (offers only, never assigns).
-- ---------------------------------------------------------------------------

create or replace function public.dispatch_delivery_booking(p_delivery_id uuid)
returns table (driver_id uuid, offer_id uuid, dispatch_round integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
begin
  -- Admin only. Automatic triggering belongs to the worker, never to
  -- anonymous customers (who must never dispatch arbitrary deliveries).
  v_role := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');

  if v_role <> 'admin' then
    raise exception 'Only an administrator can dispatch deliveries.';
  end if;

  return query
    select * from public.br_delivery_dispatch_core(p_delivery_id);
end;
$$;

revoke all on function public.dispatch_delivery_booking(uuid) from public;
grant execute on function public.dispatch_delivery_booking(uuid) to authenticated;

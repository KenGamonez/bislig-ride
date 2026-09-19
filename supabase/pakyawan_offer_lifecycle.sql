-- Bislig Ride: Pakyawan automated platform, PHASE B3 — offer decline, expiry,
-- and redispatch foundation.
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Scope (B3 only — individual offer lifecycle, no automation):
--
--   1. public.decline_pakyawan_offer(p_offer_id uuid)
--      Authenticated-driver SECURITY DEFINER RPC. Converts the driver's OWN
--      live ('offered', unexpired) offer to 'declined' + decided_at.
--      Booking status and driver_id are never touched; no redispatch is
--      triggered (a later phase owns redispatch).
--
--   2. public.expire_pakyawan_offers()
--      Admin-gated SECURITY DEFINER sweeper. Converts every currently
--      'offered' row with expires_at <= now() to 'expired' + decided_at and
--      returns the retired count. Never touches accepted/declined/withdrawn
--      rows and never cancels bookings: expired offers leave the booking
--      pending for a future redispatch round.
--
--   3. public.pakyawan_redispatch_eligible(p_booking_id uuid)
--      Admin-gated SECURITY DEFINER read helper. Reports whether a booking
--      may take another dispatch round: status 'pending', no assigned
--      driver, no live 'offered' offer, no 'accepted' offer. (Declined,
--      expired, and withdrawn history never blocks redispatch; the B1
--      dispatch round counter max(dispatch_round)+1 already skips it.)
--
-- What this does NOT implement (later phases):
--
--   - No automatic redispatch: no triggers, no cron, no scheduled functions,
--     no recursive dispatch, no immediate dispatch from decline/expiry.
--   - No price proposal, no lifecycle advance, no chat, no ratings, no UI.
--   - No change to accept_pakyawan_offer, dispatch_pakyawan_booking,
--     admin_quote, customer create/get/confirm RPCs, or driver self-assign.
--   - No RLS policy changes. No table GRANT changes. No Ride Now changes
--     (dispatch core, ride_offers, presence, GPS, fare, ratings, UI untouched).

-- ---------------------------------------------------------------------------
-- 1. Driver decline of their own live offer.
-- ---------------------------------------------------------------------------

create or replace function public.decline_pakyawan_offer(p_offer_id uuid)
returns setof public.pakyawan_offers
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_driver_id uuid;
  v_offer public.pakyawan_offers;
begin
  -- Driver identity comes from the session only; there is no driver_id
  -- parameter, so declining another driver's offer is structurally impossible.
  select d.id
    into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active';

  if v_driver_id is null then
    raise exception 'Only an active driver can decline a Pakyawan offer.'
      using errcode = '42501';
  end if;

  if p_offer_id is null then
    raise exception 'An offer id is required.';
  end if;

  select o.*
    into v_offer
    from public.pakyawan_offers o
   where o.id = p_offer_id
     and o.driver_id = v_driver_id
   for update;

  if not found then
    raise exception 'This Pakyawan offer is no longer available.'
      using errcode = 'XX001';
  end if;

  if v_offer.status <> 'offered' then
    raise exception 'This Pakyawan offer is no longer available.'
      using errcode = 'XX001';
  end if;

  if v_offer.expires_at <= now() then
    update public.pakyawan_offers
       set status = 'expired', decided_at = now()
     where id = v_offer.id;

    raise exception 'This Pakyawan offer is no longer available.'
      using errcode = 'XX001';
  end if;

  update public.pakyawan_offers
     set status = 'declined', decided_at = now()
   where id = v_offer.id;

  return query
    select o.* from public.pakyawan_offers o where o.id = v_offer.id;
end;
$$;

revoke all on function public.decline_pakyawan_offer(uuid) from public;
grant execute on function public.decline_pakyawan_offer(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Controlled expiry sweep for lapsed offers (admin-invoked now, scheduled job later).
-- ---------------------------------------------------------------------------

create or replace function public.expire_pakyawan_offers()
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
    raise exception 'Only an administrator can expire Pakyawan offers.';
  end if;

  update public.pakyawan_offers
     set status = 'expired', decided_at = now()
   where status = 'offered'
     and expires_at <= now();

  get diagnostics v_retired = row_count;
  return v_retired;
end;
$$;

revoke all on function public.expire_pakyawan_offers() from public;
grant execute on function public.expire_pakyawan_offers() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Redispatch-readiness check (read-only; dispatch itself stays in B1).
-- ---------------------------------------------------------------------------

create or replace function public.pakyawan_redispatch_eligible(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
  v_booking public.pakyawan_bookings;
begin
  v_role := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');

  if v_role <> 'admin' then
    raise exception 'Only an administrator can check Pakyawan redispatch eligibility.';
  end if;

  if p_booking_id is null then
    raise exception 'A booking id is required.';
  end if;

  select * into v_booking
    from public.pakyawan_bookings
   where id = p_booking_id;

  if not found then
    raise exception 'Pakyawan booking not found.';
  end if;

  if v_booking.status <> 'pending' or v_booking.driver_id is not null then
    return false;
  end if;

  if exists (
    select 1 from public.pakyawan_offers o
     where o.booking_id = p_booking_id
       and o.status = 'offered'
       and o.expires_at > now()
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.pakyawan_offers o
     where o.booking_id = p_booking_id
       and o.status = 'accepted'
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.pakyawan_redispatch_eligible(uuid) from public;
grant execute on function public.pakyawan_redispatch_eligible(uuid) to authenticated, service_role;

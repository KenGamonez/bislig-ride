-- ============================================================================
-- BISLIG RIDE — CANONICAL RPC CONSOLIDATION v1
-- Project: epsxgqoqfrwymktjvujs ("Bislig Ride", ap-northeast-1)
-- Date: 2026-09-22
--
-- PURPOSE
--   Single authoritative definition for the five RPCs that historically
--   accumulated multiple CREATE OR REPLACE bodies across loose migration
--   files. Each body below is transcribed from the CURRENT LIVE
--   pg_get_functiondef output (verified 2026-09-22), NOT reconstructed
--   from repository history.
--
-- WARNING — THIS FILE IS THE FINAL WORD FOR THESE FIVE RPCs
--   Re-applying any of the stale historical definitions listed under
--   "SUPERSEDED SOURCES" can regress live production behavior
--   (lost offer withdrawal, lost driver release, proof-gating bypass,
--   ghost confirmed state, delivered-only chat lockout, missing
--   proof_available flag).
--
-- SAFE TO RE-APPLY: every statement below is idempotent
-- (CREATE OR REPLACE, plus one DROP IF EXISTS + CREATE where Postgres
-- requires it for a changed return type). Re-applying installs the
-- exact live bodies and re-issues the exact live grants.
-- ============================================================================

-- ============================================================================
-- 1. cancel_ride(uuid, uuid, text, text) -> SETOF rides
-- Provenance (live body == this file):
--   supabase/dispatch_cancel_ride_cleanup.sql
-- Superseded (DO NOT REAPPLY):
--   supabase/cancel_ride_rpc.sql            (base version: no offer
--                                            withdrawal, no driver release)
--   supabase/driver_deactivation_rls.sql    (stale version: keeps the
--     lines ~218-297                         active-driver check but DROPS
--                                            both dispatch-cleanup writes;
--                                            re-applying it orphans live
--                                            offers and strands drivers)
-- Live behavior (MUST REMAIN):
--   - cancellation reason required; ride row locked FOR UPDATE
--   - only requested/accepted/arrived/in_progress may cancel
--     (no_driver and terminal states are rejected)
--   - actor derived from session (customer owner / assigned ACTIVE
--     driver / admin-or-service_role with explicit cancelled_by details)
--   - withdraws live 'offered' ride_offers for the ride
--   - sets rides.status = 'cancelled'
--   - inserts public.ride_cancellations ledger row
--   - releases driver's current_ride_id and restores availability
-- Frontend callers (verified compatible, unchanged):
--   src/lib/rides.ts cancelRide() (Rider + driver CancelRideModal paths)
-- ============================================================================
create or replace function public.cancel_ride(
  p_ride_id uuid,
  p_cancelled_by uuid,
  p_cancelled_by_role text,
  p_reason text
)
returns setof public.rides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides%rowtype;
  v_actor uuid;
  v_role text;
  v_is_customer boolean;
  v_is_driver boolean;
  v_is_admin boolean;
begin
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A cancellation reason is required.';
  end if;

  select r.*
    into v_ride
    from public.rides r
   where r.id = p_ride_id
   for update;

  if not found then
    raise exception 'Ride not found.';
  end if;

  if v_ride.status not in ('requested', 'accepted', 'arrived', 'in_progress') then
    raise exception 'This ride cannot be cancelled.';
  end if;

  v_is_customer := v_ride.customer_auth_id is not null
    and v_ride.customer_auth_id = auth.uid();

  v_is_driver := v_ride.driver_id is not null
    and exists (
      select 1 from public.drivers d
      where d.id = v_ride.driver_id
        and d.auth_user_id = auth.uid()
        and d.status = 'active'
    );

  v_is_admin := (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or auth.role() = 'service_role';

  if v_is_customer then
    v_actor := v_ride.customer_auth_id;
    v_role := 'customer';
  elsif v_is_driver then
    v_actor := v_ride.driver_id;
    v_role := 'driver';
  elsif v_is_admin then
    v_actor := p_cancelled_by;
    v_role := case
      when p_cancelled_by_role in ('customer', 'driver')
      then p_cancelled_by_role
      else null
    end;

    if v_actor is null or v_role is null then
      raise exception 'Invalid cancellation details.';
    end if;
  else
    raise exception 'Only the rider or the assigned driver can cancel a ride.'
      using errcode = '42501';
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
    v_role,
    trim(p_reason)
  );

  if v_ride.driver_id is not null then
    update public.driver_locations
       set current_ride_id = NULL, is_available = true
     where driver_id = v_ride.driver_id
       and current_ride_id = p_ride_id;
  end if;

  return query
    select r.* from public.rides r where r.id = p_ride_id;
end;
$$;

revoke all on function public.cancel_ride(uuid, uuid, text, text) from public;
grant execute on function public.cancel_ride(uuid, uuid, text, text) to anon, authenticated, service_role;

-- ============================================================================
-- 2. advance_delivery_status(uuid, text) -> SETOF deliveries
-- Provenance (live body == this file):
--   supabase/delivery_driver_price.sql (lines ~219-291)
-- Superseded (DO NOT REAPPLY):
--   supabase/delivery_driver_lifecycle.sql (lines ~43-118: allows
--     assigned -> ... -> delivered, bypassing proof-gating)
--   supabase/delivery_proof.sql            (lines ~283-355: older
--     intermediate definition)
-- Live behavior (MUST REMAIN):
--   - assigned ACTIVE driver owning the delivery only
--   - next status restricted to driver_on_way / driver_arrived /
--     picked_up / in_transit
--   - strict stepwise progression starting at confirmed:
--       confirmed -> driver_on_way -> driver_arrived
--       -> picked_up -> in_transit
--   - assigned/quoted cannot advance here; delivered is NOT reachable
--     (delivery completion stays proof-gated via
--     complete_delivery_with_proof)
-- Frontend callers (verified compatible, unchanged):
--   src/lib/deliveries.ts advanceDeliveryStatus()
-- ============================================================================
create or replace function public.advance_delivery_status(p_delivery_id uuid, p_next_status text)
returns setof public.deliveries
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_driver_id uuid;
  v_delivery public.deliveries;
begin
  select d.id
    into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active';

  if v_driver_id is null then
    raise exception 'Only the assigned driver can update this delivery.'
      using errcode = '42501';
  end if;

  if p_delivery_id is null then
    raise exception 'A delivery id is required.';
  end if;

  if p_next_status is null
    or p_next_status not in ('driver_on_way', 'driver_arrived', 'picked_up', 'in_transit')
  then
    raise exception 'Invalid delivery status.'
      using errcode = 'XX001';
  end if;

  select b.*
    into v_delivery
    from public.deliveries b
   where b.id = p_delivery_id
   for update;

  if not found then
    raise exception 'Delivery not found.';
  end if;

  if v_delivery.driver_id is distinct from v_driver_id then
    raise exception 'This delivery is no longer assigned to you.'
      using errcode = 'XX001';
  end if;

  if v_delivery.status = 'confirmed' and p_next_status <> 'driver_on_way'
    or v_delivery.status = 'driver_on_way' and p_next_status <> 'driver_arrived'
    or v_delivery.status = 'driver_arrived' and p_next_status <> 'picked_up'
    or v_delivery.status = 'picked_up' and p_next_status <> 'in_transit'
  then
    raise exception 'This delivery cannot move to that status right now.'
      using errcode = 'XX001';
  end if;

  if v_delivery.status not in ('confirmed', 'driver_on_way', 'driver_arrived', 'picked_up') then
    raise exception 'This delivery cannot move to that status right now.'
      using errcode = 'XX001';
  end if;

  update public.deliveries
     set status = p_next_status,
         updated_at = now()
   where id = v_delivery.id;

  return query
    select b.* from public.deliveries b where b.id = v_delivery.id;
end;
$$;

revoke all on function public.advance_delivery_status(uuid, text) from public;
grant execute on function public.advance_delivery_status(uuid, text) to authenticated, service_role;

-- ============================================================================
-- 3. confirm_pakyawan_booking(uuid, uuid) -> pakyawan_bookings
-- Provenance (live body == this file):
--   supabase/pakyawan_customer_confirm.sql (PHASE B7)
-- Superseded (DO NOT REAPPLY):
--   supabase/pakyawan_customer_access.sql (lines ~106-137: persists
--     quoted -> confirmed, restoring the ghost confirmed state the
--     customer UI never handles)
-- Live behavior (MUST REMAIN):
--   - booking id + access token must match (no-oracle errors)
--   - exactly status = 'quoted' AND price_cents IS NOT NULL
--   - single conditional UPDATE writes status = 'scheduled'
--     (+ updated_at); nothing else touched
--   - second confirmation updates zero rows and is rejected
--   - the intermediate 'confirmed' state is intentionally NEVER persisted
-- Frontend callers (verified compatible, unchanged):
--   src/lib/scheduledBookings.ts confirmPakyawanBooking()
-- ============================================================================
create or replace function public.confirm_pakyawan_booking(p_booking_id uuid, p_access_token uuid)
returns public.pakyawan_bookings
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row public.pakyawan_bookings;
begin
  if p_booking_id is null or p_access_token is null then
    raise exception 'Booking reference and access token are required.';
  end if;

  update public.pakyawan_bookings
     set status = 'scheduled',
         updated_at = now()
   where id = p_booking_id
     and access_token = p_access_token
     and status = 'quoted'
     and price_cents is not null
  returning * into v_row;

  if not found then
    if not exists (select 1 from public.pakyawan_bookings where id = p_booking_id and access_token = p_access_token) then
      raise exception 'Booking not found. Check your booking reference and try again.';
    end if;

    raise exception 'Only quoted bookings can be confirmed.';
  end if;

  return v_row;
end;
$$;

revoke all on function public.confirm_pakyawan_booking(uuid, uuid) from public;
grant execute on function public.confirm_pakyawan_booking(uuid, uuid) to anon, authenticated;

-- ============================================================================
-- 4. send_delivery_message(uuid, uuid, text, text) -> delivery_messages
-- Provenance (live body == this file):
--   supabase/delivery_active_chat.sql
-- Superseded (DO NOT REAPPLY):
--   supabase/delivery_post_completion.sql (lines ~141+: delivered-only
--     gate; re-applying it locks in-trip chat out)
-- Live behavior (MUST REMAIN):
--   - allowed once a driver is assigned, across every assigned
--     lifecycle state including delivered (driver_id IS NOT NULL gate)
--   - sender_role must be passenger|driver (argument selects proof,
--     grants nothing)
--   - driver senders must be the assigned ACTIVE driver
--   - passenger senders must present the matching access token
--   - message trimmed to 1..1000 chars
-- Frontend callers (verified compatible, unchanged):
--   src/lib/deliveries.ts sendDeliveryMessage()
-- ============================================================================
create or replace function public.send_delivery_message(
  p_delivery_id uuid,
  p_access_token uuid,
  p_sender_role text,
  p_message text
)
returns public.delivery_messages
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_delivery public.deliveries;
  v_driver_id uuid;
  v_actual_role text;
  v_text text;
  v_row public.delivery_messages;
begin
  if p_delivery_id is null or p_sender_role is null or p_message is null then
    raise exception 'Delivery reference, sender role, and message are required.';
  end if;

  if p_sender_role not in ('passenger', 'driver') then
    raise exception 'Delivery reference, sender role, and message are required.';
  end if;

  v_text := trim(both from p_message);

  if char_length(v_text) < 1 or char_length(v_text) > 1000 then
    raise exception 'Messages must be between 1 and 1000 characters.';
  end if;

  select * into v_delivery
    from public.deliveries
   where id = p_delivery_id;

  if not found then
    raise exception 'Delivery not found. Check your delivery reference and try again.';
  end if;

  if v_delivery.driver_id is null then
    raise exception 'Messages can only be sent once a driver has accepted this delivery.';
  end if;

  select d.id into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active';

  if p_sender_role = 'driver' then
    if v_driver_id is null or v_delivery.driver_id is distinct from v_driver_id then
      raise exception 'You are not authorized to send messages for this delivery.';
    end if;

    v_actual_role := 'driver';
  else
    if p_access_token is null or v_delivery.access_token is distinct from p_access_token then
      raise exception 'Delivery not found. Check your delivery reference and try again.';
    end if;

    v_actual_role := 'passenger';
  end if;

  insert into public.delivery_messages (delivery_id, sender_role, message)
  values (v_delivery.id, v_actual_role, v_text)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.send_delivery_message(uuid, uuid, text, text) from public;
grant execute on function public.send_delivery_message(uuid, uuid, text, text) to anon, authenticated, service_role;

-- ============================================================================
-- 5. get_delivery_booking(uuid, uuid) -> TABLE (... , proof_available)
-- Provenance (live body == this file):
--   supabase/delivery_proof.sql (section 5, DROP + CREATE) plus
--   supabase/delivery_proof_service_grant.sql (service_role EXECUTE)
-- Superseded (DO NOT REAPPLY):
--   supabase/delivery_customer_access.sql (lines ~94+: old RETURNS
--     composite-row version WITHOUT proof_available; re-applying it
--     breaks the proof-photo UI)
-- Live behavior (MUST REMAIN):
--   - token-gated single-row read returning TABLE with proof_available
--     (EXISTS on public.delivery_proofs)
--   - DROP + CREATE is REQUIRED here (return-type change; Postgres
--     error 42P13 otherwise) — keep that shape, do not convert to
--     CREATE OR REPLACE
--   - EXECUTE grants: anon, authenticated, service_role
-- Frontend callers (verified compatible, unchanged):
--   src/lib/deliveries.ts getDeliveryBooking() (expects proof_available)
--   delivery-proof-url Edge Function via service_role
-- ============================================================================
drop function if exists public.get_delivery_booking(uuid, uuid);

create function public.get_delivery_booking(p_delivery_id uuid, p_access_token uuid)
returns table (
  id uuid,
  customer_id uuid,
  sender_name text,
  sender_phone text,
  package_type text,
  package_details text,
  package_size text,
  pickup_address text,
  delivery_address text,
  preferred_date date,
  preferred_time time without time zone,
  vehicle_preference text,
  price_cents integer,
  status text,
  driver_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  proof_available boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if p_delivery_id is null or p_access_token is null then
    raise exception 'Delivery reference and access token are required.';
  end if;

  return query
    select
      b.id,
      b.customer_id,
      b.sender_name,
      b.sender_phone,
      b.package_type,
      b.package_details,
      b.package_size,
      b.pickup_address,
      b.delivery_address,
      b.preferred_date,
      b.preferred_time,
      b.vehicle_preference,
      b.price_cents,
      b.status,
      b.driver_id,
      b.created_at,
      b.updated_at,
      exists (
        select 1 from public.delivery_proofs p where p.delivery_id = b.id
      ) as proof_available
    from public.deliveries b
   where b.id = p_delivery_id
     and b.access_token = p_access_token;

  if not found then
    raise exception 'Delivery not found. Check your delivery reference and try again.';
  end if;

  return;
end;
$$;

revoke all on function public.get_delivery_booking(uuid, uuid) from public;
grant execute on function public.get_delivery_booking(uuid, uuid) to anon, authenticated;
grant execute on function public.get_delivery_booking(uuid, uuid) to service_role;

-- End of canonical consolidation v1. Re-applying this file is safe
-- (idempotent): it reinstalls the exact live bodies and live grants.

-- Bislig Ride: Pa-Deliver secure customer access (additive, idempotent).
-- Run this file in the Supabase SQL editor.
--
-- Scope (Pa-Deliver Phase 1 — booking creation + owner read):
--
--   Anonymous senders book without an account, so customer_id cannot prove
--   ownership. Every delivery gets a random access_token the sender keeps in
--   their own browser. Two narrow RPCs expose exactly what the customer flow
--   needs and nothing else:
--
--   1. public.create_delivery_booking(...) — inserts exactly the customer
--      payload and returns ONLY (id, access_token). Database defaults
--      generate id, status ('pending'), access_token, and timestamps. The
--      caller cannot supply id, status, token, price, or driver.
--
--   2. public.get_delivery_booking(p_delivery_id, p_access_token) — returns
--      exactly the one matching row, or raises a generic 'not found'
--      exception. The same message is used for bad id and bad token so one
--      cannot be used to probe for the other.
--
-- What this does NOT create or change:
--
--   - No anonymous SELECT RLS policy on deliveries (anonymous reads happen
--     only through get_delivery_booking, which requires the per-delivery
--     token). Table GRANTs for anon are intentionally absent.
--   - No status transitions, no pricing, no assignment, no lifecycle RPCs
--     (later phases).
--   - No RLS policy changes beyond what deliveries.sql already defines.
--   - No Ride Now or Pakyawan changes (tables, RPCs, policies, UI untouched).

-- ---------------------------------------------------------------------------
-- 1. Customer create: insert payload, return (id, access_token) only.
-- ---------------------------------------------------------------------------

create or replace function public.create_delivery_booking(
  p_customer_id uuid,
  p_sender_name text,
  p_sender_phone text,
  p_package_type text,
  p_package_details text,
  p_package_size text,
  p_pickup_address text,
  p_delivery_address text,
  p_preferred_date date,
  p_preferred_time time
)
returns table (id uuid, access_token uuid)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
  v_token uuid;
begin
  insert into public.deliveries (
    customer_id,
    sender_name,
    sender_phone,
    package_type,
    package_details,
    package_size,
    pickup_address,
    delivery_address,
    preferred_date,
    preferred_time
  ) values (
    p_customer_id,
    p_sender_name,
    p_sender_phone,
    p_package_type,
    p_package_details,
    p_package_size,
    p_pickup_address,
    p_delivery_address,
    p_preferred_date,
    p_preferred_time
  )
  returning deliveries.id, deliveries.access_token into v_id, v_token;

  id := v_id;
  access_token := v_token;
  return next;
end;
$$;

revoke all on function public.create_delivery_booking(uuid, text, text, text, text, text, text, text, date, time) from public;
grant execute on function public.create_delivery_booking(uuid, text, text, text, text, text, text, text, date, time) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Customer read: exactly one delivery, only with the matching token.
-- ---------------------------------------------------------------------------

-- ============================================================================
-- SUPERSEDED — DO NOT APPLY THIS FUNCTION DEFINITION
-- (get_delivery_booking)
-- Canonical authoritative definition:
-- supabase/_canonical/rpc_consolidation_v1.sql
-- This historical definition is retained for provenance only.
-- Re-applying it can regress the live production behavior
-- (drops proof_available, breaking the proof-photo UI).
-- ============================================================================
create or replace function public.get_delivery_booking(p_delivery_id uuid, p_access_token uuid)
returns public.deliveries
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row public.deliveries;
begin
  if p_delivery_id is null or p_access_token is null then
    raise exception 'Delivery reference and access token are required.';
  end if;

  select * into v_row
    from public.deliveries
   where id = p_delivery_id
     and access_token = p_access_token;

  if not found then
    raise exception 'Delivery not found. Check your delivery reference and try again.';
  end if;

  return v_row;
end;
$$;

revoke all on function public.get_delivery_booking(uuid, uuid) from public;
grant execute on function public.get_delivery_booking(uuid, uuid) to anon, authenticated;

-- Bislig Ride: Pakyawan customer access via per-booking token (additive, idempotent).
-- Run this file in the Supabase SQL editor.
--
-- Scope of this step (customer quoted -> confirmed):
--
--   Anonymous customers book without an account, so customer_id cannot prove
--   ownership. This migration gives every booking a random access_token that
--   the booker keeps in their own browser. Two narrow RPCs let the holder of
--   (booking id + token) read their own booking and confirm a quoted price.
--
-- What this adds:
--
--   1. pakyawan_bookings.access_token uuid NOT NULL DEFAULT gen_random_uuid()
--      with a UNIQUE constraint. Existing rows (if any) are backfilled with
--      fresh random tokens before the NOT NULL constraint is applied, so no
--      row is ever left without a token and no data is rewritten otherwise.
--
--   2. public.get_pakyawan_booking(p_booking_id uuid, p_access_token uuid)
--      SECURITY DEFINER RPC returning exactly the one matching row, or raising
--      a generic 'not found' exception when id/token do not match. The same
--      message is used for bad id and bad token so one cannot be used to probe
--      for the other.
--
--   3. public.confirm_pakyawan_booking(p_booking_id uuid, p_access_token uuid)
--      SECURITY DEFINER RPC that atomically moves exactly one row from
--      'quoted' to 'confirmed'. A second simultaneous confirmation updates
--      zero rows and raises a clear exception, so no invalid state is possible.
--
-- What this does NOT change:
--
--   - No columns modified or renamed. No rows rewritten (backfill only fills
--     the new token column where NULL).
--   - No status values added, removed, or renamed.
--   - No RLS policies added, removed, or altered. In particular there is NO
--     anonymous SELECT policy on the table: anonymous reads happen only
--     through get_pakyawan_booking, which requires the per-booking token.
--     The driver self-assign path works exactly as before.
--   - The confirm RPC's UPDATE lists exactly status + updated_at. It cannot
--     touch price_cents, driver_id, customer fields, vehicle fields, booking
--     date/time, or locations.
--   - No frontend changes in this file. No fare-engine, dispatch, GPS, or
--     Ride Now changes.

-- ---------------------------------------------------------------------------
-- 1. Per-booking access token (safe for tables that may already have rows).
-- ---------------------------------------------------------------------------

alter table public.pakyawan_bookings
  add column if not exists access_token uuid;

update public.pakyawan_bookings
   set access_token = gen_random_uuid()
 where access_token is null;

alter table public.pakyawan_bookings
  alter column access_token set default gen_random_uuid();

alter table public.pakyawan_bookings
  alter column access_token set not null;

do $$
begin
  alter table public.pakyawan_bookings
    add constraint pakyawan_bookings_access_token_key unique (access_token);
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Customer read: exactly one booking, only with the matching token.
-- ---------------------------------------------------------------------------

create or replace function public.get_pakyawan_booking(p_booking_id uuid, p_access_token uuid)
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

  select * into v_row
    from public.pakyawan_bookings
   where id = p_booking_id
     and access_token = p_access_token;

  if not found then
    raise exception 'Booking not found. Check your booking reference and try again.';
  end if;

  return v_row;
end;
$$;

revoke all on function public.get_pakyawan_booking(uuid, uuid) from public;
grant execute on function public.get_pakyawan_booking(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Customer confirm: quoted -> confirmed, nothing else.
-- ---------------------------------------------------------------------------

-- ============================================================================
-- SUPERSEDED — DO NOT APPLY THIS FUNCTION DEFINITION
-- (confirm_pakyawan_booking)
-- Canonical authoritative definition:
-- supabase/_canonical/rpc_consolidation_v1.sql
-- This historical definition is retained for provenance only.
-- Re-applying it can regress the live production behavior
-- (restores the ghost confirmed state the customer UI never handles).
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
     set status = 'confirmed',
         updated_at = now()
   where id = p_booking_id
     and access_token = p_access_token
     and status = 'quoted'
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

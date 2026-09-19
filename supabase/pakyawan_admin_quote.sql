-- Bislig Ride: admin-only Pakyawan quoting (pending -> quoted).
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Scope of this step:
--
--   Admin selects a PENDING Pakyawan booking, enters a price, and submits the
--   quote. The booking becomes QUOTED with price_cents set. Nothing else.
--
-- What this adds:
--
--   1. public.admin_quote_pakyawan(p_booking_id uuid, p_price_cents integer)
--      SECURITY DEFINER RPC that atomically moves exactly one row from
--      'pending' to 'quoted' while setting its quoted price.
--
-- What this does NOT change:
--
--   - No columns added, renamed, or removed (price_cents already exists).
--   - No status values added, removed, or renamed.
--   - No RLS policies added, removed, or altered. In particular the existing
--     driver self-assign path (eligible active drivers updating pending rows
--     via acceptPakyawanBooking) works exactly as before and is NOT retired
--     in this step.
--   - No frontend changes in this file. No fare-engine changes. No dispatch,
--     GPS/presence, or Ride Now changes.
--   - The RPC cannot touch driver_id, customer fields, vehicle fields,
--     booking date/time, or pickup/destination — its UPDATE lists exactly
--     price_cents, status, and updated_at.
--
-- Concurrency:
--
--   The UPDATE is conditional on (id AND status = 'pending'), so if two
--   admins quote the same booking, the second call updates zero rows and
--   raises a clear 'Only pending Pakyawan bookings can be quoted.' exception.

create or replace function public.admin_quote_pakyawan(p_booking_id uuid, p_price_cents integer)
returns public.pakyawan_bookings
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
  v_row public.pakyawan_bookings;
begin
  v_role := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');

  if v_role <> 'admin' then
    raise exception 'Only an administrator can quote Pakyawan bookings.';
  end if;

  if p_booking_id is null then
    raise exception 'A booking id is required.';
  end if;

  if p_price_cents is null then
    raise exception 'A quoted price is required.';
  end if;

  if p_price_cents < 0 then
    raise exception 'The quoted price cannot be negative.';
  end if;

  update public.pakyawan_bookings
     set price_cents = p_price_cents,
         status = 'quoted',
         updated_at = now()
   where id = p_booking_id
     and status = 'pending'
  returning * into v_row;

  if not found then
    if not exists (select 1 from public.pakyawan_bookings where id = p_booking_id) then
      raise exception 'Pakyawan booking not found.';
    end if;

    raise exception 'Only pending Pakyawan bookings can be quoted.';
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_quote_pakyawan(uuid, integer) from public;
grant execute on function public.admin_quote_pakyawan(uuid, integer) to authenticated;

-- Bislig Ride: Pakyawan automated platform, PHASE B7 — customer confirmation
-- lands directly on scheduled.
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Scope (B7 only):
--
--   Redefines public.confirm_pakyawan_booking(p_booking_id, p_access_token)
--   so a successful customer confirmation atomically transitions
--
--     quoted → confirmed → scheduled
--
--   in ONE operation. There is no externally visible intermediate state:
--   a single conditional UPDATE writes the final state. The browser never
--   calls confirm-then-schedule separately, so a booking can never get stuck
--   at confirmed.
--
--   The intermediate confirmed state is intentionally NOT persisted. The
--   'confirmed' status value remains valid in the CHECK constraint (and the
--   admin-quote path semantics are unchanged), but the customer path now
--   lands directly on 'scheduled', which is what the customer UI displays.
--
-- Rules enforced atomically (booking row locked FOR UPDATE):
--
--   - booking id + access token must match (same no-oracle behavior as
--     before: bad id and bad token produce the identical generic error)
--   - status is exactly 'quoted'
--   - price_cents is present (a quote without a price can never confirm)
--   - second confirmation updates zero rows and is rejected
--
--   On success, exactly status ('scheduled') + updated_at change. Price,
--   driver, customer fields, dates, locations, vehicle fields are never
--   touched.
--
-- What this does NOT change:
--
--   - Same RPC name and signature: existing callers
--     (confirmPakyawanBooking) work unchanged.
--   - Same SECURITY DEFINER posture, search_path, and EXECUTE grants
--     (re-issued below; anon + authenticated, no public).
--   - No RLS policy changes. No table GRANT changes. No new tables.
--   - No driver/accept/decline, dispatch, redispatch, price-proposal,
--     lifecycle, chat, ratings, or Ride Now changes.

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

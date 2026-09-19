-- Bislig Ride: Pakyawan automated platform, PHASE B8 — driver trip-day lifecycle.
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Scope (B8 only — scheduled trip execution by the assigned driver):
--
--   public.advance_pakyawan_status(p_booking_id uuid, p_next_status text)
--   SECURITY DEFINER RPC implementing exactly these forward transitions:
--
--     scheduled     → driver_on_way
--     driver_on_way → driver_arrived
--     driver_arrived → in_progress
--     in_progress   → completed
--
--   Every other transition is rejected. The operation is atomic under a row
--   lock; exactly status + updated_at change. Price, driver, customer fields,
--   dates, locations, and vehicle fields are never touched.
--
-- What this does NOT implement (later phases or out of scope):
--
--   - No cancellation workflow or redesign (pakyawan_cancellations ledger
--     stays as inert foundation; no cancel RPC here).
--   - No ratings changes (ride_ratings stays Ride-Now-only; no Pakyawan
--     rating table here — completed state is sufficient for this phase).
--   - No price/quote/confirm changes, no dispatch/accept/decline/redispatch
--     changes, no chat, no UI in this file.
--   - No RLS policy changes. No table GRANT changes. No Ride Now changes
--     (dispatch core, offers, presence, GPS, fare, ratings, UI untouched).

create or replace function public.advance_pakyawan_status(p_booking_id uuid, p_next_status text)
returns setof public.pakyawan_bookings
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_driver_id uuid;
  v_booking public.pakyawan_bookings;
begin
  -- Driver identity comes from the session only. There is no driver_id
  -- parameter, so advancing another driver's trip is structurally impossible.
  select d.id
    into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active';

  if v_driver_id is null then
    raise exception 'Only the assigned driver can update this trip.'
      using errcode = '42501';
  end if;

  if p_booking_id is null then
    raise exception 'A booking id is required.';
  end if;

  if p_next_status is null
    or p_next_status not in ('driver_on_way', 'driver_arrived', 'in_progress', 'completed')
  then
    raise exception 'Invalid trip status.'
      using errcode = 'XX001';
  end if;

  select b.*
    into v_booking
    from public.pakyawan_bookings b
   where b.id = p_booking_id
   for update;

  if not found then
    raise exception 'Pakyawan booking not found.';
  end if;

  if v_booking.driver_id is distinct from v_driver_id then
    raise exception 'This trip is no longer assigned to you.'
      using errcode = 'XX001';
  end if;

  if v_booking.status = 'scheduled' and p_next_status <> 'driver_on_way'
    or v_booking.status = 'driver_on_way' and p_next_status <> 'driver_arrived'
    or v_booking.status = 'driver_arrived' and p_next_status <> 'in_progress'
    or v_booking.status = 'in_progress' and p_next_status <> 'completed'
  then
    raise exception 'This trip cannot move to that status right now.'
      using errcode = 'XX001';
  end if;

  if v_booking.status not in ('scheduled', 'driver_on_way', 'driver_arrived', 'in_progress') then
    raise exception 'This trip cannot move to that status right now.'
      using errcode = 'XX001';
  end if;

  update public.pakyawan_bookings
     set status = p_next_status,
         updated_at = now()
   where id = v_booking.id;

  return query
    select b.* from public.pakyawan_bookings b where b.id = v_booking.id;
end;
$$;

revoke all on function public.advance_pakyawan_status(uuid, text) from public;
grant execute on function public.advance_pakyawan_status(uuid, text) to authenticated, service_role;

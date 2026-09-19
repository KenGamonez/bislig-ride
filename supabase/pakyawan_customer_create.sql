-- Bislig Ride: customer Pakyawan creation via narrow RPC (additive, idempotent).
-- Run this file in the Supabase SQL editor.
--
-- Problem:
--
--   createPakyawanBooking() intentionally uses insert(...).select().single()
--   so the anonymous booker immediately receives the generated id +
--   access_token required for customer tracking. PostgreSQL/PostgREST requires
--   SELECT privilege for the RETURNING clause, but there is deliberately no
--   anonymous SELECT RLS policy (adding one would expose a direct table-read
--   path), so the call is rejected even with table-level grants in place.
--
-- Fix (keeps the no-anon-SELECT-policy model):
--
--   public.create_pakyawan_booking(...) SECURITY DEFINER RPC that inserts
--   exactly the customer payload and returns ONLY (id, access_token).
--   Anonymous reads of the table remain impossible; the token-gated
--   get_/confirm_pakyawan_booking RPCs remain the only read/confirm paths.
--
-- What this adds:
--
--   1. public.create_pakyawan_booking(...) -> TABLE (id uuid, access_token uuid)
--      Parameters mirror PakyawanBookingInsert exactly; no id, no status, no
--      token accepted from the caller. Database defaults generate id,
--      status ('pending'), access_token, and timestamps. Column NOT NULL and
--      CHECK constraints (passengers, trip_type, estimated_hours, required
--      text) validate the payload; violations abort with no partial row.
--
-- What this does NOT change:
--
--   - No columns added, modified, or renamed. No RLS policies added, removed,
--     or altered. No existing RPC redefined (admin_quote, get_, confirm_ all
--     untouched). No driver self-assign change. No fare/dispatch/GPS/Ride Now
--     change. The RPC cannot set price, status, driver, or anything beyond
--     the customer payload columns.

create or replace function public.create_pakyawan_booking(
  p_customer_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_booking_date date,
  p_pickup_time time,
  p_pickup_location text,
  p_destination text,
  p_passengers integer,
  p_trip_type text,
  p_estimated_hours integer default null,
  p_special_requests text default null
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
  insert into public.pakyawan_bookings (
    customer_id,
    customer_name,
    customer_phone,
    booking_date,
    pickup_time,
    pickup_location,
    destination,
    passengers,
    trip_type,
    estimated_hours,
    special_requests
  ) values (
    p_customer_id,
    p_customer_name,
    p_customer_phone,
    p_booking_date,
    p_pickup_time,
    p_pickup_location,
    p_destination,
    p_passengers,
    p_trip_type,
    p_estimated_hours,
    p_special_requests
  )
  returning pakyawan_bookings.id, pakyawan_bookings.access_token into v_id, v_token;

  id := v_id;
  access_token := v_token;
  return next;
end;
$$;

revoke all on function public.create_pakyawan_booking(uuid, text, text, date, time, text, text, integer, text, integer, text) from public;
grant execute on function public.create_pakyawan_booking(uuid, text, text, date, time, text, text, integer, text, integer, text) to anon, authenticated;

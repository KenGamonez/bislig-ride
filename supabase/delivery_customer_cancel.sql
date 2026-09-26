-- Bislig Ride: anonymous passenger cancellation for unassigned deliveries.
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Scope (passenger pre-driver cancellation only):
--
--   public.cancel_delivery_booking(p_delivery_id uuid, p_access_token uuid)
--   SECURITY DEFINER RPC implementing the narrow safe path:
--
--     PASSENGER CANCELS → status pending/dispatching → cancelled
--
--   Anonymous passengers book without an account, so the per-booking
--   access_token (same model as get_/confirm_delivery_quote) is the only
--   authorization. No login, no admin privilege, no direct table writes.
--
-- Rules enforced atomically (booking row locked FOR UPDATE):
--
--   - booking id + access token must match (same no-oracle behavior as the
--     other customer RPCs: bad id and bad token produce the identical
--     generic error).
--   - status must be exactly 'pending' or 'dispatching' (assigned, quoted,
--     confirmed, on-way, arrived, picked-up, in-transit, delivered,
--     cancelled, failed, and no_driver all rejected).
--   - driver_id must be NULL (an assigned race loses to the driver: the
--     row-level status/driver check runs inside the same locked read).
--   - Outstanding dispatch offers need no explicit withdrawal: the accept
--     path only accepts pending/dispatching bookings, and the redispatch
--     worker skips cancelled rows, so orphaned offers expire harmlessly.
--
--   On success, exactly status ('cancelled') + updated_at change, plus one
--   delivery_cancellations ledger row (cancelled_by NULL since the
--   passenger has no auth id, role 'customer'). Customer fields, dates,
--   locations, price, driver_id are never touched.
--
-- What this does NOT change:
--
--   - Same SECURITY DEFINER posture, search_path, and EXECUTE grants
--     (anon + authenticated, no public) as the other customer RPCs.
--   - No RLS policy changes. No table GRANT changes. Anonymous reads/writes
--     still happen only through token-gated RPCs.
--   - No driver/accept/decline, dispatch, redispatch, price-proposal,
--     lifecycle, chat, rating, proof, or Ride Now changes.

create or replace function public.cancel_delivery_booking(p_delivery_id uuid, p_access_token uuid)
returns table(
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
declare
  v_row record;
begin
  if p_delivery_id is null or p_access_token is null then
    raise exception 'Delivery reference and access token are required.';
  end if;

  select b.*
    into v_row
    from public.deliveries b
   where b.id = p_delivery_id
     and b.access_token = p_access_token
   for update;

  if not found then
    raise exception 'Delivery not found. Check your delivery reference and try again.';
  end if;

  if v_row.status <> 'pending' and v_row.status <> 'dispatching' then
    raise exception 'Only deliveries awaiting a driver can be cancelled.';
  end if;

  if v_row.driver_id is not null then
    raise exception 'Only deliveries awaiting a driver can be cancelled.';
  end if;

  update public.deliveries
     set status = 'cancelled',
         updated_at = now()
   where deliveries.id = v_row.id;

  insert into public.delivery_cancellations (delivery_id, cancelled_by, cancelled_by_role, reason)
  values (v_row.id, null, 'customer', 'Cancelled by sender before driver assignment.');

  return query
    select b.id, b.customer_id, b.sender_name, b.sender_phone, b.package_type,
      b.package_details, b.package_size, b.pickup_address, b.delivery_address,
      b.preferred_date, b.preferred_time, b.vehicle_preference, b.price_cents,
      b.status, b.driver_id, b.created_at, b.updated_at,
      exists (select 1 from public.delivery_proofs p where p.delivery_id = b.id) as proof_available
      from public.deliveries b
     where b.id = v_row.id;
end;
$$;

revoke all on function public.cancel_delivery_booking(uuid, uuid) from public;
grant execute on function public.cancel_delivery_booking(uuid, uuid) to anon, authenticated, service_role;

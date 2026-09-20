-- Bislig Ride: Pa-Deliver trip-day lifecycle, PHASE 4.
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Scope (Phase 4 only — assigned driver advances the trip):
--
--   public.advance_delivery_status(p_delivery_id uuid, p_next_status text)
--   SECURITY DEFINER RPC implementing exactly these forward transitions:
--
--     assigned      → driver_on_way
--     driver_on_way → driver_arrived
--     driver_arrived → picked_up
--     picked_up     → in_transit
--     in_transit    → delivered
--
--   Every other transition is rejected, including skips
--   (assigned → delivered), backwards moves, and any move from a terminal
--   state. The operation is atomic under a row lock; exactly status +
--   updated_at change. Price, driver, customer fields, dates, locations, and
--   vehicle fields are never touched.
--
--   Driver reads of own held deliveries (needed so the driver UI reflects
--   backend state after refresh, not just session state):
--
--   - Least-privilege SELECT policy: assigned driver reads only rows where
--     driver_id is their own driver record. No anonymous access. No customer
--     table reads (customers stay on the token RPC).
--   - GRANT SELECT ON deliveries TO authenticated (required for the above
--     policy and the existing admin policy to take effect at all; RLS still
--     decides every row).
--
-- What this does NOT implement (later phases or out of scope):
--
--   - No cancellation workflow or redesign (ledger pattern decision deferred;
--     cancelled/failed remain valid terminal values with no writer yet).
--   - No ratings changes. No proof-of-delivery (no buckets, no photo/signature
--     tables). No pricing/payment changes. No chat.
--   - No RLS changes beyond the single own-assigned-rows SELECT policy above.
--     No table GRANT changes beyond the single SELECT grant above.
--   - No Ride Now or Pakyawan changes (dispatch cores, offers, presence,
--     GPS, fare, ratings, UI untouched). All new objects use delivery_*
--     naming and remain isolated.

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
  -- Driver identity comes from the session only. There is no driver_id
  -- parameter, so advancing another driver's trip is structurally impossible.
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
    or p_next_status not in ('driver_on_way', 'driver_arrived', 'picked_up', 'in_transit', 'delivered')
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

  if v_delivery.status = 'assigned' and p_next_status <> 'driver_on_way'
    or v_delivery.status = 'driver_on_way' and p_next_status <> 'driver_arrived'
    or v_delivery.status = 'driver_arrived' and p_next_status <> 'picked_up'
    or v_delivery.status = 'picked_up' and p_next_status <> 'in_transit'
    or v_delivery.status = 'in_transit' and p_next_status <> 'delivered'
  then
    raise exception 'This delivery cannot move to that status right now.'
      using errcode = 'XX001';
  end if;

  if v_delivery.status not in ('assigned', 'driver_on_way', 'driver_arrived', 'picked_up', 'in_transit') then
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

-- Assigned-driver reads (refresh-authoritative driver UI). Least privilege:
-- only rows assigned to the caller's own driver record; anonymous gets
-- nothing; customers stay on the token RPC.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'deliveries'
      and policyname = 'Assigned drivers can view their deliveries'
  ) then
    create policy "Assigned drivers can view their deliveries"
      on public.deliveries for select
      to authenticated
      using (
        driver_id = (select d.id from public.drivers d where d.auth_user_id = auth.uid())
      );
  end if;
end $$;

grant select on public.deliveries to authenticated;

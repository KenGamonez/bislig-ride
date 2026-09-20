-- Bislig Ride: Pa-Deliver automated platform, PHASE 3 — atomic first-valid accept.
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Scope (Phase 3 only — driver acceptance + assignment):
--
--   public.accept_delivery_offer(p_offer_id uuid): the single controlled
--   mutation path for converting a driver offer into a held delivery:
--
--     DRIVER RECEIVES OFFER → DRIVER ACCEPTS → FIRST VALID ACCEPTANCE WINS
--     → DELIVERY BECOMES ASSIGNED → OTHER ACTIVE OFFERS WITHDRAWN
--
--   Everything happens in one transaction with row locks, so two drivers
--   accepting the same delivery concurrently cannot both succeed: the loser
--   blocks on the locks, then sees the delivery is no longer pending (or the
--   offer is no longer offered) and receives a safe "no longer available"
--   error. Frontend timing is never trusted.
--
--   Atomic commit on success (and nothing else):
--
--   - winning offer → 'accepted' + decided_at
--   - sibling 'offered' offers for the same delivery → 'withdrawn' + decided_at
--     (already declined/expired/withdrawn rows are never touched)
--   - delivery → status 'assigned', driver_id = winner, updated_at = now()
--
--   Driver identity comes from the session only. There is no driver_id
--   parameter, so impersonation by argument is structurally impossible.
--   Eligibility (active, delivery-capable, valid account, no same-date held
--   delivery) is re-verified at accept time, mirroring the dispatch rules.
--
-- What this does NOT implement (later phases):
--
--   - No decline RPC, no price proposal, no lifecycle advance, no chat, no
--     ratings, no proof of delivery, no UI in this file.
--   - No change to the legacy direct-UPDATE self-assign path, which does not
--     exist for deliveries (all delivery assignment flows through this RPC).
--   - No RLS policy changes. No table GRANT changes. No Ride Now or Pakyawan
--     changes (dispatch cores, offers, presence, GPS, fare, ratings, UI
--     untouched). All new objects use delivery_* naming and remain isolated.

create or replace function public.accept_delivery_offer(p_offer_id uuid)
returns setof public.deliveries
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_driver_id uuid;
  v_delivery public.deliveries;
  v_offer public.delivery_offers;
begin
  select d.id
    into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active';

  if v_driver_id is null then
    raise exception 'Only an active driver can accept a delivery offer.'
      using errcode = '42501';
  end if;

  if p_offer_id is null then
    raise exception 'An offer id is required.';
  end if;

  -- The driver's own offer, locked: serializes concurrent accept attempts
  -- on the same offer row.
  select o.*
    into v_offer
    from public.delivery_offers o
   where o.id = p_offer_id
     and o.driver_id = v_driver_id
   for update;

  if not found then
    raise exception 'This delivery offer is no longer available.'
      using errcode = 'XX001';
  end if;

  if v_offer.status <> 'offered' then
    raise exception 'This delivery offer is no longer available.'
      using errcode = 'XX001';
  end if;

  if v_offer.expires_at <= now() then
    update public.delivery_offers
       set status = 'expired', decided_at = now()
     where id = v_offer.id;

    raise exception 'This delivery offer is no longer available.'
      using errcode = 'XX001';
  end if;

  -- The delivery, locked: serializes concurrent accepts across different
  -- offer rows of the same delivery (the race-condition guarantee).
  select b.*
    into v_delivery
    from public.deliveries b
   where b.id = v_offer.delivery_id
   for update;

  if not found then
    raise exception 'Delivery not found.';
  end if;

  if (v_delivery.status <> 'pending' and v_delivery.status <> 'dispatching')
    or v_delivery.driver_id is not null
  then
    raise exception 'This delivery is no longer available.'
      using errcode = 'XX001';
  end if;

  -- Re-verify the driver is still fit to take this delivery right now
  -- (mirrors the Phase 2 dispatch eligibility: active, delivery-capable,
  -- valid account, no conflicting held delivery on the same date).
  if not exists (
    select 1
      from public.drivers d
     where d.id = v_driver_id
       and d.status = 'active'
       and d.can_accept_deliveries = true
       and d.auth_user_id is not null
       and not exists (
         select 1
           from public.deliveries held
          where held.driver_id = v_driver_id
            and held.preferred_date is not distinct from v_delivery.preferred_date
            and held.id is distinct from v_delivery.id
            and held.status in (
              'assigned', 'driver_on_way', 'driver_arrived', 'picked_up', 'in_transit'
            )
       )
  ) then
    raise exception 'You are no longer eligible for this delivery.'
      using errcode = 'XX001';
  end if;

  update public.delivery_offers
     set status = 'accepted', decided_at = now()
   where id = v_offer.id;

  update public.delivery_offers
     set status = 'withdrawn', decided_at = now()
   where delivery_id = v_delivery.id
     and status = 'offered'
     and id <> v_offer.id;

  update public.deliveries
     set driver_id = v_driver_id, status = 'assigned', updated_at = now()
   where id = v_delivery.id;

  return query
    select b.* from public.deliveries b where b.id = v_delivery.id;
end;
$$;

revoke all on function public.accept_delivery_offer(uuid) from public;
grant execute on function public.accept_delivery_offer(uuid) to authenticated, service_role;

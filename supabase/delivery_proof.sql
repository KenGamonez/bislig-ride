-- Bislig Ride: Pa-Deliver proof of delivery, PHASE 5.
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Scope (Phase 5 only — one photo + server-side completion record):
--
--   1. Storage bucket `delivery-proofs` (PRIVATE) for exactly one final
--      proof photo per delivery, with server-side 5 MB + image MIME
--      enforcement matching the existing driver photo/upload conventions.
--   2. public.delivery_proofs ledger: (delivery_id UNIQUE, driver_id,
--      storage_path, created_at). One final proof per delivery; no
--      multi-photo system, no extra metadata.
--   3. public.complete_delivery_with_proof(p_delivery_id, p_storage_path):
--      the ONLY normal path from in_transit to delivered. Validates the
--      assigned driver, the in_transit state, and the uploaded object, then
--      atomically creates the proof row and completes the delivery.
--   4. advance_delivery_status is redefined WITHOUT the in_transit →
--      delivered transition, so proof cannot be bypassed through the generic
--      advancer. All other transitions are unchanged.
--   5. get_delivery_booking additionally exposes proof_available boolean so
--      the customer can see that proof exists. No raw storage paths are
--      exposed to customers.
--
-- What this does NOT implement:
--
--   - No signatures, recipient accounts/OTP, SMS/email verification, AI
--     verification, chat, pricing/payment, ratings, maps, admin dashboard.
--   - No RLS changes beyond the least-privilege policies below. No table
--     GRANT changes. No Ride Now or Pakyawan changes (tables, RPCs,
--     policies, UI untouched). All new objects use delivery_* naming.

-- ---------------------------------------------------------------------------
-- 1. Private proof bucket (mirrors driver_photos.sql conventions).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'delivery-proofs',
  'delivery-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Assigned driver may upload ONLY under their own in_transit delivery path.
drop policy if exists "Assigned drivers can upload delivery proof" on storage.objects;
create policy "Assigned drivers can upload delivery proof"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'delivery-proofs' and
    exists (
      select 1
        from public.deliveries b
        join public.drivers d on d.id = b.driver_id
       where d.auth_user_id = auth.uid()
         and b.status = 'in_transit'
         and split_part(name, '/', 1) = b.id::text
    )
  );

-- Assigned driver may read their own delivery's proof objects.
drop policy if exists "Assigned drivers can view delivery proof" on storage.objects;
create policy "Assigned drivers can view delivery proof"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'delivery-proofs' and
    exists (
      select 1
        from public.deliveries b
        join public.drivers d on d.id = b.driver_id
       where d.auth_user_id = auth.uid()
         and split_part(name, '/', 1) = b.id::text
    )
  );

-- Assigned driver may remove a just-uploaded object (orphan cleanup when the
-- completion call fails after a successful upload).
drop policy if exists "Assigned drivers can remove delivery proof uploads" on storage.objects;
create policy "Assigned drivers can remove delivery proof uploads"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'delivery-proofs' and
    exists (
      select 1
        from public.deliveries b
        join public.drivers d on d.id = b.driver_id
       where d.auth_user_id = auth.uid()
         and split_part(name, '/', 1) = b.id::text
    )
  );

-- Admins can view proof objects for support/exception handling.
drop policy if exists "Admins can view delivery proof objects" on storage.objects;
create policy "Admins can view delivery proof objects"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'delivery-proofs' and
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 2. Proof ledger: one final proof row per delivery.
-- ---------------------------------------------------------------------------

create table if not exists public.delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  driver_id uuid not null references public.drivers(id),
  storage_path text not null,
  created_at timestamptz not null default now()
);

do $$
begin
  alter table public.delivery_proofs
    add constraint delivery_proofs_delivery_id_key unique (delivery_id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create index if not exists delivery_proofs_driver_idx
    on public.delivery_proofs (driver_id);
exception
  when duplicate_object then null;
end $$;

alter table public.delivery_proofs enable row level security;

-- Reads only: writes go exclusively through complete_delivery_with_proof.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'delivery_proofs'
      and policyname = 'Authenticated admins can review delivery proofs'
  ) then
    create policy "Authenticated admins can review delivery proofs"
      on public.delivery_proofs for select
      to authenticated
      using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'delivery_proofs'
      and policyname = 'Assigned drivers can view their delivery proofs'
  ) then
    create policy "Assigned drivers can view their delivery proofs"
      on public.delivery_proofs for select
      to authenticated
      using (
        driver_id = (select d.id from public.drivers d where d.auth_user_id = auth.uid())
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Server-authoritative completion: proof validation + delivered.
-- ---------------------------------------------------------------------------

create or replace function public.complete_delivery_with_proof(p_delivery_id uuid, p_storage_path text)
returns setof public.deliveries
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_driver_id uuid;
  v_delivery public.deliveries;
  v_object record;
  v_extension text;
  v_size bigint;
  v_mime text;
begin
  -- Driver identity comes from the session only. There is no driver_id
  -- parameter, so completing another driver's delivery is impossible.
  select d.id
    into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active';

  if v_driver_id is null then
    raise exception 'Only the assigned driver can complete this delivery.'
      using errcode = '42501';
  end if;

  if p_delivery_id is null then
    raise exception 'A delivery id is required.';
  end if;

  if p_storage_path is null or p_storage_path = '' then
    raise exception 'A proof photo is required to complete the delivery.'
      using errcode = 'XX001';
  end if;

  -- Path must live under this delivery's own folder with an image extension.
  -- No personal information is ever encoded in proof paths.
  if split_part(p_storage_path, '/', 1) <> p_delivery_id::text then
    raise exception 'Invalid proof photo.'
      using errcode = 'XX001';
  end if;

  v_extension := lower(substring(p_storage_path from '\.([A-Za-z0-9]{1,8})$'));

  if v_extension not in ('jpg', 'jpeg', 'png', 'webp') then
    raise exception 'Invalid proof photo.'
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

  if v_delivery.status <> 'in_transit' then
    raise exception 'This delivery cannot be completed right now.'
      using errcode = 'XX001';
  end if;

  -- The uploaded object must actually exist with sane image metadata.
  select o.metadata into v_object
    from storage.objects o
   where o.bucket_id = 'delivery-proofs'
     and o.name = p_storage_path;

  if not found then
    raise exception 'Proof upload not found. Please upload the photo again.'
      using errcode = 'XX001';
  end if;

  v_size := nullif(v_object.metadata ->> 'size', '')::bigint;
  v_mime := v_object.metadata ->> 'mimetype';

  if v_size is null or v_size <= 0 or v_size > 5242880 then
    raise exception 'Invalid proof photo.'
      using errcode = 'XX001';
  end if;

  if v_mime not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Invalid proof photo.'
      using errcode = 'XX001';
  end if;

  insert into public.delivery_proofs (delivery_id, driver_id, storage_path)
  values (v_delivery.id, v_driver_id, p_storage_path);

  update public.deliveries
     set status = 'delivered',
         updated_at = now()
   where id = v_delivery.id;

  return query
    select b.* from public.deliveries b where b.id = v_delivery.id;
end;
$$;

revoke all on function public.complete_delivery_with_proof(uuid, text) from public;
grant execute on function public.complete_delivery_with_proof(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Close the proof bypass: in_transit can no longer become delivered
--    through the generic advancer. Proof-backed completion above is the only
--    normal path. All other transitions are unchanged.
-- ---------------------------------------------------------------------------

-- ============================================================================
-- SUPERSEDED — DO NOT APPLY THIS FUNCTION DEFINITION
-- (advance_delivery_status)
-- Canonical authoritative definition:
-- supabase/_canonical/rpc_consolidation_v1.sql
-- This historical definition is retained for provenance only.
-- Re-applying it can regress the live production behavior.
-- NOTE: the authoritative get_delivery_booking definition in this
-- same file (section 5) is NOT superseded and must keep working.
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

  if v_delivery.status = 'assigned' and p_next_status <> 'driver_on_way'
    or v_delivery.status = 'driver_on_way' and p_next_status <> 'driver_arrived'
    or v_delivery.status = 'driver_arrived' and p_next_status <> 'picked_up'
    or v_delivery.status = 'picked_up' and p_next_status <> 'in_transit'
  then
    raise exception 'This delivery cannot move to that status right now.'
      using errcode = 'XX001';
  end if;

  if v_delivery.status not in ('assigned', 'driver_on_way', 'driver_arrived', 'picked_up') then
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

-- ---------------------------------------------------------------------------
-- 5. Customer read gains proof_available (nothing else changes about it).
-- ---------------------------------------------------------------------------

-- NOTE: changing the return type (composite row -> TABLE) requires DROP +
-- CREATE rather than CREATE OR REPLACE (Postgres error 42P13 otherwise).
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

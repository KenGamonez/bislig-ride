-- Bislig Ride: Pa-Deliver post-completion chat + mutual ratings (additive, idempotent).
-- Run this file in the Supabase SQL editor.
--
-- Scope (post-completion only — simple booking conversation + 1-5 star ratings):
--
--   Chat and ratings become available ONLY once a delivery reaches
--   'delivered'. No lifecycle, dispatch, fare, or workflow changes.
--
-- What this adds:
--
--   1. public.delivery_messages(id, delivery_id FK -> deliveries
--      ON DELETE CASCADE, sender_role CHECK passenger/driver,
--      message CHECK trimmed 1..1000 chars, created_at) + index on
--      (delivery_id, created_at). Deleting a delivery deletes its messages.
--
--   2. public.send_delivery_message / public.list_delivery_messages
--      SECURITY DEFINER RPCs with the same dual authorization model as the
--      Pakyawan chat: passengers present the delivery access token (no
--      account needed), drivers must be the assigned active driver
--      (identity from auth.uid() only). Sending requires a delivered
--      booking; listing requires token match or assigned-driver ownership.
--
--   3. public.delivery_ratings(id, delivery_id FK -> deliveries
--      ON DELETE CASCADE, rater_role CHECK passenger/driver, stars CHECK
--      1..5, comment trimmed, created_at) + UNIQUE(delivery_id, rater_role)
--      so each side submits exactly ONE rating per booking. No editing:
--      resubmission is rejected.
--
--   4. public.submit_delivery_rating / public.get_delivery_ratings
--      SECURITY DEFINER RPCs with the same dual authorization model.
--      Ratings require a delivered booking.
--
--   5. One narrow authenticated SELECT policy on delivery_messages so the
--      assigned driver can receive Realtime INSERT events for their own
--      deliveries. No anonymous table policy of any kind on either table.
--
--   6. Both tables added to the supabase_realtime publication
--      (conditional, additive only).
--
-- What this does NOT change:
--
--   - No deliveries columns, statuses, RPCs, RLS, or grants touched.
--   - No anonymous table privileges on either new table (passenger access
--     is RPC-only, mirroring get_/confirm_delivery_quote).
--   - No authenticated INSERT/UPDATE/DELETE grants or policies: all writes
--     go through the new RPCs.
--   - No driver reputation fields touched; ratings are per-booking records.
--   - No Ride Now/Pakyawan/dispatch/fare/GPS/auth changes.

-- ---------------------------------------------------------------------------
-- 1. Tables + indexes + RLS.
-- ---------------------------------------------------------------------------

create table if not exists public.delivery_messages (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  sender_role text not null check (sender_role in ('passenger', 'driver')),
  message text not null check (char_length(trim(both from message)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists delivery_messages_delivery_created_idx
  on public.delivery_messages (delivery_id, created_at);

alter table public.delivery_messages enable row level security;

create table if not exists public.delivery_ratings (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  rater_role text not null check (rater_role in ('passenger', 'driver')),
  stars integer not null check (stars between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  unique (delivery_id, rater_role)
);

create index if not exists delivery_ratings_delivery_idx
  on public.delivery_ratings (delivery_id);

alter table public.delivery_ratings enable row level security;

-- Narrow driver visibility for realtime message delivery. There is
-- deliberately no anonymous policy: passengers reach messages only through
-- the token-gated RPCs below. Ratings need no realtime: both sides fetch on
-- mount and after their own submission.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'delivery_messages'
      and policyname = 'Assigned drivers can read their delivery messages'
  ) then
    create policy "Assigned drivers can read their delivery messages"
      on public.delivery_messages for select
      to authenticated
      using (
        exists (
          select 1
            from public.deliveries d
            join public.drivers dr on dr.id = d.driver_id
           where d.id = delivery_messages.delivery_id
             and dr.auth_user_id = auth.uid()
        )
      );
  end if;
end $$;

-- Table-level grant required before the RLS policy above can take effect
-- (PostgreSQL checks GRANTs before RLS). Authenticated SELECT only; no anon
-- grant of any kind, no INSERT/UPDATE/DELETE grants (writes are RPC-only).
grant select on public.delivery_messages to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Realtime publication (additive only).
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'delivery_messages'
  ) then
    alter publication supabase_realtime add table public.delivery_messages;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'delivery_ratings'
  ) then
    alter publication supabase_realtime add table public.delivery_ratings;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Message RPCs: dual authorization, server-derived sender role.
-- ---------------------------------------------------------------------------

create or replace function public.send_delivery_message(
  p_delivery_id uuid,
  p_access_token uuid,
  p_sender_role text,
  p_message text
)
returns public.delivery_messages
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_delivery public.deliveries;
  v_driver_id uuid;
  v_actual_role text;
  v_text text;
  v_row public.delivery_messages;
begin
  if p_delivery_id is null or p_sender_role is null or p_message is null then
    raise exception 'Delivery reference, sender role, and message are required.';
  end if;

  if p_sender_role not in ('passenger', 'driver') then
    raise exception 'Delivery reference, sender role, and message are required.';
  end if;

  v_text := trim(both from p_message);

  if char_length(v_text) < 1 or char_length(v_text) > 1000 then
    raise exception 'Messages must be between 1 and 1000 characters.';
  end if;

  select * into v_delivery
    from public.deliveries
   where id = p_delivery_id;

  if not found then
    raise exception 'Delivery not found. Check your delivery reference and try again.';
  end if;

  -- Post-completion conversation only.
  if v_delivery.status <> 'delivered' then
    raise exception 'Messages can only be sent once the delivery is completed.';
  end if;

  if v_delivery.driver_id is null then
    raise exception 'Messages can only be sent once a driver has completed this delivery.';
  end if;

  select d.id into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active';

  if p_sender_role = 'driver' then
    -- The role argument selects which proof is required; it grants nothing.
    if v_driver_id is null or v_delivery.driver_id is distinct from v_driver_id then
      raise exception 'You are not authorized to send messages for this delivery.';
    end if;

    v_actual_role := 'driver';
  else
    if p_access_token is null or v_delivery.access_token is distinct from p_access_token then
      raise exception 'Delivery not found. Check your delivery reference and try again.';
    end if;

    v_actual_role := 'passenger';
  end if;

  insert into public.delivery_messages (delivery_id, sender_role, message)
  values (v_delivery.id, v_actual_role, v_text)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.send_delivery_message(uuid, uuid, text, text) from public;
grant execute on function public.send_delivery_message(uuid, uuid, text, text) to anon, authenticated, service_role;

create or replace function public.list_delivery_messages(
  p_delivery_id uuid,
  p_access_token uuid
)
returns setof public.delivery_messages
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_delivery public.deliveries;
  v_driver_id uuid;
  v_token_ok boolean;
  v_is_driver boolean;
begin
  if p_delivery_id is null then
    raise exception 'Delivery reference and access token are required.';
  end if;

  select * into v_delivery
    from public.deliveries
   where id = p_delivery_id;

  if not found then
    raise exception 'Delivery not found. Check your delivery reference and try again.';
  end if;

  v_token_ok := p_access_token is not null
    and v_delivery.access_token is not distinct from p_access_token;

  select d.id into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active';

  v_is_driver := v_driver_id is not null
    and v_delivery.driver_id is not distinct from v_driver_id;

  if not v_token_ok and not v_is_driver then
    raise exception 'Delivery not found. Check your delivery reference and try again.';
  end if;

  return query
    select m.*
      from public.delivery_messages m
     where m.delivery_id = v_delivery.id
     order by m.created_at asc
     limit 100;
end;
$$;

revoke all on function public.list_delivery_messages(uuid, uuid) from public;
grant execute on function public.list_delivery_messages(uuid, uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Rating RPCs: one rating per side per booking, no editing.
-- ---------------------------------------------------------------------------

create or replace function public.submit_delivery_rating(
  p_delivery_id uuid,
  p_access_token uuid,
  p_rater_role text,
  p_stars integer,
  p_comment text
)
returns public.delivery_ratings
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_delivery public.deliveries;
  v_driver_id uuid;
  v_actual_role text;
  v_comment text;
  v_row public.delivery_ratings;
begin
  if p_delivery_id is null or p_rater_role is null or p_stars is null then
    raise exception 'Delivery reference, rater role, and stars are required.';
  end if;

  if p_rater_role not in ('passenger', 'driver') then
    raise exception 'Delivery reference, rater role, and stars are required.';
  end if;

  if p_stars < 1 or p_stars > 5 then
    raise exception 'Rating must be between 1 and 5 stars.';
  end if;

  v_comment := trim(both from coalesce(p_comment, ''));

  if char_length(v_comment) > 1000 then
    raise exception 'Comments must be 1000 characters or fewer.';
  end if;

  select * into v_delivery
    from public.deliveries
   where id = p_delivery_id;

  if not found then
    raise exception 'Delivery not found. Check your delivery reference and try again.';
  end if;

  if v_delivery.status <> 'delivered' then
    raise exception 'Ratings can only be submitted after the delivery is completed.';
  end if;

  if v_delivery.driver_id is null then
    raise exception 'Ratings can only be submitted for an assigned delivery.';
  end if;

  select d.id into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active';

  if p_rater_role = 'driver' then
    if v_driver_id is null or v_delivery.driver_id is distinct from v_driver_id then
      raise exception 'You are not authorized to rate this delivery.';
    end if;

    v_actual_role := 'driver';
  else
    if p_access_token is null or v_delivery.access_token is distinct from p_access_token then
      raise exception 'Delivery not found. Check your delivery reference and try again.';
    end if;

    v_actual_role := 'passenger';
  end if;

  insert into public.delivery_ratings (delivery_id, rater_role, stars, comment)
  values (v_delivery.id, v_actual_role, p_stars, v_comment)
  returning * into v_row;

  return v_row;
exception
  when unique_violation then
    raise exception 'A rating has already been submitted for this delivery.';
end;
$$;

revoke all on function public.submit_delivery_rating(uuid, uuid, text, integer, text) from public;
grant execute on function public.submit_delivery_rating(uuid, uuid, text, integer, text) to anon, authenticated, service_role;

create or replace function public.get_delivery_ratings(
  p_delivery_id uuid,
  p_access_token uuid
)
returns setof public.delivery_ratings
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_delivery public.deliveries;
  v_driver_id uuid;
  v_token_ok boolean;
  v_is_driver boolean;
begin
  if p_delivery_id is null then
    raise exception 'Delivery reference and access token are required.';
  end if;

  select * into v_delivery
    from public.deliveries
   where id = p_delivery_id;

  if not found then
    raise exception 'Delivery not found. Check your delivery reference and try again.';
  end if;

  v_token_ok := p_access_token is not null
    and v_delivery.access_token is not distinct from p_access_token;

  select d.id into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active';

  v_is_driver := v_driver_id is not null
    and v_delivery.driver_id is not distinct from v_driver_id;

  if not v_token_ok and not v_is_driver then
    raise exception 'Delivery not found. Check your delivery reference and try again.';
  end if;

  return query
    select r.*
      from public.delivery_ratings r
     where r.delivery_id = v_delivery.id
     order by r.created_at asc;
end;
$$;

revoke all on function public.get_delivery_ratings(uuid, uuid) from public;
grant execute on function public.get_delivery_ratings(uuid, uuid) to anon, authenticated, service_role;

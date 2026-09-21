-- Bislig Ride: Pakyawan booking-scoped chat foundation (additive, idempotent).
-- Run this file in the Supabase SQL editor.
--
-- Scope (chat foundation only — passenger <-> assigned driver, text only):
--
--   Optional, booking-scoped questions before the passenger confirms
--   (e.g. pickup clarifications). This is NOT bidding, NOT a negotiation
--   engine, NOT mandatory, and NOT a general messaging system.
--
-- What this adds:
--
--   1. public.pakyawan_messages(id, booking_id FK -> pakyawan_bookings
--      ON DELETE CASCADE, sender_role CHECK passenger/driver,
--      message CHECK trimmed 1..1000 chars, created_at) + index on
--      (booking_id, created_at). Deleting a booking deletes its messages.
--
--   2. public.send_pakyawan_message(p_booking_id, p_access_token,
--      p_sender_role, p_message) SECURITY DEFINER RPC. The client-supplied
--      role NEVER grants permission by itself: passengers must present the
--      booking access token (no account needed), drivers must be the
--      booking's assigned active driver (identity from auth.uid() only).
--      Chat requires an assigned driver. Returns the created row.
--
--   3. public.list_pakyawan_messages(p_booking_id, p_access_token)
--      SECURITY DEFINER RPC returning that booking's messages ordered by
--      created_at ASC (max 100). Same dual authorization model.
--
--   4. One narrow authenticated SELECT policy so the assigned driver can
--      receive Supabase Realtime INSERT events for their own bookings.
--      No anonymous table policy of any kind is created.
--
--   5. public.pakyawan_messages added to the supabase_realtime publication
--      (conditional, additive only). No access tokens in realtime filters;
--      realtime delivery still requires the SELECT policy above, so other
--      drivers receive nothing.
--
-- What this does NOT change:
--
--   - No pakyawan_bookings columns, statuses, RPCs, RLS, or grants touched.
--   - No anonymous table privileges on pakyawan_messages (passenger access
--     is RPC-only, mirroring get_/confirm_pakyawan_booking).
--   - No authenticated INSERT/UPDATE/DELETE grants or policies: all writes
--     go through send_pakyawan_message.
--   - No chat negotiation states, counters, typing indicators, attachments,
--     editing, deletion, read receipts, notifications, or admin access.
--   - No Ride Now, Pa-Deliver, fare, dispatch, GPS, or auth changes.

-- ---------------------------------------------------------------------------
-- 1. Table + index + RLS.
-- ---------------------------------------------------------------------------

create table if not exists public.pakyawan_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.pakyawan_bookings(id) on delete cascade,
  sender_role text not null check (sender_role in ('passenger', 'driver')),
  message text not null check (char_length(trim(both from message)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists pakyawan_messages_booking_created_idx
  on public.pakyawan_messages (booking_id, created_at);

alter table public.pakyawan_messages enable row level security;

-- Narrow driver visibility for realtime + any future driver reads. There is
-- deliberately no anonymous policy: passengers reach messages only through
-- the token-gated RPCs below.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pakyawan_messages'
      and policyname = 'Assigned drivers can read their Pakyawan messages'
  ) then
    create policy "Assigned drivers can read their Pakyawan messages"
      on public.pakyawan_messages for select
      to authenticated
      using (
        exists (
          select 1
            from public.pakyawan_bookings b
            join public.drivers d on d.id = b.driver_id
           where b.id = pakyawan_messages.booking_id
             and d.auth_user_id = auth.uid()
        )
      );
  end if;
end $$;

-- Table-level grant required before the RLS policy above can take effect
-- (PostgreSQL checks GRANTs before RLS). Authenticated SELECT only; no anon
-- grant of any kind, no INSERT/UPDATE/DELETE grants (writes are RPC-only).
grant select on public.pakyawan_messages to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Realtime publication (additive only).
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pakyawan_messages'
  ) then
    alter publication supabase_realtime add table public.pakyawan_messages;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Send RPC: dual authorization, server-derived sender role.
-- ---------------------------------------------------------------------------

create or replace function public.send_pakyawan_message(
  p_booking_id uuid,
  p_access_token uuid,
  p_sender_role text,
  p_message text
)
returns public.pakyawan_messages
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_booking public.pakyawan_bookings;
  v_driver_id uuid;
  v_actual_role text;
  v_text text;
  v_row public.pakyawan_messages;
begin
  if p_booking_id is null or p_sender_role is null or p_message is null then
    raise exception 'Booking reference, sender role, and message are required.';
  end if;

  if p_sender_role not in ('passenger', 'driver') then
    raise exception 'Booking reference, sender role, and message are required.';
  end if;

  v_text := trim(both from p_message);

  if char_length(v_text) < 1 or char_length(v_text) > 1000 then
    raise exception 'Messages must be between 1 and 1000 characters.';
  end if;

  select * into v_booking
    from public.pakyawan_bookings
   where id = p_booking_id;

  if not found then
    raise exception 'Booking not found. Check your booking reference and try again.';
  end if;

  -- Chat requires an assigned driver; unassigned bookings cannot be messaged.
  if v_booking.driver_id is null then
    raise exception 'Messages can only be sent once a driver has accepted this booking.';
  end if;

  select d.id into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active';

  if p_sender_role = 'driver' then
    -- The role argument selects which proof is required; it grants nothing.
    if v_driver_id is null or v_booking.driver_id is distinct from v_driver_id then
      raise exception 'You are not authorized to send messages for this booking.';
    end if;

    v_actual_role := 'driver';
  else
    if p_access_token is null or v_booking.access_token is distinct from p_access_token then
      raise exception 'Booking not found. Check your booking reference and try again.';
    end if;

    v_actual_role := 'passenger';
  end if;

  insert into public.pakyawan_messages (booking_id, sender_role, message)
  values (v_booking.id, v_actual_role, v_text)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.send_pakyawan_message(uuid, uuid, text, text) from public;
grant execute on function public.send_pakyawan_message(uuid, uuid, text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. List RPC: same dual authorization, booking-scoped, newest capped.
-- ---------------------------------------------------------------------------

create or replace function public.list_pakyawan_messages(
  p_booking_id uuid,
  p_access_token uuid
)
returns setof public.pakyawan_messages
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_booking public.pakyawan_bookings;
  v_driver_id uuid;
  v_token_ok boolean;
  v_is_driver boolean;
begin
  if p_booking_id is null then
    raise exception 'Booking reference and access token are required.';
  end if;

  select * into v_booking
    from public.pakyawan_bookings
   where id = p_booking_id;

  if not found then
    raise exception 'Booking not found. Check your booking reference and try again.';
  end if;

  v_token_ok := p_access_token is not null
    and v_booking.access_token is not distinct from p_access_token;

  select d.id into v_driver_id
    from public.drivers d
   where d.auth_user_id = auth.uid()
     and d.status = 'active';

  v_is_driver := v_driver_id is not null
    and v_booking.driver_id is not distinct from v_driver_id;

  if not v_token_ok and not v_is_driver then
    raise exception 'Booking not found. Check your booking reference and try again.';
  end if;

  return query
    select m.*
      from public.pakyawan_messages m
     where m.booking_id = v_booking.id
     order by m.created_at asc
     limit 100;
end;
$$;

revoke all on function public.list_pakyawan_messages(uuid, uuid) from public;
grant execute on function public.list_pakyawan_messages(uuid, uuid) to anon, authenticated, service_role;

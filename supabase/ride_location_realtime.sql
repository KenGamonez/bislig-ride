-- Bislig Ride: Active-ride live location — Realtime Broadcast authorization.
-- Run this file in the Supabase SQL editor (idempotent).
--
-- The active-ride GPS system (src/lib/rideLocation.ts) shares the driver's and
-- the passenger's live position over private Supabase Realtime Broadcast
-- channels named ride:{ride_id}. Realtime authorization is enforced via RLS
-- policies on realtime.messages: only the ride's customer and its assigned
-- driver may read or send on that ride's channel.
--
-- Scope: ONLY RLS policies on realtime.messages. No production tables,
-- functions, dispatch RPCs, GPS logic, fare logic, auth logic, or booking
-- logic are modified, and the channel is never made public.
--
-- NOTE: The policies only take effect when the project's Realtime Settings have
-- "Allow public access" disabled; with that enabled, private channels are
-- treated as public. That toggle is a dashboard/Mgmt-API setting, not SQL.

create policy "Ride location broadcast read for ride participants"
on "realtime"."messages"
for select
to authenticated
using (
  exists (
    select 1
    from public.rides r
    left join public.drivers d on d.id = r.driver_id
    where ('ride:' || r.id::text) = (select realtime.topic())
      and (
        r.customer_auth_id = (select auth.uid())
        or d.auth_user_id = (select auth.uid())
      )
      and realtime.messages.extension in ('broadcast')
  )
);

create policy "Ride location broadcast send for ride participants"
on "realtime"."messages"
for insert
to authenticated
with check (
  exists (
    select 1
    from public.rides r
    left join public.drivers d on d.id = r.driver_id
    where ('ride:' || r.id::text) = (select realtime.topic())
      and (
        r.customer_auth_id = (select auth.uid())
        or d.auth_user_id = (select auth.uid())
      )
      and realtime.messages.extension in ('broadcast')
  )
);
-- ============================================================================
-- BISLIG RIDE — DRIVER PUSH SUBSCRIPTIONS v1 (background notifications)
-- Project: epsxgqoqfrwymktjvujs ("Bislig Ride", ap-northeast-1)
-- Date: 2026-09-23
--
-- PURPOSE
--   Stores one Web Push subscription per driver browser so the
--   send-push Edge Function can deliver background notifications for
--   ride offers and assignments. Observer infrastructure only: nothing
--   here changes dispatch, presence, GPS, or any state machine.
--
-- SECURITY MODEL
--   - Drivers read/write/delete ONLY their own rows (auth_user_id match).
--   - Admins can SELECT (monitoring/debugging delivery).
--   - No anon access. No service-role grants needed beyond table owner
--     (Edge Function uses service_role client, which bypasses RLS).
--   - NEVER stores VAPID keys: endpoint/p256dh/auth are push-routing
--     material bound to the driver's own browser, not secrets.
--
-- IDEMPOTENCY
--   IF NOT EXISTS guards throughout. endpoint is UNIQUE so repeat
--   subscriptions from the same browser upsert instead of duplicating.
--   Safe to re-apply.
-- ============================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_driver_idx
  on public.push_subscriptions (driver_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Drivers manage their own push subscriptions"
  on public.push_subscriptions;

create policy "Drivers manage their own push subscriptions"
  on public.push_subscriptions
  for all
  to authenticated
  using (
    driver_id in (
      select d.id from public.drivers d where d.auth_user_id = auth.uid()
    )
  )
  with check (
    driver_id in (
      select d.id from public.drivers d where d.auth_user_id = auth.uid()
    )
  );

drop policy if exists "Admins can review push subscriptions"
  on public.push_subscriptions;

create policy "Admins can review push subscriptions"
  on public.push_subscriptions
  for select
  to authenticated
  using (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text
  );

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- End of push_subscriptions v1.

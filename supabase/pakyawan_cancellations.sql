-- Bislig Ride: pakyawan_cancellations ledger foundation (Phase A).
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Scope (Phase A foundation only):
--
--   A separate cancellation ledger for Pakyawan bookings, modeled on the
--   existing ride_cancellations structure. Records which booking was
--   cancelled, by whom (customer / driver / admin), why, and when.
--
--   This is ONLY the table. The cancellation workflow (cancel RPC, status
--   transitions, release-to-redispatch, UI) belongs to a later phase and is
--   NOT implemented here.
--
-- What this does NOT change:
--
--   - No existing tables modified (ride_cancellations untouched).
--   - No anonymous access of any kind.
--   - No INSERT/UPDATE/DELETE policies: future cancellation writes will go
--     through a SECURITY DEFINER RPC, mirroring the existing Pakyawan
--     mutation pattern.
--   - No Ride Now changes. No frontend changes.

create table if not exists public.pakyawan_cancellations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.pakyawan_bookings(id) on delete cascade,
  cancelled_by uuid,
  cancelled_by_role text check (cancelled_by_role in ('customer', 'driver', 'admin')),
  reason text not null,
  created_at timestamptz not null default now()
);

do $$
begin
  create index if not exists pakyawan_cancellations_booking_idx
    on public.pakyawan_cancellations (booking_id);
exception
  when duplicate_object then null;
end $$;

alter table public.pakyawan_cancellations enable row level security;

-- Admin visibility (control-tower monitoring).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pakyawan_cancellations'
      and policyname = 'Authenticated admins can review Pakyawan cancellations'
  ) then
    create policy "Authenticated admins can review Pakyawan cancellations"
      on public.pakyawan_cancellations for select
      to authenticated
      using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
  end if;

  -- Assigned driver can see cancellations for their own held booking.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pakyawan_cancellations'
      and policyname = 'Assigned drivers can view their Pakyawan cancellations'
  ) then
    create policy "Assigned drivers can view their Pakyawan cancellations"
      on public.pakyawan_cancellations for select
      to authenticated
      using (
        exists (
          select 1
            from public.pakyawan_bookings b
            join public.drivers d on d.id = b.driver_id
          where b.id = pakyawan_cancellations.booking_id
            and d.auth_user_id = auth.uid()
        )
      );
  end if;
end $$;

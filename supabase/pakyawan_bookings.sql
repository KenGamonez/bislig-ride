-- =========================================================
-- PAKYAWAN / SCHEDULED PRIVATE HIRE — idempotent migration
-- Adds the pakyawan_bookings table (with RLS), a driver
-- eligibility flag, and realtime publication for ride and
-- pakyawan request alerts.
-- =========================================================

create table if not exists public.pakyawan_bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  booking_date date not null,
  pickup_time time not null,
  pickup_location text not null,
  destination text not null,
  passengers integer not null check (passengers > 0),
  trip_type text not null check (trip_type in ('One Way', 'Round Trip', 'Whole Day / Private Hire')),
  estimated_hours integer check (estimated_hours >= 1),
  vehicle_preference text,
  special_requests text,
  status text not null default 'pending' check (status in ('pending', 'quoted', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled')),
  driver_id uuid references public.drivers(id) on delete set null,
  vehicle_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pakyawan_bookings enable row level security;

-- Drivers: eligibility flag (admin-controlled, default off)
alter table public.drivers add column if not exists can_accept_pakyawan boolean not null default false;

-- RLS policies (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pakyawan_bookings'
      and policyname = 'Anyone can submit Pakyawan booking requests'
  ) then
    create policy "Anyone can submit Pakyawan booking requests"
      on public.pakyawan_bookings for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pakyawan_bookings'
      and policyname = 'Authenticated admins can review Pakyawan bookings'
  ) then
    create policy "Authenticated admins can review Pakyawan bookings"
      on public.pakyawan_bookings for select
      to authenticated
      using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pakyawan_bookings'
      and policyname = 'Eligible drivers can view Pakyawan requests'
  ) then
    create policy "Eligible drivers can view Pakyawan requests"
      on public.pakyawan_bookings for select
      to authenticated
      using (
        driver_id = (select d.id from public.drivers d where d.auth_user_id = auth.uid())
        or (
          status = 'pending'
          and exists (
            select 1 from public.drivers d
            where d.auth_user_id = auth.uid() and d.can_accept_pakyawan = true
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pakyawan_bookings'
      and policyname = 'Eligible drivers can accept Pakyawan requests'
  ) then
    create policy "Eligible drivers can accept Pakyawan requests"
      on public.pakyawan_bookings for update
      to authenticated
      using (
        status = 'pending'
        and exists (
          select 1 from public.drivers d
          where d.auth_user_id = auth.uid() and d.can_accept_pakyawan = true
        )
      )
      with check (
        driver_id = (select d.id from public.drivers d where d.auth_user_id = auth.uid())
      );
  end if;
end $$;

-- Realtime: ride requests (for driver alerts) + pakyawan requests
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rides'
  ) then
    alter publication supabase_realtime add table public.rides;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pakyawan_bookings'
  ) then
    alter publication supabase_realtime add table public.pakyawan_bookings;
  end if;
end $$;
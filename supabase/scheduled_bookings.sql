create table public.scheduled_bookings (
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
  special_requests text,
  status text not null default 'pending' check (status in ('pending', 'quoted', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled')),
  quoted_fare numeric,
  driver_id uuid,
  vehicle_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.scheduled_bookings enable row level security;

create policy "Anyone can submit scheduled booking requests"
  on public.scheduled_bookings for insert
  to anon, authenticated
  with check (true);

create policy "Authenticated admins can review scheduled bookings"
  on public.scheduled_bookings for select
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
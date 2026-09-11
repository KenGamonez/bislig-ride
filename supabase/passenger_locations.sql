-- Passenger live-location store, mirroring driver_locations but scoped to a
-- ride so RLS can tie the passenger (rides.customer_auth_id) and their
-- assigned driver (rides.driver_id -> drivers.auth_user_id).

create table if not exists public.passenger_locations (
  ride_id uuid primary key references public.rides (id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  updated_at timestamptz not null default now()
);

alter table public.passenger_locations enable row level security;

drop policy if exists "Passenger can manage their ride location" on public.passenger_locations;
create policy "Passenger can manage their ride location"
  on public.passenger_locations
  for all
  to authenticated
  using (
    exists (
      select 1 from public.rides r
      where r.id = passenger_locations.ride_id
        and r.customer_auth_id = auth.uid()
        and r.status in ('accepted', 'arrived', 'in_progress')
    )
  )
  with check (
    exists (
      select 1 from public.rides r
      where r.id = passenger_locations.ride_id
        and r.customer_auth_id = auth.uid()
        and r.status in ('accepted', 'arrived', 'in_progress')
    )
  );

drop policy if exists "Assigned driver can read passenger location" on public.passenger_locations;
create policy "Assigned driver can read passenger location"
  on public.passenger_locations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.rides r
      join public.drivers d on d.id = r.driver_id
      where r.id = passenger_locations.ride_id
        and d.auth_user_id = auth.uid()
        and r.status in ('accepted', 'arrived', 'in_progress')
    )
  );

drop policy if exists "Passenger can read their own location" on public.passenger_locations;
create policy "Passenger can read their own location"
  on public.passenger_locations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.rides r
      where r.id = passenger_locations.ride_id
        and r.customer_auth_id = auth.uid()
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'passenger_locations'
  ) then
    alter publication supabase_realtime add table public.passenger_locations;
  end if;
end $$;
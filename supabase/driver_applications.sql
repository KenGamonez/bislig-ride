create table public.driver_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  mobile_number text not null,
  barangay text not null,
  email text,
  vehicle_number text not null,
  plate_number text,
  driving_experience integer not null check (driving_experience >= 0),
  operating_area text not null,
  preferred_schedule text not null check (preferred_schedule in ('Morning', 'Afternoon', 'Evening', 'Flexible')),
  reason text,
  contact_preference text not null check (contact_preference in ('Call', 'SMS', 'Facebook Messenger')),
  status text not null default 'pending' check (status in ('pending', 'contacted', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.driver_applications enable row level security;

create policy "Anyone can submit driver applications"
  on public.driver_applications for insert
  to anon, authenticated
  with check (true);

create policy "Authenticated admins can review driver applications"
  on public.driver_applications for select
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Authenticated admins can update driver applications"
  on public.driver_applications for update
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
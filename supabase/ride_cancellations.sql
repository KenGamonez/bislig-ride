-- Bislig Ride: ride cancellations
-- Run this file in the Supabase SQL editor (table: public.ride_cancellations)

create table if not exists public.ride_cancellations (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  cancelled_by uuid not null,
  cancelled_by_role text not null check (cancelled_by_role in ('customer', 'driver')),
  reason text not null,
  created_at timestamptz not null default now()
);

-- Required so realtime postgres_changes filters on ride_id include the full row.
alter table public.ride_cancellations replica identity full;

create index if not exists ride_cancellations_ride_id_idx
  on public.ride_cancellations (ride_id);
create index if not exists ride_cancellations_cancelled_by_idx
  on public.ride_cancellations (cancelled_by);

alter table public.ride_cancellations enable row level security;

drop policy if exists "Participants can view ride cancellations" on public.ride_cancellations;
create policy "Participants can view ride cancellations"
  on public.ride_cancellations
  for select
  using (
    exists (
      select 1 from public.rides r
      where r.id = ride_id
        and (
          r.customer_auth_id = auth.uid()
          or r.driver_id in (
            select d.id from public.drivers d where d.auth_user_id = auth.uid()
          )
        )
    )
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

drop policy if exists "Participants can record ride cancellations" on public.ride_cancellations;
create policy "Participants can record ride cancellations"
  on public.ride_cancellations
  for insert
  with check (
    exists (
      select 1 from public.rides r
      where r.id = ride_id
        and (
          (cancelled_by_role = 'customer' and r.customer_auth_id = auth.uid() and cancelled_by = r.customer_auth_id)
          or (cancelled_by_role = 'driver' and cancelled_by = r.driver_id and (
            r.driver_id in (
              select d.id from public.drivers d where d.auth_user_id = auth.uid()
            )
          ))
        )
    )
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
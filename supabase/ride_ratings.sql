-- Bislig Ride: two-sided ride ratings
-- Run this file in the Supabase SQL editor (table: public.ride_ratings)

create table if not exists public.ride_ratings (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  rater_id uuid not null,
  rated_user_id uuid not null,
  stars integer not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (ride_id, rater_id)
);

-- Required so realtime postgres_changes filters on ride_id include the full row.
alter table public.ride_ratings replica identity full;

create index if not exists ride_ratings_rated_user_id_idx
  on public.ride_ratings (rated_user_id);
create index if not exists ride_ratings_ride_id_idx
  on public.ride_ratings (ride_id);

alter table public.ride_ratings enable row level security;

drop policy if exists "Participants can view ride ratings" on public.ride_ratings;
create policy "Participants can view ride ratings"
  on public.ride_ratings
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

-- A rider can only rate a completed ride they booked, as themselves, rating their assigned driver.
-- A driver can only rate a completed ride they were assigned, as themselves, rating the booking customer.
-- Duplicate ratings are rejected by the unique (ride_id, rater_id) constraint.
drop policy if exists "Participants can rate completed rides" on public.ride_ratings;
create policy "Participants can rate completed rides"
  on public.ride_ratings
  for insert
  with check (
    exists (
      select 1 from public.rides r
      where r.id = ride_id
        and r.status = 'completed'
        and (
          (r.customer_auth_id = auth.uid() and rater_id = r.customer_auth_id and rated_user_id = r.driver_id)
          or (rated_user_id = r.customer_auth_id and rater_id = r.driver_id and (
            r.driver_id in (
              select d.id from public.drivers d where d.auth_user_id = auth.uid()
            )
          ))
        )
    )
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
-- Bislig Ride: passenger type, destination mode, drop-offs, and auto fare for rides.
-- Run this file in the Supabase SQL editor.
-- Idempotent: safe to re-run. Existing rows default to Regular / same destination.
-- No RLS policies are changed; new columns are covered by the existing row-level policies.

alter table public.rides
  add column if not exists passenger_type text not null default 'Regular';

alter table public.rides
  add column if not exists destination_mode text not null default 'same';

alter table public.rides
  add column if not exists destination_stops text[] not null default '{}';

alter table public.rides
  add column if not exists fare_cents integer;

alter table public.rides
  add column if not exists fare_source text;

do $$
begin
  alter table public.rides add constraint rides_passenger_type_check
    check (passenger_type in ('Regular', 'Student', 'Senior Citizen', 'PWD'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.rides add constraint rides_destination_mode_check
    check (destination_mode in ('same', 'multiple'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.rides add constraint rides_fare_source_check
    check (fare_source in ('matrix', 'distance'));
exception
  when duplicate_object then null;
end $$;
-- Bislig Ride: Driver Dispatch V1 — rides.status gains 'no_driver'.
-- Run this file in the Supabase SQL editor (idempotent, additive). Rebuilds the
-- rides status CHECK constraint (same technique as rides_cancel_status.sql) so
-- the engine can mark a ride that exhausted the driver pool as 'no_driver'.
-- The passenger UI uses this state to offer "Try Again" + "Cancel Ride"
-- instead of leaving the app stuck on the searching screen forever.

do $$
declare
  con record;
begin
  for con in
    select pc.conname
    from pg_constraint pc
    join pg_class c on c.oid = pc.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = any(pc.conkey)
    where n.nspname = 'public'
      and c.relname = 'rides'
      and pc.contype = 'c'
      and a.attname = 'status'
  loop
    execute format('alter table public.rides drop constraint %I', con.conname);
  end loop;

  alter table public.rides add constraint rides_status_check
    check (status in (
      'requested', 'accepted', 'arrived', 'in_progress',
      'completed', 'cancelled', 'no_driver'
    ));
end $$;
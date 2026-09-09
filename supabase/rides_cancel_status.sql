-- Bislig Ride: allow rides.status = 'cancelled' and let riders cancel their own rides.
-- Run this file in the Supabase SQL editor AFTER ride_cancellations.sql.
-- NOTE: the rider cancellation UPDATE policy that used to live here was replaced
-- by the atomic public.cancel_ride() RPC (see cancel_ride_rpc.sql). That RPC now
-- validates the actor server-side and performs a narrowly-scoped status UPDATE,
-- which closes the "modify unrelated columns" gap an UPDATE policy could not.

-- Recreate the status check constraint to include 'cancelled'.
-- Only check constraints that reference the status column are dropped, so unrelated
-- constraints (e.g. positive passenger count) are left untouched.
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
    check (status in ('requested', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled'));
end $$;
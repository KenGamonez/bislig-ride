-- ============================================================================
-- BISLIG RIDE — DRIVER APPLICATION → DRIVER LINK v1 (P1.8E)
-- Project: epsxgqoqfrwymktjvujs ("Bislig Ride", ap-northeast-1)
-- Date: 2026-09-22
--
-- PURPOSE
--   Durable one-to-one link from an approved driver application to the
--   operational driver provisioned from it. Makes provisioning
--   idempotent (a linked application never provisions twice) and lets
--   Admin navigate application → driver.
--
-- DIRECTION
--   driver_applications.driver_id -> drivers(id). The application points
--   at the driver (not the reverse): a driver row must remain valid
--   without any application (manual Add Driver flow), while an
--   application provisions at most one driver. ON DELETE SET NULL so
--   removing a driver preserves the application record and simply
--   unlinks it (re-provisioning becomes possible again).
--
-- IDEMPOTENCY
--   ADD COLUMN IF NOT EXISTS + conditional FK. No backfill: existing
--   rows correctly start unlinked (NULL). Safe to re-apply. RLS
--   unchanged: the existing admin SELECT/UPDATE policies cover the new
--   column (row-level, not column-scoped); anon INSERT path untouched.
-- ============================================================================

alter table public.driver_applications
  add column if not exists driver_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.driver_applications'::regclass
       and conname = 'driver_applications_driver_id_fkey'
  ) then
    alter table public.driver_applications
      add constraint driver_applications_driver_id_fkey
      foreign key (driver_id)
      references public.drivers (id)
      on delete set null;
  end if;
end
$$;

comment on column public.driver_applications.driver_id is
  'P1.8E operational driver provisioned from this application. NULL = not provisioned.';

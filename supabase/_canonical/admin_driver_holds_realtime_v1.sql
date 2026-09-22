-- ============================================================================
-- BISLIG RIDE — ADMIN DRIVER HOLDS REALTIME v1 (P1.8A)
-- Project: epsxgqoqfrwymktjvujs ("Bislig Ride", ap-northeast-1)
-- Date: 2026-09-22
--
-- PURPOSE
--   Add public.admin_driver_holds to the existing supabase_realtime
--   publication. The Admin frontend already subscribes to this table
--   (channel 'admin-driver-holds-live': INSERT / UPDATE / DELETE in
--   src/lib/adminHolds.ts), but the table was never published, so the
--   channel could never fire and cross-admin hold state went stale.
--
-- SCOPE — publication membership ONLY. This file does NOT change:
--   table definition, constraints, indexes, RLS, policies, grants,
--   RPCs, hold semantics, presence, dispatch, or any other table's
--   publication membership.
--
-- IDEMPOTENCY
--   Conditional membership check: safe to re-apply.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'admin_driver_holds'
  ) then
    alter publication supabase_realtime
      add table public.admin_driver_holds;
  end if;
end
$$;

-- End of admin_driver_holds_realtime v1.

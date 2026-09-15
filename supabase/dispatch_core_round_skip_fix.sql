-- Bislig Ride: Driver Dispatch V1 — SUPERSEDED. DO NOT RUN.
-- ---------------------------------------------------------------------------
-- This file is superseded by supabase/dispatch_ride_rpc.sql (deploy that file
-- LAST). The same-round driver-exclusion fix described below is already built
-- into br_dispatch_ride_core inside dispatch_ride_rpc.sql, which ALSO adds the
-- vehicle-type + passenger-capacity matching (motorcycle / umbak / tricycle)
-- for Ride Now dispatch. This file predates that vehicle matching and contains
-- NO vehicle/capacity filtering at all.
--
-- Historical context (why the round skip matters):
-- the original br_dispatch_ride_core candidate query only excluded a driver
-- while they held a LIVE 'offered' offer for ANY ride. It did not exclude
-- drivers who had already received (and declined/expired/been withdrawn from)
-- the SAME ride, so the same driver would be re-offered the same ride on the
-- next dispatch round and decline chains never advanced. dispatch_ride_rpc.sql
-- includes the same-round exclusion plus the round-robin pool cycle.
--
-- Running the old definition here AFTER dispatch_ride_rpc.sql would REGRESS
-- the live function: br_dispatch_ride_core would match ANY online active
-- available driver to ANY ride (breaking Motorcycle/Tricycle/Umbak matching)
-- and would count the candidate pool without the vehicle filter (so a
-- Motorcycle/Tricycle ride with only a different-vehicle driver online would
-- sit in 'requested' forever instead of going 'no_driver').
--
-- This script is therefore a SAFETY CHECK, not a function definition:
--   * if br_dispatch_ride_core(uuid) already exists -> skip (production-safe),
--   * if it does NOT exist -> fail loudly, pointing at the authoritative file.
--
-- Do NOT re-add the function body to this file.

do $$
begin
  if to_regprocedure('public.br_dispatch_ride_core(uuid)') is not null then
    raise notice 'dispatch_core_round_skip_fix.sql SKIPPED: br_dispatch_ride_core already exists. dispatch_ride_rpc.sql is the authoritative definition (round-skip + vehicle/capacity matching).';
  else
    raise exception 'dispatch_core_round_skip_fix.sql is superseded: run supabase/dispatch_ride_rpc.sql (which includes the same-round skip AND vehicle/capacity matching) instead.';
  end if;
end $$;
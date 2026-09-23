-- ============================================================================
-- BISLIG RIDE — DRIVER VEHICLE CAPACITY 1..7 (tricycle business rule)
-- Project: epsxgqoqfrwymktjvujs ("Bislig Ride", ap-northeast-1)
-- Date: 2026-09-23
--
-- PURPOSE
--   Business capacity rules: motorcycle max 1, umbak max 5,
--   tricycle max 7. The previous CHECK capped every vehicle at 5,
--   which made 6–7 passenger tricycle assignments structurally
--   impossible. Per-vehicle maximums are enforced by the application
--   (src/lib/vehicle.ts); this constraint only widens the valid range.
--
-- SCOPE — one CHECK constraint on public.drivers, nothing else.
--   NULL remains allowed (unverified capacity excludes the driver from
--   dispatch, same as before). No RPC, RLS, grant, or data changes here.
--
-- IDEMPOTENCY
--   DROP IF EXISTS + ADD under the existing constraint name. Existing
--   rows (all 1..5 or NULL) already satisfy 1..7. Safe to re-apply.
-- ============================================================================

alter table public.drivers
  drop constraint if exists drivers_vehicle_capacity_check;

alter table public.drivers
  add constraint drivers_vehicle_capacity_check
  check (vehicle_capacity is null or (vehicle_capacity >= 1 and vehicle_capacity <= 7));

-- End of drivers_vehicle_capacity_1_to_7 v1.

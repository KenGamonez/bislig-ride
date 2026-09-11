-- Bislig Ride: driver application Vehicle Type
-- Run this file in the Supabase SQL editor (idempotent).
--
-- The Become a Driver form now submits a required Vehicle Type
-- (Tricycle / Motorcycle / Other). The live driver_applications table already
-- carries a legacy `vehicle_type` column (text, nullable) that was not being
-- written or read anywhere. This migration (a) guarantees the column exists on
-- any database (fresh or existing), and (b) documents the data contract.
--
-- Design decisions:
--   * Plain `text`, nullable — matches the existing `drivers.vehicle_type`
--     convention (also free text, no CHECK constraint; the region mixes
--     tricycles, motorcycles, and other local vehicles like boats/racts).
--   * No CHECK constraint — the 3-option select is enforced in the form;
--     the column must stay permissive so legacy rows and future vehicle
--     types are never rejected.
--   * Existing applications are untouched: their NULL vehicle_type simply
--     renders as "Not provided" in the Admin review panel.

alter table public.driver_applications
  add column if not exists vehicle_type text;

comment on column public.driver_applications.vehicle_type is
  'Vehicle type submitted by the applicant (e.g. Tricycle, Motorcycle, Other).';
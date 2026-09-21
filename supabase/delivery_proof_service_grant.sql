-- Bislig Ride: service-role read access for delivery proof lookup.
-- Run this file in the Supabase SQL editor (idempotent).
--
-- Problem (verified live 2026-09-21):
--
--   The `delivery-proof-url` Edge Function resolves the proof storage path
--   with a service_role client, but public.delivery_proofs carries no SELECT
--   grant for service_role (only REFERENCES/TRIGGER/TRUNCATE). PostgreSQL
--   checks GRANTs before RLS, so the lookup failed with 42501 and anonymous
--   passengers saw "Could not load the proof photo" even for their own
--   delivered bookings.
--
-- What this adds (minimum required):
--
--   GRANT SELECT ON public.delivery_proofs TO service_role
--
-- What this does NOT change:
--
--   - No anon/authenticated grants or policies touched: anonymous passengers
--     still reach proofs only through the token-gated Edge Function, and
--     authenticated drivers keep exactly their existing SELECT policy.
--   - No RLS policy added, removed, or altered.
--   - No deliveries-table grants touched (the Edge Function verifies the
--     booking through the existing get_delivery_booking RPC instead).
--   - No Ride Now/Pakyawan/dispatch/fare/auth changes.

grant select on public.delivery_proofs to service_role;

-- The Edge Function verifies the booking through the existing
-- get_delivery_booking RPC. That RPC revoked default public EXECUTE and
-- re-granted only to anon/authenticated, so the service_role caller gets
-- 42501 without this explicit grant. No anon/authenticated change.
grant execute on function public.get_delivery_booking(uuid, uuid) to service_role;

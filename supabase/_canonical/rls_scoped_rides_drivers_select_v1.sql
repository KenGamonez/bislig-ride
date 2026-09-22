-- ============================================================================
-- BISLIG RIDE — SCOPED RIDES/DRIVERS SELECT (P1.8G implementation)
-- Project: epsxgqoqfrwymktjvujs ("Bislig Ride", ap-northeast-1)
-- Date: 2026-09-22
--
-- PURPOSE (P1.8G audit step 2 — per-row scoping)
--   Replace the prototype USING(true) SELECT policies (already narrowed
--   to authenticated in P1.8B) with narrowly scoped policies so an
--   authenticated session — including frictionless anonymous sign-ins —
--   can no longer enumerate every ride and driver row.
--
-- READ-PATH MATRIX (verified against src/ before writing):
--   - customers read OWN rides (customer_auth_id = session; every
--     customer flow signs in anonymously first; tracking links load
--     the booker's own ride)
--   - drivers read OWN profile (auth_user_id), ASSIGNED rides
--     (driver_id), and OFFERED rides (live offer row for their driver
--     id — required by the offer-card flow, same live definition as
--     br_dispatch_ride_core: offered + unexpired)
--   - cross-user reputation already routes through the gated
--     get_reputation RPC; customer assigned-driver display uses the
--     narrow driver_profiles view (untouched)
--   - admin reads everything ( dedicated policy below — REQUIRED,
--     because no admin SELECT on rides existed before; without it the
--     admin panel and admin realtime channels would go dark)
--   - fetchPendingRides has zero callers; nothing reads as true anon
--
-- SCOPE — SELECT policies ONLY on rides + drivers:
--   rides:    DROP prototype; CREATE customer-own, driver-assigned,
--             driver-offered, admin-all
--   drivers:  DROP prototype; own-row x2 + admin ALL x2 already cover
--             every verified reader, so no replacement needed
-- Unchanged: INSERT/UPDATE/DELETE policies, all RPCs, all grants,
-- publication membership, driver_profiles view, auth architecture.
--
-- IDEMPOTENCY
--   DROP IF EXISTS before every CREATE. Safe to re-apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- rides: replace the prototype policy with four scoped policies.
-- ----------------------------------------------------------------------------
drop policy if exists "Prototype users can view rides" on public.rides;

drop policy if exists "Customers can view own rides" on public.rides;

create policy "Customers can view own rides"
  on public.rides
  for select
  to authenticated
  using (customer_auth_id = auth.uid());

drop policy if exists "Drivers can view assigned rides" on public.rides;

create policy "Drivers can view assigned rides"
  on public.rides
  for select
  to authenticated
  using (driver_id in (
    select d.id from public.drivers d where d.auth_user_id = auth.uid()
  ));

drop policy if exists "Drivers can view offered rides" on public.rides;

create policy "Drivers can view offered rides"
  on public.rides
  for select
  to authenticated
  using (exists (
    select 1
      from public.ride_offers o
      join public.drivers d on d.id = o.driver_id
     where o.ride_id = rides.id
       and d.auth_user_id = auth.uid()
       and o.status = 'offered'
       and o.expires_at > now()
  ));

drop policy if exists "Admins can view all rides" on public.rides;

create policy "Admins can view all rides"
  on public.rides
  for select
  to authenticated
  using (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text
  );

-- ----------------------------------------------------------------------------
-- drivers: drop the prototype policy. Own-row (x2) + admin ALL (x2)
-- already cover every verified reader (own profile, admin management,
-- username checks); public display uses driver_profiles (untouched).
-- ----------------------------------------------------------------------------
drop policy if exists "Prototype users can view drivers" on public.drivers;

-- End of rls_scoped_rides_drivers_select v1.

-- Bislig Ride: admin-only, permanent driver removal.
-- Run this file in the Supabase SQL editor (idempotent).
--
-- "Remove Driver" is a real removal, distinct from status = 'inactive':
--   1. The driver's operational profile row (public.drivers) is deleted.
--   2. The driver's live location probe (driver_locations) is removed.
--   3. The driver's exclusive public photo object (driver-photos bucket) is
--      deleted if one exists.
--   4. The linked Supabase Auth user is deleted, so the driver can no longer
--      sign in or use the driver system. auth.identities and auth.sessions
--      reference auth.users(id) ON DELETE CASCADE, and auth.refresh_tokens
--      cascades through auth.sessions, so nothing is left behind.
--
-- Historical data is preserved BY DESIGN:
--   * There are NO foreign keys from rides / ride_ratings / ride_messages /
--     ride_cancellations / driver_locations / pakyawan_bookings to
--     public.drivers or auth.users in this schema (verified via pg_constraint).
--     Deleting the driver therefore cannot cascade into or be blocked by ride
--     history, ratings, cancellations, messages, or pakyawan bookings; those
--     rows keep the removed driver's uuid untouched for reporting.
--   * The whole operation runs inside one implicit transaction, so a failure
--     at any step rolls back every earlier step (no orphaned driver or orphaned
--     auth account).
--
-- Security: only an authenticated admin (JWT app_metadata.role = 'admin') can
-- run it. The browser never holds auth-admin privileges.

create or replace function public.admin_remove_driver(p_driver_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
  v_role text;
  v_auth_uid uuid;
  v_photo_url text;
  v_photo_path text;
begin
  v_role := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');

  if v_role <> 'admin' then
    raise exception 'Only an administrator can remove drivers.';
  end if;

  if p_driver_id is null then
    raise exception 'A driver id is required.';
  end if;

  select d.auth_user_id, d.profile_photo_url
    into v_auth_uid, v_photo_url
    from public.drivers d
   where d.id = p_driver_id
   for update;

  if not found then
    raise exception 'Driver not found.';
  end if;

  -- Operational live-probe row owned by this driver (no FK in this schema, but
  -- it belongs to the driver's live account, not to historical reporting).
  delete from public.driver_locations
   where driver_id = p_driver_id;

  -- Remove the driver's publicly served photo object if it belongs exclusively
  -- to this driver (object paths are per-upload, e.g. admin/<uuid>/profile-photo.img).
  if v_photo_url is not null and v_photo_url <> '' then
    v_photo_path := nullif(substring(v_photo_url from '/driver-photos/(.+)$'), '');

    if v_photo_path is not null then
      delete from storage.objects o
       where o.bucket_id = 'driver-photos'
         and o.name = v_photo_path;
    end if;
  end if;

  -- Remove the operational driver profile. No table has a FK to public.drivers,
  -- so ride history, ratings, cancellations, messages, and pakyawan bookings
  -- retain the driver's uuid without any cascade or blocking.
  delete from public.drivers
   where id = p_driver_id;

  -- Remove the linked Auth user so the driver can no longer sign in. No public
  -- table has a FK to auth.users, so the only side effects are the internal
  -- auth cascades (identities, sessions, refresh tokens). A missing auth user
  -- (already removed elsewhere) is not an error.
  if v_auth_uid is not null then
    delete from auth.users
     where id = v_auth_uid;
  end if;

  return true;
end;
$$;

revoke all on function public.admin_remove_driver(uuid) from public;
grant execute on function public.admin_remove_driver(uuid) to authenticated;
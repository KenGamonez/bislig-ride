-- Bislig Ride: admin driver profile photo uploads
-- Run this file in the Supabase SQL editor.
--
-- The drivers.profile_photo_url column already exists and is already rendered
-- by the admin table/detail panel, the rider-facing driver_profiles view, and
-- both customer + driver pages. This migration adds the ONLY missing piece:
-- a PUBLIC storage bucket where admins can upload a driver's photo so the
-- saved URL renders directly in every existing <img>.
--
-- Security:
--   * bucket is public so the stored URL is directly loadable by <img>
--   * INSERT / UPDATE / DELETE are restricted to admins
--     ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'), the same check
--     the existing public.drivers / public.driver_applications policies use
--   * 5 MB size limit + image-only MIME allow-list enforced server-side as a
--     backstop to the client-side validation in driverProfilePhotos.ts

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-photos',
  'driver-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

drop policy if exists "Public can read driver photos" on storage.objects;
create policy "Public can read driver photos"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'driver-photos');

drop policy if exists "Admins can upload driver photos" on storage.objects;
create policy "Admins can upload driver photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'driver-photos' and
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  );

drop policy if exists "Admins can replace driver photos" on storage.objects;
create policy "Admins can replace driver photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'driver-photos' and
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  )
  with check (
    bucket_id = 'driver-photos' and
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  );

drop policy if exists "Admins can delete driver photos" on storage.objects;
create policy "Admins can delete driver photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'driver-photos' and
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  );
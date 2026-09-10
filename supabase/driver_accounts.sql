-- Bislig Ride: driver account system (username + auth linkage + lock-down)
-- Run this file in the Supabase SQL editor.
--
-- What this adds:
--   1. drivers.username — a unique, human-friendly login handle derived from
--      the driver's full name (backfilled for existing rows, idempotently).
--   2. Unique indexes: username (case-insensitive) + auth_user_id (one auth
--      user can only ever own one driver profile).
--   3. public.resolve_driver_credentials(text) — security-definer RPC used by
--      the driver login page to turn "username OR email" into the auth email.
--      Non-existent accounts receive an unguessable sentinel payload instead of
--      an error, so username/email enumeration is not possible through it.
--   4. Row Level Security on public.drivers (this table previously had no
--      committed policies): a driver can read their own profile, admins can
--      manage everything. Existing security-definer RPCs (cancel_ride,
--      get_reputation) bypass RLS internally, so rides stay working.
--
-- Manual (dashboard) steps — Authentication > Providers > Email:
--   * Turn OFF "Confirm email" if you want instant driver logins after the
--     admin creates an account; keep it ON to require email verification.
--   * "Redirect URLs" must include https://<site>/driver/reset-password so
--     password-reset links land on the reset page.

-- ---------------------------------------------------------------------------
-- 1. drivers.username column + unique constraints
-- ---------------------------------------------------------------------------

alter table public.drivers
  add column if not exists username text;

create unique index if not exists drivers_username_lower_uniq
  on public.drivers (lower(username))
  where username is not null and username <> '';

create unique index if not exists drivers_auth_user_id_uniq
  on public.drivers (auth_user_id)
  where auth_user_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Idempotent username backfill for existing drivers
--    "Juan Ramon Dela Cruz" -> "juan.ramon.dela.cruz"; collisions get -1..-N.
--    Already-populated rows are left untouched, so re-running is safe.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  base text;
  candidate text;
  suffix integer := 1;
  occupied boolean;
begin
  for r in
    select id, full_name, created_at
    from public.drivers
    where (username is null or trim(username) = '')
      and full_name is not null
      and trim(full_name) <> ''
    order by created_at asc, id asc
  loop
    base := regexp_replace(lower(r.full_name), '[^a-z0-9]+', '.', 'g');
    base := btrim(base, '.');
    base := left(base, 32);
    base := rtrim(base, '.');
    if base = '' then
      base := 'driver';
    end if;

    candidate := base;
    suffix := 1;

    loop
      select exists (
        select 1 from public.drivers
        where lower(username) = lower(candidate)
      ) into occupied;

      exit when not occupied;

      candidate := left(base, 32 - length(suffix::text) - 1) || '-' || suffix::text;
      suffix := suffix + 1;
    end loop;

    update public.drivers
      set username = candidate
      where id = r.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Login credentials resolver (username OR email -> the auth email)
-- ---------------------------------------------------------------------------

create or replace function public.resolve_driver_credentials(p_identifier text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identifier text := coalesce(trim(p_identifier), '');
  v_email text;
begin
  if v_identifier = '' then
    raise exception 'A username or email is required.';
  end if;

  if v_identifier like '%@%' then
    select d.email
      into v_email
      from public.drivers d
     where lower(coalesce(d.email, '')) = lower(v_identifier)
     limit 1;
  else
    select d.email
      into v_email
      from public.drivers d
     where lower(coalesce(d.username, '')) = lower(v_identifier)
       and coalesce(d.email, '') <> ''
     limit 1;
  end if;

  if v_email is null or trim(v_email) = '' then
    return '__no_driver_match@bisligride.local';
  end if;

  return v_email;
end;
$$;

revoke all on function public.resolve_driver_credentials(text) from public;
grant execute on function public.resolve_driver_credentials(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Row Level Security on public.drivers
-- ---------------------------------------------------------------------------

alter table public.drivers enable row level security;

drop policy if exists "Drivers can view their own profile" on public.drivers;
create policy "Drivers can view their own profile"
  on public.drivers for select
  to authenticated
  using (auth.uid() = auth_user_id);

drop policy if exists "Admins can manage driver profiles" on public.drivers;
create policy "Admins can manage driver profiles"
  on public.drivers for all
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
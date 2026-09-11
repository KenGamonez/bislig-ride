-- Bislig Ride: admin-provisioned driver logins
-- Run this file in the Supabase SQL editor.
--
-- Problem:
--   Supabase Auth has "Confirm email" enabled (see driver_accounts.sql manual
--   note). Client-side signUp() therefore creates an UNCONFIRMED auth user
--   (email_confirmed_at = NULL), and signInWithPassword() rejects that user,
--   so a driver created by the admin can never log in with the username +
--   password the admin shared.
--
-- Fix (keeps the global "Confirm email" setting ON for every other signup):
--   A security-definer RPC, admin_confirm_driver_auth_email(uuid), that lets
--   the LOGGED-IN ADMIN (JWT app_metadata.role = 'admin') confirm the email of
--   exactly one auth user, and only if that user is linked to a drivers row.
--   The admin is the person vouching for the driver, so confirming at
--   provisioning time is intended, and does not weaken auth for anyone else.
--
-- Also backfills email_confirmed_at for driver-linked auth users that the
-- previous flow created unconfirmed (never touches anonymous customers or the
-- admin account).

-- ---------------------------------------------------------------------------
-- RPC: admin_confirm_driver_auth_email(p_auth_user_id uuid) -> boolean
-- ---------------------------------------------------------------------------

create or replace function public.admin_confirm_driver_auth_email(p_auth_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
  v_is_driver boolean;
  v_updated integer;
begin
  v_role := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');

  if v_role <> 'admin' then
    raise exception 'Only an admin can confirm driver auth accounts.';
  end if;

  if p_auth_user_id is null then
    return false;
  end if;

  -- Scope to users actually linked to a drivers row.
  select exists (
    select 1 from public.drivers d where d.auth_user_id = p_auth_user_id
  ) into v_is_driver;

  if not v_is_driver then
    raise exception 'The auth user is not linked to a driver profile.';
  end if;

  update auth.users
     set email_confirmed_at = coalesce(email_confirmed_at, now())
   where id = p_auth_user_id;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.admin_confirm_driver_auth_email(uuid) from public;
grant execute on function public.admin_confirm_driver_auth_email(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill existing driver-linked auth users (created unconfirmed before this
-- fix). Only touches rows that (a) belong to a drivers row and (b) are not
-- anonymous. The admin account and anonymous customers are never modified.
-- ---------------------------------------------------------------------------

do $$
begin
  update auth.users u
     set email_confirmed_at = coalesce(u.email_confirmed_at, now())
    from public.drivers d
   where d.auth_user_id = u.id
     and coalesce(u.is_anonymous, false) is false
     and u.email_confirmed_at is null;
end;
$$;
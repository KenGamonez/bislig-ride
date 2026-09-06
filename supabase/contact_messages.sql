-- Contact messages — Contact Bislig Ride form
-- Public visitors send an inquiry; only authenticated admins
-- (JWT app_metadata role = 'admin') can read or update records.
--
-- Status values are limited to: new, read, replied, archived.

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_type text not null,
  full_name text not null,
  phone text not null,
  email text,
  organization text,
  message text not null,
  status text not null default 'new' check (status in ('new', 'read', 'replied', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_messages_created_at_idx
  on public.contact_messages (created_at desc);

create index if not exists contact_messages_status_idx
  on public.contact_messages (status);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.contact_messages enable row level security;

create policy "Anyone can send contact messages"
  on public.contact_messages for insert
  to anon, authenticated
  with check (true);

create policy "Authenticated admins can review contact messages"
  on public.contact_messages for select
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Authenticated admins can update contact messages"
  on public.contact_messages for update
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
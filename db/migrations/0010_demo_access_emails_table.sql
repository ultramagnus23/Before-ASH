-- Replaces the single hardcoded email literal in
-- 0009_demo_admin_email_exception.sql with a real table, so adding another
-- pitch/demo account is "add a row in Supabase's Table Editor" instead of
-- "edit SQL, run a migration, redeploy." Same enforcement point (the
-- signup trigger), just data-driven instead of a code literal now that
-- there's a real need to add more than one.
--
-- Never exposed via the API: RLS is enabled with NO policies (default
-- deny for every role PostgREST uses), and privileges are explicitly
-- revoked from anon/authenticated to match 0007_grant_hardening.sql's
-- reasoning — Supabase grants those roles privileges on every new table
-- by default, so this can't rely on "I just didn't grant anything."
create table if not exists demo_access_emails (
  email text primary key,
  note text,
  added_at timestamptz not null default now()
);

alter table demo_access_emails enable row level security;
revoke all on demo_access_emails from anon, authenticated;

insert into demo_access_emails (email, note)
values ('suhsuhbros@gmail.com', 'founder/demo account')
on conflict (email) do nothing;

create or replace function enforce_ashoka_email_domain()
returns trigger
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  if new.email is not null
     and new.email !~* '@ashoka\.edu\.in$'
     and not exists (
       select 1 from demo_access_emails where lower(email) = lower(new.email)
     )
  then
    raise exception 'Signup restricted to @ashoka.edu.in addresses';
  end if;
  return new;
end;
$$;

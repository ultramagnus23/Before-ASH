-- Defense-in-depth for "signup restricted to @ashoka.edu.in" (non-negotiable
-- #16). The Next.js app already rejects non-Ashoka emails at the Zod
-- boundary before ever calling supabase.auth.signInWithOtp — but the
-- Supabase URL + anon key are public, so anyone could call the Auth API
-- directly, bypassing the app entirely. This trigger makes the restriction
-- hold at the database no matter what called it.
--
-- The domain is a hardcoded literal, not a configurable GUC read via
-- current_setting() — an earlier version of this migration tried
-- `alter database ... set app.allowed_email_domain = ...` so the domain
-- could be changed without editing SQL, but Supabase's managed platform
-- returns "permission denied to set parameter" for that even from the
-- `postgres` connection role (confirmed against a real project, not
-- assumed). Changing the campus domain is rare enough that hardcoding it
-- here and updating ALLOWED_EMAIL_DOMAIN in .env.local for the app-layer
-- check are both one-line edits — not worth the privilege problem.

create or replace function enforce_ashoka_email_domain()
returns trigger
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  if new.email is not null and new.email !~* '@ashoka\.edu\.in$' then
    raise exception 'Signup restricted to @ashoka.edu.in addresses';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_ashoka_email_domain_trigger on auth.users;
create trigger enforce_ashoka_email_domain_trigger
  before insert on auth.users
  for each row
  execute function enforce_ashoka_email_domain();

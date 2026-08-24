-- Narrow, explicit exception to the @ashoka.edu.in signup restriction
-- (0003_auth_domain_restriction.sql) for a small, hardcoded list of
-- demo/pitch accounts — NOT a general bypass. Same reasoning 0003 itself
-- gives for hardcoding the domain rather than a configurable setting:
-- this changes rarely enough that editing the literal list below is the
-- right amount of mechanism. Add more addresses by adding another line to
-- the `in (...)` list, nothing else.
create or replace function enforce_ashoka_email_domain()
returns trigger
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  if new.email is not null
     and new.email !~* '@ashoka\.edu\.in$'
     and lower(new.email) not in (
       'suhsuhbros@gmail.com'
     )
  then
    raise exception 'Signup restricted to @ashoka.edu.in addresses';
  end if;
  return new;
end;
$$;

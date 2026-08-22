-- Fixes a gap found by actually querying live grants against a real
-- Supabase project, not assumed from reading the SQL: 0001_rls.sql's
-- revoke statements for identity_reveals/reports/moderation_log covered
-- `public`, `authenticated`, and `service_role`, but never `anon`. Since
-- `revoke ... from public` doesn't cascade to roles that were granted
-- privileges directly (Supabase grants anon/authenticated/service_role
-- table privileges directly on every new table by default), `anon` was
-- verified to still hold live UPDATE and DELETE grants on all three
-- append-only tables. RLS already blocked anon from actually exploiting
-- this today (no policy grants anon any access to these tables at all),
-- but the whole point of these revokes is defense-in-depth regardless of
-- RLS — see 0001_rls.sql's updated comment for the full reasoning.
--
-- Never edit an already-applied migration file's historical record — this
-- is the forward-fix for databases that already ran the original
-- 0001_rls.sql. 0001_rls.sql itself has also been corrected so a FRESH
-- deployment doesn't need this file at all; running it there is a
-- harmless no-op (REVOKE on a privilege that was never granted succeeds
-- silently in Postgres).

revoke update, delete on identity_reveals from anon;
revoke update, delete on reports from anon;
revoke update, delete on moderation_log from anon;

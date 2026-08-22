-- Row Level Security policies for Before ASH.
-- Run this AFTER `drizzle-kit generate` + `drizzle-kit migrate` have created
-- the tables from db/schema.ts. This file is hand-written, not generated —
-- Drizzle Kit does not manage RLS policies or views.
--
-- Non-negotiable per BUILD-PROMPT.md #1: visibility='private' items are
-- unreachable by any other user through ANY path. This file is the
-- enforcement layer at the database; lib/queries/* + the serializer tests
-- in tests/unit/serializers.test.ts are the second, independent layer.

create extension if not exists vector;
create extension if not exists pg_trgm;

alter table profiles enable row level security;
alter table quests enable row level security;
alter table list_items enable row level security;
alter table interests enable row level security;
alter table connections enable row level security;
alter table reactions enable row level security;
alter table blocks enable row level security;
alter table reports enable row level security;
alter table moderation_log enable row level security;
alter table review_assignments enable row level security;
alter table identity_reveals enable row level security;
alter table events enable row level security;
alter table policy_acceptances enable row level security;
alter table account_deletion_requests enable row level security;

-- ─── profiles ──────────────────────────────────────────────────────────
-- Anyone signed in can read public profile fields (handle, avatar_seed,
-- bio when bio_visible). Bio content itself is still just a column here;
-- the serializer is responsible for omitting bio when bio_visible=false
-- and for never selecting email (email isn't even in this table).
create policy "profiles_select_all_authenticated"
  on profiles for select
  to authenticated
  using (true);

create policy "profiles_update_own"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_insert_own"
  on profiles for insert
  to authenticated
  with check (id = auth.uid());

-- ─── quests (catalog) ──────────────────────────────────────────────────
create policy "quests_select_all_authenticated"
  on quests for select
  to authenticated
  using (true);

create policy "quests_insert_own_custom"
  on quests for insert
  to authenticated
  with check (is_custom = true and created_by = auth.uid());

-- ─── list_items ────────────────────────────────────────────────────────
-- This is the core privacy boundary. An owner sees all of their own items
-- regardless of visibility/review_state. Anyone else sees a row ONLY if
-- visibility='public' AND review_state='approved', and never a row where
-- visibility='private' under any circumstance, and never an 'anonymous'
-- row that hasn't cleared human review.
create policy "list_items_select_own"
  on list_items for select
  to authenticated
  using (owner_id = auth.uid());

create policy "list_items_select_public_approved"
  on list_items for select
  to authenticated
  using (
    visibility in ('public', 'anonymous')
    and review_state = 'approved'
    and owner_id not in (select blocked_id from blocks where blocker_id = auth.uid())
    and owner_id not in (select blocker_id from blocks where blocked_id = auth.uid())
  );

create policy "list_items_insert_own"
  on list_items for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "list_items_update_own"
  on list_items for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "list_items_delete_own"
  on list_items for delete
  to authenticated
  using (owner_id = auth.uid());

-- ─── interests ─────────────────────────────────────────────────────────
create policy "interests_select_involved"
  on interests for select
  to authenticated
  using (
    user_id = auth.uid()
    or list_item_id in (select id from list_items where owner_id = auth.uid())
  );

create policy "interests_insert_own"
  on interests for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "interests_delete_own"
  on interests for delete
  to authenticated
  using (user_id = auth.uid());

-- ─── connections ───────────────────────────────────────────────────────
-- Contact reveal (handled in application code, not here) only ever fires
-- when owner_accepted AND interested_accepted are both true and revoked_at
-- is null. Either party can update their own acceptance flag or revoke.
create policy "connections_select_involved"
  on connections for select
  to authenticated
  using (owner_id = auth.uid() or interested_id = auth.uid());

create policy "connections_insert_involved"
  on connections for insert
  to authenticated
  with check (owner_id = auth.uid() or interested_id = auth.uid());

create policy "connections_update_involved"
  on connections for update
  to authenticated
  using (owner_id = auth.uid() or interested_id = auth.uid())
  with check (owner_id = auth.uid() or interested_id = auth.uid());

-- ─── reactions ─────────────────────────────────────────────────────────
create policy "reactions_select_all_authenticated"
  on reactions for select
  to authenticated
  using (true);

create policy "reactions_insert_own"
  on reactions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "reactions_delete_own"
  on reactions for delete
  to authenticated
  using (user_id = auth.uid());

-- ─── blocks ────────────────────────────────────────────────────────────
create policy "blocks_select_own"
  on blocks for select
  to authenticated
  using (blocker_id = auth.uid());

create policy "blocks_insert_own"
  on blocks for insert
  to authenticated
  with check (blocker_id = auth.uid());

create policy "blocks_delete_own"
  on blocks for delete
  to authenticated
  using (blocker_id = auth.uid());

-- ─── reports ───────────────────────────────────────────────────────────
-- Reporters can see their own filed reports. No one can see who reported
-- what about them (enforced simply by there being no policy granting that).
create policy "reports_select_own"
  on reports for select
  to authenticated
  using (reporter_id = auth.uid());

create policy "reports_insert_own"
  on reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- no update/delete policy on reports for any authenticated role — the log
-- is append-only for regular users. Admin corrections happen via the
-- service role from /admin server actions only.

-- ─── moderation_log, review_assignments, identity_reveals, events ───────
-- These are admin/system-only tables. No policies are granted to the
-- `authenticated` role at all, which means regular users get zero rows
-- back from any of them — RLS defaults to deny when no policy matches.
-- All access to these tables happens server-side via the service role
-- (which bypasses RLS by design in Supabase) from vetted /admin routes,
-- never from a client-supplied session.

-- ─── policy_acceptances ────────────────────────────────────────────────
create policy "policy_acceptances_select_own"
  on policy_acceptances for select
  to authenticated
  using (user_id = auth.uid());

create policy "policy_acceptances_insert_own"
  on policy_acceptances for insert
  to authenticated
  with check (user_id = auth.uid());

-- ─── account_deletion_requests ─────────────────────────────────────────
create policy "account_deletion_select_own"
  on account_deletion_requests for select
  to authenticated
  using (user_id = auth.uid());

create policy "account_deletion_insert_own"
  on account_deletion_requests for insert
  to authenticated
  with check (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════
-- review_queue view — the ONLY thing the solo moderator's /admin UI reads
-- from for the anonymous review queue. Deliberately excludes owner_id,
-- handle, and email so the reviewer's two questions (does this break a
-- rule / could three people identify the author) can be answered without
-- ever seeing who wrote it. See BUILD-PROMPT.md #14g.
-- ═══════════════════════════════════════════════════════════════════════
create or replace view review_queue as
select
  li.id as list_item_id,
  coalesce(q.title, li.custom_title) as text,
  li.category,
  li.visibility,
  li.review_state,
  li.created_at,
  case
    when p.created_at > now() - interval '1 month' then '<1mo'
    when p.created_at > now() - interval '6 months' then '1-6mo'
    else '6mo+'
  end as account_age_bucket,
  (
    select count(*) from review_assignments ra
    where ra.list_item_id in (
      select id from list_items where owner_id = li.owner_id
    )
    and ra.decision = 'rejected'
  ) as prior_rejection_count
from list_items li
left join quests q on q.id = li.quest_id
join profiles p on p.id = li.owner_id
where li.review_state in ('pending_human', 'held');

-- No RLS policy grants this view to `authenticated` — it is selected only
-- via the service role from the /admin route, which itself gates on
-- ADMIN_HANDLES + a recently-verified MFA factor (BUILD-PROMPT.md #17).
-- The view's column list is the actual enforcement: owner_id/handle/email
-- are never in the select list, so there's no field to accidentally leak
-- even if the view were ever exposed by mistake.

-- identity_reveals: append-only at the DB level. No role gets update or
-- delete, including the service role's default grants — revoke explicitly
-- in case a future migration grants broader privileges by accident.
--
-- `revoke ... from public` does NOT cover this on Supabase: PUBLIC is a
-- pseudo-role that only affects privileges granted TO public specifically,
-- but Supabase grants table privileges DIRECTLY to anon/authenticated/
-- service_role on every new table by default — so each of those three
-- roles needs its own explicit revoke line, PUBLIC's doesn't cascade to
-- them. This was missing `anon` here originally, found by actually
-- querying information_schema.table_privileges against a live database
-- rather than assuming the revoke worked — anon had live UPDATE/DELETE
-- grants on this table until that was caught. In practice RLS (no policy
-- grants anon/authenticated any access at all to this table) already
-- blocked real exploitation for anon specifically, but service_role
-- BYPASSES RLS entirely by design, which is exactly why revoking from it
-- is the one that actually matters most — and anon belongs in the same
-- list on principle, not just where it's provably exploitable today.
revoke update, delete on identity_reveals from public;
revoke update, delete on identity_reveals from anon;
revoke update, delete on identity_reveals from authenticated;
revoke update, delete on identity_reveals from service_role;

-- reports and moderation_log: same append-only posture for regular users;
-- admin corrections (e.g. resolving a report) update list_items/
-- review_assignments instead of mutating the log rows themselves. Same
-- anon gap as identity_reveals above, fixed here for the same reason.
revoke update, delete on reports from anon;
revoke update, delete on reports from authenticated;
revoke update, delete on moderation_log from anon;
revoke update, delete on moderation_log from authenticated;

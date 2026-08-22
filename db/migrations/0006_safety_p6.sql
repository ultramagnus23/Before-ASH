-- P6 Safety: uses the 'flagged' enum value added in 0005 (must be a
-- separate, already-committed transaction — see that file's comment).

-- ─── 'flagged' items stay publicly visible, exactly like 'approved' ────
-- §7.1: a report that doesn't meet the weighted auto-hide bar escalates to
-- the admin queue WITHOUT pulling the content — this is what makes that
-- possible. Auto-hide (the bar IS met) uses 'held' instead, which is
-- already excluded from this policy.
drop policy if exists "list_items_select_public_approved" on list_items;
create policy "list_items_select_public_approved"
  on list_items for select
  to authenticated
  using (
    visibility in ('public', 'anonymous')
    and review_state in ('approved', 'flagged')
    and owner_id not in (select blocked_id from blocks where blocker_id = auth.uid())
    and owner_id not in (select blocker_id from blocks where blocked_id = auth.uid())
  );

-- ─── appeal support ──────────────────────────────────────────────────────
-- §7.1: "one free-text appeal that jumps the item to the top of the admin
-- queue — the only queue-priority mechanism in the product." The appeal
-- text itself is logged to moderation_log (action='appeal'), not stored
-- as its own column — this timestamp is only what drives the ordering.
alter table list_items add column if not exists appealed_at timestamptz;

-- ─── review_queue view: now includes 'flagged' and 'held' items reached
-- via reports (not just the original moderation-pipeline holds), and
-- appealed items sort first. Recreated in full since the WHERE clause,
-- ORDER BY, AND the column list (appealed_at is new) all change.
--
-- DROP + CREATE, not CREATE OR REPLACE: Postgres only allows
-- CREATE OR REPLACE VIEW to append new columns at the very end of the
-- existing list — appealed_at needs to sit between created_at and
-- account_age_bucket for readability, which CREATE OR REPLACE rejects
-- outright ("cannot change name of view column ... to ..."). This only
-- surfaced when this migration actually ran against a live database where
-- 0001_rls.sql's original 8-column view already existed — confirmed live,
-- not assumed. The view has no stored data, so dropping and recreating it
-- is safe and, going forward, more robust than trying to keep every
-- future column addition compatible with "append only."
drop view if exists review_queue;
create view review_queue as
select
  li.id as list_item_id,
  coalesce(q.title, li.custom_title) as text,
  li.category,
  li.visibility,
  li.review_state,
  li.created_at,
  li.appealed_at,
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
where li.review_state in ('pending_human', 'held', 'flagged')
order by (li.appealed_at is not null) desc, li.appealed_at asc nulls last, li.created_at asc;

-- ─── admin security hardening (BUILD-PROMPT.md #17) ─────────────────────
-- security_invoker means this view checks RLS as the CALLING role, not as
-- the view's owner. The primary defense is still "no grant to
-- authenticated" below — service_role bypasses RLS regardless of this
-- setting — but without security_invoker, if a grant were ever added here
-- by mistake, every authenticated user would see the ENTIRE queue (the
-- view would run with the owner's bypass-RLS privileges). With it, the
-- same mistake would just fail with a permission error instead — fails
-- closed either way, not open.
alter view review_queue set (security_invoker = true);

revoke all on review_queue from public, anon, authenticated;

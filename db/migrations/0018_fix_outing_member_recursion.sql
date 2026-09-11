-- ═══════════════════════════════════════════════════════════════════════
-- Fix: infinite recursion in the outing_group_members SELECT policy.
--
-- 0014 wrote the policy as "you may see a member row if you are a member
-- of that group", expressed as a subquery over outing_group_members
-- itself. Postgres applies the table's RLS policy to that inner query too,
-- which applies it again, and so on:
--
--   ERROR: infinite recursion detected in policy for relation
--          "outing_group_members"  (42P17)
--
-- Any read of the table through the anon/authenticated client failed
-- outright, so /outings and /outings/[id] both threw a server-side
-- exception the first time they were loaded against a real session.
--
-- WHY THE TASK 1 VERIFICATION MISSED IT: scripts/verify-match.mjs checked
-- that a non-member could NOT read the group, and that both members got
-- their notifications. It never had a member read outing_group_members
-- directly -- the one operation that trips this. A test that only asserts
-- the negative case cannot catch a policy that fails closed for everyone.
-- The regression case is added to verify-match.mjs alongside this.
--
-- The fix is the SECURITY DEFINER helper introduced in 0016 for exactly
-- this shape of question. It runs as the owner, so its own read of
-- outing_group_members is not subject to the policy being evaluated, and
-- the recursion has nowhere to start. Its search_path is pinned, and it
-- answers only about auth.uid() -- it cannot be used to ask about anyone
-- else.
-- ═══════════════════════════════════════════════════════════════════════

drop policy if exists "outing_group_members_select_member" on outing_group_members;

create policy "outing_group_members_select_member"
  on outing_group_members for select
  to authenticated
  using (is_outing_member(group_id));

-- outing_groups had the same self-referential shape. It did not recurse,
-- because its subquery is over a DIFFERENT table -- but it re-derives
-- membership inline in a second place, and two copies of one rule drift.
-- Same helper, one definition.
drop policy if exists "outing_groups_select_member" on outing_groups;

create policy "outing_groups_select_member"
  on outing_groups for select
  to authenticated
  using (is_outing_member(id));

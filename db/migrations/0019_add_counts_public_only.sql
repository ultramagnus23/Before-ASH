-- ═══════════════════════════════════════════════════════════════════════
-- Fix: /vote counted the viewer's OWN private items as "public lists".
--
-- quest_add_counts() is security invoker, so RLS applies -- which was the
-- right call and is why it is not a leak: nobody sees anyone else's
-- private rows through it. But RLS lets an OWNER see their own private
-- rows, so the count included them, and /vote told a signed-in user their
-- private item was "on 1 public list" when it was on none.
--
-- Found on live: a test user whose only items were visibility='private',
-- review_state='draft' saw "on 1 public list" against the first entry.
--
-- This is the same shape as the /feed leak fixed in 5b95033. The lesson
-- there was that RLS alone is not a public-visibility filter, because the
-- owner is inside RLS's answer -- visibility and review_state have to be
-- re-stated by any query that means "public". lib/queries/list-items.ts
-- does that with PUBLIC_VISIBILITIES/PUBLIC_REVIEW_STATE; this function
-- now does the same, in SQL.
--
-- The figure remains a floor rather than a true total -- rows the viewer
-- cannot see are still not counted, deliberately, and the /vote copy
-- still never presents it as complete. What changes is that it no longer
-- counts rows that are on nobody's public list at all.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function quest_add_counts()
returns table (quest_id text, add_count bigint)
language sql
security invoker
stable
as $$
  select quest_id, count(*) as add_count
  from list_items
  where quest_id is not null
    and visibility in ('public', 'anonymous')
    and review_state = 'approved'
  group by quest_id;
$$;

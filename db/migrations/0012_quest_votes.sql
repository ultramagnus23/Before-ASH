-- "Coolest side quest" voting on the catalog itself (/vote).
--
-- Deliberately separate from `reactions`: that table respects one PERSON's
-- completed list_item, this one votes on a CATALOG ENTRY as an idea,
-- independent of whether the voter has it on their own list. /vote shows
-- that alongside quest_open_counts()'s "how many people actually put this
-- on their list" — two genuinely different signals (what people admire vs.
-- what people commit to), which is the whole point of the page.

create table if not exists quest_votes (
  id uuid primary key default gen_random_uuid(),
  quest_id text not null references quests(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists quest_votes_unique_pair on quest_votes (quest_id, user_id);
create index if not exists quest_votes_quest_idx on quest_votes (quest_id);

alter table quest_votes enable row level security;

-- Vote COUNTS are public information (that's the feature), so every signed-in
-- user can read every row. There's no privacy boundary here the way there is
-- on list_items: a vote says nothing about what's on the voter's own list,
-- and the UI only ever renders aggregate counts plus the viewer's own
-- has-voted state.
create policy "quest_votes_select_all_authenticated"
  on quest_votes for select
  to authenticated
  using (true);

-- Same read access for anon, matching 0011_anon_public_pages.sql's reasoning:
-- /vote is a shareable, no-login-required page like /q/[slug] and /u/[handle].
create policy "quest_votes_select_anon"
  on quest_votes for select
  to anon
  using (true);

-- A user may only ever insert or delete their OWN vote. The unique index
-- above is what actually enforces one-vote-per-quest-per-person; this policy
-- is what stops anyone voting as someone else.
create policy "quest_votes_insert_own"
  on quest_votes for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "quest_votes_delete_own"
  on quest_votes for delete
  to authenticated
  using (user_id = auth.uid());

-- No update policy at all: a vote has no mutable fields, so toggling is
-- insert-or-delete. RLS denies by default where no policy matches.

-- Aggregate vote counts in one query instead of 491 per-row counts.
-- `security invoker` for consistency with quest_open_counts() and the search
-- functions — though unlike those, this one has no privacy dimension to get
-- wrong, since the select policies above already grant every caller the same
-- full read of this table.
create or replace function quest_vote_counts()
returns table (quest_id text, vote_count bigint)
language sql
security invoker
stable
as $$
  select quest_id, count(*) as vote_count
  from quest_votes
  group by quest_id;
$$;

-- "How many people have this on their list" — the second signal on /vote.
-- Unlike quest_open_counts() this counts a quest whether or not it's been
-- stamped yet, since "I chose this" is the thing being measured, not "I
-- haven't finished it."
--
-- `security invoker`, same as quest_open_counts(), and for the same
-- non-negotiable reason: it therefore counts ONLY rows the caller's own RLS
-- already lets them see (their own, plus everyone else's public/anonymous
-- approved ones). A private list item can never contribute to a number
-- another user sees, not even in aggregate. That does mean this figure is a
-- floor rather than a true total — the /vote UI says "on public lists" and
-- never presents it as a complete count, because presenting it as complete
-- would be a lie AND would require bypassing RLS with the service role,
-- which BUILD-PROMPT.md #1 forbids for exactly this kind of "it's only an
-- aggregate" reasoning.
create or replace function quest_add_counts()
returns table (quest_id text, add_count bigint)
language sql
security invoker
stable
as $$
  select quest_id, count(*) as add_count
  from list_items
  where quest_id is not null
  group by quest_id;
$$;

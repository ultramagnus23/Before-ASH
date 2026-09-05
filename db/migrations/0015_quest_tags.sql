-- ═══════════════════════════════════════════════════════════════════════
-- Task 2 — Smartify the catalog.
--
-- Seven tag dimensions per the spec: time-of-day, day-of-week, duration,
-- indoor/outdoor, solo/group, cost band, season. Only solo/group exists
-- today (quests.group_size), so six are new here.
--
-- THE CENTRAL RULE, and the reason this is a separate table rather than
-- six columns on `quests`: no LLM guess may reach a user unreviewed. A
-- proposal and a reviewed truth are two different rows, distinguished by
-- `state`, and every read path that faces a user filters to 'reviewed'.
-- Re-running the pre-tagging pass can therefore never disturb reviewed
-- work, and there is no moment where a half-reviewed catalog is live.
--
-- solo/group is the exception: it already has a live home in
-- quests.group_size and is not duplicated as a source of truth. The
-- proposal is recorded here so the review tool can show all seven
-- dimensions together; committing a review writes that one dimension
-- back to quests.group_size. One live value, one place.
-- ═══════════════════════════════════════════════════════════════════════

create type quest_tag_state as enum ('proposed', 'reviewed');

-- Multi-valued. "Late-night food run" is late_night and nothing else;
-- "sit in the library" is all four. Tonight asks "does this set contain
-- the current bucket", which a single value could not answer honestly —
-- forcing one bucket per item would push most of the catalog into a
-- meaningless 'any'.
create type tag_time_of_day as enum ('morning', 'afternoon', 'evening', 'late_night');
create type tag_day_of_week as enum ('weekday', 'weekend');

-- Single-valued. Bands, not minutes: nobody can estimate "how long does
-- this take" to better resolution than this, and a number would invite a
-- precision the tag does not have.
create type tag_duration as enum ('under_1h', 'half_day', 'full_day', 'multi_day');
create type tag_setting as enum ('indoor', 'outdoor', 'either');

-- Rupee bands. Deliberately coarse and deliberately not money — this is a
-- filter, not an amount, so the integer-paise rule for actual money
-- (Task 4) does not apply and must not be imitated here.
create type tag_cost_band as enum ('free', 'under_200', 'under_1000', 'over_1000');

-- 'any' is a real answer for most of the catalog. Sonipat's summer and
-- monsoon genuinely rule things out, which is the only reason this
-- dimension exists.
create type tag_season as enum ('any', 'winter', 'summer', 'monsoon');

create table quest_tags (
  id uuid primary key default gen_random_uuid(),
  quest_id text not null references quests(id) on delete cascade,
  state quest_tag_state not null,

  time_of_day tag_time_of_day[] not null,
  day_of_week tag_day_of_week[] not null,
  duration tag_duration not null,
  setting tag_setting not null,
  cost_band tag_cost_band not null,
  season tag_season not null,
  group_size group_size not null,

  -- Per-dimension 0..1, as returned by the tagging pass. Kept as jsonb
  -- rather than seven columns because it is only ever read as a whole
  -- (to order the queue and to shade the review UI), never filtered on
  -- per-dimension.
  confidence jsonb not null default '{}'::jsonb,
  -- Denormalised so the review queue can be ordered by an index instead
  -- of sorting 491 rows on a jsonb expression every time.
  min_confidence real not null default 0,

  -- Which model proposed this. Null on reviewed rows written by a human.
  -- Present so a future model swap can identify what the old one touched.
  model text,
  reviewed_by uuid references profiles(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- An empty array is not a tag, it is a missing tag. Without this an
  -- item silently drops out of every Tonight query with no error.
  constraint quest_tags_time_of_day_nonempty check (array_length(time_of_day, 1) >= 1),
  constraint quest_tags_day_of_week_nonempty check (array_length(day_of_week, 1) >= 1),
  constraint quest_tags_confidence_range check (min_confidence >= 0 and min_confidence <= 1),
  -- A reviewed row has a reviewer. This is what makes "no unreviewed guess
  -- reaches a user" a database guarantee rather than a code convention.
  constraint quest_tags_reviewed_has_reviewer check (state <> 'reviewed' or reviewed_by is not null)
);

-- At most one proposal and one reviewed row per quest. Re-running the
-- tagging pass upserts onto the proposal; it cannot fan out into
-- duplicates, and it has no way to address the reviewed row.
create unique index quest_tags_quest_state_unique on quest_tags (quest_id, state);

-- Tonight's read path: reviewed rows only, membership test on the arrays.
create index quest_tags_reviewed_time_idx on quest_tags using gin (time_of_day)
  where state = 'reviewed';
create index quest_tags_reviewed_day_idx on quest_tags using gin (day_of_week)
  where state = 'reviewed';

-- The review queue: least-confident first, which is where a human's
-- attention is actually worth something.
create index quest_tags_queue_idx on quest_tags (min_confidence, quest_id)
  where state = 'proposed';

-- updated_at maintained in the database, not by the caller: the tagging
-- pass and the review tool are two different writers and only one of them
-- is TypeScript.
create or replace function touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger quest_tags_touch
  before update on quest_tags
  for each row execute function touch_updated_at();

-- ─── RLS ───────────────────────────────────────────────────────────────
-- Reviewed tags are catalog metadata: as public as the quest they
-- describe, including to signed-out visitors, because /explore filters
-- and /q pages are public pages.
--
-- Proposed tags get NO policy at all, for anon or authenticated. Same
-- posture as the other admin-only tables in 0001_rls.sql: the only way
-- to read or write them is the service role from a /admin route that has
-- already passed the MFA guard. An unreviewed machine guess is not
-- something a user should be able to discover by querying around the UI.
alter table quest_tags enable row level security;

create policy "quest_tags_select_reviewed"
  on quest_tags for select
  to anon, authenticated
  using (state = 'reviewed');

revoke insert, update, delete on quest_tags from anon, authenticated;

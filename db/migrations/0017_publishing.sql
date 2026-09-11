-- ═══════════════════════════════════════════════════════════════════════
-- Task 6 — Publishing and the curator queue.
--
-- "Publishing" here means one thing: proposing an item for the shared
-- catalog. It is invite-only, it goes through the existing three-stage
-- moderation pipeline, and a human (the curator) makes the final call.
--
-- ON IMAGES. The checklist says no image may reach a published surface.
-- The way that is guaranteed is structural: there is no image column on
-- this table, and there is none on quests. `callModel` is text-only by
-- contract (§14.1), so an image on a published surface could not be
-- screened even in principle -- which is exactly why the surface does not
-- have one to fill. Photos, when they are built, belong on private list
-- items and inside outing groups, both of which are member-only and
-- neither of which is published. Adding an image column to anything
-- reachable from a public page is a decision that has to be made
-- deliberately, and it should arrive with a vision provider or not at all.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── invite-only publishing ────────────────────────────────────────────
-- A table rather than a boolean on profiles, so who invited whom and when
-- is recoverable. Revoking is a delete, and deleting the invite does not
-- retract anything already published -- approved items stay in the
-- catalog crediting their submitter.
create table publish_invites (
  user_id uuid primary key references profiles(id) on delete cascade,
  invited_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table publish_invites enable row level security;

-- You can see whether YOU can publish. You cannot see who else can: that
-- would turn an invite list into a visible in-group, which is a social
-- object nobody asked for.
create policy "publish_invites_select_own"
  on publish_invites for select
  to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on publish_invites from anon, authenticated;

create or replace function can_publish(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $fn$
  select exists (select 1 from publish_invites where user_id = p_user);
$fn$;

-- ─── submissions ───────────────────────────────────────────────────────
-- A proposed catalog item. Reuses the existing review_state enum and the
-- existing moderation pipeline rather than inventing a parallel one --
-- there is one definition of "held" in this product and it lives in
-- lib/moderation/pipeline.ts.
create table submissions (
  id uuid primary key default gen_random_uuid(),
  submitter_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  category text not null,
  review_state review_state not null default 'pending_auto',

  -- What the classifier said, kept for the curator's context. Per the
  -- logging rule this stores the DECISION and the scores, never a copy of
  -- the content -- the content is the title column, which is the thing
  -- being judged and is about to be public anyway.
  scores jsonb,

  -- Set when the curator approves and the item enters the catalog. The
  -- catalog row credits the submitter through this link rather than
  -- duplicating their id onto quests.
  published_quest_id text references quests(id) on delete set null,

  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),

  constraint submissions_title_length check (length(btrim(title)) between 4 and 140),
  -- An approved submission must point at what it became; nothing else may.
  constraint submissions_published_link check (
    (review_state = 'approved' and published_quest_id is not null)
    or (review_state <> 'approved' and published_quest_id is null)
  )
);

create index submissions_queue_idx on submissions (review_state, created_at);
create index submissions_submitter_idx on submissions (submitter_id);

alter table submissions enable row level security;

-- You see your own submissions and their state. Nobody sees anyone
-- else's: a queue of other people's rejected ideas is not a public
-- object.
create policy "submissions_select_own"
  on submissions for select
  to authenticated
  using (submitter_id = auth.uid());

-- Invite-gated at the database, not only in the action. The state is
-- pinned to 'pending_auto' so a submission cannot be inserted
-- pre-approved.
create policy "submissions_insert_invited"
  on submissions for insert
  to authenticated
  with check (
    submitter_id = auth.uid()
    and can_publish(auth.uid())
    and review_state = 'pending_auto'
    and published_quest_id is null
  );

-- Deciding is the curator's, through the service role from /admin. No
-- update or delete policy exists for any user role.
revoke update, delete on submissions from anon, authenticated;
revoke all on submissions from anon;

-- ─── crediting the submitter ───────────────────────────────────────────
-- quests.created_by already exists and is null for the seed catalog. An
-- approved submission sets it, which is what "approved items credit the
-- submitter" means -- no second column, no denormalised handle.
comment on column quests.created_by is
  'Null for the seed catalog. Set to the submitter for items that arrived through submissions (Task 6).';

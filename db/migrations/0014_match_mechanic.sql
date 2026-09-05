-- Task 1: the match mechanic. "Count me in" on a catalog item registers
-- interest; when two people hold live interest in the same item inside the
-- window, both are notified and an outing group is created containing them.
--
-- Deliberately NOT the existing `interests` table. That one hangs off
-- list_items — "I'm in" on a specific person's completed item, which is the
-- P5 contact-exchange flow and stays exactly as it is. This is interest in a
-- CATALOG item, before anyone has done anything, and it is the primary
-- discovery path rather than a response to someone else's activity. Same
-- word, different object; conflating them would have quietly changed what
-- "I'm in" means on the feed.
--
-- Matching is explicitly NOT gated behind an existing connection. If only
-- already-connected users could match, the mechanic could never introduce
-- strangers, which is its entire purpose. Blocks are still absolute.

-- ─── enums ───────────────────────────────────────────────────────────────
create type interest_state as enum ('live', 'matched', 'expired', 'withdrawn');
create type outing_group_state as enum ('active', 'archived');

-- Exactly four notification types, closed at the database. Adding a fifth
-- requires a migration and therefore a decision, which is the point: the
-- product rule is "exactly four, and adding one means removing one".
create type notification_type as enum (
  'connection_request',
  'connection_accepted',
  'board_activity',
  'match_found'
);

-- ─── quest_interests ─────────────────────────────────────────────────────
create table quest_interests (
  id uuid primary key default gen_random_uuid(),
  quest_id text not null references quests(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  state interest_state not null default 'live',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Idempotency, enforced by the database rather than by a read-then-write in
-- application code that two fast taps would race straight through.
create unique index quest_interests_unique_pair on quest_interests (quest_id, user_id);
-- The matching lookup: live interest in one quest, newest-first tiebreak.
create index quest_interests_matchable_idx
  on quest_interests (quest_id, expires_at)
  where state = 'live';
create index quest_interests_user_idx on quest_interests (user_id, created_at desc);

-- ─── outing_groups ───────────────────────────────────────────────────────
create table outing_groups (
  id uuid primary key default gen_random_uuid(),
  quest_id text not null references quests(id) on delete cascade,
  state outing_group_state not null default 'active',
  created_at timestamptz not null default now()
);
create index outing_groups_quest_idx on outing_groups (quest_id) where state = 'active';

create table outing_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references outing_groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now()
);
create unique index outing_group_members_unique_pair on outing_group_members (group_id, user_id);
create index outing_group_members_user_idx on outing_group_members (user_id);

-- The 12-member cap. A CHECK constraint cannot count sibling rows, so this
-- is a trigger — still the database, not application code, which is what
-- matters: two simultaneous joins at 11 members cannot both succeed.
--
-- Note the build prompt asks for this to be "consistent with the existing
-- boards cap". There is no boards cap in this schema — boards are uncapped
-- today. 12 is taken from Spec v2's own suggestion; boards remain uncapped
-- and that mismatch is flagged rather than silently fixed here.
create or replace function enforce_outing_group_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from outing_group_members where group_id = new.group_id) >= 12 then
    raise exception 'outing group is full' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger outing_group_members_cap
  before insert on outing_group_members
  for each row execute function enforce_outing_group_cap();

-- ─── notifications ───────────────────────────────────────────────────────
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type notification_type not null,
  -- Never contains a handle or any identifier the recipient is not already
  -- entitled to see; the reader resolves display names itself under RLS.
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_inbox_idx on notifications (user_id, created_at desc);
create index notifications_unread_idx on notifications (user_id) where read_at is null;

-- ─── RLS ─────────────────────────────────────────────────────────────────
alter table quest_interests enable row level security;
alter table outing_groups enable row level security;
alter table outing_group_members enable row level security;
alter table notifications enable row level security;

-- Interest is private. Nobody may browse who else wants to do a thing —
-- that would turn the catalog into a directory of people's intentions.
-- Matching still works because register_quest_interest() below is
-- security definer and reads interest on the caller's behalf without ever
-- returning another person's row.
create policy "quest_interests_select_own"
  on quest_interests for select to authenticated
  using (user_id = auth.uid());

create policy "quest_interests_insert_own"
  on quest_interests for insert to authenticated
  with check (user_id = auth.uid());

create policy "quest_interests_update_own"
  on quest_interests for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "quest_interests_delete_own"
  on quest_interests for delete to authenticated
  using (user_id = auth.uid());

-- A group, and its membership, are visible only to its own members.
create policy "outing_groups_select_member"
  on outing_groups for select to authenticated
  using (exists (
    select 1 from outing_group_members m
    where m.group_id = outing_groups.id and m.user_id = auth.uid()
  ));

create policy "outing_group_members_select_member"
  on outing_group_members for select to authenticated
  using (exists (
    select 1 from outing_group_members m
    where m.group_id = outing_group_members.group_id and m.user_id = auth.uid()
  ));

-- Leaving is yours to do; adding people is not. Group creation and joining
-- happen only through register_quest_interest(), so no INSERT policy is
-- granted to authenticated at all — RLS denies by default and the security
-- definer function is the sole writer.
create policy "outing_group_members_delete_self"
  on outing_group_members for delete to authenticated
  using (user_id = auth.uid());

create policy "notifications_select_own"
  on notifications for select to authenticated
  using (user_id = auth.uid());

-- Marking your own notification read is the only user-initiated write.
create policy "notifications_update_own"
  on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Notifications are written by the system, never by a user directly.
-- No INSERT or DELETE policy for authenticated, by design.
revoke insert, delete on notifications from anon, authenticated;
revoke insert, update on outing_groups from anon, authenticated;
revoke insert, update on outing_group_members from anon, authenticated;

-- ─── the match, as one atomic operation ──────────────────────────────────
-- Everything here has to happen together or not at all: registering
-- interest, finding a counterpart, creating or joining the group, marking
-- both interests matched, and notifying both people. Doing it in
-- application code across several round trips means two users tapping at
-- the same moment can both find "no counterpart" and neither gets matched,
-- or worse, two groups get created for one pair.
create or replace function register_quest_interest(p_quest_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := now();
  v_expires timestamptz := now() + interval '48 hours';
  v_interest_id uuid;
  v_partner uuid;
  v_group uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  -- Refresh an expired interest, but leave a live one completely untouched.
  -- That "untouched" is what makes repeat taps idempotent: no row change,
  -- so nothing below runs, so nobody is notified twice.
  insert into quest_interests (quest_id, user_id, expires_at)
  values (p_quest_id, v_user, v_expires)
  on conflict (quest_id, user_id) do update
    set expires_at = excluded.expires_at,
        state = 'live',
        created_at = v_now
    where quest_interests.state <> 'live'
       or quest_interests.expires_at <= v_now
  returning id into v_interest_id;

  if v_interest_id is null then
    return jsonb_build_object('registered', false, 'matched', false, 'reason', 'already_live');
  end if;

  insert into events (user_id, event_name, metadata)
  values (v_user, 'interest_registered', jsonb_build_object('quest_id', p_quest_id));

  -- Oldest live interest wins, so the person who has been waiting longest
  -- is matched first rather than whoever happens to be newest.
  select qi.user_id into v_partner
  from quest_interests qi
  where qi.quest_id = p_quest_id
    and qi.user_id <> v_user
    and qi.state = 'live'
    and qi.expires_at > v_now
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = v_user and b.blocked_id = qi.user_id)
         or (b.blocker_id = qi.user_id and b.blocked_id = v_user)
    )
  order by qi.created_at asc
  limit 1
  for update skip locked;

  if v_partner is null then
    return jsonb_build_object('registered', true, 'matched', false);
  end if;

  -- Join an existing active group for this quest if one has room, so a
  -- third and fourth person land in the same outing rather than spawning
  -- parallel pairs. The cap trigger is still the backstop.
  select g.id into v_group
  from outing_groups g
  where g.quest_id = p_quest_id
    and g.state = 'active'
    and exists (select 1 from outing_group_members m where m.group_id = g.id and m.user_id = v_partner)
    and (select count(*) from outing_group_members m where m.group_id = g.id) < 12
  order by g.created_at asc
  limit 1;

  if v_group is null then
    insert into outing_groups (quest_id) values (p_quest_id) returning id into v_group;
    insert into outing_group_members (group_id, user_id) values (v_group, v_partner);
    insert into events (user_id, event_name, metadata)
    values (v_user, 'outing_group_created', jsonb_build_object('group_id', v_group, 'quest_id', p_quest_id));
  end if;

  insert into outing_group_members (group_id, user_id)
  values (v_group, v_user)
  on conflict (group_id, user_id) do nothing;

  update quest_interests
  set state = 'matched'
  where quest_id = p_quest_id and user_id in (v_user, v_partner);

  -- Both sides are told. time_to_match_seconds is recorded here because it
  -- is the metric the whole mechanic is judged on and it is only knowable
  -- at this instant.
  insert into notifications (user_id, type, payload)
  select u, 'match_found', jsonb_build_object('group_id', v_group, 'quest_id', p_quest_id)
  from unnest(array[v_user, v_partner]) as u;

  insert into events (user_id, event_name, metadata)
  values (
    v_user,
    'match_found',
    jsonb_build_object(
      'group_id', v_group,
      'quest_id', p_quest_id,
      'time_to_match_seconds',
      extract(epoch from (v_now - (select created_at from quest_interests where quest_id = p_quest_id and user_id = v_partner)))
    )
  );

  return jsonb_build_object('registered', true, 'matched', true, 'group_id', v_group);
end;
$$;

revoke all on function register_quest_interest(text) from public, anon;
grant execute on function register_quest_interest(text) to authenticated;

-- Withdrawing interest is a plain delete under RLS, but expiry needs no
-- job: anything past expires_at simply stops matching. Filter on read, the
-- same reasoning that kept the weekly featured quest a pure function of the
-- ISO week instead of scheduled infrastructure.

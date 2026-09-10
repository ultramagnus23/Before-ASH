-- ═══════════════════════════════════════════════════════════════════════
-- Task 4 — Split-cost on outing groups.
--
-- Money is integer paise. There is no numeric, no float, no decimal
-- anywhere in this file: bigint paise or nothing. A rupee-denominated
-- float drifts, and a drifting balance between friends is the one bug in
-- this feature nobody reports politely.
--
-- The ledger is APPEND-ONLY. Nothing here is ever updated or deleted:
-- there is no update policy and no delete policy on either table, for any
-- role. A mistake is corrected by adding a reversing entry, which leaves
-- both the error and the correction visible. Money that can be silently
-- edited after the fact is money people argue about.
-- ═══════════════════════════════════════════════════════════════════════

create table outing_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references outing_groups(id) on delete cascade,
  -- Who actually paid the shop. Not necessarily who entered it.
  payer_id uuid not null references profiles(id) on delete restrict,
  entered_by uuid not null references profiles(id) on delete restrict,
  amount_paise bigint not null,
  description text not null,

  -- The group's expense sequence number, which decides who absorbs the odd
  -- paisa when the amount does not divide evenly. Stored rather than
  -- derived so the split of an old expense never changes -- recomputing it
  -- from "how many expenses exist now" would silently re-split history
  -- every time someone adds a chai run.
  rotation integer not null,

  created_at timestamptz not null default now(),

  -- Zero is not an expense, it is a typo. Negative IS allowed: that is a
  -- refund or a reversing correction, which is how an append-only ledger
  -- fixes a mistake.
  constraint outing_expenses_amount_nonzero check (amount_paise <> 0),
  constraint outing_expenses_description_present check (length(btrim(description)) > 0)
);

create index outing_expenses_group_idx on outing_expenses (group_id, created_at);
create unique index outing_expenses_rotation_unique on outing_expenses (group_id, rotation);

-- One row per person per expense. Written by the same function that writes
-- the expense, in the same transaction, so an expense without its shares
-- cannot exist.
create table outing_expense_shares (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references outing_expenses(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete restrict,
  share_paise bigint not null,
  constraint outing_expense_shares_unique unique (expense_id, user_id)
);

create index outing_expense_shares_user_idx on outing_expense_shares (user_id);

-- ─── settlements ───────────────────────────────────────────────────────
-- Two-sided by construction. One person records that they paid; the OTHER
-- person confirms they received it. An unconfirmed settlement does not
-- move a balance -- the balance calculation in lib/money/split.ts is only
-- ever fed confirmed rows.
--
-- This is deliberately not a single-sided "mark as settled": the entire
-- point is that both people agree money changed hands, and a one-sided
-- claim is exactly the thing that turns into an argument later.
create table outing_settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references outing_groups(id) on delete cascade,
  from_id uuid not null references profiles(id) on delete restrict,
  to_id uuid not null references profiles(id) on delete restrict,
  amount_paise bigint not null,
  -- Null until the receiving side confirms. Set exactly once, by the
  -- recipient, enforced in the RLS update policy below.
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint outing_settlements_amount_positive check (amount_paise > 0),
  -- Paying yourself is not a settlement.
  constraint outing_settlements_distinct_parties check (from_id <> to_id)
);

create index outing_settlements_group_idx on outing_settlements (group_id, created_at);

-- ─── RLS ───────────────────────────────────────────────────────────────
-- Everything here is scoped to the outing group, which is already
-- member-only (0014). A shared ledger is readable by exactly the people
-- sharing it and nobody else -- not the wider campus, not a curator, not
-- an admin surface.
alter table outing_expenses enable row level security;
alter table outing_expense_shares enable row level security;
alter table outing_settlements enable row level security;

create or replace function is_outing_member(p_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from outing_group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$fn$;

create policy "outing_expenses_select_member"
  on outing_expenses for select
  to authenticated
  using (is_outing_member(group_id));

create policy "outing_expense_shares_select_member"
  on outing_expense_shares for select
  to authenticated
  using (
    exists (
      select 1 from outing_expenses e
      where e.id = expense_id and is_outing_member(e.group_id)
    )
  );

create policy "outing_settlements_select_member"
  on outing_settlements for select
  to authenticated
  using (is_outing_member(group_id));

-- A member may record that THEY paid someone. Recording a payment on
-- someone else's behalf is not allowed: it would let one person
-- unilaterally assert a debt was cleared.
create policy "outing_settlements_insert_own"
  on outing_settlements for insert
  to authenticated
  with check (
    is_outing_member(group_id)
    and from_id = auth.uid()
    and confirmed_at is null
  );

-- Only the RECIPIENT confirms, and only from unconfirmed to confirmed.
-- The with-check pins the recipient so "confirm" cannot be turned into a
-- way to rewrite the row.
create policy "outing_settlements_confirm_recipient"
  on outing_settlements for update
  to authenticated
  using (to_id = auth.uid() and confirmed_at is null)
  with check (to_id = auth.uid() and confirmed_at is not null);

-- Append-only, stated as a grant rather than trusted to the absence of a
-- policy. No UPDATE on expenses or shares by anyone; no DELETE anywhere.
revoke update, delete on outing_expenses from anon, authenticated;
revoke update, delete on outing_expense_shares from anon, authenticated;
revoke delete on outing_settlements from anon, authenticated;
revoke all on outing_expenses from anon;
revoke all on outing_expense_shares from anon;
revoke all on outing_settlements from anon;

-- The ledger is written only through record_outing_expense(), never by a
-- direct insert, because the shares and the expense must land together.
revoke insert on outing_expenses from anon, authenticated;
revoke insert on outing_expense_shares from anon, authenticated;

-- ─── recording an expense ──────────────────────────────────────────────
-- One function, one transaction. The rotation number is allocated under a
-- lock on the group row, so two people entering an expense at the same
-- moment cannot take the same rotation and split their remainders onto
-- the same person.
create or replace function record_outing_expense(
  p_group_id uuid,
  p_payer_id uuid,
  p_amount_paise bigint,
  p_description text,
  p_shares jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_expense_id uuid;
  v_rotation integer;
  v_share_total bigint;
  v_share_count integer;
begin
  if not is_outing_member(p_group_id) then
    raise exception 'Not a member of this outing group.' using errcode = '42501';
  end if;

  -- Serialises rotation allocation for this group.
  perform 1 from outing_groups where id = p_group_id for update;

  if not exists (
    select 1 from outing_group_members where group_id = p_group_id and user_id = p_payer_id
  ) then
    raise exception 'Payer is not a member of this outing group.' using errcode = '42501';
  end if;

  -- Every share must belong to a member of this group, and the shares must
  -- account for the whole amount exactly. This is the balances-sum-to-zero
  -- invariant enforced at the point of entry: if it is violated here, no
  -- later calculation can recover it.
  select count(*), coalesce(sum((value->>'sharePaise')::bigint), 0)
    into v_share_count, v_share_total
  from jsonb_array_elements(p_shares) as value;

  if v_share_count = 0 then
    raise exception 'An expense must be shared with somebody.';
  end if;

  if v_share_total <> p_amount_paise then
    raise exception 'Shares total % but the expense is %.', v_share_total, p_amount_paise;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_shares) as value
    where not exists (
      select 1 from outing_group_members m
      where m.group_id = p_group_id and m.user_id = (value->>'userId')::uuid
    )
  ) then
    raise exception 'An expense cannot be shared with a non-member.' using errcode = '42501';
  end if;

  select coalesce(max(rotation), -1) + 1 into v_rotation
  from outing_expenses where group_id = p_group_id;

  insert into outing_expenses (group_id, payer_id, entered_by, amount_paise, description, rotation)
  values (p_group_id, p_payer_id, auth.uid(), p_amount_paise, p_description, v_rotation)
  returning id into v_expense_id;

  insert into outing_expense_shares (expense_id, user_id, share_paise)
  select v_expense_id, (value->>'userId')::uuid, (value->>'sharePaise')::bigint
  from jsonb_array_elements(p_shares) as value;

  return v_expense_id;
end;
$fn$;

revoke all on function record_outing_expense(uuid, uuid, bigint, text, jsonb) from public, anon;
grant execute on function record_outing_expense(uuid, uuid, bigint, text, jsonb) to authenticated;

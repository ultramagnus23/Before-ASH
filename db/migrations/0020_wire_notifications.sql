-- ═══════════════════════════════════════════════════════════════════════
-- Wire the three notification types that were declared but never written.
--
-- 0014 created a four-value notification_type enum and lib/queries/
-- notifications.ts has presentation copy for all four, but only
-- 'match_found' was ever inserted — by register_quest_interest(). Accepting
-- a connection or adding to a board notified nobody. The plumbing looked
-- complete from either end and was missing in the middle.
--
-- These are TRIGGERS, not calls from the Server Actions, for two reasons.
-- First, `revoke insert on notifications from anon, authenticated` (0014)
-- means a user's own client cannot write one at all — the privileged path
-- is the point, and a SECURITY DEFINER trigger is that path without
-- handing anyone a general-purpose "notify" function to aim wherever they
-- like. Second, the notification then lands in the same transaction as the
-- thing it describes: it cannot be missing for an event that happened, and
-- it cannot exist for one that rolled back.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── connection_request ────────────────────────────────────────────────
-- Fires when someone expresses interest in another person's item. The
-- OWNER is the one who has a decision to make, so the owner is told.
--
-- Also fires on the UPDATE path, which is not an oversight: expressInterest
-- upserts, and re-expressing after a revoke resets owner_accepted to false.
-- That is a fresh request needing a fresh decision, so it earns a fresh
-- notification.
create or replace function notify_connection_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- Only when it is actually pending on the owner.
  if new.interested_accepted and not new.owner_accepted and new.revoked_at is null then
    -- On UPDATE, say nothing unless this transition newly created a pending
    -- request. Without this, any unrelated update to the row re-notifies.
    if tg_op = 'UPDATE' and old.interested_accepted and not old.owner_accepted and old.revoked_at is null then
      return new;
    end if;

    insert into notifications (user_id, type, payload)
    values (new.owner_id, 'connection_request', jsonb_build_object('connection_id', new.id));
  end if;
  return new;
end;
$fn$;

create trigger connections_notify_request
  after insert or update on connections
  for each row execute function notify_connection_request();

-- ─── connection_accepted ───────────────────────────────────────────────
-- The owner accepting is what completes mutual consent, so the person who
-- asked is the one who needs to hear about it.
create or replace function notify_connection_accepted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- Strictly the false -> true transition. Re-saving an already-accepted
  -- row must not notify again.
  if new.owner_accepted and not old.owner_accepted and new.interested_accepted and new.revoked_at is null then
    insert into notifications (user_id, type, payload)
    values (new.interested_id, 'connection_accepted', jsonb_build_object('connection_id', new.id));
  end if;
  return new;
end;
$fn$;

create trigger connections_notify_accepted
  after update on connections
  for each row execute function notify_connection_accepted();

-- ─── board_activity ────────────────────────────────────────────────────
-- Everyone who has accepted a place on the board, except whoever did the
-- thing. Notifying the actor about their own action is noise.
--
-- Deliberately COLLAPSED: if a member already has an unread board_activity
-- notice for this board, no second row is written. A board being actively
-- filled in would otherwise produce a notification per item per member, and
-- the nav badge is a dot rather than a count precisely because the product
-- has no inbox-zero mechanic — twenty rows saying the same thing would make
-- the one delivery channel useless. The unread one already says "something
-- happened on this board"; that is the whole message.
create or replace function notify_board_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into notifications (user_id, type, payload)
  select m.user_id, 'board_activity', jsonb_build_object('board_id', new.board_id)
  from board_members m
  where m.board_id = new.board_id
    and m.status = 'accepted'
    and m.user_id <> new.added_by
    and not exists (
      select 1 from notifications n
      where n.user_id = m.user_id
        and n.type = 'board_activity'
        and n.read_at is null
        and n.payload->>'board_id' = new.board_id::text
    );
  return new;
end;
$fn$;

create trigger board_items_notify_activity
  after insert on board_items
  for each row execute function notify_board_activity();

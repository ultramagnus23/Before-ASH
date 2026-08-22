-- P8 schema: per-item blog + links, shared boards. See BUILD-PROMPT.md
-- §13.1-§13.3. Apply after 0001_rls.sql. Same posture throughout: no
-- policy for a role/action means that role gets zero rows, by default.

alter table item_posts enable row level security;
alter table boards enable row level security;
alter table board_members enable row level security;
alter table board_items enable row level security;
alter table board_join_requests enable row level security;

-- ─── helper: is the caller an accepted member of a board, and with what role ──
create or replace function is_board_member(p_board_id uuid, p_min_role board_role default 'viewer')
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from board_members
    where board_id = p_board_id
      and user_id = auth.uid()
      and status = 'accepted'
      and (
        p_min_role = 'viewer'
        or (p_min_role = 'contributor' and role in ('contributor', 'editor', 'owner'))
        or (p_min_role = 'editor' and role in ('editor', 'owner'))
        or (p_min_role = 'owner' and role = 'owner')
      )
  );
$$;

-- ─── boards ────────────────────────────────────────────────────────────
create policy "boards_select_visible"
  on boards for select
  to authenticated
  using (
    discoverable = true
    or created_by = auth.uid()
    or is_board_member(id, 'viewer')
  );

create policy "boards_insert_own"
  on boards for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "boards_update_editor"
  on boards for update
  to authenticated
  using (is_board_member(id, 'editor'))
  with check (is_board_member(id, 'editor'));

create policy "boards_delete_owner"
  on boards for delete
  to authenticated
  using (is_board_member(id, 'owner'));

-- ─── board_members ─────────────────────────────────────────────────────
-- A user can always see their own membership rows (so an invitee can see
-- "you've been invited" before they're 'accepted', which is required for
-- the accept/decline UI to work at all). Otherwise visible to board admins.
create policy "board_members_select_self_or_admin"
  on board_members for select
  to authenticated
  using (user_id = auth.uid() or is_board_member(board_id, 'editor'));

create policy "board_members_insert_admin_invite"
  on board_members for insert
  to authenticated
  with check (
    -- board creator's own owner row, created at board-creation time
    (user_id = auth.uid() and role = 'owner' and board_id in (select id from boards where created_by = auth.uid()))
    -- or an editor/owner inviting someone else
    or is_board_member(board_id, 'editor')
  );

create policy "board_members_update_self_or_admin"
  on board_members for update
  to authenticated
  using (user_id = auth.uid() or is_board_member(board_id, 'editor'))
  with check (user_id = auth.uid() or is_board_member(board_id, 'editor'));

create policy "board_members_delete_self_or_admin"
  on board_members for delete
  to authenticated
  using (user_id = auth.uid() or is_board_member(board_id, 'editor'));

-- ─── board_items ───────────────────────────────────────────────────────
create policy "board_items_select_member_or_discoverable"
  on board_items for select
  to authenticated
  using (
    is_board_member(board_id, 'viewer')
    or board_id in (select id from boards where discoverable = true)
  );

create policy "board_items_insert_contributor"
  on board_items for insert
  to authenticated
  with check (added_by = auth.uid() and is_board_member(board_id, 'contributor'));

create policy "board_items_update_own_or_editor"
  on board_items for update
  to authenticated
  using (added_by = auth.uid() or is_board_member(board_id, 'editor'))
  with check (added_by = auth.uid() or is_board_member(board_id, 'editor'));

create policy "board_items_delete_own_or_editor"
  on board_items for delete
  to authenticated
  using (added_by = auth.uid() or is_board_member(board_id, 'editor'));

-- ─── board_join_requests ───────────────────────────────────────────────
create policy "board_join_requests_select_self_or_admin"
  on board_join_requests for select
  to authenticated
  using (user_id = auth.uid() or is_board_member(board_id, 'editor'));

create policy "board_join_requests_insert_self"
  on board_join_requests for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and board_id in (select id from boards where discoverable = true)
  );

create policy "board_join_requests_update_admin"
  on board_join_requests for update
  to authenticated
  using (is_board_member(board_id, 'editor'))
  with check (is_board_member(board_id, 'editor'));

-- ─── item_posts ────────────────────────────────────────────────────────
-- Visibility mirrors the parent: a post on your own list_item, or on a
-- list_item you're allowed to see (public+approved, per 0001_rls.sql's
-- list_items policy), or on a board_item you're a member of.
create policy "item_posts_select_visible"
  on item_posts for select
  to authenticated
  using (
    (list_item_id is not null and list_item_id in (
      select id from list_items
      where owner_id = auth.uid()
         or (visibility in ('public', 'anonymous') and review_state = 'approved')
    ))
    or (board_item_id is not null and board_item_id in (
      select id from board_items where is_board_member(board_id, 'viewer')
    ))
  );

create policy "item_posts_insert_authorized"
  on item_posts for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and (
      (list_item_id is not null and kind = 'blog' and list_item_id in (
        select id from list_items where owner_id = auth.uid()
      ))
      or (board_item_id is not null and board_item_id in (
        select id from board_items where is_board_member(board_id, 'contributor')
      ))
    )
  );

create policy "item_posts_update_own"
  on item_posts for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "item_posts_delete_own_or_board_editor"
  on item_posts for delete
  to authenticated
  using (
    author_id = auth.uid()
    or (board_item_id is not null and board_item_id in (
      select id from board_items where is_board_member(board_id, 'editor')
    ))
  );

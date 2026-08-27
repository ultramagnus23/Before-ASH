-- /q/[slug] and /u/[handle] are the app's shareable, no-login pages — the
-- landing page's own pitch is "everything you finish lands on a page other
-- people can copy from," and neither page component checks for a signed-in
-- user. But 0001_rls.sql only ever granted SELECT `to authenticated`, so an
-- anonymous visitor's Supabase client got zero rows back and both pages
-- 404'd for anyone who followed a shared link without already being signed
-- in — found live by requesting both routes as a real anonymous client
-- against this project. These three policies extend the SAME read access
-- those tables already grant to any authenticated user out to anon too —
-- no new column or row becomes visible to anon that wasn't already visible
-- to every signed-in student.

create policy "quests_select_anon"
  on quests for select
  to anon
  using (true);

create policy "profiles_select_anon"
  on profiles for select
  to anon
  using (true);

-- Mirrors list_items_select_public_approved, minus the blocks subqueries:
-- those exist to hide a blocker/blockee's items from each other, which is
-- meaningless for an anonymous viewer who isn't a party to any block.
-- Without this, /q/[slug]'s "Stamped by campus" list would still silently
-- show zero entries for anon visitors even after the policies above.
create policy "list_items_select_public_approved_anon"
  on list_items for select
  to anon
  using (visibility in ('public', 'anonymous') and review_state = 'approved');

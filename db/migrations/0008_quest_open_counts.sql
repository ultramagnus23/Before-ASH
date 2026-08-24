-- Ranking signal for /explore (lib/ranking/): "how many people currently
-- have this quest open" — i.e. on their list, not yet stamped. Must never
-- leak the existence of anyone's PRIVATE item, so this is `security
-- invoker`, same as search_quests_trigram/search_quests_semantic in
-- 0004_search_functions.sql and for the identical reason: running with the
-- caller's own RLS-checked privileges means the count this function
-- computes is exactly what list_items_select_own +
-- list_items_select_public_approved already let the caller see — their own
-- rows plus everyone else's public/anonymous *approved* rows, nothing more.
-- A private item never contributes to any other user's count.
create or replace function quest_open_counts()
returns table (quest_id text, open_count bigint)
language sql
security invoker
stable
as $$
  select quest_id, count(*) as open_count
  from list_items
  where quest_id is not null
    and completed_at is null
  group by quest_id;
$$;

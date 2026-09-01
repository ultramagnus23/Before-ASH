-- Keyword search only ever matched the query as ONE whole phrase:
-- `title % search_query` scores whole-string similarity, and the ilike
-- fallback needs the entire query as a literal substring. So "3am food"
-- returned nothing at all, even though the catalog has both "3am Murthal
-- run" and "Learn to make one thing at 3am" — neither title contains the
-- string "3am food", and whole-string similarity between a two-word query
-- and a nine-word title is far below the trigram threshold.
--
-- That mattered much more than it looks: on production the semantic path
-- is unreachable (LLM_API_URL points at a local Ollama that Vercel cannot
-- resolve), so lib/queries/explore.ts's fail-safe means EVERY search on
-- the live site lands here. Whole-phrase-only matching was, in practice,
-- the whole of search.
--
-- This version also matches any individual word of the query and ranks by
-- how many of them a title contains, falling back to whole-phrase
-- similarity to break ties. Whole-phrase matches still win outright
-- because they necessarily match every term too.
create or replace function search_quests_trigram(search_query text, result_limit int default 60)
returns setof quests
language sql
security invoker
stable
as $$
  with terms as (
    select distinct t as term
    from unnest(string_to_array(lower(trim(search_query)), ' ')) as t
    where length(t) >= 3
      -- Without this, a query like "do something in the dark" matches on
      -- "the"/"something" and returns most of the catalog ranked by noise.
      -- Only words that carry meaning should widen the result set.
      and t not in (
        'the','and','for','you','your','with','that','this','have','has','had',
        'not','are','was','were','from','out','one','two','get','got','all',
        'any','can','did','does','doing','done','how','its','let','like','make',
        'more','much','off','own','put','say','see','she','him','her','his',
        'their','them','they','too','use','way','who','why','will','would',
        'about','after','again','been','before','being','over','some','something',
        'take','than','then','there','these','thing','things','those','when',
        'where','which','while','into','just','know','want','well','were','what'
      )
  )
  select q.*
  from quests q
  where
    q.title % search_query
    or q.title ilike '%' || search_query || '%'
    or exists (select 1 from terms t where q.title ilike '%' || t.term || '%')
  order by
    (select count(*) from terms t where q.title ilike '%' || t.term || '%') desc,
    similarity(q.title, search_query) desc,
    q.id
  limit result_limit;
$$;

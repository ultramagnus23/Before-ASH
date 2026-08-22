-- /explore search: pgvector semantic search for longer/phrase queries,
-- pg_trgm fallback for short queries where an embedding is overkill and
-- trigram similarity is both cheaper and more literal-feeling to the user.
-- Both are `security invoker` — they run with the caller's own RLS-checked
-- privileges (the "quests_select_all_authenticated" policy already allows
-- any authenticated user to read the whole catalog), so there's no
-- privilege escalation risk in exposing these as RPCs.

create or replace function search_quests_trigram(search_query text, result_limit int default 60)
returns setof quests
language sql
security invoker
stable
as $$
  select *
  from quests
  where title % search_query or title ilike '%' || search_query || '%'
  order by similarity(title, search_query) desc
  limit result_limit;
$$;

-- query_embedding arrives as text (PostgREST maps a JSON string param
-- cleanly to text; mapping directly to the custom `vector` type over RPC is
-- unreliable) and is cast to vector inside the function.
create or replace function search_quests_semantic(query_embedding text, result_limit int default 60)
returns setof quests
language sql
security invoker
stable
as $$
  select *
  from quests
  where embedding is not null
  order by embedding <=> query_embedding::vector(768)
  limit result_limit;
$$;

-- Speeds up the trigram path specifically; the HNSW index for the semantic
-- path already exists from db/schema.ts (quests_embedding_idx).
create index if not exists quests_title_trgm_idx on quests using gin (title gin_trgm_ops);

-- 0003_search_indexes.sql
-- Extra kiosk-search indexes to better support Supabase PostgREST filters
-- (which typically target raw columns, not lower(column) expressions).

create extension if not exists pg_trgm;

create index if not exists people_first_name_trgm_raw_idx on public.people
  using gin (first_name gin_trgm_ops);

create index if not exists people_last_name_trgm_raw_idx on public.people
  using gin (last_name gin_trgm_ops);


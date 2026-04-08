create table if not exists recipes (
  id          bigserial primary key,
  title       text not null,
  ingredients text[]  not null default '{}',
  directions  text[]  not null default '{}',
  ner         text[]  not null default '{}',
  tags        text[]  not null default '{}',
  source      text,
  link        text,
  created_at  timestamptz default now()
);

create index if not exists recipes_ner_gin
  on recipes using gin(ner);

create index if not exists recipes_tags_gin
  on recipes using gin(tags);

create index if not exists recipes_title_fts
  on recipes using gin(to_tsvector('english', title));

alter table recipes enable row level security;

create policy "Public read access"
  on recipes for select
  using (true);

create or replace function search_recipes(
  p_ner          text[],
  p_tags         text[],
  p_title_query  text,
  p_match_count  int  default 1,
  p_limit        int  default 10,
  p_offset       int  default 0
)
returns table (
  id          bigint,
  title       text,
  ingredients text[],
  directions  text[],
  ner         text[],
  tags        text[],
  source      text,
  link        text,
  match_score bigint
)
language sql stable as $$
  with candidates as (
    select r.*
    from recipes r
    where r.ner && p_ner
      and (cardinality(p_tags) = 0 or r.tags @> p_tags)
      and (p_title_query = '' or to_tsvector('english', r.title) @@ plainto_tsquery('english', p_title_query))
    limit 500
  )
  select
    c.id,
    c.title,
    c.ingredients,
    c.directions,
    c.ner,
    c.tags,
    c.source,
    c.link,
    (select count(*) from unnest(c.ner) n where n = any(p_ner)) as match_score
  from candidates c
  order by match_score desc
  limit  p_limit
  offset p_offset;
$$;
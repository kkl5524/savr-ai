-- scripts/nutrition_schema.sql
-- Run in Supabase SQL Editor before importing nutrition data.

-- ── Nutrition table ───────────────────────────────────────────────────────────
create table if not exists nutrition (
  id              bigserial primary key,
  fdc_id          int not null unique,
  description     text not null,
  search_names    text[]  not null default '{}',  -- all names to match against NER
  alternate_names text[]  not null default '{}',  -- common name synonyms
  tags            text[]  not null default '{}',  -- Vegan, Vegetarian, High Protein
  calories        numeric,                         -- kcal per 100g
  protein         numeric,                         -- g per 100g
  fat             numeric,                         -- g per 100g
  carbs           numeric,                         -- g per 100g
  fiber           numeric,                         -- g per 100g
  food_category_id int,
  created_at      timestamptz default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
-- GIN index on search_names for fast text array matching against NER terms
create index if not exists nutrition_search_names_gin
  on nutrition using gin(search_names);

-- GIN index on tags for dietary filter queries
create index if not exists nutrition_tags_gin
  on nutrition using gin(tags);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table nutrition enable row level security;

create policy "Public read nutrition"
  on nutrition for select using (true);

-- ── RPC: look up nutrition for a list of NER ingredient terms ─────────────
-- Matching priority:
--   1. Exact: search_names @> array[term]  (term is in the search_names array)
--   2. Partial word: any search_name contains the term as a substring
--   3. Reverse partial: the term contains any search_name as a substring
create or replace function get_recipe_nutrition(p_ner text[])
returns table (
  ner_term    text,
  fdc_id      int,
  description text,
  calories    numeric,
  protein     numeric,
  fat         numeric,
  carbs       numeric,
  fiber       numeric
)
language plpgsql stable as $$
declare
  term text;
  found_row record;
begin
  foreach term in array p_ner loop
    found_row := null;

    -- Tier 1: exact match in search_names array (uses GIN index)
    select n.fdc_id, n.description, n.calories, n.protein, n.fat, n.carbs, n.fiber
    into found_row
    from nutrition n
    where n.search_names @> array[term]
    order by char_length(n.description) asc
    limit 1;

    if found_row.fdc_id is not null then
      ner_term    := term;
      fdc_id      := found_row.fdc_id;
      description := found_row.description;
      calories    := found_row.calories;
      protein     := found_row.protein;
      fat         := found_row.fat;
      carbs       := found_row.carbs;
      fiber       := found_row.fiber;
      return next;
      continue;
    end if;

    -- Tier 2: any element of search_names contains the term as substring
    select n.fdc_id, n.description, n.calories, n.protein, n.fat, n.carbs, n.fiber
    into found_row
    from nutrition n
    where exists (
      select 1 from unnest(n.search_names) sn
      where sn ilike '%' || term || '%'
    )
    order by char_length(n.description) asc
    limit 1;

    if found_row.fdc_id is not null then
      ner_term    := term;
      fdc_id      := found_row.fdc_id;
      description := found_row.description;
      calories    := found_row.calories;
      protein     := found_row.protein;
      fat         := found_row.fat;
      carbs       := found_row.carbs;
      fiber       := found_row.fiber;
      return next;
      continue;
    end if;

    -- Tier 3: term contains any search_name as substring
    -- (catches "kidney beans" matching search_name "kidney bean")
    select n.fdc_id, n.description, n.calories, n.protein, n.fat, n.carbs, n.fiber
    into found_row
    from nutrition n
    where exists (
      select 1 from unnest(n.search_names) sn
      where char_length(sn) > 3
        and term ilike '%' || sn || '%'
    )
    order by char_length(n.description) asc
    limit 1;

    if found_row.fdc_id is not null then
      ner_term    := term;
      fdc_id      := found_row.fdc_id;
      description := found_row.description;
      calories    := found_row.calories;
      protein     := found_row.protein;
      fat         := found_row.fat;
      carbs       := found_row.carbs;
      fiber       := found_row.fiber;
      return next;
    end if;

  end loop;
end;
$$;
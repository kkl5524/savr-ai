-- ── Profiles (one row per auth user) 
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at   timestamptz default now()
);

alter table profiles enable row level security;
create policy "Public read profiles"  on profiles for select using (true);
create policy "Own insert profile"    on profiles for insert with check (auth.uid() = id);
create policy "Own update profile"    on profiles for update using (auth.uid() = id);

-- Auto-create a profile row when a user signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Forum posts 
create table if not exists forum_posts (
  id          bigserial primary key,
  recipe_id   bigint references recipes(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  is_ai       boolean not null default false,
  parent_id   bigint references forum_posts(id) on delete cascade,
  upvotes     int not null default 0,
  hidden      boolean not null default false,
  edited_at   timestamptz,
  created_at  timestamptz default now()
);

create index if not exists forum_posts_recipe_idx on forum_posts(recipe_id, created_at desc);
create index if not exists forum_posts_parent_idx on forum_posts(parent_id);
create index if not exists forum_posts_user_idx   on forum_posts(user_id);

alter table forum_posts enable row level security;

create policy "Read visible posts"
  on forum_posts for select using (hidden = false or user_id = auth.uid());

create policy "Authenticated insert"
  on forum_posts for insert
  with check (auth.uid() is not null and auth.uid() = user_id);

create policy "Own delete"
  on forum_posts for delete using (auth.uid() = user_id);

create policy "Own update body"
  on forum_posts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Post upvotes (one per user per post) 
create table if not exists post_upvotes (
  post_id    bigint references forum_posts(id) on delete cascade,
  user_id    uuid   references auth.users(id)  on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

alter table post_upvotes enable row level security;
create policy "Read upvotes"      on post_upvotes for select using (true);
create policy "Own insert upvote" on post_upvotes for insert with check (auth.uid() = user_id);
create policy "Own delete upvote" on post_upvotes for delete using (auth.uid() = user_id);

-- ── Post flags 
create table if not exists post_flags (
  id         bigserial primary key,
  post_id    bigint references forum_posts(id) on delete cascade,
  user_id    uuid   references auth.users(id)  on delete cascade,
  reason     text,
  created_at timestamptz default now(),
  unique (post_id, user_id)
);

alter table post_flags enable row level security;
create policy "Own insert flag" on post_flags for insert with check (auth.uid() = user_id);
create policy "Read own flags"  on post_flags for select using (auth.uid() = user_id);

-- Auto-hide post when it reaches 3 flags
create or replace function check_flag_threshold()
returns trigger language plpgsql security definer as $$
declare flag_count int;
begin
  select count(*) into flag_count from post_flags where post_id = new.post_id;
  if flag_count >= 3 then
    update forum_posts set hidden = true where id = new.post_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_post_flagged on post_flags;
create trigger on_post_flagged
  after insert on post_flags
  for each row execute function check_flag_threshold();

-- ── RPC: toggle upvote 
create or replace function toggle_upvote(p_post_id bigint)
returns json language plpgsql security definer as $$
declare
  already   boolean;
  new_count int;
begin
  select exists(
    select 1 from post_upvotes where post_id = p_post_id and user_id = auth.uid()
  ) into already;

  if already then
    delete from post_upvotes where post_id = p_post_id and user_id = auth.uid();
    update forum_posts set upvotes = greatest(upvotes - 1, 0) where id = p_post_id
      returning upvotes into new_count;
    return json_build_object('upvoted', false, 'upvotes', new_count);
  else
    insert into post_upvotes (post_id, user_id) values (p_post_id, auth.uid());
    update forum_posts set upvotes = upvotes + 1 where id = p_post_id
      returning upvotes into new_count;
    return json_build_object('upvoted', true, 'upvotes', new_count);
  end if;
end;
$$;

-- ── RPC: fetch posts for a recipe 
create or replace function get_forum_posts(
  p_recipe_id bigint,
  p_limit     int default 10,
  p_offset    int default 0
)
returns table (
  id             bigint,
  recipe_id      bigint,
  user_id        uuid,
  display_name   text,
  body           text,
  is_ai          boolean,
  parent_id      bigint,
  upvotes        int,
  created_at     timestamptz,
  edited_at      timestamptz,
  viewer_upvoted boolean
)
language sql stable security definer as $$
  select
    fp.id, fp.recipe_id, fp.user_id,
    coalesce(p.display_name, 'User') as display_name,
    fp.body, fp.is_ai, fp.parent_id, fp.upvotes,
    fp.created_at, fp.edited_at,
    exists(
      select 1 from post_upvotes pu
      where pu.post_id = fp.id and pu.user_id = auth.uid()
    ) as viewer_upvoted
  from forum_posts fp
  left join profiles p on p.id = fp.user_id
  where fp.recipe_id = p_recipe_id
    and fp.parent_id is null
    and fp.hidden = false
  order by fp.created_at desc
  limit p_limit offset p_offset;
$$;

-- ── RPC: fetch replies 
create or replace function get_post_replies(p_parent_id bigint)
returns table (
  id           bigint,
  recipe_id    bigint,
  user_id      uuid,
  display_name text,
  body         text,
  is_ai        boolean,
  parent_id    bigint,
  upvotes      int,
  created_at   timestamptz,
  edited_at    timestamptz
)
language sql stable security definer as $$
  select
    fp.id, fp.recipe_id, fp.user_id,
    coalesce(p.display_name, 'User') as display_name,
    fp.body, fp.is_ai, fp.parent_id, fp.upvotes,
    fp.created_at, fp.edited_at
  from forum_posts fp
  left join profiles p on p.id = fp.user_id
  where fp.parent_id = p_parent_id and fp.hidden = false
  order by fp.created_at asc;
$$;

-- ── View: recent tips feed 
create or replace view recent_forum_tips as
  select
    fp.id, fp.recipe_id,
    r.title as recipe_title,
    coalesce(p.display_name, 'User') as display_name,
    fp.body, fp.is_ai, fp.upvotes, fp.created_at
  from forum_posts fp
  join recipes  r on r.id  = fp.recipe_id
  left join profiles p on p.id = fp.user_id
  where fp.parent_id is null
    and fp.is_ai     = false
    and fp.hidden    = false
  order by fp.created_at desc
  limit 50;
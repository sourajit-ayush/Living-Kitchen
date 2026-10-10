-- Phase 6: accounts, pantry, recipe book, shopping list (docs/04 §3).
-- Every table has row-level security: a signed-in user reads and writes only their own rows.
-- Synced tables carry `updated_at` (last writer wins) and `deleted_at` (a soft delete, so a removal
-- on one device reaches the others). `key` is the client's stable identity for a row, so the same
-- item added as a guest on two devices merges into one row.

create extension if not exists pgcrypto;

-- ---------- helpers ----------

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- profiles ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  locale text not null default 'en' check (locale in ('en', 'hi')),
  units text not null default 'metric' check (units in ('metric', 'cups', 'us')),
  diet text,
  spice int check (spice between 1 and 5),
  cookware text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A profile row appears with every new account.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(coalesce(new.email, ''), '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- ---------- pantry (R1, R4) ----------

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 80),
  ingredient_id text check (char_length(ingredient_id) <= 60),
  name text not null check (char_length(name) between 1 and 60),
  category text not null default 'other' check (char_length(category) <= 20),
  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, key)
);
create index pantry_items_user on public.pantry_items (user_id, updated_at);

-- ---------- recipes (shared later via /r/[slug]) ----------

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 65536),
  locale text not null default 'en' check (locale in ('en', 'hi')),
  -- Saving is private; Phase 7's share button makes a recipe public (docs/04 says default true,
  -- see docs/DECISIONS.md Phase 6).
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create index recipes_author on public.recipes (author_id);

-- ---------- recipe book (R2) ----------

create table public.saved_recipes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 140),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  collection text not null default 'All' check (char_length(collection) between 1 and 40),
  rating int check (rating between 1 and 5),
  notes text check (char_length(notes) <= 2000),
  made_photo_path text check (char_length(made_photo_path) <= 300),
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, key)
);
create index saved_recipes_user on public.saved_recipes (user_id, updated_at);

-- ---------- shopping list (R8) ----------

create table public.shopping_list (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 80),
  name text not null check (char_length(name) between 1 and 80),
  qty text check (char_length(qty) <= 40),
  aisle text not null default 'other' check (char_length(aisle) <= 20),
  checked boolean not null default false,
  from_recipe text check (char_length(from_recipe) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, key)
);
create index shopping_list_user on public.shopping_list (user_id, updated_at);

-- ---------- shared triggers and owner-only policies ----------

do $$
declare t text;
begin
  foreach t in array array['pantry_items', 'saved_recipes', 'shopping_list'] loop
    execute format('create trigger %1$s_touch before update on public.%1$s
                    for each row execute function public.touch_updated_at()', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('create policy "%1$s: read own" on public.%1$s for select to authenticated
                    using ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: insert own" on public.%1$s for insert to authenticated
                    with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: update own" on public.%1$s for update to authenticated
                    using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: delete own" on public.%1$s for delete to authenticated
                    using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

alter table public.recipes enable row level security;
create policy "recipes: read public or own" on public.recipes
  for select to anon, authenticated using (is_public or (select auth.uid()) = author_id);
create policy "recipes: insert own" on public.recipes
  for insert to authenticated with check ((select auth.uid()) = author_id);
create policy "recipes: update own" on public.recipes
  for update to authenticated using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);
create policy "recipes: delete own" on public.recipes
  for delete to authenticated using ((select auth.uid()) = author_id);

-- A saved recipe may only point at a recipe its owner can see.
create or replace function public.saved_recipe_visible() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from public.recipes r where r.id = new.recipe_id) then
    raise exception 'recipe not found';
  end if;
  return new;
end;
$$;
create trigger saved_recipes_visible before insert or update of recipe_id on public.saved_recipes
  for each row execute function public.saved_recipe_visible();

-- Live sync between devices (Supabase Realtime respects RLS).
alter publication supabase_realtime add table public.pantry_items, public.saved_recipes,
  public.shopping_list;

-- ---------- "Made it!" photos (private bucket, one folder per user) ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('made-photos', 'made-photos', false, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "made-photos: read own" on storage.objects for select to authenticated
  using (bucket_id = 'made-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "made-photos: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'made-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "made-photos: update own" on storage.objects for update to authenticated
  using (bucket_id = 'made-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "made-photos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'made-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

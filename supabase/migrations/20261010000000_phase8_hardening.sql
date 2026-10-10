-- Phase 8: hardening. Rate limits that hold across serverless instances, and a 24 h cache of AI
-- answers (docs/04 §4 "Cache"). Both tables are server-only: RLS is on with no policies, and the
-- function is executable by the service role only, so browsers can neither read nor reset them.

-- One row per limited key ("generate:user:<uuid>", "generate:ip:<hmac>"). A fixed window that
-- starts at the key's first request; `count` resets once the window has passed.
create table if not exists public.rate_limits (
  key text primary key,
  started_at timestamptz not null default now(),
  count integer not null default 0
);
alter table public.rate_limits enable row level security;

create or replace function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns table (ok boolean, remaining integer, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := now();
  win interval := make_interval(secs => p_window_seconds);
  hits integer;
  since timestamptz;
begin
  insert into public.rate_limits as r (key, started_at, count)
  values (p_key, now_ts, 1)
  on conflict (key) do update set
    count = case when r.started_at <= now_ts - win then 1 else r.count + 1 end,
    started_at = case when r.started_at <= now_ts - win then now_ts else r.started_at end
  returning r.count, r.started_at into hits, since;

  ok := hits <= p_limit;
  remaining := greatest(p_limit - hits, 0);
  retry_after := case when ok then 0
    else greatest(1, ceil(extract(epoch from (since + win - now_ts))))::integer end;
  return next;
end;
$$;

revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;

-- Cached AI answers, keyed by a hash of the normalised request (ingredients, pantry, prefs,
-- language, excluded titles, wish). Recipes only: no user ids, no IP addresses.
create table if not exists public.ai_cache (
  key text primary key,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_cache_created_at on public.ai_cache (created_at);
alter table public.ai_cache enable row level security;

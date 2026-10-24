-- Rate limits (audit item 13): studio password and code attempts, booking actions.
-- Keys are SHA-256 hashes (no emails or IPs stored). Server-only.
create table public.rate_events (
  id bigint generated always as identity primary key,
  kind text not null,
  key_hash text not null,
  created_at timestamptz not null default now()
);
create index rate_events_lookup on public.rate_events (kind, key_hash, created_at);
alter table public.rate_events enable row level security;
revoke all on public.rate_events from anon, authenticated;

-- Records an attempt and says whether the caller is over the limit (the attempt isn't counted then).
create or replace function public.rate_limited(p_kind text, p_key text, p_max int, p_window_minutes int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  delete from public.rate_events where created_at < now() - interval '1 day';
  select count(*) into n from public.rate_events
   where kind = p_kind and key_hash = p_key and created_at > now() - make_interval(mins => p_window_minutes);
  if n >= p_max then return true; end if;
  insert into public.rate_events (kind, key_hash) values (p_kind, p_key);
  return false;
end $$;

revoke execute on function public.rate_limited(text, text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limited(text, text, int, int) to service_role;

-- Her answers on clients-only events:
-- - a "client" is someone with an active package (classes left, not expired), not a trial or drop-in;
-- - she can also let specific people see and book a given event.

create or replace function public.is_studio_client(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.credit_lots
                  where profile_id = p_profile and remaining > 0 and (expires_at is null or expires_at > now()))
$$;

create table public.event_access (
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, profile_id)
);
alter table public.event_access enable row level security;
revoke all on public.event_access from anon, authenticated;

-- Can this person see and book this event? Everyone for open events; for clients-only ones: active
-- package holders, people she added, and anyone already booked.
create or replace function public.can_access_event(p_profile uuid, p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce((select clients_only from public.class_sessions where id = p_session), false)
      or (p_profile is not null and (
            public.is_studio_client(p_profile)
         or exists (select 1 from public.event_access where session_id = p_session and profile_id = p_profile)
         or exists (select 1 from public.bookings where session_id = p_session and profile_id = p_profile and status = 'confirmed')))
$$;
revoke execute on function public.can_access_event(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_access_event(uuid, uuid) to service_role;

create or replace function public.guard_clients_only() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'bookings' then
    if new.source <> 'online' then return new; end if;
  end if;
  if not public.can_access_event(new.profile_id, new.session_id) then
    raise exception 'clients_only' using errcode = 'P0001';
  end if;
  return new;
end $$;

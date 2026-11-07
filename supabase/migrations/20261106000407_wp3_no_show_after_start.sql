-- WP3 (A-083): a no-show can only be marked once the class has started.

-- ── A-083: a no-show only once the class has started ────────────────────────────────────
create or replace function public.guard_no_show_future() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'no_show' and old.status is distinct from 'no_show'
     and exists (select 1 from public.class_sessions s where s.id = new.session_id and s.starts_at > now()) then
    raise exception 'class_not_started' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.guard_no_show_future() from public, anon, authenticated;
drop trigger if exists bookings_no_show_after_start on public.bookings;
create trigger bookings_no_show_after_start before update of status on public.bookings
  for each row execute function public.guard_no_show_future();

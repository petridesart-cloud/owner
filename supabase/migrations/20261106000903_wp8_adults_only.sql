-- WP8 (A-062): classes are for adults (her answer, round 4). Every booking path (online, the studio's manual
-- add, the waitlist, weekly repeats) is refused for someone whose date of birth says they're under 18 on the
-- day of the class, in studio time. People without a date of birth on file are asked for it before they book
-- online; the studio confirms "18 or over" when she adds someone new.
create or replace function public.guard_minor_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  dob date;
  class_day date;
begin
  if new.status not in ('held', 'confirmed') then return new; end if;
  select p.date_of_birth into dob from public.profiles p where p.id = new.profile_id;
  if dob is null then return new; end if;
  select (s.starts_at at time zone (public.settings()).timezone)::date into class_day
    from public.class_sessions s where s.id = new.session_id;
  -- age() counts a 29 February birthday from 1 March in other years, like the app's ageOn().
  if date_part('year', age(class_day, dob)) < 18 then
    raise exception 'minor_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger bookings_adults_only before insert or update of status on public.bookings
  for each row execute function public.guard_minor_booking();

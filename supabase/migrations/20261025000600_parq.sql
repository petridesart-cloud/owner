-- PAR-Q health questions at sign-up (audit item 12).
-- Everyone answers; only the completion date is always kept. Which questions were answered
-- "yes" is health data: stored in health_notes (instructor-only) only with health consent.
alter table public.profiles add column parq_completed_at timestamptz;
alter table public.health_notes add column parq_yes text[];

create or replace function public.erase_profile(p_profile uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  select user_id into uid from public.profiles where id = p_profile;
  update public.bookings set status = 'cancelled', cancelled_at = now()
   where profile_id = p_profile and status in ('held', 'confirmed')
     and session_id in (select id from public.class_sessions where starts_at > now());
  update public.waitlist_entries set status = 'left' where profile_id = p_profile and status in ('waiting', 'offered');
  update public.payments set status = 'cancelled' where profile_id = p_profile and status = 'pending';
  delete from public.health_notes where profile_id = p_profile;
  delete from public.recurring_rules where profile_id = p_profile;
  update public.profiles set full_name = 'Deleted client', first_name = null, last_name = null, email = null, phone = null,
         date_of_birth = null, parq_completed_at = null, goal = null, emergency_contact_name = null, emergency_contact_phone = null, photo_consent = null,
         admin_notes = null, marketing_email = false, marketing_sms = false, user_id = null, deleted_at = now()
   where id = p_profile;
  update public.notifications set recipient = '[erased]', body = '[erased]' where profile_id = p_profile;
  return uid; -- caller deletes the auth user
end $$;


create or replace function public.seed_demo_profiles() returns void
language sql security definer set search_path = public as $$
  update public.profiles set parq_completed_at = now()
   where role = 'client' and parq_completed_at is null and email like '%@example.com';
  update public.profiles
     set date_of_birth = date '1984-01-01' + (abs(hashtext(email)) % 8000)
   where role = 'client' and date_of_birth is null and email like '%@example.com';
  -- One demo client celebrates on the day of their next class (shows the Birthday flag).
  update public.profiles p
     set date_of_birth = make_date(1992, extract(month from x.d)::int, extract(day from x.d)::int)
    from (select (s.starts_at at time zone 'Europe/Nicosia')::date as d from public.bookings b
            join public.class_sessions s on s.id = b.session_id
            join public.profiles q on q.id = b.profile_id
           where q.email = 'elena@example.com' and b.status = 'confirmed' and s.starts_at > now()
           order by s.starts_at limit 1) x
   where p.email = 'elena@example.com' and not (extract(month from x.d) = 2 and extract(day from x.d) = 29);
$$;


select public.seed_demo_profiles();

revoke execute on function public.erase_profile(uuid), public.seed_demo_profiles() from public, anon, authenticated;
grant execute on function public.erase_profile(uuid), public.seed_demo_profiles() to service_role;

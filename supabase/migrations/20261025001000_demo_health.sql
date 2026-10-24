-- Demo: Maria's health answers need a doctor's note.
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
  -- A demo client with health answers that need a doctor's note (shows the flag in her list).
  insert into public.health_notes (profile_id, conditions, details, pregnancy, pregnancy_weeks, bp_meds, clearance_needed, consent_at, updated_at)
  select id, '{pregnancy,back}', 'Lower back ache since the second trimester.', 'current', 20, false, true, now(), now()
    from public.profiles where email = 'maria@example.com'
  on conflict (profile_id) do update set conditions = excluded.conditions, details = excluded.details, pregnancy = excluded.pregnancy,
    pregnancy_weeks = excluded.pregnancy_weeks, bp_meds = excluded.bp_meds, clearance_needed = true, clearance_received_at = null;
$$;

select public.seed_demo_profiles();

revoke execute on function public.seed_demo_profiles() from public, anon, authenticated;
grant execute on function public.seed_demo_profiles() to service_role;

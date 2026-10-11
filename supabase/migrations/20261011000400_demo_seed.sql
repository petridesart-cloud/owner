-- Demo data as a function, so the admin "Reset demo data" button can rebuild it.
-- Everything is relative to now(), so the demo always looks current.
-- Demo clients are fictional (example.com addresses).

create or replace function public.seed_demo() returns void
language plpgsql security definer set search_path = public as $$
declare
  tz text := 'Europe/Nicosia';
  today date := (now() at time zone tz)::date;
  week_start date := date_trunc('week', (now() at time zone tz) + interval '1 day')::date;
  tpl uuid;
  reformer uuid;
  mat uuid;
  event_type uuid;
  cl uuid[] := '{}';
  pid uuid;
  elena uuid; maria uuid;
  lot_elena uuid; lot_maria uuid;
  r record;
  idx int := 0;
  k int;
  j int;
  c uuid;
  is_past boolean;
  sup_day date;
  sid uuid;
  names text[] := array[
    'Elena Charalambous', 'Maria Georgiou', 'Sofia Andreou', 'Christina Michael', 'Niki Pavlou', 'Andria Ioannou',
    'Katerina Demetriou', 'Despina Kyriakou', 'Anna Petrou', 'Stella Constantinou', 'Myrto Hadjigeorgiou',
    'Rafaela Nicolaou', 'Ioanna Savva', 'Lucy Bennett', 'Daria Volkova', 'Georgia Antoniou'];
begin
  insert into public.studio_settings (id) values (1) on conflict do nothing;

  insert into public.class_types (slug, name, kind, credit_kind, description, default_capacity, default_duration_minutes, price_cents, default_location, sort_order) values
    ('reformer', 'Reformer Pilates', 'reformer', 'reformer',
     'Three reformers, one instructor. Strength, control and length, at your pace.', 3, 50, 2000, 'Re·Form Studio, Limassol', 1),
    ('mat', 'Mat Pilates', 'mat', 'mat',
     'Classical mat work for core, posture and breath. Mats and props provided.', 8, 50, 1500, 'Re·Form Studio, Limassol', 2),
    ('event', 'Special Event', 'event', null, 'One-off experiences outside the studio.', 8, 90, 3500, null, 3)
  on conflict (slug) do nothing;
  reformer := (select id from public.class_types where slug = 'reformer');
  mat := (select id from public.class_types where slug = 'mat');
  event_type := (select id from public.class_types where slug = 'event');

  if not exists (select 1 from public.products) then
    insert into public.products (name, kind, credit_kind, credits, price_cents, validity_days, sort_order) values
      ('Reformer · 5 classes', 'pack', 'reformer', 5, 9000, 60, 1),
      ('Reformer · 10 classes', 'pack', 'reformer', 10, 17000, 90, 2),
      ('Mat · 5 classes', 'pack', 'mat', 5, 6500, 60, 3),
      ('Mat · 10 classes', 'pack', 'mat', 10, 12000, 90, 4);
  end if;

  insert into public.compliance_items (key) values
    ('privacy_policy_reviewed'), ('terms_reviewed'), ('cancellation_policy_reviewed'), ('withdrawal_right_confirmed'),
    ('health_disclaimer_reviewed'), ('business_details_filled'), ('cookie_policy_reviewed'), ('no_nonessential_cookies'),
    ('health_consent_flow_tested'), ('data_export_tested'), ('account_deletion_tested'), ('consent_log_verified'),
    ('marketing_opt_in_only'), ('dpa_supabase'), ('dpa_stripe'), ('dpa_resend'), ('dpa_twilio'), ('dpa_vercel'),
    ('supabase_eu_region'), ('supabase_backups_enabled'), ('rls_verified'), ('admin_roles_verified'), ('otp_rate_limit_verified'),
    ('https_only'), ('demo_mode_off'), ('stripe_live_keys'), ('apple_pay_domain_verified'), ('contrast_checked'),
    ('keyboard_screenreader_tested'), ('reduced_motion_tested'), ('alt_text_reviewed'), ('photos_permission'),
    ('no_unsupported_claims'), ('fonts_licensed'), ('retention_job_scheduled')
  on conflict do nothing;

  -- The posted weekly reformer timetable: two weeks of history + three weeks ahead.
  insert into public.timetable_templates (name, valid_from, valid_to)
    values (trim(to_char(now() at time zone tz, 'Month YYYY')) || ' timetable', week_start - 14, week_start + 20)
    returning id into tpl;
  insert into public.template_slots (template_id, weekday, start_time, class_type_id)
  select tpl, d, t::time, reformer from (values
    (1, '08:00'), (1, '09:00'), (1, '17:30'), (1, '18:30'), (1, '19:30'),
    (2, '07:00'), (2, '08:00'), (2, '16:00'), (2, '17:00'), (2, '18:00'), (2, '19:00'),
    (3, '07:30'), (3, '08:30'), (3, '16:00'), (3, '17:00'),
    (4, '08:00'), (4, '09:00'), (4, '16:30'), (4, '17:30'), (4, '18:30'), (4, '19:30'),
    (5, '08:00'), (5, '16:00'), (5, '17:00'), (5, '18:00'), (5, '19:00')
  ) as v(d, t);
  perform public.generate_sessions(tpl);
  -- generate_sessions only creates future classes; add the past ones for history.
  insert into public.class_sessions (class_type_id, template_id, starts_at, ends_at, capacity)
  select ts.class_type_id, tpl, (dy + ts.start_time) at time zone tz, (dy + ts.start_time) at time zone tz + interval '50 minutes', 3
    from generate_series(week_start - 14, today, interval '1 day') g(dy0)
    cross join lateral (select g.dy0::date as dy) x
    join public.template_slots ts on ts.template_id = tpl and ts.weekday = extract(isodow from x.dy)
   where (x.dy + ts.start_time) at time zone tz < now()
  on conflict do nothing;

  -- Clients
  foreach pid in array array[]::uuid[] loop end loop;
  for j in 1 .. array_length(names, 1) loop
    insert into public.profiles (full_name, email, phone, onboarded_at, created_at)
      values (names[j], lower(split_part(names[j], ' ', 1)) || '@example.com', '+357 99 ' || lpad((100000 + j * 7919)::text, 6, '0'),
              now() - make_interval(days => 60 - j * 3), now() - make_interval(days => 60 - j * 3))
      returning id into pid;
    cl := cl || pid;
    insert into public.consents (profile_id, type, granted, version, created_at)
    select pid, t::public.consent_type, true, '2026-10-v1', now() - make_interval(days => 60 - j * 3)
      from unnest(array['policy', 'terms', 'fitness_declaration']) t;
  end loop;
  elena := cl[1]; maria := cl[2];
  update public.profiles set admin_notes = 'Prefers evening classes. Came via Instagram DM.' where id = cl[6];
  update public.profiles set marketing_email = true where id in (cl[1], cl[3], cl[7]);
  insert into public.health_notes (profile_id, note, consent_at) values
    (maria, 'Mild lower-back sensitivity. Avoid deep spinal flexion on bad days.', now() - interval '50 days'),
    (cl[9], '20 weeks pregnant. Cleared by her doctor; no supine work after the first trimester.', now() - interval '20 days');
  insert into public.consents (profile_id, type, granted, version) values (maria, 'health_data', true, '2026-10-v1'), (cl[9], 'health_data', true, '2026-10-v1');

  -- Credit packs
  insert into public.credit_lots (profile_id, credit_kind, total, remaining, expires_at, note, created_at)
    values (elena, 'reformer', 10, 10, now() + interval '75 days', 'Reformer · 10 classes', now() - interval '15 days') returning id into lot_elena;
  insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, reason) values (elena, lot_elena, 'reformer', 10, 'purchase');
  insert into public.credit_lots (profile_id, credit_kind, total, remaining, expires_at, note)
    values (maria, 'reformer', 5, 5, now() + interval '40 days', 'Reformer · 5 classes') returning id into lot_maria;
  insert into public.credit_lots (profile_id, credit_kind, total, remaining, expires_at, note) values
    (cl[3], 'reformer', 5, 2, now() + interval '9 days', 'Reformer · 5 classes'),
    (cl[7], 'reformer', 10, 6, now() + interval '50 days', 'Reformer · 10 classes'),
    (cl[12], 'mat', 5, 4, now() + interval '30 days', 'Mat · 5 classes');

  -- Elena's usual slot: Tuesday 18:00 (history + next week booked), so "Your next class"
  -- and "Rebook your usual" have something to show when signing in as elena@example.com.
  for r in select s.id, s.starts_at from public.class_sessions s
            where s.class_type_id = reformer and extract(isodow from s.starts_at at time zone tz) = 2
              and to_char(s.starts_at at time zone tz, 'HH24:MI') = '18:00'
            order by s.starts_at
  loop
    is_past := r.starts_at < now();
    if is_past or r.starts_at < now() + interval '8 days' then
      update public.credit_lots set remaining = remaining - 1 where id = lot_elena;
      insert into public.bookings (session_id, profile_id, status, paid_with, credit_lot_id, confirmed_at, checked_in_at, created_at)
        values (r.id, elena, 'confirmed', 'credit', lot_elena, r.starts_at - interval '3 days', case when is_past then r.starts_at end, r.starts_at - interval '3 days');
      insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, reason, created_at) values (elena, lot_elena, 'reformer', -1, 'booking', r.starts_at - interval '3 days');
    end if;
  end loop;

  -- Everyone else: a realistic mix of full, "1 left", quiet and empty classes, with waitlists.
  for r in select s.id, s.starts_at, s.capacity,
                  (select count(*) from public.bookings b where b.session_id = s.id)::int as taken
             from public.class_sessions s where s.class_type_id = reformer order by s.starts_at
  loop
    idx := idx + 1;
    is_past := r.starts_at < now();
    k := case
           when is_past then 1 + (idx % 3)                                -- history: 1–3 people
           when r.starts_at < now() + interval '30 hours' then 1 + (idx % 3)
           else (array[3, 2, 0, 1, 2, 3, 1, 0, 2, 1, 3, 1])[1 + idx % 12]  -- ahead: full / 1 left / quiet / empty
         end;
    k := least(k, r.capacity) - r.taken;
    for j in 0 .. k - 1 loop
      c := cl[2 + ((idx * 5 + j * 3) % (array_length(cl, 1) - 1))];      -- never Elena (handled above)
      continue when exists (select 1 from public.bookings b where b.session_id = r.id and b.profile_id = c);
      insert into public.bookings (session_id, profile_id, status, paid_with, source, confirmed_at, checked_in_at, created_at)
        values (r.id, c,
                case when is_past and idx % 11 = 0 and j = 0 then 'no_show' else 'confirmed' end::public.booking_status,
                case when j = 0 and idx % 4 = 0 then 'payment' else 'manual' end::public.paid_with,
                case when idx % 3 = 0 then 'manual' else 'online' end::public.booking_source,
                r.starts_at - make_interval(days => 1 + idx % 5),
                case when is_past and not (idx % 11 = 0 and j = 0) then r.starts_at + interval '2 minutes' end,
                r.starts_at - make_interval(days => 1 + idx % 5));
    end loop;
    -- Waitlists on some full upcoming classes
    if not is_past and r.starts_at > now() + interval '30 hours'
       and (select count(*) from public.bookings b where b.session_id = r.id and b.status = 'confirmed') >= r.capacity
       and idx % 2 = 0 then
      for j in 0 .. (idx % 3) loop
        c := cl[2 + ((idx * 7 + j * 5 + 1) % (array_length(cl, 1) - 1))];
        continue when exists (select 1 from public.bookings b where b.session_id = r.id and b.profile_id = c)
                   or exists (select 1 from public.waitlist_entries w where w.session_id = r.id and w.profile_id = c);
        insert into public.waitlist_entries (session_id, profile_id, created_at) values (r.id, c, now() - make_interval(hours => 5 - j));
      end loop;
    end if;
  end loop;

  -- Saturday: a mat class and a SUP Pilates event on the beach
  sup_day := today + ((6 - extract(isodow from today)::int + 7) % 7);
  if sup_day < today + 2 then sup_day := sup_day + 7; end if;

  insert into public.class_sessions (class_type_id, starts_at, ends_at, capacity)
    values (mat, (sup_day + time '11:00') at time zone tz, (sup_day + time '11:50') at time zone tz, 8) returning id into sid;
  insert into public.bookings (session_id, profile_id, status, paid_with, confirmed_at)
    select sid, unnest(array[cl[12], cl[5], cl[14]]), 'confirmed', 'manual', now() - interval '1 day';

  insert into public.class_sessions (class_type_id, title, description, starts_at, ends_at, capacity, price_cents, location)
    values (event_type, 'SUP Pilates', 'Pilates on a paddle board at sunrise. Boards and paddles provided. No experience needed, just bring a towel and water.',
            (sup_day + time '08:30') at time zone tz, (sup_day + time '10:00') at time zone tz, 8, 3500,
            'Beach, Limassol (exact spot shared after booking)')
    returning id into sid;
  insert into public.bookings (session_id, profile_id, status, paid_with, confirmed_at)
    select sid, unnest(array[cl[3], cl[6], cl[8], cl[10], cl[13]]), 'confirmed', 'manual', now() - interval '2 days';

  -- A few historical online payments so Stats has revenue
  insert into public.payments (profile_id, provider, amount_cents, purpose, description, status, paid_at, created_at)
  values (elena, 'mock', 17000, 'pack', 'Reformer · 10 classes', 'paid', now() - interval '15 days', now() - interval '15 days'),
         (maria, 'mock', 9000, 'pack', 'Reformer · 5 classes', 'paid', now() - interval '6 days', now() - interval '6 days'),
         (cl[7], 'mock', 17000, 'pack', 'Reformer · 10 classes', 'paid', now() - interval '3 days', now() - interval '3 days');
end $$;

-- Wipes bookings/clients and rebuilds the demo. Keeps admins, settings, class types and products.
create or replace function public.reset_demo_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.notifications;
  delete from public.waitlist_entries;
  delete from public.credit_ledger;
  update public.bookings set credit_lot_id = null, payment_id = null;
  update public.payments set booking_id = null;
  delete from public.bookings;
  delete from public.credit_lots;
  delete from public.payments;
  delete from public.class_sessions;
  delete from public.timetable_templates;
  delete from public.otp_requests;
  delete from public.consents where profile_id in (select id from public.profiles where role = 'client');
  delete from public.profiles where role = 'client';
  perform public.seed_demo();
end $$;

revoke execute on function public.seed_demo(), public.reset_demo_data() from public, anon, authenticated;
grant execute on function public.seed_demo(), public.reset_demo_data() to service_role;

-- Demo seed v2 (Elysia's notes, round 1): her real packages, a finished past package
-- for Elena, a past and an upcoming event, and a 4-week timetable.
-- (Earlier migrations are never edited once applied; this replaces seed_demo.)

-- Her catalogue. Old demo packages are hidden (kept for payment history).
create or replace function public.install_catalogue() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.products set tag = 'membership' where kind = 'membership' and tag <> 'membership';
  if exists (select 1 from public.products where tag = 'package' and per_week is not null) then return; end if;
  update public.products set active = false where kind <> 'membership' and per_week is null;
    -- Her real packages (round-1 notes). "1 month" = 30 days, "2 months" = 60 days from the first class.
    insert into public.products (name, kind, tag, credit_kind, per_week, months, credits, price_cents, validity_days, period_days, description, is_group, active, sort_order)
    select (case ck when 'reformer' then 'Reformer' else 'Mat' end) || ' · ' || pw || ' per week · ' || m || (case m when 1 then ' month' else ' months' end),
           'pack', 'package', ck::public.credit_kind, pw, m, pw * 4 * m, price, 30 * m, null,
           pw * 4 * m || ' classes, valid ' || 30 * m || ' days from your first class.', true, true,
           (case ck when 'reformer' then 0 else 20 end) + (m - 1) * 10 + pw
      from (values
        ('reformer', 1, 1, 7000), ('reformer', 2, 1, 13000), ('reformer', 3, 1, 18000), ('reformer', 4, 1, 22000),
        ('reformer', 1, 2, 12000), ('reformer', 2, 2, 24000), ('reformer', 3, 2, 30000), ('reformer', 4, 2, 41000),
        ('mat', 1, 1, 5000), ('mat', 2, 1, 9000), ('mat', 3, 1, 12000), ('mat', 4, 1, 15000),
        ('mat', 1, 2, 8500), ('mat', 2, 2, 15000), ('mat', 3, 2, 20000), ('mat', 4, 2, 26000)
      ) as v(ck, pw, m, price);
    insert into public.products (name, kind, tag, credit_kind, credits, price_cents, validity_days, description, is_group, active, sort_order) values
      ('Reformer Trial', 'single', 'trial', 'reformer', 1, 2500, null, 'Your first reformer class.', true, true, 50),
      ('Mat Trial', 'single', 'trial', 'mat', 1, 2000, null, 'Your first mat class.', true, true, 51),
      ('Reformer Drop-in', 'single', 'drop_in', 'reformer', 1, 3500, null, 'One reformer class.', false, true, 60),
      ('Mat Drop-in', 'single', 'drop_in', 'mat', 1, 3000, null, 'One mat class.', false, true, 61);
    -- Auto-renewing monthly package: code kept behind the online-payments flag, hidden for now.
    if not exists (select 1 from public.products where kind = 'membership') then
    insert into public.products (name, kind, tag, credit_kind, credits, price_cents, period_days, description, is_group, active, sort_order) values
      ('Monthly · 8 reformer classes', 'membership', 'membership', 'reformer', 8, 13000, 30, 'Renews every 30 days.', true, false, 90);
    end if;
end $$;

select public.install_catalogue();

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
  lot_elena uuid; lot_maria uuid; lot_old uuid;
  memb uuid;
  monthly8 uuid;
  bid uuid;
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

  perform public.install_catalogue();
  monthly8 := (select id from public.products where name = 'Monthly · 8 reformer classes' limit 1);

  insert into public.compliance_items (key) values
    ('privacy_policy_reviewed'), ('terms_reviewed'), ('cancellation_policy_reviewed'), ('withdrawal_right_confirmed'),
    ('health_disclaimer_reviewed'), ('business_details_filled'), ('cookie_policy_reviewed'), ('no_nonessential_cookies'),
    ('health_consent_flow_tested'), ('data_export_tested'), ('account_deletion_tested'), ('consent_log_verified'),
    ('marketing_opt_in_only'), ('dpa_supabase'), ('dpa_stripe'), ('dpa_resend'), ('dpa_twilio'), ('dpa_vercel'),
    ('supabase_eu_region'), ('supabase_backups_enabled'), ('rls_verified'), ('admin_roles_verified'), ('otp_rate_limit_verified'),
    ('https_only'), ('demo_mode_off'), ('stripe_live_keys'), ('apple_pay_domain_verified'), ('contrast_checked'),
    ('keyboard_screenreader_tested'), ('reduced_motion_tested'), ('alt_text_reviewed'), ('photos_permission'),
    ('no_unsupported_claims'), ('fonts_licensed'), ('retention_job_scheduled'),
    ('pay_registered_self_employed'), ('pay_vat_position_confirmed'), ('pay_bank_stripe_verified'),
    ('pay_legal_texts_reviewed'), ('pay_liability_insurance')
  on conflict do nothing;

  -- The posted weekly reformer timetable: two weeks of history + three weeks ahead.
  insert into public.timetable_templates (name, valid_from, valid_to)
    values (trim(to_char(now() at time zone tz, 'Month YYYY')) || ' timetable', week_start - 14, week_start + 27)
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

  -- Elena's previous package (finished): 6 attended, 1 no-show, 1 rescheduled, 1 unused when it expired.
  insert into public.payments (profile_id, provider, amount_cents, purpose, description, status, method, product_id, paid_at, created_at)
    select elena, 'offline', price_cents, 'pack', name, 'paid', 'cash', id, now() - interval '55 days', now() - interval '55 days'
      from public.products where tag = 'package' and credit_kind = 'reformer' and per_week = 2 and months = 1 returning id into bid;
  -- Granted with a temporary fixed expiry so past classes can be replayed, then switched to 30 days from the first class.
  lot_old := public.grant_lot(elena, 'reformer', 8, now() + interval '1 day', 'Reformer · 2 per week · 1 month', bid);
  for j in 0 .. 7 loop
    insert into public.class_sessions (class_type_id, starts_at, ends_at, capacity)
      values (reformer, ((today - 52 + j * 4) + time '18:00') at time zone tz, ((today - 52 + j * 4) + time '18:50') at time zone tz, 3)
      on conflict do nothing returning id into sid;
    continue when sid is null;
    insert into public.bookings (session_id, profile_id, status, paid_with, credit_lot_id, confirmed_at, created_at)
      values (sid, elena, 'confirmed', 'credit', lot_old, now() - interval '56 days', now() - interval '56 days') returning id into bid;
    perform public.spend_credits(elena, 'reformer', 1, bid, ((today - 52 + j * 4) + time '18:00') at time zone tz);
    if j = 3 then
      update public.bookings set status = 'no_show' where id = bid;           -- missed
    elsif j = 5 then
      update public.bookings set status = 'cancelled', cancelled_at = now() - interval '35 days' where id = bid;  -- rescheduled
      perform public.return_credit(bid, 'cancel_refund');
    elsif j = 7 then
      update public.bookings set status = 'cancelled', cancelled_at = now() - interval '30 days' where id = bid;  -- rescheduled, never rebooked
      perform public.return_credit(bid, 'cancel_refund');
    else
      update public.bookings set checked_in_at = ((today - 52 + j * 4) + time '18:02') at time zone tz where id = bid;
    end if;
  end loop;
  update public.credit_lots set validity_days = 30, started_at = ((today - 52) + time '18:00') at time zone tz,
         expires_at = public.compute_expiry(((today - 52) + time '18:00') at time zone tz, 30)
   where id = lot_old;
  perform public.expire_credits();

  -- Elena: current 8-class package paid by Revolut; validity started with her first class (18 days ago).
  insert into public.payments (profile_id, provider, amount_cents, purpose, description, status, method, product_id, paid_at, created_at)
    select elena, 'offline', price_cents, 'pack', name, 'paid', 'revolut', id, now() - interval '20 days', now() - interval '20 days'
      from public.products where tag = 'package' and credit_kind = 'reformer' and per_week = 2 and months = 1 returning id into bid;
  lot_elena := public.grant_lot(elena, 'reformer', 8, null, 'Reformer · 2 per week · 1 month', bid, null, null, 'grant', null, 30);
  insert into public.payments (profile_id, provider, amount_cents, purpose, description, status, method, product_id, paid_at, created_at)
    select maria, 'offline', price_cents, 'pack', name, 'paid', 'bank_transfer', id, now() - interval '2 days', now() - interval '2 days'
      from public.products where tag = 'package' and credit_kind = 'reformer' and per_week = 1 and months = 1 returning id into bid;
  lot_maria := public.grant_lot(maria, 'reformer', 4, null, 'Reformer · 1 per week · 1 month', bid, null, null, 'grant', null, 30);
  perform public.grant_lot(cl[3], 'reformer', 2, now() + interval '4 days', 'Reformer · 2 per week · 1 month');
  perform public.grant_lot(cl[7], 'reformer', 6, now() + interval '41 days', 'Reformer · 3 per week · 2 months');
  perform public.grant_lot(cl[12], 'mat', 1, now() + interval '20 days', 'Mat · 1 per week · 1 month');
  update public.profiles set student_verified_until = (now() + interval '8 months')::date where id in (cl[13], cl[15]);

  -- Elena's usual slot: Tuesday 18:00 (history + next week booked), so "Your next class"
  -- and "Rebook your usual" have something to show when signing in as elena@example.com.
  for r in select s.id, s.starts_at from public.class_sessions s
            where s.class_type_id = reformer and extract(isodow from s.starts_at at time zone tz) = 2
              and to_char(s.starts_at at time zone tz, 'HH24:MI') = '18:00'
            order by s.starts_at
  loop
    is_past := r.starts_at < now();
    if (is_past and r.starts_at > now() - interval '18 days') or (not is_past and r.starts_at < now() + interval '8 days') then
      insert into public.bookings (session_id, profile_id, status, paid_with, credit_lot_id, confirmed_at, checked_in_at, created_at)
        values (r.id, elena, 'confirmed', 'credit', lot_elena, r.starts_at - interval '3 days', case when is_past then r.starts_at end, r.starts_at - interval '3 days')
        returning id into bid;
      perform public.spend_credits(elena, 'reformer', 1, bid, r.starts_at);
    elsif is_past then
      insert into public.bookings (session_id, profile_id, status, paid_with, confirmed_at, checked_in_at, created_at)
        values (r.id, elena, 'confirmed', 'manual', r.starts_at - interval '3 days', r.starts_at, r.starts_at - interval '3 days');
    end if;
  end loop;

  -- Ledger rows were written "now"; date them like the real bookings so history reads naturally.
  perform set_config('reform.ledger_maintenance', 'on', true);
  update public.credit_ledger g set created_at = b.created_at from public.bookings b where g.booking_id = b.id;
  update public.credit_ledger g set created_at = p.paid_at from public.credit_lots l join public.payments p on p.id = l.payment_id
   where g.lot_id = l.id and g.entry_type = 'grant' and p.paid_at is not null;
  perform set_config('reform.ledger_maintenance', 'off', true);

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

  -- Two upcoming "pay at the studio" bookings (unpaid) so the roster shows the flag.
  for r in select b.id, b.profile_id, b.session_id from public.bookings b join public.class_sessions x on x.id = b.session_id
            where b.status = 'confirmed' and b.paid_with = 'manual' and b.profile_id in (cl[4], cl[11]) and x.starts_at > now()
            order by x.starts_at limit 2
  loop
    insert into public.payments (profile_id, provider, amount_cents, purpose, description, booking_id, status)
      values (r.profile_id, 'offline', 2000, 'booking', 'Reformer Pilates (pay at studio)', r.id, 'pending') returning id into bid;
    update public.bookings set paid_with = 'pay_at_studio', payment_id = bid where id = r.id;
  end loop;
  -- A pending pack request waiting for payment at the studio.
  insert into public.payments (profile_id, provider, amount_cents, purpose, description, status, product_id)
    select cl[5], 'offline', price_cents, 'pack', name, 'pending', id from public.products where tag = 'package' and credit_kind = 'reformer' and per_week = 2 and months = 1 limit 1;
  update public.payments set intended_method = 'revolut' where profile_id = cl[5] and status = 'pending';

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

  -- A past event (for the Events page) and an upcoming brunch.
  insert into public.class_sessions (class_type_id, title, description, starts_at, ends_at, capacity, price_cents, location)
    values (event_type, 'SUP Pilates', 'Sunrise Pilates on paddle boards. Thank you to everyone who came!',
            ((today - 21) + time '08:30') at time zone tz, ((today - 21) + time '10:00') at time zone tz, 8, 3500, 'Beach, Limassol');
  insert into public.class_sessions (class_type_id, title, description, starts_at, ends_at, capacity, price_cents, location)
    values (event_type, 'Brunch & Pilates', 'A gentle mat flow followed by brunch together. All levels welcome.',
            ((sup_day + 8) + time '10:00') at time zone tz, ((sup_day + 8) + time '12:00') at time zone tz, 10, 4500, 'Re·Form Studio, Limassol');

  -- A few historical online payments so Stats has revenue
  insert into public.payments (profile_id, provider, amount_cents, purpose, description, status, method, paid_at, created_at)
  values (cl[7], 'offline', 30000, 'pack', 'Reformer · 3 per week · 2 months', 'paid', 'revolut', now() - interval '19 days', now() - interval '19 days'),
         (cl[3], 'offline', 13000, 'pack', 'Reformer · 2 per week · 1 month', 'paid', 'cash', now() - interval '26 days', now() - interval '26 days');
  -- Profile fields from her Account page.
  update public.profiles set first_name = split_part(full_name, ' ', 1), last_name = nullif(substr(full_name, length(split_part(full_name, ' ', 1)) + 2), '')
   where full_name is not null and first_name is null;
  update public.profiles set goal = 'A stronger core and better posture', photo_consent = 'face',
         emergency_contact_name = 'Andreas Charalambous', emergency_contact_phone = '+357 99 555 123' where id = elena;
  update public.profiles set photo_consent = 'none' where id = maria;
  update public.profiles set photo_consent = 'no_face' where id = cl[2];
end $$;


revoke execute on function public.seed_demo(), public.install_catalogue() from public, anon, authenticated;
grant execute on function public.seed_demo(), public.install_catalogue() to service_role;

-- Demo data for Re·Form. Dates are relative to "now", so the demo always looks current.
-- Demo clients are fictional (example.com addresses).

insert into public.studio_settings (id) values (1) on conflict do nothing;

insert into public.class_types (slug, name, kind, credit_kind, description, default_capacity, default_duration_minutes, price_cents, default_location, sort_order) values
  ('reformer', 'Reformer Pilates', 'reformer', 'reformer',
   'Three reformers, one instructor. Strength, control and length, at your pace.', 3, 50, 2000, 'Re·Form Studio, Limassol', 1),
  ('mat', 'Mat Pilates', 'mat', 'mat',
   'Classical mat work for core, posture and breath. Mats and props provided.', 8, 50, 1500, 'Re·Form Studio, Limassol', 2),
  ('event', 'Special Event', 'event', null,
   'One-off experiences outside the studio.', 8, 90, 3500, null, 3);

insert into public.products (name, kind, credit_kind, credits, price_cents, validity_days, sort_order) values
  ('Reformer · 5 classes', 'pack', 'reformer', 5, 9000, 60, 1),
  ('Reformer · 10 classes', 'pack', 'reformer', 10, 17000, 90, 2),
  ('Mat · 5 classes', 'pack', 'mat', 5, 6500, 60, 3),
  ('Mat · 10 classes', 'pack', 'mat', 10, 12000, 90, 4);

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

do $$
declare
  tz text := 'Europe/Nicosia';
  week_start date := date_trunc('week', (now() at time zone tz) + interval '1 day')::date; -- this Monday (next Monday on Sundays)
  today date := (now() at time zone tz)::date;
  sup_day date;
  tpl uuid;
  reformer uuid := (select id from public.class_types where slug = 'reformer');
  event_type uuid := (select id from public.class_types where slug = 'event');
  c_elena uuid; c_maria uuid; c_sofia uuid; c_christina uuid; c_niki uuid; c_andria uuid;
  lot uuid;
  s_full1 uuid; s_full2 uuid; s_part uuid; s_past uuid; s_sup uuid;
  b uuid;
begin
  -- Recurring weekly timetable (current month's posted schedule), two weeks from this Monday.
  insert into public.timetable_templates (name, valid_from, valid_to)
    values (trim(to_char(now() at time zone tz, 'Month YYYY')) || ' timetable', week_start, week_start + 13)
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

  -- Demo clients (no login accounts; they link automatically if someone signs in with the email).
  insert into public.profiles (full_name, email, phone, onboarded_at) values ('Elena Charalambous', 'elena@example.com', '+357 99 000001', now()) returning id into c_elena;
  insert into public.profiles (full_name, email, phone, onboarded_at) values ('Maria Georgiou', 'maria@example.com', '+357 99 000002', now()) returning id into c_maria;
  insert into public.profiles (full_name, email, phone, onboarded_at) values ('Sofia Andreou', 'sofia@example.com', '+357 99 000003', now()) returning id into c_sofia;
  insert into public.profiles (full_name, email, phone, onboarded_at) values ('Christina Michael', 'christina@example.com', '+357 99 000004', now()) returning id into c_christina;
  insert into public.profiles (full_name, email, phone, onboarded_at) values ('Niki Pavlou', 'niki@example.com', '+357 99 000005', now()) returning id into c_niki;
  insert into public.profiles (full_name, email, phone, onboarded_at, admin_notes) values ('Andria Ioannou', 'andria@example.com', '+357 99 000006', now(), 'Prefers evening classes. Came via Instagram DM.') returning id into c_andria;

  insert into public.consents (profile_id, type, granted, version)
  select p, t::public.consent_type, true, '2026-10-v1'
    from unnest(array[c_elena, c_maria, c_sofia, c_christina, c_niki, c_andria]) p,
         unnest(array['policy', 'terms', 'fitness_declaration']) t;

  insert into public.health_notes (profile_id, note, consent_at) values
    (c_maria, 'Mild lower-back sensitivity. Avoid deep spinal flexion on bad days.', now());
  insert into public.consents (profile_id, type, granted, version) values (c_maria, 'health_data', true, '2026-10-v1');

  -- Credits: Elena has a 10-pack, Maria a 5-pack.
  insert into public.credit_lots (profile_id, credit_kind, total, remaining, expires_at, note)
    values (c_elena, 'reformer', 10, 7, now() + interval '75 days', 'Reformer · 10 classes') returning id into lot;
  insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, reason) values (c_elena, lot, 'reformer', 10, 'purchase');
  insert into public.credit_lots (profile_id, credit_kind, total, remaining, expires_at, note)
    values (c_maria, 'reformer', 5, 3, now() + interval '40 days', 'Reformer · 5 classes');

  -- Pick some upcoming sessions (at least 2 days out so they stay "upcoming").
  select id into s_full1 from public.class_sessions where starts_at > now() + interval '2 days' order by starts_at offset 1 limit 1;
  select id into s_full2 from public.class_sessions where starts_at > now() + interval '3 days' order by starts_at offset 4 limit 1;
  select id into s_part  from public.class_sessions where starts_at > now() + interval '2 days' order by starts_at offset 2 limit 1;

  -- Full class #1 with a waitlist
  insert into public.bookings (session_id, profile_id, status, paid_with, credit_lot_id, confirmed_at) values (s_full1, c_elena, 'confirmed', 'credit', lot, now());
  insert into public.bookings (session_id, profile_id, status, paid_with, confirmed_at) values (s_full1, c_maria, 'confirmed', 'manual', now());
  insert into public.bookings (session_id, profile_id, status, paid_with, source, confirmed_at) values (s_full1, c_andria, 'confirmed', 'manual', 'manual', now());
  insert into public.waitlist_entries (session_id, profile_id, created_at) values (s_full1, c_sofia, now() - interval '2 hours');
  insert into public.waitlist_entries (session_id, profile_id, created_at) values (s_full1, c_niki, now() - interval '1 hour');

  -- Full class #2 with one on the waitlist
  insert into public.bookings (session_id, profile_id, status, paid_with, confirmed_at) values
    (s_full2, c_sofia, 'confirmed', 'manual', now()), (s_full2, c_christina, 'confirmed', 'manual', now()), (s_full2, c_niki, 'confirmed', 'manual', now());
  insert into public.waitlist_entries (session_id, profile_id) values (s_full2, c_andria);

  -- Partly booked class (1 of 3 left)
  insert into public.bookings (session_id, profile_id, status, paid_with, confirmed_at) values
    (s_part, c_christina, 'confirmed', 'manual', now()), (s_part, c_niki, 'confirmed', 'manual', now());

  -- A past class with check-ins
  insert into public.class_sessions (class_type_id, starts_at, ends_at, capacity)
    values (reformer, ((week_start - 3) + time '18:00') at time zone tz, ((week_start - 3) + time '18:50') at time zone tz, 3)
    returning id into s_past;
  insert into public.bookings (session_id, profile_id, status, paid_with, credit_lot_id, confirmed_at, checked_in_at) values
    (s_past, c_elena, 'confirmed', 'credit', lot, now() - interval '4 days', now() - interval '3 days');
  insert into public.bookings (session_id, profile_id, status, paid_with, confirmed_at, checked_in_at) values
    (s_past, c_maria, 'confirmed', 'manual', now() - interval '4 days', now() - interval '3 days'),
    (s_past, c_sofia, 'confirmed', 'manual', now() - interval '4 days', null);

  -- SUP Pilates on the beach (one-off event), the next Saturday at least 2 days away
  sup_day := today + ((6 - extract(isodow from today)::int + 7) % 7);
  if sup_day < today + 2 then sup_day := sup_day + 7; end if;
  insert into public.class_sessions (class_type_id, title, description, starts_at, ends_at, capacity, price_cents, location)
    values (event_type, 'SUP Pilates', 'Pilates on a paddle board at sunrise. Boards and paddles provided. No experience needed, just bring a towel and water.',
            (sup_day + time '08:30') at time zone tz, (sup_day + time '10:00') at time zone tz, 8, 3500,
            'Beach, Limassol (exact spot shared after booking)')
    returning id into s_sup;
  insert into public.bookings (session_id, profile_id, status, paid_with, confirmed_at) values
    (s_sup, c_elena, 'confirmed', 'manual', now()), (s_sup, c_sofia, 'confirmed', 'manual', now()),
    (s_sup, c_andria, 'confirmed', 'manual', now());
end $$;

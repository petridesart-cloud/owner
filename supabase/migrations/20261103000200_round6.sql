-- Her notes, round 6 (part 2): Packages page tabs, her real packages, Pre & Post Natal and Private
-- (set up but hidden until she shows them), private sessions, and her weekly timetable.

-- ── Packages page tabs ──────────────────────────────────────────────────────
-- What clients choose first after "Secure your package" (Mat, Reformer, Pre and Post Natal, Private);
-- each tab holds one or more class types' packages, trials and drop-ins. Hidden tabs are set up but not shown.
create table public.package_tabs (
  key text primary key,
  label text not null check (length(trim(label)) between 1 and 60),
  note text,
  sort int not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.package_tabs enable row level security;
create policy "public read package tabs" on public.package_tabs for select to anon, authenticated using (true);
revoke insert, update, delete on public.package_tabs from anon, authenticated;

insert into public.package_tabs (key, label, sort, visible, note) values
  ('mat', 'Mat', 1, true, null),
  ('reformer', 'Reformer', 2, true, null),
  ('prenatal', 'Pre and Post Natal', 3, false, null),
  ('private', 'Private', 4, false, 'Private sessions are arranged with you: once your package is paid, we''ll talk about the times that suit you best and book them for you. There are no open slots to book in the app.');

alter table public.credit_kinds
  add column tab text references public.package_tabs(key) on delete set null,
  add column sub_label text,
  add column description text;
update public.credit_kinds set tab = key, sort = case key when 'mat' then 1 when 'reformer' then 2 else sort end where key in ('mat', 'reformer');
-- Types she added herself (round 5) get a tab of their own.
insert into public.package_tabs (key, label, sort)
  select key, label, 10 + sort from public.credit_kinds where tab is null on conflict (key) do nothing;
update public.credit_kinds set tab = key where tab is null;

insert into public.credit_kinds (key, label, sort, tab, sub_label, description) values
  ('prenatal_mat', 'Pre & Post Natal Mat', 3, 'prenatal', 'Mat', null),
  ('prenatal_reformer', 'Pre & Post Natal Reformer', 4, 'prenatal', 'Reformer', null),
  ('private_mat', 'Private Mat', 5, 'private', 'Mat', null),
  ('private_reformer', 'Private Reformer', 6, 'private', 'Reformer', null),
  ('private_prenatal_mat', 'Private Pre & Post Natal Mat', 7, 'private', 'Pre & Post Natal · Mat',
   'Mat based exercises incorporating a variety of props, both within the exercises and separately, such as Pilates Ball, wall support and other equipment.'),
  ('private_prenatal_reformer', 'Private Pre & Post Natal Reformer', 8, 'private', 'Pre & Post Natal · Reformer based',
   'Primarily reformer based sessions, complemented by standing and seated exercises, as well as the use of props, depending on individual needs.')
on conflict (key) do nothing;

-- A new class type with its own packages also gets its own tab (she can move it in Settings).
create or replace function public.add_credit_kind(p_label text) returns text
language plpgsql security definer set search_path = public as $$
declare
  base text;
  k text;
  n int := 1;
begin
  if coalesce(trim(p_label), '') = '' then raise exception 'name_required' using errcode = 'P0001'; end if;
  base := left(trim(both '_' from regexp_replace(lower(trim(p_label)), '[^a-z0-9]+', '_', 'g')), 40);
  if base = '' then base := 'classes'; end if;
  k := base;
  while exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'credit_kind' and e.enumlabel = k)
     or exists (select 1 from public.credit_kinds where key = k)
     or exists (select 1 from public.package_tabs where key = k) loop
    n := n + 1;
    k := base || '_' || n;
  end loop;
  execute format('alter type public.credit_kind add value %L', k);
  insert into public.package_tabs (key, label, sort) values (k, trim(p_label), (select coalesce(max(sort), 0) + 1 from public.package_tabs));
  insert into public.credit_kinds (key, label, sort, tab) values (k, trim(p_label), (select coalesce(max(sort), 0) + 1 from public.credit_kinds), k);
  return k;
end $$;
revoke all on function public.add_credit_kind(text) from public, anon, authenticated;
grant execute on function public.add_credit_kind(text) to service_role;

-- ── Private sessions ────────────────────────────────────────────────────────
-- No open slots: never on the schedule and never booked online; she books them in by hand.
alter table public.class_types add column private boolean not null default false;

create or replace function public.guard_private_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  online boolean := true;
begin
  -- Waitlist entries are always the client's own; bookings only when made online.
  if tg_table_name = 'bookings' then online := (to_jsonb(new) ->> 'source') = 'online'; end if;
  if online and coalesce((select t.private from public.class_sessions s join public.class_types t on t.id = s.class_type_id where s.id = new.session_id), false) then
    raise exception 'private_class' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger bookings_private_manual_only before insert on public.bookings for each row execute function public.guard_private_booking();
create trigger waitlist_private_never before insert on public.waitlist_entries for each row execute function public.guard_private_booking();
revoke execute on function public.guard_private_booking() from public, anon, authenticated;

-- ── Her class types (Pre & Post Natal and Private) ─────────────────────────
insert into public.class_types (slug, name, kind, credit_kind, default_capacity, default_duration_minutes, price_cents, credit_cost, private, sort_order)
select v.slug, v.name, v.kind::public.class_kind, v.ck::public.credit_kind, v.cap, 50, 0, 1, v.priv, v.sort
from (values
  ('prenatal-mat', 'Pre & Post Natal Mat', 'mat', 'prenatal_mat', 8, false, 3),
  ('prenatal-reformer', 'Pre & Post Natal Reformer', 'reformer', 'prenatal_reformer', 3, false, 4),
  ('private-mat', 'Private Mat', 'mat', 'private_mat', 1, true, 5),
  ('private-reformer', 'Private Reformer', 'reformer', 'private_reformer', 1, true, 6),
  ('private-prenatal-mat', 'Private Pre & Post Natal Mat', 'mat', 'private_prenatal_mat', 1, true, 7),
  ('private-prenatal-reformer', 'Private Pre & Post Natal Reformer', 'reformer', 'private_prenatal_reformer', 1, true, 8)
) as v(slug, name, kind, ck, cap, priv, sort)
where not exists (select 1 from public.class_types where slug = v.slug);
update public.class_types set sort_order = 1 where slug = 'mat';
update public.class_types set sort_order = 2 where slug = 'reformer';

-- ── Her packages (her list, 3 Nov) ──────────────────────────────────────────
-- Packages she no longer sells come off sale (kept for anyone who already bought them).
update public.products set active = false, archived_at = now()
 where tag = 'package' and credit_kind in ('reformer', 'mat') and archived_at is null
   and not ((months = 1 and credits in (4, 8, 12)));

create function pg_temp.offer(p_kind text, p_label text, p_tag text, p_credits int, p_months int, p_price int, p_group boolean, p_sort int) returns void
language plpgsql as $$
begin
  if exists (select 1 from public.products where credit_kind::text = p_kind and tag = p_tag and archived_at is null
               and (p_tag <> 'package' or (credits = p_credits and months = p_months))) then
    update public.products set price_cents = p_price, active = true, sort_order = p_sort
     where credit_kind::text = p_kind and tag = p_tag and archived_at is null and (p_tag <> 'package' or (credits = p_credits and months = p_months));
    return;
  end if;
  insert into public.products (name, kind, tag, credit_kind, credits, months, validity_days, per_week, price_cents, is_group, active, sort_order)
  values (
    case p_tag when 'package' then p_label || ' · ' || p_credits || ' class' || case when p_credits = 1 then '' else 'es' end || ' · ' || p_months || ' month' || case when p_months = 1 then '' else 's' end
               when 'trial' then p_label || ' Trial' else p_label || ' Drop-in' end,
    (case when p_tag = 'package' then 'pack' else 'single' end)::public.product_kind, p_tag, p_kind::public.credit_kind,
    case when p_tag = 'package' then p_credits else 1 end,
    case when p_tag = 'package' then p_months end,
    case when p_tag = 'package' then 30 * p_months end,
    case when p_tag = 'package' then greatest(1, least(7, round(p_credits / (4.0 * p_months))::int)) end,
    p_price, p_group, true, p_sort);
end $$;

select pg_temp.offer('mat', 'Mat', 'package', 4, 1, 5000, true, 101), pg_temp.offer('mat', 'Mat', 'package', 8, 1, 9000, true, 102),
       pg_temp.offer('mat', 'Mat', 'package', 12, 1, 12000, true, 103), pg_temp.offer('mat', 'Mat', 'package', 4, 2, 8500, true, 104),
       pg_temp.offer('mat', 'Mat', 'package', 8, 2, 15000, true, 105), pg_temp.offer('mat', 'Mat', 'package', 12, 2, 20000, true, 106),
       pg_temp.offer('mat', 'Mat', 'trial', 1, 1, 2000, true, 107), pg_temp.offer('mat', 'Mat', 'drop_in', 1, 1, 3000, false, 108),
       pg_temp.offer('reformer', 'Reformer', 'package', 4, 1, 7000, true, 111), pg_temp.offer('reformer', 'Reformer', 'package', 8, 1, 13000, true, 112),
       pg_temp.offer('reformer', 'Reformer', 'package', 12, 1, 18000, true, 113), pg_temp.offer('reformer', 'Reformer', 'package', 4, 2, 12000, true, 114),
       pg_temp.offer('reformer', 'Reformer', 'package', 8, 2, 23000, true, 115), pg_temp.offer('reformer', 'Reformer', 'package', 12, 2, 30000, true, 116),
       pg_temp.offer('reformer', 'Reformer', 'trial', 1, 1, 2500, true, 117), pg_temp.offer('reformer', 'Reformer', 'drop_in', 1, 1, 3500, false, 118),
       pg_temp.offer('prenatal_mat', 'Pre & Post Natal Mat', 'package', 4, 1, 5000, true, 121), pg_temp.offer('prenatal_mat', 'Pre & Post Natal Mat', 'package', 8, 1, 9000, true, 122),
       pg_temp.offer('prenatal_mat', 'Pre & Post Natal Mat', 'trial', 1, 1, 2000, true, 123), pg_temp.offer('prenatal_mat', 'Pre & Post Natal Mat', 'drop_in', 1, 1, 3000, false, 124),
       pg_temp.offer('prenatal_reformer', 'Pre & Post Natal Reformer', 'package', 4, 1, 7000, true, 125), pg_temp.offer('prenatal_reformer', 'Pre & Post Natal Reformer', 'package', 8, 1, 13000, true, 126),
       pg_temp.offer('prenatal_reformer', 'Pre & Post Natal Reformer', 'trial', 1, 1, 2500, true, 127), pg_temp.offer('prenatal_reformer', 'Pre & Post Natal Reformer', 'drop_in', 1, 1, 3500, false, 128),
       pg_temp.offer('private_mat', 'Private Mat', 'package', 1, 1, 4000, false, 131), pg_temp.offer('private_mat', 'Private Mat', 'package', 4, 1, 14000, false, 132),
       pg_temp.offer('private_mat', 'Private Mat', 'package', 8, 1, 24000, false, 133),
       pg_temp.offer('private_reformer', 'Private Reformer', 'package', 1, 1, 5000, false, 134), pg_temp.offer('private_reformer', 'Private Reformer', 'package', 4, 1, 18000, false, 135),
       pg_temp.offer('private_reformer', 'Private Reformer', 'package', 8, 1, 32000, false, 136),
       pg_temp.offer('private_prenatal_mat', 'Private Pre & Post Natal Mat', 'package', 1, 1, 4000, false, 137), pg_temp.offer('private_prenatal_mat', 'Private Pre & Post Natal Mat', 'package', 4, 1, 14000, false, 138),
       pg_temp.offer('private_prenatal_mat', 'Private Pre & Post Natal Mat', 'package', 8, 1, 24000, false, 139),
       pg_temp.offer('private_prenatal_reformer', 'Private Pre & Post Natal Reformer', 'package', 1, 1, 5000, false, 140), pg_temp.offer('private_prenatal_reformer', 'Private Pre & Post Natal Reformer', 'package', 4, 1, 18000, false, 141),
       pg_temp.offer('private_prenatal_reformer', 'Private Pre & Post Natal Reformer', 'package', 8, 1, 32000, false, 142);

-- ── Classes open as far ahead as she lets clients book ─────────────────────
-- The repeating timetable is topped up to at least 2 weeks beyond the booking window (never less than 9 weeks).
create or replace function public.extend_timetable(p_days int default 63) returns int
language plpgsql security definer set search_path = public as $$
declare
  t public.timetable_templates;
  cfg public.studio_settings := public.settings();
  horizon date := (now() at time zone cfg.timezone)::date + greatest(p_days, cfg.booking_window_days + 14);
begin
  select * into t from public.timetable_templates where repeats order by created_at desc limit 1;
  if not found or t.valid_to >= horizon then return 0; end if;
  update public.timetable_templates set valid_to = horizon where id = t.id;
  return public.generate_sessions_range(t.id, t.valid_to + 1, horizon);  -- only the new days
end $$;
revoke execute on function public.extend_timetable(int) from public, anon, authenticated;
grant execute on function public.extend_timetable(int) to service_role;

-- ── Her weekly timetable (her list, 3 Nov) ──────────────────────────────────
-- Only on the real studio app (scripts/migrate.mjs sets app.env) and only if it has no timetable yet;
-- the demo and local databases keep their practice timetable.
do $$
declare
  tz text := (public.settings()).timezone;
  today date := (now() at time zone tz)::date;
  tpl uuid;
  r uuid := (select id from public.class_types where slug = 'reformer');
  m uuid := (select id from public.class_types where slug = 'mat');
begin
  if coalesce(current_setting('app.env', true), '') <> 'production' then return; end if;
  if exists (select 1 from public.timetable_templates) or r is null or m is null then return; end if;
  insert into public.timetable_templates (name, valid_from, valid_to, repeats) values ('Weekly timetable', today, today + 63, true) returning id into tpl;
  insert into public.template_slots (template_id, weekday, start_time, class_type_id)
  select tpl, v.wd, v.t::time, case v.k when 'r' then r else m end
  from (values
    (1, '08:00', 'r'), (1, '09:00', 'r'), (1, '16:30', 'm'), (1, '17:30', 'r'), (1, '18:30', 'r'), (1, '19:30', 'r'),
    (2, '07:00', 'r'), (2, '08:00', 'r'), (2, '09:00', 'm'), (2, '16:00', 'r'), (2, '17:00', 'r'), (2, '18:00', 'r'), (2, '19:00', 'r'),
    (3, '07:30', 'r'), (3, '08:30', 'r'), (3, '09:30', 'm'), (3, '16:00', 'r'), (3, '17:00', 'r'),
    (4, '08:00', 'r'), (4, '09:00', 'r'), (4, '16:30', 'm'), (4, '17:30', 'r'), (4, '18:30', 'r'), (4, '19:30', 'r'),
    (5, '07:00', 'm'), (5, '08:00', 'r'), (5, '09:00', 'm'), (5, '16:00', 'r'), (5, '17:00', 'r'), (5, '18:00', 'r'), (5, '19:00', 'r'),
    (6, '08:00', 'r')
  ) as v(wd, t, k);
  perform public.generate_sessions(tpl);
end $$;

-- Her notes, round 5.

-- ── Class types and offers she builds herself ───────────────────────────────
-- What a package / trial / drop-in is "for": Reformer, Mat, and any class type she adds with its own
-- packages (e.g. "Pre and post natal"). The key is a value of the credit_kind enum, so every booking
-- rule keeps working unchanged; the label is what clients and she see.
create table public.credit_kinds (
  key text primary key,
  label text not null check (length(trim(label)) between 1 and 60),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
insert into public.credit_kinds (key, label, sort) values ('reformer', 'Reformer', 1), ('mat', 'Mat', 2);
alter table public.credit_kinds enable row level security;
create policy "public read credit kinds" on public.credit_kinds for select to anon, authenticated using (true);
revoke insert, update, delete on public.credit_kinds from anon, authenticated;

-- A new "for": adds the enum value (usable from the next statement/request) and its label.
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
     or exists (select 1 from public.credit_kinds where key = k) loop
    n := n + 1;
    k := base || '_' || n;
  end loop;
  execute format('alter type public.credit_kind add value %L', k);
  insert into public.credit_kinds (key, label, sort) values (k, trim(p_label), (select coalesce(max(sort), 0) + 1 from public.credit_kinds));
  return k;
end $$;
revoke all on function public.add_credit_kind(text) from public, anon, authenticated;
grant execute on function public.add_credit_kind(text) to service_role;

-- Class types that aren't reformer, mat or an event (e.g. pre-natal on its own packages).
alter type public.class_kind add value if not exists 'other';

-- Delete without breaking history: rows already used by payments / classes are archived instead.
alter table public.products add column archived_at timestamptz;
alter table public.class_types add column archived_at timestamptz;

-- ── Codes: what they apply to ───────────────────────────────────────────────
alter table public.discount_codes add column applies_to text[] not null default '{package}'
  check (applies_to <@ array['package', 'trial', 'drop_in', 'event']::text[] and cardinality(applies_to) > 0);

-- ── Event title font (her note) ─────────────────────────────────────────────
alter table public.class_sessions add column title_font text
  check (title_font in ('calligraphy', 'handwritten', 'minimal', 'simple', 'elegant', 'bold'));

-- ── Studio emails ───────────────────────────────────────────────────────────
alter table public.studio_settings
  add column alert_email text,
  add column alert_bookings boolean not null default true,
  add column alert_signups boolean not null default true,
  add column alert_cancellations boolean not null default true,
  add column alert_requests boolean not null default true,
  add column alert_details boolean not null default true;

-- ── Her texts: the Terms can be edited too ──────────────────────────────────
alter table public.site_content drop constraint site_content_key_check;
alter table public.site_content add constraint site_content_key_check
  check (key in ('studio_rules', 'payments_policy', 'what_to_bring', 'magic_text', 'studio_text', 'events_intro', 'terms'));

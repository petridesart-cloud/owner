-- Re·Form Pilates — core schema
-- All timestamps are timestamptz (stored UTC). Display timezone lives in studio_settings.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('client', 'admin');
create type public.class_kind as enum ('reformer', 'mat', 'event');
create type public.credit_kind as enum ('reformer', 'mat');
create type public.session_status as enum ('scheduled', 'cancelled');
create type public.booking_status as enum (
  'held',          -- spot reserved while the client pays
  'confirmed',
  'cancelled',     -- cancelled before the cutoff (credit returned)
  'late_cancelled',-- cancelled inside the cutoff (spot released, no refund by default)
  'studio_cancelled',
  'expired',       -- hold ran out before payment
  'no_show'
);
create type public.booking_source as enum ('online', 'manual');
create type public.paid_with as enum ('payment', 'credit', 'manual', 'free');
create type public.waitlist_status as enum ('waiting', 'offered', 'claimed', 'expired', 'left', 'cancelled');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded', 'needs_refund', 'cancelled');
create type public.product_kind as enum ('single', 'pack');
create type public.notification_channel as enum ('email', 'sms');
create type public.notification_status as enum ('logged', 'sent', 'failed');
create type public.consent_type as enum ('policy', 'terms', 'health_data', 'fitness_declaration', 'marketing_email', 'marketing_sms');

-- ---------------------------------------------------------------------------
-- Studio settings (single row, id = 1)
-- ---------------------------------------------------------------------------
create table public.studio_settings (
  id smallint primary key default 1 check (id = 1),
  studio_name text not null default 'Re·Form Pilates Studio',
  timezone text not null default 'Europe/Nicosia',
  currency text not null default 'EUR',
  cancellation_cutoff_hours int not null default 12 check (cancellation_cutoff_hours between 0 and 168),
  waitlist_window_minutes int not null default 120 check (waitlist_window_minutes between 5 and 1440),
  hold_minutes int not null default 10 check (hold_minutes between 2 and 60),
  reminder_offsets_minutes int[] not null default '{1440,120}',
  refund_late_cancel_if_filled boolean not null default false,
  vat_registered boolean not null default false,
  vat_rate numeric(5,2) not null default 19.00,
  -- Business details (placeholders until filled in by the studio)
  legal_name text not null default '[Legal business name]',
  address text not null default '[Street, Limassol, Cyprus]',
  registration_number text not null default '[Registration no.]',
  vat_number text not null default '[VAT no.]',
  contact_email text not null default 'hello@example.com',
  contact_phone text not null default '+357 00 000000',
  instagram_handle text not null default 're_form_es',
  map_url text not null default 'https://maps.google.com/?q=Limassol,Cyprus',
  intro_line text not null default 'Reformer & Mat Pilates in Limassol. Small classes, three reformers, all the attention.',
  policy_version text not null default '2026-10-v1',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null, -- null for DM/manual clients who never logged in
  full_name text,
  email text,
  phone text,
  role public.user_role not null default 'client',
  admin_notes text,                -- instructor-only free text
  marketing_email boolean not null default false,
  marketing_sms boolean not null default false,
  onboarded_at timestamptz,        -- set once name/phone/consents are collected
  deleted_at timestamptz,          -- erasure (record kept minimal for accounting)
  created_at timestamptz not null default now()
);
create unique index profiles_email_unique on public.profiles (lower(email)) where email is not null and deleted_at is null;
create index profiles_phone_idx on public.profiles (phone);

-- Special-category data (GDPR art. 9): separate table, owner + admin only.
create table public.health_notes (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  note text not null,
  consent_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table public.consents (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type public.consent_type not null,
  granted boolean not null,
  version text,
  created_at timestamptz not null default now()
);
create index consents_profile_idx on public.consents (profile_id, type, created_at desc);

-- ---------------------------------------------------------------------------
-- Classes
-- ---------------------------------------------------------------------------
create table public.class_types (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  kind public.class_kind not null,
  credit_kind public.credit_kind,  -- null = pay per class only (events)
  description text,
  default_capacity int not null check (default_capacity between 1 and 100),
  default_duration_minutes int not null default 50 check (default_duration_minutes between 10 and 600),
  price_cents int not null check (price_cents >= 0),
  default_location text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.timetable_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  valid_from date not null,
  valid_to date not null,
  created_at timestamptz not null default now(),
  check (valid_to >= valid_from)
);

create table public.template_slots (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.timetable_templates(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- ISO: 1 = Monday
  start_time time not null,                                   -- studio local time
  class_type_id uuid not null references public.class_types(id),
  capacity int check (capacity between 1 and 100),
  duration_minutes int check (duration_minutes between 10 and 600),
  unique (template_id, weekday, start_time)
);

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_type_id uuid not null references public.class_types(id),
  template_id uuid references public.timetable_templates(id) on delete set null,
  title text,                      -- overrides type name (e.g. "SUP Pilates at Dasoudi")
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int not null check (capacity between 1 and 100),
  price_cents int,                 -- overrides type price
  location text,
  status public.session_status not null default 'scheduled',
  cancelled_reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index class_sessions_starts_idx on public.class_sessions (starts_at);
create unique index class_sessions_no_dupe on public.class_sessions (class_type_id, starts_at) where status = 'scheduled';

-- ---------------------------------------------------------------------------
-- Commerce
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind public.product_kind not null,
  credit_kind public.credit_kind,
  credits int not null default 1 check (credits > 0),
  price_cents int not null check (price_cents >= 0),
  validity_days int check (validity_days > 0),
  active boolean not null default true,
  sort_order int not null default 0
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  provider text not null,          -- 'stripe' | 'viva' | 'mock'
  provider_ref text,               -- checkout session id etc.
  amount_cents int not null,
  vat_cents int not null default 0,
  currency text not null default 'EUR',
  status public.payment_status not null default 'pending',
  purpose text not null check (purpose in ('booking', 'pack')),
  product_id uuid references public.products(id),
  description text not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create unique index payments_provider_ref on public.payments (provider, provider_ref) where provider_ref is not null;

create table public.credit_lots (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  credit_kind public.credit_kind not null,
  total int not null check (total > 0),
  remaining int not null check (remaining >= 0),
  expires_at timestamptz,
  payment_id uuid references public.payments(id),
  note text,
  created_at timestamptz not null default now(),
  check (remaining <= total)
);
create index credit_lots_profile_idx on public.credit_lots (profile_id, credit_kind);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status public.booking_status not null,
  source public.booking_source not null default 'online',
  paid_with public.paid_with,
  credit_lot_id uuid references public.credit_lots(id),
  payment_id uuid references public.payments(id),
  hold_expires_at timestamptz,
  checked_in_at timestamptz,
  cancelled_at timestamptz,
  late_refund_pending boolean not null default false,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
-- One live booking per client per class.
create unique index bookings_one_active on public.bookings (session_id, profile_id) where status in ('held', 'confirmed');
create index bookings_session_idx on public.bookings (session_id, status);
create index bookings_profile_idx on public.bookings (profile_id);

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  lot_id uuid references public.credit_lots(id) on delete set null,
  credit_kind public.credit_kind not null,
  delta int not null,
  reason text not null,            -- purchase | booking | cancel_refund | studio_cancel | late_fill_refund | admin_adjust
  booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.payments add column booking_id uuid references public.bookings(id) on delete set null;

create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status public.waitlist_status not null default 'waiting',
  offered_at timestamptz,
  offer_expires_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index waitlist_one_active on public.waitlist_entries (session_id, profile_id) where status in ('waiting', 'offered');
create index waitlist_session_idx on public.waitlist_entries (session_id, status, created_at);

-- ---------------------------------------------------------------------------
-- Messaging, auth helpers, audit
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  channel public.notification_channel not null,
  template text not null,
  recipient text not null,
  subject text,
  body text not null,
  status public.notification_status not null,
  provider_ref text,
  error text,
  dedupe_key text unique,          -- e.g. reminder:1440:<booking id>
  booking_id uuid references public.bookings(id) on delete set null,
  session_id uuid references public.class_sessions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index notifications_created_idx on public.notifications (created_at desc);

create table public.otp_requests (
  id bigint generated always as identity primary key,
  email_hash text not null,        -- sha256 of lower(email); no raw PII in the rate-limit log
  ip_hash text,
  created_at timestamptz not null default now()
);
create index otp_requests_email_idx on public.otp_requests (email_hash, created_at desc);
create index otp_requests_ip_idx on public.otp_requests (ip_hash, created_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create table public.compliance_items (
  key text primary key,
  done boolean not null default false,
  note text,
  updated_at timestamptz not null default now()
);

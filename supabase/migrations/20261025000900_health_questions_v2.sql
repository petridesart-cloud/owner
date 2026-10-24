-- Health questions v2 (Elysia's notes, round 2): tick what applies, then details,
-- pregnancy follow-up, blood-pressure/heart medication. Health data: stored only with
-- explicit consent, instructor-only (existing RLS on health_notes).
alter table public.health_notes
  add column conditions text[],
  add column details text,
  add column pregnancy text check (pregnancy in ('current', 'past')),
  add column pregnancy_weeks int check (pregnancy_weeks between 1 and 45),
  add column postpartum_months int check (postpartum_months between 0 and 240),
  add column bp_meds boolean,
  add column clearance_needed boolean not null default false,
  add column clearance_received_at date;
-- profiles.parq_completed_at now means "health questions answered".
comment on column public.profiles.parq_completed_at is 'When the client last answered the health questions';

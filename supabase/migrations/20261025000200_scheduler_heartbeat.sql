-- Heartbeat for the 5-minute scheduler (pg_cron → /api/cron/tick, set up by scripts/migrate.mjs).
-- The studio app shows "last ran N minutes ago" and warns when it stops.
alter table public.studio_settings
  add column last_tick_at timestamptz,
  add column last_cron_tick_at timestamptz;

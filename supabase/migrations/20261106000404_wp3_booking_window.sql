-- WP3 (A-035): the booking window can be up to 26 weeks, as the Settings form allows.

-- ── A-035: up to 26 weeks ahead (the Settings form allows 1–26 weeks) ───────────────────
alter table public.studio_settings drop constraint if exists studio_settings_booking_window_days_check;
alter table public.studio_settings add constraint studio_settings_booking_window_days_check
  check (booking_window_days between 7 and 182);

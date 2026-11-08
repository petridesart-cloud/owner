-- Her note (8 Nov): a new client's first Home says "Welcome, name"; from the next visit on, "Welcome back, name".
-- Existing clients have been here before, so they keep "Welcome back".
alter table public.profiles add column if not exists home_seen_at timestamptz;
update public.profiles set home_seen_at = coalesce(onboarded_at, created_at, now()) where home_seen_at is null;

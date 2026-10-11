-- Texts the studio edits herself (Admin → Settings → Texts). Missing keys fall back
-- to the defaults in src/lib/policy.ts.
create table public.site_content (
  key text primary key check (key in ('studio_rules', 'payments_policy', 'what_to_bring', 'magic_text', 'studio_text')),
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.site_content enable row level security;
create policy "public read site content" on public.site_content for select to anon, authenticated using (true);
revoke insert, update, delete on public.site_content from anon, authenticated;

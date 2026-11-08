-- Owner's request (8 Nov): Elysia can edit the Health & Safety acknowledgement in Your texts, like the Terms.
-- Saved only when she changes it; empty goes back to the default that follows her settings.
alter table public.site_content drop constraint site_content_key_check;
alter table public.site_content add constraint site_content_key_check
  check (key in ('studio_rules', 'payments_policy', 'what_to_bring', 'magic_text', 'studio_text', 'events_intro', 'terms', 'waiver'));

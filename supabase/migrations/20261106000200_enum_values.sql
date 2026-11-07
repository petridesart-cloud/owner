-- Hardening pass: new enum values, in their own migration so later files can use them
-- (Postgres can't use a value added in the same transaction).
-- consent_type:
--   health_declaration_offline: the client chose to tell the instructor in person (A-001)
--   waiver, studio_rules, payments_policy, early_start: acceptance records for the legal documents (WP8)
alter type public.consent_type add value if not exists 'health_declaration_offline';
alter type public.consent_type add value if not exists 'waiver';
alter type public.consent_type add value if not exists 'studio_rules';
alter type public.consent_type add value if not exists 'payments_policy';
alter type public.consent_type add value if not exists 'early_start';

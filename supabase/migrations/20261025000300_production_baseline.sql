-- Baseline every database needs, demo or real: settings row, the three class types,
-- her packages and the launch checklist. The real (production) app gets only this;
-- demo data stays in seed_demo(). Idempotent.
create or replace function public.install_baseline() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.studio_settings (id) values (1) on conflict do nothing;
  insert into public.class_types (slug, name, kind, credit_kind, description, default_capacity, default_duration_minutes, price_cents, default_location, sort_order) values
    ('reformer', 'Reformer Pilates', 'reformer', 'reformer',
     'Three reformers, one instructor. Strength, control and length, at your pace.', 3, 50, 3500, 'Re·Form Studio, Limassol', 1),
    ('mat', 'Mat Pilates', 'mat', 'mat',
     'Classical mat work for core, posture and breath. Mats and props provided.', 8, 50, 3000, 'Re·Form Studio, Limassol', 2),
    ('event', 'Special Event', 'event', null, 'One-off experiences outside the studio.', 8, 90, 3500, null, 3)
  on conflict (slug) do nothing;
  perform public.install_catalogue();
  insert into public.compliance_items (key) values
    ('privacy_policy_reviewed'), ('terms_reviewed'), ('cancellation_policy_reviewed'), ('withdrawal_right_confirmed'),
    ('health_disclaimer_reviewed'), ('business_details_filled'), ('cookie_policy_reviewed'), ('no_nonessential_cookies'),
    ('health_consent_flow_tested'), ('data_export_tested'), ('account_deletion_tested'), ('consent_log_verified'),
    ('marketing_opt_in_only'), ('dpa_supabase'), ('dpa_stripe'), ('dpa_resend'), ('dpa_twilio'), ('dpa_vercel'),
    ('supabase_eu_region'), ('supabase_backups_enabled'), ('rls_verified'), ('admin_roles_verified'), ('otp_rate_limit_verified'),
    ('https_only'), ('demo_mode_off'), ('stripe_live_keys'), ('apple_pay_domain_verified'), ('contrast_checked'),
    ('keyboard_screenreader_tested'), ('reduced_motion_tested'), ('alt_text_reviewed'), ('photos_permission'),
    ('no_unsupported_claims'), ('fonts_licensed'), ('retention_job_scheduled'),
    ('pay_registered_self_employed'), ('pay_vat_position_confirmed'), ('pay_bank_stripe_verified'),
    ('pay_legal_texts_reviewed'), ('pay_liability_insurance')
  on conflict do nothing;
end $$;

select public.install_baseline();

revoke execute on function public.install_baseline() from public, anon, authenticated;
grant execute on function public.install_baseline() to service_role;

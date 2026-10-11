-- Site-wide status banner and the "before online payments" checklist items.
alter table public.studio_settings add column status_banner text not null default '';

insert into public.compliance_items (key) values
  ('pay_registered_self_employed'), ('pay_vat_position_confirmed'), ('pay_bank_stripe_verified'),
  ('pay_legal_texts_reviewed'), ('pay_liability_insurance')
on conflict do nothing;

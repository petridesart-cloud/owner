-- Her notes, round 6 (part 1): what her Pre & Post Natal and Private packages are "for".
-- New enum values must be committed before they're used, so they get their own migration.
alter type public.credit_kind add value if not exists 'prenatal_mat';
alter type public.credit_kind add value if not exists 'prenatal_reformer';
alter type public.credit_kind add value if not exists 'private_mat';
alter type public.credit_kind add value if not exists 'private_reformer';
alter type public.credit_kind add value if not exists 'private_prenatal_mat';
alter type public.credit_kind add value if not exists 'private_prenatal_reformer';

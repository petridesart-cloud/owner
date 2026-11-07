-- WP8 (A-009, A-060): versioned legal documents and acceptance records.
-- policy_versions keeps every wording a client could accept or read (one row per distinct text of each doc);
-- record_policy_version() returns the current row for a text, adding a new version only when the text changed.
-- Sign-up and welcome record one consents row per accepted document, pointing at the exact version, and no
-- longer record a "fitness declaration" nobody made (A-060). Payments remember the Terms they were made under.

create table public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  doc text not null check (doc in ('terms', 'studio_rules', 'payments_policy', 'waiver', 'privacy', 'cookies')),
  version int not null check (version > 0),
  sha256 text not null,
  body text not null,
  created_at timestamptz not null default now(),
  unique (doc, version),
  unique (doc, sha256)
);
comment on table public.policy_versions is 'Every version of each legal text (A-009). Server-only; never edited or deleted.';
alter table public.policy_versions enable row level security;
revoke all on table public.policy_versions from public, anon, authenticated;

create or replace function public.guard_policy_versions() returns trigger
language plpgsql as $$
begin
  raise exception 'policy_versions_append_only' using errcode = 'P0001';
end $$;
create trigger policy_versions_append_only before update or delete on public.policy_versions
  for each row execute function public.guard_policy_versions();

alter table public.consents add column doc_version_id uuid references public.policy_versions(id);
alter table public.payments add column terms_version_id uuid references public.policy_versions(id),
                            add column accepted_terms_at timestamptz;
create index consents_doc_version_idx on public.consents (doc_version_id) where doc_version_id is not null;
create index payments_terms_version_idx on public.payments (terms_version_id) where terms_version_id is not null;

create or replace function public.record_policy_version(p_doc text, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  h text := encode(sha256(convert_to(coalesce(p_body, ''), 'UTF8')), 'hex');
  v public.policy_versions;
begin
  if coalesce(trim(p_body), '') = '' then raise exception 'empty_policy' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('policy_versions:' || p_doc));
  select * into v from public.policy_versions where doc = p_doc and sha256 = h;
  if not found then
    insert into public.policy_versions (doc, version, sha256, body)
    values (p_doc, coalesce((select max(version) from public.policy_versions where doc = p_doc), 0) + 1, h, p_body)
    returning * into v;
  end if;
  return jsonb_build_object('id', v.id, 'doc', v.doc, 'version', v.version, 'created_at', v.created_at);
end $$;
revoke all on function public.record_policy_version(text, text) from public, anon, authenticated;
grant execute on function public.record_policy_version(text, text) to service_role;

-- onboard_profile v3: p_docs = [{ "doc": "terms", "id": "<policy_versions.id>" }, …], one per accepted document.
drop function if exists public.onboard_profile(uuid, text, text, text, text, date, text, text, boolean, text);
create or replace function public.onboard_profile(
  p_profile uuid, p_first text, p_last text, p_full text, p_phone text, p_dob date, p_email text,
  p_photo text, p_marketing boolean, p_version text, p_docs jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  d record;
  n int := 0;
begin
  update public.profiles set first_name = p_first, last_name = p_last, full_name = p_full, phone = p_phone,
         date_of_birth = p_dob, email = lower(p_email), photo_consent = p_photo, marketing_email = p_marketing,
         marketing_sms = false, onboarded_at = now()
   where id = p_profile and deleted_at is null;
  if not found then raise exception 'profile_not_found' using errcode = 'P0001'; end if;

  for d in select pv.id, pv.doc, pv.version
             from jsonb_array_elements(coalesce(p_docs, '[]'::jsonb)) x
             join public.policy_versions pv on pv.id = (x->>'id')::uuid and pv.doc = x->>'doc'
            where pv.doc in ('terms', 'studio_rules', 'payments_policy', 'waiver')
  loop
    insert into public.consents (profile_id, type, granted, version, doc_version_id)
    values (p_profile, d.doc::public.consent_type, true, d.doc || ' v' || d.version, d.id);
    n := n + 1;
  end loop;
  if n < 4 then raise exception 'documents_not_accepted' using errcode = 'P0001'; end if;

  insert into public.consents (profile_id, type, granted, version) values (p_profile, 'marketing_email', p_marketing, p_version);
  if p_photo is not null then
    insert into public.consents (profile_id, type, granted, version) values (p_profile, 'photos', p_photo <> 'none', p_version || ':' || p_photo);
  end if;
end $$;
revoke all on function public.onboard_profile(uuid, text, text, text, text, date, text, text, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.onboard_profile(uuid, text, text, text, text, date, text, text, boolean, text, jsonb) to service_role;

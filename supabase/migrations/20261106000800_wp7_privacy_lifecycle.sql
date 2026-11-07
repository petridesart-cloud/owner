-- WP7: privacy lifecycle. Erasure that leaves nothing identifiable behind (A-010), the retention periods
-- the Privacy Policy promises, enforced once a day (A-011).

-- ── Who a message is about ───────────────────────────────────────────────────────────────
-- Studio alerts go to the studio (profile_id NULL) but name a client; erasing the client erases them too.
alter table public.notifications add column about_profile_id uuid references public.profiles(id) on delete set null;
update public.notifications set about_profile_id = profile_id where profile_id is not null and about_profile_id is null;
create index notifications_about_idx on public.notifications (about_profile_id) where about_profile_id is not null;

-- ── Retention settings (owner decisions, A-011) ─────────────────────────────────────────
-- Each period is a setting so the owner can change it; NULL switches that rule off.
alter table public.studio_settings
  add column last_retention_at timestamptz,
  add column retention_messages_months int default 12 check (retention_messages_months is null or retention_messages_months >= 1),
  add column retention_audit_months int default 24 check (retention_audit_months is null or retention_audit_months >= 1),
  add column retention_auth_log_days int default 90 check (retention_auth_log_days is null or retention_auth_log_days >= 1),
  add column retention_event_extras_months int default 3 check (retention_event_extras_months is null or retention_event_extras_months >= 1),
  add column retention_codes_months int default 12 check (retention_codes_months is null or retention_codes_months >= 1),
  add column retention_consents_years int default 3 check (retention_consents_years is null or retention_consents_years >= 1),
  add column retention_health_months int default 12 check (retention_health_months is null or retention_health_months >= 1),
  add column retention_inactive_months int default 24 check (retention_inactive_months is null or retention_inactive_months >= 1),
  add column retention_payments_years int default 6 check (retention_payments_years is null or retention_payments_years >= 1),
  add column retention_notice_days int not null default 30 check (retention_notice_days between 1 and 90);

-- When a client was told their health answers / account will be deleted (30 days' notice).
alter table public.profiles add column health_expiry_warned_at timestamptz, add column inactive_warned_at timestamptz;

-- ── Append-only ledger: two narrow exceptions ──────────────────────────────────────────
create or replace function public.ledger_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('reform.ledger_maintenance', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  -- Retention (A-011): entries past the accounting period are removed, only inside enforce_retention().
  if coalesce(current_setting('app.retention', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  -- Erasure (A-010): the free-text note may be cleared; nothing else may change.
  if tg_op = 'UPDATE' and coalesce(current_setting('app.erasing', true), '') = 'on'
     and new.note is null and (to_jsonb(new) - 'note') = (to_jsonb(old) - 'note') then
    return new;
  end if;
  raise exception 'credit_ledger is append-only';
end $$;

-- ── Right to erasure, v7 ───────────────────────────────────────────────────────────────
-- Returns {user_id, offers}: the caller deletes the login only after this succeeded, and tells the
-- waitlist people who were moved into the freed spots (like cancel_booking).
-- p_rate_keys: the app's keyed hashes of their email and profile id (rate_events can't be matched in SQL).
drop function if exists public.erase_profile(uuid);
create function public.erase_profile(p_profile uuid, p_rate_keys text[] default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  em text;
  ph text;
  nm text;
  sids uuid[];
  offers jsonb := '[]'::jsonb;
  sid uuid;
begin
  select user_id, nullif(lower(trim(email)), ''), nullif(trim(phone), ''), nullif(trim(full_name), '')
    into uid, em, ph, nm from public.profiles where id = p_profile and deleted_at is null for update;
  if not found then raise exception 'profile_not_found' using errcode = 'P0001'; end if;

  -- Their upcoming spots and live offers, locked in a fixed order, so the waitlist can move up below.
  select array_agg(distinct x.session_id order by x.session_id) into sids from (
    select b.session_id from public.bookings b join public.class_sessions s on s.id = b.session_id
     where b.profile_id = p_profile and b.status in ('held', 'confirmed') and s.starts_at > now()
    union
    select w.session_id from public.waitlist_entries w join public.class_sessions s on s.id = w.session_id
     where w.profile_id = p_profile and w.status = 'offered' and s.starts_at > now()
  ) x;
  perform 1 from public.class_sessions where id = any(coalesce(sids, '{}')) order by id for update;

  update public.bookings set status = 'cancelled', cancelled_at = now()
   where profile_id = p_profile and status in ('held', 'confirmed')
     and session_id in (select id from public.class_sessions where starts_at > now());
  update public.bookings set answer = null, note = null where profile_id = p_profile and (answer is not null or note is not null);
  update public.waitlist_entries set status = 'left' where profile_id = p_profile and status in ('waiting', 'offered');
  update public.payments set status = 'cancelled' where profile_id = p_profile and status = 'pending';
  delete from public.health_notes where profile_id = p_profile;
  delete from public.health_history where profile_id = p_profile;
  delete from public.event_access where profile_id = p_profile;
  delete from public.recurring_rules where profile_id = p_profile;
  delete from public.discount_codes where profile_id = p_profile;

  -- Free text the studio typed about them (may hold health words, e.g. "injury").
  update public.credit_lots set note = null where profile_id = p_profile and note is not null;
  update public.lot_freezes set reason = null
   where reason is not null and lot_id in (select id from public.credit_lots where profile_id = p_profile);
  perform set_config('app.erasing', 'on', true);
  update public.credit_ledger set note = null where profile_id = p_profile and note is not null;
  perform set_config('app.erasing', 'off', true);

  update public.profiles set full_name = 'Deleted client', first_name = null, last_name = null, email = null, phone = null,
         date_of_birth = null, parq_completed_at = null, goal = null, emergency_contact_name = null, emergency_contact_phone = null,
         emergency_contact_relation = null, photo_consent = null, health_mode = null, can_view_health = false, role = 'client',
         stripe_customer_id = null, student_verified_until = null, onboarded_at = null,
         health_expiry_warned_at = null, inactive_warned_at = null,
         admin_notes = null, marketing_email = false, marketing_sms = false, user_id = null, deleted_at = now()
   where id = p_profile;

  -- Messages to them, about them (studio alerts), or to their address or number; older studio alerts
  -- without about_profile_id are found by their email, phone or name in the text.
  update public.notifications set recipient = '[erased]', subject = case when subject is null then null else '[erased]' end,
         body = '[erased]', error = null, provider_ref = null
   where profile_id = p_profile or about_profile_id = p_profile
      or (em is not null and lower(recipient) = em)
      or (ph is not null and recipient = ph)
      or (template = 'studio_alert' and about_profile_id is null and (
            (em is not null and body ilike '%' || em || '%')
         or (ph is not null and body like '%' || ph || '%')
         or (nm is not null and length(nm) >= 5 and (subject ilike '%' || nm || '%' or body ilike '%' || nm || '%'))));

  if em is not null then
    delete from public.team_invites where email = em;
    delete from public.otp_requests where email_hash = encode(sha256(convert_to(em, 'UTF8')), 'hex'); -- legacy unkeyed rows
  end if;
  if p_rate_keys is not null then
    delete from public.rate_events where key_hash = any(p_rate_keys);
  end if;

  -- Supabase Auth's own log names the email. Best effort: a missing privilege must not stop the erasure.
  begin
    delete from auth.audit_log_entries
     where (uid is not null and payload->>'actor_id' = uid::text) or (em is not null and lower(payload->>'actor_username') = em);
  exception when insufficient_privilege or undefined_table then
    null;
  end;

  foreach sid in array coalesce(sids, '{}') loop
    offers := offers || coalesce((select jsonb_agg(to_jsonb(o)) from public.process_waitlist(sid) o), '[]'::jsonb);
  end loop;
  return jsonb_build_object('user_id', uid, 'offers', offers);
end $$;
revoke all on function public.erase_profile(uuid, text[]) from public, anon, authenticated;
grant execute on function public.erase_profile(uuid, text[]) to service_role;

-- ── Retention, once a day (A-011) ─────────────────────────────────────────────────────
-- Deletes or anonymises what has passed its period (settings above; NULL = rule off). Counts only go to
-- audit_log (no personal data). Returns {counts, warn_health, warn_inactive, erased_users}: the app emails
-- the 30-day notices and deletes the erased people's logins.
create or replace function public.enforce_retention(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cfg public.studio_settings;
  n int;
  counts jsonb := '{}'::jsonb;
  warn_health jsonb := '[]'::jsonb;
  warn_inactive jsonb := '[]'::jsonb;
  erased jsonb := '[]'::jsonb;
  res jsonb;
  pid uuid;
  cutoff timestamptz;
  notice interval;
begin
  select * into cfg from public.studio_settings where id = 1 for update;
  notice := make_interval(days => cfg.retention_notice_days);

  -- Abuse-prevention records: 1 day.
  delete from public.rate_events where created_at < p_now - interval '1 day';
  get diagnostics n = row_count; counts := counts || jsonb_build_object('rate_events', n);
  delete from public.otp_requests where created_at < p_now - interval '1 day';
  get diagnostics n = row_count; counts := counts || jsonb_build_object('otp_requests', n);

  -- Message log.
  if cfg.retention_messages_months is not null then
    delete from public.notifications where created_at < p_now - make_interval(months => cfg.retention_messages_months);
    get diagnostics n = row_count; counts := counts || jsonb_build_object('notifications', n);
  end if;

  -- The studio's audit log (the retention summaries themselves included).
  if cfg.retention_audit_months is not null then
    delete from public.audit_log where created_at < p_now - make_interval(months => cfg.retention_audit_months);
    get diagnostics n = row_count; counts := counts || jsonb_build_object('audit_log', n);
  end if;

  -- Supabase Auth's log (best effort, as in erase_profile).
  if cfg.retention_auth_log_days is not null then
    begin
      delete from auth.audit_log_entries where created_at < p_now - make_interval(days => cfg.retention_auth_log_days);
      get diagnostics n = row_count; counts := counts || jsonb_build_object('auth_audit_log', n);
    exception when insufficient_privilege or undefined_table then
      counts := counts || jsonb_build_object('auth_audit_log', 'skipped');
    end;
  end if;

  -- Event answers and booking notes, waitlist rows and event access: some months after the class.
  if cfg.retention_event_extras_months is not null then
    cutoff := p_now - make_interval(months => cfg.retention_event_extras_months);
    update public.bookings b set answer = null, note = null
      from public.class_sessions s where s.id = b.session_id and s.ends_at < cutoff and (b.answer is not null or b.note is not null);
    get diagnostics n = row_count; counts := counts || jsonb_build_object('booking_answers', n);
    delete from public.waitlist_entries w using public.class_sessions s where s.id = w.session_id and s.ends_at < cutoff;
    get diagnostics n = row_count; counts := counts || jsonb_build_object('waitlist_entries', n);
    delete from public.event_access a using public.class_sessions s where s.id = a.session_id and s.ends_at < cutoff;
    get diagnostics n = row_count; counts := counts || jsonb_build_object('event_access', n);
  end if;

  -- Personal rewards: some months after they were used up or ended.
  if cfg.retention_codes_months is not null then
    cutoff := p_now - make_interval(months => cfg.retention_codes_months);
    delete from public.discount_codes d
     where d.profile_id is not null
       and ((d.expires_on is not null and d.expires_on < cutoff::date)
         or (not d.active and d.created_at < cutoff)
         or exists (select 1 from public.payments p where p.discount_code_id = d.id and p.status = 'paid' and coalesce(p.paid_at, p.created_at) < cutoff))
       and not exists (select 1 from public.payments p where p.discount_code_id = d.id and p.status = 'pending');
    get diagnostics n = row_count; counts := counts || jsonb_build_object('personal_codes', n);
  end if;

  -- Consent records: kept as proof for some years after the account was erased.
  if cfg.retention_consents_years is not null then
    delete from public.consents c using public.profiles p
     where p.id = c.profile_id and p.deleted_at is not null and p.deleted_at < p_now - make_interval(years => cfg.retention_consents_years);
    get diagnostics n = row_count; counts := counts || jsonb_build_object('consents', n);
  end if;

  -- Health answers: some months after the last attended class (or the last time they answered), with notice.
  if cfg.retention_health_months is not null then
    cutoff := p_now - make_interval(months => cfg.retention_health_months);
    with last_seen as (
      select h.profile_id,
             greatest(h.updated_at, p.created_at, (select max(s.ends_at) from public.bookings b join public.class_sessions s on s.id = b.session_id
                                       where b.profile_id = h.profile_id and b.status = 'confirmed' and s.ends_at <= p_now)) as at,
             exists (select 1 from public.bookings b join public.class_sessions s on s.id = b.session_id
                      where b.profile_id = h.profile_id and b.status in ('held', 'confirmed') and s.starts_at > p_now) as upcoming,
             p.health_expiry_warned_at as warned
        from public.health_notes h join public.profiles p on p.id = h.profile_id
       where p.deleted_at is null
    ), due as (
      select * from last_seen where at < cutoff + notice and not upcoming
    ), gone as (
      -- Told at least the notice period ago, after they were last seen: delete.
      select profile_id from due where warned is not null and warned > at and warned <= p_now - notice and at < cutoff
    ), del as (
      delete from public.health_notes where profile_id in (select profile_id from gone) returning profile_id
    ), hist as (
      delete from public.health_history where profile_id in (select profile_id from gone) returning profile_id
    ), flags as (
      update public.profiles set parq_completed_at = null, health_mode = null, health_expiry_warned_at = null
       where id in (select profile_id from gone) returning id
    ), warn as (
      update public.profiles p set health_expiry_warned_at = p_now
        from due where p.id = due.profile_id and (due.warned is null or due.warned <= due.at)
      returning p.id, due.at
    )
    select (select count(*) from del), coalesce((select jsonb_agg(jsonb_build_object('profile_id', id, 'delete_on', greatest(at + make_interval(months => cfg.retention_health_months), p_now + notice))) from warn), '[]'::jsonb)
      into n, warn_health;
    counts := counts || jsonb_build_object('health_notes', n, 'health_warned', jsonb_array_length(warn_health));
  end if;

  -- Inactive clients: no booking, sign-in, payment or package for some months → erased, with notice.
  if cfg.retention_inactive_months is not null then
    cutoff := p_now - make_interval(months => cfg.retention_inactive_months);
    for pid, res in
      with activity as (
        select p.id, p.inactive_warned_at as warned, greatest(
                 p.created_at,
                 (select max(greatest(b.created_at, s.starts_at)) from public.bookings b join public.class_sessions s on s.id = b.session_id where b.profile_id = p.id),
                 (select max(coalesce(y.paid_at, y.created_at)) from public.payments y where y.profile_id = p.id),
                 (select max(u.last_sign_in_at) from auth.users u where u.id = p.user_id),
                 (select max(l.expires_at) from public.credit_lots l where l.profile_id = p.id and l.remaining > 0)) as at
          from public.profiles p
         where p.deleted_at is null and p.role = 'client'
           and not exists (select 1 from public.payments y where y.profile_id = p.id and y.status = 'pending')
           and not exists (select 1 from public.memberships m where m.profile_id = p.id and m.status in ('active', 'past_due', 'paused'))
      )
      select a.id, jsonb_build_object('warned', a.warned, 'at', a.at) from activity a where a.at < cutoff + notice
    loop
      if (res->>'warned') is not null and (res->>'warned')::timestamptz > (res->>'at')::timestamptz
         and (res->>'warned')::timestamptz <= p_now - notice and (res->>'at')::timestamptz < cutoff then
        erased := erased || jsonb_build_object('user_id', (public.erase_profile(pid))->'user_id');
      elsif (res->>'warned') is null or (res->>'warned')::timestamptz <= (res->>'at')::timestamptz then
        update public.profiles set inactive_warned_at = p_now where id = pid;
        warn_inactive := warn_inactive || jsonb_build_object('profile_id', pid,
          'delete_on', greatest((res->>'at')::timestamptz + make_interval(months => cfg.retention_inactive_months), p_now + notice));
      end if;
    end loop;
    counts := counts || jsonb_build_object('inactive_erased', jsonb_array_length(erased), 'inactive_warned', jsonb_array_length(warn_inactive));
  end if;

  -- Accounting records: some years after the end of the year they belong to.
  if cfg.retention_payments_years is not null then
    cutoff := date_trunc('year', p_now) - make_interval(years => cfg.retention_payments_years);
    perform set_config('app.retention', 'on', true);
    -- Bookings of classes before the cutoff (and their ledger entries), then old packages, then old payments.
    delete from public.credit_ledger g using public.bookings b, public.class_sessions s
     where g.booking_id = b.id and s.id = b.session_id and s.starts_at < cutoff;
    delete from public.bookings b using public.class_sessions s where s.id = b.session_id and s.starts_at < cutoff;
    get diagnostics n = row_count; counts := counts || jsonb_build_object('old_bookings', n);
    delete from public.credit_ledger g using public.credit_lots l
     where g.lot_id = l.id and l.created_at < cutoff and (l.remaining = 0 or (l.expires_at is not null and l.expires_at < cutoff))
       and not exists (select 1 from public.bookings b where b.credit_lot_id = l.id);
    delete from public.credit_lots l
     where l.created_at < cutoff and (l.remaining = 0 or (l.expires_at is not null and l.expires_at < cutoff))
       and not exists (select 1 from public.bookings b where b.credit_lot_id = l.id)
       and not exists (select 1 from public.credit_ledger g where g.lot_id = l.id);
    get diagnostics n = row_count; counts := counts || jsonb_build_object('old_packages', n);
    delete from public.payments y
     where coalesce(y.paid_at, y.created_at) < cutoff and y.status not in ('pending', 'needs_refund')
       and not exists (select 1 from public.bookings b where b.payment_id = y.id)
       and not exists (select 1 from public.credit_lots l where l.payment_id = y.id);
    get diagnostics n = row_count; counts := counts || jsonb_build_object('old_payments', n);
    perform set_config('app.retention', 'off', true);
  end if;

  update public.studio_settings set last_retention_at = p_now where id = 1;
  insert into public.audit_log (actor_profile_id, action, details) values (null, 'retention', counts);
  return jsonb_build_object('counts', counts, 'warn_health', warn_health, 'warn_inactive', warn_inactive, 'erased_users', erased);
end $$;
revoke all on function public.enforce_retention(timestamptz) from public, anon, authenticated;
grant execute on function public.enforce_retention(timestamptz) to service_role;

-- WP4 (A-015): failed emails/texts are retried with backoff instead of being lost behind their dedupe key.
--   attempts         sends tried so far (0 = only logged, demo / no provider)
--   next_attempt_at  when a failed row may be tried again; null = not retried (sent, given up, too late)

alter table public.notifications
  add column if not exists attempts int not null default 0,
  add column if not exists next_attempt_at timestamptz;

create index if not exists notifications_retry_idx on public.notifications (next_attempt_at) where status = 'failed';

-- Messages that are pointless (or wrong) once their moment has passed are never resent:
-- anything about a class that has started, and a waitlist offer that is no longer open.
create or replace function public.notification_stale(n public.notifications) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from public.class_sessions s where s.id = n.session_id and s.starts_at <= now())
      or (n.template = 'waitlist_offer' and not exists (
            select 1 from public.waitlist_entries w
            where w.session_id = n.session_id and w.profile_id = n.profile_id
              and w.status = 'offered' and w.offer_expires_at > now()));
$$;
revoke all on function public.notification_stale(public.notifications) from public, anon, authenticated;

-- notify() hit an existing dedupe key: take the row over if it failed and is due for a retry.
-- Only one caller can win (the row is updated with status = 'failed' in the WHERE clause).
create or replace function public.notification_reclaim(p_key text, p_subject text, p_body text)
returns table (id uuid, attempts int)
language sql volatile set search_path = public as $$
  update public.notifications n
     set status = 'logged', attempts = n.attempts + 1, next_attempt_at = null, error = null,
         subject = coalesce(p_subject, n.subject), body = p_body
   where n.dedupe_key = p_key and n.status = 'failed' and n.provider_ref is null
     and n.attempts < 5 and n.next_attempt_at is not null and n.next_attempt_at <= now()
     and not public.notification_stale(n)
  returning n.id, n.attempts;
$$;
revoke all on function public.notification_reclaim(text, text, text) from public, anon, authenticated;
grant execute on function public.notification_reclaim(text, text, text) to service_role;

-- The tick (or the Outbox "Send again" button with p_id) claims failed rows to resend.
-- Stale rows are given up first. Login / reset codes are never resent (their body isn't stored).
create or replace function public.notification_retry_claim(p_limit int default 20, p_id uuid default null)
returns setof public.notifications
language plpgsql volatile set search_path = public as $$
begin
  if p_id is null then
    update public.notifications n
       set next_attempt_at = null, error = left(coalesce(n.error, '') || ' · not resent: too late', 500)
     where n.status = 'failed' and n.next_attempt_at is not null and n.next_attempt_at <= now()
       and public.notification_stale(n);
  end if;
  return query
  update public.notifications n
     set status = 'logged', attempts = n.attempts + 1, next_attempt_at = null
   where n.id in (
     select c.id from public.notifications c
      where c.status = 'failed' and c.provider_ref is null
        and c.template not in ('login_code', 'verify_email', 'reset_code')
        and (case when p_id is null
                  then c.attempts < 5 and c.next_attempt_at is not null and c.next_attempt_at <= now()
                  else c.id = p_id end)
      order by c.next_attempt_at nulls last
      limit greatest(p_limit, 1)
      for update skip locked)
  returning n.*;
end $$;
revoke all on function public.notification_retry_claim(int, uuid) from public, anon, authenticated;
grant execute on function public.notification_retry_claim(int, uuid) to service_role;

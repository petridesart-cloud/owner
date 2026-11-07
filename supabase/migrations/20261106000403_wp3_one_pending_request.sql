-- WP3 (A-034): one pending package request per client and product.

-- ── A-034: one pending package request per client and product ──────────────────────────
-- Earlier double taps may have left duplicates: keep the oldest request, cancel the others (they granted nothing).
with dup as (
  select id, row_number() over (partition by profile_id, product_id order by created_at, id) as n
    from public.payments
   where status = 'pending' and provider = 'offline' and booking_id is null and product_id is not null
     and purpose in ('pack', 'membership')
), gone as (
  update public.payments set status = 'cancelled' where id in (select id from dup where n > 1) returning id
)
insert into public.audit_log (action, details)
select 'migration_duplicate_requests_cancelled', jsonb_build_object('count', count(*)) from gone having count(*) > 0;

create unique index if not exists payments_one_pending_request on public.payments (profile_id, product_id)
  where status = 'pending' and provider = 'offline' and booking_id is null and product_id is not null
    and purpose in ('pack', 'membership');

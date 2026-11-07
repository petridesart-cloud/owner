-- WP3 (A-037): a shared code's total limit holds under concurrency.

-- ── A-037: a shared code's total limit holds when several people use it at once ─────────
create or replace function public.guard_code_uses() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c public.discount_codes;
  n int;
begin
  if new.discount_code_id is null or new.status not in ('pending', 'paid') then return new; end if;
  if tg_op = 'UPDATE' and old.discount_code_id is not distinct from new.discount_code_id
     and old.status in ('pending', 'paid') then
    return new;  -- already counted
  end if;
  -- Lock the code: concurrent uses queue here, and the count below sees the ones that committed.
  select * into c from public.discount_codes where id = new.discount_code_id for update;
  if not found or not c.active then raise exception 'code_invalid' using errcode = 'P0001'; end if;
  if c.max_uses is not null then
    select count(*) into n from public.payments
     where discount_code_id = c.id and status in ('pending', 'paid') and id <> new.id;
    if n >= c.max_uses then raise exception 'code_used_up' using errcode = 'P0001'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_code_uses() from public, anon, authenticated;
drop trigger if exists payments_code_uses on public.payments;
create trigger payments_code_uses before insert or update of discount_code_id, status on public.payments
  for each row execute function public.guard_code_uses();

-- WP13 cleanup (A-069, A-084). Idempotent.

-- A-069: admin_adjust_credits was superseded by admin_adjust_lot (the app never calls it).
drop function if exists public.admin_adjust_credits(uuid, public.credit_kind, int, int, text, uuid);

-- A-069: cancel_booking without the dead free_cancel_until grace (her answer: there is no grace, the 6h rule applies).
-- The column stays in the schema (CLAUDE.md), unused. Same behaviour as v4.
create or replace function public.cancel_booking(p_booking uuid, p_profile uuid, p_admin boolean default false,
                                                 p_return_credit boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  s public.class_sessions;
  cfg public.studio_settings := public.settings();
  late boolean;
  result text;
begin
  select * into b from public.bookings where id = p_booking;
  if not found or (not p_admin and b.profile_id <> p_profile) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select * into s from public.class_sessions where id = b.session_id for update;
  select * into b from public.bookings where id = p_booking for update;

  if b.status = 'held' then
    update public.bookings set status = 'expired', cancelled_at = now() where id = b.id;
    result := 'released';
  else
    if b.status <> 'confirmed' then raise exception 'not_cancellable' using errcode = 'P0001'; end if;
    -- Events can't be cancelled by clients (the studio can still remove someone).
    if not p_admin and exists (select 1 from public.class_types t where t.id = s.class_type_id and t.kind = 'event') then
      raise exception 'event_no_cancel' using errcode = 'P0001';
    end if;
    if s.starts_at <= now() and not p_admin then raise exception 'class_started' using errcode = 'P0001'; end if;

    late := now() > s.starts_at - make_interval(hours => cfg.cancellation_cutoff_hours);

    -- A-085: inside the cutoff the studio's "Remove" is a late cancel too, unless she chooses to return the class.
    if late and not (p_admin and p_return_credit) then
      update public.bookings set status = 'late_cancelled', cancelled_at = now(),
             late_refund_pending = cfg.refund_late_cancel_if_filled and paid_with in ('credit', 'payment')
       where id = b.id;
      result := 'late_cancelled';
    else
      update public.bookings set status = 'cancelled', cancelled_at = now() where id = b.id;
      perform public.return_credit(b.id, 'cancel_refund');
      result := 'cancelled';
    end if;
  end if;

  -- The freed spot goes to the waitlist in the same transaction, so nobody can take it in between.
  return jsonb_build_object('status', result, 'session_id', s.id,
    'offers', coalesce((select jsonb_agg(to_jsonb(o)) from public.process_waitlist(s.id) o), '[]'::jsonb));
end $$;

revoke all on function public.cancel_booking(uuid, uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.cancel_booking(uuid, uuid, boolean, boolean) to service_role;

-- A-084: Mat is 4 spots (her answer, 3 Nov). The demo seed still made one 8-spot Mat class, and the
-- baseline default was 8 (the real app was fixed by 20261103000300). Fix both without copying the whole seed:
-- seed_demo() keeps its old body as seed_demo_base() and then brings Mat classes down to 4.
update public.class_types set default_capacity = 4 where slug in ('mat', 'prenatal-mat') and default_capacity <> 4;

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'seed_demo_base') then
    alter function public.seed_demo() rename to seed_demo_base;
    revoke execute on function public.seed_demo_base() from public, anon, authenticated;
    grant execute on function public.seed_demo_base() to service_role;
  end if;
end $$;

create or replace function public.seed_demo() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_demo_base();
  update public.class_sessions s set capacity = 4
   where s.capacity > 4
     and s.class_type_id in (select id from public.class_types where kind = 'mat')
     and public.spots_taken(s.id) <= 4;
end $$;
revoke execute on function public.seed_demo() from public, anon, authenticated;
grant execute on function public.seed_demo() to service_role;

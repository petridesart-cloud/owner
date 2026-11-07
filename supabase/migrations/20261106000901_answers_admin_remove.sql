-- A-085 (her answer, 7 Nov): when the studio removes someone inside the cancellation cutoff, the default is a
-- late cancel (no class back), with a separate choice to remove and return the class. More than 6h before class
-- nothing changes. cancel_booking v4 adds p_return_credit (default false); releasing an unpaid spot that was never
-- really taken (failed checkout, a code that ran out) passes true.
drop function if exists public.cancel_booking(uuid, uuid, boolean);

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

    late := now() > s.starts_at - make_interval(hours => cfg.cancellation_cutoff_hours)
            and not (b.free_cancel_until is not null and now() <= b.free_cancel_until);  -- waitlist grace period (unused)

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

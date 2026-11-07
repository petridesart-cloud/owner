-- A-033 (her answer, 7 Nov): if a client cancelled late and the studio then cancels that class, the class
-- comes back. cancel_session v2 also turns late cancels into studio cancellations and returns their credit
-- (return_credit only gives back what is still spent, so a late-fill refund is never paid twice).
-- They're returned with the others so they're told their class is back.
create or replace function public.cancel_session(p_session uuid, p_reason text)
returns table (booking_id uuid, profile_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  s public.class_sessions;
  r record;
begin
  select * into s from public.class_sessions where id = p_session for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if s.status = 'cancelled' then return; end if;

  update public.class_sessions set status = 'cancelled', cancelled_reason = p_reason where id = p_session;

  for r in select b.id, b.profile_id, b.status from public.bookings b
            where b.session_id = p_session and b.status in ('confirmed', 'held', 'late_cancelled') for update
  loop
    update public.bookings set status = 'studio_cancelled', late_refund_pending = false,
           cancelled_at = case when r.status = 'late_cancelled' then cancelled_at else now() end
     where id = r.id;
    if r.status in ('confirmed', 'late_cancelled') then
      perform public.return_credit(r.id, 'studio_cancel');
      booking_id := r.id; profile_id := r.profile_id;
      return next;
    end if;
  end loop;

  update public.waitlist_entries set status = 'cancelled'
   where session_id = p_session and status in ('waiting', 'offered');
end $$;

revoke all on function public.cancel_session(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_session(uuid, text) to service_role;

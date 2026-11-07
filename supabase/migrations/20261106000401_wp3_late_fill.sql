-- WP3 (A-081): refund-if-filled only when the newcomer took a spot that wouldn't otherwise exist.

-- ── A-081: late-fill refund only when the class would otherwise be full ──────────────────
create or replace function public.apply_late_fill_refund(p_session uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  late_id uuid;
  cap int;
  pending int;
begin
  select capacity into cap from public.class_sessions where id = p_session;
  select count(*) into pending from public.bookings
   where session_id = p_session and status = 'late_cancelled' and late_refund_pending;
  if pending = 0 then return null; end if;
  -- The late cancellers' spots count as re-booked only once every spot that was free anyway is taken.
  if public.spots_taken(p_session) + pending <= cap then return null; end if;
  select id into late_id from public.bookings
   where session_id = p_session and status = 'late_cancelled' and late_refund_pending
   order by cancelled_at limit 1 for update;
  if late_id is null then return null; end if;
  update public.bookings set late_refund_pending = false where id = late_id;
  perform public.return_credit(late_id, 'late_fill_refund');
  return late_id;
end $$;

-- Waitlist auto-book (owner's decision): when a spot opens, the first person in line is
-- booked automatically if they have a usable class for it AND the class is more than the
-- cancellation cutoff away (so they can still cancel free). Otherwise they get the usual
-- held offer. Auto-booked rows are returned with offer_expires_at = null.
create or replace function public.process_waitlist(p_session uuid)
returns table (entry_id uuid, profile_id uuid, offer_expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  s public.class_sessions;
  ct public.class_types;
  cfg public.studio_settings := public.settings();
  free int;
  nxt public.waitlist_entries;
  exp timestamptz;
  booked boolean;
begin
  select * into s from public.class_sessions where id = p_session for update;
  if not found then return; end if;
  select * into ct from public.class_types where id = s.class_type_id;

  update public.waitlist_entries w set status = 'expired'
   where w.session_id = p_session and w.status = 'offered' and w.offer_expires_at <= now();
  update public.bookings set status = 'expired'
   where session_id = p_session and status = 'held' and hold_expires_at <= now();

  if s.status <> 'scheduled' or s.starts_at <= now() then return; end if;

  free := s.capacity - public.spots_taken(p_session);
  while free > 0 loop
    select * into nxt from public.waitlist_entries w
     where w.session_id = p_session and w.status = 'waiting'
     order by w.created_at limit 1 for update;
    exit when not found;

    booked := false;
    if ct.credit_kind is not null and s.starts_at > now() + make_interval(hours => cfg.cancellation_cutoff_hours) then
      begin
        perform public.book_session(nxt.profile_id, p_session, 'credit', 'online');  -- marks the entry claimed
        booked := true;
      exception when others then
        booked := false;  -- no usable class (or any other refusal): fall back to an offer
      end;
    end if;

    if booked then
      entry_id := nxt.id; profile_id := nxt.profile_id; offer_expires_at := null;
    else
      -- Offer window: N minutes, but not past the cancellation cutoff;
      -- if we're already inside the cutoff, until the class starts.
      exp := least(now() + make_interval(mins => cfg.waitlist_window_minutes),
                   s.starts_at - make_interval(hours => cfg.cancellation_cutoff_hours));
      if exp <= now() + interval '10 minutes' then
        exp := least(now() + make_interval(mins => cfg.waitlist_window_minutes), s.starts_at);
      end if;
      update public.waitlist_entries set status = 'offered', offered_at = now(), offer_expires_at = exp
       where id = nxt.id;
      entry_id := nxt.id; profile_id := nxt.profile_id; offer_expires_at := exp;
    end if;
    return next;
    free := free - 1;
  end loop;
end $$;

revoke execute on function public.process_waitlist(uuid) from public, anon, authenticated;
grant execute on function public.process_waitlist(uuid) to service_role;

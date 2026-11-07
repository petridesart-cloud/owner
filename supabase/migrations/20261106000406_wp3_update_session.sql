-- WP3 (A-039, part of A-064): edit a class with the engine's rules.

-- ── A-039, A-064: edit a class with the engine's rules ──────────────────────────────────
-- p_patch holds the edited columns (class_type_id, starts_at, ends_at, capacity, price_cents, title, …).
-- Returns {booked, moved, offers}: offers = waitlist rows to notify when capacity went up.
create or replace function public.update_session(p_session uuid, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.class_sessions;
  r public.class_sessions;
  booked int;
  lot public.credit_lots;
  moved boolean;
begin
  select * into s from public.class_sessions where id = p_session for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  r := jsonb_populate_record(s, p_patch);
  r.id := s.id; r.status := s.status; r.template_id := s.template_id; r.created_at := s.created_at;
  r.cancelled_reason := s.cancelled_reason;

  select count(*) into booked from public.bookings where session_id = s.id and status in ('held', 'confirmed');
  if r.class_type_id is distinct from s.class_type_id and exists (
       select 1 from public.bookings where session_id = s.id and status in ('held', 'confirmed', 'late_cancelled', 'no_show')) then
    raise exception 'type_locked' using errcode = 'P0001';  -- the classes they paid with are for the old type
  end if;
  if r.capacity < public.spots_taken(s.id) then raise exception 'capacity_below_booked' using errcode = 'P0001'; end if;
  moved := r.starts_at is distinct from s.starts_at;
  if moved and booked > 0 and public.is_closed_on(r.starts_at) then raise exception 'studio_closed' using errcode = 'P0001'; end if;

  update public.class_sessions set class_type_id = r.class_type_id, starts_at = r.starts_at, ends_at = r.ends_at,
         capacity = r.capacity, price_cents = r.price_cents, title = r.title, location = r.location,
         description = r.description, clients_only = r.clients_only, what_to_bring = r.what_to_bring,
         event_policy = r.event_policy, recap = r.recap, signup_question = r.signup_question, title_font = r.title_font
   where id = s.id;

  if moved then
    -- Packages that paid for this class: the provisional expiry follows the first class, and the new date
    -- must still be inside the package (not after its end, not in a freeze).
    for lot in select distinct l.* from public.credit_lots l
                 join public.credit_ledger g on g.lot_id = l.id and g.entry_type = 'booking_debit'
                 join public.bookings b on b.id = g.booking_id
                where b.session_id = s.id and b.status = 'confirmed'
    loop
      perform public.recalc_lot_expiry(lot.id);
      select * into lot from public.credit_lots where id = lot.id;
      if not public.lot_usable_for(lot, r.starts_at) then
        raise exception 'moved_outside_package' using errcode = 'P0001';
      end if;
    end loop;
  end if;

  return jsonb_build_object('booked', booked, 'moved', moved,
    'offers', coalesce((select jsonb_agg(to_jsonb(o)) from public.process_waitlist(s.id) o), '[]'::jsonb));
end $$;

revoke all on function public.update_session(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.update_session(uuid, jsonb) to service_role;

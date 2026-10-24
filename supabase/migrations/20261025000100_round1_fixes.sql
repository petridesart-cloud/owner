-- Review fixes after round 1 + date of birth required.

-- 1. A trial / drop-in / event reserved "pay before class" whose booking is released
--    (cancelled in time, cancelled by the studio, removed, expired) no longer owes anything:
--    its pending payment is cancelled. Otherwise it would sit in "Awaiting payment", block
--    the client's trial, and "Mark as paid" would re-confirm the cancelled booking.
--    Late cancellations and no-shows keep the payment pending; she decides.
create or replace function public.release_unpaid_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('cancelled', 'studio_cancelled', 'expired') and old.status in ('confirmed', 'held') then
    update public.payments set status = 'cancelled'
     where booking_id = new.id and status = 'pending' and provider = 'offline';
  end if;
  return new;
end $$;

drop trigger if exists bookings_release_unpaid on public.bookings;
create trigger bookings_release_unpaid after update of status on public.bookings
  for each row execute function public.release_unpaid_payment();

-- 2. Right to erasure covers the round-1 profile fields and weekly rules.
create or replace function public.erase_profile(p_profile uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  select user_id into uid from public.profiles where id = p_profile;
  update public.bookings set status = 'cancelled', cancelled_at = now()
   where profile_id = p_profile and status in ('held', 'confirmed')
     and session_id in (select id from public.class_sessions where starts_at > now());
  update public.waitlist_entries set status = 'left' where profile_id = p_profile and status in ('waiting', 'offered');
  update public.payments set status = 'cancelled' where profile_id = p_profile and status = 'pending';
  delete from public.health_notes where profile_id = p_profile;
  delete from public.recurring_rules where profile_id = p_profile;
  update public.profiles set full_name = 'Deleted client', first_name = null, last_name = null, email = null, phone = null,
         date_of_birth = null, goal = null, emergency_contact_name = null, emergency_contact_phone = null, photo_consent = null,
         admin_notes = null, marketing_email = false, marketing_sms = false, user_id = null, deleted_at = now()
   where id = p_profile;
  update public.notifications set recipient = '[erased]', body = '[erased]' where profile_id = p_profile;
  return uid; -- caller deletes the auth user
end $$;

-- 3. Demo clients get a date of birth (now required) after every seed.
create or replace function public.seed_demo_profiles() returns void
language sql security definer set search_path = public as $$
  update public.profiles
     set date_of_birth = date '1984-01-01' + (abs(hashtext(email)) % 8000)
   where role = 'client' and date_of_birth is null and email like '%@example.com';
  -- One demo client celebrates on the day of their next class (shows the Birthday flag).
  update public.profiles p
     set date_of_birth = make_date(1992, extract(month from x.d)::int, extract(day from x.d)::int)
    from (select (s.starts_at at time zone 'Europe/Nicosia')::date as d from public.bookings b
            join public.class_sessions s on s.id = b.session_id
            join public.profiles q on q.id = b.profile_id
           where q.email = 'elena@example.com' and b.status = 'confirmed' and s.starts_at > now()
           order by s.starts_at limit 1) x
   where p.email = 'elena@example.com' and not (extract(month from x.d) = 2 and extract(day from x.d) = 29);
$$;

-- Based on the 0600 version. Her prices (products) are now kept across resets.
create or replace function public.reset_demo_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('reform.ledger_maintenance', 'on', true);
  delete from public.notifications where true;
  delete from public.waitlist_entries where true;
  delete from public.credit_ledger where true;
  update public.bookings set credit_lot_id = null, payment_id = null where true;
  update public.payments set booking_id = null, membership_id = null where true;
  delete from public.bookings where true;
  delete from public.credit_lots where true;
  delete from public.payments where true;
  delete from public.memberships where true;
  delete from public.class_sessions where true;
  delete from public.timetable_templates where true;
  delete from public.otp_requests where true;
  delete from public.processed_webhooks where true;
  delete from public.recurring_rules where true;
  delete from public.media where slot like 'event:%';   -- events are recreated with new ids
  delete from public.consents where profile_id in (select id from public.profiles where role = 'client');
  delete from public.profiles where role = 'client';
  perform public.seed_demo();
  perform public.seed_demo_profiles();
end $$;

select public.seed_demo_profiles();

revoke execute on function public.release_unpaid_payment(), public.erase_profile(uuid), public.seed_demo_profiles(), public.reset_demo_data()
  from public, anon, authenticated;
grant execute on function public.erase_profile(uuid), public.seed_demo_profiles(), public.reset_demo_data() to service_role;

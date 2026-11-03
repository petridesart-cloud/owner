-- Her answer: Mat classes have 4 spots (Mat and Pre & Post Natal Mat).
update public.class_types set default_capacity = 4 where slug in ('mat', 'prenatal-mat');

-- Classes already on the schedule follow it, but never below the people already booked in.
update public.class_sessions s
   set capacity = greatest(4, (select count(*) from public.bookings b where b.session_id = s.id and b.status in ('confirmed', 'held')))
  from public.class_types t
 where t.id = s.class_type_id and t.slug in ('mat', 'prenatal-mat')
   and s.status = 'scheduled' and s.starts_at > now() and s.capacity > 4;

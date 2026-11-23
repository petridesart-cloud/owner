-- Her note (23 Nov): a 2-month package is "N classes a month", so it gives twice the classes:
-- 4 → 8, 8 → 16, 12 → 24. Prices stay the same. Names follow ("Mat · 8 classes · 2 months").
-- Anyone who already has one of these packages gets the missing classes added (ledger: admin_adjustment).

-- 1. Packages already bought, still running: top them up by the old number of classes.
do $$
declare r record;
begin
  for r in
    select l.id as lot, p.credits as old
      from public.credit_lots l
      join public.payments pay on pay.id = l.payment_id
      join public.products p on p.id = pay.product_id
     where p.tag = 'package' and p.months = 2 and p.credits in (4, 8, 12)
       and p.credit_kind in ('mat', 'reformer') and p.archived_at is null
       and l.total = p.credits and (l.expires_at is null or l.expires_at > now())
  loop
    perform public.admin_adjust_lot(r.lot, 'add', null, null, r.old,
      '2-month package: ' || r.old || ' classes a month (studio note, 23 Nov)', null);
  end loop;
end $$;

-- 2. The packages on sale.
update public.products
   set credits = credits * 2,
       per_week = credits / 4,  -- old credits = classes a month, so per week = that / 4
       name = regexp_replace(name, '\d+ class(es)?', (credits * 2) || ' classes')
 where tag = 'package' and months = 2 and credits in (4, 8, 12)
   and credit_kind in ('mat', 'reformer') and archived_at is null;

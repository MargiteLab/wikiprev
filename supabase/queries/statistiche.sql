-- Example statistics. Run them in the Supabase SQL Editor.
-- They only read data. "Who gets it right most often" will be added
-- once outcomes/evaluations exist.

-- Who uploads the most predictions.
select coalesce(c.name, pr.display_name, '(esempi iniziali)') as caricata_da,
       count(*)                                              as previsioni
from predictions p
left join contributors c on c.id = p.contributor_id
left join profiles pr    on pr.id = p.created_by
where p.deleted_at is null
group by 1
order by previsioni desc;

-- Who makes the most predictions.
select pe.name as chi, pe.kind as tipo, count(*) as previsioni
from predictions p
join people pe on pe.id = p.person_id
where p.deleted_at is null
group by pe.id, pe.name, pe.kind
order by previsioni desc, chi;

-- Which outlets publish the most predictions.
select o.name as fonte, count(*) as previsioni
from predictions p
join outlets o on o.id = p.outlet_id
where p.deleted_at is null
group by o.id, o.name
order by previsioni desc, fonte;

-- Predictions per month of due date: how many came due, how many are coming.
select to_char(date_trunc('month', due_on), 'YYYY-MM') as mese,
       count(*)                                         as previsioni,
       count(*) filter (where due_on < current_date)    as scadute
from predictions
where deleted_at is null
group by 1
order by 1;

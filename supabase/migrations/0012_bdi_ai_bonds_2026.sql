-- WikiPrev: Bank of Italy, Economic Bulletin 4/2026 (October 2026), p. 12:
-- big tech (hyperscaler) bond issuance for AI could push long-term
-- government bond yields higher. Requires 0009 (tags); creates the tags it
-- needs. legacy_id makes this safe to run more than once.

insert into public.outlets (name) values ('Banca d''Italia, Bollettino economico')
on conflict ((lower(btrim(name)))) do nothing;

insert into public.predictions
    (legacy_id, statement, details, person_id, outlet_id, source_url, category_id, made_on, due_on)
select
    'seed-v12-bdi-hyperscaler-rendimenti', 'Le emissioni di obbligazioni delle big tech per l''IA potrebbero far salire ancora i rendimenti dei titoli di Stato a lunga scadenza',
    'Nel Bollettino economico 4/2026 (riquadro «Il recente rialzo dei rendimenti dei titoli pubblici a lunga scadenza», p. 12) la Banca d''Italia osserva che nei primi otto mesi del 2026 le obbligazioni in dollari delle imprese statunitensi sono cresciute del 47%, trainate dalle «hyperscalers» che costruiscono le infrastrutture dell''IA, e scrive: «In prospettiva, le cospicue emissioni di titoli privati, soprattutto sulle scadenze più lunghe, potrebbero accrescere la concorrenza con gli emittenti pubblici nei segmenti a maggiore durata, alimentando ulteriori pressioni al rialzo sui rendimenti dei titoli». Nello stesso riquadro ricorda che rendimenti più elevati aumentano gli oneri del debito pubblico. Da verificare con l''andamento dei rendimenti decennali (Stati Uniti, Germania, Italia) nel 2027-2028.',
    (select id from public.people  where lower(btrim(name)) = lower(btrim('Banca d''Italia'))),
    (select id from public.outlets where lower(btrim(name)) = lower(btrim('Banca d''Italia, Bollettino economico'))),
    'https://www.bancaditalia.it/pubblicazioni/bollettino-economico/2026-4/boleco-4-2026.pdf', 'economics', '2026-10-16'::date, '2028-12-31'::date
on conflict (legacy_id) do nothing;

-- Tags, created if missing (matched by name ignoring case).
insert into public.tags (id, label)
select t.id, t.label
from (values ('intelligenza-artificiale', 'Intelligenza artificiale'), ('mercati', 'Mercati'), ('tecnologia', 'Tecnologia')) as t (id, label)
where not exists (select 1 from public.tags x where lower(x.label) = lower(t.label))
on conflict (id) do nothing;

insert into public.prediction_tags (prediction_id, tag_id)
select p.id, x.id
from public.predictions p
join public.tags x on lower(x.label) in ('intelligenza artificiale', 'mercati', 'tecnologia')
where p.legacy_id = 'seed-v12-bdi-hyperscaler-rendimenti'
on conflict do nothing;

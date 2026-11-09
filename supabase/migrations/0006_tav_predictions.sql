-- WikiPrev: example predictions about the Torino-Lione railway (TAV).
-- legacy_id makes this safe to run more than once.

insert into public.people (name, kind) values
    ('TELT', 'organization')
on conflict ((lower(btrim(name)))) do nothing;

insert into public.outlets (name) values
    ('Il Fatto Quotidiano'),
    ('L''Indipendente'),
    ('Camera dei deputati, documentazione')
on conflict ((lower(btrim(name)))) do nothing;

insert into public.predictions
    (legacy_id, statement, details, person_id, outlet_id, source_url, category_id, made_on, due_on)
select
    s.legacy_id, s.statement, s.details,
    (select id from public.people  where lower(btrim(name)) = lower(btrim(s.person_name))),
    (select id from public.outlets where lower(btrim(name)) = lower(btrim(s.outlet_name))),
    s.source_url, s.category_id, s.made_on::date, s.due_on::date
from (values
    ('seed-v7-tav-inaugurazione-2015',
     'La linea Torino-Lione sarà inaugurata nel 2015',
     'Secondo la relazione speciale 02/2026 della Corte dei conti europea, la stima iniziale prevedeva l''inaugurazione del collegamento nel 2015. Il calendario del 2020 indicava il 2030 e oggi la data prevista è il 2033: 18 anni di ritardo rispetto alla stima iniziale, con costi superiori del 127%.',
     null,
     'Il Fatto Quotidiano',
     'https://www.ilfattoquotidiano.it/2026/01/19/tav-torino-lione-costi-ritardi-notizie/8261752/',
     'tav',
     null,
     '2015-12-31'),
    ('seed-v7-tav-talpa-chiomonte-2027',
     'La prima talpa del lato italiano inizierà a scavare a Chiomonte all''inizio del 2027',
     'Il programma prevedeva l''arrivo dalla Germania della prima fresa per il cantiere di Chiomonte entro la fine del 2026 e l''avvio dello scavo a inizio 2027. A novembre 2026 TELT ha spostato l''avvio all''inizio del 2028, attribuendo il ritardo alle proteste del 25 luglio.',
     'TELT',
     'L''Indipendente',
     'https://www.lindipendente.online/2026/11/02/i-lavori-per-la-tav-torino-lione-sono-stati-ritardati-di-un-anno-ancora-una-volta/',
     'tav',
     null,
     '2027-03-31'),
    ('seed-v7-tav-servizio-2033',
     'La Torino-Lione entrerà in servizio commerciale il 31 dicembre 2033',
     'Nel luglio 2024 il consiglio di amministrazione di TELT ha fissato al 31/12/2033 l''entrata in servizio commerciale della linea. Il cronoprogramma ufficiale del 2015 indicava la fine del 2029. In Francia il Conseil d''orientation des infrastructures ha ipotizzato uno slittamento al 2035.',
     'TELT',
     'Camera dei deputati, documentazione',
     'https://temi.camera.it/leg19/post/la-tratta-ferroviaria-torino-lione.html',
     'tav',
     null,
     '2033-12-31')
) as s (legacy_id, statement, details, person_name, outlet_name, source_url, category_id, made_on, due_on)
on conflict (legacy_id) do nothing;

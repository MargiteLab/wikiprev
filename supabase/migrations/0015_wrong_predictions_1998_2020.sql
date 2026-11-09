-- WikiPrev: five clearly wrong predictions from the last 30 years (Krugman
-- on the Internet, "Dow 36,000", Gates on spam, Alitalia back in profit in
-- 2017, Musk on a million robotaxis in 2020). Requires 0013 (tags).
-- legacy_id makes this safe to run more than once.

insert into public.people (name, kind) values
    ('Paul Krugman', 'person'),
    ('James Glassman e Kevin Hassett', 'group'),
    ('Bill Gates', 'person'),
    ('Luca Cordero di Montezemolo', 'person'),
    ('Elon Musk', 'person')
on conflict ((lower(btrim(name)))) do nothing;

insert into public.outlets (name) values
    ('Red Herring'),
    ('Dow 36,000 (libro, 1999)'),
    ('The Register'),
    ('Sky TG24'),
    ('TechCrunch')
on conflict ((lower(btrim(name)))) do nothing;

insert into public.predictions
    (legacy_id, statement, details, person_id, outlet_id, source_url, made_on, due_on)
select
    s.legacy_id, s.statement, s.details,
    (select id from public.people  where lower(btrim(name)) = lower(btrim(s.person_name))),
    (select id from public.outlets where lower(btrim(name)) = lower(btrim(s.outlet_name))),
    s.source_url, s.made_on::date, s.due_on::date
from (values
    ('seed-v13-krugman-internet-fax-2005',
     'Entro il 2005 sarà chiaro che Internet non ha avuto sull''economia un impatto maggiore del fax',
     'Nell''articolo «Why most economists'' predictions are wrong» (Red Herring, giugno 1998) l''economista, poi premio Nobel, scrisse: «By 2005 or so, it will become clear that the Internet''s impact on the economy has been no greater than the fax machine''s». Com''è andata: nel 2005 il commercio elettronico, i motori di ricerca e la pubblicità online erano già settori da decine di miliardi. Nel 2013 Krugman ha detto che il pezzo voleva essere «divertente e provocatorio», non una previsione accurata. Il link porta alla ricostruzione della citazione su Quote Investigator.',
     'Paul Krugman',
     'Red Herring',
     'https://quoteinvestigator.com/2023/10/26/internet-fax/',
     '1998-06-10',
     '2005-12-31'),
    ('seed-v13-dow-36000-2004',
     'Il Dow Jones arriverà a 36.000 punti entro tre-cinque anni',
     'Nel libro «Dow 36,000», uscito nel 1999 con l''indice intorno agli 11.000 punti, i due autori sostenevano che le azioni erano sottovalutate e che il Dow Jones avrebbe toccato 36.000 punti in tre-cinque anni. Com''è andata: dopo lo scoppio della bolla delle dot-com il Dow è sceso sotto gli 8.000 punti nel 2002; ha chiuso per la prima volta sopra 36.000 solo il 2 novembre 2021, 22 anni dopo. Nel 2010 gli autori hanno riconosciuto di aver perso una scommessa sulla previsione.',
     'James Glassman e Kevin Hassett',
     'Dow 36,000 (libro, 1999)',
     'https://en.wikipedia.org/wiki/Dow_36,000',
     null,
     '2004-12-31'),
    ('seed-v13-gates-spam-2006',
     'Fra due anni il problema dello spam sarà risolto',
     'Al World Economic Forum di Davos, a gennaio 2004, il fondatore di Microsoft disse: «Two years from now, spam will be solved», puntando su sistemi di identificazione dei mittenti e su un piccolo costo per ogni email inviata. Com''è andata: nel 2007 si stima che siano state inviate circa 10.800 miliardi di email di spam, più di quelle legittime; i filtri sono migliorati negli anni successivi, ma lo spam non è mai scomparso.',
     'Bill Gates',
     'The Register',
     'https://www.theregister.com/2004/01/26/well_kill_spam_in_two/',
     '2004-01-23',
     '2006-01-31'),
    ('seed-v13-alitalia-utile-2017',
     'Alitalia tornerà in utile nel 2017',
     'Presentando la nuova Alitalia nata dall''ingresso di Etihad, il presidente Montezemolo indicò il 2017 come anno del ritorno all''utile; l''amministratore delegato Silvano Cassano parlò di circa 100 milioni di euro. Il piano di Etihad del 2014 prevedeva 108 milioni di utile nel 2017. Com''è andata: il 2 maggio 2017 Alitalia ha chiesto l''amministrazione straordinaria, con perdite stimate di centinaia di milioni.',
     'Luca Cordero di Montezemolo',
     'Sky TG24',
     'https://tg24.sky.it/economia/2015/01/20/alitalia_presentazione_nuova_societ__ethiad_montezemolo_hogan_cassano',
     '2015-01-20',
     '2017-12-31'),
    ('seed-v13-musk-milione-robotaxi-2020',
     'L''anno prossimo ci saranno più di un milione di robotaxi Tesla in strada',
     'All''«Autonomy Day» di Tesla, il 22 aprile 2019, Musk disse: «next year for sure, we''ll have over a million robotaxis on the road», spiegando che sarebbe bastato un aggiornamento software delle auto già vendute. Com''è andata: nel 2020 non c''era nessun robotaxi Tesla in servizio; nel 2022 Musk spostava l''obiettivo a una produzione in volume nel 2024 (vedi la previsione relativa).',
     'Elon Musk',
     'TechCrunch',
     'https://techcrunch.com/2019/04/22/tesla-plans-to-launch-a-robotaxi-network-in-2020/',
     '2019-04-22',
     '2020-12-31')
) as s (legacy_id, statement, details, person_name, outlet_name, source_url, made_on, due_on)
on conflict (legacy_id) do nothing;

-- Tags by name (created if missing, synonyms resolved).
insert into public.prediction_tags (prediction_id, tag_id)
select p.id, public.tag_id_for(t.label)
from (values
    ('seed-v13-krugman-internet-fax-2005', 'Economia'),
    ('seed-v13-krugman-internet-fax-2005', 'Tecnologia'),
    ('seed-v13-dow-36000-2004', 'Economia'),
    ('seed-v13-dow-36000-2004', 'Mercati'),
    ('seed-v13-gates-spam-2006', 'Tecnologia'),
    ('seed-v13-alitalia-utile-2017', 'Economia'),
    ('seed-v13-alitalia-utile-2017', 'Trasporti'),
    ('seed-v13-musk-milione-robotaxi-2020', 'Tecnologia')
) as t (legacy_id, label)
join public.predictions p on p.legacy_id = t.legacy_id
on conflict do nothing;

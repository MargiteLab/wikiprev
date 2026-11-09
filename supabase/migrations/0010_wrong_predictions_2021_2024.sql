-- WikiPrev: clearly wrong predictions that came due between late 2021
-- and 2024 (PlanB on bitcoin, Lagarde on ECB rates, Fed on inflation,
-- Musk on robotaxis, Salvini on the Strait of Messina bridge).
-- Requires 0009 (tags). legacy_id makes this safe to run more than once.

insert into public.people (name, kind) values
    ('PlanB', 'person'),
    ('Christine Lagarde', 'person'),
    ('Federal Reserve (FOMC)', 'organization'),
    ('Elon Musk', 'person'),
    ('Matteo Salvini', 'person')
on conflict ((lower(btrim(name)))) do nothing;

insert into public.outlets (name) values
    ('FXStreet'),
    ('Euronews'),
    ('Federal Reserve, Summary of Economic Projections'),
    ('TechCrunch'),
    ('Open')
on conflict ((lower(btrim(name)))) do nothing;

insert into public.predictions
    (legacy_id, statement, details, person_id, outlet_id, source_url, category_id, made_on, due_on)
select
    s.legacy_id, s.statement, s.details,
    (select id from public.people  where lower(btrim(name)) = lower(btrim(s.person_name))),
    (select id from public.outlets where lower(btrim(name)) = lower(btrim(s.outlet_name))),
    s.source_url, s.category_id, s.made_on::date, s.due_on::date
from (values
    ('seed-v11-planb-bitcoin-135k-2021',
     'Il bitcoin varrà almeno 135.000 dollari a dicembre 2021',
     'L''analista anonimo PlanB, autore del modello «stock-to-flow», aveva indicato come scenario minimo («floor model») 98.000 dollari a novembre e 135.000 a dicembre 2021, impegnandosi a considerare invalidata la previsione se il bitcoin non avesse raggiunto i 100.000 dollari entro fine anno. Com''è andata: il bitcoin ha chiuso il 2021 sotto i 50.000 dollari e a giugno 2022 è sceso fino a circa 17.600.',
     'PlanB',
     'FXStreet',
     'https://www.fxstreet.com/cryptocurrencies/news/bitcoin-stock-to-flow-model-invalidated-as-btc-closes-2021-below-100-000-202201010939',
     'economics',
     null,
     '2021-12-31'),
    ('seed-v11-lagarde-tassi-2022',
     'È molto improbabile che la BCE alzi i tassi di interesse nel 2022',
     'Nella conferenza stampa del 16 dicembre 2021 la presidente della BCE ha ribadito che un rialzo dei tassi nel 2022 era «molto improbabile», come aveva già detto a novembre. Com''è andata: con l''inflazione in forte crescita, la BCE ha alzato i tassi a luglio 2022, per la prima volta in 11 anni, e ancora più volte entro dicembre.',
     'Christine Lagarde',
     'Euronews',
     'https://www.euronews.com/2021/12/16/ecb-policy-rates-lagarde',
     'economics',
     '2021-12-16',
     '2022-12-31'),
    ('seed-v11-fed-inflazione-2022',
     'L''inflazione negli Stati Uniti (indice PCE) sarà del 2,6% nel 2022',
     'Nelle proiezioni del 15 dicembre 2021 la mediana dei membri del FOMC indicava un''inflazione PCE del 2,6% nel 2022 (dal quarto trimestre 2021 al quarto trimestre 2022), in calo dal 5,3% del 2021. Com''è andata: secondo i dati definitivi del BEA l''inflazione PCE 2022 è stata del 5,7% (sempre sul quarto trimestre), con un picco del 7,0% a giugno.',
     'Federal Reserve (FOMC)',
     'Federal Reserve, Summary of Economic Projections',
     'https://www.federalreserve.gov/monetarypolicy/fomcprojtabl20211215.htm',
     'economics',
     '2021-12-15',
     '2022-12-31'),
    ('seed-v11-musk-robotaxi-2024',
     'Tesla produrrà in grandi volumi un robotaxi senza volante né pedali nel 2024',
     'Durante la presentazione dei risultati del primo trimestre 2022 Musk ha detto che Tesla puntava a «raggiungere la produzione in volume nel 2024» di un robotaxi dedicato, senza volante né pedali, e che una corsa sarebbe costata meno di un biglietto dell''autobus. Già nel 2019 aveva promesso robotaxi per il 2020. Com''è andata: nel 2024 non è partita nessuna produzione in serie; il prototipo «Cybercab» è stato solo presentato a ottobre 2024.',
     'Elon Musk',
     'TechCrunch',
     'https://techcrunch.com/2022/04/20/elon-musk-mass-produce-robotaxi-by-2024',
     'technology',
     '2022-04-20',
     '2024-12-31'),
    ('seed-v11-salvini-ponte-estate-2024',
     'I cantieri del Ponte sullo Stretto apriranno entro l''estate 2024',
     'Al congresso degli ingegneri, il 28 settembre 2023, il ministro delle Infrastrutture ha detto che l''obiettivo era aprire i cantieri «nell''estate dell''anno del Signore 2024», come aveva già detto a maggio e ripetuto alla Camera il 4 ottobre 2023. Com''è andata: nell''estate 2024 i cantieri non sono stati aperti; a giugno 2024 il direttore della società Stretto di Messina parlava di almeno un anno e mezzo, e la data è poi slittata più volte.',
     'Matteo Salvini',
     'Open',
     'https://www.open.online/2023/09/28/ponte-sullo-stretto-salvini-inizio-estate-2024/',
     'infrastructure',
     '2023-09-28',
     '2024-09-22')
) as s (legacy_id, statement, details, person_name, outlet_name, source_url, category_id, made_on, due_on)
on conflict (legacy_id) do nothing;

insert into public.prediction_tags (prediction_id, tag_id)
select p.id, t.tag_id
from (values
    ('seed-v11-salvini-ponte-estate-2024', 'promesse-politiche')
) as t (legacy_id, tag_id)
join public.predictions p on p.legacy_id = t.legacy_id
on conflict do nothing;

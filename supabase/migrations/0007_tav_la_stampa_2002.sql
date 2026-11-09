-- WikiPrev: Torino-Lione predictions from La Stampa, 17 March 2002
-- ("La Torino-Lione pronta a fine 2013", by Maurizio Tropeano).
-- legacy_id makes this safe to run more than once.

insert into public.people (name, kind) values
    ('Governo italiano', 'organization'),
    ('LTF (Lyon Turin Ferroviaire)', 'organization'),
    ('Conferenza intergovernativa Italia-Francia', 'organization')
on conflict ((lower(btrim(name)))) do nothing;

insert into public.outlets (name) values
    ('La Stampa')
on conflict ((lower(btrim(name)))) do nothing;

insert into public.predictions
    (legacy_id, statement, details, person_id, outlet_id, source_url, category_id, made_on, due_on)
select
    s.legacy_id, s.statement, s.details,
    (select id from public.people  where lower(btrim(name)) = lower(btrim(s.person_name))),
    (select id from public.outlets where lower(btrim(name)) = lower(btrim(s.outlet_name))),
    s.source_url, s.category_id, s.made_on::date, s.due_on::date
from (values
    ('seed-v8-tav-2002-ratifica-italia',
     'L''Italia ratificherà il trattato sulla Torino-Lione nei prossimi giorni',
     'Lo riferisce Sergio Pininfarina, capo della delegazione italiana alla Conferenza intergovernativa: «La Francia ha già ratificato il trattato mentre il nostro governo ha garantito che lo farà nei prossimi giorni». Articolo di Maurizio Tropeano, La Stampa, 17 marzo 2002.',
     'Governo italiano',
     'La Stampa',
     null,
     'tav',
     '2002-03-16',
     '2002-04-30'),
    ('seed-v8-tav-2002-studio-2003',
     'La fase di studio preliminare della Torino-Lione si concluderà nel 2003',
     'Secondo il progetto di fattibilità di LTF, la società controllata da RFF e RFI, approvato dalla Conferenza intergovernativa: «la fase di studio preliminare si concluderà nel 2003 anziché nel 2006». Articolo di Maurizio Tropeano, La Stampa, 17 marzo 2002.',
     'LTF (Lyon Turin Ferroviaire)',
     'La Stampa',
     null,
     'tav',
     '2002-03-16',
     '2003-12-31'),
    ('seed-v8-tav-2002-cantieri-francia-2004',
     'I primi cantieri della Torino-Lione sul versante francese partiranno nel 2004',
     'Dal programma operativo di LTF: dopo la fine degli studi preliminari nel 2003, «l''anno dopo dovrebbero partire i primi cantieri sul versante francese». Articolo di Maurizio Tropeano, La Stampa, 17 marzo 2002.',
     'LTF (Lyon Turin Ferroviaire)',
     'La Stampa',
     null,
     'tav',
     '2002-03-16',
     '2004-12-31'),
    ('seed-v8-tav-2002-lavori-italia-2005',
     'I lavori della Torino-Lione sul versante italiano partiranno a metà 2005',
     'Dal programma operativo di LTF: «su quello italiano i lavori dovrebbero partire alla metà del 2005». Articolo di Maurizio Tropeano, La Stampa, 17 marzo 2002.',
     'LTF (Lyon Turin Ferroviaire)',
     'La Stampa',
     null,
     'tav',
     '2002-03-16',
     '2005-06-30'),
    ('seed-v8-tav-2002-fine-lavori-2012',
     'I lavori della Torino-Lione finiranno nel 2012',
     'La Conferenza intergovernativa, approvando il progetto di fattibilità, «fissa la fine dei lavori nel 2012, con un anticipo di tre anni sui tempi già stabiliti». Costo previsto: 13 miliardi di euro per 254 km, con un contributo europeo atteso fino al 20%. Articolo di Maurizio Tropeano, La Stampa, 17 marzo 2002.',
     'Conferenza intergovernativa Italia-Francia',
     'La Stampa',
     null,
     'tav',
     '2002-03-16',
     '2012-12-31'),
    ('seed-v8-tav-2002-servizio-2013',
     'La Torino-Lione entrerà in servizio nel 2013',
     'Il programma operativo di LTF «prevede dopo un periodo di collaudo, l''entrata in servizio della linea nel corso del 2013. Fra 11 anni, dunque, ci vorrà un''ora e 50 minuti per collegare Torino con Lione». Titolo dell''articolo: «La Torino-Lione pronta a fine 2013». Maurizio Tropeano, La Stampa, 17 marzo 2002.',
     'LTF (Lyon Turin Ferroviaire)',
     'La Stampa',
     null,
     'tav',
     '2002-03-16',
     '2013-12-31')
) as s (legacy_id, statement, details, person_name, outlet_name, source_url, category_id, made_on, due_on)
on conflict (legacy_id) do nothing;

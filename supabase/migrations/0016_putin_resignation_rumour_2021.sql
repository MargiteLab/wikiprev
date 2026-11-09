-- WikiPrev: the November 2020 rumour that Putin would resign in early 2021
-- for health reasons (Valery Solovei, via The Sun; Sky TG24, 6 Nov 2020).
-- Requires 0013 (tags). legacy_id makes this safe to run more than once.

insert into public.people (name, kind) values ('Valery Solovei', 'person')
on conflict ((lower(btrim(name)))) do nothing;

insert into public.outlets (name) values ('Sky TG24')
on conflict ((lower(btrim(name)))) do nothing;

insert into public.predictions
    (legacy_id, statement, details, person_id, outlet_id, source_url, made_on, due_on)
select
    'seed-v14-putin-dimissioni-2021', 'Vladimir Putin annuncerà le dimissioni all''inizio del 2021 per motivi di salute',
    'Il 5 novembre 2020 il tabloid britannico The Sun, ripreso da Daily Mail, New York Post e media italiani, scrisse che Putin aveva sintomi compatibili con il morbo di Parkinson e che si sarebbe dimesso all''inizio del 2021, anche su pressione della famiglia. L''unica fonte con nome era il politologo Valery Solovei, ex professore del MGIMO e oppositore del Cremlino, che a Radio Eco di Mosca disse che Putin avrebbe potuto annunciare le dimissioni a gennaio. In quei giorni era in discussione una legge che avrebbe reso gli ex presidenti senatori a vita con immunità. Il 6 novembre il portavoce del Cremlino Dmitry Peskov definì la notizia «absolute nonsense»: «Everything is fine with the president». Com''è andata: Putin non si è dimesso ed è rimasto presidente.',
    (select id from public.people  where lower(btrim(name)) = lower(btrim('Valery Solovei'))),
    (select id from public.outlets where lower(btrim(name)) = lower(btrim('Sky TG24'))),
    'https://tg24.sky.it/mondo/2020/11/06/putin-parkinson', '2020-11-05'::date, '2021-01-31'::date
on conflict (legacy_id) do nothing;

insert into public.prediction_tags (prediction_id, tag_id)
select p.id, public.tag_id_for(t.label)
from (values ('Geopolitica'), ('Russia'), ('Salute'), ('Politica internazionale')) as t (label)
join public.predictions p on p.legacy_id = 'seed-v14-putin-dimissioni-2021'
on conflict do nothing;

-- WikiPrev: tags. Besides its single category, a prediction can have any
-- number of tags (e.g. "Promesse politiche"). Tags are matched by name
-- ignoring case and are created on the fly when a prediction is submitted.

create table public.tags (
    id         text primary key check (id ~ '^[a-z][a-z0-9-]*$'),
    label      text not null check (length(btrim(label)) between 2 and 40),
    created_at timestamptz not null default now()
);

create unique index tags_label_key on public.tags (lower(label));

create table public.prediction_tags (
    prediction_id uuid not null references public.predictions (id),
    tag_id        text not null references public.tags (id),
    created_at    timestamptz not null default now(),
    primary key (prediction_id, tag_id)
);

create index prediction_tags_tag_id_idx on public.prediction_tags (tag_id);

insert into public.tags (id, label) values ('promesse-politiche', 'Promesse politiche');

-- Find a tag by name (case-insensitive), creating it if needed.
-- Same id rule as add_category() and categoryIdFor() in js/model.js.
create function public.tag_id_for(p_label text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_label text := btrim(regexp_replace(coalesce(p_label, ''), '\s+', ' ', 'g'));
    v_base  text;
    v_id    text;
    v_n     integer := 1;
begin
    if length(v_label) < 2 or length(v_label) > 40 then
        raise exception 'Il nome di un''etichetta deve avere tra 2 e 40 caratteri.' using errcode = '22023';
    end if;

    select id into v_id from tags where lower(label) = lower(v_label);
    if found then
        return v_id;
    end if;

    v_base := lower(translate(v_label,
        'àáâãäåèéêëìíîïòóôõöùúûüçñÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑ',
        'aaaaaaeeeeiiiiooooouuuucnaaaaaaeeeeiiiiooooouuuucn'));
    v_base := btrim(regexp_replace(v_base, '[^a-z0-9]+', '-', 'g'), '-');
    if v_base !~ '^[a-z]' then
        v_base := rtrim('tag-' || v_base, '-');
    end if;

    v_id := v_base;
    while exists (select 1 from tags where id = v_id) loop
        v_n := v_n + 1;
        v_id := v_base || '-' || v_n;
    end loop;

    insert into tags (id, label) values (v_id, v_label);
    return v_id;
end;
$$;

revoke execute on function public.tag_id_for(text) from public, anon, authenticated;

-- Submit a prediction together with its tags (by name), atomically.
create function public.submit_prediction_with_tags(
    p_contributor_name text,
    p_statement        text,
    p_details          text,
    p_person_name      text,
    p_outlet_name      text,
    p_source_url       text,
    p_category_id      text,
    p_made_on          date,
    p_due_on           date,
    p_tags             text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id    uuid;
    v_label text;
begin
    if coalesce(array_length(p_tags, 1), 0) > 10 then
        raise exception 'Puoi indicare al massimo 10 etichette.' using errcode = '22023';
    end if;

    v_id := submit_prediction(p_contributor_name, p_statement, p_details, p_person_name,
                              p_outlet_name, p_source_url, p_category_id, p_made_on, p_due_on);

    foreach v_label in array coalesce(p_tags, '{}') loop
        insert into prediction_tags (prediction_id, tag_id)
        values (v_id, tag_id_for(v_label))
        on conflict do nothing;
    end loop;

    return v_id;
end;
$$;

revoke execute on function public.submit_prediction_with_tags(text, text, text, text, text, text, text, date, date, text[]) from public;
grant execute on function public.submit_prediction_with_tags(text, text, text, text, text, text, text, date, date, text[]) to anon, authenticated;

-- Reading: open to everyone; writing only through the function above.
alter table public.tags            enable row level security;
alter table public.prediction_tags enable row level security;

create policy "anyone reads tags"            on public.tags            for select to anon, authenticated using (true);
create policy "anyone reads prediction tags" on public.prediction_tags for select to anon, authenticated using (true);

revoke all on public.tags, public.prediction_tags from anon, authenticated;
grant select on public.tags, public.prediction_tags to anon, authenticated;

-- The view now includes each prediction's tags as [{ "id", "label" }, ...].
drop view public.predictions_view;

create view public.predictions_view
with (security_invoker = true)
as
select
    p.id,
    p.statement,
    p.details,
    p.source_url,
    p.category_id,
    p.made_on,
    p.due_on,
    p.created_at,
    p.created_by,
    p.contributor_id,
    coalesce(c.name, pr.display_name) as created_by_name,
    p.person_id,
    pe.name         as person_name,
    p.outlet_id,
    o.name          as outlet_name,
    p.legacy_id,
    coalesce((
        select jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label) order by t.label)
        from public.prediction_tags pt
        join public.tags t on t.id = pt.tag_id
        where pt.prediction_id = p.id
    ), '[]'::jsonb) as tags
from public.predictions p
join public.outlets o           on o.id = p.outlet_id
left join public.people pe      on pe.id = p.person_id
left join public.contributors c on c.id = p.contributor_id
left join public.profiles pr    on pr.id = p.created_by
where p.deleted_at is null;

grant select on public.predictions_view to anon, authenticated;

-- Tag the example predictions that are political promises.
insert into public.prediction_tags (prediction_id, tag_id)
select p.id, 'promesse-politiche'
from public.predictions p
where p.legacy_id in (
    'seed-v3-ponte-stretto-cantieri',
    'seed-v3-terzo-valico-scavi',
    'seed-v8-tav-2002-ratifica-italia',
    'seed-v8-tav-2002-fine-lavori-2012'
)
on conflict do nothing;

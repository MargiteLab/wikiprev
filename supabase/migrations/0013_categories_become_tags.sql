-- WikiPrev: categories become tags. A prediction no longer has one category
-- but one or more tags.
--
-- * Every category becomes a tag with the same name (an existing tag with that
--   name, e.g. "Tecnologia", is reused) and keeps its icon.
-- * Every prediction gets the tag of its category, so nothing is lost.
-- * predictions.category_id stays as history but is no longer required;
--   new predictions are saved with add_tagged_prediction() and have none.
-- * Requires 0009 (tags).

alter table public.tags add column icon text not null default 'fa-hashtag'
    check (icon ~ '^fa-[a-z0-9-]+$');

do $$
declare
    c     record;
    v_tag text;
begin
    for c in select id, label, icon from public.categories order by sort_order loop
        v_tag := public.tag_id_for(c.label);
        update public.tags set icon = c.icon where id = v_tag and icon = 'fa-hashtag';
        insert into public.prediction_tags (prediction_id, tag_id)
        select p.id, v_tag from public.predictions p where p.category_id = c.id
        on conflict do nothing;
    end loop;
end;
$$;

alter table public.predictions alter column category_id drop not null;

-- Submit a prediction with its tags (by name, at least one, at most 10).
create function public.add_tagged_prediction(
    p_contributor_name text,
    p_statement        text,
    p_details          text,
    p_person_name      text,
    p_outlet_name      text,
    p_source_url       text,
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
    v_contributor_id uuid;
    v_person_id      uuid;
    v_outlet_id      uuid;
    v_id             uuid;
    v_label          text;
begin
    if coalesce(array_length(p_tags, 1), 0) < 1 then
        raise exception 'Scegli almeno un tag.' using errcode = '22023';
    end if;
    if array_length(p_tags, 1) > 10 then
        raise exception 'Puoi indicare al massimo 10 tag.' using errcode = '22023';
    end if;

    v_contributor_id := contributor_id_for(p_contributor_name);

    if nullif(btrim(p_outlet_name), '') is null then
        raise exception 'Indica la fonte.' using errcode = '22023';
    end if;

    if nullif(btrim(p_person_name), '') is not null then
        insert into people (name, created_by) values (btrim(p_person_name), null)
            on conflict ((lower(btrim(name)))) do nothing;
        select id into v_person_id from people
            where lower(btrim(name)) = lower(btrim(p_person_name));
    end if;

    insert into outlets (name, created_by) values (btrim(p_outlet_name), null)
        on conflict ((lower(btrim(name)))) do nothing;
    select id into v_outlet_id from outlets
        where lower(btrim(name)) = lower(btrim(p_outlet_name));

    insert into predictions (statement, details, person_id, outlet_id, source_url,
                             made_on, due_on, contributor_id, created_by)
    values (btrim(p_statement), coalesce(btrim(p_details), ''), v_person_id, v_outlet_id,
            nullif(btrim(p_source_url), ''), p_made_on, p_due_on, v_contributor_id, auth.uid())
    returning id into v_id;

    foreach v_label in array p_tags loop
        insert into prediction_tags (prediction_id, tag_id)
        values (v_id, tag_id_for(v_label))
        on conflict do nothing;
    end loop;

    return v_id;
end;
$$;

revoke execute on function public.add_tagged_prediction(text, text, text, text, text, text, date, date, text[]) from public;
grant execute on function public.add_tagged_prediction(text, text, text, text, text, text, date, date, text[]) to anon, authenticated;

-- The view's tags now carry their icon: [{ "id", "label", "icon" }, ...].
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
        select jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label, 'icon', t.icon) order by t.label)
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

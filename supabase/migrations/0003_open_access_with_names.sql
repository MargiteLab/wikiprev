-- WikiPrev: open access without sign-in. Anyone with the site address can read
-- predictions and add or delete them by typing their name.
--
-- * Contributors are identified by the name they type (table contributors).
--   When sign-in comes back, contributors.profile_id can link a name to an
--   account without losing who uploaded what.
-- * Writes only go through two functions (submit_prediction, delete_prediction)
--   that validate input; the tables themselves stay read-only for visitors.
-- * Deleting still only hides a prediction, and prediction_history keeps every
--   version, so anything can be restored.

-- ---------------------------------------------------------------------------
-- Contributors: who uploads predictions.
-- ---------------------------------------------------------------------------
create table public.contributors (
    id         uuid primary key default gen_random_uuid(),
    name       text not null check (length(btrim(name)) between 1 and 80),
    profile_id uuid unique references public.profiles (id) on delete set null,
    created_at timestamptz not null default now()
);

create unique index contributors_name_key on public.contributors (lower(btrim(name)));

alter table public.predictions
    add column contributor_id            uuid references public.contributors (id),
    add column deleted_by_contributor_id uuid references public.contributors (id);

create index predictions_contributor_id_idx on public.predictions (contributor_id);

-- Find a contributor by name (case-insensitive), creating it if needed.
create function public.contributor_id_for(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid;
begin
    if nullif(btrim(p_name), '') is null then
        raise exception 'Scrivi il tuo nome.' using errcode = '22023';
    end if;
    if length(btrim(p_name)) > 80 then
        raise exception 'Il nome può avere al massimo 80 caratteri.' using errcode = '22023';
    end if;
    insert into contributors (name) values (btrim(p_name))
        on conflict ((lower(btrim(name)))) do nothing;
    select id into v_id from contributors where lower(btrim(name)) = lower(btrim(p_name));
    return v_id;
end;
$$;

revoke execute on function public.contributor_id_for(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Writing: add and delete by name.
-- ---------------------------------------------------------------------------
create function public.submit_prediction(
    p_contributor_name text,
    p_statement        text,
    p_details          text,
    p_person_name      text,
    p_outlet_name      text,
    p_source_url       text,
    p_category_id      text,
    p_made_on          date,
    p_due_on           date
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
begin
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
                             category_id, made_on, due_on, contributor_id, created_by)
    values (btrim(p_statement), coalesce(btrim(p_details), ''), v_person_id, v_outlet_id,
            nullif(btrim(p_source_url), ''), p_category_id, p_made_on, p_due_on,
            v_contributor_id, auth.uid())
    returning id into v_id;

    return v_id;
end;
$$;

create function public.delete_prediction(p_id uuid, p_contributor_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_contributor_id uuid;
begin
    v_contributor_id := contributor_id_for(p_contributor_name);
    update predictions
       set deleted_at = now(),
           deleted_by_contributor_id = v_contributor_id
     where id = p_id
       and deleted_at is null;
    if not found then
        raise exception 'Previsione non trovata o già eliminata.' using errcode = 'P0002';
    end if;
end;
$$;

revoke execute on function public.submit_prediction(text, text, text, text, text, text, text, date, date) from public;
revoke execute on function public.delete_prediction(uuid, text) from public;
grant execute on function public.submit_prediction(text, text, text, text, text, text, text, date, date) to anon, authenticated;
grant execute on function public.delete_prediction(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reading: open to visitors (role anon) as well.
-- ---------------------------------------------------------------------------
alter table public.contributors enable row level security;

create policy "members read contributors" on public.contributors for select to authenticated using (true);
create policy "anyone reads contributors" on public.contributors for select to anon using (true);
create policy "anyone reads profiles"     on public.profiles     for select to anon using (true);
create policy "anyone reads categories"   on public.categories   for select to anon using (true);
create policy "anyone reads people"       on public.people       for select to anon using (true);
create policy "anyone reads outlets"      on public.outlets      for select to anon using (true);
create policy "anyone reads predictions"  on public.predictions  for select to anon using (true);
create policy "anyone reads history"      on public.prediction_history for select to anon using (true);

grant select on public.contributors, public.profiles, public.categories, public.people, public.outlets,
                public.predictions, public.prediction_history to anon;

-- The view now shows the contributor's name (or the account name, if any).
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
    p.legacy_id
from public.predictions p
join public.outlets o         on o.id = p.outlet_id
left join public.people pe    on pe.id = p.person_id
left join public.contributors c on c.id = p.contributor_id
left join public.profiles pr  on pr.id = p.created_by
where p.deleted_at is null;

grant select on public.predictions_view to anon, authenticated;

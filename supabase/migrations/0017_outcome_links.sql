-- WikiPrev: "Com'è andata". Anyone can attach one or more links to news that
-- show how a prediction went: usually after its due date, but also before it
-- if the outcome is already known. Only links (with an optional short note)
-- are stored, no verdict: the reader judges from the sources.
--
-- * A link is added by name, like a prediction. The same link cannot be
--   attached twice to one prediction.
-- * Only the administrator removes a link (it is hidden, not erased).
-- * predictions_view gets a new column outcome_links:
--   [{ "id", "url", "note", "added_by", "created_at" }, ...] oldest first.
-- * Requires 0004 (admin code) and 0013 (view with tag icons).

create table public.outcome_links (
    id             uuid primary key default gen_random_uuid(),
    prediction_id  uuid not null references public.predictions (id) on delete cascade,
    url            text not null check (url ~* '^https?://[^\s]+$' and length(url) <= 2000),
    note           text not null default '' check (length(note) <= 300),
    contributor_id uuid not null references public.contributors (id),
    created_at     timestamptz not null default now(),
    deleted_at     timestamptz
);

create index outcome_links_prediction_idx on public.outcome_links (prediction_id) where deleted_at is null;
create unique index outcome_links_unique_url on public.outcome_links (prediction_id, lower(url)) where deleted_at is null;

-- Reading: open to everyone; writing only through the functions below.
alter table public.outcome_links enable row level security;
create policy "anyone reads outcome links" on public.outcome_links for select to anon, authenticated using (true);
revoke all on public.outcome_links from anon, authenticated;
grant select on public.outcome_links to anon, authenticated;

create function public.add_outcome_link(
    p_prediction_id    uuid,
    p_contributor_name text,
    p_url              text,
    p_note             text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_url   text := btrim(coalesce(p_url, ''));
    v_note  text := btrim(coalesce(p_note, ''));
    v_id    uuid;
begin
    if not exists (select 1 from predictions where id = p_prediction_id and deleted_at is null) then
        raise exception 'Previsione non trovata o già eliminata.' using errcode = 'P0002';
    end if;
    if v_url !~* '^https?://[^\s]+$' or length(v_url) > 2000 then
        raise exception 'Il link deve iniziare con http:// o https://.' using errcode = '22023';
    end if;
    if length(v_note) > 300 then
        raise exception 'La nota può avere al massimo 300 caratteri.' using errcode = '22023';
    end if;
    if (select count(*) from outcome_links where prediction_id = p_prediction_id and deleted_at is null) >= 20 then
        raise exception 'Questa previsione ha già 20 link su com''è andata.' using errcode = '22023';
    end if;
    if exists (select 1 from outcome_links
                where prediction_id = p_prediction_id and lower(url) = lower(v_url) and deleted_at is null) then
        raise exception 'Questo link è già stato aggiunto.' using errcode = '23505';
    end if;

    insert into outcome_links (prediction_id, url, note, contributor_id)
    values (p_prediction_id, v_url, v_note, contributor_id_for(p_contributor_name))
    returning id into v_id;
    return v_id;
end;
$$;

revoke execute on function public.add_outcome_link(uuid, text, text, text) from public;
grant execute on function public.add_outcome_link(uuid, text, text, text) to anon, authenticated;

create function public.delete_outcome_link(p_id uuid, p_admin_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not is_admin_code(p_admin_code) then
        raise exception 'Solo l''amministratore può eliminare i link.' using errcode = '42501';
    end if;
    update outcome_links set deleted_at = now() where id = p_id and deleted_at is null;
    if not found then
        raise exception 'Link non trovato o già eliminato.' using errcode = 'P0002';
    end if;
end;
$$;

revoke execute on function public.delete_outcome_link(uuid, text) from public;
grant execute on function public.delete_outcome_link(uuid, text) to anon, authenticated;

-- Same view as in 0013, plus outcome_links.
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
    ), '[]'::jsonb) as tags,
    coalesce((
        select jsonb_agg(jsonb_build_object('id', l.id, 'url', l.url, 'note', l.note,
                                            'added_by', lc.name, 'created_at', l.created_at)
                         order by l.created_at)
        from public.outcome_links l
        join public.contributors lc on lc.id = l.contributor_id
        where l.prediction_id = p.id and l.deleted_at is null
    ), '[]'::jsonb) as outcome_links
from public.predictions p
join public.outlets o           on o.id = p.outlet_id
left join public.people pe      on pe.id = p.person_id
left join public.contributors c on c.id = p.contributor_id
left join public.profiles pr    on pr.id = p.created_by
where p.deleted_at is null;

grant select on public.predictions_view to anon, authenticated;

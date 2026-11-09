-- WikiPrev: tag synonyms, and "AI" merged into "Intelligenza artificiale".
--
-- tag_aliases maps alternative names to an existing tag: typing "AI" or "IA"
-- in the form now adds "Intelligenza artificiale" instead of creating a
-- duplicate. Add more rows (lowercase alias) to merge other synonyms.

create table public.tag_aliases (
    alias  text primary key check (alias = lower(btrim(alias)) and length(alias) between 1 and 40),
    tag_id text not null references public.tags (id)
);

alter table public.tag_aliases enable row level security;
create policy "anyone reads tag aliases" on public.tag_aliases for select to anon, authenticated using (true);
revoke all on public.tag_aliases from anon, authenticated;
grant select on public.tag_aliases to anon, authenticated;

insert into public.tags (id, label)
values ('intelligenza-artificiale', 'Intelligenza artificiale')
on conflict (id) do nothing;

insert into public.tag_aliases (alias, tag_id) values
    ('ai', 'intelligenza-artificiale'),
    ('ia', 'intelligenza-artificiale')
on conflict (alias) do nothing;

-- Move every prediction tagged "AI" to "Intelligenza artificiale", then drop "AI".
insert into public.prediction_tags (prediction_id, tag_id)
select pt.prediction_id, 'intelligenza-artificiale'
from public.prediction_tags pt
join public.tags t on t.id = pt.tag_id
where lower(t.label) in (select alias from public.tag_aliases where tag_id = 'intelligenza-artificiale')
on conflict do nothing;

delete from public.prediction_tags pt
using public.tags t
where t.id = pt.tag_id
  and t.id <> 'intelligenza-artificiale'
  and lower(t.label) in (select alias from public.tag_aliases where tag_id = 'intelligenza-artificiale');

delete from public.tags t
where t.id <> 'intelligenza-artificiale'
  and lower(t.label) in (select alias from public.tag_aliases where tag_id = 'intelligenza-artificiale');

-- Same as in 0009, but synonyms are resolved first.
create or replace function public.tag_id_for(p_label text)
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
        raise exception 'Il nome di un tag deve avere tra 2 e 40 caratteri.' using errcode = '22023';
    end if;

    select tag_id into v_id from tag_aliases where alias = lower(v_label);
    if found then
        return v_id;
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

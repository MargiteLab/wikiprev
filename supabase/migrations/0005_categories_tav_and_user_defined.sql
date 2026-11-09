-- WikiPrev: TAV category, and visitors can add new categories from the site.
--
-- Categories are matched by name ignoring case, so "Sanità" and "sanità" are
-- the same category. A new category gets an id derived from its name
-- ("Opere pubbliche" -> "opere-pubbliche") and the generic tag icon.
-- Renaming or removing a category is done from the Supabase Table Editor.

insert into public.categories (id, label, icon, sort_order)
values ('tav', 'TAV', 'fa-train', 70)
on conflict (id) do nothing;

create unique index categories_label_key on public.categories (lower(label));

create function public.add_category(p_label text)
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
        raise exception 'Il nome della categoria deve avere tra 2 e 40 caratteri.' using errcode = '22023';
    end if;

    select id into v_id from categories where lower(label) = lower(v_label);
    if found then
        return v_id;
    end if;

    -- Same rule as categoryIdFor() in js/model.js.
    v_base := lower(translate(v_label,
        'àáâãäåèéêëìíîïòóôõöùúûüçñÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑ',
        'aaaaaaeeeeiiiiooooouuuucnaaaaaaeeeeiiiiooooouuuucn'));
    v_base := btrim(regexp_replace(v_base, '[^a-z0-9]+', '-', 'g'), '-');
    if v_base !~ '^[a-z]' then
        v_base := rtrim('cat-' || v_base, '-');
    end if;

    v_id := v_base;
    while exists (select 1 from categories where id = v_id) loop
        v_n := v_n + 1;
        v_id := v_base || '-' || v_n;
    end loop;

    insert into categories (id, label, icon, sort_order)
    values (v_id, v_label, 'fa-tag', (select coalesce(max(sort_order), 0) + 10 from categories));

    return v_id;
end;
$$;

revoke execute on function public.add_category(text) from public;
grant execute on function public.add_category(text) to anon, authenticated;

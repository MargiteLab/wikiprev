-- WikiPrev: initial database schema (Supabase / PostgreSQL).
--
-- Rules for future changes, so existing data is never lost:
--   * Never edit a migration that has already been applied. Add a new
--     numbered file (0002_..., 0003_...) instead.
--   * Prefer adding columns/tables to renaming or dropping them.
--   * Rows are never physically deleted from the app: predictions are
--     soft-deleted (deleted_at) and every change is kept in prediction_history.
--
-- Access model: only signed-in users can read or write. Keep "Allow new users
-- to sign up" DISABLED in Supabase (Authentication > Sign In / Providers) and
-- invite collaborators from Authentication > Users > Invite user.

-- ---------------------------------------------------------------------------
-- Profiles: one row per signed-in user (the people who upload predictions).
-- ---------------------------------------------------------------------------
create table public.profiles (
    id           uuid primary key references auth.users (id) on delete cascade,
    display_name text not null check (length(btrim(display_name)) between 1 and 80),
    created_at   timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, display_name)
    values (
        new.id,
        coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
                 split_part(new.email, '@', 1))
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Categories: a table, so new ones can be added without changing the code.
-- ---------------------------------------------------------------------------
create table public.categories (
    id         text primary key check (id ~ '^[a-z][a-z0-9-]*$'),
    label      text not null,
    icon       text not null default 'fa-tag',
    sort_order integer not null default 0
);

insert into public.categories (id, label, icon, sort_order) values
    ('politics',       'Politica',       'fa-landmark',   10),
    ('economics',      'Economia',       'fa-chart-line', 20),
    ('technology',     'Tecnologia',     'fa-microchip',  30),
    ('sports',         'Sport',          'fa-running',    40),
    ('science',        'Scienza',        'fa-flask',      50),
    ('infrastructure', 'Infrastrutture', 'fa-road',       60);

-- ---------------------------------------------------------------------------
-- People: who makes predictions (a person, an organization or a group).
-- Kept separate from predictions so statistics per person are reliable.
-- ---------------------------------------------------------------------------
create table public.people (
    id         uuid primary key default gen_random_uuid(),
    name       text not null check (length(btrim(name)) between 1 and 160),
    kind       text not null default 'unknown'
               check (kind in ('person', 'organization', 'group', 'unknown')),
    notes      text not null default '',
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (id) on delete set null default auth.uid()
);

create unique index people_name_key on public.people (lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- Outlets: where a prediction was published (newspaper, website, TV show...).
-- ---------------------------------------------------------------------------
create table public.outlets (
    id         uuid primary key default gen_random_uuid(),
    name       text not null check (length(btrim(name)) between 1 and 160),
    website    text check (website is null or website ~* '^https?://'),
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (id) on delete set null default auth.uid()
);

create unique index outlets_name_key on public.outlets (lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- Predictions.
-- ---------------------------------------------------------------------------
create table public.predictions (
    id          uuid primary key default gen_random_uuid(),
    statement   text not null check (length(btrim(statement)) between 1 and 300),
    details     text not null default '' check (length(details) <= 4000),
    person_id   uuid references public.people (id),
    outlet_id   uuid not null references public.outlets (id),
    source_url  text check (source_url is null or source_url ~* '^https?://'),
    category_id text not null references public.categories (id),
    made_on     date,
    due_on      date not null,

    created_at  timestamptz not null default now(),
    created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
    updated_at  timestamptz not null default now(),
    updated_by  uuid references public.profiles (id) on delete set null,
    deleted_at  timestamptz,
    deleted_by  uuid references public.profiles (id) on delete set null,

    -- Identifier used by earlier versions of the site (e.g. the bundled
    -- example predictions), so imports can be repeated safely.
    legacy_id   text unique,

    constraint predictions_dates_check check (made_on is null or made_on <= due_on)
);

create index predictions_due_on_idx     on public.predictions (due_on) where deleted_at is null;
create index predictions_person_id_idx  on public.predictions (person_id);
create index predictions_outlet_id_idx  on public.predictions (outlet_id);
create index predictions_created_by_idx on public.predictions (created_by);

-- Keep bookkeeping columns consistent whatever the client sends.
create function public.predictions_before_write()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'INSERT' then
        new.created_at := now();
        new.updated_at := now();
        new.updated_by := null;
        new.deleted_at := null;
        new.deleted_by := null;
    else
        new.id         := old.id;
        new.created_at := old.created_at;
        new.created_by := old.created_by;
        new.legacy_id  := old.legacy_id;
        new.updated_at := now();
        new.updated_by := auth.uid();
        if new.deleted_at is not null and old.deleted_at is null then
            new.deleted_at := now();
            new.deleted_by := auth.uid();
        elsif new.deleted_at is null then
            new.deleted_by := null;
        end if;
    end if;
    return new;
end;
$$;

create trigger predictions_before_write
    before insert or update on public.predictions
    for each row execute function public.predictions_before_write();

-- ---------------------------------------------------------------------------
-- History: every insert and update of a prediction, with the full row.
-- ---------------------------------------------------------------------------
create table public.prediction_history (
    id            bigint generated always as identity primary key,
    prediction_id uuid not null,
    operation     text not null check (operation in ('insert', 'update', 'delete')),
    changed_at    timestamptz not null default now(),
    changed_by    uuid default auth.uid(),
    old_row       jsonb,
    new_row       jsonb
);

create index prediction_history_prediction_id_idx on public.prediction_history (prediction_id);

create function public.predictions_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.prediction_history (prediction_id, operation, old_row, new_row)
    values (
        coalesce(new.id, old.id),
        lower(tg_op),
        case when tg_op = 'INSERT' then null else to_jsonb(old) end,
        case when tg_op = 'DELETE' then null else to_jsonb(new) end
    );
    return null;
end;
$$;

create trigger predictions_log_change
    after insert or update or delete on public.predictions
    for each row execute function public.predictions_log_change();

-- ---------------------------------------------------------------------------
-- Read model used by the site: one row per visible prediction, with names.
-- ---------------------------------------------------------------------------
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
    pr.display_name as created_by_name,
    p.person_id,
    pe.name         as person_name,
    p.outlet_id,
    o.name          as outlet_name,
    p.legacy_id
from public.predictions p
join public.outlets o       on o.id = p.outlet_id
left join public.people pe  on pe.id = p.person_id
left join public.profiles pr on pr.id = p.created_by
where p.deleted_at is null;

-- ---------------------------------------------------------------------------
-- add_prediction: creates the person and outlet if they do not exist yet
-- (matching names case-insensitively) and inserts the prediction, atomically.
-- ---------------------------------------------------------------------------
create function public.add_prediction(
    p_statement   text,
    p_details     text,
    p_person_name text,
    p_outlet_name text,
    p_source_url  text,
    p_category_id text,
    p_made_on     date,
    p_due_on      date
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_person_id uuid;
    v_outlet_id uuid;
    v_id        uuid;
begin
    if auth.uid() is null then
        raise exception 'not signed in' using errcode = '42501';
    end if;

    if nullif(btrim(p_person_name), '') is not null then
        insert into people (name) values (btrim(p_person_name))
            on conflict ((lower(btrim(name)))) do nothing;
        select id into v_person_id from people
            where lower(btrim(name)) = lower(btrim(p_person_name));
    end if;

    insert into outlets (name) values (btrim(p_outlet_name))
        on conflict ((lower(btrim(name)))) do nothing;
    select id into v_outlet_id from outlets
        where lower(btrim(name)) = lower(btrim(p_outlet_name));

    insert into predictions (statement, details, person_id, outlet_id, source_url,
                             category_id, made_on, due_on)
    values (btrim(p_statement), coalesce(btrim(p_details), ''), v_person_id, v_outlet_id,
            nullif(btrim(p_source_url), ''), p_category_id, p_made_on, p_due_on)
    returning id into v_id;

    return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security: signed-in users only. No delete policies, so rows can
-- only be soft-deleted.
-- ---------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.categories         enable row level security;
alter table public.people             enable row level security;
alter table public.outlets            enable row level security;
alter table public.predictions        enable row level security;
alter table public.prediction_history enable row level security;

create policy "members read profiles"   on public.profiles   for select to authenticated using (true);
create policy "members edit own profile" on public.profiles  for update to authenticated
    using (id = auth.uid()) with check (id = auth.uid());

create policy "members read categories" on public.categories for select to authenticated using (true);

create policy "members read people"   on public.people  for select to authenticated using (true);
create policy "members add people"    on public.people  for insert to authenticated with check (true);
create policy "members edit people"   on public.people  for update to authenticated using (true) with check (true);

create policy "members read outlets"  on public.outlets for select to authenticated using (true);
create policy "members add outlets"   on public.outlets for insert to authenticated with check (true);
create policy "members edit outlets"  on public.outlets for update to authenticated using (true) with check (true);

create policy "members read predictions" on public.predictions for select to authenticated using (true);
create policy "members add predictions"  on public.predictions for insert to authenticated
    with check (created_by = auth.uid());
create policy "members edit predictions" on public.predictions for update to authenticated
    using (true) with check (true);

create policy "members read history" on public.prediction_history for select to authenticated using (true);

revoke all on all tables in schema public from anon;
revoke execute on function public.add_prediction(text, text, text, text, text, text, date, date) from public, anon;
grant execute on function public.add_prediction(text, text, text, text, text, text, date, date) to authenticated;

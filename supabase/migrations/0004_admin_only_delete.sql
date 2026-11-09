-- WikiPrev: only the administrator can delete predictions.
--
-- There is no sign-in, so the administrator is recognised by a secret code.
-- Only a hash of the code is stored. Set or change it from the Supabase
-- SQL Editor (it cannot be called from the site):
--
--     select public.set_admin_code('a-long-secret-code-of-your-choice');
--
-- Deleting still only hides a prediction; prediction_history keeps it.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.admin_settings (
    id               boolean primary key default true check (id),  -- a single row
    delete_code_hash text not null,
    updated_at       timestamptz not null default now()
);

-- No policies: not readable or writable through the API.
alter table public.admin_settings enable row level security;
revoke all on public.admin_settings from anon, authenticated;

create function public.set_admin_code(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if length(coalesce(p_code, '')) < 12 then
        raise exception 'Il codice deve avere almeno 12 caratteri.' using errcode = '22023';
    end if;
    insert into admin_settings (id, delete_code_hash, updated_at)
    values (true, extensions.crypt(p_code, extensions.gen_salt('bf')), now())
    on conflict (id) do update
        set delete_code_hash = excluded.delete_code_hash,
            updated_at       = excluded.updated_at;
end;
$$;

revoke execute on function public.set_admin_code(text) from public, anon, authenticated;

-- Lets the site check a code before showing the delete buttons.
create function public.is_admin_code(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(p_code, '') <> ''
       and exists (
           select 1 from admin_settings
            where delete_code_hash = extensions.crypt(p_code, delete_code_hash)
       );
$$;

revoke execute on function public.is_admin_code(text) from public;
grant execute on function public.is_admin_code(text) to anon, authenticated;

-- Deleting now requires the administrator code instead of a name.
drop function public.delete_prediction(uuid, text);

create function public.delete_prediction(p_id uuid, p_admin_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not is_admin_code(p_admin_code) then
        raise exception 'Solo l''amministratore può eliminare le previsioni.' using errcode = '42501';
    end if;
    update predictions
       set deleted_at = now()
     where id = p_id
       and deleted_at is null;
    if not found then
        raise exception 'Previsione non trovata o già eliminata.' using errcode = 'P0002';
    end if;
end;
$$;

revoke execute on function public.delete_prediction(uuid, text) from public;
grant execute on function public.delete_prediction(uuid, text) to anon, authenticated;

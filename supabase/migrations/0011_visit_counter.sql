-- WikiPrev: simple, privacy-friendly visit counter.
--
-- What is stored per page load: time, a random session id (kept by the
-- browser only while the tab is open, so it cannot follow a person over
-- time), the referring site's host name (e.g. "t.me", "www.google.com")
-- and the device type. No IP address, no cookies, no persistent identifier.
-- Only the administrator can read the statistics, through visit_stats().

create table public.page_visits (
    id            bigint generated always as identity primary key,
    visited_at    timestamptz not null default now(),
    session_id    uuid not null,
    referrer_host text check (referrer_host is null or length(referrer_host) <= 100),
    device        text not null default 'other' check (device in ('mobile', 'tablet', 'desktop', 'other'))
);

create index page_visits_visited_at_idx on public.page_visits (visited_at);

alter table public.page_visits enable row level security;   -- no policies: not readable via the API
revoke all on public.page_visits from anon, authenticated;

create function public.log_visit(p_session_id uuid, p_referrer_host text, p_device text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_session_id is null then
        return;
    end if;
    insert into page_visits (session_id, referrer_host, device)
    values (
        p_session_id,
        nullif(left(lower(btrim(coalesce(p_referrer_host, ''))), 100), ''),
        case when p_device in ('mobile', 'tablet', 'desktop') then p_device else 'other' end
    );
end;
$$;

revoke execute on function public.log_visit(uuid, text, text) from public;
grant execute on function public.log_visit(uuid, text, text) to anon, authenticated;

-- Statistics for the last p_days days (Italian time), for the administrator.
create function public.visit_stats(p_admin_code text, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_from timestamptz;
begin
    if not is_admin_code(p_admin_code) then
        raise exception 'Solo l''amministratore può vedere le statistiche.' using errcode = '42501';
    end if;
    v_from := date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome'
              - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)) - 1);

    return jsonb_build_object(
        'from', (v_from at time zone 'Europe/Rome')::date,
        'visits', (select count(distinct session_id) from page_visits where visited_at >= v_from),
        'page_views', (select count(*) from page_visits where visited_at >= v_from),
        'days', coalesce((
            select jsonb_agg(jsonb_build_object('day', d, 'visits', v, 'page_views', pv) order by d desc)
            from (
                select (visited_at at time zone 'Europe/Rome')::date as d,
                       count(distinct session_id) as v,
                       count(*) as pv
                from page_visits where visited_at >= v_from
                group by 1
            ) x), '[]'::jsonb),
        'sources', coalesce((
            select jsonb_agg(jsonb_build_object('source', s, 'visits', v) order by v desc, s)
            from (
                select coalesce(referrer_host, 'diretto') as s, count(distinct session_id) as v
                from page_visits where visited_at >= v_from
                group by 1
                order by 2 desc
                limit 10
            ) x), '[]'::jsonb),
        'devices', coalesce((
            select jsonb_object_agg(device, v)
            from (
                select device, count(distinct session_id) as v
                from page_visits where visited_at >= v_from
                group by 1
            ) x), '{}'::jsonb)
    );
end;
$$;

revoke execute on function public.visit_stats(text, integer) from public;
grant execute on function public.visit_stats(text, integer) to anon, authenticated;

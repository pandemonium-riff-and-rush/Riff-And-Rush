-- =====================================================================
-- Riff&Rush · 0002 · Reportes, revisión manual, charts verificados
-- y ranking global solo con charts confiables.
-- =====================================================================

-- Administradores (solo se cambia desde el SQL Editor, nunca desde el cliente)
alter table public.profiles add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Charts verificados (lo marca un admin; el dueño no puede)
-- ---------------------------------------------------------------------
alter table public.charts add column if not exists verified boolean not null default false;

revoke insert, update on public.charts from anon, authenticated;
grant insert (id, owner, title, artist, data, published) on public.charts to authenticated;
grant update (id, title, artist, data, published) on public.charts to authenticated;

drop policy if exists "admins ven todos los charts" on public.charts;
create policy "admins ven todos los charts" on public.charts for select using (public.is_admin());

-- Si el dueño cambia las notas, el chart pierde el sello (hay que revisarlo de nuevo)
create or replace function public.charts_unverify_on_edit()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.data is distinct from old.data and not public.is_admin() then new.verified := false; end if;
  return new;
end $$;
drop trigger if exists charts_unverify on public.charts;
create trigger charts_unverify before update on public.charts
  for each row execute function public.charts_unverify_on_edit();

create or replace function public.admin_set_chart(p_id text, p_verified boolean default null, p_published boolean default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo administradores'; end if;
  update public.charts
     set verified = coalesce(p_verified, verified),
         published = coalesce(p_published, published)
   where id = p_id;
end $$;
revoke execute on function public.admin_set_chart(text, boolean, boolean) from public, anon;
grant execute on function public.admin_set_chart(text, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Reportes de canciones
-- ---------------------------------------------------------------------
create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  chart_id    text not null,
  chart_title text not null default '',
  reporter    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  reason      text not null check (reason in ('desfasado','video','mala_calidad','copia','ofensivo','otro')),
  details     text not null default '' check (char_length(details) <= 1000),
  status      text not null default 'abierto' check (status in ('abierto','resuelto','descartado')),
  created_at  timestamptz not null default now()
);
create index if not exists reports_open on public.reports (status, created_at desc);
create index if not exists reports_reporter on public.reports (reporter);
create unique index if not exists reports_once_per_user on public.reports (chart_id, reporter) where status = 'abierto';

alter table public.reports enable row level security;

drop policy if exists "reportar" on public.reports;
create policy "reportar" on public.reports for insert to authenticated
  with check (reporter = (select auth.uid()));

drop policy if exists "ver mis reportes o todos si admin" on public.reports;
create policy "ver mis reportes o todos si admin" on public.reports for select
  using (reporter = (select auth.uid()) or public.is_admin());

drop policy if exists "admin gestiona reportes" on public.reports;
create policy "admin gestiona reportes" on public.reports for update
  using (public.is_admin()) with check (public.is_admin());

revoke update on public.reports from anon, authenticated;
grant update (status) on public.reports to authenticated;

-- ---------------------------------------------------------------------
-- Ranking global: solo cuentan charts de la casa (demo) o verificados.
-- Evita que alguien publique un chart con miles de notas para inflar su puntaje.
-- ---------------------------------------------------------------------
-- Charts oficiales de la casa (los que vienen con el juego)
create table if not exists public.house_charts (id text primary key);
alter table public.house_charts enable row level security;
drop policy if exists "ver charts de la casa" on public.house_charts;
create policy "ver charts de la casa" on public.house_charts for select using (true);
insert into public.house_charts (id) values
  ('neon-en-la-ruta'),('hielo-seco'),('marea-alta'),('tormenta-de-arena'),('ultima-estacion'),('ciudad-dormida'),('cuerdas-de-acero'),('kilometro-cero'),
  ('hoshizora-drive'),('kaze-no-kiseki'),('mirai-shounen'),('sakura-overdrive'),('hierro-y-fuego'),('luces-de-neon')
on conflict do nothing;

create or replace function public.chart_counts_for_global(p_chart text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.house_charts h where h.id = p_chart)
      or exists (select 1 from public.charts c where c.id = p_chart and c.verified and c.published);
$$;
revoke execute on function public.chart_counts_for_global(text) from public, anon, authenticated;

create or replace function public.global_leaderboard(p_period text default 'week', p_limit int default 50)
returns table (pos bigint, user_id uuid, username text, color text, country text, level int, total bigint, songs bigint, accuracy real)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (s.user_id, s.chart_id, s.difficulty) s.user_id, s.score, s.accuracy
      from public.scores s
     where s.created_at >= public.period_start(p_period) and public.chart_counts_for_global(s.chart_id)
     order by s.user_id, s.chart_id, s.difficulty, s.score desc
  ), agg as (
    select b.user_id, sum(b.score)::bigint as total, count(*)::bigint as songs, avg(b.accuracy)::real as accuracy
      from best b group by b.user_id
  )
  select rank() over (order by a.total desc), a.user_id, p.username, p.color, p.country, p.level, a.total, a.songs, a.accuracy
    from agg a join public.profiles p on p.id = a.user_id
   order by a.total desc
   limit least(p_limit, 200);
$$;

create or replace function public.my_global_rank(p_period text default 'week')
returns table (pos bigint, total bigint, songs bigint)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (s.user_id, s.chart_id, s.difficulty) s.user_id, s.score
      from public.scores s
     where s.created_at >= public.period_start(p_period) and public.chart_counts_for_global(s.chart_id)
     order by s.user_id, s.chart_id, s.difficulty, s.score desc
  ), agg as (
    select b.user_id, sum(b.score)::bigint as total, count(*)::bigint as songs from best b group by b.user_id
  ), ranked as (
    select a.*, rank() over (order by a.total desc) as pos from agg a
  )
  select r.pos, r.total, r.songs from ranked r where r.user_id = auth.uid();
$$;

grant execute on function public.global_leaderboard(text, int) to anon, authenticated;
grant execute on function public.my_global_rank(text) to authenticated;

-- Para hacerte admin (cambia el nombre):
-- update public.profiles set is_admin = true where username = 'TU_NOMBRE';

revoke execute on function public.charts_unverify_on_edit() from public, anon, authenticated;

-- =====================================================================
-- Riff&Rush · 0001 · Usuarios, niveles, charts en la nube y puntajes
-- Pégalo completo en Supabase → SQL Editor → Run. Se puede correr de nuevo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Perfiles (1 por usuario de auth)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text,
  color         text not null default '#7E22CE',
  country       text,
  xp            integer not null default 0,
  level         integer not null default 1,
  plays         integer not null default 0,
  is_supporter  boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint username_format check (username is null or username ~ '^[A-Za-z0-9_.]{3,20}$'),
  constraint color_format check (color ~ '^#[0-9A-Fa-f]{6}$')
);
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

alter table public.profiles enable row level security;

drop policy if exists "perfiles visibles para todos" on public.profiles;
create policy "perfiles visibles para todos" on public.profiles for select using (true);

drop policy if exists "cada uno edita su perfil" on public.profiles;
create policy "cada uno edita su perfil" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- El cliente solo puede cambiar estas columnas (xp, nivel, etc. los maneja el servidor)
revoke update on public.profiles from anon, authenticated;
grant update (username, color, country) on public.profiles to authenticated;

-- Crear el perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wanted text := new.raw_user_meta_data ->> 'username';
begin
  if wanted is null or wanted !~ '^[A-Za-z0-9_.]{3,20}$'
     or exists (select 1 from public.profiles where lower(username) = lower(wanted)) then
    wanted := null;
  end if;
  insert into public.profiles (id, username) values (new.id, wanted)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Perfiles para usuarios que ya existían antes de correr este script
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;

-- ¿Está libre este nombre? (para validar en el formulario)
create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(p_username));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Niveles: nivel = floor(sqrt(xp / 50)) + 1  (nivel 2 = 50 xp, 5 = 800, 10 = 4.050, 20 = 18.050)
-- ---------------------------------------------------------------------
create or replace function public.level_for_xp(p_xp integer)
returns integer language sql immutable set search_path = public as $$
  select floor(sqrt(greatest(p_xp, 0) / 50.0))::int + 1;
$$;

-- ---------------------------------------------------------------------
-- Charts en la nube
-- ---------------------------------------------------------------------
create table if not exists public.charts (
  id          text primary key,
  owner       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title       text not null,
  artist      text not null default '',
  data        jsonb not null,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint chart_size check (pg_column_size(data) < 2000000)
);
create index if not exists charts_owner on public.charts (owner);
create index if not exists charts_published on public.charts (published, updated_at desc);

alter table public.charts enable row level security;

drop policy if exists "ver charts publicados o propios" on public.charts;
create policy "ver charts publicados o propios" on public.charts for select
  using (published or owner = (select auth.uid()));

drop policy if exists "crear charts propios" on public.charts;
create policy "crear charts propios" on public.charts for insert
  with check (owner = (select auth.uid()));

drop policy if exists "editar charts propios" on public.charts;
create policy "editar charts propios" on public.charts for update
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

drop policy if exists "borrar charts propios" on public.charts;
create policy "borrar charts propios" on public.charts for delete
  using (owner = (select auth.uid()));

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists charts_touch on public.charts;
create trigger charts_touch before update on public.charts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Puntajes (cada partida terminada)
-- ---------------------------------------------------------------------
create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  chart_id    text not null,
  difficulty  text not null check (difficulty in ('easy','medium','hard','expert','legend')),
  score       integer not null check (score between 0 and 20000000),
  accuracy    real not null check (accuracy between 0 and 1),
  stars       smallint not null check (stars between 0 and 5),
  max_combo   integer not null default 0 check (max_combo >= 0),
  xp_gained   integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists scores_chart on public.scores (chart_id, difficulty, created_at desc);
create index if not exists scores_user on public.scores (user_id, created_at desc);
create index if not exists scores_time on public.scores (created_at desc);

alter table public.scores enable row level security;

drop policy if exists "puntajes visibles para todos" on public.scores;
create policy "puntajes visibles para todos" on public.scores for select using (true);

drop policy if exists "subir puntajes propios" on public.scores;
create policy "subir puntajes propios" on public.scores for insert
  with check (user_id = (select auth.uid()));

-- XP por partida y máximo 1 partida cada 20 s por usuario (freno básico contra spam)
create or replace function public.on_score_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  diff_bonus int := case new.difficulty when 'easy' then 0 when 'medium' then 5 when 'hard' then 10 when 'expert' then 15 else 20 end;
  gain int;
begin
  if exists (select 1 from public.scores where user_id = new.user_id and created_at > now() - interval '20 seconds') then
    raise exception 'Espera un momento antes de subir otra partida';
  end if;
  gain := 10 + diff_bonus + new.stars * 5 + least(new.score / 5000, 40);
  new.xp_gained := gain;
  new.created_at := now();
  update public.profiles
     set xp = xp + gain,
         plays = plays + 1,
         level = public.level_for_xp(xp + gain)
   where id = new.user_id;
  return new;
end $$;

drop trigger if exists scores_before_insert on public.scores;
create trigger scores_before_insert before insert on public.scores
  for each row execute function public.on_score_insert();

-- ---------------------------------------------------------------------
-- Rankings (semana = desde el lunes, hora de Chile)
-- ---------------------------------------------------------------------
create or replace function public.period_start(p_period text)
returns timestamptz language sql stable set search_path = public as $$
  select case p_period
    when 'week'  then date_trunc('week',  now() at time zone 'America/Santiago') at time zone 'America/Santiago'
    when 'month' then date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago'
    when 'year'  then date_trunc('year',  now() at time zone 'America/Santiago') at time zone 'America/Santiago'
    else '-infinity'::timestamptz
  end;
$$;

-- Ranking de una canción + dificultad: mejor puntaje de cada jugador en el período
create or replace function public.chart_leaderboard(p_chart text, p_diff text, p_period text default 'week', p_limit int default 50)
returns table (pos bigint, user_id uuid, username text, color text, country text, level int, score int, accuracy real, stars smallint)
language sql stable set search_path = public as $$
  with best as (
    select distinct on (s.user_id) s.user_id, s.score, s.accuracy, s.stars
      from public.scores s
     where s.chart_id = p_chart and s.difficulty = p_diff and s.created_at >= public.period_start(p_period)
     order by s.user_id, s.score desc
  )
  select rank() over (order by b.score desc), b.user_id, p.username, p.color, p.country, p.level, b.score, b.accuracy, b.stars
    from best b join public.profiles p on p.id = b.user_id
   order by b.score desc
   limit p_limit;
$$;

-- Ranking global: suma de los mejores puntajes de cada jugador (uno por canción y dificultad)
create or replace function public.global_leaderboard(p_period text default 'week', p_limit int default 50)
returns table (pos bigint, user_id uuid, username text, color text, country text, level int, total bigint, songs bigint, accuracy real)
language sql stable set search_path = public as $$
  with best as (
    select distinct on (s.user_id, s.chart_id, s.difficulty) s.user_id, s.score, s.accuracy
      from public.scores s
     where s.created_at >= public.period_start(p_period)
     order by s.user_id, s.chart_id, s.difficulty, s.score desc
  ), agg as (
    select b.user_id, sum(b.score)::bigint as total, count(*)::bigint as songs, avg(b.accuracy)::real as accuracy
      from best b group by b.user_id
  )
  select rank() over (order by a.total desc), a.user_id, p.username, p.color, p.country, p.level, a.total, a.songs, a.accuracy
    from agg a join public.profiles p on p.id = a.user_id
   order by a.total desc
   limit p_limit;
$$;

-- Tu posición en el ranking global (aunque no estés en el top)
create or replace function public.my_global_rank(p_period text default 'week')
returns table (pos bigint, total bigint, songs bigint)
language sql stable set search_path = public as $$
  with best as (
    select distinct on (s.user_id, s.chart_id, s.difficulty) s.user_id, s.score
      from public.scores s
     where s.created_at >= public.period_start(p_period)
     order by s.user_id, s.chart_id, s.difficulty, s.score desc
  ), agg as (
    select b.user_id, sum(b.score)::bigint as total, count(*)::bigint as songs from best b group by b.user_id
  ), ranked as (
    select a.*, rank() over (order by a.total desc) as pos from agg a
  )
  select r.pos, r.total, r.songs from ranked r where r.user_id = auth.uid();
$$;

grant execute on function public.chart_leaderboard(text, text, text, int) to anon, authenticated;
grant execute on function public.global_leaderboard(text, int) to anon, authenticated;
grant execute on function public.my_global_rank(text) to authenticated;

-- Las funciones de trigger no deben llamarse por la API
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.on_score_insert() from public, anon, authenticated;

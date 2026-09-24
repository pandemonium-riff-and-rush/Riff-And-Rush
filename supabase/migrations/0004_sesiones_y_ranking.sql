-- =====================================================================
-- Riff&Rush · 0004 · Sesiones de partida, mods guardados, registro privado
-- y ranking global normalizado. Se puede correr de nuevo.
-- Después de correrlo, vuelve a desplegar la función:  supabase functions deploy submit-score
-- =====================================================================

-- ---------------------------------------------------------------------
-- Sesiones de partida: el juego pide una al empezar y submit-score la exige.
-- Impide subir partidas fabricadas en segundos o reutilizar una misma partida.
-- ---------------------------------------------------------------------
create table if not exists public.play_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  chart_id    text not null,
  difficulty  text not null check (difficulty in ('easy','medium','hard','expert','legend')),
  started_at  timestamptz not null default now(),
  used_at     timestamptz
);
create index if not exists play_sessions_user on public.play_sessions (user_id, started_at desc);

-- Sin políticas: el cliente no la toca directo, solo vía start_play (y el service role)
alter table public.play_sessions enable row level security;
revoke all on public.play_sessions from anon, authenticated;

create or replace function public.start_play(p_chart text, p_diff text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  sid uuid;
begin
  if me is null then raise exception 'Necesitas iniciar sesión'; end if;
  if p_diff not in ('easy','medium','hard','expert','legend') then raise exception 'Dificultad inválida'; end if;
  if char_length(coalesce(p_chart, '')) not between 1 and 200 then raise exception 'Chart inválido'; end if;
  if (select count(*) from public.play_sessions where user_id = me and started_at > now() - interval '1 minute') >= 10 then
    raise exception 'Demasiadas partidas seguidas, espera un momento';
  end if;
  -- Limpieza: las sesiones de más de un día ya no sirven
  delete from public.play_sessions where user_id = me and started_at < now() - interval '1 day';
  insert into public.play_sessions (user_id, chart_id, difficulty) values (me, p_chart, p_diff) returning id into sid;
  return sid;
end $$;
revoke execute on function public.start_play(text, text) from public, anon;
grant execute on function public.start_play(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Puntajes: guardar mods y sesión; el registro de teclas deja de ser público
-- ---------------------------------------------------------------------
alter table public.scores add column if not exists mods text[] not null default '{}';
alter table public.scores add column if not exists session_id uuid;
create unique index if not exists scores_session on public.scores (session_id) where session_id is not null;

revoke select on public.scores from anon, authenticated;
grant select (id, user_id, chart_id, difficulty, score, accuracy, stars, max_combo, xp_gained, created_at, verified, mods)
  on public.scores to anon, authenticated;

-- ---------------------------------------------------------------------
-- Ranking global normalizado: cada canción+dificultad vale hasta 1.000 × peso,
-- según la precisión. Así una canción larga no pesa más que una corta.
-- ---------------------------------------------------------------------
create or replace function public.diff_weight(p_diff text)
returns numeric language sql immutable set search_path = public as $$
  select case p_diff when 'easy' then 1 when 'medium' then 1.5 when 'hard' then 2 when 'expert' then 3 when 'legend' then 4 else 1 end::numeric;
$$;

create or replace function public.global_leaderboard(p_period text default 'week', p_limit int default 50)
returns table (pos bigint, user_id uuid, username text, color text, country text, level int, total bigint, songs bigint, accuracy real)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (s.user_id, s.chart_id, s.difficulty) s.user_id, s.difficulty, s.accuracy
      from public.scores s
     where s.created_at >= public.period_start(p_period) and public.chart_counts_for_global(s.chart_id)
     order by s.user_id, s.chart_id, s.difficulty, s.accuracy desc, s.score desc
  ), agg as (
    select b.user_id, sum(round(b.accuracy * 1000 * public.diff_weight(b.difficulty)))::bigint as total,
           count(*)::bigint as songs, avg(b.accuracy)::real as accuracy
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
    select distinct on (s.user_id, s.chart_id, s.difficulty) s.user_id, s.difficulty, s.accuracy
      from public.scores s
     where s.created_at >= public.period_start(p_period) and public.chart_counts_for_global(s.chart_id)
     order by s.user_id, s.chart_id, s.difficulty, s.accuracy desc, s.score desc
  ), agg as (
    select b.user_id, sum(round(b.accuracy * 1000 * public.diff_weight(b.difficulty)))::bigint as total, count(*)::bigint as songs
      from best b group by b.user_id
  ), ranked as (
    select a.*, rank() over (order by a.total desc) as pos from agg a
  )
  select r.pos, r.total, r.songs from ranked r where r.user_id = auth.uid();
$$;

grant execute on function public.global_leaderboard(text, int) to anon, authenticated;
grant execute on function public.my_global_rank(text) to authenticated;

-- ---------------------------------------------------------------------
-- Quién es admin no es público: se consulta solo con is_admin() (tu propia cuenta)
-- ---------------------------------------------------------------------
revoke select on public.profiles from anon, authenticated;
grant select (id, username, color, country, xp, level, plays, is_supporter, created_at)
  on public.profiles to anon, authenticated;

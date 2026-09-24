-- =====================================================================
-- Riff&Rush · 0005 · Datos reales en portada y rankings (chao datos de ejemplo)
-- y los mods en el ranking de cada canción. Se puede correr de nuevo.
-- =====================================================================

-- Canciones más jugadas del período (partidas y jugadores distintos)
create or replace function public.top_charts(p_period text default 'week', p_limit int default 6)
returns table (chart_id text, plays bigint, players bigint)
language sql stable security definer set search_path = public as $$
  select s.chart_id, count(*)::bigint, count(distinct s.user_id)::bigint
    from public.scores s
   where s.created_at >= public.period_start(p_period)
     and (exists (select 1 from public.house_charts h where h.id = s.chart_id)
          or exists (select 1 from public.charts c where c.id = s.chart_id and c.published))
   group by s.chart_id
   order by count(*) desc, count(distinct s.user_id) desc
   limit least(p_limit, 50);
$$;
grant execute on function public.top_charts(text, int) to anon, authenticated;

-- Ranking de charters: cuántas partidas se jugaron en sus charts publicados
create or replace function public.charter_leaderboard(p_period text default 'week', p_limit int default 50)
returns table (pos bigint, user_id uuid, username text, color text, country text, level int, plays bigint, players bigint, charts bigint)
language sql stable security definer set search_path = public as $$
  with agg as (
    select c.owner, count(*)::bigint as plays, count(distinct s.user_id)::bigint as players, count(distinct c.id)::bigint as charts
      from public.scores s
      join public.charts c on c.id = s.chart_id and c.published
     where s.created_at >= public.period_start(p_period)
       and s.user_id <> c.owner          -- jugar tus propios charts no suma
     group by c.owner
  )
  select rank() over (order by a.plays desc), a.owner, p.username, p.color, p.country, p.level, a.plays, a.players, a.charts
    from agg a join public.profiles p on p.id = a.owner
   order by a.plays desc
   limit least(p_limit, 200);
$$;
grant execute on function public.charter_leaderboard(text, int) to anon, authenticated;

-- Ranking de una canción: ahora también dice con qué mods se hizo cada puntaje
drop function if exists public.chart_leaderboard(text, text, text, int);
create function public.chart_leaderboard(p_chart text, p_diff text, p_period text default 'week', p_limit int default 50)
returns table (pos bigint, user_id uuid, username text, color text, country text, level int, score int, accuracy real, stars smallint, mods text[])
language sql stable set search_path = public as $$
  with best as (
    select distinct on (s.user_id) s.user_id, s.score, s.accuracy, s.stars, s.mods
      from public.scores s
     where s.chart_id = p_chart and s.difficulty = p_diff and s.created_at >= public.period_start(p_period)
     order by s.user_id, s.score desc
  )
  select rank() over (order by b.score desc), b.user_id, p.username, p.color, p.country, p.level, b.score, b.accuracy, b.stars, b.mods
    from best b join public.profiles p on p.id = b.user_id
   order by b.score desc
   limit least(p_limit, 200);
$$;
grant execute on function public.chart_leaderboard(text, text, text, int) to anon, authenticated;

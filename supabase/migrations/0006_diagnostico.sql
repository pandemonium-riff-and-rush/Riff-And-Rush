-- =====================================================================
-- Riff&Rush · 0006 · Saber qué se rompe en producción
--   1. app_events: registro de errores del juego (lo que hoy solo va a console.warn)
--   2. suspect_charts: charts probablemente desfasados, detectados solos
--   3. Poda de replays: se guarda solo el mejor de cada jugador por canción
-- Se puede correr de nuevo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Registro de errores
-- ---------------------------------------------------------------------
create table if not exists public.app_events (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  kind      text not null,
  detail    text,
  chart_id  text,
  user_id   uuid references public.profiles(id) on delete set null,
  agent     text
);
create index if not exists app_events_at on public.app_events (at desc);
create index if not exists app_events_kind on public.app_events (kind, at desc);

-- Nadie lee ni escribe directo: solo por las funciones de abajo
alter table public.app_events enable row level security;
revoke all on public.app_events from anon, authenticated;

/**
 * Registra un evento del juego. La llama el navegador, así que asume que puede venir
 * basura o spam: valida el tipo, recorta los textos, corta si llega demasiado seguido
 * y de vez en cuando limpia lo viejo para que la tabla no crezca sin control.
 */
create or replace function public.log_event(p_kind text, p_detail text default null, p_chart text default null, p_agent text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if p_kind is null or p_kind not in (
    'video_error',        -- el reproductor rechazó el video (con su código)
    'video_timeout',      -- YouTube no respondió al probar el video
    'score_rejected',     -- el servidor no aceptó la partida (con el motivo)
    'score_failed',       -- no se pudo ni llamar a submit-score
    'session_failed',     -- no se pudo abrir la sesión de partida
    'chart_load_failed',  -- el chart no cargó
    'player_stuck'        -- el video quedó pegado preparándose
  ) then
    return;
  end if;

  -- Freno global: si algo explota en masa, se registra la muestra y no se llena la base
  if (select count(*) from public.app_events where at > now() - interval '1 minute') >= 300 then
    return;
  end if;
  -- Freno por persona
  if me is not null and (select count(*) from public.app_events where user_id = me and at > now() - interval '1 minute') >= 10 then
    return;
  end if;

  insert into public.app_events (kind, detail, chart_id, user_id, agent)
  values (p_kind, left(p_detail, 300), left(p_chart, 200), me, left(p_agent, 200));

  -- Aseo: una de cada 100 llamadas borra lo de más de 30 días
  if random() < 0.01 then
    delete from public.app_events where at < now() - interval '30 days';
  end if;
end $$;
grant execute on function public.log_event(text, text, text, text) to anon, authenticated;

/** Resumen de errores para el panel de revisión. Solo admin. */
create or replace function public.event_summary(p_hours int default 168)
returns table (kind text, detail text, chart_id text, veces bigint, ultima timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo para el equipo'; end if;
  return query
    select e.kind, e.detail, e.chart_id, count(*)::bigint, max(e.at)
      from public.app_events e
     where e.at > now() - make_interval(hours => least(greatest(p_hours, 1), 720))
     group by e.kind, e.detail, e.chart_id
     order by count(*) desc, max(e.at) desc
     limit 100;
end $$;
revoke execute on function public.event_summary(int) from public, anon;
grant execute on function public.event_summary(int) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Charts probablemente malos (desfasados), detectados solos
-- ---------------------------------------------------------------------
/**
 * Un chart donde MUCHA gente saca poca precisión casi siempre está desfasado,
 * no es difícil: si fuera difícil, los buenos igual sacarían precisión alta.
 * Sirve para revisar sin esperar que alguien reporte.
 */
create or replace function public.suspect_charts(p_min_players int default 4, p_max_acc real default 0.5)
returns table (chart_id text, difficulty text, players bigint, plays bigint, median_acc real, best_acc real)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo para el equipo'; end if;
  return query
    select s.chart_id, s.difficulty,
           count(distinct s.user_id)::bigint,
           count(*)::bigint,
           percentile_cont(0.5) within group (order by s.accuracy)::real,
           max(s.accuracy)::real
      from public.scores s
     where s.created_at > now() - interval '90 days'
     group by s.chart_id, s.difficulty
    having count(distinct s.user_id) >= greatest(p_min_players, 2)
       and percentile_cont(0.5) within group (order by s.accuracy) < p_max_acc
       -- Si el mejor jugador tampoco pasa del 70 %, el problema es el chart, no la gente
       and max(s.accuracy) < 0.7
     order by count(distinct s.user_id) desc, percentile_cont(0.5) within group (order by s.accuracy);
end $$;
revoke execute on function public.suspect_charts(int, real) from public, anon;
grant execute on function public.suspect_charts(int, real) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Poda de replays: solo el mejor de cada jugador por canción y dificultad
-- ---------------------------------------------------------------------
/**
 * Un replay pesa ~11 KB. Sin podar, la base crece con cada partida y el plan gratis
 * (500 MB) se llena. Guardando solo el mejor de cada jugador, el tamaño queda acotado
 * por jugadores × canciones y deja de crecer con el tiempo.
 */
create or replace function public.prune_replays(p_user uuid, p_chart text, p_diff text)
returns void language sql security definer set search_path = public as $$
  update public.scores s
     set input_log = null
   where s.user_id = p_user and s.chart_id = p_chart and s.difficulty = p_diff
     and s.input_log is not null
     and s.id <> (
       select s2.id from public.scores s2
        where s2.user_id = p_user and s2.chart_id = p_chart and s2.difficulty = p_diff
        order by s2.score desc, s2.created_at desc
        limit 1
     );
$$;

create or replace function public.scores_prune_replays() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.prune_replays(new.user_id, new.chart_id, new.difficulty);
  return null;
end $$;

drop trigger if exists scores_prune_replays on public.scores;
create trigger scores_prune_replays after insert on public.scores
for each row execute function public.scores_prune_replays();

revoke execute on function public.prune_replays(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.scores_prune_replays() from public, anon, authenticated;

-- Limpieza de una vez para lo que ya está guardado
update public.scores s
   set input_log = null
 where s.input_log is not null
   and s.id <> (
     select s2.id from public.scores s2
      where s2.user_id = s.user_id and s2.chart_id = s.chart_id and s2.difficulty = s.difficulty
      order by s2.score desc, s2.created_at desc
      limit 1
   );

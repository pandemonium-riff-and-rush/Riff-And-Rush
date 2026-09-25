-- =====================================================================
-- Riff&Rush · 0007 · Opiniones de los jugadores
--   Un botón dentro del juego para que la gente escriba lo que piensa.
--   Nadie manda un correo; si hay que salir de la página, no hay opinión.
-- Se puede correr de nuevo.
-- =====================================================================

create table if not exists public.feedback (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  texto     text not null,
  pagina    text,                -- dónde estaba cuando escribió
  contacto  text,                -- opcional, por si quiere respuesta
  user_id   uuid references public.profiles(id) on delete set null,
  agent     text,
  leido     boolean not null default false
);
create index if not exists feedback_at on public.feedback (at desc);
create index if not exists feedback_nuevas on public.feedback (leido, at desc);

-- Nadie lee ni escribe directo: solo por las funciones de abajo
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;

/**
 * Guarda una opinión. La llama cualquiera, con o sin cuenta (pedir cuenta para
 * opinar es pedir que nadie opine), así que asume que puede llegar basura:
 * recorta los textos, exige un mínimo y corta si llega demasiado seguido.
 */
create or replace function public.send_feedback(
  p_texto text, p_pagina text default null, p_contacto text default null, p_agent text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  t  text := btrim(coalesce(p_texto, ''));
begin
  if length(t) < 4 then
    raise exception 'Escribe un poco más';
  end if;

  -- Freno global: si alguien decide llenarnos la tabla, que no lo consiga
  if (select count(*) from public.feedback where at > now() - interval '1 hour') >= 200 then
    raise exception 'Demasiadas opiniones seguidas, prueba en un rato';
  end if;
  -- Freno por persona con cuenta
  if me is not null and (select count(*) from public.feedback where user_id = me and at > now() - interval '1 hour') >= 5 then
    raise exception 'Ya mandaste varias, gracias; prueba de nuevo en un rato';
  end if;

  insert into public.feedback (texto, pagina, contacto, user_id, agent)
  values (left(t, 1000), left(p_pagina, 200), left(btrim(p_contacto), 120), me, left(p_agent, 200));
end $$;
grant execute on function public.send_feedback(text, text, text, text) to anon, authenticated;

/** Lo que escribió la gente. Solo admin. */
create or replace function public.feedback_list(p_solo_nuevas boolean default false, p_limite int default 100)
returns table (id bigint, at timestamptz, texto text, pagina text, contacto text, autor text, leido boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo para el equipo'; end if;
  return query
    select f.id, f.at, f.texto, f.pagina, f.contacto, p.username, f.leido
      from public.feedback f
      left join public.profiles p on p.id = f.user_id
     where (not p_solo_nuevas or not f.leido)
     order by f.at desc
     limit least(greatest(p_limite, 1), 500);
end $$;
revoke execute on function public.feedback_list(boolean, int) from public, anon;
grant execute on function public.feedback_list(boolean, int) to authenticated;

/** Marcar una opinión como vista, para no revisar dos veces lo mismo. Solo admin. */
create or replace function public.feedback_mark(p_id bigint, p_leido boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo para el equipo'; end if;
  update public.feedback set leido = p_leido where id = p_id;
end $$;
revoke execute on function public.feedback_mark(bigint, boolean) from public, anon;
grant execute on function public.feedback_mark(bigint, boolean) to authenticated;

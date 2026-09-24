-- =====================================================================
-- Riff&Rush · 0003 · Los puntajes los valida el servidor
-- El navegador ya no puede insertar en scores: manda el registro de teclas
-- a la Edge Function "submit-score", que rehace la partida y calcula el puntaje.
-- =====================================================================

-- Notas de las canciones de la casa, para poder revalidar en el servidor
alter table public.house_charts add column if not exists data jsonb;
alter table public.house_charts add column if not exists updated_at timestamptz not null default now();

create or replace function public.admin_seed_house_chart(p_id text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo administradores'; end if;
  insert into public.house_charts (id, data, updated_at) values (p_id, p_data, now())
  on conflict (id) do update set data = excluded.data, updated_at = now();
end $$;
revoke execute on function public.admin_seed_house_chart(text, jsonb) from public, anon;
grant execute on function public.admin_seed_house_chart(text, jsonb) to authenticated;

-- Nadie inserta puntajes a mano: solo la Edge Function (service role)
drop policy if exists "subir puntajes propios" on public.scores;
revoke insert on public.scores from anon, authenticated;

-- Guardamos el registro de teclas de la partida validada (para revisar después)
alter table public.scores add column if not exists input_log jsonb;
alter table public.scores add column if not exists verified boolean not null default false;

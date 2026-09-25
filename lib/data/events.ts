'use client';

import { sb } from '../supabase/client';

/**
 * Registro de errores de producción. Sin esto, el día que algo se rompa para los
 * jugadores solo se va a notar en que hay menos gente, sin saber por qué.
 *
 * Nunca falla hacia afuera ni bloquea nada: si no hay Supabase o el registro no
 * anda, se queda en la consola y el juego sigue igual.
 */
export type EventKind =
  | 'video_error'        // el reproductor rechazó el video (con su código)
  | 'video_timeout'      // YouTube no respondió al probar el video
  | 'score_rejected'     // el servidor no aceptó la partida (con el motivo)
  | 'score_failed'       // no se pudo ni llamar a submit-score
  | 'session_failed'     // no se pudo abrir la sesión de partida
  | 'chart_load_failed'  // el chart no cargó
  | 'player_stuck';      // el video quedó pegado preparándose

/** No repetir el mismo evento una y otra vez desde la misma pestaña. */
const seen = new Map<string, number>();

export function logEvent(kind: EventKind, detail?: string, chartId?: string) {
  console.warn(`[riff] ${kind}${detail ? ': ' + detail : ''}`);
  const c = sb();
  if (!c) return;
  const key = `${kind}|${detail ?? ''}|${chartId ?? ''}`;
  const now = Date.now();
  const last = seen.get(key) ?? 0;
  if (now - last < 60000) return;
  seen.set(key, now);
  const agent = typeof navigator === 'undefined' ? undefined : navigator.userAgent;
  c.rpc('log_event', { p_kind: kind, p_detail: detail ?? null, p_chart: chartId ?? null, p_agent: agent ?? null })
    .then(({ error }) => { if (error) console.warn('[riff] no se pudo registrar el evento:', error.message); });
}

/* ---------- Lectura para el panel de revisión (solo admin) ---------- */

export interface EventRow { kind: EventKind; detail: string | null; chart_id: string | null; veces: number; ultima: string }
export interface SuspectRow { chart_id: string; difficulty: string; players: number; plays: number; median_acc: number; best_acc: number }

export async function fetchEvents(hours = 168): Promise<EventRow[]> {
  const c = sb();
  if (!c) return [];
  const { data, error } = await c.rpc('event_summary', { p_hours: hours });
  if (error) { console.warn('[riff]', error.message); return []; }
  return ((data ?? []) as EventRow[]).map((r) => ({ ...r, veces: Number(r.veces) }));
}

/** Charts donde casi nadie saca precisión: casi siempre están desfasados, no difíciles. */
export async function fetchSuspectCharts(): Promise<SuspectRow[]> {
  const c = sb();
  if (!c) return [];
  const { data, error } = await c.rpc('suspect_charts', { p_min_players: 4, p_max_acc: 0.5 });
  if (error) { console.warn('[riff]', error.message); return []; }
  return ((data ?? []) as SuspectRow[]).map((r) => ({ ...r, players: Number(r.players), plays: Number(r.plays) }));
}

export const EVENT_LABEL: Record<EventKind, string> = {
  video_error: 'Video rechazado',
  video_timeout: 'YouTube no respondió',
  score_rejected: 'Partida rechazada',
  score_failed: 'No se pudo subir',
  session_failed: 'Sesión no abierta',
  chart_load_failed: 'Chart no cargó',
  player_stuck: 'Video pegado'
};

'use client';

import type { Chart, DifficultyId } from '../chart/types';
import { sb } from '../supabase/client';
import { getChart } from './store';

export type Period = 'week' | 'month' | 'year' | 'all';

export interface ChartRankRow { pos: number; user_id: string; username: string | null; color: string; country: string | null; level: number; score: number; accuracy: number; stars: number }
export interface GlobalRankRow { pos: number; user_id: string; username: string | null; color: string; country: string | null; level: number; total: number; songs: number; accuracy: number }

/* ---------- Puntajes ---------- */

/**
 * Sube una partida terminada. El servidor rehace la partida con el registro de teclas
 * y guarda SU puntaje, no el que diga el navegador. Devuelve la XP ganada o null.
 */
export async function submitScoreCloud(
  chartId: string,
  diff: DifficultyId,
  r: { score: number; accuracy: number; stars: number; maxCombo: number },
  inputLog?: [number, number, number][],
  modIds: string[] = []
) {
  const c = sb();
  if (!c) return null;
  const { data: s } = await c.auth.getSession();
  if (!s.session) return null;
  if (!inputLog?.length) { console.warn('[riff] partida sin registro de teclas: no se sube'); return null; }
  const { data, error } = await c.functions.invoke('submit-score', {
    body: {
      chartId, difficulty: diff, inputLog, clientScore: Math.round(r.score),
      mods: { precision: modIds.includes('precision'), mirror: modIds.includes('mirror'), dropless: modIds.includes('dropless') }
    }
  });
  if (error) { console.warn('[riff] no se pudo subir el puntaje:', error.message); return null; }
  const res = data as { ok?: boolean; xp?: number; error?: string; serverScore?: number };
  if (!res?.ok) { console.warn('[riff] puntaje rechazado:', res?.error); return null; }
  return { xp: res.xp ?? 0, score: (data as { score: number }).score };
}

export async function fetchChartLeaderboard(chartId: string, diff: DifficultyId, period: Period, limit = 50): Promise<ChartRankRow[] | null> {
  const c = sb();
  if (!c) return null;
  const { data, error } = await c.rpc('chart_leaderboard', { p_chart: chartId, p_diff: diff, p_period: period, p_limit: limit });
  if (error) { console.warn('[riff]', error.message); return null; }
  return (data ?? []) as ChartRankRow[];
}

export async function fetchGlobalLeaderboard(period: Period, limit = 50): Promise<GlobalRankRow[] | null> {
  const c = sb();
  if (!c) return null;
  const { data, error } = await c.rpc('global_leaderboard', { p_period: period, p_limit: limit });
  if (error) { console.warn('[riff]', error.message); return null; }
  return (data ?? []) as GlobalRankRow[];
}

export async function fetchMyGlobalRank(period: Period): Promise<{ pos: number; total: number; songs: number } | null> {
  const c = sb();
  if (!c) return null;
  const { data } = await c.rpc('my_global_rank', { p_period: period });
  return (data?.[0] as { pos: number; total: number; songs: number }) ?? null;
}

/** Mejores puntajes propios en la nube: clave "chartId:dificultad". */
export async function fetchMyBests(userId: string) {
  const c = sb();
  if (!c) return {};
  const { data } = await c.from('scores').select('chart_id, difficulty, score, accuracy, stars, max_combo, created_at')
    .eq('user_id', userId).order('score', { ascending: false }).limit(1000);
  const out: Record<string, { score: number; accuracy: number; stars: number; maxCombo: number; date: string }> = {};
  for (const r of data ?? []) {
    const k = r.chart_id + ':' + r.difficulty;
    if (!out[k]) out[k] = { score: r.score, accuracy: r.accuracy, stars: r.stars, maxCombo: r.max_combo, date: r.created_at };
  }
  return out;
}

/* ---------- Charts ---------- */

export interface CloudChartRow { id: string; owner: string; title: string; artist: string; data: Chart; published: boolean; verified?: boolean; updated_at: string }

export async function upsertChartCloud(chart: Chart, published: boolean) {
  const c = sb();
  if (!c) return { ok: false, error: 'Supabase no está configurado' };
  const { error } = await c.from('charts').upsert({ id: chart.id, title: chart.title, artist: chart.artist, data: chart, published });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteChartCloud(id: string) {
  const c = sb();
  if (!c) return;
  await c.from('charts').delete().eq('id', id);
}

export async function fetchMyCharts(userId: string): Promise<CloudChartRow[]> {
  const c = sb();
  if (!c) return [];
  const { data } = await c.from('charts').select('id, owner, title, artist, data, published, verified, updated_at').eq('owner', userId).order('updated_at', { ascending: false });
  return (data ?? []) as CloudChartRow[];
}

export async function fetchPublishedCharts(limit = 100): Promise<CloudChartRow[]> {
  const c = sb();
  if (!c) return [];
  const { data } = await c.from('charts').select('id, owner, title, artist, data, published, verified, updated_at').eq('published', true).order('updated_at', { ascending: false }).limit(limit);
  return (data ?? []) as CloudChartRow[];
}

export async function fetchCloudChart(id: string): Promise<CloudChartRow | null> {
  const c = sb();
  if (!c) return null;
  const { data } = await c.from('charts').select('id, owner, title, artist, data, published, verified, updated_at').eq('id', id).maybeSingle();
  return (data as CloudChartRow) ?? null;
}

/** Busca un chart primero en este navegador y si no, en la nube. */
export async function loadChart(id: string): Promise<Chart | undefined> {
  const local = getChart(id);
  if (local) return local;
  const row = await fetchCloudChart(id);
  return row ? { ...row.data, id: row.id, verified: !!row.verified } : undefined;
}

/* ---------- Perfil ---------- */

export async function usernameAvailable(name: string) {
  const c = sb();
  if (!c) return false;
  const { data } = await c.rpc('username_available', { p_username: name });
  return Boolean(data);
}

/* ---------- Reportes y revisión ---------- */

export const REPORT_REASONS: { id: string; label: string }[] = [
  { id: 'desfasado', label: 'No calza con la música (desfasado)' },
  { id: 'video', label: 'El video no funciona o no está disponible' },
  { id: 'mala_calidad', label: 'Chart mal hecho o notas al azar' },
  { id: 'copia', label: 'Copiado de un juego comercial o de otra persona' },
  { id: 'ofensivo', label: 'Contenido inapropiado' },
  { id: 'otro', label: 'Otro' }
];

export async function reportChart(chartId: string, chartTitle: string, reason: string, details: string) {
  const c = sb();
  if (!c) return { ok: false, error: 'Supabase no está configurado' };
  const { error } = await c.from('reports').insert({ chart_id: chartId, chart_title: chartTitle, reason, details: details.slice(0, 1000) });
  if (error) return { ok: false, error: error.message.includes('duplicate') ? 'Ya reportaste esta canción; la estamos revisando.' : error.message };
  return { ok: true };
}

export interface ReportRow { id: number; chart_id: string; chart_title: string; reason: string; details: string; status: string; created_at: string; reporter: string }

export async function fetchReports(status = 'abierto'): Promise<ReportRow[]> {
  const c = sb();
  if (!c) return [];
  const { data } = await c.from('reports').select('*').eq('status', status).order('created_at', { ascending: false }).limit(200);
  return (data ?? []) as ReportRow[];
}

export async function setReportStatus(ids: number[], status: 'resuelto' | 'descartado' | 'abierto') {
  const c = sb();
  if (!c) return;
  await c.from('reports').update({ status }).in('id', ids);
}

export async function adminSetChart(id: string, patch: { verified?: boolean; published?: boolean }) {
  const c = sb();
  if (!c) return { ok: false, error: 'sin conexión' };
  const { error } = await c.rpc('admin_set_chart', { p_id: id, p_verified: patch.verified ?? null, p_published: patch.published ?? null });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Charts publicados que todavía no revisas (cola de verificación). */
export async function fetchPendingCharts(): Promise<CloudChartRow[]> {
  const c = sb();
  if (!c) return [];
  const { data } = await c.from('charts').select('id, owner, title, artist, data, published, verified, updated_at').eq('published', true).eq('verified', false).order('updated_at', { ascending: false }).limit(100);
  return (data ?? []) as CloudChartRow[];
}

/** Sube al servidor las notas de las canciones que vienen con el juego (para validar puntajes). Solo admin. */
export async function seedHouseCharts(charts: Chart[]) {
  const c = sb();
  if (!c) return { ok: false, error: 'sin conexión', done: 0 };
  let done = 0;
  for (const ch of charts) {
    const data = {
      durationSec: ch.durationSec,
      endSec: ch.endSec ?? 0,
      d: Object.fromEntries(Object.entries(ch.difficulties).map(([k, v]) => [k, {
        lanes: v!.lanes,
        n: v!.notes.map((n) => [Math.round(n.t * 1000), n.lane, Math.round(n.len * 1000)])
      }]))
    };
    const { error } = await c.rpc('admin_seed_house_chart', { p_id: ch.id, p_data: data });
    if (error) return { ok: false, error: error.message, done };
    done++;
  }
  return { ok: true, done };
}

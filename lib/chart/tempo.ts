import type { TempoPoint } from './types';

/**
 * Utilidades para canciones con cambios de BPM (mapa de tempo).
 * Los tiempos de la grilla y de las líneas de compás salen del mapa, no de un BPM fijo,
 * así no se desfasan en canciones importadas de Clone Hero con varios cambios de tempo.
 */

export interface Beat { t: number; index: number; strong: boolean }

/** Normaliza: siempre hay un punto en t=0 y quedan ordenados. */
export function tempoMap(bpm: number, tempo?: TempoPoint[]): TempoPoint[] {
  const list = (tempo ?? []).filter((p) => p.bpm > 0).sort((a, b) => a.t - b.t);
  if (!list.length || list[0].t > 0.0005) list.unshift({ t: 0, bpm });
  return list;
}

/** BPM vigente en un momento. */
export function bpmAt(map: TempoPoint[], t: number) {
  let b = map[0].bpm;
  for (const p of map) { if (p.t <= t) b = p.bpm; else break; }
  return b;
}

/** Tiempo (s) → posición en tiempos (beats) contando desde 0. */
export function beatAt(map: TempoPoint[], t: number) {
  let beats = 0;
  for (let i = 0; i < map.length; i++) {
    const p = map[i];
    const end = map[i + 1]?.t ?? Infinity;
    if (t <= p.t) break;
    beats += ((Math.min(t, end) - p.t) * p.bpm) / 60;
    if (t < end) break;
  }
  if (t < 0) beats = (t * map[0].bpm) / 60;
  return beats;
}

/** Posición en tiempos → tiempo (s). */
export function timeAtBeat(map: TempoPoint[], beat: number) {
  if (beat <= 0) return (beat * 60) / map[0].bpm;
  let acc = 0;
  for (let i = 0; i < map.length; i++) {
    const p = map[i];
    const end = map[i + 1]?.t ?? Infinity;
    const segBeats = ((end - p.t) * p.bpm) / 60;
    if (acc + segBeats >= beat) return p.t + ((beat - acc) * 60) / p.bpm;
    acc += segBeats;
  }
  return 0;
}

/** Tiempos de cada subdivisión (sub = 1 tiempo, 0.5 corchea…) entre a y b. */
export function gridBetween(map: TempoPoint[], a: number, b: number, sub = 1): Beat[] {
  const out: Beat[] = [];
  const start = Math.max(0, Math.ceil(beatAt(map, a) / sub - 1e-6) * sub);
  for (let k = start, n = 0; n < 4000; k += sub, n++) {
    const t = timeAtBeat(map, k);
    if (t > b) break;
    const isBeat = Math.abs(k - Math.round(k)) < 1e-6;
    out.push({ t, index: k, strong: isBeat && Math.round(k) % 4 === 0 });
  }
  return out;
}

/** Ajusta un tiempo a la subdivisión más cercana, respetando el mapa de tempo. */
export function snapToGrid(map: TempoPoint[], t: number, sub: number) {
  if (sub <= 0) return Math.round(t * 1000) / 1000;
  const k = Math.round(beatAt(map, t) / sub) * sub;
  return Math.round(timeAtBeat(map, k) * 1000) / 1000;
}

/** Duración en segundos de una subdivisión en el momento t (para mover o alargar notas). */
export function stepAt(map: TempoPoint[], t: number, sub: number) {
  return (60 / bpmAt(map, t)) * sub;
}

'use client';

import type { Chart, DifficultyId } from '../chart/types';
import { DEFAULT_KEYS } from '../chart/types';
import { CATALOGO_DEMO } from './demo';

/**
 * Persistencia local (localStorage) mientras no hay backend.
 * Todo está envuelto en try/catch: si el navegador bloquea el almacenamiento, el juego sigue funcionando.
 */

const K = {
  charts: 'rr.charts.v1',
  videos: 'rr.videos.v1',
  best: 'rr.best.v1',
  settings: 'rr.settings.v1',
  last: 'rr.lastResult.v1'
};

function read<T>(key: string, fallback: T, session = false): T {
  try {
    const s = (session ? sessionStorage : localStorage).getItem(key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown, session = false) {
  try {
    (session ? sessionStorage : localStorage).setItem(key, JSON.stringify(value));
  } catch {
    /* sin almacenamiento disponible */
  }
}

/* ---------- Charts ---------- */

export function getLocalCharts(): Chart[] {
  return read<Chart[]>(K.charts, []);
}

export function saveLocalChart(chart: Chart) {
  const list = getLocalCharts().filter((c) => c.id !== chart.id);
  write(K.charts, [chart, ...list]);
}

export function deleteLocalChart(id: string) {
  write(K.charts, getLocalCharts().filter((c) => c.id !== id));
}

/** Video de YouTube asignado por el usuario a un chart de demo. */
export interface VideoOverride { videoId: string; offsetMs: number }

export function getVideoOverrides(): Record<string, VideoOverride> {
  return read<Record<string, VideoOverride>>(K.videos, {});
}

export function setVideoOverride(chartId: string, v: VideoOverride | null) {
  const all = getVideoOverrides();
  if (v) all[chartId] = v; else delete all[chartId];
  write(K.videos, all);
}

function applyOverride(c: Chart, o?: VideoOverride): Chart {
  if (!o || !o.videoId) return c;
  return { ...c, source: { kind: 'youtube', videoId: o.videoId }, offsetMs: o.offsetMs };
}

export function getAllCharts(): Chart[] {
  const o = getVideoOverrides();
  return [...getLocalCharts(), ...CATALOGO_DEMO].map((c) => applyOverride(c, o[c.id]));
}

export function getChart(id: string): Chart | undefined {
  return getAllCharts().find((c) => c.id === id);
}

/* ---------- Puntajes ---------- */

export interface ScoreRecord { score: number; accuracy: number; stars: number; maxCombo: number; date: string }

export function getBest(chartId: string, diff: DifficultyId): ScoreRecord | undefined {
  return read<Record<string, ScoreRecord>>(K.best, {})[chartId + ':' + diff];
}

export function getAllBests(): Record<string, ScoreRecord> {
  return read<Record<string, ScoreRecord>>(K.best, {});
}

/** Guarda el puntaje si es récord. Devuelve true si lo fue. */
export function submitBest(chartId: string, diff: DifficultyId, rec: ScoreRecord): boolean {
  const all = read<Record<string, ScoreRecord>>(K.best, {});
  const key = chartId + ':' + diff;
  if (all[key] && all[key].score >= rec.score) return false;
  all[key] = rec;
  write(K.best, all);
  return true;
}

export interface GameResult {
  chartId: string;
  title: string;
  artist: string;
  diff: DifficultyId;
  score: number;
  accuracy: number;
  hit: number;
  total: number;
  perfect: number;
  good: number;
  miss: number;
  maxCombo: number;
  stars: number;
  record: boolean;
  previousBest: number;
  timeline: number[];
  interruptions: number;
  durationSec: number;
  /** Id único de la partida, para no subirla dos veces a la nube. */
  uploadId?: string;
  /** Mediana del desfase de los aciertos (ms, + = tarde) y cuántos aciertos hubo. */
  medianOffsetMs?: number;
  offsetSamples?: number;
  ghosts?: number;
  mods?: string;
  /** Ids de modificadores activos (para que el servidor rehaga la partida igual). */
  modIds?: string[];
  /** Registro de teclas: [segundo, carril, 1 apreta / 0 suelta / 2 energía / 3 pausa y retoma]. */
  inputLog?: [number, number, number][];
  /** Sesión de partida que entregó el servidor al empezar (sin ella no se sube al ranking). */
  sessionId?: string;
}

export function setLastResult(r: GameResult) { write(K.last, r, true); }
export function getLastResult(): GameResult | null { return read<GameResult | null>(K.last, null, true); }

/* ---------- Ajustes ---------- */

export interface Settings {
  keys: string[];
  speed: number;
  latencyMs: number;
  bgOpacity: number;
  theme: 'estadio' | 'neon' | 'contraste' | 'madera' | 'hielo';
  metronomeClick: boolean;
  /** Las luces del fondo escuchan el sonido real por el micrófono. */
  micVisuals: boolean;
  /** Botón del mando/guitarra para cada carril (null = sin asignar). */
  padButtons: (number | null)[];
  padBoost: number | null;
  padPause: number | null;
  /** Nota MIDI para cada carril (batería o teclado MIDI). */
  midiNotes: (number | null)[];
  /** Efectos visuales: auto = livianos en teléfonos o si el juego va lento. */
  effects: 'auto' | 'high' | 'low';
}

export const DEFAULT_SETTINGS: Settings = {
  keys: DEFAULT_KEYS,
  speed: 1.8,
  latencyMs: 0,
  bgOpacity: 60,
  theme: 'estadio',
  metronomeClick: true,
  micVisuals: false,
  // Guitarra XInput (Guitar Hero / Clone Hero): A verde, B rojo, Y amarillo, X azul, LB naranja
  padButtons: [0, 1, 3, 2, 4, 5],
  padBoost: 8,
  padPause: 9,
  // Teclado MIDI: Do Re Mi Fa Sol La (C4…)
  midiNotes: [60, 62, 64, 65, 67, 69],
  effects: 'auto'
};

export function getSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(K.settings, {}) };
}

export function saveSettings(s: Settings) { write(K.settings, s); }

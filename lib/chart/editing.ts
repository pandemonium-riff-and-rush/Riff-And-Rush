import type { Chart, Note } from './types';

/* Utilidades puras del editor (sin React): se pueden probar por separado. */

/** Un campo está "libre" si está vacío o todavía tiene el texto de relleno. */
export const isBlankTitle = (v: string) => !v.trim() || v.trim() === 'Nueva canción';
export const isBlankArtist = (v: string) => !v.trim() || v.trim() === 'Artista';

export function blankChart(): Chart {
  return {
    id: 'local-' + Date.now().toString(36),
    title: 'Nueva canción', artist: 'Artista', charter: 'invitado', genre: 'Rock',
    bpm: 120, offsetMs: 0, leadInSec: 3, durationSec: 180, source: { kind: 'metronome' },
    cover: { bg: '#141416', fg: '#ff3d8b' },
    difficulties: { expert: { lanes: 5, notes: [] } }, version: 1
  };
}

export const sortNotes = (a: Note, b: Note) => a.t - b.t || a.lane - b.lane;
export const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Primer índice con t >= x (las notas están ordenadas). */
export function lowerBound(notes: Note[], x: number) {
  let lo = 0, hi = notes.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (notes[m].t < x) lo = m + 1; else hi = m; }
  return lo;
}

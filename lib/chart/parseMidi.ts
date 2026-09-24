import { Midi } from '@tonejs/midi';
import type { DifficultyChart, DifficultyId, Note } from './types';
import type { ParsedChart } from './parseChart';

/**
 * Parser de notes.mid (formato Rock Band / Clone Hero).
 * Pista "PART GUITAR": Fácil 60–64, Normal 72–76, Difícil 84–88, Experto 96–100.
 * Notas de marca: base+5 fuerza HOPO, base+6 fuerza rasgueo.
 */
const RANGES: { diff: DifficultyId; base: number; lanes: number }[] = [
  { diff: 'easy', base: 60, lanes: 3 },
  { diff: 'medium', base: 72, lanes: 4 },
  { diff: 'hard', base: 84, lanes: 5 },
  { diff: 'expert', base: 96, lanes: 5 }
];

export function parseMidiBuffer(buf: ArrayBuffer): ParsedChart {
  const midi = new Midi(buf);
  const track =
    midi.tracks.find((t) => /PART GUITAR/i.test(t.name)) ??
    midi.tracks.find((t) => t.notes.some((n) => n.midi >= 96 && n.midi <= 100)) ??
    midi.tracks[0];
  const bpm = midi.header.tempos[0]?.bpm ?? 120;
  const beat = 60 / bpm;
  const hopoThreshold = beat / 3 + 0.001;
  const difficulties: Partial<Record<DifficultyId, DifficultyChart>> = {};
  let last = 0;

  for (const r of RANGES) {
    const raw = track.notes.filter((n) => n.midi >= r.base && n.midi <= r.base + 4);
    if (!raw.length) continue;
    const forceOn = track.notes.filter((n) => n.midi === r.base + 5);
    const forceOff = track.notes.filter((n) => n.midi === r.base + 6);
    const inRange = (list: typeof forceOn, t: number) => list.some((m) => t >= m.time - 0.001 && t < m.time + m.duration);
    const groups = new Map<number, typeof raw>();
    for (const n of raw) {
      const key = Math.round(n.time * 1000);
      groups.set(key, [...(groups.get(key) ?? []), n]);
    }
    const keys = [...groups.keys()].sort((a, b) => a - b);
    const notes: Note[] = [];
    let prevT = -Infinity;
    let prevLanes: number[] = [];
    for (const k of keys) {
      const g = groups.get(k)!;
      const t = k / 1000;
      const lanes = [...new Set(g.map((n) => Math.min(n.midi - r.base, r.lanes - 1)))];
      const single = lanes.length === 1;
      let hopo = single && t - prevT <= hopoThreshold && !(prevLanes.length === 1 && prevLanes[0] === lanes[0]);
      if (inRange(forceOn, t)) hopo = true;
      if (inRange(forceOff, t)) hopo = false;
      for (const lane of lanes) {
        const src = g.find((n) => Math.min(n.midi - r.base, r.lanes - 1) === lane)!;
        const len = src.duration > beat / 2 ? src.duration : 0;
        notes.push({ t, lane, len, hopo: hopo || undefined });
        last = Math.max(last, t + len);
      }
      prevT = t;
      prevLanes = lanes;
    }
    difficulties[r.diff] = { lanes: r.lanes, notes };
  }

  return {
    title: midi.header.name || undefined,
    resolution: midi.header.ppq,
    offsetSec: 0,
    bpm,
    tempo: midi.header.tempos.map((x) => ({ t: x.time ?? 0, bpm: x.bpm })),
    difficulties,
    durationSec: Math.ceil(last + 2)
  };
}

import type { DifficultyChart, DifficultyId, Note, TempoPoint } from './types';

/**
 * Parser del formato .chart de Clone Hero / Moonscraper.
 * Lee [Song], [SyncTrack] y las pistas de guitarra (EasySingle … ExpertSingle).
 */
export interface ParsedChart {
  title?: string;
  artist?: string;
  charter?: string;
  resolution: number;
  offsetSec: number;
  bpm: number;
  tempo: TempoPoint[];
  difficulties: Partial<Record<DifficultyId, DifficultyChart>>;
  durationSec: number;
}

const TRACKS: Record<string, DifficultyId> = {
  EasySingle: 'easy',
  MediumSingle: 'medium',
  HardSingle: 'hard',
  ExpertSingle: 'expert'
};
const LANES: Record<DifficultyId, number> = { easy: 3, medium: 4, hard: 5, expert: 5, legend: 6 };

function unquote(v: string) {
  return v.trim().replace(/^"(.*)"$/, '$1');
}

export function parseChartText(text: string): ParsedChart {
  const sections: Record<string, string[]> = {};
  let current: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const head = line.match(/^\[(.+)\]$/);
    if (head) { current = head[1]; sections[current] = []; continue; }
    if (line === '{' || line === '}') continue;
    if (current) sections[current].push(line);
  }

  const song: Record<string, string> = {};
  for (const l of sections.Song ?? []) {
    const i = l.indexOf('=');
    if (i > 0) song[l.slice(0, i).trim()] = unquote(l.slice(i + 1));
  }
  const resolution = Number(song.Resolution) || 192;
  const offsetSec = Number(song.Offset) || 0;

  // Mapa de tempo en ticks → segundos
  const bpmEvents: { tick: number; bpm: number }[] = [];
  for (const l of sections.SyncTrack ?? []) {
    const m = l.match(/^(\d+)\s*=\s*B\s+(\d+)/);
    if (m) bpmEvents.push({ tick: Number(m[1]), bpm: Number(m[2]) / 1000 });
  }
  if (!bpmEvents.length || bpmEvents[0].tick !== 0) bpmEvents.unshift({ tick: 0, bpm: 120 });
  bpmEvents.sort((a, b) => a.tick - b.tick);
  const anchors: { tick: number; sec: number; bpm: number }[] = [];
  let sec = 0;
  for (let i = 0; i < bpmEvents.length; i++) {
    if (i > 0) {
      const prev = bpmEvents[i - 1];
      sec += ((bpmEvents[i].tick - prev.tick) / resolution) * (60 / prev.bpm);
    }
    anchors.push({ tick: bpmEvents[i].tick, sec, bpm: bpmEvents[i].bpm });
  }
  const tickToSec = (tick: number) => {
    let a = anchors[0];
    for (const x of anchors) { if (x.tick <= tick) a = x; else break; }
    return a.sec + ((tick - a.tick) / resolution) * (60 / a.bpm) + offsetSec;
  };

  const difficulties: Partial<Record<DifficultyId, DifficultyChart>> = {};
  let lastSec = 0;
  const hopoThreshold = (resolution * 65) / 192;

  for (const [section, diff] of Object.entries(TRACKS)) {
    const lines = sections[section];
    if (!lines) continue;
    const byTick = new Map<number, { frets: { f: number; sus: number }[]; forced: boolean; tap: boolean }>();
    for (const l of lines) {
      const m = l.match(/^(\d+)\s*=\s*N\s+(\d+)\s+(\d+)/);
      if (!m) continue;
      const tick = Number(m[1]);
      const fret = Number(m[2]);
      const sus = Number(m[3]);
      const g = byTick.get(tick) ?? { frets: [], forced: false, tap: false };
      if (fret <= 4) g.frets.push({ f: fret, sus });
      else if (fret === 5) g.forced = true;
      else if (fret === 6) g.tap = true;
      byTick.set(tick, g);
    }
    const ticks = [...byTick.keys()].sort((a, b) => a - b);
    const notes: Note[] = [];
    const maxLane = LANES[diff] - 1;
    let prevTick = -Infinity;
    let prevFrets: number[] = [];
    for (const tick of ticks) {
      const g = byTick.get(tick)!;
      if (!g.frets.length) continue;
      const frets = [...new Set(g.frets.map((x) => Math.min(x.f, maxLane)))];
      const single = frets.length === 1;
      let natural = single && tick - prevTick <= hopoThreshold && !(prevFrets.length === 1 && prevFrets[0] === frets[0]);
      if (g.forced) natural = !natural;
      const hopo = g.tap || (single && natural);
      const t = tickToSec(tick);
      for (const f of frets) {
        const sus = g.frets.find((x) => Math.min(x.f, maxLane) === f)?.sus ?? 0;
        const len = sus > resolution / 3 ? tickToSec(tick + sus) - t : 0;
        notes.push({ t, lane: f, len, hopo: hopo || undefined });
        lastSec = Math.max(lastSec, t + len);
      }
      prevTick = tick;
      prevFrets = frets;
    }
    if (notes.length) difficulties[diff] = { lanes: LANES[diff], notes };
  }

  return {
    title: song.Name,
    artist: song.Artist,
    charter: song.Charter,
    resolution,
    offsetSec,
    bpm: anchors[0].bpm,
    tempo: anchors.map((a) => ({ t: a.sec + offsetSec, bpm: a.bpm })),
    difficulties,
    durationSec: Math.ceil(lastSec + 2)
  };
}

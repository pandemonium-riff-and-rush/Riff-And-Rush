import type { Chart, Note } from '../chart/types';
import { fillDifficulties } from '../chart/reduce';

/**
 * Canciones de demostración. Son ficticias y usan el metrónomo interno como fuente,
 * así el juego se puede probar sin depender de ningún video.
 * Desde el detalle de cada canción puedes asignarle un video de YouTube.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateExpert(bpm: number, bars: number, seed: number): Note[] {
  const r = rng(seed);
  const beat = 60 / bpm;
  const notes: Note[] = [];
  let lane = 2;
  const step = () => {
    const d = [-2, -1, -1, 0, 1, 1, 2][Math.floor(r() * 7)];
    lane = Math.max(0, Math.min(4, lane + d));
    return lane;
  };
  const lead = 2; // compases de silencio al inicio
  for (let bar = lead; bar < bars; bar++) {
    const t0 = bar * 4 * beat;
    const kind = bar % 8 === 7 ? 'fill' : ['quarters', 'eighths', 'eighths', 'chords', 'run', 'sustain'][Math.floor(r() * 6)];
    if (kind === 'quarters') {
      for (let b = 0; b < 4; b++) notes.push({ t: t0 + b * beat, lane: step(), len: 0 });
    } else if (kind === 'eighths') {
      for (let e = 0; e < 8; e++) {
        const prev = lane;
        const l = step();
        notes.push({ t: t0 + e * beat / 2, lane: l, len: 0, hopo: e % 2 === 1 && l !== prev ? true : undefined });
      }
    } else if (kind === 'chords') {
      for (const b of [0, 2]) {
        const base = Math.min(3, step());
        const width = r() < 0.4 ? 2 : 1;
        notes.push({ t: t0 + b * beat, lane: base, len: beat * 1.5 });
        notes.push({ t: t0 + b * beat, lane: Math.min(4, base + width), len: beat * 1.5 });
      }
    } else if (kind === 'run') {
      for (let s = 0; s < 8; s++) {
        const l = s < 4 ? Math.min(4, s + (bar % 2)) : Math.max(0, 7 - s);
        notes.push({ t: t0 + s * beat / 4, lane: l, len: 0, hopo: s > 0 ? true : undefined });
      }
      notes.push({ t: t0 + 2 * beat, lane: step(), len: 0 });
      notes.push({ t: t0 + 3 * beat, lane: step(), len: 0 });
    } else if (kind === 'sustain') {
      notes.push({ t: t0, lane: step(), len: beat * 2.5 });
      notes.push({ t: t0 + 3 * beat, lane: step(), len: 0 });
      notes.push({ t: t0 + 3.5 * beat, lane: step(), len: 0 });
    } else {
      for (let e = 0; e < 6; e++) notes.push({ t: t0 + e * beat / 2, lane: e % 5, len: 0, hopo: e > 0 ? true : undefined });
      notes.push({ t: t0 + 3 * beat, lane: 0, len: beat * 0.9 });
      notes.push({ t: t0 + 3 * beat, lane: 4, len: beat * 0.9 });
    }
  }
  return notes;
}

interface Seed { id: string; title: string; artist: string; charter: string; genre: string; bpm: number; bars: number; bg: string; fg: string; verified: boolean }

const SEEDS: Seed[] = [
  { id: 'neon-en-la-ruta', title: 'Neón en la Ruta', artist: 'Los Faros Rotos', charter: 'mika.charts', genre: 'Rock', bpm: 128, bars: 48, bg: '#2B1A5E', fg: '#EC4899', verified: true },
  { id: 'hielo-seco', title: 'Hielo Seco', artist: 'Vértigo Club', charter: 'ChartsDelSur', genre: 'Indie', bpm: 142, bars: 52, bg: '#0F3B4A', fg: '#3FA9FF', verified: true },
  { id: 'marea-alta', title: 'Marea Alta', artist: 'Caracola', charter: 'pulso', genre: 'Pop rock', bpm: 96, bars: 36, bg: '#123D2A', fg: '#3DDC84', verified: true },
  { id: 'tormenta-de-arena', title: 'Tormenta de Arena', artist: 'Desierto Norte', charter: 'mika.charts', genre: 'Metal', bpm: 168, bars: 64, bg: '#4A2A10', fg: '#FF8A3D', verified: true },
  { id: 'ultima-estacion', title: 'Última Estación', artist: 'Andén 9', charter: 'riffmaster_cl', genre: 'Punk', bpm: 118, bars: 44, bg: '#3A1020', fg: '#FF4D6D', verified: true },
  { id: 'ciudad-dormida', title: 'Ciudad Dormida', artist: 'Nube Baja', charter: 'ChartsDelSur', genre: 'Indie', bpm: 104, bars: 40, bg: '#241A48', fg: '#B26BFF', verified: false },
  { id: 'cuerdas-de-acero', title: 'Cuerdas de Acero', artist: 'La Fundición', charter: 'pulso', genre: 'Rock', bpm: 136, bars: 48, bg: '#2A2A12', fg: '#FFD23F', verified: false },
  { id: 'kilometro-cero', title: 'Kilómetro Cero', artist: 'Los Temporeros', charter: 'ChartsDelSur', genre: 'Cumbia rock', bpm: 124, bars: 44, bg: '#10283A', fg: '#3FA9FF', verified: true },
  // Temas inventados estilo opening de anime (J-Rock rápido)
  { id: 'hoshizora-drive', title: 'Hoshizora Drive', artist: 'Tsubasa Rockets', charter: 'mika.charts', genre: 'Anime', bpm: 176, bars: 44, bg: '#3A0F3E', fg: '#EC4899', verified: true },
  { id: 'kaze-no-kiseki', title: 'Kaze no Kiseki', artist: 'Aoi Hanabi', charter: 'pulso', genre: 'Anime', bpm: 150, bars: 40, bg: '#0E2E4A', fg: '#3FA9FF', verified: true },
  { id: 'mirai-shounen', title: 'Mirai Shounen', artist: 'Kōsoku Kids', charter: 'ChartsDelSur', genre: 'J-Rock', bpm: 188, bars: 48, bg: '#40200A', fg: '#FFD23F', verified: false },
  { id: 'sakura-overdrive', title: 'Sakura Overdrive', artist: 'Neko Voltage', charter: 'riffmaster_cl', genre: 'Anime', bpm: 164, bars: 40, bg: '#3B1030', fg: '#FF4D6D', verified: true },
  { id: 'hierro-y-fuego', title: 'Hierro y Fuego', artist: 'Forja Oscura', charter: 'mika.charts', genre: 'Metal', bpm: 184, bars: 56, bg: '#2A0C0C', fg: '#FF4D6D', verified: true },
  { id: 'luces-de-neon', title: 'Luces de Neón', artist: 'Sintetika', charter: 'pulso', genre: 'Electrónica', bpm: 120, bars: 40, bg: '#0B2A2A', fg: '#3DDC84', verified: false }
];

export const DEMO_CHARTS: Chart[] = SEEDS.map((s, i) => {
  const notes = generateExpert(s.bpm, s.bars, 1000 + i * 77);
  const base: Chart = {
    id: s.id,
    title: s.title,
    artist: s.artist,
    charter: s.charter,
    genre: s.genre,
    bpm: s.bpm,
    offsetMs: 0,
    durationSec: Math.ceil((s.bars * 4 * 60) / s.bpm) + 2,
    source: { kind: 'metronome' },
    cover: { bg: s.bg, fg: s.fg },
    difficulties: { expert: { lanes: 5, notes } },
    verified: s.verified,
    version: 1
  };
  return fillDifficulties(base);
});

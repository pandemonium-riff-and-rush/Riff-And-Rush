export type DifficultyId = 'easy' | 'medium' | 'hard' | 'expert' | 'legend';

export const DIFFICULTIES: { id: DifficultyId; name: string; lanes: number; label: string; color: string; level: number }[] = [
  { id: 'easy', name: 'Fácil', lanes: 3, label: '3', color: '#3DDC84', level: 1 },
  { id: 'medium', name: 'Normal', lanes: 4, label: '4', color: '#3FA9FF', level: 2 },
  { id: 'hard', name: 'Difícil', lanes: 5, label: '5', color: '#FFD23F', level: 3 },
  { id: 'expert', name: 'Experto', lanes: 5, label: '5+', color: '#FF4D6D', level: 4 },
  { id: 'legend', name: 'Leyenda', lanes: 6, label: '6', color: '#B26BFF', level: 5 }
];

export function difficultyInfo(id: DifficultyId) {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[3];
}

/**
 * Técnicas de guitarra que sobrevivieron al laboratorio. Todas se tocan con los
 * MISMOS botones que ya usa el jugador: cambian qué significa apretar, no cuántos hay.
 *
 * Mecánicas de verdad (piden algo distinto de la mano):
 * - pull: se toca SOLTANDO el traste. El único golpe invertido del juego.
 * - hopo: ligado. NO es una técnica por sí sola: existe para armar la frase
 *   que sube apilando dedos y baja despegándolos con pull-offs.
 * - harm: armónico/acorde. Una o varias teclas juntas, y hay que clavarlo en Perfecto.
 *
 * Sabor y fluidez (no piden nada nuevo, cambian cómo se ve y se siente):
 * - mute: chug apagado. Textura, no mecánica: nota chata y golpe seco.
 * - sweep: barrido. Carrera que perdona más y paga en cadena; tiene que fluir.
 *
 * Murieron probando: slide (estresante y poco claro) y trémolo (machacar no es
 * un gesto interesante y peleaba con el antimachaque).
 */
export type Tech = 'hopo' | 'pull' | 'mute' | 'harm' | 'sweep';

export const TECHS: { id: Tech; name: string; short: string }[] = [
  { id: 'hopo', name: 'Ligado (hammer-on)', short: 'HO' },
  { id: 'pull', name: 'Pull-off', short: 'PO' },
  { id: 'harm', name: 'Armónico / acorde', short: 'AR' },
  { id: 'mute', name: 'Palm mute', short: 'PM' },
  { id: 'sweep', name: 'Barrido', short: 'BA' }
];

/** Una nota del chart. Tiempos en segundos desde el inicio de la canción (antes de aplicar el offset). */
export interface Note {
  t: number;
  lane: number;
  /** Duración de la nota larga en segundos (0 = nota corta). */
  len: number;
  hopo?: boolean;
  /** Técnica de guitarra. Sin esto la nota es normal (charts viejos siguen igual). */
  tech?: Tech;
  /**
   * Carriles extra que hay que apretar JUNTO con `lane` (acorde).
   * Un armónico puede ser de una sola tecla (sin esto), de dos o de las que pida la canción.
   */
  chord?: number[];
}

/** Todos los carriles que hay que apretar a la vez para una nota. */
export function noteLanes(n: Note): number[] {
  return n.chord?.length ? [n.lane, ...n.chord] : [n.lane];
}

export interface DifficultyChart {
  lanes: number;
  notes: Note[];
  /** true si se generó automáticamente desde Experto. */
  generated?: boolean;
}

export type ChartSource =
  | { kind: 'youtube'; videoId: string }
  | { kind: 'metronome' };

export interface TempoPoint { t: number; bpm: number }

export interface Chart {
  id: string;
  title: string;
  artist: string;
  charter: string;
  genre?: string;
  bpm: number;
  tempo?: TempoPoint[];
  /** Desfase entre el video y el chart. Positivo = las notas llegan más tarde. */
  offsetMs: number;
  /** Segundos de espera antes de iniciar la canción (las notas ya van bajando). */
  leadInSec?: number;
  durationSec: number;
  /**
   * Segundo en que la canción termina PARA EL JUEGO. Sirve cuando el video sigue
   * con créditos, outro largo o silencio: la partida cierra acá y no se espera al video.
   * Vacío o 0 = hasta el final del video.
   */
  endSec?: number;
  source: ChartSource;
  cover: { bg: string; fg: string };
  difficulties: Partial<Record<DifficultyId, DifficultyChart>>;
  verified?: boolean;
  version: number;
}

export const LANE_COLORS = ['#3DDC84', '#FF4D6D', '#FFD23F', '#3FA9FF', '#FF8A3D', '#B26BFF'];
export const DEFAULT_KEYS = ['a', 's', 'j', 'k', 'l', 'ñ'];

/** Segundo en que termina la partida: el final del chart o el del video, lo que venga antes. */
export function playEnd(c: { durationSec: number; endSec?: number }) {
  return c.endSec && c.endSec > 0 ? Math.min(c.endSec, c.durationSec) : c.durationSec;
}

/**
 * Margen de inicio: cuántos segundos corre el juego ANTES de que parta la canción.
 * El margen del chart es el tiempo mínimo que el jugador ve bajar notas antes de la primera.
 * Si la canción ya tiene una intro más larga que eso, el video parte de inmediato (0 s).
 * `offsetSec` = desfase video/chart (positivo = las notas llegan más tarde).
 */
export function preRollSec(marginSec: number, notes: Note[], offsetSec = 0) {
  if (!notes.length) return 0;
  let first = Infinity;
  for (const n of notes) first = Math.min(first, n.t);
  return Math.max(0, Math.round((marginSec - first - offsetSec) * 1000) / 1000);
}

/** Último segundo con nota (incluye la cola de las notas largas). */
export function lastNoteEnd(notes: Note[]) {
  let end = 0;
  for (const n of notes) end = Math.max(end, n.t + n.len);
  return end;
}

export function formatTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

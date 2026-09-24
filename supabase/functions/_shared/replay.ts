/**
 * Rehace una partida a partir del registro de teclas. Lo usa la Edge Function submit-score
 * y también las pruebas (vitest), así que no puede importar nada de Deno.
 *
 * Nota: las técnicas (barrido, ligado, pull-off, armónico, acordes) todavía están en fase de prueba
 * y solo existen en lib/game/engine.ts. Cuando se estabilicen hay que traerlas acá.
 */
export interface Note { t: number; lane: number; len: number }
/** [tiempo, carril, código]: 1 apreta · 0 suelta · 2 energía · 3 pausa y retoma (el tiempo puede volver atrás) */
export type Input = [number, number, number];
export interface ReplayOpts { precision?: boolean; ghostPenalty?: boolean; dropless?: boolean }

export const DIFFS = ['easy', 'medium', 'hard', 'expert', 'legend'];

/** Misma lógica de puntaje que el juego (lib/game/engine.ts). */
export class Scorer {
  notes: (Note & { state: number; holding: boolean; heldUntil: number })[];
  score = 0; combo = 0; maxCombo = 0; perfect = 0; good = 0; miss = 0; ghosts = 0;
  energy = 0; boostUntil = -1; lastTime = 0;
  private cursor = 0;
  private lastHitAt = [-99, -99, -99, -99, -99, -99];

  constructor(notes: Note[], private durationSec: number, private opts: ReplayOpts) {
    this.notes = [...notes].sort((a, b) => a.t - b.t || a.lane - b.lane).map((n) => ({ ...n, state: 0, holding: false, heldUntil: 0 }));
  }
  get wPerfect() { return this.opts.precision ? 0.035 : 0.05; }
  get wGood() { return this.opts.precision ? 0.07 : 0.1; }
  get wMiss() { return this.opts.precision ? 0.1 : 0.14; }
  get total() { return this.notes.length; }
  get hit() { return this.perfect + this.good; }
  get boosting() { return this.boostUntil > this.lastTime; }
  get multiplier() { const base = Math.min(4, 1 + Math.floor(this.combo / 10)); return this.boosting ? base * 2 : base; }
  get accuracy() { const j = this.perfect + this.good + this.miss; return j ? (this.perfect + this.good * 0.6) / j : 1; }
  stars() { const a = this.accuracy * 100; return a >= 98 ? 5 : a >= 93 ? 4 : a >= 85 ? 3 : a >= 70 ? 2 : 1; }

  private register(n: Scorer['notes'][number], j: 'perfect' | 'good' | 'miss', t: number) {
    if (j === 'miss') { n.state = 2; this.miss++; this.combo = 0; return; }
    n.state = 1;
    this.lastHitAt[n.lane] = t;
    if (j === 'perfect') this.perfect++; else this.good++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += (j === 'perfect' ? 50 : 35) * this.multiplier;
    this.energy = Math.min(1, this.energy + (j === 'perfect' ? 0.012 : 0.006));
    if (n.len > 0) { n.holding = true; n.heldUntil = n.t; }
  }

  update(t: number, held: boolean[]) {
    this.lastTime = t;
    while (this.cursor < this.notes.length && this.notes[this.cursor].state !== 0) this.cursor++;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t > t) break;
      if (n.state === 0 && t - n.t > this.wMiss) this.register(n, 'miss', t);
    }
    for (let i = Math.max(0, this.cursor - 64); i < this.notes.length && this.notes[i].t <= t; i++) {
      const n = this.notes[i];
      if (!n.holding) continue;
      const end = n.t + n.len;
      if (!held[n.lane]) { n.holding = false; if (this.opts.dropless && end - t > 0.1) this.combo = 0; continue; }
      const upto = Math.min(t, end);
      if (upto > n.heldUntil) { this.score += Math.round((upto - n.heldUntil) * 60 * this.multiplier); n.heldUntil = upto; }
      if (t >= end) n.holding = false;
    }
    if (this.boosting) this.energy = Math.max(0, (this.boostUntil - t) / 8);
  }

  press(lane: number, t: number) {
    let best: Scorer['notes'][number] | null = null;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t - t > this.wMiss) break;
      if (n.state !== 0 || n.lane !== lane) continue;
      if (Math.abs(n.t - t) <= this.wMiss && (!best || Math.abs(n.t - t) < Math.abs(best.t - t))) best = n;
    }
    if (!best) {
      if (!this.opts.ghostPenalty || t < 0) return;
      if (t - this.lastHitAt[lane] < 0.09) return;
      for (let i = Math.max(0, this.cursor - 16); i < this.notes.length && this.notes[i].t <= t; i++) if (this.notes[i].holding && this.notes[i].lane === lane) return;
      this.ghosts++; this.combo = 0;
      return;
    }
    const d = Math.abs(t - best.t);
    this.register(best, d <= this.wPerfect ? 'perfect' : d <= this.wGood ? 'good' : 'miss', t);
  }

  activateBoost(t: number) {
    if (this.energy < 0.5 || this.boosting) return;
    this.boostUntil = t + 8 * this.energy;
  }
}

export const MAX_LOG = 30000;
export const MAX_RESUMES = 100;

/**
 * Revisa la forma del registro antes de rehacer la partida. Devuelve un mensaje de error o null.
 * El tiempo solo puede retroceder justo en una marca de "pausa y retoma" (código 3).
 */
export function validateLog(log: unknown, maxT: number): string | null {
  if (!Array.isArray(log) || !log.length) return 'Registro vacío';
  if (log.length > MAX_LOG) return 'Registro demasiado largo';
  let prev = -Infinity;
  let resumes = 0;
  for (const e of log) {
    if (!Array.isArray(e) || e.length !== 3) return 'Registro inválido';
    const [t, lane, code] = e;
    if (typeof t !== 'number' || typeof lane !== 'number' || typeof code !== 'number') return 'Registro inválido';
    if (!Number.isFinite(t) || !Number.isInteger(lane) || !Number.isInteger(code)) return 'Registro inválido';
    if (code < 0 || code > 3 || lane < -1 || lane > 5 || t < -15 || t > maxT) return 'Registro inválido';
    if ((code === 2 || code === 3) !== (lane === -1)) return 'Registro inválido';
    if (code === 3) { if (++resumes > MAX_RESUMES) return 'Demasiadas pausas'; }
    else if (t < prev - 0.001) return 'Registro fuera de orden';
    prev = t;
  }
  return null;
}

export function replay(notes: Note[], durationSec: number, log: Input[], opts: ReplayOpts) {
  const s = new Scorer(notes, durationSec, opts);
  const held = [false, false, false, false, false, false];
  const STEP = 1 / 60;
  let t = Math.min(0, log[0]?.[0] ?? 0);
  for (const [it, lane, code] of log) {
    if (code === 3) {
      // Pausa: se sueltan todos los carriles y el tiempo salta (normalmente hacia atrás)
      held.fill(false);
      t = it;
      s.update(t, held);
      continue;
    }
    while (t + STEP < it) { t += STEP; s.update(t, held); }
    t = it;
    s.update(t, held);
    if (code === 2) s.activateBoost(t);
    else if (lane >= 0 && lane < 6) {
      if (code === 1) { held[lane] = true; s.press(lane, t); }
      else { held[lane] = false; }
    }
  }
  const end = durationSec + 5;
  while (t + STEP < end) { t += STEP; s.update(t, held); }
  s.update(end, held);
  return s;
}

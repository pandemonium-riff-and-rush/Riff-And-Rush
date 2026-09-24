import type { Note, Tech } from '../chart/types';
import { noteLanes } from '../chart/types';

/** Ventanas de juicio en segundos (a cada lado). */
export const WINDOW_PERFECT = 0.05;
export const WINDOW_GOOD = 0.1;
export const WINDOW_MISS = 0.14;

export type Judgment = 'perfect' | 'good' | 'miss' | 'ghost';

/** Opciones de juego (modificadores). */
export interface ScorerOptions {
  /** Ventanas más chicas (35 / 70 / 100 ms). */
  precision?: boolean;
  /** Apretar sin nota cerca rompe la racha (anti-machaque). */
  ghostPenalty?: boolean;
  /** Soltar una nota larga antes de tiempo rompe la racha. */
  dropless?: boolean;
}

/** Hasta cuándo se puede soltar un chug antes de que la nota "se abra". */
export const CHOKE_SEC = 0.22;
/** Cuánto se esperan los dos dedos del armónico. */
const PINCH_SEC = 0.12;
/** Cuánto vale un chug si lo dejas sonando en vez de ahogarlo. */
const OPEN_MUTE = 0.55;

export interface LiveNote extends Note {
  idx: number;
  state: 'pending' | 'hit' | 'miss';
  /** Para notas largas: hasta dónde se mantuvo apretada. */
  heldUntil?: number;
  holding?: boolean;
  offsetMs?: number;
}

export interface JudgeEvent {
  judgment: Judgment;
  lane: number;
  at: number;
  offsetMs: number;
  tech?: Tech;
  /** Ligado tomado sin soltar el traste anterior, o armónico clavado: da bonus. */
  clean?: boolean;
  /** Golpe de relleno: hace chispas pero no saca cartel. */
  quiet?: boolean;
}

/**
 * Lógica de puntaje. Independiente del render y del reloj para poder
 * recalcular una partida en el servidor a partir del log de inputs (anti-trampa).
 */
export class Scorer {
  notes: LiveNote[];
  score = 0;
  combo = 0;
  maxCombo = 0;
  perfect = 0;
  good = 0;
  miss = 0;
  energy = 0; // 0..1
  // -Infinity (no -1): durante el margen de inicio el tiempo es negativo y con -1 el juego
  // creía estar en modo Leyenda desde el principio
  boostUntil = -Infinity;
  events: JudgeEvent[] = [];
  /** Total de juicios emitidos (no se recorta como events). */
  eventCount = 0;
  /**
   * Log de inputs: [tiempo, carril, código]. Códigos: 1 = presiona, 0 = suelta,
   * 2 = activa energía, 3 = pausa y retoma (el tiempo puede volver atrás y se sueltan todos los carriles).
   */
  inputLog: [number, number, number][] = [];
  private cursor = 0;
  private buckets: { hit: number; total: number }[];

  ghosts = 0;
  sustainDrops = 0;
  /** Ligados y armónicos tomados limpios (para mostrar en resultados). */
  cleanTechs = 0;
  /** Carriles apretados ahora mismo: lo necesita el ligado para saber si vienes sin soltar. */
  private down: boolean[] = new Array(6).fill(false);
  /** Barridos seguidos rodando limpio: cada uno vale un poco más que el anterior. */
  private sweepRun = 0;
  /**
   * Cadena de ligado: cuántas notas seguidas llevas sin soltar los dedos anteriores.
   * Se muestra en pantalla mientras la armas, que es lo que la hace sentirse.
   */
  chain = 0;
  /** Cuántos dedos tienes puestos ahora (la "pila" del ligado). */
  get stack() { return this.down.reduce((a, d) => a + (d ? 1 : 0), 0); }
  /** Desfase (ms) de cada acierto: negativo = temprano. Sirve para autocalibrar. */
  hitOffsets: number[] = [];
  private wPerfect: number;
  private wGood: number;
  private wMiss: number;
  private lastHitAt: number[] = new Array(6).fill(-99);

  constructor(notes: Note[], private durationSec: number, private opts: ScorerOptions = {}) {
    this.wPerfect = opts.precision ? 0.035 : WINDOW_PERFECT;
    this.wGood = opts.precision ? 0.07 : WINDOW_GOOD;
    this.wMiss = opts.precision ? 0.1 : WINDOW_MISS;
    this.notes = [...notes].sort((a, b) => a.t - b.t || a.lane - b.lane).map((n, idx) => ({ ...n, idx, state: 'pending' as const }));
    this.buckets = Array.from({ length: 40 }, () => ({ hit: 0, total: 0 }));
  }

  get total() { return this.notes.length; }
  get hit() { return this.perfect + this.good; }
  get multiplier() {
    const base = Math.min(4, 1 + Math.floor(this.combo / 10));
    return this.boosting ? base * 2 : base;
  }
  lastTime = 0;
  get boosting() { return this.boostUntil > this.lastTime; }
  get accuracy() {
    const judged = this.perfect + this.good + this.miss;
    return judged ? (this.perfect + this.good * 0.6) / judged : 1;
  }

  private bucket(t: number) {
    return this.buckets[Math.max(0, Math.min(39, Math.floor((t / Math.max(1, this.durationSec)) * 40)))];
  }

  private register(n: LiveNote, j: Judgment, t: number, offsetMs: number, clean = false) {
    const b = this.bucket(n.t);
    b.total++;
    if (j === 'miss') {
      n.state = 'miss';
      this.miss++;
      this.combo = 0;
      this.sweepRun = 0;
      this.chain = 0;
    } else {
      n.state = 'hit';
      n.offsetMs = offsetMs;
      this.hitOffsets.push(offsetMs);
      this.lastHitAt[n.lane] = t;
      if (j === 'perfect') this.perfect++; else this.good++;
      b.hit++;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      // Bonus por técnica. Todo lo que paga extra pide una mano distinta:
      // el barrido rodando, el ligado apilando, el armónico pellizcando.
      let bonus = 1;
      // Barrido: tiene que FLUIR. No pide gesto, solo encadenar; cada una vale más.
      if (n.tech === 'sweep') { this.sweepRun++; bonus = Math.min(2, 1 + this.sweepRun * 0.2); }
      else this.sweepRun = 0;
      // Frase ligada: ligado y pull-off son la MISMA cadena (subir apilando, bajar despegando)
      if (n.tech === 'hopo' || n.tech === 'pull') {
        this.chain = clean ? this.chain + 1 : 0;
        bonus *= 1 + Math.min(6, this.chain) * 0.15;
      } else this.chain = 0;
      if (clean) { bonus *= n.tech === 'harm' ? 2 : 1.15; this.cleanTechs++; }
      this.score += Math.round((j === 'perfect' ? 50 : 35) * this.multiplier * bonus);
      this.energy = Math.min(1, this.energy + (j === 'perfect' ? 0.012 : 0.006) + (clean ? 0.02 : 0));
      if (n.len > 0) { n.holding = true; n.heldUntil = n.t; }
    }
    this.events.push({ judgment: j, lane: n.lane, at: t, offsetMs, tech: n.tech, clean });
    this.eventCount++;
    if (this.events.length > 64) this.events.shift();
  }

  /** Avanza el tiempo: marca como falladas las notas que ya pasaron y suma notas largas mantenidas. */
  update(t: number, held: boolean[]) {
    this.lastTime = t;
    while (this.cursor < this.notes.length && this.notes[this.cursor].state !== 'pending') this.cursor++;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t > t) break;
      if (n.state === 'pending' && t - n.t > this.windowOf(n).capture) this.register(n, 'miss', t, 0);
    }
    for (let i = Math.max(0, this.cursor - 64); i < this.notes.length && this.notes[i].t <= t; i++) {
      const n = this.notes[i];
      if (!n.holding) continue;
      const end = n.t + n.len;
      if (!held[n.lane]) {
        n.holding = false;
        // Sostenidas sin perdón: soltar antes de los últimos 100 ms rompe la racha
        if (this.opts.dropless && end - t > 0.1) { this.combo = 0; this.sustainDrops++; }
        continue;
      }
      const upto = Math.min(t, end);
      if (upto > (n.heldUntil ?? n.t)) {
        this.score += Math.round((upto - (n.heldUntil ?? n.t)) * 60 * this.multiplier);
        n.heldUntil = upto;
      }
      if (t >= end) n.holding = false;
    }
    if (this.boosting) this.energy = Math.max(0, (this.boostUntil - t) / 8);
  }

  /** El jugador apretó un carril. Devuelve el juicio o null si no había nota cerca (y no se castiga). */
  press(lane: number, t: number): JudgeEvent | null {
    this.inputLog.push([Math.round(t * 1000) / 1000, lane, 1]);
    this.down[lane] = true;

    // Acorde: varias teclas juntas. Los dedos que van llegando no castigan ni
    // consumen la nota; la cierra el último que entra.
    const pinch = this.pendingChord(lane, t);
    if (pinch) {
      if (!noteLanes(pinch).every((l) => this.down[l])) return null;
      const dp = t - pinch.t;
      const jp: Judgment = Math.abs(dp) <= this.wPerfect ? 'perfect' : Math.abs(dp) <= this.wGood ? 'good' : 'miss';
      this.register(pinch, jp, t, Math.round(dp * 1000), this.isClean(pinch, jp));
      return this.events[this.events.length - 1];
    }

    let best: LiveNote | null = null;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t - t > this.wMiss * 1.6) break;
      // El pull-off no se aprieta: se toca soltando (ver release)
      if (n.state !== 'pending' || n.lane !== lane || n.tech === 'pull') continue;
      if (Math.abs(n.t - t) <= this.windowOf(n).capture && (!best || Math.abs(n.t - t) < Math.abs(best.t - t))) best = n;
    }
    if (!best) {
      if (!this.opts.ghostPenalty || t < 0) return null;
      // Rebote de la tecla o nota larga sonando en ese carril: no se castiga
      if (t - this.lastHitAt[lane] < 0.09) return null;
      for (let i = Math.max(0, this.cursor - 16); i < this.notes.length && this.notes[i].t <= t; i++) {
        const n = this.notes[i];
        if (n.holding && n.lane === lane) return null;
      }
      this.ghosts++;
      this.combo = 0;
      this.events.push({ judgment: 'ghost', lane, at: t, offsetMs: 0 });
      this.eventCount++;
      if (this.events.length > 64) this.events.shift();
      return this.events[this.events.length - 1];
    }
    const d = t - best.t;
    const j: Judgment = Math.abs(d) <= this.wPerfect ? 'perfect' : Math.abs(d) <= this.windowOf(best).good ? 'good' : 'miss';
    this.register(best, j, t, Math.round(d * 1000), this.isClean(best, j));
    return this.events[this.events.length - 1];
  }

  /**
   * Ventanas de la nota. El barrido perdona más: es una carrera, no un golpe seco,
   * así que se ensancha tanto lo que alcanza a agarrar como lo que todavía cuenta bien.
   */
  private windowOf(n: LiveNote) {
    return n.tech === 'sweep'
      ? { good: this.wMiss * 1.25, capture: this.wMiss * 1.6 }
      : { good: this.wGood, capture: this.wMiss };
  }

  /**
   * "Limpio" = tocado con la mano que corresponde. Cada técnica pide un gesto distinto:
   * el ligado APILA (no sueltas), el barrido RUEDA (sueltas al pasar al siguiente),
   * el pull-off DESPEGA, el armónico PELLIZCA (dos dedos) y además hay que clavarlo.
   */
  private isClean(n: LiveNote, j: Judgment) {
    const prev = this.notes[n.idx - 1];
    switch (n.tech) {
      case 'harm':
        return j === 'perfect';
      case 'hopo':
        // Apilar: la nota anterior tiene que seguir apretada
        return !!prev && prev.state === 'hit' && this.down[prev.lane] && n.t - prev.t < 1.2;
      case 'pull':
        // Soltar es el golpe: limpio = venía encadenado con la anterior
        return !!prev && prev.state === 'hit' && n.t - prev.t < 1.2;
      default:
        return false;
    }
  }

  /** Acorde (armónico de varias teclas) a medio armar en este carril. */
  private pendingChord(lane: number, t: number): LiveNote | null {
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t - t > this.wMiss) break;
      if (n.state !== 'pending' || !n.chord?.length) continue;
      if (noteLanes(n).includes(lane) && Math.abs(n.t - t) <= this.wMiss) return n;
    }
    return null;
  }



  /** Marca como ya pasadas (sin contar) las notas antes de t: para practicar desde un tramo. */
  skipBefore(t: number) {
    for (const n of this.notes) { if (n.t >= t) break; n.state = 'hit'; }
  }

  /** Mediana del desfase de los aciertos (ms) y cuántos hubo. */
  medianOffset() {
    const a = [...this.hitOffsets].sort((x, y) => x - y);
    return { ms: a.length ? a[Math.floor(a.length / 2)] : 0, count: a.length };
  }

  /**
   * Soltar un traste. Además de cerrar sostenidas, ES el golpe del pull-off:
   * esa nota no se aprieta, se toca soltando.
   */
  release(lane: number, t: number): JudgeEvent | null {
    this.inputLog.push([Math.round(t * 1000) / 1000, lane, 0]);
    this.down[lane] = false;

    let best: LiveNote | null = null;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t - t > this.wMiss) break;
      if (n.state !== 'pending' || n.tech !== 'pull' || n.lane !== lane) continue;
      if (Math.abs(n.t - t) <= this.wMiss && (!best || Math.abs(n.t - t) < Math.abs(best.t - t))) best = n;
    }
    if (!best) return null;
    const d = t - best.t;
    const j: Judgment = Math.abs(d) <= this.wPerfect ? 'perfect' : Math.abs(d) <= this.wGood ? 'good' : 'miss';
    this.register(best, j, t, Math.round(d * 1000), this.isClean(best, j));
    return this.events[this.events.length - 1];
  }

  /**
   * Pausa + retroceso: al retomar, el reloj vuelve un par de segundos atrás y todas las teclas
   * quedan sueltas. Se anota en el registro para que el servidor rehaga la partida igual
   * (es el único caso en que el tiempo del registro puede retroceder).
   */
  markResume(t: number) {
    this.down.fill(false);
    this.lastTime = t;
    this.inputLog.push([Math.round(t * 1000) / 1000, -1, 3]);
  }

  /** Activa el modo Leyenda (multiplicador ×2 por hasta 8 s) si hay al menos 50 % de energía. */
  activateBoost(t: number) {
    if (this.energy < 0.5 || this.boosting) return false;
    this.boostUntil = t + 8 * this.energy;
    // Queda en el registro para que el servidor pueda rehacer la partida igual
    this.inputLog.push([Math.round(t * 1000) / 1000, -1, 2]);
    return true;
  }

  timeline() {
    return this.buckets.map((b) => (b.total ? Math.round((b.hit / b.total) * 100) : 100));
  }

  stars() {
    const a = this.accuracy * 100;
    return a >= 98 ? 5 : a >= 93 ? 4 : a >= 85 ? 3 : a >= 70 ? 2 : 1;
  }

  rank() {
    const a = this.accuracy * 100;
    return a >= 97 ? 'S' : a >= 90 ? 'A' : a >= 80 ? 'B' : a >= 65 ? 'C' : 'D';
  }
}

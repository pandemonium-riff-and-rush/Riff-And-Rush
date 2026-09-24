import type { Note } from '@/lib/chart/types';
import { Scorer } from '@/lib/game/engine';

export const STEP = 1 / 60;

export interface SimEvent { t: number; lane: number; down: boolean }

/** Un "bot" que aprieta cada nota a destiempo `err` segundos y suelta al final de la nota. */
export function botEvents(notes: Note[], err = 0): SimEvent[] {
  const ev: SimEvent[] = [];
  for (const n of notes) {
    ev.push({ t: n.t + err, lane: n.lane, down: true });
    ev.push({ t: n.t + err + Math.max(0.05, n.len), lane: n.lane, down: false });
  }
  // Soltar antes que apretar cuando caen en el mismo instante
  return ev.sort((a, b) => a.t - b.t || Number(a.down) - Number(b.down));
}

/**
 * Juega como GameScreen: avanza cuadro a cuadro (60 fps) y entrega las teclas.
 * `pauseAt`: pausa en ese segundo y retoma 2 s antes, como el juego real.
 */
export function playClient(notes: Note[], durationSec: number, events: SimEvent[], opts: ConstructorParameters<typeof Scorer>[2] = {}, pauseAt?: number) {
  const s = new Scorer(notes, durationSec, opts);
  const held = new Array(6).fill(false);
  let t = -1;
  let i = 0;
  let paused = false;
  const end = durationSec + 5;
  while (t < end) {
    t += STEP;
    if (pauseAt !== undefined && !paused && t >= pauseAt) {
      paused = true;
      held.fill(false);
      t = pauseAt - 2;
      s.markResume(t);
      // Las teclas ya tocadas no se repiten: el bot sigue desde donde iba
    }
    while (i < events.length && events[i].t <= t) {
      const e = events[i++];
      held[e.lane] = e.down;
      if (e.down) s.press(e.lane, e.t); else s.release(e.lane, e.t);
    }
    s.update(t, held);
  }
  return s;
}

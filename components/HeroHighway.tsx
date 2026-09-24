'use client';

import { useEffect, useRef } from 'react';
import type { LiveNote } from '@/lib/game/engine';
import { Fx } from '@/lib/game/fx';
import { HH, HIT, HW, drawHighway, laneX } from '@/lib/game/render';
import { LANE_COLORS } from '@/lib/chart/types';

const BPM = 128;
const LANES = 5;

/** Autopista en vivo para la portada: se toca sola, con chispas y todo. */
export default function HeroHighway() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = HW * dpr; cv.height = HH * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fx = new Fx();
    const beat = 60 / BPM;
    const notes: LiveNote[] = [];
    let nextStep = 0;
    const pressed = new Array(6).fill(false);
    const flashAt = new Array(6).fill(-99);
    const upAt = new Array(6).fill(-1);
    const t0 = performance.now();
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Patrón pseudoaleatorio pero musical: corcheas con acordes y alguna nota larga
    const rnd = (k: number) => { const x = Math.sin(k * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const gen = (upto: number) => {
      while (nextStep * beat / 2 < upto) {
        const k = nextStep++;
        const t = k * beat / 2;
        if (rnd(k) < 0.28 && k % 2 === 1) continue;
        const lane = Math.floor(rnd(k + 7) * LANES);
        const long = k % 16 === 0;
        notes.push({ t, lane, len: long ? beat * 1.5 : 0, idx: k, state: 'pending' });
        if (k % 8 === 4) notes.push({ t, lane: (lane + 2) % LANES, len: 0, idx: k + 0.5, state: 'pending' });
      }
    };

    let raf = 0;
    const loop = () => {
      const t = still ? 6 : (performance.now() - t0) / 1000 + 2;
      gen(t + 4);
      for (let i = 0; i < 6; i++) if (upAt[i] >= 0 && t >= upAt[i]) { pressed[i] = false; upAt[i] = -1; }
      for (const n of notes) {
        if (n.t > t) break;
        if (n.state === 'pending') {
          n.state = 'hit';
          n.holding = n.len > 0;
          pressed[n.lane] = true;
          flashAt[n.lane] = t;
          upAt[n.lane] = n.t + Math.max(n.len, 0.08);
          fx.hit(laneX(n.lane, LANES), HIT, LANE_COLORS[n.lane], n.idx % 4 === 0);
        }
        if (n.holding && t > n.t + n.len) n.holding = false;
      }
      while (notes.length && notes[0].t + notes[0].len < t - 2) notes.shift();
      const combo = Math.floor(t / beat);
      drawHighway(ctx, { t, notes, lanes: LANES, window: 2, bpm: BPM, pressed, flashAt, boosting: Math.floor(t / 16) % 3 === 2, showNotes: true, theme: 'estadio', mult: Math.min(4, 1 + Math.floor((combo % 64) / 16)), fx });
      if (!still) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div aria-hidden="true" className="hero-hw" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 700, pointerEvents: 'none' }}>
      <canvas ref={ref} style={{ position: 'absolute', right: 40, top: 20, width: HW * 0.78, height: HH * 0.78, opacity: 0.9 }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, #0E0B20 0%, rgba(14,11,32,0.6) 35%, rgba(14,11,32,0) 70%), linear-gradient(0deg, #0E0B20 0%, rgba(14,11,32,0) 30%)' }} />
    </div>
  );
}

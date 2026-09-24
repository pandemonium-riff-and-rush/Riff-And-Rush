import { describe, expect, it } from 'vitest';
import type { Note } from '@/lib/chart/types';
import { Scorer } from '@/lib/game/engine';
import { botEvents, playClient } from './sim';

const beat = 0.5;
const simple: Note[] = Array.from({ length: 40 }, (_, i) => ({ t: 2 + i * beat, lane: i % 5, len: 0 }));

describe('Scorer (motor del juego)', () => {
  it('una partida perfecta acierta todo con 100 % y 5 estrellas', () => {
    const s = playClient(simple, 25, botEvents(simple));
    expect(s.hit).toBe(simple.length);
    expect(s.miss).toBe(0);
    expect(s.accuracy).toBe(1);
    expect(s.stars()).toBe(5);
    expect(s.maxCombo).toBe(simple.length);
  });

  it('sin tocar nada, todas las notas son fallo', () => {
    const s = playClient(simple, 25, []);
    expect(s.miss).toBe(simple.length);
    expect(s.score).toBe(0);
  });

  it('70 ms de atraso cuenta como "bien", no "perfecto"', () => {
    const s = playClient(simple, 25, botEvents(simple, 0.07));
    expect(s.good).toBe(simple.length);
    expect(s.perfect).toBe(0);
  });

  it('el modo precisión achica las ventanas', () => {
    const normal = playClient(simple, 25, botEvents(simple, 0.04));
    const precise = playClient(simple, 25, botEvents(simple, 0.04), { precision: true });
    expect(normal.perfect).toBe(simple.length);
    expect(precise.perfect).toBe(0);
  });

  it('apretar sin nota rompe la racha solo con ghostPenalty', () => {
    const ev = [...botEvents(simple.slice(0, 5)), { t: 5.2, lane: 0, down: true }, { t: 5.25, lane: 0, down: false }];
    const sinCastigo = playClient(simple.slice(0, 5), 10, ev);
    const conCastigo = playClient(simple.slice(0, 5), 10, ev, { ghostPenalty: true });
    expect(sinCastigo.ghosts).toBe(0);
    expect(conCastigo.ghosts).toBe(1);
    expect(conCastigo.combo).toBe(0);
  });

  it('la nota larga suma puntos mientras se mantiene', () => {
    const long: Note[] = [{ t: 1, lane: 0, len: 2 }];
    const held = playClient(long, 5, botEvents(long));
    const tapped = playClient(long, 5, [{ t: 1, lane: 0, down: true }, { t: 1.05, lane: 0, down: false }]);
    expect(held.score).toBeGreaterThan(tapped.score + 100);
  });

  it('la energía solo se activa con al menos 50 %', () => {
    const s = new Scorer(simple, 25);
    expect(s.activateBoost(1)).toBe(false);
    s.energy = 0.6;
    expect(s.activateBoost(1)).toBe(true);
    expect(s.inputLog.at(-1)).toEqual([1, -1, 2]);
  });

  it('pausar y retomar deja la marca en el registro y no pierde notas', () => {
    const s = playClient(simple, 25, botEvents(simple), {}, 10);
    expect(s.inputLog.some(([, lane, code]) => lane === -1 && code === 3)).toBe(true);
    expect(s.hit).toBe(simple.length);
  });
});

describe('modo Leyenda', () => {
  it('no parte activo durante el margen de inicio (tiempo negativo)', () => {
    const s = new Scorer(simple, 25);
    s.update(-3, new Array(6).fill(false));
    expect(s.boosting).toBe(false);
    expect(s.multiplier).toBe(1);
    expect(s.energy).toBe(0);
  });
});

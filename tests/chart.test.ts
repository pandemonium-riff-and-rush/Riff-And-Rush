import { describe, expect, it } from 'vitest';
import { parseChartText } from '@/lib/chart/parseChart';
import { fillDifficulties, reduceDifficulty } from '@/lib/chart/reduce';
import { DEMO_CHARTS } from '@/lib/data/demo';
import { playEnd } from '@/lib/chart/types';

const CHART = `[Song]
{
  Name = "Prueba"
  Artist = "Banda"
  Resolution = 192
  Offset = 0
}
[SyncTrack]
{
  0 = B 120000
}
[ExpertSingle]
{
  0 = N 0 0
  192 = N 1 0
  384 = N 2 192
  576 = N 3 0
  576 = N 4 0
}
`;

describe('parser .chart', () => {
  const p = parseChartText(CHART);
  it('lee título, artista y BPM', () => {
    expect(p.title).toBe('Prueba');
    expect(p.artist).toBe('Banda');
    expect(p.bpm).toBe(120);
  });
  it('convierte ticks a segundos (192 ticks = 1 beat = 0,5 s a 120 BPM)', () => {
    const n = p.difficulties.expert!.notes;
    expect(n).toHaveLength(5);
    expect(n[1].t).toBeCloseTo(0.5, 3);
    expect(n[2].len).toBeCloseTo(0.5, 3);
    expect(n.map((x) => x.lane).sort()).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('generador de dificultades', () => {
  const expert = DEMO_CHARTS[3].difficulties.expert!.notes;
  it('Fácil usa 3 carriles y tiene menos notas que Experto', () => {
    const easy = reduceDifficulty(expert, DEMO_CHARTS[3].bpm, 'easy');
    expect(easy.notes.length).toBeLessThan(expert.length);
    expect(Math.max(...easy.notes.map((n) => n.lane))).toBeLessThan(3);
  });
  it('cada dificultad tiene menos o igual densidad que la siguiente', () => {
    const c = fillDifficulties(DEMO_CHARTS[3]);
    const count = (id: 'easy' | 'medium' | 'hard' | 'expert') => c.difficulties[id]!.notes.length;
    expect(count('easy')).toBeLessThanOrEqual(count('medium'));
    expect(count('medium')).toBeLessThanOrEqual(count('hard'));
    expect(count('hard')).toBeLessThanOrEqual(count('expert'));
  });
  it('los charts de demo tienen notas dentro de la canción', () => {
    for (const c of DEMO_CHARTS) {
      const end = playEnd(c);
      for (const d of Object.values(c.difficulties)) expect(d!.notes.every((n) => n.t >= 0 && n.t <= end)).toBe(true);
    }
  });
});

import { blankChart, isBlankTitle, lowerBound, sortNotes } from '@/lib/chart/editing';

describe('utilidades del editor', () => {
  const notes = [0.5, 1, 1, 2, 3].map((t, i) => ({ t, lane: i % 5, len: 0 }));
  it('lowerBound encuentra el primer índice con t >= x', () => {
    expect(lowerBound(notes, 0)).toBe(0);
    expect(lowerBound(notes, 1)).toBe(1);
    expect(lowerBound(notes, 1.5)).toBe(3);
    expect(lowerBound(notes, 10)).toBe(5);
  });
  it('sortNotes ordena por tiempo y después por carril', () => {
    const s = [{ t: 1, lane: 3, len: 0 }, { t: 1, lane: 0, len: 0 }, { t: 0, lane: 4, len: 0 }].sort(sortNotes);
    expect(s.map((n) => n.lane)).toEqual([4, 0, 3]);
  });
  it('un chart nuevo parte vacío y con título de relleno', () => {
    const c = blankChart();
    expect(c.difficulties.expert!.notes).toHaveLength(0);
    expect(isBlankTitle(c.title)).toBe(true);
  });
});

import { preRollSec } from '@/lib/chart/types';

describe('margen de inicio', () => {
  const at = (t: number) => [{ t, lane: 0, len: 0 }, { t: t + 1, lane: 1, len: 0 }];
  it('si la primera nota llega antes del margen, el juego corre antes lo que falta', () => {
    expect(preRollSec(3, at(0.5))).toBe(2.5);
    expect(preRollSec(3, at(0))).toBe(3);
  });
  it('si la canción ya tiene intro, el video parte de inmediato', () => {
    expect(preRollSec(3, at(8))).toBe(0);
    expect(preRollSec(3, at(3))).toBe(0);
  });
  it('considera el desfase del video', () => {
    expect(preRollSec(3, at(1), 1)).toBe(1);
    expect(preRollSec(3, at(1), -1)).toBe(3);
  });
  it('sin notas no hay margen', () => expect(preRollSec(3, [])).toBe(0));
});

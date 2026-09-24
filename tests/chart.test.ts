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

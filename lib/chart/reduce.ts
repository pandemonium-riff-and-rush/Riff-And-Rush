import type { Chart, DifficultyChart, DifficultyId, Note } from './types';

/**
 * Genera dificultades menores (y Leyenda) a partir de Experto.
 * Reglas: menos densidad (separación mínima por tiempo de beat), acordes más chicos,
 * carriles remapeados manteniendo el contorno de la melodía.
 */
interface Rule { lanes: number; minGapBeats: number; maxChord: number; hopo: boolean; minSustainBeats: number }

const RULES: Record<Exclude<DifficultyId, 'expert' | 'legend'>, Rule> = {
  hard: { lanes: 5, minGapBeats: 1 / 3, maxChord: 2, hopo: true, minSustainBeats: 0.5 },
  medium: { lanes: 4, minGapBeats: 1 / 2, maxChord: 2, hopo: false, minSustainBeats: 1 },
  easy: { lanes: 3, minGapBeats: 1, maxChord: 1, hopo: false, minSustainBeats: 1 }
};

function groupByTime(notes: Note[]) {
  const sorted = [...notes].sort((a, b) => a.t - b.t || a.lane - b.lane);
  const groups: Note[][] = [];
  for (const n of sorted) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(g[0].t - n.t) < 0.002) g.push(n);
    else groups.push([n]);
  }
  return groups;
}

export function reduceDifficulty(expert: Note[], bpm: number, target: keyof typeof RULES): DifficultyChart {
  const rule = RULES[target];
  const beat = 60 / bpm;
  const groups = groupByTime(expert);
  const out: Note[] = [];
  let lastT = -Infinity;
  for (const g of groups) {
    const t = g[0].t;
    const onBeat = Math.abs(t / beat - Math.round(t / beat)) < 0.08;
    // En Fácil y Normal privilegiamos las notas que caen en el pulso
    const gap = t - lastT;
    if (gap < rule.minGapBeats * beat * 0.98 && !(onBeat && gap >= rule.minGapBeats * beat * 0.5 && target === 'hard')) continue;
    if (target === 'easy' && !onBeat && gap < beat * 1.5) continue;
    lastT = t;
    const lanes = [...new Set(g.map((n) => Math.round((n.lane * (rule.lanes - 1)) / 4)))].sort((a, b) => a - b);
    const chord = lanes.length > rule.maxChord ? [lanes[0], lanes[lanes.length - 1]].slice(0, rule.maxChord) : lanes;
    const len = Math.max(...g.map((n) => n.len));
    for (const lane of chord) {
      out.push({
        t,
        lane,
        len: len >= rule.minSustainBeats * beat ? len : 0,
        hopo: rule.hopo && chord.length === 1 ? g[0].hopo : undefined
      });
    }
  }
  // Recortar notas largas que se superponen con la siguiente
  for (let i = 0; i < out.length; i++) {
    if (!out[i].len) continue;
    const next = out.find((n, j) => j > i && n.t > out[i].t);
    if (next && out[i].t + out[i].len > next.t - beat / 4) out[i].len = Math.max(0, next.t - beat / 4 - out[i].t);
  }
  return { lanes: rule.lanes, notes: out, generated: true };
}

export function makeLegend(expert: Note[]): DifficultyChart {
  const groups = groupByTime(expert);
  const out: Note[] = [];
  let prevTop = -1;
  groups.forEach((g, i) => {
    const top = Math.max(...g.map((n) => n.lane));
    for (const n of g) {
      let lane = n.lane;
      // Cuando la melodía sube y se queda arriba, abrimos el sexto carril
      if (lane === 4 && (prevTop >= 4 || (i % 3 === 2 && prevTop >= 3))) lane = 5;
      out.push({ ...n, lane });
    }
    prevTop = top;
  });
  return { lanes: 6, notes: out, generated: true };
}

/** Completa las dificultades que faltan en un chart a partir de Experto. */
export function fillDifficulties(chart: Chart, overwriteGenerated = false): Chart {
  const expert = chart.difficulties.expert;
  if (!expert) return chart;
  const d = { ...chart.difficulties };
  for (const id of ['hard', 'medium', 'easy'] as const) {
    if (!d[id] || (overwriteGenerated && d[id]?.generated)) d[id] = reduceDifficulty(expert.notes, chart.bpm, id);
  }
  if (!d.legend || (overwriteGenerated && d.legend.generated)) d.legend = makeLegend(expert.notes);
  return { ...chart, difficulties: d };
}

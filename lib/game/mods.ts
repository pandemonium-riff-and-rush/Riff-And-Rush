/** Modificadores de partida y modo práctica, codificados en la URL (?mods=…&p=…). */
export interface GameMods {
  precision?: boolean;
  mirror?: boolean;
  dropless?: boolean;
  practice?: { from: number; to: number; rate: number } | null;
}

export const MOD_INFO: { id: 'precision' | 'mirror' | 'dropless'; name: string; desc: string }[] = [
  { id: 'precision', name: 'Precisión', desc: 'Ventanas de acierto más chicas (35/70 ms). Para los que quieren el ranking de verdad.' },
  { id: 'mirror', name: 'Espejo / zurdo', desc: 'Invierte los carriles: el verde queda a la derecha.' },
  { id: 'dropless', name: 'Sostenidas sin perdón', desc: 'Soltar una nota larga antes de tiempo rompe la racha.' }
];

export function parseMods(mods: string | null, practice: string | null): GameMods {
  const set = new Set((mods ?? '').split(',').filter(Boolean));
  const out: GameMods = { precision: set.has('precision'), mirror: set.has('mirror'), dropless: set.has('dropless') };
  if (practice) {
    const [a, b, r] = practice.split('-').map(Number);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) out.practice = { from: a, to: b, rate: Math.min(1, Math.max(0.25, r || 1)) };
  }
  return out;
}

export function modsQuery(m: GameMods) {
  const ids = MOD_INFO.map((x) => x.id).filter((id) => m[id]);
  const q = new URLSearchParams();
  if (ids.length) q.set('mods', ids.join(','));
  if (m.practice) q.set('p', `${m.practice.from.toFixed(1)}-${m.practice.to.toFixed(1)}-${m.practice.rate}`);
  return q.toString();
}

/** Sigla corta de cada mod para las tablas de ranking. */
export const MOD_SHORT: Record<string, string> = { precision: 'PRE', mirror: 'ESP', dropless: 'SSP' };
export function modName(id: string) { return MOD_INFO.find((m) => m.id === id)?.name ?? id; }

export function modsLabel(m: GameMods) {
  return MOD_INFO.filter((x) => m[x.id]).map((x) => x.name).join(' · ');
}

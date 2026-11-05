'use client';

import Link from 'next/link';
import type { Chart } from '@/lib/chart/types';
import { DIFFICULTIES, formatTime, playEnd } from '@/lib/chart/types';
import { genreOf } from '@/lib/chart/genres';
import { Cover } from './Cover';

/**
 * "FÁCIL–EXPERTO" en una línea. Cuatro cajitas de colores por tarjeta eran
 * treinta manchas peleando entre sí en una pantalla de catálogo.
 */
function rangoDif(chart: Chart) {
  const hay = DIFFICULTIES.filter((d) => chart.difficulties[d.id]);
  if (!hay.length) return 'SIN NOTAS';
  const a = hay[0].name.toUpperCase();
  const b = hay[hay.length - 1].name.toUpperCase();
  return a === b ? a : `${a}–${b}`;
}

/** Tarjeta de canción para filas tipo Netflix y cuadrículas. */
export default function SongCard({ chart, best, rank, width = 240 }: { chart: Chart; best?: number; rank?: number; width?: number | string }) {
  const g = genreOf(chart.genre);
  return (
    <Link href={`/cancion/${chart.id}`} className="card song-card" style={{ width, flexShrink: 0 }}>
      <div style={{ position: 'relative' }}>
        <Cover chart={chart} height={140} radius={0} />
        {rank !== undefined && <span className="disp song-rank">{rank}</span>}
        <span className="mono" style={{ position: 'absolute', right: 0, bottom: 0, padding: '3px 7px', background: 'var(--ink)', fontSize: 11, color: 'var(--text-3)' }}>{formatTime(playEnd(chart))}</span>
        {chart.verified && <span title="Chart verificado" style={{ position: 'absolute', left: 0, top: 0, padding: '3px 7px', background: 'var(--paper)', color: 'var(--ink)', fontSize: 11, fontWeight: 800 }}>✓</span>}
      </div>
      <div className="col" style={{ padding: '10px 12px 12px', gap: 3 }}>
        <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chart.title}</div>
        <div className="small muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chart.artist}</div>
        <div className="row mono" style={{ marginTop: 6, gap: 8, justifyContent: 'space-between', fontSize: 11, color: 'var(--text-2)' }}>
          <span style={{ whiteSpace: 'nowrap' }}>{rangoDif(chart)}</span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80 }}>{(g.id === 'otros' ? chart.genre ?? '' : g.name.split(' ')[0]).toUpperCase()}</span>
        </div>
        {best !== undefined && <div className="mono small" style={{ color: 'var(--gold)', marginTop: 3 }}>TU MEJOR {best.toLocaleString('es-CL')}</div>}
      </div>
    </Link>
  );
}

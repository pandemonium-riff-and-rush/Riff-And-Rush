'use client';

import Link from 'next/link';
import type { Chart } from '@/lib/chart/types';
import { formatTime, playEnd } from '@/lib/chart/types';
import { genreOf } from '@/lib/chart/genres';
import { Cover, DiffMinis } from './Cover';

/** Tarjeta de canción para filas tipo Netflix y cuadrículas. */
export default function SongCard({ chart, best, rank, width = 240 }: { chart: Chart; best?: number; rank?: number; width?: number | string }) {
  const g = genreOf(chart.genre);
  return (
    <Link href={`/cancion/${chart.id}`} className="card song-card" style={{ width, flexShrink: 0 }}>
      <div style={{ position: 'relative' }}>
        <Cover chart={chart} height={140} radius={0} />
        {rank !== undefined && <span className="disp song-rank">{rank}</span>}
        <span className="mono" style={{ position: 'absolute', right: 8, bottom: 8, padding: '2px 6px', borderRadius: 3, background: 'rgba(5,4,20,0.8)', fontSize: 11 }}>{formatTime(playEnd(chart))}</span>
        {chart.verified && <span title="Chart verificado" style={{ position: 'absolute', left: 8, top: 8, width: 22, height: 22, borderRadius: '50%', background: 'rgba(5,4,20,0.8)', color: 'var(--ok)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>✓</span>}
      </div>
      <div className="col" style={{ padding: '10px 12px 12px', gap: 3 }}>
        <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chart.title}</div>
        <div className="small muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chart.artist}</div>
        <div className="row" style={{ marginTop: 6, gap: 6, justifyContent: 'space-between' }}>
          <DiffMinis chart={chart} />
          <span className="small" style={{ color: g.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90 }}>{g.id === 'otros' ? chart.genre ?? '' : g.name.split(' ')[0]}</span>
        </div>
        {best !== undefined && <div className="mono small" style={{ color: 'var(--gold)', marginTop: 2 }}>Tu mejor: {best.toLocaleString('es-CL')}</div>}
      </div>
    </Link>
  );
}

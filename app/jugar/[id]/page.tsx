'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import type { Chart, DifficultyId } from '@/lib/chart/types';
import { loadChart } from '@/lib/data/cloud';
import GameScreen from '@/components/game/GameScreen';
import { parseMods } from '@/lib/game/mods';

function Play() {
  const { id } = useParams<{ id: string }>();
  const q = useSearchParams();
  const diff = (q.get('d') as DifficultyId) || 'expert';
  const [chart, setChart] = useState<Chart | null | undefined>(undefined);
  const modsQ = q.get('mods'), pQ = q.get('p');
  const mods = useMemo(() => parseMods(modsQ, pQ), [modsQ, pQ]);

  useEffect(() => { loadChart(decodeURIComponent(id)).then((c) => setChart(c ?? null)); }, [id]);

  if (chart === undefined) return null;
  if (!chart || !chart.difficulties[diff]) {
    return (
      <main className="page col" style={{ alignItems: 'flex-start', gap: 16 }}>
        <h1 className="disp" style={{ fontSize: 40 }}>Canción no encontrada</h1>
        <p className="muted">No existe este chart o no tiene la dificultad elegida.</p>
        <Link className="btn btn-p" href="/canciones">Ver canciones</Link>
      </main>
    );
  }
  return <GameScreen key={chart.id + diff} chart={chart} diff={diff} auto={q.get('auto') === '1'} mods={mods} />;
}

export default function PlayPage() {
  return <Suspense fallback={null}><Play /></Suspense>;
}

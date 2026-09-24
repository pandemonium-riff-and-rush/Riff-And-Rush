'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { initialsOf, useAuth, useMe } from '@/lib/auth/AuthProvider';
import { fetchGlobalLeaderboard, fetchMyGlobalRank, type GlobalRankRow } from '@/lib/data/cloud';
import { PLAYERS, closesIn } from '@/lib/data/mock';
import { useClientValue } from '@/lib/data/hooks';
import { getAllBests } from '@/lib/data/store';

const PERIODS = [
  { id: 'week', label: 'Semana', scale: 1 },
  { id: 'month', label: 'Mes', scale: 4.3 },
  { id: 'year', label: 'Año', scale: 49 },
  { id: 'all', label: 'Histórico', scale: 118 }
] as const;
const KINDS = ['Global', 'Charters'] as const;

export default function Rankings() {
  const [per, setPer] = useState(0);
  const [kind, setKind] = useState(0);
  const bests = useClientValue(getAllBests, {});
  const mine = useMemo(() => Object.values(bests).reduce((a, b) => a + b.score, 0), [bests]);

  const p = PERIODS[per];
  const { configured, user } = useAuth();
  const me = useMe();
  const [real, setReal] = useState<GlobalRankRow[] | null>(null);
  const [myRank, setMyRank] = useState<{ pos: number; total: number } | null>(null);
  useEffect(() => {
    if (!configured) return;
    setReal(null);
    fetchGlobalLeaderboard(p.id).then(setReal);
    if (user) fetchMyGlobalRank(p.id).then(setMyRank); else setMyRank(null);
  }, [configured, user, p.id]);

  const useReal = configured && kind === 0 && real !== null;
  const base = kind === 1 ? 48210 : 1284920;
  const step = kind === 1 ? 0.07 : 0.021;
  const order = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 0, 3, 2, 5, 4, 7, 6, 9, 8], [0, 2, 1, 4, 3, 6, 5, 8, 7, 9], [2, 0, 1, 5, 3, 4, 8, 6, 7, 9]][per];
  const list = useReal
    ? real!.map((r) => { const name = r.username ?? 'anónimo'; return { name, initials: initialsOf(name), color: r.color, country: r.country ?? '', pos: Number(r.pos), score: Number(r.total), acc: ((r.accuracy ?? 0) * 100).toFixed(1).replace('.', ',') }; })
    : order.map((pi, i) => ({ ...PLAYERS[pi], pos: i + 1, score: Math.round(base * p.scale * (1 - step * i)), acc: (99.3 - i * 0.28).toFixed(1).replace('.', ',') }));
  const myScore = useReal ? (myRank ? Number(myRank.total) : 0) : kind === 1 ? 0 : mine;
  const myPos = useReal ? (myRank ? Number(myRank.pos) : 0) : list.filter((r) => r.score > myScore).length + (myScore >= list[list.length - 1].score ? 1 : 790);
  const medals = ['#F5B700', '#CFCAEA', '#FF8A3D'];

  return (
    <main className="page col" style={{ gap: 20 }}>
      <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="col grow" style={{ gap: 6 }}>
          <h1 className="disp" style={{ fontSize: 40, lineHeight: '44px' }}>Rankings</h1>
          <div className="muted">{kind === 0 ? 'Suma de tus mejores puntajes, normalizados por dificultad' : 'Charters cuyos charts se jugaron más'}</div>
        </div>
        <span className="chip" style={{ height: 44, padding: '0 16px', color: 'var(--warn)', borderColor: 'rgba(255,210,63,0.5)', background: 'rgba(255,210,63,0.08)' }}>{closesIn(p.id)}</span>
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <div className="seg" role="tablist" aria-label="Tipo">{KINDS.map((k, i) => <button key={k} type="button" role="tab" aria-selected={kind === i} onClick={() => setKind(i)}>{k}</button>)}</div>
        <div className="seg" role="tablist" aria-label="Período">{PERIODS.map((x, i) => <button key={x.id} type="button" role="tab" aria-selected={per === i} onClick={() => setPer(i)}>{x.label}</button>)}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 24, alignItems: 'end' }}>
        {[1, 0, 2].map((idx) => {
          const r = list[idx];
          if (!r) return <div key={idx} className="panel col muted small" style={{ alignItems: 'center', justifyContent: 'center', height: idx === 0 ? 236 : 204, borderStyle: 'dashed' }}>Puesto libre</div>;
          return (
            <Link key={r.name} href="/perfil" className="panel col" style={{ alignItems: 'center', justifyContent: 'center', gap: 8, height: idx === 0 ? 236 : 204, color: 'var(--text)', borderColor: idx === 0 ? 'rgba(245,183,0,0.5)' : 'var(--border)' }}>
              <span className="disp" style={{ fontSize: 28, color: medals[idx] }}>{r.pos}</span>
              <span className="avatar" style={{ width: 64, height: 64, background: r.color, fontSize: 20, boxShadow: `0 0 0 3px #0A0916, 0 0 0 5px ${medals[idx]}` }}>{r.initials}</span>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{r.name}</span>
              <span className="mono" style={{ fontSize: 22, fontWeight: 700 }}>{r.score.toLocaleString('es-CL')}</span>
              <span className="small muted">{r.country}</span>
            </Link>
          );
        })}
      </div>

      <div className="panel" style={{ overflow: 'hidden' }}>
        {list.slice(3).map((r) => (
          <div key={r.name} className="table-row" style={{ gridTemplateColumns: '64px minmax(0,1fr) 150px 110px' }}>
            <span className="mono muted" style={{ fontWeight: 700 }}>{r.pos}</span>
            <span className="row"><span className="avatar" style={{ width: 32, height: 32, background: r.color, fontSize: 12 }}>{r.initials}</span><span style={{ fontWeight: 500 }}>{r.name}</span><span className="small muted">{r.country}</span></span>
            <span className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{r.score.toLocaleString('es-CL')}</span>
            <span className="mono small muted" style={{ textAlign: 'right' }}>{r.acc} %</span>
          </div>
        ))}
        <div className="table-row" style={{ gridTemplateColumns: '64px minmax(0,1fr) 150px 110px', height: 60, borderBottom: 0, background: 'rgba(168,85,247,0.14)', borderTop: '1px solid var(--accent)' }}>
          <span className="mono" style={{ fontWeight: 700 }}>{myScore ? myPos : '—'}</span>
          <span className="row"><span className="avatar" style={{ width: 32, height: 32, background: me.loggedIn ? me.color : 'var(--bg-raised)', color: '#fff', fontSize: 12 }}>{me.initials}</span><span style={{ fontWeight: 600 }}>Tú · {me.name}</span></span>
          <span className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{myScore ? myScore.toLocaleString('es-CL') : 'Juega para aparecer'}</span>
          <span />
        </div>
      </div>
      {useReal && list.length === 0 && <div className="panel panel-pad muted">Nadie ha jugado en este período todavía. ¡La primera partida se lleva el primer lugar!</div>}
      <div className="small muted">{useReal ? 'Ranking real: suma de tus mejores puntajes (uno por canción y dificultad).' : kind === 1 ? 'Ranking de charters: datos de ejemplo por ahora.' : 'Datos de ejemplo. Conecta Supabase para ver el ranking real.'}{useReal && !user && <> <Link href="/entrar">Entra</Link> para aparecer.</>}</div>
    </main>
  );
}

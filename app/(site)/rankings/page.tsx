'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { initialsOf, useAuth, useMe } from '@/lib/auth/AuthProvider';
import { fetchCharterLeaderboard, fetchGlobalLeaderboard, fetchMyGlobalRank, type CharterRankRow, type GlobalRankRow } from '@/lib/data/cloud';
import { closesIn } from '@/lib/data/periods';

const PERIODS = [
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
  { id: 'year', label: 'Año' },
  { id: 'all', label: 'Histórico' }
] as const;
const KINDS = ['Global', 'Charters'] as const;

interface Row { key: string; name: string; initials: string; color: string; country: string; pos: number; score: number; extra: string }

export default function Rankings() {
  const [per, setPer] = useState(0);
  const [kind, setKind] = useState(0);
  const p = PERIODS[per];
  const { configured, user } = useAuth();
  const me = useMe();
  // Solo datos reales. null = cargando (o sin conexión)
  const [list, setList] = useState<Row[] | null>(null);
  const [myRank, setMyRank] = useState<{ pos: number; total: number } | null>(null);

  useEffect(() => {
    if (!configured) return;
    setList(null);
    if (kind === 0) {
      fetchGlobalLeaderboard(p.id).then((rows) => setList((rows ?? []).map(globalRow)));
      if (user) fetchMyGlobalRank(p.id).then(setMyRank); else setMyRank(null);
    } else {
      fetchCharterLeaderboard(p.id).then((rows) => setList((rows ?? []).map(charterRow)));
      setMyRank(null);
    }
  }, [configured, user, p.id, kind]);

  const medals = ['#F5B700', '#CFCAEA', '#FF8A3D'];
  const mine = kind === 0 ? myRank : null;
  const myCharter = kind === 1 ? list?.find((r) => me.loggedIn && r.name === me.name) : undefined;

  return (
    <main className="page col" style={{ gap: 20 }}>
      <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="col grow" style={{ gap: 6 }}>
          <h1 className="disp" style={{ fontSize: 40, lineHeight: '44px' }}>Rankings</h1>
          <div className="muted">{kind === 0 ? 'Cada canción y dificultad vale hasta 1.000 puntos × el peso de la dificultad, según tu precisión' : 'Charters cuyos charts publicados más se jugaron (tus propias partidas no cuentan)'}</div>
        </div>
        <span className="chip" style={{ height: 44, padding: '0 16px', color: 'var(--warn)', borderColor: 'rgba(255,210,63,0.5)', background: 'rgba(255,210,63,0.08)' }}>{closesIn(p.id)}</span>
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <div className="seg" role="tablist" aria-label="Tipo">{KINDS.map((k, i) => <button key={k} type="button" role="tab" aria-selected={kind === i} onClick={() => setKind(i)}>{k}</button>)}</div>
        <div className="seg" role="tablist" aria-label="Período">{PERIODS.map((x, i) => <button key={x.id} type="button" role="tab" aria-selected={per === i} onClick={() => setPer(i)}>{x.label}</button>)}</div>
      </div>

      {!configured && <div className="panel panel-pad muted">Los rankings aparecen cuando el juego está conectado a cuentas. Mientras, tus récords quedan guardados en este navegador.</div>}
      {configured && list === null && <div className="panel panel-pad muted">Cargando…</div>}
      {list?.length === 0 && <div className="panel panel-pad muted">{kind === 0 ? 'Nadie ha jugado en este período todavía. ¡La primera partida se lleva el primer lugar!' : 'Todavía nadie jugó charts de la comunidad en este período.'}</div>}

      {list && list.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 24, alignItems: 'end' }}>
            {[1, 0, 2].map((idx) => {
              const r = list[idx];
              if (!r) return <div key={idx} className="panel col muted small" style={{ alignItems: 'center', justifyContent: 'center', height: idx === 0 ? 236 : 204, borderStyle: 'dashed' }}>Puesto libre</div>;
              return (
                <div key={r.key} className="panel col" style={{ alignItems: 'center', justifyContent: 'center', gap: 8, height: idx === 0 ? 236 : 204, borderColor: idx === 0 ? 'rgba(245,183,0,0.5)' : 'var(--border)' }}>
                  <span className="disp" style={{ fontSize: 28, color: medals[idx] }}>{r.pos}</span>
                  <span className="avatar" style={{ width: 64, height: 64, background: r.color, fontSize: 20, boxShadow: `0 0 0 3px #0A0916, 0 0 0 5px ${medals[idx]}` }}>{r.initials}</span>
                  <span style={{ fontSize: 17, fontWeight: 600 }}>{r.name}</span>
                  <span className="mono" style={{ fontSize: 22, fontWeight: 700 }}>{r.score.toLocaleString('es-CL')}</span>
                  <span className="small muted">{r.extra}</span>
                </div>
              );
            })}
          </div>

          {list.length > 3 && (
            <div className="panel" style={{ overflow: 'hidden' }}>
              {list.slice(3).map((r) => (
                <div key={r.key} className="table-row" style={{ gridTemplateColumns: '64px minmax(0,1fr) 150px 150px' }}>
                  <span className="mono muted" style={{ fontWeight: 700 }}>{r.pos}</span>
                  <span className="row"><span className="avatar" style={{ width: 32, height: 32, background: r.color, fontSize: 12 }}>{r.initials}</span><span style={{ fontWeight: 500 }}>{r.name}</span><span className="small muted">{r.country}</span></span>
                  <span className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{r.score.toLocaleString('es-CL')}</span>
                  <span className="mono small muted" style={{ textAlign: 'right' }}>{r.extra}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {configured && (
        <div className="row" style={{ height: 60, padding: '0 16px', borderRadius: 3, background: 'rgba(168,85,247,0.14)', border: '1px solid var(--accent)' }}>
          <span className="mono" style={{ width: 48, fontWeight: 700 }}>{mine ? mine.pos : myCharter ? myCharter.pos : '—'}</span>
          <span className="avatar" style={{ width: 32, height: 32, background: me.loggedIn ? me.color : 'var(--bg-raised)', color: '#fff', fontSize: 12 }}>{me.initials}</span>
          <span className="grow" style={{ fontWeight: 600 }}>Tú · {me.name}</span>
          <span className="mono" style={{ fontWeight: 700 }}>
            {!user ? <Link href="/entrar">Entra para aparecer</Link>
              : mine ? Number(mine.total).toLocaleString('es-CL')
              : myCharter ? myCharter.score.toLocaleString('es-CL')
              : kind === 0 ? 'Juega para aparecer' : 'Publica un chart para aparecer'}
          </span>
        </div>
      )}
    </main>
  );
}

function globalRow(r: GlobalRankRow): Row {
  const name = r.username ?? 'anónimo';
  const songs = Number(r.songs);
  return {
    key: r.user_id, name, initials: initialsOf(name), color: r.color, country: r.country ?? '', pos: Number(r.pos), score: Number(r.total),
    extra: `${((r.accuracy ?? 0) * 100).toFixed(1).replace('.', ',')} % · ${songs} ${songs === 1 ? 'canción' : 'canciones'}`
  };
}

function charterRow(r: CharterRankRow): Row {
  const name = r.username ?? 'anónimo';
  const players = Number(r.players);
  return {
    key: r.user_id, name, initials: initialsOf(name), color: r.color, country: r.country ?? '', pos: Number(r.pos), score: Number(r.plays),
    extra: `partidas · ${players} ${players === 1 ? 'jugador' : 'jugadores'} · ${Number(r.charts)} charts`
  };
}

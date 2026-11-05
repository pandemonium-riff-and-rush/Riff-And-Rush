'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Cover } from '@/components/Cover';
import type { Chart } from '@/lib/chart/types';
import { difficultyInfo, type DifficultyId } from '@/lib/chart/types';
import { useCharts, useClientValue } from '@/lib/data/hooks';
import { deleteLocalChart, getAllBests, getLocalCharts, type ScoreRecord } from '@/lib/data/store';
import { levelProgress, useAuth, useMe } from '@/lib/auth/AuthProvider';
import { deleteChartCloud, fetchMyBests, fetchMyCharts, upsertChartCloud } from '@/lib/data/cloud';

interface MyChart { chart: Chart; local: boolean; cloud: boolean; published: boolean }

export default function Profile() {
  const [tab, setTab] = useState(0);
  const charts = useCharts();
  const { configured, user, profile } = useAuth();
  const me = useMe();
  const localBests = useClientValue(getAllBests, {});
  const localCharts = useClientValue(getLocalCharts, []);
  const [cloudBests, setCloudBests] = useState<Record<string, ScoreRecord>>({});
  const [cloudCharts, setCloudCharts] = useState<{ chart: Chart; published: boolean }[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!user) { setCloudBests({}); setCloudCharts([]); return; }
    fetchMyBests(user.id).then(setCloudBests);
    fetchMyCharts(user.id).then((rows) => setCloudCharts(rows.map((r) => ({ chart: { ...r.data, id: r.id }, published: r.published }))));
  }, [user, reload]);

  // Récords: el mejor entre este navegador y la nube
  const bests = useMemo(() => {
    const out: Record<string, ScoreRecord> = { ...localBests };
    for (const [k, v] of Object.entries(cloudBests)) if (!out[k] || out[k].score < v.score) out[k] = v;
    return out;
  }, [localBests, cloudBests]);

  const mine = useMemo<MyChart[]>(() => {
    const map = new Map<string, MyChart>();
    for (const c of localCharts) map.set(c.id, { chart: c, local: true, cloud: false, published: false });
    for (const c of cloudCharts) {
      const prev = map.get(c.chart.id);
      map.set(c.chart.id, { chart: prev?.chart ?? c.chart, local: !!prev, cloud: true, published: c.published });
    }
    return [...map.values()].filter((x) => !removed.includes(x.chart.id));
  }, [localCharts, cloudCharts, removed]);

  const allCharts = useMemo(() => [...charts, ...cloudCharts.map((c) => c.chart)], [charts, cloudCharts]);
  const plays = useMemo(() => Object.entries(bests).map(([k, v]) => {
    const [id, diff] = k.split(':');
    return { chart: allCharts.find((c) => c.id === id), diff: diff as DifficultyId, ...v };
  }).filter((x) => x.chart).sort((a, b) => b.score - a.score), [bests, allCharts]);

  const avgAcc = plays.length ? plays.reduce((a, b) => a + b.accuracy, 0) / plays.length : 0;
  const lp = levelProgress(profile?.xp ?? 0);

  const remove = async (x: MyChart) => {
    setBusy(x.chart.id);
    if (x.local) deleteLocalChart(x.chart.id);
    if (x.cloud) await deleteChartCloud(x.chart.id);
    setRemoved((r) => [...r, x.chart.id]);
    setConfirmId(null); setBusy(null);
  };
  const upload = async (x: MyChart, publish: boolean) => {
    setBusy(x.chart.id);
    await upsertChartCloud(profile?.username ? { ...x.chart, charter: profile.username } : x.chart, publish);
    setBusy(null); setReload((n) => n + 1);
  };

  return (
    <main className="page col" style={{ gap: 28 }}>
      <section className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
        <span className="avatar" style={{ width: 96, height: 96, background: me.loggedIn ? me.color : 'var(--bg-raised)', color: '#fff', fontSize: 32, boxShadow: `0 0 0 4px #0b0b0c, 0 0 0 6px ${me.loggedIn ? me.color : 'var(--line-2)'}` }}>{me.initials}</span>
        <div className="col grow" style={{ gap: 10, minWidth: 240 }}>
          <div className="row" style={{ alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
            <h1 className="disp" style={{ fontSize: 36 }}>{me.name}</h1>
            {me.loggedIn ? <span className="muted">{me.country ? me.country + ' · ' : ''}nivel {me.level}</span> : <span className="muted">Sin cuenta: todo se guarda en este navegador</span>}
          </div>
          {me.loggedIn ? (
            <div className="col" style={{ gap: 6, maxWidth: 420 }}>
              <div className="xpbar"><span style={{ width: `${Math.round(lp.progress * 100)}%` }} /></div>
              <span className="small muted mono">{profile?.xp ?? 0} XP · {lp.toNext} para nivel {lp.level + 1} · {profile?.plays ?? 0} partidas</span>
            </div>
          ) : configured ? (
            <Link href="/entrar" className="btn btn-p btn-sm" style={{ alignSelf: 'flex-start' }}>Crear cuenta o entrar</Link>
          ) : null}
          {me.loggedIn && (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {profile?.is_supporter && <span className="chip" style={{ color: 'var(--hot-soft)', borderColor: 'rgba(236,72,153,0.5)' }}>♥ Apoyador</span>}
              {cloudCharts.some((c) => c.published) && <span className="chip" style={{ color: 'var(--ok)', borderColor: 'rgba(61,220,132,0.5)' }}>Charter</span>}
            </div>
          )}
        </div>
        {me.loggedIn && <Link className="btn btn-s" href="/cuenta">Editar cuenta</Link>}
        <Link className="btn btn-s" href="/ajustes">Ajustes</Link>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24 }}>
        <Stat label="Canciones con récord" value={String(plays.length)} />
        <Stat label="Charts creados" value={String(mine.length)} />
        <Stat label="Precisión promedio" value={plays.length ? `${(avgAcc * 100).toFixed(1).replace('.', ',')} %` : '—'} color="var(--ok)" />
        <Stat label="Mejor puntaje" value={plays[0] ? plays[0].score.toLocaleString('es-CL') : '—'} color="var(--gold)" />
      </section>

      <section className="col" style={{ gap: 0 }}>
        <div role="tablist" className="row" style={{ gap: 28, borderBottom: '1px solid var(--border)' }}>
          {['Mejores partidas', 'Charts creados'].map((l, i) => (
            <button key={l} type="button" role="tab" aria-selected={tab === i} onClick={() => setTab(i)}
              style={{ height: 44, padding: '0 4px', border: 0, background: 'none', cursor: 'pointer', font: '600 15px var(--font-body)', color: tab === i ? 'var(--text)' : 'var(--text-2)', borderBottom: `2px solid ${tab === i ? 'var(--accent)' : 'transparent'}` }}>{l}</button>
          ))}
        </div>
        <div className="panel" style={{ borderTop: 0, borderRadius: '0 0 4px 4px', overflow: 'hidden' }}>
          {tab === 0 && (plays.length ? plays.map((p) => (
            <Link key={p.chart!.id + p.diff} href={`/cancion/${p.chart!.id}`} className="row" style={{ gap: 16, height: 64, padding: '0 20px', borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
              <Cover chart={p.chart!} size={40} />
              <span className="col grow" style={{ gap: 2 }}><span style={{ fontWeight: 600 }}>{p.chart!.title}</span><span className="small muted">{p.chart!.artist} · {difficultyInfo(p.diff).name}</span></span>
              <span className="small muted" style={{ width: 140, textAlign: 'right' }}>{'★'.repeat(p.stars)} · {(p.accuracy * 100).toFixed(1).replace('.', ',')} %</span>
              <span className="mono" style={{ width: 120, textAlign: 'right', fontWeight: 700 }}>{p.score.toLocaleString('es-CL')}</span>
            </Link>
          )) : <div className="panel-pad muted">Todavía no tienes récords. <Link href="/canciones">Juega una canción</Link>.</div>)}
          {tab === 1 && (mine.length ? mine.map((x) => {
            const c = x.chart;
            return (
              <div key={c.id} className="row" style={{ gap: 12, minHeight: 64, padding: '10px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <Link href={`/editor?id=${c.id}`} className="row grow" style={{ gap: 16, color: 'var(--text)', minWidth: 220 }}>
                  <Cover chart={c} size={40} />
                  <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{c.title}</span>
                    <span className="small muted">{c.artist} · {Object.keys(c.difficulties).length} dificultades</span>
                  </span>
                </Link>
                <span className="chip small" style={x.published ? { color: 'var(--ok)', borderColor: 'rgba(61,220,132,0.5)' } : x.cloud ? { color: 'var(--accent-link)' } : undefined}>
                  {x.published ? 'Publicado' : x.cloud ? 'En tu cuenta' : 'Solo este navegador'}
                </span>
                {user && !x.cloud && <button type="button" className="btn btn-t btn-xs" disabled={busy === c.id} onClick={() => upload(x, false)}>Subir a mi cuenta</button>}
                {user && x.cloud && <button type="button" className="btn btn-t btn-xs" disabled={busy === c.id} onClick={() => upload(x, !x.published)}>{x.published ? 'Despublicar' : 'Publicar'}</button>}
                <Link href={`/jugar/${c.id}`} className="btn btn-g btn-sm">▶ Jugar</Link>
                <Link href={`/editor?id=${c.id}`} className="btn btn-s btn-sm">Editar</Link>
                {confirmId === c.id ? (
                  <span className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn btn-sm" style={{ background: 'var(--hot)', color: '#fff' }} disabled={busy === c.id} onClick={() => remove(x)}>Sí, borrar</button>
                    <button type="button" className="btn btn-g btn-sm" onClick={() => setConfirmId(null)}>No</button>
                  </span>
                ) : (
                  <button type="button" className="btn btn-g btn-sm" aria-label={`Borrar ${c.title}`} onClick={() => setConfirmId(c.id)}>Borrar</button>
                )}
              </div>
            );
          }) : <div className="panel-pad muted">Aún no creas charts. <Link href="/editor">Abre el editor</Link>.</div>)}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="panel col" style={{ padding: 20, gap: 6 }}>
      <span className="small muted">{label}</span>
      <span className="mono" style={{ fontSize: 28, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

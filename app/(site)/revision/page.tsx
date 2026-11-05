'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { adminSetChart, fetchPendingCharts, fetchReports, REPORT_REASONS, seedHouseCharts, setReportStatus, type CloudChartRow, type ReportRow } from '@/lib/data/cloud';
import { CATALOGO_DEMO } from '@/lib/data/demo';
import { Cover, DiffMinis } from '@/components/Cover';
import { formatTime, playEnd } from '@/lib/chart/types';
import { checkChart } from '@/lib/chart/checks';
import { EVENT_LABEL, fetchEvents, fetchSuspectCharts, type EventRow, type SuspectRow } from '@/lib/data/events';
import { fetchFeedback, markFeedback, type FeedbackRow } from '@/lib/data/feedback';

/** Panel de revisión manual: reportes de la comunidad y cola de charts por verificar. Solo admins. */
export default function Review() {
  const { loading, profile } = useAuth();
  const [tab, setTab] = useState<'reportes' | 'cola' | 'salud' | 'opiniones'>('reportes');
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [pending, setPending] = useState<CloudChartRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  /** Salud del juego: errores que le pasan a la gente y charts que parecen desfasados. */
  const [events, setEvents] = useState<EventRow[]>([]);
  const [suspect, setSuspect] = useState<SuspectRow[]>([]);
  /** Lo que escribió la gente con el botón de opinar. */
  const [opiniones, setOpiniones] = useState<FeedbackRow[]>([]);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setReports(await fetchReports('abierto'));
    setPending(await fetchPendingCharts());
    setEvents(await fetchEvents(168));
    setSuspect(await fetchSuspectCharts());
    setOpiniones(await fetchFeedback());
  }, []);
  useEffect(() => { if (profile?.is_admin) load(); }, [profile?.is_admin, load]);

  const grouped = useMemo(() => {
    const m = new Map<string, ReportRow[]>();
    for (const r of reports) m.set(r.chart_id, [...(m.get(r.chart_id) ?? []), r]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [reports]);

  if (loading) return <main className="page" />;
  if (!profile?.is_admin) return (
    <main className="page col" style={{ gap: 12 }}>
      <h1 className="disp" style={{ fontSize: 36 }}>Solo para el equipo</h1>
      <p className="muted">Esta página es para revisar reportes y verificar charts.</p>
      <Link href="/" className="btn btn-s" style={{ alignSelf: 'flex-start' }}>Volver</Link>
    </main>
  );

  const act = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key); await fn(); setBusy(null); if (done) setMsg(done); load();
  };
  const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;

  return (
    <main className="page col" style={{ gap: 20 }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <h1 className="disp grow" style={{ fontSize: 40 }}>Revisión</h1>
        <div className="seg" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'reportes'} onClick={() => setTab('reportes')}>Reportes ({grouped.length})</button>
          <button type="button" role="tab" aria-selected={tab === 'cola'} onClick={() => setTab('cola')}>Por verificar ({pending.length})</button>
          <button type="button" role="tab" aria-selected={tab === 'salud'} onClick={() => setTab('salud')}>Salud ({events.length + suspect.length})</button>
          <button type="button" role="tab" aria-selected={tab === 'opiniones'} onClick={() => setTab('opiniones')}>Opiniones ({opiniones.filter((o) => !o.leido).length})</button>
        </div>
      </div>
      <section className="panel panel-pad row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="col grow" style={{ gap: 2, minWidth: 240 }}>
          <span style={{ fontWeight: 700 }}>Canciones de la casa en el servidor</span>
          <span className="small muted">El antitrampa necesita las notas en el servidor para rehacer cada partida. Súbelas cuando cambies o agregues canciones del juego.</span>
        </div>
        <button className="btn btn-s btn-sm" type="button" disabled={busy === 'seed'} onClick={() => act('seed', async () => {
          const r = await seedHouseCharts(CATALOGO_DEMO);
          setMsg(r.ok ? `${r.done} canciones sincronizadas con el servidor.` : `Error al sincronizar: ${r.error}`);
        }, '')}>{busy === 'seed' ? 'Subiendo…' : 'Sincronizar ahora'}</button>
      </section>
      <p className="muted small" style={{ margin: 0 }}>Verificar = el chart cuenta para el ranking global y sale con ✓. Si el charter cambia las notas, pierde el sello y vuelve a esta cola.</p>
      {msg && <div className="small" style={{ color: 'var(--ok)' }}>{msg}</div>}

      {tab === 'reportes' && (grouped.length ? grouped.map(([chartId, list]) => (
        <section key={chartId} className="panel panel-pad col" style={{ gap: 10 }}>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <div className="col grow" style={{ gap: 2 }}>
              <span style={{ fontWeight: 700, fontSize: 17 }}>{list[0].chart_title || chartId}</span>
              <span className="small muted mono">{chartId} · {list.length} reporte{list.length > 1 ? 's' : ''}</span>
            </div>
            <Link className="btn btn-s btn-sm" href={`/jugar/${chartId}?d=expert&auto=1`}>Ver demo</Link>
            <Link className="btn btn-s btn-sm" href={`/cancion/${chartId}`}>Ficha</Link>
            {chartId.startsWith('local-') && <button className="btn btn-sm" type="button" style={{ background: 'var(--hot)', color: '#fff' }} disabled={busy === chartId}
              onClick={() => act(chartId, async () => { await adminSetChart(chartId, { published: false, verified: false }); await setReportStatus(list.map((r) => r.id), 'resuelto'); }, 'Chart despublicado y reportes cerrados.')}>Despublicar</button>}
            <button className="btn btn-g btn-sm" type="button" disabled={busy === chartId} onClick={() => act(chartId, () => setReportStatus(list.map((r) => r.id), 'descartado'), 'Reportes descartados.')}>Descartar</button>
          </div>
          {list.map((r) => (
            <div key={r.id} className="row small" style={{ gap: 12, padding: '8px 10px', borderRadius: 0, background: 'rgba(255,255,255,0.03)', alignItems: 'flex-start' }}>
              <span className="chip" style={{ color: 'var(--hot-soft)', borderColor: 'rgba(236,72,153,0.5)', whiteSpace: 'nowrap' }}>{reasonLabel(r.reason)}</span>
              <span className="grow">{r.details || <span className="muted">Sin detalles</span>}</span>
              <span className="muted mono">{new Date(r.created_at).toLocaleDateString('es-CL')}</span>
            </div>
          ))}
        </section>
      )) : <div className="panel panel-pad muted">No hay reportes abiertos. 🎸</div>)}

      {tab === 'cola' && (pending.length ? pending.map((row) => {
        const c = { ...row.data, id: row.id };
        const issues = checkChart(c);
        return (
          <section key={row.id} className="panel panel-pad row" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <Cover chart={c} size={72} />
            <div className="col grow" style={{ gap: 4, minWidth: 220 }}>
              <span style={{ fontWeight: 700, fontSize: 17 }}>{c.title} <span className="muted" style={{ fontWeight: 400 }}>· {c.artist}</span></span>
              <span className="small muted">por {c.charter} · {formatTime(playEnd(c))} · {c.bpm} BPM · {c.source.kind === 'youtube' ? 'YouTube' : 'sin video'}</span>
              <DiffMinis chart={c} />
              {issues.length > 0 && <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--gold)' }}>{issues.map((x, i) => <li key={i}>{x.text}</li>)}</ul>}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Link className="btn btn-s btn-sm" href={`/jugar/${row.id}?d=expert&auto=1`}>Ver demo</Link>
              <button className="btn btn-p btn-sm" type="button" disabled={busy === row.id} onClick={() => act(row.id, () => adminSetChart(row.id, { verified: true }), `“${c.title}” verificado.`)}>✓ Verificar</button>
              <button className="btn btn-g btn-sm" type="button" disabled={busy === row.id} onClick={() => act(row.id, () => adminSetChart(row.id, { published: false }), `“${c.title}” despublicado.`)}>Despublicar</button>
            </div>
          </section>
        );
      }) : <div className="panel panel-pad muted">No hay charts esperando revisión.</div>)}

      {tab === 'salud' && (
        <>
          <section className="panel panel-pad col" style={{ gap: 10 }}>
            <div className="col" style={{ gap: 2 }}>
              <h2 style={{ fontSize: 17, margin: 0 }}>Charts que parecen desfasados</h2>
              <span className="small muted">
                Detectados solos: varios jugadores distintos y casi nadie pasa del 50 % de precisión.
                Si fuera solo difícil, los buenos igual sacarían buena precisión.
              </span>
            </div>
            {suspect.length ? suspect.map((r) => (
              <div key={r.chart_id + r.difficulty} className="row small" style={{ gap: 12, padding: '8px 10px', borderRadius: 0, background: 'rgba(255,255,255,0.03)', flexWrap: 'wrap' }}>
                <span className="mono grow" style={{ minWidth: 180 }}>{r.chart_id} · {r.difficulty}</span>
                <span style={{ color: 'var(--hot-soft)' }}>mediana {Math.round(r.median_acc * 100)} %</span>
                <span className="muted">mejor {Math.round(r.best_acc * 100)} %</span>
                <span className="muted">{r.players} jugadores · {r.plays} partidas</span>
                <Link className="btn btn-s btn-sm" href={`/jugar/${r.chart_id}?d=${r.difficulty}&auto=1`}>Ver demo</Link>
              </div>
            )) : <div className="muted small">Ningún chart sospechoso. 🎸</div>}
          </section>

          <section className="panel panel-pad col" style={{ gap: 10 }}>
            <div className="col" style={{ gap: 2 }}>
              <h2 style={{ fontSize: 17, margin: 0 }}>Errores de la última semana</h2>
              <span className="small muted">Lo que les pasó a los jugadores de verdad, agrupado por motivo.</span>
            </div>
            {events.length ? events.map((e, i) => (
              <div key={i} className="row small" style={{ gap: 12, padding: '8px 10px', borderRadius: 0, background: 'rgba(255,255,255,0.03)', flexWrap: 'wrap' }}>
                <span className="chip" style={{ color: 'var(--gold)', borderColor: 'rgba(245,183,0,0.5)', whiteSpace: 'nowrap' }}>{EVENT_LABEL[e.kind] ?? e.kind}</span>
                <span className="grow" style={{ minWidth: 160 }}>{e.detail || <span className="muted">sin detalle</span>}</span>
                {e.chart_id && <span className="mono muted">{e.chart_id}</span>}
                <span style={{ fontWeight: 700 }}>×{e.veces}</span>
                <span className="muted mono">{new Date(e.ultima).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )) : <div className="muted small">Ningún error registrado. Puede ser buena señal o que todavía no juega nadie.</div>}
          </section>
        </>
      )}

      {tab === 'opiniones' && (
        <section className="panel panel-pad col" style={{ gap: 10 }}>
          <div className="col" style={{ gap: 2 }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>Lo que escribió la gente</h2>
            <span className="small muted">Del botón &quot;Opinar&quot;. Marca como visto lo que ya revisaste para no leerlo dos veces.</span>
          </div>
          {opiniones.length ? opiniones.map((o) => (
            <div key={o.id} className="col" style={{ gap: 6, padding: '10px 12px', borderRadius: 0, background: o.leido ? 'rgba(255,255,255,0.02)' : 'rgba(255,61,139,0.08)', border: `1px solid ${o.leido ? 'transparent' : 'rgba(255,61,139,0.35)'}`, opacity: o.leido ? 0.65 : 1 }}>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{o.texto}</p>
              <div className="row small muted" style={{ gap: 10, flexWrap: 'wrap' }}>
                <span>{o.autor || 'sin cuenta'}</span>
                {o.pagina && <span className="mono">{o.pagina}</span>}
                {o.contacto && <span style={{ color: 'var(--accent-link)' }}>{o.contacto}</span>}
                <span className="grow mono">{new Date(o.at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                <button type="button" className="btn btn-g btn-xs" disabled={busy === `fb${o.id}`}
                  onClick={() => act(`fb${o.id}`, () => markFeedback(o.id, !o.leido), '')}>
                  {o.leido ? 'Marcar sin ver' : 'Marcar visto'}
                </button>
              </div>
            </div>
          )) : <div className="muted small">Todavía nadie ha escrito nada.</div>}
        </section>
      )}
    </main>
  );
}

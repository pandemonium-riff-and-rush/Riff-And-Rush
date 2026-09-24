'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Cover } from '@/components/Cover';
import type { Chart, DifficultyId } from '@/lib/chart/types';
import { DIFFICULTIES, formatTime, playEnd } from '@/lib/chart/types';
import { getBest, getChart, getVideoOverrides, setVideoOverride, type ScoreRecord } from '@/lib/data/store';
import { PLAYERS } from '@/lib/data/mock';
import { parseYouTubeId } from '@/lib/youtube';
import OffsetControl from '@/components/OffsetControl';
import { initialsOf, useAuth, useMe } from '@/lib/auth/AuthProvider';
import { fetchChartLeaderboard, loadChart, reportChart, REPORT_REASONS, type ChartRankRow, type Period } from '@/lib/data/cloud';
import { MOD_INFO, modsQuery, type GameMods } from '@/lib/game/mods';
import { getSettings, saveSettings } from '@/lib/data/store';
import { genreOf } from '@/lib/chart/genres';
import { checkVideo, type VideoCheck } from '@/lib/game/ytcheck';

export default function SongDetail() {
  const { id } = useParams<{ id: string }>();
  const [chart, setChart] = useState<Chart | null | undefined>(undefined);
  const [sel, setSel] = useState<DifficultyId>('expert');
  const [per, setPer] = useState(0);
  const [best, setBest] = useState<ScoreRecord | undefined>();
  const [videoInput, setVideoInput] = useState('');
  const [offset, setOffset] = useState(0);
  const [msg, setMsg] = useState('');
  const [mods, setMods] = useState<GameMods>({});
  const [practiceOn, setPracticeOn] = useState(false);
  const [pFrom, setPFrom] = useState(0);
  const [pTo, setPTo] = useState(30);
  const [pRate, setPRate] = useState(0.75);
  const [speed, setSpeed] = useState(1.8);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('desfasado');
  const [details, setDetails] = useState('');
  const [reportMsg, setReportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [vcheck, setVcheck] = useState<VideoCheck | 'probando' | null>(null);
  useEffect(() => { setSpeed(getSettings().speed); }, []);

  const { configured, user } = useAuth();
  const me = useMe();
  const [board, setBoard] = useState<ChartRankRow[] | null>(null);
  const load = async () => {
    const c = getChart(decodeURIComponent(id)) ?? (await loadChart(decodeURIComponent(id))) ?? null;
    setChart(c);
    const o = c ? getVideoOverrides()[c.id] : undefined;
    setVideoInput(o?.videoId ?? (c?.source.kind === 'youtube' ? c.source.videoId : ''));
    setOffset(o?.offsetMs ?? c?.offsetMs ?? 0);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (!configured || !chart) return;
    setBoard(null);
    fetchChartLeaderboard(chart.id, sel, (['week', 'month', 'year'] as Period[])[per], 10).then(setBoard);
  }, [configured, chart, sel, per]);
  useEffect(() => { if (chart) setBest(getBest(chart.id, sel)); }, [chart, sel]);

  const mock = useMemo(() => {
    const lvl = DIFFICULTIES.find((d) => d.id === sel)!.level;
    const f = [1, 1.012, 1.03][per] * (0.55 + lvl * 0.12);
    return PLAYERS.slice(0, 6).map((p, i) => ({ ...p, pos: i + 1, score: Math.round((961220 - i * 12600) * f), acc: (99.4 - i * 0.3).toFixed(1).replace('.', ',') }));
  }, [sel, per]);
  const rows = board
    ? board.filter((r) => !(me.loggedIn && r.username === me.name)).slice(0, 6).map((r) => { const name = r.username ?? 'anónimo'; return { name, initials: initialsOf(name), color: r.color, pos: Number(r.pos), score: r.score, acc: (r.accuracy * 100).toFixed(1).replace('.', ',') }; })
    : mock;
  const myCloud = board?.find((r) => me.loggedIn && r.username === me.name);

  if (chart === undefined) return <main className="page" />;
  if (!chart) return <main className="page"><h1 className="disp" style={{ fontSize: 40 }}>Canción no encontrada</h1><Link href="/canciones">Volver a canciones</Link></main>;

  const info = DIFFICULTIES.find((d) => d.id === sel)!;
  const playMods: GameMods = { ...mods, practice: practiceOn ? { from: pFrom, to: Math.max(pFrom + 2, pTo), rate: pRate } : null };
  const mq = modsQuery(playMods);
  const playHref = `/jugar/${chart.id}?d=${sel}${mq ? '&' + mq : ''}`;
  const dur = playEnd(chart);
  // Densidad de notas por tramo (para elegir qué practicar)
  const dens = (() => {
    const notes = chart.difficulties[sel]?.notes ?? [];
    const bins = new Array(60).fill(0);
    for (const n of notes) bins[Math.min(59, Math.floor((n.t / Math.max(1, dur)) * 60))]++;
    const max = Math.max(1, ...bins);
    return bins.map((b) => b / max);
  })();
  const sendReport = async () => {
    const r = await reportChart(chart.id, chart.title, reason, details);
    setReportMsg(r.ok ? { ok: true, text: '¡Gracias! Lo vamos a revisar.' } : { ok: false, text: r.error ?? 'No se pudo enviar.' });
    if (r.ok) setTimeout(() => { setReportOpen(false); setReportMsg(null); setDetails(''); }, 1500);
  };
  const available = DIFFICULTIES.filter((d) => chart.difficulties[d.id]);

  const saveVideo = async () => {
    const vid = parseYouTubeId(videoInput);
    if (videoInput.trim() && !vid) { setMsg('Ese link no parece de YouTube.'); return; }
    setVideoOverride(chart.id, vid ? { videoId: vid, offsetMs: offset } : null);
    setMsg(vid ? 'Video asignado. Ya puedes tocar con la canción real.' : 'Volviste al metrónomo.');
    load();
    if (!vid) { setVcheck(null); return; }
    setVcheck('probando');
    setVcheck(await checkVideo(vid));
  };

  return (
    <main className="page col" style={{ gap: 20 }}>
      <Link href="/canciones" className="small muted">← Canciones</Link>
      <div className="grid12">
        <section className="col" style={{ gridColumn: 'span 4', gap: 20 }}>
          <Cover chart={chart} height={230} radius={4} />
          <div className="col" style={{ gap: 6 }}>
            <h1 className="disp" style={{ fontSize: 36, lineHeight: '40px' }}>{chart.title}</h1>
            <div style={{ fontSize: 17, color: 'var(--text-3)' }}>{chart.artist}</div>
            <Link href={`/canciones?g=${genreOf(chart.genre).id}`} className="chip" style={{ alignSelf: 'flex-start', color: genreOf(chart.genre).color, borderColor: genreOf(chart.genre).color }}>{genreOf(chart.genre).name}</Link>
          </div>
          <div className="panel row" style={{ padding: 12 }}>
            <span className="avatar" style={{ width: 40, height: 40, background: '#3DDC84', fontSize: 14 }}>{chart.charter.slice(0, 2).toUpperCase()}</span>
            <div className="col grow" style={{ gap: 2 }}><div style={{ fontWeight: 600 }}>{chart.charter}</div><div className="small muted">Charter</div></div>
            {chart.verified && <span className="cond small" style={{ color: 'var(--ok)' }}>✓ Verificado</span>}
          </div>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            {[['Duración', formatTime(playEnd(chart))], ['BPM', String(chart.bpm)], ['Fuente', chart.source.kind === 'youtube' ? 'YouTube' : 'Metrónomo'], ['Offset', `${chart.offsetMs} ms`]].map(([k, v]) => (
              <div key={k} className="panel" style={{ padding: '12px 14px' }}><dt className="small muted">{k}</dt><dd className="mono" style={{ margin: '4px 0 0', fontSize: 17, fontWeight: 700 }}>{v}</dd></div>
            ))}
          </dl>
          <div className="panel col" style={{ padding: 16, gap: 10 }}>
            <label className="label" htmlFor="yt">Video de YouTube</label>
            <input id="yt" className="input" placeholder="Pega el link o el ID del video" value={videoInput} onChange={(e) => setVideoInput(e.target.value)} />
            <OffsetControl value={offset} onChange={setOffset} />
            <button className="btn btn-s" type="button" onClick={saveVideo}>Guardar video</button>
            {msg && <div className="small" style={{ color: 'var(--accent-link)' }}>{msg}</div>}
            {vcheck && (
              <div className="small row" style={{ gap: 8, color: vcheck === 'probando' ? 'var(--text-2)' : vcheck.ok ? 'var(--ok)' : 'var(--hot-soft)' }}>
                <span>{vcheck === 'probando' ? '⏳' : vcheck.ok ? '✓' : '✕'}</span>
                <span>{vcheck === 'probando' ? 'Probando el video…' : vcheck.message}</span>
              </div>
            )}
          </div>
        </section>

        <section aria-label="Dificultad" className="col" style={{ gridColumn: 'span 4', gap: 12 }}>
          <h2 style={{ fontSize: 20 }}>Elige dificultad</h2>
          {available.map((d) => {
            const on = d.id === sel;
            const notes = chart.difficulties[d.id]!.notes.length;
            return (
              <button key={d.id} type="button" aria-pressed={on} onClick={() => setSel(d.id)} className="panel row"
                style={{ padding: '14px 16px', gap: 16, cursor: 'pointer', color: 'var(--text)', textAlign: 'left', opacity: on ? 1 : 0.5, borderColor: on ? d.color : 'var(--border)', background: on ? `${d.color}1A` : 'var(--bg-surface)' }}>
                <span style={{ width: 6, height: 40, borderRadius: 3, background: d.color }} />
                <span className="col grow" style={{ gap: 3 }}>
                  <span style={{ fontSize: 17, fontWeight: 600 }}>{d.name}</span>
                  <span className="small muted">{chart.difficulties[d.id]!.lanes} carriles · {notes} notas{chart.difficulties[d.id]!.generated ? ' · generada' : ''}</span>
                </span>
                <span aria-label={`Nivel ${d.level} de 5`} className="row" style={{ gap: 3, alignItems: 'flex-end' }}>
                  {[1, 2, 3, 4, 5].map((k) => <span key={k} style={{ width: 6, height: 6 + k * 4, borderRadius: 2, background: k <= d.level ? d.color : 'var(--border)' }} />)}
                </span>
              </button>
            );
          })}
          <div className="row small" style={{ justifyContent: 'space-between', padding: '14px 16px', border: '1px dashed var(--border)', borderRadius: 4 }}>
            <span className="muted">Tu mejor en {info.name}</span><span className="mono" style={{ fontWeight: 700 }}>{best ? best.score.toLocaleString('es-CL') : '—'}</span>
          </div>

          <div className="panel col" style={{ padding: 16, gap: 12 }}>
            <div className="row"><span className="label grow">Velocidad de notas</span><span className="mono small">{speed.toFixed(1)}×</span></div>
            <input type="range" min={1} max={3.5} step={0.1} value={speed} onChange={(e) => { const v = Number(e.target.value); setSpeed(v); saveSettings({ ...getSettings(), speed: v }); }} aria-label="Velocidad de notas" />
            <span className="label">Modificadores</span>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {MOD_INFO.map((m) => (
                <button key={m.id} type="button" className="lib-chip" aria-selected={!!mods[m.id]} title={m.desc} onClick={() => setMods((x) => ({ ...x, [m.id]: !x[m.id] }))}>{m.name}</button>
              ))}
            </div>
            <label className="row small" style={{ gap: 8, cursor: 'pointer', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
              <input type="checkbox" checked={practiceOn} onChange={(e) => { setPracticeOn(e.target.checked); if (e.target.checked && pTo > dur) setPTo(Math.min(dur, 30)); }} style={{ accentColor: 'var(--accent)' }} />
              <span style={{ fontWeight: 600 }}>Modo práctica</span><span className="muted">tramo en bucle, más lento, sin puntaje</span>
            </label>
            {practiceOn && (
              <div className="col" style={{ gap: 8 }}>
                <div style={{ position: 'relative', height: 36, borderRadius: 4, background: '#0F0C22', overflow: 'hidden' }} aria-hidden="true">
                  {dens.map((v, i) => <span key={i} style={{ position: 'absolute', bottom: 0, left: `${(i / 60) * 100}%`, width: `${100 / 60}%`, height: `${8 + v * 92}%`, background: info.color, opacity: (i / 60) * dur >= pFrom && (i / 60) * dur <= pTo ? 0.9 : 0.25 }} />)}
                </div>
                <div className="row small"><span className="muted" style={{ width: 44 }}>Desde</span><input type="range" min={0} max={Math.max(0, dur - 2)} step={0.5} value={pFrom} onChange={(e) => { const v = Number(e.target.value); setPFrom(v); if (pTo < v + 2) setPTo(Math.min(dur, v + 2)); }} style={{ flex: 1 }} aria-label="Inicio del tramo" /><span className="mono" style={{ width: 40 }}>{formatTime(pFrom)}</span></div>
                <div className="row small"><span className="muted" style={{ width: 44 }}>Hasta</span><input type="range" min={2} max={dur} step={0.5} value={pTo} onChange={(e) => { const v = Number(e.target.value); setPTo(v); if (pFrom > v - 2) setPFrom(Math.max(0, v - 2)); }} style={{ flex: 1 }} aria-label="Fin del tramo" /><span className="mono" style={{ width: 40 }}>{formatTime(pTo)}</span></div>
                <div className="seg" role="group" aria-label="Velocidad de la canción" style={{ alignSelf: 'flex-start' }}>
                  {[0.5, 0.75, 1].map((r) => <button key={r} type="button" aria-pressed={pRate === r} onClick={() => setPRate(r)}>{r}×</button>)}
                </div>
              </div>
            )}
          </div>
        </section>

        <section aria-label="Ranking de la canción" className="panel col" style={{ gridColumn: 'span 4', padding: 20, gap: 12 }}>
          <div className="row"><h2 className="grow" style={{ fontSize: 20 }}>Ranking · {info.name}{!board && <span className="small muted" style={{ fontWeight: 400 }}> (ejemplo)</span>}</h2><Link href="/rankings" className="small">Ver todo</Link></div>
          <div className="seg" role="tablist" style={{ alignSelf: 'flex-start' }}>
            {['Semana', 'Mes', 'Año'].map((l, i) => <button key={l} type="button" role="tab" aria-selected={per === i} onClick={() => setPer(i)}>{l}</button>)}
          </div>
          <div className="col" style={{ gap: 0 }}>
            {board && rows.length === 0 && <div className="small muted" style={{ padding: '14px 0' }}>Nadie ha jugado esta dificultad en este período. ¡Sé el primero!</div>}
            {rows.map((r) => (
              <div key={r.name} className="row" style={{ height: 48, borderBottom: '1px solid var(--border)' }}>
                <span className="mono muted" style={{ width: 24, fontWeight: 700 }}>{r.pos}</span>
                <span className="avatar" style={{ width: 28, height: 28, background: r.color, fontSize: 11 }}>{r.initials}</span>
                <span className="grow" style={{ fontSize: 14, fontWeight: 500 }}>{r.name}</span>
                <span className="small muted">{r.acc} %</span>
                <span className="mono" style={{ width: 92, textAlign: 'right', fontWeight: 700, fontSize: 14 }}>{r.score.toLocaleString('es-CL')}</span>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 'auto', height: 52, padding: '0 12px', borderRadius: 3, background: 'rgba(168,85,247,0.14)', border: '1px solid var(--accent)' }}>
            <span className="avatar" style={{ width: 28, height: 28, background: me.loggedIn ? me.color : 'var(--bg-raised)', color: '#fff', fontSize: 11 }}>{me.initials}</span>
            <span className="grow" style={{ fontSize: 14, fontWeight: 600 }}>{myCloud ? `#${myCloud.pos} · ` : ''}Tú · {me.name}</span>
            <span className="mono" style={{ fontWeight: 700 }}>{myCloud ? myCloud.score.toLocaleString('es-CL') : best ? best.score.toLocaleString('es-CL') : 'Sin partidas'}</span>
          </div>
        </section>
      </div>

      <div className="row" style={{ paddingTop: 20, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <Link className="btn btn-p" href={playHref} style={{ height: 56, padding: '0 40px', fontSize: 18 }}>{practiceOn ? '▶ Practicar' : `▶ Jugar en ${info.name}`}</Link>
        <Link className="btn btn-s" href={`/jugar/${chart.id}?d=${sel}&auto=1`} title="La canción se toca sola para que veas cómo es">Ver demo</Link>
        <Link className="btn btn-s" href={`/editor?id=${chart.id}`}>Ver en editor</Link>
        <span className="grow" />
        <button className="btn btn-g" type="button" onClick={() => setReportOpen(true)}>Reportar un problema</button>
      </div>

      {reportOpen && (
        <div className="overlay" onClick={() => setReportOpen(false)}>
          <div role="dialog" aria-label="Reportar canción" className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="disp" style={{ fontSize: 28 }}>¿Qué pasa con esta canción?</h2>
            {!user ? (
              <>
                <span className="muted">Para reportar necesitas una cuenta (así evitamos reportes falsos).</span>
                <Link href="/entrar" className="btn btn-p">Entrar</Link>
              </>
            ) : (
              <>
                <div className="col" style={{ gap: 6 }}>
                  {REPORT_REASONS.map((r) => (
                    <label key={r.id} className="row small" style={{ gap: 10, cursor: 'pointer', padding: '8px 10px', borderRadius: 4, border: `1px solid ${reason === r.id ? 'var(--accent)' : 'var(--border)'}`, background: reason === r.id ? 'rgba(168,85,247,0.12)' : undefined }}>
                      <input type="radio" name="reason" checked={reason === r.id} onChange={() => setReason(r.id)} style={{ accentColor: 'var(--accent)' }} />{r.label}
                    </label>
                  ))}
                </div>
                <textarea className="input" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3} placeholder="Cuéntanos más (opcional): en qué parte, qué dificultad…" style={{ height: 'auto', padding: 12, resize: 'vertical' }} />
                {reportMsg && <span className="small" style={{ color: reportMsg.ok ? 'var(--ok)' : 'var(--hot-soft)' }}>{reportMsg.text}</span>}
                <div className="row"><button className="btn btn-p" type="button" onClick={sendReport}>Enviar reporte</button><button className="btn btn-g" type="button" onClick={() => setReportOpen(false)}>Cancelar</button></div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

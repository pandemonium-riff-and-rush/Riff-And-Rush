'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { levelProgress, useAuth } from '@/lib/auth/AuthProvider';
import { submitScoreCloud } from '@/lib/data/cloud';
import { difficultyInfo } from '@/lib/chart/types';
import { getLastResult, getSettings, saveSettings, type GameResult } from '@/lib/data/store';

export default function Results() {
  const [r, setR] = useState<GameResult | null | undefined>(undefined);
  const [k, setK] = useState(0);

  const { configured, loading, user, profile, refreshProfile } = useAuth();
  const [cloud, setCloud] = useState<{ state: 'idle' | 'sending' | 'done' | 'error'; xp?: number; serverScore?: number }>({ state: 'idle' });
  const sentRef = useRef(false);
  const [calDone, setCalDone] = useState<number | null>(null);

  useEffect(() => { setR(getLastResult()); }, []);

  // Subir la partida a los rankings (una sola vez por partida)
  useEffect(() => {
    if (!r?.uploadId || loading || !user || sentRef.current) return;
    const key = 'rr_uploaded';
    let done: string[] = [];
    try { done = JSON.parse(sessionStorage.getItem(key) ?? '[]'); } catch { /* vacío */ }
    if (done.includes(r.uploadId)) { setCloud({ state: 'done' }); return; }
    sentRef.current = true;
    try { sessionStorage.setItem(key, JSON.stringify([...done, r.uploadId].slice(-50))); } catch { /* sin storage */ }
    setCloud({ state: 'sending' });
    submitScoreCloud(r.chartId, r.diff, { score: r.score, accuracy: r.accuracy, stars: r.stars, maxCombo: r.maxCombo }, r.inputLog, r.modIds, r.sessionId).then((res) => {
      setCloud(res === null ? { state: 'error' } : { state: 'done', xp: res.xp, serverScore: res.score });
      if (res !== null) refreshProfile();
    });
  }, [r, loading, user, refreshProfile]);
  useEffect(() => {
    if (!r) return;
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const x = Math.min(1, (performance.now() - t0) / 1400);
      setK(x);
      if (x < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [r]);

  if (r === undefined) return <main className="page" />;
  if (!r) return (
    <main className="page col" style={{ alignItems: 'flex-start' }}>
      <h1 className="disp" style={{ fontSize: 40 }}>Aún no hay resultados</h1>
      <p className="muted">Juega una canción y tus resultados aparecen aquí.</p>
      <Link className="btn btn-p" href="/canciones">Elegir canción</Link>
    </main>
  );

  const e = 1 - Math.pow(1 - k, 3);
  const info = difficultyInfo(r.diff);
  const lit = Math.floor(e * r.stars + 0.001);
  const acc = (r.accuracy * 100).toFixed(1).replace('.', ',');
  const pts = r.timeline.map((v, i) => `${40 + (i / (r.timeline.length - 1)) * 750},${140 - (v / 100) * 130}`).join(' ');

  return (
    <main className="page grid12">
      <section className="col" style={{ gridColumn: 'span 8', gap: 24 }}>
        <div className="col" style={{ gap: 4 }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{r.title} · {r.artist}</div>
          <div className="small muted">{info.name} · {r.interruptions ? `${r.interruptions} interrupción(es) del video` : 'sin interrupciones'}</div>
        </div>
        <div className="plate row" style={{ padding: 32, alignItems: 'flex-end', gap: 32, flexWrap: 'wrap' }}>
          <div className="col grow" style={{ gap: 10, minWidth: 260 }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="label">Puntaje final</span>
              {r.record && k >= 1 && <span className="stamp">Récord personal</span>}
            </div>
            <div className="disp" style={{ fontSize: 'clamp(64px, 8vw, 118px)', lineHeight: .9, fontVariantNumeric: 'tabular-nums' }}>{Math.round(r.score * e).toLocaleString('es-CL')}</div>
            <div style={{ color: '#4a473f' }}>{r.previousBest ? (r.score > r.previousBest ? `+${(r.score - r.previousBest).toLocaleString('es-CL')} sobre tu mejor anterior` : `Tu mejor sigue en ${r.previousBest.toLocaleString('es-CL')}`) : 'Tu primera partida en esta dificultad'}</div>
          </div>
          <div aria-label={`${r.stars} de 5 estrellas`} className="row" style={{ gap: 4 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <svg key={i} width="38" height="38" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.3l-5.6 2.9 1.1-6.3L2.9 9.5l6.3-.9z"
                  fill={i <= lit ? '#0b0b0c' : 'none'} stroke="#0b0b0c" strokeWidth={i <= lit ? 0 : 1.4} strokeLinejoin="round" opacity={i <= lit ? 1 : .26} />
              </svg>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          <Tile label="Precisión" value={`${acc} %`} color="var(--ok)" />
          <Tile label="Notas acertadas" value={`${r.hit} / ${r.total}`} />
          <Tile label="Combo máximo" value={String(r.maxCombo)} color="var(--text)" />
          <Tile label="Perfecto / Bien / Fallo" value={`${r.perfect}/${r.good}/${r.miss}`} />
        </div>
        <div className="panel col" style={{ padding: '20px 24px' }}>
          <h2 style={{ fontSize: 17 }}>Precisión a lo largo de la canción</h2>
          <svg width="100%" height="170" viewBox="0 0 800 170" preserveAspectRatio="none" role="img" aria-label="Precisión por tramo de la canción">
            {r.timeline.map((v, i) => v < 85 ? <rect key={i} x={40 + (i / (r.timeline.length - 1)) * 750 - 9} y="10" width="18" height="130" fill="#ff5a5a" fillOpacity="0.16" /> : null)}
            <path d="M40 10H790M40 75H790M40 140H790" stroke="#2a2a2e" />
            <text x="0" y="14" fill="#8e8a80" fontSize="11">100%</text><text x="8" y="79" fill="#8e8a80" fontSize="11">50%</text><text x="16" y="144" fill="#8e8a80" fontSize="11">0%</text>
            <polyline points={pts} fill="none" stroke="#46d07f" strokeWidth="2.5" strokeLinejoin="round" />
          </svg>
        </div>
      </section>
      <aside className="col" style={{ gridColumn: 'span 4', gap: 16 }}>
        <Link className="btn btn-p" href={`/jugar/${r.chartId}?d=${r.diff}`} style={{ height: 56, fontSize: 17 }}>↻ Reintentar</Link>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <Link className="btn btn-s" href={`/cancion/${r.chartId}`}>Otra dificultad</Link>
          <Link className="btn btn-s" href="/rankings">Ver ranking</Link>
        </div>
        {r.offsetSamples !== undefined && r.offsetSamples >= 20 && Math.abs(r.medianOffsetMs ?? 0) >= 12 && (
          <div className="panel panel-pad col" style={{ gap: 10, borderColor: 'var(--gold)' }}>
            <span className="label" style={{ color: 'var(--gold)' }}>Calibración sugerida</span>
            <span className="small">En promedio golpeaste <b>{Math.abs(r.medianOffsetMs!)} ms {r.medianOffsetMs! > 0 ? 'tarde' : 'temprano'}</b>. Suele ser el retraso de la pantalla, el teclado o el Bluetooth, no tu ritmo.</span>
            {calDone === null ? (
              <button className="btn btn-s btn-sm" type="button" onClick={() => {
                const st = getSettings();
                const v = Math.round(st.latencyMs + r.medianOffsetMs!);
                saveSettings({ ...st, latencyMs: v });
                setCalDone(v);
              }}>Corregir la latencia ({r.medianOffsetMs! > 0 ? '+' : ''}{r.medianOffsetMs} ms)</button>
            ) : <span className="small" style={{ color: 'var(--ok)' }}>Listo: latencia ahora en {calDone} ms. Se nota en la próxima partida.</span>}
          </div>
        )}
        {(r.mods || (r.ghosts ?? 0) > 0) && (
          <div className="panel panel-pad small col" style={{ gap: 4 }}>
            {r.mods && <span><span className="muted">Modificadores:</span> {r.mods}</span>}
            {(r.ghosts ?? 0) > 0 && <span><span className="muted">Toques sin nota:</span> {r.ghosts} (cada uno corta la racha)</span>}
          </div>
        )}
        <button className="btn btn-s" type="button" onClick={() => navigator.clipboard?.writeText(`Hice ${r.score.toLocaleString('es-CL')} puntos en ${r.title} (${info.name}) en Riff&Rush`)}>Copiar resultado</button>
        {configured && user && profile ? (
          <div className="panel panel-pad col" style={{ gap: 10, borderTop: cloud.state === 'done' ? '6px solid var(--spot)' : undefined }}>
            <div className="row">
              <span className="label grow">Nivel {profile.level}</span>
              {cloud.state === 'done' && cloud.xp !== undefined && <span className="stamp" style={{ fontSize: 16 }}>+{cloud.xp} XP</span>}
            </div>
            <div className="xpbar"><span style={{ width: `${Math.round(levelProgress(profile.xp).progress * 100)}%`, transition: 'width .8s' }} /></div>
            <span className="small muted">
              {cloud.state === 'sending' && 'Subiendo tu partida al ranking…'}
              {cloud.state === 'done' && `Partida guardada en el ranking. Faltan ${levelProgress(profile.xp).toNext} XP para el nivel ${profile.level + 1}.`}
              {cloud.state === 'error' && 'No se pudo subir la partida al ranking. Tu récord quedó guardado en este navegador.'}
              {cloud.state === 'done' && cloud.serverScore !== undefined && Math.abs(cloud.serverScore - r.score) > r.score * 0.02 && ` El servidor recalculó la partida: ${cloud.serverScore.toLocaleString('es-CL')} puntos.`}
              {cloud.state === 'idle' && ' '}
            </span>
          </div>
        ) : (
          <div className="panel panel-pad col small" style={{ gap: 10 }}>
            <span className="muted">Jugaste como invitado: el récord quedó solo en este navegador.</span>
            {configured && <Link href="/entrar" className="btn btn-s btn-sm">Crear cuenta para entrar al ranking</Link>}
          </div>
        )}
      </aside>
    </main>
  );
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="col" style={{ padding: '14px 0 0', gap: 7, borderTop: '1px solid var(--line-2)' }}>
      <span className="label">{label}</span>
      <span className="mono" style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: '-.06em', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

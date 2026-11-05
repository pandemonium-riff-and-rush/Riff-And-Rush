'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Cover } from '@/components/Cover';
import { useCharts } from '@/lib/data/hooks';
import { closesIn } from '@/lib/data/periods';
import { fetchGlobalLeaderboard, fetchTopCharts, type GlobalRankRow, type TopChartRow } from '@/lib/data/cloud';
import { initialsOf, useAuth } from '@/lib/auth/AuthProvider';
import { DIFFICULTIES, formatTime, playEnd, type Chart, type DifficultyId } from '@/lib/chart/types';
import { genreOf } from '@/lib/chart/genres';

/** "FÁCIL–EXPERTO": una línea en vez de cuatro cajitas de colores por tarjeta. */
function rangoDif(c: Chart) {
  const hay = DIFFICULTIES.filter((d) => c.difficulties[d.id]);
  if (!hay.length) return 'SIN NOTAS';
  const a = hay[0].name.toUpperCase();
  const b = hay[hay.length - 1].name.toUpperCase();
  return a === b ? a : `${a}–${b}`;
}

const primeraDif = (c: Chart): DifficultyId =>
  (['expert', 'hard', 'medium', 'easy', 'legend'] as DifficultyId[]).find((d) => c.difficulties[d]) ?? 'expert';

export default function Home() {
  const charts = useCharts();
  const { configured } = useAuth();
  const [topRows, setTopRows] = useState<TopChartRow[] | null>(null);
  const [players, setPlayers] = useState<GlobalRankRow[] | null>(null);
  /** El afiche rota entre canciones reales. Nunca inventa una. */
  const [cual, setCual] = useState(0);

  useEffect(() => {
    if (!configured) return;
    fetchTopCharts('week', 6).then(setTopRows);
    fetchGlobalLeaderboard('week', 5).then(setPlayers);
  }, [configured]);

  const cartel = useMemo(() => charts.filter((c) => c.source.kind === 'youtube'), [charts]);
  useEffect(() => {
    if (cartel.length < 2) return;
    const id = setInterval(() => setCual((n) => (n + 1) % cartel.length), 9000);
    return () => clearInterval(id);
  }, [cartel.length]);

  const jugadas = useMemo(() => (topRows ?? [])
    .map((r) => ({ row: r, chart: charts.find((c) => c.id === r.chart_id) }))
    .filter((x): x is { row: TopChartRow; chart: Chart } => !!x.chart), [topRows, charts]);

  const hoy = cartel[cual % Math.max(1, cartel.length)];
  const muro = charts.slice(0, 12);

  return (
    <main>
      {/* ================= EL AFICHE ================= */}
      <section style={{ position: 'relative', borderBottom: '6px solid var(--paper)', overflow: 'hidden' }}>
        {hoy && (
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
            <div style={{ position: 'absolute', inset: '0 0 0 34%' }}><Cover chart={hoy} height={9999} /></div>
            {/* El degradado cruza el ancho completo: cortado a la caja de la miniatura
                dejaba una costura vertical donde empezaba la imagen. */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(90deg, var(--ink) 26%, rgba(11,11,12,.86) 46%, rgba(11,11,12,.40) 78%, rgba(11,11,12,.30) 100%), linear-gradient(0deg, var(--ink) 2%, rgba(11,11,12,0) 44%)'
            }} />
          </div>
        )}

        <div className="page" style={{ position: 'relative', paddingTop: 64, paddingBottom: 56 }}>
          <p className="mono" style={{ margin: '0 0 22px', color: 'var(--text-2)', fontSize: 12, letterSpacing: '.08em' }}>
            {hoy ? 'ESTA NOCHE TOCAS' : 'BETA ABIERTA'}
          </p>

          {hoy ? (
            <>
              <h1 className="disp" style={{ fontSize: 'clamp(54px, 11vw, 150px)', margin: 0, maxWidth: '15ch' }}>
                {hoy.title}
              </h1>
              <p className="mono" style={{ margin: '18px 0 0', fontSize: 'clamp(14px, 1.6vw, 19px)', color: 'var(--text-3)', letterSpacing: '-.02em' }}>
                {hoy.artist} · {formatTime(playEnd(hoy))} · {hoy.bpm} BPM · chart de {hoy.charter}
              </p>
            </>
          ) : (
            <h1 className="disp" style={{ fontSize: 'clamp(54px, 11vw, 150px)', margin: 0, maxWidth: '14ch' }}>
              Cualquier canción de YouTube
            </h1>
          )}

          <p style={{ margin: '26px 0 0', fontSize: 19, lineHeight: '29px', color: 'var(--text-3)', maxWidth: '46ch' }}>
            Un juego de ritmo que toca el video de verdad, en el navegador. Sin instalar nada,
            sin pagar y sin cuenta: aprietas y estás tocando.
          </p>

          <div className="row" style={{ gap: 12, marginTop: 30, flexWrap: 'wrap' }}>
            <Link className="btn btn-p" href={hoy ? `/jugar/${hoy.id}?d=${primeraDif(hoy)}` : '/canciones'} style={{ height: 56, padding: '0 30px', fontSize: 18 }}>
              Tocar ahora
            </Link>
            <Link className="btn btn-s" href="/canciones" style={{ height: 56 }}>Ver el catálogo</Link>
          </div>

          <div className="row mono" style={{ gap: 0, marginTop: 44, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-2)', letterSpacing: '.04em' }}>
            <Dato n={charts.length} t={charts.length === 1 ? 'canción' : 'canciones'} />
            <Dato n={DIFFICULTIES.length} t="dificultades" />
            <Dato n={5} t="carriles" />
            <span style={{ padding: '6px 14px 6px 0' }}>TECLADO, GAMEPAD O GUITARRA</span>
          </div>
        </div>
      </section>

      {/* ================= EL MURO ================= */}
      {muro.length > 0 && (
        <section>
          <div className="page" style={{ paddingBottom: 18 }}>
            <div className="row" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
              <h2 className="disp grow" style={{ fontSize: 'clamp(30px, 4vw, 46px)' }}>El muro</h2>
              <Link href="/canciones" className="mono" style={{ fontSize: 13 }}>VER LAS {charts.length} →</Link>
            </div>
          </div>
          <div className="muro">
            {muro.map((c) => (
              <Link key={c.id} href={`/cancion/${c.id}`} className="card muro-pieza">
                <Cover chart={c} height={160} />
                <div className="col" style={{ padding: '11px 12px 13px', gap: 3 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
                  <div className="small muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.artist}</div>
                  <div className="row mono" style={{ marginTop: 6, justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--text-2)' }}>
                    <span>{rangoDif(c)}</span>
                    <span>{genreOf(c.genre).name.split(' ')[0].toUpperCase()}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ================= CÓMO FUNCIONA (plancha de papel) ================= */}
      <section className="plate">
        <div className="page" style={{ paddingTop: 56, paddingBottom: 56 }}>
          <div className="grid12" style={{ alignItems: 'start', rowGap: 36 }}>
            <h2 className="disp" style={{ gridColumn: 'span 6', fontSize: 'clamp(36px, 5.2vw, 72px)', margin: 0 }}>
              El catálogo es YouTube entero
            </h2>
            <div style={{ gridColumn: 'span 6' }}>
              <p style={{ margin: 0, fontSize: 18, lineHeight: '28px', color: '#2b2a26', maxWidth: '44ch' }}>
                Otros juegos del género te hacen bajar el juego y conseguir los archivos de audio.
                Acá la música la pone el reproductor oficial de YouTube y lo único que alguien
                tiene que crear son las notas. Cualquiera puede hacer un chart de la canción que
                quiera y publicarlo para todos.
              </p>
              <div className="row" style={{ gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
                <Link className="btn btn-p" href="/editor">Crear un chart</Link>
                <Link className="btn btn-s" href="/canciones">Primero quiero jugar</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= LA SEMANA ================= */}
      <section className="page" style={{ paddingTop: 56 }}>
        <div className="grid12" style={{ rowGap: 44 }}>
          <div style={{ gridColumn: 'span 7' }}>
            <div className="row" style={{ alignItems: 'baseline', marginBottom: 14 }}>
              <h2 className="grow" style={{ fontSize: 24 }}>Lo más tocado</h2>
              <span className="mono small muted">{closesIn('week')}</span>
            </div>
            <hr className="bar" />
            {!configured && <Vacio>Los rankings aparecen cuando el juego está conectado a cuentas.</Vacio>}
            {configured && topRows === null && <Vacio>Cargando…</Vacio>}
            {topRows !== null && jugadas.length === 0 && (
              <Vacio>Nadie ha jugado esta semana. <Link href="/canciones">Estrena el ranking.</Link></Vacio>
            )}
            {jugadas.map((x, i) => (
              <Link key={x.chart.id} href={`/cancion/${x.chart.id}`} className="list-row">
                <span className="mono" style={{ width: 26, fontSize: 15, color: 'var(--text-2)' }}>{i + 1}</span>
                <Cover chart={x.chart} size={44} />
                <span className="col grow" style={{ gap: 1 }}>
                  <span style={{ fontWeight: 600 }}>{x.chart.title}</span>
                  <span className="small muted">{x.chart.artist}</span>
                </span>
                <span className="mono small muted">{x.row.plays} {x.row.plays === 1 ? 'partida' : 'partidas'}</span>
              </Link>
            ))}
          </div>

          <div style={{ gridColumn: 'span 5' }}>
            <div className="row" style={{ alignItems: 'baseline', marginBottom: 14 }}>
              <h2 className="grow" style={{ fontSize: 24 }}>Mejores jugadores</h2>
              <Link href="/rankings" className="mono small">TODOS →</Link>
            </div>
            <hr className="bar" />
            {!configured && <Vacio>Los rankings aparecen cuando el juego está conectado a cuentas.</Vacio>}
            {configured && players === null && <Vacio>Cargando…</Vacio>}
            {players?.length === 0 && <Vacio>Nadie ha jugado esta semana todavía.</Vacio>}
            {players?.map((p) => {
              const nombre = p.username ?? 'anónimo';
              return (
                <div key={p.user_id} className="list-row">
                  <span className="mono" style={{ width: 26, fontSize: 15, color: p.pos === 1 ? 'var(--gold)' : 'var(--text-2)' }}>{p.pos}</span>
                  <span className="avatar" style={{ width: 34, height: 34, background: p.color, fontSize: 13 }}>{initialsOf(nombre)}</span>
                  <span className="grow" style={{ fontWeight: 600 }}>{nombre}</span>
                  <span className="mono small">{Number(p.total).toLocaleString('es-CL')}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= CIERRE ================= */}
      <section className="page" style={{ paddingTop: 56 }}>
        <div className="panel panel-pad row" style={{ gap: 24, flexWrap: 'wrap', borderTop: '6px solid var(--spot)' }}>
          <div className="col grow" style={{ gap: 5, minWidth: 260 }}>
            <strong style={{ fontSize: 19 }}>Gratis para siempre. Apóyanos y quita los anuncios.</strong>
            <span className="muted">Tu aporte paga servidores, rankings y herramientas nuevas para los charters.</span>
          </div>
          <Link className="btn btn-s" href="/apoyar">Ver formas de apoyar</Link>
        </div>
      </section>
    </main>
  );
}

function Dato({ n, t }: { n: number; t: string }) {
  return (
    <span style={{ padding: '6px 14px 6px 0', marginRight: 14, borderRight: '1px solid var(--line-2)' }}>
      <strong style={{ color: 'var(--text)', fontSize: 14 }}>{n}</strong> {t.toUpperCase()}
    </span>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="muted" style={{ padding: '16px 0', margin: 0 }}>{children}</p>;
}

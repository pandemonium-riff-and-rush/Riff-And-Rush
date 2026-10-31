'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Cover, DiffMinis } from '@/components/Cover';
import SongCard from '@/components/SongCard';
import Icon from '@/components/Icon';
import type { Chart, DifficultyId } from '@/lib/chart/types';
import { DIFFICULTIES, formatTime, playEnd } from '@/lib/chart/types';
import { GENRES, genreOf } from '@/lib/chart/genres';
import { useCharts, useClientValue } from '@/lib/data/hooks';
import { getAllBests } from '@/lib/data/store';

/** Normaliza para buscar y ordenar: sin tildes y sin "feat." (pedido común en YARG). */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s*(\(|\[)?\s*(feat\.?|ft\.?|featuring)\s.*$/, '').trim();

/** Mínimo de canciones para que una fila valga la pena. Con menos queda un hueco al lado. */
const MIN_FILA = 4;
/** Bajo este total, el catálogo entero se muestra como cuadrícula en vez de carruseles. */
const MIN_CARRUSELES = 14;

function Library() {
  const charts = useCharts();
  const router = useRouter();
  const qs = useSearchParams();
  const bests = useClientValue(getAllBests, {});
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState<string | null>(qs.get('g'));
  const [minD, setMinD] = useState(0);
  const [maxD, setMaxD] = useState(4);
  const [verified, setVerified] = useState(false);
  const [order, setOrder] = useState<'popular' | 'nuevo' | 'artista' | 'bpm' | 'duracion'>('popular');
  const [hero, setHero] = useState(0);

  useEffect(() => { setGenre(qs.get('g')); }, [qs]);
  const pickGenre = (g: string | null) => {
    setGenre(g);
    router.replace(g ? `/canciones?g=${g}` : '/canciones', { scroll: false });
  };

  const bestOf = (id: string) => {
    const vals = Object.entries(bests).filter(([k]) => k.startsWith(id + ':')).map(([, v]) => v.score);
    return vals.length ? Math.max(...vals) : undefined;
  };

  const filtering = !!q.trim() || !!genre || verified || minD > 0 || maxD < 4 || order !== 'popular';
  const list = useMemo(() => {
    const s = norm(q);
    let l = charts.filter((c) => {
      if (s && ![c.title, c.artist, c.charter, c.genre ?? ''].some((x) => norm(x).includes(s))) return false;
      if (genre && genreOf(c.genre).id !== genre) return false;
      if (verified && !c.verified) return false;
      // Rango de dificultad: debe tener al menos una dificultad dentro del rango
      if (!DIFFICULTIES.some((d, i) => i >= minD && i <= maxD && c.difficulties[d.id])) return false;
      return true;
    });
    if (order === 'nuevo') l = [...l].reverse();
    if (order === 'artista') l = [...l].sort((a, b) => norm(a.artist).localeCompare(norm(b.artist)) || norm(a.title).localeCompare(norm(b.title)));
    if (order === 'bpm') l = [...l].sort((a, b) => b.bpm - a.bpm);
    if (order === 'duracion') l = [...l].sort((a, b) => playEnd(a) - playEnd(b));
    return l;
  }, [charts, q, genre, verified, minD, maxD, order]);

  const featured = useMemo(() => charts.filter((c) => c.verified).slice(0, 5), [charts]);
  useEffect(() => {
    if (featured.length < 2) return;
    const id = setInterval(() => setHero((h) => (h + 1) % featured.length), 8000);
    return () => clearInterval(id);
  }, [featured.length]);

  const rows = useMemo(() => {
    const out: { id: string; title: string; items: Chart[]; ranked?: boolean; color?: string }[] = [];
    const played = charts.filter((c) => bestOf(c.id) !== undefined);
    if (played.length >= MIN_FILA) out.push({ id: 'seguir', title: 'Sigue tocando', items: played });
    const top = charts.filter((c) => c.verified).slice(0, 10);
    if (top.length >= MIN_FILA) out.push({ id: 'top', title: 'Top de la semana', items: top, ranked: true });
    for (const g of GENRES) {
      const items = charts.filter((c) => genreOf(c.genre).id === g.id);
      // Una fila de una o dos canciones es un hueco gigante al lado: esas se ven con los chips
      if (items.length >= MIN_FILA) out.push({ id: g.id, title: g.name, items, color: g.color });
    }
    const community = charts.filter((c) => !c.verified);
    if (community.length >= MIN_FILA) out.push({ id: 'comunidad', title: 'Nuevos de la comunidad', items: community });
    const tranqui = [...charts].sort((a, b) => a.bpm - b.bpm).slice(0, 8);
    if (tranqui.length >= MIN_FILA) out.push({ id: 'tranqui', title: 'Para empezar tranqui', items: tranqui });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charts, bests]);

  /** Con pocas canciones los carruseles sobran: se ve mejor una cuadrícula con todo. */
  const pocas = charts.length < MIN_CARRUSELES;

  const h = featured[hero % Math.max(1, featured.length)];
  const hGenre = h ? genreOf(h.genre) : null;
  const firstDiff = (c: Chart) => (['expert', 'hard', 'medium', 'easy', 'legend'] as DifficultyId[]).find((d) => c.difficulties[d]) ?? 'expert';
  const presentGenres = GENRES.filter((g) => charts.some((c) => genreOf(c.genre).id === g.id));

  return (
    <main style={{ paddingBottom: 48 }}>
      {/* ---------- Destacada ---------- */}
      {h && !filtering && (
        <section className="lib-hero" aria-label="Canción destacada">
          <div className="lib-hero-art" key={h.id}><Cover chart={h} height={440} radius={0} /></div>
          <div className="lib-hero-shade" />
          <div className="page col lib-hero-body" style={{ gap: 14 }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="chip" style={{ color: hGenre!.color, borderColor: hGenre!.color }}>{hGenre!.name}</span>
              {h.verified && <span className="chip" style={{ color: 'var(--ok)', borderColor: 'rgba(61,220,132,0.5)' }}>✓ Verificado</span>}
            </div>
            <h1 className="disp" style={{ fontSize: 'clamp(44px, 6vw, 76px)', lineHeight: 1, textShadow: '4px 4px 0 #000', maxWidth: 720 }}>{h.title}</h1>
            <div style={{ fontSize: 20, color: 'var(--text-2)' }}>{h.artist} <span className="muted small">· chart de {h.charter}</span></div>
            <div className="row small muted mono" style={{ gap: 16 }}><span>{formatTime(playEnd(h))}</span><span>{h.bpm} BPM</span><DiffMinis chart={h} /></div>
            <div className="row" style={{ gap: 12, marginTop: 6 }}>
              <Link className="btn btn-p" href={`/jugar/${h.id}?d=${firstDiff(h)}`} style={{ height: 52, padding: '0 28px', fontSize: 17 }}><Icon name="play" /> Jugar</Link>
              <Link className="btn btn-s" href={`/cancion/${h.id}`} style={{ height: 52 }}>Más info</Link>
              <Link className="btn btn-g" href={`/jugar/${h.id}?d=${firstDiff(h)}&auto=1`} style={{ height: 52 }}>Ver demo</Link>
            </div>
            {featured.length > 1 && (
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                {featured.map((f, i) => <button key={f.id} type="button" aria-label={`Destacada ${i + 1}`} onClick={() => setHero(i)} style={{ width: i === hero ? 28 : 10, height: 6, borderRadius: 3, border: 0, cursor: 'pointer', background: i === hero ? 'var(--accent)' : 'rgba(255,255,255,0.3)', transition: 'width .3s' }} />)}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------- Barra de búsqueda y categorías ---------- */}
      <div className="lib-bar">
        <div className="page col" style={{ gap: 12, paddingTop: 14, paddingBottom: 14 }}>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div className="row grow" style={{ position: 'relative', minWidth: 240 }}>
              <span style={{ position: 'absolute', left: 14, color: 'var(--text-2)' }}><Icon name="zoomIn" size={18} /></span>
              <input className="input grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca canción, artista, anime o charter" aria-label="Buscar" style={{ paddingLeft: 42, height: 46 }} />
            </div>
            <select className="input" value={order} onChange={(e) => setOrder(e.target.value as typeof order)} aria-label="Ordenar" style={{ height: 46 }}>
              <option value="popular">Más populares</option>
              <option value="nuevo">Más nuevas</option>
              <option value="artista">Artista (A–Z)</option>
              <option value="bpm">Más rápidas</option>
              <option value="duracion">Más cortas</option>
            </select>
          </div>
          <div className="row lib-chips" role="tablist" aria-label="Categorías">
            <button type="button" role="tab" aria-selected={!genre} className="lib-chip" onClick={() => pickGenre(null)}>Todas</button>
            {presentGenres.map((g) => (
              <button key={g.id} type="button" role="tab" aria-selected={genre === g.id} className="lib-chip" onClick={() => pickGenre(genre === g.id ? null : g.id)}
                style={genre === g.id ? { background: g.color, borderColor: g.color, color: '#0A0916' } : { borderColor: `${g.color}66` }}>
                {g.name}
              </button>
            ))}
            <span className="grow" />
            <label className="row small" style={{ gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} style={{ accentColor: 'var(--ok)' }} /> Solo verificados
            </label>
            <span className="row small" style={{ gap: 6, whiteSpace: 'nowrap' }}>
              <span className="muted">Dificultad</span>
              <select className="input" value={minD} onChange={(e) => { const v = Number(e.target.value); setMinD(v); if (v > maxD) setMaxD(v); }} aria-label="Dificultad mínima" style={{ height: 34, padding: '0 8px' }}>
                {DIFFICULTIES.map((d, i) => <option key={d.id} value={i}>{d.name}</option>)}
              </select>
              <span className="muted">a</span>
              <select className="input" value={maxD} onChange={(e) => { const v = Number(e.target.value); setMaxD(v); if (v < minD) setMinD(v); }} aria-label="Dificultad máxima" style={{ height: 34, padding: '0 8px' }}>
                {DIFFICULTIES.map((d, i) => <option key={d.id} value={i}>{d.name}</option>)}
              </select>
            </span>
          </div>
        </div>
      </div>

      {/* ---------- Filas o resultados ---------- */}
      {filtering || pocas || !rows.length ? (
        <section className="page col" style={{ gap: 16, paddingTop: filtering ? undefined : 28 }}>
          <div className="row">
            <h2 className="disp grow" style={{ fontSize: 30 }}>{genre ? GENRES.find((g) => g.id === genre)?.name : q ? `Resultados para “${q}”` : filtering ? 'Canciones' : 'Todas las canciones'}</h2>
            <span className="muted small">{list.length} {list.length === 1 ? 'canción' : 'canciones'}</span>
          </div>
          {list.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
              {list.map((c) => <SongCard key={c.id} chart={c} best={bestOf(c.id)} width="auto" />)}
            </div>
          ) : (
            <div className="panel panel-pad col" style={{ alignItems: 'flex-start', gap: 10 }}>
              <span>No encontramos esa canción.</span>
              <span className="muted small">¿La quieres tocar? Créale un chart con su video de YouTube y la comunidad podrá jugarla.</span>
              <Link href="/editor" className="btn btn-p btn-sm">Crear el chart</Link>
            </div>
          )}
        </section>
      ) : (
        <div className="col" style={{ gap: 34, paddingTop: 28 }}>
          {rows.map((r) => <Row key={r.id} title={r.title} items={r.items} ranked={r.ranked} color={r.color} genreId={GENRES.some((g) => g.id === r.id) ? r.id : undefined} onGenre={pickGenre} bestOf={bestOf} />)}
        </div>
      )}
    </main>
  );
}

function Row({ title, items, ranked, color, genreId, onGenre, bestOf }: {
  title: string; items: Chart[]; ranked?: boolean; color?: string; genreId?: string; onGenre: (g: string) => void; bestOf: (id: string) => number | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Las flechas solo tienen sentido si hay para dónde moverse, y estorban si no
  const [puede, setPuede] = useState({ izq: false, der: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mirar = () => setPuede({
      izq: el.scrollLeft > 4,
      der: el.scrollLeft + el.clientWidth < el.scrollWidth - 4
    });
    mirar();
    el.addEventListener('scroll', mirar, { passive: true });
    const ro = new ResizeObserver(mirar);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', mirar); ro.disconnect(); };
  }, [items.length]);

  /** Avanza de tarjeta en tarjeta: así ninguna queda cortada por la mitad al final. */
  const scroll = (dir: number) => {
    const el = ref.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const paso = card ? card.offsetWidth + 16 : 256;
    const n = Math.max(1, Math.floor((el.clientWidth * 0.8) / paso));
    el.scrollBy({ left: dir * n * paso, behavior: 'smooth' });
  };

  return (
    <section className="lib-row" aria-label={title}>
      <div className="page row" style={{ paddingTop: 0, paddingBottom: 10 }}>
        <h2 className="grow" style={{ fontSize: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
          {color && <span style={{ width: 4, height: 22, borderRadius: 2, background: color }} />}{title}
          <span className="muted small" style={{ fontWeight: 400 }}>{items.length}</span>
        </h2>
        {genreId && <button type="button" className="linkish small" onClick={() => onGenre(genreId)}>Ver todo →</button>}
      </div>
      <div className="lib-track-wrap">
        {puede.izq && <button type="button" className="lib-arrow left" aria-label="Anteriores" onClick={() => scroll(-1)}>‹</button>}
        <div ref={ref} className="lib-track">
          {items.map((c, i) => <SongCard key={c.id} chart={c} rank={ranked ? i + 1 : undefined} best={bestOf(c.id)} />)}
        </div>
        {puede.der && <button type="button" className="lib-arrow right" aria-label="Siguientes" onClick={() => scroll(1)}>›</button>}
      </div>
    </section>
  );
}

export default function SongsPage() {
  return <Suspense fallback={null}><Library /></Suspense>;
}

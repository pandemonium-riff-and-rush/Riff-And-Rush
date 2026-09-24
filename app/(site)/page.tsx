'use client';

import Link from 'next/link';
import { Cover, DiffMinis } from '@/components/Cover';
import { useCharts } from '@/lib/data/hooks';
import { PLAYERS, closesIn } from '@/lib/data/mock';
import HeroHighway from '@/components/HeroHighway';
import { GENRES, genreOf } from '@/lib/chart/genres';

export default function Home() {
  const charts = useCharts();
  const top = charts.slice(0, 6);
  const fresh = [...charts].reverse().slice(0, 5);

  return (
    <main>
      <section style={{ position: 'relative', minHeight: 420, overflow: 'hidden', borderBottom: '4px solid var(--accent)', backgroundColor: '#0E0B20', backgroundImage: 'radial-gradient(rgba(242,240,255,0.07) 1.2px, rgba(242,240,255,0) 1.8px)', backgroundSize: '7px 7px' }}>
        <HeroHighway />
        <div className="page" style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 64, paddingBottom: 64 }}>
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <span className="chip" style={{ color: 'var(--hot-soft)', borderColor: 'rgba(236,72,153,0.5)', background: 'rgba(236,72,153,0.08)' }}>Temporada 1</span>
            <span className="stamp" style={{ fontSize: 18 }}>¡Sube el volumen!</span>
          </div>
          <h1 className="disp" style={{ fontSize: 'clamp(44px, 6vw, 72px)', lineHeight: 1.03, maxWidth: 760, textShadow: '4px 4px 0 #000' }}>
            Toca cualquier canción de YouTube. <span style={{ color: 'var(--accent)' }}>Compite con todos.</span>
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: 18, lineHeight: '28px', maxWidth: 580 }}>
            Charts hechos por la comunidad, cinco dificultades y rankings que se reinician cada semana, mes y año.
          </p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Link className="btn btn-p" href="/canciones">▶ Jugar ahora</Link>
            <Link className="btn btn-s" href="/editor">Crear un chart</Link>
          </div>
        </div>
      </section>

      <section className="page col" style={{ gap: 14, paddingBottom: 0 }}>
        <h2 className="disp" style={{ fontSize: 32, lineHeight: '40px' }}>Elige tu estilo</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14 }}>
          {GENRES.filter((g) => g.id !== 'otros' && charts.some((c) => genreOf(c.genre).id === g.id)).map((g) => (
            <Link key={g.id} href={`/canciones?g=${g.id}`} className="card" style={{ height: 88, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: `linear-gradient(135deg, ${g.color}33, rgba(20,18,42,0.9) 70%)`, borderColor: `${g.color}66` }}>
              <span className="disp" style={{ fontSize: 22, lineHeight: '24px' }}>{g.name}</span>
              <span className="small muted">{charts.filter((c) => genreOf(c.genre).id === g.id).length} canciones</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="page col" style={{ gap: 24, paddingBottom: 0 }}>
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="col grow" style={{ gap: 6 }}>
            <h2 className="disp" style={{ fontSize: 32, lineHeight: '40px' }}>Top de la semana</h2>
            <div className="muted">Las canciones más jugadas · {closesIn('week').toLowerCase()}</div>
          </div>
          <Link href="/rankings">Ver rankings →</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 24 }}>
          {top.map((c, i) => (
            <Link key={c.id} className="card" href={`/cancion/${c.id}`}>
              <div style={{ position: 'relative' }}>
                <Cover chart={c} height={172} radius={0} />
                <span className="mono" style={{ position: 'absolute', left: 10, top: 10, padding: '4px 8px', borderRadius: 2, background: 'rgba(10,9,22,0.8)', fontSize: 13, fontWeight: 700 }}>#{i + 1}</span>
              </div>
              <div className="col" style={{ padding: 14, gap: 4 }}>
                <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
                <div className="small muted">{c.artist}</div>
                <div style={{ marginTop: 8 }}><DiffMinis chart={c} /></div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="page" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 24, paddingBottom: 0 }}>
        <div className="panel panel-pad col">
          <div className="row"><h2 className="grow" style={{ fontSize: 20 }}>Nuevos charts de la comunidad</h2><Link href="/canciones" className="small">Ver todos</Link></div>
          {fresh.map((c) => (
            <Link key={c.id} className="list-row" href={`/cancion/${c.id}`}>
              <Cover chart={c} size={48} />
              <div className="col grow" style={{ gap: 2 }}>
                <div style={{ fontWeight: 600 }}>{c.title} <span className="muted" style={{ fontWeight: 400 }}>· {c.artist}</span></div>
                <div className="small muted">por {c.charter}</div>
              </div>
              <DiffMinis chart={c} />
            </Link>
          ))}
        </div>
        <div className="panel panel-pad col">
          <div className="row"><h2 className="grow" style={{ fontSize: 20 }}>Mejores jugadores de la semana</h2><Link href="/rankings" className="small">Ranking completo</Link></div>
          {PLAYERS.slice(0, 5).map((p, i) => (
            <Link key={p.name} className="list-row" href="/perfil">
              <span className="mono" style={{ width: 28, fontWeight: 700, color: ['#F5B700', '#CFCAEA', '#FF8A3D', '#A9A3CC', '#A9A3CC'][i] }}>{i + 1}</span>
              <span className="avatar" style={{ width: 40, height: 40, background: p.color, fontSize: 14 }}>{p.initials}</span>
              <div className="col grow" style={{ gap: 2 }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div className="small muted">{p.country}</div>
              </div>
              <span className="mono" style={{ fontWeight: 700 }}>{(1284920 - i * 23410).toLocaleString('es-CL')}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="page" style={{ paddingBottom: 48 }}>
        <div className="panel panel-pad row" style={{ gap: 24, flexWrap: 'wrap' }}>
          <div className="col grow" style={{ gap: 4 }}>
            <div style={{ fontSize: 20, fontWeight: 600 }}>Gratis para siempre. Apóyanos y quita los anuncios.</div>
            <div className="muted">Tu aporte paga servidores, rankings y herramientas nuevas para los charters.</div>
          </div>
          <Link className="btn btn-s" href="/apoyar">Ver formas de apoyar</Link>
        </div>
      </section>
    </main>
  );
}

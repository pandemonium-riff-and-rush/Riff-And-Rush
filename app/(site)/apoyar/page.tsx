'use client';

import { useState } from 'react';
import { PLAYERS } from '@/lib/data/mock';

const Check = () => <span aria-hidden="true" style={{ color: 'var(--ok)', fontWeight: 700 }}>✓</span>;

export default function Support() {
  const [amt, setAmt] = useState(1);
  return (
    <main className="page col" style={{ gap: 32 }}>
      <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 10 }}>
        <h1 className="disp" style={{ fontSize: 'clamp(32px, 4vw, 48px)', lineHeight: 1.1 }}>El juego es gratis. Tu apoyo lo mantiene vivo.</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 640, fontSize: 17 }}>Todas las canciones, dificultades y rankings son gratis para todos. Apoyar paga los servidores y financia herramientas nuevas para charters.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
        <div className="panel col" style={{ padding: 28, gap: 20 }}>
          <div><div style={{ fontSize: 20, fontWeight: 600 }}>Donación libre</div><div className="small muted">Un aporte único, cuando quieras</div></div>
          <div className="row" role="group" aria-label="Monto" style={{ flexWrap: 'wrap', gap: 8 }}>
            {['[MONTO 1]', '[MONTO 2]', '[MONTO 3]', 'Otro'].map((l, i) => (
              <button key={l} type="button" className="pill mono" aria-pressed={amt === i} onClick={() => setAmt(i)} style={amt === i ? { borderColor: 'var(--accent)', background: 'rgba(168,85,247,0.16)' } : undefined}>{l}</button>
            ))}
          </div>
          <div className="row small"><Check />Tu nombre en la lista de apoyadores, si quieres</div>
          <button className="btn btn-s" type="button" style={{ marginTop: 'auto' }}>Donar</button>
        </div>
        <div className="panel col" style={{ padding: 28, gap: 20, borderColor: 'var(--accent)', boxShadow: '0 0 40px rgba(168,85,247,0.15)' }}>
          <div className="row"><div className="grow" style={{ fontSize: 20, fontWeight: 600 }}>Sin anuncios</div><span className="chip" style={{ color: 'var(--accent-link-hover)' }}>Más elegido</span></div>
          <div className="row" style={{ alignItems: 'baseline', gap: 6 }}><span className="mono" style={{ fontSize: 30, fontWeight: 700 }}>[PRECIO]</span><span className="muted">/ mes</span></div>
          <div className="row small"><Check />Sin nuestros anuncios en menús, resultados y rankings</div>
          <div className="row small"><Check />Insignia de Apoyador en tu perfil</div>
          <button className="btn btn-p" type="button" style={{ marginTop: 'auto' }}>Quitar anuncios</button>
        </div>
        <div className="panel col" style={{ padding: 28, gap: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>Apoyador+</div>
          <div className="row" style={{ alignItems: 'baseline', gap: 6 }}><span className="mono" style={{ fontSize: 30, fontWeight: 700 }}>[PRECIO]</span><span className="muted">/ mes</span></div>
          <div className="row small"><Check />Todo lo de Sin anuncios</div>
          <div className="row small"><Check />Cosméticos: temas de autopista y estilos de nota</div>
          <div className="row small"><Check />Borrador con IA en el editor</div>
          <button className="btn btn-s" type="button" style={{ marginTop: 'auto' }}>Elegir Apoyador+</button>
        </div>
      </div>
      <div role="note" className="row" style={{ alignItems: 'flex-start', padding: '18px 20px', borderRadius: 4, background: 'rgba(255,210,63,0.08)', border: '1px solid rgba(255,210,63,0.45)', color: '#F2E6B3' }}>
        <span><strong style={{ color: 'var(--warn)' }}>Quitar anuncios elimina nuestros anuncios.</strong> Los anuncios propios de YouTube no dependen de nosotros: si el video tiene uno, se va a mostrar igual (salvo que tengas YouTube Premium).</span>
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <span className="small muted">Apoyadores recientes</span>
        <div className="row" style={{ gap: 0 }}>
          {PLAYERS.slice(0, 8).map((p, i) => <span key={p.name} title={p.name} className="avatar" style={{ width: 36, height: 36, background: p.color, fontSize: 12, boxShadow: '0 0 0 3px #0A0916', marginLeft: i ? -8 : 0 }}>{p.initials}</span>)}
        </div>
        <span className="grow" />
        <span className="small muted">Solo aparecen quienes aceptaron salir en la lista.</span>
      </div>
    </main>
  );
}

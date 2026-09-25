'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabaseConfigured } from '@/lib/supabase/client';
import { sendFeedback } from '@/lib/data/feedback';

/**
 * Botón fijo para opinar. Está en todas las páginas del sitio porque el momento
 * en que alguien quiere decir algo es justo cuando le pasó, no después.
 * No pide cuenta: pedirla es quedarse sin opiniones.
 */
export default function FeedbackButton() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState('');
  const [contacto, setContacto] = useState('');
  const [estado, setEstado] = useState<'edit' | 'enviando' | 'listo'>('edit');
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    area.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  if (!supabaseConfigured) return null;

  async function enviar() {
    setEstado('enviando');
    setError(null);
    const err = await sendFeedback(texto, path, contacto);
    if (err) { setError(err); setEstado('edit'); return; }
    setEstado('listo');
    setTexto('');
    setContacto('');
    setTimeout(() => { setOpen(false); setEstado('edit'); }, 1800);
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-s btn-sm fb-fab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="fb-panel"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5a8.4 8.4 0 0 1-.9-3.8 8.4 8.4 0 0 1 8.4-9 8.4 8.4 0 0 1 8.6 8.3z" />
        </svg>
        Opinar
      </button>

      {open && (
        <div id="fb-panel" className="panel fb-panel" role="dialog" aria-label="Contar qué te pareció">
          {estado === 'listo' ? (
            <p className="fb-ok">Gracias. Lo leo todo.</p>
          ) : (
            <>
              <div className="row" style={{ marginBottom: 10 }}>
                <strong className="grow" style={{ fontFamily: 'var(--font-cond)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  ¿Qué te pareció?
                </strong>
                <button type="button" className="btn btn-g btn-xs" onClick={() => setOpen(false)} aria-label="Cerrar">✕</button>
              </div>
              <p className="small muted" style={{ marginTop: 0, marginBottom: 10 }}>
                Esto es una beta. Lo que no funcione, lo que aburra, lo que falte: escríbelo tal cual.
              </p>
              <textarea
                ref={area}
                className="input"
                rows={4}
                value={texto}
                maxLength={1000}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="La canción X va desfasada, las notas se ven chicas, me costó entender cómo empezar…"
                style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-body)' }}
              />
              <input
                className="input"
                value={contacto}
                maxLength={120}
                onChange={(e) => setContacto(e.target.value)}
                placeholder="Tu correo o usuario (opcional, por si te respondo)"
                style={{ width: '100%', marginTop: 8 }}
              />
              {error && <p className="small" style={{ color: 'var(--err)', marginBottom: 0 }}>{error}</p>}
              <div className="row" style={{ marginTop: 10 }}>
                <span className="small muted grow">{texto.trim().length}/1000</span>
                <button
                  type="button"
                  className="btn btn-p btn-sm"
                  onClick={enviar}
                  disabled={estado === 'enviando' || texto.trim().length < 4}
                >
                  {estado === 'enviando' ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

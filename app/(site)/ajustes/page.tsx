'use client';

import { useEffect, useRef, useState } from 'react';
import { LANE_COLORS } from '@/lib/chart/types';
import { DEFAULT_SETTINGS, getSettings, saveSettings, type Settings } from '@/lib/data/store';
import { connectedPads, learnMidiNote, learnPadButton } from '@/lib/game/input';

const THEMES: { id: Settings['theme']; name: string; bg: string; edge: string }[] = [
  { id: 'estadio', name: 'Estadio', bg: '#1C1238', edge: '#A855F7' },
  { id: 'madera', name: 'Madera', bg: '#3A2418', edge: '#FF8A3D' },
  { id: 'hielo', name: 'Hielo', bg: '#12304A', edge: '#3FA9FF' },
  { id: 'contraste', name: 'Alto contraste', bg: '#000000', edge: '#F2F0FF' }
];

export default function SettingsPage() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [remap, setRemap] = useState(-1);
  const [cal, setCal] = useState(false);
  useEffect(() => { setS(getSettings()); }, []);

  const update = (patch: Partial<Settings>) => { const n = { ...s, ...patch }; setS(n); saveSettings(n); };

  useEffect(() => {
    if (remap < 0) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === 'Escape') { setRemap(-1); return; }
      const k = e.key.toLowerCase();
      if (k.length !== 1 || k === ' ') return;
      const keys = [...s.keys];
      const dup = keys.indexOf(k);
      if (dup >= 0) keys[dup] = keys[remap];
      keys[remap] = k;
      update({ keys });
      setRemap(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remap, s]);

  return (
    <main className="page grid12">
      <nav aria-label="Secciones" className="col" style={{ gridColumn: 'span 3', gap: 4 }}>
        <h1 className="disp" style={{ fontSize: 36, marginBottom: 16 }}>Ajustes</h1>
        {['Controles', 'Mandos', 'Velocidad', 'Latencia', 'Visual'].map((x) => <a key={x} href={`#${x.toLowerCase()}`} className="list-row muted">{x}</a>)}
        <button className="btn btn-g btn-sm" type="button" style={{ marginTop: 16, alignSelf: 'flex-start' }} onClick={() => update(DEFAULT_SETTINGS)}>Restablecer todo</button>
      </nav>
      <div style={{ gridColumn: 'span 9', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24, alignContent: 'start' }}>
        <section id="controles" className="panel panel-pad col" style={{ gridRow: 'span 2' }}>
          <div><h2 style={{ fontSize: 20 }}>Teclas</h2><div className="small muted">Un carril por tecla. El carril 6 solo se usa en Leyenda. Espacio activa la energía.</div></div>
          {s.keys.map((k, i) => (
            <div key={i} className="row" style={{ height: 52, borderBottom: '1px solid var(--border)' }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: LANE_COLORS[i] }} />
              <span className="grow">Carril {i + 1}</span>
              <span className="mono" style={{ minWidth: 44, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 3, border: `2px solid ${LANE_COLORS[i]}`, color: LANE_COLORS[i], fontWeight: 700, background: remap === i ? 'rgba(168,85,247,0.16)' : undefined }}>{remap === i ? '…' : k.toUpperCase()}</span>
              <button className="btn btn-g btn-sm" type="button" onClick={() => setRemap(remap === i ? -1 : i)}>{remap === i ? 'Presiona una tecla' : 'Cambiar tecla'}</button>
            </div>
          ))}
        </section>
        <section id="velocidad" className="panel panel-pad col">
          <div className="row"><h2 className="grow" style={{ fontSize: 20 }}>Velocidad de scroll</h2><span className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-link-hover)' }}>{s.speed.toFixed(1)}×</span></div>
          <input type="range" min={1} max={3} step={0.1} value={s.speed} onChange={(e) => update({ speed: Number(e.target.value) })} aria-label="Velocidad de scroll" />
          <div className="small muted">Más rápido separa más las notas en pantalla. No cambia la canción.</div>
        </section>
        <section id="latencia" className="panel panel-pad col">
          <div><h2 style={{ fontSize: 20 }}>Calibración de latencia</h2><div className="small muted">Compensa el retraso de tu teclado, pantalla y audífonos.</div></div>
          <div className="row">
            <div className="col grow" style={{ gap: 2 }}><span className="small muted">Desfase actual</span><span className="mono" style={{ fontSize: 22, fontWeight: 700 }}>{s.latencyMs ? `${s.latencyMs > 0 ? '+' : ''}${s.latencyMs} ms` : 'Sin calibrar'}</span></div>
            <button className="btn btn-p" type="button" onClick={() => setCal(true)}>Calibrar</button>
          </div>
          <label className="row small" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={s.metronomeClick} onChange={(e) => update({ metronomeClick: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
            Sonar clic en las canciones sin video
          </label>
        </section>
        <Controllers s={s} update={update} />
        <section id="visual" className="panel panel-pad col" style={{ gridColumn: '1 / -1' }}>
          <h2 style={{ fontSize: 20 }}>Visual</h2>
          <div className="row" style={{ gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="col" style={{ gap: 10 }}>
              <span className="small muted">Tema de la autopista</span>
              <div className="row" role="group" aria-label="Tema">
                {THEMES.map((t) => (
                  <button key={t.id} type="button" aria-label={t.name} aria-pressed={s.theme === t.id} onClick={() => update({ theme: t.id })}
                    style={{ width: 56, height: 56, borderRadius: 4, cursor: 'pointer', background: t.bg, border: `2px solid ${s.theme === t.id ? t.edge : 'var(--border)'}`, boxShadow: `inset 0 -14px 0 ${t.edge}` }} />
                ))}
              </div>
              <span className="small">{THEMES.find((t) => t.id === s.theme)?.name}</span>
            </div>
            <div className="col" style={{ gap: 10 }}>
              <span className="small muted">Efectos visuales</span>
              <div className="seg" role="group" aria-label="Efectos visuales">
                {([['auto', 'Automático'], ['high', 'Completos'], ['low', 'Livianos']] as const).map(([id, name]) => (
                  <button key={id} type="button" aria-pressed={s.effects === id} aria-selected={s.effects === id} onClick={() => update({ effects: id })}>{name}</button>
                ))}
              </div>
              <span className="small muted" style={{ maxWidth: 340 }}>Livianos: sin brillos ni fondo animado, para que el juego vaya fluido en teléfonos o computadores lentos. En automático se activan solos si hace falta.</span>
            </div>
          </div>
        </section>
      </div>
      {cal && <Calibrate onClose={() => setCal(false)} onApply={(ms) => { update({ latencyMs: ms }); setCal(false); }} />}
    </main>
  );
}

const NOTE_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const noteName = (n: number) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1} (${n})`;

/** Guitarras / mandos (Gamepad API) y baterías / teclados MIDI (Web MIDI). */
function Controllers({ s, update }: { s: Settings; update: (p: Partial<Settings>) => void }) {
  const [pads, setPads] = useState<string[]>([]);
  const [learning, setLearning] = useState<string | null>(null);
  const [live, setLive] = useState<number[]>([]);
  const [midiOk, setMidiOk] = useState(true);

  useEffect(() => {
    setMidiOk('requestMIDIAccess' in navigator);
    const refresh = () => setPads(connectedPads());
    refresh();
    window.addEventListener('gamepadconnected', refresh);
    window.addEventListener('gamepaddisconnected', refresh);
    // Muestra en vivo qué botones se están apretando
    let raf = 0;
    const tick = () => {
      const on: number[] = [];
      for (const gp of navigator.getGamepads?.() ?? []) gp?.buttons.forEach((b, i) => { if (b.pressed) on.push(i); });
      setLive((prev) => (prev.join() === on.join() ? prev : on));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('gamepadconnected', refresh); window.removeEventListener('gamepaddisconnected', refresh); };
  }, []);

  const learnPad = async (slot: number | 'boost' | 'pause') => {
    setLearning('pad-' + slot);
    const b = await learnPadButton();
    setLearning(null);
    if (b === null) return;
    if (slot === 'boost') update({ padBoost: b });
    else if (slot === 'pause') update({ padPause: b });
    else {
      const list = [...s.padButtons];
      const dup = list.indexOf(b);
      if (dup >= 0) list[dup] = list[slot];
      list[slot] = b;
      update({ padButtons: list });
    }
  };
  const learnMidi = async (slot: number) => {
    setLearning('midi-' + slot);
    const n = await learnMidiNote();
    setLearning(null);
    if (n === null) return;
    const list = [...s.midiNotes];
    const dup = list.indexOf(n);
    if (dup >= 0) list[dup] = list[slot];
    list[slot] = n;
    update({ midiNotes: list });
  };

  return (
    <section id="mandos" className="panel panel-pad col" style={{ gridColumn: '1 / -1' }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <div className="col grow" style={{ gap: 2 }}>
          <h2 style={{ fontSize: 20 }}>Guitarra, mando o MIDI</h2>
          <span className="small muted">Conecta una guitarra de Guitar Hero / Clone Hero, un mando, o una batería o teclado MIDI. Aprieta un botón para que el navegador la detecte. Por ahora se juega sin rasgueo: basta con apretar el traste.</span>
        </div>
        <span className="chip" style={{ color: pads.length ? 'var(--ok)' : 'var(--text-2)' }}>{pads.length ? `● ${pads.length} mando(s) conectado(s)` : 'Ningún mando detectado'}</span>
      </div>
      {pads.length > 0 && <div className="small muted mono" style={{ wordBreak: 'break-all' }}>{pads.join(' · ')}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
        <div className="col" style={{ gap: 0 }}>
          <span className="label" style={{ marginBottom: 6 }}>Mando / guitarra</span>
          {s.padButtons.map((b, i) => (
            <div key={i} className="row" style={{ height: 44, borderBottom: '1px solid var(--border)' }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: LANE_COLORS[i] }} />
              <span className="grow small">Carril {i + 1}</span>
              <span className="mono small" style={{ minWidth: 80, textAlign: 'center', color: b !== null && live.includes(b) ? LANE_COLORS[i] : undefined, fontWeight: 700 }}>{learning === 'pad-' + i ? 'Aprieta…' : b === null ? '—' : `Botón ${b}`}</span>
              <button className="btn btn-t btn-xs" type="button" onClick={() => learnPad(i)} disabled={!!learning}>Asignar</button>
            </div>
          ))}
          {(['boost', 'pause'] as const).map((k) => {
            const b = k === 'boost' ? s.padBoost : s.padPause;
            return (
              <div key={k} className="row" style={{ height: 44, borderBottom: '1px solid var(--border)' }}>
                <span style={{ width: 12 }} />
                <span className="grow small">{k === 'boost' ? 'Energía (o inclinar la guitarra)' : 'Pausa'}</span>
                <span className="mono small" style={{ minWidth: 80, textAlign: 'center', fontWeight: 700, color: b !== null && live.includes(b) ? 'var(--gold)' : undefined }}>{learning === 'pad-' + k ? 'Aprieta…' : b === null ? '—' : `Botón ${b}`}</span>
                <button className="btn btn-t btn-xs" type="button" onClick={() => learnPad(k)} disabled={!!learning}>Asignar</button>
              </div>
            );
          })}
          <button className="btn btn-g btn-sm" type="button" style={{ alignSelf: 'flex-start', marginTop: 8 }} onClick={() => update({ padButtons: DEFAULT_SETTINGS.padButtons, padBoost: DEFAULT_SETTINGS.padBoost, padPause: DEFAULT_SETTINGS.padPause })}>Usar distribución de guitarra Xbox/Clone Hero</button>
        </div>
        <div className="col" style={{ gap: 0 }}>
          <span className="label" style={{ marginBottom: 6 }}>Batería o teclado MIDI</span>
          {!midiOk && <span className="small" style={{ color: 'var(--gold)' }}>Este navegador no soporta MIDI. Usa Chrome o Edge.</span>}
          {s.midiNotes.map((n, i) => (
            <div key={i} className="row" style={{ height: 44, borderBottom: '1px solid var(--border)' }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: LANE_COLORS[i] }} />
              <span className="grow small">Carril {i + 1}</span>
              <span className="mono small" style={{ minWidth: 96, textAlign: 'center', fontWeight: 700 }}>{learning === 'midi-' + i ? 'Toca…' : n === null ? '—' : noteName(n)}</span>
              <button className="btn btn-t btn-xs" type="button" onClick={() => learnMidi(i)} disabled={!!learning || !midiOk}>Asignar</button>
            </div>
          ))}
          <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-g btn-sm" type="button" onClick={() => update({ midiNotes: [60, 62, 64, 65, 67, 69] })}>Teclado (Do–La)</button>
            <button className="btn btn-g btn-sm" type="button" onClick={() => update({ midiNotes: [36, 38, 42, 45, 48, 49] })}>Batería (bombo, caja, hi-hat, toms, platillo)</button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Suena un clic cada 500 ms; el jugador presiona una tecla en cada clic. Se promedia el desfase. */
function Calibrate({ onClose, onApply }: { onClose: () => void; onApply: (ms: number) => void }) {
  const ctxRef = useRef<AudioContext | null>(null);
  const startRef = useRef(0);
  const [beat, setBeat] = useState(0);
  const [offsets, setOffsets] = useState<number[]>([]);
  const PERIOD = 0.5;

  useEffect(() => {
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    startRef.current = ctx.currentTime + 0.5;
    for (let i = 0; i < 40; i++) {
      const when = startRef.current + i * PERIOD;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = i % 4 === 0 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.25, when + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
      o.connect(g).connect(ctx.destination); o.start(when); o.stop(when + 0.07);
    }
    const iv = setInterval(() => setBeat(Math.max(0, Math.floor((ctx.currentTime - startRef.current) / PERIOD))), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'Escape') { onClose(); return; }
      e.preventDefault();
      const rel = (ctx.currentTime - startRef.current) / PERIOD;
      const nearest = Math.round(rel);
      if (nearest < 0) return;
      setOffsets((o) => [...o, Math.round((rel - nearest) * PERIOD * 1000)].slice(-16));
    };
    window.addEventListener('keydown', onKey);
    return () => { clearInterval(iv); window.removeEventListener('keydown', onKey); ctx.close().catch(() => undefined); };
  }, [onClose]);

  const sorted = [...offsets].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const ready = offsets.length >= 8;

  return (
    <div className="overlay">
      <div role="dialog" aria-label="Calibrar latencia" className="modal" style={{ maxWidth: 520, alignItems: 'center', textAlign: 'center' }}>
        <h2 className="disp" style={{ fontSize: 28 }}>Calibrar latencia</h2>
        <div className="muted">Presiona cualquier tecla cada vez que suene el clic.</div>
        <div className="row" style={{ gap: 18, height: 72 }}>
          {[0, 1, 2, 3].map((i) => <span key={i} style={{ borderRadius: '50%', transition: 'all .12s', ...(beat % 4 === i ? { width: 56, height: 56, background: 'var(--accent)', boxShadow: '0 0 28px rgba(168,85,247,0.9)' } : { width: 28, height: 28, background: 'var(--border)' }) }} />)}
        </div>
        <div className="col" style={{ gap: 4 }}>
          <span className="small muted">Resultado ({offsets.length} de 8 golpes mínimo)</span>
          <span className="mono" style={{ fontSize: 32, fontWeight: 700, color: ready ? 'var(--ok)' : 'var(--text-2)' }}>{offsets.length ? `${median > 0 ? '+' : ''}${median} ms` : '—'}</span>
        </div>
        <div className="row" style={{ alignSelf: 'stretch' }}>
          <button className="btn btn-g grow" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn btn-p grow" type="button" disabled={!ready} onClick={() => onApply(median)}>Usar {median} ms</button>
        </div>
      </div>
    </div>
  );
}

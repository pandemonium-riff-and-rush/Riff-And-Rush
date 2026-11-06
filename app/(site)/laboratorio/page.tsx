'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DRILLS, type Drill } from '@/lib/game/drills';
import { MetronomeClock } from '@/lib/game/clock';
import { Scorer, type JudgeEvent } from '@/lib/game/engine';
import { drawHighway, HH, HIT, HW, laneX } from '@/lib/game/render';
import { Fx } from '@/lib/game/fx';
import { Sfx } from '@/lib/game/sfx';
import { ExtraInputs } from '@/lib/game/input';
import { DEFAULT_SETTINGS, getSettings } from '@/lib/data/store';
import { LANE_COLORS } from '@/lib/chart/types';

const REPEATS = 24;
const JUDGE_TEXT = { perfect: 'Perfecto', good: 'Bien', miss: 'Fallo', ghost: 'Sin nota' } as const;
const JUDGE_COLOR = { perfect: '#3DDC84', good: '#3FA9FF', miss: '#FF4D6D', ghost: '#8C84B8' } as const;

interface Hud { score: number; combo: number; acc: number; clean: number; ghosts: number; energy: number; whammy: number; stack: number; chain: number }

/**
 * Laboratorio de técnicas. Es una pista de pruebas, no parte del juego:
 * sirve para sentir cada técnica en bucle antes de decidir si entra a los charts.
 */
export default function Laboratorio() {
  // Los ajustes son del navegador: leerlos al primer render descuadra la hidratación.
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  useEffect(() => { setSettings(getSettings()); }, []);
  const [drillId, setDrillId] = useState<string>('legato');
  const [bpm, setBpm] = useState(96);
  const [speed, setSpeed] = useState(1.6);
  const [sound, setSound] = useState(true);
  const [click, setClick] = useState(true);
  const [running, setRunning] = useState(false);
  const [hud, setHud] = useState<Hud>({ score: 0, combo: 0, acc: 1, clean: 0, ghosts: 0, energy: 0, whammy: 0, stack: 0, chain: 0 });
  const [judge, setJudge] = useState<{ text: string; color: string; sub?: string; key: number } | null>(null);

  const drill = useMemo<Drill>(() => DRILLS.find((d) => d.id === drillId) ?? DRILLS[0], [drillId]);
  const beat = 60 / bpm;
  const loopLen = drill.bars * 4 * beat;

  const notes = useMemo(() => {
    const one = drill.build(beat);
    const out = [];
    for (let r = 0; r < REPEATS; r++) for (const nt of one) out.push({ ...nt, t: nt.t + r * loopLen });
    return out;
  }, [drill, beat, loopLen]);

  const clockRef = useRef<MetronomeClock | null>(null);
  const scorerRef = useRef<Scorer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sfxRef = useRef<Sfx | null>(null);
  const inputsRef = useRef<ExtraInputs | null>(null);
  const fxRef = useRef(new Fx());
  const pressed = useRef<boolean[]>(new Array(6).fill(false));
  const flash = useRef<number[]>(new Array(6).fill(-99));
  const seen = useRef(0);
  const runRef = useRef(false);
  const speedRef = useRef(speed);
  const recentPresses = useRef<number[]>([]);
  const whammyRef = useRef(0);

  const lanes = drill.lanes;
  const keys = useMemo(() => settings.keys.slice(0, lanes).map((k) => k.toLowerCase()), [settings.keys, lanes]);

  const build = useCallback(() => {
    scorerRef.current = new Scorer(notes, loopLen * REPEATS, { ghostPenalty: true });
    seen.current = 0;
  }, [notes, loopLen]);

  const stop = useCallback(() => {
    runRef.current = false;
    setRunning(false);
    clockRef.current?.destroy();
    clockRef.current = null;
  }, []);

  const start = useCallback(() => {
    clockRef.current?.destroy();
    build();
    sfxRef.current?.start();
    const c = new MetronomeClock(bpm, loopLen * REPEATS, click, 2);
    c.start();
    clockRef.current = c;
    runRef.current = true;
    setRunning(true);
  }, [bpm, build, click, loopLen]);

  // Reinicia al cambiar de ejercicio o de tempo
  useEffect(() => { if (runRef.current) start(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [drillId, bpm, click]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { sfxRef.current = new Sfx(0.45); return () => { sfxRef.current?.destroy(); sfxRef.current = null; }; }, []);
  useEffect(() => { sfxRef.current?.setMuted(!sound); }, [sound]);
  useEffect(() => () => { clockRef.current?.destroy(); }, []);

  if (!scorerRef.current) build();

  const now = () => (clockRef.current ? clockRef.current.time() - settings.latencyMs / 1000 : -2);

  /* ---------- Sonido y efectos por cada juicio nuevo ---------- */
  const consume = (s: Scorer, ms: number) => {
    if (s.eventCount === seen.current) return;
    const fresh = Math.min(s.eventCount - seen.current, s.events.length);
    seen.current = s.eventCount;
    let last: JudgeEvent | null = null;
    for (const ev of s.events.slice(-fresh)) {
      const x = laneX(ev.lane, lanes);
      if (ev.judgment === 'miss' || ev.judgment === 'ghost') {
        fxRef.current.miss(ev.lane, x, HIT);
        if (ev.judgment === 'ghost') sfxRef.current?.ghost(); else sfxRef.current?.miss();
      } else {
        fxRef.current.hit(x, HIT, ev.clean ? '#FFE27A' : LANE_COLORS[ev.lane], ev.judgment === 'perfect');
        flash.current[ev.lane] = s.lastTime;
        sfxRef.current?.hit(ev.lane, ev.tech, ev.judgment === 'perfect');
      }
      if (!ev.quiet) last = ev;
    }
    if (last) {
      setJudge({
        text: last.clean ? '¡Limpio!' : JUDGE_TEXT[last.judgment],
        color: last.clean ? '#ffc53d' : JUDGE_COLOR[last.judgment],
        sub: last.clean ? JUDGE_TEXT[last.judgment] : last.judgment === 'good' ? (last.offsetMs < 0 ? 'temprano' : 'tarde') : undefined,
        key: ms
      });
    }
  };

  /* ---------- Entrada ---------- */
  const hitLane = useCallback((lane: number, down: boolean) => {
    const s = scorerRef.current;
    if (!s || lane < 0 || lane >= lanes) return;
    pressed.current[lane] = down;
    if (!runRef.current) return;
    const t = now();
    if (down) {
      recentPresses.current.push(performance.now());
      if (recentPresses.current.length > 8) recentPresses.current.shift();
      s.press(lane, t);
    } else s.release(lane, t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes, sound, settings.latencyMs]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'enter') { e.preventDefault(); runRef.current ? stop() : start(); return; }
      if (e.repeat) return;
      const lane = keys.indexOf(k);
      if (lane >= 0) { e.preventDefault(); hitLane(lane, true); }
    };
    const up = (e: KeyboardEvent) => {
      const lane = keys.indexOf(e.key.toLowerCase());
      if (lane >= 0) hitLane(lane, false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [hitLane, keys, start, stop]);

  useEffect(() => {
    const inp = new ExtraInputs(settings, (lane, d) => hitLane(lane, d));
    inp.startMidi();
    inputsRef.current = inp;
    return () => { inp.stop(); inputsRef.current = null; };
  }, [hitLane, settings]);

  /* ---------- Bucle de dibujo ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = HW * dpr;
    canvas.height = HH * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    let lastHud = 0;
    let lastMs = performance.now();
    const loop = (ms: number) => {
      const dt = Math.min(0.05, (ms - lastMs) / 1000);
      lastMs = ms;
      inputsRef.current?.poll();
      const s = scorerRef.current!;
      const t = runRef.current ? now() : 0;
      if (runRef.current) {
        s.update(t, pressed.current);
        consume(s, ms);
        // Palanca de trémolo: mando/MIDI, o machaque de tecla en el teclado
        const wig = recentPresses.current.filter((p) => ms - p < 420).length >= 3 ? 1 : 0;
        const w = Math.max(inputsRef.current?.whammy() ?? 0, wig);
        whammyRef.current = w;
        const holding = s.notes.some((n) => n.holding && n.len > 0);
        if (w > 0.12 && holding) s.energy = Math.min(1, s.energy + w * dt * 0.3);
        if (t > loopLen * REPEATS - 1) { build(); clockRef.current?.resume(0); }
      }
      drawHighway(ctx, {
        t, notes: s.notes, lanes, window: 3.6 / speedRef.current, bpm,
        pressed: pressed.current, flashAt: flash.current, boosting: false,
        showNotes: true, theme: settings.theme, mult: s.multiplier, fx: fxRef.current
      });
      if (ms - lastHud > 90) {
        lastHud = ms;
        setHud({
          score: s.score, combo: s.combo, acc: s.accuracy, clean: s.cleanTechs, ghosts: s.ghosts,
          energy: s.energy, whammy: whammyRef.current, stack: s.stack, chain: s.chain
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes, bpm, loopLen, build, settings.theme]);

  useEffect(() => { if (!judge) return; const id = setTimeout(() => setJudge(null), 600); return () => clearTimeout(id); }, [judge]);

  return (
    <main className="page col" style={{ gap: 18 }}>
      <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="col grow" style={{ gap: 4 }}>
          <h1 className="disp" style={{ fontSize: 40, margin: 0 }}>Laboratorio de técnicas</h1>
          <p className="muted small" style={{ margin: 0, maxWidth: 620 }}>
            Pista de pruebas, no es parte del juego. Cada ejercicio va en bucle para sentir la técnica.
            Ninguna pide botones nuevos: se tocan con las mismas teclas de siempre ({keys.join(' ').toUpperCase()}).
          </p>
        </div>
        <Link className="btn btn-g btn-sm" href="/">Volver</Link>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {DRILLS.map((d) => (
          <button key={d.id} type="button" className="btn btn-sm" onClick={() => setDrillId(d.id)}
            style={{
              background: drillId === d.id ? 'var(--accent)' : 'var(--bg-raised)',
              color: drillId === d.id ? '#fff' : 'var(--text-2)',
              border: `1px solid ${drillId === d.id ? 'var(--accent)' : 'var(--border)'}`
            }}>{d.name}</button>
        ))}
      </div>

      <div className="row" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: HW, height: HH, flexShrink: 0, background: '#0d0d10', borderRadius: 0, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <canvas ref={canvasRef} style={{ width: HW, height: HH, display: 'block' }} aria-label="Autopista de prueba" />
          {judge && (
            <div key={judge.key} className="lab-judge" style={{ position: 'absolute', left: HW / 2, top: HIT - 110, textAlign: 'center', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              <div className="disp" style={{ fontSize: 34, color: judge.color, textShadow: `3px 3px 0 #000, 0 0 16px ${judge.color}` }}>{judge.text}</div>
              {judge.sub && <div className="cond" style={{ fontSize: 13, letterSpacing: '0.12em', color: '#c3bfb5', textShadow: '2px 2px 0 #000' }}>{judge.sub}</div>}
            </div>
          )}
          {!running && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: 'rgba(5,4,26,0.72)' }}>
              <button className="btn btn-p" type="button" onClick={start} style={{ height: 58, padding: '0 34px', fontSize: 21 }}>Probar</button>
              <span className="small muted">o presiona Enter</span>
            </div>
          )}
        </div>

        <div className="col" style={{ gap: 14, flex: '1 1 300px', minWidth: 280 }}>
          <section className="panel panel-pad col" style={{ gap: 8 }}>
            <h2 style={{ fontSize: 18, margin: 0 }}>{drill.name}</h2>
            <p className="small" style={{ margin: 0, color: 'var(--text-2)' }}>{drill.what}</p>
            <dl style={{ margin: '4px 0 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px' }}>
              {([['Teclado', drill.how.teclado], ['Guitarra', drill.how.guitarra], ['MIDI', drill.how.midi]] as const).map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt className="cond small" style={{ color: 'var(--accent)', letterSpacing: '0.1em' }}>{k.toUpperCase()}</dt>
                  <dd className="small" style={{ margin: 0, color: 'var(--text-2)' }}>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="small" style={{ margin: '4px 0 0', padding: '8px 10px', borderRadius: 0, background: 'rgba(255,61,139,0.12)', border: '1px solid rgba(255,61,139,0.35)' }}>
              <b>Qué mirar:</b> {drill.feel}
            </p>
          </section>

          <section className="panel panel-pad col" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <Stat label="Puntaje" value={Math.round(hud.score).toLocaleString('es-CL')} />
              <Stat label="Racha" value={String(hud.combo)} />
              <Stat label="Precisión" value={`${(hud.acc * 100).toFixed(0)}%`} />
              <Stat label="Limpios" value={String(hud.clean)} color="var(--gold)" />
              <Stat label="Sin nota" value={String(hud.ghosts)} color={hud.ghosts ? 'var(--hot-soft)' : undefined} />
            </div>
            {/* Lo que hace la mano, a la vista: dedos puestos y cadena de ligado */}
            <div className="row" style={{ gap: 12, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <div className="col" style={{ gap: 3, minWidth: 96 }}>
                <span className="label" style={{ fontSize: 11 }}>Pila de dedos</span>
                <span className="row" style={{ gap: 4 }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} style={{
                      width: 12, height: 12, borderRadius: 0,
                      background: i < hud.stack ? LANE_COLORS[i] : 'var(--bg-hover)',
                      boxShadow: i < hud.stack ? `0 0 8px ${LANE_COLORS[i]}` : undefined
                    }} />
                  ))}
                </span>
              </div>
              <Stat label="Cadena" value={hud.chain ? `×${(1 + Math.min(6, hud.chain) * 0.15).toFixed(2)}` : '—'} color={hud.chain ? 'var(--accent-link)' : undefined} />
            </div>
            <div className="col" style={{ gap: 4 }}>
              <span className="label">Palanca de trémolo (solo energía)</span>
              <div style={{ height: 8, borderRadius: 0, background: 'var(--bg-hover)', overflow: 'hidden' }}>
                <div style={{ height: 8, width: `${hud.whammy * 100}%`, background: '#ffc53d', transition: 'width .08s' }} />
              </div>
              <span className="small muted">Guitarra: la palanca. MIDI: pitch bend o mod wheel. Teclado: machaca la tecla durante una nota larga.</span>
            </div>
            <div style={{ height: 8, borderRadius: 0, background: 'var(--bg-hover)', overflow: 'hidden' }}>
              <div style={{ height: 8, width: `${hud.energy * 100}%`, background: 'linear-gradient(90deg,#3FA9FF,#3DDC84)' }} />
            </div>
          </section>

          <section className="panel panel-pad col" style={{ gap: 10 }}>
            <div className="row"><span className="label grow">Tempo</span><span className="mono small">{bpm} BPM</span></div>
            <input type="range" min={60} max={180} step={2} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} aria-label="Tempo" />
            <div className="row"><span className="label grow">Velocidad de notas</span><span className="mono small">{speed.toFixed(1)}×</span></div>
            <input type="range" min={1} max={3.5} step={0.1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Velocidad de notas" />
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-s btn-sm" type="button" onClick={() => setSound((v) => !v)} aria-pressed={sound}>
                {sound ? '🔊 Sonido del golpe' : '🔇 Sonido del golpe'}
              </button>
              <button className="btn btn-s btn-sm" type="button" onClick={() => setClick((v) => !v)} aria-pressed={click}>
                {click ? 'Metrónomo sí' : 'Metrónomo no'}
              </button>
              <button className="btn btn-g btn-sm" type="button" onClick={running ? stop : start}>{running ? 'Parar' : 'Probar'}</button>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              El sonido del golpe es sintetizado acá, no es la canción. En el juego real iría arriba del audio de YouTube.
            </p>
          </section>
        </div>
      </div>

      <style>{`
        .lab-judge { transform: translate(-50%, 0) rotate(-3deg); animation: labUp .6s ease-out forwards; }
        @keyframes labUp { from { opacity: 1; transform: translate(-50%, 0) rotate(-3deg) scale(1.15); } to { opacity: 0; transform: translate(-50%, -26px) rotate(-3deg) scale(1); } }
      `}</style>
    </main>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="col" style={{ gap: 2, minWidth: 70 }}>
      <span className="label" style={{ fontSize: 11 }}>{label}</span>
      <span className="mono" style={{ fontSize: 19, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</span>
    </div>
  );
}

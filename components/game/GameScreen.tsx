'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Chart, DifficultyId } from '@/lib/chart/types';
import { difficultyInfo, formatTime, lastNoteEnd, LANE_COLORS, playEnd } from '@/lib/chart/types';
import { GameClock, MetronomeClock, YouTubeClock, type ClockStatus, type TamperKind } from '@/lib/game/clock';
import { Scorer } from '@/lib/game/engine';
import { DESKTOP_GEO, drawHighway, geoFor, HH, HW, laneX, type Geo } from '@/lib/game/render';
import { Fx } from '@/lib/game/fx';
import { getAllCharts, getBest, getSettings, getVideoOverrides, saveSettings, setLastResult, setVideoOverride, submitBest, type Settings } from '@/lib/data/store';
import { Cover } from '@/components/Cover';
import { Logo } from '@/components/Nav';
import { Backdrop, BH, BW, MicAnalyser } from '@/lib/game/backdrop';
import { useMe } from '@/lib/auth/AuthProvider';
import { fetchChartLeaderboard, startPlaySession, type ChartRankRow } from '@/lib/data/cloud';
import { logEvent } from '@/lib/data/events';
import { ExtraInputs } from '@/lib/game/input';
import { MOD_INFO, modsLabel, type GameMods } from '@/lib/game/mods';
import { tempoMap } from '@/lib/chart/tempo';
import OffsetControl from '@/components/OffsetControl';
import { EnergyMeter, HudCell, MultRing, RankBadge } from './Hud';

type Phase = 'loading' | 'intro' | 'waiting' | 'countdown' | 'playing' | 'paused' | 'resuming' | 'error' | 'finished';

interface Hud { score: number; combo: number; mult: number; acc: number; energy: number; rank: string; t: number; boosting: boolean }

/** Cómo se arma la pantalla: escritorio (escenario 1440×900 escalado) o teléfono (vertical u horizontal). */
interface Layout { mobile: boolean; landscape: boolean; vw: number; vh: number }

function readLayout(): Layout {
  const vw = window.innerWidth, vh = window.innerHeight;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  // Teléfono: pantalla angosta, vertical, o táctil con poca altura (teléfono acostado)
  const mobile = vw < 820 || vh > vw || (coarse && vh < 600);
  return { mobile, landscape: vw > vh, vw, vh };
}

/** Efectos livianos de entrada: si el usuario lo pidió, o en automático en equipos táctiles o con pocos núcleos. */
function startLowFx(pref: Settings['effects']) {
  if (pref === 'low') return true;
  if (pref === 'high') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return coarse || (navigator.hardwareConcurrency ?? 8) <= 4;
}

const JUDGE_TEXT = { perfect: 'Perfecto', good: 'Bien', miss: 'Fallo', ghost: 'Sin nota' } as const;
const JUDGE_COLOR = { perfect: '#3DDC84', good: '#3FA9FF', miss: '#FF4D6D', ghost: '#8C84B8' } as const;


export default function GameScreen({ chart, diff, auto = false, mods = {} }: { chart: Chart; diff: DifficultyId; auto?: boolean; mods?: GameMods }) {
  const router = useRouter();
  const dc = chart.difficulties[diff]!;
  const info = difficultyInfo(diff);
  const lanes = dc.lanes;
  const isYouTube = chart.source.kind === 'youtube';
  const practice = mods.practice ?? null;
  const tmap = useMemo(() => tempoMap(chart.bpm, chart.tempo), [chart.bpm, chart.tempo]);
  // Fin de la partida: el charter puede cortar antes si el video sigue con créditos
  const endAt = useMemo(() => playEnd(chart), [chart]);
  // Espejo: invierte los carriles antes de jugar
  const playNotes = useMemo(() => {
    const ns = dc.notes.filter((n) => n.t <= endAt + 0.02);
    return mods.mirror ? ns.map((n) => ({ ...n, lane: lanes - 1 - n.lane })) : ns;
  }, [dc.notes, endAt, lanes, mods.mirror]);
  const lastNote = useMemo(() => lastNoteEnd(playNotes), [playNotes]);
  // Margen de inicio: el juego (las notas bajando) corre estos segundos antes de que parta
  // la canción, así la primera nota nunca aparece encima. El video espera quieto en 0.
  const lead = Math.max(0, chart.leadInSec ?? 3);
  const scorerOpts = useMemo(() => ({ precision: mods.precision, dropless: mods.dropless, ghostPenalty: diff !== 'easy' && !practice && !auto }), [mods.precision, mods.dropless, diff, practice, auto]);
  const makeScorer = useCallback(() => {
    const sc = new Scorer(playNotes, endAt, scorerOpts);
    if (practice) sc.skipBefore(practice.from - 0.01);
    return sc;
  }, [playNotes, endAt, scorerOpts, practice]);

  const [settings] = useState<Settings>(() => getSettings());
  const [phase, setPhaseState] = useState<Phase>(isYouTube ? 'loading' : 'intro');
  const [hud, setHud] = useState<Hud>({ score: 0, combo: 0, mult: 1, acc: 1, energy: 0, rank: 'S', t: 0, boosting: false });
  const [judge, setJudge] = useState<{ text: string; sub?: string; color: string; key: number } | null>(null);
  const [banner, setBanner] = useState<{ text: string; color: string; key: number } | null>(null);
  const [cd, setCd] = useState(3);
  const [errorMsg, setErrorMsg] = useState('');
  const [scale, setScale] = useState(1);
  const [lay, setLay] = useState<Layout>({ mobile: false, landscape: true, vw: 1440, vh: 900 });
  /** Tamaño de la caja de la autopista en el teléfono (se mide con ResizeObserver). */
  const [hwSize, setHwSize] = useState({ w: 390, h: 420 });
  const hwBoxRef = useRef<HTMLDivElement>(null);
  const [lowFx, setLowFx] = useState(false);
  const lowFxRef = useRef(false);
  const [tamper, setTamper] = useState<TamperKind | null>(null);
  /** Aviso breve cuando el reloj repuso el video solo (no corta la partida). */
  const [recovered, setRecovered] = useState(false);

  const phaseRef = useRef<Phase>(phase);
  /**
   * Identificador de cada aviso. Antes se usaba el tiempo del cuadro, así que un
   * juicio y un aviso nacidos en el mismo cuadro salían con la misma llave y React
   * los confundía (de ahí que el mensaje se viera repetido). Un contador no choca.
   */
  const seqRef = useRef(0);
  /**
   * Lo que ya se avisó. Vive en un ref y no en variables del bucle porque el bucle
   * se vuelve a montar al cambiar el tamaño, los efectos o el estilo; si esto se
   * reiniciara, la racha de 200 se anunciaría de nuevo en el cuadro siguiente.
   */
  const avisado = useRef({ combo: 0, hito: 0, boost: false, energia: false });
  const clockRef = useRef<GameClock | null>(null);
  const scorerRef = useRef<Scorer>(null as unknown as Scorer);
  if (!scorerRef.current) scorerRef.current = makeScorer();
  const [latencyMs, setLatencyMs] = useState(settings.latencyMs);
  const latencyRef = useRef(settings.latencyMs);
  const [speed, setSpeed] = useState(settings.speed);
  const [chartOffset, setChartOffset] = useState(chart.offsetMs);
  const speedRef = useRef(settings.speed);
  const loops = useRef(0);
  const inputsRef = useRef<ExtraInputs | null>(null);
  const pressedRef = useRef<boolean[]>(new Array(6).fill(false));
  const flashRef = useRef<number[]>(new Array(6).fill(-99));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const backdropRef = useRef(new Backdrop());
  /** La miniatura de la canción se imprime enorme detrás del escenario. */
  const coverRef = useRef<HTMLImageElement | null>(null);
  const micRef = useRef<MicAnalyser | null>(null);
  const [mic, setMic] = useState<'off' | 'on' | 'asking' | 'denied'>('off');
  const laneE = useRef<number[]>(new Array(6).fill(0));
  const musicCursor = useRef(0);
  const lastMusicT = useRef(-99);
  const fxRef = useRef(new Fx());
  const autoUp = useRef<number[]>(new Array(6).fill(-1));
  const eventsSeen = useRef(0);
  const interruptions = useRef(0);
  /** Sesión de partida del servidor (para subir el puntaje al ranking). */
  const sessionRef = useRef<Promise<string | null> | null>(null);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const hasPlayed = useRef(false);
  /** true si la cuenta regresiva viene de retomar una pausa (ahí sí va el número grande). */
  const afterPause = useRef(false);
  const finishedRef = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const best = useMemo(() => getBest(chart.id, diff), [chart.id, diff]);
  const me = useMe();
  const [board, setBoard] = useState<ChartRankRow[] | null>(null);
  useEffect(() => { fetchChartLeaderboard(chart.id, diff, 'week', 50).then(setBoard).catch(() => undefined); }, [chart.id, diff]);

  // La miniatura del video, para imprimirla detrás del escenario. Si no carga,
  // el fondo se dibuja igual sin ella.
  useEffect(() => {
    coverRef.current = null;
    const vid = chart.source.kind === 'youtube' ? chart.source.videoId : '';
    if (!vid) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { coverRef.current = img; };
    img.src = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
    return () => { img.onload = null; coverRef.current = null; };
  }, [chart.source]);
  const queue = useMemo(() => getAllCharts().filter((c) => c.id !== chart.id).slice(0, 3), [chart.id]);

  const setPhase = useCallback((p: Phase) => { phaseRef.current = p; setPhaseState(p); }, []);
  const now = useCallback(() => (clockRef.current ? clockRef.current.time() - latencyRef.current / 1000 : -3), []);
  const changeLatency = (v: number) => { latencyRef.current = v; setLatencyMs(v); saveSettings({ ...getSettings(), latencyMs: v }); };
  const changeSpeed = (v: number) => { speedRef.current = v; setSpeed(v); saveSettings({ ...getSettings(), speed: v }); };
  // Desfase de ESTA canción (queda guardado para el chart, no afecta a las demás)
  const changeChartOffset = (v: number) => {
    setChartOffset(v);
    clockRef.current?.setOffset?.(v / 1000);
    if (isYouTube && chart.source.kind === 'youtube') setVideoOverride(chart.id, { videoId: getVideoOverrides()[chart.id]?.videoId ?? chart.source.videoId, offsetMs: v });
  };

  /* ---------- Fin de la partida ---------- */
  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase('finished');
    if (practice) { clockRef.current?.pause(); router.push(`/cancion/${chart.id}`); return; }
    const s = scorerRef.current;
    s.update(endAt + 5, pressedRef.current);
    const prev = getBest(chart.id, diff)?.score ?? 0;
    const record = !auto && submitBest(chart.id, diff, { score: s.score, accuracy: s.accuracy, stars: s.stars(), maxCombo: s.maxCombo, date: new Date().toISOString() });
    setLastResult({
      chartId: chart.id, title: chart.title, artist: chart.artist, diff,
      score: s.score, accuracy: s.accuracy, hit: s.hit, total: s.total, perfect: s.perfect, good: s.good, miss: s.miss,
      maxCombo: s.maxCombo, stars: s.stars(), record, previousBest: prev, timeline: s.timeline(),
      interruptions: interruptions.current, durationSec: endAt,
      medianOffsetMs: s.medianOffset().ms, offsetSamples: s.medianOffset().count, ghosts: s.ghosts, mods: modsLabel(mods),
      modIds: MOD_INFO.map((m) => m.id).filter((id) => mods[id]),
      inputLog: auto ? undefined : (s.inputLog.slice(-25000) as [number, number, number][]),
      uploadId: auto ? undefined : Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      sessionId: auto ? undefined : sessionIdRef.current
    });
    clockRef.current?.pause();
    router.push('/resultados');
  }, [auto, chart, diff, endAt, mods, practice, router, setPhase]);

  /* ---------- Reloj ---------- */
  const onClockStatus = useCallback((st: ClockStatus) => {
    const p = phaseRef.current;
    if (st === 'ready' && p === 'loading') setPhase('intro');
    else if (st === 'waiting' && (p === 'playing' || p === 'countdown')) {
      if (hasPlayed.current) interruptions.current++;
      setPhase('waiting');
    } else if (st === 'playing' && (p === 'waiting' || p === 'intro' || p === 'resuming')) {
      hasPlayed.current = true;
      // Tras la precarga del video todavía queda el margen de inicio (tiempo negativo)
      setPhase((clockRef.current?.time() ?? 0) < 0 ? 'countdown' : 'playing');
    } else if (st === 'ended') finish();
    else if (st === 'error') {
      setErrorMsg('El video no se puede reproducir aquí (puede que el dueño haya desactivado la reproducción en otros sitios). Prueba con otro video o usa el metrónomo.');
      setPhase('error');
    }
  }, [finish, setPhase]);

  /** Aviso cuando el video lleva demasiado rato sin partir (se registra y se ofrece salida). */
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const clock: GameClock = chart.source.kind === 'youtube'
      ? new YouTubeClock('yt-player', chart.source.videoId, chart.offsetMs / 1000, lead)
      : new MetronomeClock(chart.bpm, endAt, settings.metronomeClick, lead);
    clock.onStatus = onClockStatus;
    // Si alguien pausa o mueve el video desde el reproductor, el juego se pausa solo
    // y al continuar el video vuelve al segundo correcto (no se queda trabado).
    if (clock instanceof YouTubeClock) {
      clock.onError = (code) => logEvent('video_error', String(code), chart.id);
      clock.onStuck = () => { setStuck(true); logEvent('player_stuck', 'más de 30 s preparando', chart.id); };
    }
    clock.onRecover = () => {
      const p = phaseRef.current;
      if (p !== 'playing' && p !== 'countdown' && p !== 'waiting') return;
      setRecovered(true);
    };
    clock.onTamper = (kind) => {
      const p = phaseRef.current;
      if (p !== 'playing' && p !== 'countdown' && p !== 'waiting') return;
      setTamper(kind);
      pause();
    };
    clockRef.current = clock;
    return () => { clock.destroy(); if (resumeTimer.current) clearTimeout(resumeTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Escala para que el escenario de 1440×900 quepa en la ventana ---------- */
  useEffect(() => {
    const fit = () => {
      setScale(Math.min(window.innerWidth / 1440, window.innerHeight / 900));
      setLay(readLayout());
    };
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    return () => { window.removeEventListener('resize', fit); window.removeEventListener('orientationchange', fit); };
  }, []);

  // Efectos livianos (teléfonos o equipos lentos)
  useEffect(() => {
    const low = startLowFx(settings.effects);
    lowFxRef.current = low;
    fxRef.current.low = low;
    setLowFx(low);
  }, [settings.effects]);

  // Autopista del teléfono: ocupa todo el espacio que queda, se mide al cambiar de tamaño
  useEffect(() => {
    const el = hwBoxRef.current;
    if (!lay.mobile || !el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height);
      if (w > 50 && h > 50) setHwSize((o) => (o.w === w && o.h === h ? o : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [lay.mobile, lay.landscape]);

  const geo: Geo = useMemo(() => (lay.mobile ? geoFor(hwSize.w, hwSize.h) : DESKTOP_GEO), [lay.mobile, hwSize.w, hwSize.h]);
  const geoRef = useRef<Geo>(geo);
  geoRef.current = geo;

  // Tamaño del video: en el teléfono al ancho disponible, nunca bajo 200×200 (regla de YouTube)
  const video = useMemo(() => {
    if (!lay.mobile) return { w: 400, h: 225 };
    const avail = lay.landscape ? Math.min(400, lay.vw * 0.42 - 20) : Math.min(400, lay.vw - 20);
    const w = Math.max(200, Math.floor(avail));
    return { w, h: Math.max(200, Math.round((w * 9) / 16)) };
  }, [lay.mobile, lay.landscape, lay.vw]);
  useEffect(() => { clockRef.current?.setSize?.(video.w, video.h); }, [video.w, video.h]);

  /* ---------- Controles ---------- */
  const start = useCallback(() => {
    if (phaseRef.current !== 'intro') return;
    const c = clockRef.current;
    if (!c) return;
    if (practice) {
      c.setRate(practice.rate);
      c.start();
      const from = Math.max(-lead, practice.from - 2);
      if (from > -lead) c.resume(from);
      setPhase(from < 0 ? 'countdown' : isYouTube ? 'waiting' : 'playing');
      return;
    }
    c.start();
    // Partida que cuenta: se pide la sesión al servidor ahora, mientras corre la cuenta regresiva
    if (!auto && !sessionRef.current) {
      sessionRef.current = startPlaySession(chart.id, diff).catch(() => null);
      sessionRef.current.then((id) => { sessionIdRef.current = id ?? undefined; });
    }
    // YouTube: primero se precarga el video (y pasan los anuncios); el margen parte después
    setPhase(isYouTube && c.status === 'waiting' ? 'waiting' : lead > 0 ? 'countdown' : isYouTube ? 'waiting' : 'playing');
  }, [auto, chart.id, diff, isYouTube, lead, practice, setPhase]);

  const pause = useCallback(() => {
    const p = phaseRef.current;
    if (p !== 'playing' && p !== 'countdown' && p !== 'waiting') return;
    clockRef.current?.pause();
    pressedRef.current.fill(false);
    setPhase('paused');
  }, [setPhase]);

  const resume = useCallback((restart = false) => {
    if (phaseRef.current !== 'paused') return;
    setTamper(null);
    const from = restart ? (practice ? practice.from - 2 : -lead - (isYouTube ? chart.offsetMs / 1000 : 0)) : (clockRef.current?.time() ?? 0) - 2;
    afterPause.current = !restart;
    if (restart) {
      scorerRef.current = makeScorer();
      eventsSeen.current = 0;
      interruptions.current = 0;
    }
    // 3 · 2 · 1: mientras cuenta, el video ya queda ubicado (y cargando) donde se retoma
    clockRef.current?.prepare?.(from);
    setPhase('resuming');
    setCd(3);
    let n = 3;
    const tick = () => {
      n--;
      if (n > 0) { setCd(n); resumeTimer.current = setTimeout(tick, 1000); }
      else {
        clockRef.current?.resume(from);
        // El tiempo vuelve atrás: queda anotado para que el servidor acepte el registro
        if (!restart) scorerRef.current.markResume(now());
        setPhase(from < 0 ? 'countdown' : 'playing');
      }
    };
    resumeTimer.current = setTimeout(tick, 1000);
  }, [chart.offsetMs, isYouTube, lead, makeScorer, now, practice, setPhase]);

  const hitLane = useCallback((lane: number, down: boolean) => {
    const p = phaseRef.current;
    if (lane < 0 || lane >= lanes) return;
    pressedRef.current[lane] = down;
    if (p !== 'playing' && p !== 'countdown') return;
    const t = now();
    if (down) {
      const ev = scorerRef.current.press(lane, t);
      if (ev && (ev.judgment === 'perfect' || ev.judgment === 'good')) flashRef.current[lane] = t;
    } else scorerRef.current.release(lane, t);
  }, [lanes, now]);

  useEffect(() => {
    const keys = settings.keys.slice(0, lanes).map((k) => k.toLowerCase());
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        e.preventDefault();
        if (phaseRef.current === 'paused') resume(); else pause();
        return;
      }
      if (e.repeat) return;
      if ((k === 'enter' || k === ' ') && phaseRef.current === 'intro') { e.preventDefault(); start(); return; }
      if (k === ' ') { e.preventDefault(); scorerRef.current.activateBoost(now()); return; }
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
  }, [hitLane, lanes, now, pause, resume, settings.keys, start]);

  // Mandos, guitarras y MIDI
  useEffect(() => {
    const inp = new ExtraInputs(settings, (lane, down) => {
      if (down && phaseRef.current === 'intro') { start(); return; }
      hitLane(lane, down);
    }, (a) => {
      if (a === 'boost') scorerRef.current.activateBoost(now());
      else if (phaseRef.current === 'paused') resume(); else pause();
    });
    inp.startMidi();
    inputsRef.current = inp;
    return () => { inp.stop(); inputsRef.current = null; };
  }, [hitLane, now, pause, resume, settings, start]);

  /* ---------- Bucle de render ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g0 = geoRef.current;
    // En modo liviano se dibuja a menos resolución (se nota poco y alivia mucho al teléfono)
    // Menos píxeles por cuadro en modo liviano: a 1,25 la autopista se ve igual
    // de nítida en un teléfono y se dibuja un tercio más rápido que a 1,5.
    const dpr = Math.min(lowFxRef.current ? 1.25 : 2, window.devicePixelRatio || 1);
    canvas.width = Math.round(g0.w * dpr);
    canvas.height = Math.round(g0.h * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    let lastHud = 0;
    const bg = bgRef.current;
    const bdpr = Math.min(1.5, window.devicePixelRatio || 1);
    if (bg) { bg.width = BW * bdpr; bg.height = BH * bdpr; }
    const bctx = bg?.getContext('2d') ?? null;
    bctx?.setTransform(bdpr, 0, 0, bdpr, 0, 0);
    let lastFrame = performance.now();
    // Automático: si el juego va lento (menos de ~45 cuadros por segundo sostenido), pasa a liviano
    let slowFrames = 0;
    const beatLen = 60 / chart.bpm;
    const loop = (ms: number) => {
      inputsRef.current?.poll();
      let s = scorerRef.current;
      const p = phaseRef.current;
      const t = now();
      // Modo práctica: al pasar el final del tramo, vuelve al inicio
      if (practice && (p === 'playing' || p === 'waiting') && t > practice.to + 0.4) {
        loops.current++;
        scorerRef.current = makeScorer();
        s = scorerRef.current;
        eventsSeen.current = 0;
        clockRef.current?.resume(practice.from - 2);
        avisado.current = { combo: 0, hito: 0, boost: false, energia: false };
        setBanner({ text: `Otra vez · vuelta ${loops.current + 1}`, color: '#ff3d8b', key: ++seqRef.current });
      }
      if (p === 'playing' || p === 'countdown') {
        if (auto) {
          // Modo demo: toca solo, perfecto
          for (let i = 0; i < 6; i++) if (autoUp.current[i] >= 0 && t >= autoUp.current[i]) { pressedRef.current[i] = false; s.release(i, t); autoUp.current[i] = -1; }
          for (const n of s.notes) {
            if (n.t > t) break;
            if (n.state === 'pending' && t - n.t < 0.12) {
              pressedRef.current[n.lane] = true;
              s.press(n.lane, n.t + 0.004);
              flashRef.current[n.lane] = t;
              autoUp.current[n.lane] = n.t + Math.max(n.len, 0.07);
            }
          }
          if (s.energy >= 0.99 && !s.boosting) s.activateBoost(t);
        }
        s.update(t, pressedRef.current);
        if (p === 'countdown' && t >= 0) setPhase('playing');
        if (p === 'countdown') setCd(Math.max(1, Math.ceil(-t)));
        if (!practice && t > endAt + 0.5) finish();
      }
      // Efectos por cada juicio nuevo
      if (s.eventCount !== eventsSeen.current) {
        const fresh = Math.min(s.eventCount - eventsSeen.current, s.events.length);
        eventsSeen.current = s.eventCount;
        for (const ev of s.events.slice(-fresh)) {
          const g = geoRef.current;
          const x = laneX(ev.lane, lanes, g);
          if (ev.judgment === 'miss' || ev.judgment === 'ghost') fxRef.current.miss(ev.lane, x, g.hit);
          else fxRef.current.hit(x, g.hit, s.boosting ? '#FFE27A' : LANE_COLORS[ev.lane], ev.judgment === 'perfect');
        }
        const ev = s.events[s.events.length - 1];
        const sub = ev.judgment === 'good' ? (ev.offsetMs < 0 ? 'temprano' : 'tarde') : undefined;
        setJudge({ text: JUDGE_TEXT[ev.judgment], sub, color: JUDGE_COLOR[ev.judgment], key: ++seqRef.current });
      }
      // Avisos grandes: rachas, energía y modo leyenda. Cada uno sale una sola vez
      // por hito: lo que ya se anunció queda guardado en `avisado`.
      const av = avisado.current;
      const hito = Math.floor(s.combo / 50) * 50;
      if (hito >= 50 && hito > av.hito) {
        av.hito = hito;
        setBanner({ text: `¡${hito} seguidas!`, color: '#ffc53d', key: ++seqRef.current });
      }
      if (s.combo === 0 && av.combo >= 20) setBanner({ text: 'Racha perdida', color: '#FF4D6D', key: ++seqRef.current });
      if (s.combo === 0) av.hito = 0;
      av.combo = s.combo;
      if (s.boosting !== av.boost) {
        av.boost = s.boosting;
        if (s.boosting) setBanner({ text: '¡Modo leyenda!', color: '#ffc53d', key: ++seqRef.current });
      }
      // Histéresis: la energía baila alrededor de la mitad, así que el aviso se
      // vuelve a armar solo cuando baja bastante, no al primer temblor.
      if (s.energy >= 0.5 && !s.boosting && !av.energia) {
        av.energia = true;
        setBanner({ text: 'Energía lista · Espacio', color: '#ff3d8b', key: ++seqRef.current });
      }
      if (s.energy < 0.4) av.energia = false;

      drawHighway(ctx, {
        t, notes: s.notes, lanes, window: 3.6 / speedRef.current, bpm: chart.bpm, tempo: tmap,
        pressed: pressedRef.current, flashAt: flashRef.current, boosting: s.boosting,
        showNotes: p !== 'loading', theme: settings.theme, mult: s.multiplier, fx: fxRef.current,
        geo: geoRef.current, low: lowFxRef.current
      });

      // Fondo visualizador: energía por carril sacada de las notas del chart (van con la música)
      const rawDt = (ms - lastFrame) / 1000;
      const dtf = Math.min(0.05, rawDt);
      lastFrame = ms;
      if (settings.effects === 'auto' && !lowFxRef.current && p === 'playing') {
        slowFrames = rawDt > 0.022 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
        if (slowFrames > 90) { lowFxRef.current = true; fxRef.current.low = true; setLowFx(true); }
      }
      const le = laneE.current;
      for (let i = 0; i < 6; i++) le[i] *= Math.exp(-dtf * 4.5);
      const live = p === 'playing' || p === 'countdown' || p === 'waiting';
      if (live) {
        if (t < lastMusicT.current - 0.2) musicCursor.current = 0;
        while (musicCursor.current < s.notes.length && s.notes[musicCursor.current].t <= t) {
          const n = s.notes[musicCursor.current++];
          if (n.t > lastMusicT.current - 0.05) le[n.lane] = Math.min(1, le[n.lane] + 0.8);
        }
        for (let i = Math.max(0, musicCursor.current - 24); i < musicCursor.current; i++) {
          const n = s.notes[i];
          if (n.len > 0 && n.t + n.len > t) le[n.lane] = Math.max(le[n.lane], 0.65);
        }
        lastMusicT.current = t;
      }
      if (bctx && !lowFxRef.current) {
        backdropRef.current.draw(bctx, {
          t, bpm: chart.bpm, laneEnergy: le, lanes, heat: s.boosting ? 1 : Math.min(1, s.combo / 40),
          boosting: s.boosting, mult: s.multiplier, spectrum: micRef.current?.spectrum() ?? null,
          playing: p === 'playing' || p === 'countdown',
          cover: coverRef.current, theme: settings.theme
        });
      }
      if (ms - lastHud > (lowFxRef.current ? 120 : 80)) {
        lastHud = ms;
        setHud({ score: s.score, combo: s.combo, mult: s.multiplier, acc: s.accuracy, energy: s.energy, rank: s.rank(), t: Math.max(0, t), boosting: s.boosting });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [auto, chart.bpm, endAt, finish, lanes, makeScorer, now, practice, setPhase, settings.theme, settings.effects, tmap, geo.w, geo.h, lay.mobile, lowFx]);

  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 1300);
    return () => clearTimeout(id);
  }, [banner]);

  useEffect(() => {
    if (!judge) return;
    const id = setTimeout(() => setJudge(null), 550);
    return () => clearTimeout(id);
  }, [judge]);

  useEffect(() => {
    if (!recovered) return;
    const id = setTimeout(() => setRecovered(false), 3500);
    return () => clearTimeout(id);
  }, [recovered]);

  /* ---------- Toque en pantalla (móvil) ---------- */
  const laneFromPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.floor(((e.clientX - r.left) / r.width) * lanes);
  };

  const live = useMemo(() => {
    // Ranking real de la semana. Sin conexión: solo tu récord en este navegador (nada inventado)
    const others = board?.filter((r) => !(me.loggedIn && r.username === me.name)) ?? [];
    let rows: { n: string; score: number; pos: number }[];
    if (board) rows = others.map((r, i) => ({ n: r.username ?? 'anónimo', score: r.score, pos: i + 1 }));
    else rows = best?.score ? [{ n: 'Tu récord', score: best.score, pos: 1 }] : [];
    const higher = rows.filter((r) => r.score > hud.score);
    const lower = rows.filter((r) => r.score <= hud.score);
    const myPos = higher.length ? higher[higher.length - 1].pos + 1 : 1;
    const out: { pos: number; n: string; score: number; me?: boolean }[] = [];
    if (higher.length) out.push(higher[0]);
    higher.slice(-2).forEach((r) => { if (r.pos !== 1) out.push(r); });
    out.push({ pos: myPos, n: 'Tú', score: hud.score, me: true });
    lower.slice(0, 1).forEach((r) => out.push({ ...r, pos: Math.max(r.pos, myPos) + 1 }));
    return out;
  }, [best?.score, hud.score, board, me.loggedIn, me.name]);

  const toggleMic = async () => {
    if (micRef.current) {
      micRef.current.stop(); micRef.current = null; setMic('off');
      saveSettings({ ...getSettings(), micVisuals: false });
      return;
    }
    const m = new MicAnalyser();
    setMic('asking');
    try {
      await m.start();
      micRef.current = m; setMic('on');
      saveSettings({ ...getSettings(), micVisuals: true });
    } catch { setMic('denied'); }
  };
  // Si lo dejó activado la vez anterior, lo prende de nuevo (el navegador recuerda el permiso)
  useEffect(() => {
    if (settings.micVisuals && !micRef.current) toggleMic();
    return () => { micRef.current?.stop(); micRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = (v: number) => Math.floor(v).toLocaleString('es-CL');
  const rankCol = hud.rank === 'S' ? '#ffc53d' : hud.rank === 'A' ? '#46d07f' : hud.rank === 'B' ? '#3fa9ff' : '#ff5a5a';
  const keysShown = settings.keys.slice(0, lanes);
  const multColor = hud.boosting ? '#ffc53d' : (['#e9e6de', '#e9e6de', '#3fa9ff', '#3ddc84', '#ff4d6d'][Math.min(4, hud.mult)]);

  /** Todo lo que va encima de la autopista (textos, cuentas, pausa). `c` = pantalla chica (teléfono). */
  const renderOverlays = (g: Geo, c: boolean) => (
    <>
          {c && phase === 'waiting' && (
            <div role="status" style={{ position: 'absolute', left: 8, right: 8, top: 8, padding: '8px 10px', borderRadius: 0, background: 'rgba(28,22,4,0.94)', border: '1px solid rgba(255,197,61,0.55)', color: 'var(--warn)', fontSize: 13 }}>
              <b>{hasPlayed.current ? 'Esperando al video' : 'Preparando el video'}</b> · {hasPlayed.current ? 'puede haber un anuncio; sigue solo.' : 'si hay un anuncio, pasa ahora.'}
              {stuck && <> <Link href={`/cancion/${chart.id}`}>Volver</Link></>}
            </div>
          )}
          {hud.combo >= 10 && phase === 'playing' && (
            <div style={{ position: 'absolute', left: 0, top: c ? Math.round(g.hit * 0.4) : 236, width: g.w, textAlign: 'center', pointerEvents: 'none' }}>
              <div key={Math.floor(hud.combo / 10)} className="disp combo-pop" style={{ fontSize: c ? 44 : 68, lineHeight: c ? '44px' : '68px', color: '#fff', textShadow: '4px 4px 0 #000' }}>{hud.combo}</div>
              <div className="cond" style={{ fontSize: c ? 14 : 18, letterSpacing: '.08em', color: hud.boosting ? 'var(--gold)' : multColor, textShadow: '2px 2px 0 #000' }}>{hud.boosting ? 'MODO LEYENDA' : hud.mult >= 4 ? 'EN LLAMAS' : 'COMBO'}</div>
            </div>
          )}
          {banner && (phase === 'playing' || phase === 'countdown') && (
            // Arriba, en el fondo de la autopista (donde las notas aún son chicas) y con placa oscura: no tapa lo que viene
            <div key={`aviso-${banner.key}`} className="disp banner-pop" style={{ position: 'absolute', left: g.w / 2, top: c ? 8 : 18, padding: c ? '3px 12px' : '4px 18px', borderRadius: 0, background: 'rgba(11,11,12,0.82)', border: `1px solid ${banner.color}`, fontSize: c ? 18 : 30, lineHeight: c ? '22px' : '36px', color: banner.color, textShadow: '3px 3px 0 #000', pointerEvents: 'none', whiteSpace: 'nowrap' }}>{banner.text}</div>
          )}
          {judge && (phase === 'playing' || phase === 'countdown') && (
            <div key={`juicio-${judge.key}`} className="judge-pop" style={{ position: 'absolute', left: g.w / 2, top: g.hit - (c ? 72 : 100), textAlign: 'center', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              <div className="disp" style={{ fontSize: c ? 24 : 34, lineHeight: c ? '26px' : '36px', color: judge.color, textShadow: `3px 3px 0 #000, 0 0 16px ${judge.color}` }}>{judge.text}</div>
              {judge.sub && <div className="cond" style={{ fontSize: 14, letterSpacing: '0.12em', color: '#c3bfb5', textShadow: '2px 2px 0 #000' }}>{judge.sub}</div>}
            </div>
          )}

          {/* Ya no quedan notas pero el video sigue (créditos, outro): no hay para qué esperar */}
          {!practice && (phase === 'playing' || phase === 'waiting') && hud.t > lastNote + 2 && endAt - hud.t > 8 && (
            <div style={{ position: 'absolute', left: 0, top: g.hit - (c ? 150 : 190), width: g.w, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div className="cond" style={{ fontSize: 16, letterSpacing: '0.1em', color: 'var(--text-2)', textShadow: '2px 2px 0 #000' }}>Se acabaron las notas</div>
              <button className="btn btn-p" type="button" onClick={finish} style={{ height: 48, padding: '0 28px', fontSize: 18 }}>Terminar y ver resultados</button>
            </div>
          )}

          {phase === 'countdown' && !afterPause.current && (
            <div className="cond" style={{ position: 'absolute', left: g.w / 2, top: c ? 8 : 18, transform: 'translateX(-50%)', padding: '4px 14px', borderRadius: 0, background: 'rgba(11,11,12,0.82)', border: '1px solid var(--border)', fontSize: 14, letterSpacing: '0.14em', color: 'var(--text-2)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              LA CANCIÓN PARTE EN {cd} S
            </div>
          )}
          {(phase === 'resuming' || (phase === 'countdown' && afterPause.current)) && (
            <div style={{ position: 'absolute', left: 0, top: c ? Math.round(g.h * 0.18) : 120, width: g.w, textAlign: 'center', pointerEvents: 'none' }}>
              {phase === 'resuming' && <div className="cond" style={{ fontSize: 20, color: 'var(--text-3)' }}>Retrocediendo 2 s</div>}
              <div key={cd} className="disp cd-pop" style={{ fontSize: c ? 96 : 150, lineHeight: c ? '96px' : '150px', textShadow: '6px 6px 0 #000, 0 0 50px rgba(255,61,139,0.8)' }}>{cd}</div>
            </div>
          )}
          {(phase === 'intro' || phase === 'loading') && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              {phase === 'loading' ? (
                <div className="cond" style={{ fontSize: 22, color: 'var(--text-3)' }}>Cargando video…</div>
              ) : (
                <>
                  <button className="btn btn-p" type="button" onClick={start} style={{ height: 64, padding: '0 40px', fontSize: 24 }}>¡A tocar!</button>
                  <div className="small muted">{c ? 'Toca los botones de colores de abajo' : `o presiona Enter · teclas ${keysShown.join(' ').toUpperCase()}`}</div>
                </>
              )}
            </div>
          )}
          {phase === 'paused' && (
            <div style={{ position: c ? 'fixed' : 'absolute', inset: 0, zIndex: 20, background: 'rgba(7,6,26,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: c ? 12 : 0 }}>
              <div role="dialog" aria-label="Pausa" className="modal" style={{ width: 'min(380px, calc(100vw - 24px))', maxHeight: c ? 'calc(100dvh - 24px)' : 540, overflowY: 'auto', padding: c ? 18 : undefined }}>
                <div className="disp" style={{ fontSize: 44, lineHeight: '44px' }}>Pausa</div>
                <div className="small muted">{chart.title} · {info.name} · {formatTime(hud.t)}</div>
                {tamper && (
                  <div className="small" style={{ padding: '10px 12px', borderRadius: 0, background: 'rgba(28,22,4,0.94)', border: '1px solid rgba(255,197,61,0.5)', color: '#EADFA8' }}>
                    {tamper === 'pause' ? 'Pausaste el video desde el reproductor.' : 'Moviste el video desde el reproductor.'} Acá se pausa con este botón o con <b>Esc</b>: al continuar el video vuelve solo al segundo correcto.
                  </div>
                )}
                <button className="btn btn-p" type="button" onClick={() => resume()} autoFocus>Continuar</button>
                <button className="btn btn-s" type="button" onClick={() => resume(true)}>{practice ? 'Reiniciar tramo' : 'Reiniciar'}</button>
                <div className="col" style={{ gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <div className="row"><span className="label grow">Velocidad de notas</span><span className="mono small">{speed.toFixed(1)}×</span></div>
                  <input type="range" min={1} max={3.5} step={0.1} value={speed} onChange={(e) => changeSpeed(Number(e.target.value))} aria-label="Velocidad de notas" />
                  <span className="label">Tu latencia (todas las canciones)</span>
                  <OffsetControl value={latencyMs} onChange={changeLatency} />
                  <span className="small muted">Si golpeas tarde en todas las canciones, sube. Si golpeas temprano, baja.</span>
                  {isYouTube && (
                    <>
                      <span className="label">Desfase de esta canción</span>
                      <OffsetControl value={chartOffset} onChange={changeChartOffset} />
                      <span className="small muted">Si las notas van corridas solo en esta canción, arréglalo aquí: se guarda con el chart.</span>
                    </>
                  )}
                </div>
                <button className="btn btn-g" type="button" onClick={finish}>{practice ? 'Salir de la práctica' : 'Terminar y ver resultados'}</button>
                {c && <Link className="btn btn-g" href={`/cancion/${chart.id}`}>Salir</Link>}
              </div>
            </div>
          )}
          {phase === 'error' && (
            <div style={{ position: c ? 'fixed' : 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
              <div className="modal" style={{ width: 'min(460px, calc(100vw - 24px))' }}>
                <div className="disp" style={{ fontSize: 32 }}>No se pudo cargar el video</div>
                <div className="muted">{errorMsg}</div>
                <Link className="btn btn-p" href={`/cancion/${chart.id}`}>Volver a la canción</Link>
              </div>
            </div>
          )}
    </>
  );

  // ---------- Caja del video: el mismo elemento en escritorio y teléfono (moverlo recargaría el video) ----------
  const boxPad = lay.mobile ? 4 : 6;
  const innerH = isYouTube ? video.h : lay.mobile ? 56 : 225;
  const boxW = video.w + boxPad * 2 + 4;
  const boxH = innerH + boxPad * 2 + 4;
  const videoBoxStyle: React.CSSProperties = lay.mobile
    ? { position: 'absolute', left: lay.landscape ? 8 : Math.round((lay.vw - boxW) / 2), top: lay.landscape ? 8 : 'calc(env(safe-area-inset-top) + 52px)', width: boxW, height: boxH, zIndex: 2 }
    : { position: 'absolute', left: (lay.vw - 1440 * scale) / 2 + 512 * scale, top: (lay.vh - 900 * scale) / 2 + 10 * scale, width: 416, height: 241, transform: `scale(${scale})`, transformOrigin: 'top left', zIndex: 2 };
  const pct = Math.min(100, (hud.t / endAt) * 100);
  const canPause = phase === 'playing' || phase === 'countdown' || phase === 'waiting';
  const tag = auto ? ' · Demo' : practice ? ' · Práctica' : '';

  // ---------- Piezas del teléfono ----------
  const mTopBar = (
    <div style={{ height: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', flexShrink: 0 }}>
      <button className="btn btn-s" type="button" aria-label="Pausar" onClick={pause} disabled={!canPause} style={{ width: 44, height: 40, padding: 0, fontSize: 16, boxShadow: 'none' }}>❚❚</button>
      <div className="col grow" style={{ minWidth: 0, gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {chart.title} <span style={{ fontWeight: 500, color: info.color }}>· {info.name}{tag}</span>
        </div>
        <div style={{ height: 4, borderRadius: 0, background: 'var(--ink-3)', overflow: 'hidden' }}><div style={{ height: 4, width: `${pct}%`, background: 'var(--accent)' }} /></div>
      </div>
      <div className="disp" style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{fmt(hud.score)}</div>
    </div>
  );
  const energyReady = hud.energy >= 0.5 && !hud.boosting;
  const mStats = (
    <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', flexShrink: 0 }}>
      <span className="disp" style={{ fontSize: 20, color: multColor, minWidth: 34 }}>×{hud.mult}</span>
      <span className="mono small" style={{ minWidth: 58 }}><b style={{ fontSize: 16 }}>{hud.combo}</b> racha</span>
      <span className="mono small" style={{ color: 'var(--ok)', minWidth: 52 }}>{(hud.acc * 100).toFixed(1).replace('.', ',')}%</span>
      <button type="button" aria-label={`Energía ${Math.round(hud.energy * 100)} %. Toca para activar el modo Leyenda`}
        onPointerDown={(e) => { e.preventDefault(); scorerRef.current.activateBoost(now()); }}
        style={{ flex: 1, height: 28, position: 'relative', border: 0, cursor: 'pointer', background: 'transparent', touchAction: 'none', padding: 0 }}>
        <EnergyMeter value={hud.energy} boosting={hud.boosting} />
      </button>
      <RankBadge rank={hud.rank} color={rankCol} size={30} />
    </div>
  );
  /*
   * Teclas del teléfono.
   *
   * Antes cada carril era un botón con setPointerCapture: el dedo quedaba
   * amarrado al primer botón que tocaba, así que deslizar de un carril a otro
   * —que es la mitad de lo que uno hace jugando— no registraba nada. Y entre
   * botón y botón había 6 px muertos donde apretar no hacía nada.
   *
   * Ahora la tira entera es una sola zona: el carril sale de dónde está el dedo,
   * deslizar cambia de carril y cada dedo se sigue por separado para los
   * acordes. El estado apretado se pinta tocando el DOM directo, sin pasar por
   * React: un re-render por tecla en medio de una canción se siente.
   */
  const padsRef = useRef<HTMLDivElement>(null);
  const padEls = useRef<(HTMLDivElement | null)[]>([]);
  const dedos = useRef(new Map<number, number>());

  const laneFromX = (clientX: number) => {
    const el = padsRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const i = Math.floor(((clientX - r.left) / r.width) * lanes);
    return Math.max(0, Math.min(lanes - 1, i));
  };
  const pintaPad = (lane: number, on: boolean) => {
    const el = padEls.current[lane];
    if (el) el.dataset.on = on ? '1' : '';
  };
  const padDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const l = laneFromX(e.clientX);
    dedos.current.set(e.pointerId, l);
    pintaPad(l, true);
    if (phaseRef.current === 'intro') start(); else hitLane(l, true);
  };
  const padMove = (e: React.PointerEvent) => {
    const prev = dedos.current.get(e.pointerId);
    if (prev === undefined) return;
    const l = laneFromX(e.clientX);
    if (l === prev) return;
    hitLane(prev, false); pintaPad(prev, false);
    dedos.current.set(e.pointerId, l);
    pintaPad(l, true); hitLane(l, true);
  };
  const padUp = (e: React.PointerEvent) => {
    const prev = dedos.current.get(e.pointerId);
    if (prev === undefined) return;
    dedos.current.delete(e.pointerId);
    pintaPad(prev, false);
    hitLane(prev, false);
  };

  const mPads = (
    <div
      ref={padsRef}
      role="group"
      aria-label="Carriles"
      onPointerDown={padDown}
      onPointerMove={padMove}
      onPointerUp={padUp}
      onPointerCancel={padUp}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        display: 'grid', gridTemplateColumns: `repeat(${lanes}, 1fr)`, gap: 0,
        paddingBottom: 'env(safe-area-inset-bottom)',
        height: (lay.landscape ? 86 : 116) , flexShrink: 0,
        touchAction: 'none', borderTop: '1px solid var(--line-2)', background: 'var(--ink)'
      }}
    >
      {Array.from({ length: lanes }).map((_, i) => (
        <div key={i} ref={(el) => { padEls.current[i] = el; }} className="pad" aria-hidden="true"
          style={{ ['--lane' as string]: LANE_COLORS[i] }} />
      ))}
    </div>
  );
  const mHighway = (
    <div ref={hwBoxRef} style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <canvas ref={canvasRef} aria-label="Autopista de notas"
        style={{ position: 'absolute', left: 0, top: 0, width: geo.w, height: geo.h, display: 'block', touchAction: 'none' }}
        onPointerDown={(e) => { if (phaseRef.current === 'intro') start(); else hitLane(laneFromPointer(e), true); }}
        onPointerUp={(e) => hitLane(laneFromPointer(e), false)} />
      {renderOverlays(geo, true)}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: lay.mobile ? 'radial-gradient(120% 70% at 50% 100%, #15151a 0%, #060607 70%)' : '#060607', overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none', touchAction: lay.mobile ? 'none' : undefined }}>
      {!lay.mobile ? (
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 1440, height: 900, transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center', color: 'var(--text)' }}>
        {/* Fondo animado: en modo liviano se reemplaza por un degradado fijo */}
        {lowFx
          ? <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(80% 60% at 50% 70%, #15151a 0%, #060607 70%)' }} />
          : <canvas ref={bgRef} aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: BW, height: BH }} />}

        {/* Columna izquierda */}
        <aside style={{ position: 'absolute', left: 32, top: 36, width: 280, height: 836, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div className="disp" style={{ fontSize: 76, lineHeight: '72px', textShadow: '4px 4px 0 #000' }}>Riff<span style={{ color: 'var(--spot)', textShadow: '4px 4px 0 #000' }}>&amp;</span></div>
            <div className="disp" style={{ fontSize: 84, lineHeight: '80px', transform: 'rotate(-4deg)', transformOrigin: 'left center', textShadow: '4px 4px 0 #000' }}>Rush</div>
            <div className="cond" style={{ marginTop: 10, fontSize: 13, letterSpacing: '0.24em', color: 'var(--text-2)' }}>Toca · Compite · Repite</div>
          </div>
          <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, background: 'rgba(17,17,20,0.9)' }}>
            <div className="row">
              <Cover chart={chart} size={64} />
              <div className="col grow" style={{ gap: 3 }}>
                <div className="small muted">{chart.artist}</div>
                <div style={{ fontSize: 18, lineHeight: '22px', fontWeight: 700 }}>{chart.title}</div>
                <span className="chip" style={{ alignSelf: 'flex-start', color: info.color, borderColor: info.color }}>{info.name} · {lanes}</span>
              </div>
            </div>
            <div style={{ height: 6, borderRadius: 0, background: 'var(--ink-3)', overflow: 'hidden' }}>
              <div style={{ height: 6, width: `${Math.min(100, (hud.t / endAt) * 100)}%`, background: 'var(--accent)' }} />
            </div>
            <div className="mono small muted" style={{ display: 'flex', justifyContent: 'space-between' }}><span>{formatTime(hud.t)}</span><span>{formatTime(endAt)}</span></div>
          </div>
          {auto && <div className="chip" style={{ alignSelf: 'flex-start', color: 'var(--gold)', borderColor: 'rgba(245,183,0,0.5)', background: 'rgba(30,24,6,0.8)' }}>● Demo: no cuenta</div>}
          {practice && <div className="chip" style={{ alignSelf: 'flex-start', color: 'var(--spot)', borderColor: 'var(--spot)' }}>● Práctica {formatTime(practice.from)}–{formatTime(practice.to)} · {practice.rate}×</div>}
          {!practice && !auto && modsLabel(mods) && <div className="chip" style={{ alignSelf: 'flex-start', color: 'var(--text-2)' }}>{modsLabel(mods)}</div>}
          {phase === 'waiting' && (
            <div role="status" style={{ display: 'flex', gap: 10, padding: 14, borderRadius: 0, background: 'rgba(28,22,4,0.94)', border: '1px solid rgba(255,197,61,0.55)', color: 'var(--warn)' }}>
              <div className="col" style={{ gap: 3 }}>
                <div className="cond" style={{ fontSize: 15 }}>{hasPlayed.current ? 'Esperando al video' : 'Preparando el video'}</div>
                <div className="small" style={{ color: '#EADFA8' }}>{hasPlayed.current ? 'Puede haber un anuncio de YouTube. La canción sigue sola cuando el video avance.' : 'Si YouTube pone un anuncio, pasa ahora. Después corren los segundos de inicio y parte la canción.'}</div>
                {stuck && <Link className="btn btn-s btn-sm" href={`/cancion/${chart.id}`} style={{ alignSelf: 'flex-start', marginTop: 4 }}>El video no parte · volver</Link>}
              </div>
            </div>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-s" type="button" onClick={pause} disabled={!(phase === 'playing' || phase === 'countdown' || phase === 'waiting')}>Pausar</button>
            <Link className="btn btn-g" href={`/cancion/${chart.id}`}>Salir</Link>
          </div>
          <button type="button" className="panel row small" onClick={toggleMic} aria-pressed={mic === 'on'}
            title="Las luces del fondo escuchan el sonido de tus parlantes con el micrófono. Nada se graba ni se envía."
            style={{ padding: '10px 12px', gap: 10, cursor: 'pointer', color: 'var(--text)', textAlign: 'left', background: mic === 'on' ? 'rgba(255,61,139,0.18)' : 'rgba(11,11,12,0.9)', borderColor: mic === 'on' ? 'var(--spot)' : undefined }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>
            <span className="col grow" style={{ gap: 1 }}>
              <span style={{ fontWeight: 600 }}>{mic === 'on' ? 'Luces con el sonido real' : 'Luces con el ritmo del chart'}</span>
              <span className="muted" style={{ fontSize: 12 }}>{mic === 'asking' ? 'Permite el micrófono…' : mic === 'denied' ? 'Micrófono bloqueado' : mic === 'on' ? 'Escuchando tus parlantes · clic para apagar' : 'Clic: usar el micrófono (con parlantes)'}</span>
            </span>
          </button>
          {best && (
            <div className="panel small" style={{ padding: 12, background: 'rgba(17,17,20,0.9)' }}>
              <div className="muted">Tu mejor puntaje</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700 }}>{fmt(best.score)}</div>
            </div>
          )}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="disp" style={{ fontSize: 34, lineHeight: '32px', color: 'var(--paper)' }}>Que no pare<br />la música</div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {keysShown.map((k, i) => (
                <span key={i} className="mono" style={{ minWidth: 28, height: 28, padding: '0 6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 0, background: 'var(--ink-3)', border: `1px solid ${LANE_COLORS[i]}`, color: LANE_COLORS[i], fontWeight: 700, fontSize: 13 }}>{k.toUpperCase()}</span>
              ))}
              <span className="small muted" style={{ marginLeft: 6 }}>Esc pausa · Espacio energía</span>
            </div>
          </div>
        </aside>

        {/* Autopista */}
        <div style={{ position: 'absolute', left: 340, top: 252, width: HW, height: HH }}>
          <canvas
            ref={canvasRef}
            style={{ width: HW, height: HH, display: 'block', touchAction: 'none' }}
            onPointerDown={(e) => { if (phaseRef.current === 'intro') start(); else hitLane(laneFromPointer(e), true); }}
            onPointerUp={(e) => hitLane(laneFromPointer(e), false)}
            aria-label="Autopista de notas"
          />
          {renderOverlays(DESKTOP_GEO, false)}
        </div>

        {/* Energía */}
        <div aria-label={`Energía ${Math.round(hud.energy * 100)} %`} style={{ position: 'absolute', left: 1098, top: 470, width: 22, height: 300 }}>
          <EnergyMeter value={hud.energy} boosting={hud.boosting} vertical />
        </div>
        <div className="cond" style={{ position: 'absolute', left: 1122, top: 640, writingMode: 'vertical-rl', fontSize: 11, letterSpacing: '0.16em', color: hud.energy >= 0.5 ? 'var(--gold)' : 'var(--text-2)' }}>{hud.boosting ? 'LEYENDA' : 'ENERGÍA'}</div>

        {/* Marcador */}
        <section aria-label="Marcador" style={{ position: 'absolute', left: 340, top: 812, width: 760, height: 76, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', background: 'rgba(11,11,12,0.95)', border: '1px solid var(--line)', borderTop: '6px solid var(--paper)', borderRadius: 0 }}>
          <HudCell label="Puntuación"><span className="disp" style={{ fontSize: 30, fontVariantNumeric: 'tabular-nums' }}>{fmt(hud.score)}</span></HudCell>
          <HudCell label="Racha" row>
            <MultRing combo={hud.combo} mult={hud.mult} boosting={hud.boosting} color={multColor} />
            <span className="disp" style={{ fontSize: 30, minWidth: 48 }}>{hud.combo}</span>
          </HudCell>
          <HudCell label="Precisión"><span className="disp" style={{ fontSize: 30, color: 'var(--ok)' }}>{(hud.acc * 100).toFixed(1).replace('.', ',')}%</span></HudCell>
          <HudCell label="Rango" last>
            <RankBadge rank={hud.rank} color={rankCol} size={54} />
          </HudCell>
        </section>

        {/* Columna derecha */}
        <aside style={{ position: 'absolute', left: 1128, top: 36, width: 280, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Link href="/perfil" className="panel row" style={{ padding: 12, color: 'var(--text)', background: 'rgba(17,17,20,0.9)' }}>
            <span className="avatar" style={{ width: 48, height: 48, borderRadius: 0, background: me.loggedIn ? me.color : 'var(--bg-raised)', color: '#fff', fontSize: 16 }}>{me.initials}</span>
            <span className="col grow" style={{ gap: 4 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{me.name}</span>
              <span className="small muted">{me.loggedIn ? `Nivel ${me.level}` : 'Sin cuenta: el puntaje queda solo aquí'}</span>
            </span>
          </Link>
          <section className="panel col" style={{ padding: 14, gap: 8, background: 'rgba(17,17,20,0.9)' }}>
            <div className="row"><span className="label grow">Ranking en vivo</span><span className="cond" style={{ fontSize: 11, color: 'var(--accent)' }}>● {board ? 'Semana' : 'Solo tú'}</span></div>
            {live.map((r, i) => (
              <div key={i} className="row" style={{ gap: 8, height: 34, padding: '0 8px', borderRadius: 2, ...(r.me ? { background: 'rgba(255,61,139,0.18)', border: '1px solid var(--accent)' } : { borderBottom: '1px solid var(--bg-hover)' }) }}>
                <span className="mono small muted" style={{ width: 30, fontWeight: 700 }}>#{r.pos}</span>
                <span className="grow" style={{ fontSize: 14, fontWeight: 600 }}>{r.n}</span>
                <span className="mono small" style={{ fontWeight: 700 }}>{fmt(r.score)}</span>
              </div>
            ))}
          </section>
          <section className="panel col" style={{ padding: 14, gap: 10, background: 'rgba(17,17,20,0.9)' }}>
            <span className="label">Sigue en la cola</span>
            {queue.map((q) => (
              <Link key={q.id} href={`/cancion/${q.id}`} className="row" style={{ gap: 10, color: 'var(--text)' }}>
                <Cover chart={q} size={44} />
                <span className="col grow" style={{ gap: 2 }}><span className="small muted">{q.artist}</span><span style={{ fontSize: 15, fontWeight: 600 }}>{q.title}</span></span>
              </Link>
            ))}
          </section>
        </aside>

        <div className="small" style={{ position: 'absolute', right: 32, bottom: 14, color: 'var(--text-2)' }}><Logo size={16} /></div>
      </div>
      ) : lay.landscape ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', color: 'var(--text)', padding: 'env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left)' }}>
          <div style={{ width: boxW + 16, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ height: boxH + 8, flexShrink: 0 }} />
            {mTopBar}
            {mStats}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {mHighway}
            {mPads}
          </div>
        </div>
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', color: 'var(--text)', paddingTop: 'env(safe-area-inset-top)' }}>
          {mTopBar}
          <div style={{ height: boxH + 8, flexShrink: 0 }} />
          {mStats}
          {mHighway}
          {mPads}
        </div>
      )}

      {/* Pantalla del escenario: el reproductor de YouTube, siempre el mismo nodo (se reubica, no se recrea) */}
      <div aria-label="Pantalla del escenario" style={{ ...videoBoxStyle, padding: boxPad, background: '#000', border: '1px solid var(--line-2)', borderRadius: 0, boxShadow: lay.mobile || lowFx ? undefined : '0 24px 60px rgba(0,0,0,0.85)', color: 'var(--text)' }}>
        {isYouTube ? (
          /*
           * Nada encima del reproductor: las políticas de YouTube prohíben taparlo o bloquear sus
           * enlaces. Que no se pueda manipular sin querer lo resuelven controls:0 + disablekb:1
           * (oficiales), el tabindex -1 del iframe y onRecover: el reloj repone el video solo.
           */
          <div style={{ position: 'relative', width: video.w, height: video.h, background: '#000' }}>
            <div id="yt-player" />
            {recovered && (
              <div role="status" style={{ position: 'absolute', left: 8, right: 8, bottom: 8, padding: '6px 10px', borderRadius: 0, background: 'rgba(11,11,12,0.92)', border: '1px solid var(--accent)', color: 'var(--text-2)', fontSize: 12, textAlign: 'center', pointerEvents: 'none' }}>
                El video se movió: lo devolvimos a su lugar. Para pausar, usa el botón o Esc.
              </div>
            )}
          </div>
        ) : lay.mobile ? (
          <div style={{ width: video.w, height: innerH, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#0d0d10', textAlign: 'center', fontSize: 13 }}>
            <span className="disp" style={{ fontSize: 18, color: 'var(--accent)' }}>Modo metrónomo</span>
            <span className="muted">· sin video</span>
          </div>
        ) : (
          <div style={{ width: 400, height: 225, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#0d0d10', textAlign: 'center', padding: 24 }}>
            <div className="disp" style={{ fontSize: 30, lineHeight: '34px', color: 'var(--accent)', whiteSpace: 'nowrap' }}>Modo metrónomo</div>
            <div className="muted" style={{ maxWidth: 340, fontSize: 14 }}>Esta canción de prueba no tiene video. Asígnale uno de YouTube desde su ficha para tocar con la canción real.</div>
          </div>
        )}
      </div>
      <style>{`
        .judge-pop { transform: translate(-50%, 0) rotate(-3deg); animation: judgeUp .55s ease-out forwards; }
        @keyframes judgeUp { from { opacity: 1; transform: translate(-50%, 0) rotate(-3deg) scale(1.15); } to { opacity: 0; transform: translate(-50%, -30px) rotate(-3deg) scale(1); } }
        .banner-pop { transform: translate(-50%, 0); animation: bannerIn 1.3s cubic-bezier(.16,1,.3,1) forwards; }
        @keyframes bannerIn { 0% { opacity: 0; transform: translate(-50%, 10px) scale(.4) rotate(-8deg); } 18% { opacity: 1; transform: translate(-50%, 0) scale(1.02) rotate(-3deg); } 30% { transform: translate(-50%, 0) scale(1) rotate(-3deg); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -24px) scale(1) rotate(-3deg); } }
        .combo-pop { animation: comboPop .3s cubic-bezier(.16,1,.3,1); }
        @keyframes comboPop { from { transform: scale(1.35); } to { transform: scale(1); } }
        .cd-pop { animation: cdPop .5s ease-out; }
        @keyframes cdPop { from { transform: scale(1.6); opacity: .2; } to { transform: scale(1); opacity: 1; } }
        .energy-ready { animation: energyPulse .6s ease-in-out infinite alternate; }
        @keyframes energyPulse { from { filter: brightness(1); } to { filter: brightness(1.6); } }
        .mult-fire { animation: fire .18s ease-in-out infinite alternate; transform-origin: 50% 100%; }
        @keyframes fire { from { transform: scaleY(1) } to { transform: scaleY(1.15) } }
        .pad:active { filter: brightness(1.8); transform: translateY(2px); }
        .modal > * { flex-shrink: 0; }
      `}</style>
    </div>
  );
}

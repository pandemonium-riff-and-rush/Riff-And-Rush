'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Chart, DifficultyId } from '@/lib/chart/types';
import { difficultyInfo, formatTime, lastNoteEnd, LANE_COLORS, playEnd } from '@/lib/chart/types';
import { GameClock, MetronomeClock, YouTubeClock, type ClockStatus, type TamperKind } from '@/lib/game/clock';
import { Scorer } from '@/lib/game/engine';
import { drawHighway, HH, HIT, HW, laneX } from '@/lib/game/render';
import { Fx } from '@/lib/game/fx';
import { getAllCharts, getBest, getSettings, getVideoOverrides, saveSettings, setLastResult, setVideoOverride, submitBest, type Settings } from '@/lib/data/store';
import { Cover } from '@/components/Cover';
import { Logo } from '@/components/Nav';
import { Backdrop, BH, BW, MicAnalyser } from '@/lib/game/backdrop';
import { useMe } from '@/lib/auth/AuthProvider';
import { fetchChartLeaderboard, startPlaySession, type ChartRankRow } from '@/lib/data/cloud';
import { ExtraInputs } from '@/lib/game/input';
import { MOD_INFO, modsLabel, type GameMods } from '@/lib/game/mods';
import { tempoMap } from '@/lib/chart/tempo';
import OffsetControl from '@/components/OffsetControl';
import { HudCell, MultRing } from './Hud';

type Phase = 'loading' | 'intro' | 'waiting' | 'countdown' | 'playing' | 'paused' | 'resuming' | 'error' | 'finished';

interface Hud { score: number; combo: number; mult: number; acc: number; energy: number; rank: string; t: number; boosting: boolean }

const JUDGE_TEXT = { perfect: 'Perfecto', good: 'Bien', miss: 'Fallo', ghost: 'Sin nota' } as const;
const JUDGE_COLOR = { perfect: '#3DDC84', good: '#3FA9FF', miss: '#FF4D6D', ghost: '#8C84B8' } as const;

const RIVALS: [string, number][] = [['SofiStrings', 0.99], ['ElTucu', 0.97], ['NotaAzul', 0.9], ['DrumlessDan', 0.86], ['pulso', 0.74], ['Kenji_R', 0.62], ['Oso_Polar', 0.5]];

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
  const [tamper, setTamper] = useState<TamperKind | null>(null);

  const phaseRef = useRef<Phase>(phase);
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

  useEffect(() => {
    const clock: GameClock = chart.source.kind === 'youtube'
      ? new YouTubeClock('yt-player', chart.source.videoId, chart.offsetMs / 1000, lead)
      : new MetronomeClock(chart.bpm, endAt, settings.metronomeClick, lead);
    clock.onStatus = onClockStatus;
    // Si alguien pausa o mueve el video desde el reproductor, el juego se pausa solo
    // y al continuar el video vuelve al segundo correcto (no se queda trabado).
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
    const fit = () => setScale(Math.min(window.innerWidth / 1440, window.innerHeight / 900));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

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
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = HW * dpr;
    canvas.height = HH * dpr;
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
    let prevCombo = 0;
    let prevBoost = false;
    let energyHinted = false;
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
        setBanner({ text: `Otra vez · vuelta ${loops.current + 1}`, color: '#C084FC', key: ms });
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
          const x = laneX(ev.lane, lanes);
          if (ev.judgment === 'miss' || ev.judgment === 'ghost') fxRef.current.miss(ev.lane, x, HIT);
          else fxRef.current.hit(x, HIT, s.boosting ? '#FFE27A' : LANE_COLORS[ev.lane], ev.judgment === 'perfect');
        }
        const ev = s.events[s.events.length - 1];
        const sub = ev.judgment === 'good' ? (ev.offsetMs < 0 ? 'temprano' : 'tarde') : undefined;
        setJudge({ text: JUDGE_TEXT[ev.judgment], sub, color: JUDGE_COLOR[ev.judgment], key: ms });
      }
      // Avisos grandes: rachas, energía y modo leyenda
      if (s.combo >= 50 && Math.floor(s.combo / 50) > Math.floor(prevCombo / 50)) setBanner({ text: `¡${Math.floor(s.combo / 50) * 50} seguidas!`, color: '#F5B700', key: ms });
      if (prevCombo >= 20 && s.combo === 0) setBanner({ text: 'Racha perdida', color: '#FF4D6D', key: ms });
      prevCombo = s.combo;
      if (s.boosting && !prevBoost) setBanner({ text: '¡Modo leyenda!', color: '#F5B700', key: ms });
      prevBoost = s.boosting;
      if (s.energy >= 0.5 && !s.boosting && !energyHinted) { energyHinted = true; setBanner({ text: 'Energía lista · Espacio', color: '#C084FC', key: ms }); }
      if (s.energy < 0.5) energyHinted = false;

      drawHighway(ctx, {
        t, notes: s.notes, lanes, window: 3.6 / speedRef.current, bpm: chart.bpm, tempo: tmap,
        pressed: pressedRef.current, flashAt: flashRef.current, boosting: s.boosting,
        showNotes: p !== 'loading', theme: settings.theme, mult: s.multiplier, fx: fxRef.current
      });

      // Fondo visualizador: energía por carril sacada de las notas del chart (van con la música)
      const dtf = Math.min(0.05, (ms - lastFrame) / 1000);
      lastFrame = ms;
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
      if (bctx) {
        backdropRef.current.draw(bctx, {
          t, bpm: chart.bpm, laneEnergy: le, lanes, heat: s.boosting ? 1 : Math.min(1, s.combo / 40),
          boosting: s.boosting, mult: s.multiplier, spectrum: micRef.current?.spectrum() ?? null, playing: p === 'playing' || p === 'countdown'
        });
      }
      if (ms - lastHud > 80) {
        lastHud = ms;
        setHud({ score: s.score, combo: s.combo, mult: s.multiplier, acc: s.accuracy, energy: s.energy, rank: s.rank(), t: Math.max(0, t), boosting: s.boosting });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [auto, chart.bpm, endAt, finish, lanes, makeScorer, now, practice, setPhase, settings.theme, tmap]);

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

  /* ---------- Toque en pantalla (móvil) ---------- */
  const laneFromPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.floor(((e.clientX - r.left) / r.width) * lanes);
  };

  const live = useMemo(() => {
    // Ranking real de la semana si hay datos; si no, rivales de ejemplo
    const others = board?.filter((r) => !(me.loggedIn && r.username === me.name)) ?? [];
    let rows: { n: string; score: number; pos: number }[];
    if (board && others.length) {
      rows = others.map((r, i) => ({ n: r.username ?? 'anónimo', score: r.score, pos: i + 1 }));
    } else if (board) {
      rows = [];
    } else {
      const top = Math.max(best?.score ?? 0, scorerRef.current.total * 50 * 3.2);
      rows = RIVALS.map(([n, f], i) => ({ n, score: Math.round(top * f), pos: [1, 2, 12, 13, 21, 28, 35][i] }));
    }
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
  const rankCol = hud.rank === 'S' ? '#F5B700' : hud.rank === 'A' ? '#3DDC84' : hud.rank === 'B' ? '#3FA9FF' : '#FF4D6D';
  const keysShown = settings.keys.slice(0, lanes);
  const multColor = hud.boosting ? '#F5B700' : (['#A855F7', '#A855F7', '#3FA9FF', '#3DDC84', '#FF4D6D'][Math.min(4, hud.mult)]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#05041A', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 1440, height: 900, transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center', color: 'var(--text)' }}>
        <canvas ref={bgRef} aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: BW, height: BH }} />

        {/* Pantalla del escenario: el reproductor de YouTube va aquí, sin nada encima */}
        <div aria-label="Pantalla del escenario" style={{ position: 'absolute', left: 512, top: 10, width: 416, height: 241, padding: 6, background: '#000', border: '2px solid var(--border)', borderRadius: 3, boxShadow: '0 0 60px rgba(168,85,247,0.35), 0 20px 50px rgba(0,0,0,0.8)' }}>
          {isYouTube ? (
            /*
             * El reproductor queda interactivo a propósito. Las políticas de desarrollador de
             * YouTube prohíben "block any portion or functionality of a YouTube player" y
             * "remove, obscure, alter, or disable any links that appear in YouTube players":
             * un iframe con pointer-events desactivado también tapa el enlace "Ver en YouTube".
             * Para que nadie desincronice la partida alcanza con controls:0 y disablekb:1
             * (parámetros oficiales) más la detección onTamper del reloj, que pausa el juego
             * y devuelve el video a su segundo al continuar.
             */
            <div style={{ position: 'relative', width: 400, height: 225, background: '#000' }}>
              <div id="yt-player" />
              {/* El video no se toca: se pausa solo con nuestro botón o Esc. Se deja libre únicamente
                  mientras YouTube muestra un anuncio (fase "esperando"), para poder saltarlo. */}
              {phase !== 'waiting' && (
                <div aria-hidden onMouseDown={(e) => e.preventDefault()} onClick={(e) => e.preventDefault()}
                  style={{ position: 'absolute', inset: 0, cursor: 'default', background: 'transparent' }} />
              )}
            </div>
          ) : (
            <div style={{ width: 400, height: 225, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#0B0716', textAlign: 'center', padding: 24 }}>
              <div className="disp" style={{ fontSize: 30, lineHeight: '34px', color: 'var(--accent)', whiteSpace: 'nowrap' }}>Modo metrónomo</div>
              <div className="muted" style={{ maxWidth: 340, fontSize: 14 }}>Esta canción de prueba no tiene video. Asígnale uno de YouTube desde su ficha para tocar con la canción real.</div>
            </div>
          )}
        </div>

        {/* Columna izquierda */}
        <aside style={{ position: 'absolute', left: 32, top: 36, width: 280, height: 836, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div className="disp" style={{ fontSize: 76, lineHeight: '72px', textShadow: '4px 4px 0 #000' }}>Riff<span style={{ color: 'var(--accent)', textShadow: '4px 4px 0 #000, 0 0 30px rgba(168,85,247,0.6)' }}>&amp;</span></div>
            <div className="disp" style={{ fontSize: 84, lineHeight: '80px', transform: 'rotate(-4deg)', transformOrigin: 'left center', textShadow: '4px 4px 0 #000' }}>Rush</div>
            <div className="cond" style={{ marginTop: 10, fontSize: 13, letterSpacing: '0.24em', color: 'var(--text-2)' }}>Toca · Compite · Repite</div>
          </div>
          <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, background: 'rgba(20,18,42,0.88)' }}>
            <div className="row">
              <Cover chart={chart} size={64} />
              <div className="col grow" style={{ gap: 3 }}>
                <div className="small muted">{chart.artist}</div>
                <div style={{ fontSize: 18, lineHeight: '22px', fontWeight: 700 }}>{chart.title}</div>
                <span className="chip" style={{ alignSelf: 'flex-start', color: info.color, borderColor: info.color }}>{info.name} · {lanes}</span>
              </div>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-hover)', overflow: 'hidden' }}>
              <div style={{ height: 6, width: `${Math.min(100, (hud.t / endAt) * 100)}%`, background: 'var(--accent)' }} />
            </div>
            <div className="mono small muted" style={{ display: 'flex', justifyContent: 'space-between' }}><span>{formatTime(hud.t)}</span><span>{formatTime(endAt)}</span></div>
          </div>
          {auto && <div className="chip" style={{ alignSelf: 'flex-start', color: 'var(--gold)', borderColor: 'rgba(245,183,0,0.5)', background: 'rgba(30,24,6,0.8)' }}>● Demo: no cuenta</div>}
          {practice && <div className="chip" style={{ alignSelf: 'flex-start', color: '#C084FC', borderColor: 'var(--accent)', background: 'rgba(20,10,40,0.8)' }}>● Práctica {formatTime(practice.from)}–{formatTime(practice.to)} · {practice.rate}×</div>}
          {!practice && !auto && modsLabel(mods) && <div className="chip" style={{ alignSelf: 'flex-start', color: 'var(--text-2)' }}>{modsLabel(mods)}</div>}
          {phase === 'waiting' && (
            <div role="status" style={{ display: 'flex', gap: 10, padding: 14, borderRadius: 3, background: 'rgba(30,24,6,0.92)', border: '2px solid rgba(255,210,63,0.6)', color: 'var(--warn)' }}>
              <div className="col" style={{ gap: 3 }}>
                <div className="cond" style={{ fontSize: 15 }}>{hasPlayed.current ? 'Esperando al video' : 'Preparando el video'}</div>
                <div className="small" style={{ color: '#EADFA8' }}>{hasPlayed.current ? 'Puede haber un anuncio de YouTube. La canción sigue sola cuando el video avance.' : 'Si YouTube pone un anuncio, pasa ahora. Después corren los segundos de inicio y parte la canción.'}</div>
              </div>
            </div>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-s" type="button" onClick={pause} disabled={!(phase === 'playing' || phase === 'countdown' || phase === 'waiting')}>Pausar</button>
            <Link className="btn btn-g" href={`/cancion/${chart.id}`}>Salir</Link>
          </div>
          <button type="button" className="panel row small" onClick={toggleMic} aria-pressed={mic === 'on'}
            title="Las luces del fondo escuchan el sonido de tus parlantes con el micrófono. Nada se graba ni se envía."
            style={{ padding: '10px 12px', gap: 10, cursor: 'pointer', color: 'var(--text)', textAlign: 'left', background: mic === 'on' ? 'rgba(168,85,247,0.2)' : 'rgba(20,18,42,0.88)', borderColor: mic === 'on' ? 'var(--accent)' : undefined }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>
            <span className="col grow" style={{ gap: 1 }}>
              <span style={{ fontWeight: 600 }}>{mic === 'on' ? 'Luces con el sonido real' : 'Luces con el ritmo del chart'}</span>
              <span className="muted" style={{ fontSize: 12 }}>{mic === 'asking' ? 'Permite el micrófono…' : mic === 'denied' ? 'Micrófono bloqueado' : mic === 'on' ? 'Escuchando tus parlantes · clic para apagar' : 'Clic: usar el micrófono (con parlantes)'}</span>
            </span>
          </button>
          {best && (
            <div className="panel small" style={{ padding: 12, background: 'rgba(20,18,42,0.88)' }}>
              <div className="muted">Tu mejor puntaje</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700 }}>{fmt(best.score)}</div>
            </div>
          )}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="marker" style={{ fontSize: 30, lineHeight: '32px', color: 'var(--accent)', transform: 'rotate(-6deg)', transformOrigin: 'left', textShadow: '3px 3px 0 #000' }}>¡Que no pare<br />la música!</div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {keysShown.map((k, i) => (
                <span key={i} className="mono" style={{ minWidth: 28, height: 28, padding: '0 6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2, background: 'var(--bg-raised)', border: `1px solid ${LANE_COLORS[i]}`, color: LANE_COLORS[i], fontWeight: 700, fontSize: 13 }}>{k.toUpperCase()}</span>
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
          {hud.combo >= 10 && phase === 'playing' && (
            <div style={{ position: 'absolute', left: 0, top: 236, width: HW, textAlign: 'center', pointerEvents: 'none' }}>
              <div key={Math.floor(hud.combo / 10)} className="disp combo-pop" style={{ fontSize: 68, lineHeight: '68px', color: '#fff', textShadow: `4px 4px 0 #000, 0 0 30px ${multColor}` }}>{hud.combo}</div>
              <div className="marker" style={{ fontSize: 20, color: hud.boosting ? 'var(--gold)' : multColor, transform: 'rotate(-4deg)', textShadow: '2px 2px 0 #000' }}>{hud.boosting ? '¡Modo leyenda!' : hud.mult >= 4 ? '¡En llamas!' : '¡Combo!'}</div>
            </div>
          )}
          {banner && (phase === 'playing' || phase === 'countdown') && (
            // Arriba, en el fondo de la autopista (donde las notas aún son chicas) y con placa oscura: no tapa lo que viene
            <div key={banner.key} className="disp banner-pop" style={{ position: 'absolute', left: HW / 2, top: 18, padding: '4px 18px', borderRadius: 4, background: 'rgba(10,9,22,0.72)', border: `1px solid ${banner.color}`, fontSize: 30, lineHeight: '36px', color: banner.color, textShadow: `3px 3px 0 #000, 0 0 18px ${banner.color}`, pointerEvents: 'none', whiteSpace: 'nowrap' }}>{banner.text}</div>
          )}
          {judge && (phase === 'playing' || phase === 'countdown') && (
            <div key={judge.key} className="judge-pop" style={{ position: 'absolute', left: HW / 2, top: HIT - 100, textAlign: 'center', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              <div className="disp" style={{ fontSize: 34, lineHeight: '36px', color: judge.color, textShadow: `3px 3px 0 #000, 0 0 16px ${judge.color}` }}>{judge.text}</div>
              {judge.sub && <div className="cond" style={{ fontSize: 14, letterSpacing: '0.12em', color: '#CFCAEA', textShadow: '2px 2px 0 #000' }}>{judge.sub}</div>}
            </div>
          )}

          {/* Ya no quedan notas pero el video sigue (créditos, outro): no hay para qué esperar */}
          {!practice && (phase === 'playing' || phase === 'waiting') && hud.t > lastNote + 2 && endAt - hud.t > 8 && (
            <div style={{ position: 'absolute', left: 0, top: HIT - 190, width: HW, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div className="cond" style={{ fontSize: 16, letterSpacing: '0.1em', color: 'var(--text-2)', textShadow: '2px 2px 0 #000' }}>Se acabaron las notas</div>
              <button className="btn btn-p" type="button" onClick={finish} style={{ height: 48, padding: '0 28px', fontSize: 18 }}>Terminar y ver resultados</button>
            </div>
          )}

          {phase === 'countdown' && !afterPause.current && (
            <div className="cond" style={{ position: 'absolute', left: HW / 2, top: 18, transform: 'translateX(-50%)', padding: '4px 14px', borderRadius: 4, background: 'rgba(10,9,22,0.72)', border: '1px solid var(--border)', fontSize: 14, letterSpacing: '0.14em', color: 'var(--text-2)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              LA CANCIÓN PARTE EN {cd} S
            </div>
          )}
          {(phase === 'resuming' || (phase === 'countdown' && afterPause.current)) && (
            <div style={{ position: 'absolute', left: 0, top: 120, width: HW, textAlign: 'center', pointerEvents: 'none' }}>
              {phase === 'resuming' && <div className="cond" style={{ fontSize: 20, color: 'var(--text-3)' }}>Retrocediendo 2 s</div>}
              <div key={cd} className="disp cd-pop" style={{ fontSize: 150, lineHeight: '150px', textShadow: '6px 6px 0 #000, 0 0 50px rgba(168,85,247,0.8)' }}>{cd}</div>
            </div>
          )}
          {(phase === 'intro' || phase === 'loading') && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              {phase === 'loading' ? (
                <div className="cond" style={{ fontSize: 22, color: 'var(--text-3)' }}>Cargando video…</div>
              ) : (
                <>
                  <button className="btn btn-p" type="button" onClick={start} style={{ height: 64, padding: '0 40px', fontSize: 24 }}>¡A tocar!</button>
                  <div className="small muted">o presiona Enter · teclas {keysShown.join(' ').toUpperCase()}</div>
                </>
              )}
            </div>
          )}
          {phase === 'paused' && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(7,6,26,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div role="dialog" aria-label="Pausa" className="modal" style={{ width: 380, maxHeight: 540, overflowY: "auto" }}>
                <div className="disp" style={{ fontSize: 44, lineHeight: '44px' }}>Pausa</div>
                <div className="small muted">{chart.title} · {info.name} · {formatTime(hud.t)}</div>
                {tamper && (
                  <div className="small" style={{ padding: '10px 12px', borderRadius: 3, background: 'rgba(30,24,6,0.9)', border: '1px solid rgba(255,210,63,0.5)', color: '#EADFA8' }}>
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
              </div>
            </div>
          )}
          {phase === 'error' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="modal" style={{ width: 460 }}>
                <div className="disp" style={{ fontSize: 32 }}>No se pudo cargar el video</div>
                <div className="muted">{errorMsg}</div>
                <Link className="btn btn-p" href={`/cancion/${chart.id}`}>Volver a la canción</Link>
              </div>
            </div>
          )}
        </div>

        {/* Energía */}
        <div aria-label={`Energía ${Math.round(hud.energy * 100)} %`} style={{ position: 'absolute', left: 1100, top: 470, width: 18, height: 300, borderRadius: 9, background: 'rgba(10,9,22,0.9)', border: `1px solid ${hud.energy >= 0.5 ? 'var(--gold)' : 'var(--border)'}`, overflow: 'hidden', boxShadow: hud.energy >= 0.5 ? '0 0 18px rgba(245,183,0,0.6)' : undefined }}>
          <div className={hud.energy >= 0.5 && !hud.boosting ? 'energy-ready' : undefined} style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: `${hud.energy * 100}%`, background: 'linear-gradient(0deg,#7E22CE,#EC4899 60%,#F5B700)', boxShadow: '0 0 12px rgba(245,183,0,0.8)', transition: 'height .12s' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: '50%', height: 2, background: 'rgba(255,255,255,0.5)' }} />
        </div>
        <div className="cond" style={{ position: 'absolute', left: 1122, top: 640, writingMode: 'vertical-rl', fontSize: 11, letterSpacing: '0.16em', color: hud.energy >= 0.5 ? 'var(--gold)' : 'var(--text-2)' }}>{hud.boosting ? 'LEYENDA' : 'ENERGÍA'}</div>

        {/* Marcador */}
        <section aria-label="Marcador" style={{ position: 'absolute', left: 340, top: 812, width: 760, height: 76, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', background: 'rgba(10,9,22,0.94)', border: '2px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: 3 }}>
          <HudCell label="Puntuación"><span className="disp" style={{ fontSize: 30, fontVariantNumeric: 'tabular-nums' }}>{fmt(hud.score)}</span></HudCell>
          <HudCell label="Racha" row>
            <MultRing combo={hud.combo} mult={hud.mult} boosting={hud.boosting} color={multColor} />
            <span className="disp" style={{ fontSize: 30, minWidth: 48 }}>{hud.combo}</span>
          </HudCell>
          <HudCell label="Precisión"><span className="disp" style={{ fontSize: 30, color: 'var(--ok)' }}>{(hud.acc * 100).toFixed(1).replace('.', ',')}%</span></HudCell>
          <HudCell label="Rango" last>
            <span className="disp" style={{ width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, color: rankCol, border: `3px solid ${rankCol}`, boxShadow: `0 0 16px ${rankCol}66` }}>{hud.rank}</span>
          </HudCell>
        </section>

        {/* Columna derecha */}
        <aside style={{ position: 'absolute', left: 1128, top: 36, width: 280, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Link href="/perfil" className="panel row" style={{ padding: 12, color: 'var(--text)', background: 'rgba(20,18,42,0.88)' }}>
            <span className="avatar" style={{ width: 48, height: 48, borderRadius: 3, background: me.loggedIn ? me.color : 'var(--bg-raised)', color: '#fff', fontSize: 16 }}>{me.initials}</span>
            <span className="col grow" style={{ gap: 4 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{me.name}</span>
              <span className="small muted">{me.loggedIn ? `Nivel ${me.level}` : 'Sin cuenta: el puntaje queda solo aquí'}</span>
            </span>
          </Link>
          <section className="panel col" style={{ padding: 14, gap: 8, background: 'rgba(20,18,42,0.88)' }}>
            <div className="row"><span className="label grow">Ranking en vivo</span><span className="cond" style={{ fontSize: 11, color: 'var(--accent)' }}>● {board ? 'Semana' : 'Ejemplo'}</span></div>
            {live.map((r, i) => (
              <div key={i} className="row" style={{ gap: 8, height: 34, padding: '0 8px', borderRadius: 2, ...(r.me ? { background: 'rgba(168,85,247,0.18)', border: '1px solid var(--accent)' } : { borderBottom: '1px solid var(--bg-hover)' }) }}>
                <span className="mono small muted" style={{ width: 30, fontWeight: 700 }}>#{r.pos}</span>
                <span className="grow" style={{ fontSize: 14, fontWeight: 600 }}>{r.n}</span>
                <span className="mono small" style={{ fontWeight: 700 }}>{fmt(r.score)}</span>
              </div>
            ))}
          </section>
          <section className="panel col" style={{ padding: 14, gap: 10, background: 'rgba(20,18,42,0.88)' }}>
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
      <style>{`
        .judge-pop { transform: translate(-50%, 0) rotate(-3deg); animation: judgeUp .55s ease-out forwards; }
        @keyframes judgeUp { from { opacity: 1; transform: translate(-50%, 0) rotate(-3deg) scale(1.15); } to { opacity: 0; transform: translate(-50%, -30px) rotate(-3deg) scale(1); } }
        .banner-pop { transform: translate(-50%, 0); animation: bannerIn 1.3s cubic-bezier(.2,1.4,.4,1) forwards; }
        @keyframes bannerIn { 0% { opacity: 0; transform: translate(-50%, 10px) scale(.4) rotate(-8deg); } 18% { opacity: 1; transform: translate(-50%, 0) scale(1.08) rotate(-3deg); } 30% { transform: translate(-50%, 0) scale(1) rotate(-3deg); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -24px) scale(1) rotate(-3deg); } }
        .combo-pop { animation: comboPop .35s cubic-bezier(.2,1.6,.4,1); }
        @keyframes comboPop { from { transform: scale(1.35); } to { transform: scale(1); } }
        .cd-pop { animation: cdPop .5s ease-out; }
        @keyframes cdPop { from { transform: scale(1.6); opacity: .2; } to { transform: scale(1); opacity: 1; } }
        .energy-ready { animation: energyPulse .6s ease-in-out infinite alternate; }
        @keyframes energyPulse { from { filter: brightness(1); } to { filter: brightness(1.6); } }
        .mult-fire { animation: fire .18s ease-in-out infinite alternate; transform-origin: 50% 100%; }
        @keyframes fire { from { transform: scaleY(1) } to { transform: scaleY(1.15) } }
      `}</style>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Chart, DifficultyChart, DifficultyId, Note } from '@/lib/chart/types';
import { DIFFICULTIES, LANE_COLORS, formatTime, lastNoteEnd, playEnd } from '@/lib/chart/types';
import { parseChartText } from '@/lib/chart/parseChart';
import { parseMidiBuffer } from '@/lib/chart/parseMidi';
import { fillDifficulties } from '@/lib/chart/reduce';
import { deleteLocalChart, getChart, getLocalCharts, getSettings, saveLocalChart } from '@/lib/data/store';
import { parseVideoTitle, parseYouTubeId } from '@/lib/youtube';
import OffsetControl from '@/components/OffsetControl';
import { loadYouTubeApi } from '@/lib/game/clock';
import { HH, HW, drawHighway } from '@/lib/game/render';
import type { LiveNote } from '@/lib/game/engine';
import { useAuth } from '@/lib/auth/AuthProvider';
import Icon, { Kbd, ToolBtn } from '@/components/Icon';
import { bpmAt, gridBetween, snapToGrid, tempoMap } from '@/lib/chart/tempo';
import { GENRE_OPTIONS } from '@/lib/chart/genres';
import { checkChart, type ChartIssue } from '@/lib/chart/checks';
import { checkVideo, type VideoCheck } from '@/lib/game/ytcheck';
import { deleteChartCloud, fetchCloudChart, upsertChartCloud } from '@/lib/data/cloud';
import { blankChart, isBlankArtist, isBlankTitle, lowerBound, round3, sortNotes } from '@/lib/chart/editing';

/* ------------------------------------------------------------------ */
/* Constantes de la línea de tiempo horizontal                         */
/* ------------------------------------------------------------------ */
const GRIDS = [
  { v: 1, l: '1/4' }, { v: 0.5, l: '1/8' }, { v: 1 / 3, l: '1/12' }, { v: 0.25, l: '1/16' }, { v: 0.125, l: '1/32' }, { v: 0, l: 'Libre' }
];
const LABEL_W = 48;
const RULER_H = 30;
const LANE_H = 44;
const PREVIEW_SCALE = 0.6;
const ZOOM_MIN = 30;
const ZOOM_MAX = 900;
const HISTORY_MAX = 200;

type Drag =
  | { mode: 'move'; x0: number; y0: number; dt: number; dl: number; moved: boolean }
  | { mode: 'len'; x0: number; dlen: number }
  | { mode: 'box'; x0: number; y0: number; x1: number; y1: number; add: boolean }
  | { mode: 'scrub' };

interface Snapshot { difficulties: Chart['difficulties']; durationSec: number }

function Editor() {
  const router = useRouter();
  const q = useSearchParams();
  const [chart, setChartState] = useState<Chart>(blankChart);
  const [diff, setDiff] = useState<DifficultyId>('expert');
  const [grid, setGrid] = useState(3);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [videoInput, setVideoInput] = useState('');
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [record, setRecord] = useState(false);
  const [rate, setRate] = useState(1);
  const [taps, setTaps] = useState<number[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [pxs, setPxs] = useState(180); // px por segundo
  const [viewStart, setViewStart] = useState(-0.5);
  const [tlWidth, setTlWidth] = useState(900);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [shiftMs, setShiftMs] = useState(10);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const [tool, setTool] = useState<'pencil' | 'select'>('pencil');
  const [helpOpen, setHelpOpen] = useState(false);
  const [issues, setIssues] = useState<ChartIssue[] | null>(null);
  const [vcheck, setVcheck] = useState<VideoCheck | 'probando' | null>(null);
  /** Qué campos se rellenaron solos desde el video (para avisarlo y que sepa que puede cambiarlos). */
  const [filled, setFilled] = useState('');

  const playerRef = useRef<YT.Player | null>(null);
  const transport = useRef({ base: 0, startPerf: 0 });
  const clipboard = useRef<Note[]>([]);
  const tlRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const miniRef = useRef<HTMLCanvasElement | null>(null);
  const settings = useMemo(() => getSettings(), []);
  const keys = settings.keys;

  const chartRef = useRef(chart);
  chartRef.current = chart;

  const setChart = useCallback((c: Chart | ((c: Chart) => Chart)) => {
    setChartState(c);
    setDirty(true);
  }, []);

  const { user, profile, loading: authLoading } = useAuth();
  const [published, setPublished] = useState(false);
  const [inCloud, setInCloud] = useState(false);
  const charterName = profile?.username ?? 'invitado';

  /* Cargar chart existente (?id=): local, o de la nube. Los ajenos se copian como chart nuevo. */
  useEffect(() => {
    const id = q.get('id');
    if (!id || authLoading) return;
    let alive = true;
    const apply = (base: Chart, own: boolean, mineInCloud: boolean, pub: boolean) => {
      const copy = own ? base : { ...base, id: 'local-' + Date.now().toString(36), title: base.title + ' (copia)', charter: charterName };
      setChartState({ leadInSec: 3, ...copy });
      setIsSaved(own && (mineInCloud || getLocalCharts().some((x) => x.id === base.id)));
      setInCloud(mineInCloud);
      setPublished(pub);
      if (base.source.kind === 'youtube') setVideoInput(base.source.videoId);
      setPast([]); setFuture([]); setSel(new Set()); setDirty(false);
    };
    const local = getChart(id);
    // Lo local se abre al tiro; la nube solo confirma si es tuyo y si está publicado
    if (local) apply(local, local.id.startsWith('local-'), false, false);
    fetchCloudChart(id).then((row) => {
      if (!alive) return;
      const mine = !!row && !!user && row.owner === user.id;
      if (local) { if (mine) { setInCloud(true); setIsSaved(true); setPublished(row!.published); } return; }
      if (row) apply({ ...row.data, id: row.id }, mine, mine, mine ? row.published : false);
    }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, authLoading, user?.id]);

  const lanesFor = (d: DifficultyId) => DIFFICULTIES.find((x) => x.id === d)!.lanes;
  const dc: DifficultyChart = chart.difficulties[diff] ?? { lanes: lanesFor(diff), notes: [] };
  const notes = dc.notes;
  const beat = 60 / chart.bpm;
  const tmap = useMemo(() => tempoMap(chart.bpm, chart.tempo), [chart.bpm, chart.tempo]);
  const hasTempoChanges = tmap.length > 1;
  // Paso de grilla en segundos según el BPM vigente en el cursor (0 = libre)
  const step = GRIDS[grid].v * (60 / bpmAt(tmap, Math.max(0, t)));
  const videoId = chart.source.kind === 'youtube' ? chart.source.videoId : '';
  const lead = chart.leadInSec ?? 3;
  // Última nota de CUALQUIER dificultad: cortar antes de eso dejaría notas fuera
  const lastAny = useMemo(
    () => Math.max(...DIFFICULTIES.map((d) => lastNoteEnd(chart.difficulties[d.id]?.notes ?? [])), 0),
    [chart.difficulties]
  );
  // Cuánto video queda después de la última nota (créditos, outro, silencio)
  const tail = lastAny > 0 ? chart.durationSec - lastAny : 0;
  const endsAt = playEnd(chart);

  const snap = useCallback((sec: number) => snapToGrid(tmap, sec, GRIDS[grid].v), [tmap, grid]);
  const snapDelta = (d: number) => (step > 0 ? Math.round(d / step) * step : Math.round(d * 1000) / 1000);

  /* ---------- Historial + edición de notas ---------- */
  const commit = useCallback((fn: (items: { n: Note; s: boolean }[]) => { n: Note; s: boolean }[], opts?: { keepSel?: boolean }) => {
    const c = chartRef.current;
    const cur = c.difficulties[diff] ?? { lanes: lanesFor(diff), notes: [] };
    const items = cur.notes.map((n, i) => ({ n, s: sel.has(i) }));
    const out = fn(items)
      .map((x) => ({ ...x, n: { ...x.n, t: round3(Math.max(0, x.n.t)), len: round3(Math.max(0, x.n.len)) } }))
      .sort((a, b) => sortNotes(a.n, b.n));
    // Quitar duplicados exactos (mismo tiempo y carril)
    const dedup: typeof out = [];
    for (const x of out) {
      const prev = dedup[dedup.length - 1];
      if (prev && Math.abs(prev.n.t - x.n.t) < 0.0005 && prev.n.lane === x.n.lane) { prev.s = prev.s || x.s; continue; }
      dedup.push(x);
    }
    const nextNotes = dedup.map((x) => x.n);
    const last = nextNotes[nextNotes.length - 1];
    const dur = Math.max(c.durationSec, Math.ceil((last ? last.t + last.len : 0) + 4));
    setPast((p) => [...p.slice(-HISTORY_MAX + 1), { difficulties: c.difficulties, durationSec: c.durationSec }]);
    setFuture([]);
    setChart({ ...c, durationSec: dur, difficulties: { ...c.difficulties, [diff]: { ...cur, notes: nextNotes, generated: false } } });
    if (!opts?.keepSel) setSel(new Set(dedup.flatMap((x, i) => (x.s ? [i] : []))));
  }, [diff, sel, setChart]);

  const undo = () => {
    if (!past.length) return;
    const c = chartRef.current;
    const prev = past[past.length - 1];
    setFuture((f) => [{ difficulties: c.difficulties, durationSec: c.durationSec }, ...f]);
    setPast((p) => p.slice(0, -1));
    setChart({ ...c, ...prev });
    setSel(new Set());
  };
  const redo = () => {
    if (!future.length) return;
    const c = chartRef.current;
    const next = future[0];
    setPast((p) => [...p, { difficulties: c.difficulties, durationSec: c.durationSec }]);
    setFuture((f) => f.slice(1));
    setChart({ ...c, ...next });
    setSel(new Set());
  };

  const canMoveLanes = (dl: number) => notes.every((n, i) => !sel.has(i) || (n.lane + dl >= 0 && n.lane + dl < dc.lanes));
  const moveSel = (dt: number, dl = 0) => {
    if (!sel.size) return;
    if (dl && !canMoveLanes(dl)) return;
    commit((it) => it.map((x) => (x.s ? { ...x, n: { ...x.n, t: x.n.t + dt, lane: x.n.lane + dl } } : x)));
  };
  const lenSel = (d: number) => sel.size && commit((it) => it.map((x) => (x.s ? { ...x, n: { ...x.n, len: x.n.len + d } } : x)));
  const deleteSel = () => sel.size && commit((it) => it.filter((x) => !x.s).map((x) => ({ ...x, s: false })));
  const hopoSel = () => {
    if (!sel.size) return;
    const allOn = notes.every((n, i) => !sel.has(i) || n.hopo);
    commit((it) => it.map((x) => (x.s ? { ...x, n: { ...x.n, hopo: allOn ? undefined : true } } : x)));
  };
  const laneSel = (lane: number) => sel.size && lane < dc.lanes && commit((it) => it.map((x) => (x.s ? { ...x, n: { ...x.n, lane } } : x)));
  const quantizeSel = () => step > 0 && sel.size && commit((it) => it.map((x) => (x.s ? { ...x, n: { ...x.n, t: snap(x.n.t), len: x.n.len ? Math.max(step, snap(x.n.len)) : 0 } } : x)));
  const selectAll = () => setSel(new Set(notes.map((_, i) => i)));
  const selectFromCursor = () => setSel(new Set(notes.flatMap((n, i) => (n.t >= t - 0.001 ? [i] : []))));
  const copySel = (cut = false) => {
    const list = notes.filter((_, i) => sel.has(i));
    if (!list.length) return;
    const t0 = list[0].t;
    clipboard.current = list.map((n) => ({ ...n, t: n.t - t0 }));
    setMsg(`${list.length} nota(s) ${cut ? 'cortadas' : 'copiadas'}.`);
    if (cut) deleteSel();
  };
  const paste = () => {
    if (!clipboard.current.length) return;
    const at = snap(Math.max(0, t));
    const add = clipboard.current.map((n) => ({ n: { ...n, t: n.t + at, lane: Math.min(n.lane, dc.lanes - 1) }, s: true }));
    commit((it) => [...it.map((x) => ({ ...x, s: false })), ...add]);
  };

  /* ---------- Reproductor / transporte ---------- */
  useEffect(() => {
    if (!videoId) { playerRef.current = null; return; }
    let cancelled = false;
    let el: HTMLDivElement | null = null;
    const make = () => {
      if (cancelled) return;
      const host = document.getElementById('editor-yt');
      if (!host) return;
      el = document.createElement('div');
      host.appendChild(el);
      playerRef.current = new YT.Player(el, { videoId, width: 384, height: 216, playerVars: { rel: 0, playsinline: 1 } });
    };
    loadYouTubeApi().then(make);
    return () => {
      cancelled = true;
      try { playerRef.current?.destroy?.(); } catch { /* ya destruido */ }
      playerRef.current = null;
      el?.remove();
    };
  }, [videoId]);

  const chartTime = useCallback(() => {
    const p = playerRef.current;
    if (typeof p?.getCurrentTime === 'function') return p.getCurrentTime() - chart.offsetMs / 1000;
    const tr = transport.current;
    return playing ? tr.base + ((performance.now() - tr.startPerf) / 1000) * rate : tr.base;
  }, [chart.offsetMs, playing, rate]);

  const visibleSec = Math.max(1, (tlWidth - LABEL_W) / pxs);

  // Bucle: reloj + autoscroll + vista previa del juego
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = chartTime();
      setT(now);
      const p = playerRef.current;
      const isPlaying = typeof p?.getPlayerState === 'function' ? p.getPlayerState() === 1 : playing;
      if (isPlaying) {
        setViewStart((v) => (now > v + visibleSec * 0.75 || now < v ? now - visibleSec * 0.2 : v));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [chartTime, playing, visibleSec]);

  const togglePlay = () => {
    const p = playerRef.current;
    if (typeof p?.getPlayerState === 'function') {
      if (p.getPlayerState() === YT.PlayerState.PLAYING) { p.pauseVideo(); setPlaying(false); }
      else { p.setPlaybackRate(rate); p.playVideo(); setPlaying(true); }
      return;
    }
    transport.current = playing ? { base: chartTime(), startPerf: 0 } : { base: transport.current.base, startPerf: performance.now() };
    setPlaying(!playing);
  };
  const seek = (sec: number) => {
    const v = Math.max(-chart.offsetMs / 1000, sec);
    const p = playerRef.current;
    if (typeof p?.seekTo === 'function') p.seekTo(Math.max(0, v + chart.offsetMs / 1000), true);
    transport.current = { base: v, startPerf: performance.now() };
    setT(v);
  };

  /* ---------- Medidas ---------- */
  useEffect(() => {
    const el = tlRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTlWidth(el.clientWidth));
    ro.observe(el);
    setTlWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const xOfT = (sec: number) => LABEL_W + (sec - viewStart) * pxs;
  const tOfX = (x: number) => viewStart + (x - LABEL_W) / pxs;
  const laneOfY = (y: number) => Math.floor((y - RULER_H) / LANE_H);
  const tlH = RULER_H + dc.lanes * LANE_H;

  const localXY = (e: { clientX: number; clientY: number }) => {
    const r = tlRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /* ---------- Ratón en la línea de tiempo ---------- */
  const onNoteDown = (e: React.PointerEvent, i: number) => {
    e.stopPropagation();
    if (e.button === 2) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const multi = e.ctrlKey || e.metaKey || e.shiftKey;
    if (multi) {
      const next = new Set(sel);
      if (next.has(i)) next.delete(i); else next.add(i);
      setSel(next);
      if (!next.has(i)) return;
    } else if (!sel.has(i)) {
      setSel(new Set([i]));
    }
    const { x, y } = localXY(e);
    setDrag({ mode: 'move', x0: x, y0: y, dt: 0, dl: 0, moved: false });
  };

  const onLenDown = (e: React.PointerEvent, i: number) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (!sel.has(i)) setSel(new Set([i]));
    setDrag({ mode: 'len', x0: localXY(e).x, dlen: 0 });
  };

  const onNoteContext = (e: React.MouseEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    commit((it) => it.filter((_, j) => j !== i).map((x) => ({ ...x, s: false })));
  };

  const onBgDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const { x, y } = localXY(e);
    if (y < RULER_H) { seek(tOfX(x)); setDrag({ mode: 'scrub' }); return; }
    setDrag({ mode: 'box', x0: x, y0: y, x1: x, y1: y, add: e.ctrlKey || e.metaKey || e.shiftKey });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const { x, y } = localXY(e);
    if (drag.mode === 'scrub') { seek(tOfX(x)); return; }
    if (drag.mode === 'box') { setDrag({ ...drag, x1: x, y1: y }); return; }
    if (drag.mode === 'len') { setDrag({ ...drag, dlen: snapDelta((x - drag.x0) / pxs) }); return; }
    const moved = drag.moved || Math.abs(x - drag.x0) > 3 || Math.abs(y - drag.y0) > 3;
    let dl = Math.round((y - drag.y0) / LANE_H);
    if (!canMoveLanes(dl)) dl = drag.dl;
    setDrag({ ...drag, moved, dt: e.altKey ? round3((x - drag.x0) / pxs) : snapDelta((x - drag.x0) / pxs), dl });
  };

  const onUp = () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (d.mode === 'move') {
      if (d.moved && (d.dt || d.dl)) moveSel(d.dt, d.dl);
      return;
    }
    if (d.mode === 'len') { if (d.dlen) lenSel(d.dlen); return; }
    if (d.mode !== 'box') return;
    const small = Math.abs(d.x1 - d.x0) < 4 && Math.abs(d.y1 - d.y0) < 4;
    if (small) {
      // Clic simple en vacío: agrega nota (o solo limpia la selección si había una)
      const lane = laneOfY(d.y0);
      if (lane < 0 || lane >= dc.lanes) return;
      if (tool === 'select' || (sel.size && !d.add && tool !== 'pencil')) { if (!d.add) setSel(new Set()); return; }
      const sec = snap(tOfX(d.x0));
      if (sec < 0) return;
      commit((it) => [...it.map((x) => ({ ...x, s: false })), { n: { t: sec, lane, len: 0 }, s: true }]);
      return;
    }
    const tA = tOfX(Math.min(d.x0, d.x1)), tB = tOfX(Math.max(d.x0, d.x1));
    const lA = Math.floor((Math.min(d.y0, d.y1) - RULER_H) / LANE_H), lB = Math.floor((Math.max(d.y0, d.y1) - RULER_H) / LANE_H);
    const next = new Set(d.add ? sel : []);
    notes.forEach((n, i) => { if (n.t >= tA && n.t <= tB && n.lane >= lA && n.lane <= lB) next.add(i); });
    setSel(next);
  };

  // Rueda: desplaza la vista. Ctrl + rueda: zoom centrado en el mouse.
  useEffect(() => {
    const el = tlRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      if (e.ctrlKey || e.metaKey) {
        setPxs((z) => {
          const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
          setViewStart((v) => { const at = v + (mx - LABEL_W) / z; return at - (mx - LABEL_W) / nz; });
          return nz;
        });
        return;
      }
      const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY);
      setViewStart((v) => v + d / pxsRef.current);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const pxsRef = useRef(pxs);
  pxsRef.current = pxs;

  const zoomBy = (f: number) => {
    const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pxs * f));
    // Mantiene el cursor de reproducción en el mismo lugar de la pantalla
    setViewStart(t - ((t - viewStart) * pxs) / nz);
    setPxs(nz);
  };

  /* ---------- Teclado ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (k === ' ') { e.preventDefault(); togglePlay(); return; }
      if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (mod && k === 'a') { e.preventDefault(); selectAll(); return; }
      if (mod && k === 'c') { e.preventDefault(); copySel(); return; }
      if (mod && k === 'x') { e.preventDefault(); copySel(true); return; }
      if (mod && k === 'v') { e.preventDefault(); paste(); return; }
      if (mod && k === 's') { e.preventDefault(); save(); return; }
      if (k === 'escape') { setSel(new Set()); setHelpOpen(false); return; }
      if (!mod && (k === 'b' || k === 'p')) { setTool('pencil'); return; }
      if (!mod && k === 'v') { setTool('select'); return; }
      if (k === '?' || (e.shiftKey && k === '/')) { setHelpOpen((o) => !o); return; }
      if (!mod && k === 'r' && !keys.slice(0, dc.lanes).includes('r')) { setRecord((x) => !x); return; }
      if (k === 'home') { seek(0); setViewStart(-0.5); return; }
      const laneKey = keys.slice(0, dc.lanes).indexOf(k);
      if (record && laneKey >= 0 && !e.repeat && !mod) { const sec = snap(chartTime()); commit((it) => [...it, { n: { t: sec, lane: laneKey, len: 0 }, s: false }], { keepSel: true }); return; }
      if (!sel.size) return;
      const st = step || 0.01;
      if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSel(); }
      else if (k === 'arrowleft') { e.preventDefault(); moveSel(-(e.altKey ? 0.001 : st) * (e.shiftKey ? 4 : 1)); }
      else if (k === 'arrowright') { e.preventDefault(); moveSel((e.altKey ? 0.001 : st) * (e.shiftKey ? 4 : 1)); }
      else if (k === 'arrowup') { e.preventDefault(); moveSel(0, -1); }
      else if (k === 'arrowdown') { e.preventDefault(); moveSel(0, 1); }
      else if (k === ']') lenSel(st);
      else if (k === '[') lenSel(-st);
      else if (k === 'h') hopoSel();
      else if (k === 'q') quantizeSel();
      else if (/^[1-6]$/.test(k)) laneSel(Number(k) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ---------- Vista previa del juego (canvas) ---------- */
  const liveNotes = useMemo<LiveNote[]>(() => notes.map((n, i) => ({ ...n, idx: i, state: 'pending' })), [notes]);
  useEffect(() => {
    const cv = previewRef.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(HW * PREVIEW_SCALE * dpr)) { cv.width = Math.round(HW * PREVIEW_SCALE * dpr); cv.height = Math.round(HH * PREVIEW_SCALE * dpr); }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr * PREVIEW_SCALE, 0, 0, dpr * PREVIEW_SCALE, 0, 0);
    const pressed = new Array(6).fill(false);
    const flashAt = new Array(6).fill(-99);
    const from = lowerBound(notes, t - 2);
    for (let i = from; i < notes.length && notes[i].t <= t; i++) {
      const n = notes[i];
      liveNotes[i].state = 'hit';
      flashAt[n.lane] = n.t;
      if (t - n.t < 0.08 || n.t + n.len > t) pressed[n.lane] = true;
      liveNotes[i].holding = n.len > 0 && n.t + n.len > t;
    }
    for (let i = lowerBound(notes, t + 0.0001); i < notes.length && notes[i].t < t + 8; i++) { liveNotes[i].state = 'pending'; liveNotes[i].holding = false; }
    const vis = liveNotes.slice(from);
    drawHighway(ctx, { t, notes: vis, lanes: dc.lanes, window: 3.6 / settings.speed, bpm: chart.bpm, tempo: tmap, pressed, flashAt, boosting: false, showNotes: true, theme: settings.theme });
  }, [t, liveNotes, notes, dc.lanes, chart.bpm, settings.speed, settings.theme, tmap]);

  /* ---------- Minimapa ---------- */
  const total = Math.max(chart.durationSec, 10);
  useEffect(() => {
    const cv = miniRef.current;
    if (!cv) return;
    const w = cv.clientWidth, h = 28;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0F0C22';
    ctx.fillRect(0, 0, w, h);
    const lh = (h - 4) / dc.lanes;
    for (const n of notes) {
      ctx.fillStyle = LANE_COLORS[n.lane];
      ctx.fillRect((n.t / total) * w, 2 + n.lane * lh, Math.max(1, (n.len / total) * w), Math.max(1, lh - 1));
    }
  }, [notes, total, dc.lanes, tlWidth]);

  const onMini = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons !== 1 && e.type !== 'pointerdown') return;
    const r = e.currentTarget.getBoundingClientRect();
    const at = ((e.clientX - r.left) / r.width) * total;
    setViewStart(at - visibleSec / 2);
    if (!playing) seek(at);
  };

  /* ---------- Otras acciones ---------- */
  const tap = () => {
    const now = performance.now();
    const list = [...taps.filter((x) => now - x < 3000), now].slice(-8);
    setTaps(list);
    if (list.length >= 4) {
      const gaps = list.slice(1).map((x, i) => x - list[i]);
      const bpm = Math.round((60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)) * 10) / 10;
      setChart((c) => ({ ...c, bpm }));
    }
  };

  const applyVideo = async () => {
    const id = parseYouTubeId(videoInput);
    setChart((c) => ({ ...c, source: id ? { kind: 'youtube', videoId: id } : { kind: 'metronome' } }));
    if (!id) { setVcheck(null); setMsg('Sin video: el editor usa su propio reloj.'); return; }
    setMsg('');
    setVcheck('probando');
    const r = await checkVideo(id);
    setVcheck(r);
    // Si el video dura distinto, ajusta la duración del chart (sin cortar notas ya puestas)
    if (r.ok && r.durationSec) {
      const c = chartRef.current;
      const last = Object.values(c.difficulties).flatMap((d) => d?.notes ?? []).reduce((m, n) => Math.max(m, n.t + n.len), 0);
      if (Math.abs(c.durationSec - r.durationSec) > 2 && r.durationSec > last) setChart((x) => ({ ...x, durationSec: r.durationSec! }));
    }
    // Nombre y artista desde el título del video, SOLO si están vacíos:
    // lo que el charter haya escrito no se pisa nunca.
    if (r.ok && r.title) {
      const guess = parseVideoTitle(r.title, r.author ?? '');
      const c = chartRef.current;
      const patch: Partial<Chart> = {};
      if (isBlankTitle(c.title) && guess.title) patch.title = guess.title;
      if (isBlankArtist(c.artist) && guess.artist) patch.artist = guess.artist;
      if (Object.keys(patch).length) {
        setChart((x) => ({ ...x, ...patch }));
        setFilled([patch.title && 'nombre', patch.artist && 'artista'].filter(Boolean).join(' y '));
      }
    }
  };

  const importFile = async (file: File) => {
    try {
      const parsed = file.name.toLowerCase().endsWith('.mid') || file.name.toLowerCase().endsWith('.midi')
        ? parseMidiBuffer(await file.arrayBuffer())
        : parseChartText(await file.text());
      if (!Object.keys(parsed.difficulties).length) { setMsg('El archivo no trae pistas de guitarra.'); return; }
      const c = chartRef.current;
      setPast((p) => [...p, { difficulties: c.difficulties, durationSec: c.durationSec }]);
      setChart(fillDifficulties({
        ...c,
        title: parsed.title || c.title, artist: parsed.artist || c.artist,
        bpm: Math.round(parsed.bpm * 100) / 100, tempo: parsed.tempo, leadInSec: c.leadInSec ?? 3,
        durationSec: parsed.durationSec, difficulties: parsed.difficulties
      }));
      setDiff('expert');
      setSel(new Set());
      setImportOpen(false);
      setMsg(`Importado: ${Object.keys(parsed.difficulties).length} dificultades. Ajusta el offset para calzar con el video.`);
    } catch (err) {
      setMsg('No se pudo leer el archivo: ' + (err as Error).message);
    }
  };

  const save = async (publish = published, force = false) => {
    // Revisión automática antes de publicar por primera vez
    if (publish && !published && !force) {
      const c = chartRef.current;
      const list = checkChart(c);
      // Probar el video antes de publicar (si el dueño lo bloqueó, no sirve para nadie)
      if (c.source.kind === 'youtube') {
        let v = vcheck && vcheck !== 'probando' ? vcheck : null;
        if (!v) {
          setMsg('Probando el video antes de publicar…');
          v = await checkVideo(c.source.videoId);
          setVcheck(v);
          setMsg('');
        }
        if (!v.ok) list.push({ level: v.code === 101 || v.code === 150 || v.code === 100 || v.code === 5 ? 'error' : 'warn', text: `Video: ${v.message}` });
      }
      if (list.length) { setIssues(list); return; }
    }
    return doSave(publish);
  };
  const doSave = async (publish: boolean) => {
    const c = user && profile?.username ? { ...chartRef.current, charter: profile.username } : chartRef.current;
    if (c !== chartRef.current) setChartState(c);
    saveLocalChart(c);
    setDirty(false); setIsSaved(true);
    if (!user) { setMsg('Chart guardado en este navegador. Entra con tu cuenta para guardarlo en la nube y publicarlo.'); return; }
    setMsg('Guardando en la nube…');
    const r = await upsertChartCloud(c, publish);
    if (r.ok) { setInCloud(true); setPublished(publish); setMsg(publish ? 'Guardado y publicado: ya aparece en Canciones para todos.' : 'Guardado en tu cuenta (privado).'); }
    else setMsg('Se guardó en este navegador, pero no en la nube: ' + r.error);
  };
  const test = () => { save(); router.push(`/jugar/${chart.id}?d=${diff}`); };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(chart, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = chart.title.replace(/\W+/g, '-').toLowerCase() + '.riff.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const removeChart = async () => {
    deleteLocalChart(chart.id);
    if (inCloud) await deleteChartCloud(chart.id);
    router.push('/perfil');
  };

  /* ---------- Render ---------- */
  const tEnd = viewStart + visibleSec;
  const gridLines: { x: number; kind: 'bar' | 'beat' | 'sub'; bar?: number; sec: number }[] = [];
  {
    const beatNow = 60 / bpmAt(tmap, Math.max(0, viewStart));
    const sub = GRIDS[grid].v || 1;
    const showSub = sub * beatNow * pxs >= 7;
    const inc = showSub ? sub : beatNow * pxs >= 7 ? 1 : 4;
    for (const g of gridBetween(tmap, Math.max(0, viewStart), tEnd, inc)) {
      const isBeat = Math.abs(g.index - Math.round(g.index)) < 1e-6;
      gridLines.push({ x: xOfT(g.t), kind: g.strong ? 'bar' : isBeat ? 'beat' : 'sub', bar: g.strong ? Math.round(g.index) / 4 + 1 : undefined, sec: g.t });
    }
  }
  const barLabelEvery = Math.max(1, Math.ceil(70 / (4 * beat * pxs)));

  const i0 = lowerBound(notes, viewStart - 30);
  const visible: number[] = [];
  for (let i = i0; i < notes.length && notes[i].t <= tEnd + 1; i++) {
    const n = notes[i];
    if (n.t + n.len >= viewStart - 1) visible.push(i);
  }

  const selList = notes.filter((_, i) => sel.has(i));
  const selNote = selList.length === 1 ? selList[0] : null;
  const gem = Math.min(26, Math.max(14, LANE_H - 18));
  const box = drag?.mode === 'box' ? drag : null;
  const moving = drag?.mode === 'move' && drag.moved ? drag : null;
  const lenDrag = drag?.mode === 'len' ? drag : null;
  const playX = xOfT(t);

  const timeLabel = `${t < 0 ? '-' : ''}${formatTime(Math.abs(t))}.${String(Math.floor((Math.abs(t) % 1) * 1000)).padStart(3, '0')}`;
  const genDifficulties = () => {
    const c = chartRef.current;
    setPast((p) => [...p, { difficulties: c.difficulties, durationSec: c.durationSec }]);
    setChart(fillDifficulties(c, true));
    setMsg('Dificultades regeneradas desde Experto.');
  };

  return (
    <main className="page col" style={{ gap: 16, paddingTop: 20, maxWidth: 1600 }}>
      {/* ---------- Barra superior: datos y archivo ---------- */}
      <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
        <input className="input" aria-label="Título" placeholder="Nombre de la canción" value={chart.title}
          onChange={(e) => { setFilled(''); setChart({ ...chart, title: e.target.value }); }} style={{ fontWeight: 700, width: 260 }} />
        <input className="input" aria-label="Artista" placeholder="Artista" value={chart.artist}
          onChange={(e) => { setFilled(''); setChart({ ...chart, artist: e.target.value }); }} style={{ width: 200 }} />
        <select className="input" aria-label="Género" value={chart.genre ?? ''} onChange={(e) => setChart({ ...chart, genre: e.target.value || undefined })} style={{ width: 150 }}>
          <option value="">Género…</option>
          {[...GENRE_OPTIONS, ...(chart.genre && !GENRE_OPTIONS.includes(chart.genre) ? [chart.genre] : [])].map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        {dirty ? <span className="small" style={{ color: 'var(--gold)' }}>● Sin guardar</span> : isSaved ? <span className="small" style={{ color: 'var(--ok)' }}>✓ Guardado</span> : null}
        <span className="grow" />
        <div className="toolbar">
          <div className="tgroup">
            <ToolBtn icon="upload" label="Importar .chart / .mid" text="Importar" onClick={() => setImportOpen(true)} />
            <ToolBtn icon="download" label="Descargar como archivo" text="Exportar" onClick={exportJson} />
          </div>
          {user && (
            <div className="tgroup">
              <ToolBtn icon={published ? 'globe' : 'lock'} label={published ? 'Público: aparece en Canciones. Clic para hacerlo privado' : 'Privado: clic para publicarlo para todos'} text={published ? 'Publicado' : 'Privado'} active={published} onClick={() => save(!published)} />
            </div>
          )}
          <div className="tgroup">
            <ToolBtn icon="save" label="Guardar" kbd="Ctrl+S" text="Guardar" onClick={() => save()} />
            <ToolBtn icon="test" label="Probar jugando" text="Probar" onClick={test} />
          </div>
          {isSaved && (confirmDelete ? (
            <span className="row" style={{ gap: 6 }}>
              <span className="small" style={{ color: 'var(--hot-soft)' }}>¿Borrar el chart?</span>
              <button className="btn btn-sm" type="button" style={{ background: 'var(--hot)', color: '#fff' }} onClick={removeChart}>Sí, borrar</button>
              <button className="btn btn-g btn-sm" type="button" onClick={() => setConfirmDelete(false)}>No</button>
            </span>
          ) : <div className="tgroup"><ToolBtn icon="trash" label="Borrar este chart" danger onClick={() => setConfirmDelete(true)} /></div>)}
        </div>
      </div>
      {msg && <div className="small" style={{ color: 'var(--accent-link)' }}>{msg}</div>}

      {/* ---------- Fila de arriba: video · vista del juego · ajustes ---------- */}
      <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
        <section className="panel col" style={{ width: 416, padding: 16, gap: 12 }}>
          <div style={{ width: 384, height: 216, background: '#000', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
            {videoId ? <div id="editor-yt" /> : <div className="col muted small" style={{ height: '100%', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, gap: 10 }}><Icon name="metronome" size={28} />Sin video: se usa el metrónomo. Pega un link de YouTube para sincronizar el chart.</div>}
          </div>
          <div className="row">
            <input className="input grow" placeholder="Link o ID del video de YouTube" value={videoInput} onChange={(e) => { setVideoInput(e.target.value); setVcheck(null); setFilled(''); }} />
            <button className="btn btn-s btn-sm" type="button" onClick={applyVideo}>Cargar y probar</button>
          </div>
          {vcheck && (
            <div className="small row" style={{ gap: 8, color: vcheck === 'probando' ? 'var(--text-2)' : vcheck.ok ? 'var(--ok)' : 'var(--hot-soft)' }}>
              <span>{vcheck === 'probando' ? '⏳' : vcheck.ok ? '✓' : '✕'}</span>
              <span>{vcheck === 'probando' ? 'Probando si se puede reproducir aquí…' : vcheck.message}</span>
            </div>
          )}
          {filled && (
            <div className="small row" style={{ gap: 8, color: 'var(--accent-link)' }}>
              <span>✎</span>
              <span>Puse el {filled} desde el título del video. Corrígelo si no calza.</span>
            </div>
          )}
          <div className="col" style={{ gap: 10, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
            <span className="label" style={{ paddingTop: 8 }}>Sincronización</span>
            <OffsetControl value={chart.offsetMs} onChange={(v) => setChart((c) => ({ ...c, offsetMs: v }))} />
            <div className="row">
              <span className="label" style={{ width: 96 }}>BPM</span>
              <input className="input mono grow" type="number" step="0.1" value={chart.bpm} onChange={(e) => setChart({ ...chart, bpm: Number(e.target.value) || 120 })} />
              <button className="btn btn-p btn-sm" type="button" onClick={tap} title="Toca al ritmo 4 veces o más">Tap</button>
            </div>
            {hasTempoChanges && <span className="small" style={{ color: '#9CD0FF' }}>Esta canción tiene {tmap.length} cambios de tempo: la grilla los sigue sola.</span>}
            <div className="row">
              <label className="label" style={{ width: 96 }} htmlFor="leadin" title="Segundos mínimos que se ven bajar notas antes de la primera. El juego corre antes que la canción solo si hace falta; si la canción ya tiene intro, el video parte de inmediato">Margen inicio</label>
              <input id="leadin" className="input mono grow" type="number" min={0} max={15} step={0.5} value={lead}
                onChange={(e) => setChart((c) => ({ ...c, leadInSec: Math.min(15, Math.max(0, Number(e.target.value) || 0)) }))} />
              <span className="small muted">seg</span>
            </div>
            <div className="row">
              <label className="label" style={{ width: 96 }} htmlFor="endsec" title="Corta la canción antes si el video sigue con créditos u outro">Termina en</label>
              <input id="endsec" className="input mono grow" type="number" min={0} max={Math.ceil(chart.durationSec)} step={1} value={Math.round(chart.endSec ?? 0)}
                onChange={(e) => setChart((c) => ({ ...c, endSec: Math.max(0, Math.min(c.durationSec, Number(e.target.value) || 0)) }))} />
              <span className="small muted" style={{ minWidth: 62 }}>{chart.endSec ? formatTime(chart.endSec) : 'al final'}</span>
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-s btn-sm" type="button" disabled={lastAny <= 0}
                onClick={() => setChart((c) => ({ ...c, endSec: Math.min(c.durationSec, Math.ceil(lastAny + 3)) }))}>
                Cortar 3 s después de la última nota
              </button>
              {!!chart.endSec && <button className="btn btn-g btn-sm" type="button" onClick={() => setChart((c) => ({ ...c, endSec: 0 }))}>Usar todo el video</button>}
            </div>
            {!chart.endSec && tail > 20 && (
              <span className="small" style={{ color: 'var(--gold)' }}>El video sigue {formatTime(tail)} después de la última nota. Córtalo acá para que el jugador no espere los créditos.</span>
            )}
            {!!chart.endSec && endsAt < lastAny - 0.05 && (
              <span className="small" style={{ color: 'var(--hot-soft)' }}>Estás cortando antes de la última nota: quedarían {formatTime(lastAny - endsAt)} de notas fuera del juego.</span>
            )}
          </div>
        </section>

        <section className="panel col" style={{ width: HW * PREVIEW_SCALE + 32, padding: 16, gap: 10, alignItems: 'center' }}>
          <div className="row" style={{ width: '100%' }}>
            <span className="label grow">Vista del juego</span>
            <span className="small muted mono">{notes.filter((n) => n.t >= t && n.t < t + 3.6 / settings.speed).length} notas en pantalla</span>
          </div>
          <div className="col" style={{ flex: 1, justifyContent: 'center' }}>
            <canvas ref={previewRef} style={{ width: HW * PREVIEW_SCALE, height: HH * PREVIEW_SCALE, display: 'block' }} aria-label="Vista previa de la autopista" />
          </div>
        </section>

        <section className="panel panel-pad col" style={{ flex: '1 1 260px', minWidth: 250, gap: 10 }}>
          <h2 style={{ fontSize: 17 }}>Dificultades</h2>
          {DIFFICULTIES.map((d) => {
            const x = chart.difficulties[d.id];
            return (
              <button key={d.id} type="button" onClick={() => { setDiff(d.id); setSel(new Set()); }} className="row small"
                style={{ gap: 10, padding: '8px 10px', borderRadius: 4, cursor: 'pointer', textAlign: 'left', color: 'var(--text)', background: diff === d.id ? `${d.color}1F` : 'transparent', border: `1px solid ${diff === d.id ? d.color : 'transparent'}` }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, opacity: x ? 1 : 0.3 }} />
                <span className="grow" style={{ fontWeight: diff === d.id ? 700 : 500 }}>{d.name}</span>
                <span className="muted">{x ? `${x.generated ? 'auto' : 'a mano'} · ${x.notes.length}` : 'vacía'}</span>
              </button>
            );
          })}
          <button className="btn btn-t btn-sm" type="button" onClick={genDifficulties}>Generar las demás desde Experto</button>
          <button className="btn btn-g btn-sm" type="button" disabled aria-describedby="ia-soon" style={{ border: '1px dashed var(--border-strong)' }}>Borrador con IA · PRO</button>
          <div id="ia-soon" className="small muted" style={{ marginTop: -4, textAlign: 'center' }}>Próximamente: un primer borrador sacado del audio, para que tú lo pulas.</div>
          <Link href="/perfil" className="small" style={{ marginTop: 'auto' }}>Mis charts →</Link>
        </section>
      </div>

      {/* ---------- Línea de tiempo con todas las herramientas pegadas ---------- */}
      <section className="panel col" style={{ gap: 0, overflow: 'visible' }}>
        {/* Barra 1: transporte + herramientas */}
        <div className="toolbar" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <div className="tgroup">
            <ToolBtn icon="toStart" label="Ir al inicio" kbd="Inicio" onClick={() => { seek(0); setViewStart(-0.5); }} />
            <ToolBtn icon={playing ? 'pause' : 'play'} label={playing ? 'Pausar' : 'Reproducir'} kbd="Espacio" active={playing} onClick={togglePlay} />
            <span className="mono" style={{ fontSize: 14, fontWeight: 700, padding: '0 8px', minWidth: 92 }}>{timeLabel}</span>
            <select className="tool" value={rate} onChange={(e) => { const r = Number(e.target.value); setRate(r); playerRef.current?.setPlaybackRate?.(r); }} aria-label="Velocidad" style={{ background: 'transparent', color: 'var(--text-2)', border: 0 }}>
              {[0.5, 0.75, 1].map((r) => <option key={r} value={r}>{r}×</option>)}
            </select>
          </div>
          <div className="tgroup">
            <ToolBtn icon="pencil" label="Lápiz: clic pone notas" kbd="B" active={tool === 'pencil'} onClick={() => setTool('pencil')} />
            <ToolBtn icon="pointer" label="Selección: clic y arrastre solo seleccionan" kbd="V" active={tool === 'select'} onClick={() => setTool('select')} />
            <span className={'tool rec'} role="switch" aria-checked={record} aria-pressed={record} tabIndex={0} data-tip={`Grabar tocando ${keys.slice(0, dc.lanes).join(' ').toUpperCase()} · R`}
              onClick={() => setRecord(!record)} onKeyDown={(e) => { if (e.key === 'Enter') setRecord(!record); }}>
              <Icon name="record" /><span>REC</span>
            </span>
          </div>
          <div className="tgroup">
            <ToolBtn icon="undo" label="Deshacer" kbd="Ctrl+Z" onClick={undo} disabled={!past.length} />
            <ToolBtn icon="redo" label="Rehacer" kbd="Ctrl+Y" onClick={redo} disabled={!future.length} />
          </div>
          <div className="tgroup">
            <ToolBtn icon="cut" label="Cortar" kbd="Ctrl+X" onClick={() => copySel(true)} disabled={!sel.size} />
            <ToolBtn icon="copy" label="Copiar" kbd="Ctrl+C" onClick={() => copySel()} disabled={!sel.size} />
            <ToolBtn icon="paste" label="Pegar en el cursor" kbd="Ctrl+V" onClick={paste} />
            <ToolBtn icon="trash" label="Borrar selección" kbd="Supr" danger onClick={deleteSel} disabled={!sel.size} />
          </div>
          <div className="tgroup">
            <ToolBtn icon="selectAll" label="Seleccionar todo" kbd="Ctrl+A" onClick={selectAll} />
            <ToolBtn icon="fromCursor" label="Seleccionar desde el cursor hasta el final" onClick={selectFromCursor} />
          </div>
          <span className="grow" />
          <div className="tgroup" title="Grilla: a qué subdivisión se pegan las notas">
            <span style={{ padding: '0 4px 0 8px', color: 'var(--text-2)' }}><Icon name="grid" size={16} /></span>
            <select className="tool mono" value={grid} onChange={(e) => setGrid(Number(e.target.value))} aria-label="Grilla" style={{ background: 'transparent', color: 'var(--text)', border: 0 }}>
              {GRIDS.map((g, i) => <option key={g.l} value={i}>{g.l}</option>)}
            </select>
          </div>
          <div className="tgroup">
            <ToolBtn icon="zoomOut" label="Alejar" kbd="Ctrl+rueda" onClick={() => zoomBy(1 / 1.4)} />
            <ToolBtn icon="zoomIn" label="Acercar" kbd="Ctrl+rueda" onClick={() => zoomBy(1.4)} />
          </div>
          <div className="tgroup"><ToolBtn icon="help" label="Atajos del editor" kbd="?" onClick={() => setHelpOpen(true)} /></div>
        </div>

        {chart.difficulties[diff]?.generated && (
          <div className="small" style={{ padding: '8px 16px', background: 'rgba(63,169,255,0.1)', borderBottom: '1px solid rgba(63,169,255,0.35)', color: '#9CD0FF' }}>
            Esta dificultad se generó sola desde Experto. Si la editas, deja de regenerarse.
          </div>
        )}

        <div ref={tlRef} onPointerDown={onBgDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)} onContextMenu={(e) => e.preventDefault()}
          style={{ position: 'relative', height: tlH, background: '#0F0C22', cursor: drag?.mode === 'move' ? 'grabbing' : tool === 'pencil' ? 'crosshair' : 'default', overflow: 'hidden', userSelect: 'none', touchAction: 'none' }}>
          {Array.from({ length: dc.lanes }).map((_, i) => (
            <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: RULER_H + i * LANE_H, height: LANE_H, background: i % 2 ? 'rgba(255,255,255,0.02)' : undefined, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ position: 'absolute', left: LABEL_W, right: 0, top: LANE_H / 2, height: 2, background: `${LANE_COLORS[i]}33` }} />
            </div>
          ))}
          {viewStart < 0 && <div style={{ position: 'absolute', left: LABEL_W, top: RULER_H, bottom: 0, width: Math.max(0, xOfT(0) - LABEL_W), background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0 6px, transparent 6px 12px)' }} />}
          {gridLines.map((l, i) => (
            <div key={i} style={{ position: 'absolute', top: l.kind === 'bar' ? 0 : RULER_H, bottom: 0, left: l.x, width: l.kind === 'bar' ? 2 : 1, background: `rgba(255,255,255,${l.kind === 'bar' ? 0.18 : l.kind === 'beat' ? 0.08 : 0.035})` }} />
          ))}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: RULER_H, background: 'rgba(10,9,22,0.85)', borderBottom: '1px solid var(--border)', cursor: 'ew-resize' }}>
            {gridLines.filter((l) => l.bar !== undefined && (l.bar - 1) % barLabelEvery === 0).map((l) => (
              <span key={l.bar} className="mono" style={{ position: 'absolute', left: l.x + 5, top: 3, fontSize: 11, lineHeight: '12px', color: 'var(--text-2)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                {l.bar}<span style={{ opacity: 0.55, marginLeft: 6 }}>{formatTime(l.sec)}</span>
              </span>
            ))}
          </div>
          {visible.map((i) => {
            const n = notes[i];
            const s = sel.has(i);
            const dt = s && moving ? moving.dt : 0;
            const dl = s && moving ? moving.dl : 0;
            const len = Math.max(0, n.len + (s && lenDrag ? lenDrag.dlen : 0));
            const lane = n.lane + dl;
            const x = xOfT(n.t + dt);
            const cy = RULER_H + lane * LANE_H + LANE_H / 2;
            const col = LANE_COLORS[lane] ?? '#fff';
            return (
              <div key={i}>
                {moving && s && <div style={{ position: 'absolute', left: xOfT(n.t) - gem / 2, top: RULER_H + n.lane * LANE_H + LANE_H / 2 - gem / 2, width: gem, height: gem, borderRadius: '50%', border: `2px dashed ${LANE_COLORS[n.lane]}80`, pointerEvents: 'none' }} />}
                {len > 0 && <div style={{ position: 'absolute', left: x, top: cy - 5, width: len * pxs, height: 10, borderRadius: 5, background: `${col}${s ? 'CC' : '80'}`, boxShadow: s ? `0 0 10px ${col}` : undefined, pointerEvents: 'none' }} />}
                {s && !moving && (
                  <div onPointerDown={(e) => onLenDown(e, i)} title="Arrastra para alargar"
                    style={{ position: 'absolute', left: x + Math.max(len * pxs, gem / 2) - 4, top: cy - 9, width: 10, height: 18, borderRadius: 3, background: '#F2F0FF', cursor: 'ew-resize', opacity: 0.9 }} />
                )}
                <div role="button" aria-label={`Nota carril ${n.lane + 1} en ${n.t.toFixed(2)} s`} aria-pressed={s}
                  onPointerDown={(e) => onNoteDown(e, i)} onContextMenu={(e) => onNoteContext(e, i)}
                  style={{ position: 'absolute', left: x - gem / 2, top: cy - gem / 2, width: gem, height: gem, borderRadius: '50%', cursor: 'grab',
                    background: n.hopo ? '#FFFFFF' : `radial-gradient(circle at 40% 35%, #fff 0 10%, ${col} 45%, ${col}AA 100%)`,
                    border: `2px solid ${s ? '#FFFFFF' : 'rgba(255,255,255,0.55)'}`,
                    boxShadow: (n.hopo ? `inset 0 0 0 ${gem * 0.22}px ${col}` : '') + (s ? `${n.hopo ? ',' : ''}0 0 0 3px #A855F7, 0 0 16px ${col}` : ''),
                    zIndex: s ? 2 : 1 }} />
              </div>
            );
          })}
          <div style={{ position: 'absolute', left: 0, top: RULER_H, width: LABEL_W, bottom: 0, background: '#14122A', borderRight: '1px solid var(--border)', zIndex: 3 }}>
            {Array.from({ length: dc.lanes }).map((_, i) => (
              <div key={i} className="mono" style={{ height: LANE_H, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: LANE_COLORS[i] }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: LANE_COLORS[i] }} />{(keys[i] ?? '').toUpperCase()}
              </div>
            ))}
          </div>
          <div style={{ position: 'absolute', left: 0, top: 0, width: LABEL_W, height: RULER_H, background: '#14122A', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', zIndex: 3 }} />
          {playX >= LABEL_W && playX <= tlWidth && (
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: playX - 1, width: 2, background: 'var(--hot)', boxShadow: '0 0 10px rgba(236,72,153,0.8)', pointerEvents: 'none', zIndex: 4 }}>
              <div style={{ position: 'absolute', top: 0, left: -6, width: 0, height: 0, borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: '10px solid var(--hot)' }} />
            </div>
          )}
          {box && (
            <div style={{ position: 'absolute', left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0), border: '1px solid #C084FC', background: 'rgba(168,85,247,0.15)', pointerEvents: 'none', zIndex: 5 }} />
          )}
        </div>

        {/* Minimapa */}
        <div style={{ position: 'relative', borderTop: '1px solid var(--border)' }}>
          <canvas ref={miniRef} onPointerDown={onMini} onPointerMove={onMini} style={{ width: '100%', height: 28, display: 'block', cursor: 'pointer' }} aria-label="Mapa de la canción" />
          <div style={{ position: 'absolute', top: 0, height: 28, left: `${Math.max(0, (viewStart / total) * 100)}%`, width: `${Math.min(100, (visibleSec / total) * 100)}%`, border: '1px solid #C084FC', background: 'rgba(168,85,247,0.12)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 0, height: 28, left: `${(Math.max(0, t) / total) * 100}%`, width: 2, background: 'var(--hot)', pointerEvents: 'none' }} />
        </div>

        {/* Barra 2 (justo debajo): lo que se puede hacer con la selección */}
        <div className="toolbar" style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', minHeight: 58, background: sel.size ? 'rgba(168,85,247,0.07)' : undefined }}>
          {sel.size > 0 ? (
            <>
              <span className="chip" style={{ color: 'var(--accent-link)', borderColor: 'var(--accent)' }}>
                {sel.size === 1 ? '1 nota' : `${sel.size} notas`}
              </span>
              <span className="small muted mono">
                {selNote ? `${selNote.t.toFixed(3)} s · ${selNote.len ? (selNote.len / beat).toFixed(2) + ' tiempos' : 'corta'}${selNote.hopo ? ' · HOPO' : ''}` : `${selList[0].t.toFixed(2)} → ${selList[selList.length - 1].t.toFixed(2)} s`}
              </span>
              <span className="tsep" />
              <div className="tgroup" title="Carril (teclas 1–6 o ↑/↓)">
                {Array.from({ length: dc.lanes }).map((_, i) => (
                  <button key={i} type="button" onClick={() => laneSel(i)} className="mono" aria-label={`Mover a carril ${i + 1}`}
                    style={{ width: 30, height: 30, borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontSize: 12, border: `2px solid ${LANE_COLORS[i]}`, background: selNote?.lane === i ? LANE_COLORS[i] : 'transparent', color: selNote?.lane === i ? '#0A0916' : LANE_COLORS[i] }}>{i + 1}</button>
                ))}
              </div>
              <div className="tgroup">
                <ToolBtn icon="hopo" label="HOPO (nota ligada)" kbd="H" onClick={hopoSel} active={selList.every((n) => n.hopo)} />
                <ToolBtn icon="shorter" label="Acortar" kbd="[" onClick={() => lenSel(-(step || 0.01))} />
                <ToolBtn icon="longer" label="Alargar" kbd="]" onClick={() => lenSel(step || 0.01)} />
                <ToolBtn icon="magnet" label="Ajustar a la grilla" kbd="Q" onClick={quantizeSel} disabled={!step} />
                <ToolBtn icon="toCursor" label="Llevar al cursor" onClick={() => moveSel(snap(t) - selList[0].t)} />
              </div>
              <div className="tgroup" title="Mover la selección en el tiempo (también ← →; Alt = 1 ms)">
                <button type="button" className="tool" onClick={() => moveSel(-shiftMs / 1000)} aria-label="Adelantar">−</button>
                <input className="input mono" style={{ width: 64, height: 30, textAlign: 'center', padding: 0 }} type="number" value={shiftMs} onChange={(e) => setShiftMs(Math.abs(Number(e.target.value)) || 0)} aria-label="Milisegundos a desplazar" />
                <span className="small muted" style={{ padding: '0 4px' }}>ms</span>
                <button type="button" className="tool" onClick={() => moveSel(shiftMs / 1000)} aria-label="Atrasar">+</button>
              </div>
              <span className="grow" />
              <ToolBtn icon="close" label="Soltar selección" kbd="Esc" text="Soltar" onClick={() => setSel(new Set())} />
            </>
          ) : (
            <div className="row small muted" style={{ gap: 14, flexWrap: 'wrap' }}>
              <span className="row" style={{ gap: 6 }}><Icon name="pencil" size={15} /> {tool === 'pencil' ? 'Clic = nota nueva' : 'Modo selección'}</span>
              <span className="row" style={{ gap: 6 }}>Arrastrar = seleccionar varias</span>
              <span className="row" style={{ gap: 6 }}><Kbd>Ctrl</Kbd>/<Kbd>Shift</Kbd> + clic suma</span>
              <span className="row" style={{ gap: 6 }}>Clic derecho = borrar</span>
              <span className="row" style={{ gap: 6 }}>Rueda = moverse · <Kbd>Ctrl</Kbd> + rueda = zoom</span>
              <button type="button" className="linkish" onClick={() => setHelpOpen(true)}>Ver todos los atajos</button>
            </div>
          )}
        </div>
      </section>

      {issues && (
        <div className="overlay" onClick={() => setIssues(null)}>
          <div role="dialog" aria-label="Revisión antes de publicar" className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="disp" style={{ fontSize: 28 }}>Antes de publicar</h2>
            <ul className="col" style={{ margin: 0, padding: 0, listStyle: 'none', gap: 8 }}>
              {issues.map((x, i) => (
                <li key={i} className="row small" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ color: x.level === 'error' ? 'var(--hot-soft)' : 'var(--gold)', fontWeight: 700 }}>{x.level === 'error' ? '✕' : '!'}</span>{x.text}
                </li>
              ))}
            </ul>
            {issues.some((x) => x.level === 'error')
              ? <span className="small muted">Arregla lo marcado con ✕ para poder publicar. Mientras tanto queda guardado como privado.</span>
              : <span className="small muted">Son solo avisos: puedes publicar igual.</span>}
            <div className="row">
              {!issues.some((x) => x.level === 'error') && <button className="btn btn-p" type="button" onClick={() => { setIssues(null); save(true, true); }}>Publicar igual</button>}
              <button className="btn btn-s" type="button" onClick={() => { setIssues(null); doSave(false); }}>Guardar como privado</button>
              <button className="btn btn-g" type="button" onClick={() => setIssues(null)}>Volver</button>
            </div>
          </div>
        </div>
      )}

      {helpOpen && (
        <div className="overlay" onClick={() => setHelpOpen(false)}>
          <div role="dialog" aria-label="Atajos del editor" className="modal" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div className="row"><h2 className="disp grow" style={{ fontSize: 28 }}>Atajos del editor</h2><ToolBtn icon="close" label="Cerrar" kbd="Esc" onClick={() => setHelpOpen(false)} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
              {[
                { t: 'Reproducir', items: [[<Kbd key="a">Espacio</Kbd>, 'Play / pausa'], [<Kbd key="a">Inicio</Kbd>, 'Volver al inicio'], [<><Kbd>R</Kbd></>, 'Grabar tocando']] },
                { t: 'Herramientas', items: [[<Kbd key="a">B</Kbd>, 'Lápiz (poner notas)'], [<Kbd key="a">V</Kbd>, 'Selección'], [<Kbd key="a">?</Kbd>, 'Esta ayuda']] },
                { t: 'Seleccionar', items: [[<><Kbd>Ctrl</Kbd><Kbd>A</Kbd></>, 'Todo'], [<><Kbd>Ctrl</Kbd>+clic</>, 'Sumar / quitar'], [<Kbd key="a">Esc</Kbd>, 'Soltar']] },
                { t: 'Editar', items: [[<><Kbd>Ctrl</Kbd><Kbd>Z</Kbd></>, 'Deshacer'], [<><Kbd>Ctrl</Kbd><Kbd>Y</Kbd></>, 'Rehacer'], [<><Kbd>Ctrl</Kbd><Kbd>C</Kbd><Kbd>X</Kbd><Kbd>V</Kbd></>, 'Copiar, cortar, pegar'], [<Kbd key="a">Supr</Kbd>, 'Borrar']] },
                { t: 'Mover notas', items: [[<><Kbd>←</Kbd><Kbd>→</Kbd></>, 'Un paso de grilla'], [<><Kbd>Shift</Kbd>+<Kbd>←</Kbd></>, '4 pasos'], [<><Kbd>Alt</Kbd>+<Kbd>←</Kbd></>, '1 ms'], [<><Kbd>↑</Kbd><Kbd>↓</Kbd></>, 'Cambiar carril'], [<Kbd key="a">1–6</Kbd>, 'Carril exacto']] },
                { t: 'Forma de la nota', items: [[<><Kbd>[</Kbd><Kbd>]</Kbd></>, 'Acortar / alargar'], [<Kbd key="a">H</Kbd>, 'HOPO'], [<Kbd key="a">Q</Kbd>, 'Ajustar a la grilla'], [<><Kbd>Ctrl</Kbd><Kbd>S</Kbd></>, 'Guardar']] }
              ].map((g) => (
                <div key={g.t} className="col" style={{ gap: 8 }}>
                  <span className="label">{g.t}</span>
                  {g.items.map(([k, d], i) => (
                    <div key={i} className="row small" style={{ gap: 10, justifyContent: 'space-between' }}><span className="row" style={{ gap: 3 }}>{k}</span><span className="muted">{d}</span></div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="overlay" onClick={() => setImportOpen(false)}>
          <div role="dialog" aria-label="Importar chart" className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="disp" style={{ fontSize: 28 }}>Importar chart</h2>
            <label className="col" style={{ alignItems: 'center', gap: 10, padding: 28, borderRadius: 4, border: '2px dashed var(--border-strong)', background: '#0F0C22', cursor: 'pointer', textAlign: 'center' }}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) importFile(f); }}>
              <Icon name="upload" size={32} />
              <span style={{ fontSize: 16, fontWeight: 600 }}>Arrastra un archivo .chart o .mid</span>
              <span className="btn btn-s btn-sm">o búscalo en tu equipo</span>
              <input type="file" accept=".chart,.mid,.midi" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); }} />
            </label>
            <div className="small muted">Solo importa charts de su autor o con su permiso. Los rips de juegos comerciales no se aceptan.</div>
            <button className="btn btn-g" type="button" onClick={() => setImportOpen(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function EditorPage() {
  return <Suspense fallback={null}><Editor /></Suspense>;
}

import type { LiveNote } from './engine';
import { LANE_COLORS } from '../chart/types';
import type { Fx } from './fx';
import type { TempoPoint } from '../chart/types';
import { bpmAt, gridBetween } from '../chart/tempo';

/** Geometría de escritorio (px CSS del canvas). El editor, la portada y el laboratorio la usan tal cual. */
export const HW = 760;
export const HH = 560;
export const HIT = 488;
const TOP = 10;

/**
 * Geometría de una autopista: ancho y alto del canvas, ancho arriba (fondo) y altura de la línea de golpe.
 * En el teléfono vertical la autopista es más angosta y alta, así que se pasa una a medida.
 */
export interface Geo { w: number; h: number; topW: number; hit: number }
export const DESKTOP_GEO: Geo = { w: HW, h: HH, topW: 330, hit: HIT };

/** Autopista para un canvas de w×h (teléfono): fondo angosto y línea de golpe cerca del borde de abajo. */
export function geoFor(w: number, h: number): Geo {
  const hit = Math.round(h - Math.min(80, Math.max(44, h * 0.13)));
  return { w, h, topW: Math.round(w * 0.4), hit };
}

// Geometría vigente del dibujo: se fija al comienzo de cada drawHighway
let gw = HW, gh = HH, gtop = 330, ghit = HIT, HZ = 0, K = 0;
/** Modo liviano: sin sombras difusas (shadowBlur es lo más caro de dibujar en un teléfono). */
let LOW = false;
/*
 * Perspectiva real: el ancho de la autopista es lineal en y y se anula en el horizonte (HZ).
 * Para un plano visto por una cámara, la distancia en pantalla al horizonte es proporcional a 1/profundidad,
 * así que y(p) = HZ + (HIT − HZ) / (1 + K·p). Con esto el espaciado de las notas calza con su tamaño.
 */
function useGeo(g: Geo) {
  gw = g.w; gh = g.h; gtop = g.topW; ghit = g.hit;
  HZ = -(gtop * gh) / (gw - gtop);
  K = (ghit - HZ) / (TOP - HZ) - 1;
}
useGeo(DESKTOP_GEO);

const W = (y: number) => gtop + (gw - gtop) * (y / gh);
const xOf = (y: number, lane: number, n: number) => { const w = W(y); return (gw - w) / 2 + (w * (lane + 0.5)) / n; };
/** p = 0 en la línea de golpe, 1 arriba del todo. */
const yOf = (p: number) => HZ + (ghit - HZ) / (1 + K * Math.max(p, -0.9 / K));

/** Posición x del receptor de un carril (para ubicar efectos). */
export function laneX(lane: number, n: number, g: Geo = DESKTOP_GEO) {
  const w = g.topW + (g.w - g.topW) * (g.hit / g.h);
  return (g.w - w) / 2 + (w * (lane + 0.5)) / n;
}

/** Primera nota que todavía puede verse (las notas vienen ordenadas por tiempo). */
function firstVisible(notes: LiveNote[], t: number) {
  let lo = 0, hi = notes.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (notes[m].t < t) lo = m + 1; else hi = m; }
  return lo;
}

function shade(hex: string, f: number) {
  const v = parseInt(hex.slice(1), 16);
  const c = [v >> 16, (v >> 8) & 255, v & 255].map((x) => Math.round(f < 1 ? x * f : x + (255 - x) * (f - 1)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function rgba(hex: string, a: number) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
}

export interface RenderState {
  t: number;
  notes: LiveNote[];
  lanes: number;
  /** Segundos visibles en la autopista. */
  window: number;
  bpm: number;
  pressed: boolean[];
  /** Último acierto por carril (tiempo de chart) para el destello. */
  flashAt: number[];
  boosting: boolean;
  showNotes: boolean;
  theme: string;
  /** Multiplicador actual (1–4, ×2 con energía): cambia el color de los bordes. */
  mult?: number;
  fx?: Fx;
  /** Mapa de tempo normalizado (si la canción cambia de BPM). */
  tempo?: TempoPoint[];
  /** Geometría a medida (teléfono). Sin esto, la de escritorio. */
  geo?: Geo;
  /** Efectos livianos: sin sombras difusas ni luces en los bordes. */
  low?: boolean;
}

const MULT_EDGE: Record<number, string> = { 1: '', 2: '#3FA9FF', 3: '#3DDC84', 4: '#FF4D6D' };

/**
 * Estilos de autopista. Se eligen en Ajustes y solo cambian el juego, nunca la web.
 *
 * El de la casa ("Afiche") es tinta y papel: el color queda reservado para lo que
 * de verdad informa, que es el carril de cada nota y el estado del juego. "Neón"
 * es el estilo anterior del juego, con halos y notas con brillo, para quien lo
 * prefiera.
 */
export interface HwTheme {
  id: string;
  name: string;
  desc: string;
  /** Fondo de la autopista, arriba y abajo. */
  top: string;
  bottom: string;
  /** Bordes laterales. */
  edge: string;
  /** Cuerda de carril en reposo. */
  line: string;
  /** Traste fuerte (compás) y suave (tiempo). */
  fret: [string, string];
  /** Halos difusos. Cuestan cuadros, así que solo donde el estilo los pide. */
  glow: boolean;
  /** Cómo se dibuja la nota: tinta plana o perla con brillo. */
  gem: 'print' | 'neon';
  /** 'wood' convierte la autopista en un mástil: veta, trastes y puntos. */
  board?: 'plain' | 'wood';
}

export const HIGHWAY_THEMES: HwTheme[] = [
  {
    id: 'estadio', name: 'Escenario', desc: 'Autopista oscura y limpia, notas con brillo. El de la casa.',
    top: '#060607', bottom: '#15151a', edge: '#e9e6de', line: 'rgba(233,230,222,0.10)',
    fret: ['rgba(233,230,222,0.40)', 'rgba(233,230,222,0.11)'], glow: false, gem: 'neon'
  },
  {
    id: 'neon', name: 'Neón', desc: 'El estilo anterior del juego: morado, halos y notas con brillo.',
    top: '#050414', bottom: '#1c1238', edge: '#a855f7', line: 'lane',
    fret: ['rgba(210,200,255,0.42)', 'rgba(200,190,255,0.13)'], glow: true, gem: 'neon'
  },
  {
    id: 'contraste', name: 'Contraste', desc: 'Negro puro, blanco y notas de tinta plana. Lo más legible a toda velocidad.',
    top: '#000000', bottom: '#000000', edge: '#ffffff', line: 'rgba(255,255,255,0.18)',
    fret: ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.16)'], glow: false, gem: 'print'
  },
  {
    id: 'mastil', name: 'Mástil', desc: 'La autopista es el diapasón: madera con veta, trastes de metal, puntos de posición y una cuerda por carril.',
    top: '#120b06', bottom: '#4a2e18', edge: '#c9a36b', line: 'lane',
    fret: ['#d8cdb8', 'rgba(216,205,184,0.22)'], glow: true, gem: 'neon', board: 'wood'
  },
  {
    id: 'madera', name: 'Tablas', desc: 'Tablas de escenario, cálido y con notas de tinta plana.',
    top: '#080604', bottom: '#241a12', edge: '#e0c9a8', line: 'rgba(224,201,168,0.12)',
    fret: ['rgba(224,201,168,0.38)', 'rgba(224,201,168,0.11)'], glow: false, gem: 'print'
  },
  {
    id: 'hielo', name: 'Hielo', desc: 'Azul frío, con un poco de brillo.',
    top: '#04070a', bottom: '#0f1a24', edge: '#7ec8ff', line: 'rgba(126,200,255,0.14)',
    fret: ['rgba(126,200,255,0.40)', 'rgba(126,200,255,0.12)'], glow: true, gem: 'neon'
  }
];

const THEMES: Record<string, HwTheme> = Object.fromEntries(HIGHWAY_THEMES.map((t) => [t.id, t]));

/*
 * Crear un degradado cuesta, y en un juego eso se paga sesenta veces por
 * segundo. El fondo y la neblina solo cambian si cambia la geometría, el
 * estilo o el modo Leyenda, así que se guardan hasta que eso pase.
 */
let bgCache: { k: string; g: CanvasGradient } | null = null;
let fogCache: { k: string; g: CanvasGradient } | null = null;

export function drawHighway(ctx: CanvasRenderingContext2D, s: RenderState) {
  useGeo(s.geo ?? DESKTOP_GEO);
  LOW = !!s.low;
  const n = s.lanes;
  const th = THEMES[s.theme] ?? THEMES.estadio;
  const baseMult = s.boosting ? Math.max(1, Math.round((s.mult ?? 2) / 2)) : (s.mult ?? 1);
  const edge = s.boosting ? '#F5B700' : MULT_EDGE[Math.min(4, baseMult)] || th.edge;
  const map = s.tempo ?? [{ t: 0, bpm: s.bpm }];
  const beat = 60 / bpmAt(map, Math.max(0, s.t));
  const grid = gridBetween(map, s.t - 0.2, s.t + s.window, 0.5);
  const cur = grid.filter((g) => g.index % 1 === 0 && g.t <= s.t).pop();
  const phase = s.t >= 0 ? (cur ? (s.t - cur.t) / beat : 1) : 1;
  const pulse = Math.max(0, 1 - phase * 3.5); // destello al inicio de cada tiempo
  const fx = s.fx;
  fx?.step();

  ctx.clearRect(0, 0, gw, gh);
  ctx.save();
  if (fx && fx.shake > 0) ctx.translate((Math.random() - 0.5) * fx.shake * 8, (Math.random() - 0.5) * fx.shake * 5);

  // ---------- Fondo de la autopista ----------
  ctx.save();
  ctx.beginPath();
  ctx.moveTo((gw - gtop) / 2, 0);
  ctx.lineTo((gw + gtop) / 2, 0);
  ctx.lineTo(gw, gh);
  ctx.lineTo(0, gh);
  ctx.closePath();
  const bgK = `${gh}|${th.id}|${s.boosting ? 1 : 0}`;
  if (!bgCache || bgCache.k !== bgK) {
    const g = ctx.createLinearGradient(0, 0, 0, gh);
    g.addColorStop(0, th.top);
    g.addColorStop(1, s.boosting ? '#3A2A08' : th.bottom);
    bgCache = { k: bgK, g };
  }
  ctx.fillStyle = bgCache.g;
  ctx.fill();
  ctx.clip();

  // Franjas por carril (más claras si el carril está apretado)
  for (let i = 0; i < n; i++) {
    const xt0 = (gw - gtop) / 2 + (gtop * i) / n, xt1 = (gw - gtop) / 2 + (gtop * (i + 1)) / n;
    const xb0 = (gw * i) / n, xb1 = (gw * (i + 1)) / n;
    const col = LANE_COLORS[i];
    ctx.beginPath();
    ctx.moveTo(xt0, 0); ctx.lineTo(xt1, 0); ctx.lineTo(xb1, gh); ctx.lineTo(xb0, gh); ctx.closePath();
    if (s.pressed[i]) {
      if (LOW) ctx.fillStyle = rgba(col, 0.16);
      else {
        const g = ctx.createLinearGradient(0, ghit, 0, ghit - 360);
        g.addColorStop(0, rgba(col, 0.32));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
      }
    } else if (th.board === 'wood') ctx.fillStyle = i % 2 ? 'rgba(255,225,185,0.03)' : 'rgba(0,0,0,0.12)';
    else ctx.fillStyle = i % 2 ? 'rgba(233,230,222,0.022)' : 'rgba(0,0,0,0.14)';
    ctx.fill();
  }

  // Veta de la madera: hebras que corren a lo largo del mástil
  if (th.board === 'wood') {
    ctx.save();
    // El diapasón es curvo: los bordes caen en sombra y el centro recibe luz
    const curva = ctx.createLinearGradient(0, 0, gw, 0);
    curva.addColorStop(0, 'rgba(0,0,0,0.55)');
    curva.addColorStop(0.5, 'rgba(255,220,170,0.07)');
    curva.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = curva;
    ctx.fillRect(0, 0, gw, gh);
    for (let k = 0; k < 26; k++) {
      const f = (k + 0.5) / 26;
      const xt = (gw - gtop) / 2 + gtop * f;
      const xb = gw * f;
      ctx.strokeStyle = k % 3 === 0 ? 'rgba(20,10,4,0.5)' : 'rgba(255,225,185,0.045)';
      ctx.lineWidth = k % 3 === 0 ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(xt + Math.sin(k * 2.3) * 5, 0);
      ctx.lineTo(xb + Math.sin(k * 1.7) * 14, gh);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Trastes (líneas de compás) que avanzan con la música
  for (const g of grid) {
    if (g.index % 1 !== 0 || g.t < s.t) continue;
    const y = yOf((g.t - s.t) / s.window);
    const w = W(y);
    const strong = g.strong;
    if (th.board === 'wood') {
      /*
       * En un mástil los trastes son frecuentes, así que cada tiempo es un
       * traste de alambre: filo claro arriba y sombra abajo. El compás lleva
       * uno más grueso, que es el que marca el ritmo.
       */
      const cerca = y / gh;
      const h = Math.max(2, (strong ? 2.6 : 1.6) + cerca * (strong ? 6 : 3.4));
      const x0 = (gw - w) / 2;
      // Sombra bajo el alambre: es lo que lo despega de la madera
      ctx.fillStyle = 'rgba(10,5,2,0.85)';
      ctx.fillRect(x0, y + h * 0.3, w, Math.max(1.5, h * 0.9));
      // Alambre: filo blanco arriba, cuerpo níquel, canto oscuro
      ctx.fillStyle = strong ? '#fffdf7' : 'rgba(252,248,238,0.92)';
      ctx.fillRect(x0, y - h / 2, w, Math.max(1, h * 0.42));
      ctx.fillStyle = strong ? 'rgba(176,166,146,0.95)' : 'rgba(176,166,146,0.7)';
      ctx.fillRect(x0, y - h / 2 + h * 0.42, w, h * 0.58);
      // Puntos de posición: al centro cada dos compases
      if (strong) {
        const r = Math.max(4, cerca * 17);
        ctx.fillStyle = 'rgba(246,241,229,0.8)';
        ctx.beginPath(); ctx.ellipse(gw / 2, y - r * 2.1, r, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(10,5,2,0.28)';
        ctx.beginPath(); ctx.ellipse(gw / 2, y - r * 2.1 + r * 0.14, r * 0.92, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      }
      continue;
    }
    ctx.fillStyle = strong ? th.fret[0] : th.fret[1];
    ctx.fillRect((gw - w) / 2, y - (strong ? 1.5 : 0.5), w, strong ? 3 : 1);
  }

  // Cuerdas por carril
  for (let i = 0; i < n; i++) {
    // En reposo, filetes del estilo. Cinco líneas de colores subiendo era un
    // arcoíris compitiendo con las notas, que es lo único que hay que leer;
    // el estilo Neón las mantiene porque así era antes.
    const cuerda = th.board === 'wood';
    ctx.strokeStyle = s.pressed[i] ? rgba(LANE_COLORS[i], 1)
      : th.line === 'lane' ? rgba(LANE_COLORS[i], cuerda ? 0.8 : 0.4) : th.line;
    ctx.lineWidth = s.pressed[i] ? 3.5 : th.line === 'lane' ? (cuerda ? 2.5 : 1.5) : 1;
    if (cuerda && !LOW) { ctx.shadowColor = LANE_COLORS[i]; ctx.shadowBlur = s.pressed[i] ? 14 : 7; }
    else ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo((gw - gtop) / 2 + (gtop * (i + 0.5)) / n, 0);
    ctx.lineTo((gw * (i + 0.5)) / n, gh);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // Neblina arriba: da profundidad y esconde la aparición de las notas
  const fogK = `${gh}|${th.id}`;
  if (!fogCache || fogCache.k !== fogK) {
    const g = ctx.createLinearGradient(0, 0, 0, gh * 0.32);
    g.addColorStop(0, rgba(th.top, 0.97));
    g.addColorStop(1, rgba(th.top, 0));
    fogCache = { k: fogK, g };
  }
  ctx.fillStyle = fogCache.g;
  ctx.fillRect(0, 0, gw, gh * 0.32);
  ctx.restore();

  // ---------- Bordes con neón (laten con el ritmo) ----------
  ctx.save();
  // En el estilo de la casa un halo difuso en reposo es decoración y cuesta
  // cuadros, así que solo aparece en modo Leyenda. Los estilos con brillo lo
  // llevan siempre, que es justamente lo que los hace distintos.
  ctx.shadowColor = edge;
  ctx.shadowBlur = LOW || !(th.glow || s.boosting) ? 0 : 14 + pulse * 20 + (baseMult >= 4 ? 8 : 0);
  ctx.globalAlpha = th.glow ? 1 : 0.55 + pulse * 0.45;
  ctx.strokeStyle = edge;
  ctx.lineWidth = (th.glow ? 4 : 3) + pulse * 2;
  ctx.beginPath();
  ctx.moveTo((gw - gtop) / 2, 0); ctx.lineTo(0, gh);
  ctx.moveTo((gw + gtop) / 2, 0); ctx.lineTo(gw, gh);
  ctx.stroke();
  ctx.restore();

  // Luces que corren por los bordes (cada medio tiempo). En modo liviano no van.
  if (!LOW) {
  ctx.save();
  ctx.fillStyle = edge;
  ctx.shadowColor = edge;
  ctx.shadowBlur = LOW ? 0 : 10;
  for (const g of grid) {
    if (g.t < s.t) continue;
    const k = Math.round(g.index * 2);
    const y = yOf((g.t - s.t) / s.window);
    if (y < gh * 0.2) continue;
    const w = W(y);
    const r = 1.5 + (y / gh) * 3.5;
    ctx.globalAlpha = Math.min(1, (y / gh) * 1.4) * (k % 2 ? 0.3 : 0.62);
    ctx.beginPath(); ctx.arc((gw - w) / 2 + 3, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc((gw + w) / 2 - 3, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  }

  // ---------- Línea de golpe ----------
  {
    const w = W(ghit);
    const x0 = (gw - w) / 2;
    ctx.save();
    // Barra maciza: el filete grueso que separa las cosas en un afiche.
    ctx.fillStyle = s.boosting ? '#ffc53d' : th.edge;
    ctx.globalAlpha = 0.72 + pulse * 0.28;
    ctx.shadowColor = s.boosting ? '#ffc53d' : edge;
    ctx.shadowBlur = LOW || !(th.glow || s.boosting) ? 0 : 12 + pulse * 14;
    ctx.fillRect(x0, ghit - 3, w, 6);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---------- Notas largas y notas ----------
  if (s.showNotes) {
    const visible: LiveNote[] = [];
    // Se parte cerca del presente (no desde la primera nota de la canción en cada cuadro)
    for (let i = firstVisible(s.notes, s.t - 12); i < s.notes.length; i++) {
      const nt = s.notes[i];
      if (nt.t - s.t > s.window) break;
      const dt = nt.t - s.t;
      if (nt.len > 0 && nt.state !== 'miss' && dt + nt.len >= 0) {
        const d1 = Math.max(dt, 0);
        const d2 = Math.min(dt + nt.len, s.window);
        if (d1 <= s.window && (nt.state === 'pending' || nt.holding)) drawSustain(ctx, nt, s, n, d1, d2);
      }
      if (nt.state === 'hit') continue;
      if (dt < -0.35) continue;
      visible.push(nt);
    }
    drawLinks(ctx, visible, s, n);
    for (let i = visible.length - 1; i >= 0; i--) drawGem(ctx, visible[i], s, n);
  }

  // ---------- Receptores ----------
  const lwHit = W(ghit) / n;
  const size = Math.min(104, lwHit * 0.8);
  const sh = size * 0.5;
  const nowSec = performance.now() / 1000;
  for (let i = 0; i < n; i++) {
    const x = xOf(ghit, i, n);
    const col = LANE_COLORS[i];
    const on = s.pressed[i];
    const flash = s.t - s.flashAt[i];
    const missK = fx ? Math.max(0, 1 - (nowSec - fx.missAt[i]) / 0.25) : 0;
    const y = ghit + (on ? 3 : 0);
    ctx.save();
    // Sombra plana debajo: el receptor está apoyado, no flotando en una nube.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.ellipse(x, ghit + sh * 0.26, size / 2, sh / 2, 0, 0, Math.PI * 2); ctx.fill();
    if (th.gem === 'neon') {
      const rg = ctx.createRadialGradient(x, y - sh * 0.15, 2, x, y, size / 2);
      if (on) { rg.addColorStop(0, '#FFFFFF'); rg.addColorStop(0.35, shade(col, 1.4)); rg.addColorStop(1, col); }
      else { rg.addColorStop(0, '#2A2448'); rg.addColorStop(1, '#0A0916'); }
      ctx.fillStyle = rg;
      ctx.shadowColor = missK > 0 ? '#FF2D4D' : col;
      ctx.shadowBlur = LOW ? 0 : on ? 34 : 10 + missK * 20;
      ctx.beginPath(); ctx.ellipse(x, y, size / 2, sh / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = on ? 0.9 : 0.35;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.ellipse(x - size * 0.12, y - sh * 0.22, size * 0.16, sh * 0.1, -0.2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      // Apagado: hueco de tinta. Apretado: tinta plana del color del carril.
      ctx.fillStyle = on ? col : '#0e0e10';
      ctx.shadowColor = missK > 0 ? '#ff5a5a' : col;
      ctx.shadowBlur = LOW ? 0 : on ? 22 : missK * 22;
      ctx.beginPath(); ctx.ellipse(x, y, size / 2, sh / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.lineWidth = size * 0.1;
    ctx.strokeStyle = missK > 0 ? '#ff5a5a' : on && th.gem !== 'neon' ? '#e9e6de' : col;
    ctx.globalAlpha = on || missK > 0 ? 1 : 0.8;
    ctx.beginPath(); ctx.ellipse(x, y, size / 2 - size * 0.05, sh / 2 - size * 0.05, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    if (flash >= 0 && flash < 0.18) {
      const k = 1 - flash / 0.18;
      const fg = ctx.createRadialGradient(x, ghit - size * 0.2, 2, x, ghit - size * 0.45, size * 0.7);
      fg.addColorStop(0, `rgba(255,255,255,${0.95 * k})`);
      fg.addColorStop(0.3, `rgba(233,230,222,${0.72 * k})`);
      fg.addColorStop(0.65, rgba(col, 0.45 * k));
      fg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.ellipse(x, ghit - size * 0.4, size * 0.42, size * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  fx?.draw(ctx);
  ctx.restore();
}

/**
 * Líneas que unen las frases encadenadas: ligados, pull-offs y barridos.
 * Es la señal visual de "esto va sin soltar", antes de que la nota llegue.
 */
function drawLinks(ctx: CanvasRenderingContext2D, visible: LiveNote[], s: RenderState, n: number) {
  ctx.save();
  ctx.lineCap = 'round';
  for (const nt of visible) {
    const tech = nt.tech;
    if (tech !== 'hopo' && tech !== 'pull' && tech !== 'sweep') continue;
    const prev = s.notes[nt.idx - 1];
    if (!prev || nt.t - prev.t > 1.2) continue;
    // El barrido solo se une con el barrido de al lado: dos carreras separadas
    // no se dibujan enganchadas.
    if (tech === 'sweep' && (prev.tech !== 'sweep' || nt.t - prev.t > 0.45)) continue;
    const d1 = (nt.t - s.t) / s.window;
    const d0 = (prev.t + prev.len - s.t) / s.window;
    if (d1 > 1.05 || d0 < -0.2) continue;
    const y1 = yOf(Math.min(d1, 1.05));
    const y0 = yOf(Math.max(d0, -0.05));
    const x1 = xOf(y1, nt.lane, n);
    const x0 = xOf(y0, prev.lane, n);
    const col = tech === 'sweep' ? '#F5B700' : LANE_COLORS[nt.lane];
    ctx.strokeStyle = rgba(col, tech === 'sweep' ? 0.75 : 0.5);
    ctx.lineWidth = tech === 'sweep' ? Math.max(2, (W(y1) / n) * 0.16) : Math.max(1.5, (W(y1) / n) * 0.07);
    ctx.shadowColor = col;
    ctx.shadowBlur = LOW ? 0 : tech === 'sweep' ? 12 : 0;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSustain(ctx: CanvasRenderingContext2D, nt: LiveNote, s: RenderState, n: number, d1: number, d2: number) {
  const col = s.boosting ? '#FFE27A' : LANE_COLORS[nt.lane];
  const steps = LOW ? 8 : 18;
  const pts: [number, number, number][] = [];
  for (let k = 0; k <= steps; k++) {
    const d = d1 + ((d2 - d1) * k) / steps;
    const y = yOf(d / s.window);
    const lw = W(y) / n;
    const w = lw * (nt.holding ? 0.17 : 0.13);
    const wob = nt.holding ? Math.sin(y * 0.09 - s.t * 28) * lw * 0.035 : 0;
    pts.push([xOf(y, nt.lane, n) + wob, y, w]);
  }
  ctx.save();
  ctx.shadowColor = col;
  ctx.shadowBlur = LOW ? 0 : nt.holding ? 22 : 8;
  ctx.fillStyle = rgba(col, nt.holding ? 1 : 0.75);
  ctx.beginPath();
  pts.forEach(([x, y, w], k) => (k ? ctx.lineTo(x - w / 2, y) : ctx.moveTo(x - w / 2, y)));
  for (let k = pts.length - 1; k >= 0; k--) ctx.lineTo(pts[k][0] + pts[k][2] / 2, pts[k][1]);
  ctx.closePath();
  ctx.fill();
  if (nt.holding) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    pts.forEach(([x, y, w], k) => (k ? ctx.lineTo(x - w / 6, y) : ctx.moveTo(x - w / 6, y)));
    for (let k = pts.length - 1; k >= 0; k--) ctx.lineTo(pts[k][0] + pts[k][2] / 6, pts[k][1]);
    ctx.closePath();
    ctx.fill();
    s.fx?.sustain(xOf(ghit, nt.lane, n), ghit - 6, LANE_COLORS[nt.lane]);
  }
  ctx.restore();
}

function drawGem(ctx: CanvasRenderingContext2D, nt: LiveNote, s: RenderState, n: number) {
  const dt = nt.t - s.t;
  const p = dt / s.window;
  const y = yOf(p);
  const x = xOf(y, nt.lane, n);
  const lw = W(y) / n;
  const tech = nt.tech;
  // El palm mute se achata (chug); el armónico y el ligado se afinan
  const w = lw * (tech === 'mute' ? 0.5 : tech === 'harm' ? 0.56 : tech === 'hopo' || tech === 'pull' ? 0.52 : 0.64);
  const h = w * (tech === 'mute' ? 0.3 : 0.4);
  const base = s.boosting ? '#FFE27A' : LANE_COLORS[nt.lane];
  const col = tech === 'harm' ? '#FFD23F' : tech === 'mute' ? shade(base, 0.62) : base;
  const alpha = nt.state === 'miss' ? 0.3 : Math.min(1, 0.2 + (1 - p) * 1.3);

  if (tech === 'harm') {
    // Acorde: la estrella ocupa TODOS los carriles que hay que apretar juntos
    const lanes = nt.chord?.length ? [nt.lane, ...nt.chord] : [nt.lane];
    if (lanes.length > 1) {
      const xs = lanes.map((l) => xOf(y, l, n));
      ctx.save();
      ctx.globalAlpha = alpha * 0.8;
      ctx.strokeStyle = '#FFD23F';
      ctx.lineWidth = Math.max(2, h * 0.5);
      ctx.lineCap = 'round';
      ctx.shadowColor = '#FFD23F';
      ctx.shadowBlur = LOW ? 0 : 16;
      ctx.beginPath();
      ctx.moveTo(Math.min(...xs), y);
      ctx.lineTo(Math.max(...xs), y);
      ctx.stroke();
      ctx.restore();
    }
    for (const l of lanes) drawHarmonic(ctx, xOf(y, l, n), y, w, alpha);
    return;
  }
  if (tech === 'pull') {
    drawPullOff(ctx, x, y, w, h, base, alpha);
    return;
  }
  const thg = THEMES[s.theme] ?? THEMES.estadio;
  if (thg.gem === 'neon') {
    // Perla con brillo: el estilo anterior del juego, tal cual era.
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = shade(col, 0.4);
    ctx.beginPath(); ctx.ellipse(x, y + h * 0.3, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
    const rg = ctx.createRadialGradient(x, y - h * 0.2, 1, x, y, w / 2);
    rg.addColorStop(0, shade(col, 1.55));
    rg.addColorStop(0.55, col);
    rg.addColorStop(1, shade(col, 0.5));
    ctx.fillStyle = rg;
    ctx.shadowColor = col;
    ctx.shadowBlur = LOW ? 0 : 12;
    ctx.beginPath(); ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1.5, h * 0.08);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
    if (nt.hopo || tech === 'hopo') {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.ellipse(x, y, w * 0.2, h * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    } else if (tech === 'mute') {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(x - w * 0.22, y - h * 0.06, w * 0.44, Math.max(1, h * 0.09));
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.ellipse(x, y - h * 0.18, w * 0.26, h * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  /*
   * Nota impresa: tinta plana del carril con un contorno de papel, no una
   * perla con degradado radial y halo. Se lee igual de rápido a toda
   * velocidad, pesa menos por cuadro y es del mismo mundo que la web.
   */
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath(); ctx.ellipse(x, y + h * 0.34, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = LOW ? 0 : 8;
  ctx.beginPath(); ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1.5, h * 0.1);
  ctx.strokeStyle = '#0b0b0c';
  ctx.stroke();
  // Borde de papel arriba: da el volumen sin usar un degradado.
  ctx.globalAlpha = alpha * 0.85;
  ctx.lineWidth = Math.max(1, h * 0.07);
  ctx.strokeStyle = '#e9e6de';
  ctx.beginPath(); ctx.ellipse(x, y - h * 0.06, w / 2 - h * 0.1, h / 2 - h * 0.1, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  ctx.globalAlpha = alpha;
  if (nt.hopo || tech === 'hopo') {
    // Ligado: hueco de tinta al centro
    ctx.fillStyle = '#0b0b0c';
    ctx.beginPath(); ctx.ellipse(x, y, w * 0.2, h * 0.26, 0, 0, Math.PI * 2); ctx.fill();
  } else if (tech === 'mute') {
    // Chug: una raya apagada
    ctx.fillStyle = 'rgba(11,11,12,0.55)';
    ctx.fillRect(x - w * 0.22, y - h * 0.06, w * 0.44, Math.max(1, h * 0.11));
  }
  ctx.restore();
}

/** Armónico: estrella dorada. Solo cuenta si le pegas Perfecto. */
function drawHarmonic(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, alpha: number) {
  const r = w * 0.55;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = '#FFD23F';
  ctx.shadowBlur = LOW ? 0 : 22;
  ctx.fillStyle = '#FFE27A';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 ? r * 0.38 : r;
    const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad * 0.62;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.ellipse(x, y, r * 0.2, r * 0.13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Pull-off: galón hacia abajo. Esta nota se toca SOLTANDO el traste. */
function drawPullOff(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = col;
  ctx.shadowBlur = LOW ? 0 : 14;
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(2, h * 0.34);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const off of [-h * 0.42, h * 0.36]) {
    ctx.beginPath();
    ctx.moveTo(x - w * 0.42, y + off - h * 0.28);
    ctx.lineTo(x, y + off + h * 0.34);
    ctx.lineTo(x + w * 0.42, y + off - h * 0.28);
    ctx.stroke();
  }
  ctx.restore();
}

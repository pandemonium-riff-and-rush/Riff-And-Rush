/**
 * Fondo del juego estilo visualizador: barras de decibeles, láseres, ondas y partículas.
 * Reacciona a la música de dos formas:
 *  - Por defecto, con las notas del chart (están puestas sobre la música, así que siguen su ritmo),
 *    el BPM y la racha del jugador.
 *  - Opcional, con el sonido real que capta el micrófono (el audio de YouTube no se puede leer directo).
 */

export const BW = 1440;
export const BH = 900;
const BARS = 72;

export interface BackdropInput {
  t: number;
  bpm: number;
  /** Energía por carril 0..1 (sube cuando suena una nota de ese carril). */
  laneEnergy: number[];
  lanes: number;
  /** 0..1: qué tan encendido está el público (racha). */
  heat: number;
  boosting: boolean;
  mult: number;
  /** Espectro real del micrófono (0..1 por banda) si está activo. */
  spectrum?: Float32Array | null;
  playing: boolean;
}

interface Mote { x: number; y: number; r: number; vy: number; hue: number; a: number }
interface Wave { life: number; strong: boolean }

const MULT_COLORS = ['#A855F7', '#A855F7', '#3FA9FF', '#3DDC84', '#FF4D6D'];
const BAND_COLORS = ['#3DDC84', '#FF4D6D', '#FFD23F', '#3FA9FF', '#FF8A3D', '#B26BFF'];

function hexA(hex: string, a: number) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
}

export class Backdrop {
  private bars = new Float32Array(BARS);
  private peaks = new Float32Array(BARS);
  private motes: Mote[] = [];
  private waves: Wave[] = [];
  private lastBeat = -1;
  private last = 0;

  constructor() {
    for (let i = 0; i < 60; i++) this.motes.push(this.newMote(true));
  }

  private newMote(anywhere = false): Mote {
    return { x: Math.random() * BW, y: anywhere ? Math.random() * BH : BH + 20, r: 1 + Math.random() * 3.5, vy: 12 + Math.random() * 40, hue: Math.random(), a: 0.15 + Math.random() * 0.45 };
  }

  draw(ctx: CanvasRenderingContext2D, s: BackdropInput) {
    const now = performance.now() / 1000;
    const dt = this.last ? Math.min(0.05, now - this.last) : 0.016;
    this.last = now;
    const beatLen = 60 / s.bpm;
    const beatF = s.t >= 0 ? (s.t / beatLen) % 1 : 1;
    const pulse = s.playing ? Math.pow(Math.max(0, 1 - beatF * 2.2), 2) : 0;
    const beatN = Math.floor(s.t / beatLen);
    if (s.playing && s.t >= 0 && beatN !== this.lastBeat) {
      this.lastBeat = beatN;
      this.waves.push({ life: 0, strong: beatN % 4 === 0 });
    }
    const main = s.boosting ? '#F5B700' : MULT_COLORS[Math.min(4, Math.max(1, s.boosting ? s.mult / 2 : s.mult))];

    // ---------- Espectro objetivo ----------
    let level = 0;
    for (let b = 0; b < BARS; b++) {
      let v: number;
      if (s.spectrum && s.spectrum.length) {
        // Micrófono: bandas logarítmicas (más detalle en graves)
        const f = Math.pow(b / BARS, 1.6) * (s.spectrum.length - 1);
        const i0 = Math.floor(f), k = f - i0;
        v = s.spectrum[i0] * (1 - k) + (s.spectrum[Math.min(s.spectrum.length - 1, i0 + 1)] ?? 0) * k;
      } else {
        // Chart: cada carril alimenta una zona del espectro, los graves laten con el pulso
        const pos = (b / (BARS - 1)) * (s.lanes - 1);
        const l0 = Math.floor(pos), k = pos - l0;
        const e = (s.laneEnergy[l0] ?? 0) * (1 - k) + (s.laneEnergy[Math.min(s.lanes - 1, l0 + 1)] ?? 0) * k;
        const bass = Math.max(0, 1 - b / (BARS * 0.35));
        const flicker = 0.5 + 0.5 * Math.sin(s.t * (6 + (b % 7)) + b * 1.7);
        v = s.playing ? Math.min(1, e * (0.55 + flicker * 0.45) + pulse * bass * 0.55 + 0.06 + s.heat * 0.08 * flicker) : 0.04 + 0.02 * flicker;
      }
      // Suavizado tipo vúmetro: sube rápido, baja lento
      const cur = this.bars[b];
      this.bars[b] = v > cur ? cur + (v - cur) * Math.min(1, dt * 30) : cur - Math.min(cur - v, dt * 1.6);
      this.peaks[b] = Math.max(this.bars[b], this.peaks[b] - dt * 0.35);
      level += this.bars[b];
    }
    level /= BARS;

    // ---------- Fondo ----------
    const g = ctx.createLinearGradient(0, 0, 0, BH);
    g.addColorStop(0, '#04030F');
    g.addColorStop(0.55, '#0B0624');
    g.addColorStop(1, s.boosting ? '#1E1405' : '#12082E');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BW, BH);

    // Halo detrás de la autopista
    const haloR = 460 + level * 260 + pulse * 60;
    const halo = ctx.createRadialGradient(720, 560, 40, 720, 560, haloR);
    halo.addColorStop(0, hexA(main, 0.32 + level * 0.3));
    halo.addColorStop(0.5, hexA(main, 0.1 + level * 0.12));
    halo.addColorStop(1, hexA(main, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, BW, BH);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // ---------- Láseres ----------
    const beams = 6;
    for (let i = 0; i < beams; i++) {
      const fromLeft = i < beams / 2;
      const ox = fromLeft ? 90 + i * 130 : BW - 90 - (i - beams / 2) * 130;
      const sway = Math.sin(s.t * (0.35 + i * 0.07) + i * 1.3) * 0.5;
      const ang = (fromLeft ? 0.35 : -0.35) + sway * 0.6;
      const len = 1100;
      const w = 34 + s.heat * 50;
      const a = (0.05 + pulse * 0.18 + s.heat * 0.14 + level * 0.12) * (s.playing ? 1 : 0.5);
      const ex = ox + Math.sin(ang) * len, ey = Math.cos(ang) * len;
      const px = Math.cos(ang) * w, py = -Math.sin(ang) * w;
      const col = i % 2 ? main : '#EC4899';
      const lg = ctx.createLinearGradient(ox, 0, ex, ey);
      lg.addColorStop(0, hexA(col, a * 1.6));
      lg.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(ox, -10);
      ctx.lineTo(ex + px, ey + py);
      ctx.lineTo(ex - px, ey - py);
      ctx.closePath();
      ctx.fill();
      // núcleo del láser
      ctx.strokeStyle = hexA('#FFFFFF', a * 0.9);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ox, -10); ctx.lineTo(ox + Math.sin(ang) * 700, Math.cos(ang) * 700); ctx.stroke();
    }

    // ---------- Ondas del bombo ----------
    for (const w of this.waves) {
      w.life += dt;
      const k = w.life / (w.strong ? 1.1 : 0.7);
      if (k >= 1) continue;
      ctx.strokeStyle = hexA(main, (1 - k) * (w.strong ? 0.4 : 0.18));
      ctx.lineWidth = (w.strong ? 6 : 3) * (1 - k) + 1;
      ctx.beginPath();
      ctx.ellipse(720, 600, 200 + k * 700, (200 + k * 700) * 0.38, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.waves = this.waves.filter((w) => w.life < 1.2);

    // ---------- Barras de decibeles (abajo, con reflejo) ----------
    const baseY = BH - 40;
    const bw = BW / BARS;
    for (let b = 0; b < BARS; b++) {
      const v = this.bars[b];
      const h = 18 + v * 330;
      const x = b * bw + 2;
      const col = BAND_COLORS[Math.min(5, Math.floor((b / BARS) * s.lanes))];
      const bg = ctx.createLinearGradient(0, baseY - h, 0, baseY);
      bg.addColorStop(0, hexA(col, 0.75));
      bg.addColorStop(1, hexA(col, 0.12));
      ctx.fillStyle = bg;
      // barra hecha de segmentos, como un ecualizador
      const segH = 7, gap = 3;
      for (let y = baseY - segH; y > baseY - h; y -= segH + gap) ctx.fillRect(x, y, bw - 4, segH);
      // tope que cae lento
      ctx.fillStyle = hexA('#FFFFFF', 0.55);
      ctx.fillRect(x, baseY - 18 - this.peaks[b] * 330 - 6, bw - 4, 3);
      // reflejo
      ctx.fillStyle = hexA(col, 0.08);
      ctx.fillRect(x, baseY + 4, bw - 4, h * 0.18);
    }

    // ---------- Partículas ----------
    const want = 40 + Math.floor(s.heat * 80);
    while (this.motes.length < want) this.motes.push(this.newMote());
    for (const m of this.motes) {
      m.y -= m.vy * dt * (1 + level * 2);
      m.x += Math.sin(now * 0.8 + m.hue * 10) * 8 * dt;
      if (m.y < -20) Object.assign(m, this.newMote());
      const col = m.hue < 0.33 ? main : m.hue < 0.66 ? '#EC4899' : '#F2F0FF';
      ctx.fillStyle = hexA(col, m.a * (0.4 + pulse * 0.6));
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r * (1 + pulse * 0.5), 0, Math.PI * 2); ctx.fill();
    }
    if (this.motes.length > want + 20) this.motes.length = want + 20;
    ctx.restore();

    // Viñeta para que los paneles se lean bien
    const vg = ctx.createRadialGradient(720, 450, 300, 720, 450, 900);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, BW, BH);
  }
}

/** Escucha el sonido del ambiente (parlantes) con el micrófono y entrega un espectro 0..1. */
export class MicAnalyser {
  private ctx: AudioContext | null = null;
  private an: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private buf: Uint8Array<ArrayBuffer> | null = null;
  private out: Float32Array | null = null;

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.an = this.ctx.createAnalyser();
    this.an.fftSize = 512;
    this.an.smoothingTimeConstant = 0.6;
    src.connect(this.an);
    this.buf = new Uint8Array(new ArrayBuffer(this.an.frequencyBinCount));
    this.out = new Float32Array(96);
  }

  spectrum(): Float32Array | null {
    if (!this.an || !this.buf || !this.out) return null;
    this.an.getByteFrequencyData(this.buf);
    const n = this.out.length;
    for (let i = 0; i < n; i++) {
      // Ignora lo más agudo (casi vacío) y realza un poco
      const v = this.buf[Math.floor((i / n) * this.buf.length * 0.7)] / 255;
      this.out[i] = Math.min(1, Math.pow(v, 1.4) * 1.25);
    }
    return this.out;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => undefined);
    this.ctx = null; this.an = null;
  }
}

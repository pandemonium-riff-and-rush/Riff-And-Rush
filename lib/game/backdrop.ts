/**
 * Fondo de la pantalla de juego: el muro de afiches detrás del escenario.
 *
 * Antes era un visualizador de discoteca (seis láseres, barras de ecualizador con
 * degradado, partículas de colores). Con la paleta nueva todo eso se dibujaba en
 * blanco apagado y quedaba una niebla turbia que no decía nada.
 *
 * Ahora son tres capas, todas del mismo mundo que la web:
 *  1. El muro: afiches pegados unos sobre otros, dibujado UNA vez y reusado.
 *  2. La luz del escenario: un solo foco que respira con el pulso, no seis.
 *  3. El medidor: una tira impresa abajo que reacciona al chart o al micrófono.
 *
 * Reacciona a la música de dos formas: por defecto con las notas del chart (están
 * puestas sobre la música, así que siguen su ritmo), y opcionalmente con el sonido
 * real del micrófono (el audio de YouTube no se puede leer directo).
 */

export const BW = 1440;
export const BH = 900;
const BARS = 64;

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
  /** Miniatura de la canción, si cargó: se imprime enorme detrás del muro. */
  cover?: CanvasImageSource | null;
  /** Estilo elegido en Ajustes. Solo 'neon' cambia de mundo. */
  theme?: string;
}

interface Wave { life: number; strong: boolean }

function rgba(hex: string, a: number) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
}

/** Ruido reproducible: el muro tiene que verse igual en cada partida. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Backdrop {
  private bars = new Float32Array(BARS);
  private peaks = new Float32Array(BARS);
  private waves: Wave[] = [];
  private lastBeat = -1;
  private last = 0;
  /** El muro se dibuja una vez y después solo se copia. */
  private wall: HTMLCanvasElement | null = null;
  private wallTheme = '';

  /** Afiches pegados: rectángulos de tinta girados un grado, con una tira de cinta. */
  private buildWall(neon: boolean) {
    const c = document.createElement('canvas');
    c.width = BW; c.height = BH;
    const x = c.getContext('2d');
    if (!x) return c;
    const r = rng(20261106);
    x.fillStyle = neon ? '#0a0818' : '#0a0a0b';
    x.fillRect(0, 0, BW, BH);
    for (let i = 0; i < 46; i++) {
      const w = 130 + r() * 190;
      const h = w * (1.2 + r() * 0.5);
      const px = r() * (BW + 200) - 100;
      const py = r() * (BH + 200) - 100;
      const rot = (r() - 0.5) * 0.09;
      x.save();
      x.translate(px + w / 2, py + h / 2);
      x.rotate(rot);
      // El afiche: un papel muy apagado, casi tinta sobre tinta
      const tono = 0.016 + r() * 0.03;
      const rosa = r() < 0.17;
      x.fillStyle = rosa ? `rgba(255,61,139,${tono * 1.5})`
        : neon ? `rgba(168,130,255,${tono})` : `rgba(233,230,222,${tono})`;
      x.fillRect(-w / 2, -h / 2, w, h);
      // Una barra de título y unas líneas de texto, apenas insinuadas
      x.fillStyle = rosa ? `rgba(255,61,139,${tono * 2.6})`
        : neon ? `rgba(168,130,255,${tono * 1.9})` : `rgba(233,230,222,${tono * 1.9})`;
      x.fillRect(-w / 2 + 8, -h / 2 + 10, w - 16, h * 0.16);
      for (let k = 0; k < 3; k++) {
        x.fillRect(-w / 2 + 8, -h / 2 + h * 0.26 + k * 12, (w - 16) * (0.5 + r() * 0.45), 3);
      }
      // Cinta en una esquina
      if (r() < 0.45) {
        x.fillStyle = `rgba(233,230,222,${tono * 2.4})`;
        x.fillRect(-w / 2 - 6, -h / 2 - 4, 34, 11);
      }
      x.restore();
    }
    return c;
  }

  draw(ctx: CanvasRenderingContext2D, s: BackdropInput) {
    const now = performance.now() / 1000;
    const dt = this.last ? Math.min(0.05, now - this.last) : 0.016;
    this.last = now;
    const neon = s.theme === 'neon';
    const beatLen = 60 / s.bpm;
    const beatF = s.t >= 0 ? (s.t / beatLen) % 1 : 1;
    const pulse = s.playing ? Math.pow(Math.max(0, 1 - beatF * 2.2), 2) : 0;
    const beatN = Math.floor(s.t / beatLen);
    if (s.playing && s.t >= 0 && beatN !== this.lastBeat) {
      this.lastBeat = beatN;
      this.waves.push({ life: 0, strong: beatN % 4 === 0 });
    }
    const luz = s.boosting ? '#ffc53d' : neon ? '#a855f7' : '#e9e6de';

    // ---------- Nivel por banda ----------
    let level = 0;
    for (let b = 0; b < BARS; b++) {
      let v: number;
      if (s.spectrum && s.spectrum.length) {
        const f = Math.pow(b / BARS, 1.6) * (s.spectrum.length - 1);
        const i0 = Math.floor(f), k = f - i0;
        v = s.spectrum[i0] * (1 - k) + (s.spectrum[Math.min(s.spectrum.length - 1, i0 + 1)] ?? 0) * k;
      } else {
        const pos = (b / (BARS - 1)) * (s.lanes - 1);
        const l0 = Math.floor(pos), k = pos - l0;
        const e = (s.laneEnergy[l0] ?? 0) * (1 - k) + (s.laneEnergy[Math.min(s.lanes - 1, l0 + 1)] ?? 0) * k;
        const bass = Math.max(0, 1 - b / (BARS * 0.35));
        const flicker = 0.5 + 0.5 * Math.sin(s.t * (6 + (b % 7)) + b * 1.7);
        v = s.playing ? Math.min(1, e * (0.55 + flicker * 0.45) + pulse * bass * 0.55 + 0.06 + s.heat * 0.08 * flicker) : 0.04 + 0.02 * flicker;
      }
      const cur = this.bars[b];
      this.bars[b] = v > cur ? cur + (v - cur) * Math.min(1, dt * 30) : cur - Math.min(cur - v, dt * 1.6);
      this.peaks[b] = Math.max(this.bars[b], this.peaks[b] - dt * 0.35);
      level += this.bars[b];
    }
    level /= BARS;

    // ---------- 1. La miniatura de la canción, enorme y oscura ----------
    ctx.fillStyle = neon ? '#07061a' : '#070708';
    ctx.fillRect(0, 0, BW, BH);
    if (s.cover) {
      ctx.save();
      ctx.globalAlpha = 0.3 + level * 0.1;
      ctx.filter = 'grayscale(1) contrast(1.5) brightness(0.42)';
      // Encuadre que cubre, centrado un poco arriba (el escenario va abajo)
      ctx.drawImage(s.cover, -60, -110, BW + 120, (BW + 120) * 0.5625);
      ctx.filter = 'none';
      ctx.restore();
      // Trama: la misma que en la web, para que sea el mismo material
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = ctx.createPattern(dotPattern(), 'repeat') ?? 'transparent';
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillRect(0, 0, BW, BH * 0.62);
      ctx.restore();
    }

    // ---------- 2. El muro de afiches ----------
    if (!this.wall || this.wallTheme !== (neon ? 'neon' : 'papel')) {
      this.wall = this.buildWall(neon);
      this.wallTheme = neon ? 'neon' : 'papel';
    }
    ctx.globalAlpha = 0.85;
    ctx.drawImage(this.wall, 0, 0);
    ctx.globalAlpha = 1;

    // ---------- 3. La luz del escenario: una sola, que respira ----------
    const r0 = 500 + level * 260 + pulse * 90;
    const halo = ctx.createRadialGradient(720, 700, 30, 720, 700, r0);
    halo.addColorStop(0, rgba(luz, (neon ? 0.34 : 0.24) + level * 0.2 + s.heat * 0.1));
    halo.addColorStop(0.42, rgba(luz, (neon ? 0.12 : 0.085) + level * 0.07));
    halo.addColorStop(1, rgba(luz, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, BW, BH);

    // Dos haces desde arriba, apenas: dan el techo del lugar sin hacer discoteca
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const lado of [-1, 1]) {
      const sway = Math.sin(s.t * 0.3 + lado) * 70;
      const ox = 720 + lado * 430 + sway;
      const a = (0.03 + pulse * 0.05 + s.heat * 0.05) * (s.playing ? 1 : 0.4) * (neon ? 2.2 : 1);
      const lg = ctx.createLinearGradient(ox, 0, 720 + lado * 120, BH * 0.8);
      lg.addColorStop(0, rgba(luz, a * 1.8));
      lg.addColorStop(1, rgba(luz, 0));
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(ox - 40, -10); ctx.lineTo(ox + 40, -10);
      ctx.lineTo(720 + lado * 230, BH * 0.85); ctx.lineTo(720 + lado * 10, BH * 0.85);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // ---------- Golpe del bombo: el muro se sacude de luz ----------
    for (const w of this.waves) {
      w.life += dt;
      const k = w.life / (w.strong ? 1 : 0.6);
      if (k >= 1) continue;
      ctx.strokeStyle = rgba(luz, (1 - k) * (w.strong ? 0.22 : 0.09));
      ctx.lineWidth = (w.strong ? 5 : 2) * (1 - k) + 1;
      ctx.beginPath();
      ctx.ellipse(720, 660, 220 + k * 720, (220 + k * 720) * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.waves = this.waves.filter((w) => w.life < 1.1);

    // ---------- 4. El medidor, en el canto de arriba ----------
    // Arriba porque abajo quedaba tapado por el marcador. Es una tira impresa:
    // bloques macizos, sin degradado ni reflejo.
    const bw = BW / BARS;
    for (let b = 0; b < BARS; b++) {
      const v = this.bars[b];
      const h = 3 + v * 46;
      ctx.fillStyle = rgba(neon ? '#c084fc' : '#e9e6de', 0.08 + v * 0.22);
      ctx.fillRect(b * bw + 2, 0, bw - 4, h);
    }

    // Viñeta: deja respirar los paneles de los costados
    const vg = ctx.createRadialGradient(720, 520, 320, 720, 520, 980);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, BW, BH);
  }
}

/** Trama de medio tono de 4 px, construida una sola vez. */
let dots: HTMLCanvasElement | null = null;
function dotPattern() {
  if (dots) return dots;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 4;
  const x = c.getContext('2d');
  if (x) {
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 4, 4);
    x.fillStyle = '#0b0b0c';
    x.beginPath(); x.arc(2, 2, 1.25, 0, Math.PI * 2); x.fill();
  }
  dots = c;
  return c;
}

/**
 * Lector del micrófono: el audio de YouTube no se puede leer directo desde la
 * página, así que quien quiera que el fondo siga la música de verdad presta el
 * micrófono y el espectro sale de ahí.
 */
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


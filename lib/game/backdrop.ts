/**
 * Fondo de la pantalla de juego: el lugar donde se está tocando.
 *
 * Todo acá responde a la música, que es lo único que este fondo tiene que hacer:
 *  1. La miniatura de la canción, enorme y oscura, para saber qué suena.
 *  2. Torres de parlantes: el espectro como bloques macizos que suben del suelo.
 *  3. Seis focos que barren, con su lámpara visible, abriendo con el pulso.
 *  4. La luz del escenario, las ondas del bombo y el destello del compás.
 *  5. Papeles volando, tantos como racha lleve el jugador.
 *
 * Reacciona de dos formas: por defecto con las notas del chart (están puestas
 * sobre la música, así que siguen su ritmo), y opcionalmente con el sonido real
 * del micrófono, porque el audio de YouTube no se puede leer directo.
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

interface Mote { x: number; y: number; r: number; vy: number; hue: number; a: number; rot: number; spin: number }
interface Wave { life: number; strong: boolean }

const MULT_COLORS = ['#e9e6de', '#e9e6de', '#3fa9ff', '#3ddc84', '#ff4d6d'];

function hexA(hex: string, a: number) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
}

function rgba(hex: string, a: number) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
}

export class Backdrop {
  private bars = new Float32Array(BARS);
  private peaks = new Float32Array(BARS);
  private waves: Wave[] = [];
  private motes: Mote[] = [];
  /** Destello del compás, cae solo. */
  private flash = 0;
  private lastBeat = -1;
  private last = 0;

  constructor() {
    for (let i = 0; i < 26; i++) this.motes.push(this.newMote(true));
  }

  /** Un papelillo que sube flotando. */
  private newMote(cualquiera = false): Mote {
    return {
      x: Math.random() * BW,
      y: cualquiera ? Math.random() * BH : BH + 20,
      r: 2 + Math.random() * 5,
      vy: 14 + Math.random() * 46,
      hue: Math.random(),
      a: 0.18 + Math.random() * 0.5,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 2.4
    };
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
    const golpe = s.playing && s.t >= 0 && beatN !== this.lastBeat;
    if (golpe) {
      this.lastBeat = beatN;
      this.waves.push({ life: 0, strong: beatN % 4 === 0 });
      if (beatN % 4 === 0) this.flash = 1;
    }
    this.flash = Math.max(0, this.flash - dt * 4.5);
    const main = s.boosting ? '#ffc53d' : MULT_COLORS[Math.min(4, Math.max(1, s.boosting ? s.mult / 2 : s.mult))];
    const segundo = s.boosting ? '#ff8a3d' : neon ? '#a855f7' : '#ff3d8b';

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
        v = s.playing ? Math.min(1, e * (0.6 + flicker * 0.5) + pulse * bass * 0.7 + 0.06 + s.heat * 0.1 * flicker) : 0.04 + 0.02 * flicker;
      }
      const cur = this.bars[b];
      this.bars[b] = v > cur ? cur + (v - cur) * Math.min(1, dt * 30) : cur - Math.min(cur - v, dt * 1.6);
      this.peaks[b] = Math.max(this.bars[b], this.peaks[b] - dt * 0.35);
      level += this.bars[b];
    }
    level /= BARS;
    /** Cuánta fuerza tiene la escena ahora mismo: suma ritmo, racha y volumen. */
    const fuerza = Math.min(1, pulse * 0.55 + s.heat * 0.5 + level * 0.6);

    // ---------- 1. La miniatura de la canción, enorme y oscura ----------
    ctx.fillStyle = neon ? '#07061a' : '#070708';
    ctx.fillRect(0, 0, BW, BH);
    if (s.cover) {
      ctx.save();
      ctx.globalAlpha = 0.34 + level * 0.24 + this.flash * 0.12;
      ctx.filter = 'grayscale(1) contrast(1.5) brightness(0.45)';
      ctx.drawImage(s.cover, -60, -110, BW + 120, (BW + 120) * 0.5625);
      ctx.filter = 'none';
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = ctx.createPattern(dotPattern(), 'repeat') ?? 'transparent';
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillRect(0, 0, BW, BH * 0.62);
      ctx.restore();
    }

    // ---------- 2. Las torres de parlantes: el espectro, en bloques ----------
    // Bloques macizos que suben desde el suelo detrás del escenario. Es la
    // señal más directa de "acá está sonando algo".
    const torres = 22;
    const tw = BW / torres;
    for (let i = 0; i < torres; i++) {
      // Dos bandas por torre, para que el movimiento no sea parejo
      const b0 = Math.floor((i / torres) * BARS);
      const v = (this.bars[b0] + this.bars[Math.min(BARS - 1, b0 + 2)]) / 2;
      const h = 60 + v * 330 + pulse * 30;
      const x = i * tw;
      ctx.fillStyle = neon ? 'rgba(40,20,70,0.85)' : 'rgba(18,18,21,0.9)';
      ctx.fillRect(x + 1, BH - h, tw - 2, h);
      // Canto encendido arriba: lo único con color de la torre
      ctx.fillStyle = hexA(main, 0.22 + v * 0.6);
      ctx.fillRect(x + 1, BH - h, tw - 2, Math.max(2, 3 + v * 5));
      // Rendijas horizontales, como la rejilla de un parlante
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      for (let y = BH - h + 14; y < BH; y += 16) ctx.fillRect(x + 1, y, tw - 2, 3);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // ---------- 3. Los focos que barren ----------
    const focos = 6;
    for (let i = 0; i < focos; i++) {
      const desdeIzq = i < focos / 2;
      const ox = desdeIzq ? 120 + i * 150 : BW - 120 - (i - focos / 2) * 150;
      const vaiven = Math.sin(s.t * (0.5 + i * 0.11) + i * 1.3) * 0.55;
      const ang = (desdeIzq ? 0.32 : -0.32) + vaiven * 0.7;
      const largo = 1150;
      const w = 26 + fuerza * 70;
      const a = (0.035 + pulse * 0.16 + s.heat * 0.13 + level * 0.1) * (s.playing ? 1 : 0.35) * (neon ? 1.5 : 1);
      const ex = ox + Math.sin(ang) * largo, ey = Math.cos(ang) * largo;
      const px = Math.cos(ang) * w, py = -Math.sin(ang) * w;
      const col = i % 2 ? main : segundo;
      // Haz de borde duro: es un foco de escenario, no una nube
      ctx.fillStyle = hexA(col, a);
      ctx.beginPath();
      ctx.moveTo(ox - 9, -10); ctx.lineTo(ox + 9, -10);
      ctx.lineTo(ex + px, ey + py); ctx.lineTo(ex - px, ey - py);
      ctx.closePath(); ctx.fill();
      // Núcleo
      ctx.strokeStyle = hexA('#ffffff', a * 1.3);
      ctx.lineWidth = 1.5 + pulse * 1.5;
      ctx.beginPath(); ctx.moveTo(ox, -10); ctx.lineTo(ox + Math.sin(ang) * 760, Math.cos(ang) * 760); ctx.stroke();
      // La lámpara arriba
      ctx.fillStyle = hexA(col, 0.25 + pulse * 0.6);
      ctx.beginPath(); ctx.arc(ox, 8, 7 + pulse * 5, 0, Math.PI * 2); ctx.fill();
    }

    // ---------- 4. La luz del escenario ----------
    const r0 = 460 + level * 300 + pulse * 120;
    const halo = ctx.createRadialGradient(720, 700, 30, 720, 700, r0);
    halo.addColorStop(0, hexA(main, 0.16 + level * 0.24 + s.heat * 0.14));
    halo.addColorStop(0.42, hexA(main, 0.05 + level * 0.1));
    halo.addColorStop(1, hexA(main, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, BW, BH);

    // ---------- 5. Ondas del bombo ----------
    for (const w of this.waves) {
      w.life += dt;
      const k = w.life / (w.strong ? 1 : 0.6);
      if (k >= 1) continue;
      ctx.strokeStyle = hexA(w.strong ? main : segundo, (1 - k) * (w.strong ? 0.5 : 0.22));
      ctx.lineWidth = (w.strong ? 9 : 4) * (1 - k) + 1;
      ctx.beginPath();
      ctx.ellipse(720, 680, 200 + k * 780, (200 + k * 780) * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.waves = this.waves.filter((w) => w.life < 1.1);

    // ---------- 6. Papeles volando ----------
    // Papelillos del show: suben con la racha.
    const quiere = 26 + Math.floor(s.heat * 90);
    while (this.motes.length < quiere) this.motes.push(this.newMote());
    for (const m of this.motes) {
      m.y -= m.vy * dt * (1 + level * 2.2);
      m.x += Math.sin(now * 0.8 + m.hue * 10) * 11 * dt;
      m.rot += m.spin * dt;
      if (m.y < -24) Object.assign(m, this.newMote());
      const col = m.hue < 0.4 ? main : m.hue < 0.72 ? segundo : '#e9e6de';
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.rot);
      ctx.fillStyle = hexA(col, m.a * (0.35 + pulse * 0.65));
      ctx.fillRect(-m.r, -m.r * 0.5, m.r * 2, m.r);
      ctx.restore();
    }
    if (this.motes.length > quiere + 20) this.motes.length = quiere + 20;
    ctx.restore();

    // ---------- 7. Golpe de compás: todo el lugar recibe luz ----------
    if (this.flash > 0.01) {
      ctx.fillStyle = hexA(main, this.flash * (0.05 + s.heat * 0.09));
      ctx.fillRect(0, 0, BW, BH);
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


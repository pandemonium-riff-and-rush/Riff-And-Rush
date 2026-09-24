'use client';

/**
 * Capa de sonido del golpe. NO toca el audio de YouTube: son sonidos propios,
 * sintetizados en el momento, que se suman arriba de la canción.
 *
 * Existe porque en Clone Hero la mitad de lo satisfactorio viene de que la pista
 * de guitarra se calla cuando fallas. Con el reproductor de YouTube eso no se puede,
 * así que la respuesta al golpe tiene que salir de acá.
 */

import type { Tech } from '../chart/types';

/** Frecuencia base de cada carril: sube como los trastes de una guitarra. */
const LANE_HZ = [146.83, 174.61, 220.0, 261.63, 329.63, 392.0]; // Re Fa La Do Mi Sol

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  constructor(volume = 0.5) {
    this.volume = volume;
  }
  volume: number;

  /** Debe llamarse desde un gesto del usuario (click o tecla). */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }
  setMuted(m: boolean) { this.muted = m; }

  private get t0() { return this.ctx?.currentTime ?? 0; }

  private out(): AudioNode | null {
    if (!this.ctx || this.muted || this.volume <= 0) return null;
    return this.master;
  }

  /** Cuerda pulsada: un par de osciladores con envolvente corta y filtro que se cierra. */
  private pluck(hz: number, opts: { gain?: number; dur?: number; cutoff?: number; type?: OscillatorType; detune?: number; bend?: number } = {}) {
    const dst = this.out();
    if (!dst || !this.ctx) return;
    const t = this.t0;
    const dur = opts.dur ?? 0.28;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(opts.cutoff ?? 3200, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(180, (opts.cutoff ?? 3200) * 0.18), t + dur);
    f.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.5, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [type, mul, lvl] of [[opts.type ?? 'sawtooth', 1, 1], ['square', 2.002, 0.22]] as [OscillatorType, number, number][]) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(hz * mul, t);
      if (opts.bend) o.frequency.linearRampToValueAtTime(hz * mul * opts.bend, t + dur * 0.6);
      if (opts.detune) o.detune.value = opts.detune;
      const lg = this.ctx.createGain();
      lg.gain.value = lvl;
      o.connect(lg).connect(f);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
    f.connect(g).connect(dst);
  }

  /** Ruido corto: el "clac" de la púa y el golpe del fallo. */
  private noise(dur: number, gain: number, cutoff: number, highpass = false) {
    const dst = this.out();
    if (!dst || !this.ctx) return;
    const t = this.t0;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = highpass ? 'highpass' : 'lowpass';
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dst);
    src.start(t);
  }

  /** Acierto. El timbre cambia según la técnica: ahí está el carácter de cada una. */
  hit(lane: number, tech?: Tech, perfect = true) {
    if (!this.ctx) return;
    const hz = LANE_HZ[lane] ?? 220;
    const lvl = perfect ? 0.5 : 0.36;
    switch (tech) {
      case 'mute':
        // Chug: cortísimo, oscuro y con cuerpo. Es el que más se nota.
        this.pluck(hz * 0.5, { gain: lvl * 0.95, dur: 0.1, cutoff: 520, type: 'square' });
        this.noise(0.035, 0.1, 1400);
        break;
      case 'harm':
        // Chillido: armónico agudo con un toque de segunda voz.
        this.pluck(hz * 4, { gain: lvl * 0.5, dur: 0.85, cutoff: 7000, type: 'sine', bend: 1.03 });
        this.pluck(hz * 6.01, { gain: lvl * 0.22, dur: 0.7, cutoff: 9000, type: 'sine' });
        break;
      case 'hopo':
      case 'pull':
        // Ligado: sin púa, entra más suave y con menos ataque.
        this.pluck(hz, { gain: lvl * 0.62, dur: 0.34, cutoff: 2100, type: 'triangle' });
        break;
      case 'sweep':
        this.pluck(hz, { gain: lvl * 0.7, dur: 0.22, cutoff: 4200, detune: 6 });
        break;
      default:
        this.pluck(hz, { gain: lvl, dur: 0.3 });
        this.noise(0.03, perfect ? 0.14 : 0.08, 6000, true);
    }
  }

  /** Fallo: golpe seco y opaco, sin nota. */
  miss() {
    this.noise(0.13, 0.3, 320);
    this.pluck(70, { gain: 0.18, dur: 0.12, cutoff: 260, type: 'square' });
  }

  /** Apretar sin nota: un "clac" mudo de púa contra cuerda apagada. */
  ghost() {
    this.noise(0.05, 0.16, 2600, true);
  }

  destroy() {
    try { this.ctx?.close(); } catch { /* ya cerrado */ }
    this.ctx = null;
    this.master = null;
  }
}

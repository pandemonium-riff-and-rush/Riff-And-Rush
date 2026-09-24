'use client';

/**
 * Relojes del juego. El reloj SIEMPRE manda sobre las notas: si el video se detiene
 * (anuncio, buffering, corte), el tiempo no avanza y las notas tampoco.
 *
 * time() devuelve segundos en "tiempo de chart" (tiempo del video menos el offset).
 */
export type ClockStatus = 'loading' | 'ready' | 'waiting' | 'playing' | 'paused' | 'ended' | 'error';

/** Alguien tocó el reproductor por fuera del juego. */
export type TamperKind = 'pause' | 'seek';

export interface GameClock {
  status: ClockStatus;
  onStatus?: (s: ClockStatus) => void;
  /** Avisa que el video se pausó o saltó sin que el juego lo pidiera. */
  onTamper?: (kind: TamperKind) => void;
  /** Debe llamarse desde un gesto del usuario (click / tecla) para que el navegador permita audio. */
  start(): void;
  time(): number;
  pause(): void;
  /** Retoma desde un tiempo de chart dado (se usa para retroceder 2 s). */
  resume(fromChartSec: number): void;
  /** Velocidad de reproducción (modo práctica): 0.25–1. */
  setRate(rate: number): void;
  /** Cambia el desfase entre el video y el chart en caliente (segundos). */
  setOffset?(sec: number): void;
  destroy(): void;
}

/* ------------------------------------------------------------------ */
/* Metrónomo: fuente de prueba sin video, con clics por beat.          */
/* ------------------------------------------------------------------ */

export class MetronomeClock implements GameClock {
  status: ClockStatus = 'ready';
  onStatus?: (s: ClockStatus) => void;
  private ctx: AudioContext | null = null;
  private startAt = 0;
  private pausedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private rate = 1;

  constructor(private bpm: number, private durationSec: number, private click: boolean, private leadIn = 3) {}

  private set(s: ClockStatus) { this.status = s; this.onStatus?.(s); }

  start() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.startAt = this.ctx.currentTime + this.leadIn / this.rate;
    this.nextBeat = Math.ceil(-this.leadIn * this.bpm / 60);
    this.timer = setInterval(() => this.schedule(), 25);
    this.set('playing');
  }

  private schedule() {
    if (!this.ctx || this.status !== 'playing') return;
    const beat = 60 / this.bpm;
    const horizon = this.ctx.currentTime + 0.12;
    while (this.startAt + (this.nextBeat * beat) / this.rate < horizon) {
      const when = this.startAt + (this.nextBeat * beat) / this.rate;
      if (this.click && when >= this.ctx.currentTime - 0.01) this.beep(when, this.nextBeat % 4 === 0);
      this.nextBeat++;
    }
    if (this.time() > this.durationSec) this.set('ended');
  }

  private beep(when: number, accent: boolean) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = accent ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(accent ? 0.25 : 0.14, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    o.connect(g).connect(ctx.destination);
    o.start(when);
    o.stop(when + 0.07);
  }

  time() {
    if (!this.ctx) return -this.leadIn;
    if (this.status === 'paused') return this.pausedAt;
    return (this.ctx.currentTime - this.startAt) * this.rate;
  }

  setRate(rate: number) {
    const t = this.time();
    this.rate = rate;
    if (this.ctx && this.status !== 'paused') this.startAt = this.ctx.currentTime - t / rate;
  }

  pause() {
    if (this.status !== 'playing') return;
    this.pausedAt = this.time();
    this.set('paused');
  }

  resume(from: number) {
    if (!this.ctx) return;
    this.startAt = this.ctx.currentTime - from / this.rate;
    this.nextBeat = Math.ceil(from * this.bpm / 60);
    this.set('playing');
  }

  destroy() {
    if (this.timer) clearInterval(this.timer);
    this.ctx?.close().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* YouTube: usa el reproductor oficial (IFrame API), sin nada encima.  */
/* ------------------------------------------------------------------ */

let apiPromise: Promise<void> | null = null;
export function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    const w = window as unknown as { onYouTubeIframeAPIReady?: () => void };
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return apiPromise;
}

export class YouTubeClock implements GameClock {
  status: ClockStatus = 'loading';
  onStatus?: (s: ClockStatus) => void;
  private player: YT.Player | null = null;
  private lastYt = 0;
  private lastPerf = 0;
  private lastAdvance = 0;
  private wantPlaying = false;
  private poll: ReturnType<typeof setInterval> | null = null;
  private pausedAt = 0;
  private mono = -Infinity;
  private ready = false;
  private destroyed = false;
  private pendingStart = false;
  private el: HTMLDivElement | null = null;
  private prerollUntil = 0;
  private rate = 1;
  /** Mientras el juego mismo mueve el video, no se avisa de "alguien tocó el reproductor". */
  private guardUntil = 0;
  onError?: (code: number) => void;
  onTamper?: (kind: TamperKind) => void;

  constructor(private elementId: string, private videoId: string, private offsetSec: number, private leadIn = 3) {
    loadYouTubeApi().then(() => this.create());
  }

  private set(s: ClockStatus) {
    if (this.destroyed || this.status === s) return;
    this.status = s;
    this.onStatus?.(s);
  }

  private create() {
    if (this.destroyed) return;
    const host = document.getElementById(this.elementId);
    if (!host) return;
    // Cada reloj usa su propio div: evita choques cuando React monta el componente dos veces
    this.el = document.createElement('div');
    host.appendChild(this.el);
    this.player = new YT.Player(this.el, {
      videoId: this.videoId,
      width: 400,
      height: 225,
      // controls: 0 saca la barra de progreso y los botones: así nadie adelanta ni pausa
      // el video por fuera y desincroniza la partida. disablekb apaga los atajos de YouTube.
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, disablekb: 1, controls: 0, fs: 0, iv_load_policy: 3 },
      events: {
        onReady: () => {
          if (this.destroyed) return;
          this.ready = true;
          this.set('ready');
          if (this.pendingStart) { this.pendingStart = false; this.start(); }
        },
        onError: (e) => { this.set('error'); this.onError?.(e.data as number); },
        onStateChange: (e) => this.onState(e.data)
      }
    });
    this.poll = setInterval(() => this.watch(), 50);
  }

  private onState(state: number) {
    if (this.destroyed) return;
    if (state === YT.PlayerState.ENDED) this.set('ended');
    else if (state === YT.PlayerState.BUFFERING || state === YT.PlayerState.UNSTARTED) {
      if (this.wantPlaying) this.set('waiting');
    } else if (state === YT.PlayerState.PAUSED && this.wantPlaying && performance.now() > this.guardUntil) {
      // El juego nunca pausa sin bajar wantPlaying: esto lo hizo el jugador en el reproductor
      this.onTamper?.('pause');
    }
  }

  /** Detecta si el tiempo del video realmente avanza (anuncios y buffering lo congelan). */
  private watch() {
    if (!this.player || !this.ready || !this.wantPlaying || this.status === 'ended' || this.status === 'paused') return;
    const now = performance.now();
    const yt = this.player.getCurrentTime?.() ?? 0;
    const state = this.player.getPlayerState?.();
    // Salto en la barra de progreso: solo se revisa cuando el video venía corriendo normal,
    // así un anuncio o un corte de buffering no se confunden con un salto.
    if (this.status === 'playing' && !this.prerollUntil && now > this.guardUntil && Math.abs(yt - this.lastYt) > 2.5) {
      this.onTamper?.('seek');
      return;
    }
    if (yt !== this.lastYt) {
      if (yt > this.lastYt) this.lastAdvance = now;
      this.lastYt = yt;
      this.lastPerf = now;
    }
    const advancing = now - this.lastAdvance < 350;
    if (state === YT.PlayerState.PLAYING && advancing) this.set('playing');
    else if (!advancing) this.set('waiting');
  }

  /** Inicia con margen: las notas bajan durante leadIn segundos antes de darle play al video. */
  start() {
    if (!this.ready || !this.player || typeof this.player.seekTo !== 'function') { this.pendingStart = true; return; }
    this.resume(-this.leadIn - this.offsetSec);
  }

  time() {
    if (this.status === 'paused') return this.pausedAt;
    if (this.prerollUntil) {
      const left = (this.prerollUntil - performance.now()) / 1000;
      if (left > 0) return -left - this.offsetSec;
      this.prerollUntil = 0;
      this.playFrom(0);
    }
    if (this.status !== 'playing') return this.lastYt - this.offsetSec;
    const rate = (this.ready && this.player?.getPlaybackRate?.()) || 1;
    let est = this.lastYt + ((performance.now() - this.lastPerf) / 1000) * rate;
    // Evita pequeños saltos hacia atrás cuando el reproductor corrige su tiempo
    if (est < this.mono && this.mono - est < 0.08) est = this.mono;
    this.mono = est;
    return est - this.offsetSec;
  }

  pause() {
    this.pausedAt = this.time();
    this.prerollUntil = 0;
    this.wantPlaying = false;
    if (this.ready) this.player?.pauseVideo();
    this.set('paused');
  }

  private playFrom(v: number) {
    this.mono = -Infinity;
    this.lastYt = v;
    this.lastPerf = performance.now();
    this.lastAdvance = 0;
    this.wantPlaying = true;
    this.guardUntil = performance.now() + 1200;
    if (this.ready) { this.player?.setPlaybackRate?.(this.rate); this.player?.seekTo(v, true); this.player?.playVideo(); }
    this.set('waiting');
  }

  /** Retoma desde un tiempo de chart. Si cae antes del inicio del video, espera ese margen y luego parte en 0. */
  resume(from: number) {
    const v = from + this.offsetSec;
    if (v < 0) {
      this.lastYt = 0;
      this.wantPlaying = false;
      this.guardUntil = performance.now() + 1200;
      if (this.ready) { this.player?.pauseVideo(); this.player?.seekTo(0, true); }
      this.prerollUntil = performance.now() + (-v * 1000) / this.rate;
      this.set('playing');
      return;
    }
    this.prerollUntil = 0;
    this.playFrom(v);
  }

  setRate(rate: number) {
    this.rate = rate;
    if (this.ready) this.player?.setPlaybackRate?.(rate);
  }

  setOffset(sec: number) {
    this.offsetSec = sec;
  }

  destroy() {
    this.destroyed = true;
    if (this.poll) clearInterval(this.poll);
    try { this.player?.destroy(); } catch { /* ya destruido */ }
    this.el?.remove();
  }
}

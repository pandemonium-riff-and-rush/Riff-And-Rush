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

/** Cuánto antes del final del margen se le da play al video (lo que tarda YouTube en partir). */
const KICK_EARLY = 0.12;

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
  /** Lo silenciamos nosotros durante el margen de inicio (para devolverle el sonido después). */
  private mutedByUs = false;
  /** Precarga en silencio hasta pasar los anuncios (ver watchPriming). */
  private priming = false;
  private primed = false;
  private primeStarted = 0;
  /** Ya se le dio play al video en este margen de inicio. */
  private kicked = false;
  /** Hasta cuándo dura el traspaso margen → canción (no se muestra "esperando" por un tirón). */
  private handoffUntil = 0;
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
    const now = performance.now();
    if (state === YT.PlayerState.ENDED) this.set('ended');
    else if (state === YT.PlayerState.BUFFERING || state === YT.PlayerState.UNSTARTED) {
      // En el traspaso margen → canción un buffering cortito es normal: no se muestra "esperando"
      if (this.wantPlaying && now > this.handoffUntil) this.set('waiting');
    } else if (state === YT.PlayerState.PLAYING && this.prerollUntil && !this.wantPlaying) {
      // Durante el margen de inicio el video tiene que quedarse quieto en 0. YouTube a veces
      // arranca solo al hacer seekTo sobre un video recién cargado: se vuelve a pausar.
      this.player?.pauseVideo();
    } else if (state === YT.PlayerState.PAUSED && this.wantPlaying && now > this.guardUntil) {
      // El juego nunca pausa sin bajar wantPlaying: esto lo hizo el jugador en el reproductor
      this.onTamper?.('pause');
    }
  }

  /** Detecta si el tiempo del video realmente avanza (anuncios y buffering lo congelan). */
  private watch() {
    if (!this.player || !this.ready || this.status === 'ended' || this.status === 'paused') return;
    if (this.priming) { this.watchPriming(); return; }
    if (!this.wantPlaying) return;
    const now = performance.now();
    const yt = this.player.getCurrentTime?.() ?? 0;
    const state = this.player.getPlayerState?.();
    // Salto en la barra de progreso: solo se revisa cuando el video venía corriendo normal,
    // así un anuncio o un corte de buffering no se confunden con un salto.
    if (this.status === 'playing' && !this.prerollUntil && now > this.guardUntil && Math.abs(yt - this.lastYt) > 2.5) {
      this.onTamper?.('seek');
      return;
    }
    if (yt !== this.lastYt && (yt > this.lastYt || now > this.handoffUntil)) {
      if (yt > this.lastYt) this.lastAdvance = now;
      this.lastYt = yt;
      this.lastPerf = now;
    }
    const advancing = now - this.lastAdvance < 350;
    if (state === YT.PlayerState.PLAYING && advancing) this.set('playing');
    else if (!advancing && now > this.handoffUntil) this.set('waiting');
  }

  /**
   * Precarga: al empezar, el video se reproduce en silencio hasta que su tiempo avanza de verdad.
   * Si YouTube mete un anuncio, pasa acá (el juego muestra "Esperando al video"). Cuando ya corre
   * el video real, se pausa, vuelve a 0 y recién ahí parte el margen de inicio. Así el play final
   * es inmediato: el video ya está cargado y sin anuncios de por medio.
   */
  private watchPriming() {
    const p = this.player!;
    const yt = p.getCurrentTime?.() ?? 0;
    const state = p.getPlayerState?.();
    if (state === YT.PlayerState.PLAYING && yt >= 0.3) {
      this.priming = false;
      this.primed = true;
      p.pauseVideo();
      p.seekTo(0, true);
      p.pauseVideo();
      this.resume(-this.leadIn - this.offsetSec);
    } else if (state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING && performance.now() - this.primeStarted > 1500) {
      // Quedó detenido (el navegador no dejó reproducir): se vuelve a pedir
      this.primeStarted = performance.now();
      p.playVideo();
    }
  }

  /** Inicia con margen: las notas bajan durante leadIn segundos antes de darle play al video. */
  start() {
    if (!this.ready || !this.player || typeof this.player.seekTo !== 'function') { this.pendingStart = true; return; }
    if (!this.primed) {
      const p = this.player;
      this.priming = true;
      this.primeStarted = performance.now();
      this.wantPlaying = false;
      if (!this.mutedByUs && !p.isMuted?.()) { p.mute?.(); this.mutedByUs = true; }
      p.setPlaybackRate?.(this.rate);
      p.playVideo();
      this.set('waiting');
      return;
    }
    this.resume(-this.leadIn - this.offsetSec);
  }

  time() {
    if (this.status === 'paused') return this.pausedAt;
    if (this.priming) return -this.leadIn - this.offsetSec;
    const now = performance.now();
    if (this.prerollUntil) {
      const left = (this.prerollUntil - now) / 1000;
      // Se le da play al video un poquito antes de que termine el margen: absorbe lo que tarda
      // YouTube en partir y la canción entra justo a tiempo, sin frenar las notas
      if (left <= KICK_EARLY && !this.kicked) this.kick();
      if (left > 0) return -left - this.offsetSec;
      this.prerollUntil = 0;
      if (!this.kicked) this.kick();
      this.set('playing');
    }
    if (this.status !== 'playing') return this.lastYt - this.offsetSec;
    const rate = (this.ready && this.player?.getPlaybackRate?.()) || 1;
    let est = this.lastYt + ((now - this.lastPerf) / 1000) * rate;
    // Evita saltos hacia atrás cuando el reproductor corrige su tiempo. Justo al partir la canción
    // se tolera más: las notas esperan un instante al video en vez de retroceder.
    const hold = now < this.handoffUntil ? 0.5 : 0.08;
    if (est < this.mono && this.mono - est < hold) est = this.mono;
    this.mono = est;
    return est - this.offsetSec;
  }

  /** Play del video al final del margen de inicio (sin buscar si ya está en 0). */
  private kick() {
    this.kicked = true;
    const now = performance.now();
    const left = Math.max(0, (this.prerollUntil - now) / 1000);
    this.mono = -Infinity;
    this.lastYt = 0;
    // El reloj cuenta como si el video partiera exactamente al terminar el margen
    this.lastPerf = now + left * 1000;
    this.lastAdvance = now;
    this.wantPlaying = true;
    this.guardUntil = now + 1500;
    this.handoffUntil = now + 1500;
    if (this.ready && this.player) {
      const p = this.player;
      p.setPlaybackRate?.(this.rate);
      if (this.mutedByUs) { p.unMute?.(); this.mutedByUs = false; }
      if ((p.getCurrentTime?.() ?? 0) > 0.05) p.seekTo(0, true);
      p.playVideo();
    }
  }

  pause() {
    this.pausedAt = this.time();
    this.prerollUntil = 0;
    this.priming = false;
    this.wantPlaying = false;
    this.handoffUntil = 0;
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
    this.handoffUntil = 0;
    if (this.ready) {
      this.player?.setPlaybackRate?.(this.rate);
      if (this.mutedByUs) { this.player?.unMute?.(); this.mutedByUs = false; }
      this.player?.seekTo(v, true);
      this.player?.playVideo();
    }
    this.set('waiting');
  }

  /** Retoma desde un tiempo de chart. Si cae antes del inicio del video, espera ese margen y luego parte en 0. */
  resume(from: number) {
    const v = from + this.offsetSec;
    // Si alguien retoma mientras se precargaba (p. ej. modo práctica), se salta la precarga
    this.priming = false;
    if (v < 0) {
      this.lastYt = 0;
      this.wantPlaying = false;
      this.kicked = false;
      this.guardUntil = performance.now() + 1200;
      if (this.ready) this.holdAtStart();
      this.prerollUntil = performance.now() + (-v * 1000) / this.rate;
      this.set('playing');
      return;
    }
    this.prerollUntil = 0;
    this.playFrom(v);
  }

  /**
   * Deja el video quieto y en silencio en el segundo 0 mientras corre el margen de inicio.
   * Ojo: seekTo sobre un video recién cargado lo hace sonar; por eso se silencia antes y
   * solo se busca el 0 si el video ya había avanzado (reiniciar la canción).
   */
  private holdAtStart() {
    const p = this.player;
    if (!p) return;
    if (!this.mutedByUs && !p.isMuted?.()) { p.mute?.(); this.mutedByUs = true; }
    p.pauseVideo();
    if ((p.getCurrentTime?.() ?? 0) > 0.05) { p.seekTo(0, true); p.pauseVideo(); }
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

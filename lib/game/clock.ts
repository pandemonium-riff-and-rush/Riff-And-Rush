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
  /** Durante la cuenta 3·2·1 al retomar: deja todo listo (y las notas) en ese punto, aún en pausa. */
  prepare?(fromChartSec: number): void;
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

  prepare(from: number) {
    if (this.status === 'paused') this.pausedAt = from;
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

/* ------------------------------------------------------------------ */
/* Latencia de YouTube: cuánto tarda el video en partir desde playVideo() */
/* ------------------------------------------------------------------ */

const LATENCY_KEY = 'rr.ytLatency.v1';
let kickLatency = 0.15;
try { const v = Number(localStorage.getItem(LATENCY_KEY)); if (v > 0) kickLatency = v; } catch { /* sin storage */ }
/** Aprende la latencia real (promedio suave) para darle play con esa anticipación la próxima vez. */
function learnLatency(sec: number) {
  if (!(sec > 0 && sec < 1.5)) return;
  kickLatency = Math.min(0.6, Math.max(0.03, kickLatency * 0.6 + sec * 0.4));
  try { localStorage.setItem(LATENCY_KEY, String(kickLatency)); } catch { /* sin storage */ }
}
/** Velocidad máxima a la que se corrige un desfase entre juego y video (segundos por segundo). */
const SLEW = 0.35;

export class YouTubeClock implements GameClock {
  status: ClockStatus = 'loading';
  onStatus?: (s: ClockStatus) => void;
  onError?: (code: number) => void;
  onTamper?: (kind: TamperKind) => void;
  private player: YT.Player | null = null;
  private el: HTMLDivElement | null = null;
  private ready = false;
  private destroyed = false;
  private pendingStart = false;
  private poll: ReturnType<typeof setInterval> | null = null;
  private rate = 1;

  /** Última lectura del video: tiempo del video (s) y en qué momento (performance.now) se leyó. */
  private lastYt = 0;
  private lastPerf = 0;
  private lastAdvance = 0;
  /** El juego quiere que el video esté sonando. */
  private wantPlaying = false;
  private pausedAt = 0;
  /** Último tiempo entregado (en tiempo de video): el reloj nunca retrocede solo. */
  private mono = -Infinity;
  private lastCall = 0;
  /** Desfase que se está corrigiendo de a poco (juego − video), en segundos. */
  private corr = 0;

  /** Precarga en silencio hasta pasar los anuncios (ver watchPriming). */
  private priming = false;
  private primed = false;
  private primeStarted = 0;
  /** Lo silenciamos nosotros (para devolverle el sonido después). */
  private mutedByUs = false;

  /** Margen de inicio: hasta cuándo corre el juego solo, con el video quieto en 0. */
  private prerollUntil = 0;
  /**
   * Traspaso a la canción (al final del margen o al retomar una pausa): se le dio play al video
   * y se espera la primera lectura real para engancharse sin saltos.
   *  - 'run': el juego sigue corriendo como si el video hubiera partido a tiempo (margen de inicio)
   *  - 'hold': el juego se queda quieto hasta que el video parta (al retomar tras 3·2·1)
   */
  private handoff: null | { mode: 'run' | 'hold'; at: number; from: number; calledAt: number } = null;
  /** Mientras el juego mismo mueve el video, no se avisa de "alguien tocó el reproductor". */
  private guardUntil = 0;

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
          // Que el Tab no pueda meter el foco en el video (las teclas son del juego)
          try { this.player?.getIframe?.().setAttribute('tabindex', '-1'); } catch { /* sin iframe */ }
          this.ready = true;
          this.set('ready');
          if (this.pendingStart) { this.pendingStart = false; this.start(); }
        },
        onError: (e) => { this.set('error'); this.onError?.(e.data as number); },
        onStateChange: (e) => this.onState(e.data)
      }
    });
    this.poll = setInterval(() => this.watch(), 25);
  }

  private onState(state: number) {
    if (this.destroyed) return;
    const now = performance.now();
    if (state === YT.PlayerState.ENDED) this.set('ended');
    else if (state === YT.PlayerState.BUFFERING || state === YT.PlayerState.UNSTARTED) {
      // En el traspaso un buffering cortito es normal: no se muestra "esperando"
      if (this.wantPlaying && !this.inHandoffGrace(now)) this.set('waiting');
    } else if (state === YT.PlayerState.PLAYING && !this.wantPlaying && !this.priming) {
      // El video tiene que estar quieto (margen de inicio o pausa): YouTube a veces arranca
      // solo al hacer seekTo sobre un video recién cargado. Se vuelve a pausar.
      this.player?.pauseVideo();
    } else if (state === YT.PlayerState.PAUSED && this.wantPlaying && now > this.guardUntil) {
      // El juego nunca pausa sin bajar wantPlaying: esto lo hizo el jugador en el reproductor
      this.onTamper?.('pause');
    }
  }

  private inHandoffGrace(now: number) {
    return !!this.handoff && now < this.handoff.at + 1500;
  }

  /** Lee el video cada 25 ms: detecta cuándo parte de verdad, anuncios, buffering y saltos. */
  private watch() {
    if (!this.player || !this.ready || this.status === 'ended' || this.status === 'paused') return;
    if (this.priming) { this.watchPriming(); return; }
    if (!this.wantPlaying) return;
    const now = performance.now();
    const p = this.player;
    const yt = p.getCurrentTime?.() ?? 0;
    const state = p.getPlayerState?.();

    if (this.handoff) {
      const h = this.handoff;
      // El video partió: se calcula cuándo partió de verdad y se engancha el reloj ahí
      if (state === YT.PlayerState.PLAYING && yt > h.from + 0.015) {
        const startedAt = now - ((yt - h.from) * 1000) / this.rate;
        learnLatency((startedAt - h.calledAt) / 1000);
        const before = this.gameVideoTime(now);
        this.handoff = null;
        this.prerollUntil = 0;
        this.lastYt = yt;
        this.lastPerf = now;
        this.lastAdvance = now;
        // Lo que el juego iba adelantado/atrasado se corrige de a poco, sin salto
        this.corr = before - this.videoEstimate(now);
        this.guardUntil = now + 800;
        this.set('playing');
      } else if (now > h.at + 1500) {
        // No partió en 1,5 s: ahora sí es un anuncio o un corte de red
        this.set('waiting');
      }
      return;
    }

    // Salto en la barra de progreso: solo se revisa cuando el video venía corriendo normal
    if (this.status === 'playing' && now > this.guardUntil && Math.abs(yt - this.lastYt) > 2.5) {
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

  /**
   * Precarga: al empezar, el video se reproduce en silencio hasta que su tiempo avanza de verdad.
   * Si YouTube mete un anuncio, pasa acá (el juego muestra "Preparando el video"). Cuando ya corre
   * el video real, se pausa, vuelve a 0 y recién ahí parte el margen de inicio.
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

  /** Inicia: precarga (anuncios) → margen de inicio con las notas bajando → canción. */
  start() {
    if (!this.ready || !this.player || typeof this.player.seekTo !== 'function') { this.pendingStart = true; return; }
    if (!this.primed) {
      const p = this.player;
      this.priming = true;
      this.primeStarted = performance.now();
      this.wantPlaying = false;
      this.muteForUs();
      p.setPlaybackRate?.(this.rate);
      p.playVideo();
      this.set('waiting');
      return;
    }
    this.resume(-this.leadIn - this.offsetSec);
  }

  /** Estimación del tiempo del video a partir de la última lectura. */
  private videoEstimate(now: number) {
    return this.lastYt + ((now - this.lastPerf) / 1000) * this.rate;
  }

  /** Tiempo del juego en "tiempo de video" (sin restar el offset). */
  private gameVideoTime(now: number): number {
    if (this.prerollUntil) return -((this.prerollUntil - now) / 1000) * this.rate;
    if (this.handoff) {
      const h = this.handoff;
      // 'run': como si el video hubiera partido justo a tiempo · 'hold': quieto hasta que parta
      return h.mode === 'run' ? h.from + Math.max(0, ((now - h.at) / 1000) * this.rate) : h.from;
    }
    return this.videoEstimate(now) + this.corr;
  }

  time() {
    if (this.status === 'paused') return this.pausedAt;
    if (this.priming) return -this.leadIn - this.offsetSec;
    const now = performance.now();
    const dt = this.lastCall ? Math.min(0.1, (now - this.lastCall) / 1000) : 0;
    this.lastCall = now;

    if (this.prerollUntil) {
      const left = (this.prerollUntil - now) / 1000;
      // Play anticipado: se le da play justo lo que YouTube tarda en partir (aprendido)
      if (left <= kickLatency && !this.handoff) this.kick('run', 0, this.prerollUntil);
      if (left > 0) return -left * this.rate - this.offsetSec;
      this.prerollUntil = 0;
      if (!this.handoff) this.kick('run', 0, now);
    }

    if (!this.handoff && this.status !== 'playing') return this.lastYt - this.offsetSec;
    // El desfase se corrige a velocidad limitada: las notas aceleran o frenan un poquito, no saltan
    if (this.corr) {
      const step = SLEW * dt;
      this.corr = Math.abs(this.corr) <= step ? 0 : this.corr - Math.sign(this.corr) * step;
    }
    let g = this.gameVideoTime(now);
    // Las correcciones chicas del reproductor no hacen retroceder las notas
    if (g < this.mono && this.mono - g < 0.08) g = this.mono;
    this.mono = g;
    return g - this.offsetSec;
  }

  /**
   * Le da play al video (sin buscar si ya está en su lugar) y abre el traspaso.
   * `at`: momento (performance.now) en que el juego espera que el video parta.
   */
  private kick(mode: 'run' | 'hold', fromVideoSec: number, at: number) {
    const now = performance.now();
    this.handoff = { mode, at, from: fromVideoSec, calledAt: now };
    this.corr = 0;
    this.lastYt = fromVideoSec;
    this.lastPerf = now;
    this.lastAdvance = now;
    this.wantPlaying = true;
    this.guardUntil = now + 2000;
    if (this.ready && this.player) {
      const p = this.player;
      p.setPlaybackRate?.(this.rate);
      this.unmuteIfOurs();
      if (Math.abs((p.getCurrentTime?.() ?? 0) - fromVideoSec) > 0.05) p.seekTo(fromVideoSec, true);
      p.playVideo();
    }
    this.set('playing');
  }

  pause() {
    this.pausedAt = this.time();
    this.prerollUntil = 0;
    this.priming = false;
    this.handoff = null;
    this.corr = 0;
    this.wantPlaying = false;
    if (this.ready) this.player?.pauseVideo();
    this.set('paused');
  }

  /**
   * Durante el 3·2·1 al retomar: deja el video quieto, ya ubicado (y cargando) en el punto
   * desde donde se sigue, y las notas se muestran ahí. Así al llegar a 0 parte sin esperar.
   */
  prepare(from: number) {
    this.pausedAt = from;
    const v = from + this.offsetSec;
    if (!this.ready || !this.player) return;
    const p = this.player;
    this.guardUntil = performance.now() + 5000;
    p.pauseVideo();
    p.seekTo(Math.max(0, v), true);
    p.pauseVideo();
  }

  /** Retoma desde un tiempo de chart. Si cae antes del inicio del video, corre ese margen y luego parte en 0. */
  resume(from: number) {
    const v = from + this.offsetSec;
    // Si alguien retoma mientras se precargaba (p. ej. modo práctica), se salta la precarga
    this.priming = false;
    this.handoff = null;
    this.corr = 0;
    this.mono = -Infinity;
    this.lastCall = 0;
    if (v < 0) {
      this.lastYt = 0;
      this.wantPlaying = false;
      this.guardUntil = performance.now() + 1200;
      if (this.ready) this.holdAtStart();
      this.prerollUntil = performance.now() + (-v * 1000) / this.rate;
      this.set('playing');
      return;
    }
    this.prerollUntil = 0;
    // Las notas esperan quietas en `v` hasta que el video parta de verdad: sin tirón ni "esperando"
    this.kick('hold', v, performance.now());
  }

  private muteForUs() {
    const p = this.player;
    if (p && !this.mutedByUs && !p.isMuted?.()) { p.mute?.(); this.mutedByUs = true; }
  }

  private unmuteIfOurs() {
    if (this.mutedByUs) { this.player?.unMute?.(); this.mutedByUs = false; }
  }

  /**
   * Deja el video quieto y en silencio en el segundo 0 mientras corre el margen de inicio.
   * Ojo: seekTo sobre un video recién cargado lo hace sonar; por eso se silencia antes y
   * solo se busca el 0 si el video ya había avanzado (reiniciar la canción).
   */
  private holdAtStart() {
    const p = this.player;
    if (!p) return;
    this.muteForUs();
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

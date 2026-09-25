import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YouTubeClock } from '@/lib/game/clock';

/**
 * Reproductor de YouTube falso: simula anuncio, latencia al dar play y el tiempo del video.
 * Sirve para probar el arranque (precarga → margen → canción) sin internet.
 */
const S = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

class FakePlayer {
  t = 0; state = S.CUED; muted = false; adLeft: number; lag: number; startAt = -1;
  plays = 0; seeks: number[] = [];
  constructor(adSec: number, lagSec: number, private onState: (s: number) => void) { this.adLeft = adSec; this.lag = lagSec; }
  playVideo() { this.plays++; if (this.state !== S.PLAYING) { this.state = S.BUFFERING; this.startAt = performance.now() + this.lag * 1000; this.onState(S.BUFFERING); } }
  pauseVideo() { this.state = S.PAUSED; this.startAt = -1; this.onState(S.PAUSED); }
  seekTo(v: number) { this.t = v; this.seeks.push(v); }
  mute() { this.muted = true; } unMute() { this.muted = false; } isMuted() { return this.muted; }
  setPlaybackRate() {} getPlaybackRate() { return 1; }
  getCurrentTime() { return this.t; } getPlayerState() { return this.state; }
  /** Avanza el mundo dt segundos. */
  tick(dt: number) {
    if (this.state === S.BUFFERING && this.startAt >= 0 && performance.now() >= this.startAt) { this.state = S.PLAYING; this.onState(S.PLAYING); }
    if (this.state !== S.PLAYING) return;
    if (this.adLeft > 0) { this.adLeft -= dt; return; } // durante el anuncio el tiempo del video no avanza
    this.t += dt;
  }
}

function makeClock(adSec: number, lagSec: number, leadIn = 3) {
  const clock = Object.create(YouTubeClock.prototype) as YouTubeClock & Record<string, unknown>;
  Object.assign(clock, {
    status: 'ready', lastYt: 0, lastPerf: 0, lastAdvance: 0, wantPlaying: false, pausedAt: 0, mono: -Infinity,
    ready: true, destroyed: false, pendingStart: false, prerollUntil: 0, rate: 1, guardUntil: 0,
    mutedByUs: false, priming: false, primed: false, primeStarted: 0, handoff: null, corr: 0, lastCall: 0, recoveries: [],
    offsetSec: 0, leadIn
  });
  const player = new FakePlayer(adSec, lagSec, (s) => (clock as unknown as { onState(s: number): void }).onState(s));
  (clock as unknown as { player: unknown }).player = player;
  const statuses: string[] = [];
  clock.onStatus = (s) => statuses.push(s);
  return { clock, player, statuses, watch: () => (clock as unknown as { watch(): void }).watch() };
}

/** Corre la simulación a 60 cuadros por segundo y junta el tiempo del juego en cada cuadro. */
function run(sim: ReturnType<typeof makeClock>, seconds: number) {
  const times: number[] = [];
  const statuses: string[] = [];
  let sinceWatch = 0;
  for (let i = 0; i < seconds * 60; i++) {
    vi.advanceTimersByTime(1000 / 60);
    sim.player.tick(1 / 60);
    sinceWatch += 1000 / 60;
    if (sinceWatch >= 25) { sinceWatch = 0; sim.watch(); }
    times.push(sim.clock.time());
    statuses.push(sim.clock.status);
  }
  return { times, statuses };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance', 'Date'] });
  (globalThis as unknown as { YT: unknown }).YT = { PlayerState: S };
});
afterEach(() => vi.useRealTimers());

describe('YouTubeClock: arranque suave', () => {
  it('con anuncio: espera el anuncio, vuelve a 0 en silencio, corre el margen y parte sin saltos', () => {
    const sim = makeClock(5, 0.1);
    sim.clock.start();
    expect(sim.player.muted).toBe(true);
    const { times, statuses } = run(sim, 14);
    // Mientras dura el anuncio el juego no avanza (se queda al inicio del margen)
    expect(times[60]).toBeCloseTo(-3, 3);
    // Terminada la precarga el video volvió a 0
    expect(sim.player.seeks).toContain(0);
    // Al final ya suena y corre la canción
    expect(sim.player.muted).toBe(false);
    expect(times.at(-1)!).toBeGreaterThan(4);
    // El tiempo del juego nunca retrocede y no hay tirones grandes
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1] - 1e-9);
      expect(times[i] - times[i - 1]).toBeLessThan(0.1);
    }
    // Una vez que parte el margen, no vuelve a aparecer "esperando" en el traspaso a la canción
    const firstMove = times.findIndex((t) => t > -2.99);
    expect(statuses.slice(firstMove).includes('waiting')).toBe(false);
  });

  it('sin anuncio y con YouTube lento en partir: la canción entra sin mostrar "esperando"', () => {
    const sim = makeClock(0, 0.35);
    sim.clock.start();
    const { times, statuses } = run(sim, 8);
    const firstMove = times.findIndex((t) => t > -2.99);
    expect(statuses.slice(firstMove).includes('waiting')).toBe(false);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1] - 1e-9);
    // El reloj del juego y el video quedan alineados al final
    expect(Math.abs(times.at(-1)! - sim.player.t)).toBeLessThan(0.1);
  });

  it('el paso margen → canción es fluido: sin saltos ni frenazos, y termina alineado al video', () => {
    for (const lag of [0.05, 0.15, 0.3, 0.5]) {
      const sim = makeClock(0, lag);
      sim.clock.start();
      const { times } = run(sim, 8);
      const steps = times.slice(1).map((t, i) => t - times[i]).filter((_, i) => times[i] > -2.9);
      // Cada cuadro avanza entre ~0,6× y ~1,4× lo normal (1/60 s): nada de quedarse quieto o saltar
      for (const d of steps) {
        expect(d).toBeGreaterThan((1 / 60) * 0.6);
        expect(d).toBeLessThan((1 / 60) * 1.4);
      }
      expect(Math.abs(times.at(-1)! - sim.player.t)).toBeLessThan(0.03);
    }
  });

  it('al retomar tras el 3·2·1 las notas esperan al video y siguen sin retroceder ni "esperando"', () => {
    const sim = makeClock(0, 0.1);
    sim.clock.start();
    run(sim, 10);
    const tPause = sim.clock.time();
    sim.clock.pause();
    const from = tPause - 2;
    sim.clock.prepare(from);
    expect(sim.clock.time()).toBeCloseTo(from, 6);
    run(sim, 3); // la cuenta 3·2·1
    expect(sim.clock.time()).toBeCloseTo(from, 6);
    expect(sim.player.state).not.toBe(S.PLAYING);
    sim.clock.resume(from);
    const { times, statuses } = run(sim, 4);
    expect(statuses.includes('waiting')).toBe(false);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1] - 1e-9);
    expect(times[0]).toBeGreaterThanOrEqual(from - 1e-6);
    expect(Math.abs(times.at(-1)! - sim.player.t)).toBeLessThan(0.03);
  });
});

describe('YouTubeClock: clics sin querer en el reproductor', () => {
  /** Deja el reloj corriendo la canción, ya pasado el margen de inicio. */
  function corriendo() {
    const sim = makeClock(0, 0.05, 1);
    sim.clock.start();
    run(sim, 3);
    return sim;
  }

  it('si el jugador pausa el video por error, se repone solo y la partida no se corta', () => {
    const sim = corriendo();
    const recuperados: string[] = [];
    let pausasDelJuego = 0;
    sim.clock.onRecover = (k) => recuperados.push(k);
    sim.clock.onTamper = () => pausasDelJuego++;

    const antes = sim.clock.time();
    sim.player.pauseVideo();           // el clic sobre el video
    const despues = run(sim, 2);

    expect(recuperados).toEqual(['pause']);
    expect(pausasDelJuego).toBe(0);                       // el juego NO se pausó
    expect(sim.player.state).toBe(S.PLAYING);             // el video volvió a correr
    expect(despues.times[despues.times.length - 1]).toBeGreaterThan(antes); // el tiempo siguió
  });

  it('el tiempo del juego no retrocede ni se dispara al reponer', () => {
    const sim = corriendo();
    sim.player.pauseVideo();
    const { times } = run(sim, 2);
    let saltoAtras = 0;
    for (let i = 1; i < times.length; i++) if (times[i] < times[i - 1] - 0.001) saltoAtras++;
    expect(saltoAtras).toBe(0);
  });

  it('si alguien insiste, deja de reponer y ahí sí pausa el juego', () => {
    const sim = corriendo();
    let pausasDelJuego = 0;
    const recuperados: string[] = [];
    sim.clock.onRecover = (k) => recuperados.push(k);
    sim.clock.onTamper = () => pausasDelJuego++;

    for (let i = 0; i < 4; i++) { sim.player.pauseVideo(); run(sim, 1); }

    expect(recuperados.length).toBe(3);   // tres perdonadas
    expect(pausasDelJuego).toBe(1);       // la cuarta corta la partida
  });

  it('un salto en la barra también se repone solo', () => {
    const sim = corriendo();
    const recuperados: string[] = [];
    sim.clock.onRecover = (k) => recuperados.push(k);
    const antes = sim.clock.time();
    sim.player.t += 30;                    // alguien saltó 30 s adelante
    run(sim, 2);
    expect(recuperados).toEqual(['seek']);
    // El juego siguió desde donde iba, no desde el salto
    expect(sim.clock.time()).toBeLessThan(antes + 5);
  });
});

'use client';

/**
 * Entradas extra además del teclado: mandos / guitarras (Gamepad API) y MIDI (baterías, teclados).
 * Cada una se traduce a "carril N apretado/soltado".
 */

export type LaneHandler = (lane: number, down: boolean) => void;
export type ActionHandler = (action: 'boost' | 'pause') => void;

export interface InputMap {
  padButtons: (number | null)[];
  padBoost: number | null;
  padPause: number | null;
  midiNotes: (number | null)[];
  /** Eje de la palanca de trémolo en la guitarra (por defecto el 0). */
  padWhammyAxis?: number | null;
}

export class ExtraInputs {
  private prev = new Map<number, boolean[]>();
  private tilted = new Map<number, boolean>();
  private midi: MIDIAccess | null = null;
  private stopped = false;
  /**
   * Palanca de trémolo: 0 = quieta, 1 = a fondo. Sale del eje de la guitarra,
   * del pitch bend o del mod wheel en MIDI. SOLO llena energía, nunca da puntaje,
   * para que el que juega con teclado no quede en desventaja.
   */
  private whammyPad = 0;
  private whammyMidi = 0;
  private whammyMidiAt = 0;

  constructor(private map: InputMap, private onLane: LaneHandler, private onAction?: ActionHandler) {}

  /** Cuánta palanca hay ahora (0..1). El MIDI se desvanece si dejan de mandar mensajes. */
  whammy() {
    const midi = performance.now() - this.whammyMidiAt < 250 ? this.whammyMidi : 0;
    return Math.max(this.whammyPad, midi);
  }

  /** Llamar en cada frame: revisa los mandos conectados. */
  poll() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    let w = 0;
    for (const gp of navigator.getGamepads()) {
      if (!gp) continue;
      const before = this.prev.get(gp.index) ?? [];
      const now = gp.buttons.map((b) => b.pressed || b.value > 0.5);
      now.forEach((on, bi) => {
        if (on === (before[bi] ?? false)) return;
        const lane = this.map.padButtons.indexOf(bi);
        if (lane >= 0) this.onLane(lane, on);
        else if (on && bi === this.map.padBoost) this.onAction?.('boost');
        else if (on && bi === this.map.padPause) this.onAction?.('pause');
      });
      // Inclinar la guitarra (eje) también activa la energía
      const tilt = gp.axes[3] ?? gp.axes[2];
      const up = tilt !== undefined && tilt < -0.85;
      if (up && !this.tilted.get(gp.index)) this.onAction?.('boost');
      this.tilted.set(gp.index, up);
      // Palanca de trémolo: en las guitarras descansa en -1 y llega a +1 a fondo
      const wa = this.map.padWhammyAxis ?? 0;
      const raw = gp.axes[wa];
      if (raw !== undefined) w = Math.max(w, Math.min(1, Math.max(0, (raw + 1) / 2)));
      this.prev.set(gp.index, now);
    }
    this.whammyPad = w;
  }

  async startMidi() {
    if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) return false;
    try {
      this.midi = await navigator.requestMIDIAccess();
      if (this.stopped) return false;
      const attach = () => this.midi?.inputs.forEach((inp) => { inp.onmidimessage = (e) => this.onMidi(e); });
      attach();
      this.midi.onstatechange = attach;
      return true;
    } catch {
      return false;
    }
  }

  private onMidi(e: MIDIMessageEvent) {
    const d = e.data;
    if (!d || d.length < 3) return;
    const cmd = d[0] & 0xf0;
    // Pitch bend (0xE0) y mod wheel (CC 1) hacen de palanca de trémolo
    if (cmd === 0xe0) {
      const v = ((d[2] << 7) | d[1]) / 8192 - 1; // -1..1, centro 0
      this.whammyMidi = Math.min(1, Math.abs(v));
      this.whammyMidiAt = performance.now();
      return;
    }
    if (cmd === 0xb0 && d[1] === 1) {
      this.whammyMidi = Math.min(1, d[2] / 127);
      this.whammyMidiAt = performance.now();
      return;
    }
    const note = d[1];
    const lane = this.map.midiNotes.indexOf(note);
    if (lane < 0) return;
    if (cmd === 0x90 && d[2] > 0) {
      this.onLane(lane, true);
      // Las baterías mandan golpes cortos: soltamos solos para que no quede "apretado"
      setTimeout(() => this.onLane(lane, false), 60);
    } else if (cmd === 0x80 || (cmd === 0x90 && d[2] === 0)) this.onLane(lane, false);
  }

  stop() {
    this.stopped = true;
    this.midi?.inputs.forEach((inp) => { inp.onmidimessage = null; });
  }
}

/** Espera el próximo botón que se apriete en cualquier mando (para asignar en Ajustes). */
export function learnPadButton(timeoutMs = 8000): Promise<number | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const base = new Map<number, boolean[]>();
    for (const gp of navigator.getGamepads?.() ?? []) if (gp) base.set(gp.index, gp.buttons.map((b) => b.pressed));
    const tick = () => {
      for (const gp of navigator.getGamepads?.() ?? []) {
        if (!gp) continue;
        const b0 = base.get(gp.index) ?? [];
        const hit = gp.buttons.findIndex((b, i) => b.pressed && !b0[i]);
        if (hit >= 0) { resolve(hit); return; }
        base.set(gp.index, gp.buttons.map((b) => b.pressed));
      }
      if (performance.now() - start > timeoutMs) { resolve(null); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Espera la próxima nota MIDI tocada (para asignar en Ajustes). */
export async function learnMidiNote(timeoutMs = 8000): Promise<number | null> {
  if (!('requestMIDIAccess' in navigator)) return null;
  const access = await navigator.requestMIDIAccess().catch(() => null);
  if (!access) return null;
  return new Promise((resolve) => {
    const done = (v: number | null) => { access.inputs.forEach((i) => { i.onmidimessage = null; }); clearTimeout(timer); resolve(v); };
    const timer = setTimeout(() => done(null), timeoutMs);
    access.inputs.forEach((inp) => {
      inp.onmidimessage = (e) => { const d = e.data; if (d && (d[0] & 0xf0) === 0x90 && d[2] > 0) done(d[1]); };
    });
  });
}

export function connectedPads(): string[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  return [...navigator.getGamepads()].filter(Boolean).map((g) => g!.id);
}

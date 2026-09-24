import { describe, expect, it } from 'vitest';
import { DEMO_CHARTS } from '@/lib/data/demo';
import { replay, validateLog, type Input } from '@/supabase/functions/_shared/replay';
import { botEvents, playClient } from './sim';

/**
 * El servidor rehace la partida con el registro de teclas: tiene que llegar al mismo resultado
 * que el navegador. (Charts sin técnicas: esas siguen en fase de prueba solo en el cliente.)
 */
const chart = DEMO_CHARTS[0];
const notes = chart.difficulties.expert!.notes.map((n) => ({ t: n.t, lane: n.lane, len: n.len }));
const dur = chart.durationSec;

function both(err: number, pauseAt?: number, opts = { ghostPenalty: true }) {
  const client = playClient(notes, dur, botEvents(notes, err), opts, pauseAt);
  const server = replay(notes, dur, client.inputLog as Input[], opts);
  return { client, server };
}

describe('replay del servidor (submit-score)', () => {
  it('da el mismo resultado que el navegador en una partida limpia', () => {
    const { client, server } = both(0.01);
    expect(server.hit).toBe(client.hit);
    expect(server.miss).toBe(client.miss);
    expect(server.accuracy).toBeCloseTo(client.accuracy, 6);
    expect(Math.abs(server.score - client.score)).toBeLessThanOrEqual(client.score * 0.01);
  });

  it('acepta y rehace igual una partida con pausa (el tiempo vuelve 2 s atrás)', () => {
    const { client, server } = both(0.02, 30);
    expect(validateLog(client.inputLog, dur + 10)).toBeNull();
    expect(server.hit).toBe(client.hit);
    expect(server.accuracy).toBeCloseTo(client.accuracy, 6);
    expect(Math.abs(server.score - client.score)).toBeLessThanOrEqual(client.score * 0.01);
  });

  it('el puntaje del cliente pasa el control de 5 %', () => {
    const { client, server } = both(0.03, 45);
    expect(client.score).toBeLessThanOrEqual(server.score * 1.05 + 500);
  });
});

describe('validateLog', () => {
  const ok: Input[] = [[1, 0, 1], [1.1, 0, 0], [2, -1, 2]];
  it('acepta un registro normal', () => expect(validateLog(ok, 100)).toBeNull());
  it('rechaza vacío o que no sea arreglo', () => {
    expect(validateLog([], 100)).not.toBeNull();
    expect(validateLog('x', 100)).not.toBeNull();
  });
  it('rechaza tiempo hacia atrás sin marca de pausa', () => {
    expect(validateLog([[5, 0, 1], [3, 0, 0]], 100)).toBe('Registro fuera de orden');
  });
  it('acepta tiempo hacia atrás justo en la marca de pausa', () => {
    expect(validateLog([[5, 0, 1], [3, -1, 3], [3.5, 0, 1]], 100)).toBeNull();
  });
  it('rechaza valores que no son números finitos o códigos raros', () => {
    expect(validateLog([['1', 0, 1]], 100)).not.toBeNull();
    expect(validateLog([[1, 0.5, 1]], 100)).not.toBeNull();
    expect(validateLog([[1, 0, 7]], 100)).not.toBeNull();
    expect(validateLog([[1, 0, 3]], 100)).not.toBeNull(); // pausa con carril
    expect(validateLog([[1, 9, 1]], 100)).not.toBeNull();
    expect(validateLog([[500, 0, 1]], 100)).not.toBeNull();
  });
  it('limita la cantidad de pausas', () => {
    const many: Input[] = Array.from({ length: 101 }, (_, i) => [i, -1, 3]);
    expect(validateLog(many, 1000)).toBe('Demasiadas pausas');
  });
});

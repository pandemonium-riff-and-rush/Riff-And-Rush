/**
 * submit-score — valida una partida en el servidor.
 *
 * El navegador manda el registro de teclas (a qué milisegundo apretó y soltó cada carril).
 * Acá se vuelve a jugar la partida con las notas reales del chart y se calcula el puntaje.
 * El puntaje que se guarda es el del servidor, no el que dijo el cliente.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

interface Note { t: number; lane: number; len: number }
type Input = [number, number, number]; // [tiempo, carril, 1 apreta / 0 suelta / 2 energía]

const DIFFS = ['easy', 'medium', 'hard', 'expert', 'legend'];

/** Misma lógica de puntaje que el juego (lib/game/engine.ts). */
class Scorer {
  notes: (Note & { state: number; holding: boolean; heldUntil: number })[];
  score = 0; combo = 0; maxCombo = 0; perfect = 0; good = 0; miss = 0; ghosts = 0;
  energy = 0; boostUntil = -1; lastTime = 0;
  private cursor = 0;
  private lastHitAt = [-99, -99, -99, -99, -99, -99];

  constructor(notes: Note[], private durationSec: number, private opts: { precision?: boolean; ghostPenalty?: boolean; dropless?: boolean }) {
    this.notes = [...notes].sort((a, b) => a.t - b.t || a.lane - b.lane).map((n) => ({ ...n, state: 0, holding: false, heldUntil: 0 }));
  }
  get wPerfect() { return this.opts.precision ? 0.035 : 0.05; }
  get wGood() { return this.opts.precision ? 0.07 : 0.1; }
  get wMiss() { return this.opts.precision ? 0.1 : 0.14; }
  get total() { return this.notes.length; }
  get hit() { return this.perfect + this.good; }
  get boosting() { return this.boostUntil > this.lastTime; }
  get multiplier() { const base = Math.min(4, 1 + Math.floor(this.combo / 10)); return this.boosting ? base * 2 : base; }
  get accuracy() { const j = this.perfect + this.good + this.miss; return j ? (this.perfect + this.good * 0.6) / j : 1; }
  stars() { const a = this.accuracy * 100; return a >= 98 ? 5 : a >= 93 ? 4 : a >= 85 ? 3 : a >= 70 ? 2 : 1; }

  private register(n: Scorer['notes'][number], j: 'perfect' | 'good' | 'miss', t: number) {
    if (j === 'miss') { n.state = 2; this.miss++; this.combo = 0; return; }
    n.state = 1;
    this.lastHitAt[n.lane] = t;
    if (j === 'perfect') this.perfect++; else this.good++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += (j === 'perfect' ? 50 : 35) * this.multiplier;
    this.energy = Math.min(1, this.energy + (j === 'perfect' ? 0.012 : 0.006));
    if (n.len > 0) { n.holding = true; n.heldUntil = n.t; }
  }

  update(t: number, held: boolean[]) {
    this.lastTime = t;
    while (this.cursor < this.notes.length && this.notes[this.cursor].state !== 0) this.cursor++;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t > t) break;
      if (n.state === 0 && t - n.t > this.wMiss) this.register(n, 'miss', t);
    }
    for (let i = Math.max(0, this.cursor - 64); i < this.notes.length && this.notes[i].t <= t; i++) {
      const n = this.notes[i];
      if (!n.holding) continue;
      const end = n.t + n.len;
      if (!held[n.lane]) { n.holding = false; if (this.opts.dropless && end - t > 0.1) this.combo = 0; continue; }
      const upto = Math.min(t, end);
      if (upto > n.heldUntil) { this.score += Math.round((upto - n.heldUntil) * 60 * this.multiplier); n.heldUntil = upto; }
      if (t >= end) n.holding = false;
    }
    if (this.boosting) this.energy = Math.max(0, (this.boostUntil - t) / 8);
  }

  press(lane: number, t: number) {
    let best: Scorer['notes'][number] | null = null;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t - t > this.wMiss) break;
      if (n.state !== 0 || n.lane !== lane) continue;
      if (Math.abs(n.t - t) <= this.wMiss && (!best || Math.abs(n.t - t) < Math.abs(best.t - t))) best = n;
    }
    if (!best) {
      if (!this.opts.ghostPenalty || t < 0) return;
      if (t - this.lastHitAt[lane] < 0.09) return;
      for (let i = Math.max(0, this.cursor - 16); i < this.notes.length && this.notes[i].t <= t; i++) if (this.notes[i].holding && this.notes[i].lane === lane) return;
      this.ghosts++; this.combo = 0;
      return;
    }
    const d = Math.abs(t - best.t);
    this.register(best, d <= this.wPerfect ? 'perfect' : d <= this.wGood ? 'good' : 'miss', t);
  }

  activateBoost(t: number) {
    if (this.energy < 0.5 || this.boosting) return;
    this.boostUntil = t + 8 * this.energy;
  }
}

function replay(notes: Note[], durationSec: number, log: Input[], opts: { precision?: boolean; ghostPenalty?: boolean; dropless?: boolean }) {
  const s = new Scorer(notes, durationSec, opts);
  const held = [false, false, false, false, false, false];
  const STEP = 1 / 60;
  let t = Math.min(0, log[0]?.[0] ?? 0);
  for (const [it, lane, code] of log) {
    while (t + STEP < it) { t += STEP; s.update(t, held); }
    t = it;
    s.update(t, held);
    if (code === 2) s.activateBoost(t);
    else if (lane >= 0 && lane < 6) {
      if (code === 1) { held[lane] = true; s.press(lane, t); }
      else { held[lane] = false; }
    }
  }
  const end = durationSec + 5;
  while (t + STEP < end) { t += STEP; s.update(t, held); }
  s.update(end, held);
  return s;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, service, { auth: { persistSession: false } });

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return json({ error: 'Necesitas iniciar sesión' }, 401);

  let body: { chartId?: string; difficulty?: string; inputLog?: Input[]; mods?: { precision?: boolean; mirror?: boolean; dropless?: boolean }; clientScore?: number };
  try { body = await req.json(); } catch { return json({ error: 'Cuerpo inválido' }, 400); }

  const chartId = String(body.chartId ?? '');
  const difficulty = String(body.difficulty ?? '');
  const log = Array.isArray(body.inputLog) ? body.inputLog : [];
  if (!chartId || !DIFFS.includes(difficulty)) return json({ error: 'Datos incompletos' }, 400);
  if (log.length > 30000) return json({ error: 'Registro demasiado largo' }, 400);
  for (let i = 1; i < log.length; i++) if (log[i][0] < log[i - 1][0] - 0.001) return json({ error: 'Registro fuera de orden' }, 400);

  // Notas reales del chart: primero las canciones de la casa, si no el chart publicado
  let notes: Note[] | null = null;
  let durationSec = 0;
  let endSec = 0;
  let lanes = 5;
  const { data: house } = await admin.from('house_charts').select('data').eq('id', chartId).maybeSingle();
  if (house?.data?.d?.[difficulty]) {
    const d = house.data.d[difficulty];
    lanes = d.lanes ?? 5;
    durationSec = house.data.durationSec ?? 0;
    endSec = house.data.endSec ?? 0;
    notes = (d.n as [number, number, number][]).map(([t, lane, len]) => ({ t: t / 1000, lane, len: len / 1000 }));
  } else {
    const { data: chart } = await admin.from('charts').select('data, published, verified').eq('id', chartId).maybeSingle();
    const dc = chart?.data?.difficulties?.[difficulty];
    if (dc) {
      lanes = dc.lanes ?? 5;
      durationSec = chart!.data.durationSec ?? 0;
      endSec = chart!.data.endSec ?? 0;
      notes = dc.notes as Note[];
    }
  }
  if (!notes || !notes.length) return json({ error: 'No encontramos ese chart en el servidor' }, 404);

  // El chart puede terminar antes que el video (créditos): se juega solo hasta ahí
  const end = endSec > 0 ? Math.min(endSec, durationSec) : durationSec;
  notes = notes.filter((n) => n.t <= end + 0.02);
  if (!notes.length) return json({ error: 'El chart no tiene notas antes del final' }, 400);

  const maxT = end + 10;
  for (const [t, lane] of log) if (t < -15 || t > maxT || lane < -1 || lane > 5) return json({ error: 'Registro inválido' }, 400);

  const play = body.mods?.mirror ? notes.map((n) => ({ ...n, lane: lanes - 1 - n.lane })) : notes;
  const s = replay(play, end, log, {
    precision: !!body.mods?.precision,
    dropless: !!body.mods?.dropless,
    ghostPenalty: difficulty !== 'easy'
  });

  const claimed = Number(body.clientScore ?? 0);
  if (claimed > s.score * 1.05 + 500) {
    return json({ error: 'El puntaje no calza con la partida', serverScore: s.score, claimed }, 409);
  }

  const { data: inserted, error } = await admin.from('scores').insert({
    user_id: user.id,
    chart_id: chartId,
    difficulty,
    score: s.score,
    accuracy: Math.min(1, Math.max(0, s.accuracy)),
    stars: s.stars(),
    max_combo: s.maxCombo,
    input_log: log.length <= 6000 ? log : null,
    verified: true
  }).select('xp_gained').single();

  if (error) return json({ error: error.message }, 400);
  return json({ ok: true, score: s.score, accuracy: s.accuracy, stars: s.stars(), maxCombo: s.maxCombo, hit: s.hit, total: s.total, xp: inserted?.xp_gained ?? 0 });
});

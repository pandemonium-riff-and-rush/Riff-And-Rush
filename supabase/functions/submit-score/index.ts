/**
 * submit-score — valida una partida en el servidor.
 *
 * El navegador manda el registro de teclas (a qué milisegundo apretó y soltó cada carril)
 * y el id de la sesión de partida que pidió al empezar (RPC start_play).
 * Acá se vuelve a jugar la partida con las notas reales del chart y se calcula el puntaje.
 * El puntaje que se guarda es el del servidor, no el que dijo el cliente.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DIFFS, replay, validateLog, type Input, type Note } from '../_shared/replay.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MOD_IDS = ['precision', 'mirror', 'dropless'] as const;
/** Una partida no puede subirse más rápido que esta fracción de lo que dura el tramo con notas. */
const MIN_REAL_TIME = 0.9;
/** Las sesiones vencen a las 3 horas (margen de sobra para pausas y anuncios). */
const SESSION_TTL_MS = 3 * 60 * 60 * 1000;

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

  let body: { chartId?: string; difficulty?: string; sessionId?: string; inputLog?: unknown; mods?: Record<string, unknown>; clientScore?: number };
  try { body = await req.json(); } catch { return json({ error: 'Cuerpo inválido' }, 400); }

  const chartId = String(body.chartId ?? '');
  const difficulty = String(body.difficulty ?? '');
  const sessionId = String(body.sessionId ?? '');
  if (!chartId || !DIFFS.includes(difficulty) || !/^[0-9a-f-]{36}$/i.test(sessionId)) return json({ error: 'Datos incompletos' }, 400);
  const mods = MOD_IDS.filter((m) => body.mods?.[m] === true);

  // Notas reales del chart: primero las canciones de la casa, si no un chart publicado (o propio)
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
    const { data: chart } = await admin.from('charts').select('data, published, owner').eq('id', chartId).maybeSingle();
    if (chart && !chart.published && chart.owner !== user.id) return json({ error: 'Ese chart no está publicado' }, 403);
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

  const bad = validateLog(body.inputLog, end + 10);
  if (bad) return json({ error: bad }, 400);
  const log = body.inputLog as Input[];

  // Sesión de partida: tiene que ser tuya, de este chart, sin usar y con tiempo real suficiente
  const { data: session } = await admin.from('play_sessions')
    .select('id, user_id, chart_id, difficulty, started_at, used_at').eq('id', sessionId).maybeSingle();
  if (!session || session.user_id !== user.id || session.chart_id !== chartId || session.difficulty !== difficulty) {
    return json({ error: 'Sesión de partida inválida' }, 403);
  }
  if (session.used_at) return json({ error: 'Esta partida ya se subió' }, 409);
  const elapsedMs = Date.now() - new Date(session.started_at).getTime();
  if (elapsedMs > SESSION_TTL_MS) return json({ error: 'La sesión de partida venció' }, 403);
  const first = Math.max(0, notes.reduce((a, n) => Math.min(a, n.t), Infinity));
  const last = notes.reduce((a, n) => Math.max(a, n.t + n.len), 0);
  if (elapsedMs < (last - first) * 1000 * MIN_REAL_TIME) return json({ error: 'La partida terminó demasiado rápido' }, 400);

  // Se marca usada de forma atómica: si dos envíos llegan a la vez, solo uno pasa
  const { data: claimed } = await admin.from('play_sessions')
    .update({ used_at: new Date().toISOString() }).eq('id', sessionId).is('used_at', null).select('id');
  if (!claimed?.length) return json({ error: 'Esta partida ya se subió' }, 409);

  const play = mods.includes('mirror') ? notes.map((n) => ({ ...n, lane: lanes - 1 - n.lane })) : notes;
  const s = replay(play, end, log, {
    precision: mods.includes('precision'),
    dropless: mods.includes('dropless'),
    ghostPenalty: difficulty !== 'easy'
  });

  const clientScore = Number(body.clientScore ?? 0);
  if (clientScore > s.score * 1.05 + 500) {
    return json({ error: 'El puntaje no calza con la partida', serverScore: s.score, claimed: clientScore }, 409);
  }

  const { data: inserted, error } = await admin.from('scores').insert({
    user_id: user.id,
    chart_id: chartId,
    difficulty,
    score: s.score,
    accuracy: Math.min(1, Math.max(0, s.accuracy)),
    stars: s.stars(),
    max_combo: s.maxCombo,
    mods,
    session_id: sessionId,
    input_log: log.length <= 6000 ? log : null,
    verified: true
  }).select('xp_gained').single();

  if (error) return json({ error: error.message }, 400);
  return json({ ok: true, score: s.score, accuracy: s.accuracy, stars: s.stars(), maxCombo: s.maxCombo, hit: s.hit, total: s.total, xp: inserted?.xp_gained ?? 0 });
});

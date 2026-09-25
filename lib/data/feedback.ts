'use client';

import { sb } from '../supabase/client';

/**
 * Opiniones de los jugadores. Sin un botón acá adentro no llega ninguna:
 * nadie va a abrir el correo para contar que una canción va desfasada.
 */

/** Guarda lo que escribió alguien. Devuelve un mensaje de error o null si salió bien. */
export async function sendFeedback(texto: string, pagina: string, contacto?: string): Promise<string | null> {
  const t = texto.trim();
  if (t.length < 4) return 'Escribe un poco más.';
  const c = sb();
  if (!c) return 'Ahora mismo no se puede enviar. Inténtalo más tarde.';
  const agent = typeof navigator === 'undefined' ? null : navigator.userAgent.slice(0, 200);
  try {
    const { error } = await c.rpc('send_feedback', {
      p_texto: t.slice(0, 1000),
      p_pagina: pagina.slice(0, 200),
      p_contacto: contacto?.trim() ? contacto.trim().slice(0, 120) : null,
      p_agent: agent
    });
    if (error) return error.message || 'No se pudo enviar.';
    return null;
  } catch {
    // Sin internet o con el servidor caído, "Failed to fetch" no le dice nada a nadie
    return 'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.';
  }
}

/* ---------- Lectura para el panel de revisión (solo admin) ---------- */

export interface FeedbackRow {
  id: number;
  at: string;
  texto: string;
  pagina: string | null;
  contacto: string | null;
  autor: string | null;
  leido: boolean;
}

export async function fetchFeedback(soloNuevas = false): Promise<FeedbackRow[]> {
  const c = sb();
  if (!c) return [];
  const { data, error } = await c.rpc('feedback_list', { p_solo_nuevas: soloNuevas, p_limite: 200 });
  if (error) { console.warn('[riff]', error.message); return []; }
  return ((data ?? []) as FeedbackRow[]).map((r) => ({ ...r, id: Number(r.id) }));
}

export async function markFeedback(id: number, leido = true): Promise<boolean> {
  const c = sb();
  if (!c) return false;
  const { error } = await c.rpc('feedback_mark', { p_id: id, p_leido: leido });
  if (error) { console.warn('[riff]', error.message); return false; }
  return true;
}

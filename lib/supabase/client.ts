'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Se configura con .env.local (ver .env.local.example). Sin esas variables el juego
// funciona en modo invitado: todo queda en el navegador y no hay cuentas ni rankings reales.
// La publishable key es pública por diseño; la seguridad la ponen las reglas RLS de la base.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** true si el .env.local tiene la URL y la clave pública de Supabase. */
export const supabaseConfigured = Boolean(URL && KEY);

let client: SupabaseClient | null = null;

/** Cliente de Supabase del navegador (null si falta configurarlo o si estamos en el servidor). */
export function sb(): SupabaseClient | null {
  if (!supabaseConfigured || typeof window === 'undefined') return null;
  if (!client) {
    client = createClient(URL!, KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
    });
  }
  return client;
}

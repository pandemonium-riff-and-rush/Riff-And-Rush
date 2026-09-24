'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Proyecto Riff&Rush. La publishable key es pública por diseño (va en el navegador);
// la seguridad la ponen las reglas RLS de la base. Se puede sobrescribir con .env.local.
const DEFAULT_URL = 'https://kudejksuvlrfwaspnwkr.supabase.co';
const DEFAULT_KEY = 'sb_publishable_9-dZRxLNJsTRJ1jNI0MVQw_-95mIQE3';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_KEY;

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

'use client';

import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { sb, supabaseConfigured } from '../supabase/client';

export interface Profile {
  id: string;
  username: string | null;
  color: string;
  country: string | null;
  xp: number;
  level: number;
  plays: number;
  is_supporter: boolean;
  is_admin?: boolean;
  created_at: string;
}

interface AuthState {
  /** true si hay Supabase configurado en .env.local */
  configured: boolean;
  /** true mientras se revisa si hay sesión guardada */
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  /** true si llegó desde el correo de "olvidé mi contraseña" */
  recovering: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  configured: false, loading: false, user: null, profile: null, recovering: false,
  refreshProfile: async () => undefined, signOut: async () => undefined
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [recovering, setRecovering] = useState(false);

  const loadProfile = useCallback(async (uid: string | undefined) => {
    const c = sb();
    if (!c || !uid) { setProfile(null); return; }
    const { data } = await c.from('profiles').select('*').eq('id', uid).maybeSingle();
    setProfile((data as Profile) ?? null);
  }, []);

  useEffect(() => {
    const c = sb();
    if (!c) { setLoading(false); return; }
    let alive = true;
    c.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (alive) setLoading(false);
    });
    const { data: sub } = c.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      // Diferido: no se deben hacer llamadas a Supabase dentro del callback
      setTimeout(() => { loadProfile(s?.user.id); }, 0);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const value = useMemo<AuthState>(() => ({
    configured: supabaseConfigured,
    loading,
    user: session?.user ?? null,
    profile,
    recovering,
    refreshProfile: () => loadProfile(session?.user.id),
    signOut: async () => { await sb()?.auth.signOut(); setProfile(null); setRecovering(false); }
  }), [loading, session, profile, recovering, loadProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

/* ---------- Niveles (misma fórmula que en la base de datos) ---------- */

export const levelForXp = (xp: number) => Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
export const xpForLevel = (level: number) => 50 * (level - 1) ** 2;

/** Progreso dentro del nivel actual (0..1) y xp que faltan. */
export function levelProgress(xp: number) {
  const lvl = levelForXp(xp);
  const a = xpForLevel(lvl), b = xpForLevel(lvl + 1);
  return { level: lvl, progress: (xp - a) / (b - a), toNext: b - xp, nextAt: b };
}

/** XP que da una partida (misma fórmula que el trigger on_score_insert). */
export function xpForPlay(diff: string, stars: number, score: number) {
  const bonus = ({ easy: 0, medium: 5, hard: 10, expert: 15 } as Record<string, number>)[diff] ?? 20;
  return 10 + bonus + stars * 5 + Math.min(Math.floor(score / 5000), 40);
}

/* ---------- Datos para mostrar al jugador (con o sin cuenta) ---------- */

export interface Me {
  loggedIn: boolean;
  name: string;
  initials: string;
  color: string;
  level: number;
  xp: number;
  country: string | null;
}

export function initialsOf(name: string) {
  const parts = name.replace(/[_.]+/g, ' ').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase();
}

export function useMe(): Me {
  const { user, profile } = useAuth();
  if (user && profile) {
    const name = profile.username ?? 'sin_nombre';
    return { loggedIn: true, name, initials: initialsOf(name), color: profile.color, level: profile.level, xp: profile.xp, country: profile.country };
  }
  return { loggedIn: false, name: 'Invitado', initials: 'IN', color: '#332C5C', level: 1, xp: 0, country: null };
}

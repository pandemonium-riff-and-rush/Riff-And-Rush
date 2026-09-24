'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { sb } from '@/lib/supabase/client';
import { usernameAvailable } from '@/lib/data/cloud';

type Mode = 'login' | 'signup' | 'magic' | 'reset';

const USER_RE = /^[A-Za-z0-9_.]{3,20}$/;

function translate(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Falta confirmar tu correo: revisa tu bandeja (y spam).';
  if (m.includes('already registered')) return 'Ese correo ya tiene cuenta. Prueba entrando.';
  if (m.includes('password should be')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (m.includes('rate limit') || m.includes('security purposes')) return 'Demasiados intentos. Espera un minuto y prueba de nuevo.';
  if (m.includes('provider is not enabled')) return 'Ese método de acceso aún no está activado en Supabase.';
  return msg;
}

export default function SignIn() {
  const router = useRouter();
  const { configured, user, loading } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => { if (!loading && user) router.replace('/cuenta'); }, [loading, user, router]);

  const redirect = () => window.location.origin + '/cuenta';

  const oauth = async (provider: 'google' | 'discord') => {
    setErr('');
    const { error } = await sb()!.auth.signInWithOAuth({ provider, options: { redirectTo: redirect() } });
    if (error) setErr(translate(error.message));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = sb();
    if (!c) return;
    setErr(''); setOk(''); setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await c.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace('/cuenta');
      } else if (mode === 'signup') {
        if (!USER_RE.test(username)) throw new Error('El nombre debe tener 3 a 20 caracteres: letras, números, _ o .');
        if (!(await usernameAvailable(username))) throw new Error('Ese nombre ya está tomado.');
        const { data, error } = await c.auth.signUp({ email, password, options: { data: { username }, emailRedirectTo: redirect() } });
        if (error) throw error;
        if (data.session) router.replace('/cuenta');
        else setOk('¡Listo! Te mandamos un correo para confirmar la cuenta. Ábrelo desde este mismo navegador.');
      } else if (mode === 'magic') {
        const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect() } });
        if (error) throw error;
        setOk('Te mandamos un link para entrar. Revisa tu correo (y spam).');
      } else {
        const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: redirect() });
        if (error) throw error;
        setOk('Si el correo tiene cuenta, te llegará un link para crear una contraseña nueva.');
      }
    } catch (e2) {
      setErr(translate((e2 as Error).message));
    } finally {
      setBusy(false);
    }
  };

  if (!configured) {
    return (
      <main className="page col" style={{ maxWidth: 640, gap: 16 }}>
        <h1 className="disp" style={{ fontSize: 40 }}>Cuentas no configuradas</h1>
        <p className="muted">Falta conectar Supabase. Copia <code>.env.local.example</code> como <code>.env.local</code>, pega la URL y la publishable key de tu proyecto y reinicia <code>npm run dev</code>.</p>
        <p className="muted">Mientras tanto puedes jugar como invitado: tus récords y charts quedan guardados en este navegador.</p>
        <Link href="/canciones" className="btn btn-p" style={{ alignSelf: 'flex-start' }}>Jugar como invitado</Link>
      </main>
    );
  }

  const titles: Record<Mode, string> = { login: 'Entrar', signup: 'Crear cuenta', magic: 'Entrar con link', reset: 'Recuperar contraseña' };

  return (
    <main className="page" style={{ display: 'flex', justifyContent: 'center', paddingTop: 48 }}>
      <section className="panel col" style={{ width: '100%', maxWidth: 440, padding: 32, gap: 18, borderColor: 'var(--accent)', boxShadow: '6px 6px 0 #000' }}>
        <div className="col" style={{ gap: 6 }}>
          <h1 className="disp" style={{ fontSize: 40, lineHeight: '44px' }}>{titles[mode]}</h1>
          <span className="muted small">Guarda tus récords, sube de nivel, compite en los rankings y publica tus charts.</span>
        </div>

        {(mode === 'login' || mode === 'signup') && (
          <>
            <div className="col" style={{ gap: 10 }}>
              <button type="button" className="btn btn-s" onClick={() => oauth('google')} style={{ gap: 10 }}>
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>
                Seguir con Google
              </button>
              <button type="button" className="btn btn-s" onClick={() => oauth('discord')} style={{ gap: 10 }}>
                <svg width="20" height="16" viewBox="0 0 71 55" aria-hidden="true"><path fill="#5865F2" d="M60.1 4.9A58.5 58.5 0 0045.6.4a40 40 0 00-1.9 3.8 54 54 0 00-16.2 0A39 39 0 0025.6.4 58.4 58.4 0 0011 4.9C1.6 18.7-1 32.2.3 45.5a58.9 58.9 0 0018 9.1 43 43 0 003.8-6.2 38 38 0 01-6-2.9l1.5-1.1a42 42 0 0036 0l1.5 1.1a38 38 0 01-6 2.9 42 42 0 003.8 6.2 58.7 58.7 0 0018-9.1c1.5-15.4-2.6-28.8-10.8-40.6zM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2z"/></svg>
                Seguir con Discord
              </button>
            </div>
            <div className="row small muted" style={{ gap: 12 }}><span className="grow" style={{ height: 1, background: 'var(--border)' }} />o con tu correo<span className="grow" style={{ height: 1, background: 'var(--border)' }} /></div>
          </>
        )}

        <form className="col" style={{ gap: 12 }} onSubmit={submit}>
          {mode === 'signup' && (
            <label className="col" style={{ gap: 6 }}>
              <span className="label">Nombre de jugador</span>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} placeholder="riffmaster_cl" maxLength={20} required autoComplete="username" />
              <span className="small muted">Así sales en los rankings. 3–20 caracteres: letras, números, _ o .</span>
            </label>
          )}
          <label className="col" style={{ gap: 6 }}>
            <span className="label">Correo</span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="tu@correo.com" />
          </label>
          {(mode === 'login' || mode === 'signup') && (
            <label className="col" style={{ gap: 6 }}>
              <span className="label">Contraseña</span>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            </label>
          )}
          {err && <div role="alert" className="small" style={{ color: 'var(--hot-soft)' }}>{err}</div>}
          {ok && <div role="status" className="small" style={{ color: 'var(--ok)' }}>{ok}</div>}
          <button className="btn btn-p" type="submit" disabled={busy}>{busy ? 'Un momento…' : titles[mode]}</button>
        </form>

        <div className="col small" style={{ gap: 8 }}>
          {mode === 'login' && <>
            <span className="muted">¿No tienes cuenta? <button type="button" className="linkish" onClick={() => setMode('signup')}>Créala gratis</button></span>
            <span className="muted"><button type="button" className="linkish" onClick={() => setMode('magic')}>Entrar sin contraseña</button> · <button type="button" className="linkish" onClick={() => setMode('reset')}>Olvidé mi contraseña</button></span>
          </>}
          {mode !== 'login' && <span className="muted">¿Ya tienes cuenta? <button type="button" className="linkish" onClick={() => setMode('login')}>Entrar</button></span>}
        </div>
        <Link href="/canciones" className="small muted">Seguir como invitado →</Link>
      </section>
    </main>
  );
}

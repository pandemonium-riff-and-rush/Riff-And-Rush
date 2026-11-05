'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { initialsOf, levelProgress, useAuth } from '@/lib/auth/AuthProvider';
import { sb } from '@/lib/supabase/client';
import { usernameAvailable } from '@/lib/data/cloud';

const USER_RE = /^[A-Za-z0-9_.]{3,20}$/;
const AVATAR_COLORS = ['#ff3d8b', '#d41f6a', '#3DDC84', '#FF4D6D', '#FFD23F', '#3FA9FF', '#FF8A3D', '#B26BFF', '#14B8A6', '#c3bfb5'];
const COUNTRIES = ['Chile', 'Argentina', 'Bolivia', 'Brasil', 'Colombia', 'Costa Rica', 'Cuba', 'Ecuador', 'El Salvador', 'España', 'Estados Unidos', 'Guatemala', 'Honduras', 'México', 'Nicaragua', 'Panamá', 'Paraguay', 'Perú', 'Puerto Rico', 'República Dominicana', 'Uruguay', 'Venezuela', 'Otro'];

export default function Account() {
  const router = useRouter();
  const { configured, loading, user, profile, recovering, refreshProfile, signOut } = useAuth();
  const [username, setUsername] = useState('');
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [country, setCountry] = useState('');
  const [newPass, setNewPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [passMsg, setPassMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!profile) return;
    setUsername(profile.username ?? '');
    setColor(profile.color);
    setCountry(profile.country ?? '');
  }, [profile]);

  if (!configured) return <main className="page"><p className="muted">Supabase no está configurado. <Link href="/entrar">Ver cómo</Link>.</p></main>;
  if (loading) return <main className="page"><p className="muted">Cargando tu cuenta…</p></main>;
  if (!user) return (
    <main className="page col" style={{ gap: 16, alignItems: 'flex-start' }}>
      <h1 className="disp" style={{ fontSize: 40 }}>No has entrado</h1>
      <Link href="/entrar" className="btn btn-p">Entrar o crear cuenta</Link>
    </main>
  );

  const first = !profile?.username;
  const lp = levelProgress(profile?.xp ?? 0);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!USER_RE.test(username)) { setMsg({ ok: false, text: 'El nombre debe tener 3 a 20 caracteres: letras, números, _ o .' }); return; }
    setBusy(true);
    try {
      if (username.toLowerCase() !== (profile?.username ?? '').toLowerCase() && !(await usernameAvailable(username))) {
        setMsg({ ok: false, text: 'Ese nombre ya está tomado.' });
        return;
      }
      const { error } = await sb()!.from('profiles').update({ username, color, country: country || null }).eq('id', user.id);
      if (error) { setMsg({ ok: false, text: error.message.includes('duplicate') ? 'Ese nombre ya está tomado.' : error.message }); return; }
      await refreshProfile();
      if (first) router.push('/perfil');
      else setMsg({ ok: true, text: 'Perfil guardado.' });
    } finally {
      setBusy(false);
    }
  };

  const changePass = async () => {
    setPassMsg(null);
    if (newPass.length < 6) { setPassMsg({ ok: false, text: 'Mínimo 6 caracteres.' }); return; }
    const { error } = await sb()!.auth.updateUser({ password: newPass });
    setPassMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Contraseña actualizada.' });
    if (!error) setNewPass('');
  };

  return (
    <main className="page col" style={{ maxWidth: 720, gap: 24 }}>
      <div className="col" style={{ gap: 6 }}>
        <h1 className="disp" style={{ fontSize: 40, lineHeight: '44px' }}>{first ? '¡Bienvenido al escenario!' : 'Tu cuenta'}</h1>
        <span className="muted">{first ? 'Elige tu nombre de jugador para aparecer en los rankings.' : user.email}</span>
      </div>

      {recovering && (
        <section className="panel panel-pad col" style={{ borderColor: 'var(--gold)' }}>
          <h2 style={{ fontSize: 17 }}>Crea tu contraseña nueva</h2>
          <div className="row">
            <input className="input grow" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Nueva contraseña" autoComplete="new-password" />
            <button type="button" className="btn btn-p btn-sm" onClick={changePass}>Guardar</button>
          </div>
          {passMsg && <span className="small" style={{ color: passMsg.ok ? 'var(--ok)' : 'var(--hot-soft)' }}>{passMsg.text}</span>}
        </section>
      )}

      <form className="panel col" style={{ padding: 28, gap: 20 }} onSubmit={save}>
        <div className="row" style={{ gap: 20 }}>
          <span className="avatar" style={{ width: 80, height: 80, background: color, color: '#fff', fontSize: 28, boxShadow: `0 0 0 4px #0b0b0c, 0 0 0 6px ${color}` }}>{initialsOf(username || '?')}</span>
          <div className="col grow" style={{ gap: 8 }}>
            <div className="row" style={{ alignItems: 'baseline' }}>
              <span className="disp" style={{ fontSize: 26 }}>{username || 'tu_nombre'}</span>
              <span className="muted small">Nivel {profile?.level ?? 1}</span>
            </div>
            <div className="xpbar"><span style={{ width: `${Math.round(lp.progress * 100)}%` }} /></div>
            <span className="small muted mono">{profile?.xp ?? 0} XP · faltan {lp.toNext} para nivel {lp.level + 1}</span>
          </div>
        </div>

        <label className="col" style={{ gap: 6 }}>
          <span className="label">Nombre de jugador</span>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} maxLength={20} required autoFocus={first} />
          <span className="small muted">3–20 caracteres: letras, números, _ o .</span>
        </label>

        <div className="col" style={{ gap: 8 }}>
          <span className="label">Color</span>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {AVATAR_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Color ${c}`} aria-pressed={color === c}
                style={{ width: 36, height: 36, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '3px solid #e9e6de' : '3px solid transparent', boxShadow: color === c ? `0 0 12px ${c}` : undefined }} />
            ))}
          </div>
        </div>

        <label className="col" style={{ gap: 6 }}>
          <span className="label">País</span>
          <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Prefiero no decir</option>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        {msg && <div className="small" role="status" style={{ color: msg.ok ? 'var(--ok)' : 'var(--hot-soft)' }}>{msg.text}</div>}
        <div className="row">
          <button className="btn btn-p" type="submit" disabled={busy}>{first ? 'Empezar a tocar' : 'Guardar perfil'}</button>
          <span className="grow" />
          {!first && <Link href="/perfil" className="btn btn-g">Ver mi perfil</Link>}
        </div>
      </form>

      {!first && !recovering && (
        <section className="panel panel-pad col">
          <h2 style={{ fontSize: 17 }}>Contraseña</h2>
          <div className="row">
            <input className="input grow" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Nueva contraseña" autoComplete="new-password" />
            <button type="button" className="btn btn-s btn-sm" onClick={changePass}>Cambiar</button>
          </div>
          {passMsg && <span className="small" style={{ color: passMsg.ok ? 'var(--ok)' : 'var(--hot-soft)' }}>{passMsg.text}</span>}
        </section>
      )}

      <div className="row">
        <button type="button" className="btn btn-g" onClick={async () => { await signOut(); router.push('/'); }}>Cerrar sesión</button>
      </div>
    </main>
  );
}

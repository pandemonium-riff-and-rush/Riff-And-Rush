'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth, useMe } from '@/lib/auth/AuthProvider';

const LINKS = [
  { href: '/canciones', label: 'Jugar' },
  { href: '/editor', label: 'Crear' },
  { href: '/rankings', label: 'Rankings' },
  { href: '/apoyar', label: 'Apoyar' }
];

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="disp" style={{ fontSize: size, letterSpacing: '0.02em' }}>
      Riff<span style={{ color: 'var(--accent)' }}>&amp;</span>Rush
    </span>
  );
}

export default function Nav() {
  const path = usePathname();
  const router = useRouter();
  const { configured, loading, user, profile } = useAuth();
  const me = useMe();

  // Primera vez: obligar a elegir nombre de jugador
  useEffect(() => {
    if (user && profile && !profile.username && path !== '/cuenta') router.replace('/cuenta');
  }, [user, profile, path, router]);
  return (
    <header className="nav">
      <Link href="/" className="nav-logo" aria-label="Riff&Rush, inicio">
        <svg width="30" height="34" viewBox="0 0 30 34" fill="none" aria-hidden="true">
          <path d="M15 33C8 26 1 17 1 9 1 4 7 1 15 1s14 3 14 8c0 8-7 17-14 24z" fill="#A855F7" stroke="#0A0916" strokeWidth="1.5" />
          <path d="M17 5l-7 12h5l-3 11 8-14h-5z" fill="#F2F0FF" />
        </svg>
        <Logo />
      </Link>
      <nav aria-label="Principal" className="nav-links">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
        {profile?.is_admin && <Link href="/revision" aria-current={path.startsWith('/revision') ? 'page' : undefined} style={{ color: 'var(--gold)' }}>Revisión</Link>}
        {/* Pista de pruebas de técnicas: solo para el equipo mientras se decide qué entra */}
        {profile?.is_admin && <Link href="/laboratorio" aria-current={path.startsWith('/laboratorio') ? 'page' : undefined} style={{ color: '#C084FC' }}>Laboratorio</Link>}
      </nav>
      <Link href="/ajustes" aria-label="Ajustes" className="btn btn-g btn-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h9M19 6h1M4 12h3M13 12h7M4 18h11M21 18h-1" />
          <circle cx="16" cy="6" r="2.5" /><circle cx="10" cy="12" r="2.5" /><circle cx="18" cy="18" r="2.5" />
        </svg>
      </Link>
      {configured && !loading && !user ? (
        <Link href="/entrar" className="btn btn-p btn-sm">Entrar</Link>
      ) : (
        <Link href="/perfil" className="row" style={{ color: 'var(--text)', gap: 10, fontSize: 14, fontWeight: 500, visibility: loading ? 'hidden' : undefined }} aria-label="Tu perfil">
          <span className="avatar" style={{ width: 40, height: 40, background: me.loggedIn ? me.color : 'var(--bg-raised)', color: '#fff', fontSize: 14, border: me.loggedIn ? undefined : '1px dashed var(--border-strong)' }}>{me.initials}</span>
          <span className="col nav-user-name" style={{ gap: 0, lineHeight: 1.2 }}>
            <span>{me.name}</span>
            {me.loggedIn && <span className="small muted mono">Nv. {me.level}</span>}
          </span>
        </Link>
      )}
    </header>
  );
}

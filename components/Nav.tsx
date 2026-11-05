'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth, useMe } from '@/lib/auth/AuthProvider';

/*
 * El orden es el del jugador que llega de cero: primero tocar, después competir,
 * después crear. "Apoyar" salió de la barra: pedir plata antes de que alguien
 * haya jugado una canción no tiene sentido; vive en el pie y en tu perfil.
 */
const LINKS = [
  { href: '/canciones', label: 'Canciones' },
  { href: '/rankings', label: 'Rankings' },
  { href: '/editor', label: 'Crear' }
];

/**
 * El logotipo es una plancha de papel con la tinta encima, como el bloque de
 * título de un afiche fotocopiado. El & va en el color plano.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span
      className="disp"
      style={{
        display: 'inline-block', background: 'var(--paper)', color: 'var(--ink)',
        fontSize: size, lineHeight: 1, padding: `${Math.round(size * 0.3)}px ${Math.round(size * 0.42)}px ${Math.round(size * 0.26)}px`,
        letterSpacing: '-0.02em'
      }}
    >
      Riff<span style={{ color: 'var(--spot-deep)' }}>&amp;</span>Rush
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
        {profile?.is_admin && <Link href="/laboratorio" aria-current={path.startsWith('/laboratorio') ? 'page' : undefined} style={{ color: 'var(--spot)' }}>Laboratorio</Link>}
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
          <span className="avatar" style={{ width: 36, height: 36, background: me.loggedIn ? me.color : 'transparent', color: me.loggedIn ? '#0b0b0c' : 'var(--text-2)', fontSize: 13, border: me.loggedIn ? undefined : '1px solid var(--line-2)' }}>{me.initials}</span>
          <span className="col nav-user-name" style={{ gap: 0, lineHeight: 1.2 }}>
            <span>{me.name}</span>
            {me.loggedIn && <span className="small muted mono">Nv {me.level}</span>}
          </span>
        </Link>
      )}
    </header>
  );
}

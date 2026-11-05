import Link from 'next/link';
import Nav from '@/components/Nav';
import FeedbackButton from '@/components/FeedbackButton';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      {children}
      <footer className="page row small muted" style={{ borderTop: '1px solid var(--border)', paddingTop: 24, paddingBottom: 32, flexWrap: 'wrap' }}>
        <span className="grow">Los videos se reproducen con el reproductor oficial de YouTube. Los charts son obra de sus autores.</span>
        <Link href="/apoyar" className="muted">Apoyar</Link>
        <Link href="/terminos" className="muted">Términos</Link>
        <Link href="/privacidad" className="muted">Privacidad</Link>
        <Link href="/reportar-contenido" className="muted">Reportar contenido</Link>
      </footer>
      <FeedbackButton />
    </>
  );
}

import Link from 'next/link';
import { LEGAL } from '@/lib/legal';

/** Envoltorio común de las páginas legales. */
export function Legal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="page col legal" style={{ maxWidth: 820, gap: 18 }}>
      <Link href="/" className="small muted">← Inicio</Link>
      <h1 className="disp" style={{ fontSize: 44, lineHeight: '48px' }}>{title}</h1>
      <div className="small muted">Última actualización: {LEGAL.actualizado}</div>
      {children}
      <div className="panel panel-pad small muted" style={{ marginTop: 12 }}>
        Este texto está escrito en lenguaje simple para un proyecto chico y no es asesoría legal. Si el juego crece o empieza a recibir pagos, conviene que un abogado lo revise.
      </div>
    </main>
  );
}

export function S({ n, t, children }: { n: string; t: string; children: React.ReactNode }) {
  return (
    <section className="col" style={{ gap: 8, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      <h2 style={{ fontSize: 20 }}><span className="mono muted" style={{ marginRight: 8 }}>{n}</span>{t}</h2>
      {children}
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, lineHeight: 1.65, color: 'var(--text-3)' }}>{children}</p>;
}

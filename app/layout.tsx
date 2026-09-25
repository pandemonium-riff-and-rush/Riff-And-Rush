import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth/AuthProvider';

/**
 * Dirección pública del sitio. En Vercel llega sola; en local no hace falta.
 * Sin esto, la imagen que se ve al pegar el link en WhatsApp o Discord no carga.
 */
const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');

const TITULO = 'Riff&Rush · toca cualquier canción de YouTube';
const BAJADA = 'Charts de la comunidad, cinco dificultades y rankings. Gratis, en el navegador, con teclado o guitarra.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: 'Riff&Rush', template: '%s · Riff&Rush' },
  description: BAJADA,
  applicationName: 'Riff&Rush',
  openGraph: {
    type: 'website',
    siteName: 'Riff&Rush',
    locale: 'es_CL',
    title: TITULO,
    description: BAJADA,
    url: '/',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Riff&Rush' }]
  },
  twitter: { card: 'summary_large_image', title: TITULO, description: BAJADA, images: ['/og.png'] }
};

export const viewport: Viewport = {
  themeColor: '#0a0916',
  colorScheme: 'dark'
};

const FONTS = 'https://fonts.googleapis.com/css2?family=Anton&family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&family=Space+Mono:wght@400;700&family=Permanent+Marker&display=swap';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}

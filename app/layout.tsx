import type { Metadata, Viewport } from 'next';
// Las fuentes viajan con el proyecto en vez de pedírselas a Google en cada carga:
// una petición menos a otro servidor, sin salto de tipografía al cargar y funciona
// aunque Google esté bloqueado. Archivo es variable, así que una sola familia da la
// voz de afiche (ancho 62, peso 900) y la de texto (ancho 100).
import '@fontsource-variable/archivo';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/martian-mono';
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
  themeColor: '#0b0b0c',
  colorScheme: 'dark'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      {/*
        * suppressHydrationWarning solo acá, en el <body>:
        * extensiones como Bitdefender o los gestores de contraseñas le cuelgan
        * atributos (bis_skin_checked, bis_register, __processed_…) antes de que
        * React hidrate, y eso llenaba la consola de desarrollo con un aviso que
        * no es un error de la página. Solo tapa el desajuste de atributos DE
        * ESTE elemento: cualquier problema real de hidratación adentro sigue
        * avisando igual.
        */}
      <body suppressHydrationWarning><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}

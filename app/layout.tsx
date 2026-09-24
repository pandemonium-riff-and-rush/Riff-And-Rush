import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth/AuthProvider';

export const metadata: Metadata = {
  title: 'Riff&Rush',
  description: 'Toca cualquier canción de YouTube con charts de la comunidad y compite en rankings semanales, mensuales y anuales.'
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

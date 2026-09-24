import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL } from '@/lib/legal';
import { Legal, P, S } from '@/components/Legal';

export const metadata: Metadata = { title: 'Privacidad · Riff&Rush' };

export default function Privacy() {
  return (
    <Legal title="Política de privacidad">
      <P>Responsable del tratamiento: {LEGAL.operador} ({LEGAL.lugar}). Contacto: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.</P>

      <S n="1" t="Qué datos guardamos">
        <P><b>Si creas cuenta:</b> tu correo (lo maneja Supabase Auth), tu nombre de jugador, el color de tu avatar y el país si decides ponerlo.</P>
        <P><b>Del juego:</b> tus puntajes, precisión, estrellas, racha máxima, XP y nivel, y el registro de las teclas de cada partida (a qué milisegundo apretaste y soltaste cada carril). Ese registro se usa solo para validar que el puntaje sea real.</P>
        <P><b>De los charts:</b> lo que escribes en el editor (título, artista, género, notas y el ID del video de YouTube).</P>
        <P><b>En tu navegador:</b> guardamos ajustes, récords locales y charts sin publicar en el almacenamiento local de tu equipo. Eso no sale de tu navegador hasta que inicias sesión y decides subirlos.</P>
        <P>No pedimos ni guardamos datos de tarjetas ni documentos de identidad.</P>
      </S>

      <S n="2" t="Para qué los usamos">
        <P>Para que puedas entrar a tu cuenta, guardar tu progreso, armar los rankings, mostrar quién hizo cada chart, revisar reportes y detectar trampas. No vendemos tus datos ni hacemos perfiles publicitarios con ellos.</P>
      </S>

      <S n="3" t="Quién más los procesa">
        <P><b>Supabase</b> (base de datos y cuentas), <b>Vercel</b> (alojamiento del sitio) y <b>YouTube / Google</b> (reproductor de video incrustado, que puede usar cookies propias y recibe la dirección IP de quien ve el video). Estos proveedores pueden almacenar datos fuera de Chile. El reproductor de YouTube se rige por la <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Política de Privacidad de Google</a>.</P>
      </S>

      <S n="4" t="Micrófono">
        <P>Si activas las luces reactivas, el juego usa el micrófono solo para medir el volumen en tiempo real y animar el fondo. El audio no se graba, no se guarda ni se envía a ningún servidor. Puedes apagarlo cuando quieras con el mismo botón.</P>
      </S>

      <S n="5" t="Cuánto tiempo">
        <P>Mientras tengas cuenta. Si la borras, eliminamos tu perfil, tus puntajes y tus charts publicados. Los reportes que hayas enviado se conservan sin tu identidad para llevar un registro de moderación.</P>
      </S>

      <S n="6" t="Tus derechos">
        <P>Puedes pedir acceso, rectificación, eliminación o una copia de tus datos escribiendo a <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. Respondemos dentro de los plazos de la ley chilena de protección de datos. Muchos datos los puedes cambiar tú mismo en <Link href="/cuenta">Tu cuenta</Link>.</P>
      </S>

      <S n="7" t="Menores">
        <P>El servicio no está dirigido a menores de 13 años. Si nos enteramos de una cuenta de alguien menor de esa edad, la eliminamos.</P>
      </S>

      <S n="8" t="Cambios">
        <P>Si cambiamos esta política, avisamos en el sitio. Última actualización: {LEGAL.actualizado}.</P>
      </S>
    </Legal>
  );
}

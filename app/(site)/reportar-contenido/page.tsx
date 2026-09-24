import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL } from '@/lib/legal';
import { Legal, P, S } from '@/components/Legal';

export const metadata: Metadata = { title: 'Reportar contenido · Riff&Rush' };

export default function ReportInfo() {
  return (
    <Legal title="Reportar contenido">
      <S n="1" t="Un chart malo, desfasado o con video caído">
        <P>Entra a la ficha de la canción y usa el botón <b>Reportar un problema</b>. Elige el motivo y, si puedes, cuéntanos en qué parte pasa. Revisamos los reportes a mano y podemos despublicar el chart.</P>
        <P><Link href="/canciones" className="btn btn-s btn-sm">Ir a las canciones</Link></P>
      </S>

      <S n="2" t="Derechos de autor">
        <P>Riff&Rush no aloja música: los videos se reproducen con el reproductor oficial de YouTube. Si un video te pertenece y no quieres que se reproduzca en otros sitios, puedes desactivar la reproducción incrustada desde YouTube Studio y dejará de funcionar aquí de inmediato.</P>
        <P>Lo que sí alojamos son los charts (el patrón de notas) que hace la comunidad. Si un chart copia tu obra o fue extraído de un juego comercial, escríbenos a <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> con:</P>
        <ul>
          <li>el link de la canción o chart en Riff&Rush;</li>
          <li>qué obra tuya se está usando y cómo acreditas ser el titular o su representante;</li>
          <li>tus datos de contacto (nombre, correo);</li>
          <li>una declaración de que crees de buena fe que ese uso no está autorizado;</li>
          <li>una declaración de que la información es correcta y de que actúas como titular o en su representación.</li>
        </ul>
        <P>Revisamos los avisos apenas los recibimos y, si corresponde, quitamos el contenido y avisamos a quien lo publicó. Quien haya subido el chart puede responder con sus antecedentes si cree que fue un error.</P>
      </S>

      <S n="3" t="Reincidencia">
        <P>Las cuentas que suban contenido infractor de forma repetida se suspenden.</P>
      </S>

      <S n="4" t="Otros problemas">
        <P>Abuso, suplantación, contenido inapropiado o cualquier otra cosa rara: escríbenos a <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> y lo vemos.</P>
      </S>
    </Legal>
  );
}

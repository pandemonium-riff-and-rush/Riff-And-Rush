import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL } from '@/lib/legal';
import { Legal, P, S } from '@/components/Legal';

export const metadata: Metadata = { title: 'Términos de uso · Riff&Rush' };

export default function Terms() {
  return (
    <Legal title="Términos de uso">
      <P>Estos términos regulan el uso de Riff&Rush (el &quot;servicio&quot;), operado por {LEGAL.operador}. Al crear una cuenta o jugar aceptas lo que dice aquí. Si no estás de acuerdo, no uses el servicio.</P>

      <S n="1" t="Qué es Riff&Rush">
        <P>Riff&Rush es un juego de ritmo en el navegador. Las canciones se escuchan a través del reproductor oficial de YouTube incrustado en la página. No alojamos, descargamos, separamos ni distribuimos música: solo mostramos el video del tercero y le agregamos un &quot;chart&quot; (el patrón de notas) hecho por la comunidad.</P>
      </S>

      <S n="2" t="Tu cuenta">
        <P>Necesitas una cuenta para guardar puntajes, publicar charts y aparecer en los rankings. Debes tener al menos 13 años; si eres menor de edad, necesitas permiso de tu madre, padre o apoderado. Eres responsable de tu contraseña y de lo que se haga desde tu cuenta. Puedes jugar como invitado sin cuenta: en ese caso todo queda solo en tu navegador.</P>
      </S>

      <S n="3" t="Charts de la comunidad">
        <P>Cuando publicas un chart declaras que es obra tuya o que tienes permiso para publicarlo. Está prohibido subir charts extraídos de juegos comerciales (Guitar Hero, Rock Band y similares) o copiados de otra persona sin su autorización.</P>
        <P>Sigues siendo dueño de tus charts. Al publicarlos nos das una licencia gratuita, mundial y no exclusiva para mostrarlos, alojarlos y permitir que otros jugadores los jueguen dentro del servicio, mientras estén publicados. Si borras un chart, dejamos de mostrarlo.</P>
        <P>Podemos despublicar o borrar charts que infrinjan estos términos, que estén mal hechos o que reciban reportes fundados, sin aviso previo.</P>
      </S>

      <S n="4" t="Videos de YouTube">
        <P>Los videos se reproducen con el reproductor oficial de YouTube. Al usarlos también aceptas los <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">Términos de Servicio de YouTube</a> y se te aplica la <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Política de Privacidad de Google</a>. Los anuncios que aparezcan en esos videos son de YouTube y no los controlamos ni los podemos quitar.</P>
      </S>

      <S n="5" t="Juego limpio">
        <P>No está permitido usar programas que jueguen por ti, modificar el juego para enviar puntajes falsos ni explotar errores para subir en los rankings. Los puntajes se validan en el servidor y podemos anular partidas, borrar récords o suspender cuentas cuando detectemos trampa.</P>
      </S>

      <S n="6" t="Aportes y pagos">
        <P>El juego es gratis. Si en el futuro existen aportes voluntarios o funciones de apoyo, se informará el precio y qué incluye antes de pagar. Los aportes voluntarios no son reembolsables, salvo lo que exija la ley del consumidor.</P>
      </S>

      <S n="7" t="Disponibilidad y responsabilidad">
        <P>El servicio se entrega &quot;tal como está&quot;. Es un proyecto en desarrollo: puede fallar, cambiar o dejar de estar disponible. Hacemos lo razonable por cuidar tus datos y tus charts, pero no garantizamos que no se pierdan; guarda una copia de los charts que te importen (botón Exportar del editor). Nada de esto limita los derechos que te da la ley chilena como consumidor.</P>
      </S>

      <S n="8" t="Suspensión">
        <P>Podemos suspender o cerrar cuentas que incumplan estos términos, en especial por trampa, contenido infractor o abuso hacia otras personas.</P>
      </S>

      <S n="9" t="Cambios y contacto">
        <P>Podemos cambiar estos términos; avisaremos en el sitio cuando el cambio sea relevante. Se aplican las leyes de {LEGAL.lugar} y cualquier conflicto se verá en sus tribunales. Dudas: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.</P>
        <P>Ver también la <Link href="/privacidad">política de privacidad</Link> y cómo <Link href="/reportar-contenido">reportar contenido</Link>.</P>
      </S>
    </Legal>
  );
}

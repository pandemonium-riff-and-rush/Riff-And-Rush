import type { Note, Tech } from '../chart/types';

/**
 * Ejercicios del laboratorio. Quedaron solo las técnicas que sobrevivieron a probarlas:
 * la frase ligada (subir apilando, bajar despegando), el armónico/acorde, el chug como
 * puro sabor y el barrido como carrera fluida.
 *
 * Murieron acá: el slide (estresante y poco claro), el trémolo (machacar no es un gesto)
 * y el hammer-on suelto (sin el pull-off era una nota normal con una línea dibujada).
 */
export interface Drill {
  id: Tech | 'mix' | 'legato';
  name: string;
  /** Qué es en una guitarra de verdad. */
  what: string;
  /** Cómo se toca en cada aparato. */
  how: { teclado: string; guitarra: string; midi: string };
  /** Qué mirar para saber si está bueno. */
  feel: string;
  lanes: number;
  /** Compases del bucle. */
  bars: number;
  build: (b: number) => Note[];
}

const N = (t: number, lane: number, len = 0, extra: Partial<Note> = {}): Note => ({ t, lane, len, ...extra });

export const DRILLS: Drill[] = [
  {
    id: 'pull',
    name: 'Pull-off',
    what: 'Tienes el dedo puesto y lo sueltas: la cuerda suena sola. El golpe es SOLTAR, no apretar.',
    how: {
      teclado: 'Mantén la tecla y SUÉLTALA justo cuando el galón llega a la línea.',
      guitarra: 'Suelta el traste.',
      midi: 'Note-off, no note-on.'
    },
    feel: 'El único golpe invertido del juego. Apretar de más rompe la racha, así que la mano tiene que quedarse quieta.',
    lanes: 5,
    bars: 2,
    build: (b) => {
      const o: Note[] = [];
      for (let bar = 0; bar < 2; bar++) {
        const s = bar * 4 * b;
        o.push(N(s, 2, b * 0.8));
        o.push(N(s + b, 2, 0, { tech: 'pull' }));
        o.push(N(s + b * 2, 1, b * 0.8));
        o.push(N(s + b * 3, 1, 0, { tech: 'pull' }));
      }
      return o;
    }
  },
  {
    id: 'legato',
    name: 'Frase ligada',
    what: 'La frase completa de mano izquierda: subes martillando trastes sin soltar, y bajas soltándolos uno a uno. Es una sola cosa, no dos técnicas.',
    how: {
      teclado: 'Subiendo: aprieta cada tecla SIN soltar las anteriores, la mano se va cerrando. Bajando: suelta de a una, de arriba hacia abajo.',
      guitarra: 'Un solo rasgueo al principio; el resto es mano izquierda.',
      midi: 'Note-on encadenados al subir, note-off al bajar.'
    },
    feel: 'Mira la PILA llenándose al subir y vaciándose al bajar, y la CADENA creciendo. Si sueltas antes de tiempo, la cadena se cae a cero.',
    lanes: 5,
    bars: 4,
    build: (b) => {
      const o: Note[] = [];
      for (let bar = 0; bar < 2; bar++) {
        const s = bar * 8 * b;
        // Sube apilando
        o.push(N(s, 0));
        o.push(N(s + b * 0.5, 1, 0, { tech: 'hopo' }));
        o.push(N(s + b, 2, 0, { tech: 'hopo' }));
        o.push(N(s + b * 1.5, 3, 0, { tech: 'hopo' }));
        o.push(N(s + b * 2, 4, 0, { tech: 'hopo' }));
        // Baja despegando
        o.push(N(s + b * 3, 4, 0, { tech: 'pull' }));
        o.push(N(s + b * 3.5, 3, 0, { tech: 'pull' }));
        o.push(N(s + b * 4, 2, 0, { tech: 'pull' }));
        o.push(N(s + b * 4.5, 1, 0, { tech: 'pull' }));
        o.push(N(s + b * 5, 0, 0, { tech: 'pull' }));
        // Tres tiempos de aire para acomodar la mano
      }
      return o;
    }
  },
  {
    id: 'harm',
    name: 'Armónico / acorde',
    what: 'El chillido agudo del solo. Puede ser una tecla sola o varias juntas, según lo que pida la canción.',
    how: {
      teclado: 'Estrella sola: una tecla, clavada en PERFECTO. Estrella con barra: todas esas teclas a la vez.',
      guitarra: 'Uno o varios trastes juntos.',
      midi: 'Una nota o un acorde.'
    },
    feel: 'Primero van armónicos de una tecla (los que te gustaron) y después de dos. El orden de los dedos da igual y el primero no castiga: espera a los demás.',
    lanes: 5,
    bars: 4,
    build: (b) => {
      const o: Note[] = [];
      // Compases 1-2: armónico de una tecla
      for (let bar = 0; bar < 2; bar++) {
        const s = bar * 4 * b;
        o.push(N(s, 0));
        o.push(N(s + b, 1));
        o.push(N(s + b * 2, 2));
        o.push(N(s + b * 3, 4, 0, { tech: 'harm' }));
      }
      // Compases 3-4: acordes de dos y de tres
      o.push(N(b * 8, 0));
      o.push(N(b * 9, 1));
      o.push(N(b * 10, 3, 0, { tech: 'harm', chord: [4] }));
      o.push(N(b * 12, 2));
      o.push(N(b * 13, 3));
      o.push(N(b * 14, 0, 0, { tech: 'harm', chord: [2, 4] }));
      return o;
    }
  },
  {
    id: 'sweep',
    name: 'Barrido · sweep',
    what: 'La púa cruza varias cuerdas de un solo movimiento. Tiene que fluir: es la técnica más fácil del juego, no la más difícil.',
    how: {
      teclado: 'Corre los dedos en orden, sin pensarlo. No hay que levantar nada: la ventana es mucho más ancha que en una nota normal.',
      guitarra: 'Barrido de arriba abajo.',
      midi: 'Arpegio rápido.'
    },
    feel: 'Cada nota de la cadena vale más que la anterior. Siempre corre en una sola dirección y cambia de carril, nunca rebota en la misma tecla.',
    lanes: 5,
    bars: 4,
    build: (b) => {
      const o: Note[] = [];
      // Sube 0→4, respira, vuelve a subir. Sin rebotes en el mismo carril.
      for (let i = 0; i < 5; i++) o.push(N(i * b * 0.25, i, 0, { tech: 'sweep' }));
      for (let i = 0; i < 5; i++) o.push(N(b * 2 + i * b * 0.25, i, 0, { tech: 'sweep' }));
      // Y una bajada limpia, empezando desde arriba
      for (let i = 0; i < 5; i++) o.push(N(b * 4 + i * b * 0.25, 4 - i, 0, { tech: 'sweep' }));
      for (let i = 0; i < 5; i++) o.push(N(b * 6 + i * b * 0.25, 4 - i, 0, { tech: 'sweep' }));
      return o;
    }
  },
  {
    id: 'mute',
    name: 'Palm mute · chug',
    what: 'Apoyas el canto de la mano sobre las cuerdas: el sonido queda corto, seco y con cuerpo. Es el motor del metal.',
    how: {
      teclado: 'Nada nuevo: se toca igual que una nota normal.',
      guitarra: 'Igual.',
      midi: 'Igual.'
    },
    feel: 'Esto NO es una mecánica, es una textura, y está bien que lo sea: no te cobra nada y aun así el riff suena distinto. Nota chata y oscura, golpe corto y grave.',
    lanes: 5,
    bars: 2,
    build: (b) => {
      const o: Note[] = [];
      for (let bar = 0; bar < 2; bar++) {
        const s = bar * 4 * b;
        for (let i = 0; i < 6; i++) o.push(N(s + i * b * 0.5, 0, 0, { tech: 'mute' }));
        o.push(N(s + b * 3, 4));
        o.push(N(s + b * 3.5, 3));
      }
      return o;
    }
  },
  {
    id: 'mix',
    name: 'Todo junto · riff',
    what: 'Un riff corto con lo que quedó: chugs, frase ligada, barrido y armónico.',
    how: {
      teclado: 'Todo lo anterior seguido.',
      guitarra: 'Todo lo anterior seguido.',
      midi: 'Todo lo anterior seguido.'
    },
    feel: 'Acá se ve si conviven o si marean. Si esto agobia, hay que sacar más cosas.',
    lanes: 5,
    bars: 4,
    build: (b) => {
      const o: Note[] = [];
      // Chugs de entrada
      for (let i = 0; i < 4; i++) o.push(N(i * b * 0.5, 0, 0, { tech: 'mute' }));
      // Frase ligada: sube apilando, baja despegando
      o.push(N(b * 2, 1));
      o.push(N(b * 2.5, 2, 0, { tech: 'hopo' }));
      o.push(N(b * 3, 3, 0, { tech: 'hopo' }));
      o.push(N(b * 3.5, 3, 0, { tech: 'pull' }));
      o.push(N(b * 4, 2, 0, { tech: 'pull' }));
      o.push(N(b * 4.5, 1, 0, { tech: 'pull' }));
      // Barrido fluido
      for (let i = 0; i < 5; i++) o.push(N(b * 6 + i * b * 0.25, i, 0, { tech: 'sweep' }));
      // Más chugs
      for (let i = 0; i < 4; i++) o.push(N(b * 8 + i * b * 0.5, 0, 0, { tech: 'mute' }));
      // Frase corta y acorde final
      o.push(N(b * 10, 1));
      o.push(N(b * 10.5, 2, 0, { tech: 'hopo' }));
      o.push(N(b * 11, 2, 0, { tech: 'pull' }));
      o.push(N(b * 12, 3, 0, { tech: 'harm' }));
      o.push(N(b * 14, 2, 0, { tech: 'harm', chord: [4] }));
      return o;
    }
  }
];

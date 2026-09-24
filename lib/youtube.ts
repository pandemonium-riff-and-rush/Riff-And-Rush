/**
 * Palabras de producción que no son parte del nombre de la canción.
 * Se trabaja por PALABRA y no por frase: así "(Official HD Video)" o
 * "(Official Music Video 4K)" se limpian sin tener que listar cada combinación.
 *
 * A propósito NO entran aquí "live", "acoustic", "cover", "remix" ni "demo":
 * esas sí cambian de qué versión estamos hablando y el charter las quiere.
 */
const NOISE_WORDS = new Set([
  'official', 'oficial', 'officiel', 'music', 'video', 'vídeo', 'videoclip', 'clip',
  'lyric', 'lyrics', 'letra', 'letras', 'audio', 'visualizer', 'visualiser',
  'hd', 'hq', 'uhd', 'sd', '4k', '8k', '1080p', '720p', '60fps', 'mv', 'pv',
  'full', 'complete', 'completo', 'remastered', 'remaster', 'remasterizado',
  'subtitulado', 'subtitulada', 'sub', 'legendado', 'hq audio', 'con'
]);

/** Separadores que la gente usa entre artista y canción. */
const SPLITTERS = [' - ', ' – ', ' — ', ' | ', ' // ', ' ~ ', '「', '『'];

const words = (s: string) => s.split(/[\s.,·/]+/).filter(Boolean);
/**
 * Una palabra "no aporta" si es de producción. Los números puros solo cuentan como
 * basura DENTRO de un paréntesis ("Remastered 2011"): sueltos casi siempre son parte
 * del nombre ("Parte 2", "Vol 3", "Blink-182").
 */
const isNoiseWord = (w: string, digitsToo = false) => {
  const c = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (!c) return true;
  if (NOISE_WORDS.has(c)) return true;
  return digitsToo && /^\d+[a-z]?$/.test(c);
};

function stripNoise(s: string) {
  // 1. Paréntesis y corchetes donde TODAS las palabras son de producción.
  //    "(Official HD Video)" se va; "(Acoustic)" y "(feat. Alguien)" se quedan.
  let out = s.replace(/[([{]([^)\]}]*)[)\]}]/g, (full, inner: string) => {
    const w = words(inner);
    return w.length && w.every((x) => isNoiseWord(x, true)) ? ' ' : full;
  });

  // 2. Lo mismo pero suelto al final: "Canción Official Music Video".
  //    Solo se mira lo que viene DESPUÉS del último paréntesis, para no entrar a
  //    morder cosas como "(Live Aid 1985)".
  const lastClose = Math.max(out.lastIndexOf(')'), out.lastIndexOf(']'), out.lastIndexOf('}'));
  const head = out.slice(0, lastClose + 1);
  const tail = out.slice(lastClose + 1).split(/\s+/).filter(Boolean);
  while (tail.length > (head.trim() ? 0 : 1) && isNoiseWord(tail[tail.length - 1])) tail.pop();
  out = (head + ' ' + tail.join(' ')).trim();

  // 3. Limpieza final. Ojo: el guion solo se corta si viene con espacio delante,
  //    para no romper títulos como "紅蓮華 -Gurenge-".
  return out
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s|·]+|[\s|·]+$/g, '')
    .replace(/^[-–—]+\s+/, '')
    .replace(/\s+[-–—|·]+$/, '')
    .trim();
}

/** Los canales de música automáticos de YouTube se llaman "Artista - Topic". */
function cleanAuthor(a: string) {
  return a.replace(/\s*-\s*Topic\s*$/i, '').replace(/\s*(VEVO|Official|Oficial)\s*$/i, '').trim();
}

/**
 * Adivina artista y canción desde el título de YouTube y el nombre del canal.
 * No pretende acertar siempre: es un borrador para que el charter corrija.
 */
export function parseVideoTitle(rawTitle: string, rawAuthor = ''): { title: string; artist: string } {
  const author = cleanAuthor(rawAuthor);
  const t = stripNoise(rawTitle.replace(/\s+/g, ' ').trim());
  if (!t) return { title: '', artist: author };

  // "Artista - Canción" (se corta en el PRIMER separador; lo de después es la canción)
  for (const sep of SPLITTERS) {
    const i = t.indexOf(sep);
    if (i <= 0) continue;
    const left = stripNoise(t.slice(0, i));
    // Los cierres japoneses 「」『』 se cambian por espacio, no se borran:
    // si no, "アイドル」Official" queda pegado y deja de reconocerse la basura.
    const right = stripNoise(t.slice(i + sep.length).replace(/[」』]/g, ' '));
    // Si después del guion no queda nada real ("Artista - Official Video"),
    // el corte era falso: mejor no partir.
    if (!left || !right || words(right).every((x) => isNoiseWord(x, true))) continue;
    return { artist: left, title: right };
  }

  // Sin separador: el canal hace de artista y todo el título es la canción
  return { artist: author, title: t };
}

/** Extrae el ID de un link de YouTube (watch, youtu.be, shorts, embed) o acepta el ID directo. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1, 12) || null;
    const v = u.searchParams.get('v');
    if (v) return v.slice(0, 11);
    const m = u.pathname.match(/\/(embed|shorts|live)\/([\w-]{11})/);
    return m ? m[2] : null;
  } catch {
    return null;
  }
}

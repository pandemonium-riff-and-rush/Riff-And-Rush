import type { Chart } from './types';
import { DIFFICULTIES, lastNoteEnd, playEnd } from './types';

export interface ChartIssue { level: 'error' | 'warn'; text: string }

/** Revisión automática antes de publicar (y para la cola de revisión manual). */
export function checkChart(c: Chart): ChartIssue[] {
  const out: ChartIssue[] = [];
  const title = c.title.trim();
  if (!title || title === 'Nueva canción') out.push({ level: 'error', text: 'Ponle el nombre real de la canción.' });
  if (!c.artist.trim() || c.artist === 'Artista') out.push({ level: 'error', text: 'Falta el artista.' });
  if (c.source.kind !== 'youtube') out.push({ level: 'error', text: 'Falta el video de YouTube: sin video nadie escucha la canción.' });
  const diffs = DIFFICULTIES.filter((d) => (c.difficulties[d.id]?.notes.length ?? 0) > 0);
  if (!diffs.length) out.push({ level: 'error', text: 'El chart no tiene notas.' });
  if (!c.difficulties.expert?.notes.length) out.push({ level: 'warn', text: 'No hay dificultad Experto (las demás se generan desde ahí).' });
  if (diffs.length && diffs.length < 3) out.push({ level: 'warn', text: 'Tiene pocas dificultades: usa "Generar las demás desde Experto".' });
  if (!c.genre) out.push({ level: 'warn', text: 'Elige un género para que aparezca en su categoría.' });

  for (const d of diffs) {
    const dc = c.difficulties[d.id]!;
    const notes = dc.notes;
    if (notes.some((n) => n.lane >= dc.lanes || n.lane < 0)) out.push({ level: 'error', text: `${d.name}: hay notas en carriles que no existen.` });
    const last = notes[notes.length - 1];
    if (last && last.t + last.len > c.durationSec + 1) out.push({ level: 'warn', text: `${d.name}: hay notas después del final de la canción.` });
    // Tramos vacíos largos en medio de la canción
    for (let i = 1; i < notes.length; i++) {
      const gap = notes[i].t - (notes[i - 1].t + notes[i - 1].len);
      if (gap > 25) { out.push({ level: 'warn', text: `${d.name}: ${Math.round(gap)} s sin notas cerca del ${fmt(notes[i - 1].t)}. ¿Falta charterar esa parte?` }); break; }
    }
    // Densidad imposible (más de 25 notas en un segundo)
    let j = 0;
    for (let i = 0; i < notes.length; i++) {
      while (notes[i].t - notes[j].t > 1) j++;
      if (i - j + 1 > 25) { out.push({ level: 'warn', text: `${d.name}: más de 25 notas por segundo cerca del ${fmt(notes[i].t)}. Parece un error.` }); break; }
    }
  }
  if (c.durationSec < 20) out.push({ level: 'warn', text: 'La canción dura menos de 20 segundos.' });

  // Fin de la canción: ni cortar notas ni dejar al jugador esperando los créditos
  const end = playEnd(c);
  const last = Math.max(...DIFFICULTIES.map((d) => lastNoteEnd(c.difficulties[d.id]?.notes ?? [])), 0);
  if (last > 0) {
    if (end < last - 0.05) out.push({ level: 'error', text: `"Termina en" (${fmt(end)}) corta antes de la última nota (${fmt(last)}).` });
    else if (end - last > 25) out.push({ level: 'warn', text: `El video sigue ${Math.round(end - last)} s después de la última nota. Usa "Termina en" para que la partida cierre antes.` });
  }
  return out;
}

function fmt(t: number) {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

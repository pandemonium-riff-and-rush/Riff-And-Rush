/** Categorías de la biblioteca (tipo Netflix). "Anime y openings" apunta también al público de osu!. */
export interface Genre { id: string; name: string; color: string; match: string[] }

export const GENRES: Genre[] = [
  { id: 'rock', name: 'Rock', color: '#FF4D6D', match: ['rock', 'pop rock', 'hard rock', 'cumbia rock', 'rock latino'] },
  { id: 'metal', name: 'Metal', color: '#FF8A3D', match: ['metal', 'heavy metal', 'metalcore', 'thrash'] },
  { id: 'anime', name: 'Anime y openings', color: '#EC4899', match: ['anime', 'opening', 'j-rock', 'jrock', 'j-pop', 'jpop', 'vocaloid', 'ending'] },
  { id: 'punk', name: 'Punk', color: '#FFD23F', match: ['punk', 'pop punk', 'hardcore'] },
  { id: 'indie', name: 'Indie y alternativo', color: '#3FA9FF', match: ['indie', 'alternativo', 'alternative', 'emo'] },
  { id: 'pop', name: 'Pop', color: '#B26BFF', match: ['pop', 'k-pop', 'kpop'] },
  { id: 'electronica', name: 'Electrónica', color: '#3DDC84', match: ['electrónica', 'electronica', 'electronic', 'edm', 'synthwave'] },
  { id: 'latino', name: 'Latino', color: '#14B8A6', match: ['latino', 'cumbia', 'reggaeton', 'salsa'] },
  { id: 'otros', name: 'Otros', color: '#A9A3CC', match: [] }
];

/** Categoría de un chart según su texto de género (la primera que calce). */
export function genreOf(genre?: string): Genre {
  const g = (genre ?? '').toLowerCase().trim();
  if (!g) return GENRES[GENRES.length - 1];
  return GENRES.find((x) => x.id === g || x.match.includes(g)) ?? GENRES.find((x) => x.match.some((m) => g.includes(m))) ?? GENRES[GENRES.length - 1];
}

/** Géneros para elegir en el editor. */
export const GENRE_OPTIONS = ['Rock', 'Metal', 'Anime', 'J-Rock', 'Punk', 'Indie', 'Pop', 'Electrónica', 'Latino', 'Otros'];

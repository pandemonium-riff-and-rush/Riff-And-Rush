/** Jugadores de ejemplo para rankings mientras no hay backend. */
export interface Player { name: string; initials: string; color: string; country: string }

export const PLAYERS: Player[] = [
  { name: 'SofiStrings', initials: 'SS', color: '#EC4899', country: 'Chile' },
  { name: 'ElTucu', initials: 'ET', color: '#3FA9FF', country: 'Argentina' },
  { name: 'ValpoShred', initials: 'VS', color: '#3DDC84', country: 'Chile' },
  { name: 'Kenji_R', initials: 'KR', color: '#FFD23F', country: 'Perú' },
  { name: 'mafe.frets', initials: 'MF', color: '#B26BFF', country: 'Colombia' },
  { name: 'NotaAzul', initials: 'NA', color: '#3FA9FF', country: 'Uruguay' },
  { name: 'DrumlessDan', initials: 'DD', color: '#FF8A3D', country: 'México' },
  { name: 'pulso', initials: 'PU', color: '#3DDC84', country: 'Chile' },
  { name: 'LaChinaRiff', initials: 'LR', color: '#FF4D6D', country: 'Chile' },
  { name: 'Oso_Polar', initials: 'OP', color: '#CFCAEA', country: 'Ecuador' }
];

export const ME = { name: 'riffmaster_cl', initials: 'RC', country: 'Chile', level: 24 };

/** Tiempo que falta para el cierre del período (semana = lunes 00:00, mes, año). */
export function closesIn(period: 'week' | 'month' | 'year' | 'all', now = new Date()) {
  if (period === 'all') return 'Sin cierre';
  const end = new Date(now);
  if (period === 'week') { end.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7)); end.setHours(0, 0, 0, 0); }
  if (period === 'month') { end.setMonth(now.getMonth() + 1, 1); end.setHours(0, 0, 0, 0); }
  if (period === 'year') { end.setFullYear(now.getFullYear() + 1, 0, 1); end.setHours(0, 0, 0, 0); }
  const ms = end.getTime() - now.getTime();
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  return `Cierra en ${d} d ${h} h`;
}

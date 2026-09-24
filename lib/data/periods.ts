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

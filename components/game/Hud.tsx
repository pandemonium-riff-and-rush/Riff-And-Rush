/** Piezas del marcador inferior de la pantalla de juego. */

export function HudCell({ label, children, last, row }: { label: string; children: React.ReactNode; last?: boolean; row?: boolean }) {
  if (row) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, borderRight: last ? 0 : '1px solid var(--border)' }}>
        {children}
        <span className="label" style={{ fontSize: 12, color: 'var(--text-3)', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{label}</span>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: last ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: last ? 12 : 4, borderRight: last ? 0 : '1px solid var(--border)' }}>
      <span className="label" style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</span>
      {children}
    </div>
  );
}

/** Anillo del multiplicador: 10 segmentos que se llenan con la racha (como el medidor clásico). */
export function MultRing({ combo, mult, boosting, color }: { combo: number; mult: number; boosting: boolean; color: string }) {
  const base = boosting ? mult / 2 : mult;
  const filled = base >= 4 ? 10 : combo % 10;
  const R = 24, C = 28;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-label={`Multiplicador por ${mult}`}>
      {Array.from({ length: 10 }).map((_, i) => {
        const a0 = (-90 + i * 36 + 3) * (Math.PI / 180), a1 = (-90 + (i + 1) * 36 - 3) * (Math.PI / 180);
        const d = `M${C + R * Math.cos(a0)} ${C + R * Math.sin(a0)} A${R} ${R} 0 0 1 ${C + R * Math.cos(a1)} ${C + R * Math.sin(a1)}`;
        return <path key={i} d={d} stroke={i < filled ? color : '#2A2448'} strokeWidth="5" strokeLinecap="round" fill="none" style={i < filled ? { filter: `drop-shadow(0 0 3px ${color})` } : undefined} />;
      })}
      {base >= 4 && <path className="mult-fire" d="M28 8c2 6 9 8 9 17a9 9 0 0 1-18 0c0-5 3-8 5-10 0 4 1 5 4 6 0-5-1-8 0-13z" fill={boosting ? '#F5B700' : '#EC4899'} opacity="0.35" />}
      <text x="28" y="34" textAnchor="middle" fill="#fff" fontSize="18" style={{ fontFamily: "var(--font-display)" }}>×{mult}</text>
    </svg>
  );
}

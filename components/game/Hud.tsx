/** Piezas del marcador inferior de la pantalla de juego. */

export function HudCell({ label, children, last, row }: { label: string; children: React.ReactNode; last?: boolean; row?: boolean }) {
  if (row) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, borderRight: last ? 0 : '1px solid var(--line)' }}>
        {children}
        <span className="label" style={{ fontSize: 12, color: 'var(--text-3)', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{label}</span>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: last ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: last ? 12 : 4, borderRight: last ? 0 : '1px solid var(--line)' }}>
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
        // Segmento impreso: tapa recta y tinta plana, sin halo.
        return <path key={i} d={d} stroke={i < filled ? color : '#26262a'} strokeWidth="6" strokeLinecap="butt" fill="none" />;
      })}
      {base >= 4 && <circle cx="28" cy="28" r="15" fill={boosting ? '#ffc53d' : '#ff3d8b'} opacity="0.18" />}
      <text x="28" y="35" textAnchor="middle" fill="#edeae2" fontSize="19" style={{ fontFamily: 'var(--font-poster)', fontVariationSettings: "'wdth' 70, 'wght' 900" }}>×{mult}</text>
    </svg>
  );
}

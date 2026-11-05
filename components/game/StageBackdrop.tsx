/** Escenario dibujado por nosotros (luces, estructura, amplificadores y público). Va detrás de todo. */
export default function StageBackdrop() {
  const crowd: React.CSSProperties[] = [];
  const side: number[] = [];
  for (let i = 0; i < 34; i++) {
    const cx = i * 44 + ((i * 17) % 13) - 6;
    const hh = 34 + ((i * 7) % 12);
    const top = 830 + ((i * 13) % 26);
    crowd.push({ position: 'absolute', left: cx, top, width: hh, height: hh + 60, borderRadius: '50% 50% 8px 8px', background: '#09090a', boxShadow: 'inset 0 2px 0 rgba(233,230,222,0.14)' });
    side.push(i % 2);
    if (i % 3 === 0) crowd.push({ position: 'absolute', left: cx + hh * 0.6, top: top - 70, width: 9, height: 80, borderRadius: 5, background: '#09090a', transform: `rotate(${(i % 2 ? 1 : -1) * 14}deg)`, boxShadow: 'inset 2px 0 0 rgba(233,230,222,0.14)' });
    if (i % 3 === 0) side.push(i % 2);
  }
  return (
    <>
      <svg width="1440" height="900" viewBox="0 0 1440 900" fill="none" aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0 }}>
        <rect width="1440" height="900" fill="#070708" />
        <ellipse cx="720" cy="330" rx="760" ry="360" fill="#141418" fillOpacity="0.9" />
        <ellipse cx="720" cy="360" rx="520" ry="260" fill="#1d1d22" fillOpacity="0.8" />
        <g className="stage-beams">
          <path className="beam beam-a" d="M150 20L-60 900H330Z" fill="#e9e6de" fillOpacity="0.045" />
          <path className="beam beam-b" d="M360 20L180 900H560Z" fill="#e9e6de" fillOpacity="0.06" />
          <path className="beam beam-b" d="M1080 20L880 900H1260Z" fill="#e9e6de" fillOpacity="0.06" />
          <path className="beam beam-a" d="M1290 20L1110 900H1500Z" fill="#e9e6de" fillOpacity="0.045" />
        </g>
        <rect x="0" y="0" width="1440" height="22" fill="#121215" />
        <path d="M0 4H1440M0 18H1440" stroke="#332C5C" strokeWidth="2" />
        <circle cx="150" cy="26" r="18" fill="#e9e6de" fillOpacity="0.14" /><circle cx="150" cy="26" r="7" fill="#e9e6de" />
        <circle cx="360" cy="26" r="18" fill="#e9e6de" fillOpacity="0.14" /><circle cx="360" cy="26" r="7" fill="#e9e6de" />
        <circle cx="1080" cy="26" r="18" fill="#e9e6de" fillOpacity="0.14" /><circle cx="1080" cy="26" r="7" fill="#e9e6de" />
        <circle cx="1290" cy="26" r="18" fill="#e9e6de" fillOpacity="0.14" /><circle cx="1290" cy="26" r="7" fill="#e9e6de" />
      </svg>
      <div className="crowd crowd-a" aria-hidden="true">{crowd.filter((_, i) => side[i] === 0).map((s, i) => <div key={i} style={s} />)}</div>
      <div className="crowd crowd-b" aria-hidden="true">{crowd.filter((_, i) => side[i] === 1).map((s, i) => <div key={i} style={s} />)}</div>
      <style>{`
        .stage-beams { opacity: calc(0.55 + var(--beat, 0) * 0.35 + var(--heat, 0) * 0.5); }
        .beam { transform-box: fill-box; transform-origin: 50% 0; }
        .beam-a { transform: rotate(calc((var(--sway, 0)) * 6deg)); }
        .beam-b { transform: rotate(calc((var(--sway, 0)) * -6deg)); }
        .crowd { position: absolute; inset: 0; pointer-events: none; }
        .crowd-a { transform: translateY(calc(var(--beat, 0) * var(--heat, 0) * -10px)); }
        .crowd-b { transform: translateY(calc((1 - var(--beat, 0)) * var(--heat, 0) * -6px)); }
      `}</style>
    </>
  );
}

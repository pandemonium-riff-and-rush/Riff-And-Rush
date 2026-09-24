import type { Chart, DifficultyId } from '@/lib/chart/types';
import { DIFFICULTIES } from '@/lib/chart/types';

type CoverChart = Pick<Chart, 'cover'> & Partial<Pick<Chart, 'id' | 'title' | 'source'>>;

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Portada. Si el chart tiene video de YouTube usa su miniatura oficial;
 * si no, genera un arte propio (vinilo, ecualizador, atardecer o rayo) a partir del nombre y sus colores.
 */
export function Cover({ chart, size, height, radius = 3, label = false }: { chart: CoverChart; size?: number; height?: number; radius?: number; label?: boolean }) {
  const w = size ?? '100%';
  const h = height ?? size ?? 160;
  const big = typeof h === 'number' && h >= 120;
  const seed = hash((chart.id ?? '') + (chart.title ?? '') + chart.cover.bg);
  const style = seed % 4;
  const { bg, fg } = chart.cover;
  const gid = 'cv' + seed.toString(36);
  const yt = chart.source?.kind === 'youtube' ? chart.source.videoId : null;

  return (
    <div className="cover" style={{ position: 'relative', width: w, height: h, background: bg, borderRadius: radius, flexShrink: 0, overflow: 'hidden' }}>
      {yt ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <svg width="100%" height="100%" viewBox="0 0 200 200" preserveAspectRatio={style === 1 ? "xMidYMax slice" : "xMidYMid slice"} aria-hidden="true" style={{ display: "block" }}>
          <defs>
            <linearGradient id={gid + 'g'} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={bg} />
              <stop offset="1" stopColor="#07061A" />
            </linearGradient>
            <radialGradient id={gid + 'r'} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor={fg} stopOpacity="0.55" />
              <stop offset="1" stopColor={fg} stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="200" height="200" fill={`url(#${gid}g)`} />
          {style === 0 && (
            // Vinilo
            <g>
              <circle cx="120" cy="100" r="92" fill="#07061A" />
              {[84, 74, 64, 54, 44].map((r) => <circle key={r} cx="120" cy="100" r={r} stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1.5" fill="none" />)}
              <path d="M60 40 A92 92 0 0 1 140 12" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="6" fill="none" strokeLinecap="round" />
              <circle cx="120" cy="100" r="28" fill={fg} />
              <circle cx="120" cy="100" r="4" fill="#07061A" />
              <circle cx="120" cy="100" r="60" fill={`url(#${gid}r)`} opacity="0.4" />
            </g>
          )}
          {style === 1 && (
            // Ecualizador
            <g>
              <circle cx="100" cy="120" r="90" fill={`url(#${gid}r)`} />
              {Array.from({ length: 11 }).map((_, i) => {
                // >>> (sin signo): con >> un hash negativo daba barras de alto negativo
                const hh = 30 + ((seed >>> (i % 16)) % 110);
                return <rect key={i} x={14 + i * 16.5} y={180 - hh} width="10" height={hh} rx="3" fill={fg} opacity={0.55 + (i % 3) * 0.2} />;
              })}
              <rect x="0" y="182" width="200" height="3" fill={fg} opacity="0.8" />
            </g>
          )}
          {style === 2 && (
            // Atardecer synthwave
            <g>
              <circle cx="100" cy="92" r="58" fill={fg} />
              {[0, 1, 2, 3, 4].map((i) => <rect key={i} x="30" y={96 + i * 11} width="140" height={2 + i * 1.6} fill={bg} />)}
              <rect x="0" y="130" width="200" height="70" fill="#07061A" />
              {Array.from({ length: 9 }).map((_, i) => <path key={i} d={`M${100 + (i - 4) * 12} 130 L${100 + (i - 4) * 60} 200`} stroke={fg} strokeOpacity="0.5" strokeWidth="1.2" />)}
              {[138, 150, 168, 192].map((y) => <path key={y} d={`M0 ${y}H200`} stroke={fg} strokeOpacity="0.4" strokeWidth="1.2" />)}
            </g>
          )}
          {style === 3 && (
            // Rayo con franjas
            <g>
              {Array.from({ length: 8 }).map((_, i) => <path key={i} d={`M${-40 + i * 36} 200 L${40 + i * 36} 0`} stroke={fg} strokeOpacity={0.08 + (i % 2) * 0.08} strokeWidth="14" />)}
              <circle cx="100" cy="100" r="70" fill={`url(#${gid}r)`} />
              <path d="M112 28 L66 112 H98 L84 172 L138 82 H104 Z" fill={fg} stroke="#07061A" strokeWidth="4" strokeLinejoin="round" />
            </g>
          )}
        </svg>
      )}
      {big && label && chart.title && !yt && (
        <div className="disp" style={{ position: 'absolute', left: 10, right: 10, bottom: 8, fontSize: 22, lineHeight: '22px', color: '#fff', textShadow: '2px 2px 0 #000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chart.title}</div>
      )}
      {big && (
        <span className="cover-play" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" fill="#fff" /></svg>
        </span>
      )}
    </div>
  );
}

export function DiffMinis({ chart }: { chart: Chart }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      {DIFFICULTIES.filter((d) => chart.difficulties[d.id]).map((d) => (
        <span key={d.id} className="mini" style={{ color: d.color, borderColor: d.color }} title={d.name}>{d.label}</span>
      ))}
    </span>
  );
}

export function diffColor(id: DifficultyId) {
  return DIFFICULTIES.find((d) => d.id === id)?.color ?? '#A855F7';
}

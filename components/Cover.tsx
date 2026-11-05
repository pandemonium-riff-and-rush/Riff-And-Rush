import type { Chart, DifficultyId } from '@/lib/chart/types';
import { DIFFICULTIES } from '@/lib/chart/types';

type CoverChart = Pick<Chart, 'cover'> & Partial<Pick<Chart, 'id' | 'title' | 'artist' | 'source'>>;

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Portada.
 *
 * Con video de YouTube: su miniatura oficial, pasada por trama de medio tono. Las
 * miniaturas vienen de mil estilos distintos y puestas una al lado de otra el
 * catálogo se ve como una ensalada; la trama las imprime a todas con la misma tinta.
 *
 * Sin video: una plancha impresa con el título en mayúsculas condensadas, como el
 * afiche de una tocata que nadie fotografió.
 */
export function Cover({ chart, size, height, radius = 0, label = false }: { chart: CoverChart; size?: number; height?: number; radius?: number; label?: boolean }) {
  const w = size ?? '100%';
  const h = height ?? size ?? 160;
  const big = typeof h === 'number' && h >= 120;
  const seed = hash((chart.id ?? '') + (chart.title ?? ''));
  const yt = chart.source?.kind === 'youtube' ? chart.source.videoId : null;
  // Mitad de las planchas van en negativo: así un muro de portadas sin video respira.
  const negativo = seed % 2 === 0;
  const titulo = (chart.title ?? 'Sin título').toUpperCase();

  return (
    <div className="cover screen" style={{ position: 'relative', width: w, height: h, background: 'var(--ink-2)', borderRadius: radius, flexShrink: 0, overflow: 'hidden' }}>
      {yt ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <svg width="100%" height="100%" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ display: 'block' }}>
          <rect width="200" height="200" fill={negativo ? '#0b0b0c' : '#e9e6de'} />
          {/* Barras de tinta: el bloque de color plano del afiche fotocopiado */}
          {[0, 1, 2].map((i) => (
            <rect key={i} x={-20 + i * 70 + (seed % 17)} y="-20" width="28" height="240"
              fill={negativo ? '#e9e6de' : '#0b0b0c'} opacity={0.07 + (i % 2) * 0.05}
              transform={`rotate(-14 100 100)`} />
          ))}
          <text
            x="10" y="86"
            fill={negativo ? '#e9e6de' : '#0b0b0c'}
            style={{ font: "900 44px/0.84 'Archivo Variable', Archivo, sans-serif", fontVariationSettings: "'wdth' 62, 'wght' 900", letterSpacing: '-0.03em' }}
          >
            {titulo.split(' ').slice(0, 3).map((pal, i) => (
              <tspan key={i} x="10" dy={i === 0 ? 0 : 42}>{pal.slice(0, 11)}</tspan>
            ))}
          </text>
          <rect x="0" y="188" width="200" height="12" fill="#ff3d8b" />
        </svg>
      )}
      {big && label && chart.title && !yt && null}
      {big && (
        <span className="cover-play" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>
        </span>
      )}
    </div>
  );
}

export function DiffMinis({ chart }: { chart: Chart }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {DIFFICULTIES.filter((d) => chart.difficulties[d.id]).map((d) => (
        <span key={d.id} className="mini" style={{ color: d.color, borderColor: d.color }} title={d.name}>{d.label}</span>
      ))}
    </span>
  );
}

export function diffColor(id: DifficultyId) {
  return DIFFICULTIES.find((d) => d.id === id)?.color ?? 'var(--spot)';
}

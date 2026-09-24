/** Íconos de trazo (24×24), estilo simple y reconocible. */
const P: Record<string, React.ReactNode> = {
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />,
  pause: <><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /></>,
  toStart: <><path d="M6 5v14" /><path d="M18 5.5v13L9 12z" fill="currentColor" stroke="none" /></>,
  pointer: <path d="M5 3l6.5 17 2.3-7.2L21 10.5z" fill="currentColor" fillOpacity="0.15" />,
  pencil: <><path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 013 3L8 18.5z" /><path d="M13.5 7l3 3" /></>,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 000 12h3" /></>,
  cut: <><circle cx="6" cy="7" r="2.6" /><circle cx="6" cy="17" r="2.6" /><path d="M8.2 8.4L20 18M8.2 15.6L20 6" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" /></>,
  paste: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="M9 11h6M9 15h4" /></>,
  trash: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></>,
  hopo: <path d="M13 2L5 14h6l-1 8 8-12h-6z" fill="currentColor" fillOpacity="0.2" />,
  shorter: <><path d="M4 12h6M14 12h6" /><path d="M7 9l3 3-3 3M17 9l-3 3 3 3" /></>,
  longer: <><path d="M9 12h6" /><path d="M6 9l-3 3 3 3M18 9l3 3-3 3" /></>,
  magnet: <><path d="M6 3v8a6 6 0 0012 0V3" /><path d="M6 7h3M15 7h3" /><path d="M9 3v8a3 3 0 006 0V3" /></>,
  toCursor: <><path d="M12 3v18" /><path d="M4 8l4 4-4 4" /><path d="M20 8l-4 4 4 4" /></>,
  selectAll: <><rect x="3.5" y="3.5" width="17" height="17" rx="2" strokeDasharray="3 2.5" /><path d="M8 12l3 3 5-6" /></>,
  fromCursor: <><path d="M5 3v18" /><path d="M9 12h11" /><path d="M16 8l4 4-4 4" /></>,
  zoomIn: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M8 10.5h5M10.5 8v5" /></>,
  zoomOut: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M8 10.5h5" /></>,
  record: <circle cx="12" cy="12" r="6.5" fill="currentColor" stroke="none" />,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .7-1.5 1.2-1.5 2.5" /><circle cx="12" cy="17" r="0.6" fill="currentColor" /></>,
  save: <><path d="M5 3h11l4 4v13a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" /><path d="M8 3v5h7V3M8 21v-7h8v7" /></>,
  download: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M4 19h16" /></>,
  upload: <><path d="M12 20V9M7 14l5-5 5 5" /><path d="M4 5h16" /></>,
  test: <><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 001.3 2h12.4a1.5 1.5 0 001.3-2L14 9V3" /><path d="M7.5 14h9" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
  grid: <><path d="M4 4v16M9.3 4v16M14.6 4v16M20 4v16" /><path d="M2 12h20" strokeOpacity="0.5" /></>,
  metronome: <><path d="M8 3h8l3 18H5z" /><path d="M12 17l4-9" /></>,
  keyboard: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h1M10 10h1M14 10h1M18 10h0M7 14h10" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />
};

export type IconName = keyof typeof P;

export default function Icon({ name, size = 18, style }: { name: IconName; size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      {P[name]}
    </svg>
  );
}

/** Botón de herramienta con ícono y un globo que muestra nombre + atajo. */
export function ToolBtn({ icon, label, kbd, onClick, disabled, active, danger, text }: {
  icon: IconName; label: string; kbd?: string; onClick?: () => void; disabled?: boolean; active?: boolean; danger?: boolean; text?: string;
}) {
  return (
    <button type="button" className={'tool' + (danger ? ' tool-danger' : '') + (text ? ' tool-text' : '')} onClick={onClick} disabled={disabled}
      aria-label={label + (kbd ? ` (${kbd})` : '')} aria-pressed={active} data-tip={label + (kbd ? ` · ${kbd}` : '')}>
      <Icon name={icon} />
      {text && <span>{text}</span>}
    </button>
  );
}

/** Tecla dibujada como keycap. */
export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

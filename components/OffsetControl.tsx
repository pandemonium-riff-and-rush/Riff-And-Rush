'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Control de offset en ms: se puede escribir a mano, y los botones − / +
 * repiten al mantenerlos apretados, cada vez más rápido.
 * Shift + clic = pasos de 100 ms.
 */
export default function OffsetControl({ value, onChange, step = 10, label = 'Offset' }: { value: number; onChange: (v: number) => void; step?: number; label?: string }) {
  const [text, setText] = useState(String(value));
  const valueRef = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const started = useRef(0);

  useEffect(() => {
    valueRef.current = value;
    setText((t) => (Number(t) === value ? t : String(value)));
  }, [value]);

  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => stop, []);

  const bump = (dir: 1 | -1, big: boolean) => {
    const held = performance.now() - started.current;
    const mult = big ? 10 : held > 2500 ? 10 : held > 1000 ? 5 : 1;
    const next = Math.round(valueRef.current + dir * step * mult);
    valueRef.current = next;
    onChange(next);
  };

  const startHold = (dir: 1 | -1) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    started.current = performance.now();
    bump(dir, e.shiftKey);
    const loop = (delay: number) => {
      timer.current = setTimeout(() => { bump(dir, e.shiftKey); loop(Math.max(35, delay * 0.85)); }, delay);
    };
    stop();
    timer.current = setTimeout(() => loop(90), 380);
  };

  const commit = (s: string) => {
    setText(s);
    const n = Number(s.replace(',', '.'));
    if (s.trim() !== '' && s !== '-' && Number.isFinite(n)) onChange(Math.round(n));
  };

  return (
    <div className="row" style={{ gap: 8 }}>
      {label && <span className="label" style={{ width: 64 }}>{label}</span>}
      <button className="btn btn-s btn-icon" type="button" aria-label={`Restar ${step} ms (mantén para ir más rápido)`}
        onPointerDown={startHold(-1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); started.current = performance.now(); bump(-1, e.shiftKey); } }}>−</button>
      <div className="row grow" style={{ gap: 4, justifyContent: 'center' }}>
        <input
          className="input mono"
          inputMode="numeric"
          aria-label={`${label} en milisegundos`}
          value={text}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setText(String(valueRef.current))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') { e.preventDefault(); started.current = performance.now(); bump(1, e.shiftKey); }
            if (e.key === 'ArrowDown') { e.preventDefault(); started.current = performance.now(); bump(-1, e.shiftKey); }
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          style={{ width: 96, textAlign: 'center', fontSize: 18, fontWeight: 700 }}
        />
        <span className="small muted">ms</span>
      </div>
      <button className="btn btn-s btn-icon" type="button" aria-label={`Sumar ${step} ms (mantén para ir más rápido)`}
        onPointerDown={startHold(1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); started.current = performance.now(); bump(1, e.shiftKey); } }}>+</button>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import type { Chart } from '../chart/types';
import { CATALOGO_DEMO } from './demo';
import { getAllCharts } from './store';
import { fetchPublishedCharts } from './cloud';

/** Charts de demo en el primer render (igual en servidor y cliente) y luego los locales del navegador. */
export function useCharts(): Chart[] {
  const [charts, setCharts] = useState<Chart[]>(CATALOGO_DEMO);
  useEffect(() => {
    const local = getAllCharts();
    setCharts(local);
    // Charts publicados por la comunidad (si hay Supabase configurado)
    fetchPublishedCharts().then((rows) => {
      if (!rows.length) return;
      const ids = new Set(local.map((c) => c.id));
      const extra = rows.filter((r) => !ids.has(r.id)).map((r) => ({ ...r.data, id: r.id, verified: !!r.verified }));
      setCharts([...local, ...extra]);
    }).catch(() => undefined);
  }, []);
  return charts;
}

/** Ejecuta fn solo en el cliente, después de montar (para leer localStorage sin romper la hidratación). */
export function useClientValue<T>(fn: () => T, initial: T, deps: unknown[] = []): T {
  const [v, setV] = useState<T>(initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setV(fn()); }, deps);
  return v;
}

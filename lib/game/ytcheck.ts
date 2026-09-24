'use client';

import { loadYouTubeApi } from './clock';

export interface VideoCheck {
  ok: boolean;
  /** Duración real del video en segundos (si se pudo leer). */
  durationSec?: number;
  /** Título del video tal cual está en YouTube. */
  title?: string;
  /** Canal que lo subió. */
  author?: string;
  /** Código de error de la API de YouTube. */
  code?: number;
  message: string;
}

/** getVideoData no está en los tipos oficiales del reproductor, pero lo expone hace años. */
type PlayerWithData = YT.Player & { getVideoData?: () => { title?: string; author?: string } };

const MESSAGES: Record<number, string> = {
  2: 'El ID del video no es válido.',
  5: 'El reproductor de YouTube no puede mostrar este video aquí.',
  100: 'El video no existe o es privado.',
  101: 'El dueño no permite reproducirlo fuera de YouTube: no sirve para un chart.',
  150: 'El dueño no permite reproducirlo fuera de YouTube: no sirve para un chart.'
};

/**
 * Prueba si un video se puede reproducir embebido antes de publicar el chart.
 * Crea un reproductor escondido (1×1), espera a que esté listo o dé error, y lo destruye.
 */
export function checkVideo(videoId: string, timeoutMs = 12000): Promise<VideoCheck> {
  if (typeof window === 'undefined') return Promise.resolve({ ok: false, message: 'Solo se puede probar en el navegador.' });
  return new Promise((resolve) => {
    let done = false;
    let player: YT.Player | null = null;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(host);

    const finish = (r: VideoCheck) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { player?.destroy(); } catch { /* ya no existe */ }
      host.remove();
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false, message: 'YouTube no respondió a tiempo. Revisa tu conexión y prueba de nuevo.' }), timeoutMs);

    loadYouTubeApi().then(() => {
      if (done) return;
      const el = document.createElement('div');
      host.appendChild(el);
      player = new YT.Player(el, {
        videoId,
        width: 1,
        height: 1,
        playerVars: { playsinline: 1, origin: window.location.origin },
        events: {
          onReady: (e) => {
            const d = Math.round(e.target.getDuration?.() ?? 0);
            // De paso nos traemos el título y el canal: sirven para rellenar el editor
            const meta = (e.target as PlayerWithData).getVideoData?.() ?? {};
            finish({
              ok: true,
              durationSec: d > 0 ? d : undefined,
              title: meta.title || undefined,
              author: meta.author || undefined,
              message: d > 0 ? `Se puede reproducir aquí · dura ${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}` : 'Se puede reproducir aquí.'
            });
          },
          onError: (e) => {
            const code = e.data as number;
            finish({ ok: false, code, message: MESSAGES[code] ?? `YouTube rechazó el video (error ${code}).` });
          }
        }
      });
    }).catch(() => finish({ ok: false, message: 'No se pudo cargar el reproductor de YouTube.' }));
  });
}

# Riff&Rush

Juego de ritmo web estilo Guitar Hero / Jam Legend. Tocas sobre videos de YouTube con charts hechos por la comunidad, en cinco dificultades, y compites en rankings semanales, mensuales y anuales.

## Cómo correrlo

```bash
npm install
npm run dev
```

Abre http://localhost:3000.

## Qué incluye esta versión (v0.1)

| Parte | Estado |
| --- | --- |
| Pantallas: Inicio, Canciones, Detalle, Juego, Resultados, Rankings, Perfil, Editor, Apoyar, Ajustes | Listas |
| Juego con teclado (A S J K L Ñ), puntaje, combo, multiplicador, energía (Espacio), notas largas y HOPO | Listo |
| Reproductor oficial de YouTube como "pantalla del escenario", sin nada encima | Listo |
| Pausa automática si el video se congela (anuncio o buffering) y retroceso de 2 s al retomar | Listo |
| Modo metrónomo para probar sin video | Listo |
| Importar `.chart` y `.mid` (Clone Hero / Rock Band) | Listo |
| Generar Difícil, Normal, Fácil y Leyenda desde Experto | Listo |
| Editor: grilla 1/4–1/16, grabar tocando, tap BPM, offset, exportar JSON | Listo |
| Calibración de latencia | Lista |
| Cuentas, charts compartidos y rankings reales | Pendiente (backend) |

Los datos (charts propios, récords y ajustes) se guardan en `localStorage` del navegador mientras no hay backend.

## Cuentas y rankings (Supabase)

1. En Supabase abre **SQL Editor → New query**, pega todo `supabase/migrations/0001_usuarios.sql` y dale **Run**. Crea perfiles, niveles/XP, charts en la nube, puntajes y los rankings semana/mes/año (se puede volver a correr sin problema).
2. Copia `.env.local.example` como `.env.local` y pega la **Project URL** y la **publishable key** (o la anon key antigua) desde *Project Settings → API Keys*. Nunca uses la `service_role` / secret key en el front.
3. En *Authentication → URL Configuration*: **Site URL** = `http://localhost:3000` y agrega `http://localhost:3000/**` en **Redirect URLs** (después, lo mismo con tu dominio real).
4. Correo y contraseña funcionan de inmediato. Para **Google** o **Discord**: *Authentication → Sign In / Providers*, actívalos y pega el Client ID/Secret de cada uno (la callback que piden es la que te muestra Supabase ahí mismo).
5. `npm install` (se agregó `@supabase/supabase-js`) y `npm run dev`.

Sin `.env.local` el juego sigue funcionando en modo invitado (todo en el navegador).

Qué hace: registro/entrada (correo+clave, link mágico, Google, Discord, recuperar clave), elegir nombre de jugador, color y país, XP y nivel por partida (nivel = ⌊√(xp/50)⌋+1), subida de puntajes al terminar, rankings reales global y por canción, charts guardados en tu cuenta y publicables para la comunidad. Seguridad con RLS: nadie puede editar XP ni puntajes ajenos; máximo una partida cada 20 s por usuario. La validación antitrampa real (revisar el registro de golpes en el servidor) queda para una Edge Function más adelante.

## Probar con una canción real

1. Entra a una canción de demo en **Canciones**.
2. En su ficha, pega el link de YouTube en **Video de YouTube** y guarda.
3. Ajusta el **offset** hasta que las notas calcen con el audio.

Los charts de demo son generados y ficticios, así que no calzan con ninguna canción real. Para eso, importa un `.chart` o `.mid` en el **Editor** y asígnale su video.

## Estructura

```
app/(site)/…          pantallas con barra de navegación
app/jugar/[id]        pantalla de juego a pantalla completa
components/game/      GameScreen (estados, input, HUD) y escenario
lib/chart/            tipos, parsers .chart/.mid y generador de dificultades
lib/game/             relojes (YouTube / metrónomo), puntaje y render de la autopista (canvas)
lib/data/             charts de demo, persistencia local y datos de ejemplo
```

## Reglas de YouTube que respeta el diseño

- El reproductor se ve siempre, mide 560×315 y no tiene nada encima.
- No se descarga ni se separa el audio del video.
- No se bloquean los anuncios: el juego espera a que el video avance.
- No se cobra por reproducir videos. Los pagos son por donación o por quitar nuestros anuncios.

## Próximos pasos sugeridos

1. Backend (Supabase): cuentas, subir charts, puntajes validados en el servidor con el `inputLog` del `Scorer`.
2. Rankings por semana, mes y año con puntos normalizados por dificultad.
3. Moderación y proceso de reportes (DMCA).
4. Borrador de chart con IA (análisis local del audio del usuario en el navegador).

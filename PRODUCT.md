# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

El jugador primario es **alguien que llega de cero**: no jugó Guitar Hero ni Clone
Hero, abre un link que le mandó un amigo por WhatsApp o Discord, casi siempre en un
computador, a veces en el teléfono. No tiene cuenta, no tiene guitarra de plástico y
no sabe qué es un "chart". Tiene unos diez segundos de paciencia para entender qué es
esto antes de cerrar la pestaña.

Audiencias secundarias confirmadas, que no mandan en las decisiones de diseño:

- El jugador del género (Clone Hero, YARG, Guitar Hero): busca precisión, dificultad
  alta, ranking y calibración.
- El charter: crea y sincroniza charts en el editor y los publica.
- El equipo (hoy solo Diego, usuario `Pandemonium_ADMIN`): revisa reportes, verifica
  charts y lee errores y opiniones en `/revision`.

## Product Purpose

Riff&Rush deja tocar cualquier canción de YouTube como juego de ritmo, en el
navegador, sin instalar nada y sin pagar. Las notas las ponen personas (charts de la
comunidad) y la música la pone el reproductor oficial de YouTube. Éxito, hoy, es que
alguien que llega por un link de un amigo termine una canción y vuelva al día
siguiente.

Está en beta abierta y desplegado en Vercel. El dinero, más adelante, viene de
donaciones y de quitar los anuncios propios; nunca de cobrar por ver el video.

## Positioning

Clone Hero y YARG necesitan que bajes el juego y consigas los archivos de audio.
Riff&Rush no: el catálogo es YouTube entero y el chart es lo único que hay que crear.
Eso es lo que un competidor no puede copiar sin asumir lo mismo — que la música no es
suya y que el reproductor de YouTube manda.

## Operating Context

- Se juega en el navegador, de pie o sentado frente al computador, con teclado; hay
  soporte de toque en pantalla para el teléfono y de gamepad.
- El video corre en el reproductor **embebido oficial** de YouTube, visible, sin nada
  encima. El juego espera a que pasen los anuncios antes de empezar.
- Cinco dificultades: Fácil, Normal, Difícil, Experto, Leyenda.
- Rankings que se reinician por semana, mes y año.
- Los puntajes se validan en el servidor rehaciendo la partida con el registro de
  teclas (`input_log`) en una Edge Function.

## Capabilities and Constraints

Hecho con Next.js 16 (App Router), React 19, TypeScript y Supabase (cuentas,
Postgres con RLS, Edge Functions). El escenario de juego se dibuja en un `<canvas>`.

Reglas de YouTube que el diseño no puede romper, confirmadas contra sus políticas de
desarrollador:

- No se puede tapar, bloquear ni cubrir ninguna parte del reproductor.
- No se puede cobrar por reproducir un video ni pedir cuenta para verlo. **Jugar no
  requiere cuenta**; la cuenta solo sirve para rankings y publicar charts.
- No se descarga ni se separa el audio.
- Los anuncios propios solo caben si la página tiene contenido propio de valor.

Otras restricciones:

- Nada de charts sacados de Guitar Hero o Rock Band, ni letras (son con derechos).
- Supabase plan gratis: la base se **pausa sola tras una semana sin actividad**.
- Las técnicas de guitarra (palm mute, pull-off, armónicos, barridos) están
  prototipadas y congeladas en beta; si alguna vez entran, hay que portar su juicio al
  verificador del servidor o los puntajes se rechazan.
- Hay 34 pruebas automáticas sobre reloj, puntaje, charts y verificación de partidas:
  el rediseño no puede cambiar la lógica que cubren.

## Brand Commitments

Mano libre: el usuario autorizó explícitamente proponer cambios de logo, color de
marca y colores de carriles.

Lo único que se mantiene por decisión de diseño, no por mandato: el nombre
**RIFF&RUSH** y el orden de colores de los carriles (verde, rojo, amarillo, azul,
naranja), porque es la convención del género y el jugador que llega de otro juego la
lee sin pensar.

Voz: español de Chile, directa, sin solemnidad y sin jerga de producto. Los textos de
la interfaz hablan de "canciones" y "notas", no de "assets" ni de "contenido".

## Evidence on Hand

- 8 charts reales hechos por el usuario sobre videos de YouTube (Avenged Sevenfold,
  Ghost, Falling In Reverse, Ly4ndris y otros), en la base de datos.
- Rankings, perfiles, reportes y registro de errores funcionando contra Supabase.
- Portadas: la miniatura real del video de YouTube de cada canción.
- **No hay**: jugadores de verdad más allá del propio usuario, partidas acumuladas,
  testimonios, prensa ni cifras de uso. Nada de eso se puede inventar en pantalla; las
  pantallas ya tienen estados vacíos honestos y hay que conservarlos.

## Product Principles

1. **Tocar antes que registrarse.** Nadie necesita cuenta para jugar una canción. Lo
   que pida cuenta se pide después de que la persona ya tocó.
2. **El video manda.** El reproductor de YouTube se ve siempre y nada se le pone
   encima. El juego se acomoda a él, no al revés.
3. **Nada inventado.** Si no hay partidas, se dice que no hay partidas. Ningún
   jugador, puntaje ni reseña de relleno.
4. **Diez segundos para entender.** El que llega de cero tiene que saber qué es esto y
   estar tocando sin leer instrucciones.
5. **La precisión es el producto.** Latencia, sincronía y juicio de notas son la
   funcionalidad; ninguna decisión visual puede costarles cuadros por segundo.

## Accessibility & Inclusion

- Los carriles no pueden distinguirse solo por color: hay que dar forma o posición
  también, para daltonismo (pendiente en el código actual).
- El juego se maneja entero con teclado por definición; la web alrededor también debe
  poder recorrerse con teclado, con foco visible.
- Hay un ajuste de "Efectos visuales" para bajar la carga; debe seguir existiendo y
  respetar `prefers-reduced-motion`.

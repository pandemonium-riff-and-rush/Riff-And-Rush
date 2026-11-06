# Design

<!-- impeccable:design-schema 1 -->

Mundo visual de Riff&Rush: **muro de afiches de tocata**. Dos tintas sobre papel
barato. Todo lo de abajo está sacado del build, no de un plan previo.

## Principio

El afiche fotocopiado es el objeto que anuncia que alguien va a tocar. Riff&Rush
anuncia canciones, así que la página se imprime como ese afiche: negro de tinta,
papel hueso, un solo color plano y tipografía que llena la hoja. Lo que la
categoría hace por defecto —casi negro con un acento neón y brillos, titular
centrado sobre una fila de carátulas iguales— queda fuera a propósito.

## Color

Estrategia: **contenida**. El negro de tinta ocupa casi toda la superficie, el
papel aparece como planchas enteras invertidas en los momentos que importan y el
plano rosa hace trabajos concretos. El color de carril es funcional y vive solo
dentro del juego.

| Token | Valor | Para qué |
|---|---|---|
| `--ink` | `#0b0b0c` | Fondo de todo. Negro neutro de fotocopia, no azulado. |
| `--ink-2` | `#141416` | Bloques sobre el fondo (paneles, tarjetas). |
| `--ink-3` | `#1d1d20` | Hover de esos bloques. |
| `--ink-soft` | `#26262a` | Hover de controles chicos. |
| `--paper` | `#e9e6de` | Papel barato y frío. **Nunca crema.** Planchas, botón principal, logotipo. |
| `--paper-2` | `#d4d0c5` | Papel apagado, activo del botón principal. |
| `--paper-3` | `#b9b4a7` | Canto del papel y bordes al pasar el mouse. |
| `--spot` | `#ff3d8b` | El plano, grado riso. Enlaces, sello, barra superior, estado activo. |
| `--spot-deep` | `#d41f6a` | El plano sobre papel, donde el claro no contrasta. |
| `--text` | `#edeae2` | Texto sobre tinta. |
| `--text-2` | `#8e8a80` | Texto secundario. 4,6:1 sobre `--ink`. |
| `--text-3` | `#c3bfb5` | Texto de párrafo largo sobre tinta. |
| `--line` | `#2a2a2e` | Filete de 1 px. |
| `--line-2` | `#3d3d43` | Borde de control. |
| `--ok` `--warn` `--err` `--gold` | `#46d07f` `#ffc53d` `#ff5a5a` `#ffc53d` | Señales. |
| `--lane-1..6` | verde, rojo, amarillo, azul, naranja, violeta | Carriles. Convención del género; **solo dentro del juego**. |

Reglas que el sistema respeta:

- El plano rosa no se usa como fondo de texto claro (no pasa 4,5:1). Sobre rosa va
  tinta negra; sobre tinta, el rosa se usa como texto o como regla.
- Una pantalla con muchos elementos repetidos (catálogo, muro) no lleva color por
  elemento: la dificultad se escribe `FÁCIL–EXPERTO` en mono, no en cuatro cajitas
  de colores.

## Tipografía

Una familia variable, dos voces, servida desde el proyecto
(`@fontsource-variable/*`): no hay petición a Google, no hay salto al cargar y
funciona con Google bloqueado.

| Token | Familia | Ajustes | Para qué |
|---|---|---|---|
| `--font-poster` | Archivo Variable | `wdth 62–64`, `wght 900`, versalitas, `tracking -0.025em`, `line-height .86` | Titulares de afiche (`.disp`) |
| `--font-poster` | Archivo Variable | `wdth 72–86`, `wght 700–800` | Encabezados, botones, chips, navegación (`.cond`) |
| `--font-body` | Archivo Variable | `wdth 100`, `wght 400–700` | Texto corrido, 16 px / 25 px |
| `--font-mono` | Martian Mono Variable | `tracking -0.03em`, cifras tabulares | Tiempos, BPM, puntajes, posiciones, etiquetas técnicas |

Escala de titulares: `clamp(54px, 11vw, 150px)` en la portada; `clamp(30px, 4vw,
46px)` en encabezados de sección; 24 px en encabezados de bloque. Medida de
lectura: 44–68 ch.

## Forma y profundidad

- **Radio cero en todo.** Una fotocopia no tiene esquinas redondeadas.
- **Nada de sombras duras desplazadas.** La profundidad viene del material: una
  plancha de papel lleva `border-bottom: 3px solid var(--paper-3)`, que es el canto
  de una hoja apoyada.
- **Dos grosores de regla y nada entre medio:** filete de 1 px (`.hair`) o barra de
  tinta de 6 px (`.bar`). La barra separa secciones y corona lo que importa.
- **Trama de medio tono** (`.screen`): toda miniatura de YouTube pasa por
  `grayscale + contrast` y una retícula de puntos de 3 px en `multiply`. Las
  miniaturas vienen de mil estilos y esto las imprime a todas con la misma tinta.
  Al pasar el mouse la trama se quita y vuelve el color: la imagen real sigue
  disponible, solo deja de competir en reposo.
- **Plancha invertida** (`.plate`): papel con tinta encima. Es el gesto más fuerte
  del sistema y está reservado para dos momentos: la sección de propuesta en la
  portada y el puntaje final en resultados.

## Movimiento

Un solo momento con autoría por pantalla, nunca efectos sueltos. La curva es
`cubic-bezier(.16, 1, .3, 1)` (desaceleración exponencial); no hay rebote. La
entrada de página es una aparición de 0,3 s sin desplazamiento. Todo respeta
`prefers-reduced-motion`, que reduce cualquier animación y transición a ~0.

## Superficies del navegador

Tematizadas, no por defecto: selección de texto en el plano rosa, cursor de texto
rosa, barra de desplazamiento en `--line-2` sobre tinta, foco visible con contorno
rosa de 2 px y 2 px de separación, cifras tabulares en toda la mono.

## El juego

La autopista es del mismo mundo: fondo de tinta, carriles con filetes de papel al
10 %, trastes de papel, línea de golpe como barra maciza de papel de 6 px. Las
notas son tinta plana del color de su carril con contorno negro y un borde de papel
arriba que da el volumen: ni degradado radial ni halo. El resplandor quedó
reservado para el modo Leyenda, donde avisa de un cambio de estado real; sacarlo
del resto también bajó el costo por cuadro en teléfonos.

### El fondo del escenario

Un muro de afiches pegados unos sobre otros, dibujado una sola vez en un lienzo
aparte y copiado en cada cuadro. Encima: la miniatura de la canción, enorme,
tramada y muy oscura, y una sola luz de escenario que respira con el pulso. Antes
había seis láseres, barras de ecualizador con degradado y partículas de colores;
con la paleta nueva todo eso se dibujaba en blanco apagado y quedaba una niebla
turbia que no decía nada.

### Estilos de autopista

Se eligen en Ajustes y cambian **solo el juego**, nunca la web. Viven en
`HIGHWAY_THEMES` (`lib/game/render.ts`), que es también la lista que dibuja Ajustes,
así que no se pueden desincronizar.

| Estilo | Qué es |
|---|---|
| **Afiche** (de la casa) | Tinta y papel. Notas de tinta plana, sin halos. |
| **Neón** | El estilo anterior del juego: morado, bordes con brillo, notas con degradado. |
| **Mástil** | La autopista es el diapasón: madera con veta, trastes de alambre, puntos de posición y una cuerda por carril. |
| **Contraste** | Negro puro y blanco. Lo más legible a toda velocidad. |
| **Tablas** | Tablas de escenario, cálido y sin brillos. |
| **Hielo** | Azul frío, con brillo. |

Cada estilo declara si lleva halos (`glow`), cómo se dibuja la nota (`gem`) y si la
tabla es lisa o un diapasón (`board`). Un halo cuesta cuadros, así que es una
propiedad del estilo y no un adorno suelto.

### Medidor y rango

La energía es un medidor de **diez bloques** (vertical en escritorio, horizontal en
teléfono) con el bloque de la mitad marcado en dorado: ahí es donde se puede activar
el modo Leyenda, y una barra lisa no dejaba ver cuánto faltaba. El rango es un bloque
macizo con la letra en tinta encima, no un contorno con resplandor.

**Pendiente conocido:** los carriles todavía se distinguen solo por color. Para
daltonismo hace falta darles forma o posición además del color.

## Navegación

Canciones → Rankings → Crear. Es el orden del jugador que llega de cero: primero
tocar, después competir, después crear. "Apoyar" no está en la barra —pedir plata
antes de que alguien haya jugado no tiene sentido— y vive en el pie.

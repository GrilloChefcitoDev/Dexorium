# Guía sencilla del código de DEXORIUM

Esta guía está pensada para poder explicar el proyecto en clase y encontrar rápidamente dónde hacer un cambio. El juego usa **React** para la página, **CSS** para el diseño y **Node.js + WebSocket** para coordinar los combates entre jugadores.

## 1. ¿Qué hace cada carpeta?

- `src/`: la parte que se ve en el navegador: pantallas, equipo Pokémon, combate y estilos.
- `src/App.jsx`: conecta las pantallas y controla qué vista se muestra. También contiene varios componentes de la interfaz.
- `src/index.css`: colores, tamaños, distribución de paneles, botones y adaptación a móviles. Los fondos principales son ahora colores planos.
- `src/components/`: componentes visuales que se pueden reutilizar, como el manual y la selección del equipo.
- `src/audio/`: reproducción y control de sonido.
- `src/network/`: conexión del navegador con el servidor por WebSocket.
- `server/server.js`: reglas de combate que deben ser iguales para los jugadores: acciones, daño, cambios, turnos y fin de partida.
- `shared/`: reglas pequeñas compartidas o reutilizadas y fáciles de probar.
- `shared/healthBar.js`: decide si una barra de vida debe verse verde, amarilla o roja según los PS restantes.
- `tests/`: pruebas automáticas para comprobar reglas importantes.

## 2. Cómo se resuelve un turno

1. Cada jugador envía su acción al servidor: atacar, cambiar, curar, defender o usar una mecánica especial.
2. El servidor espera las acciones de los jugadores activos.
3. Primero registra las elecciones en el historial.
4. **Aplica todos los cambios de Pokémon antes del daño.** Por eso, si Pikachu entra mientras Snorlax eligió atacar a Greninja, el ataque de Snorlax golpea al Pikachu que ahora está activo.
5. Resuelve las demás acciones por velocidad y aplica daño, escudo o curación.
6. Comprueba si algún Pokémon llegó a 0 PS y si ya hay un ganador.

El navegador no decide el daño por su cuenta: envía la acción y el servidor calcula el resultado. Eso evita que cada jugador vea un resultado distinto.

## 3. Dónde cambiar cosas comunes

### Cambiar colores

Abre `src/index.css` y busca el bloque `:root` al comienzo. Allí se definen colores reutilizables como `--red`, `--blue`, `--panel` y `--yellow`. Se escriben en hexadecimal RGB, por ejemplo `#243B55`. Cambiar una variable modifica los elementos que la utilizan. Algunos elementos conservan colores propios porque necesitan distinguirse (por ejemplo, efectividad o estados).

### Cambiar la fuerza de un ataque

Busca `resolveAction()` en `server/server.js`. La parte que calcula el daño toma la potencia del ataque, la efectividad del tipo, la defensa y el escudo. Para cambiar el balance, cambia una regla cada vez y vuelve a correr las pruebas.

### Cambiar cómo funciona el cambio de Pokémon

Busca `resolveTurn()` en `server/server.js`. El bloque de cambios está separado y aparece antes de las acciones que causan daño. `getResolvedTargetPokemon()` en `shared/combatTargets.js` hace que un ataque use el Pokémon activo al momento de resolverlo.

### Cambiar las transformaciones

Busca `shared/pokemonTransformations.js`. Ahí se definen las opciones disponibles y sus efectos. El servidor valida que una transformación sea legal antes de aplicarla; la interfaz no debe ser el único lugar donde se comprueba una regla.

### Cambiar los colores de la vida

La función `getHealthBarClass()` está en `shared/healthBar.js`. Usa proporciones fáciles de reconocer: más del 50 % de vida es verde, más del 20 % y hasta el 50 % es amarillo, y 20 % o menos es rojo. Los colores y sus transiciones visuales están en `src/index.css`, al final del archivo.

### Cambiar textos o disposición de pantallas

Busca el componente relacionado en `src/App.jsx` o en `src/components/`. La apariencia se cambia en `src/index.css`; intenta usar una clase CSS existente antes de añadir estilos en línea.

## 4. Cómo ejecutar y comprobar el proyecto

Necesitas una versión actual de Node.js. Abre una terminal dentro de esta carpeta y ejecuta:

```bash
npm install
npm test
npm run dev
```

- `npm install` instala las dependencias.
- `npm test` ejecuta las pruebas automáticas.
- `npm run dev` inicia el sitio de Vite y el servidor WebSocket.

Antes de entregar un cambio, ejecuta `npm test`. Si cambias la interfaz, revisa también la página en el navegador y prueba una partida con dos ventanas.

## 5. Cómo explicar el cambio de objetivo en un parcial

> “Las dos personas pueden elegir su jugada antes de que el servidor resuelva el turno. Antes el ataque guardaba el ID del Pokémon que el rival tenía activo al seleccionar la acción. Si ese rival cambiaba, el ID viejo dejaba de ser válido y el ataque podía fallar. Ahora el servidor procesa primero los cambios y, al aplicar un ataque, vuelve a consultar quién está activo. Así el ataque no se pierde y el Pokémon que acaba de entrar recibe el daño.”

## 6. Regla práctica para modificar el proyecto

Haz cambios pequeños, con nombres claros y comentarios que expliquen **por qué** existe una regla. Si puedes, agrega una prueba para el caso nuevo. No dupliques una regla importante solo en el navegador: las reglas del combate deben validarse en el servidor.

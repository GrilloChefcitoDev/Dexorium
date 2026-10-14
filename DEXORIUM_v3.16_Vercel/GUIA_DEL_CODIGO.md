# Guía práctica para entender y modificar DEXORIUM

Esta guía está escrita para que puedas trabajar en el proyecto aunque todavía no tengas mucha experiencia programando. No necesitas aprender todo de memoria: lo importante es saber **qué archivo buscar, qué cambiar y cómo comprobar que sigue funcionando**.

DEXORIUM está hecho con React para la interfaz, CSS para la apariencia y Node.js para las reglas del combate entre jugadores. Las reglas que deben ser iguales para ambos jugadores se validan en el servidor, no solamente en el navegador.

---

## 1. Antes de tocar el código: trabaja con una copia

1. Extrae el ZIP en una carpeta de tu computador.
2. Duplica esa carpeta y nómbrala, por ejemplo, `DEXORIUM-pruebas`. Conserva la primera como respaldo.
3. Instala [Visual Studio Code](https://code.visualstudio.com/) si todavía no tienes un editor de código.
4. En VS Code, abre la carpeta que contiene el archivo `package.json`. Es importante abrir esa carpeta raíz y no solamente la carpeta `src`.
5. Para ubicar una parte del proyecto, usa **Ctrl + Shift + F** (buscar en todos los archivos). Busca el nombre de una función, clase CSS o texto que ves en pantalla.

**Regla de oro:** cambia una cosa cada vez. Guarda, prueba y luego pasa a la siguiente. Así, si algo falla, sabrás cuál fue el cambio responsable.

## 2. Mapa del proyecto: ¿qué archivo debo abrir?

| Quiero cambiar… | Archivo que debo mirar | Para qué sirve |
|---|---|---|
| Colores, tamaños, bordes, fondos y diseño | `src/index.css` | Controla cómo se ven los elementos. |
| Portada y Pokédex roja de inicio | `src/components/PokedexIntro.jsx` | Contiene los elementos y botones de la primera pantalla. Su estilo está en `src/index.css`. |
| Texto del manual «Cómo jugar» | `src/components/HowToPlay.jsx` | Contiene las explicaciones que lee el jugador. |
| Búsqueda y selección de los seis Pokémon | `src/components/TeamBuilder.jsx` | Controla la pantalla de creación del equipo. |
| Qué pantalla aparece y cómo se conectan las vistas | `src/App.jsx` | Es el componente principal de la aplicación. Es grande; busca el texto o nombre de función antes de editar. |
| Color de las barras de vida | `shared/healthBar.js` | Decide si la vida es verde, amarilla o roja. |
| Pruebas de los colores de las barras | `tests/healthBar.test.js` | Comprueba los límites de cada color. |
| Daño, turnos, ataques y cambios de Pokémon | `server/server.js` | Aplica las acciones y determina el resultado real del combate. |
| Reglas y opciones de transformaciones | `shared/pokemonTransformations.js` | Calcula qué transformaciones se ofrecen y cómo se tratan sus opciones. El servidor también valida su uso. |
| Qué ocurre al terminar o repetir un combate | `shared/rematchRules.js` y `server/server.js` | Reglas de revancha y coordinación de la partida. |
| Conexión entre navegador y servidor | `src/network/useGameSocket.js` | Envía y recibe mensajes de la partida. |
| Música y efectos de sonido | `src/audio/AudioManager.jsx` | Administra reproducción y controles de audio. |
| Consulta de datos de Pokémon | `src/services/pokeApi.js` | Obtiene y prepara los datos de Pokémon. |
| Pruebas automáticas | `tests/` | Contiene pruebas para varias reglas importantes. |

### Una diferencia que te ahorrará muchos problemas

- **JSX / React:** decide qué elementos existen y qué ocurre cuando el usuario hace clic.
- **CSS:** decide cómo se ven esos elementos.
- **Servidor (`server/server.js`):** decide qué sucede realmente en el combate.
- **`shared/`:** guarda reglas pequeñas que pueden reutilizarse desde varias partes.
- **`tests/`:** sirve para comprobar que una regla sigue comportándose como esperamos.

Por ejemplo, cambiar el color de un botón es un cambio visual de CSS. Cambiar el daño que hace un ataque es una regla del servidor. No intentes arreglar el daño cambiando únicamente el botón.

---

## 3. Cómo entender una parte de React sin leer el archivo entero

Una pantalla o pieza visual suele ser un **componente**. Por ejemplo, `src/components/PokedexIntro.jsx` contiene un componente llamado `PokedexIntro`.

Dentro de JSX puedes encontrar algo parecido a esto:

```jsx
<button
  className="secondary-button intro-guide-button"
  type="button"
  onClick={onOpenGuide}
>
  Leer cómo jugar
</button>
```

Lee ese ejemplo de esta manera:

- `button`: dibuja un botón.
- `className`: le asigna nombres de clases para encontrar sus estilos en CSS.
- `onClick`: indica qué función se ejecuta al hacer clic.
- `onOpenGuide`: es una función que el componente recibe desde otra parte del programa.
- `Leer cómo jugar`: es el texto que aparece en el botón.

Si quisieras cambiar solamente el texto, modificarías el contenido entre `>` y `</button>`. Si quisieras cambiar su apariencia, buscarías las clases `secondary-button` o `intro-guide-button` en `src/index.css`. Si quisieras cambiar lo que ocurre al hacer clic, primero tendrías que seguir la función `onOpenGuide` hasta donde se define.

No necesitas cambiar las tres cosas a la vez.

---

## 4. Ejercicio 1: cambiar un color sin dañar toda la página

Abre `src/index.css`. Al principio encontrarás una sección llamada `:root`, que contiene colores reutilizables:

```css
:root {
  --red: #dc0a2d;
  --red-dark: #8f061f;
  --red-light: #ff3857;
  --blue: #29aafd;
  --blue-dark: #0b4775;
  --yellow: #fae017;
}
```

Estos nombres se llaman **variables CSS**. Por ejemplo, `var(--blue)` quiere decir «usa el color guardado en la variable `--blue`».

Para probar un cambio, reemplaza solamente esta línea:

```css
--blue: #29aafd;
```

por esta:

```css
--blue: #168bd2;
```

Guarda el archivo y mira el navegador. Los elementos que utilizan `var(--blue)` adoptarán el nuevo color; un elemento que tenga un color escrito directamente con su código hexadecimal no necesariamente cambiará.

### ¿Y si solo quiero cambiar los botones principales?

Busca `.primary-button` en `src/index.css`. Esa clase controla la apariencia común de muchos botones principales. La Pokédex también tiene clases propias, como `.pokedex-3d__left` y `.pokedex-3d__right`.

Ten cuidado: hay reglas de CSS repetidas más abajo en este archivo porque el diseño se ha ido ajustando. Si cambias una regla y no ves ninguna diferencia, busca ese mismo selector otra vez. Una regla posterior puede estar sobrescribiendo la primera. No borres bloques enteros sin comprobar qué elementos los utilizan.

---

## 5. Ejercicio 2: cambiar cuándo la barra de vida se vuelve amarilla o roja

Abre `shared/healthBar.js`. La función actual es:

```js
export function getHealthBarClass(currentHp, maxHp) {
  const safeMaxHp = Math.max(1, Number(maxHp) || 1);
  const safeCurrentHp = Math.max(0, Number(currentHp) || 0);
  const healthRatio = Math.min(1, safeCurrentHp / safeMaxHp);

  if (healthRatio <= 0.2) return 'hp-critical';
  if (healthRatio <= 0.5) return 'hp-low';
  return 'hp-healthy';
}
```

¿Qué significa?

1. Divide los PS actuales entre los PS máximos para obtener una proporción entre 0 y 1.
2. Si queda un 20 % o menos, devuelve `hp-critical` (rojo).
3. Si queda un 50 % o menos, pero más del 20 %, devuelve `hp-low` (amarillo).
4. En los demás casos devuelve `hp-healthy` (verde).

Por ejemplo, con 100 PS máximos:

- 80 PS: verde.
- 50 PS: amarillo.
- 20 PS: rojo.
- 0 PS: rojo.

**No cambies solamente el color dentro de CSS para cambiar el límite de vida.** CSS pinta la barra; `healthBar.js` elige qué clase corresponde a la cantidad de vida.

Si cambias los límites, revisa también `tests/healthBar.test.js`. Las pruebas actuales esperan que el 50 % sea amarillo y el 20 % sea rojo. Si decides que el rojo empiece al 15 %, debes añadir o ajustar pruebas para ese nuevo comportamiento.

---

## 6. Ejercicio 3: modificar un texto del manual

Abre `src/components/HowToPlay.jsx`. Busca el título o la frase que quieras cambiar. Por ejemplo:

```jsx
<h3>Prepara tu equipo</h3>
```

Puedes cambiar el texto por otro sin tocar la lógica. Evita borrar las etiquetas que lo rodean (`<h3>` y `</h3>`), porque indican dónde empieza y termina el título.

Si quieres cambiar el diseño del manual —espaciado, color, tamaño o bordes— busca clases como `.howto-panel`, `.howto-step` o `.howto-footer` en `src/index.css`.

---

## 7. Ejercicio 4: entender la fórmula del daño

Esta es una de las partes más delicadas. Abre `server/server.js` y busca la función `resolveAction()`. Dentro de ella, la sección de ataque contiene esta lógica:

```js
const multiplier = getTypeMultiplier(action.type, target.types);
const rawDamage = Math.round(action.power * multiplier);
const damageAfterDefense = Math.max(
  1,
  rawDamage - Math.floor(target.battleStats.defense / 10)
);
const shieldAbsorbed = Math.min(target.shield, damageAfterDefense);
const finalDamage = Math.max(0, damageAfterDefense - shieldAbsorbed);
target.currentHp = Math.max(0, target.currentHp - finalDamage);
```

Explicado de forma sencilla:

1. Calcula la efectividad del tipo del ataque contra el tipo del objetivo.
2. Multiplica la potencia del movimiento por esa efectividad.
3. Resta una parte de la defensa del Pokémon que recibe el golpe.
4. El escudo absorbe una parte del daño restante.
5. Resta el daño final a los PS y nunca permite que la vida quede por debajo de cero.

No edites todas esas líneas al mismo tiempo. Primero decide qué regla deseas cambiar y modifica solamente esa regla. Después ejecuta las pruebas y juega una batalla de prueba con dos ventanas del navegador.

### ¿Por qué el ataque golpea al Pokémon que acaba de entrar?

En `server/server.js`, `resolveTurn()` procesa primero los cambios de Pokémon. Más adelante, `resolveAction()` resuelve el ataque. La función `getResolvedTargetPokemon()` de `shared/combatTargets.js` consulta el Pokémon que está activo al resolver el golpe. Esta separación evita que un ataque se pierda solo porque el rival cambió de Pokémon después de seleccionar su acción.

No muevas el bloque de cambios por encima o por debajo de otras acciones sin entender el orden del turno: el orden es parte de las reglas del juego.

---

## 8. Ejercicio 5: modificar transformaciones

Abre `shared/pokemonTransformations.js`. Las funciones más útiles para orientarte son:

- `getTransformationOptions()`: prepara la lista de opciones que puede mostrar la interfaz.
- `findTransformationOption()`: encuentra la opción concreta que eligió la persona.
- `applyTransformationToCard()`: aplica la transformación a los datos de batalla.
- `isTransformationOptionValid()`: ayuda a comprobar si la selección está permitida.

El servidor también debe validar la acción. No basta con ocultar un botón en el navegador: una regla importante debe rechazarse en el servidor aunque alguien intente enviar una acción que la interfaz no ofrece.

Si cambias una transformación, busca sus pruebas dentro de `tests/transformations.test.js`. Añadir una opción implica comprobar que se ofrece a quien corresponde, que se aplica correctamente y que no permite combinaciones prohibidas.

---

## 9. Cómo ejecutar el proyecto y comprobar tus cambios

Necesitas Node.js instalado. Después abre una terminal en la carpeta raíz del proyecto —la misma donde está `package.json`— y ejecuta:

### Primera vez solamente

```bash
npm install
```

Este comando instala las dependencias del proyecto. Normalmente no hay que repetirlo cada vez que editas un archivo.

### Antes o después de hacer un cambio de lógica

```bash
npm test
```

Ejecuta las pruebas automáticas. Si una prueba falla, lee el nombre de la prueba y el mensaje de error: suele indicar qué comportamiento cambió inesperadamente.

### Para abrir el juego mientras editas

```bash
npm run dev
```

Este comando inicia el sitio y el servidor del juego. La terminal mostrará la dirección local que debes abrir en el navegador. Déjala abierta mientras pruebas.

### Para comprobar que se puede generar la versión de producción

```bash
npm run build
```

Si este comando falla por una dependencia ausente, verifica que `npm install` haya terminado correctamente y lee el primer error real de la terminal.

Después de un cambio en la interfaz, revisa el navegador. Después de un cambio de combate, además de las pruebas, prueba una partida entre dos ventanas para asegurarte de que ambos jugadores ven el mismo resultado.

---

## 10. Si algo deja de funcionar

1. Lee el primer error de la terminal o la consola del navegador. No intentes corregir diez cosas a la vez.
2. Comprueba si el error nombra el archivo que acabas de editar.
3. Revisa que los paréntesis `()`, llaves `{}`, corchetes `[]` y etiquetas JSX estén cerrados.
4. Deshaz el último cambio con **Ctrl + Z** si no sabes cómo corregirlo, o recupera ese archivo desde tu copia de respaldo.
5. Ejecuta otra vez `npm test`.

Si la página queda en blanco, revisa la consola del navegador: pulsa F12 y abre la pestaña **Console**. Copia el primer error rojo junto con el archivo y la línea que mencione. Ese dato ayuda a encontrar el problema más rápido que una captura de toda la pantalla.

---

## 11. Frases sencillas para explicar el proyecto en clase

Puedes explicar la arquitectura así:

> “React dibuja la interfaz y recoge las acciones del jugador. CSS define la apariencia. El navegador envía las jugadas mediante WebSocket. El servidor valida las acciones, ordena los turnos y calcula los resultados del combate. La carpeta shared reúne reglas que se reutilizan y la carpeta tests comprueba que esas reglas sigan funcionando.”

Para explicar el cambio de Pokémon:

> “Los dos jugadores eligen su acción antes de que el turno se resuelva. El servidor aplica primero los cambios de Pokémon y después ejecuta los ataques. Al calcular el daño, vuelve a consultar qué Pokémon está activo, así que el golpe afecta al Pokémon que entró y no se pierde por un cambio de objetivo.”

Para explicar las barras de vida:

> “Una función convierte los PS actuales y máximos en un porcentaje. Según ese porcentaje devuelve una clase CSS: verde, amarilla o roja. CSS pinta la barra y las pruebas comprueban los límites de cada color.”

---

## 12. El método que te conviene aprender

Cada vez que quieras añadir o modificar algo, contesta estas cuatro preguntas antes de editar:

1. **¿Qué quiero cambiar?** Ejemplo: quiero que la barra se ponga roja antes.
2. **¿Dónde vive esa regla?** Ejemplo: `shared/healthBar.js` decide el límite; `src/index.css` decide el color visual.
3. **¿Cómo sabré que funcionó?** Ejemplo: modificar o añadir pruebas y mirar la barra en el navegador.
4. **¿Cómo regreso atrás si falla?** Ejemplo: guardar una copia, cambiar una sola cosa y deshacer el último cambio.

No tienes que memorizar el proyecto entero para empezar. Lo que debes practicar es seguir el recorrido de un cambio desde la pantalla hasta la función que lo controla, y comprobarlo antes de continuar.

// Aqui dejamos las reglas de las cartas en un solo sitio.
// Asi la pantalla y el servidor usan exactamente las mismas formulas y no toca copiarlas dos veces.

export const API_URL = 'https://pokeapi.co/api/v2';
export const MAX_TEAM_SIZE = 6;
export const MAX_ENERGY = 100;
export const ENERGY_REGEN_PER_TURN = 15;
export const ENERGY_RECOVERY_AMOUNT = 35;

export function recoverEnergy(currentEnergy, amount = ENERGY_RECOVERY_AMOUNT) {
  const current = Math.max(0, Number(currentEnergy) || 0);
  const gain = Math.max(0, Number(amount) || 0);
  return Math.min(MAX_ENERGY, current + gain);
}

export function regenerateEnergy(currentEnergy, amount = ENERGY_REGEN_PER_TURN) {
  return recoverEnergy(currentEnergy, amount);
}

// No hace falta escribir toda la tabla de tipos.
// Solo guardamos las combinaciones que cambian el daño; si no aparece aca, se toma como 1.
export const TYPE_CHART = {
  normal: { rock: 0.5, ghost: 0 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, steel: 0.5, dark: 0 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

// Cada tipo tiene un ataque propio para que las cartas no se sientan iguales.
// La defensa y la curacion van por otro lado porque no dependen del tipo de ataque.
export const ACTIONS_BY_TYPE = {
  normal: ['Placaje', 'Golpe Firme'],
  fire: ['Llamarada', 'Puño Fuego'],
  water: ['Hidroimpacto', 'Aqua Golpe'],
  grass: ['Hoja Afilada', 'Latigazo Verde'],
  electric: ['Impactrueno', 'Onda Voltio'],
  ice: ['Rayo Hielo', 'Ventisca'],
  fighting: ['Golpe Karate', 'Puño Dinámico'],
  poison: ['Picotazo Veneno', 'Lodo Tóxico'],
  ground: ['Excavar', 'Terremoto'],
  flying: ['Ataque Ala', 'Vendaval'],
  psychic: ['Confusión', 'Psicoonda'],
  bug: ['Picadura', 'Tijera X'],
  rock: ['Lanzarrocas', 'Avalancha'],
  ghost: ['Sombra', 'Bola Sombra'],
  dragon: ['Garra Dragón', 'Pulso Dragón'],
  dark: ['Mordisco', 'Pulso Umbrío'],
  steel: ['Garra Metal', 'Cabeza de Hierro'],
  fairy: ['Brillo Mágico', 'Golpe Feérico'],
};

// PokeAPI trae varios stats distintos. Aca los convertimos a los 5 valores simples que usa nuestra batalla.
export function calculateBattleStats(pokemon) {
  const base = Object.fromEntries(
    pokemon.stats.map((item) => [item.stat.name, item.base_stat]),
  );

  return {
    // Le damos una base de 100 y le sumamos el HP de PokeAPI.
    // Asi un Pokémon con mas HP tambien aguanta mas turnos.
    hp: 100 + base.hp,
    // Mezclamos Ataque y Ataque Especial para sacar un solo numero de poder.
    // El Ataque pesa mas porque es el valor principal que usamos para golpear.
    power: Math.round(base.attack * 0.75 + base['special-attack'] * 0.25),
    // La defensa se toma directo de PokeAPI.
    // Mas adelante este valor se resta un poco al daño recibido.
    defense: base.defense,
    // La velocidad no aumenta el daño.
    // Solo sirve para ordenar las jugadas cuando los dos jugadores ya escogieron.
    speed: base.speed,
    // Todos empiezan con 100 de energia.
    // Cada ataque, defensa o cura gasta una parte y luego se recupera un poco entre turnos.
    energy: MAX_ENERGY,
    // Usamos la defensa especial como un pequeño apoyo para calcular cuanto cura la carta.
    // Asi no dejamos ese stat sin ningun uso en el combate.
    specialDefense: base['special-defense'],
  };
}

// En vez de escribir las acciones una por una para todos los Pokémon, las generamos con sus stats.
// Por eso cualquier Pokémon nuevo que venga de PokeAPI puede convertirse en carta sin agregar codigo.
export function createActions(pokemon) {
  // Usamos el primer tipo como base para escoger el nombre y tipo del ataque.
  const primaryType = pokemon.types[0]?.type?.name || 'normal';
  const baseName = ACTIONS_BY_TYPE[primaryType]?.[pokemon.id % 2] || 'Placaje';
  const base = calculateBattleStats(pokemon);

  return {
    attack: {
      id: 'attack',
      name: baseName,
      type: primaryType,
      power: Math.max(20, base.power),
      energyCost: 20,
    },
    defend: {
      id: 'defend',
      name: 'Guardia elemental',
      type: primaryType,
      shield: 10 + Math.floor(base.defense * 0.5),
      energyCost: 15,
    },
    heal: {
      id: 'heal',
      name: 'Recuperación',
      type: primaryType,
      heal: 10 + Math.floor(base.specialDefense * 0.4),
      energyCost: 25,
    },
    recover: {
      id: 'recover',
      name: 'Recargar energía',
      type: primaryType,
      gain: ENERGY_RECOVERY_AMOUNT,
      energyCost: 0,
    },
  };
}

// De todos los datos que trae PokeAPI solo guardamos lo que hace falta para mostrar y jugar la carta.
// Tambien dejamos los tipos porque se usan despues para calcular ventajas.
export function pokemonToCard(pokemon) {
  // Esta conversion deja la respuesta de PokeAPI lista para usarla directamente en la batalla.
  const battleStats = calculateBattleStats(pokemon);
  return {
    id: pokemon.id,
    name: pokemon.name,
    baseId: pokemon.id,
    baseName: pokemon.name,
    offlineFallback: Boolean(pokemon.is_offline_fallback),
    sprite: pokemon.sprites?.other?.['official-artwork']?.front_default || pokemon.sprites?.front_default || '/pokemon-placeholder.svg',
    types: pokemon.types.map((entry) => entry.type.name),
    baseStats: {
      hp: pokemon.stats.find((s) => s.stat.name === 'hp')?.base_stat || 0,
      attack: pokemon.stats.find((s) => s.stat.name === 'attack')?.base_stat || 0,
      defense: pokemon.stats.find((s) => s.stat.name === 'defense')?.base_stat || 0,
      speed: pokemon.stats.find((s) => s.stat.name === 'speed')?.base_stat || 0,
    },
    battleStats,
    actions: createActions(pokemon),
  };
}

// Partimos de daño normal.
// Si el rival tiene uno o dos tipos, cada uno puede cambiar el multiplicador y al final se combinan.
export function getTypeMultiplier(attackingType, defendingTypes = []) {
  // Un Pokémon puede tener uno o dos tipos. Por eso recorremos los dos y multiplicamos sus efectos.
  return defendingTypes.reduce((total, defendingType) => {
    const multiplier = TYPE_CHART[attackingType]?.[defendingType] ?? 1;
    return total * multiplier;
  }, 1);
}

// Convertimos el numero de la tabla en un texto que sea mas facil de leer durante la pelea.
// Por ejemplo, 2 se muestra como 'Eficaz' y 0 como 'Sin efecto'.
export function getEffectivenessLabel(multiplier) {
  if (multiplier === 0) return 'Sin efecto';
  if (multiplier >= 4) return 'Súper eficaz';
  if (multiplier > 1) return 'Eficaz';
  if (multiplier === 1) return 'Normal';
  if (multiplier <= 0.25) return 'Ineficaz';
  return 'Poco eficaz';
}

// Estas funciones tambien estan disponibles para el servidor.
// El navegador puede mostrar una previsualizacion, pero la decision final siempre se vuelve a calcular en Node.
export function resolveBattleAction(actor, target, actionId) {
  const action = actor.actions[actionId];
  if (!action) throw new Error('Acción no válida');

  const multiplier = action.id === 'attack'
    ? getTypeMultiplier(action.type, target.types)
    : 1;

  return { action, multiplier };
}

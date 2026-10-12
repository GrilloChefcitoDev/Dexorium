// Catalogo de respaldo para que DEXORIUM siga siendo jugable si PokeAPI no responde.
// Los stats de los Pokémon conocidos usan sus valores base habituales; el resto de IDs
// usa stats deterministas de respaldo para no bloquear la partida por falta de internet.
import { getTransformationFormCatalog, getTransformationFormMetadata } from './pokemonTransformations.js';

const FALLBACK_SPRITE = '/pokemon-placeholder.svg';
const STAT_NAMES = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];
const TYPE_NAMES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];

// id, nombre, tipos, HP, Atk, Def, At. Esp., Def. Esp., Velocidad
const SPECIES = [
  [1,'bulbasaur',['grass','poison'],45,49,49,65,65,45],
  [2,'ivysaur',['grass','poison'],60,62,63,80,80,60],
  [3,'venusaur',['grass','poison'],80,82,83,100,100,80],
  [4,'charmander',['fire'],39,52,43,60,50,65],
  [5,'charmeleon',['fire'],58,64,58,80,65,80],
  [6,'charizard',['fire','flying'],78,84,78,109,85,100],
  [7,'squirtle',['water'],44,48,65,50,64,43],
  [8,'wartortle',['water'],59,63,80,65,80,58],
  [9,'blastoise',['water'],79,83,100,85,105,78],
  [25,'pikachu',['electric'],35,55,40,50,50,90],
  [26,'raichu',['electric'],60,90,55,90,80,110],
  [39,'jigglypuff',['normal','fairy'],115,45,20,45,25,20],
  [52,'meowth',['normal'],40,45,35,40,40,90],
  [54,'psyduck',['water'],50,52,48,65,50,55],
  [58,'growlithe',['fire'],55,70,45,70,50,60],
  [59,'arcanine',['fire'],90,110,80,100,80,95],
  [63,'abra',['psychic'],25,20,15,105,55,90],
  [94,'gengar',['ghost','poison'],60,65,60,130,75,110],
  [95,'onix',['rock','ground'],35,45,160,30,45,70],
  [133,'eevee',['normal'],55,55,50,45,65,55],
  [134,'vaporeon',['water'],130,65,60,110,95,65],
  [135,'jolteon',['electric'],65,65,60,110,95,130],
  [136,'flareon',['fire'],65,130,60,95,110,65],
  [143,'snorlax',['normal'],160,110,65,65,110,30],
  [149,'dragonite',['dragon','flying'],91,134,95,100,100,80],
  [150,'mewtwo',['psychic'],106,110,90,154,90,130],
  [151,'mew',['psychic'],100,100,100,100,100,100],
  [152,'chikorita',['grass'],45,49,65,49,65,45],
  [155,'cyndaquil',['fire'],39,52,43,60,50,65],
  [158,'totodile',['water'],50,65,64,44,48,43],
  [196,'espeon',['psychic'],65,65,60,130,95,110],
  [197,'umbreon',['dark'],95,65,110,60,130,65],
  [252,'treecko',['grass'],40,45,35,65,55,70],
  [255,'torchic',['fire'],45,60,40,70,50,45],
  [258,'mudkip',['water'],50,70,50,50,50,40],
  [280,'ralts',['psychic','fairy'],28,25,25,45,35,40],
  [282,'gardevoir',['psychic','fairy'],68,65,65,125,115,80],
  [359,'absol',['dark'],65,130,60,75,60,75],
  [448,'lucario',['fighting','steel'],70,110,70,115,70,90],
  [501,'oshawott',['water'],55,55,45,63,45,45],
  [570,'zorua',['dark'],40,65,40,80,40,65],
  [658,'greninja',['water','dark'],72,95,67,103,71,122],
  // Battle Bond y Ash-Greninja tienen registros propios; no son intercambiables con Greninja normal.
  [10116,'greninja-battle-bond',['water','dark'],72,95,67,103,71,122],
  [10117,'greninja-ash',['water','dark'],72,145,67,153,71,132],
  [718,'zygarde-50',['dragon','ground'],108,100,121,81,95,95],
  [10118,'zygarde-10-power-construct',['dragon','ground'],54,100,71,61,85,115],
  [10119,'zygarde-50-power-construct',['dragon','ground'],108,100,121,81,95,95],
  [10120,'zygarde-complete',['dragon','ground'],216,100,121,91,95,85],
  [774,'minior-red-meteor',['rock','flying'],60,60,100,60,100,60],
  [10130,'minior-orange-meteor',['rock','flying'],60,60,100,60,100,60],
  [10131,'minior-yellow-meteor',['rock','flying'],60,60,100,60,100,60],
  [10132,'minior-green-meteor',['rock','flying'],60,60,100,60,100,60],
  [10133,'minior-blue-meteor',['rock','flying'],60,60,100,60,100,60],
  [10134,'minior-indigo-meteor',['rock','flying'],60,60,100,60,100,60],
  [10135,'minior-violet-meteor',['rock','flying'],60,60,100,60,100,60],
  [10136,'minior-red',['rock','flying'],60,100,60,100,60,120],
  [10137,'minior-orange',['rock','flying'],60,100,60,100,60,120],
  [10138,'minior-yellow',['rock','flying'],60,100,60,100,60,120],
  [10139,'minior-green',['rock','flying'],60,100,60,100,60,120],
  [10140,'minior-blue',['rock','flying'],60,100,60,100,60,120],
  [10141,'minior-indigo',['rock','flying'],60,100,60,100,60,120],
  [10142,'minior-violet',['rock','flying'],60,100,60,100,60,120],
  [700,'sylveon',['fairy'],95,65,65,110,130,60],
  [722,'rowlet',['grass','flying'],68,55,55,50,50,42],
  [725,'litten',['fire'],45,65,40,60,40,70],
  [728,'popplio',['water'],50,54,54,66,56,40],
  [810,'grookey',['grass'],50,65,50,40,40,65],
  [813,'scorbunny',['fire'],50,71,40,40,40,69],
  [816,'sobble',['water'],50,40,40,70,40,70],
  [906,'sprigatito',['grass'],40,61,54,45,45,65],
  [909,'fuecoco',['fire'],67,45,59,63,40,36],
  [912,'quaxly',['water'],55,65,45,50,45,50],
  [896,'glastrier',['ice'],100,145,130,65,110,30],
  [897,'spectrier',['ghost'],100,65,60,145,80,130],
  [1000,'gholdengo',['steel','ghost'],87,60,95,133,91,84],
  [1001,'wo-chien',['dark','grass'],85,85,100,95,135,70],
  [1002,'chien-pao',['dark','ice'],80,120,80,90,65,135],
  [1003,'ting-lu',['dark','ground'],155,110,125,55,80,45],
  [1004,'chi-yu',['dark','fire'],55,80,80,135,120,100],
  [1005,'roaring-moon',['dragon','dark'],105,139,71,55,101,119],
  [1006,'iron-valiant',['fairy','fighting'],74,130,90,120,60,116],
  [1025,'pecharunt',['poison','ghost'],88,88,160,88,88,88],
];

const speciesById = new Map();
const speciesByName = new Map();

function makeRawPokemon({ id, name, types, values }) {
  const statValues = values || genericStats(id);
  return {
    id,
    name,
    base_experience: 100,
    height: 10,
    weight: 100,
    is_offline_fallback: true,
    sprites: {
      front_default: FALLBACK_SPRITE,
      other: { 'official-artwork': { front_default: FALLBACK_SPRITE } },
    },
    cries: { latest: null, legacy: null },
    types: types.map((type, slot) => ({ slot: slot + 1, type: { name: type, url: '' } })),
    stats: STAT_NAMES.map((stat, index) => ({ base_stat: statValues[index], effort: 0, stat: { name: stat, url: '' } })),
  };
}

function genericStats(id) {
  const value = (offset) => 35 + ((id * (offset * 7 + 13) + offset * 29) % 91);
  return [value(1), value(2), value(3), value(4), value(5), value(6)];
}

for (const [id, name, types, hp, atk, def, spa, spd, speed] of SPECIES) {
  const record = { id, name, types, values: [hp, atk, def, spa, spd, speed] };
  speciesById.set(id, record);
  speciesByName.set(name, record);
}

export function getOfflineSpeciesList() {
  const known = SPECIES.map(([id, name]) => ({
    id,
    name,
    url: `https://pokeapi.co/api/v2/pokemon/${id}/`,
  }));
  const ids = new Set(known.map((entry) => entry.id));
  // Incluimos las formas configuradas para que el catálogo no pierda Megas y formas especiales offline.
  for (const form of getTransformationFormCatalog()) {
    if (!ids.has(form.id)) {
      known.push(form);
      ids.add(form.id);
    }
  }
  return known.sort((a, b) => a.id - b.id);
}

export function makeOfflinePokemon(identifier, preferredName = '') {
  const text = String(identifier ?? '').trim().toLowerCase();
  const id = /^\d+$/.test(text) ? Number(text) : Number(identifier);
  let record;
  if (/^\d+$/.test(text)) record = speciesById.get(id);
  else record = speciesByName.get(text);
  if (record) return makeRawPokemon(record);

  if (!Number.isSafeInteger(id) || id <= 0 || id > 20000) return null;
  const formData = getTransformationFormMetadata(id);
  if (formData) {
    const baseRecord = speciesById.get(formData.baseId);
    const values = baseRecord?.values || genericStats(formData.baseId);
    const types = formData.types?.length ? formData.types : baseRecord?.types || ['normal'];
    // Si no hay conexión, al menos conservamos el nombre y los tipos correctos de la forma.
    return makeRawPokemon({ id, name: formData.name, types, values });
  }

  const pickedName = String(preferredName || (!/^\d+$/.test(text) ? text : '') || `pokemon-${id}`)
    .toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 48) || `pokemon-${id}`;
  const type1 = TYPE_NAMES[id % TYPE_NAMES.length];
  const type2 = TYPE_NAMES[(id * 7 + 3) % TYPE_NAMES.length];
  const types = id % 4 === 0 && type1 !== type2 ? [type1, type2] : [type1];
  return makeRawPokemon({ id, name: pickedName, types, values: genericStats(id) });
}

export function makeOfflineCatalog() {
  const results = getOfflineSpeciesList();
  return { count: results.length, total: results.length, results, offline: true, source: 'local' };
}

export function findOfflinePokemonName(id) {
  return speciesById.get(Number(id))?.name || getTransformationFormMetadata(id)?.name || `pokemon-${Number(id)}`;
}

export const OFFLINE_POKEMON_COUNT = getOfflineSpeciesList().length;
export const OFFLINE_SPRITE = FALLBACK_SPRITE;


// Respaldo validado para equipos que el cliente ya cargó antes de perder la conexión.
// No acepta estadísticas fuera del rango Pokémon ni tipos arbitrarios.
export function makeOfflinePokemonFromSnapshot(snapshot, expectedId) {
  if (!snapshot || Number(snapshot.id) !== Number(expectedId)) return null;
  const id = Number(expectedId);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 20000) return null;
  const name = String(snapshot.name || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 48);
  const types = Array.isArray(snapshot.types)
    ? snapshot.types.map((value) => typeof value === 'string' ? value : value?.type?.name).filter((value) => TYPE_NAMES.includes(value)).slice(0, 2)
    : [];
  if (!name || types.length < 1) return null;

  const base = snapshot.baseStats || {};
  const battle = snapshot.battleStats || {};
  const stat = (value, fallback = 50) => Math.max(1, Math.min(255, Math.round(Number.isFinite(Number(value)) ? Number(value) : fallback)));
  const attack = stat(base.attack);
  const power = stat(battle.power, attack);
  const values = [
    stat(base.hp), attack, stat(base.defense),
    stat(Math.round((power - attack * 0.75) / 0.25), attack),
    stat(battle.specialDefense, base.defense), stat(base.speed),
  ];
  const raw = makeRawPokemon({ id, name, types, values });
  raw.is_offline_fallback = true;
  return raw;
}


// Respaldo que usa el servidor: prioriza datos locales conocidos y solo reconstruye
// desde la ficha enviada por el cliente si ese ID no existe en el catálogo incorporado.
// Así el cliente no puede alterar las estadísticas de especies conocidas enviando snapshots.
export function makeServerOfflinePokemon(identifier, snapshot = null) {
  const local = makeOfflinePokemon(identifier);
  const localIsGeneric = !local || local.name === `pokemon-${Number(identifier)}`;
  if (!localIsGeneric) return local;
  return makeOfflinePokemonFromSnapshot(snapshot, Number(identifier)) || local;
}

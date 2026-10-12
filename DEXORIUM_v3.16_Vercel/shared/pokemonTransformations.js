// Formas de transformación disponibles en DEXORIUM.
// No se incluyen evoluciones normales ni formas regionales (Alola/Galar/Hisui/Paldea).
// Los IDs de formas especiales corresponden al catálogo de Pokémon de PokéAPI; las regionales se excluyen intencionalmente.

const FORM_SPRITE_ROOT = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';

function form(key, formId, label, method, types = null, sprite = null, requiresPokemonId = null) {
  return {
    key,
    formId,
    label,
    method,
    types,
    // Algunas formas tienen artwork oficial incompleto en PokéAPI; ahí usamos el sprite clásico.
    sprite: sprite || `${FORM_SPRITE_ROOT}/${formId}.png`,
    ...(Number.isSafeInteger(requiresPokemonId) ? { requiresPokemonId } : {}),
  };
}

const MEGA_FORMS = {
  3: [form('mega-venusaur', 10033, 'Mega-Venusaur', 'mega', ['grass', 'poison'])],
  6: [
    form('mega-charizard-x', 10034, 'Mega-Charizard X', 'mega', ['fire', 'dragon']),
    form('mega-charizard-y', 10035, 'Mega-Charizard Y', 'mega', ['fire', 'flying']),
  ],
  9: [form('mega-blastoise', 10036, 'Mega-Blastoise', 'mega', ['water'])],
  15: [form('mega-beedrill', 10090, 'Mega-Beedrill', 'mega', ['bug', 'poison'])],
  18: [form('mega-pidgeot', 10073, 'Mega-Pidgeot', 'mega', ['normal', 'flying'])],
  65: [form('mega-alakazam', 10037, 'Mega-Alakazam', 'mega', ['psychic'])],
  80: [form('mega-slowbro', 10071, 'Mega-Slowbro', 'mega', ['water', 'psychic'])],
  94: [form('mega-gengar', 10038, 'Mega-Gengar', 'mega', ['ghost', 'poison'])],
  115: [form('mega-kangaskhan', 10039, 'Mega-Kangaskhan', 'mega', ['normal'])],
  127: [form('mega-pinsir', 10040, 'Mega-Pinsir', 'mega', ['bug', 'flying'])],
  130: [form('mega-gyarados', 10041, 'Mega-Gyarados', 'mega', ['water', 'dark'])],
  142: [form('mega-aerodactyl', 10042, 'Mega-Aerodactyl', 'mega', ['rock', 'flying'])],
  150: [
    form('mega-mewtwo-x', 10043, 'Mega-Mewtwo X', 'mega', ['psychic', 'fighting']),
    form('mega-mewtwo-y', 10044, 'Mega-Mewtwo Y', 'mega', ['psychic']),
  ],
  181: [form('mega-ampharos', 10045, 'Mega-Ampharos', 'mega', ['electric', 'dragon'])],
  212: [form('mega-scizor', 10046, 'Mega-Scizor', 'mega', ['bug', 'steel'])],
  214: [form('mega-heracross', 10047, 'Mega-Heracross', 'mega', ['bug', 'fighting'])],
  229: [form('mega-houndoom', 10048, 'Mega-Houndoom', 'mega', ['dark', 'fire'])],
  248: [form('mega-tyranitar', 10049, 'Mega-Tyranitar', 'mega', ['rock', 'dark'])],
  257: [form('mega-blaziken', 10050, 'Mega-Blaziken', 'mega', ['fire', 'fighting'])],
  260: [form('mega-swampert', 10064, 'Mega-Swampert', 'mega', ['water', 'ground'])],
  282: [form('mega-gardevoir', 10051, 'Mega-Gardevoir', 'mega', ['psychic', 'fairy'])],
  303: [form('mega-mawile', 10052, 'Mega-Mawile', 'mega', ['steel', 'fairy'])],
  306: [form('mega-aggron', 10053, 'Mega-Aggron', 'mega', ['steel'])],
  308: [form('mega-medicham', 10054, 'Mega-Medicham', 'mega', ['fighting', 'psychic'])],
  310: [form('mega-manectric', 10055, 'Mega-Manectric', 'mega', ['electric'])],
  354: [form('mega-banette', 10056, 'Mega-Banette', 'mega', ['ghost'])],
  445: [form('mega-garchomp', 10058, 'Mega-Garchomp', 'mega', ['dragon', 'ground'])],
  448: [form('mega-lucario', 10059, 'Mega-Lucario', 'mega', ['fighting', 'steel'])],
  460: [form('mega-abomasnow', 10060, 'Mega-Abomasnow', 'mega', ['grass', 'ice'])],
  254: [form('mega-sceptile', 10065, 'Mega-Sceptile', 'mega', ['grass', 'dragon'])],
  302: [form('mega-sableye', 10066, 'Mega-Sableye', 'mega', ['dark', 'ghost'])],
  334: [form('mega-altaria', 10067, 'Mega-Altaria', 'mega', ['dragon', 'fairy'])],
  475: [form('mega-gallade', 10068, 'Mega-Gallade', 'mega', ['psychic', 'fighting'])],
  531: [form('mega-audino', 10069, 'Mega-Audino', 'mega', ['normal', 'fairy'])],
  319: [form('mega-sharpedo', 10070, 'Mega-Sharpedo', 'mega', ['water', 'dark'])],
  208: [form('mega-steelix', 10072, 'Mega-Steelix', 'mega', ['steel', 'ground'])],
  362: [form('mega-glalie', 10074, 'Mega-Glalie', 'mega', ['ice'])],
  719: [form('mega-diancie', 10075, 'Mega-Diancie', 'mega', ['rock', 'fairy'])],
  376: [form('mega-metagross', 10076, 'Mega-Metagross', 'mega', ['steel', 'psychic'])],
  380: [form('mega-latias', 10062, 'Mega-Latias', 'mega', ['dragon', 'psychic'])],
  381: [form('mega-latios', 10063, 'Mega-Latios', 'mega', ['dragon', 'psychic'])],
  384: [form('mega-rayquaza', 10079, 'Mega-Rayquaza', 'mega', ['dragon', 'flying'])],
  323: [form('mega-camerupt', 10087, 'Mega-Camerupt', 'mega', ['fire', 'ground'])],
  428: [form('mega-lopunny', 10088, 'Mega-Lopunny', 'mega', ['normal', 'fighting'])],
  373: [form('mega-salamence', 10089, 'Mega-Salamence', 'mega', ['dragon', 'flying'])],
  26: [
    form('mega-raichu-x', 10304, 'Mega-Raichu X', 'mega', ['electric']),
    form('mega-raichu-y', 10305, 'Mega-Raichu Y', 'mega', ['electric']),
  ],
  358: [form('mega-chimecho', 10306, 'Mega-Chimecho', 'mega', ['psychic', 'steel'])],
  359: [
    form('mega-absol', 10057, 'Mega-Absol', 'mega', ['dark']),
    form('mega-absol-z', 10307, 'Mega-Absol Z', 'mega', ['dark', 'ghost']),
  ],
  398: [form('mega-staraptor', 10308, 'Mega-Staraptor', 'mega', ['fighting', 'flying'])],
  658: [form('mega-greninja', 10294, 'Mega-Greninja', 'mega', ['water', 'dark'])],
  780: [form('mega-drampa', 10302, 'Mega-Drampa', 'mega', ['normal', 'dragon'])],
  870: [form('mega-falinks', 10303, 'Mega-Falinks', 'mega', ['fighting'])],
  // Mega-Zygarde solo se ofrece desde la Forma Completa, no desde Zygarde 10% o 50%.
  10120: [form('mega-zygarde', 10301, 'Mega-Zygarde', 'mega', ['dragon', 'ground'])],
};

const GIGANTAMAX_FORMS = {
  3: [form('gmax-venusaur', 10195, 'Venusaur Gigamax', 'gigantamax', ['grass', 'poison'])],
  6: [form('gmax-charizard', 10196, 'Charizard Gigamax', 'gigantamax', ['fire', 'flying'])],
  9: [form('gmax-blastoise', 10197, 'Blastoise Gigamax', 'gigantamax', ['water'])],
  12: [form('gmax-butterfree', 10198, 'Butterfree Gigamax', 'gigantamax', ['bug', 'flying'])],
  25: [form('gmax-pikachu', 10199, 'Pikachu Gigamax', 'gigantamax', ['electric'])],
  52: [form('gmax-meowth', 10200, 'Meowth Gigamax', 'gigantamax', ['normal'])],
  68: [form('gmax-machamp', 10201, 'Machamp Gigamax', 'gigantamax', ['fighting'])],
  94: [form('gmax-gengar', 10202, 'Gengar Gigamax', 'gigantamax', ['ghost', 'poison'])],
  99: [form('gmax-kingler', 10203, 'Kingler Gigamax', 'gigantamax', ['water'])],
  131: [form('gmax-lapras', 10204, 'Lapras Gigamax', 'gigantamax', ['water', 'ice'])],
  133: [form('gmax-eevee', 10205, 'Eevee Gigamax', 'gigantamax', ['normal'])],
  143: [form('gmax-snorlax', 10206, 'Snorlax Gigamax', 'gigantamax', ['normal'])],
  569: [form('gmax-garbodor', 10207, 'Garbodor Gigamax', 'gigantamax', ['poison'])],
  809: [form('gmax-melmetal', 10208, 'Melmetal Gigamax', 'gigantamax', ['steel'])],
  812: [form('gmax-rillaboom', 10209, 'Rillaboom Gigamax', 'gigantamax', ['grass'])],
  815: [form('gmax-cinderace', 10210, 'Cinderace Gigamax', 'gigantamax', ['fire'])],
  818: [form('gmax-inteleon', 10211, 'Inteleon Gigamax', 'gigantamax', ['water'])],
  823: [form('gmax-corviknight', 10212, 'Corviknight Gigamax', 'gigantamax', ['flying', 'steel'])],
  826: [form('gmax-orbeetle', 10213, 'Orbeetle Gigamax', 'gigantamax', ['bug', 'psychic'])],
  834: [form('gmax-drednaw', 10214, 'Drednaw Gigamax', 'gigantamax', ['water', 'rock'])],
  839: [form('gmax-coalossal', 10215, 'Coalossal Gigamax', 'gigantamax', ['rock', 'fire'])],
  841: [form('gmax-flapple', 10216, 'Flapple Gigamax', 'gigantamax', ['grass', 'dragon'])],
  842: [form('gmax-appletun', 10217, 'Appletun Gigamax', 'gigantamax', ['grass', 'dragon'])],
  844: [form('gmax-sandaconda', 10218, 'Sandaconda Gigamax', 'gigantamax', ['ground'])],
  849: [
    form('gmax-toxtricity-amped', 10219, 'Toxtricity Gigamax (Agudo)', 'gigantamax', ['electric', 'poison']),
    form('gmax-toxtricity-low-key', 10228, 'Toxtricity Gigamax (Grave)', 'gigantamax', ['electric', 'poison']),
  ],
  851: [form('gmax-centiskorch', 10220, 'Centiskorch Gigamax', 'gigantamax', ['fire', 'bug'])],
  858: [form('gmax-hatterene', 10221, 'Hatterene Gigamax', 'gigantamax', ['psychic', 'fairy'])],
  861: [form('gmax-grimmsnarl', 10222, 'Grimmsnarl Gigamax', 'gigantamax', ['dark', 'fairy'])],
  869: [form('gmax-alcremie', 10223, 'Alcremie Gigamax', 'gigantamax', ['fairy'])],
  879: [form('gmax-copperajah', 10224, 'Copperajah Gigamax', 'gigantamax', ['steel'])],
  884: [form('gmax-duraludon', 10225, 'Duraludon Gigamax', 'gigantamax', ['steel', 'dragon'])],
  892: [
    form('gmax-urshifu-single', 10226, 'Urshifu Gigamax (Estilo Brusco)', 'gigantamax', ['fighting', 'dark']),
    form('gmax-urshifu-rapid', 10227, 'Urshifu Gigamax (Estilo Fluido)', 'gigantamax', ['fighting', 'water']),
  ],
};

const SPECIAL_FORMS = {
  // Formas de combate no regionales. Son activables manualmente en DEXORIUM,
  // aunque en los juegos originales algunas dependen de habilidad, objeto o movimiento.
  351: [
    form('castform-sunny', 10013, 'Castform Forma Sol', 'special', ['fire']),
    form('castform-rainy', 10014, 'Castform Forma Lluvia', 'special', ['water']),
    form('castform-snowy', 10015, 'Castform Forma Nieve', 'special', ['ice']),
  ],
  492: [form('shaymin-sky', 10006, 'Shaymin Forma Cielo', 'special', ['grass', 'flying'])],
  648: [form('meloetta-pirouette', 10018, 'Meloetta Forma Danza', 'special', ['normal', 'fighting'])],
  // Battle Bond es una entrada distinta de Greninja normal en PokéAPI. Solo esta variante puede pasar a Ash-Greninja.
  10116: [form('ash-greninja', 10117, 'Greninja Ash', 'special', ['water', 'dark'])],
  382: [form('primal-kyogre', 10077, 'Kyogre Primigenio', 'special', ['water'])],
  383: [form('primal-groudon', 10078, 'Groudon Primigenio', 'special', ['ground', 'fire'])],
  800: [form('ultra-necrozma', 10157, 'Ultra-Necrozma', 'special', ['psychic', 'dragon'])],
  898: [
    form('calyrex-ice-rider', 10193, 'Calyrex Jinete Glacial', 'special', ['psychic', 'ice'], null, 896),
    form('calyrex-shadow-rider', 10194, 'Calyrex Jinete Espectral', 'special', ['psychic', 'ghost'], null, 897),
  ],
  // Zygarde normal (#718) no lleva Power Construct por defecto; no puede elegir estas formas.
  // Solo las entradas separadas con Power Construct pueden pasar a Forma Completa.

  // Las dos entradas Power Construct son distintas de Zygarde normal y pueden pasar a la Forma Completa.
  10118: [form('zygarde-complete', 10120, 'Zygarde Forma Completa', 'special', ['dragon', 'ground'])],
  10119: [form('zygarde-complete', 10120, 'Zygarde Forma Completa', 'special', ['dragon', 'ground'])],
  720: [form('hoopa-unbound', 10086, 'Hoopa Desatado', 'special', ['psychic', 'dark'])],
  555: [form('darmanitan-zen', 10017, 'Darmanitan Modo Zen', 'special', ['fire', 'psychic'])],
  681: [form('aegislash-blade', 10026, 'Aegislash Forma Filo', 'special', ['steel', 'ghost'])],
  746: [form('wishiwashi-school', 10115, 'Wishiwashi Forma Banco', 'special', ['water'])],
  // Minior mantiene su color: al bajar a la mitad de sus PS muestra el núcleo de esa misma variante.
  774: [form('minior-core-red', 10136, 'Minior Núcleo Rojo', 'special', ['rock', 'flying'], 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10136.png')],
  10130: [form('minior-core-orange', 10137, 'Minior Núcleo Naranja', 'special', ['rock', 'flying'], 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10137.png')],
  10131: [form('minior-core-yellow', 10138, 'Minior Núcleo Amarillo', 'special', ['rock', 'flying'], 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10138.png')],
  10132: [form('minior-core-green', 10139, 'Minior Núcleo Verde', 'special', ['rock', 'flying'], 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10139.png')],
  10133: [form('minior-core-blue', 10140, 'Minior Núcleo Azul', 'special', ['rock', 'flying'], 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10140.png')],
  10134: [form('minior-core-indigo', 10141, 'Minior Núcleo Índigo', 'special', ['rock', 'flying'], 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10141.png')],
  10135: [form('minior-core-violet', 10142, 'Minior Núcleo Violeta', 'special', ['rock', 'flying'], 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10142.png')],
  778: [form('mimikyu-busted', 10143, 'Mimikyu Disfraz Roto', 'special', ['ghost', 'fairy'])],
  845: [
    form('cramorant-gulping', 10182, 'Cramorant Forma Tragadora', 'special', ['flying', 'water']),
    form('cramorant-gorging', 10183, 'Cramorant Forma Engullidora', 'special', ['flying', 'water']),
  ],
  875: [form('eiscue-noice', 10185, 'Eiscue Cara Deshielo', 'special', ['ice'])],
  877: [form('morpeko-hangry', 10187, 'Morpeko Forma Voraz', 'special', ['electric', 'dark'])],
  888: [form('zacian-crowned', 10188, 'Zacian Espada Suprema', 'special', ['fairy', 'steel'])],
  889: [form('zamazenta-crowned', 10189, 'Zamazenta Escudo Supremo', 'special', ['fighting', 'steel'])],
  890: [form('eternatus-eternamax', 10190, 'Eternatus Dinamax Infinito', 'special', ['poison', 'dragon'])],
  964: [form('palafin-hero', 10256, 'Palafin Forma Heroica', 'special', ['water'])],
  1024: [
    form('terapagos-terastal', 10276, 'Terapagos Forma Terastal', 'special', ['normal']),
    form('terapagos-stellar', 10277, 'Terapagos Forma Astral', 'special', ['normal']),
  ],
};

const FORM_TABLES = [MEGA_FORMS, GIGANTAMAX_FORMS, SPECIAL_FORMS];
const NON_DYNAMAX_IDS = new Set([358, 398, 774, 888, 889, 890, ...Array.from({ length: 9 }, (_, index) => 650 + index)]);
const BATTLE_BOND_ID = 10116;
const ASH_GRENINJA_ID = 10117;
const ZYGARDE_FORM_IDS = [718, 10118, 10119, 10120, 10301];
const MINIOR_METEOR_IDS = [774, 10130, 10131, 10132, 10133, 10134, 10135];
const MINIOR_CORE_IDS = [10136, 10137, 10138, 10139, 10140, 10141, 10142];
const SPECIAL_STARTER_IDS = new Set([BATTLE_BOND_ID, 10118, 10119, 10120, ...MINIOR_METEOR_IDS]);

function isRegionalName(name) {
  return /-(alola|alolan|galar|galarian|hisui|hisuian|paldea|paldean)(-|$)/i.test(String(name || ''));
}

function rawPokemonId(pokemonOrId) {
  if (pokemonOrId && typeof pokemonOrId === 'object') {
    return Number(pokemonOrId.baseId ?? pokemonOrId.id);
  }
  return Number(pokemonOrId);
}

// Solo aceptamos como origen las especies normales y las pocas formas de entrada que sí tienen una transformación definida.
function canonicalBaseId(pokemon) {
  const id = rawPokemonId(pokemon);
  const name = pokemon && typeof pokemon === 'object' ? (pokemon.baseName || pokemon.name) : '';
  if (!Number.isSafeInteger(id) || id <= 0 || isRegionalName(name)) return 0;
  if (id < 10000 || SPECIAL_STARTER_IDS.has(id)) return id;
  return 0;
}

function getListedForms(baseId) {
  return FORM_TABLES.flatMap((table) => table[baseId] || []);
}

function getFormOwner(formId) {
  for (const table of FORM_TABLES) {
    for (const [baseIdText, forms] of Object.entries(table)) {
      if (forms.some((item) => Number(item.formId) === Number(formId))) return Number(baseIdText);
    }
  }
  return 0;
}

// Devuelve los datos de una forma registrada para crear una ficha local sin consultar la API.
export function getTransformationFormMetadata(formId) {
  const id = Number(formId);
  if (!Number.isSafeInteger(id)) return null;
  for (const table of FORM_TABLES) {
    for (const [baseIdText, forms] of Object.entries(table)) {
      const match = forms.find((item) => Number(item.formId) === id);
      if (match) {
        return {
          id,
          baseId: Number(baseIdText),
          name: match.key,
          label: match.label,
          method: match.method,
          types: Array.isArray(match.types) ? [...match.types] : null,
        };
      }
    }
  }
  return null;
}

// El catálogo local incluye las formas que sí están configuradas en las reglas del juego.
export function getTransformationFormCatalog() {
  const rows = [];
  const seen = new Set();
  for (const table of FORM_TABLES) {
    for (const forms of Object.values(table)) {
      for (const item of forms) {
        const id = Number(item.formId);
        if (!Number.isSafeInteger(id) || id < 10000 || item.method === 'dynamax' || seen.has(id)) continue;
        seen.add(id);
        rows.push({ id, name: item.key, url: `https://pokeapi.co/api/v2/pokemon/${id}/` });
      }
    }
  }
  return rows;
}

function familyGroupFor(id) {
  if ([658, 10294].includes(id)) return [658, 10294];
  if ([BATTLE_BOND_ID, ASH_GRENINJA_ID].includes(id)) return [BATTLE_BOND_ID, ASH_GRENINJA_ID];
  if (ZYGARDE_FORM_IDS.includes(id)) return ZYGARDE_FORM_IDS;
  if ([...MINIOR_METEOR_IDS, ...MINIOR_CORE_IDS].includes(id)) return [...MINIOR_METEOR_IDS, ...MINIOR_CORE_IDS];
  return null;
}

export function getTransformationFamilyIds(basePokemonOrId) {
  const id = rawPokemonId(basePokemonOrId);
  if (!Number.isSafeInteger(id) || id <= 0) return [];

  const knownGroup = familyGroupFor(id);
  if (knownGroup) return [...new Set(knownGroup)];

  // Si ya se eligió una forma alternativa, buscamos de qué especie procede para bloquear ambas en la revancha.
  const ownerId = getFormOwner(id);
  const baseId = ownerId || id;
  const familyGroup = familyGroupFor(baseId);
  if (familyGroup) return [...new Set(familyGroup)];
  return [...new Set([baseId, ...getListedForms(baseId).map((item) => item.formId).filter(Number.isSafeInteger)])];
}

// Dinamax y Gigamax se consumen por equipo y por separado durante cada combate.
export function isTeamTransformationAvailable(method, usage = {}) {
  if (method === 'dynamax') return !usage.dynamaxUsed;
  if (method === 'gigantamax') return !usage.gigantamaxUsed;
  return true;
}

export function consumeTeamTransformationResource(method, usage = {}) {
  if (!isTeamTransformationAvailable(method, usage)) {
    throw new Error(method === 'dynamax'
      ? 'Este equipo ya usó Dinamax durante este combate.'
      : 'Este equipo ya usó Gigamax durante este combate.');
  }
  if (method === 'dynamax') usage.dynamaxUsed = true;
  if (method === 'gigantamax') usage.gigantamaxUsed = true;
  return usage;
}

export function getTransformationOptions(pokemon, team = [], teamUsage = null) {
  if (pokemon?.transformed || pokemon?.transformationUsed || pokemon?.teraType || Number(pokemon?.formId) >= 10000) return [];
  const baseId = canonicalBaseId(pokemon);
  if (!baseId || baseId === ASH_GRENINJA_ID) return [];

  const familyIds = getTransformationFamilyIds(baseId);
  const teamIds = new Set((Array.isArray(team) ? team : []).map((member) => Number(member?.baseId ?? member?.id)).filter(Number.isSafeInteger));
  const options = getListedForms(baseId)
    .filter((item) => !item.requiresPokemonId || teamIds.has(item.requiresPokemonId))
    .map((item) => ({ ...item, familyIds }));

  // Dinamax se limita a especies admitidas en este catálogo de combate; no se ofrece a formas regionales ni a excepciones conocidas.
  if (baseId <= 898 && !NON_DYNAMAX_IDS.has(baseId)) {
    options.push({
      key: `dynamax-${baseId}`,
      formId: baseId,
      label: `Dinamax · ${String(pokemon?.baseName || pokemon?.name || `Pokémon #${baseId}`).replace(/-/g, ' ')}`,
      method: 'dynamax',
      types: null,
      sprite: pokemon?.baseSprite || pokemon?.sprite || '',
      familyIds,
    });
  }

  // La propia forma no puede volver a elegirse como destino. Es una sola transformación por Pokémon y combate.
  const usage = teamUsage || {};
  return options.filter((option) => {
    // Cada equipo tiene un uso de Dinamax y otro de Gigamax por combate; son recursos separados.
    if (!isTeamTransformationAvailable(option.method, usage)) return false;
    return Number(option.formId) !== Number(pokemon?.id) || option.method === 'dynamax';
  });
}

export function findTransformationOption(pokemon, key, team = [], teamUsage = null) {
  return getTransformationOptions(pokemon, team, teamUsage).find((option) => option.key === String(key)) || null;
}

export function applyTransformationToCard(pokemon, option) {
  if (!pokemon || !option) throw new Error('La transformación elegida no es válida.');
  if (pokemon.transformed || pokemon.transformationUsed) throw new Error('Este Pokémon ya se transformó durante el combate.');

  const baseName = pokemon.baseName || pokemon.name;
  const baseSprite = pokemon.baseSprite || pokemon.sprite;
  const baseTypes = [...(pokemon.baseTypes || pokemon.types || [])];
  const originalMaxHp = Math.max(1, Number(pokemon.battleStats?.hp) || 1);
  const originalHp = Math.max(0, Number(pokemon.currentHp) || 0);
  const method = option.method;
  const powerMultiplier = method === 'mega' ? 1.24 : method === 'gigantamax' || method === 'dynamax' ? 1.16 : 1.20;
  const defenseMultiplier = method === 'mega' ? 1.12 : 1.10;
  const speedMultiplier = method === 'mega' ? 1.08 : 1.06;
  const hpMultiplier = method === 'dynamax' || method === 'gigantamax' ? 1.25 : 1;
  const maxHp = Math.round(originalMaxHp * hpMultiplier);
  const hpRatio = originalHp / originalMaxHp;
  const types = Array.isArray(option.types) && option.types.length ? [...option.types] : [...(pokemon.types || [])];
  const primaryType = types[0] || 'normal';
  const sprite = method === 'dynamax' ? (pokemon.sprite || baseSprite) : (option.sprite || baseSprite);
  const displayName = method === 'dynamax' ? `Dinamax ${baseName}` : option.label;

  const battleStats = {
    ...pokemon.battleStats,
    hp: maxHp,
    power: Math.max(1, Math.round((Number(pokemon.battleStats?.power) || 1) * powerMultiplier)),
    defense: Math.max(1, Math.round((Number(pokemon.battleStats?.defense) || 1) * defenseMultiplier)),
    speed: Math.max(1, Math.round((Number(pokemon.battleStats?.speed) || 1) * speedMultiplier)),
  };
  const actions = Object.fromEntries(Object.entries(pokemon.actions || {}).map(([key, action]) => [key, { ...action }]));
  if (actions.attack) {
    actions.attack.power = Math.max(1, Math.round(actions.attack.power * powerMultiplier));
    actions.attack.type = primaryType;
  }
  if (actions.defend) actions.defend.shield = Math.max(1, Math.round(actions.defend.shield * defenseMultiplier));
  if (actions.heal) actions.heal.heal = Math.max(1, Math.round(actions.heal.heal * 1.08));

  return {
    ...pokemon,
    name: displayName,
    baseName,
    baseSprite,
    baseTypes,
    baseId: Number(pokemon.baseId || pokemon.id),
    formId: Number(option.formId) || Number(pokemon.id),
    sprite,
    types,
    battleStats,
    actions,
    currentHp: Math.min(maxHp, Math.max(0, Math.round(hpRatio * maxHp))),
    transformed: true,
    transformationUsed: true,
    transformation: {
      key: option.key,
      method,
      label: option.label,
      formId: option.formId,
      fromName: baseName,
    },
    visualTransform: method === 'dynamax' || method === 'gigantamax' ? 'dynamax' : method === 'mega' ? 'mega' : 'special',
  };
}

export function getSpecialKoTransformation(pokemon) {
  // El KO activa el vínculo solo en la entrada Battle Bond; el Greninja normal no tiene esta habilidad.
  if (rawPokemonId(pokemon) !== BATTLE_BOND_ID || pokemon?.transformed || pokemon?.transformationUsed) return null;
  return findTransformationOption(pokemon, 'ash-greninja');
}

// Power Construct se activa al cruzar el umbral de PS durante un ataque.
export function getPowerConstructTransformation(pokemon) {
  if (!pokemon || pokemon.transformed || pokemon.transformationUsed) return null;
  const id = rawPokemonId(pokemon);
  const hp = Number(pokemon.currentHp);
  const maxHp = Number(pokemon.battleStats?.hp);
  if (![10118, 10119].includes(id) || !Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0 || hp <= 0 || hp > maxHp / 2) return null;
  return findTransformationOption(pokemon, 'zygarde-complete');
}

// Minior revela su núcleo al final del turno si queda con la mitad de sus PS o menos.
export function getHpTriggeredTransformation(pokemon) {
  if (!pokemon || pokemon.transformed || pokemon.transformationUsed) return null;
  const id = rawPokemonId(pokemon);
  const hp = Number(pokemon.currentHp);
  const maxHp = Number(pokemon.battleStats?.hp);
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0 || hp <= 0 || hp > maxHp / 2) return null;
  if (id === 10118 || id === 10119) return getPowerConstructTransformation(pokemon);
  if (MINIOR_METEOR_IDS.includes(id)) {
    return getTransformationOptions(pokemon).find((option) => option.key.startsWith('minior-core-')) || null;
  }
  return null;
}

export function isTransformationOptionValid(pokemon, key, team = []) {
  return Boolean(findTransformationOption(pokemon, key, team));
}

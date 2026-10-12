import test from 'node:test';
import assert from 'node:assert/strict';
import { makeOfflineCatalog, makeOfflinePokemon, makeOfflinePokemonFromSnapshot, makeServerOfflinePokemon, OFFLINE_POKEMON_COUNT } from '../shared/offlinePokemon.js';
import { pokemonToCard } from '../shared/cardRules.js';

test('el catálogo offline contiene suficientes Pokémon para un equipo completo', () => {
  const catalog = makeOfflineCatalog();
  assert.equal(catalog.offline, true);
  assert.ok(catalog.results.length >= 50);
  assert.ok(catalog.results.length >= 6);
  assert.equal(catalog.count, OFFLINE_POKEMON_COUNT);
});

test('las fichas locales conocidas conservan nombre, tipos y estadísticas válidas', () => {
  for (const [id, name] of [[7, 'squirtle'], [25, 'pikachu'], [133, 'eevee'], [658, 'greninja']]) {
    const pokemon = makeOfflinePokemon(id);
    assert.equal(pokemon.id, id);
    assert.equal(pokemon.name, name);
    assert.ok(pokemon.types.length >= 1 && pokemon.types.length <= 2);
    assert.equal(pokemon.stats.length, 6);
    const card = pokemonToCard(pokemon);
    assert.ok(card.battleStats.hp > 0);
    assert.ok(card.actions.attack.energyCost > 0);
    assert.equal(card.offlineFallback, true);
    assert.equal(card.sprite, '/pokemon-placeholder.svg');
  }
});

test('el catálogo local también ofrece formas oficiales registradas', () => {
  const catalog = makeOfflineCatalog();
  const ids = new Set(catalog.results.map((entry) => entry.id));
  assert.ok(ids.has(10034), 'Mega-Charizard X debe estar disponible sin API');
  assert.ok(ids.has(10196), 'Charizard Gigamax debe estar disponible sin API');
  assert.ok(ids.has(10130), 'La variante meteorito de Minior debe estar disponible sin API');
  assert.ok(ids.has(10137), 'El núcleo de Minior debe estar disponible sin API');
  assert.ok(ids.has(896), 'Glastrier debe estar disponible para validar la fusión de Calyrex');
  assert.ok(ids.has(897), 'Spectrier debe estar disponible para validar la fusión de Calyrex');
  const megaCharizardX = makeOfflinePokemon(10034);
  assert.equal(megaCharizardX.name, 'mega-charizard-x');
  assert.deepEqual(megaCharizardX.types.map((entry) => entry.type.name), ['fire', 'dragon']);
  assert.equal(megaCharizardX.is_offline_fallback, true);
  const orangeMinior = makeOfflinePokemon(10130);
  assert.equal(orangeMinior.name, 'minior-orange-meteor');
  assert.deepEqual(orangeMinior.types.map((entry) => entry.type.name), ['rock', 'flying']);
});

test('un ID sin ficha local conocida también genera una carta válida sin fetch', () => {
  const pokemon = makeOfflinePokemon(720, 'hoopa');
  assert.equal(pokemon.name, 'hoopa');
  const card = pokemonToCard(pokemon);
  assert.equal(card.id, 720);
  assert.ok(card.battleStats.hp > 0);
  assert.ok(card.types.length >= 1);
});


test('el servidor puede reconstruir una ficha segura desde el equipo ya cargado en el cliente', () => {
  const snapshot = {
    id: 720,
    name: 'hoopa',
    types: ['psychic', 'ghost'],
    baseStats: { hp: 80, attack: 110, defense: 60, speed: 70 },
    battleStats: { hp: 180, power: 120, specialDefense: 130 },
  };
  const pokemon = makeOfflinePokemonFromSnapshot(snapshot, 720);
  assert.equal(pokemon.name, 'hoopa');
  assert.equal(pokemon.id, 720);
  assert.equal(pokemon.is_offline_fallback, true);
  assert.equal(pokemon.stats.length, 6);
  assert.equal(makeOfflinePokemonFromSnapshot({ ...snapshot, id: 721 }, 720), null);
  assert.equal(makeOfflinePokemonFromSnapshot({ ...snapshot, types: ['hacking'] }, 720), null);
});

test('el respaldo de servidor no permite reemplazar stats locales de una especie conocida', () => {
  const spoofed = { id: 25, name: 'pikachu', types: ['dragon'], baseStats: { hp: 255, attack: 255, defense: 255, speed: 255 }, battleStats: { power: 255, specialDefense: 255 } };
  const resolved = makeServerOfflinePokemon(25, spoofed);
  assert.equal(resolved.name, 'pikachu');
  assert.equal(resolved.stats.find((item) => item.stat.name === 'hp').base_stat, 35);
  assert.equal(resolved.types[0].type.name, 'electric');
});

test('el respaldo de servidor puede usar una ficha validada para un ID no incluido localmente', () => {
  const snapshot = { id: 720, name: 'hoopa', types: ['psychic', 'ghost'], baseStats: { hp: 80, attack: 110, defense: 60, speed: 70 }, battleStats: { power: 120, specialDefense: 130 } };
  const resolved = makeServerOfflinePokemon(720, snapshot);
  assert.equal(resolved.name, 'hoopa');
  assert.equal(resolved.id, 720);
  assert.equal(resolved.is_offline_fallback, true);
});

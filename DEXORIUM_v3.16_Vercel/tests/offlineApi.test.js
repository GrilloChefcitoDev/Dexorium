import test from 'node:test';
import assert from 'node:assert/strict';
import { getPokemon, getPokemonCatalog, getPokemonTeam } from '../src/services/pokeApi.js';

test('PokeAPI caída: el catálogo y el equipo siguen disponibles en modo local', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  try {
    const catalog = await getPokemonCatalog({ forceRefresh: true });
    assert.equal(catalog.offline, true);
    assert.ok(catalog.results.length >= 6);

    const pikachu = await getPokemon(25);
    assert.equal(pikachu.name, 'pikachu');
    assert.equal(pikachu.is_offline_fallback, true);

    const team = await getPokemonTeam([1, 4, 7, 25, 133, 658]);
    assert.equal(team.length, 6);
    assert.equal(new Set(team.map((pokemon) => pokemon.id)).size, 6);
    assert.ok(team.every((pokemon) => pokemon.stats.length === 6));

    // Al recuperarse la red, el botón de reintento puede sustituir los datos fallback por datos reales.
    const makeRawPikachu = () => ({
      id: 25, name: 'pikachu',
      sprites: { front_default: null, other: { 'official-artwork': { front_default: null } } },
      cries: { latest: null },
      types: [{ slot: 1, type: { name: 'electric', url: '' } }],
      stats: [
        ['hp', 35], ['attack', 55], ['defense', 40], ['special-attack', 50], ['special-defense', 50], ['speed', 90],
      ].map(([name, base_stat]) => ({ base_stat, stat: { name } })),
    });
    globalThis.fetch = async (url) => ({
      ok: true,
      json: async () => String(url).includes('/pokemon?')
        ? { count: 1, next: null, results: [{ name: 'pikachu', url: 'https://pokeapi.co/api/v2/pokemon/25/' }] }
        : makeRawPikachu(),
    });
    const refreshedCatalog = await getPokemonCatalog({ forceRefresh: true });
    assert.equal(refreshedCatalog.offline, false);
    const refreshedPikachu = await getPokemon(25);
    assert.equal(refreshedPikachu.is_offline_fallback, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

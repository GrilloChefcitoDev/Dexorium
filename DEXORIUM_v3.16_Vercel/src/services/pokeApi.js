// Cliente resistente a fallos de red: cache en memoria, cache persistente del navegador
// y un catalogo local jugable. PokeAPI mejora los datos, pero ya no es requisito para iniciar sala.
import { API_URL } from '../../shared/cardRules.js';
import { makeOfflineCatalog, makeOfflinePokemon } from '../../shared/offlinePokemon.js';

const FORCE_LOCAL_MODE = import.meta.env?.VITE_POKEAPI_OFFLINE === '1';
const CATALOG_STORAGE_KEY = 'dexorium-pokemon-catalog-cache-v2';
const DETAILS_STORAGE_KEY = 'dexorium-pokemon-details-cache-v2';
const DETAIL_CACHE_LIMIT = 220;
const TYPE_CATALOG_STORAGE_KEY = 'dexorium-pokemon-type-cache-v1';
const typeCatalogCache = new Map();
const REQUEST_TIMEOUT_MS = 3200;
const OFFLINE_COOLDOWN_MS = 30_000;

let catalogCache = null;
let catalogRequest = null;
let networkOfflineUntil = 0;
const pokemonCache = new Map();
const pokemonRequests = new Map();
let storedDetailsLoaded = false;
let storedDetails = {};

function safeLocalStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

function compactPokemon(pokemon) {
  return {
    id: Number(pokemon.id),
    name: String(pokemon.name || ''),
    is_offline_fallback: Boolean(pokemon.is_offline_fallback),
    sprites: {
      front_default: pokemon.sprites?.front_default || null,
      other: { 'official-artwork': { front_default: pokemon.sprites?.other?.['official-artwork']?.front_default || null } },
    },
    cries: { latest: pokemon.cries?.latest || null, legacy: pokemon.cries?.legacy || null },
    types: (pokemon.types || []).map((item, index) => ({
      slot: Number(item.slot) || index + 1,
      type: { name: String(item.type?.name || 'normal'), url: '' },
    })),
    stats: (pokemon.stats || []).map((item) => ({
      base_stat: Number(item.base_stat) || 1,
      effort: 0,
      stat: { name: String(item.stat?.name || '') },
    })),
  };
}

function hydrateStoredDetails() {
  if (storedDetailsLoaded) return;
  storedDetailsLoaded = true;
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storedDetails = JSON.parse(storage.getItem(DETAILS_STORAGE_KEY) || '{}') || {};
    for (const value of Object.values(storedDetails)) {
      if (!value?.id || !value?.stats?.length || !value?.types?.length) continue;
      const pokemon = compactPokemon(value);
      pokemonCache.set(String(pokemon.id), pokemon);
      pokemonCache.set(pokemon.name, pokemon);
    }
  } catch {
    storedDetails = {};
  }
}

function persistPokemon(pokemon) {
  const compact = compactPokemon(pokemon);
  pokemonCache.set(String(compact.id), compact);
  pokemonCache.set(compact.name, compact);
  hydrateStoredDetails();
  storedDetails[String(compact.id)] = compact;

  // LocalStorage tiene cuota limitada. Conservamos los ultimos detalles usados.
  const keys = Object.keys(storedDetails);
  if (keys.length > DETAIL_CACHE_LIMIT) {
    for (const oldKey of keys.slice(0, keys.length - DETAIL_CACHE_LIMIT)) delete storedDetails[oldKey];
  }
  try { safeLocalStorage()?.setItem(DETAILS_STORAGE_KEY, JSON.stringify(storedDetails)); } catch { /* La cache de memoria sigue disponible. */ }
  return compact;
}

function readStoredCatalog() {
  const storage = safeLocalStorage();
  if (!storage) return null;
  try {
    const saved = JSON.parse(storage.getItem(CATALOG_STORAGE_KEY) || 'null');
    if (!saved || !Array.isArray(saved.results) || !saved.results.length) return null;
    return { ...saved, offline: true, source: 'cache-local' };
  } catch { return null; }
}

function persistCatalog(catalog) {
  catalogCache = { ...catalog, offline: false, source: 'pokeapi' };
  try {
    safeLocalStorage()?.setItem(CATALOG_STORAGE_KEY, JSON.stringify({
      count: catalogCache.count,
      total: catalogCache.total,
      results: catalogCache.results.map((entry) => ({ name: entry.name, url: entry.url })),
    }));
  } catch { /* No se bloquea el juego si el navegador no permite almacenamiento. */ }
  return catalogCache;
}

function findCatalogEntryByName(name) {
  const text = String(name ?? '').trim().toLowerCase();
  return catalogCache?.results?.find((item) => item.name?.toLowerCase() === text)
    || readStoredCatalog()?.results?.find((item) => item.name?.toLowerCase() === text)
    || null;
}

function findCatalogEntryById(id) {
  const target = Number(id);
  const entries = catalogCache?.results || readStoredCatalog()?.results || [];
  return entries.find((item) => Number(String(item.url || '').match(/(\d+)\/?$/)?.[1]) === target) || null;
}

function resolveId(identifier) {
  const text = String(identifier ?? '').trim().toLowerCase();
  if (/^\d+$/.test(text)) return Number(text);
  const entry = findCatalogEntryByName(text);
  if (!entry) return 0;
  const match = String(entry.url || '').match(/(\d+)\/?$/);
  return match ? Number(match[1]) : 0;
}

async function requestJson(url) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Sin conexión: se usará el catálogo local.');
  }
  if (Date.now() < networkOfflineUntil) throw new Error('PokeAPI temporalmente no disponible.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: 'no-cache', signal: controller.signal });
    if (!response.ok) throw new Error(`PokeAPI respondió ${response.status}`);
    return await response.json();
  } catch (error) {
    // Los errores HTTP indican que la API contestó; los de red/timeout activan cooldown.
    if (!(error instanceof Error && /^PokeAPI respondió \d+/.test(error.message))) {
      networkOfflineUntil = Date.now() + OFFLINE_COOLDOWN_MS;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getPokemonCatalog({ forceRefresh = false } = {}) {
  if (forceRefresh) {
    catalogCache = null;
    catalogRequest = null;
    networkOfflineUntil = 0;
  }
  if (FORCE_LOCAL_MODE) {
    catalogCache = readStoredCatalog() || makeOfflineCatalog();
    return { ...catalogCache, offline: true, source: 'forced-local' };
  }
  if (catalogCache && !forceRefresh) return catalogCache;
  if (catalogRequest) return catalogRequest;

  // En modo offline, prioriza inmediatamente los datos locales sin esperar a un timeout.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const stored = readStoredCatalog();
    catalogCache = stored || makeOfflineCatalog();
    return catalogCache;
  }

  catalogRequest = (async () => {
    try {
      // Una sola petición inicial reduce los puntos de fallo y devuelve count y nombres.
      const page = await requestJson(`${API_URL}/pokemon?limit=2000&offset=0`);
      let results = Array.isArray(page.results) ? page.results : [];
      let next = page.next;
      const seen = new Set(results.map((entry) => entry.url));
      while (next && results.length < Number(page.count || 0)) {
        const nextPage = await requestJson(next);
        for (const entry of nextPage.results || []) {
          if (!seen.has(entry.url)) { seen.add(entry.url); results.push(entry); }
        }
        next = nextPage.next;
      }
      if (!results.length) throw new Error('PokeAPI no devolvió Pokémon.');
      return persistCatalog({ count: Number(page.count) || results.length, total: Number(page.count) || results.length, results });
    } catch {
      const stored = readStoredCatalog();
      catalogCache = stored || makeOfflineCatalog();
      return catalogCache;
    }
  })();

  try { return await catalogRequest; }
  finally { catalogRequest = null; }
}

export async function getPokemon(identifier) {
  const safeIdentifier = String(identifier ?? '').trim().toLowerCase();
  if (!safeIdentifier) throw new Error('Debes indicar un Pokémon.');
  hydrateStoredDetails();
  const id = resolveId(safeIdentifier);
  const cached = pokemonCache.get(safeIdentifier) || (id ? pokemonCache.get(String(id)) : null);
  // Las fichas obtenidas sin red no deben impedir que se actualicen cuando vuelve PokeAPI.
  if (cached && !cached.is_offline_fallback) return cached;
  if (pokemonRequests.has(safeIdentifier)) return pokemonRequests.get(safeIdentifier);

  const offlineFallback = () => {
    const catalogEntry = id ? findCatalogEntryById(id) : null;
    const preferredName = !/^\d+$/.test(safeIdentifier) ? safeIdentifier : catalogEntry?.name || '';
    const fallback = makeOfflinePokemon(id || safeIdentifier, preferredName);
    if (fallback) return persistPokemon(fallback);
    throw new Error(`No se encontró el Pokémon "${safeIdentifier}" ni en la caché ni en el catálogo local.`);
  };

  // Si ya se detectó una caída, no repetimos una consulta externa por cada carta.
  if (FORCE_LOCAL_MODE || Date.now() < networkOfflineUntil || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return cached || offlineFallback();
  }

  const request = requestJson(`${API_URL}/pokemon/${encodeURIComponent(safeIdentifier)}`)
    .then((pokemon) => persistPokemon(pokemon))
    .catch(() => cached || offlineFallback())
    .finally(() => pokemonRequests.delete(safeIdentifier));

  pokemonRequests.set(safeIdentifier, request);
  return request;
}

// Se resuelven los detalles en paralelo, con caché persistente y fallback local por carta.
export async function getPokemonTeam(ids) {
  if (!Array.isArray(ids)) throw new Error('La lista de Pokémon no es válida.');
  return Promise.all(ids.map((id) => getPokemon(id)));
}


// Los filtros por tipo se cargan cuando el jugador los abre, no al arrancar toda la galería.
// Si la API no responde, usamos las fichas que ya están guardadas y las del catálogo local.
export async function getPokemonCatalogByType(typeName) {
  const type = String(typeName || '').trim().toLowerCase();
  const supportedTypes = new Set([
    'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
    'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
  ]);
  if (!supportedTypes.has(type)) throw new Error('El tipo seleccionado no es válido.');
  if (typeCatalogCache.has(type)) return typeCatalogCache.get(type);

  const storage = safeLocalStorage();
  if (storage) {
    try {
      const cached = JSON.parse(storage.getItem(TYPE_CATALOG_STORAGE_KEY) || '{}');
      if (Array.isArray(cached[type]) && cached[type].length) {
        typeCatalogCache.set(type, cached[type]);
        return cached[type];
      }
    } catch { /* Si la caché se dañó, consultamos o reconstruimos la lista. */ }
  }

  try {
    const response = await requestJson(`${API_URL}/type/${type}`);
    const results = (response.pokemon || []).map(({ pokemon }) => ({ name: pokemon.name, url: pokemon.url }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!results.length) throw new Error('La API no devolvió Pokémon de este tipo.');
    typeCatalogCache.set(type, results);
    if (storage) {
      try {
        const saved = JSON.parse(storage.getItem(TYPE_CATALOG_STORAGE_KEY) || '{}');
        saved[type] = results;
        storage.setItem(TYPE_CATALOG_STORAGE_KEY, JSON.stringify(saved));
      } catch { /* La búsqueda sigue funcionando aunque localStorage esté lleno. */ }
    }
    return results;
  } catch {
    const known = new Map();
    hydrateStoredDetails();
    for (const pokemon of Object.values(storedDetails)) {
      if ((pokemon.types || []).some((entry) => entry.type?.name === type)) {
        known.set(Number(pokemon.id), { name: pokemon.name, url: `${API_URL}/pokemon/${pokemon.id}/` });
      }
    }
    const offline = makeOfflineCatalog();
    for (const entry of offline.results) {
      const id = Number(String(entry.url || '').match(/(\d+)\/?$/)?.[1]);
      if (!id) continue;
      const pokemon = makeOfflinePokemon(id, entry.name);
      if (pokemon?.types?.some((item) => item.type.name === type)) known.set(id, { name: pokemon.name, url: entry.url });
    }
    const results = [...known.values()].sort((a, b) => a.name.localeCompare(b.name));
    typeCatalogCache.set(type, results);
    return results;
  }
}

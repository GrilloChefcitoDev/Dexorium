// Reglas compartidas por el navegador, el servidor y las pruebas del parcial.
// DEXORIUM conserva equipos de seis Pokémon; no se cambia la mecánica base a cinco cartas.
export const PARTIAL_TEAM_SIZE = 6;
export const CHAT_MAX_CHARACTERS = 200;

export function normalizeTeamIds(teamIds, blockedIds = [], expectedSize = PARTIAL_TEAM_SIZE) {
  if (!Array.isArray(teamIds) || teamIds.length !== expectedSize) {
    throw new Error(`El equipo debe tener exactamente ${expectedSize} Pokémon.`);
  }

  const normalizedIds = teamIds.map((id) => Number(id));
  if (normalizedIds.some((id) => !Number.isSafeInteger(id) || id <= 0 || id > 20000)) {
    throw new Error('El equipo contiene IDs de Pokémon inválidos (rango admitido: 1–20000).');
  }
  if (new Set(normalizedIds).size !== expectedSize) {
    throw new Error('El equipo no puede contener Pokémon repetidos.');
  }

  const blocked = new Set((Array.isArray(blockedIds) ? blockedIds : []).map(Number));
  const blockedId = normalizedIds.find((id) => blocked.has(id));
  if (blockedId !== undefined) {
    throw new Error(`El Pokémon con ID ${blockedId} está bloqueado porque perdió una ronda.`);
  }

  return normalizedIds;
}

function getCandidateId(candidate) {
  if (candidate && typeof candidate === 'object') {
    if (Number.isSafeInteger(Number(candidate.id)) && Number(candidate.id) > 0) return Number(candidate.id);
    const match = String(candidate.url || '').match(/\/(\d+)\/?$/);
    return match ? Number(match[1]) : 0;
  }
  const id = Number(candidate);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

// Sortea únicamente entre IDs reales del catálogo y nunca modifica el arreglo original.
// random se inyecta para que las pruebas sean deterministas.
export function chooseUniquePokemonIds(candidates, blockedIds = [], count = PARTIAL_TEAM_SIZE, random = Math.random) {
  if (!Array.isArray(candidates)) throw new Error('El catálogo de Pokémon no es válido.');
  if (!Number.isInteger(count) || count < 1) throw new Error('La cantidad solicitada no es válida.');

  const excluded = new Set((Array.isArray(blockedIds) ? blockedIds : []).map(Number));
  const pool = [...new Set(candidates.map(getCandidateId).filter((id) => id > 0 && !excluded.has(id)))];
  if (pool.length < count) throw new Error(`No hay suficientes Pokémon permitidos: se necesitan ${count} y solo hay ${pool.length}.`);

  for (let i = pool.length - 1; i > 0; i -= 1) {
    const sample = Number(random());
    const safeSample = Number.isFinite(sample) ? Math.min(Math.max(sample, 0), 0.999999999999) : 0;
    const j = Math.floor(safeSample * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, count);
}

export function validateChatMessage(rawMessage, maxCharacters = CHAT_MAX_CHARACTERS) {
  const text = String(rawMessage ?? '').trim();
  if (!text) throw new Error('El mensaje no puede estar vacío.');
  // Array.from cuenta emojis compuestos fuera del plano básico como un carácter por punto de código.
  if (Array.from(text).length > maxCharacters) {
    throw new Error(`El mensaje no puede superar los ${maxCharacters} caracteres.`);
  }
  return text;
}

export function recordMatchResultOnce(previousStats, matchId, outcome) {
  const safeStats = previousStats && typeof previousStats === 'object' ? previousStats : {};
  const recordedMatches = Array.isArray(safeStats.recordedMatches) ? safeStats.recordedMatches : [];
  if (!matchId || recordedMatches.includes(matchId)) return safeStats;
  if (!['win', 'loss', 'tie'].includes(outcome)) throw new Error('Resultado de partida desconocido.');

  return {
    wins: Math.max(0, Number(safeStats.wins) || 0) + (outcome === 'win' ? 1 : 0),
    losses: Math.max(0, Number(safeStats.losses) || 0) + (outcome === 'loss' ? 1 : 0),
    ties: Math.max(0, Number(safeStats.ties) || 0) + (outcome === 'tie' ? 1 : 0),
    played: Math.max(0, Number(safeStats.played) || 0) + 1,
    recordedMatches: [...recordedMatches, matchId],
  };
}

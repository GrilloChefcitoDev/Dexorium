import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_MAX_CHARACTERS,
  PARTIAL_TEAM_SIZE,
  chooseUniquePokemonIds,
  normalizeTeamIds,
  recordMatchResultOnce,
  validateChatMessage,
} from '../shared/partialRules.js';

test('valida seis IDs distintos y los normaliza', () => {
  assert.deepEqual(normalizeTeamIds(['1', 2, '3', 4, 5, 6]), [1, 2, 3, 4, 5, 6]);
  assert.equal(PARTIAL_TEAM_SIZE, 6);
});

test('rechaza equipos incompletos, repetidos e IDs inválidos', () => {
  assert.throws(() => normalizeTeamIds([1, 2, 3]), /exactamente 6/);
  assert.throws(() => normalizeTeamIds([1, 2, 3, 4, 5, 5]), /repetidos/);
  assert.throws(() => normalizeTeamIds([1, 2, 3, 4, 5, 'abc']), /inválidos/);
  assert.throws(() => normalizeTeamIds([1, 2, 3, 4, 5, 20001]), /inválidos/);
});

test('rechaza IDs bloqueados durante la validación del servidor', () => {
  assert.throws(() => normalizeTeamIds([1, 2, 3, 4, 5, 6], [5]), /bloqueado/);
});

test('selecciona IDs únicos de catálogo real y excluye bloqueados', () => {
  const candidates = Array.from({ length: 20 }, (_, index) => ({ name: `pokemon-${index + 1}`, url: `https://pokeapi.co/api/v2/pokemon/${index + 1}/` }));
  const ids = chooseUniquePokemonIds(candidates, [1, 2, 3], 6, () => 0.42);
  assert.equal(ids.length, 6);
  assert.equal(new Set(ids).size, 6);
  assert.ok(ids.every((id) => id > 3 && id <= 20));
});

test('el sorteo falla si no quedan suficientes Pokémon disponibles', () => {
  assert.throws(() => chooseUniquePokemonIds([1, 2, 3], [], 6), /No hay suficientes/);
});

test('valida chat vacío, límite de caracteres y emojis Unicode', () => {
  assert.throws(() => validateChatMessage('   '), /vacío/);
  assert.equal(validateChatMessage('  Hola 😄  '), 'Hola 😄');
  assert.equal(validateChatMessage('😄'.repeat(CHAT_MAX_CHARACTERS)), '😄'.repeat(CHAT_MAX_CHARACTERS));
  assert.throws(() => validateChatMessage('😄'.repeat(CHAT_MAX_CHARACTERS + 1)), /200 caracteres/);
});

test('un resultado con el mismo matchId solo se registra una vez', () => {
  const initial = { wins: 0, losses: 0, ties: 0, played: 0, recordedMatches: [] };
  const once = recordMatchResultOnce(initial, 'match-a', 'win');
  const twice = recordMatchResultOnce(once, 'match-a', 'win');
  assert.equal(once.wins, 1);
  assert.equal(once.played, 1);
  assert.equal(twice, once);
  const afterTie = recordMatchResultOnce(once, 'match-b', 'tie');
  assert.deepEqual({ wins: afterTie.wins, losses: afterTie.losses, ties: afterTie.ties, played: afterTie.played }, { wins: 1, losses: 0, ties: 1, played: 2 });
});

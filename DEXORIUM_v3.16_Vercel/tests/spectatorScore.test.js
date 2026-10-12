import test from 'node:test';
import assert from 'node:assert/strict';
import { getFaintedPokemonCount, getWinnerTrainerLabel } from '../shared/spectatorScore.js';

const pokemon = (name, hp) => ({ name, currentHp: hp });

test('el marcador solo cuenta Pokémon con 0 HP o menos del equipo indicado', () => {
  const players = [
    { side: 'A', team: [pokemon('Pikachu', 0), pokemon('Eevee', 12), pokemon('Psyduck', -1)] },
    { side: 'A', team: [pokemon('Charmander', 10), pokemon('Bulbasaur', 0)] },
    { side: 'B', team: [pokemon('Squirtle', 25), pokemon('Pidgey', 0)] },
  ];
  assert.equal(getFaintedPokemonCount(players, 'A'), 3);
  assert.equal(getFaintedPokemonCount(players, 'B'), 1);
});

test('el marcador admite datos incompletos sin romper la vista de espectador', () => {
  assert.equal(getFaintedPokemonCount(null, 'A'), 0);
  assert.equal(getFaintedPokemonCount([{ side: 'A' }], 'A'), 0);
  assert.equal(getFaintedPokemonCount([{ side: 'B', team: [{ currentHp: undefined }, { currentHp: null }] }], 'B'), 0);
});

test('el resultado identifica al entrenador ganador en 1v1', () => {
  assert.equal(getWinnerTrainerLabel({ winnerSide: 'A', players: [{ name: 'Pepito', side: 'A' }, { name: 'Gabriela', side: 'B' }] }), 'Pepito');
});

test('el resultado identifica a ambos ganadores de DUOS', () => {
  assert.equal(getWinnerTrainerLabel({ winnerSide: 'B', players: [{ name: 'Pepito', side: 'A' }, { name: 'Gabriela', side: 'B' }, { name: 'Jhon', side: 'B' }] }), 'Gabriela y Jhon');
});

test('si el servidor no asigna ganador, se conserva la opción de empate', () => {
  assert.equal(getWinnerTrainerLabel({ winnerSide: null, players: [] }), '');
});

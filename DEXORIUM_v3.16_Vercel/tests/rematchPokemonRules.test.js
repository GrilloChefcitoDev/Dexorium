import test from 'node:test';
import assert from 'node:assert/strict';
import { getPokemonIdsBlockedAfterFaint } from '../shared/rematchRules.js';

const alivePikachu = { id: 25, baseId: 25, currentHp: 24, battleStats: { hp: 35 } };

test('un Pokémon vivo no se bloquea aunque haya usado una transformación', () => {
  const aliveTransformed = {
    ...alivePikachu,
    transformed: true,
    transformationUsed: true,
    transformation: { method: 'mega', label: 'Mega-Pikachu' },
  };
  assert.deepEqual(getPokemonIdsBlockedAfterFaint(aliveTransformed), []);
});

test('un Pokémon que llega a 0 PS sí se bloquea', () => {
  assert.deepEqual(getPokemonIdsBlockedAfterFaint({ ...alivePikachu, currentHp: 0 }), [25]);
});

test('si una forma transformada cae, se bloquea la familia de formas relacionada', () => {
  const faintedCharizard = {
    id: 6,
    baseId: 6,
    currentHp: 0,
    transformed: true,
    transformation: { method: 'mega', label: 'Mega-Charizard X' },
  };
  const ids = getPokemonIdsBlockedAfterFaint(faintedCharizard);
  assert.ok(ids.includes(6));
  assert.ok(ids.includes(10034));
  assert.ok(ids.includes(10035));
});

test('si un Pokémon teracristalizado cae, no bloquea las otras formas solo por usar Tera', () => {
  const faintedTera = { ...alivePikachu, currentHp: 0, teraType: 'electric', teraUsed: true, transformationUsed: true };
  assert.deepEqual(getPokemonIdsBlockedAfterFaint(faintedTera), [25]);
});

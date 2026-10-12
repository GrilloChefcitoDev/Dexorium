import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTargetForAction, getResolvedTargetPokemon } from '../shared/combatTargets.js';

const playerA = { id: 'a1', side: 'A', activeId: 25 };
const allyA = { id: 'a2', side: 'A', activeId: 6 };
const enemyB = { id: 'b1', side: 'B', activeId: 150 };
const pikachu = { id: 25, currentHp: 60 };
const charizard = { id: 6, currentHp: 35 };
const mewtwo = { id: 150, currentHp: 90 };

test('Atacar permite seleccionar a cualquier rival activo', () => {
  assert.equal(validateTargetForAction('attack', playerA, enemyB, mewtwo), true);
});

test('Atacar no permite seleccionar a un compañero', () => {
  assert.throws(() => validateTargetForAction('attack', playerA, allyA, charizard), /equipo rival/);
});

test('Curar permite seleccionar al compañero activo', () => {
  assert.equal(validateTargetForAction('heal', playerA, allyA, charizard), true);
});

test('Defender permite proteger al compañero activo', () => {
  assert.equal(validateTargetForAction('defend', playerA, allyA, charizard), true);
});

test('Curar y defender no pueden apuntar a un enemigo', () => {
  assert.throws(() => validateTargetForAction('heal', playerA, enemyB, mewtwo), /compañero de tu equipo/);
  assert.throws(() => validateTargetForAction('defend', playerA, enemyB, mewtwo), /compañero de tu equipo/);
});

test('No permite elegir un Pokémon que ya no es el activo o quedó debilitado', () => {
  assert.throws(() => validateTargetForAction('heal', playerA, allyA, pikachu), /ya no es el Pokémon activo/);
  assert.throws(() => validateTargetForAction('heal', playerA, allyA, { id: 6, currentHp: 0 }), /ya no puede recibir/);
});


test('Un ataque dirigido al activo anterior golpea al Pokémon que entró por cambio', () => {
  const greninja = { id: 658, name: 'Greninja', currentHp: 80 };
  const pikachu = { id: 25, name: 'Pikachu', currentHp: 70 };
  const rivalAfterSwitch = { id: 'b1', side: 'B', activeId: 25, team: [greninja, pikachu] };

  // El jugador había seleccionado a Greninja, pero durante el turno entró Pikachu.
  assert.equal(getResolvedTargetPokemon('attack', rivalAfterSwitch, greninja), pikachu);
});

test('Curar y defender mantienen el objetivo que eligió el jugador', () => {
  const greninja = { id: 658, name: 'Greninja', currentHp: 80 };
  const pikachu = { id: 25, name: 'Pikachu', currentHp: 70 };
  const ally = { id: 'a2', side: 'A', activeId: 25, team: [greninja, pikachu] };

  assert.equal(getResolvedTargetPokemon('heal', ally, greninja), greninja);
  assert.equal(getResolvedTargetPokemon('defend', ally, pikachu), pikachu);
});

test('Devuelve null si no encuentra un Pokémon activo para recibir el ataque', () => {
  assert.equal(getResolvedTargetPokemon('attack', { activeId: 999, team: [] }, mewtwo), null);
});

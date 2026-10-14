import test from 'node:test';
import assert from 'node:assert/strict';
import { getHealthBarClass } from '../shared/healthBar.js';

test('la barra es verde cuando queda más de la mitad de la vida', () => {
  assert.equal(getHealthBarClass(80, 100), 'hp-healthy');
});

test('la barra es amarilla cuando queda exactamente la mitad de la vida', () => {
  assert.equal(getHealthBarClass(50, 100), 'hp-low');
});

test('la barra es roja cuando queda el 20 por ciento de la vida', () => {
  assert.equal(getHealthBarClass(20, 100), 'hp-critical');
});

test('la barra es roja cuando el Pokémon llega a cero PS', () => {
  assert.equal(getHealthBarClass(0, 100), 'hp-critical');
});

test('la barra no falla si recibe una vida máxima inválida', () => {
  assert.equal(getHealthBarClass(10, 0), 'hp-healthy');
});

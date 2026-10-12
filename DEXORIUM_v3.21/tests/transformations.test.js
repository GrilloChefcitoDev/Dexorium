import test from 'node:test';
import assert from 'node:assert/strict';
import { makeOfflinePokemon } from '../shared/offlinePokemon.js';
import { pokemonToCard, MAX_ENERGY, recoverEnergy } from '../shared/cardRules.js';
import {
  getTransformationOptions,
  getTransformationFamilyIds,
  applyTransformationToCard,
  getSpecialKoTransformation,
  getHpTriggeredTransformation,
  consumeTeamTransformationResource,
} from '../shared/pokemonTransformations.js';

function cardFor(id) {
  const card = pokemonToCard(makeOfflinePokemon(id));
  return { ...card, currentHp: card.battleStats.hp, energy: 70, shield: 0 };
}

test('la recarga restaura energía sin superar el máximo', () => {
  assert.equal(recoverEnergy(0), 35);
  assert.equal(recoverEnergy(80, 35), MAX_ENERGY);
  assert.equal(recoverEnergy(100, 35), MAX_ENERGY);
  assert.equal(cardFor(25).actions.recover.gain, 35);
});

test('Charizard ofrece sus dos megas, Gigamax y Dinamax', () => {
  const keys = getTransformationOptions(cardFor(6)).map((item) => item.key);
  assert.ok(keys.includes('mega-charizard-x'));
  assert.ok(keys.includes('mega-charizard-y'));
  assert.ok(keys.includes('gmax-charizard'));
  assert.ok(keys.includes('dynamax-6'));
});

test('Dinamax y Gigamax tienen un uso por equipo y se consumen por separado', () => {
  const usage = { dynamaxUsed: false, gigantamaxUsed: false };
  assert.ok(getTransformationOptions(cardFor(6), [], usage).some((item) => item.method === 'dynamax'));
  assert.ok(getTransformationOptions(cardFor(6), [], usage).some((item) => item.method === 'gigantamax'));

  consumeTeamTransformationResource('dynamax', usage);
  assert.equal(usage.dynamaxUsed, true);
  assert.equal(getTransformationOptions(cardFor(9), [], usage).some((item) => item.method === 'dynamax'), false);
  assert.ok(getTransformationOptions(cardFor(9), [], usage).some((item) => item.method === 'gigantamax'));
  assert.throws(() => consumeTeamTransformationResource('dynamax', usage), /ya usó Dinamax/i);

  consumeTeamTransformationResource('gigantamax', usage);
  assert.equal(usage.gigantamaxUsed, true);
  assert.equal(getTransformationOptions(cardFor(25), [], usage).some((item) => item.method === 'gigantamax'), false);
  assert.equal(getTransformationOptions(cardFor(25), [], usage).some((item) => item.method === 'dynamax'), false);
  assert.throws(() => consumeTeamTransformationResource('gigantamax', usage), /ya usó Gigamax/i);
});

test('Charmander no puede evolucionar normalmente en combate', () => {
  const options = getTransformationOptions(cardFor(4));
  assert.ok(options.some((item) => item.method === 'dynamax'));
  assert.equal(options.some((item) => /charmeleon|charizard/i.test(item.label)), false);
  assert.equal(options.some((item) => item.method === 'mega' || item.method === 'gigantamax'), false);
});

test('Greninja normal no puede convertirse en Greninja Ash', () => {
  const greninja = cardFor(658);
  const options = getTransformationOptions(greninja);
  assert.equal(options.some((item) => item.key === 'ash-greninja'), false);
  assert.equal(getSpecialKoTransformation(greninja), null);
  assert.equal(getTransformationFamilyIds(658).includes(10116), false);
  assert.equal(getTransformationFamilyIds(658).includes(10117), false);
  // La Mega-Greninja de Leyendas Pokémon: Z-A sí es una forma distinta de Ash-Greninja.
  assert.ok(options.some((item) => item.key === 'mega-greninja'));
  assert.equal(options.some((item) => item.method === 'dynamax'), false);
});

test('solo Greninja Battle Bond puede elegir Ash-Greninja o activarlo con un KO', () => {
  const battleBond = cardFor(10116);
  assert.ok(getTransformationOptions(battleBond).some((item) => item.key === 'ash-greninja'));
  assert.equal(getSpecialKoTransformation(battleBond)?.key, 'ash-greninja');
  assert.deepEqual(getTransformationFamilyIds(10116), [10116, 10117]);
  assert.deepEqual(getTransformationOptions(cardFor(10117)), []);
  assert.equal(getSpecialKoTransformation(cardFor(10117)), null);
  assert.deepEqual(getTransformationFamilyIds(10117), [10116, 10117]);
});

test('Zygarde normal necesita Power Construct para cambiar de forma; Mega requiere Forma Completa', () => {
  const zygarde50 = getTransformationOptions(cardFor(718));
  assert.equal(zygarde50.some((item) => item.key === 'zygarde-10' || item.key === 'zygarde-complete'), false);
  assert.equal(zygarde50.some((item) => item.key === 'mega-zygarde'), false);
  assert.ok(zygarde50.some((item) => item.method === 'dynamax'));

  const zygarde10PowerConstruct = getTransformationOptions(cardFor(10118));
  assert.ok(zygarde10PowerConstruct.some((item) => item.key === 'zygarde-complete'));
  assert.equal(zygarde10PowerConstruct.some((item) => item.key === 'mega-zygarde'), false);

  const zygarde50PowerConstruct = getTransformationOptions(cardFor(10119));
  assert.ok(zygarde50PowerConstruct.some((item) => item.key === 'zygarde-complete'));
  assert.ok(getTransformationOptions(cardFor(10120)).some((item) => item.key === 'mega-zygarde'));
  assert.deepEqual(getTransformationOptions(cardFor(10301)), []);
  assert.deepEqual(getTransformationFamilyIds(10120), [718, 10118, 10119, 10120, 10301]);
});

test('Minior solo cambia al núcleo del color que ya tiene y no puede dinamaxizar', () => {
  const red = getTransformationOptions(cardFor(774));
  assert.deepEqual(red.map((item) => item.key), ['minior-core-red']);
  assert.equal(red.some((item) => item.method === 'dynamax'), false);

  const orange = getTransformationOptions(cardFor(10130));
  assert.deepEqual(orange.map((item) => item.key), ['minior-core-orange']);
  assert.deepEqual(getTransformationOptions(cardFor(10136)), []);
  assert.deepEqual(getTransformationFamilyIds(10136), [774, 10130, 10131, 10132, 10133, 10134, 10135, 10136, 10137, 10138, 10139, 10140, 10141, 10142]);
});

test('Minior y Zygarde Power Construct cambian al bajar a la mitad de sus PS', () => {
  const minior = { ...cardFor(774), currentHp: 50 };
  assert.equal(getHpTriggeredTransformation(minior)?.key, 'minior-core-red');
  assert.equal(getHpTriggeredTransformation({ ...minior, currentHp: Math.floor(minior.battleStats.hp / 2) + 1 }), null);
  assert.equal(getHpTriggeredTransformation({ ...minior, currentHp: 50, transformed: true }), null);

  const zygardePowerConstruct = { ...cardFor(10119), currentHp: 50 };
  assert.equal(getHpTriggeredTransformation(zygardePowerConstruct)?.key, 'zygarde-complete');
  assert.equal(getHpTriggeredTransformation({ ...zygardePowerConstruct, currentHp: Math.floor(zygardePowerConstruct.battleStats.hp / 2) + 1 }), null);
  assert.equal(getHpTriggeredTransformation({ ...cardFor(718), currentHp: 50 }), null);
});


test('Calyrex requiere el caballo que corresponde antes de fusionarse', () => {
  const calyrex = cardFor(898);
  assert.equal(getTransformationOptions(calyrex).some((item) => item.key.startsWith('calyrex-')), false);
  const iceTeam = [calyrex, cardFor(896)];
  const iceOptions = getTransformationOptions(calyrex, iceTeam).map((item) => item.key);
  assert.ok(iceOptions.includes('calyrex-ice-rider'));
  assert.equal(iceOptions.includes('calyrex-shadow-rider'), false);
  const shadowTeam = [calyrex, cardFor(897)];
  const shadowOptions = getTransformationOptions(calyrex, shadowTeam).map((item) => item.key);
  assert.ok(shadowOptions.includes('calyrex-shadow-rider'));
  assert.equal(shadowOptions.includes('calyrex-ice-rider'), false);
});

test('las formas nuevas de Mega de PokéAPI tienen una opción compatible con su especie base', () => {
  assert.ok(getTransformationOptions(cardFor(26)).some((item) => item.key === 'mega-raichu-x'));
  assert.ok(getTransformationOptions(cardFor(26)).some((item) => item.key === 'mega-raichu-y'));
  assert.ok(getTransformationOptions(cardFor(358)).some((item) => item.key === 'mega-chimecho'));
  assert.ok(getTransformationOptions(cardFor(359)).some((item) => item.key === 'mega-absol-z'));
  assert.ok(getTransformationOptions(cardFor(398)).some((item) => item.key === 'mega-staraptor'));
  assert.equal(getTransformationOptions(cardFor(398)).some((item) => item.method === 'dynamax'), false);
  assert.equal(getTransformationOptions(cardFor(358)).some((item) => item.method === 'dynamax'), false);
  assert.ok(getTransformationOptions(cardFor(780)).some((item) => item.key === 'mega-drampa'));
  assert.ok(getTransformationOptions(cardFor(870)).some((item) => item.key === 'mega-falinks'));
});

test('las formas especiales registradas no abren evoluciones normales ni formas regionales', () => {
  assert.ok(getTransformationOptions(cardFor(351)).some((item) => item.key === 'castform-sunny'));
  assert.ok(getTransformationOptions(cardFor(681)).some((item) => item.key === 'aegislash-blade'));
  assert.ok(getTransformationOptions(cardFor(964)).some((item) => item.key === 'palafin-hero'));
  assert.ok(getTransformationOptions(cardFor(1024)).some((item) => item.key === 'terapagos-stellar'));
  assert.deepEqual(getTransformationOptions({ id: 10100, name: 'raichu-alola' }), []);
  assert.deepEqual(getTransformationOptions({ id: 10117, name: 'greninja-ash', formId: 10117 }), []);
  assert.deepEqual(getTransformationOptions({ id: 10034, baseId: 6, formId: 10034, name: 'mega-charizard-x', transformed: true }), []);
});

test('transformar conserva el ID del equipo, cambia el aspecto y bloquea otra transformación', () => {
  const base = cardFor(6);
  const option = getTransformationOptions(base).find((item) => item.key === 'mega-charizard-x');
  const transformed = applyTransformationToCard(base, option);
  assert.equal(transformed.id, base.id);
  assert.equal(transformed.baseId, 6);
  assert.equal(transformed.transformed, true);
  assert.equal(transformed.transformation.label, 'Mega-Charizard X');
  assert.ok(transformed.battleStats.power > base.battleStats.power);
  assert.equal(getTransformationOptions(transformed).length, 0);
});

test('las familias bloqueadas agrupan base y forma especial, sin mezclar especies distintas', () => {
  const family = getTransformationFamilyIds(6);
  assert.ok(family.includes(6));
  assert.ok(family.includes(10034));
  assert.ok(family.includes(10035));
  assert.ok(family.includes(10196));
  assert.equal(getTransformationFamilyIds(658).includes(10116), false);
  assert.equal(family.some((id) => id === 10100), false);
});

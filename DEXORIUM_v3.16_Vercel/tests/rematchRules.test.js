import test from 'node:test';
import assert from 'node:assert/strict';
import { createRematchRequest, validateRematchDecision, cancelRematchRequest } from '../shared/rematchRules.js';

function fixture() {
  const a = { id: 'a', name: 'Pepito', side: 'A' };
  const b = { id: 'b', name: 'Gabriela', side: 'B' };
  const room = { phase: 'finished', players: new Map([[a.id, a], [b.id, b]]), rematchRequest: null };
  return { room, a, b };
}

test('solicitar revancha no cambia la fase ni borra los equipos', () => {
  const { room, a } = fixture();
  room.players.get(a.id).team = [{ id: 25 }];
  const request = createRematchRequest(room, a, 123);
  assert.equal(room.phase, 'finished');
  assert.equal(room.players.get(a.id).team.length, 1);
  assert.equal(request.fromPlayerName, 'Pepito');
  assert.equal(request.toSide, 'B');
  assert.equal(request.createdAt, 123);
});

test('solo el rival destinatario puede responder la solicitud', () => {
  const { room, a, b } = fixture();
  createRematchRequest(room, a);
  assert.throws(() => validateRematchDecision(room, a), /propia solicitud/i);
  assert.equal(validateRematchDecision(room, b).fromPlayerId, 'a');
});

test('no se pueden emitir dos solicitudes al mismo tiempo', () => {
  const { room, a, b } = fixture();
  createRematchRequest(room, a);
  assert.throws(() => createRematchRequest(room, a), /Ya enviaste/i);
  assert.throws(() => createRematchRequest(room, b), /Ya existe/i);
});

test('quien envió la solicitud puede retirarla y el rival no puede hacerlo', () => {
  const { room, a, b } = fixture();
  createRematchRequest(room, a);
  assert.throws(() => cancelRematchRequest(room, b), /Solo quien envió/i);
  cancelRematchRequest(room, a);
  assert.equal(room.rematchRequest, null);
});

test('una solicitud solo se puede crear tras terminar el combate', () => {
  const { room, a } = fixture();
  room.phase = 'battle';
  assert.throws(() => createRematchRequest(room, a), /solo puede solicitarse al terminar/i);
});

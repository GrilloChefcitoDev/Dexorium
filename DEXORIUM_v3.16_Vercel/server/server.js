// server.js - Servidor WebSocket Autorativo para Pokémon Arena
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import crypto from 'node:crypto';
import { getTypeMultiplier, getEffectivenessLabel, pokemonToCard, MAX_ENERGY, ENERGY_REGEN_PER_TURN, recoverEnergy } from '../shared/cardRules.js';
import { findTransformationOption, applyTransformationToCard, getTransformationFamilyIds, getSpecialKoTransformation, getHpTriggeredTransformation, getPowerConstructTransformation, consumeTeamTransformationResource } from '../shared/pokemonTransformations.js';
import { normalizeTeamIds, validateChatMessage } from '../shared/partialRules.js';
import { makeServerOfflinePokemon } from '../shared/offlinePokemon.js';
import { createRematchRequest, validateRematchDecision, cancelRematchRequest } from '../shared/rematchRules.js';
import { validateTargetForAction } from '../shared/combatTargets.js';

const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT || 8080);
const POKEAPI = 'https://pokeapi.co/api/v2/pokemon/';
const FORCE_POKEAPI_OFFLINE = process.env.POKEAPI_OFFLINE === '1';
const POKEAPI_TIMEOUT_MS = 2600;
const POKEAPI_COOLDOWN_MS = 45_000;
let pokeApiOfflineUntil = 0;
const TURN_DURATION_MS = Math.max(5_000, Number(process.env.TURN_DURATION_MS || 30_000));

const rooms = new Map();
const connections = new Set();
const pokemonCache = new Map();

function sendJson(socket, data) {
  if (socket.readyState === 1) socket.send(JSON.stringify(data));
}

function cachePokemon(pokemon) {
  pokemonCache.set(String(pokemon.id), pokemon);
  pokemonCache.set(String(pokemon.name).toLowerCase(), pokemon);
  return pokemon;
}

async function fetchPokemon(identifier, snapshot = null) {
  const key = String(identifier).trim().toLowerCase();
  const cached = pokemonCache.get(key);
  // Los datos oficiales se reutilizan siempre. Una ficha fallback se reutiliza mientras
  // estamos offline, pero se vuelve a validar con PokeAPI cuando el circuito se recupera.
  if (cached && !cached.is_offline_fallback) return cached;
  if (cached?.is_offline_fallback && (FORCE_POKEAPI_OFFLINE || Date.now() < pokeApiOfflineUntil)) return cached;

  const offlineFallback = () => {
    // Usa el catálogo local y solo el snapshot validado para IDs no incluidos en él.
    // El cliente no controla cuándo se aceptan sus estadísticas: eso lo decide el servidor.
    const fallback = makeServerOfflinePokemon(identifier, snapshot);
    if (fallback) return cachePokemon(fallback);
    return null;
  };

  if (FORCE_POKEAPI_OFFLINE || Date.now() < pokeApiOfflineUntil) {
    const fallback = offlineFallback();
    if (fallback) return fallback;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POKEAPI_TIMEOUT_MS);
  try {
    const response = await fetch(`${POKEAPI}${encodeURIComponent(key)}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`PokeAPI respondió ${response.status}`);
    const pokemon = await response.json();
    return cachePokemon(pokemon);
  } catch {
    // El primer fallo abre un circuito de espera; los siguientes no reintentan seis veces.
    pokeApiOfflineUntil = Date.now() + POKEAPI_COOLDOWN_MS;
    const fallback = offlineFallback();
    if (fallback) return fallback;
    throw new Error(`No se pudieron cargar los datos del Pokémon ${key} ni usar un respaldo local.`);
  } finally {
    clearTimeout(timeout);
  }
}

// Valida equipo/bloqueos y usa snapshots o datos locales si la API externa está caída.
async function buildValidatedTeam(teamIds, blockedIds = [], snapshots = []) {
  const uniqueIds = normalizeTeamIds(teamIds, blockedIds, 6);
  const byId = new Map((Array.isArray(snapshots) ? snapshots : []).map((snapshot) => [Number(snapshot?.id), snapshot]));
  const rawTeam = await Promise.all(uniqueIds.map((id) => fetchPokemon(id, byId.get(id))));
  return rawTeam.map(pokemonToCard).map((card) => ({
    ...card,
    currentHp: card.battleStats.hp,
    energy: card.battleStats.energy,
    shield: 0,
  }));
}

function validateName(name) {
  const clean = String(name || '').trim().slice(0, 18);
  if (!clean) throw new Error('Escribe un nombre de entrenador.');
  return clean;
}

function cleanPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    rematchConfirmed: Boolean(player.rematchConfirmed),
    side: player.side,
    team: player.team,
    activeId: player.activeId,
    lastActiveId: player.lastActiveId || player.activeId || null,
    blockedIds: player.blockedIds,
    afkTurns: player.afkTurns || 0,
  };
}

function cleanRoom(room, currentPlayer) {
  const players = [...room.players.values()].map(cleanPlayer);
  const alive = {
    A: players.filter((player) => player.side === 'A' && player.team.some((pokemon) => pokemon.currentHp > 0)).length,
    B: players.filter((player) => player.side === 'B' && player.team.some((pokemon) => pokemon.currentHp > 0)).length,
  };

  return {
    code: room.code,
    matchId: room.matchId,
    audioTrackIndex: room.audioTrackIndex,
    turnStartedAt: room.turnStartedAt,
    turnDurationMs: TURN_DURATION_MS,
    mode: room.mode,
    visibility: room.visibility,
    maxPlayers: room.maxPlayers,
    phase: room.phase,
    turn: room.turn,
    winnerSide: room.winnerSide,
    rematchVotes: [...room.rematchVotes],
    rematchRequest: room.rematchRequest ? { ...room.rematchRequest, toPlayerIds: [...(room.rematchRequest.toPlayerIds || [])] } : null,
    transformationUsage: {
      A: { ...(room.transformationUsage?.A || { dynamaxUsed: false, gigantamaxUsed: false }) },
      B: { ...(room.transformationUsage?.B || { dynamaxUsed: false, gigantamaxUsed: false }) },
    },
    players,
    pendingPlayerIds: [...room.pendingActions.keys()],
    waitingForSwitchIds: [...room.waitingForSwitch],
    sides: { A: { alive: alive.A }, B: { alive: alive.B } },
    logs: room.logs.slice(-100),
    chatMessages: room.chatMessages || [],
    effects: room.effects || [],
    me: currentPlayer ? cleanPlayer(currentPlayer) : null,
  };
}

function addLog(room, text, kind = 'system', author = '', authorSide = '') {
  room.logs.push({ time: new Date().toISOString(), text, kind, author, authorSide });
  room.logs = room.logs.slice(-120);
}

function addEffect(room, effect) {
  room.effects.push({ id: crypto.randomUUID(), at: Date.now(), turn: room.turn, ...effect });
  room.effects = room.effects.slice(-24);
}

// El contador aumenta una vez por turno y solo se reinicia cuando el jugador sí actúa.
function recordAfkTurn(room, player) {
  if (player.lastAfkTurn === room.turn) return false;
  player.lastAfkTurn = room.turn;
  player.afkTurns = (player.afkTurns || 0) + 1;
  return player.afkTurns >= 3;
}

function finishForAfk(room, offenders) {
  if (room.phase !== 'battle') return;
  const offenderSides = new Set(offenders.map((player) => player.side));
  room.phase = 'finished';
  room.winnerSide = offenderSides.size === 1 ? (offenderSides.has('A') ? 'B' : 'A') : null;
  room.pendingActions.clear();
  room.waitingForSwitch.clear();
  if (room.winnerSide) {
    addLog(room, `${offenders.map((player) => player.name).join(', ')} perdió por acumular 3 turnos AFK. Gana el equipo ${room.winnerSide}.`, 'system');
  } else {
    addLog(room, 'La partida terminó: ambos equipos acumularon 3 turnos AFK.', 'system');
  }
}

function broadcastState(room) {
  for (const player of room.players.values()) {
    sendJson(player.client, { type: 'STATE', room: cleanRoom(room, player) });
  }
}

function broadcastRoomList() {
  const roomsPublic = [...rooms.values()]
    .filter((room) => room.visibility === 'public' && room.phase === 'lobby')
    .map((room) => ({
      code: room.code,
      mode: room.mode,
      players: room.players.size,
      maxPlayers: room.maxPlayers,
      protected: Boolean(room.password),
    }));

  for (const client of connections) {
    // Los jugadores dentro de una sala no necesitan la lista de salas. Evita que
    // ROOM_LIST sobrescriba el STATE recién enviado en el cliente.
    if (!getRoomForClient(client)) sendJson(client, { type: 'ROOM_LIST', rooms: roomsPublic });
  }
}

function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  do {
    code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function getRoomForClient(client) {
  if (!client.playerId) return null;
  for (const room of rooms.values()) {
    const player = room.players.get(client.playerId);
    // El identificador no basta: el socket debe ser el que quedó registrado en la sala.
    // Esto evita que otra pestaña pueda enviar acciones suplantando el mismo playerId.
    if (player && player.client === client) return room;
  }
  return null;
}

function findPlayerById(room, id) {
  return room.players.get(String(id || ''));
}

function claimPlayerId(client, rawId) {
  const id = String(rawId || '').trim();
  if (id.length < 4 || id.length > 80) throw new Error('Id de jugador invalido.');
  client.playerId = id;
}

function assertPlayerIdAvailable(playerId, client) {
  for (const room of rooms.values()) {
    const existing = room.players.get(String(playerId));
    if (existing && existing.client !== client) {
      throw new Error('Este navegador ya tiene un jugador activo en otra sala. Cierra la otra sesión o utiliza otra ventana de incógnito.');
    }
  }
}

function chooseSide(room, requestedSide) {
  if (room.mode === 'solo') return room.players.size === 0 ? 'A' : 'B';
  const side = requestedSide === 'B' ? 'B' : 'A';
  const count = [...room.players.values()].filter((player) => player.side === side).length;
  if (count >= 2) throw new Error(`El equipo ${side} ya esta completo.`);
  return side;
}

function findPokemon(player, id) {
  return player.team.find((pokemon) => pokemon.id === Number(id));
}

function hasAlivePokemon(player) {
  return player.team.some((pokemon) => pokemon.currentHp > 0);
}

function activePlayers(room) {
  return [...room.players.values()].filter((player) => {
    const active = player.activeId ? findPokemon(player, player.activeId) : null;
    return Boolean(active && active.currentHp > 0 && !room.waitingForSwitch.has(player.id));
  });
}

function sideHasAlivePokemon(room, side) {
  return [...room.players.values()]
    .filter((player) => player.side === side)
    .some(hasAlivePokemon);
}

function checkWinner(room) {
  const sideAAlive = sideHasAlivePokemon(room, 'A');
  const sideBAlive = sideHasAlivePokemon(room, 'B');

  if (sideAAlive && sideBAlive) return false;

  room.phase = 'finished';
  room.winnerSide = sideAAlive ? 'A' : sideBAlive ? 'B' : null;
  if (room.winnerSide) {
    addLog(room, `El equipo ${room.winnerSide} gana la partida.`, 'system');
  } else {
    addLog(room, 'La partida termina en empate: ambos equipos quedaron sin Pokémon disponibles.', 'system');
  }
  return true;
}

function chooseInitialActives(room) {
  for (const player of room.players.values()) {
    const firstAlive = player.team.find((pokemon) => pokemon.currentHp > 0);
    if (firstAlive) {
      player.activeId = firstAlive.id;
      player.lastActiveId = firstAlive.id;
    }
  }
}

function triggerHpBasedTransformations(room) {
  // Si el combate ya terminó, no mostramos una transformación fuera de combate.
  if (!sideHasAlivePokemon(room, 'A') || !sideHasAlivePokemon(room, 'B')) return;
  for (const player of room.players.values()) {
    if (!player.activeId) continue;
    const active = findPokemon(player, player.activeId);
    if (!active || active.currentHp <= 0) continue;
    const option = getHpTriggeredTransformation(active);
    if (option) applyBattleTransformation(room, player, active, option.key, 'automáticamente al quedar con la mitad de sus PS o menos');
  }
}

function markFainted(room) {
  const newlyFainted = [];

  for (const player of room.players.values()) {
    if (!player.activeId) continue;
    const active = findPokemon(player, player.activeId);
    if (active && active.currentHp <= 0) {
      addLog(room, `${active.name} quedo fuera de combate.`, 'event', player.name, player.side);
      addEffect(room, { kind: 'faint', side: player.side, icon: '⭐', pokemonId: active.id });
      newlyFainted.push({ player, pokemon: active });
      player.lastActiveId = active.id;
      player.activeId = null;
      if (hasAlivePokemon(player)) room.waitingForSwitch.add(player.id);
    }
  }

  // Si los dos bandos pierden un Pokémon en la misma resolución del turno,
  // ese intercambio cuenta como empate para los bloqueos. No se bloquea a
  // ninguno de los Pokémon caídos en ese intercambio.
  const sidesWithFaints = new Set(newlyFainted.map(({ player }) => player.side));
  const simultaneousDraw = sidesWithFaints.has('A') && sidesWithFaints.has('B');
  if (!simultaneousDraw) {
    for (const { player, pokemon } of newlyFainted) {
      const family = getTransformationFamilyIds(pokemon.baseId || pokemon.id);
      const directAlternateForm = Number(pokemon.id) >= 10000 && family.length > 1;
      const idsToBlock = pokemon.transformed || pokemon.transformationUsed || directAlternateForm ? family : [pokemon.id];
      const newlyBlocked = idsToBlock.map(Number).filter((id) => Number.isSafeInteger(id) && !player.blockedIds.includes(id));
      if (newlyBlocked.length) {
        player.blockedIds.push(...newlyBlocked);
        addLog(room, `${pokemon.name} y sus formas asociadas quedan bloqueados para ${player.name} en las próximas revanchas.`, 'system', player.name, player.side);
      }
    }
  }
}

function regenerateEnergy(room) {
  for (const player of room.players.values()) {
    const active = player.activeId ? findPokemon(player, player.activeId) : null;
    if (active && active.currentHp > 0) active.energy = recoverEnergy(active.energy, ENERGY_REGEN_PER_TURN);
  }
}

function applyBattleTransformation(room, player, pokemon, key, automaticReason = '') {
  const usage = room.transformationUsage?.[player.side] || { dynamaxUsed: false, gigantamaxUsed: false };
  const option = findTransformationOption(pokemon, key, player.team, usage);
  if (!option) throw new Error('Esa transformación no está disponible para este Pokémon.');
  if (pokemon.transformed || pokemon.transformationUsed) throw new Error('Este Pokémon ya se transformó durante el combate.');

  const transformed = applyTransformationToCard(pokemon, option);
  const index = player.team.findIndex((entry) => Number(entry.id) === Number(pokemon.id));
  if (index < 0) throw new Error('No se encontró el Pokémon que va a transformarse.');
  player.team[index] = transformed;
  // Dinamax y Gigamax son recursos separados, pero cada equipo solo puede usar cada uno una vez por combate.
  if (option.method === 'dynamax' || option.method === 'gigantamax') {
    consumeTeamTransformationResource(option.method, usage);
  }
  room.transformationUsage[player.side] = usage;

  const familyIds = option.familyIds || getTransformationFamilyIds(pokemon.baseId || pokemon.id);
  player.blockedIds = [...new Set([...(player.blockedIds || []), ...familyIds.map(Number)])];
  addLog(room, `${player.name} transformó a ${transformed.baseName || pokemon.name} en ${option.label}${automaticReason ? ` ${automaticReason}` : ''}. No podrá cambiar de forma durante este combate.`, 'transformation', player.name, player.side);
  addEffect(room, {
    kind: 'transform', side: player.side, icon: option.method === 'mega' ? '💎' : option.method === 'dynamax' || option.method === 'gigantamax' ? '🔴' : '✨',
    pokemonId: transformed.id, method: option.method, transformationKey: option.key, automatic: Boolean(automaticReason),
  });
  return transformed;
}

function resolveAction(room, player, packet) {
  if (packet.action === 'wait') {
    addLog(room, 'no tenía energía suficiente para otra acción; recuperará energía al finalizar el turno.', 'event', player.name, player.side);
    return;
  }
  if (Number(packet.pokemonId) !== Number(player.activeId)) {
    throw new Error('Ese Pokemon no es tu activo.');
  }

  const actor = findPokemon(player, packet.pokemonId);
  if (!actor || actor.currentHp <= 0) throw new Error('Ese Pokemon no puede actuar.');

  if (packet.action === 'switch') {
    const next = findPokemon(player, packet.switchPokemonId);
    if (!next || next.currentHp <= 0) throw new Error('Ese Pokemon no puede entrar.');
    if (Number(next.id) === Number(actor.id)) throw new Error('Ya estas usando ese Pokemon.');
    player.activeId = next.id;
    player.lastActiveId = next.id;
    addLog(room, `cambio de ${actor.name} a ${next.name}.`, 'event', player.name, player.side);
    addEffect(room, { kind: 'switch', side: player.side, icon: '✨', pokemonId: next.id });
    return;
  }

  const action = actor.actions[packet.action];
  if (!action) throw new Error('La accion no existe.');
  if (actor.energy < action.energyCost) throw new Error('No tienes energia suficiente.');

  if (action.id === 'recover') {
    const before = actor.energy;
    actor.energy = recoverEnergy(actor.energy, action.gain || 35);
    const recovered = actor.energy - before;
    addLog(room, `recargó ${recovered} puntos de energía (${actor.energy}/${MAX_ENERGY}).`, 'event', player.name, player.side);
    addEffect(room, { kind: 'energy', side: player.side, icon: '⚡', pokemonId: actor.id, amount: recovered });
    return;
  }

  let target = actor;
  let targetPlayer = player;
  const hasExplicitTarget = packet.targetPlayerId != null && packet.targetPokemonId != null;
  if (action.id === 'attack' || (['heal', 'defend'].includes(action.id) && hasExplicitTarget)) {
    targetPlayer = findPlayerById(room, packet.targetPlayerId);
    target = targetPlayer ? findPokemon(targetPlayer, packet.targetPokemonId) : null;
    validateTargetForAction(action.id, player, targetPlayer, target);
  }

  actor.energy -= action.energyCost;

  if (action.id === 'attack') {
    const multiplier = getTypeMultiplier(action.type, target.types);
    const rawDamage = Math.round(action.power * multiplier);
    const damageAfterDefense = Math.max(1, rawDamage - Math.floor(target.battleStats.defense / 10));
    const shieldAbsorbed = Math.min(target.shield, damageAfterDefense);
    target.shield -= shieldAbsorbed;
    const finalDamage = Math.max(0, damageAfterDefense - shieldAbsorbed);
    target.currentHp = Math.max(0, target.currentHp - finalDamage);

    const powerConstruct = getPowerConstructTransformation(target);
    if (powerConstruct && sideHasAlivePokemon(room, 'A') && sideHasAlivePokemon(room, 'B')) {
      applyBattleTransformation(room, targetPlayer, target, powerConstruct.key, 'automáticamente por Power Construct al llegar a la mitad de sus PS');
    }

    const effectiveness = getEffectivenessLabel(multiplier);
    addLog(room, `uso ${action.name} contra ${target.name}: ${finalDamage} de daño. ${effectiveness}.`, 'event', player.name, player.side);
    addEffect(room, { kind: 'attack', side: player.side, actorPlayerId: player.id, targetSide: targetPlayer.side, targetPlayerId: targetPlayer.id, icon: multiplier >= 2 ? '💥' : multiplier > 0 ? '⚡' : '💫', pokemonId: actor.id, targetPokemonId: target.id, attackType: action.type, multiplier, finishing: target.currentHp <= 0 });
    if (shieldAbsorbed > 0) addLog(room, `El escudo absorbio ${shieldAbsorbed}.`, 'event', player.name, player.side);

    // La regla de Battle Bond solo aplica a la entrada especial #10116 y solo si el KO no termina la partida.
    if (target.currentHp <= 0 && Number(actor.baseId ?? actor.id) === 10116 && !actor.transformed && !actor.transformationUsed
      && sideHasAlivePokemon(room, targetPlayer.side)) {
      const bondForm = getSpecialKoTransformation(actor);
      if (bondForm) applyBattleTransformation(room, player, actor, bondForm.key, 'al debilitar a un rival');
    }
  }

  if (action.id === 'defend') {
    target.shield = Math.min(target.shield + action.shield, 100);
    addLog(room, `protegió a ${target.name}; ganó ${action.shield} de escudo.`, 'event', player.name, player.side);
    addEffect(room, { kind: 'defend', side: player.side, actorPlayerId: player.id, targetSide: targetPlayer.side, targetPlayerId: targetPlayer.id, icon: '🛡️', pokemonId: actor.id, targetPokemonId: target.id });
  }

  if (action.id === 'heal') {
    const before = target.currentHp;
    target.currentHp = Math.min(target.battleStats.hp, target.currentHp + action.heal);
    addLog(room, `curó a ${target.name} y recuperó ${target.currentHp - before} puntos de vida.`, 'event', player.name, player.side);
    addEffect(room, { kind: 'heal', side: player.side, actorPlayerId: player.id, targetSide: targetPlayer.side, targetPlayerId: targetPlayer.id, icon: '💚', pokemonId: actor.id, targetPokemonId: target.id });
  }
}

function actionSpeed(room, packet) {
  const player = room.players.get(packet.playerId);
  const pokemon = player ? findPokemon(player, packet.pokemonId) : null;
  return pokemon?.battleStats.speed || 0;
}

function resolveTurn(room) {
  const packets = [...room.pendingActions.values()].sort((a, b) => {
    return actionSpeed(room, b) - actionSpeed(room, a) || String(a.playerId).localeCompare(String(b.playerId));
  });

  // Primero mostramos las elecciones de todos. Así los jugadores pueden ver
  // ambas decisiones antes de leer sus resultados y daños.
  for (const packet of packets) {
    const player = room.players.get(packet.playerId);
    if (!player?.activeId || room.waitingForSwitch.has(player.id)) continue;
    const active = findPokemon(player, player.activeId);
    if (!active || active.currentHp <= 0) continue;

    const actionLabels = { attack: 'Atacar', defend: 'Defender', heal: 'Curarse', recover: 'Recargar energía', switch: 'Cambiar de Pokémon', wait: 'Esperar / recuperar energía' };
    let choiceText = `${player.name} eligió ${actionLabels[packet.action] || packet.action} con ${active.name}`;
    if (packet.action === 'switch') {
      const next = findPokemon(player, packet.switchPokemonId);
      if (next) choiceText += ` → ${next.name}`;
    } else if (['attack', 'heal', 'defend'].includes(packet.action)) {
      const targetPlayer = findPlayerById(room, packet.targetPlayerId) || (packet.action !== 'attack' ? player : null);
      const targetPokemon = targetPlayer ? findPokemon(targetPlayer, packet.targetPokemonId || active.id) : null;
      if (targetPlayer && targetPokemon) {
        const preposition = packet.action === 'attack' ? ' contra ' : packet.action === 'heal' ? ' para curar a ' : ' para proteger a ';
        choiceText += `${preposition}${targetPlayer.name} (${targetPokemon.name})`;
      }
    }
    const pendingTransform = packet.transformKey ? findTransformationOption(active, packet.transformKey, player.team, room.transformationUsage?.[player.side]) : null;
    if (pendingTransform) choiceText += ` + transformar en ${pendingTransform.label}`;
    addLog(room, `Turno ${room.turn}: ${choiceText}.`, 'choice', player.name, player.side);
  }

  // Después se resuelven en orden de velocidad, respetando el funcionamiento
  // actual del combate y evitando ejecutar una acción inválida.
  for (const packet of packets) {
    const player = room.players.get(packet.playerId);
    if (!player?.activeId || room.waitingForSwitch.has(player.id)) continue;
    const active = findPokemon(player, player.activeId);
    if (!active || active.currentHp <= 0) continue;

    try {
      let actionPacket = packet;
      if (packet.transformKey) {
        const usage = room.transformationUsage?.[player.side];
        const optionIgnoringTeamLimit = findTransformationOption(active, packet.transformKey, player.team);
        const option = findTransformationOption(active, packet.transformKey, player.team, usage);
        const alreadyAppliedAutomatically = active.transformed && active.transformation?.key === packet.transformKey;
        if (!option && !alreadyAppliedAutomatically) {
          const teamLimitUsed = optionIgnoringTeamLimit && (
            (optionIgnoringTeamLimit.method === 'dynamax' && usage?.dynamaxUsed) ||
            (optionIgnoringTeamLimit.method === 'gigantamax' && usage?.gigantamaxUsed)
          );
          if (teamLimitUsed) {
            // En DUOS, dos compañeros pueden elegir Dinamax a la vez antes de resolverse el turno.
            // El primero lo consume; el segundo pierde solo la transformación, no toda su acción.
            const methodName = optionIgnoringTeamLimit.method === 'dynamax' ? 'Dinamax' : 'Gigamax';
            addLog(room, `${player.name} ya no pudo usar ${methodName}: su equipo gastó ese uso en este mismo turno. Su acción seguirá sin transformación.`, 'system', player.name, player.side);
            actionPacket = { ...packet, transformKey: null };
          } else {
            throw new Error('La transformación ya no está disponible.');
          }
        } else if (option) {
          applyBattleTransformation(room, player, active, packet.transformKey, '');
        }
      }
      resolveAction(room, player, actionPacket);
    } catch (error) {
      addLog(room, `${player.name}: ${error.message}`);
    }
  }

  triggerHpBasedTransformations(room);
  markFainted(room);
  checkWinner(room);

  if (room.phase !== 'finished') {
    regenerateEnergy(room);
    room.turn += 1;
    room.turnStartedAt = Date.now();
    room.pendingActions.clear();
  } else {
    room.pendingActions.clear();
  }
}

function startIfReady(room) {
  const minimumPlayers = room.mode === 'duos' ? 4 : 2;
  if (room.players.size < minimumPlayers) return false;

  chooseInitialActives(room);
  room.phase = 'battle';
  room.turnStartedAt = Date.now();
  addLog(room, room.mode === 'duos' ? 'Comienza la batalla DUOS 2v2.' : 'Comienza el combate 1v1.');
  return true;
}

async function createRoom(client, message) {
  if (getRoomForClient(client)) throw new Error('Ya estas en una sala.');
  claimPlayerId(client, message.playerId || crypto.randomUUID());
  assertPlayerIdAvailable(client.playerId, client);

  const room = {
    code: makeRoomCode(),
    matchId: crypto.randomUUID(),
    audioTrackIndex: Math.floor(Math.random() * 3),
    mode: message.mode === 'duos' ? 'duos' : 'solo',
    visibility: message.visibility === 'private' ? 'private' : 'public',
    password: String(message.password || '').slice(0, 30),
    maxPlayers: message.mode === 'duos' ? 4 : 2,
    phase: 'lobby',
    turn: 1,
    turnStartedAt: Date.now(),
    winnerSide: null,
    players: new Map(),
    pendingActions: new Map(),
    waitingForSwitch: new Set(),
    rematchVotes: new Set(),
    rematchRequest: null,
    transformationUsage: { A: { dynamaxUsed: false, gigantamaxUsed: false }, B: { dynamaxUsed: false, gigantamaxUsed: false } },
    logs: [],
    chatMessages: [],
    effects: [],
  };

  const team = await buildValidatedTeam(message.teamIds, [], message.teamSnapshots);
  // Mientras se consultaba PokeAPI pudo llegar otra petición de este mismo socket.
  if (getRoomForClient(client)) throw new Error('Ya estas en una sala.');
  assertPlayerIdAvailable(client.playerId, client);
  while (rooms.has(room.code)) room.code = makeRoomCode();

  const player = {
    id: client.playerId,
    name: validateName(message.name),
    side: chooseSide(room, message.side),
    client,
    team,
    activeId: null,
    lastActiveId: null,
    blockedIds: [],
    rematchConfirmed: false,
    afkTurns: 0,
    lastAfkTurn: null,
  };

  room.players.set(player.id, player);
  rooms.set(room.code, room);
  addLog(room, 'creo la sala.', 'event', player.name, player.side);

  sendJson(client, { type: 'ROOM_CREATED', room: cleanRoom(room, player) });
  broadcastState(room);
  broadcastRoomList();
}

async function joinRoom(client, message) {
  if (getRoomForClient(client)) throw new Error('Ya estas en una sala.');

  claimPlayerId(client, message.playerId || crypto.randomUUID());
  assertPlayerIdAvailable(client.playerId, client);
  const code = String(message.code || '').trim().toUpperCase();
  const room = rooms.get(code);
  if (!room) throw new Error('No existe esa sala.');
  if (room.phase !== 'lobby') throw new Error('La partida ya empezo.');
  if (room.players.size >= room.maxPlayers) throw new Error('La sala esta llena.');
  if (room.password !== String(message.password || '')) throw new Error('Contraseña incorrecta.');
  if (room.players.has(client.playerId)) throw new Error('Ese jugador ya esta dentro de la sala.');

  const team = await buildValidatedTeam(message.teamIds, [], message.teamSnapshots);
  // Revalidar luego de la espera: otra persona puede haber ocupado el último cupo.
  if (getRoomForClient(client)) throw new Error('Ya estas en una sala.');
  if (rooms.get(code) !== room || room.phase !== 'lobby') throw new Error('La sala ya no está disponible.');
  if (room.players.size >= room.maxPlayers) throw new Error('La sala se llenó mientras cargaban tus Pokémon.');
  if (room.password !== String(message.password || '')) throw new Error('Contraseña incorrecta.');
  if (room.players.has(client.playerId)) throw new Error('Ese jugador ya está dentro de la sala.');
  assertPlayerIdAvailable(client.playerId, client);
  const player = {
    id: client.playerId,
    name: validateName(message.name),
    side: chooseSide(room, message.side),
    client,
    team,
    activeId: null,
    lastActiveId: null,
    blockedIds: [],
    rematchConfirmed: false,
    afkTurns: 0,
    lastAfkTurn: null,
  };

  room.players.set(player.id, player);
  addLog(room, 'entro a la sala.', 'event', player.name, player.side);
  startIfReady(room);
  broadcastState(room);
  broadcastRoomList();
}

// Una solicitud no cambia la fase ni vacía los equipos. El rival decide si empieza la preparación.
function handleRematch(client, room, player) {
  const request = createRematchRequest(room, player);
  const recipients = [...room.players.values()].filter((candidate) => candidate.side === request.toSide);
  const recipientNames = recipients.map((candidate) => candidate.name).join(' y ');
  addLog(room, `${player.name} envió una solicitud de revancha a ${recipientNames}.`, 'system', player.name, player.side);
  broadcastState(room);
}

function beginRematchPreparation(room, request, acceptingPlayer) {
  // Solo se llama después de que un rival acepta. Aquí sí se genera una partida nueva.
  room.phase = 'rematch_lobby';
  room.matchId = crypto.randomUUID();
  const availableMusicIndexes = [0, 1, 2].filter((index) => index !== room.audioTrackIndex);
  room.audioTrackIndex = availableMusicIndexes[Math.floor(Math.random() * availableMusicIndexes.length)];
  room.turn = 1;
  room.turnStartedAt = Date.now();
  room.winnerSide = null;
  room.pendingActions.clear();
  room.waitingForSwitch.clear();
  room.rematchVotes.clear();
  room.rematchRequest = null;
  room.transformationUsage = { A: { dynamaxUsed: false, gigantamaxUsed: false }, B: { dynamaxUsed: false, gigantamaxUsed: false } };
  room.effects = [];

  for (const p of room.players.values()) {
    p.team = [];
    p.activeId = null;
    p.lastActiveId = null;
    p.rematchConfirmed = false;
    p.rematchConfirming = false;
    p.afkTurns = 0;
    p.lastAfkTurn = null;
  }

  addLog(room, `${acceptingPlayer.name} aceptó la revancha de ${request.fromPlayerName}. Ambos pueden preparar un equipo nuevo.`, 'system', acceptingPlayer.name, acceptingPlayer.side);
  broadcastState(room);
}

function handleAcceptRematch(client, room, player) {
  const request = validateRematchDecision(room, player);
  beginRematchPreparation(room, request, player);
}

function handleRejectRematch(client, room, player) {
  const request = validateRematchDecision(room, player);
  room.rematchRequest = null;
  addLog(room, `${player.name} rechazó la solicitud de revancha de ${request.fromPlayerName}.`, 'system', player.name, player.side);
  broadcastState(room);
}

// Si aún es una solicitud pendiente, cancelar solo retira la invitación.
// Si ambos ya entraron a preparar equipos, se cierra esa preparación como en la versión anterior.
function handleCancelRematch(client, room, player) {
  if (room.phase === 'finished' && room.rematchRequest) {
    cancelRematchRequest(room, player);
    addLog(room, `${player.name} retiró su solicitud de revancha.`, 'system', player.name, player.side);
    broadcastState(room);
    return;
  }
  if (room.phase !== 'rematch_lobby') throw new Error('No tienes una solicitud pendiente ni una revancha en preparación.');

  addLog(room, `${player.name} canceló la preparación de revancha. La sala volverá a la galería.`, 'system', player.name, player.side);
  const participants = [...room.players.values()];
  rooms.delete(room.code);
  room.pendingActions.clear();
  room.waitingForSwitch.clear();
  room.rematchVotes.clear();
  room.phase = 'finished';

  for (const participant of participants) {
    sendJson(participant.client, {
      type: 'REMATCH_CANCELLED',
      roomCode: room.code,
      cancelledBy: player.name,
      message: player.id === participant.id
        ? 'Revancha cancelada. Puedes volver a la galería.'
        : `${player.name} canceló la revancha. La sala se cerró y puedes volver a la galería.`,
    });
    participant.client.playerId = null;
  }
  room.players.clear();
  broadcastRoomList();
}

// Actividad 4 y 5: Confirmar mazo de revancha con validación de bloqueos
async function handleConfirmRematchTeam(client, room, player, message) {
  if (room.phase !== 'rematch_lobby') throw new Error('No es momento de confirmar equipo.');
  if (player.rematchConfirmed || player.rematchConfirming) throw new Error('Ya confirmaste tu equipo; espera al resto de los jugadores.');

  // Evita que dos mensajes rápidos reserven una confirmación mientras PokeAPI responde.
  player.rematchConfirming = true;
  try {
    const team = await buildValidatedTeam(message.teamIds, player.blockedIds, message.teamSnapshots);
    if (rooms.get(room.code) !== room || room.phase !== 'rematch_lobby' || room.players.get(player.id) !== player) {
      throw new Error('La preparación de revancha ya fue cancelada.');
    }
    player.team = team;
    player.rematchConfirmed = true;
    addLog(room, 'confirmó su nuevo equipo.', 'system', player.name, player.side);

    // La batalla solo inicia cuando todos confirmaron un equipo válido.
    const allReady = [...room.players.values()].every((p) => p.rematchConfirmed && p.team.length === 6);
    if (allReady) {
      for (const p of room.players.values()) {
        for (const pokemon of p.team) {
          pokemon.currentHp = pokemon.battleStats.hp;
          pokemon.energy = pokemon.battleStats.energy;
          pokemon.shield = 0;
        }
      }
      chooseInitialActives(room);
      room.turn = 1;
      room.turnStartedAt = Date.now();
      room.winnerSide = null;
      room.pendingActions.clear();
      room.waitingForSwitch.clear();
      room.phase = 'battle';
      addLog(room, '¡Inicia la revancha del combate!', 'system');
    }
    broadcastState(room);
  } finally {
    player.rematchConfirming = false;
  }
}

function leaveRoom(client) {
  const room = getRoomForClient(client);
  if (!room) return;
  const player = room.players.get(client.playerId);
  if (!player) return;

  addLog(room, 'salio de la sala.', 'event', player.name, player.side);

  // Si alguien abandona durante una solicitud pendiente, no dejamos al rival esperando una invitación huérfana.
  if (room.rematchRequest) {
    if (room.rematchRequest.fromPlayerId === player.id) {
      room.rematchRequest = null;
      addLog(room, 'La solicitud de revancha se cerró porque quien la envió salió de la sala.', 'system');
    } else if ((room.rematchRequest.toPlayerIds || []).includes(player.id)) {
      room.rematchRequest.toPlayerIds = room.rematchRequest.toPlayerIds.filter((id) => id !== player.id);
      const remainingRecipients = [...room.players.values()].filter((candidate) => candidate.id !== player.id && candidate.side === room.rematchRequest.toSide);
      if (!remainingRecipients.length) {
        room.rematchRequest = null;
        addLog(room, 'La solicitud de revancha se cerró porque ya no queda ningún rival para responder.', 'system');
      }
    }
  }

  if (room.phase === 'battle') {
    player.team.forEach((pokemon) => { pokemon.currentHp = 0; });
    checkWinner(room);
  }

  room.players.delete(player.id);
  room.pendingActions.delete(player.id);
  room.waitingForSwitch.delete(player.id);
  client.playerId = null;

  if (room.players.size === 0) rooms.delete(room.code);
  else broadcastState(room);
  broadcastRoomList();
}

async function handleMessage(client, rawMessage) {
  let message;
  try {
    message = JSON.parse(rawMessage);
  } catch {
    sendJson(client, { type: 'ERROR', message: 'JSON invalido.' });
    return;
  }

  try {
    if (message.type === 'LIST_ROOMS') {
      broadcastRoomList();
      return;
    }

    if (message.type === 'CREATE_ROOM') {
      await createRoom(client, message);
      return;
    }

    if (message.type === 'JOIN_ROOM') {
      await joinRoom(client, message);
      return;
    }

    const room = getRoomForClient(client);
    if (!room) throw new Error('Primero debes entrar a una sala.');
    const player = room.players.get(client.playerId);
    if (!player) throw new Error('Jugador no encontrado.');

    if (message.type === 'REMATCH') {
      handleRematch(client, room, player);
      return;
    }

    if (message.type === 'ACCEPT_REMATCH') {
      handleAcceptRematch(client, room, player);
      return;
    }

    if (message.type === 'REJECT_REMATCH') {
      handleRejectRematch(client, room, player);
      return;
    }

    if (message.type === 'CANCEL_REMATCH') {
      handleCancelRematch(client, room, player);
      return;
    }

    if (message.type === 'SURRENDER') {
      if (room.phase !== 'battle') throw new Error('Solo puedes rendirte durante un combate activo.');
      const losingSide = player.side;
      addLog(room, `${player.name} se rindió. El equipo ${losingSide} pierde el combate.`, 'system', player.name, player.side);
      for (const teammate of room.players.values()) {
        if (teammate.side !== losingSide) continue;
        teammate.team.forEach((pokemon) => { pokemon.currentHp = 0; });
        teammate.lastActiveId = teammate.activeId || teammate.lastActiveId || teammate.team[0]?.id || null;
        teammate.activeId = null;
        room.pendingActions.delete(teammate.id);
        room.waitingForSwitch.delete(teammate.id);
      }
      checkWinner(room);
      broadcastState(room);
      return;
    }

    if (message.type === 'CONFIRM_REMATCH_TEAM') {
      await handleConfirmRematchTeam(client, room, player, message);
      return;
    }

    if (message.type === 'PLAY_ACTION') {
      if (room.phase !== 'battle') throw new Error('No estas en combate.');
      if (message.turn != null && Number(message.turn) !== room.turn) throw new Error('El turno ya terminó; la acción automática ya se ejecutó.');
      if (room.waitingForSwitch.has(player.id)) throw new Error('Debes elegir tu siguiente Pokemon.');
      if (room.waitingForSwitch.size > 0) throw new Error('Espera a que el rival elija su siguiente Pokemon.');
      if (room.pendingActions.has(player.id)) throw new Error('Ya enviaste tu jugada de este turno.');
      if (!['attack', 'defend', 'heal', 'recover', 'switch'].includes(message.action)) throw new Error('Accion no valida.');
      if (message.transformKey && message.action === 'switch') throw new Error('No puedes transformar y cambiar de Pokémon en el mismo turno.');

      const active = player.activeId ? findPokemon(player, player.activeId) : null;
      if (!active || active.currentHp <= 0 || Number(message.pokemonId) !== Number(active.id)) {
        throw new Error('El Pokémon indicado no es tu Pokémon activo.');
      }
      if (message.transformKey && !findTransformationOption(active, message.transformKey, player.team, room.transformationUsage?.[player.side])) {
        throw new Error('La transformación no corresponde a este Pokémon o ya fue utilizada.');
      }
      if (message.action === 'switch') {
        const next = findPokemon(player, message.switchPokemonId);
        if (!next || next.currentHp <= 0 || next.id === active.id) throw new Error('El Pokémon elegido para cambiar no es válido.');
      } else {
        const action = active.actions[message.action];
        if (!action) throw new Error('La acción no existe.');
        if (active.energy < action.energyCost) throw new Error('No tienes energía suficiente para esa acción.');
        if (message.action === 'recover' && active.energy >= MAX_ENERGY) throw new Error('Tu energía ya está al máximo.');
        if (message.action === 'attack' || ['heal', 'defend'].includes(message.action) && (message.targetPlayerId != null || message.targetPokemonId != null)) {
          const targetPlayer = findPlayerById(room, message.targetPlayerId);
          const targetPokemon = targetPlayer ? findPokemon(targetPlayer, message.targetPokemonId) : null;
          validateTargetForAction(message.action, player, targetPlayer, targetPokemon);
        }
      }

      // El contador AFK solo se reinicia cuando la jugada enviada es válida.
      player.afkTurns = 0;
      player.lastAfkTurn = null;
      room.pendingActions.set(player.id, {
        playerId: player.id,
        pokemonId: Number(message.pokemonId),
        action: message.action,
        targetPlayerId: message.targetPlayerId ? String(message.targetPlayerId) : null,
        targetPokemonId: message.targetPokemonId ? Number(message.targetPokemonId) : null,
        switchPokemonId: message.switchPokemonId ? Number(message.switchPokemonId) : null,
        transformKey: message.transformKey ? String(message.transformKey).slice(0, 80) : null,
      });

      if (room.pendingActions.size >= activePlayers(room).length) resolveTurn(room);
      broadcastState(room);
      return;
    }

    if (message.type === 'CHOOSE_POKEMON') {
      if (!room.waitingForSwitch.has(player.id)) throw new Error('No necesitas cambiar de Pokemon.');
      const candidate = findPokemon(player, message.pokemonId);
      if (!candidate || candidate.currentHp <= 0) throw new Error('Ese Pokemon no puede entrar.');

      player.activeId = candidate.id;
      player.lastActiveId = candidate.id;
      player.afkTurns = 0;
      player.lastAfkTurn = null;
      addEffect(room, { kind: 'switch', side: player.side, icon: '✨', pokemonId: candidate.id });
      room.waitingForSwitch.delete(player.id);
      addLog(room, `envio a ${candidate.name}.`, 'event', player.name, player.side);
      if (room.waitingForSwitch.size === 0 && room.pendingActions.size === 0) room.turnStartedAt = Date.now();
      broadcastState(room);
      return;
    }

    // Actividad 3: Chat validado (máximo 200 caracteres, no vacíos)
    if (message.type === 'CHAT_MESSAGE') {
      const text = validateChatMessage(message.message);

      const chatMessage = {
        id: crypto.randomUUID(),
        time: new Date().toISOString(),
        text,
        author: player.name,
        authorSide: player.side,
      };
      room.chatMessages.push(chatMessage);
      room.chatMessages = room.chatMessages.slice(-200);
      // Se mantiene también en el log general para conservar compatibilidad con la interfaz.
      addLog(room, text, 'chat', player.name, player.side);
      broadcastState(room);
      return;
    }

    if (message.type === 'LEAVE_ROOM') {
      leaveRoom(client);
      return;
    }

    throw new Error(`Mensaje desconocido: ${message.type}`);
  } catch (error) {
    sendJson(client, { type: 'ERROR', message: error.message || 'Error del servidor.' });
  }
}

function randomTimedOutAction(room, player) {
  const active = player.activeId ? findPokemon(player, player.activeId) : null;
  if (!active || active.currentHp <= 0) return null;

  const choices = [];
  const enemies = [...room.players.values()].filter((candidate) => candidate.side !== player.side && candidate.activeId)
    .map((candidate) => ({ player: candidate, pokemon: findPokemon(candidate, candidate.activeId) }))
    .filter(({ pokemon }) => pokemon && pokemon.currentHp > 0);

  if (enemies.length && active.energy >= active.actions.attack.energyCost) {
    const target = enemies[Math.floor(Math.random() * enemies.length)];
    choices.push({ action: 'attack', targetPlayerId: target.player.id, targetPokemonId: target.pokemon.id });
  }
  if (active.energy >= active.actions.defend.energyCost) choices.push({ action: 'defend' });
  if (active.energy >= active.actions.heal.energyCost) choices.push({ action: 'heal' });
  if (active.energy <= 70) choices.push({ action: 'recover' });
  const bench = player.team.filter((pokemon) => pokemon.currentHp > 0 && pokemon.id !== active.id);
  if (bench.length) {
    const next = bench[Math.floor(Math.random() * bench.length)];
    choices.push({ action: 'switch', switchPokemonId: next.id });
  }

  const chosen = choices.length ? choices[Math.floor(Math.random() * choices.length)] : { action: 'wait' };
  return { playerId: player.id, pokemonId: active.id, ...chosen, auto: true };
}

function tickRoomTimers() {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.phase !== 'battle') continue;
    if (now - room.turnStartedAt < TURN_DURATION_MS) continue;

    // Si falta una sustitución, el servidor elige un Pokémon vivo al azar.
    if (room.waitingForSwitch.size > 0) {
      let selectedAny = false;
      const afkForfeits = [];
      for (const playerId of [...room.waitingForSwitch]) {
        const player = room.players.get(playerId);
        if (!player) {
          room.waitingForSwitch.delete(playerId);
          continue;
        }
        const forfeits = recordAfkTurn(room, player);
        addLog(room, `Se agotó el tiempo de ${player.name} al elegir sustituto (AFK ${player.afkTurns}/3).`, 'system', player.name, player.side);
        if (forfeits) {
          afkForfeits.push(player);
          continue;
        }
        const available = player.team.filter((pokemon) => pokemon.currentHp > 0);
        if (!available.length) {
          room.waitingForSwitch.delete(playerId);
          continue;
        }
        const chosen = available[Math.floor(Math.random() * available.length)];
        player.activeId = chosen.id;
        player.lastActiveId = chosen.id;
        addEffect(room, { kind: 'switch', side: player.side, icon: '✨', pokemonId: chosen.id });
        room.waitingForSwitch.delete(playerId);
        addLog(room, `El sistema eligió a ${chosen.name} como sustituto aleatorio para ${player.name}.`, 'system', player.name, player.side);
        selectedAny = true;
      }
      if (afkForfeits.length) {
        finishForAfk(room, afkForfeits);
        broadcastState(room);
        continue;
      }
      if (room.waitingForSwitch.size === 0) room.turnStartedAt = Date.now();
      if (selectedAny) broadcastState(room);
      continue;
    }

    const eligiblePlayers = activePlayers(room);
    if (!eligiblePlayers.length) continue;

    const afkForfeits = [];
    const timedOutPlayers = [];
    for (const player of eligiblePlayers) {
      if (room.pendingActions.has(player.id)) continue;
      const forfeits = recordAfkTurn(room, player);
      timedOutPlayers.push(player);
      if (forfeits) afkForfeits.push(player);
    }

    if (afkForfeits.length) {
      for (const player of afkForfeits) {
        addLog(room, `${player.name} llegó a 3 turnos consecutivos AFK.`, 'system', player.name, player.side);
      }
      finishForAfk(room, afkForfeits);
      broadcastState(room);
      continue;
    }

    let insertedAutoAction = false;
    for (const player of timedOutPlayers) {
      const packet = randomTimedOutAction(room, player);
      if (!packet) continue;
      room.pendingActions.set(player.id, packet);
      addLog(room, `Se agotó el tiempo de ${player.name}; el sistema eligió una acción aleatoria (AFK ${player.afkTurns}/3).`, 'system', player.name, player.side);
      insertedAutoAction = true;
    }

    if (insertedAutoAction && room.pendingActions.size >= eligiblePlayers.length) {
      resolveTurn(room);
      broadcastState(room);
    } else if (insertedAutoAction) {
      broadcastState(room);
    }
  }
}

export function startGameServer() {
  // Este endpoint HTTP sencillo permite que Render compruebe que el servidor sigue vivo.
  const httpServer = createServer((request, response) => {
    if (request.url === '/health' || request.url === '/') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ ok: true, service: 'dexorium-game-server' }));
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });
  const wss = new WebSocketServer({ server: httpServer });
  const turnTimer = setInterval(tickRoomTimers, 250);
  // El ping periódico ayuda a detectar conexiones muertas y evita sockets abandonados.
  const heartbeatTimer = setInterval(() => {
    for (const client of wss.clients) {
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      try { client.ping(); } catch { client.terminate(); }
    }
  }, 25_000);
  const clearTimers = () => {
    clearInterval(turnTimer);
    clearInterval(heartbeatTimer);
  };
  wss.on('close', clearTimers);
  httpServer.on('close', clearTimers);
  httpServer.listen(PORT, HOST, () => {
    console.log(`DEXORIUM HTTP/health en http://${HOST}:${PORT}/health`);
    console.log(`DEXORIUM WebSocket disponible por el mismo puerto ${PORT}`);
  });

  wss.on('connection', (client) => {
    connections.add(client);
    client.playerId = null;
    client.isAlive = true;
    client.on('pong', () => { client.isAlive = true; });

    client.on('message', (message) => handleMessage(client, message.toString()));
    client.on('close', () => {
      leaveRoom(client);
      connections.delete(client);
    });
    client.on('error', () => {
      leaveRoom(client);
      connections.delete(client);
    });

    const roomsPublic = [...rooms.values()]
      .filter((room) => room.visibility === 'public' && room.phase === 'lobby')
      .map((room) => ({ code: room.code, mode: room.mode, players: room.players.size, maxPlayers: room.maxPlayers, protected: Boolean(room.password) }));
    sendJson(client, { type: 'ROOM_LIST', rooms: roomsPublic });
  });

  return wss;
}

if (process.argv[1]?.endsWith('server.js')) startGameServer();
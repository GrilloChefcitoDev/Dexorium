// Estas funciones validan las solicitudes de revancha sin mezclar la decisión del rival
// con la preparación del siguiente combate. El servidor conserva la autoridad final.
export function createRematchRequest(room, player, now = Date.now()) {
  if (!room || room.phase !== 'finished') {
    throw new Error('La revancha solo puede solicitarse al terminar la partida.');
  }
  if (room.rematchRequest) {
    if (room.rematchRequest.fromPlayerId === player?.id) {
      throw new Error('Ya enviaste una solicitud de revancha. Espera la respuesta.');
    }
    throw new Error('Ya existe una solicitud de revancha pendiente.');
  }
  if (!player || !room.players?.has(player.id)) throw new Error('Jugador no encontrado en la sala.');

  const recipients = [...room.players.values()].filter((candidate) => candidate.side !== player.side);
  if (!recipients.length) throw new Error('No hay un rival conectado para recibir la solicitud.');

  room.rematchRequest = {
    fromPlayerId: player.id,
    fromPlayerName: player.name,
    fromSide: player.side,
    toSide: recipients[0].side,
    toPlayerIds: recipients.map((candidate) => candidate.id),
    createdAt: now,
  };
  return room.rematchRequest;
}

export function validateRematchDecision(room, player) {
  if (!room || room.phase !== 'finished') throw new Error('La partida ya no está esperando una respuesta.');
  const request = room.rematchRequest;
  if (!request) throw new Error('No hay una solicitud de revancha pendiente.');
  if (request.fromPlayerId === player?.id) throw new Error('No puedes responder tu propia solicitud.');
  if (request.toSide !== player?.side) throw new Error('La solicitud fue enviada al equipo contrario.');
  if (!room.players?.has(player.id)) throw new Error('Jugador no encontrado en la sala.');
  return request;
}

export function cancelRematchRequest(room, player) {
  const request = room?.rematchRequest;
  if (!request) throw new Error('No hay una solicitud pendiente para cancelar.');
  if (request.fromPlayerId !== player?.id) throw new Error('Solo quien envió la solicitud puede cancelarla.');
  room.rematchRequest = null;
  return request;
}

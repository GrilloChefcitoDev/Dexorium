// Comprueba el objetivo elegido para una acción. Atacar siempre apunta al rival; curar y defender solo afectan al propio equipo.
export function validateTargetForAction(actionId, actorPlayer, targetPlayer, targetPokemon) {
  if (!actorPlayer) throw new Error('No se encontró al jugador que realiza la acción.');
  if (!targetPlayer || !targetPokemon) throw new Error('Elige un Pokémon objetivo que siga disponible.');
  if (Number(targetPlayer.activeId) !== Number(targetPokemon.id)) {
    throw new Error('El objetivo ya no es el Pokémon activo de ese jugador.');
  }
  if (targetPokemon.currentHp <= 0) throw new Error('Ese Pokémon ya no puede recibir acciones.');

  const sameSide = targetPlayer.side === actorPlayer.side;
  if (actionId === 'attack' && sameSide) throw new Error('Los ataques deben dirigirse al equipo rival.');
  if (['heal', 'defend'].includes(actionId) && !sameSide) {
    throw new Error('Solo puedes curar o proteger a un compañero de tu equipo.');
  }
  if (!['attack', 'heal', 'defend'].includes(actionId)) {
    throw new Error('Esta acción no admite un objetivo seleccionado.');
  }
  return true;
}

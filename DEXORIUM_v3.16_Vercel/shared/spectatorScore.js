// El marcador del espectador cuenta cada Pokémon debilitado una sola vez por equipo.
export function getFaintedPokemonCount(playersOrRoom, side) {
  const players = Array.isArray(playersOrRoom) ? playersOrRoom : (playersOrRoom?.players || []);
  return players
    .filter((player) => player?.side === side)
    .reduce((total, player) => total + (Array.isArray(player.team)
      ? player.team.filter((pokemon) => pokemon?.currentHp != null && Number.isFinite(Number(pokemon.currentHp)) && Number(pokemon.currentHp) <= 0).length
      : 0), 0);
}

// En 1v1 aparece el nombre de la persona; en DUOS se muestran ambos integrantes ganadores.
export function getWinnerTrainerLabel(room) {
  if (!room || !room.winnerSide) return '';
  const names = (room.players || [])
    .filter((player) => player?.side === room.winnerSide)
    .map((player) => String(player.name || '').trim())
    .filter(Boolean);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  if (names.length > 2) return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
  return room.winnerSide === 'A' ? 'el equipo rojo' : 'el equipo azul';
}

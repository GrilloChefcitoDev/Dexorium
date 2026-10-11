// Esta es la primera pantalla que ve el jugador.
// La Pokedex no es solo decoracion: desde aca se puede buscar un Pokémon, cambiar de registro y entrar al constructor del equipo.

import { useEffect, useRef, useState } from 'react';
import { getPokemon } from '../services/pokeApi';
import { useArenaAudio } from '../audio/AudioManager';

export default function PokedexIntro({ onContinue, onPokemonCry }) {
  const audio = useArenaAudio();
  const playCry = onPokemonCry || audio.playPokemonCry;
  const [pokemon, setPokemon] = useState(null);
  const [query, setQuery] = useState('25');
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  async function loadPokemon(identifier = query, { announce = true } = {}) {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');

    try {
      const data = await getPokemon(identifier);
      if (requestId !== requestIdRef.current) return;
      setPokemon(data);
      setQuery(String(data.id));
      if (announce) playCry(data);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setPokemon(null);
      setError('No se encontro ese Pokemon.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    // La ficha inicial se carga sin grito automático: evita que el navegador
    // deje una voz pendiente y la reproduzca encima de la primera selección.
    loadPokemon('25', { announce: false });
  }, []);

  function movePokemon(amount) {
    const currentId = pokemon?.id || 1;
    loadPokemon(Math.max(1, currentId + amount));
  }

  return (
    <section className={`intro-shell ${open ? 'intro-shell--open' : ''}`}>
      <div className="intro-copy">
        <p className="eyebrow">DEXORIUM · POKÉMON BATTLE ARENA</p>
        <img className="intro-dexorium-logo" src="/brand/dexorium-logo-light.png" alt="DEXORIUM" />
        <h1>Pokémon Battle Arena</h1>
        <p>
          Revisa un Pokemon, busca cualquiera de PokeAPI y despues arma tu equipo para entrar a una batalla por turnos.
        </p>
        <button className="primary-button intro-open-button" type="button" onClick={() => setOpen((value) => !value)}>
          {open ? 'Cerrar Pokedex' : 'Abrir Pokedex'}
        </button>
      </div>

      <div className="pokedex-3d" aria-label="Pokedex interactiva">
        <div className="pokedex-3d__left">
          <div className="camera-light" />
          <div className="pokedex-screen">
            {loading && <span className="dex-loading">Consultando PokeAPI...</span>}
            {!loading && pokemon && (
              <>
                <div className="dex-screen-header">
                  <strong>#{String(pokemon.id).padStart(4, '0')}</strong>
                  <span>{pokemon.name}</span>
                </div>
                <img className="pokedex-pokemon-sprite" src={pokemon.sprites?.other?.['official-artwork']?.front_default || pokemon.sprites?.front_default || '/pokemon-placeholder.svg'} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = '/pokemon-placeholder.svg'; }} alt={pokemon.name} title={`Escuchar a ${pokemon.name}`} onClick={() => playCry(pokemon)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') playCry(pokemon); }} />
                <div className="intro-types">
                  {pokemon.types.map(({ type }) => <span key={type.name}>{type.name}</span>)}
                </div>
              </>
            )}
          </div>
          <div className="dpad" aria-hidden="true">
            <span className="dpad-v" />
            <span className="dpad-h" />
          </div>
        </div>

        <div className="pokedex-3d__hinge" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <div className="pokedex-3d__right">
          <div className="pokedex-lid-title">
            <div>
              <small>SISTEMA</small>
              <strong>POKEDEX</strong>
            </div>
            {open && <button className="pokedex-close-button" type="button" onClick={() => setOpen(false)}>x</button>}
          </div>

          <div className="mini-display">
            <small>REGISTRO ACTUAL</small>
            <span>{pokemon ? `#${String(pokemon.id).padStart(4, '0')}` : '----'}</span>
          </div>

          <form
            className="pokedex-search"
            onSubmit={(event) => {
              event.preventDefault();
              loadPokemon(query);
            }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre o ID"
              aria-label="Buscar Pokemon por nombre o ID"
            />
            <button className="pokedex-search-button" type="submit">Buscar</button>
          </form>

          {error && <p className="pokedex-inline-error">{error}</p>}

          <div className="action-pad">
            <button type="button" onClick={() => movePokemon(-1)} aria-label="Pokemon anterior">←</button>
            <button type="button" onClick={() => movePokemon(1)} aria-label="Pokemon siguiente">→</button>
          </div>

        </div>
      </div>
      <div className="intro-arena-action">
        <button className="primary-button arena-entry-button" type="button" onClick={onContinue}>
          Entrar a la Arena
        </button>
      </div>
    </section>
  );
}

// Aca se arma el equipo.
// El Pokémon seleccionado se revisa a la derecha y desde ahi se puede ver vida, poder, velocidad y las 3 acciones.

import { useEffect, useMemo, useRef, useState } from 'react';
import { calculateBattleStats, createActions } from '../../shared/cardRules';
import { getPokemonCatalogByType } from '../services/pokeApi';

const PAGE_SIZE = 12;

function prettyName(value) {
  return value.replace(/-/g, ' ');
}

function TypeBadge({ type }) {
  return <span className={`type-badge type-${type}`}>{type}</span>;
}

export default function TeamBuilder({ catalog, selectedTeam, onSelect, onRemove, onInspect, inspectedPokemon, onStart, onBack, onRandomTeam, onRefreshCatalog, blockedIds = [], selectionMode = 'initial' }) {
  const [randomLoading, setRandomLoading] = useState(false);
  const randomInProgressRef = useRef(false);
  const [randomError, setRandomError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [letterFilter, setLetterFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [typeResults, setTypeResults] = useState(null);
  const [typeLoading, setTypeLoading] = useState(false);
  const [typeError, setTypeError] = useState('');

  useEffect(() => {
    if (typeFilter === 'all') { setTypeResults(null); setTypeError(''); setTypeLoading(false); return undefined; }
    let cancelled = false;
    setTypeLoading(true);
    setTypeResults([]);
    setTypeError('');
    getPokemonCatalogByType(typeFilter)
      .then((entries) => { if (!cancelled) setTypeResults(entries); })
      .catch(() => { if (!cancelled) { setTypeResults([]); setTypeError('No se pudo cargar el filtro por tipo. Puedes seguir buscando por nombre o letra.'); } })
      .finally(() => { if (!cancelled) setTypeLoading(false); });
    return () => { cancelled = true; };
  }, [typeFilter]);

  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase().replace(/^#/, '');
    const source = typeFilter === 'all' || typeResults === null ? (catalog.results || []) : typeResults;
    let result = source.filter((entry) => {
      const id = Number(String(entry.url || '').match(/(\d+)\/?$/)?.[1]) || 0;
      const nameMatches = !value || entry.name.toLowerCase().includes(value) || String(id) === value;
      const letterMatches = letterFilter === 'all' || entry.name.toLowerCase().startsWith(letterFilter);
      const availableMatches = !onlyAvailable || !blockedIds.map(Number).includes(id);
      return nameMatches && letterMatches && availableMatches;
    });
    // En modo sin conexión también se puede localizar una ficha por su ID.
    if (/^\d+$/.test(value) && typeFilter === 'all' && letterFilter === 'all') {
      const id = Number(value);
      const alreadyListed = result.some((entry) => Number(String(entry.url || '').match(/(\d+)\/?$/)?.[1]) === id);
      if (id > 0 && id <= 20000 && !alreadyListed && (!onlyAvailable || !blockedIds.map(Number).includes(id))) {
        result.unshift({ name: `pokemon-${id}`, url: `https://pokeapi.co/api/v2/pokemon/${id}/`, offlineGenerated: true });
      }
    }
    return result;
  }, [catalog.results, search, typeFilter, typeResults, letterFilter, onlyAvailable, blockedIds]);

  // Cuando escribimos otra busqueda, la lista cambia de tamaño.
  // Volvemos a la primera pagina para no quedar mostrando una pagina vacia.
  useEffect(() => {
    const lastPage = Math.max(Math.ceil(filtered.length / PAGE_SIZE) - 1, 0);
    setPage((current) => Math.min(current, lastPage));
  }, [filtered.length]);

  function getIdFromEntry(entry) {
    return Number(entry.url.match(/(\d+)\/$/)?.[1] || 0);
  }

  // Solo mostramos una pagina a la vez para que la lista no se vuelva pesada de golpe.
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Los numeros que se ven al lado derecho salen de la misma formula que usara el servidor.
  const inspectedStats = inspectedPokemon ? calculateBattleStats(inspectedPokemon) : null;
  const inspectedActions = inspectedPokemon ? createActions(inspectedPokemon) : null;
  function isSelected(id) {
    return selectedTeam.some((pokemon) => pokemon.id === id);
  }

  // El color del contador cambia segun cuantos Pokémon llevemos.
  // Rojo significa que apenas empieza, amarillo que ya hay una parte y verde que el equipo esta completo.
  const counterState = selectedTeam.length === 6 ? 'full' : selectedTeam.length >= 3 ? 'half' : 'low';

  return (
    <section className="team-builder">
      <div className="retro-header">
        <div>
          <p className="eyebrow">MODELO 02 · POKEDEX DE BATALLA</p>
          <h1>{selectionMode === 'rematch' ? 'Elige tu equipo para la revancha' : 'Construye tu equipo'}</h1>
          <p>{selectionMode === 'rematch' ? 'Selecciona seis Pokémon nuevos. Los que aparecen en rojo están bloqueados durante esta sala.' : catalog.offline ? 'Modo sin conexión: puedes jugar con el catálogo local y buscar otros Pokémon por ID.' : 'Busca por nombre y selecciona hasta 6 Pokémon. Los datos base vienen de PokeAPI.'}</p>
          {catalog.offline && <div className="offline-catalog-note" role="status"><span>PokeAPI no responde. DEXORIUM está usando datos locales; las fichas que no estén en caché usarán estadísticas de respaldo.</span>{onRefreshCatalog && <button className="offline-retry-button" type="button" onClick={onRefreshCatalog}>Probar conexión de nuevo</button>}</div>}
          <button
            className="secondary-button"
            type="button"
            disabled={!onRandomTeam || randomLoading || catalog.count < 6}
            onClick={async () => {
              // Bloqueo síncrono: impide dos sorteos si se hace doble clic muy rápido.
              if (randomInProgressRef.current) return;
              randomInProgressRef.current = true;
              setRandomLoading(true);
              setRandomError('');
              try {
                const team = await onRandomTeam(blockedIds);
                if (!Array.isArray(team) || team.length !== 6) throw new Error('No se pudo generar un equipo completo.');
              } catch (error) {
                setRandomError(error.message || 'No se pudo generar el equipo aleatorio.');
              } finally {
                randomInProgressRef.current = false;
                setRandomLoading(false);
              }
            }}
          >
            {randomLoading ? 'Cargando personajes…' : '⚡ Mazo aleatorio (6)'}
          </button>
          {randomError && <p className="error-banner" role="alert">{randomError}</p>}
        </div>
        <div className="team-header-actions">
          <button className="ghost-button" type="button" onClick={onBack}>Volver</button>
          <div className={`team-counter team-counter--${counterState}`} aria-label={`Equipo ${selectedTeam.length} de 6`}><span>{selectedTeam.length}/6</span></div>
        </div>
      </div>

      <div className="team-layout">
        <aside className="dex-sidebar">
          <div className="search-box">
            <input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(0); }}
              placeholder="Buscar cualquier Pokémon..."
              aria-label="Buscar cualquier Pokémon"
            />
            <div className="search-meta-row"><span>{filtered.length.toLocaleString()} resultados</span><button className="filter-toggle" type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>{filtersOpen ? 'Cerrar filtros −' : 'Filtros ☷'}</button></div>
            {filtersOpen && <div className="gallery-filter-panel">
              <label>Primera letra<select value={letterFilter} onChange={(event) => { setLetterFilter(event.target.value); setPage(0); }}><option value="all">Todas</option>{'abcdefghijklmnopqrstuvwxyz'.split('').map((letter) => <option key={letter} value={letter}>{letter.toUpperCase()}</option>)}</select></label>
              <label>Tipo<select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(0); }}><option value="all">Todos los tipos</option>{['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'].map((type) => <option value={type} key={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select></label>
              <label className="filter-check"><input type="checkbox" checked={onlyAvailable} onChange={(event) => { setOnlyAvailable(event.target.checked); setPage(0); }} />Ocultar Pokémon bloqueados</label>
              {typeLoading && <small role="status">Buscando Pokémon de ese tipo…</small>}
              {typeError && <small className="filter-error" role="alert">{typeError}</small>}
              <button className="ghost-button filter-reset" type="button" onClick={() => { setSearch(''); setLetterFilter('all'); setTypeFilter('all'); setOnlyAvailable(false); setPage(0); }}>Limpiar filtros</button>
            </div>}
          </div>

          <div className="team-mini-list">
            {selectedTeam.map((pokemon, index) => (
              <button className="team-mini-card" type="button" key={pokemon.id} onClick={() => onInspect(pokemon.id)}>
                <span>{index + 1}</span>
                <img src={pokemon.sprite || '/pokemon-placeholder.svg'} alt={pokemon.name} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = '/pokemon-placeholder.svg'; }} />
                <strong>{prettyName(pokemon.name)}</strong>
                <b onClick={(event) => { event.stopPropagation(); onRemove(pokemon.id); }}>×</b>
              </button>
            ))}
            {selectedTeam.length === 0 && <p className="muted">Tu equipo aparecerá aquí.</p>}
          </div>

          <button className={`primary-button sticky-start ${selectionMode === 'rematch' ? 'rematch-confirm-button' : ''}`} type="button" disabled={selectionMode === 'rematch' ? selectedTeam.length !== 6 : !selectedTeam.length} onClick={onStart}>
            {selectionMode === 'rematch' ? `Confirmar equipo para revancha (${selectedTeam.length}/6) →` : 'Comenzar combate →'}
          </button>
        </aside>

        <div className="dex-grid-wrap">
          {filtered.length === 0 ? (
            <div className="empty-state"><h2>{typeLoading ? 'Buscando Pokémon…' : 'No se encontró ese Pokémon'}</h2><p>{typeLoading ? 'Un momento, estamos preparando el filtro.' : typeFilter !== 'all' ? 'No hay resultados disponibles para ese tipo en la caché actual. Prueba otro filtro o vuelve a Todos los tipos.' : 'Prueba con otro nombre, número o letra.'}</p></div>
          ) : (
            <div className="dex-grid">
              {pageItems.map((entry) => (
                <button
                  key={entry.name}
                  className={`dex-grid-card ${isSelected(getIdFromEntry(entry)) ? 'is-selected' : ''} ${blockedIds.includes(getIdFromEntry(entry)) ? 'is-blocked' : ''}`}
                  type="button"
                  title={blockedIds.includes(getIdFromEntry(entry)) ? `${prettyName(entry.name)} está bloqueado para ti en esta sala` : `Ver ${prettyName(entry.name)}`}
                  aria-disabled={blockedIds.includes(getIdFromEntry(entry))}
                  onClick={() => onInspect(getIdFromEntry(entry))}
                >
                  <span className="dex-number">#{String(getIdFromEntry(entry) || '????').padStart(4, '0')}</span>
                  <div className="dex-grid-image"><img src={catalog.offline || entry.offlineGenerated ? '/pokemon-placeholder.svg' : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${getIdFromEntry(entry) || ''}.png`} alt={entry.name} loading="lazy" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = '/pokemon-placeholder.svg'; }} /></div>
                  <strong>{prettyName(entry.name)}</strong>
                  {isSelected(getIdFromEntry(entry)) && <span className="selected-tag">EN EQUIPO</span>}
                  {blockedIds.includes(getIdFromEntry(entry)) && <span className="selected-tag">Bloqueada: perdió una ronda</span>}
                </button>
              ))}
            </div>
          )}

          <div className="pagination">
            <button type="button" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>← Anterior</button>
            <span>Página {page + 1} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((current) => current + 1)}>Siguiente →</button>
          </div>
        </div>

        <aside className="pokemon-inspector">
          {!inspectedPokemon && <div className="empty-state"><h2>Selecciona un Pokémon</h2><p>Aquí aparecerán sus datos de batalla.</p></div>}
          {inspectedPokemon && (
            <>
              <div className="inspector-hero">
                <img className="inspector-pokemon-sprite" src={inspectedPokemon.sprites?.other?.['official-artwork']?.front_default || inspectedPokemon.sprites?.front_default || '/pokemon-placeholder.svg'} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = '/pokemon-placeholder.svg'; }} alt={inspectedPokemon.name} title={`Volver a escuchar a ${prettyName(inspectedPokemon.name)}`} onClick={() => onInspect(inspectedPokemon.id)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onInspect(inspectedPokemon.id); }} />
                <div>
                  <p className="eyebrow">#{String(inspectedPokemon.id).padStart(4, '0')}</p>
                  <h2>{prettyName(inspectedPokemon.name)}</h2>
                  <div className="type-row">{inspectedPokemon.types.map(({ type }) => <TypeBadge key={type.name} type={type.name} />)}</div>
                </div>
              </div>

              <div className="stat-grid">
                <div><span>Vida</span><strong>{inspectedStats.hp}</strong><small>100 + HP base</small></div>
                <div><span>Poder</span><strong>{inspectedStats.power}</strong><small>75% Atk + 25% SpA</small></div>
                <div><span>Defensa</span><strong>{inspectedStats.defense}</strong><small>Defensa base</small></div>
                <div><span>Velocidad</span><strong>{inspectedStats.speed}</strong><small>Orden del turno</small></div>
                <div><span>Energía</span><strong>100</strong><small>Inicio de combate</small></div>
              </div>

              <div className="action-list">
                <h3>3 acciones automáticas</h3>
                <article className="action-item attack-action">
                  <div><strong>{inspectedActions.attack.name}</strong><TypeBadge type={inspectedActions.attack.type} /></div>
                  <p>Ataque · Poder {inspectedActions.attack.power} · -20 energía</p>
                  <small>Al golpear al rival, el servidor calcula la ventaja según la tabla de tipos.</small>
                </article>
                <article className="action-item defend-action">
                  <div><strong>{inspectedActions.defend.name}</strong><span>DEF</span></div>
                  <p>Defensa · Escudo {inspectedActions.defend.shield} · -15 energía</p>
                </article>
                <article className="action-item heal-action">
                  <div><strong>{inspectedActions.heal.name}</strong><span>+</span></div>
                  <p>Curación · +{inspectedActions.heal.heal} vida · -25 energía</p>
                </article>
              </div>

              <button className="primary-button wide" type="button" disabled={isSelected(inspectedPokemon.id) || selectedTeam.length >= 6 || blockedIds.includes(Number(inspectedPokemon.id))} onClick={() => onSelect(inspectedPokemon.id)}>
                {blockedIds.includes(Number(inspectedPokemon.id)) ? 'Bloqueada: perdió una ronda' : isSelected(inspectedPokemon.id) ? 'Ya está en tu equipo' : selectedTeam.length >= 6 ? 'Equipo completo' : 'Añadir al equipo'}
              </button>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

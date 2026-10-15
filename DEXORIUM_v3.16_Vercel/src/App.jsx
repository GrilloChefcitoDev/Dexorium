// src/App.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import PokedexIntro from './components/PokedexIntro';
import HowToPlay from './components/HowToPlay';
import TeamBuilder from './components/TeamBuilder';
import { getPokemon, getPokemonCatalog, getPokemonTeam } from './services/pokeApi';
import { pokemonToCard, getEffectivenessLabel, getTypeMultiplier, MAX_ENERGY } from '../shared/cardRules';
import { getTransformationOptions } from '../shared/pokemonTransformations.js';
import { getPlayerSessionId, useGameSocket } from './network/useGameSocket';
import { POKEMON_EMOJIS } from './data/pokemonEmojis';
import { AudioProvider, useArenaAudio } from './audio/AudioManager';
import { chooseUniquePokemonIds, recordMatchResultOnce, validateChatMessage } from '../shared/partialRules.js';
import { getFaintedPokemonCount, getWinnerTrainerLabel } from '../shared/spectatorScore.js';
import { getHealthBarClass } from '../shared/healthBar.js';
import { makeOfflineCatalog } from '../shared/offlinePokemon.js';

const STATS_STORAGE_KEY = 'pokemon-arena-results';

const HOTKEY_STORAGE_KEY = 'dexorium-combat-hotkeys';
const DEFAULT_COMBAT_HOTKEYS = { attack: 'z', teraStrike: 'b', defend: 'c', heal: 'x', recover: 'r', switch: 'v', transform: 't', tera: 'g' };
const HOTKEY_ACTIONS = [
  ['attack', 'Atacar', '⚔', 'Realiza el movimiento principal'],
  ['teraStrike', 'Tera Golpe', '✦', 'Usa el movimiento del tipo Tera'],
  ['defend', 'Defender', '◇', 'Protege al objetivo aliado'],
  ['heal', 'Curar', '＋', 'Recupera vida a un aliado'],
  ['recover', 'Recargar energía', 'ϟ', 'Recupera energía'],
  ['switch', 'Cambiar Pokémon', '↔', 'Abre la lista de cambios'],
  ['transform', 'Transformación', '◆', 'Abre las formas disponibles'],
  ['tera', 'Teracristalizar', '✧', 'Abre el selector de tipo Tera'],
];

// Lee los atajos guardados y evita que una configuración vieja asigne dos acciones a la misma tecla.
function readCombatHotkeys() {
  try {
    const saved = JSON.parse(localStorage.getItem(HOTKEY_STORAGE_KEY) || '{}');
    const merged = { ...DEFAULT_COMBAT_HOTKEYS, ...saved };
    const normalized = Object.values(merged).map((key) => String(key).toLowerCase());
    return new Set(normalized).size === normalized.length ? merged : DEFAULT_COMBAT_HOTKEYS;
  } catch {
    return DEFAULT_COMBAT_HOTKEYS;
  }
}

// Actividad 1: Cargar y guardar resultados en localStorage
function loadSavedStats() {
  const empty = { wins: 0, losses: 0, ties: 0, played: 0, recordedMatches: [] };
  try {
    const parsed = JSON.parse(localStorage.getItem(STATS_STORAGE_KEY) || 'null');
    if (!parsed || !['wins', 'losses', 'ties', 'played'].every((key) =>
      Number.isInteger(parsed[key]) && parsed[key] >= 0
    )) return empty;
    return {
      wins: parsed.wins,
      losses: parsed.losses,
      ties: parsed.ties,
      played: parsed.played,
      recordedMatches: Array.isArray(parsed.recordedMatches)
        ? parsed.recordedMatches.filter((id) => typeof id === 'string')
        : [],
    };
  } catch {
    return empty;
  }
}

function pretty(value) {
  return String(value).replace(/-/g, ' ');
}

function TypeBadge({ type }) {
  return <span className={`type-badge type-${type}`}>{type}</span>;
}

function SideLabel({ side }) {
  return <span className={`side-label side-${side}`}>{side === 'A' ? 'Equipo rojo' : 'Equipo azul'}</span>;
}

function DexoriumLogo({ className = '', variant = 'dark' }) {
  const logoSource = variant === 'combat'
    ? '/brand/dexorium-logo-combat.png'
    : variant === 'light' ? '/brand/dexorium-logo-light.png' : '/brand/dexorium-logo.png';
  return (
    <div className={`dexorium-logo-lockup ${className}`}>
      <img src={logoSource} alt="DEXORIUM" />
    </div>
  );
}

function handlePokemonSpriteError(event, fallbackSprite = null) {
  const image = event.currentTarget;
  image.onerror = null;
  image.src = fallbackSprite || '/pokemon-placeholder.svg';
}

function TeamPanel({ team, blockedIds = [], showBlocked = false }) {
  const blocked = new Set((blockedIds || []).map(Number));
  return (
    <div className="battle-team-panel">
      {team.map((pokemon) => {
        const isBlockedForRematch = showBlocked && [pokemon.id, pokemon.baseId, pokemon.formId].some((id) => id != null && blocked.has(Number(id)));
        return (
          <div className={`battle-mini ${pokemon.currentHp <= 0 ? 'fainted' : ''} ${isBlockedForRematch ? 'is-family-blocked' : ''}`} key={pokemon.id}>
            <img src={pokemon.sprite || '/pokemon-placeholder.svg'} alt={pokemon.name} onError={(event) => handlePokemonSpriteError(event, pokemon.baseSprite)} />
            <div>
              <strong>{pretty(pokemon.name)}</strong>
              {pokemon.transformation?.label && <small className="mini-transformation-label">{pokemon.transformation.label}</small>}
              {isBlockedForRematch && <small className="team-blocked-tag">Bloqueado para revancha</small>}
              <div className="hp-track">
                <span className={getHealthBarClass(pokemon.currentHp, pokemon.battleStats.hp)} style={{ width: `${Math.max(0, Math.min(100, pokemon.currentHp / pokemon.battleStats.hp * 100))}%` }} />
              </div>
              <small>{Math.max(0, pokemon.currentHp)} / {pokemon.battleStats.hp}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BattleTeamDots({ player }) {
  return (
    <div className={`battle-team-dots side-${player.side}`} aria-label={`Equipo de ${player.name}`}>
      {player.team.map((pokemon) => (
        <span
          key={pokemon.id}
          className={`${pokemon.currentHp <= 0 ? 'down' : ''} ${pokemon.id === player.activeId ? 'active' : ''}`}
          title={pretty(pokemon.name)}
        />
      ))}
    </div>
  );
}

// Los emojis personalizados se guardan como códigos cortos y aquí se convierten en imágenes pequeñas.
const POKEMON_EMOJI_BY_TOKEN = new Map(POKEMON_EMOJIS.map((emoji) => [emoji.token, emoji]));
const CHAT_EMOJI_PATTERN = /(:[a-z0-9_]+:)/gi;

function renderChatText(text) {
  return String(text || '').split(CHAT_EMOJI_PATTERN).map((part, index) => {
    const emoji = POKEMON_EMOJI_BY_TOKEN.get(part.toLowerCase());
    return emoji
      ? <img key={`${emoji.token}-${index}`} className="chat-inline-emoji" src={emoji.src} alt={`:${emoji.label}:`} title={emoji.label} />
      : part;
  });
}

// Actividad 3: Chat validado (máx 200 caracteres, con hora y scroll automático)
function ChatMessages({ room }) {
  const chatLogs = room?.chatMessages || (room?.logs || []).filter((log) => log.kind === 'chat');

  useEffect(() => {
    const container = document.getElementById('chat-messages-container');
    if (container) container.scrollTop = container.scrollHeight;
  }, [chatLogs.length]);

  return (
    <div className="chat-messages" id="chat-messages-container">
      {chatLogs.length === 0 && <p className="chat-empty">Todavia no hay mensajes.</p>}
      {chatLogs.map((log, index) => (
        <div key={log.id || `${log.time || index}-${index}`} className="chat-line">
          <b className={`chat-author side-${log.authorSide || 'B'}`}>{log.author}:</b>
          <span> {renderChatText(log.text)}</span>
          <small style={{ float: 'right', fontSize: '9px', opacity: 0.6 }}>
            {log.time ? new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </small>
        </div>
      ))}
    </div>
  );
}

// Cada panel flotante tiene su propio tamaño, posición y estado de acople.
// Al ocultarlo se pega al borde más cercano entre arriba, izquierda y derecha (nunca abajo).
function useFloatingWindow({ width: baseWidth, height: baseHeight, initialX, initialY, minWidth = 250, minHeight = 200, initialOpen = true, initialDockEdge = 'right' }) {
  const [open, setOpen] = useState(initialOpen);
  const [dockEdge, setDockEdge] = useState(initialDockEdge);
  const [size, setSize] = useState(() => ({
    width: Math.min(baseWidth, Math.max(minWidth, window.innerWidth - 16)),
    height: Math.min(baseHeight, Math.max(minHeight, window.innerHeight - 16)),
  }));
  const [position, setPosition] = useState(() => ({
    x: Math.max(8, Math.min(typeof initialX === 'function' ? initialX() : initialX, window.innerWidth - baseWidth - 8)),
    y: Math.max(8, Math.min(typeof initialY === 'function' ? initialY() : initialY, window.innerHeight - baseHeight - 8)),
  }));
  const gestureRef = useRef(null);

  useEffect(() => {
    function onPointerMove(event) {
      const gesture = gestureRef.current;
      if (!gesture) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      if (gesture.mode === 'drag') {
        setPosition({
          x: Math.max(0, Math.min(viewportWidth - gesture.width, gesture.left + dx)),
          y: Math.max(0, Math.min(viewportHeight - gesture.height, gesture.top + dy)),
        });
        return;
      }

      let nextWidth = gesture.width;
      let nextHeight = gesture.height;
      let nextX = gesture.left;
      let nextY = gesture.top;
      if (gesture.direction.includes('e')) nextWidth = Math.max(minWidth, Math.min(viewportWidth - nextX - 4, gesture.width + dx));
      if (gesture.direction.includes('w')) {
        nextWidth = Math.max(minWidth, Math.min(gesture.width + gesture.left, gesture.width - dx));
        nextX = gesture.left + gesture.width - nextWidth;
      }
      if (gesture.direction.includes('s')) nextHeight = Math.max(minHeight, Math.min(viewportHeight - nextY - 4, gesture.height + dy));
      if (gesture.direction.includes('n')) {
        nextHeight = Math.max(minHeight, Math.min(gesture.height + gesture.top, gesture.height - dy));
        nextY = gesture.top + gesture.height - nextHeight;
      }
      setSize({ width: nextWidth, height: nextHeight });
      setPosition({
        x: Math.max(0, Math.min(viewportWidth - nextWidth, nextX)),
        y: Math.max(0, Math.min(viewportHeight - nextHeight, nextY)),
      });
    }
    function stopGesture() { gestureRef.current = null; }
    function onViewportResize() {
      setSize((current) => ({
        width: Math.min(current.width, Math.max(minWidth, window.innerWidth - 16)),
        height: Math.min(current.height, Math.max(minHeight, window.innerHeight - 16)),
      }));
      setPosition((current) => ({
        x: Math.max(0, Math.min(current.x, window.innerWidth - size.width)),
        y: Math.max(0, Math.min(current.y, window.innerHeight - size.height)),
      }));
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopGesture);
    window.addEventListener('pointercancel', stopGesture);
    window.addEventListener('resize', onViewportResize);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopGesture);
      window.removeEventListener('pointercancel', stopGesture);
      window.removeEventListener('resize', onViewportResize);
    };
  }, [minWidth, minHeight, size.width, size.height]);

  function beginDrag(event) {
    if (event.button !== 0 || !open) return;
    event.preventDefault();
    gestureRef.current = { mode: 'drag', startX: event.clientX, startY: event.clientY, left: position.x, top: position.y, width: size.width, height: size.height };
  }

  function beginResize(event, direction) {
    if (event.button !== 0 || !open) return;
    event.preventDefault();
    event.stopPropagation();
    gestureRef.current = { mode: 'resize', direction, startX: event.clientX, startY: event.clientY, left: position.x, top: position.y, width: size.width, height: size.height };
  }

  function hide() {
    const distances = [
      { edge: 'top', distance: Math.max(0, position.y) },
      { edge: 'left', distance: Math.max(0, position.x) },
      { edge: 'right', distance: Math.max(0, window.innerWidth - position.x - size.width) },
    ].sort((a, b) => a.distance - b.distance);
    const edge = distances[0].edge;
    const tabWidth = edge === 'top' ? 128 : (window.innerWidth <= 560 ? 96 : 112);
    const tabHeight = edge === 'top' ? 34 : 36;
    let x = position.x;
    let y = position.y;
    if (edge === 'top') {
      // Las pestañas se quedan en una esquina; así no tapan las cartas ni los botones de combate.
      const nearLeftCorner = position.x + size.width / 2 < window.innerWidth / 2;
      x = nearLeftCorner ? 8 : window.innerWidth - tabWidth - 8;
      y = 4;
    } else if (edge === 'left') {
      x = 0;
      y = 132;
    } else {
      x = Math.max(0, window.innerWidth - tabWidth);
      y = 132;
    }
    setDockEdge(edge);
    setPosition({ x, y });
    setOpen(false);
  }

  function show() {
    let x = position.x;
    let y = position.y;
    if (dockEdge === 'top') y = 44;
    if (dockEdge === 'left') x = 50;
    if (dockEdge === 'right') x = window.innerWidth - size.width - 50;
    setPosition({
      x: Math.max(0, Math.min(window.innerWidth - size.width, x)),
      y: Math.max(0, Math.min(window.innerHeight - size.height, y)),
    });
    setOpen(true);
  }

  const style = open
    ? { top: `${position.y}px`, left: `${position.x}px`, width: `${size.width}px`, height: `${size.height}px` }
    : {
      top: `${dockEdge === 'top' ? 4 : 132}px`,
      left: `${dockEdge === 'left' ? 0 : dockEdge === 'right' ? Math.max(0, window.innerWidth - 38) : (position.x + size.width / 2 < window.innerWidth / 2 ? 8 : Math.max(8, window.innerWidth - 136))}px`,
      width: dockEdge === 'top' ? '128px' : '38px',
      height: dockEdge === 'top' ? '34px' : '98px',
    };
  return { open, dockEdge, size, position, style, beginDrag, beginResize, hide, show };
}

function FloatingResizeHandles({ onResize }) {
  return ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'].map((direction) => (
    <button key={direction} className={`floating-resize-edge resize-${direction}`} type="button" aria-label={`Redimensionar ventana ${direction}`} title="Arrastra cualquier borde o esquina para ajustar el tamaño" onPointerDown={(event) => onResize(event, direction)} />
  ));
}

function FloatingWindowTab({ edge, onClick, label }) {
  return <button className={`floating-dock-tab dock-tab-${edge}`} type="button" onClick={onClick}>{label}</button>;
}

function BattleSidebar({ room }) {
  const floating = useFloatingWindow({ width: 350, height: 390, initialX: () => window.innerWidth - 368, initialY: 72, minWidth: 270, minHeight: 190, initialOpen: !['battle', 'finished'].includes(room.phase), initialDockEdge: 'right' });
  useEffect(() => {
    const toggle = () => { if (floating.open) floating.hide(); else floating.show(); };
    window.addEventListener('dexorium:toggle-log', toggle);
    return () => window.removeEventListener('dexorium:toggle-log', toggle);
  }, [floating.open, floating.hide, floating.show]);
  const [minimized, setMinimized] = useState({ combat: false, actions: false });
  const combatLogs = (room?.logs || []).filter((log) => log.kind !== 'chat').slice(-60);
  const toggleSection = (section) => setMinimized((current) => ({ ...current, [section]: !current[section] }));

  return (
    <aside className={`floating-battle-window ${floating.open ? 'is-open' : `is-docked dock-${floating.dockEdge}`}`} style={floating.style}>
      {floating.open ? <>
        <header className="floating-window-titlebar">
          <div className="floating-drag-handle" onPointerDown={floating.beginDrag} title="Arrastra desde cualquier parte de esta barra para mover la ventana"><span>⠿</span><b>Turnos y acciones</b><small>mover</small></div>
          <button type="button" className="floating-window-minimize" onClick={floating.hide} aria-label="Ocultar ventana de combate" title="Ocultar y acoplar al borde">—</button>
        </header>
        <div className="battle-sidebar-content">
          <section className={`battle-info-box ${minimized.combat ? 'section-is-minimized' : ''}`}>
            <div className="sidebar-title-row">
              <h2>Combate</h2>
              <span className="turn-pill">Turno {room.turn}</span>
              <button className="section-minimize-button" type="button" onClick={() => toggleSection('combat')} aria-label={minimized.combat ? 'Expandir combate' : 'Minimizar combate'}>{minimized.combat ? '+' : '−'}</button>
            </div>
            {!minimized.combat && room.players.map((player) => (
              <div className="sidebar-player" key={player.id}>
                <div><strong className={`side-name side-${player.side}`}>{player.name}</strong><SideLabel side={player.side} />
                  <small className={`afk-counter ${(player.afkTurns || 0) > 0 ? 'is-afk' : ''}`}>AFK {player.afkTurns || 0}/3</small>
                </div>
                <span>{player.team.filter((pokemon) => pokemon.currentHp > 0).length}/{player.team.length}</span>
              </div>
            ))}
          </section>
          <section className={`battle-log-box ${minimized.actions ? 'section-is-minimized' : ''}`}>
            <div className="sidebar-title-row"><h2>Registro de acciones</h2><button className="section-minimize-button" type="button" onClick={() => toggleSection('actions')} aria-label={minimized.actions ? 'Expandir acciones' : 'Minimizar acciones'}>{minimized.actions ? '+' : '−'}</button></div>
            {!minimized.actions && <div className="battle-log">
              {combatLogs.length === 0 && <p className="chat-empty">Esperando la primera jugada.</p>}
              {combatLogs.map((log, index) => (
                <p className={log.kind === 'choice' ? 'battle-log-choice' : ''} key={`${log.time || index}-${index}`}>
                  {log.author && <b className={`log-author side-${log.authorSide || 'B'}`}>{log.author}</b>}
                  <span>{log.author ? ` ${log.text}` : log.text}</span>
                </p>
              ))}
            </div>}
          </section>
        </div>
        <FloatingResizeHandles onResize={floating.beginResize} />
      </> : <FloatingWindowTab edge={floating.dockEdge} onClick={floating.show} label="Turnos" />}
    </aside>
  );
}

function ChatWindow({ room, send }) {
  const floating = useFloatingWindow({ width: 350, height: 430, initialX: 8, initialY: 132, minWidth: 285, minHeight: 230, initialOpen: !['battle', 'finished'].includes(room.phase), initialDockEdge: 'left' });
  const previousPhaseRef = useRef(room.phase);
  const chatWindowStyle = floating.open
    ? { top: '132px', left: '8px', width: 'min(350px, calc(100vw - 16px))', height: 'min(430px, calc(100vh - 150px))' }
    : { top: '132px', left: '0px', width: '38px', height: '98px' };

  // Al entrar al combate el chat queda como una pestaña al lado; abrirlo no lo vuelve movible.
  useEffect(() => {
    const wasPreparing = !['battle', 'finished'].includes(previousPhaseRef.current);
    const isInCombat = ['battle', 'finished'].includes(room.phase);
    if (wasPreparing && isInCombat && floating.open) floating.hide();
    previousPhaseRef.current = room.phase;
  }, [room.phase]);

  useEffect(() => {
    const toggle = () => { if (floating.open) floating.hide(); else floating.show(); };
    window.addEventListener('dexorium:toggle-chat', toggle);
    return () => window.removeEventListener('dexorium:toggle-chat', toggle);
  }, [floating.open, floating.hide, floating.show]);
  const [message, setMessage] = useState('');
  const [chatError, setChatError] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const standardEmojis = ['😀', '😂', '😅', '😍', '😎', '😭', '😱', '🤔', '👍', '👎', '❤️', '💥', '✨', '🔥', '⚡', '💧', '🌿', '🛡️', '🏆', '🎮', '⚔️', '💤', '🙌', '🥹', '💚', '🎉', '👀', '💯'];

  function submit(event) {
    event.preventDefault();
    let value;
    try {
      value = validateChatMessage(message);
    } catch (error) {
      setChatError(error.message || 'Escribe un mensaje de 1 a 200 caracteres.');
      return;
    }
    if (!send({ type: 'CHAT_MESSAGE', message: value })) {
      setChatError('No hay conexión con el servidor. Intenta de nuevo.');
      return;
    }
    setChatError('');
    setMessage('');
    setEmojiOpen(false);
  }

  function addEmoji(value) {
    setMessage((current) => current.length + value.length <= 200 ? `${current}${value}` : current);
  }

  return (
    <aside className={`floating-chat-window ${floating.open ? 'is-open' : `is-docked dock-${floating.dockEdge}`}`} style={chatWindowStyle}>
      {floating.open ? <>
        <header className="floating-window-titlebar chat-window-titlebar chat-fixed-titlebar">
          <div className="chat-fixed-heading"><span aria-hidden="true">💬</span><b>Chat de la sala</b><small>en vivo</small></div>
          <button type="button" className="floating-window-minimize" onClick={floating.hide} aria-label="Minimizar chat" title="Minimizar chat al borde">—</button>
        </header>
        <ChatMessages room={room} />
        {chatError && <p className="error-banner chat-error-banner" role="alert">{chatError}</p>}
        {emojiOpen && (
          <div className="chat-emoji-picker" role="group" aria-label="Elegir emoji">
            {POKEMON_EMOJIS.map((emoji) => (
              <button className="custom-emoji-option" key={emoji.token} type="button" title={emoji.label} aria-label={`Añadir ${emoji.label}`} onClick={() => addEmoji(emoji.token)}>
                <img src={emoji.src} alt="" loading="lazy" />
              </button>
            ))}
            {standardEmojis.map((emoji) => <button className="standard-emoji-option" key={emoji} type="button" onClick={() => addEmoji(emoji)} aria-label={`Añadir ${emoji}`}>{emoji}</button>)}
          </div>
        )}
        <form onSubmit={submit} className="chat-form">
          <button className="chat-emoji-toggle" type="button" aria-label="Mostrar emojis" title="Emojis" onClick={() => setEmojiOpen((value) => !value)}>😊</button>
          <input value={message} onChange={(event) => { setMessage(event.target.value); setChatError(''); }} placeholder="Escribe un mensaje (máx 200)..." maxLength={400} />
          <button type="submit">Enviar</button>
        </form>
      </> : <FloatingWindowTab edge="left" onClick={floating.show} label="Chat" />}
    </aside>
  );
}


// Los atajos se pueden preparar antes de entrar al combate; quedan guardados en este navegador.
function HotkeySettingsModal({ onClose }) {
  const [hotkeys, setHotkeys] = useState(readCombatHotkeys);
  const [capturing, setCapturing] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    function onKeyDown(event) {
      if (capturing) {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Escape') {
          setCapturing('');
          setMessage('Cambio cancelado.');
          return;
        }
        if (event.key.length !== 1 || event.key === ' ') {
          setMessage('Elige una letra o número para que el atajo sea fácil de usar.');
          return;
        }
        const nextKey = event.key.toLowerCase();
        const conflict = Object.entries(hotkeys).find(([action, bound]) => action !== capturing && String(bound).toLowerCase() === nextKey);
        if (conflict) {
          const actionLabel = HOTKEY_ACTIONS.find(([key]) => key === conflict[0])?.[1] || conflict[0];
          setMessage(`La tecla ${nextKey.toUpperCase()} ya está asignada a “${actionLabel}”.`);
          return;
        }
        const next = { ...hotkeys, [capturing]: nextKey };
        setHotkeys(next);
        try { localStorage.setItem(HOTKEY_STORAGE_KEY, JSON.stringify(next)); } catch { /* Se mantiene durante esta sesión. */ }
        setCapturing('');
        setMessage('Atajo guardado.');
        return;
      }
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [capturing, hotkeys, onClose]);

  function resetHotkeys() {
    setHotkeys(DEFAULT_COMBAT_HOTKEYS);
    setCapturing('');
    setMessage('Atajos originales restaurados.');
    try { localStorage.setItem(HOTKEY_STORAGE_KEY, JSON.stringify(DEFAULT_COMBAT_HOTKEYS)); } catch { /* Se conserva para esta sesión. */ }
  }

  return (
    <div className="hotkey-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !capturing) onClose(); }}>
      <section className="hotkey-modal" role="dialog" aria-modal="true" aria-labelledby="global-hotkeys-title">
        <header className="hotkey-modal-heading">
          <span className="hotkey-modal-mark" aria-hidden="true">⌨</span>
          <div><p className="eyebrow">CONTROLES PERSONALES</p><h2 id="global-hotkeys-title">Configurar teclas</h2><p>Elige los atajos con calma antes de empezar la pelea. Se guardan en este navegador.</p></div>
          <button type="button" className="hotkey-modal-close" onClick={onClose} aria-label="Cerrar configuración">×</button>
        </header>
        <div className="hotkey-modal-grid">
          {HOTKEY_ACTIONS.map(([key, label, icon, description]) => (
            <article className={`hotkey-config-card ${capturing === key ? 'is-listening' : ''}`} key={key}>
              <span className="hotkey-config-icon" aria-hidden="true">{icon}</span>
              <div className="hotkey-config-copy"><strong>{label}</strong><small>{description}</small></div>
              <button type="button" className="hotkey-config-key" onClick={() => { setCapturing(key); setMessage(`Pulsa la tecla para “${label}”. Esc cancela.`); }} aria-label={`Cambiar tecla de ${label}`}>
                {capturing === key ? 'Pulsa…' : <kbd>{String(hotkeys[key] || DEFAULT_COMBAT_HOTKEYS[key]).toUpperCase()}</kbd>}
              </button>
            </article>
          ))}
        </div>
        <footer className="hotkey-modal-footer">
          <span role="status" aria-live="polite">{message || 'No se permiten dos acciones con la misma tecla.'}</span>
          <div><button type="button" className="hotkey-reset" onClick={resetHotkeys}>Restablecer</button><button type="button" className="primary-button" onClick={onClose}>Listo</button></div>
        </footer>
      </section>
    </div>
  );
}

// Actividad 1: Panel de Resultados
function ResultsPanel({ stats, onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="results-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="results-floating-panel" role="dialog" aria-modal="true" aria-labelledby="results-title">
        <div className="results-floating-heading">
          <div><p className="eyebrow">ESTADÍSTICA LOCAL</p><h2 id="results-title">Mis resultados</h2></div>
          <button className="results-close-button" type="button" onClick={onClose} aria-label="Cerrar resultados">×</button>
        </div>
        <div className="results-compact-grid">
          <div><span>Victorias</span><strong className="result-win">{stats.wins}</strong></div>
          <div><span>Derrotas</span><strong className="result-loss">{stats.losses}</strong></div>
          <div><span>Empates</span><strong className="result-tie">{stats.ties}</strong></div>
          <div><span>Partidas jugadas</span><strong>{stats.played}</strong></div>
        </div>
        <button className="secondary-button wide" type="button" onClick={onClose}>Cerrar</button>
      </section>
    </div>
  );
}

function RoomLobby({ playerName, setPlayerName, selectedTeam, rooms, onCreate, onJoin, onSpectate, onRefresh, currentRoom, onLeave, socketConnected, onOpenStats, onOpenGuide, blockedIds, send }) {
  const [mode, setMode] = useState('solo');
  const [visibility, setVisibility] = useState('public');
  const [password, setPassword] = useState('');
  const [roomCode, setRoomCode] = useState(() => new URLSearchParams(window.location.search).get('room')?.toUpperCase() || '');
  const [joinPassword, setJoinPassword] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [side, setSide] = useState('A');

  async function copyRoomText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setShareStatus(`${label} copiado al portapapeles.`);
    } catch {
      setShareStatus(`No se pudo copiar automáticamente. Copia este texto: ${text}`);
    }
  }

  if (currentRoom) {
    const minPlayers = currentRoom.mode === 'duos' ? 4 : 2;
    return (
      <section className="room-screen">
        <header className="retro-header compact">
          <div>
            <p className="eyebrow">SALA · {currentRoom.code}</p>
            <h1>{currentRoom.mode === 'duos' ? 'Batalla DUOS' : 'Batalla 1v1'}</h1>
            <p>{currentRoom.visibility === 'private' ? 'Privada' : 'Publica'} · {currentRoom.players.length}/{currentRoom.maxPlayers} jugadores</p>
          </div>
          <button className="secondary-button" type="button" onClick={onLeave}>Salir</button>
        </header>

        <div className="room-code-card">
          <span>CODIGO DE SALA</span>
          <strong>{currentRoom.code}</strong>
          <small>Comparte este código con el rival. La pelea empieza cuando estén todos.</small>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '10px' }}>
            <button className="secondary-button" type="button" onClick={() => copyRoomText(currentRoom.code, 'Código')}>Copiar código</button>
            <button className="secondary-button" type="button" onClick={() => copyRoomText(`${window.location.origin}${window.location.pathname}?room=${currentRoom.code}`, 'Enlace de sala')}>Copiar enlace de sala</button>
          </div>
          {shareStatus && <p role="status" className="muted">{shareStatus}</p>}
        </div>

        <div className="room-grid">
          <section className="room-players">
            <h2>Jugadores</h2>
            {currentRoom.players.map((player) => (
              <div className="room-player" key={player.id}>
                <div>
                  <strong className={`side-name side-${player.side}`}>{player.name}</strong>
                  <span>Equipo {player.side === 'A' ? 'Rojo' : 'Azul'}</span>
                </div>
                <div className="connected-badge">CONECTADO</div>
              </div>
            ))}
            {currentRoom.players.length < minPlayers && <p className="muted">Esperando jugadores... faltan {minPlayers - currentRoom.players.length}.</p>}
            {currentRoom.players.length >= minPlayers && <p className="room-ready-text">Todos conectados. Preparando combate...</p>}
          </section>

          <section className="room-rules">
            <h2>Tu equipo actual ({selectedTeam.length}/6)</h2>
            <TeamPanel team={currentRoom.me?.team || selectedTeam.map((pokemon) => ({ ...pokemon, currentHp: pokemon.battleStats.hp }))} />
            {blockedIds.length > 0 && <p style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '8px' }}>Tienes {blockedIds.length} Pokémon bloqueados por caer en combate.</p>}
          </section>
        </div>
        <BattleSidebar room={currentRoom} />
        <ChatWindow room={currentRoom} send={send} />
      </section>
    );
  }

  return (
    <section className="room-screen">
      <header className="retro-header compact">
        <div>
          <p className="eyebrow">WEBSOCKET · SALAS EN RED</p>
          <h1>Centro de combate</h1>
          <p>Crea una sala o únete a una partida pública.</p>
        </div>
        <div className="room-header-actions">
          <button className="secondary-button" type="button" onClick={onOpenStats}>Mis Resultados</button>
          <div className={`connection-pill ${socketConnected ? 'online' : 'offline'}`}><span />{socketConnected ? 'Conectado' : 'Desconectado'}</div>
        </div>
      </header>

      <div className="room-builder-grid">
        <section className="room-create-card">
          <h2>Crear sala</h2>
          <label>Tu nombre<input value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={18} /></label>
          <div className="two-cols">
            <label>Modalidad<select value={mode} onChange={(event) => setMode(event.target.value)}><option value="solo">1v1</option><option value="duos">DUOS · 2v2</option></select></label>
            <label>Visibilidad<select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="public">Publica</option><option value="private">Privada</option></select></label>
          </div>
          <label>Contraseña opcional<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Vacia = sin contraseña" maxLength={30} /></label>
          {mode === 'duos' && <label>Mi lado<select value={side} onChange={(event) => setSide(event.target.value)}><option value="A">Equipo A · Rojo</option><option value="B">Equipo B · Azul</option></select></label>}
          <button className="primary-button wide" type="button" onClick={() => onCreate({ name: playerName, mode, visibility, password, side })} disabled={!playerName.trim() || !socketConnected || selectedTeam.length !== 6}>Crear sala (Requiere 6 Pokémon)</button>
        </section>

        <section className="public-rooms-card">
          <div className="section-title"><h2>Salas públicas</h2><button type="button" className="ghost-button" onClick={onRefresh}>Actualizar</button></div>
          {rooms.length === 0 && <p className="muted">No hay salas publicas disponibles.</p>}
          {rooms.map((listedRoom) => (
            <article key={listedRoom.code} className={`public-room-row ${listedRoom.phase === 'battle' ? 'public-room-row-live' : ''}`}>
              <div><strong>{listedRoom.code}</strong><span>{listedRoom.mode === 'duos' ? 'DUOS' : '1v1'} · {listedRoom.players}/{listedRoom.maxPlayers} · {listedRoom.phase === 'battle' ? `En combate · turno ${listedRoom.turn || 1} · ${listedRoom.spectators || 0} mirando` : (listedRoom.protected ? 'Protegida' : 'Sin contraseña')}</span></div>
              {listedRoom.phase === 'battle'
                ? <button className="secondary-button spectate-room-button" type="button" onClick={() => onSpectate(listedRoom.code)}>Ver combate</button>
                : <button className="secondary-button" type="button" onClick={() => { setRoomCode(listedRoom.code); setJoinPassword(''); }}>Seleccionar</button>}
            </article>
          ))}
          <label>Codigo<input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="ABCDE" maxLength={5} /></label>
          <label>Contraseña<input value={joinPassword} onChange={(event) => setJoinPassword(event.target.value)} type="password" placeholder="Si la sala tiene" /></label>
          <label>Mi lado en DUOS<select value={side} onChange={(event) => setSide(event.target.value)}><option value="A">Equipo A · Rojo</option><option value="B">Equipo B · Azul</option></select></label>
          <button className="primary-button wide" type="button" onClick={() => onJoin({ code: roomCode, password: joinPassword, side, name: playerName })} disabled={!playerName.trim() || !roomCode || !socketConnected || selectedTeam.length !== 6}>Entrar a la sala</button>
        </section>
      </div>

      <div className="rooms-guide-row">
        <div>
          <strong>¿Primera vez en DEXORIUM?</strong>
          <p>Consulta cómo crear una sala, elegir equipo y jugar tu primer combate.</p>
        </div>
        <button className="secondary-button rooms-guide-button" type="button" onClick={onOpenGuide} aria-haspopup="dialog">
          📘 Cómo jugar y participar
        </button>
      </div>
    </section>
  );
}

// Preparación de revancha: la selección completa se hace desde la misma galería que al inicio.
function RematchLobby({ room, playerId, selectedTeam, blockedIds, onOpenGallery, onCancelRematch, send }) {
  const me = room.players.find((p) => p.id === playerId);
  const confirmed = Boolean(me?.rematchConfirmed);
  const [blockedNames, setBlockedNames] = useState([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(blockedIds.map(async (id) => {
      try {
        const pokemon = await getPokemon(id);
        return { id, name: pokemon.name };
      } catch {
        return { id, name: `Pokémon #${id}` };
      }
    })).then((items) => { if (!cancelled) setBlockedNames(items); });
    return () => { cancelled = true; };
  }, [blockedIds.join(',')]);

  return (
    <section className="room-screen rematch-preparation-screen" style={{ textAlign: 'center', padding: '40px 24px' }}>
      <div className="victory-panel" style={{ maxWidth: '780px', margin: '0 auto' }}>
        <p className="eyebrow">SALA · {room.code}</p>
        <h1>Preparar Revancha</h1>
        <p>Vuelve a la galería para elegir los 6 Pokémon. Los bloqueados aparecerán apagados en rojo y no podrán añadirse a tu equipo.</p>

        <div className="rematch-gallery-preview">
          {selectedTeam.length ? (
            <>
              <strong>Equipo preparado: {selectedTeam.length}/6</strong>
              <div className="rematch-team-preview">
                {selectedTeam.map((pokemon) => (
                  <div key={pokemon.id} className="rematch-team-preview-card">
                    <img src={pokemon.sprite || pokemon.image || '/pokemon-placeholder.svg'} alt={pokemon.name} onError={(event) => handlePokemonSpriteError(event, pokemon.baseSprite)} />
                    <span>{pretty(pokemon.name)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <p>Aún no has seleccionado el equipo para la revancha.</p>}
        </div>

        {confirmed ? (
          <p className="turn-message">✅ Equipo confirmado. Esperando al otro jugador…</p>
        ) : (
          <button className="primary-button wide rematch-gallery-button" type="button" onClick={onOpenGallery}>
            📖 Elegir Pokémon en la galería {selectedTeam.length ? `(${selectedTeam.length}/6)` : ''}
          </button>
        )}
        <button className="cancel-rematch-button" type="button" onClick={onCancelRematch}>Cancelar revancha y volver a la galería</button>

        <section style={{ marginTop: '22px', textAlign: 'left' }}>
          <h3>Pokémon bloqueados para ti en esta sala</h3>
          {blockedNames.length === 0
            ? <p style={{ opacity: .75 }}>Todavía no tienes Pokémon bloqueados.</p>
            : <div className="blocked-list">
                {blockedNames.map((item) => <span key={item.id} className="blocked-chip">🚫 {pretty(item.name)} · #{item.id} — Bloqueado: cayó en combate</span>)}
              </div>}
        </section>
      </div>
      <BattleSidebar room={room} />
      <ChatWindow room={room} send={send} />
    </section>
  );
}

function TurnTimer({ turnStartedAt, durationMs = 45_000, hasSubmitted = false }) {
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(durationMs / 1000));

  useEffect(() => {
    const update = () => {
      const start = Number(turnStartedAt) || Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(durationMs / 1000) - Math.floor((Date.now() - start) / 1000)));
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [turnStartedAt, durationMs]);

  const totalSeconds = Math.max(1, Math.ceil(durationMs / 1000));
  const progress = Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100));
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const seconds = String(secondsLeft % 60).padStart(2, '0');
  return (
    <div className={`turn-timer-card ${secondsLeft <= 8 ? 'is-low' : ''} ${hasSubmitted ? 'is-waiting' : 'is-ready'}`} aria-live="polite" title="Todos eligen su acción dentro del mismo turno">
      <div className="turn-timer-label"><b>{hasSubmitted ? 'ESPERANDO RESOLUCIÓN' : 'TU JUGADA'}</b><strong>{secondsLeft === 0 ? 'Acción automática…' : `${minutes}:${seconds}`}</strong></div>
      <div className="turn-timer-track"><span style={{ width: `${progress}%` }} /></div>
    </div>
  );
}

// Los efectos llegan desde el servidor con un ID único para que cada sonido se reproduzca una sola vez por navegador.
function BattleAudioEvents({ room }) {
  const { playBattleEffect } = useArenaAudio();
  const handledIds = useRef(new Set());
  useEffect(() => {
    for (const effect of room.effects || []) {
      if (!effect?.id || handledIds.current.has(effect.id)) continue;
      handledIds.current.add(effect.id);
      playBattleEffect(effect);
    }
    if (handledIds.current.size > 300) handledIds.current = new Set([...handledIds.current].slice(-160));
  }, [room.effects, playBattleEffect]);
  return null;
}


// La vista de espectador muestra lo que pasa en el campo sin permitir acciones de combate.
// El registro y el chat siguen disponibles para comentar la partida en directo.
function SpectatorScreen({ room, onLeave, send }) {
  const playersA = room.players.filter((player) => player.side === 'A');
  const playersB = room.players.filter((player) => player.side === 'B');
  const faintedA = getFaintedPokemonCount(room.players, 'A');
  const faintedB = getFaintedPokemonCount(room.players, 'B');
  const winnerLabel = getWinnerTrainerLabel(room);

  function renderSpectatorFighter(player) {
    const displayId = player.activeId || player.lastActiveId || player.team[0]?.id;
    const pokemon = player.team.find((entry) => Number(entry.id) === Number(displayId)) || player.team[0];
    if (!pokemon) return null;
    const alive = Boolean(player.activeId && Number(player.activeId) === Number(pokemon.id) && pokemon.currentHp > 0);
    return (
      <article className={`spectator-fighter-card side-${player.side} ${alive ? '' : 'is-fainted'}`} key={player.id}>
        <header><strong>{player.name}</strong><span>{player.side === 'A' ? 'Equipo rojo' : 'Equipo azul'}</span></header>
        <img src={pokemon.sprite || '/pokemon-placeholder.svg'} alt={pokemon.name} onError={(event) => handlePokemonSpriteError(event, pokemon.baseSprite)} />
        <div className="spectator-pokemon-name">{pretty(pokemon.name)}</div>
        {pokemon.transformation?.label && <small className="spectator-form-label">{pokemon.transformation.label}</small>}
        {!alive && <small className="spectator-fainted-label">Debilitado · esperando cambio</small>}
        <div className="spectator-hp-track"><span className={getHealthBarClass(pokemon.currentHp, pokemon.battleStats?.hp || 1)} style={{ width: `${Math.max(0, Math.min(100, pokemon.currentHp / Math.max(1, pokemon.battleStats?.hp || 1) * 100))}%` }} /></div>
        <div className="spectator-vitals"><span>{Math.max(0, pokemon.currentHp)} / {pokemon.battleStats?.hp || 0} HP</span><span>⚡ {pokemon.energy ?? 0}</span></div>
        {pokemon.shield > 0 && <small className="spectator-shield">Escudo {pokemon.shield}</small>}
        <div className="spectator-bench" aria-label={`Equipo completo de ${player.name}`}>
          {player.team.map((member) => <span key={member.id} className={`${member.currentHp <= 0 ? 'down' : ''} ${Number(member.id) === Number(player.activeId) ? 'active' : ''}`} title={`${pretty(member.name)} · ${Math.max(0, member.currentHp)}/${member.battleStats?.hp || 0} HP`}>{pretty(member.name)}</span>)}
        </div>
      </article>
    );
  }

  return (
    <section className="battle-screen spectator-screen">
      <BattleAudioEvents room={room} />
      <header className="showdown-topbar spectator-topbar">
        <div className="showdown-brand"><DexoriumLogo /></div>
        <div className="showdown-room"><strong>{room.code}</strong><span>OBSERVANDO · {room.mode === 'duos' ? 'DUOS 2v2' : '1v1'} · Turno {room.turn}</span>{room.phase === 'battle' && <TurnTimer turnStartedAt={room.turnStartedAt} durationMs={room.turnDurationMs} />}</div>
        <div className="showdown-topbar-actions"><span className="spectator-count-pill">◉ {room.spectatorCount || 1} mirando</span><button type="button" className="secondary-button" onClick={onLeave}>Dejar de mirar</button></div>
      </header>
      {room.phase === 'finished' && <div className="spectator-finished-note"><strong>{room.winnerSide ? `¡Victoria para ${winnerLabel}!` : '¡Empate!'}</strong><span>Marcador final: {faintedA}–{faintedB} Pokémon debilitados.</span></div>}
      <div className={`spectator-field ${room.mode === 'duos' ? 'spectator-field-duos' : ''}`}>
        <div className="spectator-scoreboard" aria-label="Marcador de Pokémon debilitados">
          <div className="spectator-score-team score-red"><span>Equipo rojo</span><strong>{faintedA}</strong></div>
          <div className="spectator-score-caption"><b>POKÉMON</b><span>DEBILITADOS</span><small>Turno {room.turn}</small></div>
          <div className="spectator-score-team score-blue"><span>Equipo azul</span><strong>{faintedB}</strong></div>
        </div>
        <section className="spectator-side spectator-side-A"><h2>Equipo rojo</h2><div className="spectator-side-grid">{playersA.map(renderSpectatorFighter)}</div></section>
        <div className="spectator-vs">VS <small>TURNO {room.turn}</small></div>
        <section className="spectator-side spectator-side-B"><h2>Equipo azul</h2><div className="spectator-side-grid">{playersB.map(renderSpectatorFighter)}</div></section>
      </div>
      <p className="spectator-footnote">Estás viendo la partida en directo. Puedes escribir en el chat y consultar el registro, pero no enviar jugadas.</p>
      <BattleSidebar room={room} />
      <ChatWindow room={room} send={send} />
    </section>
  );
}

function BattleScreen({ room, playerId, send, onLeave, onRequestRematch, onAcceptRematch, onRejectRematch, onCancelRematch, onSurrender }) {
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [selectedSupportTarget, setSelectedSupportTarget] = useState(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState(null);
  const [transformPickerOpen, setTransformPickerOpen] = useState(false);
  const [selectedTransformKey, setSelectedTransformKey] = useState(null);
  const [teraPickerOpen, setTeraPickerOpen] = useState(false);
  const [selectedTeraType, setSelectedTeraType] = useState('');
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [capturingHotkey, setCapturingHotkey] = useState('');
  const [hotkeyMessage, setHotkeyMessage] = useState('');
  const [hotkeys, setHotkeys] = useState(readCombatHotkeys);
  const [cardMotions, setCardMotions] = useState([]);
  const seenMotionIdsRef = useRef(new Set((room.effects || []).map((effect) => effect?.id).filter(Boolean)));

  useEffect(() => {
    const fresh = (room.effects || []).filter((effect) => effect?.id && !seenMotionIdsRef.current.has(effect.id));
    if (!fresh.length) return;
    fresh.forEach((effect) => seenMotionIdsRef.current.add(effect.id));
    setCardMotions((current) => [...current, ...fresh].slice(-20));
    fresh.forEach((effect) => {
      window.setTimeout(() => setCardMotions((current) => current.filter((item) => item.id !== effect.id)), 900);
    });
  }, [room.effects]);

  useEffect(() => {
    try { localStorage.setItem('dexorium-combat-hotkeys', JSON.stringify(hotkeys)); } catch { /* Las teclas siguen activas durante esta sesión. */ }
  }, [hotkeys]);


  function motionFor(pokemon, side, role, ownerId) {
    const matching = cardMotions.filter((effect) => {
      const actorMatches = effect.side === side
        && Number(effect.pokemonId) === Number(pokemon.id)
        && (!effect.actorPlayerId || effect.actorPlayerId === ownerId);
      const targetMatches = effect.targetSide === side
        && Number(effect.targetPokemonId) === Number(pokemon.id)
        && (!effect.targetPlayerId || effect.targetPlayerId === ownerId);
      if (effect.kind === 'attack') return actorMatches || targetMatches;
      if (effect.targetPokemonId != null) return targetMatches || actorMatches;
      return actorMatches;
    });
    const effect = matching[matching.length - 1];
    if (!effect) return { className: '', key: `${ownerId}-${pokemon.id}-idle` };
    if (effect.kind === 'attack') {
      const isAttacker = effect.side === side && Number(effect.pokemonId) === Number(pokemon.id)
        && (!effect.actorPlayerId || effect.actorPlayerId === ownerId);
      return isAttacker
        ? { className: `motion-attack motion-attack-${role}`, key: `${ownerId}-${pokemon.id}-${effect.id}` }
        : { className: `motion-hit motion-hit-${role}`, key: `${ownerId}-${pokemon.id}-${effect.id}` };
    }
    const isTarget = effect.targetPokemonId != null && Number(effect.targetPokemonId) === Number(pokemon.id)
      && (!effect.targetPlayerId || effect.targetPlayerId === ownerId);
    return { className: `motion-${effect.kind}${isTarget ? ' motion-target' : ''}`, key: `${ownerId}-${pokemon.id}-${effect.id}` };
  }

  const me = room.players.find((player) => player.id === playerId);
  const winnerTrainerLabel = getWinnerTrainerLabel(room);
  const enemies = room.players.filter((player) => player.side !== me?.side);
  const allies = room.players.filter((player) => player.side === me?.side);
  const active = me?.team.find((pokemon) => pokemon.id === me.activeId);
  const teamTransformationUsage = room.transformationUsage?.[me?.side] || { dynamaxUsed: false, gigantamaxUsed: false };
  const teamTeraUsed = Boolean(room.teraUsage?.[me?.side]);
  const teraTypes = ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'];
  const teraTypeLabels = { normal: 'Normal', fire: 'Fuego', water: 'Agua', electric: 'Eléctrico', grass: 'Planta', ice: 'Hielo', fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho', rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada' };
  const transformOptions = active ? getTransformationOptions(active, me?.team || [], teamTransformationUsage) : [];
  const selectedTransform = transformOptions.find((option) => option.key === selectedTransformKey) || null;
  const hasSubmitted = room.pendingPlayerIds?.includes(playerId);
  const waitingSwitch = room.waitingForSwitchIds?.includes(playerId);

  useEffect(() => {
    if (selectedTransformKey && !transformOptions.some((option) => option.key === selectedTransformKey)) {
      setSelectedTransformKey(null);
    }
  }, [selectedTransformKey, transformOptions]);

  useEffect(() => {
    const validAttackTarget = selectedTarget && enemies.some((player) => {
      const pokemon = player.team.find((entry) => Number(entry.id) === Number(player.activeId));
      return player.id === selectedTarget.playerId && Number(player.activeId) === Number(selectedTarget.pokemonId) && pokemon?.currentHp > 0;
    });
    if (!validAttackTarget) {
      const firstEnemy = enemies.find((player) => player.activeId && player.team.some((pokemon) => Number(pokemon.id) === Number(player.activeId) && pokemon.currentHp > 0));
      setSelectedTarget(firstEnemy ? { playerId: firstEnemy.id, pokemonId: firstEnemy.activeId } : null);
    }
  }, [room, selectedTarget, enemies]);

  useEffect(() => {
    const validSupportTarget = selectedSupportTarget && allies.some((player) => {
      const pokemon = player.team.find((entry) => Number(entry.id) === Number(player.activeId));
      return player.id === selectedSupportTarget.playerId && Number(player.activeId) === Number(selectedSupportTarget.pokemonId) && pokemon?.currentHp > 0;
    });
    if (!validSupportTarget) {
      const firstAlly = allies.find((player) => player.activeId && player.team.some((pokemon) => Number(pokemon.id) === Number(player.activeId) && pokemon.currentHp > 0));
      setSelectedSupportTarget(firstAlly ? { playerId: firstAlly.id, pokemonId: firstAlly.activeId } : null);
    }
  }, [room, selectedSupportTarget, allies]);

  useEffect(() => {
    if (hasSubmitted) {
      setSwitchOpen(false);
      setTransformPickerOpen(false);
    }
    if (!hasSubmitted) setSelectedAction(null);
  }, [hasSubmitted, room.turn]);

  // Una forma solo se puede elegir para el Pokémon activo de este turno.
  useEffect(() => {
    setSelectedTransformKey(null);
    setTransformPickerOpen(false);
    setTeraPickerOpen(false);
    setSelectedTeraType('');
  }, [room.turn, active?.id, active?.transformed]);

  function play(action) {
    if (!active || hasSubmitted || waitingSwitch || active.currentHp <= 0) return;
    const payload = { type: 'PLAY_ACTION', action, pokemonId: active.id, turn: room.turn };
    if (action === 'tera') {
      if (!selectedTeraType || teamTeraUsed || active.teraType) return;
      payload.teraType = selectedTeraType;
    }
    // Tera y una transformación no se pueden activar sobre el mismo Pokémon.
    if (selectedTransform && !['switch', 'tera'].includes(action)) payload.transformKey = selectedTransform.key;
    if (action === 'attack' || action === 'teraStrike') {
      payload.targetPlayerId = selectedTarget?.playerId;
      payload.targetPokemonId = selectedTarget?.pokemonId;
    } else if (action === 'heal' || action === 'defend') {
      // El apoyo puede apuntar a tu Pokémon activo o al activo de un compañero en DUOS.
      payload.targetPlayerId = selectedSupportTarget?.playerId || playerId;
      payload.targetPokemonId = selectedSupportTarget?.pokemonId || active.id;
    }
    if (send(payload)) {
      const actionName = action === 'attack' ? active.actions.attack.name : action === 'teraStrike' ? active.actions.teraStrike?.name || 'Tera Golpe' : action === 'tera' ? `Teracristalización ${selectedTeraType}` : action === 'defend' ? active.actions.defend.name : action === 'heal' ? active.actions.heal.name : action === 'recover' ? active.actions.recover.name : 'Cambio';
      setSelectedAction(selectedTransform ? `${selectedTransform.label} + ${actionName}` : actionName);
      setSelectedTransformKey(null);
      setTransformPickerOpen(false);
      if (action === 'tera') { setTeraPickerOpen(false); setSelectedTeraType(''); }
    }
  }

  function voluntarySwitch(id) {
    if (!active || hasSubmitted || waitingSwitch || Number(id) === Number(active.id)) return;
    if (send({ type: 'PLAY_ACTION', action: 'switch', pokemonId: active.id, switchPokemonId: Number(id), turn: room.turn })) {
      setSelectedAction('Cambio de Pokémon');
      setSelectedTransformKey(null);
      setTransformPickerOpen(false);
      setSwitchOpen(false);
    }
  }

  function forcedSwitch(id) {
    send({ type: 'CHOOSE_POKEMON', pokemonId: Number(id) });
  }

  useEffect(() => {
    function onKeyDown(event) {
      if (capturingHotkey) {
        if (event.key === 'Escape') { setCapturingHotkey(''); return; }
        if (event.key.length === 1 || ['Enter', 'Backspace', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault();
          const nextKey = event.key.toLowerCase();
          const usedBy = Object.entries(hotkeys).find(([actionName, boundKey]) => actionName !== capturingHotkey && String(boundKey).toLowerCase() === nextKey);
          if (usedBy) { setHotkeyMessage(`Esa tecla ya se usa para ${usedBy[0]}. Elige otra.`); return; }
          setHotkeys((current) => ({ ...current, [capturingHotkey]: nextKey }));
          setHotkeyMessage('');
          setCapturingHotkey('');
        }
        return;
      }
      if (showHotkeys || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const key = event.key.toLowerCase();
      // Con el selector abierto, los números 1–9 eligen directamente una transformación.
      if (transformPickerOpen && /^[1-9]$/.test(key) && !hasSubmitted && !waitingSwitch) {
        const option = transformOptions[Number(key) - 1];
        if (option) { event.preventDefault(); setSelectedTransformKey(option.key); setTransformPickerOpen(false); }
        return;
      }
      // Esc cierra los selectores emergentes sin enviar una jugada.
      if (event.key === 'Escape') { setSwitchOpen(false); setTransformPickerOpen(false); setTeraPickerOpen(false); return; }
      const action = Object.entries(hotkeys).find(([, boundKey]) => String(boundKey).toLowerCase() === key)?.[0];
      if (!action) return;
      if (['attack', 'defend', 'heal', 'recover', 'teraStrike'].includes(action)) {
        if (action === 'teraStrike' && !active?.actions?.teraStrike) return;
        event.preventDefault();
        play(action);
      } else if (action === 'switch' && !hasSubmitted && !waitingSwitch && active) {
        event.preventDefault(); setSwitchOpen((value) => !value); setTransformPickerOpen(false); setTeraPickerOpen(false);
      } else if (action === 'transform' && !hasSubmitted && !waitingSwitch && transformOptions.length) {
        event.preventDefault(); setTransformPickerOpen((value) => !value); setSwitchOpen(false); setTeraPickerOpen(false);
      } else if (action === 'tera' && !hasSubmitted && !waitingSwitch && active && !active.teraType && !teamTeraUsed) {
        event.preventDefault(); setTeraPickerOpen((value) => !value); setSwitchOpen(false); setTransformPickerOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [capturingHotkey, showHotkeys, hotkeys, play, hasSubmitted, waitingSwitch, active, transformOptions, transformPickerOpen, teamTeraUsed]);

  const targetPlayer = selectedTarget ? room.players.find((player) => player.id === selectedTarget.playerId) : null;
  const target = targetPlayer?.team.find((pokemon) => Number(pokemon.id) === Number(selectedTarget?.pokemonId));
  const supportTargetPlayer = selectedSupportTarget ? room.players.find((player) => player.id === selectedSupportTarget.playerId) : null;
  const supportTarget = supportTargetPlayer?.team.find((pokemon) => Number(pokemon.id) === Number(selectedSupportTarget?.pokemonId));
  const multiplier = active && target ? getTypeMultiplier(active.actions.attack.type, target.types) : null;

  // En DUOS cada integrante ve las dos cartas aliadas y las dos rivales, incluso si alguien acaba de caer.
  function renderFighter(player, isEnemy) {
    const displayedId = player.activeId || player.lastActiveId || player.team[0]?.id;
    const pokemon = player.team.find((entry) => Number(entry.id) === Number(displayedId)) || player.team[0];
    if (!pokemon) return null;
    const isAliveActive = Boolean(player.activeId && Number(player.activeId) === Number(pokemon.id) && pokemon.currentHp > 0);
    const isAttackTarget = isEnemy && selectedTarget?.playerId === player.id && Number(selectedTarget?.pokemonId) === Number(pokemon.id);
    const isSupportTarget = !isEnemy && selectedSupportTarget?.playerId === player.id && Number(selectedSupportTarget?.pokemonId) === Number(pokemon.id);
    const motion = motionFor(pokemon, player.side, isEnemy ? 'enemy' : 'own', player.id);
    const cardClass = `fighter-card side-card side-${player.side} ${isEnemy ? 'enemy-target-card' : 'ally-target-card'} ${isAttackTarget ? 'targeted' : ''} ${isSupportTarget ? 'support-targeted' : ''} ${!isAliveActive ? 'fighter-not-active' : ''} ${motion.className} ${pokemon.transformed ? `is-transformed is-${pokemon.visualTransform || pokemon.transformation?.method || 'mega'}` : ''}`;
    return (
      <div className={`showdown-player ${!isAliveActive ? 'showdown-player-fainted' : ''}`} key={player.id}>
        <BattleTeamDots player={player} />
        <button
          key={motion.key}
          className={cardClass}
          type="button"
          disabled={!isAliveActive || hasSubmitted || waitingSwitch}
          title={isEnemy ? `Elegir a ${pokemon.name} como objetivo de ataque` : `Elegir a ${pokemon.name} como objetivo de apoyo`}
          onClick={() => isEnemy
            ? setSelectedTarget({ playerId: player.id, pokemonId: player.activeId })
            : setSelectedSupportTarget({ playerId: player.id, pokemonId: player.activeId })}
        >
          <div className="fighter-name"><span className={`side-name side-${player.side}`}>{player.name}{player.id === playerId ? ' (Tú)' : ''}</span><small>{pretty(pokemon.name)}</small></div>
          {isAttackTarget && <span className="target-purpose target-purpose-attack">Objetivo de ataque</span>}
          {isSupportTarget && <span className="target-purpose target-purpose-support">Objetivo de apoyo</span>}
          {!isAliveActive && <span className="target-purpose target-purpose-fainted">Debilitado · esperando cambio</span>}
          {pokemon.transformed && <span className={`transformation-badge badge-${pokemon.transformation?.method || 'special'}`}>{pokemon.transformation?.label || 'Transformado'}</span>}
          <img src={pokemon.sprite || '/pokemon-placeholder.svg'} alt={pokemon.name} onError={(event) => handlePokemonSpriteError(event, pokemon.baseSprite)} />
          <div className="fighter-hp"><span className={getHealthBarClass(pokemon.currentHp, pokemon.battleStats.hp)} style={{ width: `${Math.max(0, Math.min(100, pokemon.currentHp / pokemon.battleStats.hp * 100))}%` }} /></div>
          <small>{Math.max(0, pokemon.currentHp)} / {pokemon.battleStats.hp} HP · Energía {pokemon.energy}</small>
          {pokemon.shield > 0 && <small className="fighter-shield">Escudo {pokemon.shield}</small>}
        </button>
      </div>
    );
  }

  if (room.phase === 'finished') {
    const isTie = room.winnerSide == null;
    const isWinner = !isTie && room.winnerSide === me?.side;
    return (
      <section className="battle-screen finished-screen">
        <BattleAudioEvents room={room} />
        <div className="victory-panel">
          <DexoriumLogo className="dexorium-logo-finished" variant="light" />
          <p className="eyebrow">COMBATE TERMINADO</p>
          <h1>{isTie ? '¡Empate!' : isWinner ? '¡Victoria!' : 'Derrota'}</h1>
          <p className="finished-winner-line">{isTie ? 'Ningún equipo quedó con Pokémon disponibles.' : `Victoria para ${winnerTrainerLabel}.`}</p>
          <div className="rematch-request-panel">
            {!room.rematchRequest && (
              <button className="primary-button" type="button" onClick={onRequestRematch}>Solicitar Revancha</button>
            )}
            {room.rematchRequest?.fromPlayerId === playerId && (
              <>
                <p className="rematch-request-status">Solicitud enviada. Esperando que el rival la acepte o la rechace.</p>
                <button className="secondary-button" type="button" onClick={onCancelRematch}>Cancelar solicitud</button>
              </>
            )}
            {room.rematchRequest && room.rematchRequest.fromPlayerId !== playerId && room.rematchRequest.toSide === me?.side && (
              <>
                <p className="rematch-request-status"><b>{room.rematchRequest.fromPlayerName}</b> te envió una solicitud de revancha.</p>
                <div className="rematch-request-actions">
                  <button className="primary-button" type="button" onClick={onAcceptRematch}>Aceptar revancha</button>
                  <button className="cancel-rematch-button" type="button" onClick={onRejectRematch}>Rechazar solicitud</button>
                </div>
              </>
            )}
            {room.rematchRequest && room.rematchRequest.fromPlayerId !== playerId && room.rematchRequest.toSide !== me?.side && (
              <p className="rematch-request-status">{room.rematchRequest.fromPlayerName} envió una solicitud. Esperando respuesta del equipo rival.</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '15px', flexWrap: 'wrap' }}>
            <button className="secondary-button" type="button" onClick={onLeave}>Volver al lobby</button>
          </div>
          <div className="finished-team-review">
            <h2 className="finished-team-review-title">Tu equipo y las formas usadas</h2>
            <p>Los Pokémon que llegaron a 0 PS quedan bloqueados para la revancha. Transformar a uno que sigue vivo no lo bloquea.</p>
            <TeamPanel team={me?.team || []} blockedIds={me?.blockedIds || []} showBlocked />
          </div>
        </div>
        <BattleSidebar room={room} />
      <ChatWindow room={room} send={send} />
      </section>
    );
  }

  return (
    <section className="battle-screen">
      <BattleAudioEvents room={room} />
      <div className="showdown-topbar">
        <div className="showdown-brand" aria-label="DEXORIUM"><DexoriumLogo variant="combat" className="combat-logo" /></div>
        <div className="showdown-room"><strong>{room.code}</strong><span>{room.mode === 'duos' ? 'DUOS 2v2' : '1v1'} · Turno {room.turn}</span><TurnTimer turnStartedAt={room.turnStartedAt} durationMs={room.turnDurationMs} hasSubmitted={hasSubmitted} /></div>
        <div className="showdown-topbar-actions">
          <button className="surrender-button" type="button" onClick={() => { if (window.confirm("¿Seguro que quieres rendirte? La partida contará como derrota.")) onSurrender(); }}>🏳️ Rendirse</button>
        </div>
      </div>

      <div className="battle-layout showdown-layout">
        <div className="battle-main">
          <div className={`showdown-stage ${room.mode === 'duos' ? 'is-duos' : 'is-solo'}`}>
            <div className="stage-team enemy-team">
              {room.players.filter((player) => player.side !== me?.side).map((player) => renderFighter(player, true))}
            </div>

            <div className="showdown-middle">
              <div className="turn-badge">TURNO {room.turn}</div>
              <div className="vs-badge">VS</div>
            </div>

            <div className="stage-team own-team">
              {room.players.filter((player) => player.side === me?.side).map((player) => renderFighter(player, false))}
            </div>

            {waitingSwitch && (
              <div className="forced-switch-box forced-switch-overlay">
                <h3>Elige tu siguiente Pokémon</h3>
                <div className="bench-grid">
                  {me?.team.filter((pokemon) => pokemon.currentHp > 0).map((pokemon) => (
                    <button key={pokemon.id} type="button" onClick={() => forcedSwitch(pokemon.id)}>
                      <img src={pokemon.sprite || '/pokemon-placeholder.svg'} alt={pokemon.name} onError={(event) => handlePokemonSpriteError(event, pokemon.baseSprite)} />
                      <span>{pretty(pokemon.name)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="showdown-controls">
            <div className="choice-head">
              <div><strong>{active ? `¿Qué hará ${pretty(active.name)}?` : 'Sin Pokémon activo'}</strong><span>{hasSubmitted ? 'Jugada enviada. Espera a que se resuelva el turno.' : 'Elige una acción; las teclas rápidas también funcionan.'}</span></div>
              <button className="hotkey-open-button" type="button" onClick={() => setShowHotkeys((value) => !value)}>⌨ Configurar teclas</button>
              {active && <div className="target-info target-summary">
                <span>Atacar: <b className={`side-name side-${targetPlayer?.side || 'B'}`}>{targetPlayer?.name || 'elige un rival'}</b>{target ? ` · ${getEffectivenessLabel(multiplier)}` : ''}</span>
                <span>Curar / defender: <b className={`side-name side-${supportTargetPlayer?.side || me?.side || 'A'}`}>{supportTargetPlayer?.name || 'elige un aliado'}</b>{supportTarget ? ` · ${pretty(supportTarget.name)}` : ''}</span>
                {room.mode === 'duos' && <small>Haz clic en un rival para fijar el ataque o en un aliado para elegir a quién curar o proteger. Ambos pueden atacar al mismo enemigo.</small>}
              </div>}
            </div>

            <div className="transformation-resource-strip" aria-live="polite">
              <span><b>Dinamax:</b> {teamTransformationUsage.dynamaxUsed ? 'usado por el equipo' : 'disponible'}</span>
              <span><b>Gigamax:</b> {teamTransformationUsage.gigantamaxUsed ? 'usado por el equipo' : 'disponible'}</span>
              <span><b>Tera:</b> {teamTeraUsed ? 'usado por el equipo' : 'disponible'}</span>
            </div>
            <div className="battle-choice-grid">
              <button className="battle-action attack" disabled={!active || hasSubmitted || waitingSwitch || active.energy < (active.actions.attack?.energyCost || 0)} onClick={() => play('attack')} type="button">
                <b>Atacar <kbd>{hotkeys.attack.toUpperCase()}</kbd></b>
                <span>{active?.actions.attack.name || 'Ataque'} · {active?.actions.attack.type || '-'} · {active?.actions.attack.power || 0} poder · −{active?.actions.attack.energyCost || 0} energía</span>
              </button>
              {active?.actions.teraStrike && <button className="battle-action tera-strike" disabled={!active || hasSubmitted || waitingSwitch || active.energy < (active.actions.teraStrike?.energyCost || 0)} onClick={() => play('teraStrike')} type="button">
                <b>Tera Golpe <kbd>{String(hotkeys.teraStrike || 'b').toUpperCase()}</kbd></b>
                <span>{active.actions.teraStrike.name} · {active.actions.teraStrike.type} · {active.actions.teraStrike.power} poder · −{active.actions.teraStrike.energyCost} energía</span>
              </button>}
              <button className="battle-action defend" disabled={!active || hasSubmitted || waitingSwitch || active.energy < (active.actions.defend?.energyCost || 0)} onClick={() => play('defend')} type="button">
                <b>Defender <kbd>{hotkeys.defend.toUpperCase()}</kbd></b>
                <span>Protege al objetivo de apoyo · escudo {active?.actions.defend.shield || 0} · −{active?.actions.defend.energyCost || 0} energía</span>
              </button>
              <button className="battle-action heal" disabled={!active || hasSubmitted || waitingSwitch || active.energy < (active.actions.heal?.energyCost || 0)} onClick={() => play('heal')} type="button">
                <b>Curar <kbd>{hotkeys.heal.toUpperCase()}</kbd></b>
                <span>Cura al objetivo de apoyo · +{active?.actions.heal.heal || 0} vida · −{active?.actions.heal.energyCost || 0} energía</span>
              </button>
              <button className="battle-action recover" disabled={!active || hasSubmitted || waitingSwitch || active.energy >= MAX_ENERGY} onClick={() => play('recover')} type="button">
                <b>Recargar energía <kbd>{hotkeys.recover.toUpperCase()}</kbd></b>
                <span>+{active?.actions.recover?.gain || 35} energía · regeneración adicional al final del turno</span>
              </button>
              <button className="battle-action switch" disabled={!active || hasSubmitted || waitingSwitch} onClick={() => { setSelectedTransformKey(null); setTransformPickerOpen(false); setSwitchOpen((value) => !value); }} type="button">
                <b>Cambiar <kbd>{hotkeys.switch.toUpperCase()}</kbd></b>
                <span>Elige otro Pokémon de tu equipo</span>
              </button>
              {transformOptions.length > 0 && (
                <button className="battle-action transform" disabled={!active || hasSubmitted || waitingSwitch} onClick={() => { setSwitchOpen(false); setTeraPickerOpen(false); setTransformPickerOpen((value) => !value); }} type="button">
                  <b>Transformación <kbd>{hotkeys.transform.toUpperCase()}</kbd></b>
                  <span>Elegir una forma ({transformOptions.length}) antes de actuar</span>
                </button>
              )}
              <button className="battle-action terastallize" disabled={!active || hasSubmitted || waitingSwitch || teamTeraUsed || Boolean(active?.teraType) || Boolean(active?.transformed || active?.transformationUsed)} onClick={() => { setSwitchOpen(false); setTransformPickerOpen(false); setSelectedTransformKey(null); setTeraPickerOpen((value) => !value); }} type="button">
                <b>{active?.teraType ? `Tipo Tera: ${active.teraType}` : active?.transformed || active?.transformationUsed ? 'Mecánica especial usada' : <>Teracristalizar <kbd>{hotkeys.tera.toUpperCase()}</kbd></>}</b>
                <span>{teamTeraUsed ? 'El equipo ya usó su Tera' : active?.teraType ? 'El tipo queda fijo este combate' : active?.transformed || active?.transformationUsed ? 'Este Pokémon no puede usar otra mecánica especial' : 'Elige uno de los 18 tipos'}</span>
              </button>
            </div>

            {teraPickerOpen && active && !hasSubmitted && !teamTeraUsed && !active.teraType && !active.transformed && !active.transformationUsed && (
              <div className="tera-type-picker tera-picker-redesign" role="dialog" aria-label="Elegir tipo de teracristalización">
                <div className="tera-picker-heading">
                  <div className="tera-heading-symbol" aria-hidden="true">✦</div>
                  <div className="tera-heading-copy"><span className="tera-eyebrow">CRISTAL TERA</span><h3>Elige tu tipo Tera</h3><p>El tipo elegido cambiará a tu Pokémon y habilitará Tera Golpe durante el resto del combate.</p></div>
                  <button className="tera-close-button" type="button" onClick={() => setTeraPickerOpen(false)} aria-label="Cerrar selector Tera">×</button>
                </div>
                <div className="tera-selection-preview">
                  <span className={`tera-preview-gem tera-color-${selectedTeraType || 'normal'}`} aria-hidden="true">✦</span>
                  <div><small>TIPO SELECCIONADO</small><strong>{selectedTeraType ? teraTypeLabels[selectedTeraType] : 'Elige uno de los 18 tipos'}</strong><span>{selectedTeraType ? `Tera Golpe tendrá tipo ${teraTypeLabels[selectedTeraType]}.` : 'Pulsa una tarjeta para ver el tipo que usarás.'}</span></div>
                  <span className={`tera-preview-tag ${selectedTeraType ? `tera-color-${selectedTeraType}` : ''}`}>{selectedTeraType ? teraTypeLabels[selectedTeraType] : 'Sin elegir'}</span>
                </div>
                <div className="tera-type-grid">{teraTypes.map((type) => <button key={type} type="button" aria-pressed={selectedTeraType === type} className={`tera-type-chip tera-color-${type} ${selectedTeraType === type ? 'selected' : ''}`} onClick={() => setSelectedTeraType(type)}><span className="tera-chip-symbol" aria-hidden="true">✦</span><span className="tera-chip-label">{teraTypeLabels[type]}</span><small>{type.toUpperCase()}</small></button>)}</div>
                <div className="tera-picker-footer"><span>Solo puedes teracristalizar una vez por equipo.</span><button className="primary-button" type="button" disabled={!selectedTeraType} onClick={() => play('tera')}>{selectedTeraType ? `Activar Tera ${teraTypeLabels[selectedTeraType]}` : 'Selecciona un tipo'}</button></div>
              </div>
            )}

            {transformPickerOpen && active && !hasSubmitted && transformOptions.length > 0 && (
              <div className="transformation-picker" role="dialog" aria-label="Elegir transformación">
                <div className="transformation-picker-head">
                  <div><strong>Elige una transformación</strong><span>Se aplica junto con la próxima acción y no puede revertirse durante este combate.</span><small className="transformation-resource-status">Dinamax del equipo: {teamTransformationUsage.dynamaxUsed ? 'ya usado' : 'disponible'} · Gigamax del equipo: {teamTransformationUsage.gigantamaxUsed ? 'ya usado' : 'disponible'}</small></div>
                  <button type="button" className="ghost-button" onClick={() => setTransformPickerOpen(false)}>Cerrar</button>
                </div>
                <div className="transformation-options">
                  {transformOptions.map((option) => (
                    <button key={option.key} type="button" className={`transformation-option ${selectedTransformKey === option.key ? 'selected' : ''}`} onClick={() => { setSelectedTransformKey(option.key); setTransformPickerOpen(false); }}>
                      <span className="transformation-number" aria-label={`Atajo ${transformOptions.indexOf(option) + 1}`}>{transformOptions.indexOf(option) + 1}</span><span className={`transformation-orb orb-${option.method}`}>{option.method === 'mega' ? '◆' : option.method === 'dynamax' || option.method === 'gigantamax' ? '●' : '✦'}</span>
                      <span><b>{option.label}</b><small>{option.method === 'mega' ? 'Mega evolución' : option.method === 'dynamax' ? 'Dinamax' : option.method === 'gigantamax' ? 'Gigamax' : 'Forma especial'}</small></span>
                      <span className="transformation-select-mark">Elegir</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showHotkeys && (
              <div className="key-settings-panel" role="dialog" aria-label="Configurar teclas de combate">
                <div className="key-settings-heading"><div><span className="key-settings-icon" aria-hidden="true">⌨</span><div><strong>Atajos del combate</strong><small>Selecciona una acción y pulsa la tecla que quieres usar.</small></div></div><button type="button" className="key-settings-close" aria-label="Cerrar configuración de teclas" onClick={() => { setShowHotkeys(false); setCapturingHotkey(''); }}>×</button></div>
                <div className="key-settings-grid">
                  {[['attack','Atacar','⚔'],['teraStrike','Tera Golpe','✦'],['defend','Defender','◇'],['heal','Curar','＋'],['recover','Recargar energía','ϟ'],['switch','Cambiar Pokémon','↔'],['transform','Transformación','◆'],['tera','Teracristalizar','✧']].map(([key,label,icon]) => <div className="key-setting-row" key={key}><span className="key-setting-label"><i aria-hidden="true">{icon}</i><span>{label}</span></span><button type="button" className={capturingHotkey === key ? 'is-capturing' : ''} onClick={() => { setHotkeyMessage(''); setCapturingHotkey(key); }}>{capturingHotkey === key ? 'Pulsa tecla…' : <kbd>{String(hotkeys[key] || '').toUpperCase()}</kbd>}</button></div>)}
                </div>
                {capturingHotkey && <small className="key-capture-hint">Pulsa la tecla deseada. Esc cancela.</small>}
                {hotkeyMessage && <small className="key-capture-error" role="alert">{hotkeyMessage}</small>}
                <div className="key-settings-footer"><span>Puedes cambiar las teclas cuando quieras.</span><button type="button" className="key-reset-button" onClick={() => { setHotkeys({ attack: 'z', teraStrike: 'b', defend: 'c', heal: 'x', recover: 'r', switch: 'v', transform: 't', tera: 'g' }); setCapturingHotkey(''); setHotkeyMessage(''); }}>Restablecer</button></div>
              </div>
            )}

            {selectedTransform && active && !hasSubmitted && (
              <div className="selected-transformation-notice">
                <span>Transformación preparada: <b>{selectedTransform.label}</b>. Elige Atacar, Defender, Curarse o Recargar energía para aplicarla este turno.</span>
                <button type="button" onClick={() => setSelectedTransformKey(null)}>Cancelar</button>
              </div>
            )}

            {switchOpen && active && !hasSubmitted && (
              <div className="switch-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSwitchOpen(false); }}>
                <section className="switch-modal" role="dialog" aria-modal="true" aria-label="Cambiar Pokémon">
                  <header className="switch-modal-heading"><div><strong>¿A qué Pokémon quieres cambiar?</strong><small>Elige un Pokémon disponible de tu equipo.</small></div><button type="button" aria-label="Cerrar selector" onClick={() => setSwitchOpen(false)}>×</button></header>
                  <div className="switch-menu">
                    <div>
                      {me?.team.filter((pokemon) => pokemon.currentHp > 0 && pokemon.id !== active.id).map((pokemon) => (
                        <button key={pokemon.id} type="button" onClick={() => voluntarySwitch(pokemon.id)}>
                          <img src={pokemon.sprite || '/pokemon-placeholder.svg'} alt={pokemon.name} onError={(event) => handlePokemonSpriteError(event, pokemon.baseSprite)} />
                          <span>{pretty(pokemon.name)}</span><small>{pokemon.currentHp}/{pokemon.maxHp} PS</small>
                        </button>
                      ))}
                    </div>
                  </div>
                  <footer className="switch-modal-footer"><span>Esc para cerrar</span><button type="button" onClick={() => setSwitchOpen(false)}>Cancelar</button></footer>
                </section>
              </div>
            )}

            {hasSubmitted && selectedAction && (
              <p className="turn-message">Has elegido <b>{selectedAction}</b>. Esperando la jugada del rival...</p>
            )}
            <div className={`turn-status-footer ${hasSubmitted ? 'is-waiting' : 'is-yours'} side-${me?.side || 'A'}`} role="status" aria-live="polite">
              <span className="turn-status-light" aria-hidden="true" />
              <strong>{hasSubmitted ? 'JUGADA ENVIADA' : 'ES TU TURNO PARA ELEGIR'}</strong>
              <span>{hasSubmitted ? 'Esperando las acciones de los demás jugadores' : 'Elige una acción antes de que termine el tiempo'}</span>
            </div>
          </div>
        </div>

        <div className="battle-sidepanel compact-team-panel">
          <div className="side-panel-title"><h2>Tu equipo</h2><SideLabel side={me?.side || 'A'} /></div>
          <TeamPanel team={me?.team || []} />
          <div className="type-tip">
            <strong>Ventaja de tipos</strong>
            <p>Se multiplican los efectos de cada tipo defensor.</p>
            {active && target && <div className="effectiveness"><b>{getEffectivenessLabel(multiplier)}</b></div>}
          </div>
        </div>
      </div>

      <BattleSidebar room={room} />
      <ChatWindow room={room} send={send} />
    </section>
  );
}

function ArenaApp() {
  const { playPokemonCry, playSelection, setScene } = useArenaAudio();
  const [screen, setScreen] = useState('intro');
  // La galería arranca con el catálogo local; internet solo mejora los datos en segundo plano.
  const [catalog, setCatalog] = useState(() => ({ ...makeOfflineCatalog(), offline: true, source: 'local-inicial' }));
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [selectedTeam, setSelectedTeam] = useState([]);
  const [inspectedPokemon, setInspectedPokemon] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [playerName, setPlayerName] = useState('Entrenador');
  const [room, setRoom] = useState(null);
  const [spectating, setSpectating] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showGlobalHotkeys, setShowGlobalHotkeys] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [stats, setStats] = useState(loadSavedStats);
  const inspectRequestRef = useRef(0);
  const lastCatalogRetryStartedRef = useRef(0);

  const playerId = useMemo(getPlayerSessionId, []);
  const { connected, messages, connectionError, send, socketUrl } = useGameSocket();

  // El equipo se prepara para cada sesión; solo el historial de resultados permanece guardado.
  useEffect(() => { try { localStorage.removeItem('pokemon-arena-team'); } catch { /* No afecta la partida. */ } }, []);

  // La pista cambia al entrar a otra pantalla o al iniciar una partida con un matchId nuevo.
  // Mientras el mismo combate siga activo, se conserva la misma música para todos sus turnos.
  useEffect(() => {
    let nextScene;
    if ((screen === 'battle' || screen === 'spectator') && room?.phase === 'battle') {
      nextScene = { type: 'battle', key: room.matchId || room.code, trackIndex: room.audioTrackIndex };
    } else if ((screen === 'battle' || screen === 'spectator') && room?.phase === 'finished') {
      nextScene = { type: 'finished', key: room.matchId || room.code, winnerSide: room.winnerSide };
    } else if (screen === 'intro') {
      nextScene = { type: 'intro', key: 'intro' };
    } else if (screen === 'team' || screen === 'rematch_team') {
      nextScene = { type: 'gallery', key: screen };
    } else {
      nextScene = { type: 'lobby', key: `${screen}:${room?.code || 'sin-sala'}:${room?.phase || ''}` };
    }
    setScene(nextScene);
  }, [screen, room?.phase, room?.matchId, room?.winnerSide, room?.code, setScene]);

  useEffect(() => {
    try { localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats)); } catch { /* La partida sigue funcionando aunque el almacenamiento esté bloqueado. */ }
  }, [stats]);

  useEffect(() => {
    if (screen !== 'team' && screen !== 'rematch_team') return;
    if (catalog.results.length && catalogRetry === 0 && catalog.source !== 'local-inicial') return;
    if (catalogRetry > 0 && lastCatalogRetryStartedRef.current === catalogRetry && catalog.results.length) return;
    if (catalogRetry > 0) lastCatalogRetryStartedRef.current = catalogRetry;
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError('');
    getPokemonCatalog({ forceRefresh: catalogRetry > 0 })
      .then((data) => { if (!cancelled) setCatalog(data); })
      .catch(() => { if (!cancelled) setCatalogError('No se pudo cargar el catálogo de PokeAPI. Comprueba tu conexión e inténtalo de nuevo.'); })
      .finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, [screen, catalog.results.length, catalogRetry]);

  // Cada partida tiene un matchId propio; el código de sala se conserva en las revanchas.
  // Guardar el ID procesado evita contar dos veces un STATE repetido o una recarga.
  useEffect(() => {
    if (!room || room.phase !== 'finished' || !room.matchId) return;
    const me = room.players.find((p) => p.id === playerId);
    if (!me) return;

    const isTie = room.winnerSide == null;
    const isWinner = !isTie && room.winnerSide === me.side;
    const outcome = isTie ? 'tie' : isWinner ? 'win' : 'loss';
    setStats((previous) => recordMatchResultOnce(previous, room.matchId, outcome));
  }, [room, playerId]);

  const processedSocketSequence = useRef(0);
  useEffect(() => {
    const freshMessages = messages.filter((entry) => entry.sequence > processedSocketSequence.current);
    if (!freshMessages.length) return;
    processedSocketSequence.current = freshMessages[freshMessages.length - 1].sequence;
    for (const { data: incoming } of freshMessages) {
      switch (incoming.type) {
        case 'ROOM_LIST':
          setRooms(incoming.rooms || []);
          break;
        case 'ROOM_CREATED':
        case 'SPECTATE_JOINED':
        case 'STATE': {
          const nextRoom = incoming.room;
          const isSpectating = Boolean(incoming.spectating || incoming.type === 'SPECTATE_JOINED');
          setSpectating(isSpectating);
          if (!isSpectating && nextRoom.phase === 'rematch_lobby' && room?.phase !== 'rematch_lobby') setSelectedTeam([]);
          setRoom(nextRoom);
          if (isSpectating) setScreen('spectator');
          else if (nextRoom.phase === 'battle') setScreen('battle');
          else if (nextRoom.phase === 'rematch_lobby') setScreen((current) => current === 'rematch_team' ? current : 'rematch_lobby');
          else if (nextRoom.phase === 'finished') setScreen('battle');
          else setScreen('rooms');
          break;
        }
        case 'SPECTATOR_LEFT':
        case 'ROOM_CLOSED':
          setRoom(null);
          setSpectating(false);
          setScreen('rooms');
          if (incoming.message) window.alert(incoming.message);
          break;
        case 'REMATCH_CANCELLED':
          setSpectating(false);
          setRoom(null);
          setSelectedTeam([]);
          setInspectedPokemon(null);
          setScreen('team');
          break;
        case 'ERROR':
          window.alert(incoming.message || 'Error del servidor');
          break;
        default:
          break;
      }
    }
  }, [messages]);

  useEffect(() => {
    if (!room) return;
    if (spectating) { setScreen('spectator'); return; }
    const needed = room.mode === 'duos' ? 4 : 2;
    if (room.phase === 'battle') {
      setScreen('battle');
    } else if (room.phase === 'rematch_lobby') {
      setScreen((current) => current === 'rematch_team' ? current : 'rematch_lobby');
    } else if (room.players.length >= needed && room.phase === 'lobby') {
      setScreen('battle');
    }
  }, [room, spectating]);

  useEffect(() => {
    if (screen === 'rooms' && connected) send({ type: 'LIST_ROOMS' });
  }, [screen, connected, send]);

  function resolveKnownPokemonId(identifier) {
    if (identifier && typeof identifier === 'object' && Number.isInteger(Number(identifier.id))) {
      return Number(identifier.id);
    }
    const value = String(identifier ?? '').trim().toLowerCase();
    if (/^\d+$/.test(value)) return Number(value);
    const entry = catalog.results.find((item) => item.name.toLowerCase() === value);
    return Number(entry?.url?.split('/').filter(Boolean).pop()) || 0;
  }

  async function inspect(identifier) {
    const requestId = ++inspectRequestRef.current;
    // Reproducir el grito desde el gesto inicial evita que esperar a PokeAPI
    // haga que el navegador pierda la activación de audio del clic.
    const knownId = resolveKnownPokemonId(identifier);
    if (knownId > 0) playPokemonCry({ id: knownId });
    try {
      const pokemon = await getPokemon(identifier);
      // Si se hicieron varios clics seguidos, solo la última ficha actualiza el panel.
      if (requestId !== inspectRequestRef.current) return;
      setInspectedPokemon(pokemon);
      if (knownId <= 0) playPokemonCry(pokemon);
      playSelection();
    } catch {
      if (requestId === inspectRequestRef.current) window.alert('No se pudo cargar el Pokémon.');
    }
  }

  async function selectPokemon(identifier) {
    const requestedId = Number(typeof identifier === 'object' ? identifier.id : identifier);
    if (currentBlockedIds.includes(requestedId)) {
      window.alert('Ese Pokémon está bloqueado para la revancha porque llegó a 0 PS en el combate anterior.');
      return;
    }
    if (selectedTeam.length >= 6) return;
    if (selectedTeam.some((pokemon) => pokemon.id === requestedId)) return;

    // La selección manual emite el grito al momento. La generación aleatoria
    // no llama a esta función, por lo que sus Pokémon no reproducen voces.
    if (requestedId > 0) playPokemonCry({ id: requestedId });
    try {
      const pokemon = typeof identifier === 'object' ? identifier : await getPokemon(identifier);
      const card = pokemonToCard(pokemon);
      playSelection();
      setSelectedTeam((current) => current.length < 6 && !current.some((item) => item.id === card.id) ? [...current, card] : current);
    } catch {
      window.alert('No se pudo añadir el Pokémon.');
    }
  }

  function removePokemon(id) {
    setSelectedTeam((current) => current.filter((pokemon) => pokemon.id !== id));
  }

  function getTeamSnapshots(team = selectedTeam) {
    return team.map((pokemon) => ({
      id: Number(pokemon.id),
      name: String(pokemon.name || ''),
      types: Array.isArray(pokemon.types) ? pokemon.types.map((type) => typeof type === 'string' ? type : type?.type?.name).filter(Boolean) : [],
      baseStats: pokemon.baseStats || {},
      battleStats: pokemon.battleStats || {},
    }));
  }

  // Actividad 2: elegir seis Pokémon distintos desde el catálogo completo.
  // Fisher-Yates evita el sesgo de ordenar con Math.random().
  async function generateRandomTeam(blockedIds = []) {
    const total = Number(catalog.count) || Number(catalog.results.length);
    if (!total || !catalog.results.length) throw new Error('El catálogo todavía no está disponible.');

    const chosenIds = chooseUniquePokemonIds(catalog.results, blockedIds, 6);
    // PokeAPI no ofrece un endpoint oficial de detalle por lista de IDs; las seis
    // solicitudes se ejecutan en paralelo y solo se reemplaza el equipo al tenerlas todas.
    const rawPokemon = await getPokemonTeam(chosenIds);
    return rawPokemon.map(pokemonToCard);
  }

  function createRoom(options) {
    if (selectedTeam.length !== 6) {
      window.alert('Selecciona los seis Pokémon antes de crear la sala.');
      return;
    }
    const sent = send({
      type: 'CREATE_ROOM', playerId, name: options.name.trim(), mode: options.mode,
      visibility: options.visibility, password: options.password, side: options.side,
      teamIds: selectedTeam.map((pokemon) => pokemon.id),
      teamSnapshots: getTeamSnapshots(),
    });
    if (!sent) window.alert('El servidor local se está reconectando. Espera a que aparezca Conectado y vuelve a crear la sala.');
  }

  function joinRoom(options) {
    if (selectedTeam.length !== 6) {
      window.alert('Selecciona los seis Pokémon antes de entrar a la sala.');
      return;
    }
    const sent = send({
      type: 'JOIN_ROOM', playerId, name: options.name.trim(), code: options.code.trim().toUpperCase(),
      password: options.password, side: options.side, teamIds: selectedTeam.map((pokemon) => pokemon.id),
      teamSnapshots: getTeamSnapshots(),
    });
    if (!sent) window.alert('El servidor local se está reconectando. Espera a que aparezca Conectado y vuelve a entrar.');
  }

  function leaveRoom() {
    send({ type: 'LEAVE_ROOM' });
    setSpectating(false);
    setRoom(null);
    setScreen('rooms');
    send({ type: 'LIST_ROOMS' });
  }

  function requestRematch() {
    if (!send({ type: 'REMATCH' })) window.alert('No hay conexión con el servidor. Espera a que se reconecte e inténtalo de nuevo.');
  }

  function acceptRematch() {
    if (!send({ type: 'ACCEPT_REMATCH' })) window.alert('No hay conexión con el servidor. No se ha aceptado la solicitud.');
  }

  function rejectRematch() {
    if (!send({ type: 'REJECT_REMATCH' })) window.alert('No hay conexión con el servidor. No se ha rechazado la solicitud.');
  }

  function cancelRematch() {
    send({ type: 'CANCEL_REMATCH' });
  }

  function surrender() {
    send({ type: 'SURRENDER' });
  }

  function confirmRematchTeam(team) {
    if (!Array.isArray(team) || team.length !== 6) {
      window.alert('Debes elegir exactamente 6 Pokémon para la revancha.');
      return;
    }
    if (team.some((pokemon) => currentBlockedIds.includes(Number(pokemon.id)))) {
      window.alert('Tu equipo contiene un Pokémon bloqueado. Retíralo antes de confirmar.');
      return;
    }
    const sent = send({ type: 'CONFIRM_REMATCH_TEAM', teamIds: team.map((p) => p.id), teamSnapshots: getTeamSnapshots(team) });
    if (!sent) { window.alert('El servidor local se está reconectando. Espera a que aparezca Conectado y confirma de nuevo.'); return; }
    setScreen('rematch_lobby');
  }

  const currentBlockedIds = room?.me?.blockedIds || [];

  return (
    <div className="app-shell" data-offline-mode={catalog.offline ? 'true' : 'false'}>
      {screen === 'intro' && <><PokedexIntro onContinue={() => { playSelection(); setScreen('team'); }} onOpenGuide={() => setShowHowToPlay(true)} onPokemonCry={playPokemonCry} />{showStatsModal && <ResultsPanel stats={stats} onClose={() => setShowStatsModal(false)} />}</>}

      {(screen === 'team' || screen === 'rematch_team') && (
        <>
          <div className="page-toolbar">
            <button className="ghost-button" type="button" onClick={() => setScreen(screen === 'rematch_team' ? 'rematch_lobby' : 'intro')}>{screen === 'rematch_team' ? 'Volver a la revancha' : 'Volver a la Pokedex'}</button>
            <div className="page-toolbar-actions">
              {screen === 'rematch_team' && <button className="cancel-rematch-button toolbar-cancel" type="button" onClick={cancelRematch}>Cancelar revancha</button>}
              <button className="secondary-button" type="button" onClick={() => setShowStatsModal(true)}>Mis Resultados</button>
            </div>
          </div>
          {showStatsModal && <ResultsPanel stats={stats} onClose={() => setShowStatsModal(false)} />}
          {catalogLoading && <div className="catalog-status" role="status">⚡ Catálogo listo con datos locales. Actualizando datos de PokeAPI en segundo plano…</div>}
          {catalogError && <div className="error-banner" role="alert">{catalogError} <button type="button" className="secondary-button" onClick={() => setCatalogRetry((value) => value + 1)}>Reintentar carga</button></div>}
          {(
            <TeamBuilder
              catalog={catalog}
              selectedTeam={selectedTeam}
              onSelect={selectPokemon}
              onRemove={removePokemon}
              onInspect={inspect}
              inspectedPokemon={inspectedPokemon}
              selectionMode={screen === 'rematch_team' ? 'rematch' : 'initial'}
              onStart={() => screen === 'rematch_team' ? confirmRematchTeam(selectedTeam) : setScreen('rooms')}
              onBack={() => setScreen(screen === 'rematch_team' ? 'rematch_lobby' : 'intro')}
              onRandomTeam={async (blockedIds = currentBlockedIds) => {
                const rand = await generateRandomTeam(blockedIds);
                if (rand.length === 6) setSelectedTeam(rand);
                return rand;
              }}
              blockedIds={currentBlockedIds}
              onRefreshCatalog={() => setCatalogRetry((value) => value + 1)}
            />
          )}
        </>
      )}

      {screen === 'rooms' && (
        <>
          <div className="page-toolbar">
            {!room && <button className="return-menu-button" type="button" onClick={() => setScreen('intro')}>Volver al menú principal</button>}
            <span className="socket-url">{socketUrl}</span>
          </div>
          {!connected && <div className="error-banner">{connectionError || 'Conecta el servidor Node para jugar en red.'}</div>}
          <RoomLobby
            playerName={playerName}
            setPlayerName={setPlayerName}
            selectedTeam={selectedTeam}
            rooms={rooms}
            onCreate={createRoom}
            onJoin={joinRoom}
            onSpectate={(code) => send({ type: 'SPECTATE_ROOM', code, name: playerName.trim() || 'Espectador' })}
            onRefresh={() => send({ type: 'LIST_ROOMS' })}
            currentRoom={room}
            onLeave={leaveRoom}
            socketConnected={connected}
            onOpenStats={() => setShowStatsModal(true)}
            onOpenGuide={() => setShowHowToPlay(true)}
            blockedIds={currentBlockedIds}
            send={send}
          />
          {showStatsModal && <ResultsPanel stats={stats} onClose={() => setShowStatsModal(false)} />}
        </>
      )}

      {screen === 'rematch_lobby' && room && (
        <RematchLobby
          room={room}
          playerId={playerId}
          selectedTeam={selectedTeam}
          blockedIds={currentBlockedIds}
          onOpenGallery={() => setScreen('rematch_team')}
          onCancelRematch={cancelRematch}
          send={send}
        />
      )}

      {screen === 'spectator' && room && (
        <SpectatorScreen room={room} onLeave={leaveRoom} send={send} />
      )}

      {screen === 'battle' && room && (
        <BattleScreen
          room={room}
          playerId={playerId}
          send={send}
          onLeave={leaveRoom}
          onRequestRematch={requestRematch}
          onAcceptRematch={acceptRematch}
          onRejectRematch={rejectRematch}
          onCancelRematch={cancelRematch}
          onSurrender={surrender}
        />
      )}
      {!['battle', 'spectator'].includes(screen) && <button className="global-hotkeys-trigger" type="button" onClick={() => setShowGlobalHotkeys(true)} aria-haspopup="dialog">⌨ <span>Configurar teclas</span></button>}
      {showGlobalHotkeys && <HotkeySettingsModal onClose={() => setShowGlobalHotkeys(false)} />}
      {showHowToPlay && <HowToPlay onClose={() => setShowHowToPlay(false)} />}
      <div className="studio-credit" aria-label="Créditos de Grillo Studio">
        <img src="/brand/grillo-signature.png" alt="Firma de Grillo Studio" />
        <span>By: Grillo_Studio´s</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AudioProvider>
      <ArenaApp />
    </AudioProvider>
  );
}

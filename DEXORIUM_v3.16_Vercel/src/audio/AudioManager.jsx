import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const AudioManagerContext = createContext(null);
const SETTINGS_KEY = 'pokemon-arena-audio-settings';
// La música y los golpes locales provienen de Musica.zip. Referencias de consulta: https://quicksounds.com/library/sounds/pokemon y https://forums.pokemmo.com/index.php?/topic/151175-voces-reales-pokemon-real-voices-pokemon-gen-1-5/.
// Para el grito asociado a cada especie se consulta cries.latest de PokeAPI Cries: https://github.com/PokeAPI/cries.
const ROOT = '/Musica';

const TRACKS = {
  intro: [`${ROOT}/Menu/Inicio_Pagina_Pokedex/Start Menu.mp3`],
  gallery: [
    `${ROOT}/Fondo_Background/Pixel Showdown.mp3`,
    `${ROOT}/Fondo_Background/Soft Save.mp3`,
  ],
  lobby: [
    `${ROOT}/Fondo_Background/Soft Save.mp3`,
    `${ROOT}/Fondo_Background/Pixel Showdown.mp3`,
  ],
  battle: [
    `${ROOT}/Battle_Background/Apex Onslaught.mp3`,
    `${ROOT}/Battle_Background/Critical Hit.mp3`,
    `${ROOT}/Battle_Background/Titan Strike.mp3`,
  ],
};

const SOUNDS = {
  selection: `${ROOT}/Menu/Selection/melee-menu-select.mp3`,
  characterIntro: `${ROOT}/Menu/Intro_Menu/choose-your-charater.mp3`,
  knockout: `${ROOT}/Battle_Background/Final_Juego/super-smash-bros-ultimate-final-ko-sound-effect.mp3`,
  punches: [
    `${ROOT}/Punch/hotline-miami-punch.mp3`,
    `${ROOT}/Punch/improved-bonk-sound.mp3`,
    `${ROOT}/Punch/punch-sound-effect-remastered.mp3`,
    `${ROOT}/Punch/strongpunch_1.mp3`,
  ],
  finishing: `${ROOT}/Punch/finishing-hit-super-smash-bros-ultimate.mp3`,
};

function loadSettings() {
  const defaults = { music: 0.28, effects: 0.48, voices: 0.58 };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return defaults;
    return Object.fromEntries(Object.keys(defaults).map((key) => {
      const value = Number(saved[key]);
      return [key, Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : defaults[key]];
    }));
  } catch {
    return defaults;
  }
}

function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function drawTrack(category, bagsRef, lastTrackRef) {
  const source = TRACKS[category] || [];
  if (!source.length) return '';
  if (!bagsRef.current[category]?.length) {
    let nextBag = shuffle(source);
    if (nextBag.length > 1 && nextBag[0] === lastTrackRef.current[category]) {
      [nextBag[0], nextBag[1]] = [nextBag[1], nextBag[0]];
    }
    bagsRef.current[category] = nextBag;
  }
  const path = bagsRef.current[category].shift();
  lastTrackRef.current[category] = path;
  return path;
}

function criesUrl(pokemon) {
  if (pokemon?.cries?.latest) return pokemon.cries.latest;
  if (pokemon?.cries?.legacy) return pokemon.cries.legacy;
  const id = Number(pokemon?.id);
  return Number.isInteger(id) && id > 0
    ? `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`
    : '';
}

export function useArenaAudio() {
  const value = useContext(AudioManagerContext);
  if (!value) throw new Error('useArenaAudio debe usarse dentro de AudioProvider.');
  return value;
}

export function AudioProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scene, setSceneState] = useState({ type: 'intro', key: 'intro' });
  const [musicLabel, setMusicLabel] = useState('Menú');
  const [musicStatus, setMusicStatus] = useState('starting');
  const musicRef = useRef(null);
  const voiceRef = useRef(null);
  const effectPoolRef = useRef([]);
  const effectCursorRef = useRef(0);
  const desiredTrackRef = useRef(null);
  const lastVoiceTimeRef = useRef(0);
  const lastPunchRef = useRef(-1);
  const lastBattleKeyRef = useRef('');
  const playedFinishRef = useRef(new Set());
  const bagsRef = useRef({});
  const lastTrackRef = useRef({});
  const activeTrackRef = useRef('');
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* El audio sigue funcionando sin almacenamiento. */ }
    if (musicRef.current) musicRef.current.volume = settings.music;
    if (voiceRef.current) voiceRef.current.volume = settings.voices;
    effectPoolRef.current.forEach((audio) => { audio.volume = settings.effects; });
  }, [settings]);

  const getMusicPlayer = useCallback(() => {
    if (!musicRef.current) {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.loop = true;
      audio.volume = settingsRef.current.music;
      audio.addEventListener('playing', () => setMusicStatus('playing'));
      audio.addEventListener('error', () => setMusicStatus('error'));
      musicRef.current = audio;
    }
    return musicRef.current;
  }, []);

  const startMusic = useCallback((path, label) => {
    if (!path) return;
    const player = getMusicPlayer();
    const nextLabel = label || 'Música';
    desiredTrackRef.current = { path, label: nextLabel };
    setMusicLabel(nextLabel);
    setMusicStatus('starting');

    // Cambiar el src reinicia el audio por sí mismo. Llamar currentTime antes de
    // que el navegador cargue metadatos puede fallar en algunos motores.
    const currentSource = player.getAttribute('src') || '';
    if (currentSource !== path) {
      player.pause();
      player.src = path;
      player.load();
    }
    player.loop = true;
    player.volume = settingsRef.current.music;
    activeTrackRef.current = path;

    // Se intenta al entrar a la pantalla. Si el navegador bloquea autoplay,
    // queda registrado desiredTrackRef y se reintenta en la primera interacción.
    try {
      const attempt = player.play();
      if (attempt && typeof attempt.catch === 'function') {
        attempt.catch((error) => setMusicStatus(error?.name === 'NotAllowedError' ? 'blocked' : 'error'));
      }
    } catch {
      // Safari y algunos navegadores pueden lanzar sin devolver una promesa.
      setMusicStatus('error');
    }
  }, [getMusicPlayer]);

  const playOneShot = useCallback((path, bus = 'effects', volumeMultiplier = 1) => {
    if (!path) return;
    let pool = effectPoolRef.current;
    if (!pool.length) {
      pool = Array.from({ length: 5 }, () => {
        const audio = new Audio();
        audio.preload = 'auto';
        return audio;
      });
      effectPoolRef.current = pool;
    }
    const player = pool[effectCursorRef.current % pool.length];
    effectCursorRef.current += 1;
    player.pause();
    player.src = path;
    player.load();
    const base = bus === 'voices' ? settingsRef.current.voices : settingsRef.current.effects;
    player.volume = Math.min(1, Math.max(0, base * volumeMultiplier));
    player.play().catch(() => { /* Se reintentará tras una interacción del jugador. */ });
  }, []);

  const playPokemonCry = useCallback((pokemon, options = {}) => {
    const now = Date.now();
    const minimumGap = Number(options.minimumGapMs) || 850;
    if (now - lastVoiceTimeRef.current < minimumGap) return false;
    const source = criesUrl(pokemon);
    if (!source) return false;
    lastVoiceTimeRef.current = now;

    if (!voiceRef.current) {
      voiceRef.current = new Audio();
      voiceRef.current.preload = 'auto';
    }
    const player = voiceRef.current;
    player.pause();
    player.src = source;
    player.load();
    player.volume = settingsRef.current.voices;
    player.play().catch(() => {
      // La voz solo se dispara por una acción manual; no se encola para evitar que
      // un grito antiguo suene encima del Pokémon que el jugador acaba de elegir.
    });
    return true;
  }, []);

  const playSelection = useCallback(() => {
    playOneShot(SOUNDS.selection, 'effects', 0.75);
  }, [playOneShot]);

  const playBattleEffect = useCallback((effect) => {
    if (!effect) return;
    if (effect.kind === 'attack') {
      const pokemonSeed = Math.abs(Number(effect.pokemonId) || 0);
      const turnSeed = Math.abs(Number(effect.turn) || 0);
      const typeSeed = String(effect.attackType || '').split('').reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
      let index = (pokemonSeed + turnSeed + typeSeed + Math.floor(Math.random() * SOUNDS.punches.length)) % SOUNDS.punches.length;
      if (SOUNDS.punches.length > 1 && index === lastPunchRef.current) index = (index + 1) % SOUNDS.punches.length;
      lastPunchRef.current = index;
      const isStrong = effect.multiplier >= 2 || effect.finishing;
      playOneShot(isStrong ? SOUNDS.finishing : SOUNDS.punches[index], 'effects', isStrong ? 0.85 : 0.62);
    } else if (effect.kind === 'defend' || effect.kind === 'switch') {
      playOneShot(SOUNDS.selection, 'effects', 0.5);
    } else if (effect.kind === 'heal') {
      playOneShot(SOUNDS.selection, 'effects', 0.55);
    } // El KO de un Pokémon se acompaña con el golpe final si lo hubo; al terminar la partida suena el efecto de Final_Juego.
  }, [playOneShot]);

  const setScene = useCallback((nextScene) => {
    if (!nextScene?.type) return;
    setSceneState((current) => current.type === nextScene.type && current.key === nextScene.key && current.winnerSide === nextScene.winnerSide && current.trackIndex === nextScene.trackIndex
      ? current
      : nextScene);
  }, []);

  useEffect(() => {
    const player = getMusicPlayer();
    if (scene.type === 'battle') {
      if (lastBattleKeyRef.current !== scene.key) {
        lastBattleKeyRef.current = scene.key;
        const requestedIndex = Number(scene.trackIndex);
        const track = Number.isInteger(requestedIndex) && requestedIndex >= 0 && requestedIndex < TRACKS.battle.length
          ? TRACKS.battle[requestedIndex]
          : drawTrack('battle', bagsRef, lastTrackRef);
        startMusic(track, 'Combate');
      }
      return;
    }

    if (scene.type === 'finished') {
      if (!playedFinishRef.current.has(scene.key)) {
        playedFinishRef.current.add(scene.key);
        playOneShot(SOUNDS.knockout, 'effects', 0.65);
      }
      // La música del combate continúa hasta que se abandona el resultado o se entra a una nueva fase.
      return;
    }

    const currentIdentity = `${scene.type}:${scene.key || ''}`;
    if (player.dataset.sceneIdentity === currentIdentity && activeTrackRef.current) return;
    player.dataset.sceneIdentity = currentIdentity;

    if (scene.type === 'intro') {
      startMusic(drawTrack('intro', bagsRef, lastTrackRef), 'Pokedex');
    } else if (scene.type === 'gallery') {
      startMusic(drawTrack('gallery', bagsRef, lastTrackRef), 'Galería');
      playOneShot(SOUNDS.characterIntro, 'effects', 0.7);
    } else {
      startMusic(drawTrack('lobby', bagsRef, lastTrackRef), 'Sala');
    }
  }, [scene, getMusicPlayer, startMusic, playOneShot]);

  // Los navegadores pueden bloquear la música automática al cargar la web.
  // Se reintenta en la primera interacción real y al volver a la pestaña.
  useEffect(() => {
    function resumeMusic() {
      const music = musicRef.current;
      const desired = desiredTrackRef.current;
      if (!music || !desired || !music.paused) return;
      if ((music.getAttribute('src') || '') !== desired.path) {
        music.src = desired.path;
        music.load();
      }
      music.loop = true;
      music.volume = settingsRef.current.music;
      try {
        const attempt = music.play();
        if (attempt && typeof attempt.then === 'function') {
          attempt.then(() => setMusicStatus('playing')).catch((error) => {
            setMusicStatus(error?.name === 'NotAllowedError' ? 'blocked' : 'error');
          });
        }
      } catch { /* El siguiente gesto volverá a intentarlo. */ setMusicStatus('error'); }
    }


    function resumeOnGesture() {
      resumeMusic();
    }
    function resumeWhenVisible() {
      // Al volver a la pestaña solo retomamos música; no disparamos voces sin gesto.
      if (document.visibilityState === 'visible') resumeMusic();
    }

    window.addEventListener('pointerdown', resumeOnGesture, true);
    window.addEventListener('keydown', resumeOnGesture, true);
    document.addEventListener('visibilitychange', resumeWhenVisible);
    window.addEventListener('pageshow', resumeMusic);
    return () => {
      window.removeEventListener('pointerdown', resumeOnGesture, true);
      window.removeEventListener('keydown', resumeOnGesture, true);
      document.removeEventListener('visibilitychange', resumeWhenVisible);
      window.removeEventListener('pageshow', resumeMusic);
    };
  }, []);

  useEffect(() => () => {
    musicRef.current?.pause();
    voiceRef.current?.pause();
    effectPoolRef.current.forEach((audio) => audio.pause());
  }, []);

  const setVolume = useCallback((bus, value) => {
    const normalized = Math.min(1, Math.max(0, Number(value) || 0));
    setSettings((current) => ({ ...current, [bus]: normalized }));
  }, []);

  const contextValue = useMemo(() => ({
    playPokemonCry,
    playSelection,
    playBattleEffect,
    setScene,
    setVolume,
    settings,
    musicStatus,
  }), [playPokemonCry, playSelection, playBattleEffect, setScene, setVolume, settings, musicStatus]);

  return (
    <AudioManagerContext.Provider value={contextValue}>
      {children}
      <div className="audio-settings-dock">
        <button className="audio-settings-trigger" type="button" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen} aria-label={musicStatus === 'blocked' ? 'Activar audio' : 'Configuración de audio'}>
          {musicStatus === 'blocked' ? '▶ Activar audio' : musicStatus === 'error' ? '⚠ Audio' : '🔊 Audio'}
        </button>
        {settingsOpen && (
          <section className="audio-settings-panel" role="dialog" aria-label="Configuración de audio">
            <div className="audio-settings-heading"><div><strong>Sonido</strong><small>{musicLabel}</small></div><button type="button" onClick={() => setSettingsOpen(false)} aria-label="Cerrar configuración">×</button></div>
            {[
              { key: 'music', label: 'Música' },
              { key: 'effects', label: 'Efectos de combate' },
              { key: 'voices', label: 'Voces Pokémon' },
            ].map((item) => (
              <label className="audio-volume-row" key={item.key}>
                <span>{item.label}</span><b>{Math.round(settings[item.key] * 100)}%</b>
                <input type="range" min="0" max="1" step="0.01" value={settings[item.key]} onChange={(event) => setVolume(item.key, event.target.value)} aria-label={item.label} />
              </label>
            ))}
            <p>Los volúmenes se guardan en este navegador. Si el navegador bloquea el inicio automático, pulsa «Activar audio» una vez.</p>
          </section>
        )}
      </div>
    </AudioManagerContext.Provider>
  );
}

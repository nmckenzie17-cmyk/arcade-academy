(function () {
  'use strict';

  const STORAGE_KEY = 'arcadeAcademy.audioSettings';
  const CLOCK_KEY = 'arcadeAcademy.musicStartedAt';
  const FADE_MS = 650;
  const DEFAULTS = Object.freeze({ background: 0.45, soundscape: 0.65, player: 0.8 });
  const GAME_MUSIC = Object.freeze({
    'angler-answerer': 'angler-answerer-menu.mp3',
    'cube-curiosity': 'cube-curiosity-menu.mp3',
    'pinball-postulation': 'cube-curiosity-menu.mp3',
    'cavern-crammer': 'fortress-facts-menu.mp3',
    'fortress-facts': 'fortress-facts-menu.mp3',
    'note-knowledge': 'jetpack-journey-menu.mp3',
    'jetpack-journey': 'jetpack-journey-menu.mp3',
    'ko-klarity': 'ko-klarity-menu.mp3',
    'rumbux-revision': 'ko-klarity-menu.mp3',
    'pool-practice': 'pool-practice-menu.mp3',
    'tic-tac-toe': 'pool-practice-menu.mp3',
    'dot-n-box-deducer': 'pool-practice-menu.mp3',
    'pixel-artillery': 'pool-practice-menu.mp3',
    'rocket-recall': 'rocket-recall-menu.mp3',
    'shuriken-scholar': 'shuriken-scholar.mp3',
    'wild-west-wordslinger': 'wild-west-wordslinger-menu.mp3'
  });
  const listeners = new Set();

  function clamp(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
  }

  function readSettings() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  let settings = readSettings();
  const managedAudio = new Set();
  let activeMusic = null;

  function getMusicStartedAt() {
    let startedAt = Number(sessionStorage.getItem(CLOCK_KEY));
    if (!Number.isFinite(startedAt) || startedAt <= 0 || startedAt > Date.now()) {
      startedAt = Date.now();
      try { sessionStorage.setItem(CLOCK_KEY, String(startedAt)); } catch (_) {}
    }
    return startedAt;
  }

  function getMusicElapsedSeconds() {
    return Math.max(0, (Date.now() - getMusicStartedAt()) / 1000);
  }

  function notify() {
    managedAudio.forEach(entry => {
      entry.audio.volume = clamp(entry.baseVolume * settings[entry.channel]);
    });
    listeners.forEach(listener => listener({ ...settings }));
    window.dispatchEvent(new CustomEvent('arcade-audio-settings-changed', { detail: { ...settings } }));
  }

  function setVolume(channel, value) {
    if (!(channel in DEFAULTS)) return;
    settings[channel] = clamp(value);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (_) {}
    notify();
  }

  function createAudio(src, options = {}) {
    const channel = options.channel in DEFAULTS ? options.channel : 'player';
    const baseVolume = clamp(options.baseVolume ?? 1);
    const audio = new Audio(src);
    audio.loop = Boolean(options.loop);
    audio.preload = options.preload || 'auto';
    audio.volume = clamp(baseVolume * settings[channel]);
    managedAudio.add({ audio, channel, baseVolume });
    return audio;
  }

  function playOneShot(src, options = {}) {
    const audio = createAudio(src, options);
    audio.addEventListener('ended', () => {
      for (const entry of managedAudio) {
        if (entry.audio === audio) managedAudio.delete(entry);
      }
    }, { once: true });
    audio.play().catch(() => {});
    return audio;
  }

  function playSyncedMusic(src, options = {}) {
    if (activeMusic && activeMusic.src.endsWith(src)) {
      if (activeMusic.paused) {
        if (activeMusic.duration && Number.isFinite(activeMusic.duration)) activeMusic.currentTime = getMusicElapsedSeconds() % activeMusic.duration;
        activeMusic.volume = 0;
        activeMusic.play().then(() => fade(activeMusic, settings.background, options.fadeMs ?? FADE_MS)).catch(() => {});
      }
      return activeMusic;
    }
    activeMusic?.pause();
    const audio = createAudio(src, { channel: 'background', loop: true, baseVolume: options.baseVolume ?? 1 });
    const targetVolume = audio.volume;
    audio.volume = 0;
    activeMusic = audio;

    const begin = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        audio.currentTime = getMusicElapsedSeconds() % audio.duration;
      }
      audio.play().then(() => fade(audio, targetVolume, options.fadeMs ?? FADE_MS)).catch(() => {
        const unlock = () => {
          document.removeEventListener('pointerdown', unlock);
          document.removeEventListener('keydown', unlock);
          begin();
        };
        document.addEventListener('pointerdown', unlock, { once: true });
        document.addEventListener('keydown', unlock, { once: true });
      });
    };
    if (audio.readyState >= 1) begin();
    else audio.addEventListener('loadedmetadata', begin, { once: true });
    return audio;
  }

  function fade(audio, destination, durationMs = FADE_MS) {
    const from = audio.volume;
    const started = performance.now();
    return new Promise(resolve => {
      function step(now) {
        const progress = Math.min(1, (now - started) / Math.max(1, durationMs));
        audio.volume = clamp(from + (destination - from) * progress);
        if (progress < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  function fadeOutMusic(durationMs = FADE_MS) {
    if (!activeMusic || activeMusic.paused) return Promise.resolve();
    const music = activeMusic;
    return fade(music, 0, durationMs).then(() => music.pause());
  }

  function gameIdFromPath(pathname) {
    const match = pathname.match(/\/games\/([^/]+)\/?(?:index\.html)?$/);
    return match?.[1] || null;
  }

  function sharedMusicUrl(filename) {
    return new URL(`${currentGameId() ? '../../' : ''}shared/music/${filename}`, location.href).href;
  }

  function musicForDestination(url) {
    const destination = new URL(url, location.href);
    const gameId = gameIdFromPath(destination.pathname);
    if (gameId) return GAME_MUSIC[gameId] ? sharedMusicUrl(GAME_MUSIC[gameId]) : null;
    return /\/index\.html$|\/$/.test(destination.pathname) ? sharedMusicUrl('hub-menu.mp3') : null;
  }

  function crossfadeTo(src, durationMs = FADE_MS) {
    if (!src) return fadeOutMusic(durationMs);
    const outgoing = activeMusic;
    const incoming = createAudio(src, { channel: 'background', loop: true, baseVolume: 1 });
    incoming.volume = 0;
    const begin = () => {
      if (incoming.duration && Number.isFinite(incoming.duration)) incoming.currentTime = getMusicElapsedSeconds() % incoming.duration;
      return incoming.play().then(() => Promise.all([
        outgoing && !outgoing.paused ? fade(outgoing, 0, durationMs) : Promise.resolve(),
        fade(incoming, settings.background, durationMs)
      ])).then(() => {
        outgoing?.pause();
        activeMusic = incoming;
      }).catch(() => fadeOutMusic(durationMs));
    };
    if (incoming.readyState >= 1) return begin();
    return new Promise(resolve => {
      incoming.addEventListener('loadedmetadata', () => resolve(begin()), { once: true });
      incoming.addEventListener('error', () => resolve(fadeOutMusic(durationMs)), { once: true });
    });
  }

  function navigateWithFade(url) {
    crossfadeTo(musicForDestination(url)).finally(() => location.assign(url));
  }

  function currentGameId() {
    return gameIdFromPath(location.pathname);
  }

  function startPageMusic() {
    const gameId = currentGameId();
    const filename = gameId && GAME_MUSIC[gameId];
    if (filename) playSyncedMusic(`../../shared/music/${filename}`);
  }

  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    settings = readSettings();
    notify();
  });

  window.AudioManager = Object.freeze({
    channels: Object.keys(DEFAULTS),
    createAudio,
    crossfadeTo,
    fadeOutMusic,
    getMusicElapsedSeconds,
    getSettings: () => ({ ...settings }),
    getVolume: channel => clamp(settings[channel] ?? 0),
    navigateWithFade,
    playOneShot,
    playSyncedMusic,
    setVolume,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });

  document.addEventListener('DOMContentLoaded', startPageMusic);
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link || link.target || link.hasAttribute('download')) return;
    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin || destination.pathname === location.pathname || destination.hash && destination.pathname === location.pathname) return;
    if (event.defaultPrevented) return;
    event.preventDefault();
    navigateWithFade(destination.href);
  });
})();

(function () {
  'use strict';

  const match = location.pathname.match(/\/games\/([^/]+)/);
  const gameId = match?.[1];
  if (!gameId || window.ArcadeSFXManager) return;

  // Each game has its own timbre and pitch. Games with rich built-in effects
  // retain those for gameplay while this layer supplies navigation and results.
  const PROFILES = Object.freeze({
    'angler-answerer':       { wave:'sine',     pitch:280, action:'splash' },
    'cavern-crammer':        { wave:'triangle', pitch:170, action:'rock' },
    'cube-curiosity':        { wave:'square',   pitch:430, action:'block' },
    'dot-n-box-deducer':     { wave:'square',   pitch:350, action:'block' },
    'drift-discovery':       { wave:'sawtooth', pitch:150, action:'engine' },
    'fortress-facts':        { wave:'triangle', pitch:190, action:'metal' },
    'garden-guessing':       { wave:'sine',     pitch:360, native:true },
    'jetpack-journey':       { wave:'sawtooth', pitch:310, action:'boost' },
    'ko-klarity':            { wave:'square',   pitch:130, action:'impact' },
    'note-knowledge':        { wave:'sine',     pitch:440, action:'note' },
    'pinball-postulation':   { wave:'triangle', pitch:690, action:'ping' },
    'pixel-artillery':       { wave:'sawtooth', pitch:120, action:'blast' },
    'pool-practice':         { wave:'sine',     pitch:520, native:true },
    'rocket-recall':         { wave:'square',   pitch:520, nativeAction:true },
    'rumbux-revision':       { wave:'square',   pitch:145, action:'impact' },
    'shuriken-scholar':      { wave:'triangle', pitch:620, action:'slice' },
    'tic-tac-toe':           { wave:'sine',     pitch:410, action:'block' },
    'wild-west-wordslinger': { wave:'square',   pitch:210, action:'shot' }
  });
  const profile = PROFILES[gameId] || { wave:'square', pitch:360, action:'block' };
  let context = null;
  let gameplayActive = false;
  let lastActionAt = 0;
  let lastUiAt = 0;
  let lastResultKey = '';

  function volume(scale = 1) {
    return Math.max(0, Math.min(0.22, (window.AudioManager?.getVolume('player') ?? 0.8) * 0.18 * scale));
  }

  function audioContext() {
    if (!context) context = new (window.AudioContext || window.webkitAudioContext)();
    if (context.state === 'suspended') context.resume().catch(() => {});
    return context;
  }

  function tone(frequency, duration = 0.09, options = {}) {
    const ctx = audioContext();
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = options.wave || profile.wave;
    oscillator.frequency.setValueAtTime(Math.max(35, frequency), now);
    if (options.to) oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, options.to), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume(options.level ?? 1)), now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function noise(duration = 0.08, level = 0.6, highpass = 300) {
    const ctx = audioContext();
    const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    gain.gain.value = volume(level);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
  }

  function play(name) {
    if (volume() <= 0 || profile.native) return;
    const p = profile.pitch;
    if (name === 'ui') return tone(p, 0.045, { to:p * 1.08, level:0.45 });
    if (name === 'start') {
      tone(p, 0.09, { to:p * 1.5, level:0.75 });
      return setTimeout(() => tone(p * 1.5, 0.13, { to:p * 2, level:0.7 }), 85);
    }
    if (name === 'correct') {
      tone(p * 1.2, 0.08, { to:p * 1.5, level:0.7 });
      return setTimeout(() => tone(p * 1.8, 0.14, { level:0.8 }), 70);
    }
    if (name === 'incorrect') {
      tone(p * 0.85, 0.12, { to:p * 0.55, wave:'sawtooth', level:0.65 });
      return setTimeout(() => tone(p * 0.5, 0.11, { level:0.5 }), 90);
    }
    if (name === 'win') {
      [1, 1.25, 1.5, 2].forEach((step, i) => setTimeout(() => tone(p * step, 0.16, { level:0.72 }), i * 90));
      return;
    }
    if (name === 'lose') {
      [1, .8, .62].forEach((step, i) => setTimeout(() => tone(p * step, 0.2, { to:p * step * .85, level:0.68 }), i * 120));
      return;
    }
    if (name === 'purchase') {
      tone(p * 1.4, 0.06, { level:0.55 });
      return setTimeout(() => tone(p * 2.1, 0.12, { level:0.7 }), 55);
    }
    if (name !== 'action' || profile.nativeAction) return;
    if (['impact','rock','blast','shot'].includes(profile.action)) noise(profile.action === 'blast' ? .18 : .07, .75, profile.action === 'blast' ? 70 : 240);
    if (profile.action === 'engine') tone(p, .12, { to:p * 2.2, wave:'sawtooth', level:.45 });
    else if (profile.action === 'boost') tone(p, .13, { to:p * 3, wave:'sawtooth', level:.45 });
    else if (profile.action === 'splash') { noise(.1, .35, 850); tone(p, .1, { to:p * .55, level:.35 }); }
    else if (profile.action === 'slice') { noise(.055, .45, 1800); tone(p * 1.5, .06, { to:p * 2.2, level:.4 }); }
    else if (profile.action === 'ping' || profile.action === 'note') tone(p, .11, { to:p * 1.04, level:.55 });
    else if (profile.action === 'metal') { tone(p, .08, { to:p * .7, wave:'square', level:.45 }); noise(.035, .25, 1200); }
    else tone(p, .065, { to:p * .78, level:.45 });
  }

  function words(node) {
    return String(node?.getAttribute?.('aria-label') || node?.title || node?.textContent || '').trim().toLowerCase();
  }

  function classifyClick(target) {
    const control = target.closest?.('button, [role="button"], .btn, input[type="button"], input[type="submit"]');
    if (!control || control.disabled || /mute|volume|sound/.test(words(control))) return '';
    const label = words(control);
    if (/start|play|begin|fight|race|single player|new game|launch/.test(label)) return 'start';
    if (/buy|purchase|unlock|equip|upgrade|reroll/.test(label)) return 'purchase';
    return 'ui';
  }

  function answerState(control) {
    const scope = control.closest?.('[class*="question" i], [id*="question" i], .modal, [role="dialog"]') || control.parentElement;
    const classes = String(control.className || '').toLowerCase();
    if (/incorrect|wrong/.test(classes)) return 'incorrect';
    if (/correct|right/.test(classes)) return 'correct';
    const feedback = scope?.querySelector?.('[class*="feedback" i], [id*="feedback" i], [id*="result" i]');
    const response = `${feedback?.className || ''} ${words(feedback)}`.toLowerCase();
    if (/incorrect|wrong|try again/.test(response)) return 'incorrect';
    if (/\bcorrect\b|great job|well done/.test(response)) return 'correct';
    return '';
  }

  function inspectResults() {
    const nodes = [...document.querySelectorAll('[id*="gameover" i], [id*="game-over" i], [id*="result" i], [role="dialog"], .modal-overlay')];
    const visible = nodes.find(node => {
      const style = getComputedStyle(node);
      return !node.hidden && style.display !== 'none' && style.visibility !== 'hidden' && !node.classList.contains('hidden') &&
        /game over|run over|overrun|knocked out|match complete|race complete|you win|you lose|victory|defeat|wins|run complete|invasion ended|castle conquered/i.test(node.textContent || '');
    });
    if (!visible) { lastResultKey = ''; return; }
    const key = `${visible.id}:${words(visible).slice(0, 100)}`;
    if (key === lastResultKey) return;
    lastResultKey = key;
    play(/you win|victory|race complete|match complete|run complete|castle conquered|wins/i.test(words(visible)) ? 'win' : 'lose');
  }

  window.addEventListener('arcade-gameplay-active', event => { gameplayActive = Boolean(event.detail?.active); });
  window.addEventListener('arcade-sfx', event => play(event.detail?.name));
  document.addEventListener('click', event => {
    const now = performance.now();
    const kind = classifyClick(event.target);
    if (kind && now - lastUiAt > 45) { lastUiAt = now; play(kind); }
    const control = event.target.closest?.('button, [role="button"], .option, [class*="answer" i]');
    if (control) setTimeout(() => { const state = answerState(control); if (state) play(state); }, 40);
  }, true);
  document.addEventListener('pointerdown', event => {
    if (!gameplayActive || event.target.closest?.('button, [role="button"], input, select, textarea')) return;
    const now = performance.now();
    if (now - lastActionAt > 90) { lastActionAt = now; play('action'); }
  }, true);
  document.addEventListener('keydown', event => {
    if (!gameplayActive || event.repeat || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)) return;
    const now = performance.now();
    if (now - lastActionAt > 100) { lastActionAt = now; play('action'); }
  }, true);
  document.addEventListener('DOMContentLoaded', () => {
    inspectResults();
    new MutationObserver(inspectResults).observe(document.body, { subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['class','style','hidden'] });
  });

  window.ArcadeSFXManager = Object.freeze({ gameId, play, profile: { ...profile } });
})();

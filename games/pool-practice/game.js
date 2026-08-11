/* ============================================================
   game.js
   Main game controller. Wires together poolPhysics, poolAI,
   the shared QuestionManager/PlatformManager/MultiplayerManager
   (via multiplayer.js), and all the UI screens in index.html.
   ============================================================ */

(function () {
  'use strict';

  // ---------------------------------------------------------
  // Tiny arcade SFX (synthesized — no audio files needed)
  // ---------------------------------------------------------
  const SFX = (function () {
    let ctx = null;
    let muted = false;
    function ensureCtx() { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); return ctx; }
    function beep(freq, durMs, type, gainVal) {
      if (muted) return;
      try {
        const c = ensureCtx();
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = type || 'square';
        osc.frequency.value = freq;
        gain.gain.value = gainVal || 0.06;
        osc.connect(gain); gain.connect(c.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durMs / 1000);
        osc.stop(c.currentTime + durMs / 1000);
      } catch (e) { /* audio not available */ }
    }
    return {
      setMuted: (m) => { muted = m; },
      isMuted: () => muted,
      cueStrike: () => beep(180, 90, 'square', 0.09),
      ballCollide: () => beep(520, 45, 'triangle', 0.05),
      cushion: () => beep(300, 35, 'triangle', 0.04),
      pocket: () => beep(720, 160, 'sine', 0.08),
      correct: () => { beep(660, 100, 'square'); setTimeout(() => beep(880, 140, 'square'), 90); },
      incorrect: () => { beep(220, 160, 'sawtooth'); setTimeout(() => beep(140, 220, 'sawtooth'), 120); },
      bonus: () => { beep(500, 80, 'square'); setTimeout(() => beep(750, 80, 'square'), 80); setTimeout(() => beep(1000, 140, 'square'), 160); },
      turnChange: () => beep(400, 70, 'square', 0.05),
      win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 180, 'square', 0.08), i * 130)); },
      loss: () => { [400, 320, 240].forEach((f, i) => setTimeout(() => beep(f, 220, 'sawtooth', 0.07), i * 150)); }
    };
  })();

  // ---------------------------------------------------------
  // DOM shortcuts
  // ---------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const screens = {};
  document.querySelectorAll('.screen').forEach(el => { screens[el.id] = el; });
  function showScreen(id) {
    Object.values(screens).forEach(el => el.classList.remove('active'));
    if (screens[id]) screens[id].classList.add('active');
    if (id === 'screen-menu') updateHomeStats();
  }

  const canvas = $('table-canvas');
  const ctx2d = canvas.getContext('2d');

  // ---------------------------------------------------------
  // Game state
  // ---------------------------------------------------------
  const S = {
    playerMode: 'single',    // 'single' | 'multiplayer'
    difficulty: 'medium',
    questionMode: 'earn_your_shot',

    table: new PoolTable(),
    players: [],             // [{name, group, seat, isAI}]
    currentPlayerIndex: 0,
    firstShotOfMatch: true,

    phase: 'menu',           // question | aiming | simulating | mulligan | gameover | waiting-opponent
    activeBonus: null,
    mulliganUsed: false,
    preShotState: null,
    lastEvents: null,

    aimAngle: null,
    aiming: false,
    power: 0.55,

    timerEnabled: GameConfig.turnTimer.enabled,
    timerSeconds: GameConfig.turnTimer.baseSeconds,
    timerHandle: null,

    matchStartTime: 0,
    questionsAnswered: 0,
    questionsCorrect: 0,
    ballsPocketedTotal: 0,
    loadedQuestionKey: null,
    safetyShotUsed: false,

    mp: null,                // { roomCode, playerId, localSeat, lastAppliedVersion }
    cosmetics: { felt: null, cueStick: null, cueBall: null, aimLine: null }
  };

  const SHOP_KEY = 'arcadeAcademy.poolPractice.shop';
  const PoolStore = {
    getInventory() {
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(SHOP_KEY) || '{}'); } catch (_) {}
      return { coins: PlatformManager.getCoins(), ownedItems: saved.ownedItems || [], equippedItems: saved.equippedItems || {} };
    },
    save(inventory) {
      localStorage.setItem(SHOP_KEY, JSON.stringify({ ownedItems: inventory.ownedItems, equippedItems: inventory.equippedItems }));
    },
    purchase(item) {
      const inventory = this.getInventory();
      if (inventory.ownedItems.includes(item.id)) return { ok: true };
      if (!PlatformManager.spendCoins(item.cost)) return { ok: false };
      inventory.ownedItems.push(item.id);
      this.save(inventory);
      return { ok: true };
    },
    equip(category, id) {
      const inventory = this.getInventory();
      if (!inventory.ownedItems.includes(id)) return { ok: false };
      inventory.equippedItems[category] = id;
      this.save(inventory);
      return { ok: true };
    }
  };

  async function loadCurrentQuestions(questionType) {
    const classCode = PlatformManager.getClassCode();
    if (!classCode) throw new Error('Return to the Hub and enter your class code before playing.');
    const loaded = await MultiplayerQuestionHelper.load({ classCode, questionType });
    if (!loaded.ok) throw new Error('Your current class does not have that question type available.');
  }

  function activePlayer() { return S.players[S.currentPlayerIndex]; }
  function otherPlayer() { return S.players[1 - S.currentPlayerIndex]; }
  function poolReward(slot) { return window.AchievementManager?.getEquipped?.(GameConfig.meta.id)?.[slot] || null; }
  function poolBoost(id) { return !!window.AchievementManager?.hasBoost?.(id); }
  function isMyTurnLocally() {
    if (S.playerMode !== 'multiplayer') return true;
    return activePlayer().seat === S.mp.localSeat;
  }

  // ===========================================================
  // HOME SCREEN — match setup (all condensed onto screen-menu)
  // ===========================================================
  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.getAttribute('data-back')));
  });

  document.querySelectorAll('[data-player-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-player-mode');
      if (mode === S.playerMode) return;
      S.playerMode = mode;
      document.querySelectorAll('[data-player-mode]').forEach(b => b.classList.toggle('active', b === btn));
      const isMulti = mode === 'multiplayer';
      $('difficulty-group').classList.toggle('hidden', isMulti);
      $('btn-start-single').classList.toggle('hidden', isMulti);
      $('multiplayer-actions').classList.toggle('hidden', !isMulti);
      if (!isMulti) resetMultiplayerSetup();
    });
  });

  document.querySelectorAll('[data-difficulty]').forEach(btn => {
    btn.addEventListener('click', () => {
      S.difficulty = btn.getAttribute('data-difficulty');
      document.querySelectorAll('[data-difficulty]').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  document.querySelectorAll('[data-qmode]').forEach(btn => {
    btn.addEventListener('click', () => {
      S.questionMode = btn.getAttribute('data-qmode');
      document.querySelectorAll('[data-qmode]').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  $('btn-start-single').addEventListener('click', async () => {
    $('menu-error').textContent = '';
    try {
      await loadCurrentQuestions($('question-type').value);
      startLocalMatch();
    } catch (error) { $('menu-error').textContent = error.message; }
  });

  // ---- shop ----
  $('btn-shop').addEventListener('click', () => { renderShop(); showScreen('screen-shop'); });

  function renderShop() {
    const inv = PoolStore.getInventory();
    $('shop-coin-balance').textContent = inv.coins + ' COINS';
    const items = GameConfig.shop.items;
    const container = $('shop-items');

    if (!items.length) {
      container.innerHTML = '<p class="shop-empty">More items coming soon! Keep winning matches to save up coins.</p>';
      return;
    }

    container.innerHTML = items.map(it => {
      const owned = inv.ownedItems.includes(it.id);
      const equipped = inv.equippedItems[it.category] === it.id;
      const canAfford = inv.coins >= it.cost;
      let actionHtml;
      if (equipped) actionHtml = `<button class="shop-action-btn equipped" disabled>EQUIPPED</button>`;
      else if (owned) actionHtml = `<button class="shop-action-btn" data-equip="${it.id}">EQUIP</button>`;
      else actionHtml = `<button class="shop-action-btn${canAfford ? '' : ' disabled'}" data-buy="${it.id}" ${canAfford ? '' : 'disabled'}>${it.cost} 🪙 BUY</button>`;

      return `
        <div class="shop-item${equipped ? ' equipped-row' : ''}">
          <div class="shop-item-info">
            <span class="shop-item-name">${it.icon} ${it.name}</span>
            <span class="shop-item-desc">${it.description}</span>
          </div>
          ${actionHtml}
        </div>`;
    }).join('');

    container.querySelectorAll('[data-buy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = items.find(i => i.id === btn.getAttribute('data-buy'));
        const res = PoolStore.purchase(item);
        if (res.ok) { SFX.bonus(); loadCosmetics(); renderShop(); updateHomeStats(); }
      });
    });
    container.querySelectorAll('[data-equip]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = items.find(i => i.id === btn.getAttribute('data-equip'));
        const res = PoolStore.equip(item.category, item.id);
        if (res.ok) { SFX.turnChange(); loadCosmetics(); renderShop(); render(); }
      });
    });
  }

  // Resolves each category's equipped item into the actual value game.js's
  // renderer uses (a color, a gradient pair, etc.), falling back to the
  // built-in default look when nothing's equipped for that slot.
  function loadCosmetics() {
    const inv = PoolStore.getInventory();
    const find = (category) => {
      const id = inv.equippedItems[category];
      if (!id) return null;
      const item = GameConfig.shop.items.find(i => i.id === id);
      return item ? item.value : null;
    };
    S.cosmetics = {
      felt: find('felt'),
      cueStick: find('cueStick'),
      cueBall: find('cueBall'),
      aimLine: find('aimLine')
    };
  }

  // ---- leave the game entirely, back to the wider arcade collection ----
  $('btn-return-hub-home').addEventListener('click', () => { window.location.href = GameConfig.hub.url; });

  // ---- lobby (create/join, now inline on the home screen) ----
  function resetLobbyUI() {
    $('lobby-create-panel').classList.add('hidden');
    $('lobby-join-panel').classList.add('hidden');
    $('join-status').textContent = '';
    $('join-code-input').value = '';
  }
  function resetMultiplayerSetup() {
    resetLobbyUI();
    if (S.mp && !screens['screen-game'].classList.contains('active')) {
      PoolMultiplayer.leave(S.mp.roomCode, S.mp.playerId);
      S.mp = null;
    }
  }

  $('btn-create-room').addEventListener('click', () => createOnlineRoom());

  $('btn-join-room').addEventListener('click', () => {
    resetLobbyUI();
    $('lobby-join-panel').classList.remove('hidden');
  });

  $('btn-submit-join').addEventListener('click', async () => {
    const code = $('join-code-input').value.trim();
    if (!/^\d{5}$/.test(code)) { $('join-status').textContent = 'Enter a valid 5-digit code.'; return; }
    $('join-status').textContent = 'Joining…';
    await joinOnlineRoom(code);
  });

  // ===========================================================
  // ONLINE MULTIPLAYER SETUP
  // ===========================================================
  async function createOnlineRoom() {
    $('menu-error').textContent = '';
    try {
      await loadCurrentQuestions($('question-type').value);
      await PoolMultiplayer.init();
      const playerId = PoolMultiplayer.generatePlayerId();
      const roomCode = await PoolMultiplayer.createRoom(playerId, S.questionMode, $('question-type').value);
      S.mp = { roomCode, playerId, localSeat: 0, lastAppliedVersion: -1 };

      resetLobbyUI();
      $('lobby-create-panel').classList.remove('hidden');
      $('room-code-display').textContent = roomCode;
      $('lobby-status').textContent = 'Waiting for Player 2…';

      PoolMultiplayer.subscribe(roomCode, onRoomUpdate);
    } catch (error) { $('menu-error').textContent = error.message || 'Could not create the room.'; }
  }

  async function joinOnlineRoom(code) {
    try { await PoolMultiplayer.init(); } catch (error) { $('join-status').textContent = error.message; return; }
    const playerId = PoolMultiplayer.generatePlayerId();
    const res = await PoolMultiplayer.joinRoom(code);
    if (!res.ok) {
      $('join-status').textContent = res.reason === 'not_found' ? 'Room not found.' : 'That room is full.';
      return;
    }
    S.mp = { roomCode: code, playerId, localSeat: 1, lastAppliedVersion: -1 };
    PoolMultiplayer.subscribe(code, onRoomUpdate);
    $('join-status').textContent = 'Joined! Starting match…';
  }

  async function onRoomUpdate(room) {
    if (!room) return;
    const match = room._match;
    if (match?.settings?.questionType) {
      const key = `${PlatformManager.getClassCode()}:${match.settings.questionType}`;
      if (S.loadedQuestionKey !== key) {
        try {
          await loadCurrentQuestions(match.settings.questionType);
          S.loadedQuestionKey = key;
        } catch (error) {
          $('join-status').textContent = error.message;
          return;
        }
      }
    }
    if (match && S.mp) S.mp.localSeat = match.player1?.uid === S.mp.playerId ? 0 : 1;
    $('disconnect-banner').classList.toggle('hidden', !isOpponentDisconnected(room));

    // Lobby: host waiting screen updates when guest joins & match kicks off.
    if (room.status === 'active' && room.balls === null && S.mp && S.mp.localSeat === 0) {
      // Host sees guest joined -> deals the opening rack and pushes the first real state.
      $('lobby-status').textContent = 'Player 2 connected! Racking…';
      beginOnlineMatchAsHost(room);
      return;
    }
    if (room.status === 'active' && room.balls === null) {
      $('join-status').textContent = 'Waiting for host to rack…';
      return;
    }

    // Rematch handshake: doesn't bump gameStateVersion, so check it independent of the
    // version-gate below. Once both seats are ready, the host resets the table.
    if (S.phase === 'gameover' && room.rematchReady) {
      const bothReady = room.rematchReady['0'] && room.rematchReady['1'];
      if (bothReady) {
        $('rematch-status').textContent = 'Both players ready — starting rematch!';
        if (S.mp.localSeat === 0) resetOnlineMatchAsHost(room);
      } else if (room.rematchReady[String(S.mp.localSeat)]) {
        $('rematch-status').textContent = 'Waiting for opponent to accept rematch…';
      }
    }

    if (room.gameStateVersion === S.mp.lastAppliedVersion) return; // nothing new
    S.mp.lastAppliedVersion = room.gameStateVersion;
    applyRemoteRoomState(room);
  }

  async function resetOnlineMatchAsHost(room) {
    S.table.rack();
    S.players.forEach(p => p.group = null);
    S.currentPlayerIndex = 1 - S.currentPlayerIndex; // swap who breaks
    const patch = {
      status: 'active',
      balls: S.table.serialize(),
      groups: { 0: null, 1: null },
      currentTurnSeat: S.currentPlayerIndex,
      winnerSeat: null,
      rematchReady: {}
    };
    await PoolMultiplayer.pushState(S.mp.roomCode, room.gameStateVersion, patch);
  }

  function isOpponentDisconnected(room) {
    const mySeat = S.mp ? S.mp.localSeat : null;
    if (mySeat === null) return false;
    const oppKey = mySeat === 0 ? room.guest : room.host;
    return !!room['disconnected_' + oppKey];
  }

  async function beginOnlineMatchAsHost(room) {
    S.table.rack();
    S.players = [
      { name: 'Player 1', group: null, seat: 0, isAI: false },
      { name: 'Player 2', group: null, seat: 1, isAI: false }
    ];
    S.currentPlayerIndex = Math.random() < 0.5 ? 0 : 1; // random breaker
    S.firstShotOfMatch = true;
    resetMatchCounters();

    const patch = {
      status: 'active',
      balls: S.table.serialize(),
      groups: { 0: null, 1: null },
      currentTurnSeat: S.currentPlayerIndex,
      pocketed: [],
      winnerSeat: null,
      matchStartedAt: Date.now()
    };
    await PoolMultiplayer.pushState(S.mp.roomCode, room.gameStateVersion, patch);
    // The resulting room update (version 1) arrives via the subscription and calls applyRemoteRoomState.
  }

  function applyRemoteRoomState(room) {
    const previousBalls = S.table.balls.map(b => ({ n: b.number, x: b.x, y: b.y, pocketed: b.pocketed }));
    S.table.deserialize(room.balls);
    S.questionMode = room.questionMode;
    S.players = [
      { name: 'Player 1', group: room.groups['0'] !== undefined ? room.groups['0'] : room.groups[0], seat: 0, isAI: false },
      { name: 'Player 2', group: room.groups['1'] !== undefined ? room.groups['1'] : room.groups[1], seat: 1, isAI: false }
    ];
    S.currentPlayerIndex = room.currentTurnSeat;
    S.playerMode = 'multiplayer';

    if (screens['screen-game'].classList.contains('active') === false) {
      PlatformManager.startSession(GameConfig.meta.id);
      resetMatchCounters();
      showScreen('screen-game');
      resizeCanvas();
    }

    updateHud();
    renderBallTray();

    const targetBalls = S.table.balls.map(b => ({ n: b.number, x: b.x, y: b.y, pocketed: b.pocketed }));
    const hadPreviousMatch = previousBalls.length > 0;
    if (hadPreviousMatch) tweenRemoteBalls(previousBalls, targetBalls); else render();

    if (room.winnerSeat !== null && room.winnerSeat !== undefined) {
      setTimeout(() => endGame(S.players.find(p => p.seat === room.winnerSeat)), hadPreviousMatch ? 650 : 0);
      return;
    }
    setTimeout(beginTurn, hadPreviousMatch ? 650 : 0);
  }

  /**
   * The receiving client in multiplayer only ever gets a before/after state
   * (no frame-by-frame physics is sent, per design) — so we can't replay the
   * opponent's exact shot. Instead we ease the balls from their last known
   * positions to the new authoritative positions, which still reads as
   * motion rather than a jarring snap.
   */
  function tweenRemoteBalls(from, to, durationMs) {
    durationMs = durationMs || 650;
    const start = performance.now();
    const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);

    function frame(now) {
      const t = Math.min(1, (now - start) / durationMs);
      const e = easeOutQuad(t);
      S.table.balls.forEach((b, i) => {
        const a = from[i], z = to[i];
        if (!a || !z) return;
        // Balls pocketed in the new state fade out positionally toward their final spot immediately.
        b.x = z.pocketed ? z.x : a.x + (z.x - a.x) * e;
        b.y = z.pocketed ? z.y : a.y + (z.y - a.y) * e;
        b.pocketed = t >= 1 ? z.pocketed : (z.pocketed && t > 0.7);
      });
      render();
      if (t < 1) requestAnimationFrame(frame); else renderBallTray();
    }
    requestAnimationFrame(frame);
  }

  // ===========================================================
  // MATCH SETUP (single player / local)
  // ===========================================================
  function startLocalMatch() {
    PlatformManager.startSession(GameConfig.meta.id);
    S.table.rack();
    S.players = [
      { name: 'You', group: null, seat: 0, isAI: false },
      { name: 'CPU', group: null, seat: 1, isAI: S.playerMode === 'single' }
    ];
    S.currentPlayerIndex = Math.random() < 0.5 ? 0 : 1;
    S.firstShotOfMatch = true;
    resetMatchCounters();
    showScreen('screen-game');
    resizeCanvas();
    beginTurn();
  }

  function resetMatchCounters() {
    S.matchStartTime = Date.now();
    S.questionsAnswered = 0;
    S.questionsCorrect = 0;
    S.ballsPocketedTotal = 0;
    S.mulliganUsed = false;
    S.safetyShotUsed = false;
    S.activeBonus = null;
    updateHud();
    renderBallTray();
  }

  // ===========================================================
  // TURN LOOP
  // ===========================================================
  function beginTurn() {
    S.activeBonus = null;
    S.mulliganUsed = false;
    S.aimAngle = null;
    hideBanner('bonus-banner');
    hideBanner('foul-banner');
    updateHud();

    if (S.playerMode === 'multiplayer' && !isMyTurnLocally()) {
      S.phase = 'waiting-opponent';
      setControlsEnabled(false);
      $('hud-turn').textContent = `${otherPlayerLabel()}'s Turn`;
      return;
    }

    if (activePlayer().isAI) {
      S.phase = 'ai-turn';
      setControlsEnabled(false);
      setTimeout(runAITurn, 650 + Math.random() * 500);
      return;
    }

    presentQuestion();
  }

  function otherPlayerLabel() { return otherPlayer().name; }

  // ---- Question phase ----
  async function presentQuestion() {
    S.phase = 'question';
    setControlsEnabled(false);
    const q = MultiplayerQuestionHelper.next();
    if (!q) {
      $('menu-error').textContent = 'No questions are available for the selected class bank.';
      showScreen('screen-menu');
      return;
    }
    renderQuestion(q);
    $('overlay-question').classList.remove('hidden');
  }

  function renderQuestion(q) {
    $('question-text').textContent = q.prompt;
    $('question-feedback').classList.add('hidden');
    $('question-feedback').textContent = '';
    const grid = $('answer-grid');
    grid.innerHTML = '';
    q.answers.forEach((answer, index) => {
      const b = document.createElement('button');
      b.className = 'answer-btn';
      b.textContent = answer.text;
      b.addEventListener('click', () => onAnswer(q, answer, index, b));
      grid.appendChild(b);
    });
  }

  async function onAnswer(question, answer, answerIndex, btnEl) {
    document.querySelectorAll('#answer-grid .answer-btn').forEach(b => b.disabled = true);
    const result = { correct: answer.correct };
    MultiplayerQuestionHelper.record(question, result.correct);
    S.questionsAnswered++;
    if (result.correct) S.questionsCorrect++;
    PlatformManager.recordQuestionAnswered(GameConfig.meta.id, result.correct);

    btnEl.classList.add(result.correct ? 'correct' : 'incorrect');
    if (!result.correct) {
      const correctIndex = question.answers.findIndex(option => option.correct);
      const correctBtn = document.querySelectorAll('#answer-grid .answer-btn')[correctIndex];
      if (correctBtn) correctBtn.classList.add('correct');
    }

    const fb = $('question-feedback');
    fb.classList.remove('hidden');

    if (S.questionMode === 'earn_your_shot') {
      if (result.correct) {
        SFX.correct();
        fb.textContent = 'CORRECT — TAKE YOUR SHOT';
        fb.className = 'question-feedback correct';
        setTimeout(() => { $('overlay-question').classList.add('hidden'); enterAimingPhase(); }, 850);
      } else {
        SFX.incorrect();
        if (S.playerMode === 'single' && !S.safetyShotUsed && poolBoost('pool-practice_safety_shot')) {
          S.safetyShotUsed = true;
          fb.textContent = 'SAFETY SHOT — YOUR TURN IS SAVED';
          fb.className = 'question-feedback correct';
          setTimeout(() => { $('overlay-question').classList.add('hidden'); enterAimingPhase(); }, 950);
          return;
        }
        fb.textContent = 'INCORRECT — TURN LOST';
        fb.className = 'question-feedback incorrect';
        setTimeout(() => {
          $('overlay-question').classList.add('hidden');
          showBanner('foul-banner', 'TURN LOST');
          finishTurnPass();
        }, 1000);
      }
    } else { // bonus_pool
      if (result.correct) {
        SFX.correct();
        const bonus = pickRandomBonus();
        S.activeBonus = bonus ? bonus.id : null;
        fb.textContent = 'CORRECT — BONUS AWARDED';
        fb.className = 'question-feedback correct';
        setTimeout(() => {
          $('overlay-question').classList.add('hidden');
          if (bonus) revealBonus(bonus);
          enterAimingPhase();
        }, 850);
      } else {
        SFX.incorrect();
        fb.textContent = 'INCORRECT — NORMAL SHOT';
        fb.className = 'question-feedback incorrect';
        setTimeout(() => { $('overlay-question').classList.add('hidden'); enterAimingPhase(); }, 850);
      }
    }
  }

  function pickRandomBonus() {
    const pool = GameConfig.bonuses.filter(b => !b.requiresTimer || S.timerEnabled);
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function revealBonus(bonus) {
    SFX.bonus();
    showBanner('bonus-banner', `BONUS: ${bonus.icon} ${bonus.label.toUpperCase()}`);
  }

  // ---- Aiming phase ----
  function enterAimingPhase() {
    S.phase = 'aiming';
    S.preShotState = S.table.serialize();
    S.aimAngle = defaultAimAngle();
    S.power = 0.55;
    $('power-slider').value = 55;
    $('power-value').textContent = '55%';
    setControlsEnabled(true);

    let seconds = GameConfig.turnTimer.baseSeconds;
    if (S.activeBonus === 'extra_aim_time') seconds += GameConfig.turnTimer.bonusExtraSeconds;
    startTurnTimer(seconds);
  }

  function defaultAimAngle() {
    const cue = S.table.cueBall;
    if (!cue) return 0;
    // point toward table center by default
    return Math.atan2(S.table.height / 2 - cue.y, S.table.width / 2 - cue.x);
  }

  function startTurnTimer(seconds) {
    stopTurnTimer();
    if (!S.timerEnabled) { $('hud-timer').classList.add('hidden'); return; }
    S.timerSeconds = seconds;
    $('hud-timer').classList.remove('hidden');
    $('hud-timer').textContent = S.timerSeconds + 's';
    S.timerHandle = setInterval(() => {
      S.timerSeconds--;
      $('hud-timer').textContent = Math.max(0, S.timerSeconds) + 's';
      if (S.timerSeconds <= 0) {
        stopTurnTimer();
        takeShot(); // auto-shoot with whatever aim/power is currently set
      }
    }, 1000);
  }
  function stopTurnTimer() {
    if (S.timerHandle) clearInterval(S.timerHandle);
    S.timerHandle = null;
  }

  $('btn-shoot').addEventListener('click', () => { if (S.phase === 'aiming') takeShot(); });
  $('power-slider').addEventListener('input', (e) => {
    S.power = Number(e.target.value) / 100;
    $('power-value').textContent = e.target.value + '%';
  });

  function setControlsEnabled(enabled) {
    $('btn-shoot').disabled = !enabled;
    $('power-slider').disabled = !enabled;
  }

  // ---- Shooting & physics resolution ----
  function takeShot() {
    stopTurnTimer();
    S.phase = 'simulating';
    setControlsEnabled(false);
    SFX.cueStrike();

    const { events, frames } = simulateShot(S.table, S.aimAngle, S.power);
    S.lastEvents = events;
    playbackFrames(frames, events);
  }

  /**
   * Plays the actual simulated motion back in real time (frames were sampled
   * at ~60fps during simulateShot) instead of jump-cutting to the resting
   * positions. Time-based stepping keeps playback speed correct regardless
   * of the display's refresh rate.
   */
  function playbackFrames(frames, events) {
    if (!frames || frames.length < 2) { onPlaybackComplete(events); return; }
    const frameDurationMs = 1000 / 60;
    const start = performance.now();
    let idx = 0;

    function step(now) {
      const targetIdx = Math.min(frames.length - 1, Math.floor((now - start) / frameDurationMs));
      while (idx <= targetIdx) {
        const f = frames[idx];
        applyFrameToTable(f);
        if (f.cushioned) SFX.cushion();
        if (f.collided) SFX.ballCollide();
        f.newPockets.forEach(() => SFX.pocket());
        idx++;
      }
      render();
      if (idx < frames.length) {
        requestAnimationFrame(step);
      } else {
        renderBallTray();
        onPlaybackComplete(events);
      }
    }
    requestAnimationFrame(step);
  }

  function applyFrameToTable(frame) {
    // Index-matched (not number-matched) since table.balls order is stable
    // for the duration of a single shot's playback.
    S.table.balls.forEach((b, i) => {
      const fb = frame.balls[i];
      if (fb) { b.x = fb.x; b.y = fb.y; b.pocketed = fb.pocketed; }
    });
  }

  function onPlaybackComplete(events) {
    renderBallTray();
    render();
    if (S.activeBonus === 'mulligan' && !S.mulliganUsed) {
      offerMulligan();
    } else {
      finalizeShot(events);
    }
  }

  function offerMulligan() {
    $('overlay-mulligan').classList.remove('hidden');
    const keepHandler = () => { cleanup(); finalizeShot(S.lastEvents); };
    const retryHandler = () => {
      cleanup();
      S.mulliganUsed = true;
      S.table.deserialize(S.preShotState);
      render();
      renderBallTray();
      enterAimingPhase();
    };
    function cleanup() {
      $('overlay-mulligan').classList.add('hidden');
      $('btn-keep-shot').removeEventListener('click', keepHandler);
      $('btn-retry-shot').removeEventListener('click', retryHandler);
    }
    $('btn-keep-shot').addEventListener('click', keepHandler);
    $('btn-retry-shot').addEventListener('click', retryHandler);
  }

  // ===========================================================
  // RULES ENGINE
  // ===========================================================
  function finalizeShot(events) {
    const player = activePlayer();
    const opponent = otherPlayer();
    let foul = false;
    let foulReason = '';

    // No contact at all -> foul.
    if (!events.firstContact) { foul = true; foulReason = 'No ball contacted'; }

    // Wrong-group first contact (once groups are assigned).
    if (!foul && player.group && events.firstContact) {
      const contactedBall = events.firstContact.ball;
      const contactedIsEight = contactedBall === 8;
      const contactedIsOwnGroup = player.group === 'solids' ? (contactedBall >= 1 && contactedBall <= 7) : (contactedBall >= 9 && contactedBall <= 15);
      const groupCleared = S.table.activeBalls.filter(b => (player.group === 'solids' ? b.isSolid : b.isStripe)).length === 0;
      if (contactedIsEight && !groupCleared) { foul = true; foulReason = 'Hit the 8-ball early'; }
      else if (!contactedIsEight && !contactedIsOwnGroup) { foul = true; foulReason = "Hit opponent's ball first"; }
    }

    // Scratch.
    if (events.cueScratched) { foul = true; foulReason = foulReason || 'Scratched'; }

    // 8-ball pocketed -> immediate win/loss.
    if (events.pocketed.includes(8)) {
      const groupCleared = !player.group || S.table.activeBalls.filter(b => (player.group === 'solids' ? b.isSolid : b.isStripe)).length === 0;
      if (!groupCleared || events.cueScratched) {
        SFX.loss();
        endGame(opponent, { reason: !groupCleared ? '8-ball pocketed early' : '8-ball pocketed on a scratch' });
      } else {
        SFX.win();
        endGame(player, { reason: 'Legally pocketed the 8-ball' });
      }
      pushOnlineStateIfNeeded(true);
      return;
    }

    // Group assignment on first legal pot of the match.
    if (!foul && !player.group && !opponent.group) {
      const potted = events.pocketed.filter(n => n >= 1 && n <= 7 || n >= 9 && n <= 15);
      if (potted.length) {
        const firstGroup = (potted[0] <= 7) ? 'solids' : 'stripes';
        player.group = firstGroup;
        opponent.group = firstGroup === 'solids' ? 'stripes' : 'solids';
      }
    }

    S.ballsPocketedTotal += events.pocketed.length;

    // Scratch respot.
    if (events.cueScratched) {
      respotCueBall();
    }

    // Did the player pot one of their own balls (or any object ball if table still open)?
    const ownPot = events.pocketed.some(n => {
      if (n === 0 || n === 8) return false;
      if (!player.group) return true;
      return player.group === 'solids' ? (n >= 1 && n <= 7) : (n >= 9 && n <= 15);
    });

    const continueTurn = !foul && ownPot;

    if (foul) showBanner('foul-banner', 'FOUL' + (foulReason ? ': ' + foulReason.toUpperCase() : ''));

    if (!continueTurn) {
      SFX.turnChange();
      finishTurnPass();
    } else {
      renderBallTray();
      pushOnlineStateIfNeeded(false);
      if (S.playerMode !== 'multiplayer') beginTurn();
    }
  }

  function respotCueBall() {
    const spotX = S.table.width * 0.25, spotY = S.table.height / 2;
    let x = spotX, y = spotY, tries = 0;
    while (tries < 20 && S.table.activeBalls.some(b => !b.isCue && Math.hypot(b.x - x, b.y - y) < GameConfig.ball.radius * 2.2)) {
      x = spotX + (Math.random() * 60 - 30);
      y = spotY + (Math.random() * 60 - 30);
      tries++;
    }
    const cueGhost = new Ball(0, x, y);
    S.table.balls.push(cueGhost);
  }

  function finishTurnPass() {
    S.currentPlayerIndex = 1 - S.currentPlayerIndex;
    renderBallTray();
    pushOnlineStateIfNeeded(false);
    if (S.playerMode !== 'multiplayer') beginTurn();
  }

  function pushOnlineStateIfNeeded(isGameOver) {
    if (S.playerMode !== 'multiplayer') return;
    const patch = {
      balls: S.table.serialize(),
      groups: { 0: S.players[0].group, 1: S.players[1].group },
      currentTurnSeat: S.currentPlayerIndex,
      winnerSeat: isGameOver ? S.winnerSeatPending : null
    };
    PoolMultiplayer.pushState(S.mp.roomCode, S.mp.lastAppliedVersion, patch).then(res => {
      if (res.ok) {
        // local echo will also arrive via subscription; version bump keeps us in sync
      }
    });
  }

  // ===========================================================
  // AI TURN (single player)
  // ===========================================================
  function runAITurn() {
    const player = activePlayer();
    const shot = PoolAI.chooseShot(S.table, player.group, S.difficulty);
    S.preShotState = S.table.serialize();
    S.aimAngle = shot.angle;
    S.power = shot.power;
    S.phase = 'simulating';
    SFX.cueStrike();
    const { events, frames } = simulateShot(S.table, shot.angle, shot.power);
    S.lastEvents = events;
    playbackFrames(frames, events);
  }

  // ===========================================================
  // GAME OVER
  // ===========================================================
  function endGame(winnerPlayer, meta) {
    S.phase = 'gameover';
    stopTurnTimer();
    setControlsEnabled(false);
    S.winnerSeatPending = winnerPlayer.seat;
    const durationMs = Date.now() - S.matchStartTime;
    // Record from each local client's own perspective (in multiplayer, host and
    // guest each call endGame locally and log their own win/loss).
    const localWon = S.playerMode === 'multiplayer' ? winnerPlayer.seat === S.mp.localSeat : !winnerPlayer.isAI;
    const coinsAwarded = (S.playerMode === 'single' && localWon) ? (GameConfig.coinRewards[S.difficulty] || 0) : 0;
    PlatformManager.recordMultiplayerResult(GameConfig.meta.id, localWon ? 'win' : 'loss');
    if (localWon && S.ballsPocketedTotal >= 7) {
      window.AchievementManager?.notify?.('pool_run_the_table', { facts: { mastery_pool_practice: 1 } });
    }
    if (coinsAwarded > 0) PlatformManager.addCoins(coinsAwarded);
    PlatformManager.endSession(GameConfig.meta.id);

    $('gameover-title').textContent = `${winnerPlayer.name.toUpperCase()} WINS!`;
    const accuracy = S.questionsAnswered ? Math.round((S.questionsCorrect / S.questionsAnswered) * 100) : 0;
    const stats = [
      ['Match duration', formatDuration(durationMs)],
      ['Balls pocketed', String(S.ballsPocketedTotal)],
      ['Questions answered', String(S.questionsAnswered)],
      ['Questions correct', String(S.questionsCorrect)],
      ['Question accuracy', accuracy + '%'],
      ['Match type', S.playerMode === 'multiplayer' ? 'Multiplayer' : 'Single-player']
    ];
    if (coinsAwarded > 0) stats.push(['Coins earned', '+' + coinsAwarded + ' 🪙']);
    $('gameover-stats').innerHTML = stats.map(([k, v]) => `<div class="stat-row"><span>${k}</span><span>${v}</span></div>`).join('');
    $('rematch-status').textContent = '';
    $('overlay-gameover').classList.remove('hidden');
  }

  function formatDuration(ms) {
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${String(rem).padStart(2, '0')}`;
  }

  $('btn-return-hub').addEventListener('click', () => {
    $('overlay-gameover').classList.add('hidden');
    if (S.mp) { PoolMultiplayer.leave(S.mp.roomCode, S.mp.playerId); S.mp = null; }
    showScreen('screen-menu');
  });

  $('btn-rematch').addEventListener('click', async () => {
    if (S.playerMode === 'multiplayer') {
      $('rematch-status').textContent = 'Waiting for opponent to accept rematch…';
      await PoolMultiplayer.setRematchReady(S.mp.roomCode, S.mp.localSeat === 0 ? '0' : '1');
      // The host performs the actual reset once both seats are marked ready;
      // that transition is picked up in onRoomUpdate above.
    } else {
      $('overlay-gameover').classList.add('hidden');
      S.currentPlayerIndex = 1 - S.currentPlayerIndex; // swap who breaks
      S.table.rack();
      S.firstShotOfMatch = true;
      S.players.forEach(p => p.group = null);
      resetMatchCounters();
      beginTurn();
    }
  });

  // ===========================================================
  // RENDERING
  // ===========================================================
  function resizeCanvas() {
    const wrap = $('table-wrap');
    const aspect = GameConfig.table.width / GameConfig.table.height;
    let w = wrap.clientWidth, h = w / aspect;
    if (h > wrap.clientHeight) { h = wrap.clientHeight; w = h * aspect; }
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx2d.setTransform(dpr * (w / GameConfig.table.width), 0, 0, dpr * (h / GameConfig.table.height), 0, 0);
  }
  window.addEventListener('resize', () => { resizeCanvas(); render(); });

  // ---- static table decoration, computed once so it never flickers/jitters
  // between the ~60 render() calls per second during a shot ----
  function roundRectPath(x, y, w, h, r) {
    ctx2d.beginPath();
    ctx2d.moveTo(x + r, y);
    ctx2d.arcTo(x + w, y, x + w, y + h, r);
    ctx2d.arcTo(x + w, y + h, x, y + h, r);
    ctx2d.arcTo(x, y + h, x, y, r);
    ctx2d.arcTo(x, y, x + w, y, r);
    ctx2d.closePath();
  }

  function buildTableDecor() {
    const cfg = GameConfig.table;
    const grainLines = [];
    for (let i = 0; i < 14; i++) {
      grainLines.push({ y: ((i + 0.5) / 14) * cfg.height, wobble: Math.sin(i * 1.7) * 8, opacity: 0.06 + (i % 3) * 0.02 });
    }
    const diamonds = [];
    const midY = cfg.railWidth * 0.5, midYBottom = cfg.height - cfg.railWidth * 0.5;
    const midXLeft = cfg.railWidth * 0.5, midXRight = cfg.width - cfg.railWidth * 0.5;
    [0.2, 0.35, 0.65, 0.8].forEach(f => {
      diamonds.push({ x: cfg.width * f, y: midY });
      diamonds.push({ x: cfg.width * f, y: midYBottom });
    });
    [0.33, 0.67].forEach(f => {
      diamonds.push({ x: midXLeft, y: cfg.height * f });
      diamonds.push({ x: midXRight, y: cfg.height * f });
    });
    return { grainLines, diamonds };
  }
  const TABLE_DECOR = buildTableDecor();
  const POOL_TRAILS = [];
  const LAST_BALL_POSITIONS = new Map();

  function drawDiamond(x, y) {
    const s = 6;
    ctx2d.save();
    ctx2d.translate(x, y);
    ctx2d.beginPath();
    ctx2d.moveTo(0, -s); ctx2d.lineTo(s, 0); ctx2d.lineTo(0, s); ctx2d.lineTo(-s, 0);
    ctx2d.closePath();
    ctx2d.fillStyle = 'rgba(245,242,233,0.85)';
    ctx2d.fill();
    ctx2d.lineWidth = 1;
    ctx2d.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx2d.stroke();
    ctx2d.restore();
  }

  function drawTableFrame(cfg) {
    // outer wood cabinet, with subtle grain streaks
    ctx2d.save();
    roundRectPath(0, 0, cfg.width, cfg.height, 20);
    ctx2d.clip();
    const wood = ctx2d.createLinearGradient(0, 0, cfg.width, cfg.height);
    wood.addColorStop(0, '#5a3a22');
    wood.addColorStop(0.45, '#3f2716');
    wood.addColorStop(1, '#2a1a0e');
    ctx2d.fillStyle = wood;
    ctx2d.fillRect(0, 0, cfg.width, cfg.height);
    TABLE_DECOR.grainLines.forEach(g => {
      ctx2d.strokeStyle = `rgba(0,0,0,${g.opacity})`;
      ctx2d.lineWidth = 1.4;
      ctx2d.beginPath();
      ctx2d.moveTo(0, g.y);
      ctx2d.bezierCurveTo(cfg.width * 0.3, g.y + g.wobble, cfg.width * 0.7, g.y - g.wobble, cfg.width, g.y);
      ctx2d.stroke();
    });
    ctx2d.restore();

    // raised rubber cushion band between the wood cabinet and the felt
    const r = cfg.railWidth;
    ctx2d.save();
    roundRectPath(r * 0.25, r * 0.25, cfg.width - r * 0.5, cfg.height - r * 0.5, 14);
    ctx2d.clip();
    const bevel = ctx2d.createLinearGradient(0, 0, cfg.width, cfg.height);
    bevel.addColorStop(0, 'rgba(255,255,255,0.10)');
    bevel.addColorStop(0.5, 'rgba(0,0,0,0.05)');
    bevel.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx2d.fillStyle = bevel;
    ctx2d.fillRect(0, 0, cfg.width, cfg.height);
    ctx2d.restore();

    // inlaid sight diamonds
    TABLE_DECOR.diamonds.forEach(d => drawDiamond(d.x, d.y));
  }

  function drawFelt(cfg) {
    const r = cfg.railWidth;
    const x = r, y = r, w = cfg.width - r * 2, h = cfg.height - r * 2;
    ctx2d.save();
    roundRectPath(x, y, w, h, 10);
    ctx2d.clip();

    const academyFelt = poolReward('felt')?.id === 'pool-practice_academy_championship_felt';
    const feltColors = academyFelt ? { top: '#123f78', bottom: '#171b57' } : (S.cosmetics.felt || { top: '#0f6b46', bottom: '#0a4f34' });
    const felt = ctx2d.createLinearGradient(0, y, 0, y + h);
    felt.addColorStop(0, feltColors.top);
    felt.addColorStop(1, feltColors.bottom);
    ctx2d.fillStyle = felt;
    ctx2d.fillRect(x, y, w, h);

    // soft vignette for depth
    const vignette = ctx2d.createRadialGradient(cfg.width / 2, cfg.height / 2, Math.min(w, h) * 0.15, cfg.width / 2, cfg.height / 2, Math.max(w, h) * 0.75);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx2d.fillStyle = vignette;
    ctx2d.fillRect(x, y, w, h);

    // faint diagonal sheen, like light glancing off the cloth nap
    ctx2d.fillStyle = 'rgba(255,255,255,0.035)';
    ctx2d.beginPath();
    ctx2d.moveTo(x, y);
    ctx2d.lineTo(x + w * 0.5, y);
    ctx2d.lineTo(x + w * 0.15, y + h);
    ctx2d.lineTo(x, y + h);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.restore();

    if (academyFelt) {
      ctx2d.save();
      ctx2d.strokeStyle = 'rgba(46,232,255,.32)';
      ctx2d.lineWidth = 2;
      ctx2d.setLineDash([10, 8]);
      ctx2d.strokeRect(x + 14, y + 14, w - 28, h - 28);
      ctx2d.setLineDash([]);
      ctx2d.restore();
    }

    // head string + center spot markings
    ctx2d.save();
    const headX = x + w * 0.25;
    ctx2d.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx2d.lineWidth = 1;
    ctx2d.setLineDash([4, 5]);
    ctx2d.beginPath();
    ctx2d.moveTo(headX, y + 4);
    ctx2d.lineTo(headX, y + h - 4);
    ctx2d.stroke();
    ctx2d.setLineDash([]);
    ctx2d.beginPath();
    ctx2d.arc(headX, cfg.height / 2, 2.2, 0, Math.PI * 2);
    ctx2d.fillStyle = 'rgba(255,255,255,0.25)';
    ctx2d.fill();
    ctx2d.restore();
  }

  function drawPockets() {
    S.table.pockets.forEach(p => {
      const rad = S.table.pocketRadius;
      ctx2d.save();
      const ring = ctx2d.createRadialGradient(p.x, p.y, rad * 0.55, p.x, p.y, rad * 1.18);
      ring.addColorStop(0, 'rgba(0,0,0,0)');
      ring.addColorStop(0.65, 'rgba(45,27,15,0.85)');
      ring.addColorStop(1, 'rgba(18,11,6,0.95)');
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, rad * 1.18, 0, Math.PI * 2);
      ctx2d.fillStyle = ring;
      ctx2d.fill();
      ctx2d.restore();

      const hole = ctx2d.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
      hole.addColorStop(0, '#050505');
      hole.addColorStop(1, '#0c0c0c');
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx2d.fillStyle = hole;
      ctx2d.fill();
      if (poolReward('pocketEffect')?.id === 'pool-practice_pocket_starbursts') {
        const spin = performance.now() / 900;
        ctx2d.save();
        ctx2d.translate(p.x, p.y);
        ctx2d.rotate(spin);
        ctx2d.strokeStyle = 'rgba(255,214,76,.8)';
        ctx2d.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
          ctx2d.rotate(Math.PI / 4);
          ctx2d.beginPath(); ctx2d.moveTo(rad * 1.15, 0); ctx2d.lineTo(rad * 1.55, 0); ctx2d.stroke();
        }
        ctx2d.restore();
      }
    });
  }

  function drawThinkingTanksTable(cfg) {
    if (poolReward('tableOverlay')?.id !== 'pool-practice_thinking_tanks_table') return;
    const r = cfg.railWidth;
    ctx2d.save();
    roundRectPath(r, r, cfg.width - r * 2, cfg.height - r * 2, 10);
    ctx2d.clip();
    ctx2d.strokeStyle = 'rgba(196,226,151,.18)';
    ctx2d.lineWidth = 2;
    for (let y = r + 45; y < cfg.height - r; y += 55) {
      ctx2d.beginPath();
      for (let x = r; x <= cfg.width - r; x += 25) {
        const py = y + Math.sin(x * .035 + y) * 8;
        if (x === r) ctx2d.moveTo(x, py); else ctx2d.lineTo(x, py);
      }
      ctx2d.stroke();
    }
    ctx2d.fillStyle = 'rgba(20,24,34,.28)';
    for (let x = r + 80; x < cfg.width - r; x += 170) ctx2d.fillRect(x, r + 18, 75, 12);
    ctx2d.restore();
  }

  function drawCometTrails() {
    const enabled = poolReward('ballTrail')?.id === 'pool-practice_comet_shot_trails';
    if (!enabled) { POOL_TRAILS.length = 0; LAST_BALL_POSITIONS.clear(); return; }
    S.table.activeBalls.forEach(ball => {
      const previous = LAST_BALL_POSITIONS.get(ball.number);
      if (previous && Math.hypot(ball.x - previous.x, ball.y - previous.y) > .5) {
        POOL_TRAILS.push({ x1: previous.x, y1: previous.y, x2: ball.x, y2: ball.y, hue: (ball.number * 31) % 360, life: 1 });
      }
      LAST_BALL_POSITIONS.set(ball.number, { x: ball.x, y: ball.y });
    });
    ctx2d.save();
    ctx2d.lineCap = 'round';
    for (let i = POOL_TRAILS.length - 1; i >= 0; i--) {
      const trail = POOL_TRAILS[i];
      trail.life -= .035;
      if (trail.life <= 0) { POOL_TRAILS.splice(i, 1); continue; }
      ctx2d.strokeStyle = `hsla(${trail.hue},95%,70%,${trail.life * .7})`;
      ctx2d.lineWidth = 3 * trail.life;
      ctx2d.beginPath(); ctx2d.moveTo(trail.x1, trail.y1); ctx2d.lineTo(trail.x2, trail.y2); ctx2d.stroke();
    }
    ctx2d.restore();
  }

  function render() {
    const cfg = GameConfig.table;
    ctx2d.clearRect(0, 0, cfg.width, cfg.height);

    drawTableFrame(cfg);
    drawFelt(cfg);
    drawThinkingTanksTable(cfg);
    drawPockets();
    drawCometTrails();

    // aim guide (only while aiming, local player's turn)
    if (S.phase === 'aiming' && S.aimAngle !== null) drawAimGuide();

    // balls
    S.table.activeBalls.forEach(drawBall);

    if (S.phase === 'gameover') return;
  }

  function drawBall(b) {
    const color = GameConfig.ballColors[b.number] || '#ccc';
    const prismaticCue = b.number === 0 && poolReward('cueBall')?.id === 'pool-practice_prismatic_cue_ball';
    const cosmicRack = b.number !== 0 && poolReward('ballEffect')?.id === 'pool-practice_cosmic_rack';

    // soft contact shadow on the felt, offset slightly for a light-from-top-left feel
    ctx2d.save();
    ctx2d.beginPath();
    ctx2d.ellipse(b.x + b.radius * 0.22, b.y + b.radius * 0.4, b.radius * 0.95, b.radius * 0.42, 0, 0, Math.PI * 2);
    ctx2d.fillStyle = 'rgba(0,0,0,0.32)';
    ctx2d.fill();
    ctx2d.restore();

    ctx2d.save();
    ctx2d.translate(b.x, b.y);

    // base fill, clipped to the ball's circle
    ctx2d.save();
    ctx2d.beginPath();
    ctx2d.arc(0, 0, b.radius, 0, Math.PI * 2);
    ctx2d.clip();

    if (prismaticCue) {
      const hue = (performance.now() / 18) % 360;
      const prism = ctx2d.createLinearGradient(-b.radius, -b.radius, b.radius, b.radius);
      prism.addColorStop(0, `hsl(${hue},95%,70%)`);
      prism.addColorStop(.5, `hsl(${(hue + 120) % 360},95%,65%)`);
      prism.addColorStop(1, `hsl(${(hue + 240) % 360},95%,70%)`);
      ctx2d.fillStyle = prism;
      ctx2d.fillRect(-b.radius, -b.radius, b.radius * 2, b.radius * 2);
    } else if (cosmicRack) {
      const planet = ctx2d.createRadialGradient(-b.radius * .35, -b.radius * .4, 1, 0, 0, b.radius);
      planet.addColorStop(0, '#fff7a8'); planet.addColorStop(.3, color); planet.addColorStop(1, '#10132e');
      ctx2d.fillStyle = planet;
      ctx2d.fillRect(-b.radius, -b.radius, b.radius * 2, b.radius * 2);
    } else if (b.number >= 9 && b.number <= 15) {
      ctx2d.fillStyle = '#f5f2e9';
      ctx2d.fillRect(-b.radius, -b.radius, b.radius * 2, b.radius * 2);
      ctx2d.fillStyle = color;
      ctx2d.fillRect(-b.radius, -b.radius * 0.55, b.radius * 2, b.radius * 1.1);
    } else if (b.number === 0 && S.cosmetics.cueBall === 'chrome') {
      // Chrome cosmetic: a cool-toned metallic gradient instead of flat white.
      const chrome = ctx2d.createLinearGradient(-b.radius, -b.radius, b.radius, b.radius);
      chrome.addColorStop(0, '#f4f7fb');
      chrome.addColorStop(0.35, '#c7d2de');
      chrome.addColorStop(0.55, '#8f9dad');
      chrome.addColorStop(0.75, '#dbe3ea');
      chrome.addColorStop(1, '#aab4c0');
      ctx2d.fillStyle = chrome;
      ctx2d.fillRect(-b.radius, -b.radius, b.radius * 2, b.radius * 2);
    } else if (b.number === 0) {
      ctx2d.fillStyle = color;
      ctx2d.fillRect(-b.radius, -b.radius, b.radius * 2, b.radius * 2);
    } else {
      ctx2d.fillStyle = color;
      ctx2d.fillRect(-b.radius, -b.radius, b.radius * 2, b.radius * 2);
    }

    // glossy sphere shading: a bright specular highlight up-left, darkening toward the rim
    const shade = ctx2d.createRadialGradient(
      -b.radius * 0.38, -b.radius * 0.42, b.radius * 0.05,
      -b.radius * 0.05, -b.radius * 0.05, b.radius * 1.25
    );
    shade.addColorStop(0, 'rgba(255,255,255,0.95)');
    shade.addColorStop(0.16, 'rgba(255,255,255,0.30)');
    shade.addColorStop(0.45, 'rgba(255,255,255,0)');
    shade.addColorStop(0.85, 'rgba(0,0,0,0.18)');
    shade.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx2d.fillStyle = shade;
    ctx2d.fillRect(-b.radius, -b.radius, b.radius * 2, b.radius * 2);
    ctx2d.restore(); // end clip

    // rim outline
    ctx2d.beginPath();
    ctx2d.arc(0, 0, b.radius, 0, Math.PI * 2);
    ctx2d.lineWidth = 1;
    ctx2d.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx2d.stroke();

    if (cosmicRack) {
      ctx2d.save();
      ctx2d.rotate(-.35);
      ctx2d.scale(1, .38);
      ctx2d.beginPath(); ctx2d.arc(0, 0, b.radius * 1.35, 0, Math.PI * 2);
      ctx2d.strokeStyle = 'rgba(178,224,255,.82)'; ctx2d.lineWidth = 2.5; ctx2d.stroke();
      ctx2d.restore();
    }

    // number disk (skip for cue ball)
    if (b.number !== 0) {
      ctx2d.save();
      ctx2d.beginPath();
      ctx2d.arc(0, 0, b.radius * 0.55, 0, Math.PI * 2);
      ctx2d.fillStyle = 'rgba(0,0,0,0.25)';
      ctx2d.fill();
      ctx2d.beginPath();
      ctx2d.arc(-b.radius * 0.04, -b.radius * 0.04, b.radius * 0.52, 0, Math.PI * 2);
      ctx2d.fillStyle = '#f5f2e9';
      ctx2d.fill();
      ctx2d.fillStyle = '#111';
      ctx2d.font = `${b.radius * 0.6}px 'Space Mono', monospace`;
      ctx2d.textAlign = 'center';
      ctx2d.textBaseline = 'middle';
      ctx2d.fillText(String(b.number), 0, 1);
      ctx2d.restore();
    }
    ctx2d.restore();
  }

  function drawAimGuide() {
    const cue = S.table.cueBall;
    if (!cue) return;
    let len = GameConfig.aim.baseLineLength;
    if (S.activeBonus === 'extended_aim') len = GameConfig.aim.extendedLineLength;

    const ex = cue.x + Math.cos(S.aimAngle) * len;
    const ey = cue.y + Math.sin(S.aimAngle) * len;

    ctx2d.save();
    ctx2d.strokeStyle = S.cosmetics.aimLine || 'rgba(255,255,255,0.55)';
    ctx2d.lineWidth = 2;
    ctx2d.setLineDash([6, 6]);
    ctx2d.beginPath();
    ctx2d.moveTo(cue.x, cue.y);
    ctx2d.lineTo(ex, ey);
    ctx2d.stroke();
    ctx2d.restore();

    // cue stick, drawn behind the cue ball pointing opposite the aim direction
    const stickBack = 34 + (1 - S.power) * 10;
    const sx = cue.x - Math.cos(S.aimAngle) * (cue.radius + stickBack);
    const sy = cue.y - Math.sin(S.aimAngle) * (cue.radius + stickBack);
    const sx2 = cue.x - Math.cos(S.aimAngle) * (cue.radius + stickBack + 140);
    const sy2 = cue.y - Math.sin(S.aimAngle) * (cue.radius + stickBack + 140);
    ctx2d.save();
    ctx2d.strokeStyle = S.cosmetics.cueStick || '#c99a5b';
    ctx2d.lineWidth = 5;
    ctx2d.lineCap = 'round';
    ctx2d.beginPath();
    ctx2d.moveTo(sx, sy);
    ctx2d.lineTo(sx2, sy2);
    ctx2d.stroke();
    ctx2d.restore();

    if (S.activeBonus === 'prediction_line') drawPredictionLine(cue, len);
    if (S.activeBonus === 'power_indicator') drawPowerIndicator(cue);
  }

  function drawPredictionLine(cue, aimLen) {
    // Find the first ball the aim ray would hit within the visible aim length.
    const dirx = Math.cos(S.aimAngle), diry = Math.sin(S.aimAngle);
    let closest = null, closestDist = Infinity;
    S.table.activeBalls.forEach(b => {
      if (b.isCue) return;
      const toBallX = b.x - cue.x, toBallY = b.y - cue.y;
      const proj = toBallX * dirx + toBallY * diry;
      if (proj <= 0) return;
      const closestX = cue.x + dirx * proj, closestY = cue.y + diry * proj;
      const distToLine = Math.hypot(b.x - closestX, b.y - closestY);
      if (distToLine < cue.radius + b.radius && proj < closestDist) {
        closestDist = proj;
        closest = b;
      }
    });
    if (!closest) return;
    // simplified deflection: continue roughly along the ball-center direction from contact
    const contactX = cue.x + dirx * closestDist, contactY = cue.y + diry * closestDist;
    const deflX = closest.x - contactX, deflY = closest.y - contactY;
    const deflLen = Math.hypot(deflX, deflY) || 1;
    const dnx = deflX / deflLen, dny = deflY / deflLen;
    ctx2d.save();
    ctx2d.strokeStyle = 'rgba(75,232,255,0.85)';
    ctx2d.lineWidth = 2;
    ctx2d.setLineDash([3, 5]);
    ctx2d.beginPath();
    ctx2d.moveTo(closest.x, closest.y);
    ctx2d.lineTo(closest.x + dnx * 90, closest.y + dny * 90);
    ctx2d.stroke();
    ctx2d.restore();
  }

  function drawPowerIndicator(cue) {
    ctx2d.save();
    ctx2d.fillStyle = '#ffb238';
    ctx2d.font = "13px 'Space Mono', monospace";
    ctx2d.textAlign = 'center';
    ctx2d.fillText(`${Math.round(S.power * 100)}%`, cue.x, cue.y - cue.radius - 14);
    ctx2d.restore();
  }

  function renderLoop() {
    if (S.phase !== 'menu') render();
    requestAnimationFrame(renderLoop);
  }
  requestAnimationFrame(renderLoop);

  // ---------------------------------------------------------
  // Input (unified mouse + touch)
  // ---------------------------------------------------------
  function pointerToTable(evt) {
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    const x = (clientX - rect.left) / rect.width * GameConfig.table.width;
    const y = (clientY - rect.top) / rect.height * GameConfig.table.height;
    return { x, y };
  }

  function onPointerDown(evt) {
    if (S.phase !== 'aiming') return;
    S.aiming = true;
    updateAimFromPointer(evt);
    evt.preventDefault();
  }
  function onPointerMove(evt) {
    if (!S.aiming || S.phase !== 'aiming') return;
    updateAimFromPointer(evt);
    evt.preventDefault();
  }
  function onPointerUp() { S.aiming = false; }

  function updateAimFromPointer(evt) {
    const p = pointerToTable(evt);
    const cue = S.table.cueBall;
    if (!cue) return;
    S.aimAngle = Math.atan2(p.y - cue.y, p.x - cue.x);
  }

  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('touchstart', onPointerDown, { passive: false });
  canvas.addEventListener('touchmove', onPointerMove, { passive: false });
  canvas.addEventListener('touchend', onPointerUp);

  // ===========================================================
  // HUD
  // ===========================================================
  function updateHud() {
    const p1 = S.players[0], p2 = S.players[1];
    if (!p1 || !p2) return;
    $('hud-p1').querySelector('.hud-name').textContent = p1.name;
    $('hud-p2').querySelector('.hud-name').textContent = p2.name;
    setGroupPill($('hud-p1-group'), p1.group);
    setGroupPill($('hud-p2-group'), p2.group);
    $('hud-p1').classList.toggle('active', S.currentPlayerIndex === 0);
    $('hud-p2').classList.toggle('active', S.currentPlayerIndex === 1);
    $('hud-mode-label').textContent = GameConfig.questionModes[S.questionMode.toUpperCase()]
      ? GameConfig.questionModes[S.questionMode.toUpperCase()].label
      : (S.questionMode === 'earn_your_shot' ? 'EARN YOUR SHOT' : 'BONUS POOL');
    $('hud-turn').textContent = `${activePlayer().name}'s Turn`;
    renderBallTray();
  }
  function setGroupPill(el, group) {
    el.classList.remove('assigned-solids', 'assigned-stripes');
    if (group === 'solids') { el.textContent = '🟡 SOLIDS'; el.classList.add('assigned-solids'); }
    else if (group === 'stripes') { el.textContent = '🔵 STRIPES'; el.classList.add('assigned-stripes'); }
    else { el.textContent = 'OPEN TABLE'; }
  }

  function renderBallTray() {
    const tray = $('ball-tray');
    tray.innerHTML = '';

    const localGroup = localGroupForDisplay();

    const buildRow = (label, numbers, groupKey) => {
      const row = document.createElement('div');
      row.className = 'tray-row' + (groupKey && localGroup === groupKey ? ' owned' : '');
      const lbl = document.createElement('span');
      lbl.className = 'tray-row-label';
      lbl.textContent = label + (groupKey && localGroup === groupKey ? ' (YOURS)' : '');
      row.appendChild(lbl);
      const ballsWrap = document.createElement('div');
      ballsWrap.className = 'tray-row-balls';
      numbers.forEach(n => {
        const ball = S.table.balls.find(b => b.number === n);
        const pocketed = !ball || ball.pocketed;
        const isStripe = n >= 9;
        const el = document.createElement('div');
        el.className = `tray-ball ${isStripe ? 'stripe' : n === 8 ? 'eight' : 'solid'}${pocketed ? ' pocketed' : ''}`;
        el.style.setProperty('--tray-color', GameConfig.ballColors[n]);
        el.textContent = n;
        ballsWrap.appendChild(el);
      });
      row.appendChild(ballsWrap);
      tray.appendChild(row);
    };

    buildRow('🟡 SOLIDS', [1, 2, 3, 4, 5, 6, 7], 'solids');
    buildRow('⚫ 8-BALL', [8], null);
    buildRow('🔵 STRIPES', [9, 10, 11, 12, 13, 14, 15], 'stripes');
  }

  // In multiplayer, "yours" means the local seat's group; in single-player it means the human player's.
  function localGroupForDisplay() {
    if (!S.players.length) return null;
    if (S.playerMode === 'multiplayer' && S.mp) {
      const me = S.players.find(p => p.seat === S.mp.localSeat);
      return me ? me.group : null;
    }
    const human = S.players.find(p => !p.isAI);
    return human ? human.group : null;
  }

  function showBanner(id, text) {
    const el = $(id);
    el.textContent = text;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2200);
  }
  function hideBanner(id) { $(id).classList.add('hidden'); }

  // ===========================================================
  // HOME STATS (inline row + coin balance)
  // ===========================================================
  function updateHomeStats() {
    const s = PlatformManager.getGameStats(GameConfig.meta.id) || {};
    const gamesPlayed = Number(s.gamesPlayed || 0);
    const wins = Number(s.wins || 0);
    const winRatio = gamesPlayed ? Math.round((wins / gamesPlayed) * 100) : 0;
    $('home-stats-row').innerHTML = `
      <div class="home-stat"><span class="home-stat-value">${gamesPlayed}</span><span class="home-stat-label">GAMES PLAYED</span></div>
      <div class="home-stat"><span class="home-stat-value">${Number(s.correct || 0)}</span><span class="home-stat-label">QUESTIONS CORRECT</span></div>
      <div class="home-stat"><span class="home-stat-value">${winRatio}%</span><span class="home-stat-label">WIN RATIO</span></div>
    `;
    $('home-coin-balance').textContent = PlatformManager.getCoins() + ' coins';
  }

  // ===========================================================
  // SOUND TOGGLE
  // ===========================================================
  $('btn-mute').addEventListener('click', () => {
    const muted = !SFX.isMuted();
    SFX.setMuted(muted);
    $('btn-mute').textContent = muted ? '🔇' : '🔊';
  });

  // ===========================================================
  // INIT
  // ===========================================================
  loadCosmetics();
  window.addEventListener('arcade-progression-changed', () => { render(); window.AchievementManager?.renderGameRewardShop?.(); });
  resizeCanvas();
  showScreen('screen-menu');
  setInterval(() => PlatformManager.heartbeat(GameConfig.meta.id, S.phase === 'aiming' || S.phase === 'simulating'), 1000);
})();

/**
 * PlatformManager
 * ================================================================
 * Single source of truth for platform-wide player statistics across
 * every game in Arcade Academy:
 *   - the shared coin economy
 *   - question / answer totals (overall + per-game + today)
 *   - session & play-time tracking (total + "active" time)
 *   - per-game stats (games played, high score, accuracy, last played)
 *   - favourite game
 *
 * This file owns ONLY platform-wide stats. Game-specific progression —
 * unlocked weapons/towers/songs, permanent upgrades, skill trees,
 * inventories, cosmetic unlocks, per-game achievements, etc. — must stay
 * inside each game's own save system. Do not add that kind of data here.
 *
 * Data is cached in localStorage under STORAGE_KEY below, so every game on
 * the same origin can read it immediately. When Firebase Authentication is
 * available, the shared coin balance is also synchronized to Firestore.
 *
 * USAGE
 * -----
 *   <script src="shared/js/PlatformManager.js"></script>
 *   <script src="game.js"></script>
 *
 * In game.js:
 *   const GAME_CONFIG = { id: 'my-game-id', name: 'My Game' };
 *
 *   // when the player actually starts playing (not on every retry/run —
 *   // once per "sitting"):
 *   PlatformManager.startSession(GAME_CONFIG.id);
 *
 *   // every frame / tick, tell PlatformManager whether the player is
 *   // actively playing right now (not paused, not in a menu/quiz/shop).
 *   // Cheap - safe to call from a game loop:
 *   PlatformManager.heartbeat(GAME_CONFIG.id, isActivelyPlaying);
 *
 *   // whenever a question is answered:
 *   PlatformManager.recordQuestionAnswered(GAME_CONFIG.id, wasCorrect);
 *
 *   // coins - the ONLY way coins should move for the shared economy:
 *   PlatformManager.addCoins(amount);
 *   if (PlatformManager.spendCoins(cost)) { / * grant the purchase * / }
 *   PlatformManager.getCoins();
 *
 *   // whenever the player's score might be a new best:
 *   PlatformManager.setHighScore(GAME_CONFIG.id, score);
 *
 * PlatformManager automatically flushes and ends the open session on
 * tab close / navigation / backgrounding (pagehide, beforeunload,
 * visibilitychange), so games do NOT need to wire up their own unload
 * handlers just to make session/play-time tracking accurate. Calling
 * PlatformManager.endSession(gameId) explicitly (e.g. from a "quit to
 * hub" button) is still encouraged whenever a game has one.
 * ================================================================
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'arcadeAcademy.platformStats.v1';
  const SCHEMA_VERSION = 1;
  const AUTOSAVE_INTERVAL_MS = 10000; // periodic flush while dirty, so a hard crash loses at most ~10s
  const PRACTICE_DURATION_MS = 5 * 60 * 1000;
  const practiceMode = typeof location !== 'undefined'
    && new URLSearchParams(location.search).get('mode') === 'practice';
  let practiceExpired = false;
  let practiceTimerStarted = false;
  let practiceClaimedAt = null;
  let practiceTimerId = null;
  const PLATFORM_SCRIPT_URL = typeof document !== 'undefined' ? document.currentScript?.src : null;

  function achievementEvent(name, payload) {
    if (practiceMode) return;
    if (global.AchievementManager) global.AchievementManager.notify(name, payload);
  }

  // ---- date helpers --------------------------------------------------

  function todayString() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // ---- default shapes --------------------------------------------------

  function emptyGameStats() {
    return {
      gamesPlayed: 0,
      playTimeMs: 0,
      activePlayTimeMs: 0,
      highScore: 0,
      questionsAnswered: 0,
      correct: 0,
      incorrect: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      lastPlayed: null,
      practiceUsedAt: null
    };
  }

  function defaultData() {
    return {
      version: SCHEMA_VERSION,
      coins: {
        balance: 0,
        totalEarned: 0,
        totalSpent: 0
      },
      questions: {
        totalAnswered: 0,
        totalCorrect: 0,
        totalIncorrect: 0,
        dailyDate: todayString(),
        dailyAnswered: 0,
        dailyCorrect: 0,
        dailyIncorrect: 0
      },
      sessions: {
        totalSessions: 0,
        totalPlayTimeMs: 0,
        activePlayTimeMs: 0
      },
      activity: {
        lastActive: null,
        syncedUid: null
      },
      integrity: {
        detectedAt: null,
        gameId: null,
        fastestAnswerMs: null
      },
      games: {}, // keyed by GAME_CONFIG.id -> emptyGameStats()
      questionBanks: {}, // keyed by class/question-bank code, with daily accuracy history
      class: {
        code: null,      // e.g. "93bf" - the teacher/class code the student entered
        subject: null,   // e.g. "Maths" - resolved from banks.json
        bankPath: null,  // the selected bank folder, resolved from banks.json
        bank: null       // retained for backwards-compatible saved data
      }
    };
  }

  // ---- persistence --------------------------------------------------

  function load() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      const fresh = defaultData();
      return {
        version: SCHEMA_VERSION,
        coins: Object.assign(fresh.coins, parsed.coins),
        questions: Object.assign(fresh.questions, parsed.questions),
        sessions: Object.assign(fresh.sessions, parsed.sessions),
        activity: Object.assign(fresh.activity, parsed.activity),
        integrity: Object.assign(fresh.integrity, parsed.integrity),
        games: (parsed.games && typeof parsed.games === 'object') ? parsed.games : {},
        questionBanks: (parsed.questionBanks && typeof parsed.questionBanks === 'object') ? parsed.questionBanks : {},
        class: Object.assign(fresh.class, parsed.class)
      };
    } catch (e) {
      // Corrupt data or localStorage unavailable (private browsing, etc.) — start fresh.
      return defaultData();
    }
  }

  let data = load();
  let dirty = false;

  // Firebase synchronization mirrors educator-relevant platform and per-game
  // statistics. Game-specific progression remains local to each game.
  let firebaseUid = null;
  let currentUserRole = null;
  try { currentUserRole = sessionStorage.getItem('arcadeAcademy.currentUserRole'); } catch (_) {}
  let firebaseConnectionPromise = null;
  let firebaseConnected = false;
  let firebaseWriteQueue = Promise.resolve();
  let coinChangesWhileConnecting = 0;

  function save() {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      dirty = false;
    } catch (e) {
      // localStorage unavailable / quota exceeded — fail silently, matching
      // the fail-silent convention each game's own save system already uses.
    }
  }

  function markDirty() { dirty = true; }

  function touchActivity() {
    data.activity.lastActive = Date.now();
    markDirty();
  }

  function normalizeCoinBalance(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
  }

  function buildPlatformSyncData() {
    const stats = getOverallStats();
    return {
      coins: stats.coins.balance,
      questions: {
        date: data.questions.dailyDate,
        totalAnswered: stats.totalQuestionsAnswered,
        totalCorrect: stats.totalCorrect,
        totalIncorrect: stats.totalIncorrect,
        percentageCorrect: stats.overallPercentageCorrect,
        dailyAnswered: stats.questionsAnsweredToday,
        dailyCorrect: stats.correctAnsweredToday,
        dailyIncorrect: stats.incorrectAnsweredToday
      },
      sessions: {
        totalSessions: stats.totalSessionsPlayed,
        totalPlayTimeMs: stats.totalPlayTimeMs,
        activePlayTimeMs: stats.activePlayTimeMs
      },
      currentSession: currentSession ? {
        gameId: currentSession.gameId,
        startedAt: currentSession.startedAt,
        durationMs: stats.currentSessionDurationMs
      } : null,
      lastActive: data.activity.lastActive,
      favouriteGame: stats.favouriteGame,
      integrity: JSON.parse(JSON.stringify(data.integrity || {})),
      questionBanks: JSON.parse(JSON.stringify(data.questionBanks || {}))
    };
  }

  function buildGameSyncData(gameId) {
    const stats = getGameStats(gameId);
    if (!stats) return null;
    return {
      gamesPlayed: stats.gamesPlayed,
      highScore: stats.highScore,
      questionsAnswered: stats.questionsAnswered,
      correct: stats.correct,
      incorrect: stats.incorrect,
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
      percentageCorrect: stats.percentageCorrect,
      playTimeMs: stats.playTimeMs,
      activePlayTimeMs: stats.activePlayTimeMs,
      lastPlayed: stats.lastPlayed,
      practiceUsedAt: stats.practiceUsedAt,
      currentSessionStartTime: stats.currentSessionStartTime
    };
  }

  function queueStatsSave(gameIds) {
    if (!firebaseUid || !firebaseConnected || !global.FirebaseManager) return;

    const uid = firebaseUid;
    const platformSnapshot = buildPlatformSyncData();
    const ids = gameIds
      ? Array.from(new Set(gameIds.filter(Boolean)))
      : Object.keys(data.games);
    const gameSnapshots = ids.map(gameId => [gameId, buildGameSyncData(gameId)]);

    firebaseWriteQueue = firebaseWriteQueue
      .catch(() => false)
      .then(async () => {
        await global.FirebaseManager.updatePlatformData(uid, platformSnapshot);
        await Promise.all(gameSnapshots.map(([gameId, snapshot]) =>
          snapshot ? global.FirebaseManager.updateGameStats(uid, gameId, snapshot) : true
        ));
      });
  }

  function restorePlatformData(platformData, cloudGames) {
    const cloudCoins = normalizeCoinBalance(platformData && platformData.coins);
    if (cloudCoins !== null) data.coins.balance = cloudCoins;

    const questions = platformData && platformData.questions;
    if (questions && typeof questions === 'object') {
      data.questions.totalAnswered = normalizeCount(questions.totalAnswered);
      data.questions.totalCorrect = normalizeCount(questions.totalCorrect);
      data.questions.totalIncorrect = normalizeCount(questions.totalIncorrect);
      if (questions.date === todayString()) {
        data.questions.dailyDate = questions.date;
        data.questions.dailyAnswered = normalizeCount(questions.dailyAnswered);
        data.questions.dailyCorrect = normalizeCount(questions.dailyCorrect);
        data.questions.dailyIncorrect = normalizeCount(questions.dailyIncorrect);
      } else {
        data.questions.dailyDate = todayString();
        data.questions.dailyAnswered = 0;
        data.questions.dailyCorrect = 0;
        data.questions.dailyIncorrect = 0;
      }
    }

    const sessions = platformData && platformData.sessions;
    if (sessions && typeof sessions === 'object') {
      data.sessions.totalSessions = normalizeCount(sessions.totalSessions);
      data.sessions.totalPlayTimeMs = normalizeCount(sessions.totalPlayTimeMs);
      data.sessions.activePlayTimeMs = normalizeCount(sessions.activePlayTimeMs);
    }

    if (platformData && Number.isFinite(Number(platformData.lastActive))) {
      data.activity.lastActive = Number(platformData.lastActive);
    }
    if (platformData?.integrity && typeof platformData.integrity === 'object') {
      data.integrity = Object.assign(defaultData().integrity, platformData.integrity);
    }

    if (platformData?.questionBanks && typeof platformData.questionBanks === 'object') {
      data.questionBanks = platformData.questionBanks;
    }

    if (cloudGames && typeof cloudGames === 'object') {
      Object.entries(cloudGames).forEach(([gameId, stats]) => {
        if (!stats || typeof stats !== 'object') return;
        const game = ensureGame(gameId);
        game.gamesPlayed = normalizeCount(stats.gamesPlayed);
        game.highScore = normalizeCount(stats.highScore);
        game.questionsAnswered = normalizeCount(stats.questionsAnswered);
        game.correct = normalizeCount(stats.correct);
        game.incorrect = normalizeCount(stats.incorrect);
        game.wins = normalizeCount(stats.wins);
        game.losses = normalizeCount(stats.losses);
        game.draws = normalizeCount(stats.draws);
        game.playTimeMs = normalizeCount(stats.playTimeMs);
        game.activePlayTimeMs = normalizeCount(stats.activePlayTimeMs);
        game.lastPlayed = Number.isFinite(Number(stats.lastPlayed)) ? Number(stats.lastPlayed) : null;
        const cloudPracticeUsedAt = Number.isFinite(Number(stats.practiceUsedAt)) ? Number(stats.practiceUsedAt) : null;
        if (practiceMode && currentSession?.practice && currentSession.gameId === gameId
          && cloudPracticeUsedAt && cloudPracticeUsedAt !== practiceClaimedAt) {
          currentSession = null;
          showPracticeUnavailable();
        }
        game.practiceUsedAt = cloudPracticeUsedAt || game.practiceUsedAt;
        if (game.practiceUsedAt && typeof document !== 'undefined') {
          document.getElementById('arcade-practice-button')?.remove();
        }
      });
    }
  }

  function normalizeCount(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }

  async function ensureGameSaveManager() {
    if (global.GameSaveManager) return true;
    if (!PLATFORM_SCRIPT_URL) return false;
    try {
      await import(new URL('GameSaveManager.js', PLATFORM_SCRIPT_URL).href);
      return !!global.GameSaveManager;
    } catch (error) {
      console.error('Unable to load GameSaveManager:', error);
      return false;
    }
  }

  function resetAllProgress() {
    const preservedClass = data.class;
    const preservedUid = firebaseUid || data.activity.syncedUid;
    currentSession = null;
    data = defaultData();
    data.class = preservedClass;
    data.activity.syncedUid = preservedUid;
    save();
    global.AchievementManager?.reset?.();
    queueStatsSave();
    return true;
  }

  function resetGameStats(gameId) {
    if (!gameId) return false;
    if (currentSession?.gameId === gameId) currentSession = null;
    data.games[gameId] = emptyGameStats();
    save();
    queueStatsSave([gameId]);
    return true;
  }

  function resetLearningStats() {
    const fresh = defaultData();
    data.questions = fresh.questions;
    data.questionBanks = {};
    Object.values(data.games).forEach(game => {
      game.questionsAnswered = 0;
      game.correct = 0;
      game.incorrect = 0;
    });
    save();
    queueStatsSave(Object.keys(data.games));
    return true;
  }

  async function applyPendingProgressReset(uid) {
    if (!global.FirebaseManager?.getPendingProgressReset) return true;
    const request = await global.FirebaseManager.getPendingProgressReset(uid);
    if (request === undefined) return false;
    if (!request) return true;

    const gameSaveManagerReady = await ensureGameSaveManager();
    if (!gameSaveManagerReady) return false;

    if (request.type === 'all') {
      resetAllProgress();
      global.GameSaveManager.resetAllGames();
    } else if (request.type === 'learning') {
      resetLearningStats();
    } else if (request.type === 'game' && request.gameId) {
      resetGameStats(request.gameId);
      global.GameSaveManager.resetGame(request.gameId);
    } else {
      console.error('Ignoring malformed progress reset request:', request);
      return false;
    }

    await global.FirebaseManager.completeProgressReset(uid, request.token);
    return true;
  }

  async function connectFirebase(uid) {
    if (!uid || !global.FirebaseManager) return false;
    if (firebaseUid === uid && firebaseConnectionPromise) return firebaseConnectionPromise;

    firebaseUid = uid;
    firebaseConnected = false;
    coinChangesWhileConnecting = 0;

    const connectionAttempt = (async () => {
      const resetApplied = await applyPendingProgressReset(uid);
      if (!resetApplied || firebaseUid !== uid) return false;

      const [platformData, cloudGames] = await Promise.all([
        global.FirebaseManager.getPlatformData(uid),
        global.FirebaseManager.getAllGameStats(uid)
      ]);
      if (firebaseUid !== uid) return false;
      if (platformData === undefined || cloudGames === undefined) return false;

      const cloudBalance = normalizeCoinBalance(platformData && platformData.coins);
      firebaseConnected = true;

      const cloudLastActive = normalizeCount(platformData && platformData.lastActive);
      const localIsNewer = data.activity.syncedUid === uid
        && normalizeCount(data.activity.lastActive) > cloudLastActive;

      if (cloudBalance === null || localIsNewer) {
        // Migrate a first-time cache, or retain a newer cache for this UID.
        data.activity.syncedUid = uid;
        markDirty();
        save();
        queueStatsSave();
      } else {
        restorePlatformData(platformData, cloudGames);
        data.coins.balance = Math.max(0, data.coins.balance + coinChangesWhileConnecting);
        data.activity.syncedUid = uid;
        markDirty();
        save();
        queueStatsSave();
      }

      coinChangesWhileConnecting = 0;
      emitCoinsChanged();
      return true;
    })();

    firebaseConnectionPromise = connectionAttempt;
    const connected = await connectionAttempt;

    if (!connected && firebaseUid === uid && firebaseConnectionPromise === connectionAttempt) {
      firebaseConnectionPromise = null;
    }

    return connected;
  }

  function disconnectFirebase() {
    firebaseUid = null;
    firebaseConnectionPromise = null;
    firebaseConnected = false;
    coinChangesWhileConnecting = 0;
  }

  function getConnectedUid() { return firebaseUid || data.activity.syncedUid || null; }

  if (typeof global.setInterval === 'function') {
    global.setInterval(() => {
      if (currentSession) reconcileCurrentSession();
      if (dirty) save();
      if (currentSession) queueStatsSave([currentSession.gameId]);
    }, AUTOSAVE_INTERVAL_MS);
  }

  // ---- daily rollover --------------------------------------------------

  function rollDailyIfNeeded() {
    const today = todayString();
    if (data.questions.dailyDate !== today) {
      data.questions.dailyDate = today;
      data.questions.dailyAnswered = 0;
      data.questions.dailyCorrect = 0;
      data.questions.dailyIncorrect = 0;
      markDirty();
    }
  }

  function ensureGame(gameId) {
    if (!data.games[gameId]) data.games[gameId] = emptyGameStats();
    return data.games[gameId];
  }

  // ---- session tracking --------------------------------------------------

  // The in-progress session lives only in memory (not persisted every tick)
  // so heartbeat() can be called every frame without hammering localStorage.
  // It's reconciled into `data` (and saved) on endSession / autosave / unload.
  let currentSession = null; // { gameId, startedAt, lastReconciledAt, activeSince }

  function isPracticeMode() { return practiceMode; }
  function hasUsedPractice(gameId) {
    return !!(gameId && Number(ensureGame(gameId).practiceUsedAt) > 0);
  }
  function powerupsAllowed() { return !practiceMode; }
  function permanentUpgradeCost(level, baseCost = 100, multiplier = 1.6) {
    return Math.max(100, Math.round(Math.max(100, Number(baseCost) || 100) * Math.pow(Math.max(1.01, Number(multiplier) || 1.6), Math.max(0, Number(level) || 0))));
  }

  function showPracticeComplete(message) {
    if (typeof document === 'undefined' || document.getElementById('arcade-practice-complete')) return;
    practiceExpired = true;
    if (practiceTimerId) clearInterval(practiceTimerId);
    const overlay = document.createElement('div');
    overlay.id = 'arcade-practice-complete';
    overlay.style.cssText = 'position:fixed;z-index:9999;inset:0;display:grid;place-items:center;padding:20px;text-align:center;color:#fff;background:rgba(5,3,20,.96);font-family:monospace';
    overlay.innerHTML = `<div><h1 style="color:#ffd15c">Practice complete</h1><p>${message}</p><a href="../../index.html" style="display:inline-block;margin-top:12px;padding:12px 18px;color:#fff;background:#a855f7;border:2px solid #ff4f9a;border-radius:9px;text-decoration:none;font-weight:bold">Return to Arcade Academy</a></div>`;
    document.body.appendChild(overlay);
    global.dispatchEvent(new CustomEvent('arcade-practice-expired'));
  }

  function endPracticeRun() {
    if (!practiceMode || practiceExpired) return false;
    currentSession = null;
    showPracticeComplete('Your first practice run has ended.');
    return true;
  }

  function startPracticeTimer() {
    if (!practiceMode || practiceTimerStarted || typeof document === 'undefined') return;
    practiceTimerStarted = true;
    const banner = document.createElement('div');
    banner.id = 'arcade-practice-banner';
    banner.setAttribute('role', 'status');
    banner.style.cssText = 'position:fixed;z-index:9998;top:8px;left:50%;transform:translateX(-50%);padding:8px 14px;color:#241000;background:#ffd15c;border:2px solid #fff2a6;border-radius:9px;font:700 13px monospace;box-shadow:0 0 18px rgba(255,209,92,.55)';
    document.body.appendChild(banner);
    const startedAt = Date.now();
    const update = () => {
      const remaining = Math.max(0, PRACTICE_DURATION_MS - (Date.now() - startedAt));
      const seconds = Math.ceil(remaining / 1000);
      banner.textContent = `PRACTICE · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} · no coins, scores or power-ups`;
      if (remaining > 0) return;
      showPracticeComplete('Your five-minute practice session has ended.');
    };
    practiceTimerId = setInterval(update, 250);
    update();
  }

  function installPracticeButton() {
    if (practiceMode || typeof document === 'undefined') return;
    const gameId = location.pathname.match(/\/games\/([^/]+)\//)?.[1];
    if (!gameId || hasUsedPractice(gameId)) return;
    const selectors = {
      'cavern-crammer':'#startBtn', 'fortress-facts':'#start-btn',
      'jetpack-journey':'#start-btn', 'note-knowledge':'#start-btn',
      'pinball-postulation':'#start-btn', 'pixel-artillery':'#start-single-btn',
      'angler-answerer':'#homeStartBtn',
      'cube-curiosity':'#playBtn',
      'rocket-recall':'#beginGameBtn', 'shuriken-scholar':'#startBtn',
      'tic-tac-toe':'#start-single-btn', 'wild-west-wordslinger':'#start-button'
    };
    const attach = () => {
      if (hasUsedPractice(gameId)) {
        document.getElementById('arcade-practice-button')?.remove();
        return true;
      }
      if (document.getElementById('arcade-practice-button')) return true;
      const startSelector = selectors[gameId] || global.GAME_CONFIG?.startSelector;
      if (!startSelector) return false;
      const startButton = document.querySelector(startSelector);
      if (!startButton) return false;
      const button = document.createElement('button');
      button.id = 'arcade-practice-button';
      button.type = 'button';
      button.textContent = 'Practice · one run or 5 min';
      button.style.cssText = 'display:block;width:100%;margin:10px 0 0;padding:11px 12px;color:#00d4ff;background:rgba(0,212,255,.08);border:2px solid #00d4ff;border-radius:7px;font:700 12px "Press Start 2P",monospace;line-height:1.5;cursor:pointer';
      button.onclick = () => { location.href = `${location.pathname}?mode=practice`; };
      startButton.insertAdjacentElement('afterend', button);
      return true;
    };
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList:true, subtree:true });
  }

  function showPracticeUnavailable() {
    if (typeof document === 'undefined' || document.getElementById('arcade-practice-unavailable')) return;
    practiceExpired = true;
    const overlay = document.createElement('div');
    overlay.id = 'arcade-practice-unavailable';
    overlay.style.cssText = 'position:fixed;z-index:9999;inset:0;display:grid;place-items:center;padding:20px;text-align:center;color:#fff;background:rgba(5,3,20,.96);font-family:monospace';
    overlay.innerHTML = '<div><h1 style="color:#ffd15c">Practice already used</h1><p>Each game has one five-minute practice session.</p><a href="../../index.html" style="display:inline-block;margin-top:12px;padding:12px 18px;color:#fff;background:#a855f7;border:2px solid #ff4f9a;border-radius:9px;text-decoration:none;font-weight:bold">Return to Arcade Academy</a></div>';
    document.body.appendChild(overlay);
  }

  function startSession(gameId) {
    if (!gameId) return;
    if (practiceMode) {
      if (hasUsedPractice(gameId)) {
        showPracticeUnavailable();
        return;
      }
      const now = Date.now();
      practiceClaimedAt = now;
      const game = ensureGame(gameId);
      game.practiceUsedAt = now;
      markDirty();
      save();
      queueStatsSave([gameId]);
      currentSession = { gameId, startedAt: now, lastReconciledAt: now, activeSince: null, practice: true };
      startPracticeTimer();
      return;
    }
    if (currentSession && currentSession.gameId !== gameId) {
      endSession(currentSession.gameId);
    }
    if (currentSession && currentSession.gameId === gameId) return; // already running, no-op

    rollDailyIfNeeded();
    const now = Date.now();
    const g = ensureGame(gameId);
    g.gamesPlayed += 1;
    g.lastPlayed = now;
    data.sessions.totalSessions += 1;
    currentSession = {
      gameId, startedAt: now, lastReconciledAt: now, activeSince: null,
      questionsAnsweredAtStart: data.questions.totalAnswered,
      questionsCorrectAtStart: data.questions.totalCorrect,
      lastAnswerAt: null,
      consecutiveFastAnswers: 0,
      integrityTriggered: false,
      coinsAwarded: 0
    };
    data.activity.lastActive = now;
    markDirty();
    save();
    queueStatsSave([gameId]);
    achievementEvent('game_started', { facts: { sessions: data.sessions.totalSessions } });
  }

  // Folds the in-progress session's elapsed time into `data` without
  // clearing currentSession (used by autosave/unload flushes).
  function reconcileCurrentSession() {
    if (!currentSession) return;
    if (currentSession.practice) return;
    const now = Date.now();
    const g = ensureGame(currentSession.gameId);

    const elapsed = Math.max(0, now - currentSession.lastReconciledAt);
    g.playTimeMs += elapsed;
    data.sessions.totalPlayTimeMs += elapsed;
    currentSession.lastReconciledAt = now;

    if (currentSession.activeSince !== null) {
      const activeElapsed = Math.max(0, now - currentSession.activeSince);
      g.activePlayTimeMs += activeElapsed;
      data.sessions.activePlayTimeMs += activeElapsed;
      currentSession.activeSince = now;
    }
    markDirty();
    data.activity.lastActive = now;
  }

  function endSession(gameId) {
    if (!currentSession || (gameId && currentSession.gameId !== gameId)) return;
    reconcileCurrentSession();
    const endedGameId = currentSession.gameId;
    currentSession = null;
    save();
    queueStatsSave([endedGameId]);
    achievementEvent('run_completed');
  }

  // Call every frame/tick with whether the player is actively playing right
  // now (not paused, not in a menu/quiz/shop overlay). Cheap: only touches
  // in-memory state, never writes localStorage directly.
  function heartbeat(gameId, isActive) {
    if (!currentSession || currentSession.gameId !== gameId) return;
    const now = Date.now();
    if (isActive) {
      if (currentSession.activeSince === null) currentSession.activeSince = now;
    } else if (currentSession.activeSince !== null) {
      const activeElapsed = Math.max(0, now - currentSession.activeSince);
      const g = ensureGame(gameId);
      g.activePlayTimeMs += activeElapsed;
      data.sessions.activePlayTimeMs += activeElapsed;
      currentSession.activeSince = null;
      markDirty();
      data.activity.lastActive = now;
    }
  }

  function getCurrentSessionDurationMs(gameId) {
    if (!currentSession || (gameId && currentSession.gameId !== gameId)) return 0;
    return Date.now() - currentSession.startedAt;
  }

  // Auto-flush on unload/backgrounding so a closed tab or a game the player
  // just navigates away from still gets its play time counted correctly,
  // without every game needing its own beforeunload/visibility wiring.
  if (typeof global.addEventListener === 'function') {
    const flushOnHide = () => {
      if (currentSession) reconcileCurrentSession();
      if (dirty) save();
      queueStatsSave(currentSession ? [currentSession.gameId] : undefined);
    };
    global.addEventListener('pagehide', flushOnHide);
    global.addEventListener('beforeunload', flushOnHide);
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushOnHide();
      });
    }
  }

  // ---- coins --------------------------------------------------

  function getCoins() {
    return data.coins.balance;
  }

  function emitCoinsChanged() {
    if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
      global.dispatchEvent(new CustomEvent('arcade-coins-changed', { detail: { balance: data.coins.balance } }));
    }
  }

  function addCoins(amount, options) {
    if (practiceMode) return data.coins.balance;
    if (currentSession?.integrityTriggered && currentSession.gameId !== 'note-knowledge') return data.coins.balance;
    const base = Math.max(0, Math.floor(Number(amount) || 0));
    const n = global.AchievementManager?.hasSecret?.('secret_lucky_badge')
      ? Math.floor(base * 1.5)
      : base;
    if (n > 0) {
      data.coins.balance += n;
      if (currentSession) currentSession.coinsAwarded = normalizeCount(currentSession.coinsAwarded) + n;
      if (options?.countsTowardLifetime !== false) data.coins.totalEarned += n;
      touchActivity();
      save();
      if (firebaseConnectionPromise && !firebaseConnected) coinChangesWhileConnecting += n;
      queueStatsSave();
      achievementEvent('coins_earned', { amount: n });
      emitCoinsChanged();
    }
    return data.coins.balance;
  }

  // Returns true and deducts the coins if affordable, false (no-op) otherwise.
  function spendCoins(amount) {
    if (practiceMode) return false;
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (n === 0) return true;
    if (data.coins.balance < n) return false;
    data.coins.balance -= n;
    data.coins.totalSpent += n;
    touchActivity();
    save();
    if (firebaseConnectionPromise && !firebaseConnected) coinChangesWhileConnecting -= n;
    queueStatsSave();
    emitCoinsChanged();
    return true;
  }

  // Removes up to the requested number of coins without allowing a negative
  // balance. Intended for gameplay penalties rather than shop purchases.
  function deductCoins(amount) {
    if (practiceMode) return 0;
    const requested = Math.max(0, Math.floor(Number(amount) || 0));
    const deducted = Math.min(requested, data.coins.balance);
    if (deducted === 0) return 0;
    data.coins.balance -= deducted;
    touchActivity();
    save();
    if (firebaseConnectionPromise && !firebaseConnected) coinChangesWhileConnecting -= deducted;
    queueStatsSave();
    emitCoinsChanged();
    return deducted;
  }

  // Converts a game's raw run coins into a shared-economy award. Accuracy is
  // deliberately allowed to range from a 15% safety net to a 115% mastery
  // bonus. When a run ends before a question is answered, settlement uses the
  // player's accuracy from before that run (or the 15% safety net for a brand
  // new player) instead of wiping the run's raw coins to zero.
  function calculateAccuracyCoinAward(baseCoins, correct, answered, fallbackAccuracy = 0) {
    const base = Math.max(0, Math.floor(Number(baseCoins) || 0));
    const attempts = Math.max(0, Math.floor(Number(answered) || 0));
    const right = Math.max(0, Math.min(attempts, Math.floor(Number(correct) || 0)));
    const accuracy = attempts > 0 ? right / attempts : Math.max(0,Math.min(1,Number(fallbackAccuracy)||0));
    const awarded = Math.ceil(base * (accuracy + 0.15));
    return {
      baseCoins: base,
      questionsCorrect: right,
      questionsAnswered: attempts,
      accuracy,
      accuracyPercent: Math.round(accuracy * 100),
      multiplier: accuracy + 0.15,
      coinsAwarded: awarded
    };
  }

  function settleAccuracyCoins(gameId, baseCoins, stats) {
    let correct = stats?.correct;
    let answered = stats?.answered;
    if (correct === undefined || answered === undefined) {
      const isCurrent = currentSession && (!gameId || currentSession.gameId === gameId);
      correct = isCurrent ? data.questions.totalCorrect - currentSession.questionsCorrectAtStart : 0;
      answered = isCurrent ? data.questions.totalAnswered - currentSession.questionsAnsweredAtStart : 0;
    }
    let fallbackAccuracy=0;
    if(Math.max(0,Number(answered)||0)===0){
      const isCurrent=currentSession&&(!gameId||currentSession.gameId===gameId);
      const previousAnswered=isCurrent?currentSession.questionsAnsweredAtStart:data.questions.totalAnswered;
      const previousCorrect=isCurrent?currentSession.questionsCorrectAtStart:data.questions.totalCorrect;
      fallbackAccuracy=previousAnswered>0?previousCorrect/previousAnswered:0;
    }
    const result = calculateAccuracyCoinAward(baseCoins, correct, answered, fallbackAccuracy);
    if (practiceMode || (currentSession?.integrityTriggered && currentSession.gameId !== 'note-knowledge')) result.coinsAwarded = 0;
    else if (result.coinsAwarded > 0) addCoins(result.coinsAwarded);
    if (currentSession && (!gameId || currentSession.gameId === gameId)) {
      currentSession.questionsAnsweredAtStart = data.questions.totalAnswered;
      currentSession.questionsCorrectAtStart = data.questions.totalCorrect;
    }
    return result;
  }

  // ---- questions --------------------------------------------------

  function checkAnswerTiming(gameId, wasCorrect) {
    if (!wasCorrect || gameId === 'note-knowledge' || !currentSession || currentSession.gameId !== gameId) return;
    const now = Date.now();
    const elapsed = currentSession.lastAnswerAt === null ? null : now - currentSession.lastAnswerAt;
    currentSession.lastAnswerAt = now;
    if (elapsed !== null && elapsed <= 300) currentSession.consecutiveFastAnswers += 1;
    else currentSession.consecutiveFastAnswers = 0;
    if (currentSession.integrityTriggered || currentSession.consecutiveFastAnswers < 3) return;

    currentSession.integrityTriggered = true;
    const rollback = Math.min(normalizeCount(currentSession.coinsAwarded), data.coins.balance);
    if (rollback > 0) {
      data.coins.balance -= rollback;
      data.coins.totalEarned = Math.max(0, data.coins.totalEarned - rollback);
      if (firebaseConnectionPromise && !firebaseConnected) coinChangesWhileConnecting -= rollback;
      currentSession.coinsAwarded = 0;
      emitCoinsChanged();
    }
    data.integrity = {
      detectedAt: now,
      gameId,
      fastestAnswerMs: elapsed
    };
    touchActivity();
    save();
    queueStatsSave(gameId ? [gameId] : undefined);
    if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
      global.dispatchEvent(new global.CustomEvent('arcade-difficulty-rate-changed', { detail: { multiplier: 5 } }));
    }
  }

  function getDifficultyRateMultiplier() {
    return currentSession?.integrityTriggered && currentSession.gameId !== 'note-knowledge' ? 5 : 1;
  }

  function recordQuestionAnswered(gameId, wasCorrect) {
    rollDailyIfNeeded();
    checkAnswerTiming(gameId, wasCorrect);
    data.questions.totalAnswered += 1;
    data.questions.dailyAnswered += 1;
    if (wasCorrect) {
      data.questions.totalCorrect += 1;
      data.questions.dailyCorrect += 1;
    } else {
      data.questions.totalIncorrect += 1;
      data.questions.dailyIncorrect += 1;
    }

    if (gameId) {
      const g = ensureGame(gameId);
      g.questionsAnswered += 1;
      if (wasCorrect) g.correct += 1; else g.incorrect += 1;
    }
    const bankCode = data.class.code;
    if (bankCode) {
      const date = todayString();
      const bank = data.questionBanks[bankCode] || {
        code: bankCode,
        subject: data.class.subject || bankCode,
        bankPath: data.class.bankPath || null,
        totalAnswered: 0,
        totalCorrect: 0,
        totalIncorrect: 0,
        lastAnswered: null,
        byDate: {}
      };
      bank.subject = data.class.subject || bank.subject || bankCode;
      bank.bankPath = data.class.bankPath || bank.bankPath || null;
      bank.totalAnswered = normalizeCount(bank.totalAnswered) + 1;
      if (wasCorrect) bank.totalCorrect = normalizeCount(bank.totalCorrect) + 1;
      else bank.totalIncorrect = normalizeCount(bank.totalIncorrect) + 1;
      bank.lastAnswered = Date.now();
      const daily = bank.byDate?.[date] || { answered: 0, correct: 0, incorrect: 0 };
      daily.answered = normalizeCount(daily.answered) + 1;
      if (wasCorrect) daily.correct = normalizeCount(daily.correct) + 1;
      else daily.incorrect = normalizeCount(daily.incorrect) + 1;
      bank.byDate = { ...(bank.byDate || {}), [date]: daily };
      const dates = Object.keys(bank.byDate).sort();
      dates.slice(0, Math.max(0, dates.length - 120)).forEach(oldDate => delete bank.byDate[oldDate]);
      data.questionBanks[bankCode] = bank;
    }
    touchActivity();
    save();
    queueStatsSave(gameId ? [gameId] : undefined);
    achievementEvent('question_answered', {
      correct: !!wasCorrect,
      questionType: global.QuestionManager?.getRunQuestionType?.() || global.QuestionManager?.questionType || null
    });
  }

  function recordMultiplayerResult(gameId, result) {
    if (practiceMode) return false;
    if (!gameId || !['win', 'loss', 'draw'].includes(result)) return false;
    const g = ensureGame(gameId);
    g.wins = normalizeCount(g.wins);
    g.losses = normalizeCount(g.losses);
    g.draws = normalizeCount(g.draws);
    if (result === 'win') g.wins += 1;
    else if (result === 'loss') g.losses += 1;
    else g.draws += 1;
    touchActivity();
    save();
    queueStatsSave([gameId]);
    achievementEvent('multiplayerMatches');
    if (result === 'win') achievementEvent('multiplayerWins');
    return true;
  }

  function recordChallengeResult(gameId, claim, challengeType) {
    if (!gameId || !claim || !['win','loss','draw'].includes(claim.result)) return false;
    const g = ensureGame(gameId);
    g.challengesPlayed = normalizeCount(g.challengesPlayed) + 1;
    g.challengesWon = normalizeCount(g.challengesWon) + (claim.result === 'win' ? 1 : 0);
    g.challengesLost = normalizeCount(g.challengesLost) + (claim.result === 'loss' ? 1 : 0);
    g.challengesDrawn = normalizeCount(g.challengesDrawn) + (claim.result === 'draw' ? 1 : 0);
    g.challengeCoinsWon = normalizeCount(g.challengeCoinsWon) + Math.max(0, Number(claim.delta) || 0);
    g.challengeCoinsLost = normalizeCount(g.challengeCoinsLost) + Math.max(0, -(Number(claim.delta) || 0));
    g.challengeWinStreak = claim.result === 'win' ? normalizeCount(g.challengeWinStreak) + 1 : 0;
    g.highestChallengeWinStreak = Math.max(normalizeCount(g.highestChallengeWinStreak), g.challengeWinStreak);
    g.challengeTypes = { ...(g.challengeTypes || {}), [challengeType || 'unknown']: normalizeCount(g.challengeTypes?.[challengeType || 'unknown']) + 1 };
    const favourite = Object.entries(g.challengeTypes).sort((a,b)=>b[1]-a[1])[0];
    g.favouriteChallengeType = favourite?.[0] || null;
    data.coins.balance = Math.max(0, Math.floor(Number(claim.balance) || 0));
    if (claim.delta > 0) data.coins.totalEarned += claim.delta;
    if (claim.delta < 0) data.coins.totalSpent += -claim.delta;
    touchActivity(); save(); queueStatsSave([gameId]);
    achievementEvent('challenge_completed', { result: claim.result, challengeType, amount: 1 });
    return true;
  }

  // ---- high scores --------------------------------------------------

  function setHighScore(gameId, score) {
    if (practiceMode) return;
    if (!gameId) return;
    const n = Number(score);
    if (!isFinite(n)) return;
    const g = ensureGame(gameId);
    if (n > g.highScore) {
      g.highScore = n;
      touchActivity();
      save();
      queueStatsSave([gameId]);
      achievementEvent('personal_best');
    }
  }

  // ---- class / question bank --------------------------------------------------
  //
  // PlatformManager is the single source of truth for the currently selected
  // teacher/class code, subject, and question bank. The Hub is the only place
  // that should ever call setClassCode() - games should just read the result
  // via getCurrentBank() / getCurrentSubject() / getCurrentClass() and never
  // need to know about banks.json, folder paths, or the code -> bank mapping.
  //
  // Expected shape of question-banks/banks.json - a flat object keyed by
  // class code, e.g.:
  //   {
  //     "93bf": { "subject": "Maths", "bank": "question-banks/maths-year8.json" },
  //     "k2p9": { "subject": "Science", "bank": "question-banks/science-year9.json" }
  //   }
  // A couple of reasonable variants are tolerated too (see resolveBankEntry
  // below) so this keeps working even if the key names differ slightly.

  const BANKS_INDEX_URL = 'question-banks/banks.json';

  // In-memory cache of banks.json for the lifetime of the page, so repeated
  // setClassCode() calls (e.g. a student retrying a code) don't re-fetch it.
  let banksIndexCache = null;
  let forcedQuestionBank = null;

  async function fetchJson(url) {
    const res = await global.fetch(url, { cache: 'no-cache' });
    if (!res || !res.ok) throw new Error(`Failed to fetch ${url}`);
    return res.json();
  }

  async function loadBanksIndex() {
    if (banksIndexCache) return banksIndexCache;
    const json = await fetchJson(BANKS_INDEX_URL);
    // Support either a flat { code: entry } map, or { codes: { code: entry } }.
    banksIndexCache = (json && typeof json === 'object' && json.codes && typeof json.codes === 'object')
      ? json.codes
      : json;
    return banksIndexCache;
  }

  // Pulls { subject, bankPath } out of a single banks.json entry, tolerating
  // a couple of likely key-naming variants.
  function resolveBankEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const subject = entry.subject || entry.name || null;
    const bankPath = entry.bank || entry.bankPath || entry.file || entry.path || null;
    if (!bankPath) return null;
    return { subject, bankPath };
  }

  // Looks up `code` in banks.json and, if valid, makes it the active class.
  // Question files differ by game (multichoice/category/matching), so games
  // load the appropriate file through QuestionManager after retrieving this
  // code. The Hub only owns selecting and persisting the class.
  //
  // Returns a Promise<boolean> - true if the code was valid and the class
  // was switched, false otherwise. Never throws; on any failure (bad code,
  // network error, malformed bank) the currently selected class is left
  // unchanged.
  //
  // Usage:
  //   const ok = await PlatformManager.setClassCode('93bf');
  //   if (!ok) { /* show "invalid code" to the student */ }
  async function setClassCode(code) {
    if (isQuestionBankForced()) return false;
    const trimmed = (typeof code === 'string') ? code.trim().toLowerCase() : '';
    if (!trimmed) return false;

    if(trimmed==='mr mckenzie'){
      achievementEvent('cabinet_tapped');
      data.class.code='Mr Mckenzie';data.class.subject='Secret Cabinet';data.class.bankPath=null;data.class.bank=null;markDirty();save();global.AchievementManager.applyEquipped?.();return true;
    }

    try {
      const banksIndex = await loadBanksIndex();
      const entry = banksIndex ? banksIndex[trimmed] : null;
      const resolved = resolveBankEntry(entry);
      if (!resolved) return false; // unknown code

      data.class.code = trimmed;
      data.class.subject = resolved.subject;
      data.class.bankPath = resolved.bankPath;
      data.class.bank = null;
      markDirty();
      save();
      return true;
    } catch (e) {
      // Network failure, bad JSON, etc. - fail closed, leave selection unchanged.
      return false;
    }
  }

  function getClassCode() {
    return data.class.code;
  }

  function getCurrentSubject() {
    return data.class.subject;
  }

  // Retained for backwards compatibility. QuestionManager owns loading a
  // game's typed question bank from the current class code.
  function getCurrentBank() {
    return data.class.bank;
  }

  // Convenience bundle of everything a game might want about the active
  // class, without needing to call three separate getters.
  function getCurrentClass() {
    return {
      code: data.class.code,
      subject: data.class.subject,
      bank: data.class.bank
    };
  }

  function hasClassCode() {
    return !!data.class.code;
  }

  function isQuestionBankForced() {
    if (!forcedQuestionBank || Number(forcedQuestionBank.expiresAt) <= Date.now()) {
      forcedQuestionBank = null;
      return false;
    }
    return true;
  }

  function getForcedQuestionBank() {
    return isQuestionBankForced() ? { ...forcedQuestionBank } : null;
  }

  async function applyClassQuestionBankAssignment(profile) {
    const assignment = await global.FirebaseManager?.getClassQuestionBankAssignment?.(profile?.className);
    if (!assignment?.active) {
      forcedQuestionBank = null;
      return null;
    }
    forcedQuestionBank = assignment;
    const banksIndex = await loadBanksIndex();
    const resolved = resolveBankEntry(banksIndex?.[assignment.code]);
    if (!resolved) {
      forcedQuestionBank = null;
      return null;
    }
    data.class.code = assignment.code;
    data.class.subject = resolved.subject;
    data.class.bankPath = resolved.bankPath;
    data.class.bank = null;
    markDirty();
    save();
    return getForcedQuestionBank();
  }

  // Clears the active class selection entirely (e.g. a "change class" button
  // in the Hub). Games will see hasClassCode() === false / getCurrentBank()
  // === null again until the Hub sets a new code.
  function clearClassCode() {
    data.class.code = null;
    data.class.subject = null;
    data.class.bankPath = null;
    data.class.bank = null;
    markDirty();
    save();
  }

  // ---- readers --------------------------------------------------

  function pct(correct, total) {
    return total > 0 ? Math.round((correct / total) * 1000) / 10 : 0; // one decimal place
  }

  function getFavouriteGame() {
    let best = null;
    for (const gameId of Object.keys(data.games)) {
      if (!best || data.games[gameId].playTimeMs > data.games[best].playTimeMs) best = gameId;
    }
    return best;
  }

  function getOverallStats() {
    rollDailyIfNeeded();
    const liveTotal = currentSession ? Math.max(0, Date.now() - currentSession.lastReconciledAt) : 0;
    const liveActive = (currentSession && currentSession.activeSince !== null)
      ? Math.max(0, Date.now() - currentSession.activeSince) : 0;

    return {
      coins: {
        balance: data.coins.balance,
        totalEarned: data.coins.totalEarned,
        totalSpent: data.coins.totalSpent
      },
      totalQuestionsAnswered: data.questions.totalAnswered,
      totalCorrect: data.questions.totalCorrect,
      totalIncorrect: data.questions.totalIncorrect,
      overallPercentageCorrect: pct(data.questions.totalCorrect, data.questions.totalAnswered),
      questionsAnsweredToday: data.questions.dailyAnswered,
      correctAnsweredToday: data.questions.dailyCorrect,
      incorrectAnsweredToday: data.questions.dailyIncorrect,
      currentSessionStartTime: currentSession ? currentSession.startedAt : null,
      currentSessionDurationMs: currentSession ? Math.max(0, Date.now() - currentSession.startedAt) : 0,
      currentActiveGame: currentSession ? currentSession.gameId : null,
      lastActive: data.activity.lastActive,
      totalSessionsPlayed: data.sessions.totalSessions,
      totalPlayTimeMs: data.sessions.totalPlayTimeMs + liveTotal,
      activePlayTimeMs: data.sessions.activePlayTimeMs + liveActive,
      favouriteGame: getFavouriteGame()
    };
  }

  function getGameStats(gameId) {
    const g = data.games[gameId];
    if (!g) return null;
    const isCurrent = currentSession && currentSession.gameId === gameId;
    const liveTotal = isCurrent ? Math.max(0, Date.now() - currentSession.lastReconciledAt) : 0;
    const liveActive = (isCurrent && currentSession.activeSince !== null)
      ? Math.max(0, Date.now() - currentSession.activeSince) : 0;

    return {
      gameId,
      gamesPlayed: g.gamesPlayed,
      playTimeMs: g.playTimeMs + liveTotal,
      activePlayTimeMs: g.activePlayTimeMs + liveActive,
      highScore: g.highScore,
      questionsAnswered: g.questionsAnswered,
      correct: g.correct,
      incorrect: g.incorrect,
      wins: normalizeCount(g.wins),
      losses: normalizeCount(g.losses),
      draws: normalizeCount(g.draws),
      percentageCorrect: pct(g.correct, g.questionsAnswered),
      lastPlayed: g.lastPlayed,
      practiceUsedAt: g.practiceUsedAt != null && Number.isFinite(Number(g.practiceUsedAt))
        ? Number(g.practiceUsedAt)
        : null,
      currentSessionStartTime: isCurrent ? currentSession.startedAt : null
    };
  }

  function getAllGameStats() {
    return Object.keys(data.games).map(getGameStats);
  }

  function getQuestionBankStats() {
    return Object.values(data.questionBanks || {}).map(bank => ({
      code: bank.code,
      totalAnswered: normalizeCount(bank.totalAnswered),
      totalCorrect: normalizeCount(bank.totalCorrect),
      totalIncorrect: normalizeCount(bank.totalIncorrect),
      byDate: { ...(bank.byDate || {}) }
    }));
  }

  // ---- public API --------------------------------------------------

  global.PlatformManager = {
    // sessions
    startSession,
    endSession,
    heartbeat,
    getCurrentSessionDurationMs,

    // coins
    addCoins,
    spendCoins,
    deductCoins,
    getCoins,
    calculateAccuracyCoinAward,
    settleAccuracyCoins,
    getDifficultyRateMultiplier,
    connectFirebase,
    disconnectFirebase,
    getConnectedUid,
    resetAllProgress,
    resetLearningStats,
    resetGameStats,

    // questions
    recordQuestionAnswered,
    recordMultiplayerResult,
    recordChallengeResult,

    // high scores
    setHighScore,

    // practice / economy policy
    isPracticeMode,
    hasUsedPractice,
    endPracticeRun,
    powerupsAllowed,
    permanentUpgradeCost,

    // class / question bank
    setClassCode,
    getClassCode,
    clearClassCode,
    hasClassCode,
    getCurrentBank,
    getCurrentSubject,
    getCurrentClass,
    applyClassQuestionBankAssignment,
    isQuestionBankForced,
    getForcedQuestionBank,

    // readers
    getOverallStats,
    getGameStats,
    getAllGameStats,
    getQuestionBankStats,
    getFavouriteGame
  };
  global.PlatformManager.isTeacher = () => currentUserRole === 'teacher';

  // AchievementManager is shared by every game and hooks the platform events
  // above. Loading it here prevents each game from growing its own save format.
  if (typeof document !== 'undefined' && PLATFORM_SCRIPT_URL && !global.AchievementManager && /\/games\//.test(location.pathname)) {
    const achievementScript = document.createElement('script');
    const achievementUrl = new URL('AchievementManager.js', PLATFORM_SCRIPT_URL);
    achievementUrl.searchParams.set('v','20260825-nine-ball-v3');
    achievementScript.src = achievementUrl.href;
    achievementScript.defer = true;
    document.head.appendChild(achievementScript);
    global.addEventListener('arcade-achievement-manager-ready', async () => {
      if (!firebaseUid) return;
      const profile = await global.FirebaseManager?.getUserProfile?.(firebaseUid);
      global.AchievementManager?.connect?.(firebaseUid, profile?.achievementSystem);
    }, { once: true });
  }

  if (typeof document !== 'undefined' && PLATFORM_SCRIPT_URL && !global.MistakeRematchManager && /\/games\//.test(location.pathname)) {
    const rematchScript = document.createElement('script');
    const rematchUrl = new URL('MistakeRematchManager.js', PLATFORM_SCRIPT_URL);
    rematchUrl.searchParams.set('v','20260817-mistake-rematch-v1');
    rematchScript.src = rematchUrl.href;
    rematchScript.defer = true;
    document.head.appendChild(rematchScript);
  }

  if (typeof document !== 'undefined' && PLATFORM_SCRIPT_URL && !global.SuggestedGameManager && /\/games\//.test(location.pathname)) {
    const suggestedScript = document.createElement('script');
    const suggestedUrl = new URL('SuggestedGameManager.js', PLATFORM_SCRIPT_URL);
    suggestedUrl.searchParams.set('v','20260818-suggested-game-v1');
    suggestedScript.src = suggestedUrl.href;
    suggestedScript.defer = true;
    document.head.appendChild(suggestedScript);
  }

  if (typeof document !== 'undefined'
      && PLATFORM_SCRIPT_URL
      && !global.ChallengeManager
      && /\/games\//.test(location.pathname)
      && global.GAME_CONFIG?.challengeMode?.enabled === true) {
    const challengeScript = document.createElement('script');
    const challengeUrl = new URL('ChallengeManager.js', PLATFORM_SCRIPT_URL);
    challengeUrl.searchParams.set('v','20260812-challenge-mode-v2');
    challengeScript.src = challengeUrl.href;
    challengeScript.defer = true;
    document.head.appendChild(challengeScript);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installPracticeButton);
    else installPracticeButton();
  }

  // Game pages include PlatformManager but do not need Firebase-specific
  // code. Load the adjacent manager and restore the signed-in user there.
  if (typeof document !== 'undefined' && document.currentScript && typeof global.FirebaseManager === 'undefined') {
    const firebaseManagerUrl = new URL('FirebaseManager.js', document.currentScript.src).href;
    import(firebaseManagerUrl)
      .then(() => {
        if (!global.FirebaseManager) return;
        global.FirebaseManager.watchAuthState(async user => {
          if (user) {
            await connectFirebase(user.uid);
            const profile = await global.FirebaseManager.getUserProfile?.(user.uid);
            currentUserRole = profile?.role || null;
            try { sessionStorage.setItem('arcadeAcademy.currentUserRole', currentUserRole || ''); } catch (_) {}
            global.dispatchEvent(new CustomEvent('arcade-user-role-changed', { detail: { role: currentUserRole } }));
            await applyClassQuestionBankAssignment(profile);
            global.ArcadeQuestionPolicy = await global.FirebaseManager.resolveQuestionFormat?.(profile) || {format:'mixed',source:'game'};
            global.AchievementManager?.connect?.(user.uid, profile?.achievementSystem);
            global.MistakeRematchManager?.connect?.(user.uid, profile?.mistakeRematch);
            global.SuggestedGameManager?.connect?.(user.uid, profile?.suggestedGame);
          } else {
            currentUserRole = null;
            try { sessionStorage.removeItem('arcadeAcademy.currentUserRole'); } catch (_) {}
            disconnectFirebase();
            global.AchievementManager?.disconnect?.();
            global.SuggestedGameManager?.disconnect?.();
          }
        });
      })
      .catch(error => console.error('Unable to start Firebase coin sync:', error));
  }

})(window);

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
 * All data lives in localStorage under STORAGE_KEY below, so every game
 * on the same origin reads and writes the same platform stats automatically
 * with zero setup beyond including this script.
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
      lastPlayed: null
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
      games: {}, // keyed by GAME_CONFIG.id -> emptyGameStats()
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
        games: (parsed.games && typeof parsed.games === 'object') ? parsed.games : {},
        class: Object.assign(fresh.class, parsed.class)
      };
    } catch (e) {
      // Corrupt data or localStorage unavailable (private browsing, etc.) — start fresh.
      return defaultData();
    }
  }

  let data = load();
  let dirty = false;

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

  if (typeof global.setInterval === 'function') {
    global.setInterval(() => { if (dirty) save(); }, AUTOSAVE_INTERVAL_MS);
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
  let currentSession = null; // { gameId, startTime, activeSince }

  function startSession(gameId) {
    if (!gameId) return;
    if (currentSession && currentSession.gameId !== gameId) {
      endSession(currentSession.gameId);
    }
    if (currentSession && currentSession.gameId === gameId) return; // already running, no-op

    rollDailyIfNeeded();
    const g = ensureGame(gameId);
    g.gamesPlayed += 1;
    g.lastPlayed = Date.now();
    data.sessions.totalSessions += 1;
    markDirty();
    save();

    currentSession = { gameId, startTime: Date.now(), activeSince: null };
  }

  // Folds the in-progress session's elapsed time into `data` without
  // clearing currentSession (used by autosave/unload flushes).
  function reconcileCurrentSession() {
    if (!currentSession) return;
    const now = Date.now();
    const g = ensureGame(currentSession.gameId);

    const elapsed = Math.max(0, now - currentSession.startTime);
    g.playTimeMs += elapsed;
    data.sessions.totalPlayTimeMs += elapsed;
    currentSession.startTime = now;

    if (currentSession.activeSince !== null) {
      const activeElapsed = Math.max(0, now - currentSession.activeSince);
      g.activePlayTimeMs += activeElapsed;
      data.sessions.activePlayTimeMs += activeElapsed;
      currentSession.activeSince = now;
    }
    markDirty();
  }

  function endSession(gameId) {
    if (!currentSession || (gameId && currentSession.gameId !== gameId)) return;
    reconcileCurrentSession();
    currentSession = null;
    save();
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
    }
  }

  function getCurrentSessionDurationMs(gameId) {
    if (!currentSession || (gameId && currentSession.gameId !== gameId)) return 0;
    return Date.now() - currentSession.startTime;
  }

  // Auto-flush on unload/backgrounding so a closed tab or a game the player
  // just navigates away from still gets its play time counted correctly,
  // without every game needing its own beforeunload/visibility wiring.
  if (typeof global.addEventListener === 'function') {
    const flushOnHide = () => {
      if (currentSession) reconcileCurrentSession();
      if (dirty) save();
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

  function addCoins(amount) {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (n > 0) {
      data.coins.balance += n;
      data.coins.totalEarned += n;
      markDirty();
      save();
    }
    return data.coins.balance;
  }

  // Returns true and deducts the coins if affordable, false (no-op) otherwise.
  function spendCoins(amount) {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (n === 0) return true;
    if (data.coins.balance < n) return false;
    data.coins.balance -= n;
    data.coins.totalSpent += n;
    markDirty();
    save();
    return true;
  }

  // ---- questions --------------------------------------------------

  function recordQuestionAnswered(gameId, wasCorrect) {
    rollDailyIfNeeded();
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
    markDirty();
    save();
  }

  // ---- high scores --------------------------------------------------

  function setHighScore(gameId, score) {
    if (!gameId) return;
    const n = Number(score);
    if (!isFinite(n)) return;
    const g = ensureGame(gameId);
    if (n > g.highScore) {
      g.highScore = n;
      markDirty();
      save();
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
    const trimmed = (typeof code === 'string') ? code.trim().toLowerCase() : '';
    if (!trimmed) return false;

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
    const liveTotal = currentSession ? Math.max(0, Date.now() - currentSession.startTime) : 0;
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
      currentSessionStartTime: currentSession ? currentSession.startTime : null,
      currentSessionDurationMs: liveTotal,
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
    const liveTotal = isCurrent ? Math.max(0, Date.now() - currentSession.startTime) : 0;
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
      percentageCorrect: pct(g.correct, g.questionsAnswered),
      lastPlayed: g.lastPlayed
    };
  }

  function getAllGameStats() {
    return Object.keys(data.games).map(getGameStats);
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
    getCoins,

    // questions
    recordQuestionAnswered,

    // high scores
    setHighScore,

    // class / question bank
    setClassCode,
    getClassCode,
    clearClassCode,
    hasClassCode,
    getCurrentBank,
    getCurrentSubject,
    getCurrentClass,

    // readers
    getOverallStats,
    getGameStats,
    getAllGameStats,
    getFavouriteGame
  };

})(window);

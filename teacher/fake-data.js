/**
 * fake-data.js
 * ------------------------------------------------------------------
 * ALL fake student data lives in this file. Nothing outside this file
 * knows or cares that the data is fake.
 *
 * teacher.js never touches the arrays below directly — it only ever
 * calls `window.TeacherDataProvider`. When Arcade Academy is wired up
 * to Firebase, this file is the ONLY thing that needs to be replaced.
 * The methods on TeacherDataProvider (names, shapes, and Promise-based
 * signatures) should stay identical so teacher.js and teacher.css
 * don't need to change at all.
 *
 * Data model
 * ------------------------------------------------------------------
 * StudentSummary  -> what the class overview table shows "right now"
 * StudentDetail    -> StudentSummary + per-game current stats
 * HistoryRecord[]  -> dated progress records, kept SEPARATE from the
 *                     "current summary" stats above, on purpose, so a
 *                     Firebase collection like /history/{studentId}
 *                     can replace it independently later.
 * ------------------------------------------------------------------
 */

(function () {
  "use strict";

  // ---------------------------------------------------------------
  // Seeded RNG so the "fake" data is stable across page reloads
  // (nice for demos and for screenshots that need to match).
  // ---------------------------------------------------------------
  function mulberry32(seed) {
    let a = seed;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(20260808);
  const rand = (min, max) => min + rng() * (max - min);
  const randInt = (min, max) => Math.round(rand(min, max));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  // ---------------------------------------------------------------
  // Game catalog — matches the six Arcade Academy titles.
  // ---------------------------------------------------------------
  const GAMES = [
    { id: "cavern-crammer", name: "Cavern Crammer" },
    { id: "shuriken-scholar", name: "Shuriken Scholar" },
    { id: "wordslinger", name: "Wild West Wordslinger" },
    { id: "jetpack", name: "Pixel Jetpack" },
    { id: "nova-guardians", name: "Nova Guardians" },
    { id: "bloom-brigade", name: "Bloom Brigade" },
  ];
  const GAME_SCORE_RANGE = {
    "cavern-crammer": [400, 3200],
    "shuriken-scholar": [800, 5000],
    wordslinger: [200, 2600],
    jetpack: [500, 9000],
    "nova-guardians": [300, 4200],
    "bloom-brigade": [400, 5200],
  };

  // ---------------------------------------------------------------
  // Question types used across the shrine/quiz mechanics. This list
  // is deliberately just an array of ids + labels — to add a new
  // question type later (e.g. "sequencing", "true-false"), add one
  // entry here. Everything downstream (history generation, the
  // trend-by-question-type dropdown) reads from this list rather
  // than assuming there are exactly three.
  // ---------------------------------------------------------------
  const QUESTION_TYPES = [
    { id: "multichoice", label: "Multichoice" },
    { id: "matching", label: "Matching" },
    { id: "category", label: "Category" },
    { id: "type-answer", label: "Type the Answer" },
    { id: "falling-words-basic", label: "Falling Words — Basic" },
    { id: "falling-words-definition", label: "Falling Words — Definition" },
    { id: "falling-words-category", label: "Falling Words — Category" },
  ];

  // ---------------------------------------------------------------
  // Classes / question banks a teacher might be running.
  // ---------------------------------------------------------------
  const CLASSES = {
    "9SCI-A": {
      subject: "Year 9 Science",
      topics: ["Cell Biology", "States of Matter", "Forces & Motion", "Ecosystems"],
    },
    "10MAT-B": {
      subject: "Year 10 Maths",
      topics: ["Algebra Basics", "Ratios & Proportions", "Geometry Angles", "Statistics Intro"],
    },
    "11ENG-C": {
      subject: "Year 11 English",
      topics: ["Persuasive Writing", "Poetry Analysis", "Grammar & Punctuation", "Reading Comprehension"],
    },
    "9MAT-A": {
      subject: "Year 9 Maths",
      topics: ["Fractions & Decimals", "Integers", "Basic Algebra", "Measurement"],
    },
    "10SCI-B": {
      subject: "Year 10 Science",
      topics: ["Chemical Reactions", "Genetics Basics", "Energy & Waves", "Human Body Systems"],
    },
  };

  // ---------------------------------------------------------------
  // Students. `trend` only drives fake-history generation below —
  // it is not stored anywhere a real backend would need it.
  // ---------------------------------------------------------------
  const STUDENT_SEEDS = [
    { id: "s01", name: "Aroha Ngata", classCode: "9SCI-A", favouriteGame: "cavern-crammer", trend: "improving", active: true },
    { id: "s02", name: "Ethan Walsh", classCode: "10MAT-B", favouriteGame: "shuriken-scholar", trend: "declining", active: false },
    { id: "s03", name: "Priya Patel", classCode: "11ENG-C", favouriteGame: "wordslinger", trend: "stable", active: false },
    { id: "s04", name: "Jayden Fa'amausili", classCode: "9MAT-A", favouriteGame: "jetpack", trend: "stable", active: false },
    { id: "s05", name: "Zoe Chen", classCode: "10SCI-B", favouriteGame: "nova-guardians", trend: "improving", active: true },
    { id: "s06", name: "Manaia Rewiri", classCode: "9SCI-A", favouriteGame: "bloom-brigade", trend: "declining", active: false },
    { id: "s07", name: "Kaea Tamati", classCode: "10MAT-B", favouriteGame: "cavern-crammer", trend: "volatile", active: true },
    { id: "s08", name: "Mila Robertson", classCode: "11ENG-C", favouriteGame: "shuriken-scholar", trend: "stable", active: false },
  ];

  const DAY_MS = 24 * 60 * 60 * 1000;
  const TODAY = new Date();
  TODAY.setHours(9, 0, 0, 0);

  function isoDate(d) {
    return d.toISOString().slice(0, 10);
  }

  function trendBaseline(trend) {
    switch (trend) {
      case "improving":
        return { start: 52, slopePerRecord: 4.2, noise: 5 };
      case "declining":
        return { start: 84, slopePerRecord: -3.6, noise: 5 };
      case "volatile":
        return { start: 68, slopePerRecord: 0, noise: 16 };
      case "stable":
      default:
        return { start: 74, slopePerRecord: 0.3, noise: 4 };
    }
  }

  /**
   * Builds ~10 dated history records for a student, spaced roughly
   * every 2-3 school days over the last ~5 weeks, ending today for
   * students who are currently active.
   */
  function buildHistory(seed) {
    const { start, slopePerRecord, noise } = trendBaseline(seed.trend);
    const cls = CLASSES[seed.classCode];
    const recordCount = randInt(8, 11);
    const records = [];

    // Space records backwards from "today" (or yesterday, for
    // students who aren't active right now) in 2-4 day steps.
    let cursor = new Date(TODAY.getTime() - (seed.active ? 0 : DAY_MS));
    const gaps = [];
    for (let i = 0; i < recordCount - 1; i++) gaps.push(randInt(2, 4));

    const dates = [new Date(cursor)];
    gaps.forEach((gap) => {
      cursor = new Date(cursor.getTime() - gap * DAY_MS);
      dates.push(new Date(cursor));
    });
    dates.reverse(); // oldest -> newest

    dates.forEach((date, i) => {
      const overallAccuracy = clamp(
        Math.round(start + slopePerRecord * i + rand(-noise, noise)),
        35,
        100
      );
      const questionsAnswered = randInt(14, 42);
      const playtimeMinutes = randInt(8, 34);
      const topic = pick(cls.topics);
      const questionBank = `${seed.classCode} · ${topic}`;

      // Which games were played this session (favourite game shows
      // up most often; 1-3 games total per record).
      const otherGames = GAMES.filter((g) => g.id !== seed.favouriteGame);
      const gamesThisSession = [seed.favouriteGame];
      const extraCount = randInt(0, 2);
      for (let g = 0; g < extraCount; g++) {
        const candidate = pick(otherGames).id;
        if (!gamesThisSession.includes(candidate)) gamesThisSession.push(candidate);
      }

      const byGame = {};
      gamesThisSession.forEach((gameId) => {
        byGame[gameId] = clamp(Math.round(overallAccuracy + rand(-8, 8)), 30, 100);
      });

      // Which question types showed up this session (1 to all of them).
      const typesThisSession = QUESTION_TYPES.filter(() => rng() < 0.7);
      if (typesThisSession.length === 0) typesThisSession.push(pick(QUESTION_TYPES));
      const byQuestionType = {};
      typesThisSession.forEach((type) => {
        byQuestionType[type.id] = clamp(Math.round(overallAccuracy + rand(-10, 10)), 25, 100);
      });

      records.push({
        date: isoDate(date),
        questionBank,
        overallAccuracy,
        questionsAnswered,
        playtimeMinutes,
        byGame,
        bySubject: { [cls.subject]: overallAccuracy },
        byQuestionType,
      });
    });

    return records;
  }

  /**
   * Rolls a student's dated history up into the "current summary"
   * stats (overview table + per-game panel). Kept as a derivation
   * step so it's obvious this is a convenience for the fake data —
   * a real backend would maintain these as running totals instead.
   */
  function summarise(seed, history) {
    const totalQuestions = history.reduce((sum, r) => sum + r.questionsAnswered, 0);
    const totalPlaytime = history.reduce((sum, r) => sum + r.playtimeMinutes, 0);
    const weightedAccuracy =
      history.reduce((sum, r) => sum + r.overallAccuracy * r.questionsAnswered, 0) /
      Math.max(1, totalQuestions);

    const latest = history[history.length - 1];
    const isToday = latest.date === isoDate(TODAY);

    // Per-game rollups for the student-detail panel.
    const gameTotals = {};
    history.forEach((record) => {
      Object.entries(record.byGame).forEach(([gameId, accuracy]) => {
        if (!gameTotals[gameId]) {
          gameTotals[gameId] = { accSum: 0, accCount: 0, questions: 0, playtime: 0, lastPlayed: record.date };
        }
        const t = gameTotals[gameId];
        t.accSum += accuracy;
        t.accCount += 1;
        // Split the record's totals across however many games were played that day.
        const gamesInRecord = Object.keys(record.byGame).length;
        t.questions += record.questionsAnswered / gamesInRecord;
        t.playtime += record.playtimeMinutes / gamesInRecord;
        if (record.date >= t.lastPlayed) t.lastPlayed = record.date;
      });
    });

    const games = Object.entries(gameTotals).map(([gameId, t]) => {
      const [lo, hi] = GAME_SCORE_RANGE[gameId] || [100, 1000];
      return {
        gameId,
        gameName: GAMES.find((g) => g.id === gameId).name,
        highScore: randInt(lo, hi),
        accuracy: Math.round(t.accSum / t.accCount),
        questionsAnswered: Math.round(t.questions),
        playtimeMinutes: Math.round(t.playtime),
        lastPlayed: t.lastPlayed,
      };
    }).sort((a, b) => (a.lastPlayed < b.lastPlayed ? 1 : -1));

    return {
      id: seed.id,
      name: seed.name,
      classCode: seed.classCode,
      subject: CLASSES[seed.classCode].subject,
      active: seed.active,
      sessionStartedAt: seed.active ? Date.now() - randInt(2, 40) * 60 * 1000 : null,
      favouriteGame: GAMES.find((g) => g.id === seed.favouriteGame).name,
      favouriteGameId: seed.favouriteGame,
      lastActive: seed.active ? new Date().toISOString() : `${latest.date}T15:${String(randInt(10, 55)).padStart(2, "0")}:00`,
      today: {
        questionsAnswered: isToday ? latest.questionsAnswered : 0,
        accuracy: isToday ? latest.overallAccuracy : null,
      },
      overall: {
        accuracy: Math.round(weightedAccuracy),
        totalPlaytimeMinutes: totalPlaytime,
        totalQuestionsAnswered: totalQuestions,
      },
      games,
    };
  }

  // Build the full fake dataset once, up front.
  const DATASET = STUDENT_SEEDS.map((seed) => {
    const history = buildHistory(seed);
    const summary = summarise(seed, history);
    return { summary, history };
  });

  // ---------------------------------------------------------------
  // Simulated network latency so the UI already handles the
  // async/loading states it will need once this is real Firebase.
  // ---------------------------------------------------------------
  function delay(value, ms) {
    return new Promise((resolve) => setTimeout(() => resolve(value), ms));
  }

  // ---------------------------------------------------------------
  // Public API — this is the ONLY surface teacher.js talks to.
  // ---------------------------------------------------------------
  window.TeacherDataProvider = {
    /** All class codes the teacher currently has running. */
    async getClassCodes() {
      return delay(Object.keys(CLASSES).map((code) => ({ code, ...CLASSES[code] })), 120);
    },

    /** Class overview table rows (current summary stats only). */
    async getClassOverview(classCode) {
      const rows = DATASET.map((d) => d.summary).filter(
        (s) => !classCode || classCode === "all" || s.classCode === classCode
      );
      return delay(rows, 220);
    },

    /** Full detail for one student, including per-game current stats. */
    async getStudentDetail(studentId) {
      const entry = DATASET.find((d) => d.summary.id === studentId);
      return delay(entry ? entry.summary : null, 150);
    },

    /**
     * Dated progress records for one student. Deliberately a
     * separate call from getStudentDetail so it can later be backed
     * by its own Firebase collection (e.g. /history/{studentId})
     * without touching the summary data path at all.
     */
    async getStudentHistory(studentId) {
      const entry = DATASET.find((d) => d.summary.id === studentId);
      return delay(entry ? entry.history : [], 180);
    },

    /** Static game metadata, useful for building filter dropdowns. */
    async getGamesCatalog() {
      return delay(GAMES.slice(), 80);
    },

    /** Static question-type metadata (extensible beyond the current 3). */
    async getQuestionTypesCatalog() {
      return delay(QUESTION_TYPES.slice(), 80);
    },
  };
})();

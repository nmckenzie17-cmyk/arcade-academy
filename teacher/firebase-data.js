import "../shared/js/FirebaseManager.js";

const ACTIVE_WINDOW_MS = 2 * 60 * 1000;
const gameFolders = [
  "fortress-facts",
  "jetpack-journey",
  "note-knowledge",
  "rocket-recall",
  "shuriken-scholar",
  "wild-west-wordslinger",
  "cavern-crammer",
  "pinball-postulation",
  "angler-answerer",
  "pixel-artillery",
  "tic-tac-toe",
  "pool-practice"
  ,"dot-n-box-deducer"
];

let studentDocuments = null;
let gameCatalogPromise = null;

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function timestampMs(value) {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return number;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function localDateString() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function accuracy(correct, answered) {
  const total = numberOrZero(answered);
  return total > 0 ? Math.round((numberOrZero(correct) / total) * 1000) / 10 : 0;
}

async function loadStudents(forceRefresh = false) {
  if (studentDocuments && !forceRefresh) return studentDocuments;
  const students = await window.FirebaseManager.getAllStudents();
  if (!students) {
    throw new Error("Firestore student read failed. Check authentication and Firestore read rules.");
  }
  studentDocuments = students.filter((student) => student.role !== "teacher");
  return studentDocuments;
}

function loadConfigScript(folder) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL(`../games/${folder}/gameconfig.js`, import.meta.url).href;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function loadGameCatalog() {
  if (gameCatalogPromise) return gameCatalogPromise;
  gameCatalogPromise = (async () => {
    const catalog = {};
    const previousConfig = window.GAME_CONFIG;
    for (const folder of gameFolders) {
      try {
        await loadConfigScript(folder);
        if (window.GAME_CONFIG?.id) catalog[window.GAME_CONFIG.id] = { ...window.GAME_CONFIG };
      } catch (error) {
        console.warn(`Unable to load game metadata for ${folder}:`, error);
      }
    }
    if (previousConfig === undefined) delete window.GAME_CONFIG;
    else window.GAME_CONFIG = previousConfig;
    return catalog;
  })();
  return gameCatalogPromise;
}

function readableGameId(gameId) {
  return String(gameId)
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function mapStudent(document, catalog) {
  const platform = document.platform || {};
  const questions = platform.questions || {};
  const sessions = platform.sessions || {};
  const currentSession = platform.currentSession || null;
  const lastActive = timestampMs(platform.lastActive);
  const sessionStartedAt = currentSession ? timestampMs(currentSession.startedAt) : null;
  const active = Boolean(
    currentSession && sessionStartedAt && lastActive && Date.now() - lastActive <= ACTIVE_WINDOW_MS
  );
  const favouriteGameId = platform.favouriteGame || null;
  const favouriteConfig = favouriteGameId ? catalog[favouriteGameId] : null;
  const className = document.className || "Unassigned";
  const yearLevel = document.yearLevel || "Year not set";
  const answered = numberOrZero(questions.totalAnswered);
  const correct = numberOrZero(questions.totalCorrect);

  return {
    id: document.uid,
    name: document.displayName || document.email || "Unnamed student",
    classCode: className,
    className,
    yearLevel,
    subject: yearLevel,
    active,
    sessionStartedAt: active ? sessionStartedAt : null,
    currentSessionDurationMs: active ? numberOrZero(currentSession.durationMs) : 0,
    favouriteGame: favouriteConfig?.title || (favouriteGameId ? readableGameId(favouriteGameId) : "Not played yet"),
    favouriteGameId,
    lastActive,
    coins: numberOrZero(platform.coins),
    questionFormatOverride: document.questionFormatOverride || "mixed",
    today: {
      questionsAnswered: questions.date === localDateString() ? numberOrZero(questions.dailyAnswered) : 0,
      accuracy: questions.date === localDateString()
        ? accuracy(questions.dailyCorrect, questions.dailyAnswered)
        : 0
    },
    overall: {
      accuracy: accuracy(correct, answered),
      totalCorrect: correct,
      totalPlaytimeMinutes: Math.floor(numberOrZero(sessions.totalPlayTimeMs) / 60000),
      totalQuestionsAnswered: answered
    }
  };
}

function mapGameStats(gameStats, catalog) {
  return Object.entries(gameStats || {}).map(([gameId, stats]) => {
    const config = catalog[gameId];
    const answered = numberOrZero(stats.questionsAnswered);
    return {
      gameId,
      gameName: config ? `${config.icon || "🎮"} ${config.title}` : readableGameId(gameId),
      catchphrase: config?.catchphrase || "",
      highScore: numberOrZero(stats.highScore),
      accuracy: accuracy(stats.correct, answered),
      questionsAnswered: answered,
      correct: numberOrZero(stats.correct),
      incorrect: numberOrZero(stats.incorrect),
      playtimeMinutes: Math.floor(numberOrZero(stats.playTimeMs) / 60000),
      lastPlayed: timestampMs(stats.lastPlayed),
      gamesPlayed: numberOrZero(stats.gamesPlayed)
    };
  }).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
}

function mapQuestionBankHistory(document) {
  const banks = document?.platform?.questionBanks || {};
  const dates = new Map();

  Object.entries(banks).forEach(([code, bank]) => {
    const label = bank.subject
      ? `${bank.subject} (${code})`
      : code;
    Object.entries(bank.byDate || {}).forEach(([date, daily]) => {
      if (!dates.has(date)) {
        dates.set(date, {
          date,
          answered: 0,
          correct: 0,
          byGame: {},
          bySubject: {},
          byQuestionType: {}
        });
      }
      const record = dates.get(date);
      const answered = numberOrZero(daily.answered);
      const correct = numberOrZero(daily.correct);
      record.answered += answered;
      record.correct += correct;
      record.bySubject[label] = accuracy(correct, answered);
    });
  });

  return Array.from(dates.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((record) => ({
      date: record.date,
      overallAccuracy: accuracy(record.correct, record.answered),
      byGame: record.byGame,
      bySubject: record.bySubject,
      byQuestionType: record.byQuestionType
    }));
}

function mapClassHistory(documents) {
  const dates = new Map();
  documents.forEach(document => {
    Object.values(document?.platform?.questionBanks || {}).forEach(bank => {
      Object.entries(bank.byDate || {}).forEach(([date, daily]) => {
        const record = dates.get(date) || { answered: 0, correct: 0 };
        record.answered += numberOrZero(daily.answered);
        record.correct += numberOrZero(daily.correct);
        dates.set(date, record);
      });
    });
  });
  return Array.from(dates, ([date, record]) => ({ date, value: accuracy(record.correct, record.answered) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

window.TeacherDataProvider = {
  clearCache() {
    studentDocuments = null;
  },

  async requestProgressReset(studentId, resetType, gameId = null) {
    const request = await window.FirebaseManager.requestStudentProgressReset(studentId, resetType, gameId);
    if (!request) throw new Error("Firestore rejected the progress reset request.");
    studentDocuments = null;
    return request;
  },

  async updateStudentClass(studentId, className) {
    const updated = await window.FirebaseManager.updateStudentClass(studentId, className);
    if (!updated) throw new Error("Firestore rejected the student class update.");
    studentDocuments = null;
    return true;
  },

  async updateStudentProfile(studentId, changes) {
    const updated = await window.FirebaseManager.updateStudentProfile(studentId, changes);
    if (!updated) throw new Error("Firestore rejected the student profile update.");
    studentDocuments = null;
    return true;
  },

  async updateStudentCoins(studentId, coins) {
    const updated = await window.FirebaseManager.updateStudentCoins(studentId, coins);
    if (!updated) throw new Error("Firestore rejected the student coin update.");
    studentDocuments = null;
    return true;
  },

  async setStudentQuestionFormat(studentId, questionFormat) {
    const updated = await window.FirebaseManager.setStudentQuestionFormat(studentId, questionFormat);
    studentDocuments = null;
    return updated;
  },

  async getClassQuestionFormat(className) {
    return window.FirebaseManager.getClassQuestionFormat(className);
  },

  async setClassQuestionFormat(className, questionFormat) {
    return window.FirebaseManager.setClassQuestionFormat(className, questionFormat);
  },

  async getClassQuestionBankAssignment(className) {
    return window.FirebaseManager.getClassQuestionBankAssignment(className);
  },

  async setClassQuestionBankAssignment(className, code) {
    return window.FirebaseManager.setClassQuestionBankAssignment(className, code);
  },

  async clearClassQuestionBankAssignment(className) {
    return window.FirebaseManager.clearClassQuestionBankAssignment(className);
  },

  async deleteStudent(studentId) {
    const deleted = await window.FirebaseManager.deleteStudentData(studentId);
    if (!deleted) throw new Error("Firestore rejected the student deletion.");
    studentDocuments = null;
    return true;
  },

  async requestClassReset(className, resetType, gameId = null) {
    const operation = await window.FirebaseManager.requestClassProgressReset(className, resetType, gameId);
    if (!operation) throw new Error("Firestore could not complete the class reset operation.");
    studentDocuments = null;
    return operation;
  },

  async getClassStudentCount(className) {
    const students = await loadStudents();
    return students.filter((student) => (student.className || "Unassigned") === className).length;
  },

  async getResetHistory() {
    const history = await window.FirebaseManager.getClassResetHistory();
    if (history === undefined) throw new Error("Firestore reset history could not be read.");
    return history;
  },

  async getClassCodes() {
    const students = await loadStudents();
    const classes = new Map();
    students.forEach((student) => {
      const className = student.className || "Unassigned";
      if (!classes.has(className)) classes.set(className, new Set());
      classes.get(className).add(student.yearLevel || "Year not set");
    });
    return Array.from(classes, ([code, yearLevels]) => {
      const years = [...yearLevels].sort((a, b) => {
        const yearA = Number((/\d+/.exec(a) || [])[0]) || 999;
        const yearB = Number((/\d+/.exec(b) || [])[0]) || 999;
        return yearA - yearB || a.localeCompare(b);
      });
      return {
        code,
        subject: years.length > 1 ? years.join(", ") : years[0]
      };
    })
      .sort((a, b) => a.code.localeCompare(b.code));
  },

  async getClassOverview(classCode) {
    // The overview is the dashboard's refresh boundary. Always obtain a fresh
    // snapshot here, then reuse that exact snapshot when a student is opened.
    const [students, catalog] = await Promise.all([loadStudents(true), loadGameCatalog()]);
    return students
      .filter((student) => !classCode || classCode === "all" || (student.className || "Unassigned") === classCode)
      .map((student) => mapStudent(student, catalog));
  },

  async getStudentDetail(studentId) {
    const [students, catalog] = await Promise.all([
      loadStudents(),
      loadGameCatalog()
    ]);
    const document = students.find((student) => student.uid === studentId);
    if (!document) return null;
    return {
      ...mapStudent(document, catalog),
      games: mapGameStats(document.games || document.platform?.games, catalog)
    };
  },

  async getStudentHistory(studentId) {
    const students = await loadStudents();
    return mapQuestionBankHistory(students.find((student) => student.uid === studentId));
  },

  async getClassHistory(className) {
    const students = await loadStudents();
    return mapClassHistory(students.filter(student => (student.className || "Unassigned") === className));
  },

  async getQuestionBankCatalog() {
    const response = await fetch("../question-banks/banks.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("Question-bank catalog could not be loaded");
    const catalog = await response.json();
    return Object.entries(catalog).map(([code, entry]) => ({ code, subject: entry.subject || "Question bank", bank: entry.bank || "" }));
  },

  async getGamesCatalog() {
    const catalog = await loadGameCatalog();
    return Object.values(catalog).map((game) => ({ id: game.id, name: game.title }));
  },

  async getQuestionTypesCatalog() {
    return [];
  }
};

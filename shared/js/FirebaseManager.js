import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  initializeAuth,
  browserSessionPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut as firebaseSignOut
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  setDoc,
  updateDoc,
  runTransaction,
  writeBatch,
  query,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBGDUm-WX5mIn-MhpaYtdxIlnwEGxJSxTQ",
    authDomain: "arcade-academy-8d9f1.firebaseapp.com",
    projectId: "arcade-academy-8d9f1",
    storageBucket: "arcade-academy-8d9f1.firebasestorage.app",
    messagingSenderId: "140298401243",
    appId: "1:140298401243:web:003740a205975bb0c163fe",
    measurementId: "G-CCJGPBXS6H"
};

const app = initializeApp(firebaseConfig);

// Use sessionStorage-backed Auth persistence explicitly. Firebase's default web
// persistence prefers IndexedDB, which can be closed by the browser while a
// Google popup temporarily hides the Hub and produces "Database is
// closing/hidden" when the popup returns. Session persistence survives page
// refreshes in this tab without depending on IndexedDB (and is safer on shared
// classroom devices because it ends when the tab/window session is closed).
export const auth = initializeAuth(app, {
  persistence: browserSessionPersistence,
  popupRedirectResolver: browserPopupRedirectResolver
});
export const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();
const leaderboardProfileCache = new Map();
const leaderboardIdPromises = new Map();
const leaderboardCache = new Map();
const LEADERBOARD_CACHE_MS = 60 * 1000;

export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);

    console.log("Signed in successfully:", result.user);

    return result.user;
  } catch (error) {
    console.error("Google sign-in failed:", error);
    return null;
  }
}

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, (user) => {
    callback(user);
  });
}

export async function signOut() {
  try {
    await firebaseSignOut(auth);
    return true;
  } catch (error) {
    console.error("Sign-out failed:", error);
    return false;
  }
}

export async function getUserProfile(uid) {
  try {
    const profileRef = doc(db, "users", uid);
    const profileSnapshot = await getDoc(profileRef);

    if (!profileSnapshot.exists()) {
      return null;
    }

    return {
      id: profileSnapshot.id,
      ...profileSnapshot.data()
    };
  } catch (error) {
    console.error("Unable to load user profile:", error);
    return null;
  }
}

export async function createUserProfile(uid, profile) {
  try {
    const profileRef = doc(db, "users", uid);

    await setDoc(profileRef, {
      ...profile,
      uid,
      createdAt: new Date().toISOString()
    });

    return true;
  } catch (error) {
    console.error("Unable to create user profile:", error);
    return false;
  }
}

export async function updateUserProfile(uid, changes) {
  try {
    const profileRef = doc(db, "users", uid);

    await updateDoc(profileRef, {
      ...changes,
      updatedAt: new Date().toISOString()
    });

    return true;
  } catch (error) {
    console.error("Unable to update user profile:", error);
    return false;
  }
}

export async function updateStudentClass(uid, className) {
  try {
    const teacherUid = auth.currentUser?.uid;
    const cleanedClassName = String(className || "").trim();
    if (!teacherUid || !uid || !cleanedClassName) throw new Error("Invalid class update");

    const teacherProfile = await getUserProfile(teacherUid);
    if (teacherProfile?.role !== "teacher") throw new Error("Teacher access required");

    const studentRef = doc(db, "users", uid);
    const studentSnapshot = await getDoc(studentRef);
    if (!studentSnapshot.exists()) throw new Error("Student profile not found");

    const studentData = studentSnapshot.data();
    const changes = {
      className: cleanedClassName,
      updatedAt: new Date().toISOString()
    };
    if (studentData.seniorClassSelection && typeof studentData.seniorClassSelection === "object") {
      changes.seniorClassSelection = {
        ...studentData.seniorClassSelection,
        className: cleanedClassName,
        correctedAt: Date.now(),
        correctedBy: teacherUid
      };
    }

    await updateDoc(studentRef, changes);
    return true;
  } catch (error) {
    console.error("Unable to update student class:", error);
    return false;
  }
}

const QUESTION_FORMATS = ["mixed", "multichoice", "matching", "category", "type-answer", "falling-words-basic", "falling-words-definition", "falling-words-category"];
function validQuestionFormat(value) { return QUESTION_FORMATS.includes(value) ? value : "mixed"; }

export async function getClassQuestionFormat(className) {
  if (!className) return "mixed";
  try {
    const snapshot = await getDoc(doc(db, "classSettings", className));
    return snapshot.exists() ? validQuestionFormat(snapshot.data()?.questionFormat) : "mixed";
  } catch (error) {
    console.error("Unable to load class question format:", error);
    return "mixed";
  }
}

export async function setClassQuestionFormat(className, questionFormat) {
  const teacherUid = auth.currentUser?.uid;
  const teacherProfile = teacherUid ? await getUserProfile(teacherUid) : null;
  if (teacherProfile?.role !== "teacher" || !String(className || "").trim()) throw new Error("Teacher access required");
  await setDoc(doc(db, "classSettings", String(className).trim()), { questionFormat: validQuestionFormat(questionFormat), updatedAt: Date.now(), updatedBy: teacherUid }, { merge: true });
  return true;
}

const CLASS_BANK_DURATION_MS = 30 * 60 * 1000;

export async function getClassQuestionBankAssignment(className) {
  if (!String(className || "").trim()) return null;
  try {
    const snapshot = await getDoc(doc(db, "classSettings", String(className).trim()));
    const assignment = snapshot.data()?.questionBankAssignment;
    const expiresAt = Number(assignment?.expiresAt);
    if (!snapshot.exists() || !assignment?.code || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    return { ...assignment, expiresAt, active: true };
  } catch (error) {
    console.error("Unable to load class question-bank assignment:", error);
    return null;
  }
}

export async function setClassQuestionBankAssignment(className, code) {
  const teacherUid = auth.currentUser?.uid;
  const teacherProfile = teacherUid ? await getUserProfile(teacherUid) : null;
  const cleanedClass = String(className || "").trim();
  const cleanedCode = String(code || "").trim().toLowerCase();
  if (teacherProfile?.role !== "teacher" || !cleanedClass || !/^[a-z0-9-]{2,20}$/.test(cleanedCode)) throw new Error("Teacher access required");
  const assignment = { code: cleanedCode, assignedAt: Date.now(), expiresAt: Date.now() + CLASS_BANK_DURATION_MS, assignedBy: teacherUid };
  await setDoc(doc(db, "classSettings", cleanedClass), { questionBankAssignment: assignment, updatedAt: Date.now(), updatedBy: teacherUid }, { merge: true });
  return { ...assignment, active: true };
}

export async function clearClassQuestionBankAssignment(className) {
  const teacherUid = auth.currentUser?.uid;
  const teacherProfile = teacherUid ? await getUserProfile(teacherUid) : null;
  const cleanedClass = String(className || "").trim();
  if (teacherProfile?.role !== "teacher" || !cleanedClass) throw new Error("Teacher access required");
  await setDoc(doc(db, "classSettings", cleanedClass), { questionBankAssignment: null, updatedAt: Date.now(), updatedBy: teacherUid }, { merge: true });
  return true;
}

export async function setStudentQuestionFormat(uid, questionFormat) {
  const teacherUid = auth.currentUser?.uid;
  const teacherProfile = teacherUid ? await getUserProfile(teacherUid) : null;
  if (teacherProfile?.role !== "teacher" || !uid) throw new Error("Teacher access required");
  await updateDoc(doc(db, "users", uid), { questionFormatOverride: validQuestionFormat(questionFormat), updatedAt: new Date().toISOString() });
  return true;
}

export async function resolveQuestionFormat(profile) {
  const student = validQuestionFormat(profile?.questionFormatOverride);
  if (student !== "mixed") return { format: student, source: "student" };
  const classFormat = await getClassQuestionFormat(profile?.className);
  return { format: classFormat, source: classFormat === "mixed" ? "game" : "class" };
}

export async function updateStudentProfile(uid, profileChanges = {}) {
  try {
    const teacherUid = auth.currentUser?.uid;
    const displayName = String(profileChanges.displayName || "").trim();
    const yearLevel = String(profileChanges.yearLevel || "").trim();
    if (!teacherUid || !uid || !displayName || !/^Year (9|10|11|12|13)$/.test(yearLevel)) {
      throw new Error("Invalid student profile update");
    }

    const teacherProfile = await getUserProfile(teacherUid);
    if (teacherProfile?.role !== "teacher") throw new Error("Teacher access required");

    const studentRef = doc(db, "users", uid);
    const studentSnapshot = await getDoc(studentRef);
    if (!studentSnapshot.exists()) throw new Error("Student profile not found");
    if (studentSnapshot.data()?.role === "teacher") throw new Error("Teacher profiles cannot be edited here");

    await updateDoc(studentRef, {
      displayName: displayName.slice(0, 80),
      yearLevel,
      updatedAt: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error("Unable to update student profile:", error);
    return false;
  }
}

export async function updateStudentCoins(uid, coinAmount) {
  try {
    const teacherUid = auth.currentUser?.uid;
    const coins = Number(coinAmount);
    if (!teacherUid || !uid || !Number.isSafeInteger(coins) || coins < 0 || coins > 999999999) {
      throw new Error("Invalid student coin amount");
    }

    const teacherProfile = await getUserProfile(teacherUid);
    if (teacherProfile?.role !== "teacher") throw new Error("Teacher access required");

    const studentRef = doc(db, "users", uid);
    const studentSnapshot = await getDoc(studentRef);
    if (!studentSnapshot.exists()) throw new Error("Student profile not found");
    if (studentSnapshot.data()?.role === "teacher") throw new Error("Teacher profiles cannot be edited here");

    const now = Date.now();
    await updateDoc(studentRef, {
      "platform.coins": coins,
      "platform.lastActive": now,
      coinCorrectedAt: now,
      coinCorrectedBy: teacherUid,
      updatedAt: new Date(now).toISOString()
    });
    return true;
  } catch (error) {
    console.error("Unable to update student coins:", error);
    return false;
  }
}

export async function deleteStudentData(uid) {
  try {
    const teacherUid = auth.currentUser?.uid;
    if (!teacherUid || !uid || teacherUid === uid) throw new Error("Invalid student deletion");
    const teacherProfile = await getUserProfile(teacherUid);
    if (teacherProfile?.role !== "teacher") throw new Error("Teacher access required");
    const studentSnapshot = await getDoc(doc(db, "users", uid));
    if (!studentSnapshot.exists()) return true;
    if (studentSnapshot.data().role === "teacher") throw new Error("Teacher accounts cannot be deleted here");
    await deleteDoc(doc(db, "users", uid));
    return true;
  } catch (error) {
    console.error("Unable to delete student data:", error);
    return false;
  }
}

export async function getPlatformData(uid) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnapshot = await getDoc(userRef);

    if (!userSnapshot.exists()) {
      return null;
    }

    const platformData = userSnapshot.data().platform;
    return (platformData && typeof platformData === "object")
      ? platformData
      : null;
  } catch (error) {
    console.error("Unable to load platform data:", error);
    return undefined;
  }
}

export async function updatePlatformData(uid, changes) {
  try {
    const userRef = doc(db, "users", uid);

    const platformChanges = Object.fromEntries(
      Object.entries(changes).map(([key, value]) => [`platform.${key}`, value])
    );

    await updateDoc(userRef, platformChanges);

    return true;
  } catch (error) {
    console.error("Unable to update platform data:", error);
    return false;
  }
}

export async function getGameStats(uid, gameId) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnapshot = await getDoc(userRef);
    if (!userSnapshot.exists()) return null;

    const games = userSnapshot.data().games;
    return (games && games[gameId] && typeof games[gameId] === "object")
      ? games[gameId]
      : null;
  } catch (error) {
    console.error(`Unable to load stats for ${gameId}:`, error);
    return undefined;
  }
}

export async function getAllGameStats(uid) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnapshot = await getDoc(userRef);
    if (!userSnapshot.exists()) return null;

    const games = userSnapshot.data().games;
    return (games && typeof games === "object") ? games : null;
  } catch (error) {
    console.error("Unable to load game statistics:", error);
    return undefined;
  }
}

export async function updateGameStats(uid, gameId, changes) {
  try {
    const userRef = doc(db, "users", uid);
    const gameChanges = Object.fromEntries(
      Object.entries(changes)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [`games.${gameId}.${key}`, value])
    );

    await updateDoc(userRef, gameChanges);
    await syncLeaderboardEntry(uid, gameId, changes.highScore);
    return true;
  } catch (error) {
    console.error(`Unable to update stats for ${gameId}:`, error);
    return false;
  }
}

async function leaderboardProfile(uid) {
  if (leaderboardProfileCache.has(uid)) return leaderboardProfileCache.get(uid);
  const profile = await getUserProfile(uid);
  leaderboardProfileCache.set(uid, profile);
  return profile;
}

async function ensureLeaderboardId(uid) {
  if (leaderboardIdPromises.has(uid)) return leaderboardIdPromises.get(uid);
  const promise = (async () => {
  const profile = await leaderboardProfile(uid);
  if (profile?.leaderboardId) return profile.leaderboardId;
  const leaderboardId = globalThis.crypto.randomUUID().replaceAll("-", "");
  const saved = await updateUserProfile(uid, { leaderboardId });
  if (!saved) throw new Error("LEADERBOARD_ID_NOT_SAVED");
  leaderboardProfileCache.set(uid, { ...profile, leaderboardId });
  return leaderboardId;
  })();
  leaderboardIdPromises.set(uid, promise);
  try { return await promise; }
  catch (error) { leaderboardIdPromises.delete(uid); throw error; }
}

async function syncLeaderboardEntry(uid, gameId, highScore) {
  try {
    const score = Math.max(0, Math.floor(Number(highScore) || 0));
    const profile = await leaderboardProfile(uid);
    if (!profile || profile.role === "teacher") return;
    const leaderboardId = await ensureLeaderboardId(uid);
    const entryRef = doc(db, "leaderboards", gameId, "entries", leaderboardId);
    if (profile.leaderboardOptOut === true) {
      await deleteDoc(entryRef);
      return true;
    }
    await setDoc(entryRef, {
      gameId,
      initial: String(profile.displayName || "").trim().match(/[\p{L}\p{N}]/u)?.[0]?.toLocaleUpperCase() || "?",
      classId: String(profile.className || "Unassigned").slice(0, 80),
      highScore: score,
      updatedAt: Date.now()
    });
    leaderboardCache.delete(gameId);
    return true;
  } catch (error) {
    // Statistics remain authoritative even if the optional public score index
    // is temporarily unavailable or its rules have not yet been deployed.
    console.warn(`Unable to update leaderboard for ${gameId}:`, error);
    return false;
  }
}

export async function syncLeaderboardEntries(uid, gameStats) {
  if (!uid || !gameStats || typeof gameStats !== "object") return false;
  const results = await Promise.all(Object.entries(gameStats).map(([gameId, stats]) =>
    syncLeaderboardEntry(uid, gameId, stats?.highScore)
  ));
  return results.some(Boolean);
}

async function getLeaderboardEntries(gameId, forceRefresh = false) {
  const cached = leaderboardCache.get(gameId);
  if (!forceRefresh && cached && Date.now() - cached.loadedAt < LEADERBOARD_CACHE_MS) return cached.entries;
  const snapshot = await getDocs(collection(db, "leaderboards", gameId, "entries"));
  const entries = snapshot.docs.map(entryDoc => {
    const value = entryDoc.data();
    return {
      entryKey: entryDoc.id,
      gameId,
      initial: String(value.initial || "?").slice(0, 2),
      classId: String(value.classId || "Unassigned"),
      highScore: Math.max(0, Math.floor(Number(value.highScore) || 0)),
      updatedAt: Number(value.updatedAt) || 0
    };
  }).sort((a, b) => b.highScore - a.highScore || b.updatedAt - a.updatedAt);
  leaderboardCache.set(gameId, { entries, loadedAt: Date.now() });
  return entries;
}

export async function getClassLeaderboard(gameId, classId, maximum = 10) {
  try {
    const entries = await getLeaderboardEntries(gameId);
    return entries.filter(entry => entry.classId === classId && entry.highScore > 0).slice(0, maximum)
      .map(({ initial, highScore, updatedAt }) => ({ initial, highScore, updatedAt }));
  } catch (error) {
    console.warn("Unable to load class leaderboard:", error);
    return undefined;
  }
}

export async function getOverallLeaderboard(gameId, maximum = 10) {
  try {
    const entries = await getLeaderboardEntries(gameId);
    return entries.filter(entry => entry.highScore > 0).slice(0, maximum)
      .map(({ initial, highScore, updatedAt }) => ({ initial, highScore, updatedAt }));
  } catch (error) {
    console.warn("Unable to load overall leaderboard:", error);
    return undefined;
  }
}

export async function isClassHighScoreHolder(gameId, studentId, classId) {
  try {
    const leaders = (await getLeaderboardEntries(gameId)).filter(entry => entry.classId === classId && entry.highScore > 0);
    if (!leaders.length || leaders[0].highScore <= 0) return false;
    const entryKey = await ensureLeaderboardId(studentId);
    return leaders.some(entry => entry.entryKey === entryKey && entry.highScore === leaders[0].highScore);
  } catch (error) {
    return false;
  }
}

export async function getAllStudents() {
  try {
    const usersSnapshot = await getDocs(collection(db, "users"));
    return usersSnapshot.docs.map((userDoc) => ({
      uid: userDoc.id,
      ...userDoc.data()
    }));
  } catch (error) {
    console.error("Unable to load students:", error);
    return undefined;
  }
}

/** Load an anonymous, server-generated class third for computer calibration. */
export async function getClassAIProfile(className, difficulty) {
  // Spark projects have no trusted server process to build this anonymous
  // aggregate. The shared AI manager uses its central 45/65/85% fallbacks.
  return null;
}

export function getStudentPlatformData(uid) {
  return getPlatformData(uid);
}

export function getStudentGameStats(uid) {
  return getAllGameStats(uid);
}

function emptyCloudPlatformData() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return {
    coins: 0,
    questions: {
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      totalAnswered: 0,
      totalCorrect: 0,
      totalIncorrect: 0,
      percentageCorrect: 0,
      dailyAnswered: 0,
      dailyCorrect: 0,
      dailyIncorrect: 0
    },
    sessions: {
      totalSessions: 0,
      totalPlayTimeMs: 0,
      activePlayTimeMs: 0
    },
    currentSession: null,
    lastActive: null,
    favouriteGame: null,
    questionBanks: {}
  };
}

function emptyCloudGameStats() {
  return {
    gamesPlayed: 0,
    highScore: 0,
    questionsAnswered: 0,
    correct: 0,
    incorrect: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    percentageCorrect: 0,
    playTimeMs: 0,
    activePlayTimeMs: 0,
    lastPlayed: null,
    currentSessionStartTime: null
  };
}

function createResetRequest(resetType, gameId, operationId = null) {
  return {
    type: resetType,
    gameId: resetType === "game" ? gameId : null,
    token: `${Date.now()}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`,
    status: "pending",
    requestedAt: Date.now(),
    completedAt: null,
    requestedBy: auth.currentUser?.uid || null,
    operationId
  };
}

function studentResetUpdate(resetType, gameId, resetRequest) {
  if (resetType === "all") {
    return {
      platform: emptyCloudPlatformData(),
      games: {},
      resetRequest
    };
  }
  if (resetType === "learning") {
    return {
      "platform.questions": emptyCloudPlatformData().questions,
      "platform.questionBanks": {},
      resetRequest
    };
  }
  return {
    [`games.${gameId}`]: emptyCloudGameStats(),
    resetRequest
  };
}

export async function requestStudentProgressReset(uid, resetType, gameId = null) {
  try {
    if (!['all', 'learning', 'game'].includes(resetType)) throw new Error("Invalid reset type");
    if (resetType === "game" && (!gameId || !/^[a-z0-9-]+$/.test(gameId))) {
      throw new Error("Invalid game ID");
    }

    const userRef = doc(db, "users", uid);
    const resetRequest = createResetRequest(resetType, gameId);
    if (resetType === "learning") {
      await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(userRef);
        if (!snapshot.exists()) throw new Error("Student profile not found");
        const games = snapshot.data().games || {};
        const learningResetGames = Object.fromEntries(Object.entries(games).map(([id, stats]) => [id, {
          ...stats,
          questionsAnswered: 0,
          correct: 0,
          incorrect: 0,
          percentageCorrect: 0
        }]));
        transaction.update(userRef, {
          ...studentResetUpdate(resetType, gameId, resetRequest),
          games: learningResetGames
        });
      });
    } else {
      await updateDoc(userRef, studentResetUpdate(resetType, gameId, resetRequest));
    }

    return resetRequest;
  } catch (error) {
    console.error("Unable to request student progress reset:", error);
    return null;
  }
}

export async function requestClassProgressReset(className, resetType, gameId = null) {
  const requestedAt = Date.now();
  const operationRef = doc(collection(db, "resetOperations"));
  let processedStudents = 0;
  let affectedStudentUids = [];

  try {
    if (!className || (resetType !== "all" && resetType !== "game")) throw new Error("Invalid class reset");
    if (resetType === "game" && (!gameId || !/^[a-z0-9-]+$/.test(gameId))) throw new Error("Invalid game ID");

    const teacherUid = auth.currentUser?.uid || null;
    const teacherProfile = teacherUid ? await getUserProfile(teacherUid) : null;
    const studentsSnapshot = await getDocs(
      query(collection(db, "users"), where("className", "==", className))
    );
    const studentUids = studentsSnapshot.docs.map((studentDoc) => studentDoc.id);
    affectedStudentUids = studentUids;
    const operation = {
      operationId: operationRef.id,
      type: "class",
      className,
      resetScope: resetType,
      gameId: resetType === "game" ? gameId : null,
      requestedBy: teacherUid,
      teacherName: teacherProfile?.displayName || auth.currentUser?.displayName || "Teacher",
      requestedAt,
      studentsAffected: studentUids.length,
      affectedStudentUids: studentUids,
      processedStudents: 0,
      status: "processing",
      completedAt: null
    };
    await setDoc(operationRef, operation);

    const BATCH_SIZE = 400;
    for (let offset = 0; offset < studentUids.length; offset += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = studentUids.slice(offset, offset + BATCH_SIZE);
      chunk.forEach((uid) => {
        const request = createResetRequest(resetType, gameId, operationRef.id);
        batch.update(doc(db, "users", uid), studentResetUpdate(resetType, gameId, request));
      });
      await batch.commit();
      processedStudents += chunk.length;
      await updateDoc(operationRef, { processedStudents });
    }

    const completedAt = Date.now();
    await updateDoc(operationRef, {
      processedStudents,
      status: "completed",
      completedAt
    });
    return { ...operation, processedStudents, status: "completed", completedAt };
  } catch (error) {
    console.error("Unable to reset class progress:", error);
    try {
      await setDoc(operationRef, {
        operationId: operationRef.id,
        type: "class",
        className: className || null,
        resetScope: resetType || null,
        gameId: gameId || null,
        requestedBy: auth.currentUser?.uid || null,
        requestedAt,
        studentsAffected: affectedStudentUids.length,
        affectedStudentUids,
        processedStudents,
        status: processedStudents > 0 ? "partial" : "failed",
        completedAt: Date.now(),
        error: error.message || "Unknown reset error"
      }, { merge: true });
    } catch (auditError) {
      console.error("Unable to record failed class reset:", auditError);
    }
    return null;
  }
}

export async function getClassResetHistory() {
  try {
    const historySnapshot = await getDocs(collection(db, "resetOperations"));
    return historySnapshot.docs
      .map((historyDoc) => ({ operationId: historyDoc.id, ...historyDoc.data() }))
      .sort((a, b) => Number(b.requestedAt || 0) - Number(a.requestedAt || 0));
  } catch (error) {
    console.error("Unable to load class reset history:", error);
    return undefined;
  }
}

export async function getPendingProgressReset(uid) {
  try {
    const userSnapshot = await getDoc(doc(db, "users", uid));
    if (!userSnapshot.exists()) return null;
    const request = userSnapshot.data().resetRequest;
    return request && request.status === "pending" ? request : null;
  } catch (error) {
    console.error("Unable to check pending progress reset:", error);
    return undefined;
  }
}

export async function completeProgressReset(uid, token) {
  try {
    const userRef = doc(db, "users", uid);
    return await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(userRef);
      const request = snapshot.data()?.resetRequest;
      if (!request || request.token !== token || request.status !== "pending") return false;
      transaction.update(userRef, {
        "resetRequest.status": "completed",
        "resetRequest.completedAt": Date.now()
      });
      return true;
    });
  } catch (error) {
    console.error("Unable to complete progress reset:", error);
    return false;
  }
}

const ACTIVE_MATCH_STATUSES = new Set(["waiting", "lobby", "playing", "finished"]);
const MATCH_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const ACTIVE_CHALLENGE_STATUSES = new Set(["waiting", "ready", "countdown", "playing", "finished"]);
const CHALLENGE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function requireAuthenticatedUser() {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in to play online.");
  return user;
}

function publicMatch(snapshot) {
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

function cleanChallengeProgress(value = {}) {
  const number = key => Math.max(0, Number(value[key]) || 0);
  return {
    score: number("score"), distance: number("distance"), wave: number("wave"), waveProgress: number("waveProgress"),
    questionsCorrect: number("questionsCorrect"), questionsAnswered: number("questionsAnswered"),
    survivalTimeMs: number("survivalTimeMs"), alive: value.alive !== false, finished: !!value.finished,
    updatedAt: Date.now()
  };
}

function challengeResult(room) {
  const p1 = room.player1?.progress || {}, p2 = room.player2?.progress || {}, type = room.selectedChallenge?.type;
  const draw = () => "draw";
  const higher = (a, b, fallbacks = []) => {
    if (Number(a) !== Number(b)) return Number(a) > Number(b) ? room.player1.uid : room.player2.uid;
    for (const [x, y] of fallbacks) if (Number(x) !== Number(y)) return Number(x) > Number(y) ? room.player1.uid : room.player2.uid;
    return draw();
  };
  if (type === "questionRace") {
    const target = Number(room.selectedChallenge.targetCorrect || 25);
    if (p1.questionsCorrect >= target || p2.questionsCorrect >= target) return higher(p1.questionsCorrect, p2.questionsCorrect, [[-p1.updatedAt, -p2.updatedAt]]);
  }
  if (type === "timeAttack") {
    const target = Number(room.selectedChallenge.targetScore || 10000);
    if (p1.score >= target || p2.score >= target) return higher(p1.score, p2.score, [[-p1.updatedAt, -p2.updatedAt]]);
  }
  if (type === "survival" && p1.alive !== p2.alive) return p1.alive ? room.player1.uid : room.player2.uid;
  if (!p1.finished || !p2.finished) return null;
  if (type === "accuracyChallenge") {
    const minimum = Number(room.selectedChallenge.minimumQuestions || 20);
    const a = p1.questionsAnswered >= minimum ? p1.questionsCorrect / Math.max(1, p1.questionsAnswered) : -1;
    const b = p2.questionsAnswered >= minimum ? p2.questionsCorrect / Math.max(1, p2.questionsAnswered) : -1;
    return higher(a, b, [[p1.questionsCorrect, p2.questionsCorrect], [p1.score, p2.score]]);
  }
  if (type === "distanceRace") return higher(p1.distance, p2.distance, [[p1.score, p2.score], [p1.survivalTimeMs, p2.survivalTimeMs]]);
  if (type === "waveRace") return higher(p1.wave, p2.wave, [[p1.waveProgress, p2.waveProgress], [p1.score, p2.score], [p1.survivalTimeMs, p2.survivalTimeMs]]);
  if (type === "survival") return higher(p1.survivalTimeMs, p2.survivalTimeMs, [[p1.score, p2.score]]);
  return higher(p1.score, p2.score, [[p1.questionsCorrect, p2.questionsCorrect], [p1.survivalTimeMs, p2.survivalTimeMs]]);
}

export async function createChallengeRoom(gameId, player, validTypes) {
  const user = requireAuthenticatedUser();
  const types = Array.isArray(validTypes) ? validTypes.filter(item => item?.type && item?.config?.enabled).slice(0, 8) : [];
  if (!gameId || player?.uid !== user.uid || !types.length) throw new Error("Invalid challenge configuration.");
  for (let attempt = 0; attempt < 20; attempt++) {
    const roomCode = String(Math.floor(10000 + Math.random() * 90000));
    const ref = doc(db, "challenges", roomCode);
    const created = await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(ref), existing = snapshot.data();
      if (existing && ACTIVE_CHALLENGE_STATUSES.has(existing.status) && Date.now() - Number(existing.updatedAt || 0) < CHALLENGE_STALE_AFTER_MS) return false;
      const now = Date.now(), progress = cleanChallengeProgress();
      transaction.set(ref, { challengeId: roomCode, roomCode, gameId, status:"waiting", validTypes:types, selectedChallenge:null,
        player1:{uid:user.uid,displayName:String(player.displayName||"Player 1").slice(0,40),ready:false,wager:0,wagerLocked:false,connected:true,progress}, player2:null,
        winnerUid:null, previousChallengeType:null, round:1, startedAt:null, finishedAt:null, economyProcessed:{}, createdAt:now, updatedAt:now,
        expiresAt:new Date(now + 24 * 60 * 60 * 1000) });
      return true;
    });
    if (created) return roomCode;
  }
  throw new Error("Unable to create a challenge room. Please try again.");
}

export async function joinChallengeRoom(roomCode, player) {
  const user = requireAuthenticatedUser(), code = String(roomCode || "");
  if (!/^\d{5}$/.test(code) || player?.uid !== user.uid) throw new Error("Enter a valid 5-digit room code.");
  const ref = doc(db, "challenges", code);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref); if (!snapshot.exists()) throw new Error("ROOM_NOT_FOUND");
    const room = snapshot.data();
    if (room.player1?.uid === user.uid) throw new Error("CREATOR_CANNOT_JOIN");
    if (room.player2 || room.status !== "waiting") throw new Error("ROOM_FULL");
    transaction.update(ref,{player2:{uid:user.uid,displayName:String(player.displayName||"Player 2").slice(0,40),ready:false,wager:0,wagerLocked:false,connected:true,progress:cleanChallengeProgress()},status:"ready",updatedAt:Date.now()});
    return code;
  });
}

export function watchChallengeRoom(roomCode, onChange, onError) {
  requireAuthenticatedUser();
  return onSnapshot(doc(db,"challenges",String(roomCode)),snapshot=>onChange(publicMatch(snapshot)),onError);
}

export async function updateChallengeRoom(roomCode, action = {}) {
  const user = requireAuthenticatedUser(), ref = doc(db,"challenges",String(roomCode));
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref); if (!snapshot.exists()) throw new Error("ROOM_NOT_FOUND");
    const room = {id:snapshot.id,...snapshot.data()}, slot = room.player1?.uid===user.uid?"player1":room.player2?.uid===user.uid?"player2":null;
    if (!slot) throw new Error("NOT_A_PARTICIPANT");
    const changes = {}, now = Date.now();
    if (action.type === "wager") {
      if (!["waiting","ready"].includes(room.status) || room[slot].ready) throw new Error("WAGER_LOCKED");
      const userSnapshot = await transaction.get(doc(db,"users",user.uid));
      const balance = Math.max(0,Number(userSnapshot.data()?.platform?.coins)||0), wager = Math.floor(Number(action.wager)||0);
      if (wager < 0 || wager > balance) throw new Error("INVALID_WAGER"); changes[`${slot}.wager`] = wager;
    } else if (action.type === "ready") {
      if (!["waiting","ready"].includes(room.status)) throw new Error("CHALLENGE_ALREADY_STARTED");
      changes[`${slot}.ready`] = !!action.ready; changes[`${slot}.wagerLocked`] = !!action.ready;
    } else if (action.type === "start") {
      if (slot!=="player1" || room.status!=="ready" || !room.player1.ready || !room.player2?.ready) throw new Error("NOT_READY");
      const selected = room.validTypes.find(item=>item.type===action.challengeType); if (!selected) throw new Error("INVALID_CHALLENGE_TYPE");
      changes.selectedChallenge={type:selected.type,...selected.config};changes.status="countdown";changes.startedAt=now+5000;
      changes["player1.wagerLocked"]=true;changes["player2.wagerLocked"]=true;
    } else if (action.type === "progress") {
      if (!["countdown","playing"].includes(room.status)) return room;
      const old=room[slot].progress||{}, next=cleanChallengeProgress(action.progress);
      ["score","distance","wave","waveProgress","questionsCorrect","questionsAnswered","survivalTimeMs"].forEach(key=>{next[key]=Math.max(Number(old[key])||0,Number(next[key])||0);});
      next.questionsCorrect=Math.min(next.questionsCorrect,next.questionsAnswered); changes[`${slot}.progress`]=next;
      if (room.status==="countdown"&&now>=Number(room.startedAt)) changes.status="playing";
      const projected={...room,[slot]:{...room[slot],progress:next},status:changes.status||room.status}; const winner=challengeResult(projected);
      if (winner){changes.status="finished";changes.winnerUid=winner;changes.finishedAt=now;changes.expiresAt=new Date(now + 24 * 60 * 60 * 1000);}
    } else if (action.type === "forfeit") {
      if (!["countdown","playing"].includes(room.status)) throw new Error("NOT_ACTIVE"); changes.status="finished";changes.winnerUid=slot==="player1"?room.player2.uid:room.player1.uid;changes.finishedAt=now;changes.forfeitedBy=user.uid;changes.expiresAt=new Date(now + 24 * 60 * 60 * 1000);
    } else if (action.type === "presence") {
      changes[`${slot}.connected`]=!!action.connected;changes[`${slot}.disconnectedAt`]=action.connected?null:now;
    } else if (action.type === "disconnectForfeit") {
      if (!["countdown","playing"].includes(room.status)) throw new Error("NOT_ACTIVE");const otherSlot=slot==="player1"?"player2":"player1",disconnectedAt=Number(room[otherSlot]?.disconnectedAt)||0;if(room[otherSlot]?.connected!==false||now-disconnectedAt<30000)throw new Error("RECONNECT_PENDING");changes.status="finished";changes.winnerUid=user.uid;changes.finishedAt=now;changes.forfeitedBy=room[otherSlot].uid;changes.expiresAt=new Date(now + 24 * 60 * 60 * 1000);
    } else if (action.type === "leave") {
      if (!["waiting","ready"].includes(room.status)) throw new Error("ACTIVE_CHALLENGE_REQUIRES_FORFEIT");if(slot==="player2"){changes.player2=null;changes.status="waiting";changes["player1.ready"]=false;changes["player1.wagerLocked"]=false;}else{changes.status="abandoned";changes.leftBy=user.uid;changes.expiresAt=new Date(now + 60 * 60 * 1000);}
    } else if (action.type === "rematch") {
      if (room.status!=="finished") throw new Error("NOT_FINISHED"); const requests={...(room.rematchRequests||{}),[user.uid]:true};changes.rematchRequests=requests;
      if (room.player1&&room.player2&&requests[room.player1.uid]&&requests[room.player2.uid]) { const progress=cleanChallengeProgress();Object.assign(changes,{status:"ready",selectedChallenge:null,winnerUid:null,previousChallengeType:room.selectedChallenge?.type||null,startedAt:null,finishedAt:null,rematchRequests:{},economyProcessed:{},round:Number(room.round||1)+1,expiresAt:new Date(now + 24 * 60 * 60 * 1000)});["player1","player2"].forEach(key=>{changes[`${key}.ready`]=false;changes[`${key}.wager`]=0;changes[`${key}.wagerLocked`]=false;changes[`${key}.progress`]=progress;}); }
    }
    changes.updatedAt=now;transaction.update(ref,changes);return {...room,...changes};
  });
}

export async function claimChallengeEconomy(roomCode) {
  const user=requireAuthenticatedUser(),challengeRef=doc(db,"challenges",String(roomCode)),userRef=doc(db,"users",user.uid);
  return runTransaction(db,async transaction=>{const challengeSnapshot=await transaction.get(challengeRef),userSnapshot=await transaction.get(userRef);if(!challengeSnapshot.exists()||!userSnapshot.exists())throw new Error("CLAIM_NOT_FOUND");const room=challengeSnapshot.data(),slot=room.player1?.uid===user.uid?"player1":room.player2?.uid===user.uid?"player2":null;if(!slot||room.status!=="finished"||!room.startedAt||room.economyProcessed?.[user.uid])throw new Error("CLAIM_INVALID");const wager=Math.max(0,Math.floor(Number(room[slot].wager)||0)),result=room.winnerUid==="draw"?"draw":room.winnerUid===user.uid?"win":"loss",delta=result==="win"?Math.floor(wager*.5):result==="loss"?-wager:0,userData=userSnapshot.data(),balance=Math.max(0,(Number(userData.platform?.coins)||0)+delta);transaction.update(userRef,{"platform.coins":balance});transaction.update(challengeRef,{[`economyProcessed.${user.uid}`]:{result,wager,delta,balance,processedAt:Date.now()},updatedAt:Date.now()});return{result,wager,delta,balance};});
}

export async function createMultiplayerMatch(gameId, player, initialGameState, settings = {}) {
  const user = requireAuthenticatedUser();
  if (!gameId || player?.uid !== user.uid) throw new Error("Invalid match player.");

  for (let attempt = 0; attempt < 20; attempt++) {
    const roomCode = String(Math.floor(10000 + Math.random() * 90000));
    const matchRef = doc(db, "matches", roomCode);
    try {
      const created = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(matchRef);
        const existing = snapshot.data();
        const isActive = existing && ACTIVE_MATCH_STATUSES.has(existing.status)
          && Date.now() - Number(existing.updatedAt || existing.createdAt || 0) < MATCH_STALE_AFTER_MS;
        if (isActive) return false;

        const now = Date.now();
        transaction.set(matchRef, {
          gameId,
          roomCode,
          player1: { uid: user.uid, displayName: String(player.displayName || "Player 1").slice(0, 40) },
          player2: null,
          status: "waiting",
          currentTurn: null,
          startingPlayerUid: user.uid,
          gameState: initialGameState,
          settings,
          winner: null,
          round: 1,
          rematchRequests: {},
          rewardsClaimed: {},
          leftBy: null,
          createdAt: now,
          updatedAt: now,
          expiresAt: new Date(now + 24 * 60 * 60 * 1000)
        });
        return true;
      });
      if (created) return roomCode;
    } catch (error) {
      console.warn("Room-code attempt failed:", error);
      if (error?.code === "permission-denied") {
        throw new Error("Firestore is blocking multiplayer rooms. Deploy the Arcade Academy /matches security rules and try again.");
      }
    }
  }
  throw new Error("Unable to create a unique room. Please try again.");
}

export async function joinMultiplayerMatch(roomCode, player) {
  const user = requireAuthenticatedUser();
  if (!/^\d{5}$/.test(roomCode) || player?.uid !== user.uid) throw new Error("Enter a valid 5-digit room code.");
  const matchRef = doc(db, "matches", roomCode);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(matchRef);
    if (!snapshot.exists()) throw new Error("ROOM_NOT_FOUND");
    const match = snapshot.data();
    if (match.player1?.uid === user.uid) throw new Error("CREATOR_CANNOT_JOIN");
    if (match.status !== "waiting" || match.player2) throw new Error("ROOM_FULL");
    if (Date.now() - Number(match.updatedAt || match.createdAt || 0) >= MATCH_STALE_AFTER_MS) {
      throw new Error("ROOM_NOT_FOUND");
    }

    const joinedStatus = match.settings?.requiresReady ? "lobby" : "playing";
    transaction.update(matchRef, {
      player2: { uid: user.uid, displayName: String(player.displayName || "Player 2").slice(0, 40) },
      status: joinedStatus,
      currentTurn: match.player1.uid,
      updatedAt: Date.now(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    return roomCode;
  });
}

export function watchMultiplayerMatch(matchId, onChange, onError) {
  requireAuthenticatedUser();
  return onSnapshot(doc(db, "matches", matchId), (snapshot) => {
    onChange(publicMatch(snapshot));
  }, onError);
}

export async function transactMultiplayerMatch(matchId, updater) {
  const user = requireAuthenticatedUser();
  const matchRef = doc(db, "matches", matchId);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(matchRef);
    if (!snapshot.exists()) throw new Error("MATCH_NOT_FOUND");
    const match = { id: snapshot.id, ...snapshot.data() };
    const isParticipant = match.player1?.uid === user.uid || match.player2?.uid === user.uid;
    if (!isParticipant) throw new Error("NOT_A_PARTICIPANT");
    const changes = updater(match, user.uid);
    if (!changes || typeof changes !== "object") return match;
    const now = Date.now();
    const expiryHours = changes.status === "abandoned" ? 1 : 24;
    transaction.update(matchRef, {
      ...changes,
      updatedAt: now,
      expiresAt: new Date(now + expiryHours * 60 * 60 * 1000)
    });
    return { ...match, ...changes };
  });
}

export async function claimMultiplayerReward(matchId, expectedRound) {
  const user = requireAuthenticatedUser();
  const matchRef = doc(db, "matches", matchId);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(matchRef);
    if (!snapshot.exists()) return null;
    const match = snapshot.data();
    if (match.status !== "finished" || Number(match.round) !== Number(expectedRound)) return null;
    const isPlayer1 = match.player1?.uid === user.uid;
    const isPlayer2 = match.player2?.uid === user.uid;
    if (!isPlayer1 && !isPlayer2) return null;
    const claimId = `${Number(match.round)}_${user.uid}`;
    if (match.rewardsClaimed?.[claimId]) return null;

    const result = match.winner === "draw" ? "draw" : match.winner === user.uid ? "win" : "loss";
    // Multiplayer results are claimed once so wins/losses/draws cannot be
    // counted repeatedly after refresh. Tic-Tac-Toe does not award coins.
    const coins = 0;
    transaction.update(matchRef, {
      [`rewardsClaimed.${claimId}`]: { round: Number(match.round), uid: user.uid, result, coins, claimedAt: Date.now() },
      updatedAt: Date.now()
    });
    return { result, coins };
  });
}

window.FirebaseManager = {
  signInWithGoogle,
  signOut,
  watchAuthState,
  getUserProfile,
  createUserProfile,
  updateUserProfile,
  updateStudentProfile,
  updateStudentCoins,
  updateStudentClass,
  getClassQuestionFormat,
  setClassQuestionFormat,
  getClassQuestionBankAssignment,
  setClassQuestionBankAssignment,
  clearClassQuestionBankAssignment,
  setStudentQuestionFormat,
  resolveQuestionFormat,
  deleteStudentData,
  getPlatformData,
  updatePlatformData,
  getGameStats,
  getAllGameStats,
  updateGameStats,
  getClassLeaderboard,
  getOverallLeaderboard,
  isClassHighScoreHolder,
  syncLeaderboardEntries,
  getAllStudents,
  getClassAIProfile,
  getStudentPlatformData,
  getStudentGameStats,
  requestStudentProgressReset,
  requestClassProgressReset,
  getClassResetHistory,
  getPendingProgressReset,
  completeProgressReset,
  createChallengeRoom,
  joinChallengeRoom,
  watchChallengeRoom,
  updateChallengeRoom,
  claimChallengeEconomy,
  createMultiplayerMatch,
  joinMultiplayerMatch,
  watchMultiplayerMatch,
  transactMultiplayerMatch,
  claimMultiplayerReward
};

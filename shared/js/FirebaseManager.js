import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  getAuth,
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
  setDoc,
  updateDoc,
  runTransaction,
  writeBatch,
  query,
  where
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

export const auth = getAuth(app);
export const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

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
      Object.entries(changes).map(([key, value]) => [`games.${gameId}.${key}`, value])
    );

    await updateDoc(userRef, gameChanges);
    return true;
  } catch (error) {
    console.error(`Unable to update stats for ${gameId}:`, error);
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
    favouriteGame: null
  };
}

function emptyCloudGameStats() {
  return {
    gamesPlayed: 0,
    highScore: 0,
    questionsAnswered: 0,
    correct: 0,
    incorrect: 0,
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
  return {
    [`games.${gameId}`]: emptyCloudGameStats(),
    resetRequest
  };
}

export async function requestStudentProgressReset(uid, resetType, gameId = null) {
  try {
    if (resetType !== "all" && resetType !== "game") throw new Error("Invalid reset type");
    if (resetType === "game" && (!gameId || !/^[a-z0-9-]+$/.test(gameId))) {
      throw new Error("Invalid game ID");
    }

    const userRef = doc(db, "users", uid);
    const resetRequest = createResetRequest(resetType, gameId);
    await updateDoc(userRef, studentResetUpdate(resetType, gameId, resetRequest));

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

window.FirebaseManager = {
  signInWithGoogle,
  signOut,
  watchAuthState,
  getUserProfile,
  createUserProfile,
  updateUserProfile,
  getPlatformData,
  updatePlatformData,
  getGameStats,
  getAllGameStats,
  updateGameStats,
  getAllStudents,
  getStudentPlatformData,
  getStudentGameStats,
  requestStudentProgressReset,
  requestClassProgressReset,
  getClassResetHistory,
  getPendingProgressReset,
  completeProgressReset
};

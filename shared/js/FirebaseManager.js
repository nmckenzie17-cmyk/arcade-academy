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
  doc,
  getDoc,
  setDoc,
  updateDoc
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
  updateGameStats
};

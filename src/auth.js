/* ============================================================
   Forge — Firebase Authentication
   Central auth module. Handles Google sign-in, email/password,
   session persistence, and auth state broadcasting.
   ============================================================ */

import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence,
  updateProfile
} from 'firebase/auth';

// ─── Firebase Config ─────────────────────────────────────────────────────────
// Centralised Forge Firebase project — users just sign in, no setup needed.
const _HARDCODED_CONFIG = {
  apiKey:            "AIzaSyD-1MHM5jsBOushSkKHGpTWLqfBx36VIeQ",
  authDomain:        "myforge-app.firebaseapp.com",
  databaseURL:       "https://myforge-app-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "myforge-app",
  storageBucket:     "myforge-app.firebasestorage.app",
  messagingSenderId: "977760622087",
  appId:             "1:977760622087:web:7055668fd270a7d2893ca2",
  measurementId:     "G-0BS09ZSQTR"
};

export const FIREBASE_CONFIG = _HARDCODED_CONFIG;

let _app = null;
let _auth = null;
let _currentUser = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

export function isFirebaseConfigured() {
  return !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
}

export function initFirebase() {
  if (!isFirebaseConfigured()) return null;
  if (_app) return _app;
  try {
    _app = getApps().length > 0 ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
    _auth = getAuth(_app);
    setPersistence(_auth, browserLocalPersistence).catch(() => {});
    return _app;
  } catch (err) {
    console.error('[Auth] Firebase init failed:', err);
    return null;
  }
}

export function getFirebaseApp() { return _app; }
export function getFirebaseAuth() { return _auth; }
export function getCurrentUser() { return _currentUser; }
export function isLoggedIn() { return !!_currentUser; }

// ─── Auth State ───────────────────────────────────────────────────────────────

export function onAuthChanged(callback) {
  if (!_auth) { callback(null); return () => {}; }
  return onAuthStateChanged(_auth, (user) => {
    _currentUser = user;
    callback(user);
  });
}

export function waitForAuthReady() {
  return new Promise((resolve) => {
    if (!_auth) { resolve(null); return; }
    const unsub = onAuthStateChanged(_auth, (user) => {
      _currentUser = user;
      unsub();
      resolve(user);
    });
  });
}

// ─── Sign In ──────────────────────────────────────────────────────────────────

export async function signInWithGoogle() {
  if (!_auth) throw new Error('Firebase not initialized');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const isMobileNative = typeof window.Capacitor !== 'undefined' && window.Capacitor?.isNativePlatform?.();
  if (isMobileNative) {
    await signInWithRedirect(_auth, provider);
    return null;
  }
  const result = await signInWithPopup(_auth, provider);
  _currentUser = result.user;
  return result.user;
}

export async function signInWithEmail(email, password) {
  if (!_auth) throw new Error('Firebase not initialized');
  const result = await signInWithEmailAndPassword(_auth, email, password);
  _currentUser = result.user;
  return result.user;
}

export async function signUpWithEmail(email, password, username) {
  if (!_auth) throw new Error('Firebase not initialized');
  const result = await createUserWithEmailAndPassword(_auth, email, password);
  if (username) {
    await updateProfile(result.user, { displayName: username });
  }
  _currentUser = result.user;
  return result.user;
}

export async function signOutUser() {
  if (!_auth) return;
  await signOut(_auth);
  _currentUser = null;
}

// ─── User Info ────────────────────────────────────────────────────────────────

export function getUserId()          { return _currentUser?.uid || null; }
export function getUserDisplayName() { return _currentUser?.displayName || _currentUser?.email?.split('@')[0] || 'Forge User'; }
export function getUserEmail()       { return _currentUser?.email || null; }
export function getUserPhotoURL()    { return _currentUser?.photoURL || null; }

// ─── Config Persistence ───────────────────────────────────────────────────────

export function saveFirebaseConfig(config) {
  const map = {
    apiKey: 'api-key', authDomain: 'auth-domain', projectId: 'project-id',
    storageBucket: 'storage-bucket', messagingSenderId: 'messaging-sender-id', appId: 'app-id'
  };
  Object.entries(map).forEach(([key, slug]) => {
    if (config[key]) localStorage.setItem(`forge-firebase-${slug}`, config[key]);
  });
  Object.assign(FIREBASE_CONFIG, config);
}

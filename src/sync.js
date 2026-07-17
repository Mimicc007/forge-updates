/* ============================================================
   Forge — Firebase Cloud Sync
   Real-time bidirectional Firestore sync.
   Data is partitioned by user UID — fully private per user.
   Path: users/{uid}/projects/{projectId}/...
   ============================================================ */

import { getFirebaseApp, getUserId, isLoggedIn } from './auth.js';
import { getActiveProject } from './db.js';

let _unsub = null;
let _db = null;
let _onDataUpdated = null;
let _onStatusChange = null;

// ─── Lazy Firestore loader ────────────────────────────────────────────────────

async function _getDb() {
  if (_db) return _db;
  const app = getFirebaseApp();
  if (!app) return null;
  const { getFirestore, enableIndexedDbPersistence } = await import('firebase/firestore');
  _db = getFirestore(app);
  try { await enableIndexedDbPersistence(_db); } catch (_) { /* ok — already enabled or unsupported */ }
  return _db;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function initFirebaseSync(onStatusChange, onDataUpdated) {
  _onStatusChange = onStatusChange;
  _onDataUpdated  = onDataUpdated;

  if (!isLoggedIn()) {
    onStatusChange('Off');
    return;
  }

  const project = await getActiveProject();
  if (!project) { onStatusChange('Off'); return; }

  try {
    onStatusChange('Connecting…');
    const db = await _getDb();
    if (!db) { onStatusChange('Off'); return; }

    const { doc, onSnapshot, setDoc, serverTimestamp } = await import('firebase/firestore');
    const uid = getUserId();
    // Each user's data lives at: users/{uid}/projects/{projectId}
    const ref = doc(db, 'users', uid, 'projects', project.id);

    // ── Listen for remote changes ──
    _unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const remote = snap.data();
      const remoteMs = remote._updatedAt?.toMillis?.() || 0;
      const localMs  = parseInt(localStorage.getItem(`forge-sync-ts-${project.id}`) || '0');
      if (remoteMs > localMs && _onDataUpdated) {
        _onDataUpdated(remote);
        localStorage.setItem(`forge-sync-ts-${project.id}`, String(remoteMs));
      }
    }, (err) => {
      console.warn('[Sync] listener error:', err);
      onStatusChange('Error');
    });

    onStatusChange('Live ☁');
  } catch (err) {
    console.warn('[Sync] init error:', err);
    onStatusChange('Off');
  }
}

/**
 * Push a local change to Firestore.
 * Call this from db.js whenever IndexedDB is written to.
 */
export async function pushChange(payload) {
  if (!isLoggedIn()) return;
  const project = await getActiveProject();
  if (!project) return;
  try {
    const db = await _getDb();
    if (!db) return;
    const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
    const uid = getUserId();
    const ref = doc(db, 'users', uid, 'projects', project.id);
    await setDoc(ref, { ...payload, _updatedAt: serverTimestamp() }, { merge: true });
    const now = Date.now();
    localStorage.setItem(`forge-sync-ts-${project.id}`, String(now));
    _onStatusChange?.('Synced ✓');
    // Fade back to "Live" after 2s
    setTimeout(() => _onStatusChange?.('Live ☁'), 2000);
  } catch (err) {
    console.warn('[Sync] push error:', err);
    _onStatusChange?.('Error');
  }
}

export function stopSync() {
  if (_unsub) { _unsub(); _unsub = null; }
}

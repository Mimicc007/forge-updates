/* ============================================================
   Forge — Firebase Cloud Sync
   Universal DB Sync stub
   ============================================================ */

import { getActiveProject } from './db.js';

export async function initFirebaseSync(onStatusChange, onDataUpdated) {
  let project;
  try {
    project = await getActiveProject();
  } catch (err) {
    onStatusChange('Sync Error: Cannot read project settings');
    return;
  }

  if (!project || !project.firebaseEnabled || !project.firebaseConfig) {
    onStatusChange('Off');
    return;
  }

  onStatusChange('Sync temporarily disabled pending universal db upgrade.');
}

export function stopSync() {
  console.log('Sync stopped.');
}

/* ============================================================
   Forge — Main Entry Point
   Initializes the app, router, sidebar, and global search.
   ============================================================ */
import { createIcons, icons } from 'lucide';
import './index.css';
import { renderSidebar } from './sidebar.js';
import { registerRoute, initRouter, navigate } from './router.js';
import { refreshIcons, applyCustomAccent } from './icons.js';
import { searchPages, getActiveProject, resetDatabase, initActiveProject } from './db.js';
import { initGlobalSearch } from './ui.js';
// --- Import Pages ---
import { renderDashboard } from './pages/dashboard.js';
import { renderSchemaView } from './pages/schemaView.js';
import { renderPageView } from './pages/pageView.js';
import { renderGraphView } from './pages/graphView.js';
import { renderWorkspace } from './pages/workspace.js';
import { renderSettings } from './pages/settings.js';
import { renderProjectHub } from './pages/projectHub.js';
import { renderStoryTimeline } from './pages/storyTimeline.js';
import { renderQuickCapture } from './pages/quickCapture.js';
import './tutorial.js'; // Ensure tutorial hooks load
import { initAiDrawer } from './ai.js';
import { initSceneMode } from './sceneMode.js';
import { initContinuityMonitor } from './continuityMonitor.js';
import { renderContinuityEngine } from './pages/continuityEngine.js';
import { renderWriterAnalytics } from './pages/writerAnalytics.js';
import { isMobile, isCapacitor, platform } from './platform.js';
import { initMobileNav, shouldUseMobileNav } from './mobileNav.js';
import { renderMobileDashboard } from './pages/mobileDashboard.js';
import { initFirebase, isFirebaseConfigured, waitForAuthReady, onAuthChanged, isLoggedIn } from './auth.js';
import { renderLogin } from './pages/login.js';
import './mobile.css';
// import './agentation-mount.js'; // Dev-only Agentation annotation toolbar

// Setup routes
registerRoute('login', renderLogin);
registerRoute('dashboard', renderDashboard);
registerRoute('settings', renderSettings);
registerRoute('hub', renderProjectHub);
registerRoute('schema/:id', renderSchemaView);
registerRoute('page/:id', renderPageView);
registerRoute('graph', renderGraphView);
registerRoute('workspace/:tabId', renderWorkspace);
registerRoute('story-timeline', renderStoryTimeline);
registerRoute('quick-capture', renderQuickCapture);
registerRoute('continuity', renderContinuityEngine);
registerRoute('writer-analytics', renderWriterAnalytics);
registerRoute('write', renderStoryTimeline); // mobile overrides this, desktop maps to story-timeline
registerRoute('databases', renderDashboard); // mobile overrides this, desktop maps to dashboard


function showCrashScreen(err) {
  const isDbError = String(err).includes('UnknownError') || String(err).includes('database') || String(err).includes('IndexedDB') || String(err).includes('quota');
  
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#0a0812;color:#e5a93b;font-family:sans-serif;padding:40px;box-sizing:border-box;">
      <div style="font-size:3.5rem;margin-bottom:20px;filter:drop-shadow(0 0 10px rgba(229,169,59,0.3));">⚡</div>
      <h1 style="font-size:1.6rem;margin-bottom:12px;color:#fff;font-weight:600;letter-spacing:-0.025em;">Forge failed to start</h1>
      <p style="color:#a0aec0;margin-bottom:24px;font-size:0.95rem;max-width:600px;text-align:center;line-height:1.5;">
        An unexpected error occurred during startup. This is often caused by database corruption after a system crash.
      </p>
      
      <pre style="background:#13111C;border:1px solid #2a2240;border-radius:8px;padding:20px;max-width:700px;width:100%;box-sizing:border-box;overflow:auto;text-align:left;font-size:0.85rem;color:#f43f5e;font-family:monospace;margin-bottom:24px;box-shadow:inset 0 2px 4px rgba(0,0,0,0.5);">${String(err?.stack || err)}</pre>
      
      <div style="display:flex;gap:16px;margin-bottom:32px;flex-wrap:wrap;justify-content:center;">
        <button onclick="location.reload()" style="padding:10px 24px;background:#e5a93b;color:#0a0812;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.9rem;transition:opacity 0.2s;">
          Reload App
        </button>
        ${isDbError ? `
          <button id="reset-db-btn" style="padding:10px 24px;background:#f43f5e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.9rem;">
            Reset Database
          </button>
        ` : ''}
      </div>

      ${isDbError ? `
        <div style="background:#13111C;border:1px solid #2a2240;border-radius:8px;padding:20px;max-width:600px;width:100%;box-sizing:border-box;text-align:left;">
          <h4 style="color:#e5a93b;margin:0 0 8px 0;font-size:1rem;font-weight:600;">Database Recovery Info</h4>
          <p style="color:#a0aec0;font-size:0.85rem;line-height:1.5;margin:0 0 12px 0;">
            A full backup of your app directory was saved to:
            <code style="display:block;background:#0a0812;padding:6px 10px;border-radius:4px;margin-top:8px;color:#cbd5e0;word-break:break-all;font-family:monospace;">C:\\Users\\ryanm\\AppData\\Roaming\\Forge_Backup</code>
          </p>
          <p style="color:#a0aec0;font-size:0.85rem;line-height:1.5;margin:0;">
            If reloading fails, clicking "Reset Database" will wipe the corrupted local database, allowing Forge to start fresh. You can then restore your data if needed.
          </p>
        </div>
      ` : ''}
    </div>
  `;

  if (isDbError) {
    document.getElementById('reset-db-btn').addEventListener('click', async () => {
      if (confirm('Are you sure you want to reset the database? This will clear all local workspace files (though you can find your backup in AppData/Roaming/Forge_Backup).')) {
        try {
          const btn = document.getElementById('reset-db-btn');
          btn.disabled = true;
          btn.innerText = 'Resetting...';
          await resetDatabase();
          alert('Database reset successful. Reloading...');
          location.reload();
        } catch (resetErr) {
          alert('Failed to reset database: ' + resetErr.message);
        }
      }
    });
  }
}

// Read back any native crash log left by MainActivity.java's uncaught-exception
// handler (see that file for why this exists). Shows it via the same crash
// screen used for JS errors, then deletes the file so it doesn't reappear.
async function checkForPastNativeCrash() {
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const result = await Filesystem.readFile({
      path: 'last_crash.txt',
      directory: Directory.Data,
      encoding: 'utf8',
    });
    showCrashScreen('[Previous session crash \u2014 captured on last launch]\n\n' + result.data);
    await Filesystem.deleteFile({ path: 'last_crash.txt', directory: Directory.Data }).catch(() => {});
    return true;
  } catch (e) {
    // No crash file present \u2014 this is the normal, expected case.
    return false;
  }
}

async function init() {
  try {
    // Native Crash Log Check: on Android, a past native crash (which happens
    // below the JS layer and never reaches window.onerror below) may be
    // waiting from the last launch. Show it now instead of continuing boot.
    if (isCapacitor) {
      const shownPastCrash = await checkForPastNativeCrash();
      if (shownPastCrash) return;
    }

    // \u2500\u2500 Firebase Auth Gate \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    initFirebase(); // no-op if not configured
    if (isFirebaseConfigured()) {
      const user = await waitForAuthReady();
      if (!user) {
        // Not logged in \u2014 boot into login screen
        const theme = localStorage.getItem('forge-theme') || 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        initRouter();
        navigate('login');
        return;
      }
      // Watch for sign-out during session
      onAuthChanged((u) => { if (!u) navigate('login'); });
    }
    // \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

    // Seed default Gemini API settings if not present or if using one of the expired keys
    const currentKey = localStorage.getItem('forge-gemini-key');
    const expiredKeys = [
      'AQ.' + 'Ab8RN6JXgdiuu4hCrltJ7KsJNAJTIt31_9zGDiuzTsW36BoaVw',
      'AQ.' + 'Ab8RN6KiKHKR0hWEYCtI5DXMlaiE9nIufN6OGb_qqSGQ5wry5A'
    ];
    const newDefaultKey = 'AQ.' + 'Ab8RN6LWXWs3Iw0U17kyb0b4LY09FaWWiUtDAlhpWpRwvwHKvA';
    if (!currentKey || expiredKeys.includes(currentKey)) {
      localStorage.setItem('forge-gemini-key', newDefaultKey);
    }
    if (!localStorage.getItem('forge-gemini-model')) {
      localStorage.setItem('forge-gemini-model', 'gemini-2.5-flash');
    }
    if (!localStorage.getItem('forge-ai-provider')) {
      localStorage.setItem('forge-ai-provider', 'gemini');
    }
    if (!localStorage.getItem('forge-companion-enabled')) {
      localStorage.setItem('forge-companion-enabled', 'true');
    }


    // Apply theme mode if stored (do this early to avoid flash)
    const theme = localStorage.getItem('forge-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);

    // ── Platform Setup ──────────────────────────────────────────────────────
    // Tag the html element with platform info for CSS targeting
    document.documentElement.setAttribute('data-platform', platform);
    if (isMobile || shouldUseMobileNav()) {
      document.documentElement.setAttribute('data-mobile', 'true');
      // Hide the desktop title bar on mobile
      const titleBar = document.getElementById('forge-titlebar');
      if (titleBar) titleBar.style.display = 'none';
      // Reset app margin
      const appEl = document.getElementById('app');
      if (appEl) appEl.style.marginTop = '0';
    }
    // On Capacitor, init StatusBar plugin
    if (isCapacitor && window.Capacitor) {
      try {
        const { StatusBar } = await import('@capacitor/status-bar');
        await StatusBar.setStyle({ style: 'Dark' });
        await StatusBar.setBackgroundColor({ color: '#070b14' });
      } catch (_) { /* StatusBar not available in web fallback */ }
    }
    // ────────────────────────────────────────────────────────────────────────
    
    // Apply custom accent color if stored
    const customAccent = localStorage.getItem('forge-custom-accent');
    if (customAccent) {
      applyCustomAccent(customAccent);
    }

    // Check if this is a fresh launch session (cleared on full close/restart).
    // If so, force user to pick/create a project on launch.
    // Skip if this is the Quick Capture window (hash contains quick-capture)
    if (!window.location.hash.includes('quick-capture') && !sessionStorage.getItem('forge-session-initialized')) {
      sessionStorage.setItem('forge-session-initialized', 'true');
      localStorage.removeItem('forge-active-project-path');
    }

    // 1. Initialize active project file if stored
    const project = await initActiveProject();

    // 2. Render sidebar (automatically hides if project is null, or on mobile)
    await renderSidebar();

    // 2b. Init mobile bottom navigation (replaces sidebar on ≤768px / native)
    await initMobileNav();

    // 3. Initialize AI drawer
    initAiDrawer();

    // 3b. Initialize Scene Mode drawer
    initSceneMode();

    // 3c. Initialize Continuity Monitor (passive background scanner)
    initContinuityMonitor();

    // 3. Init global search (Ctrl+K)
    initGlobalSearch(async (query) => {
      const proj = await getActiveProject();
      if (!proj) return [];
      const results = await searchPages(proj.id, query);
      return results.map(r => ({
        ...r,
        route: `page/${r.id}`
      }));
    }, (result) => {
      navigate(result.route);
    });

    // 4. Start router
    initRouter();

    // Check for updates in the background (non-blocking)
    checkUpdatesOnBoot();

    // 5. On mobile, render mobile dashboard directly — don't fall back to desktop routes
    if (shouldUseMobileNav()) {
      const pageContainer = document.getElementById('page-container');
      if (pageContainer) {
        await renderMobileDashboard(pageContainer);
      }
      // On mobile we always have a project context or hub redirect handled above
    } else if (!project) {
      navigate('hub');
    }

    // Start background reminder service
    startReminderService();

    // Init icons
    refreshIcons();

    // Firebase Sync is currently a stub pending the universal DB upgrade — not initialized on boot.
    // See src/sync.js. Re-enable the initFirebaseSync() call here once that lands.

  } catch (err) {
    console.error('Forge init error:', err);
    showCrashScreen(err);
  }
}



// Background Update Checker
async function checkUpdatesOnBoot() {
  try {
    const configuredUrl = 'https://raw.githubusercontent.com/Mimicc007/forge-updates/main/updates.json';
    const resp = await fetch(configuredUrl, { cache: 'no-store' });
    const list = await resp.json();
    if (!Array.isArray(list)) return;
    const latestUpdate = list[0];
    let currentVersion = 'v0.2.1-alpha';
    if (window.electronAPI && window.electronAPI.getAppVersion) {
      try {
        const v = await window.electronAPI.getAppVersion();
        currentVersion = v.startsWith('v') ? v : `v${v}`;
      } catch (e) {
        console.warn('Failed to get app version:', e);
      }
    }

    const isNewerVersion = (curr, rem) => {
      try {
        const clean = (v) => v.replace(/^v/, '').split('-')[0].split('.').map(Number);
        const [cMajor, cMinor, cPatch] = clean(curr);
        const [rMajor, rMinor, rPatch] = clean(rem);
        if (rMajor > cMajor) return true;
        if (rMajor < cMajor) return false;
        if (rMinor > cMinor) return true;
        if (rMinor < cMinor) return false;
        return rPatch > cPatch;
      } catch (e) {
        return false;
      }
    };

    if (latestUpdate && isNewerVersion(currentVersion, latestUpdate.version)) {
      localStorage.setItem('forge-update-available', latestUpdate.version);
      window.dispatchEvent(new CustomEvent('forge-update-found', { detail: latestUpdate }));
      
      const ui = await import('./ui.js');
      ui.showToast(`New update ${latestUpdate.version} is available! Go to Settings to install.`, 'info');
    } else {
      localStorage.removeItem('forge-update-available');
    }
  } catch (err) {
    console.warn('Failed to check updates in background:', err);
  }
}

// Background Reminder Service
function startReminderService() {
  setTimeout(checkReminders, 5000);
  setInterval(checkReminders, 30000);
}

async function checkReminders() {
  try {
    const enabled = localStorage.getItem('forge-reminders-enabled') === 'true';
    if (!enabled) return;

    const reminderTime = localStorage.getItem('forge-reminder-time') || '18:00';
    const now = new Date();
    const currentHourMin = now.toTimeString().slice(0, 5); // "HH:MM"

    if (currentHourMin === reminderTime) {
      const todayStr = now.toISOString().slice(0, 10); // "YYYY-MM-DD"
      const lastFired = localStorage.getItem('forge-last-reminder-date');
      if (lastFired !== todayStr) {
        localStorage.setItem('forge-last-reminder-date', todayStr);
        
        const project = await getActiveProject();
        const projName = project ? project.name : 'your project';
        const title = 'Forge Reminder';
        const body = `Ignis awaits your return to work on "${projName}"!`;

        if (window.electronAPI) {
          window.electronAPI.showNotification(title, body);
        } else if (Notification.permission === 'granted') {
          new Notification(title, { body });
        } else {
          console.log('Reminder triggered but permission not granted.');
        }
      }
    }
  } catch (err) {
    console.error('Error running reminder check:', err);
  }
}

// Global Error & Promise Rejection Handlers to prevent silent blank screens
window.addEventListener('error', (event) => {
  console.error('Global error caught:', event.error);
  showCrashScreen(event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection caught:', event.reason);
  showCrashScreen(event.reason);
});

// Wait for DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}


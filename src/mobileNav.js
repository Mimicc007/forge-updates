/**
 * mobileNav.js — Forge Mobile Bottom Navigation
 * Renders a premium glassmorphic bottom tab bar for iOS/Android.
 * Replaces the sidebar on viewports ≤768px (and Capacitor native).
 */

import { navigate } from './router.js';
import { getActiveProject, getSchemas, getAllTabs } from './db.js';
import { refreshIcons } from './icons.js';
import { getContinuityIssues } from './continuityMonitor.js';
import { renderMobileDashboard } from './pages/mobileDashboard.js';
import { renderMobileWrite } from './pages/mobileWrite.js';
import { renderMobileDatabase } from './pages/mobileDatabase.js';
import { renderMobileSettings } from './pages/mobileSettings.js';

let navEl = null;
let moreSheetEl = null;
let dbSheetEl = null;
let backdropEl = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize the mobile nav. Call from main.js on startup.
 * Only activates on mobile viewports or Capacitor native.
 */
export async function initMobileNav() {
  if (!shouldUseMobileNav()) return;

  const project = await getActiveProject();
  if (!project) return;

  _injectStyles();
  await _render(project);

  // Update active indicator on route changes
  window.addEventListener('page-rendered', () => _updateActiveTab());
  // Re-render if project changes
  window.addEventListener('forge-project-changed', async () => {
    const p = await getActiveProject();
    if (p) await _render(p);
  });
  // Watch viewport resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!shouldUseMobileNav()) {
        navEl?.remove();
        moreSheetEl?.remove();
        dbSheetEl?.remove();
        backdropEl?.remove();
        navEl = moreSheetEl = dbSheetEl = backdropEl = null;
      }
    }, 200);
  });
}

/**
 * Returns true when mobile nav should be active.
 */
export function shouldUseMobileNav() {
  return window.innerWidth <= 768 ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (typeof window.Capacitor !== 'undefined' && window.Capacitor?.isNativePlatform?.());
}

// ─── Render ───────────────────────────────────────────────────────────────────

async function _render(project) {
  // Tear down previous DOM if re-rendering
  navEl?.remove();
  moreSheetEl?.remove();
  dbSheetEl?.remove();
  backdropEl?.remove();

  const issues = [];
  try { issues.push(...(getContinuityIssues?.() || [])); } catch (_) {}
  const badgeCount = issues.length;

  // ─── Bottom Tab Bar ───────────────────────────────────────────
  navEl = document.createElement('nav');
  navEl.id = 'mobile-nav';
  navEl.setAttribute('aria-label', 'Mobile navigation');
  navEl.innerHTML = `
    <button class="mobile-tab" id="mnav-home" data-tab="home" title="Dashboard" style="--tab-color:#f59e0b">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
        <path d="M9 21V12h6v9"/>
      </svg>
      <span class="mnav-label">Home</span>
    </button>

    <button class="mobile-tab" id="mnav-data" data-tab="databases" title="Databases" style="--tab-color:#38bdf8">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3"/>
        <path d="M21 12c0 1.657-4.03 3-9 3S3 13.657 3 12"/>
        <path d="M3 5v14c0 1.657 4.03 3 9 3s9-1.343 9-3V5"/>
      </svg>
      <span class="mnav-label">Data</span>
    </button>

    <button class="mobile-tab" id="mnav-story" data-tab="story" title="Story Timeline" style="--tab-color:#a78bfa">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
      </svg>
      <span class="mnav-label">Story</span>
    </button>

    <button class="mobile-tab" id="mnav-canvas" data-tab="canvas" title="Canvas" style="--tab-color:#818cf8">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
      <span class="mnav-label">Canvas</span>
    </button>

    <button class="mobile-tab" id="mnav-more" data-tab="more" title="More" style="position:relative; --tab-color:#94a3b8">
      ${badgeCount > 0 ? `<span class="mnav-badge">${badgeCount > 9 ? '9+' : badgeCount}</span>` : ''}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
      <span class="mnav-label">More</span>
    </button>
  `;
  document.body.appendChild(navEl);

  // ─── More Sheet ───────────────────────────────────────────────
  moreSheetEl = document.createElement('div');
  moreSheetEl.id = 'mobile-more-sheet';
  moreSheetEl.setAttribute('role', 'dialog');
  moreSheetEl.innerHTML = `
    <div class="mnav-sheet-handle"></div>
    <div class="mnav-sheet-title">More tools</div>
    <button class="mnav-sheet-item" data-action="ignis">
      <span class="mnav-sheet-icon" style="background:rgba(245,158,11,0.14); box-shadow: inset 0 0 0 1px rgba(245,158,11,0.25);">⚡</span>
      <div class="mnav-sheet-item-text">
        <strong>Ignis AI Companion</strong>
        <span>Chat with your creative partner</span>
      </div>
    </button>
    <button class="mnav-sheet-item" data-action="graph">
      <span class="mnav-sheet-icon" style="background:rgba(45,212,191,0.14); box-shadow: inset 0 0 0 1px rgba(45,212,191,0.25);">🕸️</span>
      <div class="mnav-sheet-item-text">
        <strong>Relationship Graph</strong>
        <span>Visual character & lore connections</span>
      </div>
    </button>
    <button class="mnav-sheet-item" data-action="analytics">
      <span class="mnav-sheet-icon" style="background:rgba(74,222,128,0.14); box-shadow: inset 0 0 0 1px rgba(74,222,128,0.25);">📊</span>
      <div class="mnav-sheet-item-text">
        <strong>Writer Analytics</strong>
        <span>Word counts, writing streaks</span>
      </div>
    </button>
    <button class="mnav-sheet-item" data-action="continuity">
      <span class="mnav-sheet-icon" style="background:rgba(248,113,113,0.14); box-shadow: inset 0 0 0 1px rgba(248,113,113,0.25);">🔍</span>
      <div class="mnav-sheet-item-text">
        <strong>Continuity Engine</strong>
        <span>${badgeCount > 0 ? `${badgeCount} issue${badgeCount > 1 ? 's' : ''} found` : 'Check for plot holes'}</span>
      </div>
    </button>
    <div class="mnav-sheet-divider"></div>
    <button class="mnav-sheet-item" data-action="settings">
      <span class="mnav-sheet-icon" style="background:rgba(148,163,184,0.14); box-shadow: inset 0 0 0 1px rgba(148,163,184,0.25);">⚙️</span>
      <div class="mnav-sheet-item-text">
        <strong>Settings</strong>
        <span>Theme, AI, preferences</span>
      </div>
    </button>
    <button class="mnav-sheet-item" data-action="hub">
      <span class="mnav-sheet-icon" style="background:rgba(245,158,11,0.14); box-shadow: inset 0 0 0 1px rgba(245,158,11,0.25);">📂</span>
      <div class="mnav-sheet-item-text">
        <strong>Switch Project</strong>
        <span>Open or create another project</span>
      </div>
    </button>
  `;
  document.body.appendChild(moreSheetEl);

  // ─── DB Sheet ─────────────────────────────────────────────────
  dbSheetEl = document.createElement('div');
  dbSheetEl.id = 'mobile-db-sheet';
  dbSheetEl.setAttribute('role', 'dialog');
  dbSheetEl.innerHTML = `
    <div class="mnav-sheet-handle"></div>
    <div class="mnav-sheet-title">Your Databases</div>
    <div id="mnav-db-list"><div class="mnav-loading">Loading databases…</div></div>
  `;
  document.body.appendChild(dbSheetEl);

  // ─── Backdrop ─────────────────────────────────────────────────
  backdropEl = document.createElement('div');
  backdropEl.id = 'mobile-sheet-backdrop';
  document.body.appendChild(backdropEl);
  backdropEl.addEventListener('click', _closeAllSheets);

  // ─── Events ───────────────────────────────────────────────────
  navEl.querySelectorAll('.mobile-tab').forEach(btn => {
    btn.addEventListener('click', () => _onTabClick(btn.dataset.tab, project));
  });
  moreSheetEl.querySelectorAll('.mnav-sheet-item').forEach(btn => {
    btn.addEventListener('click', () => _onSheetAction(btn.dataset.action));
  });

  _updateActiveTab();
}

// ─── Tab Handlers ─────────────────────────────────────────────────────────────

function _getPageContainer() {
  return document.getElementById('page-container') || document.body;
}

async function _onTabClick(tab, project) {
  if (navigator.vibrate) navigator.vibrate(10);

  _closeAllSheets();

  // Snappy tab active class toggle
  navEl.querySelectorAll('.mobile-tab').forEach(b => b.classList.remove('active'));
  const tabIdMap = { home: 'mnav-home', story: 'mnav-story', databases: 'mnav-data', canvas: 'mnav-canvas', more: 'mnav-more' };
  document.getElementById(tabIdMap[tab])?.classList.add('active');

  switch (tab) {
    case 'home':
      navigate('dashboard');
      break;
    case 'story':
      navigate('write');
      break;
    case 'databases':
      _showDbSheet(project);
      return; // opened the sheet directly — don't fall through to closing it
    case 'canvas': {
      try {
        const tabs = await getAllTabs();
        if (tabs && tabs.length > 0) {
          navigate(`workspace/${tabs[0].id}`);
        } else {
          navigate('dashboard');
        }
      } catch (_) { navigate('dashboard'); }
      break;
    }
    case 'more':
      _toggleMoreSheet();
      return; // opened the sheet directly — don't fall through to closing it
  }
}

function _onSheetAction(action) {
  _closeAllSheets();
  setTimeout(() => {
    switch (action) {
      case 'ignis':      import('./ai.js').then(m => m.toggleAiDrawer()); break;
      case 'graph':      navigate('graph'); break;
      case 'analytics':  navigate('writer-analytics'); break;
      case 'continuity': navigate('continuity'); break;
      case 'settings':   navigate('settings'); break;
      case 'hub':        navigate('hub'); break;
    }
  }, 120);
}

// ─── DB Sheet ─────────────────────────────────────────────────────────────────

async function _showDbSheet(project) {
  _closeAllSheets();
  backdropEl?.classList.add('open');
  dbSheetEl?.classList.add('open');

  const listEl = document.getElementById('mnav-db-list');
  if (!listEl) return;

  try {
    const { getStyleConfig } = await import('./styleConfig.js');
    const schemas = await getSchemas(project.id);
    const style = getStyleConfig(project?.settings?.style || 'story');

    if (!schemas || schemas.length === 0) {
      listEl.innerHTML = `<div class="mnav-loading">No databases in this project yet.</div>`;
      return;
    }

    listEl.innerHTML = schemas.map(s => {
      const sc = style.schemas?.find(x => x.id === s.id) || {};
      const icon = s.icon || sc.icon || '📁';
      const name = s.name || sc.name || s.id;
      return `
        <button class="mnav-db-item" data-schema-id="${s.id}">
          <span class="mnav-db-icon">${icon}</span>
          <span class="mnav-db-name">${name}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="margin-left:auto;opacity:0.4">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      `;
    }).join('');

    listEl.querySelectorAll('.mnav-db-item').forEach(item => {
      item.addEventListener('click', () => {
        _closeAllSheets();
        navigate(`schema/${item.dataset.schemaId}`);
      });
    });
  } catch (err) {
    listEl.innerHTML = `<div class="mnav-loading">Failed to load databases.</div>`;
    console.error('[MobileNav] DB sheet load error:', err);
  }
}

// ─── Sheet Helpers ────────────────────────────────────────────────────────────

function _toggleMoreSheet() {
  const isOpen = moreSheetEl?.classList.contains('open');
  if (isOpen) {
    _closeAllSheets();
  } else {
    dbSheetEl?.classList.remove('open');
    moreSheetEl?.classList.add('open');
    backdropEl?.classList.add('open');
  }
}

function _closeAllSheets() {
  moreSheetEl?.classList.remove('open');
  dbSheetEl?.classList.remove('open');
  backdropEl?.classList.remove('open');
}

// ─── Active Tab Highlight ─────────────────────────────────────────────────────

function _updateActiveTab() {
  if (!navEl) return;
  const hash = window.location.hash.replace('#/', '').split('/')[0];

  navEl.querySelectorAll('.mobile-tab').forEach(b => b.classList.remove('active'));

  const map = {
    'dashboard': 'mnav-home',
    'schema':    'mnav-data',
    'databases': 'mnav-data',
    'page':      'mnav-story',
    'write':     'mnav-story',
    'story-timeline': 'mnav-story',
    'workspace': 'mnav-canvas',
    'settings':  'mnav-more',
    'hub':       'mnav-home',
    'graph':     'mnav-more',
    'writer-analytics': 'mnav-more',
    'continuity': 'mnav-more',
  };
  const id = map[hash] || 'mnav-home';
  document.getElementById(id)?.classList.add('active');
}

// ─── Style Injection ──────────────────────────────────────────────────────────
// Nav bar, tab, and sheet styling now lives entirely in mobile.css (the shared
// stylesheet loaded once at boot) to avoid two competing style sources fighting
// over the same classes. This only adds the DB-sheet-item styles that mobile.css
// doesn't define yet.
function _injectStyles() {
  if (document.getElementById('mobile-nav-styles')) return;
  const style = document.createElement('style');
  style.id = 'mobile-nav-styles';
  style.textContent = `
    .mnav-db-item {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 13px 24px;
      cursor: pointer;
      transition: background 0.12s ease;
      -webkit-tap-highlight-color: transparent;
      background: none;
      border: none;
      width: 100%;
      text-align: left;
      min-height: 44px;
    }
    .mnav-db-item:active { background: var(--bg-hover, #1e2d42); }
    .mnav-db-icon { font-size: 1.25rem; width: 28px; text-align: center; flex-shrink: 0; }
    .mnav-db-name { font-size: 0.9rem; font-family: var(--font-body); color: var(--text-primary); }
    .mnav-loading {
      padding: 24px;
      text-align: center;
      color: var(--text-muted);
      font-size: 0.85rem;
    }
  `;
  document.head.appendChild(style);
}

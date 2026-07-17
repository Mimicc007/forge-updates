/**
 * mobileNav.js — Forge Mobile Bottom Navigation
 * Renders a premium glassmorphic bottom tab bar for iOS/Android.
 * Replaces the sidebar on viewports ≤768px (and Capacitor native).
 */

import { navigate } from './router.js';
import { getActiveProject, getSchemas, getAllTabs } from './db.js';
import { refreshIcons } from './main.js';
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
    <button class="mobile-tab" id="mnav-home" data-tab="home" title="Dashboard">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
        <path d="M9 21V12h6v9"/>
      </svg>
      <span class="mnav-label">Home</span>
    </button>

    <button class="mobile-tab" id="mnav-data" data-tab="databases" title="Databases">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3"/>
        <path d="M21 12c0 1.657-4.03 3-9 3S3 13.657 3 12"/>
        <path d="M3 5v14c0 1.657 4.03 3 9 3s9-1.343 9-3V5"/>
      </svg>
      <span class="mnav-label">Data</span>
    </button>

    <button class="mobile-tab" id="mnav-story" data-tab="story" title="Story Timeline">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
      </svg>
      <span class="mnav-label">Story</span>
    </button>

    <button class="mobile-tab" id="mnav-canvas" data-tab="canvas" title="Canvas">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
      <span class="mnav-label">Canvas</span>
    </button>

    <button class="mobile-tab" id="mnav-more" data-tab="more" title="More" style="position:relative">
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
      <span class="mnav-sheet-icon">⚡</span>
      <div class="mnav-sheet-item-text">
        <strong>Ignis AI Companion</strong>
        <span>Chat with your creative partner</span>
      </div>
    </button>
    <button class="mnav-sheet-item" data-action="graph">
      <span class="mnav-sheet-icon">🕸️</span>
      <div class="mnav-sheet-item-text">
        <strong>Relationship Graph</strong>
        <span>Visual character & lore connections</span>
      </div>
    </button>
    <button class="mnav-sheet-item" data-action="analytics">
      <span class="mnav-sheet-icon">📊</span>
      <div class="mnav-sheet-item-text">
        <strong>Writer Analytics</strong>
        <span>Word counts, writing streaks</span>
      </div>
    </button>
    <button class="mnav-sheet-item" data-action="continuity">
      <span class="mnav-sheet-icon">🔍</span>
      <div class="mnav-sheet-item-text">
        <strong>Continuity Engine</strong>
        <span>${badgeCount > 0 ? `${badgeCount} issue${badgeCount > 1 ? 's' : ''} found` : 'Check for plot holes'}</span>
      </div>
    </button>
    <div class="mnav-sheet-divider"></div>
    <button class="mnav-sheet-item" data-action="settings">
      <span class="mnav-sheet-icon">⚙️</span>
      <div class="mnav-sheet-item-text">
        <strong>Settings</strong>
        <span>Theme, AI, preferences</span>
      </div>
    </button>
    <button class="mnav-sheet-item" data-action="hub">
      <span class="mnav-sheet-icon">📂</span>
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
  // Haptic feedback
  if (navigator.vibrate) navigator.vibrate(10);

  _closeAllSheets();

  // Mark active tab immediately for snappy feel
  navEl.querySelectorAll('.mobile-tab').forEach(b => b.classList.remove('active'));
  const tabIdMap = { home: 'mnav-home', story: 'mnav-story', databases: 'mnav-data', canvas: 'mnav-canvas', more: 'mnav-more' };
  document.getElementById(tabIdMap[tab])?.classList.add('active');

  const container = _getPageContainer();

  switch (tab) {
    case 'home':
      await renderMobileDashboard(container);
      break;

    case 'story':
      await renderMobileWrite(container);
      break;

    case 'databases':
      await renderMobileDatabase(container);
      break;

    case 'canvas': {
      try {
        const tabs = await getAllTabs();
        if (tabs && tabs.length > 0) {
          navigate(`workspace/${tabs[0].id}`);
        } else {
          await renderMobileDashboard(container);
        }
      } catch (_) { await renderMobileDashboard(container); }
      break;
    }

    case 'more':
      await renderMobileSettings(container);
      break;
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
    'page':      'mnav-story',
    'story-timeline': 'mnav-story',
    'workspace': 'mnav-canvas',
    'settings':  'mnav-more',
    'hub':       'mnav-home',
  };
  const id = map[hash] || 'mnav-home';
  document.getElementById(id)?.classList.add('active');
}

// ─── Style Injection ──────────────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById('mobile-nav-styles')) return;
  const style = document.createElement('style');
  style.id = 'mobile-nav-styles';
  style.textContent = `
    /* ── Mobile Nav Bar ─────────────────────────────── */
    #mobile-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 64px;
      padding-bottom: env(safe-area-inset-bottom, 0px);
      background: var(--glass-bg, rgba(7,11,20,0.97));
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border-top: 1px solid var(--glass-border, rgba(255,255,255,0.08));
      display: flex;
      align-items: stretch;
      justify-content: space-around;
      z-index: 9000;
      box-shadow: 0 -4px 24px rgba(0,0,0,0.35);
    }

    /* ── Tab Buttons ─────────────────────────────────── */
    .mobile-tab {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      flex: 1;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-tertiary, #64748b);
      transition: color 0.18s ease, transform 0.18s ease;
      position: relative;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      padding: 0;
      min-height: 0;
    }
    .mobile-tab:active {
      transform: scale(0.92);
    }
    .mobile-tab.active {
      color: var(--accent-primary, #f1f5f9);
    }
    .mobile-tab svg {
      width: 22px;
      height: 22px;
    }
    .mnav-label {
      font-size: 9.5px;
      font-family: var(--font-hud, monospace);
      letter-spacing: 0.05em;
      text-transform: uppercase;
      font-weight: 600;
      line-height: 1;
    }
    .mnav-badge {
      position: absolute;
      top: 4px;
      right: 50%;
      margin-right: -20px;
      background: #ef4444;
      color: white;
      border-radius: 999px;
      font-size: 9px;
      font-weight: 700;
      min-width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 3px;
      pointer-events: none;
    }

    /* ── Backdrop ────────────────────────────────────── */
    #mobile-sheet-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.55);
      z-index: 8998;
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
    }
    #mobile-sheet-backdrop.open { display: block; }

    /* ── Sheets (More + DB) ──────────────────────────── */
    #mobile-more-sheet,
    #mobile-db-sheet {
      position: fixed;
      bottom: 64px;
      bottom: calc(64px + env(safe-area-inset-bottom, 0px));
      left: 0;
      right: 0;
      background: var(--bg-elevated, #1e293b);
      border-top: 1px solid var(--border-default);
      border-radius: 20px 20px 0 0;
      z-index: 8999;
      transform: translateY(110%);
      transition: transform 0.38s cubic-bezier(0.16, 1, 0.3, 1);
      max-height: 78dvh;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding-bottom: 12px;
    }
    #mobile-more-sheet.open,
    #mobile-db-sheet.open {
      transform: translateY(0);
    }

    /* ── Sheet Handle ────────────────────────────────── */
    .mnav-sheet-handle {
      width: 40px;
      height: 4px;
      background: var(--border-strong, rgba(255,255,255,0.18));
      border-radius: 9999px;
      margin: 12px auto 6px;
    }
    .mnav-sheet-title {
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--text-muted, #374151);
      padding: 4px 24px 12px;
      font-family: var(--font-hud);
    }

    /* ── More Sheet Items ────────────────────────────── */
    .mnav-sheet-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 13px 24px;
      cursor: pointer;
      transition: background 0.12s ease;
      -webkit-tap-highlight-color: transparent;
      background: none;
      border: none;
      width: 100%;
      text-align: left;
      color: var(--text-primary);
    }
    .mnav-sheet-item:active { background: var(--bg-hover, #1e2d42); }
    .mnav-sheet-icon {
      font-size: 1.35rem;
      width: 32px;
      text-align: center;
      flex-shrink: 0;
    }
    .mnav-sheet-item-text {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .mnav-sheet-item-text strong {
      font-size: 0.9rem;
      font-weight: 600;
      font-family: var(--font-heading);
      color: var(--text-primary);
    }
    .mnav-sheet-item-text span {
      font-size: 0.75rem;
      color: var(--text-muted, #64748b);
    }
    .mnav-sheet-divider {
      height: 1px;
      background: var(--border-subtle, rgba(255,255,255,0.05));
      margin: 6px 24px;
    }

    /* ── DB Sheet Items ──────────────────────────────── */
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

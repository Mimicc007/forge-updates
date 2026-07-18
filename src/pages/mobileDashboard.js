/* ============================================================
   Forge Mobile — Dashboard (Home Tab)
   Scrollable card feed with stats, recents, and quick access.
   ============================================================ */

import { getActiveProject, getPages, getSchemas } from '../db.js';
import { navigate } from '../router.js';
import { getCurrentUser } from '../auth.js';

export async function renderMobileDashboard(container) {
  container.innerHTML = `
    <div class="m-page" id="mobile-dashboard">
      <div class="m-loading-state" style="display:flex;align-items:center;justify-content:center;flex:1;padding:60px">
        <div style="color:var(--text-muted);font-size:0.9rem">Loading…</div>
      </div>
    </div>
  `;

  try {
    const project = await getActiveProject();
    const user = getCurrentUser();
    const username = user?.displayName || user?.email?.split('@')[0] || 'Writer';

    const dashEl = container.querySelector('#mobile-dashboard');
    if (!dashEl) return;

    if (!project) {
      dashEl.innerHTML = `
        <div class="m-empty" style="padding-top:80px">
          <div class="m-empty-icon">📂</div>
          <div class="m-empty-title">No project open</div>
          <div class="m-empty-sub">Tap below to open or create a project</div>
          <button class="m-fab" style="position:relative;width:auto;height:auto;border-radius:12px;padding:12px 24px;font-size:0.9rem;font-weight:700;margin-top:20px"
            onclick="window.mobileNavigate('hub')">Open Project</button>
        </div>
      `;
      return;
    }

    const [pages, schemas] = await Promise.all([
      getPages(project.id).catch(() => []),
      getSchemas(project.id).catch(() => []),
    ]);

    const totalWords = pages.reduce((sum, p) => {
      const text = p.content?.replace(/<[^>]+>/g, '') || '';
      return sum + text.split(/\s+/).filter(Boolean).length;
    }, 0);

    const recentPages = [...pages]
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 6);

    const timeLabel = _timeGreeting();

    const dashElUpdate = container.querySelector('#mobile-dashboard');
    if (!dashElUpdate) return;

    dashElUpdate.innerHTML = `
      <!-- Hero -->
      <div class="m-hero">
        <div class="m-hero-greeting">${timeLabel}</div>
        <div class="m-hero-name">${_escHtml(username)}</div>
        <div class="m-hero-project">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
          ${_escHtml(project.name)}
        </div>
      </div>

      <!-- Stats -->
      <div class="m-stats-row">
        <div class="m-stat-chip">
          <div class="m-stat-chip-value">${pages.length}</div>
          <div class="m-stat-chip-label">Pages</div>
        </div>
        <div class="m-stat-chip">
          <div class="m-stat-chip-value">${_formatNum(totalWords)}</div>
          <div class="m-stat-chip-label">Words</div>
        </div>
        <div class="m-stat-chip">
          <div class="m-stat-chip-value">${schemas.length}</div>
          <div class="m-stat-chip-label">Databases</div>
        </div>
      </div>

      <!-- Quick Access -->
      <div class="m-section">
        <div class="m-section-label">Quick access</div>
        <div class="m-quick-grid">
          <button class="m-quick-card" data-action="write" style="--card-color:#f59e0b">
            <div class="m-quick-icon">✏️</div>
            <div class="m-quick-label">Write</div>
          </button>
          <button class="m-quick-card" data-action="database" style="--card-color:#38bdf8">
            <div class="m-quick-icon">🗄️</div>
            <div class="m-quick-label">Database</div>
          </button>
          <button class="m-quick-card" data-action="canvas" style="--card-color:#818cf8">
            <div class="m-quick-icon">🖼️</div>
            <div class="m-quick-label">Canvas</div>
          </button>
          <button class="m-quick-card" data-action="story" style="--card-color:#a78bfa">
            <div class="m-quick-icon">📖</div>
            <div class="m-quick-label">Timeline</div>
          </button>
        </div>
      </div>

      <!-- Recent pages -->
      <div class="m-section" style="margin-bottom:16px">
        <div class="m-section-label">Recent pages</div>
        ${recentPages.length === 0 ? `
          <div class="m-empty" style="padding:30px 0">
            <div class="m-empty-icon" style="font-size:32px">📄</div>
            <div class="m-empty-sub">No pages yet. Go to Write to create your first page.</div>
          </div>
        ` : recentPages.map(p => `
          <button class="m-list-item" data-page-id="${p.id}">
            <div class="m-list-item-icon">${p.icon || '📄'}</div>
            <div class="m-list-item-body">
              <div class="m-list-item-title">${_escHtml(p.title || 'Untitled')}</div>
              <div class="m-list-item-sub">${_timeAgo(p.updatedAt)} · ${_wordCount(p.content)} words</div>
            </div>
            <div class="m-list-item-chevron">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          </button>
        `).join('')}
      </div>
    `;

    _injectDashboardStyles();
    _wireDashboard(container, project);

  } catch (err) {
    console.error('[MobileDashboard]', err);
    const errDashEl = container.querySelector('#mobile-dashboard');
    if (errDashEl) {
      errDashEl.innerHTML = `
        <div class="m-empty" style="padding-top:80px">
          <div class="m-empty-icon">⚠️</div>
          <div class="m-empty-title">Failed to load</div>
          <div class="m-empty-sub">${err.message}</div>
        </div>
      `;
    }
  }
}

function _wireDashboard(container, project) {
  // Recent page items
  container.querySelectorAll('[data-page-id]').forEach(btn => {
    btn.addEventListener('click', () => navigate(`page/${btn.dataset.pageId}`));
  });

  // Quick access
  const tabMap = {
    write: 'mnav-story',
    database: 'mnav-data',
    canvas: 'mnav-canvas',
    story: 'mnav-story',
  };
  container.querySelectorAll('.m-quick-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'write') {
        // Trigger the Write tab in bottom nav
        document.getElementById('mnav-story')?.click();
      } else if (action === 'database') {
        document.getElementById('mnav-data')?.click();
      } else if (action === 'canvas') {
        document.getElementById('mnav-canvas')?.click();
      } else if (action === 'story') {
        navigate('story-timeline');
      }
    });
  });
}

function _injectDashboardStyles() {
  if (document.getElementById('m-dash-styles')) return;
  const s = document.createElement('style');
  s.id = 'm-dash-styles';
  s.textContent = `
    .m-quick-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
    }
    .m-quick-card {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 14px 6px;
      background: var(--glass-bg);
      backdrop-filter: var(--glass-blur);
      -webkit-backdrop-filter: var(--glass-blur);
      border: 1px solid var(--glass-border);
      border-radius: 14px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: background 0.12s, transform 0.15s var(--easing-spring, ease), box-shadow 0.15s;
      box-shadow: var(--shadow-sm), inset 0 1px 0 rgba(255,255,255,0.03);
      min-height: 44px;
    }
    .m-quick-card::before, .m-quick-card::after {
      content: '';
      position: absolute;
      width: 7px;
      height: 7px;
      opacity: 0.3;
      pointer-events: none;
      transition: opacity 0.15s, width 0.15s, height 0.15s;
    }
    .m-quick-card::before {
      top: 4px; left: 4px;
      border-top: 1.5px solid var(--card-color, var(--accent-primary));
      border-left: 1.5px solid var(--card-color, var(--accent-primary));
    }
    .m-quick-card::after {
      bottom: 4px; right: 4px;
      border-bottom: 1.5px solid var(--card-color, var(--accent-primary));
      border-right: 1.5px solid var(--card-color, var(--accent-primary));
    }
    .m-quick-card:active {
      background: var(--bg-elevated);
      transform: scale(0.94);
      box-shadow: var(--shadow-md), 0 0 20px rgba(229,169,59,0.3);
      box-shadow: var(--shadow-md), 0 0 20px color-mix(in srgb, var(--card-color, #e5a93b) 35%, transparent);
    }
    .m-quick-card:active::before, .m-quick-card:active::after {
      opacity: 1;
      width: 11px;
      height: 11px;
    }
    .m-quick-icon {
      font-size: 20px;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(229,169,59,0.10);
      background: color-mix(in srgb, var(--card-color, #e5a93b) 14%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--card-color, #e5a93b) 25%, transparent);
      border-radius: 10px;
    }
    .m-quick-label {
      font-size: 0.7rem;
      color: var(--text-secondary);
      font-weight: 600;
      text-align: center;
    }
  `;
  document.head.appendChild(s);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function _formatNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function _wordCount(html) {
  const text = html?.replace(/<[^>]+>/g, '') || '';
  return _formatNum(text.split(/\s+/).filter(Boolean).length);
}

function _timeAgo(ts) {
  if (!ts) return 'Never';
  // updatedAt may be stored as an ISO string or a numeric epoch — normalize
  // before doing arithmetic, otherwise `Date.now() - ts` silently produces
  // NaN for strings and every branch below falls through to "NaNd ago".
  const time = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (Number.isNaN(time)) return 'Never';
  const diff = Date.now() - time;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function _escHtml(str) {
  return String(str).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

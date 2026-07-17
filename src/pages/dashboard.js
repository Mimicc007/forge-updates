/* ============================================================
   Forge — Dashboard Page
   Project overview for the Universal Knowledge System
   ============================================================ */

import * as db from '../db.js';
import { navigate } from '../router.js';
import { timeAgo, escapeHtml, showModal, showToast } from '../ui.js';
import { refreshIcons } from '../main.js';
import { refreshSidebarLists } from '../sidebar.js';
import { showCreateTabModal } from './workspace.js';
import { startTutorial } from '../tutorial.js';
import { isLoggedIn, getUserDisplayName } from '../auth.js';

export async function renderDashboard(container) {
  const project = await db.getActiveProject();
  const schemas = await db.getSchemas(project.id);
  const pages = await db.getPages(project.id);
  const tabs = await db.getAllTabs(); // Infinite canvas tabs

  // Recent pages
  const recentPages = [...pages].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 6);

  // Word count estimate
  const totalWords = pages.reduce((acc, p) => {
    let content = p.content || p.body || '';
    if (content.startsWith('{')) {
      try {
        const delta = JSON.parse(content);
        if (delta.ops) {
          content = delta.ops
            .filter(op => typeof op.insert === 'string')
            .map(op => op.insert)
            .join('');
        }
      } catch (_) {
        content = content.replace(/<[^>]+>/g, '');
      }
    } else {
      content = content.replace(/<[^>]+>/g, '');
    }
    const words = content.trim().split(/\s+/).filter(Boolean);
    return acc + words.length;
  }, 0);

  // Load recent activity for the activity feed
  let recentActivity = [];
  try {
    if (db.getRecentActivity) {
      recentActivity = await db.getRecentActivity(project.id, 10);
    }
  } catch (_) {
    recentActivity = [];
  }

  // Feature showcase config (like vvd's toolkit section)
  const FEATURES = [
    {
      id: 'timeline',
      icon: 'map',
      label: 'Story Timeline',
      color: '#f59e0b',
      desc: 'Map your entire narrative arc across acts and beats. Visualize your story\'s structure with a cinematic drag-and-drop timeline.',
      route: 'story-timeline',
      stat: null,
      isNew: false,
    },
    {
      id: 'graph',
      icon: 'network',
      label: 'Relationship Graph',
      color: '#38bdf8',
      desc: 'See how every character, faction, and event connects. A living map of your world\'s web of relationships.',
      route: 'graph',
      stat: null,
      isNew: false,
    },
    {
      id: 'continuity',
      icon: 'alert-triangle',
      label: 'AI Plot Inspector',
      color: '#a78bfa',
      desc: 'Ignis continuously scans your work for plot holes, timeline contradictions, and character inconsistencies — automatically.',
      route: 'continuity',
      stat: null,
      isNew: true,
    },
    {
      id: 'workspace',
      icon: 'layout-dashboard',
      label: 'Infinite Canvas',
      color: '#10b981',
      desc: 'An infinite spatial workspace to map ideas, build mind maps, and visualize concepts with typed nodes and smart connections.',
      route: null, // opens tab picker
      stat: `${tabs.length} canvas${tabs.length !== 1 ? 'es' : ''}`,
      isNew: false,
    },
    {
      id: 'analytics',
      icon: 'bar-chart-2',
      label: 'Writer Analytics',
      color: '#f43f5e',
      desc: 'Track your writing velocity, word count trends, and productivity sessions. Understand how and when you write best.',
      route: 'writer-analytics',
      stat: totalWords > 0 ? `${totalWords.toLocaleString()} words` : null,
      isNew: false,
    },
    {
      id: 'databases',
      icon: 'database',
      label: 'Knowledge Databases',
      color: '#e5a93b',
      desc: `${schemas.length} structured database${schemas.length !== 1 ? 's' : ''} — characters, items, locations, factions, abilities, and more.`,
      route: null, // opens schema modal
      stat: `${schemas.length} database${schemas.length !== 1 ? 's' : ''}`,
      isNew: false,
    },
  ];

  container.innerHTML = `
    <style>
      /* Dashboard VVD-Style Overhaul */
      .dash-root {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        padding: 0;
        position: relative;
      }

      /* Hero section */
      .dash-hero {
        padding: 40px 40px 32px;
        position: relative;
        border-bottom: 1px solid var(--glass-border);
        background: linear-gradient(180deg,
          rgba(7,11,20,0) 0%,
          rgba(13,20,32,0.4) 100%
        );
      }
      .dash-hero-shimmer {
        margin-bottom: 16px;
      }
      .dash-hero-title {
        font-family: var(--font-heading);
        font-size: 2.2rem;
        font-weight: 700;
        color: var(--text-primary);
        letter-spacing: -0.03em;
        line-height: 1.1;
        margin-bottom: 6px;
      }
      .dash-hero-subtitle {
        font-size: var(--fs-sm);
        color: var(--text-tertiary);
        font-weight: 400;
        letter-spacing: 0.01em;
      }
      .dash-hero-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 20px;
        flex-wrap: wrap;
      }

      /* Feature Showcase — VVD two-column layout */
      .dash-showcase {
        display: flex;
        gap: 0;
        flex: 1;
        min-height: 0;
        padding: 32px 0 0;
      }

      /* Left sticky tab rail */
      .dash-tab-rail {
        flex-shrink: 0;
        width: 260px;
        padding: 0 24px 32px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        position: sticky;
        top: 0;
        align-self: flex-start;
      }
      .dash-rail-label {
        font-size: var(--fs-xs);
        font-weight: 600;
        color: var(--text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        margin-bottom: 4px;
        padding: 0 4px;
      }

      /* Right preview panel */
      .dash-preview-panel {
        flex: 1;
        padding: 0 40px 40px 20px;
        display: flex;
        flex-direction: column;
        gap: 20px;
        overflow-y: auto;
        min-height: 0;
      }

      /* Feature preview card */
      .dash-feature-card {
        border-radius: var(--radius-2xl);
        border: 1px solid var(--glass-border);
        background: var(--glass-surface);
        padding: 28px 32px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        opacity: 0;
        transform: translateX(24px);
        transition: opacity 0.15s ease, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s;
        cursor: pointer;
        position: relative;
        overflow: hidden;
      }
      .dash-feature-card::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 1px;
        background: linear-gradient(90deg,
          transparent,
          var(--card-accent-color, rgba(255,255,255,0.15)) 50%,
          transparent
        );
      }
      .dash-feature-card.visible {
        opacity: 1;
        transform: translateX(0);
      }
      .dash-feature-card:hover {
        border-color: var(--glass-border-hover);
        background: var(--glass-surface-hover);
      }
      .dash-feature-card.active-feature {
        border-color: var(--glass-border-hover);
        background: rgba(255,255,255,0.06);
      }
      .dash-feature-card-header {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .dash-feature-icon {
        width: 40px;
        height: 40px;
        border-radius: var(--radius-xl);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .dash-feature-label {
        font-family: var(--font-heading);
        font-size: var(--fs-lg);
        font-weight: 600;
        color: var(--text-primary);
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .dash-feature-desc {
        font-size: var(--fs-sm);
        color: var(--text-secondary);
        line-height: 1.6;
      }
      .dash-feature-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 4px;
      }
      .dash-feature-stat {
        font-family: var(--font-hud);
        font-size: var(--fs-xs);
        color: var(--text-tertiary);
        letter-spacing: 0.04em;
      }
      .dash-feature-cta {
        font-size: var(--fs-xs);
        font-weight: 600;
        color: var(--text-tertiary);
        display: flex;
        align-items: center;
        gap: 4px;
        transition: color var(--transition-fast);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .dash-feature-card:hover .dash-feature-cta {
        color: var(--text-secondary);
      }

      /* Stats bar */
      .dash-stats-bar {
        display: flex;
        gap: 0;
        border-top: 1px solid var(--glass-border);
        margin: 0;
      }
      .dash-stat-item {
        flex: 1;
        padding: 20px 28px;
        border-right: 1px solid var(--glass-border);
        display: flex;
        flex-direction: column;
        gap: 4px;
        cursor: default;
        transition: background var(--transition-fast);
      }
      .dash-stat-item:last-child { border-right: none; }
      .dash-stat-item:hover { background: var(--glass-surface); }
      .dash-stat-val {
        font-family: var(--font-hud);
        font-size: 1.6rem;
        font-weight: 700;
        color: var(--text-primary);
        letter-spacing: -0.02em;
        line-height: 1;
      }
      .dash-stat-label {
        font-size: var(--fs-xs);
        color: var(--text-tertiary);
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      /* Recent pages section */
      .dash-recent {
        padding: 24px 40px 32px;
        border-top: 1px solid var(--glass-border);
      }
      .dash-section-label {
        margin-bottom: 16px;
      }
      .dash-recent-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
      }
      .dash-recent-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border-radius: var(--radius-lg);
        border: 1px solid var(--border-subtle);
        background: var(--glass-surface);
        cursor: pointer;
        transition: all var(--transition-fast);
        font-size: var(--fs-sm);
        color: var(--text-primary);
        font-weight: 500;
      }
      .dash-recent-item:hover {
        border-color: var(--glass-border-hover);
        background: var(--glass-surface-hover);
      }
      .dash-recent-time {
        margin-left: auto;
        font-size: var(--fs-xs);
        color: var(--text-tertiary);
        flex-shrink: 0;
      }
    </style>

    <div class="dash-root">

      <!-- Hero -->
      <div class="dash-hero dot-grid-bg" style="position: relative;">
        <div class="dash-hero-shimmer" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--sp-4);">
          <span class="shimmer-badge">
            <span class="badge-new">New</span>
            AI Plot Inspector is live
          </span>
          
          ${isLoggedIn() ? `
            <div style="font-size: 0.8rem; font-family: var(--font-hud); color: var(--text-secondary); display: flex; align-items: center; gap: 8px; background: var(--glass-surface); border: 1px solid var(--border-subtle); padding: 4px 12px; border-radius: var(--radius-full);">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: #10b981; display: inline-block;"></span>
              Welcome back, <strong style="color: var(--text-primary); font-weight: 600;">${escapeHtml(getUserDisplayName())}</strong>
            </div>
          ` : ''}
        </div>
        
        <!-- Project Health Badge -->
        <div id="project-health-badge" style="position: absolute; top: 40px; right: 40px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          <div style="font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted);">Universe Integrity</div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 80px; height: 6px; background: rgba(255,255,255,0.06); border-radius: 9999px; overflow: hidden; border: 1px solid rgba(255,255,255,0.04);">
              <div id="project-health-bar" style="width: 0%; height: 100%; background: var(--accent-green); transition: width 0.8s var(--easing-out-expo);"></div>
            </div>
            <span id="project-health-value" style="font-family: var(--font-hud); font-size: var(--fs-xs); font-weight: 700; color: var(--accent-green);">100%</span>
          </div>
        </div>

        <h1 class="dash-hero-title" style="background: linear-gradient(135deg, #ffffff 0%, #f1f5f9 40%, var(--accent-amber) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; padding-right: 180px;">${escapeHtml(project.name)}</h1>
        <p class="dash-hero-subtitle">${escapeHtml(project.settings?.genre || 'Creative Project')} &nbsp;·&nbsp; Your storytelling workspace</p>
        <div class="dash-hero-actions">
          <button class="btn btn-primary" id="new-canvas-btn">
            <i data-lucide="layout-dashboard" style="width:14px;height:14px;margin-right:6px;"></i>New Canvas
          </button>
          <button class="btn btn-secondary" id="new-database-btn">
            <i data-lucide="database" style="width:14px;height:14px;margin-right:6px;"></i>New Database
          </button>
          <button class="btn btn-secondary" id="play-tutorial-btn">
            <i data-lucide="play-circle" style="width:14px;height:14px;margin-right:6px;"></i>Tutorial
          </button>
          <button class="btn btn-secondary" id="project-settings-btn">
            <i data-lucide="settings" style="width:14px;height:14px;margin-right:6px;"></i>Settings
          </button>
        </div>
      </div>

      <!-- Stats Bar -->
      <div class="dash-stats-bar">
        <div class="dash-stat-item">
          <div class="dash-stat-val dash-stat-value" data-value="${pages.length}">0</div>
          <div class="dash-stat-label">Pages</div>
        </div>
        <div class="dash-stat-item">
          <div class="dash-stat-val dash-stat-value" data-value="${schemas.length}">0</div>
          <div class="dash-stat-label">Databases</div>
        </div>
        <div class="dash-stat-item">
          <div class="dash-stat-val dash-stat-value" data-value="${tabs.length}">0</div>
          <div class="dash-stat-label">Canvases</div>
        </div>
        <div class="dash-stat-item">
          <div class="dash-stat-val dash-stat-value" data-value="${totalWords}">0</div>
          <div class="dash-stat-label">Words</div>
        </div>
      </div>

      <!-- Feature Showcase (VVD two-column) -->
      <div class="dash-showcase">

        <!-- Left: sticky tab rail -->
        <div class="dash-tab-rail">
          <div class="vvd-badge" style="margin-bottom: 12px; width: fit-content;">
            <i data-lucide="layout-grid" style="width:12px;height:12px;"></i>
            The Toolkit
          </div>
          <div class="dash-rail-label">Features</div>
          ${FEATURES.map((f, i) => `
            <div class="feature-tab-pill" data-feature-id="${f.id}" style="opacity: ${i === 0 ? '1' : '0.4'};" tabindex="0">
              <span style="color:${f.color}; display:flex; align-items:center; flex-shrink:0;">
                <i data-lucide="${f.icon}" style="width:14px;height:14px;"></i>
              </span>
              <span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${f.label}</span>
              ${f.isNew ? `<span class="badge-new" style="background:#10b981; color:white; font-size:0.55rem; font-weight:700; padding:2px 5px; border-radius:var(--radius-full); letter-spacing:0.05em; text-transform:uppercase; flex-shrink:0;">NEW</span>` : ''}
            </div>
          `).join('')}
        </div>

        <!-- Right: feature preview cards -->
        <div class="dash-preview-panel" id="dash-feature-panel">
          ${FEATURES.map((f, i) => `
            <div class="dash-feature-card visible" data-feature-id="${f.id}" data-route="${f.route || ''}" style="--card-accent-color:${f.color}44;">
              <div class="dash-feature-card-header">
                <div class="dash-feature-icon" style="background:${f.color}20;">
                  <i data-lucide="${f.icon}" style="width:20px;height:20px;color:${f.color};"></i>
                </div>
                <div class="dash-feature-label">
                  ${f.label}
                  ${f.isNew ? `<span class="shimmer-badge"><span class="badge-new">New</span></span>` : ''}
                </div>
              </div>
              <p class="dash-feature-desc">${f.desc}</p>
              <div class="dash-feature-footer">
                ${f.stat ? `<span class="dash-feature-stat">${f.stat}</span>` : '<span></span>'}
                <span class="dash-feature-cta">
                  Open <i data-lucide="arrow-right" style="width:12px;height:12px;"></i>
                </span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Recent Pages -->
      ${recentPages.length > 0 ? `
      <div class="dash-recent">
        <div class="dash-section-label">
          <span class="vvd-badge">
            <i data-lucide="clock" style="width:12px;height:12px;"></i>
            Recent
          </span>
        </div>
        <div class="dash-recent-grid">
          ${recentPages.map(p => `
            <div class="dash-recent-item" data-page-id="${p.id}">
              ${p.coverImage
                ? `<img src="${p.coverImage}" alt="" style="width:22px;height:22px;border-radius:4px;object-fit:cover;flex-shrink:0;">`
                : `<i data-lucide="${p.icon || 'file-text'}" style="width:14px;height:14px;flex-shrink:0;color:var(--text-tertiary);"></i>`
              }
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.title || 'Untitled')}</span>
              <span class="dash-recent-time">${timeAgo(p.updatedAt)}</span>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Activity Feed -->
      ${recentActivity.length > 0 ? `
      <div class="dash-recent" style="border-top: 1px solid var(--glass-border);">
        <div class="dash-section-label">
          <span class="vvd-badge">
            <i data-lucide="activity" style="width:12px;height:12px;"></i>
            Recent Activity
          </span>
        </div>
        <div class="activity-feed">
          ${recentActivity.map(entry => `
            <div class="activity-item" data-page-id="${entry.pageId}" data-action="${entry.action}">
              <div class="activity-dot ${entry.action}"></div>
              <div class="activity-text">
                <strong>${escapeHtml(entry.pageTitle || 'Untitled')}</strong>
                ${entry.action === 'created' ? 'was created' : entry.action === 'deleted' ? 'was deleted' : 'was edited'}
                <div class="activity-time">${timeAgo(entry.timestamp)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Quick Action Deck -->
      <div style="position: fixed; bottom: 24px; right: 24px; display: flex; align-items: center; gap: 8px; z-index: var(--z-sticky);">
        <button class="btn btn-secondary btn-icon" id="qa-search-btn" title="Search Palette (Ctrl+K)" style="border-radius: 50%; width: 40px; height: 40px; box-shadow: var(--shadow-lg);">
          <i data-lucide="search" style="width:16px;height:16px;"></i>
        </button>
        <button class="btn btn-secondary btn-icon" id="qa-settings-btn" title="Settings" style="border-radius: 50%; width: 40px; height: 40px; box-shadow: var(--shadow-lg);">
          <i data-lucide="settings" style="width:16px;height:16px;"></i>
        </button>
      </div>

      <!-- Data Management (hidden, accessible via Settings) -->
      <div style="display:none;">
        <button id="export-btn">Export</button>
        <button id="import-btn">Import</button>
      </div>

    </div>
  `;

  // ── Tab rail hover interaction ──
  const pills = container.querySelectorAll('.feature-tab-pill');
  const featureCards = container.querySelectorAll('.dash-feature-card');

  const activateFeature = (featureId) => {
    pills.forEach(p => {
      const isMatch = p.dataset.featureId === featureId;
      p.style.opacity = isMatch ? '1' : '0.4';
      p.classList.toggle('active', isMatch);
      p.style.borderLeft = isMatch ? '2px solid var(--accent-amber)' : '2px solid transparent';
      p.style.background = isMatch ? 'rgba(245, 158, 11, 0.06)' : 'transparent';
      p.style.color = isMatch ? 'var(--text-primary)' : 'var(--text-secondary)';
    });
    featureCards.forEach(c => {
      const isMatch = c.dataset.featureId === featureId;
      if (isMatch) {
        c.style.display = 'flex';
        c.classList.add('visible');
        c.style.animation = 'scaleIn 220ms var(--easing-out-expo) both';
      } else {
        c.style.display = 'none';
        c.classList.remove('visible');
        c.style.animation = '';
      }
    });
  };

  pills.forEach(pill => {
    pill.addEventListener('click', () => activateFeature(pill.dataset.featureId));
    pill.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') activateFeature(pill.dataset.featureId); });
  });

  // Activate first feature by default
  activateFeature(FEATURES[0].id);

  // ── Stat number count-up animation ──
  container.querySelectorAll('.dash-stat-value').forEach(el => {
    const target = parseInt(el.dataset.value || el.textContent, 10);
    if (isNaN(target) || target === 0) {
      el.textContent = el.dataset.value || '0';
      return;
    }
    const duration = 800;
    const startTime = performance.now();
    
    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = Math.round(eased * target);
      el.textContent = current >= 1000 ? `${(current / 1000).toFixed(1)}k` : String(current);
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });

  // ── Feature card click navigation ──
  featureCards.forEach(card => {
    card.addEventListener('click', () => {
      const route = card.dataset.route;
      const featureId = card.dataset.featureId;
      activateFeature(featureId);
      if (route) {
        navigate(route);
      } else if (featureId === 'workspace') {
        showCreateTabModal(async ({ name, icon }) => {
          const tab = await db.saveTab({ name, icon });
          await refreshSidebarLists();
          navigate('workspace/' + tab.id);
        });
      } else if (featureId === 'databases') {
        showCreateSchemaModal(project.id);
      }
    });
  });

  // ── Hero action buttons ──
  container.querySelector('#new-database-btn')?.addEventListener('click', () => {
    showCreateSchemaModal(project.id);
  });
  
  container.querySelector('#new-canvas-btn')?.addEventListener('click', () => {
    showCreateTabModal(async ({ name, icon }) => {
      const tab = await db.saveTab({ name, icon });
      await refreshSidebarLists();
      navigate('workspace/' + tab.id);
    });
  });

  container.querySelector('#play-tutorial-btn')?.addEventListener('click', () => {
    startTutorial();
  });

  container.querySelector('#project-settings-btn').addEventListener('click', () => {
    navigate('settings');
  });



  // ── Recent pages click ──
  container.querySelectorAll('.dash-recent-item[data-page-id]').forEach(item => {
    item.addEventListener('click', () => {
      navigate('page/' + item.dataset.pageId);
    });
  });

  // ── Recent activity click ──
  container.querySelectorAll('.activity-item[data-page-id]').forEach(item => {
    if (item.dataset.action !== 'deleted') {
      item.addEventListener('click', () => {
        navigate('page/' + item.dataset.pageId);
      });
    }
  });

  // ── Export / Import (still wired up, triggered from settings) ──
  container.querySelector('#export-btn')?.addEventListener('click', async () => {
    try {
      const data = await db.exportUniversalData();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `forge-v3-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Exported successfully', 'success');
    } catch (err) {
      showToast('Export failed', 'error');
    }
  });

  container.querySelector('#import-btn')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await db.importUniversalData(data);
        showToast('Imported successfully! Refreshing...', 'success');
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) {
        showToast('Import failed', 'error');
      }
    });
    input.click();
  });

  // ── Onboarding trigger ──
  const onboardKey = `forge-onboarded-${project.id}`;
  if (!localStorage.getItem(onboardKey)) {
    localStorage.setItem(onboardKey, 'true');
    setTimeout(() => {
      showStyleOnboardingModal(project);
    }, 800);
  }

  // ── Calculate Project Health Integrity ──
  const calculateIntegrity = () => {
    try {
      const issuesStr = localStorage.getItem('forge-continuity-issues') || '[]';
      const issues = JSON.parse(issuesStr);
      const activeIssues = issues.filter(issue => issue.status !== 'resolved');
      const health = Math.max(20, 100 - activeIssues.length * 8); // Minimum 20% integrity
      
      const bar = container.querySelector('#project-health-bar');
      const val = container.querySelector('#project-health-value');
      if (bar && val) {
        bar.style.width = `${health}%`;
        val.textContent = `${health}%`;
        if (health < 50) {
          bar.style.background = 'var(--accent-red)';
          val.style.color = 'var(--accent-red)';
        } else if (health < 80) {
          bar.style.background = 'var(--accent-amber)';
          val.style.color = 'var(--accent-amber)';
        } else {
          bar.style.background = 'var(--accent-green)';
          val.style.color = 'var(--accent-green)';
        }
      }
    } catch (_) {}
  };
  calculateIntegrity();
  // Listen for issues update to keep it live
  window.addEventListener('forge-continuity-issues-found', calculateIntegrity);

  // ── Quick Action Deck Click Listeners ──
  container.querySelector('#qa-search-btn')?.addEventListener('click', () => {
    window.openForgeSearch?.();
  });
  container.querySelector('#qa-settings-btn')?.addEventListener('click', () => {
    navigate('settings');
  });

  refreshIcons();
}

// ── Database Template definitions ────────────────────────────────────────────
const DB_TEMPLATES = [
  {
    id: 'characters',
    name: 'Characters',
    icon: 'users',
    desc: 'Heroes, villains, NPCs & party members',
    color: '#f43f5e',
    fields: [
      { id: 'role',        name: 'Role / Class',  type: 'select',  options: ['Protagonist', 'Antagonist', 'Supporting', 'NPC', 'Ally', 'Villain'] },
      { id: 'status',      name: 'Status',         type: 'select',  options: ['Alive', 'Dead', 'Unknown', 'Missing', 'Transformed'] },
      { id: 'species',     name: 'Species / Race', type: 'text' },
      { id: 'affiliation', name: 'Affiliation',    type: 'text' },
      { id: 'tags',        name: 'Tags',           type: 'tags' },
    ]
  },
  {
    id: 'items',
    name: 'Items & Artifacts',
    icon: 'swords',
    desc: 'Weapons, gear, relics & key items',
    color: '#e5a93b',
    fields: [
      { id: 'type',     name: 'Type',     type: 'select', options: ['Weapon', 'Armor', 'Consumable', 'Key Item', 'Artifact', 'Tool', 'Currency'] },
      { id: 'rarity',   name: 'Rarity',   type: 'select', options: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Unique'] },
      { id: 'location', name: 'Location', type: 'text' },
      { id: 'owner',    name: 'Owner',    type: 'text' },
      { id: 'tags',     name: 'Tags',     type: 'tags' },
    ]
  },
  {
    id: 'locations',
    name: 'Locations, Lore & Maps',
    icon: 'map',
    desc: 'Maps, biomes, dungeons, POIs & grid overlays',
    color: '#10b981',
    fields: [
      { id: 'type',    name: 'Type',    type: 'select', options: ['City', 'Dungeon', 'Wilderness', 'Region', 'POI', 'Landmark', 'Hidden Area'] },
      { id: 'status',  name: 'Status',  type: 'select', options: ['Active', 'Ruins', 'Destroyed', 'Unknown', 'Locked'] },
      { id: 'region',  name: 'Region',  type: 'text' },
      { id: 'scale',   name: 'Map Scale (ft/grid)', type: 'number' },
      { id: 'grid',    name: 'Grid Type',           type: 'select', options: ['None', '5ft Square', '10ft Square', '5ft Hex', '10ft Hex'] },
      { id: 'tags',    name: 'Tags',    type: 'tags' },
    ]
  },
  {
    id: 'chapters',
    name: 'Story Chapters',
    icon: 'book-open',
    desc: 'Acts, chapters & narrative beats',
    color: '#3b82f6',
    fields: [
      { id: 'act',        name: 'Act',        type: 'select', options: ['Act I', 'Act II', 'Act III', 'Epilogue', 'Prologue', 'Interlude'] },
      { id: 'status',     name: 'Status',     type: 'select', options: ['Draft', 'In Progress', 'Complete', 'Scrapped'] },
      { id: 'characters', name: 'Characters', type: 'text' },
      { id: 'tags',       name: 'Tags',       type: 'tags' },
    ]
  },
  {
    id: 'abilities',
    name: 'Abilities & Skills',
    icon: 'zap',
    desc: 'Spells, attacks, passives & special moves',
    color: '#8b5cf6',
    fields: [
      { id: 'type',       name: 'Type',        type: 'select', options: ['Active', 'Passive', 'Ultimate', 'Buff', 'Debuff', 'Combo'] },
      { id: 'element',    name: 'Element',     type: 'text' },
      { id: 'assignedTo', name: 'Assigned To', type: 'text' },
      { id: 'tags',       name: 'Tags',        type: 'tags' },
    ]
  },
  {
    id: 'enemies',
    name: 'Enemies & Bosses',
    icon: 'shield',
    desc: 'Monsters, foes & encounter tables',
    color: '#ef4444',
    fields: [
      { id: 'tier',     name: 'Tier',     type: 'select', options: ['Grunt', 'Elite', 'Miniboss', 'Boss', 'Final Boss', 'Hidden Boss'] },
      { id: 'location', name: 'Location', type: 'text' },
      { id: 'status',   name: 'Status',   type: 'select', options: ['Active', 'Defeated', 'Dormant', 'Transformed'] },
      { id: 'tags',     name: 'Tags',     type: 'tags' },
    ]
  },
  {
    id: 'factions',
    name: 'Factions & Orgs',
    icon: 'layers',
    desc: 'Guilds, kingdoms, cults & organizations',
    color: '#06b6d4',
    fields: [
      { id: 'alignment', name: 'Alignment',  type: 'select', options: ['Ally', 'Enemy', 'Neutral', 'Unknown', 'Rogue'] },
      { id: 'leader',    name: 'Leader',     type: 'text' },
      { id: 'territory', name: 'Territory',  type: 'text' },
      { id: 'tags',      name: 'Tags',       type: 'tags' },
    ]
  },
  {
    id: 'custom',
    name: 'Custom',
    icon: 'database',
    desc: 'Blank database — define your own fields',
    color: '#64748b',
    fields: [
      { id: 'tags',   name: 'Tags',   type: 'tags' },
      { id: 'status', name: 'Status', type: 'select', options: ['Draft', 'In Progress', 'Complete'] }
    ]
  },
];

async function showCreateSchemaModal(projectId) {
  let selectedTemplate = null;
  const project = await db.getActiveProject();
  const rawStyle = project?.settings?.style || 'story';
  const style = String(rawStyle).toLowerCase().trim();

  const templates = DB_TEMPLATES;

  const content = document.createElement('div');

  const renderStep1 = () => {
    content.innerHTML = `
      <style>
        .db-tpl-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .db-tpl-card {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          padding: 14px 10px 12px;
          border-radius: 10px;
          border: 1.5px solid var(--border-subtle);
          background: rgba(255,255,255,0.02);
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: center;
        }
        .db-tpl-card:hover { border-color: rgba(255,255,255,0.18); background: rgba(255,255,255,0.05); transform: translateY(-1px); }
        .db-tpl-card.selected { border-color: var(--accent-primary) !important; background: var(--accent-primary-dim) !important; }
        .db-tpl-icon {
          width: 38px; height: 38px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
        }
        .db-tpl-name { font-size: 0.72rem; font-weight: 600; color: var(--text-primary); line-height: 1.2; }
        .db-tpl-desc { font-size: 0.62rem; color: var(--text-muted); line-height: 1.3; }
      </style>
      <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 14px;">Pick a type to start with the right fields pre-loaded:</p>
      <div class="db-tpl-grid">
        ${templates.map(t => `
          <div class="db-tpl-card" data-tpl-id="${t.id}">
            <div class="db-tpl-icon" style="background: ${t.color}22;">
              <i data-lucide="${t.icon}" style="width:18px;height:18px;color:${t.color};"></i>
            </div>
            <div class="db-tpl-name">${t.name}</div>
            <div class="db-tpl-desc">${t.desc}</div>
          </div>
        `).join('')}
      </div>
    `;

    setTimeout(() => {
      refreshIcons();
      content.querySelectorAll('.db-tpl-card').forEach(card => {
        card.addEventListener('click', () => {
          selectedTemplate = templates.find(t => t.id === card.dataset.tplId);
          content.querySelectorAll('.db-tpl-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          // Short delay then advance to step 2
          setTimeout(() => renderStep2(), 180);
        });
      });
    }, 30);
  };

  const renderStep2 = () => {
    const tpl = selectedTemplate;
    content.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--border-subtle);">
        <div style="width: 36px; height: 36px; border-radius: 8px; background: ${tpl.color}22; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <i data-lucide="${tpl.icon}" style="width:18px;height:18px;color:${tpl.color};"></i>
        </div>
        <div>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">${tpl.name}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${tpl.desc}</div>
        </div>
        <button id="cs-back-btn" style="margin-left: auto; background: transparent; border: 1px solid var(--border-subtle); border-radius: 6px; color: var(--text-muted); padding: 4px 10px; cursor: pointer; font-size: 0.75rem;">← Back</button>
      </div>

      <div class="form-group" style="margin-bottom: 16px;">
        <label class="form-label">Name this database</label>
        <input class="form-input" id="cs-name" placeholder="${tpl.name}" value="${tpl.id !== 'custom' ? tpl.name : ''}" />
      </div>

      <div>
        <div style="font-size: 0.72rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">Pre-loaded Fields</div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${tpl.fields.map(f => `
            <div style="display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 6px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle);">
              <span style="font-size: 0.78rem; font-weight: 500; color: var(--text-primary); flex: 1;">${f.name}</span>
              <span style="font-size: 0.68rem; font-family: var(--font-hud, monospace); color: ${tpl.color}; background: ${tpl.color}15; padding: 2px 6px; border-radius: 4px;">${f.type}</span>
              ${f.options ? `<span style="font-size: 0.65rem; color: var(--text-muted);">${f.options.slice(0, 3).join(', ')}${f.options.length > 3 ? '…' : ''}</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    setTimeout(() => {
      refreshIcons();
      content.querySelector('#cs-back-btn')?.addEventListener('click', () => {
        selectedTemplate = null;
        renderStep1();
      });
      content.querySelector('#cs-name')?.focus();
      const nameInput = content.querySelector('#cs-name');
      if (nameInput) nameInput.select();
    }, 30);
  };

  renderStep1();

  showModal({
    title: '✦ New Database',
    content,
    large: true,
    actions: [
      { label: 'Cancel', className: 'btn-secondary' },
      {
        label: 'Create Database',
        className: 'btn-primary',
        onClick: async () => {
          if (!selectedTemplate) {
            showToast('Pick a database type first', 'error');
            return false;
          }
          const nameInput = content.querySelector('#cs-name');
          const name = (nameInput?.value || selectedTemplate.name).trim();
          if (!name) { showToast('Please enter a name', 'error'); return false; }

          // Stamp unique IDs on field copies
          const fields = selectedTemplate.fields.map(f => ({ ...f, id: db.generateId ? db.generateId() : (Math.random().toString(36).slice(2)) }));

          const schema = await db.saveSchema({
            projectId,
            name,
            icon: selectedTemplate.icon,
            color: selectedTemplate.color,
            templateId: selectedTemplate.id,
            fields,
          });

          showToast(`"${name}" created`, 'success');
          await refreshSidebarLists();
          navigate(`schema/${schema.id}`);
        },
      },
    ],
  });
}

function showProjectSettingsModal(project) {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="flex flex-col gap-4">
      <div class="form-group">
        <label class="form-label">Project Name</label>
        <input class="form-input" id="ps-name" value="${escapeHtml(project.name || '')}" placeholder="My Game Universe" />
      </div>
      <div class="form-group">
        <label class="form-label">Genre / Theme</label>
        <input class="form-input" id="ps-genre" value="${escapeHtml(project.settings?.genre || '')}" placeholder="Sci-Fi RPG" />
      </div>
    </div>
  `;

  showModal({
    title: 'Project Settings',
    content,
    actions: [
      { label: 'Cancel', className: 'btn-secondary' },
      {
        label: 'Save',
        className: 'btn-primary',
        onClick: async () => {
          project.name = content.querySelector('#ps-name').value;
          if (!project.settings) project.settings = {};
          project.settings.genre = content.querySelector('#ps-genre').value;
          await db.saveProject(project);
          showToast('Project settings saved!', 'success');
          navigate('dashboard');
        },
      },
    ],
  });
}

function showStyleOnboardingModal(project) {
  const styleId = project.settings?.style || 'story';
  const styles = {
    story: {
      title: '📖 Welcome, Storyteller!',
      subtitle: 'Forge has loaded the Story Writer preset.',
      desc: 'Your workspace is optimized for prose, plotting, and character codexes. Ignis has assumed the role of a **Creative Sage** to help refine your descriptions, character arcs, and pacing.',
      color: '#e5a93b'
    },
    dnd: {
      title: '🛡️ Welcome, Dungeon Master!',
      subtitle: 'Forge has loaded the D&D Campaign Planner preset.',
      desc: 'Organize session notes, manage NPCs, design encounter math, and roll stats directly from custom canvas nodes. Ignis is primed as your **DM Assistant**.',
      color: '#8b5cf6'
    },
    gamedev: {
      title: '🎮 Welcome, Systems Designer!',
      subtitle: 'Forge has loaded the Game Dev Companion preset.',
      desc: 'Document mechanics, design behavior trees, and calculate level progression curves on the canvas. Ignis is online as your analytical **Gameplay Strategist**.',
      color: '#06b6d4'
    }
  };

  const currentStyle = styles[styleId] || styles.story;

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(5,4,8,0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    opacity: 0;
    transition: opacity 0.4s ease;
  `;

  overlay.innerHTML = `
    <div class="card" style="width: 100%; max-width: 520px; padding: var(--sp-8); background: rgba(20,17,34,0.96); border: 1px solid ${currentStyle.color}44; box-shadow: 0 20px 60px rgba(0,0,0,0.8); border-radius: var(--radius-lg); text-align: center; transform: translateY(30px); transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
      <div style="font-size: 3.5rem; margin-bottom: 20px; animation: bounce 1.5s infinite;">
        ${styleId === 'story' ? '📖' : styleId === 'dnd' ? '🛡️' : '🎮'}
      </div>
      
      <h2 style="color: #fff; font-family: var(--font-heading); font-size: 1.6rem; margin: 0 0 8px 0; background: linear-gradient(135deg, #fff, ${currentStyle.color}); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
        ${currentStyle.title}
      </h2>
      
      <p style="color: ${currentStyle.color}; font-family: var(--font-hud); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 20px 0; font-weight: 700;">
        ${currentStyle.subtitle}
      </p>
      
      <p style="color: var(--text-secondary); font-size: 0.88rem; line-height: 1.6; margin: 0 0 32px 0;">
        ${currentStyle.desc}
      </p>
      
      <button class="btn btn-primary" id="onboard-start-btn" style="background: ${currentStyle.color}; border-color: ${currentStyle.color}; color: #000; font-weight: 700; padding: 12px 32px; width: 100%; font-size: 0.95rem; border-radius: 8px; cursor: pointer;">
        Begin Forging
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    overlay.firstElementChild.style.transform = 'translateY(0)';
  });

  overlay.querySelector('#onboard-start-btn').addEventListener('click', () => {
    overlay.style.opacity = '0';
    overlay.firstElementChild.style.transform = 'translateY(30px)';
    setTimeout(() => {
      overlay.remove();
    }, 400);
  });
}

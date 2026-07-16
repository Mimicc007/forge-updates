import { getActiveProject, getPages } from '../db.js';
import { navigate } from '../router.js';
import { showToast } from '../ui.js';
import {
  getContinuityIssues,
  getResolvedIssues,
  dismissIssue,
  restoreIssue,
  clearContinuityIssues,
  forceRescan,
  runContinuityScan,
} from '../continuityMonitor.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let ceState = {
  activeTab: 'all', // 'all' | 'high' | 'medium' | 'low' | 'resolved'
  issues: [],
  resolvedIssues: [],
  pages: [],
  isScanning: false,
  lastScanned: null,
  project: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_COLORS = {
  high: '#f43f5e',
  medium: '#f97316',
  low: '#facc15',
  resolved: '#64748b',
};

const TYPE_CONFIG = {
  LOCATION_CONFLICT:      { label: 'Location Conflict',       icon: '📍', color: '#f97316' },
  PERSONALITY_MISMATCH:   { label: 'Personality Mismatch',    icon: '🎭', color: '#a78bfa' },
  TIMELINE_CONTRADICTION: { label: 'Timeline Contradiction',  icon: '⏱️', color: '#f43f5e' },
  DEAD_END_THREAD:        { label: 'Dead-end Thread',         icon: '🕳️', color: '#facc15' },
  ORPHANED_ENTRY:         { label: 'Orphaned Entry',          icon: '👻', color: '#64748b' },
  ORPHANED_PAGE:          { label: 'Orphaned Page',           icon: '👻', color: '#64748b' },
  BROKEN_LINK:            { label: 'Broken Link',             icon: '🔗', color: '#f43f5e' },
  DEAD_END_BEAT:          { label: 'Dead-end Beat',           icon: '🎬', color: '#facc15' },
  MISSING_CR_ALIGNMENT:   { label: 'CR/AC Mismatch',          icon: '🎯', color: '#f43f5e' },
  DEAD_NPC_IN_PREP:       { label: 'Dead NPC in Prep',        icon: '💀', color: '#facc15' },
  BROKEN_PREREQ:          { label: 'Broken Prerequisite',     icon: '🎛️', color: '#f43f5e' },
  INPUT_CONFLICT:         { label: 'Input Conflict',          icon: '🎮', color: '#facc15' },
  EMPTY_MOTIVATION:       { label: 'Empty Motivation',        icon: '🎯', color: '#facc15' },
  ABSENCE_GAP:            { label: 'Absence Gap',             icon: '⚠️', color: '#f97316' },
  SIMULTANEOUS_BEAT:      { label: 'Simultaneous Beat',       icon: '⏱️', color: '#f43f5e' },
};

function formatRelativeTime(isoStr) {
  if (!isoStr) return '';
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffHr < 48) return 'Yesterday';
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

function formatDateTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function resolvePageName(pageId) {
  const page = ceState.pages.find(p => p.id === pageId);
  return (page && (page.title || page.name)) || 'Untitled';
}

// ---------------------------------------------------------------------------
// CSS Injection
// ---------------------------------------------------------------------------

function injectStyles() {
  if (document.getElementById('continuity-engine-styles')) return;
  const style = document.createElement('style');
  style.id = 'continuity-engine-styles';
  style.textContent = `
    /* ---- Root ---- */
    .ce-root {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 32px;
      background: var(--bg-deep);
      overflow: hidden;
      box-sizing: border-box;
    }
    
    /* ---- Health Gauge ---- */
    .ce-health-gauge-container {
      display: flex;
      align-items: center;
      gap: 20px;
      background: rgba(15, 12, 28, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.05);
      padding: 16px 24px;
      border-radius: 12px;
      margin-bottom: 24px;
      backdrop-filter: blur(12px);
    }
    .ce-investigation-path {
      margin-top: 10px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      padding: 12px 16px;
    }
    .ce-investigation-title {
      font-size: 0.75rem;
      text-transform: uppercase;
      font-family: var(--font-hud, monospace);
      color: var(--accent-primary);
      margin-bottom: 6px;
      font-weight: 600;
    }
    .ce-investigation-steps {
      margin: 0;
      padding-left: 16px;
      font-size: 0.8rem;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    /* ---- Header ---- */
    .ce-header {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 28px;
    }
    .ce-title-block {
      display: flex;
      flex-direction: column;
    }
    .ce-title {
      font-size: 1.6rem;
      font-weight: 700;
      font-family: var(--font-heading);
      color: #ffffff;
      margin: 0;
    }
    .ce-subtitle {
      font-size: 0.82rem;
      color: var(--text-muted);
      margin: 0;
      margin-top: 4px;
    }
    .ce-header-actions {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 10px;
    }
    .ce-scan-btn {
      background: var(--accent-primary);
      color: #0a0812;
      font-weight: 700;
      padding: 9px 20px;
      border-radius: 10px;
      font-size: 0.82rem;
      border: none;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .ce-scan-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .ce-scan-btn:not(:disabled):hover {
      opacity: 0.85;
    }
    .ce-status-pill {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      padding: 4px 12px;
      font-size: 0.72rem;
      font-family: var(--font-hud);
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }
    .ce-status-pill.scanning {
      color: var(--accent-primary);
      border-color: rgba(229, 169, 59, 0.3);
    }

    /* ---- Spinner ---- */
    @keyframes ce-spin {
      to { transform: rotate(360deg); }
    }
    .ce-spinner {
      width: 10px;
      height: 10px;
      border: 1.5px solid rgba(229, 169, 59, 0.3);
      border-top-color: var(--accent-primary);
      border-radius: 50%;
      animation: ce-spin 0.8s linear infinite;
      display: inline-block;
      flex-shrink: 0;
    }

    /* ---- Tabs ---- */
    .ce-tabs {
      display: flex;
      flex-direction: row;
      gap: 4px;
      margin-bottom: 24px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      padding-bottom: 0;
    }
    .ce-tab {
      padding: 8px 16px;
      border-radius: 8px 8px 0 0;
      font-size: 0.8rem;
      font-family: var(--font-hud);
      font-weight: 600;
      cursor: pointer;
      background: transparent;
      border: none;
      color: var(--text-muted);
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }
    .ce-tab:hover:not(.active) {
      color: var(--text-secondary);
    }
    .ce-tab.active {
      color: #ffffff;
      border-bottom-color: var(--accent-primary);
    }
    .ce-tab-count {
      font-size: 0.68rem;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 1px 6px;
      margin-left: 5px;
    }

    /* ---- Issue List ---- */
    .ce-issue-list {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-right: 4px;
    }
    .ce-issue-list::-webkit-scrollbar {
      width: 5px;
    }
    .ce-issue-list::-webkit-scrollbar-track {
      background: transparent;
    }
    .ce-issue-list::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
    }

    /* ---- Issue Card ---- */
    .ce-card {
      background: rgba(15, 12, 28, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-left-width: 4px;
      border-radius: 12px;
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .ce-card:hover {
      border-color: rgba(255, 255, 255, 0.12);
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
    }
    .ce-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .ce-badge {
      font-size: 0.65rem;
      font-weight: 700;
      font-family: var(--font-hud);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 3px 9px;
      border-radius: 6px;
    }
    .ce-card-time {
      font-size: 0.68rem;
      color: var(--text-muted);
      font-family: var(--font-hud);
    }
    .ce-card-desc {
      font-size: 0.88rem;
      color: var(--text-primary);
      line-height: 1.6;
      margin: 0;
    }
    .ce-card-suggestion {
      font-size: 0.78rem;
      color: var(--text-secondary);
      font-style: italic;
      line-height: 1.4;
      margin: 0;
      display: flex;
      gap: 6px;
    }

    /* ---- Page Links ---- */
    .ce-page-links {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      gap: 6px;
    }
    .ce-page-link {
      font-size: 0.72rem;
      color: var(--accent-primary);
      background: rgba(229, 169, 59, 0.08);
      border: 1px solid rgba(229, 169, 59, 0.2);
      padding: 3px 10px;
      border-radius: 6px;
      text-decoration: none;
      font-family: var(--font-hud);
      cursor: pointer;
      transition: all 0.2s;
    }
    .ce-page-link:hover {
      background: rgba(229, 169, 59, 0.15);
      border-color: rgba(229, 169, 59, 0.4);
    }

    /* ---- Card Actions ---- */
    .ce-card-actions {
      display: flex;
      flex-direction: row;
      gap: 8px;
      justify-content: flex-end;
    }
    .ce-dismiss-btn {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-muted);
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 0.72rem;
      cursor: pointer;
      font-family: var(--font-hud);
      transition: all 0.2s;
    }
    .ce-dismiss-btn:hover {
      border-color: rgba(255, 255, 255, 0.25);
      color: var(--text-primary);
    }
    .ce-restore-btn {
      background: transparent;
      border: 1px solid rgba(229, 169, 59, 0.3);
      color: var(--accent-primary);
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 0.72rem;
      cursor: pointer;
      font-family: var(--font-hud);
      transition: all 0.2s;
    }
    .ce-restore-btn:hover {
      background: rgba(229, 169, 59, 0.08);
      border-color: rgba(229, 169, 59, 0.5);
    }

    /* ---- Empty State ---- */
    .ce-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      gap: 14px;
      padding: 60px 0;
      color: var(--text-muted);
      text-align: center;
    }
    .ce-empty-icon {
      font-size: 3rem;
    }
    .ce-empty-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-secondary);
      margin: 0;
    }
    .ce-empty-text {
      font-size: 0.82rem;
      line-height: 1.5;
      max-width: 360px;
      margin: 0;
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Status Pill Content
// ---------------------------------------------------------------------------

function buildStatusPillContent() {
  if (ceState.isScanning) {
    return `<span class="ce-spinner"></span> Scanning...`;
  }
  if (ceState.lastScanned) {
    return `Last scanned: ${formatRelativeTime(ceState.lastScanned)}`;
  }
  return `Not yet scanned`;
}

function getInvestigationSteps(issue) {
  switch (issue.type) {
    case 'BROKEN_PREREQ':
      return [
        'Open the <strong>Plot Timeline</strong> (Roadmap) view.',
        'Locate the conflicting beats highlighted in the description.',
        'Drag the prerequisite beat to the left of the dependent beat, or open the beat inspector and remove the prerequisite.'
      ];
    case 'DEAD_END_THREAD':
      return [
        'Navigate to the active beat workspace canvas.',
        'Locate the unresolved <strong>Setup Node</strong>.',
        'Create a <strong>Payoff Node</strong> (or find an existing one) representing the resolution.',
        'Use the <strong>Link Tool (🔗)</strong> in the toolbar to draw a connection line between the two nodes.'
      ];
    case 'EMPTY_MOTIVATION':
      return [
        'Go to the character database entry by clicking the page link below.',
        'In the document editor, expand the <strong>Motivations & Goals</strong> field or backstory section.',
        'Flesh out the character motivations to resolve this warning.'
      ];
    case 'ABSENCE_GAP':
      return [
        'Review the Act II chapters to check where this character could play a role.',
        'Open the timeline beat inspector, go to <strong>Linked Entries</strong>, and associate the character with an Act II beat.',
        'Alternatively, add a lore card to Act II explaining their off-screen activities.'
      ];
    case 'SIMULTANEOUS_BEAT':
      return [
        'Open the <strong>Plot Timeline</strong> roadmap.',
        'Find the two parallel beats occurring at the same horizontal time slot.',
        'Reposition one of the beats to a different horizontal coordinate, or remove the character from the linked entries of one beat.'
      ];
    default:
      return [
        'Click the page link below to navigate to the affected document.',
        'Review the description details for context.',
        'Update properties or links as suggested to clear the issue.'
      ];
  }
}

// ---------------------------------------------------------------------------
// Render Issue Card
// ---------------------------------------------------------------------------

function renderIssueCard(issue, isResolved) {
  const sevColor = isResolved
    ? SEVERITY_COLORS.resolved
    : (SEVERITY_COLORS[issue.severity] || SEVERITY_COLORS.low);

  const typeKey = (issue.type || '').toUpperCase().replace(/ /g, '_');
  const typeCfg = TYPE_CONFIG[typeKey] || {
    label: issue.type || 'Unknown',
    icon: '⚠️',
    color: '#94a3b8',
  };

  const card = document.createElement('div');
  card.className = 'ce-card';
  card.style.borderLeftColor = sevColor;

  // ---- Header row ----
  const headerRow = document.createElement('div');
  headerRow.className = 'ce-card-header';

  const badgeGroup = document.createElement('div');
  badgeGroup.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;';

  const typeBadge = document.createElement('span');
  typeBadge.className = 'ce-badge ce-badge-type';
  typeBadge.style.cssText = `background:${typeCfg.color}22;color:${typeCfg.color};`;
  typeBadge.textContent = `${typeCfg.icon} ${typeCfg.label}`;

  const sevLabel = isResolved ? 'resolved' : (issue.severity || 'low');
  const sevBadge = document.createElement('span');
  sevBadge.className = 'ce-badge ce-badge-sev';
  sevBadge.style.cssText = `background:${sevColor}22;color:${sevColor};`;
  sevBadge.textContent = sevLabel;

  badgeGroup.appendChild(typeBadge);
  badgeGroup.appendChild(sevBadge);

  const timeEl = document.createElement('span');
  timeEl.className = 'ce-card-time';
  const ts = issue.detectedAt || issue.resolvedAt || issue.timestamp;
  timeEl.textContent = ts ? formatRelativeTime(ts) || formatDateTime(ts) : '';

  headerRow.appendChild(badgeGroup);
  headerRow.appendChild(timeEl);
  card.appendChild(headerRow);

  // ---- Description ----
  if (issue.description) {
    const desc = document.createElement('p');
    desc.className = 'ce-card-desc';
    desc.textContent = issue.description;
    card.appendChild(desc);
  }

  // ---- Suggestion ----
  if (issue.suggestion) {
    const sug = document.createElement('p');
    sug.className = 'ce-card-suggestion';
    sug.textContent = `💡 ${issue.suggestion}`;
    card.appendChild(sug);
  }

  // ---- Investigation Path ----
  const styleId = ceState.project?.settings?.style || 'story';
  if (styleId === 'story' && !isResolved) {
    const steps = getInvestigationSteps(issue);
    if (steps && steps.length > 0) {
      const pathDiv = document.createElement('div');
      pathDiv.className = 'ce-investigation-path';
      pathDiv.innerHTML = `
        <div class="ce-investigation-title">📋 Suggested Investigation Path</div>
        <ol class="ce-investigation-steps" style="margin: 0; padding-left: 16px;">
          ${steps.map(s => `<li>${s}</li>`).join('')}
        </ol>
      `;
      card.appendChild(pathDiv);
    }
  }

  // ---- Page links ----
  const pageIds = Array.isArray(issue.pageIds) ? issue.pageIds : [];
  if (pageIds.length > 0) {
    const linksRow = document.createElement('div');
    linksRow.className = 'ce-page-links';
    pageIds.forEach(pid => {
      const name = resolvePageName(pid);
      const link = document.createElement('span');
      link.className = 'ce-page-link';
      link.textContent = `→ ${name}`;
      link.addEventListener('click', () => navigate(`page/${pid}`));
      linksRow.appendChild(link);
    });
    card.appendChild(linksRow);
  }

  // ---- Actions ----
  const actions = document.createElement('div');
  actions.className = 'ce-card-actions';

  if (isResolved) {
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'ce-restore-btn';
    restoreBtn.textContent = '↩ Restore';
    restoreBtn.addEventListener('click', () => {
      restoreIssue(issue.id);
      reloadIssues();
      rerenderList();
      updateTabCounts();
    });
    actions.appendChild(restoreBtn);
  } else {
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'ce-dismiss-btn';
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.addEventListener('click', () => {
      dismissIssue(issue.id);
      reloadIssues();
      rerenderList();
      updateTabCounts();
    });
    actions.appendChild(dismissBtn);
  }

  card.appendChild(actions);
  return card;
}

// ---------------------------------------------------------------------------
// Render Issue List
// ---------------------------------------------------------------------------

let listEl = null;
let tabEls = {};

function getFilteredIssues() {
  const tab = ceState.activeTab;
  if (tab === 'resolved') return null; // sentinel — use resolvedIssues
  if (tab === 'all') return ceState.issues;
  return ceState.issues.filter(i => i.severity === tab);
}

function rerenderList() {
  updateHealthGauge();
  if (!listEl) return;
  listEl.innerHTML = '';

  const isResolved = ceState.activeTab === 'resolved';
  const items = isResolved ? ceState.resolvedIssues : getFilteredIssues();

  if (!items || items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ce-empty';

    const emptyIcon = document.createElement('div');
    emptyIcon.className = 'ce-empty-icon';

    const emptyTitle = document.createElement('p');
    emptyTitle.className = 'ce-empty-title';

    const emptyText = document.createElement('p');
    emptyText.className = 'ce-empty-text';

    if (isResolved) {
      emptyIcon.textContent = '✅';
      emptyTitle.textContent = 'No resolved issues';
      emptyText.textContent = 'Dismissed issues will appear here so you can restore them if needed.';
    } else if (ceState.activeTab === 'all') {
      emptyIcon.textContent = '🛡️';
      emptyTitle.textContent = 'No continuity issues found';
      emptyText.textContent = 'Ignis hasn\'t detected any narrative inconsistencies yet. Run a scan to analyse your world.';
    } else {
      emptyIcon.textContent = '✨';
      emptyTitle.textContent = `No ${ceState.activeTab} severity issues`;
      emptyText.textContent = `There are no ${ceState.activeTab} severity issues right now.`;
    }

    empty.appendChild(emptyIcon);
    empty.appendChild(emptyTitle);
    empty.appendChild(emptyText);
    listEl.appendChild(empty);
    return;
  }

  items.forEach(issue => {
    const card = renderIssueCard(issue, isResolved);
    listEl.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// Tab Counts
// ---------------------------------------------------------------------------

function updateTabCounts() {
  const counts = {
    all: ceState.issues.length,
    high: ceState.issues.filter(i => i.severity === 'high').length,
    medium: ceState.issues.filter(i => i.severity === 'medium').length,
    low: ceState.issues.filter(i => i.severity === 'low').length,
    resolved: ceState.resolvedIssues.length,
  };

  Object.entries(tabEls).forEach(([key, el]) => {
    const countSpan = el.querySelector('.ce-tab-count');
    if (countSpan) countSpan.textContent = counts[key] ?? 0;
  });
}

// ---------------------------------------------------------------------------
// Reload issues from storage
// ---------------------------------------------------------------------------

function reloadIssues() {
  ceState.issues = getContinuityIssues();
  ceState.resolvedIssues = getResolvedIssues();
}

// ---------------------------------------------------------------------------
// Status pill element reference
// ---------------------------------------------------------------------------

let statusPillEl = null;
let scanBtnEl = null;
let healthGaugeEl = null;

function refreshStatusPill() {
  if (!statusPillEl) return;
  statusPillEl.innerHTML = buildStatusPillContent();
  if (ceState.isScanning) {
    statusPillEl.classList.add('scanning');
  } else {
    statusPillEl.classList.remove('scanning');
  }
}

function calculateStoryHealthScore(issues) {
  let score = 100;
  issues.forEach(issue => {
    if (issue.severity === 'high') score -= 10;
    else if (issue.severity === 'medium') score -= 5;
    else score -= 2;
  });
  return Math.max(score, 0);
}

function updateHealthGauge() {
  if (!healthGaugeEl) return;
  const project = ceState.project;
  const styleId = project?.settings?.style || 'story';
  if (styleId !== 'story') {
    healthGaugeEl.style.display = 'none';
    return;
  }
  
  healthGaugeEl.style.display = 'flex';
  const score = calculateStoryHealthScore(ceState.issues);
  const color = score > 80 ? '#10b981' : score > 50 ? '#e5a93b' : '#f43f5e';
  
  healthGaugeEl.innerHTML = `
    <div style="position: relative; width: 64px; height: 64px; flex-shrink: 0;">
      <svg width="64" height="64" viewBox="0 0 36 36" style="transform: rotate(-90deg);">
        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="3" />
        <path stroke-dasharray="${score}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" style="transition: stroke-dasharray 0.35s ease;" />
      </svg>
      <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; font-family: var(--font-hud, monospace); color: #fff;">${score}%</div>
    </div>
    <div>
      <h3 style="margin: 0; font-size: 0.95rem; font-weight: 600; color: #fff;">Story Health Score</h3>
      <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: var(--text-muted);">${ceState.issues.length} active warnings / plot holes detected.</p>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function renderContinuityEngine(container) {
  // Reset module-level refs
  listEl = null;
  tabEls = {};
  statusPillEl = null;
  scanBtnEl = null;
  healthGaugeEl = null;

  // Reset state
  ceState.activeTab = 'all';
  ceState.issues = [];
  ceState.resolvedIssues = [];
  ceState.pages = [];
  ceState.isScanning = false;
  ceState.lastScanned = localStorage.getItem('forge-continuity-last-scan') || null;

  // Guard: active project required
  const project = await getActiveProject();
  if (!project) {
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:0.9rem;">
        No active project. Please open a project to use the Continuity Engine.
      </div>`;
    return;
  }
  ceState.project = project;
  const styleId = project.settings?.style || 'story';

  // Load pages for name resolution
  try {
    ceState.pages = (await getPages(project.id)) || [];
  } catch (err) {
    ceState.pages = [];
  }

  // Load issues
  reloadIssues();

  // Inject CSS
  injectStyles();

  // ---- Build DOM ----
  container.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'ce-root';

  // -- Header --
  const header = document.createElement('div');
  header.className = 'ce-header';

  const titleBlock = document.createElement('div');
  titleBlock.className = 'ce-title-block';

  const titleEl = document.createElement('h1');
  titleEl.className = 'ce-title';
  titleEl.textContent = styleId === 'story' ? 'Plot Hole Inspector' : 'Continuity Engine';

  const subtitleEl = document.createElement('p');
  subtitleEl.className = 'ce-subtitle';
  subtitleEl.textContent = styleId === 'story' 
    ? 'Ignis scans your narrative structure to detect plot holes and structural gaps'
    : 'Ignis monitors your world for narrative inconsistencies';

  titleBlock.appendChild(titleEl);
  titleBlock.appendChild(subtitleEl);

  const headerActions = document.createElement('div');
  headerActions.className = 'ce-header-actions';

  // Status pill
  statusPillEl = document.createElement('div');
  statusPillEl.className = 'ce-status-pill';
  statusPillEl.innerHTML = buildStatusPillContent();

  // Scan button
  scanBtnEl = document.createElement('button');
  scanBtnEl.className = 'ce-scan-btn';
  scanBtnEl.textContent = '🔍 Scan Now';
  scanBtnEl.addEventListener('click', async () => {
    if (ceState.isScanning) return;
    ceState.isScanning = true;
    refreshStatusPill();
    scanBtnEl.disabled = true;

    try {
      await forceRescan();
    } catch (err) {
      console.error('[ContinuityEngine] Scan failed:', err);
      showToast('Scan failed — check console for details.', 'error');
    }

    ceState.isScanning = false;
    const now = new Date().toISOString();
    ceState.lastScanned = now;
    localStorage.setItem('forge-continuity-last-scan', now);
    refreshStatusPill();
    scanBtnEl.disabled = false;

    reloadIssues();
    rerenderList();
    updateTabCounts();
  });

  headerActions.appendChild(statusPillEl);
  headerActions.appendChild(scanBtnEl);

  header.appendChild(titleBlock);
  header.appendChild(headerActions);
  root.appendChild(header);

  // -- Health Gauge (radial progress bar) --
  if (styleId === 'story') {
    healthGaugeEl = document.createElement('div');
    healthGaugeEl.className = 'ce-health-gauge-container';
    root.appendChild(healthGaugeEl);
    updateHealthGauge();
  }

  // -- Tabs --
  const tabs = document.createElement('div');
  tabs.className = 'ce-tabs';

  const tabDefs = [
    { key: 'all',      label: 'All' },
    { key: 'high',     label: '🔴 High' },
    { key: 'medium',   label: '🟠 Medium' },
    { key: 'low',      label: '🟡 Low' },
    { key: 'resolved', label: '✅ Resolved' },
  ];

  const countMap = {
    all:      ceState.issues.length,
    high:     ceState.issues.filter(i => i.severity === 'high').length,
    medium:   ceState.issues.filter(i => i.severity === 'medium').length,
    low:      ceState.issues.filter(i => i.severity === 'low').length,
    resolved: ceState.resolvedIssues.length,
  };

  tabDefs.forEach(({ key, label }) => {
    const btn = document.createElement('button');
    btn.className = 'ce-tab' + (key === ceState.activeTab ? ' active' : '');
    btn.innerHTML = `${label}<span class="ce-tab-count">${countMap[key]}</span>`;
    btn.addEventListener('click', () => {
      if (ceState.activeTab === key) return;
      ceState.activeTab = key;
      // Update active class
      Object.values(tabEls).forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      rerenderList();
    });
    tabEls[key] = btn;
    tabs.appendChild(btn);
  });

  root.appendChild(tabs);

  // -- Issue list --
  listEl = document.createElement('div');
  listEl.className = 'ce-issue-list';
  root.appendChild(listEl);

  container.appendChild(root);

  // Initial render
  rerenderList();

  // ---- Live event listeners ----
  function onIssuesFound() {
    reloadIssues();
    rerenderList();
    updateTabCounts();
  }

  function onIssuesCleared() {
    ceState.issues = [];
    reloadIssues(); // also refresh resolved in case that changed
    rerenderList();
    updateTabCounts();
  }

  window.addEventListener('forge-continuity-issues-found', onIssuesFound);
  window.addEventListener('forge-continuity-cleared', onIssuesCleared);

  // Cleanup
  container._cleanup = () => {
    window.removeEventListener('forge-continuity-issues-found', onIssuesFound);
    window.removeEventListener('forge-continuity-cleared', onIssuesCleared);
    // Null out refs so stale closures don't mutate detached DOM
    listEl = null;
    statusPillEl = null;
    scanBtnEl = null;
    healthGaugeEl = null;
    tabEls = {};
  };
}

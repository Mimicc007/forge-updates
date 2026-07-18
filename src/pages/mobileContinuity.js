/* ============================================================
   Forge Mobile — Continuity Engine
   Checks and displays plot holes, character inconsistencies, etc.
   ============================================================ */

import { getActiveProject, getPages } from '../db.js';
import { navigate } from '../router.js';
import {
  getContinuityIssues,
  getResolvedIssues,
  dismissIssue,
  restoreIssue,
  forceRescan
} from '../continuityMonitor.js';

let _project = null;
let _pages = [];
let _activeTab = 'active'; // 'active' | 'resolved'
let _isScanning = false;

const SEVERITY_COLORS = {
  high: '#ef4444',
  medium: '#f97316',
  low: '#eab308'
};

const TYPE_CONFIG = {
  LOCATION_CONFLICT:      { label: 'Location Conflict',       icon: '📍' },
  PERSONALITY_MISMATCH:   { label: 'Personality Mismatch',    icon: '🎭' },
  TIMELINE_CONTRADICTION: { label: 'Timeline Contradiction',  icon: '⏱️' },
  DEAD_END_THREAD:        { label: 'Dead-end Thread',         icon: '🕳️' },
  ORPHANED_ENTRY:         { label: 'Orphaned Entry',          icon: '👻' },
  ORPHANED_PAGE:          { label: 'Orphaned Page',           icon: '👻' },
  BROKEN_LINK:            { label: 'Broken Link',             icon: '🔗' },
  DEAD_END_BEAT:          { label: 'Dead-end Beat',           icon: '🎬' },
  MISSING_CR_ALIGNMENT:   { label: 'CR/AC Mismatch',          icon: '🎯' },
  DEAD_NPC_IN_PREP:       { label: 'Dead NPC in Prep',        icon: '💀' },
  BROKEN_PREREQ:          { label: 'Broken Prerequisite',     icon: '🎛️' },
  INPUT_CONFLICT:         { label: 'Input Conflict',          icon: '🎮' },
  EMPTY_MOTIVATION:       { label: 'Empty Motivation',        icon: '🎯' },
  ABSENCE_GAP:            { label: 'Absence Gap',             icon: '⚠️' },
  SIMULTANEOUS_BEAT:      { label: 'Simultaneous Beat',       icon: '⏱️' }
};

export async function renderMobileContinuity(container) {
  _project = await getActiveProject();

  if (!_project) {
    container.innerHTML = `
      <div class="m-page">
        <div class="m-empty" style="padding-top:80px">
          <div class="m-empty-icon">📂</div>
          <div class="m-empty-title">No project open</div>
        </div>
      </div>
    `;
    return;
  }

  _pages = await getPages(_project.id).catch(() => []);
  _render(container);
}

function _render(container) {
  const activeIssues = getContinuityIssues() || [];
  const resolvedIssues = getResolvedIssues() || [];

  const displayList = _activeTab === 'active' ? activeIssues : resolvedIssues;

  container.innerHTML = `
    <div class="m-page" id="m-continuity-root" style="padding-bottom:100px">
      <!-- Header -->
      <div class="m-header">
        <div class="m-header-title">Continuity Engine</div>
      </div>

      <!-- Tab Switcher -->
      <div style="padding:16px 16px 8px;display:flex;gap:8px">
        <button class="m-schema-chip ${_activeTab === 'active' ? 'active' : ''}" id="m-tab-active" style="flex:1;text-align:center;justify-content:center;--chip-color:var(--accent-primary)">
          Active (${activeIssues.length})
        </button>
        <button class="m-schema-chip ${_activeTab === 'resolved' ? 'active' : ''}" id="m-tab-resolved" style="flex:1;text-align:center;justify-content:center;--chip-color:#94a3b8">
          Dismissed (${resolvedIssues.length})
        </button>
      </div>

      <!-- List -->
      <div style="padding:10px 16px 24px">
        ${_isScanning ? `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px">
            <div class="m-scanner-spinner" style="width:40px;height:40px;border:3px solid rgba(229,169,59,0.15);border-top-color:var(--accent-primary);border-radius:50%;animation:m-spin 0.8s linear infinite"></div>
            <div style="font-size:0.9rem;font-weight:700;color:var(--text-secondary);margin-top:16px">Scanning manuscript & lore...</div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">Running semantic consistency check</div>
          </div>
        ` : displayList.length === 0 ? `
          <div class="m-empty" style="padding:60px 20px">
            <div class="m-empty-icon">${_activeTab === 'active' ? '✨' : '📭'}</div>
            <div class="m-empty-title">${_activeTab === 'active' ? 'All Clear!' : 'No dismissed issues'}</div>
            <div class="m-empty-sub">${_activeTab === 'active' ? 'No plot holes or inconsistencies detected in your story.' : 'Issues you dismiss will appear here.'}</div>
          </div>
        ` : displayList.map(issue => {
          const type = TYPE_CONFIG[issue.type] || { label: issue.type, icon: '⚠️' };
          const color = SEVERITY_COLORS[issue.severity] || '#94a3b8';
          const page = _pages.find(p => p.id === issue.pageId);
          const pageTitle = page ? (page.title || 'Untitled') : 'Unknown Entry';

          return `
            <div class="m-card" style="margin-bottom:12px;padding:14px;border-left:3.5px solid ${color}">
              <div style="display:flex;align-items:start;gap:8px">
                <span style="font-size:1.1rem;line-height:1;margin-top:2px">${type.icon}</span>
                <div style="flex:1;min-width:0">
                  <div style="font-size:0.88rem;font-weight:700;color:var(--text-primary)">${_esc(issue.title)}</div>
                  <div style="font-size:0.68rem;text-transform:uppercase;font-weight:700;color:${color};margin-top:2px">${issue.severity} priority</div>
                  
                  <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:6px;line-height:1.4">${_esc(issue.description)}</div>
                  
                  <!-- Page reference link -->
                  <button class="m-issue-page-link" data-page-id="${issue.pageId}" style="margin-top:10px;padding:6px 10px;background:var(--bg-elevated);border:1px solid var(--glass-border);border-radius:8px;font-size:0.75rem;color:var(--accent-primary);display:inline-flex;align-items:center;gap:4px;cursor:pointer">
                    📄 ${pageTitle}
                  </button>
                </div>
              </div>
              <div style="display:flex;justify-content:end;margin-top:12px;border-top:1px solid var(--glass-border);padding-top:8px">
                ${_activeTab === 'active' ? `
                  <button class="m-issue-btn" data-action="dismiss" data-id="${issue.id}" style="background:none;border:none;color:var(--text-muted);font-size:0.75rem;font-weight:600;padding:6px;cursor:pointer">
                    Dismiss Issue
                  </button>
                ` : `
                  <button class="m-issue-btn" data-action="restore" data-id="${issue.id}" style="background:none;border:none;color:var(--accent-primary);font-size:0.75rem;font-weight:600;padding:6px;cursor:pointer">
                    Restore Issue
                  </button>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Scan FAB -->
    <button class="m-fab" id="m-scan-fab" title="Run Scan" style="transition:transform 0.3s">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" id="m-scan-icon"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
    </button>

    <style>
      @keyframes m-spin {
        to { transform: rotate(360deg); }
      }
    </style>
  `;

  // Wire Tab Switches
  container.querySelector('#m-tab-active')?.addEventListener('click', () => {
    _activeTab = 'active';
    _render(container);
  });
  container.querySelector('#m-tab-resolved')?.addEventListener('click', () => {
    _activeTab = 'resolved';
    _render(container);
  });

  // Wire Page links
  container.querySelectorAll('.m-issue-page-link').forEach(link => {
    link.addEventListener('click', () => {
      navigate(`page/${link.dataset.pageId}`);
    });
  });

  // Wire Dismiss/Restore Actions
  container.querySelectorAll('.m-issue-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (navigator.vibrate) navigator.vibrate(8);

      if (action === 'dismiss') {
        dismissIssue(id);
      } else {
        restoreIssue(id);
      }
      _render(container);
    });
  });

  // Wire Scan FAB
  container.querySelector('#m-scan-fab')?.addEventListener('click', async () => {
    if (_isScanning) return;
    if (navigator.vibrate) navigator.vibrate([10, 30, 10]);

    _isScanning = true;
    _render(container);

    try {
      await forceRescan();
      _pages = await getPages(_project.id).catch(() => []);
    } catch (err) {
      console.error('[MobileContinuity] scan error', err);
    } finally {
      _isScanning = false;
      _render(container);
    }
  });
}

function _esc(str) {
  return String(str).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

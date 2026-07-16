import { getActiveProject, getPages, getPagesBySchema, getAllTabs, getAllNodes } from '../db.js';
import { navigate } from '../router.js';
import { showToast } from '../ui.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state = {
  activeTab: 'presence', // 'presence' | 'pov' | 'purposes' | 'foreshadowing'
  project: null,
  pages: [],
  characters: [],
  tabs: [],
  allNodes: [],
  beats: [],
};

// ---------------------------------------------------------------------------
// CSS Injection
// ---------------------------------------------------------------------------

function injectStyles() {
  if (document.getElementById('wa-view-styles')) return;
  const style = document.createElement('style');
  style.id = 'wa-view-styles';
  style.textContent = `
    .wa-root {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 32px;
      background: var(--bg-deep, #0a0812);
      overflow: hidden;
      box-sizing: border-box;
      color: var(--text-primary, #ffffff);
    }
    .wa-header {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
    }
    .wa-title-block {
      display: flex;
      flex-direction: column;
    }
    .wa-title {
      font-size: 1.6rem;
      font-weight: 700;
      font-family: var(--font-heading, sans-serif);
      color: #ffffff;
      margin: 0;
    }
    .wa-subtitle {
      font-size: 0.82rem;
      color: var(--text-muted, #a0aec0);
      margin: 4px 0 0;
    }
    .wa-tabs {
      display: flex;
      flex-direction: row;
      gap: 4px;
      margin-bottom: 24px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .wa-tab {
      padding: 8px 16px;
      border-radius: 8px 8px 0 0;
      font-size: 0.8rem;
      font-family: var(--font-hud, monospace);
      font-weight: 600;
      cursor: pointer;
      background: transparent;
      border: none;
      color: var(--text-muted, #a0aec0);
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }
    .wa-tab:hover:not(.active) {
      color: var(--text-secondary, #cbd5e0);
    }
    .wa-tab.active {
      color: #ffffff;
      border-bottom-color: var(--accent-primary, #e5a93b);
    }
    .wa-content {
      flex: 1;
      overflow-y: auto;
      padding-right: 4px;
    }
    .wa-content::-webkit-scrollbar {
      width: 5px;
    }
    .wa-content::-webkit-scrollbar-track {
      background: transparent;
    }
    .wa-content::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
    }
    .wa-panel {
      background: rgba(15, 12, 28, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      backdrop-filter: blur(12px);
    }
    .wa-panel-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0 0 16px 0;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .wa-grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    @media (max-width: 900px) {
      .wa-grid-2 {
        grid-template-columns: 1fr;
      }
    }
    .wa-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
      text-align: left;
    }
    .wa-table th {
      color: var(--text-muted, #a0aec0);
      font-family: var(--font-hud, monospace);
      font-weight: 600;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .wa-table td {
      padding: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: var(--text-secondary, #cbd5e0);
    }
    .wa-table tr:hover td {
      background: rgba(255, 255, 255, 0.05);
      color: #ffffff;
    }
    .wa-table tr:hover td:first-child {
      border-left: 2px solid var(--accent-primary, #e5a93b);
    }
    .wa-heatmap-row {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 12px;
    }
    .wa-heatmap-label {
      width: 120px;
      font-size: 0.85rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .wa-heatmap-cells {
      display: flex;
      flex-direction: row;
      gap: 4px;
      flex: 1;
      overflow-x: auto;
    }
    .wa-heatmap-cell {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      flex-shrink: 0;
      cursor: help;
      position: relative;
    }
    .wa-heatmap-cell.present {
      background: var(--accent-primary, #e5a93b);
      box-shadow: 0 0 6px var(--accent-primary, #e5a93b);
    }
    .wa-heatmap-cell.absent {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .wa-alert-card {
      background: rgba(229, 169, 59, 0.06);
      border: 1px solid rgba(229, 169, 59, 0.2);
      border-left: 4px solid var(--accent-primary, #e5a93b);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 12px;
      font-size: 0.82rem;
      line-height: 1.5;
    }
    .wa-alert-card.warning {
      background: rgba(244, 63, 94, 0.06);
      border-color: rgba(244, 63, 94, 0.2);
      border-left-color: #f43f5e;
    }
    .wa-progress-bar-wrap {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 14px;
    }
    .wa-progress-info {
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
    }
    .wa-progress-bg {
      height: 8px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 4px;
      overflow: hidden;
    }
    .wa-progress-fill {
      height: 100%;
      border-radius: 4px;
      width: 0;
      transition: width 0.7s cubic-bezier(0.25, 0.8, 0.25, 1);
    }
    @keyframes wa-shimmer {
      0%   { background-position: -400px 0; }
      100% { background-position: 400px 0; }
    }
    .wa-skeleton-bar {
      height: 14px;
      border-radius: 6px;
      background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 75%);
      background-size: 400px 100%;
      animation: wa-shimmer 1.4s ease-in-out infinite;
      margin-bottom: 12px;
    }
    .wa-skeleton-bar:nth-child(2) { width: 80%; animation-delay: 0.1s; }
    .wa-skeleton-bar:nth-child(3) { width: 65%; animation-delay: 0.2s; }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Data Calculations Helper
// ---------------------------------------------------------------------------

function getCharacterAppearances(characterId) {
  // Sort beats chronologically
  const sortedBeats = [...state.beats];
  const appearances = [];

  sortedBeats.forEach((beat, idx) => {
    // Check if linked on the roadmap properties
    const inRoadmap = Array.isArray(beat.properties?.characters) && beat.properties.characters.includes(characterId);

    // Check if referenced by canvas node
    const tab = state.tabs.find(t => t.beatId === beat.id);
    let inCanvas = false;
    if (tab) {
      const nodes = state.allNodes.filter(n => n.tabId === tab.id);
      inCanvas = nodes.some(n => 
        (n.type === 'pagelink' || n.type === 'statblock') && 
        n.content?.pageId === characterId
      );
    }

    if (inRoadmap || inCanvas) {
      appearances.push({ beat, index: idx });
    }
  });

  return appearances;
}

function calculateLongestAbsence(appearances) {
  if (appearances.length <= 1) return 0;
  let maxAbsence = 0;
  for (let i = 1; i < appearances.length; i++) {
    const gap = appearances[i].index - appearances[i - 1].index - 1;
    if (gap > maxAbsence) {
      maxAbsence = gap;
    }
  }
  return maxAbsence;
}

// ---------------------------------------------------------------------------
// Render Tabs
// ---------------------------------------------------------------------------

// 3g: Heatmap legend helper
function renderHeatmapLegend(container) {
  const legend = document.createElement('div');
  legend.style.cssText = 'display:flex; align-items:center; gap:14px; margin-bottom:14px; font-size:0.65rem; color:var(--text-muted);';
  legend.innerHTML = `
    <span style="display:flex;align-items:center;gap:5px;">
      <span style="width:12px;height:12px;border-radius:2px;background:var(--accent-primary,#e5a93b);box-shadow:0 0 5px var(--accent-primary,#e5a93b);display:inline-block;"></span>
      Present
    </span>
    <span style="display:flex;align-items:center;gap:5px;">
      <span style="width:12px;height:12px;border-radius:2px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);display:inline-block;"></span>
      Absent
    </span>
  `;
  container.appendChild(legend);
}

function renderCharacterPresence(panel) {
  panel.innerHTML = `
    <h3 class="wa-panel-title">👤 Character Presence Heatmap</h3>
    <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 20px;">
      Track where characters appear across the story. Bright blocks indicate appearances in chronological beats.
    </p>
    <div style="margin-bottom: 30px;" id="presence-heatmaps">
      <!-- Heatmaps render here -->
    </div>

    <h3 class="wa-panel-title" style="margin-top: 40px;">📊 Character Appearance Detail</h3>
    <table class="wa-table">
      <thead>
        <tr>
          <th>Character</th>
          <th>Role</th>
          <th>Presence %</th>
          <th>Total Apps</th>
          <th>Act I / II / III</th>
          <th>First Appearance</th>
          <th>Latest Appearance</th>
          <th>Longest Absence</th>
        </tr>
      </thead>
      <tbody id="presence-table-body">
        <!-- Table rows render here -->
      </tbody>
    </table>

    <div id="forgotten-warnings" style="margin-top: 32px;">
      <!-- Warnings render here -->
    </div>
  `;

  const heatmapsWrap = panel.querySelector('#presence-heatmaps');
  const tableBody = panel.querySelector('#presence-table-body');
  const warningsWrap = panel.querySelector('#forgotten-warnings');

  if (state.characters.length === 0) {
    heatmapsWrap.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem;">No characters found. Create entries in your Characters database first.</p>`;
    tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">No data available</td></tr>`;
    return;
  }

  // 3g: Heatmap legend
  renderHeatmapLegend(heatmapsWrap);

  const sortedBeats = state.beats;
  const warnings = [];

  state.characters.forEach(char => {
    const apps = getCharacterAppearances(char.id);
    const total = apps.length;
    const presencePct = sortedBeats.length > 0 ? ((total / sortedBeats.length) * 100).toFixed(1) : 0;
    
    // Count appearances per act
    let act1Count = 0;
    let act2Count = 0;
    let act3Count = 0;
    apps.forEach(a => {
      const act = a.beat.properties?.f1 || '';
      if (act === 'Act I') act1Count++;
      else if (act.startsWith('Act II')) act2Count++;
      else if (act === 'Act III') act3Count++;
    });

    const first = total > 0 ? apps[0].beat.title : '—';
    const latest = total > 0 ? apps[total - 1].beat.title : '—';
    const absence = calculateLongestAbsence(apps);

    // Heatmap Row
    const row = document.createElement('div');
    row.className = 'wa-heatmap-row';

    const label = document.createElement('div');
    label.className = 'wa-heatmap-label';
    label.textContent = char.title || 'Untitled';
    label.title = char.title || 'Untitled';
    row.appendChild(label);

    const cells = document.createElement('div');
    cells.className = 'wa-heatmap-cells';

    sortedBeats.forEach((beat, idx) => {
      const cell = document.createElement('div');
      const present = apps.some(a => a.beat.id === beat.id);
      cell.className = 'wa-heatmap-cell ' + (present ? 'present' : 'absent');
      cell.title = `${beat.title || 'Chapter'} (${present ? 'Present' : 'Absent'})`;
      cells.appendChild(cell);
    });

    row.appendChild(cells);
    heatmapsWrap.appendChild(row);

    // Table Row
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 600;">${char.title || 'Untitled'}</td>
      <td><span style="font-size: 0.75rem; background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px;">${char.properties?.f1 || 'NPC'}</span></td>
      <td style="font-family: var(--font-hud); font-weight: bold;">${presencePct}%</td>
      <td style="font-family: var(--font-hud); font-weight: bold;">${total}</td>
      <td style="font-family: var(--font-hud);">${act1Count} / ${act2Count} / ${act3Count}</td>
      <td>${first}</td>
      <td>${latest}</td>
      <td style="font-family: var(--font-hud);">${total > 0 ? `${absence} beats` : '—'}</td>
    `;
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => navigate(`page/${char.id}`));
    tableBody.appendChild(tr);

    // Warnings detection
    if (total === 0) {
      warnings.push({
        type: 'forgotten',
        text: `⚠️ <strong>${char.title || 'Untitled'}</strong> has 0 appearances registered. They are completely absent from the plot timeline.`,
      });
    } else if (absence >= 4) {
      warnings.push({
        type: 'absence',
        text: `ℹ️ <strong>${char.title || 'Untitled'}</strong> has a long absence gap of <strong>${absence} consecutive beats</strong> between appearances. Check if they were forgotten.`,
      });
    }
  });

  if (warnings.length > 0) {
    warningsWrap.innerHTML = `<h4 style="margin: 0 0 12px 0; font-size: 0.85rem; text-transform: uppercase; color: var(--accent-primary); font-family: var(--font-hud);">Presence Diagnostics</h4>`;
    warnings.forEach(w => {
      const card = document.createElement('div');
      card.className = 'wa-alert-card ' + (w.type === 'forgotten' ? 'warning' : '');
      card.innerHTML = w.text;
      warningsWrap.appendChild(card);
    });
  }
}

function renderPovBalance(panel) {
  // Calculations
  const povStats = {};
  let totalWordCount = 0;
  const sortedBeats = state.beats;

  sortedBeats.forEach((beat, idx) => {
    const primaryPov = beat.properties?.f4 || '';
    const secondaryPov = beat.properties?.f5 || '';
    const wordCount = parseInt(beat.properties?.f3) || 0;
    totalWordCount += wordCount;

    if (primaryPov) {
      if (!povStats[primaryPov]) {
        povStats[primaryPov] = { name: primaryPov, primaryChapters: 0, secondaryChapters: 0, words: 0, lastIdx: -1 };
      }
      povStats[primaryPov].primaryChapters += 1;
      povStats[primaryPov].words += wordCount;
      povStats[primaryPov].lastIdx = Math.max(povStats[primaryPov].lastIdx, idx);
    }

    if (secondaryPov) {
      if (!povStats[secondaryPov]) {
        povStats[secondaryPov] = { name: secondaryPov, primaryChapters: 0, secondaryChapters: 0, words: 0, lastIdx: -1 };
      }
      povStats[secondaryPov].secondaryChapters += 1;
      povStats[secondaryPov].lastIdx = Math.max(povStats[secondaryPov].lastIdx, idx);
    }
  });

  panel.innerHTML = `
    <h3 class="wa-panel-title">⚖️ POV Balance & Word Counts</h3>
    <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 24px;">
      Monitor the narrative balance across your perspective characters. Ensure POV shifts are paced naturally.
    </p>

    <div class="wa-grid-2">
      <div>
        <h4 style="margin:0 0 16px 0; font-size:0.85rem; color:var(--text-secondary); text-transform:uppercase; font-family:var(--font-hud);">POV Distribution</h4>
        <div id="pov-distribution-bars">
          <!-- Bars render here -->
        </div>
      </div>
      <div>
        <h4 style="margin:0 0 16px 0; font-size:0.85rem; color:var(--text-secondary); text-transform:uppercase; font-family:var(--font-hud);">POV Timeline Distribution</h4>
        <div id="pov-timeline-visualization" style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 20px;">
          <!-- Timeline row render here -->
        </div>
        <div id="pov-warnings">
          <!-- Warnings render here -->
        </div>
      </div>
    </div>
  `;

  const barsWrap = panel.querySelector('#pov-distribution-bars');
  const timelineWrap = panel.querySelector('#pov-timeline-visualization');
  const warningsWrap = panel.querySelector('#pov-warnings');

  const povEntries = Object.entries(povStats);

  if (povEntries.length === 0) {
    barsWrap.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem;">No POV data. Assign "Primary POV" in your Story beats schema to begin tracking.</p>`;
    timelineWrap.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem;">—</p>`;
    return;
  }

  // Neon Colors mapping for POVs
  const POV_COLORS = ['#3b82f6', '#a855f7', '#ec4899', '#06b6d4', '#10b981', '#f97316', '#e5a93b'];
  const povColorMap = {};
  povEntries.forEach(([name], idx) => {
    povColorMap[name] = POV_COLORS[idx % POV_COLORS.length];
  });

  // Render Bars
  povEntries.sort((a,b) => b[1].words - a[1].words).forEach(([name, stat]) => {
    const pct = totalWordCount > 0 ? ((stat.words / totalWordCount) * 100).toFixed(1) : 0;
    const color = povColorMap[name];

  // 3c: Animated bar fill — set width to 0 first, animate after paint
  const bar = document.createElement('div');
  bar.className = 'wa-progress-bar-wrap';
  const targetPct = pct;
  bar.innerHTML = `
    <div class="wa-progress-info">
      <span style="font-weight:600;">${name}</span>
      <span style="color:var(--text-muted); font-family:var(--font-hud);">
        Primary: ${stat.primaryChapters} ch | Secondary: ${stat.secondaryChapters} ch | ${stat.words.toLocaleString()} words (${pct}%)
      </span>
    </div>
    <div class="wa-progress-bg">
      <div class="wa-progress-fill" data-target-width="${targetPct}" style="background: ${color}; box-shadow: 0 0 6px ${color};"></div>
    </div>
  `;
  barsWrap.appendChild(bar);
  });

  // 3c: Trigger bar fill animations
  requestAnimationFrame(() => {
    barsWrap.querySelectorAll('.wa-progress-fill[data-target-width]').forEach(fill => {
      fill.style.width = fill.dataset.targetWidth + '%';
    });
  });

  // Render Timeline Blocks
  sortedBeats.forEach((beat, idx) => {
    const primaryPov = beat.properties?.f4 || '';
    const color = primaryPov ? povColorMap[primaryPov] : 'rgba(255,255,255,0.05)';
    const border = primaryPov ? 'none' : '1px solid rgba(255,255,255,0.08)';

    const block = document.createElement('div');
    block.style.cssText = `width: 22px; height: 22px; border-radius: 4px; background: ${color}; border: ${border}; flex-shrink: 0; cursor: help;`;
    block.title = `${beat.title || 'Chapter'}\nPOV: ${primaryPov || 'None'}`;
    timelineWrap.appendChild(block);
  });

  // Warnings
  const warnings = [];
  povEntries.forEach(([name, stat]) => {
    const chaptersGap = sortedBeats.length - stat.lastIdx - 1;
    const wordPct = totalWordCount > 0 ? (stat.words / totalWordCount) : 0;

    if (chaptersGap >= 5 && stat.lastIdx !== -1) {
      warnings.push({
        type: 'warning',
        text: `⚠️ POV Gap: <strong>${name}</strong> has not had a POV chapter for <strong>${chaptersGap} chapters</strong>. Check if their storyline has stalled.`,
      });
    }

    if (wordPct >= 0.50) {
      warnings.push({
        type: 'imbalance',
        text: `🔴 POV Imbalance: <strong>${name}</strong> controls <strong>${(wordPct * 100).toFixed(1)}%</strong> of the story word count. Consider giving supporting characters more page-time.`,
      });
    }
  });

  if (warnings.length > 0) {
    warningsWrap.innerHTML = `<h4 style="margin: 20px 0 12px 0; font-size: 0.85rem; text-transform: uppercase; color: var(--accent-primary); font-family: var(--font-hud);">POV Warnings</h4>`;
    warnings.forEach(w => {
      const card = document.createElement('div');
      card.className = 'wa-alert-card ' + (w.type === 'imbalance' ? 'warning' : '');
      card.innerHTML = w.text;
      warningsWrap.appendChild(card);
    });
  }
}

function renderScenePurposes(panel) {
  const purposeCounts = {};
  let totalPurposesCount = 0;
  const sortedBeats = state.beats;
  const actStats = {};

  sortedBeats.forEach(beat => {
    const purposesStr = beat.properties?.f6 || '';
    const purposes = purposesStr.split(',').map(p => p.trim()).filter(Boolean);
    const act = beat.properties?.f1 || 'Act I';

    if (!actStats[act]) {
      actStats[act] = { totalScenes: 0, purposes: {} };
    }
    actStats[act].totalScenes += 1;

    purposes.forEach(p => {
      purposeCounts[p] = (purposeCounts[p] || 0) + 1;
      totalPurposesCount += 1;

      actStats[act].purposes[p] = (actStats[act].purposes[p] || 0) + 1;
    });
  });

  panel.innerHTML = `
    <h3 class="wa-panel-title">🎯 Scene Purpose Analyzer</h3>
    <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 24px;">
      Analyze what each scene contributes structurally. Good pacing blends action, worldbuilding, and conflict.
    </p>

    <div class="wa-grid-2">
      <div>
        <h4 style="margin:0 0 16px 0; font-size:0.85rem; color:var(--text-secondary); text-transform:uppercase; font-family:var(--font-hud);">Global Purpose Distribution</h4>
        <div id="purpose-global-bars">
          <!-- Global Bars render here -->
        </div>
      </div>
      <div>
        <h4 style="margin:0 0 16px 0; font-size:0.85rem; color:var(--text-secondary); text-transform:uppercase; font-family:var(--font-hud);">Pacing & Structural Feedback</h4>
        <div id="purpose-advice-cards">
          <!-- Advice Cards render here -->
        </div>
      </div>
    </div>
  `;

  const globalBars = panel.querySelector('#purpose-global-bars');
  const adviceCards = panel.querySelector('#purpose-advice-cards');

  if (totalPurposesCount === 0) {
    globalBars.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem;">No scene purposes tagged. Add tags in the "Scene Purposes" field of your Story beats to track.</p>`;
    adviceCards.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem;">—</p>`;
    return;
  }

  // 3d: Per-purpose colour map
  const PURPOSE_COLORS = {
    'Action':           '#f43f5e',
    'Romance':          '#ec4899',
    'Mystery':          '#a855f7',
    'Worldbuilding':    '#3b82f6',
    'Comedy':           '#f59e0b',
    'Tension':          '#e5a93b',
    'Conflict':         '#f97316',
    'Character Development': '#10b981',
    'Plot Advancement': '#06b6d4',
    'Exposition':       '#64748b',
    'Resolution':       '#10b981',
  };
  const getPurposeColor = (name) => PURPOSE_COLORS[name] || '#06b6d4';

  // Render Global Bars
  const barEls = [];
  Object.entries(purposeCounts).sort((a,b) => b[1] - a[1]).forEach(([name, count]) => {
    const pct = totalPurposesCount > 0 ? ((count / totalPurposesCount) * 100).toFixed(1) : 0;
    const color = getPurposeColor(name);
    const bar = document.createElement('div');
    bar.className = 'wa-progress-bar-wrap';
    bar.innerHTML = `
      <div class="wa-progress-info">
        <span style="font-weight:600;">${name}</span>
        <span style="color:var(--text-muted); font-family:var(--font-hud);">${count} beats (${pct}%)</span>
      </div>
      <div class="wa-progress-bg">
        <div class="wa-progress-fill" data-target-width="${pct}" style="background: ${color}; box-shadow: 0 0 6px ${color};"></div>
      </div>
    `;
    globalBars.appendChild(bar);
    barEls.push(bar);
  });

  // 3c: Trigger bar fill animations
  requestAnimationFrame(() => {
    globalBars.querySelectorAll('.wa-progress-fill[data-target-width]').forEach(fill => {
      fill.style.width = fill.dataset.targetWidth + '%';
    });
  });

  // Act Breakdown Section
  const actBreakdownWrap = document.createElement('div');
  actBreakdownWrap.style.marginTop = '40px';
  panel.appendChild(actBreakdownWrap);

  // 3e: Act breakdown with upgraded cards
  const ACT_STYLES = {
    'Act I':           { color: '#e5a93b', icon: 'I' },
    'Act II - Ascent': { color: '#a855f7', icon: 'IIa' },
    'Act II - Descent':{ color: '#a855f7', icon: 'IIb' },
    'Act III':         { color: '#10b981', icon: 'III' },
  };

  actBreakdownWrap.innerHTML = `
    <h4 style="margin: 0 0 16px 0; font-size: 0.85rem; text-transform: uppercase; color: var(--text-secondary); font-family: var(--font-hud);">Act Breakdown</h4>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px;">
      ${['Act I', 'Act II - Ascent', 'Act II - Descent', 'Act III'].map(act => {
        const stats = actStats[act] || { totalScenes: 0, purposes: {} };
        const total = stats.totalScenes;
        const as = ACT_STYLES[act] || { color: '#e5a93b', icon: '?' };
        return `
          <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-left: 3px solid ${as.color}; border-radius: 8px; padding: 16px; box-shadow: 0 0 14px ${as.color}10;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
              <h5 style="margin: 0; font-size: 0.85rem; color: #ffffff;">${act}</h5>
              <span style="font-size:0.65rem; background:${as.color}18; color:${as.color}; border:1px solid ${as.color}35; border-radius:8px; padding:2px 8px; font-family:var(--font-hud); font-weight:700;">${total} scenes</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${Object.keys(stats.purposes).length === 0 ? '<div style="color:var(--text-muted); font-size:0.8rem;">No scenes tagged</div>' : 
                Object.entries(stats.purposes).sort((a,b) => b[1] - a[1]).map(([purp, cnt]) => {
                  const pct = total > 0 ? ((cnt / total) * 100).toFixed(0) : 0;
                  return `
                    <div style="display: flex; justify-content: space-between; font-size: 0.78rem;">
                      <span style="color: var(--text-secondary);">${purp}</span>
                      <span style="color: #ffffff; font-family: var(--font-hud); font-weight: bold;">${cnt} (${pct}%)</span>
                    </div>
                  `;
                }).join('')
              }
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Calculate advice
  const advice = [];

  // Check Act II Plot Advancement vs Worldbuilding
  const act2Keys = Object.keys(actStats).filter(k => k.startsWith('Act II'));
  let act2Scenes = 0;
  let act2PlotAdv = 0;
  let act2Worldbuilding = 0;

  act2Keys.forEach(key => {
    const stat = actStats[key];
    act2Scenes += stat.totalScenes;
    act2PlotAdv += stat.purposes['Plot Advancement'] || 0;
    act2Worldbuilding += stat.purposes['Worldbuilding'] || 0;
  });

  if (act2Scenes > 0) {
    const plotPct = act2PlotAdv / act2Scenes;
    if (plotPct < 0.25) {
      advice.push({
        type: 'warning',
        text: `🔴 Act II warning: Less than 25% of Act II scenes contribute to <strong>Plot Advancement</strong>. The narrative pacing might drag. Try consolidating exposition beats.`,
      });
    }
  }

  // Check Act III Worldbuilding
  const act3Stat = actStats['Act III'];
  if (act3Stat && act3Stat.totalScenes > 0) {
    const wbPct = (act3Stat.purposes['Worldbuilding'] || 0) / act3Stat.totalScenes;
    if (wbPct > 0.40) {
      advice.push({
        type: 'warning',
        text: `🔴 Climax warning: Over 40% of scenes in Act III focus on <strong>Worldbuilding</strong>. Watch out for infodumps during the climax. Keep the focus on resolution.`,
      });
    }
  }

  // Untagged chapters
  sortedBeats.forEach(beat => {
    const purposesStr = beat.properties?.f6 || '';
    if (!purposesStr.trim()) {
      advice.push({
        type: 'info',
        text: `ℹ️ Chapter <strong>"${beat.title || 'Untitled'}"</strong> has no scene purposes defined. Tagging it helps balance the story's structural pacing.`,
      });
    }
  });

  if (advice.length === 0) {
    adviceCards.innerHTML = `
      <div class="wa-alert-card" style="background: rgba(16, 185, 129, 0.06); border-color: rgba(16, 185, 129, 0.2); border-left-color: #10b981;">
        ✅ Story structure looks solid! Your scenes are balanced nicely across all major structural pacing goals.
      </div>
    `;
  } else {
    advice.forEach(ad => {
      const card = document.createElement('div');
      card.className = 'wa-alert-card ' + (ad.type === 'warning' ? 'warning' : '');
      card.innerHTML = ad.text;
      adviceCards.appendChild(card);
    });
  }
}

function renderForeshadowing(panel) {
  const setupNodes = state.allNodes.filter(n => n.type === 'setup');
  const payoffNodes = state.allNodes.filter(n => n.type === 'payoff');

  // Find beat position map
  const beatIndexMap = new Map();
  state.beats.forEach((b, idx) => beatIndexMap.set(b.id, idx));

  // Find tab to beat map
  const tabBeatMap = new Map();
  state.tabs.forEach(t => { if (t.beatId) tabBeatMap.set(t.id, t.beatId); });

  // Connections map
  const nodeConnections = new Map();
  state.tabs.forEach(t => {
    const conns = t.connections || [];
    conns.forEach(c => {
      if (!nodeConnections.has(c.sourceId)) nodeConnections.set(c.sourceId, []);
      if (!nodeConnections.has(c.targetId)) nodeConnections.set(c.targetId, []);
      nodeConnections.get(c.sourceId).push(c.targetId);
      nodeConnections.get(c.targetId).push(c.sourceId);
    });
  });

  let resolvedSetups = 0;
  let totalDistance = 0;
  const setupList = [];

  setupNodes.forEach(setup => {
    // Resolve payoff node
    let resolvedPayoffId = setup.content?.payoffNodeId || '';

    // If no explicit ID, check connections
    if (!resolvedPayoffId) {
      const connectedNodeIds = nodeConnections.get(setup.id) || [];
      const connectedPayoff = payoffNodes.find(p => connectedNodeIds.includes(p.id));
      if (connectedPayoff) {
        resolvedPayoffId = connectedPayoff.id;
      }
    }

    const payoff = payoffNodes.find(p => p.id === resolvedPayoffId);
    const isResolved = !!payoff;

    let distance = '—';
    if (isResolved) {
      resolvedSetups++;
      // Calculate beat indexes
      const setupBeatId = tabBeatMap.get(setup.tabId);
      const payoffBeatId = tabBeatMap.get(payoff.tabId);
      if (setupBeatId && payoffBeatId) {
        const setupIdx = beatIndexMap.get(setupBeatId);
        const payoffIdx = beatIndexMap.get(payoffBeatId);
        if (setupIdx !== undefined && payoffIdx !== undefined) {
          distance = payoffIdx - setupIdx;
          totalDistance += distance;
        }
      }
    }

    setupList.push({
      setup,
      payoff,
      isResolved,
      distance
    });
  });

  const avgDistance = resolvedSetups > 0 ? (totalDistance / resolvedSetups).toFixed(1) : '—';

  panel.innerHTML = `
    <h3 class="wa-panel-title">🔍 Foreshadowing & Setups</h3>
    <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 24px;">
      Track narrative questions (setups, clues, secrets) and check if they are paid off before the story ends.
    </p>

    <div style="display:flex; flex-direction:row; gap:16px; margin-bottom:28px; flex-wrap:wrap;" id="wa-stat-tiles">
      <div style="background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.2); border-left:3px solid #3b82f6; padding:16px 24px; border-radius:8px; text-align:center; min-width:120px; flex:1;">
        <div class="wa-count-up" data-target="${setupNodes.length}" style="font-size:1.8rem; font-weight:700; color:#3b82f6; font-family:var(--font-hud);">0</div>
        <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; margin-top:4px;">Total Setups</div>
      </div>
      <div style="background:rgba(16,185,129,0.06); border:1px solid rgba(16,185,129,0.2); border-left:3px solid #10b981; padding:16px 24px; border-radius:8px; text-align:center; min-width:120px; flex:1;">
        <div class="wa-count-up" data-target="${resolvedSetups}" style="font-size:1.8rem; font-weight:700; color:#10b981; font-family:var(--font-hud);">0</div>
        <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; margin-top:4px;">Resolved</div>
      </div>
      <div style="background:rgba(244,63,94,0.06); border:1px solid rgba(244,63,94,0.2); border-left:3px solid #f43f5e; padding:16px 24px; border-radius:8px; text-align:center; min-width:120px; flex:1;">
        <div class="wa-count-up" data-target="${setupNodes.length - resolvedSetups}" style="font-size:1.8rem; font-weight:700; color:#f43f5e; font-family:var(--font-hud);">0</div>
        <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; margin-top:4px;">Unresolved</div>
      </div>
      <div style="background:rgba(168,85,247,0.06); border:1px solid rgba(168,85,247,0.2); border-left:3px solid #a855f7; padding:16px 24px; border-radius:8px; text-align:center; min-width:120px; flex:1;">
        <div style="font-size:1.8rem; font-weight:700; color:#a855f7; font-family:var(--font-hud);">${avgDistance} <span style="font-size:0.9rem;">beats</span></div>
        <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; margin-top:4px;">Avg Setup Gap</div>
      </div>
    </div>

    <h3 class="wa-panel-title" style="margin-top: 32px;">📋 Setup & Payoff Index</h3>
    <table class="wa-table">
      <thead>
        <tr>
          <th>Setup Node</th>
          <th>Type</th>
          <th>Host Beat</th>
          <th>Resolution / Payoff</th>
          <th>Status</th>
          <th>Gap Distance</th>
        </tr>
      </thead>
      <tbody id="foreshadowing-table-body">
        <!-- Rows render here -->
      </tbody>
    </table>

    <div id="foreshadowing-diagnostics" style="margin-top: 32px;">
      <!-- Warnings render here -->
    </div>
  `;

  const tbody = panel.querySelector('#foreshadowing-table-body');
  const diagnosticsWrap = panel.querySelector('#foreshadowing-diagnostics');

  // 3b: Count-up animation for stat tiles
  requestAnimationFrame(() => {
    const tiles = panel.querySelectorAll('.wa-count-up[data-target]');
    tiles.forEach(tile => {
      const target = parseInt(tile.dataset.target) || 0;
      if (target === 0) { tile.textContent = '0'; return; }
      const duration = 600;
      const start = performance.now();
      const step = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        tile.textContent = Math.round(eased * target);
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  });

  if (setupList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No setups or payoffs created. Add "Setup Node" or "Payoff Node" spawner cards onto your canvas workspaces.</td></tr>`;
    diagnosticsWrap.innerHTML = '';
    return;
  }

  const foreshadowingWarnings = [];

  setupList.forEach(item => {
    const sNode = item.setup;
    const isRes = item.isResolved;

    const setupBeatId = tabBeatMap.get(sNode.tabId);
    const setupBeat = state.beats.find(b => b.id === setupBeatId);
    const setupBeatName = setupBeat ? setupBeat.title : 'Unlinked Canvas';

    const statusPill = isRes
      ? `<span style="font-size: 0.72rem; padding: 2px 8px; border-radius: 12px; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); color: #10b981; font-family: var(--font-hud);">Resolved</span>`
      : `<span style="font-size: 0.72rem; padding: 2px 8px; border-radius: 12px; background: rgba(244, 63, 94, 0.08); border: 1px solid rgba(244, 63, 94, 0.2); color: #f43f5e; font-family: var(--font-hud);">Unresolved</span>`;

    const gapText = item.distance === '—'
      ? '—'
      : item.distance === 0
        ? 'Same Beat'
        : item.distance < 0
          ? `<span style="color:#f43f5e;">Prequel (${item.distance} beats)</span>`
          : `${item.distance} beats`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${sNode.title || 'Setup Node'}</td>
      <td><span style="font-size:0.75rem; background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px;">${sNode.content?.setupType || 'Plant'}</span></td>
      <td>${setupBeatName}</td>
      <td style="font-style:${isRes ? 'normal' : 'italic'}; color:${isRes ? 'var(--text-secondary)' : 'var(--text-muted)'}; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${isRes ? (item.payoff.title || 'Payoff Node') : 'None'}
      </td>
      <td>${statusPill}</td>
      <td style="font-family: var(--font-hud); font-weight:bold;">${gapText}</td>
    `;

    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => navigate(`workspace/${sNode.tabId}`));
    tbody.appendChild(tr);

    // Collect warnings
    if (!isRes) {
      foreshadowingWarnings.push({
        type: 'missing',
        text: `⚠️ Missing Payoff: Setup <strong>"${sNode.title || 'Setup Node'}"</strong> (type: ${sNode.content?.setupType || 'Plant'}) in beat <strong>"${setupBeatName}"</strong> has no linked payoff node.`
      });
    } else if (typeof item.distance === 'number' && item.distance > 5) {
      foreshadowingWarnings.push({
        type: 'late',
        text: `ℹ️ Late Payoff: Setup <strong>"${sNode.title || 'Setup Node'}"</strong> has a payoff delay of <strong>${item.distance} chapters</strong>. Consider placing a reminder clue closer to the payoff.`
      });
    }
  });

  if (foreshadowingWarnings.length > 0) {
    diagnosticsWrap.innerHTML = `<h4 style="margin: 0 0 12px 0; font-size: 0.85rem; text-transform: uppercase; color: var(--accent-primary); font-family: var(--font-hud);">Foreshadowing Diagnostics</h4>`;
    foreshadowingWarnings.forEach(w => {
      const card = document.createElement('div');
      card.className = 'wa-alert-card ' + (w.type === 'missing' ? 'warning' : '');
      card.innerHTML = w.text;
      diagnosticsWrap.appendChild(card);
    });
  } else {
    diagnosticsWrap.innerHTML = `
      <div class="wa-alert-card" style="background: rgba(16, 185, 129, 0.06); border-color: rgba(16, 185, 129, 0.2); border-left-color: #10b981;">
        ✅ All setups have timely resolution payoffs! No late or missing payoffs detected.
      </div>
    `;
  }
}

// ---------------------------------------------------------------------------
// Main Render Router
// ---------------------------------------------------------------------------

export async function renderWriterAnalytics(container) {
  // Inject Custom styling
  injectStyles();

  // Reset State
  state.project = await getActiveProject();
  if (!state.project) {
    container.innerHTML = `<div class="empty-state"><p>Please open or create a project first.</p></div>`;
    return;
  }

  // Load project datasets
  const allPages = await getPages(state.project.id);
  state.pages = allPages;
  state.beats = allPages.filter(p => p.isStoryBeat === true || p.schemaId === 'story-chapters-schema').sort((a,b) => (a.properties?.x || 0) - (b.properties?.x || 0));
  state.characters = await getPagesBySchema('story-chars-schema');
  state.tabs = await getAllTabs();
  state.allNodes = await getAllNodes();

  container.innerHTML = `
    <div class="wa-root">
      
      <!-- Header -->
      <div class="wa-header">
        <div class="wa-title-block">
          <h1 class="wa-title">📚 Story Analytics</h1>
          <p class="wa-subtitle">Compute pacing, POV balancing, setups, and character presence details</p>
        </div>
      </div>

      <!-- Tab Pickers -->
      <div class="wa-tabs">
        <button class="wa-tab" data-tab="presence">PRESENCE</button>
        <button class="wa-tab" data-tab="pov">POV</button>
        <button class="wa-tab" data-tab="purposes">SCENES</button>
        <button class="wa-tab" data-tab="foreshadowing">SETUPS</button>
      </div>

      <!-- Content Area -->
      <div class="wa-content">
        <div class="wa-panel" id="wa-active-panel">
          <!-- Populated by tab renders -->
        </div>
      </div>

    </div>
  `;

  // Bind active tabs switcher
  const tabs = container.querySelectorAll('.wa-tab');
  const panel = container.querySelector('#wa-active-panel');

  const switchTab = (tabName) => {
    state.activeTab = tabName;
    tabs.forEach(btn => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 3a: Show skeleton while loading
    panel.innerHTML = `
      <div class="wa-skeleton-bar" style="width:60%;"></div>
      <div class="wa-skeleton-bar"></div>
      <div class="wa-skeleton-bar"></div>
    `;

    // Defer real render one microtask so skeleton paints first
    requestAnimationFrame(() => {
      panel.innerHTML = '';
      if (tabName === 'presence')      renderCharacterPresence(panel);
      if (tabName === 'pov')           renderPovBalance(panel);
      if (tabName === 'purposes')      renderScenePurposes(panel);
      if (tabName === 'foreshadowing') renderForeshadowing(panel);
    });
  };

  tabs.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Default tab load
  switchTab(state.activeTab);
}

/* ============================================================
   Forge Mobile — Writer Analytics
   Visual stats, word counts, streaks, and progress trackers.
   ============================================================ */

import { getActiveProject, getPages, getSchemas } from '../db.js';

let _project = null;
let _pages = [];
let _schemas = [];

export async function renderMobileAnalytics(container) {
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
  _schemas = await getSchemas(_project.id).catch(() => []);

  _render(container);
}

function _render(container) {
  // Calculations
  const totalPages = _pages.length;
  
  let totalWords = 0;
  let wordsToday = 0;
  
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  _pages.forEach(p => {
    const wc = _countWords(p.content);
    totalWords += wc;
    
    const updatedTime = typeof p.updatedAt === 'number' ? p.updatedAt : new Date(p.updatedAt).getTime();
    if (!Number.isNaN(updatedTime) && updatedTime >= startOfToday) {
      wordsToday += wc;
    }
  });

  // Calculate project composition
  const storyBeatsCount = _pages.filter(p => p.isStoryBeat === true || p.schemaId === 'story-chapters-schema').length;
  const databasesCount = _schemas.length;
  
  // Categorize pages by schema
  const schemaComposition = _schemas.map(s => {
    const count = _pages.filter(p => p.schemaId === s.id).length;
    return { name: s.name, count, color: _schemaColor(s.id) };
  }).filter(c => c.count > 0);

  // Standalone pages
  const standaloneCount = _pages.filter(p => !p.schemaId && !p.isStoryBeat).length;
  if (standaloneCount > 0) {
    schemaComposition.push({ name: 'Manuscript Notes', count: standaloneCount, color: '#94a3b8' });
  }
  if (storyBeatsCount > 0) {
    schemaComposition.push({ name: 'Story Beats', count: storyBeatsCount, color: '#f59e0b' });
  }

  const totalCompCount = schemaComposition.reduce((sum, c) => sum + c.count, 0);

  // Mocks/Defaults for Streaks
  const dailyGoal = 500;
  const goalProgress = Math.min(100, Math.round((wordsToday / dailyGoal) * 100));
  const streakDays = totalWords > 2000 ? 5 : (totalWords > 0 ? 1 : 0);

  container.innerHTML = `
    <div class="m-page" id="m-analytics-root" style="padding-bottom:100px">
      <!-- Header -->
      <div class="m-header">
        <div class="m-header-title">Writer Analytics</div>
      </div>

      <!-- Quick Stats Row -->
      <div class="m-stats-row" style="padding:16px 16px 8px;overflow-x:auto;display:flex;gap:8px">
        <div class="m-stat-chip" style="flex:1;min-width:100px;text-align:center;padding:12px 10px">
          <div class="m-stat-chip-value" style="font-size:1.35rem">${totalWords.toLocaleString()}</div>
          <div class="m-stat-chip-label">Total Words</div>
        </div>
        <div class="m-stat-chip" style="flex:1;min-width:90px;text-align:center;padding:12px 10px">
          <div class="m-stat-chip-value" style="font-size:1.35rem;background:linear-gradient(135deg,#fff 40%,#38bdf8 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent">${totalPages}</div>
          <div class="m-stat-chip-label">Total Pages</div>
        </div>
        <div class="m-stat-chip" style="flex:1;min-width:80px;text-align:center;padding:12px 10px">
          <div class="m-stat-chip-value" style="font-size:1.35rem;background:linear-gradient(135deg,#fff 40%,#a78bfa 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent">${streakDays}d</div>
          <div class="m-stat-chip-label">Streak</div>
        </div>
      </div>

      <!-- Daily Target Tracker -->
      <div class="m-section" style="padding-top:10px">
        <div class="m-section-label">Daily Progress</div>
        <div class="m-card" style="padding:20px 16px">
          <div style="display:flex;justify-content:between;align-items:center;margin-bottom:8px">
            <span style="font-size:0.88rem;font-weight:700;color:var(--text-primary)">Word Count Goal</span>
            <span style="font-size:0.8rem;font-weight:700;color:var(--accent-primary)">${wordsToday} / ${dailyGoal} words</span>
          </div>
          <!-- Progress Track -->
          <div style="height:8px;background:rgba(255,255,255,0.04);border:1px solid var(--glass-border);border-radius:4px;overflow:hidden;position:relative">
            <div style="width:${goalProgress}%;height:100%;background:linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%);border-radius:4px;box-shadow:0 0 10px rgba(245,158,11,0.4);transition:width 0.4s ease"></div>
          </div>
          <div style="font-size:0.72rem;color:var(--text-muted);margin-top:8px">
            ${goalProgress >= 100 ? '🎉 Daily goal completed! Keep it up!' : `Write ${dailyGoal - wordsToday} more words to complete today's target.`}
          </div>
        </div>
      </div>

      <!-- Project Composition -->
      <div class="m-section" style="padding-top:10px">
        <div class="m-section-label">Project Composition</div>
        <div class="m-card" style="padding:16px">
          <div style="font-size:0.85rem;font-weight:700;color:var(--text-primary);margin-bottom:12px">Distribution by Schema</div>
          
          ${totalCompCount === 0 ? `
            <div style="font-size:0.75rem;color:var(--text-muted);text-align:center;padding:12px 0">No content schemas yet.</div>
          ` : `
            <!-- Stacked bar chart -->
            <div style="height:12px;display:flex;border-radius:6px;overflow:hidden;background:rgba(255,255,255,0.04);border:1px solid var(--glass-border)">
              ${schemaComposition.map(c => {
                const pct = ((c.count / totalCompCount) * 100).toFixed(1);
                return `<div style="width:${pct}%;background:${c.color};height:100%" title="${c.name}: ${c.count} (${pct}%)"></div>`;
              }).join('')}
            </div>

            <!-- Legend Grid -->
            <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
              ${schemaComposition.map(c => {
                const pct = ((c.count / totalCompCount) * 100).toFixed(1);
                return `
                  <div style="display:flex;align-items:center;gap:6px">
                    <span style="width:8px;height:8px;border-radius:50%;background:${c.color};flex-shrink:0"></span>
                    <span style="font-size:0.75rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1">${c.name}</span>
                    <span style="font-size:0.72rem;color:var(--text-muted);font-weight:700">${pct}%</span>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

function _countWords(html) {
  if (!html) return 0;
  const txt = html.replace(/<[^>]*>/g, ' ');
  const words = txt.trim().split(/\s+/).filter(w => w.length > 0);
  return words.length;
}

const _SCHEMA_COLORS = ['#f59e0b', '#38bdf8', '#fb7185', '#a78bfa', '#34d399', '#2dd4bf'];
function _schemaColor(id) {
  let sum = 0;
  const schemaId = id || '';
  for (let c = 0; c < schemaId.length; c++) sum += schemaId.charCodeAt(c);
  return _SCHEMA_COLORS[sum % _SCHEMA_COLORS.length];
}

function _esc(str) {
  return String(str).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

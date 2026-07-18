/* ============================================================
   Forge Mobile — Story Timeline
   Simplified, vertical chronological view of story beats.
   ============================================================ */

import { getActiveProject, getPages, savePage, generateId } from '../db.js';
import { navigate } from '../router.js';

let _project = null;
let _beats = [];

const LANES = [
  { id: 0, name: 'Main Plotline',            color: '#f43f5e', icon: '⚔️' },
  { id: 1, name: 'Subplots & Side Quests',   color: '#10b981', icon: '🌿' },
  { id: 2, name: 'World Events & Backstory', color: '#3b82f6', icon: '🌍' }
];

const ACTS = [
  { id: 'act1', name: 'Act I',     desc: 'The Hook & Inciting Incident',       xMin: 0,    xMax: 700  },
  { id: 'act2', name: 'Act II',    desc: 'Rising Action & Midpoint Focus',     xMin: 700,  xMax: 1400 },
  { id: 'act3', name: 'Act III',   desc: 'Climax & Final Confrontation',       xMin: 1400, xMax: 2100 },
  { id: 'epi',  name: 'Epilogue',  desc: 'Resolution & Aftermath',             xMin: 2100, xMax: 99999 }
];

export async function renderMobileTimeline(container) {
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

  await _loadData();
  _renderView(container);
}

async function _loadData() {
  const pages = await getPages(_project.id).catch(() => []);
  // Filter pages that are story beats or belong to the chapters schema
  _beats = pages.filter(p => p.isStoryBeat === true || p.schemaId === 'story-chapters-schema');
  // Sort by x coordinate (chronological order)
  _beats.sort((a, b) => {
    const ax = a.properties?.x ?? 0;
    const bx = b.properties?.x ?? 0;
    return ax - bx;
  });
}

function _renderView(container) {
  const searchVal = container.querySelector('#m-timeline-search')?.value || '';
  const filteredBeats = _beats.filter(b => 
    (b.title || 'Untitled').toLowerCase().includes(searchVal.toLowerCase()) ||
    (b.description || '').toLowerCase().includes(searchVal.toLowerCase())
  );

  // Group beats into Acts
  const actGroups = ACTS.map(act => {
    const beatsInAct = filteredBeats.filter(b => {
      const x = b.properties?.x ?? 0;
      return x >= act.xMin && x < act.xMax;
    });
    return { ...act, beats: beatsInAct };
  });

  container.innerHTML = `
    <div class="m-page" id="m-timeline-root" style="padding-bottom:100px">
      <!-- Header -->
      <div class="m-header">
        <div class="m-header-title">Story Timeline</div>
      </div>

      <!-- Search -->
      <input type="text" id="m-timeline-search" class="m-search" placeholder="Search story beats..." value="${_esc(searchVal)}" />

      <!-- Timeline List -->
      <div style="padding:10px 16px 24px">
        ${actGroups.every(g => g.beats.length === 0) ? `
          <div class="m-empty">
            <div class="m-empty-icon">📖</div>
            <div class="m-empty-title">No story beats found</div>
            <div class="m-empty-sub">Tap "+" below to add a new story beat.</div>
          </div>
        ` : actGroups.map(act => {
          if (act.beats.length === 0) return ''; // Hide empty acts
          return `
            <div class="m-timeline-act-section" style="margin-top:20px">
              <div style="display:flex;flex-direction:column;margin-bottom:10px;padding-left:4px">
                <div style="font-size:0.75rem;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--accent-primary)">${act.name}</div>
                <div style="font-size:0.7rem;color:var(--text-muted);margin-top:1px">${act.desc}</div>
              </div>
              <div class="m-timeline-beats-list" style="position:relative;border-left:1px dashed var(--glass-border);margin-left:10px;padding-left:14px">
                ${act.beats.map(b => {
                  const laneId = b.properties?.lane ?? 0;
                  const lane = LANES.find(l => l.id === laneId) || LANES[0];
                  const desc = b.description || 'No description provided.';
                  return `
                    <div class="m-list-item m-timeline-beat-card" data-beat-id="${b.id}" style="border-left:3px solid ${lane.color};margin-bottom:12px;display:block">
                      <div style="display:flex;align-items:center;justify-content:between;gap:8px">
                        <span style="font-size:0.9rem;font-weight:700;color:var(--text-primary);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(b.title || 'Untitled')}</span>
                        <span style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.04em;background:${lane.color}18;color:${lane.color};padding:2px 6px;border-radius:8px;font-weight:700;border:1px solid ${lane.color}30;flex-shrink:0">
                          ${lane.icon} ${lane.name}
                        </span>
                      </div>
                      <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:6px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${_esc(desc)}</div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Add Beat FAB -->
    <button class="m-fab" id="m-timeline-fab" title="Add Beat">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
  `;

  // Wire events
  container.querySelector('#m-timeline-search')?.addEventListener('input', () => {
    _renderView(container);
  });

  container.querySelectorAll('.m-timeline-beat-card').forEach(card => {
    card.addEventListener('click', () => {
      navigate(`page/${card.dataset.beatId}`);
    });
  });

  container.querySelector('#m-timeline-fab')?.addEventListener('click', async () => {
    await _addBeat();
    await _loadData();
    _renderView(container);
  });
}

async function _addBeat() {
  if (navigator.vibrate) navigator.vibrate(12);

  // Find max x coordinate to place the new beat at the end
  const maxX = _beats.reduce((max, b) => Math.max(max, b.properties?.x ?? 0), 0);
  const nextX = maxX > 0 ? maxX + 100 : 80;

  const beatId = generateId();
  const defaultStoryProps = {
    synopsis: '',
    notes: '',
    timeSetting: '',
    pov: '',
    dramaticQuestion: '',
    outcome: '',
    sensoryDetails: []
  };

  const newBeat = {
    id: beatId,
    projectId: _project.id,
    title: 'New Story Beat',
    content: '',
    description: 'Describe this story beat...',
    isStoryBeat: true,
    schemaId: _project.settings?.style === 'story' ? 'story-chapters-schema' : undefined,
    properties: {
      lane: 0,
      x: nextX,
      prerequisites: [],
      characters: [],
      ...defaultStoryProps
    },
    updatedAt: Date.now()
  };

  await savePage(newBeat);
  navigate(`page/${beatId}`);
}

function _esc(str) {
  return String(str).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

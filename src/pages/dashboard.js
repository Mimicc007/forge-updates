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

export async function renderDashboard(container) {
  const project = await db.getActiveProject();
  const schemas = await db.getSchemas(project.id);
  const pages = await db.getPages(project.id);
  const tabs = await db.getAllTabs(); // Infinite canvas tabs

  // Recent pages
  const recentPages = [...pages].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 6);

  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <h1 class="page-title" id="dash-title">${escapeHtml(project.name)}</h1>
          <p class="page-subtitle" id="dash-tagline">${escapeHtml(project.settings?.genre || 'Game Universe')}</p>
        </div>
        <div class="flex gap-3">
          <button class="btn btn-secondary" id="play-tutorial-btn"><i data-lucide="play-circle" style="width:16px;height:16px;margin-right:8px;color:var(--accent-cyan);"></i> Tutorial</button>
          <button class="btn btn-secondary" id="project-settings-btn"><i data-lucide="settings" style="width:16px;height:16px;margin-right:8px;"></i> Settings</button>
          <button class="btn btn-primary" id="new-canvas-btn" style="background: var(--accent-purple); border-color: var(--accent-purple);"><i data-lucide="layout-dashboard" style="width:16px;height:16px;margin-right:8px;"></i> New Canvas</button>
          <button class="btn btn-primary" id="new-database-btn"><i data-lucide="database" style="width:16px;height:16px;margin-right:8px;"></i> New Database</button>
        </div>
      </div>
    </div>
    
    <div class="hud-divider"></div>

    <!-- Stats -->
    <div class="stats-grid mb-6">
      <div class="stat-card" style="cursor: default;">
        <div class="stat-card-icon" style="background: var(--accent-primary-dim); color: var(--accent-primary);"><i data-lucide="database"></i></div>
        <div class="stat-card-value">${schemas.length}</div>
        <div class="stat-card-label">Databases</div>
      </div>
      <div class="stat-card" style="cursor: default;">
        <div class="stat-card-icon" style="background: var(--accent-secondary-dim); color: var(--accent-secondary);"><i data-lucide="file-text"></i></div>
        <div class="stat-card-value">${pages.length}</div>
        <div class="stat-card-label">Pages</div>
      </div>
      <div class="stat-card" style="cursor: default;">
        <div class="stat-card-icon" style="background: var(--accent-cyan-dim); color: var(--accent-cyan);"><i data-lucide="layout-dashboard"></i></div>
        <div class="stat-card-value">${tabs.length}</div>
        <div class="stat-card-label">Canvases</div>
      </div>
      <div class="stat-card" style="cursor: pointer;" onclick="window.location.hash='#/graph'">
        <div class="stat-card-icon" style="background: var(--accent-purple-dim); color: var(--accent-purple);"><i data-lucide="network"></i></div>
        <div class="stat-card-value">Graph</div>
        <div class="stat-card-label">View Connections</div>
      </div>
    </div>

    <div class="hud-divider"></div>

    <div class="grid-2" style="grid-template-columns: 1.5fr 1fr;">
      <!-- Recent Pages -->
      <div class="card" style="align-self: start;">
        <h3 class="detail-section-title"><i data-lucide="clock" style="width: 18px; height: 18px; margin-right: 8px;"></i> Recent Pages</h3>
        <div id="recent-pages-list" style="display: flex; flex-direction: column; gap: var(--sp-2);">
          ${recentPages.length === 0 ? `
            <div class="empty-state" style="padding: var(--sp-8);">
              <div class="empty-state-icon" style="font-size: 2rem;"><i data-lucide="file-plus"></i></div>
              <p class="empty-state-text">No pages yet. Create a database first!</p>
            </div>
          ` : recentPages.map(p => `
            <div class="activity-item" style="cursor: pointer; padding: var(--sp-3); border-radius: var(--radius-md); border: 1px solid var(--border-subtle); background: rgba(255,255,255,0.02); display: flex; align-items: center; gap: var(--sp-3); transition: all var(--transition-fast);" onclick="window.location.hash='#/page/${p.id}'">
              <div style="color: var(--accent-primary); flex-shrink: 0;">
                ${p.coverImage
                  ? `<img src="${p.coverImage}" alt="" style="width: 28px; height: 28px; border-radius: 6px; object-fit: cover; border: 1px solid rgba(255,255,255,0.1);">`
                  : `<i data-lucide="${p.icon || 'file-text'}"></i>`
                }
              </div>
              <div style="flex: 1; font-weight: var(--fw-medium); color: var(--text-primary);">
                ${escapeHtml(p.title || 'Untitled')}
              </div>
              <div class="activity-time" style="font-size: var(--fs-xs); color: var(--text-muted);">${timeAgo(p.updatedAt)}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Settings & Tools -->
      <div class="flex flex-col gap-4" style="align-self: start;">
        <!-- Data Management -->
        <div class="card card-sm">
          <div class="flex items-center gap-3 mb-4">
            <span style="color: var(--text-secondary);"><i data-lucide="database-backup"></i></span>
            <span style="font-weight: var(--fw-semibold); color: var(--text-primary);">Data Management</span>
          </div>
          <div class="flex flex-col gap-2">
            <button class="btn btn-secondary btn-sm w-full" id="export-btn"><i data-lucide="download" style="width:14px;height:14px;margin-right:6px;"></i> Export Data</button>
            <button class="btn btn-secondary btn-sm w-full" id="import-btn"><i data-lucide="upload" style="width:14px;height:14px;margin-right:6px;"></i> Import Data</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Event Listeners
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

  // Export / Import
  container.querySelector('#export-btn').addEventListener('click', async () => {
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

  container.querySelector('#import-btn').addEventListener('click', () => {
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

  // Onboarding trigger
  const onboardKey = `forge-onboarded-${project.id}`;
  if (!localStorage.getItem(onboardKey)) {
    localStorage.setItem(onboardKey, 'true');
    setTimeout(() => {
      showStyleOnboardingModal(project);
    }, 800);
  }

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

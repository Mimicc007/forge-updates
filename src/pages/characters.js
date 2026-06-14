/* ============================================================
   Forge — Characters Page
   The most important page: list + detail/edit views for
   game characters with rich text, images, and relationships.
   ============================================================ */

import {
  generateId, logActivity,
  getAllCharacters, getCharacter, saveCharacter, deleteCharacter,
  saveImage, getImage, getImagesForEntity, deleteImage,
} from '../db.js';

import {
  showToast, showConfirm, showLightbox,
  fileToDataURL, createImageUploadZone, createEditor,
  renderQuillContent, timeAgo, escapeHtml,
} from '../ui.js';

import { navigate } from '../router.js';

// ─── Roles & Statuses ────────────────────────────────────────
const ROLES = ['protagonist', 'antagonist', 'rival', 'supporting', 'npc', 'boss', 'miniboss'];
const STATUSES = ['alive', 'dead', 'unknown', 'sealed'];

const STATUS_ICONS = { alive: '●', dead: '✕', unknown: '?', sealed: '◆' };
const ROLE_LABELS = {
  protagonist: 'Protagonist', antagonist: 'Antagonist', rival: 'Rival',
  supporting: 'Supporting', npc: 'NPC', boss: 'Boss', miniboss: 'Mini-Boss',
};

// ═══════════════════════════════════════════════════════════════
//  1. CHARACTER LIST VIEW
// ═══════════════════════════════════════════════════════════════

export async function renderCharacters(container) {
  const characters = await getAllCharacters();

  // Pre-load portrait images for all characters that have one
  const portraitMap = {};
  await Promise.all(
    characters
      .filter(c => c.portraitImageId)
      .map(async c => {
        const img = await getImage(c.portraitImageId);
        if (img) portraitMap[c.id] = img.data;
      })
  );

  let viewMode = 'grid';
  let searchQuery = '';
  let roleFilter = '';

  // ── Render shell ──
  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <h1 class="page-title">Characters</h1>
          <p class="page-subtitle">${characters.length} character${characters.length !== 1 ? 's' : ''} in your bible</p>
        </div>
        <button class="btn btn-primary btn-lg" id="new-char-btn">+ New Character</button>
      </div>
    </div>

    <div class="toolbar mb-6">
      <div class="toolbar-search">
        <span class="search-icon">🔍</span>
        <input type="text" placeholder="Search characters…" id="char-search" />
      </div>
      <select class="form-select" id="role-filter" style="max-width:180px;">
        <option value="">All Roles</option>
        ${ROLES.map(r => `<option value="${r}">${ROLE_LABELS[r]}</option>`).join('')}
      </select>
      <div class="view-toggle ml-auto">
        <button class="view-toggle-btn active" data-view="grid" title="Grid view">▦</button>
        <button class="view-toggle-btn" data-view="list" title="List view">☰</button>
      </div>
    </div>

    <div id="char-content"></div>
  `;

  const contentEl = container.querySelector('#char-content');
  const searchInput = container.querySelector('#char-search');
  const roleSelect = container.querySelector('#role-filter');
  const viewBtns = container.querySelectorAll('.view-toggle-btn');

  // ── New character ──
  container.querySelector('#new-char-btn').addEventListener('click', () => navigate('characters/new'));

  // ── View toggle ──
  viewBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      viewMode = btn.dataset.view;
      viewBtns.forEach(b => b.classList.toggle('active', b === btn));
      renderList();
    });
  });

  // ── Search ──
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    renderList();
  });

  // ── Role filter ──
  roleSelect.addEventListener('change', () => {
    roleFilter = roleSelect.value;
    renderList();
  });

  function getFilteredCharacters() {
    return characters.filter(c => {
      if (searchQuery && !(c.name || '').toLowerCase().includes(searchQuery)) return false;
      if (roleFilter && c.role !== roleFilter) return false;
      return true;
    });
  }

  function renderList() {
    const filtered = getFilteredCharacters();

    if (filtered.length === 0 && characters.length === 0) {
      contentEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👤</div>
          <h2 class="empty-state-title">No characters yet</h2>
          <p class="empty-state-text">Create your first character to start building your game's cast.</p>
          <button class="btn btn-primary" id="empty-new-btn">+ New Character</button>
        </div>
      `;
      contentEl.querySelector('#empty-new-btn')?.addEventListener('click', () => navigate('characters/new'));
      return;
    }

    if (filtered.length === 0) {
      contentEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <h2 class="empty-state-title">No matches</h2>
          <p class="empty-state-text">Try adjusting your search or filter.</p>
        </div>
      `;
      return;
    }

    if (viewMode === 'grid') {
      contentEl.innerHTML = `<div class="grid-auto">${filtered.map(c => renderCharacterCard(c, portraitMap)).join('')}</div>`;
    } else {
      contentEl.innerHTML = `<div class="flex flex-col gap-1">${filtered.map(c => renderCharacterListItem(c, portraitMap)).join('')}</div>`;
    }

    // click handlers
    contentEl.querySelectorAll('[data-char-id]').forEach(el => {
      el.addEventListener('click', () => navigate(`characters/${el.dataset.charId}`));
    });
  }

  renderList();
}

function renderCharacterCard(c, portraitMap) {
  const portrait = portraitMap[c.id]
    ? `<img src="${portraitMap[c.id]}" alt="${escapeHtml(c.name)}" />`
    : `<span class="placeholder-icon">👤</span>`;
  return `
    <div class="card card-clickable card-sm character-card" data-char-id="${c.id}">
      <div class="character-card-portrait">${portrait}</div>
      <div class="character-card-info">
        <div class="character-card-name">${escapeHtml(c.name || 'Unnamed')}</div>
        ${c.title ? `<div class="character-card-title">${escapeHtml(c.title)}</div>` : ''}
        ${c.role ? `<span class="role-badge ${c.role}">${ROLE_LABELS[c.role] || c.role}</span>` : ''}
      </div>
    </div>
  `;
}

function renderCharacterListItem(c, portraitMap) {
  const portrait = portraitMap[c.id]
    ? `<img src="${portraitMap[c.id]}" alt="${escapeHtml(c.name)}" />`
    : `<span style="color:var(--text-muted);font-size:1.2rem;">👤</span>`;
  return `
    <div class="list-view-item" data-char-id="${c.id}">
      <div class="list-view-avatar">${portrait}</div>
      <div class="list-view-info">
        <div class="list-view-name">${escapeHtml(c.name || 'Unnamed')}</div>
        <div class="list-view-meta">
          ${c.title ? `<em>${escapeHtml(c.title)}</em> · ` : ''}
          ${c.updatedAt ? timeAgo(c.updatedAt) : ''}
        </div>
      </div>
      ${c.role ? `<span class="role-badge ${c.role}">${ROLE_LABELS[c.role] || c.role}</span>` : ''}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
//  2. CHARACTER DETAIL / EDIT VIEW
// ═══════════════════════════════════════════════════════════════

export async function renderCharacterDetail(container, params) {
  const isNew = params.id === 'new';
  let character = isNew
    ? {
        name: '', title: '', role: 'supporting', status: 'alive',
        combatStyle: '', moveList: [], bossPhases: [],
        bio: '', personality: '', backstory: '', motivations: '',
        abilities: [], weapons: '', relationships: [],
        voiceNotes: '', designNotes: '', tags: [],
        portraitImageId: '', createdAt: '', updatedAt: '',
      }
    : await getCharacter(params.id);

  if (!character) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">❓</div>
        <h2 class="empty-state-title">Character Not Found</h2>
        <p class="empty-state-text">This character may have been deleted.</p>
        <button class="btn btn-primary" id="back-btn">← Back to Characters</button>
      </div>
    `;
    container.querySelector('#back-btn').addEventListener('click', () => navigate('characters'));
    return;
  }

  // Load portrait
  let portraitData = null;
  if (character.portraitImageId) {
    const img = await getImage(character.portraitImageId);
    if (img) portraitData = img.data;
  }

  // Load concept art
  let conceptImages = [];
  if (!isNew) {
    conceptImages = await getImagesForEntity('character', character.id);
    // Exclude portrait from concept art
    if (character.portraitImageId) {
      conceptImages = conceptImages.filter(img => img.id !== character.portraitImageId);
    }
  }

  // Load all characters for relationships dropdown
  const allChars = (await getAllCharacters()).filter(c => c.id !== character.id);

  // State
  let isEditing = isNew;
  let editors = {};

  render();

  function render() {
    if (isEditing) {
      renderEditMode();
    } else {
      renderViewMode();
    }
  }

  // ────────────────────────────────────────────────────────────
  //  VIEW MODE
  // ────────────────────────────────────────────────────────────

  function renderViewMode() {
    const statusIcon = STATUS_ICONS[character.status] || '';

    container.innerHTML = `
      <div class="detail-page">
        <!-- Back + actions bar -->
        <div class="flex items-center justify-between">
          <button class="btn btn-ghost" id="back-btn">← Characters</button>
          <div class="flex gap-2">
            <button class="btn btn-secondary" id="edit-btn">✎ Edit</button>
            <button class="btn btn-danger btn-sm" id="delete-btn">🗑 Delete</button>
          </div>
        </div>

        <!-- Header -->
        <div class="detail-header">
          <div class="detail-portrait" id="view-portrait">
            ${portraitData
              ? `<img src="${portraitData}" alt="${escapeHtml(character.name)}" style="cursor:pointer;" />`
              : `<span style="font-size:4rem;color:var(--text-muted);">👤</span>`}
          </div>
          <div class="detail-info">
            <div class="detail-name">${escapeHtml(character.name || 'Unnamed Character')}</div>
            ${character.title ? `<div class="detail-epithet">"${escapeHtml(character.title)}"</div>` : ''}
            <div class="detail-badges">
              ${character.role ? `<span class="role-badge ${character.role}">${ROLE_LABELS[character.role] || character.role}</span>` : ''}
              ${character.status ? `<span class="status-badge ${character.status}">${statusIcon} ${character.status}</span>` : ''}
            </div>
            ${character.combatStyle ? `<div style="font-size:var(--fs-sm); color:var(--text-tertiary); margin-top:var(--sp-2);"><strong>Playstyle:</strong> ${escapeHtml(character.combatStyle)}</div>` : ''}
            ${character.tags && character.tags.length > 0 ? `
              <div class="tags-container mt-4">
                ${character.tags.map(t => `<span class="tag">🏷️ ${escapeHtml(t)}</span>`).join('')}
              </div>` : ''}
          </div>
        </div>

        <!-- Sections -->
        <div class="flex flex-col gap-4" id="view-sections"></div>
      </div>
    `;

    const sectionsEl = container.querySelector('#view-sections');

    // Rich text sections
    const textSections = [
      { icon: '📝', label: 'Bio / Description', key: 'bio' },
      { icon: '✨', label: 'Personality', key: 'personality' },
      { icon: '📜', label: 'Backstory', key: 'backstory' },
      { icon: '🎯', label: 'Motivations & Goals', key: 'motivations' },
      { icon: '🗡️', label: 'Weapons & Equipment', key: 'weapons' },
      { icon: '🎭', label: 'Voice & Dialogue Notes', key: 'voiceNotes' },
      { icon: '🎮', label: 'Design Notes', key: 'designNotes' },
    ];

    for (const sec of textSections) {
      const val = character[sec.key];
      if (!val) continue; // skip empty sections in view mode
      const section = document.createElement('div');
      section.className = 'detail-section';
      section.innerHTML = `
        <div class="detail-section-title">${sec.icon} ${sec.label}</div>
        <div class="detail-section-content">${renderQuillContent(val)}</div>
      `;
      sectionsEl.appendChild(section);
    }

    // Move List
    if (character.moveList && character.moveList.length > 0) {
      const section = document.createElement('div');
      section.className = 'detail-section';
      section.innerHTML = `
        <div class="detail-section-title">⚔️ Action Move List & Combo Chains</div>
        <div class="detail-section-content">
          <table class="w-full text-left" style="border-collapse: collapse; font-family: var(--font-hud); font-size: var(--fs-sm);">
            <thead>
              <tr style="border-bottom: 2px solid var(--border-default); color: var(--text-tertiary);">
                <th style="padding: var(--sp-2);">Move Name</th>
                <th style="padding: var(--sp-2);">Input Chain</th>
                <th style="padding: var(--sp-2);">Properties</th>
                <th style="padding: var(--sp-2);">Notes & Frames</th>
              </tr>
            </thead>
            <tbody>
              ${character.moveList.map(move => `
                <tr style="border-bottom: 1px solid var(--border-subtle); hover: background-color: var(--bg-hover);">
                  <td style="padding: var(--sp-2); font-weight: var(--fw-bold); color: var(--accent-primary-hover);">${escapeHtml(move.name || 'Unnamed')}</td>
                  <td style="padding: var(--sp-2);"><span class="tag" style="background: var(--bg-elevated); border-color: var(--border-strong); font-size: var(--fs-xs);">${escapeHtml(move.input || '—')}</span></td>
                  <td style="padding: var(--sp-2); color: var(--accent-secondary);">${escapeHtml(move.properties || '—')}</td>
                  <td style="padding: var(--sp-2); color: var(--text-secondary);">${escapeHtml(move.notes || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      sectionsEl.appendChild(section);
    }

    // Boss AI Phases
    if ((character.role === 'boss' || character.role === 'miniboss') && character.bossPhases && character.bossPhases.length > 0) {
      const section = document.createElement('div');
      section.className = 'detail-section';
      section.innerHTML = `
        <div class="detail-section-title">👾 Boss AI Battle Phases</div>
        <div class="detail-section-content">
          <div class="flex flex-col gap-3">
            ${character.bossPhases.map(phase => `
              <div style="padding: var(--sp-3); background: var(--bg-elevated); border-left: 3px solid var(--accent-secondary); border-radius: var(--radius-sm);">
                <div class="flex items-center justify-between mb-1">
                  <strong style="color: var(--text-primary); font-family: var(--font-hud);">${escapeHtml(phase.name || 'Unnamed Phase')}</strong>
                  <span class="tag" style="color: var(--accent-red); border-color: var(--accent-red-dim);">${escapeHtml(phase.trigger || '—')}</span>
                </div>
                <div style="color: var(--text-secondary); font-size: var(--fs-sm);">${escapeHtml(phase.description || 'No behavior described.')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      sectionsEl.appendChild(section);
    }

    // Abilities
    if (character.abilities && character.abilities.length > 0) {
      const section = document.createElement('div');
      section.className = 'detail-section';
      section.innerHTML = `
        <div class="detail-section-title">⚡ Abilities</div>
        <div class="detail-section-content">
          <div class="flex flex-col gap-3">
            ${character.abilities.map(a => `
              <div style="padding:var(--sp-3);background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
                <div style="font-weight:var(--fw-semibold);color:var(--text-primary);margin-bottom:var(--sp-1);">${escapeHtml(a.name || 'Unnamed')}</div>
                ${a.type ? `<span class="tag mb-2">${escapeHtml(a.type)}</span>` : ''}
                ${a.description ? `<div style="color:var(--text-secondary);font-size:var(--fs-sm);margin-top:var(--sp-1);">${escapeHtml(a.description)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `;
      sectionsEl.appendChild(section);
    }

    // Relationships
    if (character.relationships && character.relationships.length > 0) {
      const section = document.createElement('div');
      section.className = 'detail-section';
      section.innerHTML = `
        <div class="detail-section-title">🔗 Relationships</div>
        <div class="detail-section-content" id="view-relationships"></div>
      `;
      sectionsEl.appendChild(section);
      renderViewRelationships(section.querySelector('#view-relationships'));
    }

    // Concept Art Gallery
    if (conceptImages.length > 0) {
      const section = document.createElement('div');
      section.className = 'detail-section';
      section.innerHTML = `
        <div class="detail-section-title">🖼️ Concept Art Gallery</div>
        <div class="image-gallery-grid" id="view-gallery"></div>
      `;
      sectionsEl.appendChild(section);
      const galleryEl = section.querySelector('#view-gallery');
      conceptImages.forEach(img => {
        const item = document.createElement('div');
        item.className = 'image-gallery-item';
        item.innerHTML = `<img src="${img.data}" alt="${escapeHtml(img.name || 'Concept art')}" />`;
        item.addEventListener('click', () => showLightbox(img.data));
        galleryEl.appendChild(item);
      });
    }

    // Event listeners
    container.querySelector('#back-btn').addEventListener('click', () => navigate('characters'));
    container.querySelector('#edit-btn').addEventListener('click', () => {
      isEditing = true;
      render();
    });
    container.querySelector('#delete-btn').addEventListener('click', handleDelete);

    // Portrait lightbox
    const portraitEl = container.querySelector('#view-portrait img');
    if (portraitEl) {
      portraitEl.addEventListener('click', () => showLightbox(portraitData));
    }
  }

  async function renderViewRelationships(containerEl) {
    const items = character.relationships || [];
    if (items.length === 0) {
      containerEl.innerHTML = '<span class="text-muted" style="font-style:italic;">No relationships defined</span>';
      return;
    }

    const html = [];
    for (const rel of items) {
      const relChar = allChars.find(c => c.id === rel.characterId);
      if (!relChar) continue;

      let relPortrait = null;
      if (relChar.portraitImageId) {
        const img = await getImage(relChar.portraitImageId);
        if (img) relPortrait = img.data;
      }

      html.push(`
        <div class="relationship-item" data-nav-char="${relChar.id}">
          <div class="relationship-avatar">
            ${relPortrait ? `<img src="${relPortrait}" alt="" />` : `<span style="font-size:0.9rem;color:var(--text-muted);">👤</span>`}
          </div>
          <span class="relationship-name">${escapeHtml(relChar.name)}</span>
          <span class="relationship-type">${escapeHtml(rel.type || 'Related')}</span>
        </div>
      `);
    }

    containerEl.innerHTML = `<div class="flex flex-col gap-2">${html.join('')}</div>`;
    containerEl.querySelectorAll('[data-nav-char]').forEach(el => {
      el.addEventListener('click', () => navigate(`characters/${el.dataset.navChar}`));
    });
  }

  // ────────────────────────────────────────────────────────────
  //  EDIT MODE
  // ────────────────────────────────────────────────────────────

  async function renderEditMode() {
    // Clean up old editor references
    editors = {};

    // Local copies to work with
    let editAbilities = JSON.parse(JSON.stringify(character.abilities || []));
    let editRelationships = JSON.parse(JSON.stringify(character.relationships || []));
    let editTags = [...(character.tags || [])];
    let editPortraitImageId = character.portraitImageId || '';
    let pendingPortraitDataURL = null;

    container.innerHTML = `
      <div class="detail-page">
        <!-- Back bar -->
        <div class="flex items-center justify-between">
          <button class="btn btn-ghost" id="back-btn">← ${isNew ? 'Characters' : 'Cancel'}</button>
          <div class="flex gap-2">
            ${!isNew ? `<button class="btn btn-danger btn-sm" id="delete-btn">🗑 Delete</button>` : ''}
            <button class="btn btn-primary" id="save-btn">💾 Save Character</button>
          </div>
        </div>

        <!-- Portrait + Core fields row -->
        <div class="detail-header">
          <div class="detail-portrait" id="edit-portrait-area" style="cursor:pointer;position:relative;">
            ${portraitData
              ? `<img src="${portraitData}" alt="Portrait" id="portrait-preview" />`
              : `<span style="font-size:3rem;color:var(--text-muted);">📷</span>`}
            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);padding:var(--sp-2);text-align:center;font-size:var(--fs-xs);color:var(--text-secondary);">
              Click to change
            </div>
          </div>
          <div class="detail-info" style="gap:var(--sp-4);">
            <div class="form-group">
              <label class="form-label">Name</label>
              <input class="form-input" id="edit-name" value="${escapeHtml(character.name || '')}" placeholder="Character name" />
            </div>
            <div class="form-group">
              <label class="form-label">Title / Epithet</label>
              <input class="form-input" id="edit-title" value="${escapeHtml(character.title || '')}" placeholder="e.g. The Shadow King" />
            </div>
            <div class="form-group">
              <label class="form-label">Playstyle / Combat Archetype</label>
              <input class="form-input" id="edit-combatStyle" value="${escapeHtml(character.combatStyle || '')}" placeholder="e.g. Aerial Specialist, Stance Switcher, Heavy Zoner" />
            </div>
            <div class="flex gap-4">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Role</label>
                <select class="form-select" id="edit-role">
                  ${ROLES.map(r => `<option value="${r}" ${character.role === r ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Status</label>
                <select class="form-select" id="edit-status">
                  ${STATUSES.map(s => `<option value="${s}" ${character.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Rich text editor sections -->
        <div class="flex flex-col gap-4" id="editor-sections">
          <!-- Editors will be created dynamically -->
        </div>

        <!-- Abilities -->
        <div class="detail-section" id="abilities-section">
          <div class="detail-section-title">⚡ Abilities</div>
          <div id="abilities-list" class="flex flex-col gap-3"></div>
          <button class="btn btn-secondary btn-sm mt-4" id="add-ability-btn">+ Add Ability</button>
        </div>

        <!-- Action Move List (Combos) -->
        <div class="detail-section" id="moveslist-section">
          <div class="detail-section-title">⚔️ Action Move List & Combo Inputs</div>
          <div id="moves-list" class="flex flex-col gap-3"></div>
          <button class="btn btn-secondary btn-sm mt-4" id="add-move-btn">+ Add Move</button>
        </div>

        <!-- Boss AI Phases -->
        <div class="detail-section" id="bossphases-section" style="${character.role === 'boss' || character.role === 'miniboss' ? '' : 'display:none;'}">
          <div class="detail-section-title">👾 Boss AI Battle Phases</div>
          <div id="phases-list" class="flex flex-col gap-3"></div>
          <button class="btn btn-secondary btn-sm mt-4" id="add-phase-btn">+ Add Phase</button>
        </div>

        <!-- Relationships -->
        <div class="detail-section" id="relationships-section">
          <div class="detail-section-title">🔗 Relationships</div>
          <div id="relationships-list" class="flex flex-col gap-3"></div>
          <div class="flex gap-3 mt-4" id="add-rel-row">
            <select class="form-select" id="rel-char-select" style="flex:2;">
              <option value="">Select a character…</option>
              ${allChars.map(c => `<option value="${c.id}">${escapeHtml(c.name || 'Unnamed')}</option>`).join('')}
            </select>
            <input class="form-input" id="rel-type-input" placeholder="Relationship type" style="flex:1;" />
            <button class="btn btn-secondary btn-sm" id="add-rel-btn">+ Add</button>
          </div>
        </div>

        <!-- Tags -->
        <div class="detail-section" id="tags-section">
          <div class="detail-section-title">🏷️ Tags</div>
          <div class="tag-input-wrapper" id="tag-input-wrapper">
            <input type="text" placeholder="Type a tag and press Enter…" id="tag-input" />
          </div>
        </div>

        <!-- Concept Art -->
        <div class="detail-section" id="concept-art-section">
          <div class="detail-section-title">🖼️ Concept Art</div>
          <div id="concept-gallery" class="image-gallery-grid mb-4"></div>
          <div id="concept-upload-zone"></div>
        </div>
      </div>
    `;

    // ── Portrait upload ──
    const portraitArea = container.querySelector('#edit-portrait-area');
    const portraitInput = document.createElement('input');
    portraitInput.type = 'file';
    portraitInput.accept = 'image/*';
    portraitInput.style.display = 'none';
    portraitArea.appendChild(portraitInput);

    portraitArea.addEventListener('click', () => portraitInput.click());
    portraitInput.addEventListener('change', async () => {
      if (portraitInput.files.length === 0) return;
      const file = portraitInput.files[0];
      const dataURL = await fileToDataURL(file);
      pendingPortraitDataURL = dataURL;
      const preview = portraitArea.querySelector('img') || document.createElement('img');
      preview.src = dataURL;
      preview.id = 'portrait-preview';
      preview.alt = 'Portrait';
      if (!portraitArea.querySelector('img')) {
        // Remove placeholder span
        const placeholder = portraitArea.querySelector('span');
        if (placeholder) placeholder.remove();
        portraitArea.insertBefore(preview, portraitArea.firstChild);
      }
      portraitInput.value = '';
    });

    // ── Create Quill editors sequentially ──
    const editorSections = container.querySelector('#editor-sections');
    const editorConfigs = [
      { key: 'bio', icon: '📝', label: 'Bio / Description' },
      { key: 'personality', icon: '✨', label: 'Personality' },
      { key: 'backstory', icon: '📜', label: 'Backstory' },
      { key: 'motivations', icon: '🎯', label: 'Motivations & Goals' },
      { key: 'weapons', icon: '🗡️', label: 'Weapons & Equipment' },
      { key: 'voiceNotes', icon: '🎭', label: 'Voice & Dialogue Notes' },
      { key: 'designNotes', icon: '🎮', label: 'Design Notes' },
    ];

    for (const cfg of editorConfigs) {
      const section = document.createElement('div');
      section.className = 'detail-section';
      section.innerHTML = `<div class="detail-section-title">${cfg.icon} ${cfg.label}</div>`;
      const editorContainer = document.createElement('div');
      section.appendChild(editorContainer);
      editorSections.appendChild(section);

      const editor = await createEditor(editorContainer, {
        placeholder: `Write about ${cfg.label.toLowerCase()}…`,
        initialContent: character[cfg.key] || '',
      });
      editors[cfg.key] = editor;
    }

    // ── Abilities ──
    const abilitiesListEl = container.querySelector('#abilities-list');

    function renderAbilities() {
      abilitiesListEl.innerHTML = '';
      editAbilities.forEach((ability, idx) => {
        const row = document.createElement('div');
        row.className = 'flex gap-3 items-center';
        row.style.cssText = 'padding:var(--sp-3);background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-subtle);';
        row.innerHTML = `
          <div class="flex flex-col gap-2" style="flex:1;">
            <input class="form-input" placeholder="Ability name" value="${escapeHtml(ability.name || '')}" data-field="name" />
            <input class="form-input" placeholder="Type (e.g. Active, Passive)" value="${escapeHtml(ability.type || '')}" data-field="type" />
            <textarea class="form-textarea" placeholder="Description" data-field="desc" style="min-height:60px;">${escapeHtml(ability.description || '')}</textarea>
          </div>
          <button class="btn btn-icon btn-danger btn-sm" data-remove-ability="${idx}" title="Remove">✕</button>
        `;

        // Bind input changes
        row.querySelector('[data-field="name"]').addEventListener('input', e => { editAbilities[idx].name = e.target.value; });
        row.querySelector('[data-field="type"]').addEventListener('input', e => { editAbilities[idx].type = e.target.value; });
        row.querySelector('[data-field="desc"]').addEventListener('input', e => { editAbilities[idx].description = e.target.value; });
        row.querySelector(`[data-remove-ability="${idx}"]`).addEventListener('click', () => {
          editAbilities.splice(idx, 1);
          renderAbilities();
        });

        abilitiesListEl.appendChild(row);
      });
    }

    renderAbilities();

    container.querySelector('#add-ability-btn').addEventListener('click', () => {
      editAbilities.push({ name: '', description: '', type: '' });
      renderAbilities();
    });

    // ── Move List ──
    let editMoveList = JSON.parse(JSON.stringify(character.moveList || []));
    const movesListEl = container.querySelector('#moves-list');

    function renderMoves() {
      movesListEl.innerHTML = '';
      editMoveList.forEach((move, idx) => {
        const row = document.createElement('div');
        row.className = 'flex gap-3 items-center';
        row.style.cssText = 'padding:var(--sp-3);background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-subtle);';
        row.innerHTML = `
          <div class="grid-2" style="flex:1; gap:var(--sp-2);">
            <input class="form-input" placeholder="Move Name (e.g. Helm Breaker)" value="${escapeHtml(move.name || '')}" data-move-field="name" />
            <input class="form-input" placeholder="Input Chain (e.g. Down + Tri in Mid-air)" value="${escapeHtml(move.input || '')}" data-move-field="input" />
            <input class="form-input" placeholder="Properties (e.g. Launcher, Guard Break)" value="${escapeHtml(move.properties || '')}" data-move-field="properties" />
            <input class="form-input" placeholder="Notes & Frame notes" value="${escapeHtml(move.notes || '')}" data-move-field="notes" />
          </div>
          <button class="btn btn-icon btn-danger btn-sm" data-remove-move="${idx}" title="Remove">✕</button>
        `;

        row.querySelector('[data-move-field="name"]').addEventListener('input', e => { editMoveList[idx].name = e.target.value; });
        row.querySelector('[data-move-field="input"]').addEventListener('input', e => { editMoveList[idx].input = e.target.value; });
        row.querySelector('[data-move-field="properties"]').addEventListener('input', e => { editMoveList[idx].properties = e.target.value; });
        row.querySelector('[data-move-field="notes"]').addEventListener('input', e => { editMoveList[idx].notes = e.target.value; });
        
        row.querySelector(`[data-remove-move="${idx}"]`).addEventListener('click', () => {
          editMoveList.splice(idx, 1);
          renderMoves();
        });
        movesListEl.appendChild(row);
      });
    }

    renderMoves();
    container.querySelector('#add-move-btn').addEventListener('click', () => {
      editMoveList.push({ name: '', input: '', properties: '', notes: '' });
      renderMoves();
    });

    // ── Boss Phases ──
    let editBossPhases = JSON.parse(JSON.stringify(character.bossPhases || []));
    const phasesListEl = container.querySelector('#phases-list');

    function renderPhases() {
      phasesListEl.innerHTML = '';
      editBossPhases.forEach((phase, idx) => {
        const row = document.createElement('div');
        row.className = 'flex gap-3 items-center';
        row.style.cssText = 'padding:var(--sp-3);background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-subtle);';
        row.innerHTML = `
          <div class="flex flex-col gap-2" style="flex:1;">
            <div class="grid-2" style="gap:var(--sp-2);">
              <input class="form-input" placeholder="Phase Name (e.g. Phase 2: Desperation)" value="${escapeHtml(phase.name || '')}" data-phase-field="name" />
              <input class="form-input" placeholder="Trigger (e.g. Under 50% HP)" value="${escapeHtml(phase.trigger || '')}" data-phase-field="trigger" />
            </div>
            <textarea class="form-textarea" placeholder="Behavior / Mechanics changes" data-phase-field="description" style="min-height:50px;">${escapeHtml(phase.description || '')}</textarea>
          </div>
          <button class="btn btn-icon btn-danger btn-sm" data-remove-phase="${idx}" title="Remove">✕</button>
        `;

        row.querySelector('[data-phase-field="name"]').addEventListener('input', e => { editBossPhases[idx].name = e.target.value; });
        row.querySelector('[data-phase-field="trigger"]').addEventListener('input', e => { editBossPhases[idx].trigger = e.target.value; });
        row.querySelector('[data-phase-field="description"]').addEventListener('input', e => { editBossPhases[idx].description = e.target.value; });
        
        row.querySelector(`[data-remove-phase="${idx}"]`).addEventListener('click', () => {
          editBossPhases.splice(idx, 1);
          renderPhases();
        });
        phasesListEl.appendChild(row);
      });
    }

    renderPhases();
    container.querySelector('#add-phase-btn').addEventListener('click', () => {
      editBossPhases.push({ name: '', trigger: '', description: '' });
      renderPhases();
    });

    // Dynamic role display toggle
    container.querySelector('#edit-role').addEventListener('change', (e) => {
      const section = container.querySelector('#bossphases-section');
      if (e.target.value === 'boss' || e.target.value === 'miniboss') {
        section.style.display = '';
      } else {
        section.style.display = 'none';
      }
    });

    // ── Relationships ──
    const relsListEl = container.querySelector('#relationships-list');

    function renderRelationships() {
      relsListEl.innerHTML = '';
      editRelationships.forEach((rel, idx) => {
        const relChar = allChars.find(c => c.id === rel.characterId);
        const row = document.createElement('div');
        row.className = 'relationship-item';
        row.style.cursor = 'default';
        row.innerHTML = `
          <div class="relationship-avatar">
            <span style="font-size:0.9rem;color:var(--text-muted);">👤</span>
          </div>
          <span class="relationship-name">${escapeHtml(relChar ? relChar.name : 'Unknown')}</span>
          <span class="relationship-type">${escapeHtml(rel.type || 'Related')}</span>
          <button class="btn btn-icon btn-danger btn-sm" data-remove-rel="${idx}" title="Remove" style="margin-left:auto;">✕</button>
        `;
        row.querySelector(`[data-remove-rel="${idx}"]`).addEventListener('click', () => {
          editRelationships.splice(idx, 1);
          renderRelationships();
        });
        relsListEl.appendChild(row);
      });
    }

    renderRelationships();

    container.querySelector('#add-rel-btn').addEventListener('click', () => {
      const charId = container.querySelector('#rel-char-select').value;
      const relType = container.querySelector('#rel-type-input').value.trim();
      if (!charId) { showToast('Please select a character', 'error'); return; }
      if (editRelationships.some(r => r.characterId === charId)) {
        showToast('Relationship already exists', 'error');
        return;
      }
      editRelationships.push({ characterId: charId, type: relType || 'Related' });
      container.querySelector('#rel-char-select').value = '';
      container.querySelector('#rel-type-input').value = '';
      renderRelationships();
    });

    // ── Tags ──
    const tagWrapper = container.querySelector('#tag-input-wrapper');
    const tagInput = container.querySelector('#tag-input');

    function renderTags() {
      // Remove existing tag spans (keep input)
      tagWrapper.querySelectorAll('.tag').forEach(t => t.remove());
      editTags.forEach((tag, idx) => {
        const tagEl = document.createElement('span');
        tagEl.className = 'tag';
        tagEl.innerHTML = `${escapeHtml(tag)} <button class="tag-remove" data-remove-tag="${idx}">✕</button>`;
        tagWrapper.insertBefore(tagEl, tagInput);
      });
      tagWrapper.querySelectorAll('.tag-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.removeTag);
          editTags.splice(idx, 1);
          renderTags();
        });
      });
    }

    renderTags();

    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = tagInput.value.trim();
        if (val && !editTags.includes(val)) {
          editTags.push(val);
          tagInput.value = '';
          renderTags();
        }
      }
    });

    tagWrapper.addEventListener('click', () => tagInput.focus());

    // ── Concept art gallery (edit mode) ──
    const conceptGalleryEl = container.querySelector('#concept-gallery');
    const conceptUploadZoneEl = container.querySelector('#concept-upload-zone');

    // Pending new concept images (not yet saved)
    let pendingConceptImages = [];

    function renderConceptGallery() {
      conceptGalleryEl.innerHTML = '';

      // Already-saved images
      conceptImages.forEach(img => {
        const item = document.createElement('div');
        item.className = 'image-gallery-item';
        item.innerHTML = `
          <img src="${img.data}" alt="${escapeHtml(img.name || 'Concept art')}" />
          <div class="image-overlay">
            <div class="image-actions">
              <button class="btn btn-icon btn-danger btn-sm" data-delete-img="${img.id}" title="Delete">✕</button>
            </div>
          </div>
        `;
        item.querySelector(`[data-delete-img]`).addEventListener('click', async (e) => {
          e.stopPropagation();
          const confirmed = await showConfirm('Delete Image', 'Are you sure you want to delete this image?');
          if (confirmed) {
            await deleteImage(img.id);
            conceptImages = conceptImages.filter(i => i.id !== img.id);
            renderConceptGallery();
            showToast('Image deleted', 'success');
          }
        });
        item.addEventListener('click', () => showLightbox(img.data));
        conceptGalleryEl.appendChild(item);
      });

      // Pending (unsaved) images
      pendingConceptImages.forEach((pImg, idx) => {
        const item = document.createElement('div');
        item.className = 'image-gallery-item';
        item.style.border = '2px dashed var(--accent-primary)';
        item.innerHTML = `
          <img src="${pImg.data}" alt="${escapeHtml(pImg.name || 'New')}" />
          <div class="image-overlay" style="opacity:1;">
            <div class="image-actions">
              <button class="btn btn-icon btn-danger btn-sm" data-remove-pending="${idx}" title="Remove">✕</button>
            </div>
          </div>
        `;
        item.querySelector(`[data-remove-pending]`).addEventListener('click', (e) => {
          e.stopPropagation();
          pendingConceptImages.splice(idx, 1);
          renderConceptGallery();
        });
        conceptGalleryEl.appendChild(item);
      });
    }

    renderConceptGallery();

    const uploadZone = createImageUploadZone(async (files) => {
      for (const file of files) {
        const dataURL = await fileToDataURL(file);
        pendingConceptImages.push({ data: dataURL, name: file.name });
      }
      renderConceptGallery();
    });
    conceptUploadZoneEl.appendChild(uploadZone);

    // ── Back / Cancel ──
    container.querySelector('#back-btn').addEventListener('click', () => {
      if (isNew) {
        navigate('characters');
      } else {
        isEditing = false;
        render();
      }
    });

    // ── Delete ──
    const deleteBtn = container.querySelector('#delete-btn');
    if (deleteBtn) deleteBtn.addEventListener('click', handleDelete);

    // ── Save ──
    container.querySelector('#save-btn').addEventListener('click', async () => {
      const name = container.querySelector('#edit-name').value.trim();
      if (!name) {
        showToast('Character name is required', 'error');
        return;
      }

      // Build character object
      character.name = name;
      character.title = container.querySelector('#edit-title').value.trim();
      character.role = container.querySelector('#edit-role').value;
      character.status = container.querySelector('#edit-status').value;
      character.combatStyle = container.querySelector('#edit-combatStyle').value.trim();

      // Collect rich text editors
      for (const key of Object.keys(editors)) {
        character[key] = editors[key].getContent();
      }

      character.abilities = editAbilities.filter(a => a.name.trim());
      character.moveList = editMoveList.filter(m => m.name.trim());
      character.bossPhases = editBossPhases.filter(p => p.name.trim());
      character.relationships = editRelationships;
      character.tags = editTags;

      try {
        // Save character first to get an ID if new
        const saved = await saveCharacter(character);
        character = saved;

        // Handle portrait
        if (pendingPortraitDataURL) {
          // Delete old portrait if it exists
          if (editPortraitImageId) {
            await deleteImage(editPortraitImageId);
          }
          const imgRecord = await saveImage({
            entityType: 'character',
            entityId: character.id,
            data: pendingPortraitDataURL,
            name: 'portrait',
          });
          character.portraitImageId = imgRecord.id;
          portraitData = pendingPortraitDataURL;
          await saveCharacter(character);
        }

        // Save pending concept images
        for (const pImg of pendingConceptImages) {
          const saved = await saveImage({
            entityType: 'character',
            entityId: character.id,
            data: pImg.data,
            name: pImg.name,
          });
          conceptImages.push(saved);
        }
        pendingConceptImages = [];

        showToast(`${escapeHtml(character.name)} saved!`, 'success');

        if (isNew) {
          // Navigate to the saved character
          navigate(`characters/${character.id}`);
        } else {
          isEditing = false;
          render();
        }
      } catch (err) {
        showToast('Save failed: ' + err.message, 'error');
      }
    });
  }

  // ── Delete handler ──
  async function handleDelete() {
    const confirmed = await showConfirm(
      'Delete Character',
      `Are you sure you want to delete <strong>${escapeHtml(character.name || 'this character')}</strong>? This action cannot be undone.`
    );
    if (confirmed) {
      await deleteCharacter(character.id);
      showToast(`${escapeHtml(character.name)} deleted`, 'success');
      navigate('characters');
    }
  }
}

/* ============================================================
   Forge — Game Design Page
   Mechanics, abilities, enemies, progression, combat, and notes.
   ============================================================ */

import {
  getAllGameDesignEntries,
  getGameDesignEntriesByCategory,
  getGameDesignEntry,
  saveGameDesignEntry,
  deleteGameDesignEntry,
  generateId,
  getImagesForEntity,
  saveImage,
  deleteImage,
  getAllCharacters,
} from '../db.js';
import { navigate } from '../router.js';
import {
  showToast,
  showConfirm,
  showLightbox,
  escapeHtml,
  timeAgo,
  createEditor,
  renderQuillContent,
  fileToDataURL,
  createImageUploadZone,
} from '../ui.js';

// ── Constants ──────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'ability',     label: 'Abilities',    icon: '⚡' },
  { key: 'enemy',       label: 'Enemies',      icon: '👾' },
  { key: 'progression', label: 'Progression',  icon: '📈' },
  { key: 'combat',      label: 'Combat',       icon: '⚔️' },
  { key: 'notes',       label: 'Notes',        icon: '📝' },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

const ABILITY_TYPES  = ['Melee', 'Ranged', 'AoE', 'Buff', 'Ultimate'];
const ENEMY_TYPES    = ['Grunt', 'Elite', 'Miniboss', 'Boss', 'Swarm'];

function getCategoryMeta(key) {
  return CATEGORY_MAP[key] || { key: 'notes', label: 'Notes', icon: '📝' };
}

function getExcerpt(content, maxLen = 90) {
  if (!content) return '';
  try {
    const delta = JSON.parse(content);
    const text = delta.ops.map(op => (typeof op.insert === 'string' ? op.insert : '')).join('');
    const clean = text.replace(/\n/g, ' ').trim();
    return clean.length > maxLen ? clean.slice(0, maxLen) + '…' : clean;
  } catch {
    const clean = content.replace(/\n/g, ' ').trim();
    return clean.length > maxLen ? clean.slice(0, maxLen) + '…' : clean;
  }
}

// ── List View ──────────────────────────────────────────────────

export async function renderGameDesign(container) {
  let activeTab = 'all';
  let searchQuery = '';

  async function getEntries() {
    let entries = activeTab === 'all'
      ? await getAllGameDesignEntries()
      : await getGameDesignEntriesByCategory(activeTab);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      entries = entries.filter(e =>
        (e.name && e.name.toLowerCase().includes(q)) ||
        (e.tags && e.tags.some(t => t.toLowerCase().includes(q)))
      );
    }

    // Sort by most recently updated
    entries.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return entries;
  }

  async function render() {
    const entries = await getEntries();

    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-row">
          <div>
            <h1 class="page-title">Game Design</h1>
            <p class="page-subtitle">Mechanics, abilities, enemies, and systems</p>
          </div>
          <button class="btn btn-primary" id="gd-new-btn">+ New Entry</button>
        </div>
      </div>

      <!-- Toolbar -->
      <div class="toolbar mb-6">
        <div class="toolbar-search">
          <span class="search-icon">🔍</span>
          <input type="text" id="gd-search" placeholder="Search entries…" value="${escapeHtml(searchQuery)}" />
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs" id="gd-tabs">
        <button class="tab ${activeTab === 'all' ? 'active' : ''}" data-tab="all">All</button>
        ${CATEGORIES.map(c => `
          <button class="tab ${activeTab === c.key ? 'active' : ''}" data-tab="${c.key}">
            ${c.icon} ${c.label}
          </button>
        `).join('')}
      </div>

      <!-- Content -->
      <div id="gd-list">
        ${entries.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon">⚔️</div>
            <h2 class="empty-state-title">No entries yet</h2>
            <p class="empty-state-text">Start documenting your game mechanics, abilities, enemies, and design decisions.</p>
            <button class="btn btn-primary" id="gd-empty-new">+ Create First Entry</button>
          </div>
        ` : `
          <div class="grid-auto">
            ${entries.map(entry => {
              const cat = getCategoryMeta(entry.category);
              return `
                <div class="card card-clickable card-sm character-card" data-id="${entry.id}">
                  <div style="display:flex; align-items:center; gap:var(--sp-2); margin-bottom:var(--sp-2);">
                    <span style="font-size:1.5rem;">${cat.icon}</span>
                    <span class="tag" style="font-size:var(--fs-xs);">${escapeHtml(cat.label)}</span>
                    <span class="text-muted ml-auto" style="font-size:var(--fs-xs);">${timeAgo(entry.updatedAt)}</span>
                  </div>
                  <div class="character-card-name" style="margin-bottom:var(--sp-1);">${escapeHtml(entry.name || 'Untitled')}</div>
                  <div class="text-tertiary" style="font-size:var(--fs-sm); line-height:var(--lh-relaxed); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                    ${escapeHtml(getExcerpt(entry.content))}
                  </div>
                  ${entry.tags && entry.tags.length > 0 ? `
                    <div class="tags-container mt-2">
                      ${entry.tags.slice(0, 3).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
                      ${entry.tags.length > 3 ? `<span class="text-muted" style="font-size:var(--fs-xs);">+${entry.tags.length - 3}</span>` : ''}
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    // ── Event Listeners ──

    container.querySelector('#gd-new-btn').addEventListener('click', () => navigate('gamedesign/new'));

    const emptyNew = container.querySelector('#gd-empty-new');
    if (emptyNew) emptyNew.addEventListener('click', () => navigate('gamedesign/new'));

    // Tabs
    container.querySelectorAll('#gd-tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        render();
      });
    });

    // Search
    const searchInput = container.querySelector('#gd-search');
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        searchQuery = searchInput.value.trim();
        render();
      }, 250);
    });

    // Card clicks
    container.querySelectorAll('[data-id]').forEach(card => {
      card.addEventListener('click', () => navigate(`gamedesign/${card.dataset.id}`));
    });
  }

  await render();
}

// ── Detail / Edit View ─────────────────────────────────────────

export async function renderGameDesignDetail(container, params) {
  const { id } = params;
  const isNew = id === 'new';
  let entry = isNew
    ? { name: '', category: 'ability', content: '', tags: [], details: {}, createdAt: '', updatedAt: '' }
    : await getGameDesignEntry(id);

  if (!entry) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <h2 class="empty-state-title">Entry Not Found</h2>
        <p class="empty-state-text">This game design entry doesn't exist or was deleted.</p>
        <button class="btn btn-primary" id="gd-back">← Back to Game Design</button>
      </div>
    `;
    container.querySelector('#gd-back').addEventListener('click', () => navigate('gamedesign'));
    return;
  }

  let isEditing = isNew;
  let images = isNew ? [] : await getImagesForEntity('gamedesign', id);
  let characters = [];

  async function renderDetail() {
    const cat = getCategoryMeta(entry.category);
    const details = entry.details || {};

    if (isEditing) {
      characters = await getAllCharacters();
      await renderEditMode(container, entry, cat, details, images, characters, isNew);
    } else {
      renderViewMode(container, entry, cat, details, images);
    }
  }

  // ── VIEW MODE ──

  function renderViewMode(container, entry, cat, details, images) {
    container.innerHTML = `
      <div class="detail-page">
        <!-- Header -->
        <div class="page-header">
          <div class="page-header-row">
            <div>
              <div class="flex items-center gap-3 mb-2">
                <span style="font-size:1.75rem;">${cat.icon}</span>
                <span class="tag">${escapeHtml(cat.label)}</span>
              </div>
              <h1 class="detail-name">${escapeHtml(entry.name || 'Untitled')}</h1>
              ${entry.tags && entry.tags.length > 0 ? `
                <div class="tags-container mt-2">
                  ${entry.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
                </div>
              ` : ''}
            </div>
            <div class="flex gap-3">
              <button class="btn btn-secondary" id="gd-back-btn">← Back</button>
              <button class="btn btn-primary" id="gd-edit-btn">✏️ Edit</button>
              <button class="btn btn-danger" id="gd-delete-btn">🗑 Delete</button>
            </div>
          </div>
        </div>

        <!-- Category-specific fields -->
        ${renderCategoryViewFields(entry.category, details)}

        <!-- Content -->
        <div class="detail-section">
          <h3 class="detail-section-title">📄 Description</h3>
          <div class="detail-section-content">${renderQuillContent(entry.content)}</div>
        </div>

        <!-- Images -->
        ${images.length > 0 ? `
          <div class="detail-section">
            <h3 class="detail-section-title">🎨 Concept Art</h3>
            <div class="image-gallery-grid">
              ${images.map(img => `
                <div class="image-gallery-item" data-img-id="${img.id}">
                  <img src="${img.data}" alt="${escapeHtml(img.name || 'Image')}" />
                  <div class="image-overlay">
                    <span style="color:#fff; font-size:var(--fs-sm); font-weight:var(--fw-medium);">${escapeHtml(img.name || '')}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Metadata -->
        <div class="flex items-center gap-4 text-muted" style="font-size:var(--fs-sm);">
          ${entry.createdAt ? `<span>Created ${timeAgo(entry.createdAt)}</span>` : ''}
          ${entry.updatedAt ? `<span>Updated ${timeAgo(entry.updatedAt)}</span>` : ''}
        </div>
      </div>
    `;

    // Events
    container.querySelector('#gd-back-btn').addEventListener('click', () => navigate('gamedesign'));
    container.querySelector('#gd-edit-btn').addEventListener('click', () => {
      isEditing = true;
      renderDetail();
    });
    container.querySelector('#gd-delete-btn').addEventListener('click', async () => {
      const confirmed = await showConfirm('Delete Entry', `Are you sure you want to delete "${entry.name || 'this entry'}"? This cannot be undone.`);
      if (confirmed) {
        await deleteGameDesignEntry(entry.id);
        showToast('Entry deleted', 'success');
        navigate('gamedesign');
      }
    });

    // Image lightbox
    container.querySelectorAll('.image-gallery-item').forEach(item => {
      item.addEventListener('click', () => {
        const img = images.find(i => i.id === item.dataset.imgId);
        if (img) showLightbox(img.data);
      });
    });
  }

  // ── EDIT MODE ──

  async function renderEditMode(container, entry, cat, details, images, characters, isNew) {
    const currentTags = [...(entry.tags || [])];

    container.innerHTML = `
      <div class="detail-page">
        <div class="page-header">
          <div class="page-header-row">
            <h1 class="page-title">${isNew ? 'New Entry' : 'Edit Entry'}</h1>
            <div class="flex gap-3">
              <button class="btn btn-secondary" id="gd-cancel-btn">Cancel</button>
              <button class="btn btn-primary" id="gd-save-btn">💾 Save</button>
            </div>
          </div>
        </div>

        <!-- Basic Fields -->
        <div class="detail-section">
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Name</label>
              <input class="form-input" id="gd-name" value="${escapeHtml(entry.name || '')}" placeholder="Entry name…" />
            </div>
            <div class="form-group">
              <label class="form-label">Category</label>
              <select class="form-select" id="gd-category">
                ${CATEGORIES.map(c => `
                  <option value="${c.key}" ${entry.category === c.key ? 'selected' : ''}>${c.icon} ${c.label}</option>
                `).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- Dynamic Category Fields -->
        <div class="detail-section" id="gd-category-fields">
          ${renderCategoryEditFields(entry.category, details, characters)}
        </div>

        <!-- Rich Text Content -->
        <div class="detail-section">
          <h3 class="detail-section-title">📄 Description</h3>
          <div id="gd-editor-container"></div>
        </div>

        <!-- Tags -->
        <div class="detail-section">
          <h3 class="detail-section-title">🏷️ Tags</h3>
          <div class="tag-input-wrapper" id="gd-tag-wrapper">
            ${currentTags.map(t => `
              <span class="tag">${escapeHtml(t)}<button class="tag-remove" data-tag="${escapeHtml(t)}">✕</button></span>
            `).join('')}
            <input type="text" id="gd-tag-input" placeholder="Add tag and press Enter…" />
          </div>
        </div>

        <!-- Images -->
        <div class="detail-section">
          <h3 class="detail-section-title">🎨 Concept Art</h3>
          ${images.length > 0 ? `
            <div class="image-gallery-grid mb-4" id="gd-images">
              ${images.map(img => `
                <div class="image-gallery-item" data-img-id="${img.id}">
                  <img src="${img.data}" alt="${escapeHtml(img.name || '')}" />
                  <div class="image-overlay">
                    <span style="color:#fff; font-size:var(--fs-sm);">${escapeHtml(img.name || '')}</span>
                    <div class="image-actions">
                      <button class="btn btn-icon btn-danger btn-sm img-delete-btn" data-img-id="${img.id}" style="width:24px;height:24px;font-size:var(--fs-xs);">✕</button>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
          <div id="gd-upload-zone"></div>
        </div>
      </div>
    `;

    // ── Initialize Editor ──
    const editor = await createEditor(
      container.querySelector('#gd-editor-container'),
      { placeholder: 'Describe this entry…', initialContent: entry.content || '' }
    );

    // ── Upload Zone ──
    const uploadZone = createImageUploadZone(async (files) => {
      for (const file of files) {
        const dataUrl = await fileToDataURL(file);
        const imgRecord = await saveImage({
          entityType: 'gamedesign',
          entityId: entry.id || '__pending__',
          name: file.name,
          data: dataUrl,
        });
        images.push(imgRecord);
      }
      showToast(`${files.length} image(s) uploaded`, 'success');
      renderDetail();
    });
    container.querySelector('#gd-upload-zone').appendChild(uploadZone);

    // ── Category Switcher ──
    const categorySelect = container.querySelector('#gd-category');
    categorySelect.addEventListener('change', () => {
      const fieldsContainer = container.querySelector('#gd-category-fields');
      fieldsContainer.innerHTML = renderCategoryEditFields(categorySelect.value, details, characters);
    });

    // ── Tag Management ──
    const tagInput = container.querySelector('#gd-tag-input');
    const tagWrapper = container.querySelector('#gd-tag-wrapper');

    tagWrapper.addEventListener('click', (e) => {
      if (e.target === tagWrapper) tagInput.focus();
    });

    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = tagInput.value.trim();
        if (val && !currentTags.includes(val)) {
          currentTags.push(val);
          const tagEl = document.createElement('span');
          tagEl.className = 'tag';
          tagEl.innerHTML = `${escapeHtml(val)}<button class="tag-remove" data-tag="${escapeHtml(val)}">✕</button>`;
          tagWrapper.insertBefore(tagEl, tagInput);
        }
        tagInput.value = '';
      }
    });

    tagWrapper.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.tag-remove');
      if (removeBtn) {
        const tagVal = removeBtn.dataset.tag;
        const idx = currentTags.indexOf(tagVal);
        if (idx > -1) currentTags.splice(idx, 1);
        removeBtn.parentElement.remove();
      }
    });

    // ── Image Delete ──
    container.querySelectorAll('.img-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const imgId = btn.dataset.imgId;
        const confirmed = await showConfirm('Delete Image', 'Remove this image?');
        if (confirmed) {
          await deleteImage(imgId);
          images = images.filter(i => i.id !== imgId);
          showToast('Image removed', 'success');
          renderDetail();
        }
      });
    });

    // ── Image Lightbox ──
    container.querySelectorAll('.image-gallery-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.img-delete-btn')) return;
        const img = images.find(i => i.id === item.dataset.imgId);
        if (img) showLightbox(img.data);
      });
    });

    // ── Cancel ──
    container.querySelector('#gd-cancel-btn').addEventListener('click', () => {
      if (isNew) {
        navigate('gamedesign');
      } else {
        isEditing = false;
        renderDetail();
      }
    });

    // ── Save ──
    container.querySelector('#gd-save-btn').addEventListener('click', async () => {
      const name = container.querySelector('#gd-name').value.trim();
      if (!name) {
        showToast('Please enter a name', 'error');
        return;
      }

      const category = categorySelect.value;
      const content = editor.getContent();

      // Gather category-specific details
      const newDetails = gatherCategoryDetails(container, category);

      entry.name = name;
      entry.category = category;
      entry.content = content;
      entry.tags = [...currentTags];
      entry.details = newDetails;

      const saved = await saveGameDesignEntry(entry);

      // Update pending images if new entry
      if (isNew) {
        for (const img of images) {
          if (img.entityId === '__pending__') {
            img.entityId = saved.id;
            await saveImage(img);
          }
        }
      }

      entry = saved;
      isEditing = false;
      showToast('Entry saved!', 'success');

      if (isNew) {
        navigate(`gamedesign/${saved.id}`);
      } else {
        images = await getImagesForEntity('gamedesign', entry.id);
        renderDetail();
      }
    });
  }

  await renderDetail();
}

// ── Category-specific View Fields ──────────────────────────────

function renderCategoryViewFields(category, details) {
  if (!details || Object.keys(details).length === 0) return '';

  switch (category) {
    case 'ability':
      return `
        <div class="detail-section">
          <h3 class="detail-section-title">⚡ Ability Details</h3>
          <div class="grid-2" style="gap:var(--sp-4);">
            ${fieldRow('Type', details.type)}
            ${fieldRow('Character Assignment', details.characterAssignment)}
            ${fieldRow('Input Chain', details.inputChain)}
            ${fieldRow('Cancel Timings / Windows', details.cancelTimings)}
            ${fieldRow('Frame Data (S/A/R)', details.frameData)}
            ${fieldRow('Stagger Build Value', details.staggerValue)}
          </div>
          ${details.damageNotes ? `
            <div class="mt-4">
              <div class="form-label mb-2">Damage & Scaling Notes</div>
              <div class="detail-section-content" style="background:var(--bg-elevated); padding:var(--sp-3); border-radius:var(--radius-md);">${escapeHtml(details.damageNotes)}</div>
            </div>
          ` : ''}
          ${details.comboNotes ? `
            <div class="mt-4">
              <div class="form-label mb-2">Combo & Chain Synergy Notes</div>
              <div class="detail-section-content" style="background:var(--bg-elevated); padding:var(--sp-3); border-radius:var(--radius-md);">${escapeHtml(details.comboNotes)}</div>
            </div>
          ` : ''}
        </div>
      `;

    case 'enemy':
      return `
        <div class="detail-section">
          <h3 class="detail-section-title">👾 Enemy Design Details</h3>
          <div class="grid-2" style="gap:var(--sp-4);">
            ${fieldRow('Enemy Type', details.type)}
            ${fieldRow('Spawn Location', details.location)}
            ${fieldRow('Stagger Threshold (HP)', details.staggerThreshold)}
          </div>
          ${textBlock('Attack Patterns & Sequences', details.attackPatterns)}
          ${textBlock('Telegraph Cues (Visual/Audio parry cues)', details.telegraphCues)}
          ${textBlock('AI Battle Stages & Behavior Script', details.aiStages)}
          ${textBlock('Weaknesses & Vulnerability States', details.weaknesses)}
          ${textBlock('Character Lore & Context', details.lore)}
          ${textBlock('Design Intent & Player Experience Goal', details.designIntent)}
        </div>
      `;

    default:
      return '';
  }
}

function fieldRow(label, value) {
  if (!value) return '';
  return `
    <div>
      <div class="form-label mb-2">${escapeHtml(label)}</div>
      <div style="color:var(--text-primary); font-weight:var(--fw-medium); font-family:var(--font-hud);">${escapeHtml(value)}</div>
    </div>
  `;
}

function textBlock(label, value) {
  if (!value) return '';
  return `
    <div class="mt-4">
      <div class="form-label mb-2">${escapeHtml(label)}</div>
      <div class="detail-section-content" style="background:var(--bg-elevated); padding:var(--sp-3); border-radius:var(--radius-md); white-space:pre-wrap; font-family:var(--font-body);">${escapeHtml(value)}</div>
    </div>
  `;
}

// ── Category-specific Edit Fields ──────────────────────────────

function renderCategoryEditFields(category, details, characters) {
  details = details || {};
  const chars = characters || [];

  switch (category) {
    case 'ability':
      return `
        <h3 class="detail-section-title">⚡ Ability Details</h3>
        <div class="grid-2" style="gap:var(--sp-4);">
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-select" id="gd-detail-type">
              <option value="">Select type…</option>
              ${ABILITY_TYPES.map(t => `<option value="${t}" ${details.type === t ? 'selected' : ''}>${t}</option>`).join('')}
              <option value="Stance" ${details.type === 'Stance' ? 'selected' : ''}>Stance</option>
              <option value="Parry" ${details.type === 'Parry' ? 'selected' : ''}>Parry</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Character Assignment</label>
            ${chars.length > 0 ? `
              <select class="form-select" id="gd-detail-character">
                <option value="">Unassigned</option>
                ${chars.map(c => `<option value="${escapeHtml(c.name)}" ${details.characterAssignment === c.name ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
              </select>
            ` : `
              <input class="form-input" id="gd-detail-character" value="${escapeHtml(details.characterAssignment || '')}" placeholder="Character name…" />
            `}
          </div>
          <div class="form-group">
            <label class="form-label">Input Chain (e.g. Forward + X -> Y)</label>
            <input class="form-input" id="gd-detail-input-chain" value="${escapeHtml(details.inputChain || '')}" placeholder="Button sequence…" style="font-family:var(--font-hud);" />
          </div>
          <div class="form-group">
            <label class="form-label">Cancel Timings / Windows (e.g. Frames 10-22)</label>
            <input class="form-input" id="gd-detail-cancel-timings" value="${escapeHtml(details.cancelTimings || '')}" placeholder="Jump/Dodge cancel windows…" />
          </div>
          <div class="form-group">
            <label class="form-label">Frame Data (e.g. Startup 8, Active 3, Recovery 12)</label>
            <input class="form-input" id="gd-detail-frame-data" value="${escapeHtml(details.frameData || '')}" placeholder="Frame counts…" style="font-family:var(--font-hud);" />
          </div>
          <div class="form-group">
            <label class="form-label">Stagger Build Value</label>
            <input class="form-input" id="gd-detail-stagger" value="${escapeHtml(details.staggerValue || '')}" placeholder="e.g. 50 stagger dmg" />
          </div>
        </div>
        <div class="form-group mt-4">
          <label class="form-label">Damage & Scaling Notes</label>
          <textarea class="form-textarea" id="gd-detail-damage-notes" rows="2" placeholder="Damage scaling, hit count, sweetspots…">${escapeHtml(details.damageNotes || '')}</textarea>
        </div>
        <div class="form-group mt-4">
          <label class="form-label">Combo & Synergy Notes</label>
          <textarea class="form-textarea" id="gd-detail-combo" rows="3" placeholder="Chaining rules, launchers, wallbounces…">${escapeHtml(details.comboNotes || '')}</textarea>
        </div>
      `;

    case 'enemy':
      return `
        <h3 class="detail-section-title">👾 Enemy Design Details</h3>
        <div class="grid-2" style="gap:var(--sp-4);">
          <div class="form-group">
            <label class="form-label">Enemy Type</label>
            <select class="form-select" id="gd-detail-type">
              <option value="">Select type…</option>
              ${ENEMY_TYPES.map(t => `<option value="${t}" ${details.type === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Spawn Location</label>
            <input class="form-input" id="gd-detail-location" value="${escapeHtml(details.location || '')}" placeholder="Where is this enemy found?" />
          </div>
          <div class="form-group">
            <label class="form-label">Stagger Threshold (HP)</label>
            <input class="form-input" id="gd-detail-stagger-threshold" value="${escapeHtml(details.staggerThreshold || '')}" placeholder="e.g. 1500 stagger points" style="font-family:var(--font-hud);" />
          </div>
        </div>
        <div class="form-group mt-4">
          <label class="form-label">Attack Patterns & Sequences</label>
          <textarea class="form-textarea" id="gd-detail-attacks" rows="3" placeholder="Describe move telegraphs, windups, attack timing counts…">${escapeHtml(details.attackPatterns || '')}</textarea>
        </div>
        <div class="form-group mt-4">
          <label class="form-label">Telegraph Cues (Visual/Audio parry prompts)</label>
          <textarea class="form-textarea" id="gd-detail-telegraph" rows="2" placeholder="e.g. Glints red 18 frames before sweep, growls before charge…">${escapeHtml(details.telegraphCues || '')}</textarea>
        </div>
        <div class="form-group mt-4">
          <label class="form-label">AI Battle Stages & Behavior Script</label>
          <textarea class="form-textarea" id="gd-detail-ai-stages" rows="3" placeholder="e.g. Phase 2 trigger <50% HP: increases aggression, unlocks air spin…">${escapeHtml(details.aiStages || '')}</textarea>
        </div>
        <div class="form-group mt-4">
          <label class="form-label">Weaknesses & Vulnerability States</label>
          <textarea class="form-textarea" id="gd-detail-weaknesses" rows="2" placeholder="Stagger vulnerabilities, element counters…">${escapeHtml(details.weaknesses || '')}</textarea>
        </div>
        <div class="form-group mt-4">
          <label class="form-label">Character Lore</label>
          <textarea class="form-textarea" id="gd-detail-lore" rows="2" placeholder="Origin story, description…">${escapeHtml(details.lore || '')}</textarea>
        </div>
        <div class="form-group mt-4">
          <label class="form-label">Design Intent</label>
          <textarea class="form-textarea" id="gd-detail-intent" rows="2" placeholder="What is the purpose of this enemy in combat pacing?">${escapeHtml(details.designIntent || '')}</textarea>
        </div>
      `;

    case 'progression':
      return `
        <h3 class="detail-section-title">📈 Progression Details</h3>
        <p class="text-secondary" style="font-size:var(--fs-sm);">Use the description editor below for skill trees, level-up systems, and unlock details.</p>
      `;

    case 'combat':
      return `
        <h3 class="detail-section-title">⚔️ Combat Details</h3>
        <p class="text-secondary" style="font-size:var(--fs-sm);">Use the description editor below for combo systems, dodge/parry mechanics, stagger details, and more.</p>
      `;

    case 'notes':
      return `
        <h3 class="detail-section-title">📝 Notes</h3>
        <p class="text-secondary" style="font-size:var(--fs-sm);">Freeform notes — use the rich text editor below for anything.</p>
      `;

    default:
      return '';
  }
}

// ── Gather details from the form ───────────────────────────────

function gatherCategoryDetails(container, category) {
  const get = (id) => {
    const el = container.querySelector(id);
    return el ? el.value.trim() : '';
  };

  switch (category) {
    case 'ability':
      return {
        type: get('#gd-detail-type'),
        characterAssignment: get('#gd-detail-character'),
        inputChain: get('#gd-detail-input-chain'),
        cancelTimings: get('#gd-detail-cancel-timings'),
        frameData: get('#gd-detail-frame-data'),
        staggerValue: get('#gd-detail-stagger'),
        damageNotes: get('#gd-detail-damage-notes'),
        comboNotes: get('#gd-detail-combo'),
      };

    case 'enemy':
      return {
        type: get('#gd-detail-type'),
        location: get('#gd-detail-location'),
        staggerThreshold: get('#gd-detail-stagger-threshold'),
        attackPatterns: get('#gd-detail-attacks'),
        telegraphCues: get('#gd-detail-telegraph'),
        aiStages: get('#gd-detail-ai-stages'),
        weaknesses: get('#gd-detail-weaknesses'),
        lore: get('#gd-detail-lore'),
        designIntent: get('#gd-detail-intent'),
      };

    default:
      return {};
  }
}

/* ============================================================
   Forge — Story Page
   Narrative planning: synopsis, acts, plot points, themes, dialogue.
   ============================================================ */

import {
  getAllStoryEntries,
  getStoryEntriesByCategory,
  getStoryEntry,
  saveStoryEntry,
  deleteStoryEntry,
  generateId,
  getAllCharacters,
} from '../db.js';
import { navigate } from '../router.js';
import {
  showToast,
  showConfirm,
  createEditor,
  renderQuillContent,
  timeAgo,
  escapeHtml,
} from '../ui.js';

/* ---------- Constants ---------- */

const CATEGORIES = [
  { key: 'all', label: 'All', icon: '📖' },
  { key: 'synopsis', label: 'Synopsis', icon: '📋' },
  { key: 'act', label: 'Acts', icon: '🎬' },
  { key: 'plotpoint', label: 'Plot Points', icon: '💥' },
  { key: 'theme', label: 'Themes', icon: '💡' },
  { key: 'dialogue', label: 'Dialogue', icon: '💬' },
];

const CATEGORY_ICONS = {
  synopsis: '📋',
  act: '🎬',
  plotpoint: '💥',
  theme: '💡',
  dialogue: '💬',
};

const CATEGORY_COLORS = {
  synopsis: 'var(--accent-secondary)',
  act: 'var(--accent-primary)',
  plotpoint: 'var(--accent-red)',
  theme: 'var(--accent-purple)',
  dialogue: 'var(--accent-green)',
};

const CATEGORY_DIM_COLORS = {
  synopsis: 'var(--accent-secondary-dim)',
  act: 'var(--accent-primary-dim)',
  plotpoint: 'var(--accent-red-dim)',
  theme: 'var(--accent-purple-dim)',
  dialogue: 'var(--accent-green-dim)',
};

const ACT_STATUSES = ['Outline', 'Draft', 'Revised', 'Final'];

const BEAT_TYPES = [
  'Climax',
  'Twist',
  'Reveal',
  'Boss Encounter',
  'Emotional Beat',
  'Setup',
  'Payoff',
];

/* ---------- Helpers ---------- */

function getCategoryLabel(key) {
  const cat = CATEGORIES.find(c => c.key === key);
  return cat ? cat.label : key;
}

function getExcerpt(content, maxLen = 120) {
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

/* ============================================================
   LIST VIEW
   ============================================================ */

export async function renderStory(container) {
  let activeTab = 'all';
  let searchQuery = '';

  const allEntries = await getAllStoryEntries();

  // Sort by updatedAt descending
  allEntries.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <h1 class="page-title">Story</h1>
          <p class="page-subtitle">Plan your narrative</p>
        </div>
        <div class="flex gap-3">
          <button class="btn btn-primary" id="new-entry-btn">+ New Entry</button>
        </div>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="toolbar mb-6">
      <div class="toolbar-search">
        <span class="search-icon">🔍</span>
        <input type="text" placeholder="Search story entries…" id="story-search" />
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs" id="category-tabs"></div>

    <!-- Entry Grid -->
    <div id="story-grid"></div>
  `;

  const tabsEl = container.querySelector('#category-tabs');
  const gridEl = container.querySelector('#story-grid');
  const searchInput = container.querySelector('#story-search');

  // --- Render tabs ---
  function renderTabs() {
    tabsEl.innerHTML = CATEGORIES.map(cat => {
      const count = cat.key === 'all'
        ? allEntries.length
        : allEntries.filter(e => e.category === cat.key).length;
      return `
        <button class="tab${activeTab === cat.key ? ' active' : ''}" data-tab="${cat.key}">
          ${cat.icon} ${cat.label}
          <span style="margin-left:4px; font-size:var(--fs-xs); color:var(--text-muted);">(${count})</span>
        </button>
      `;
    }).join('');

    tabsEl.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        renderTabs();
        renderGrid();
      });
    });
  }

  // --- Render grid ---
  function renderGrid() {
    let entries = activeTab === 'all'
      ? allEntries
      : allEntries.filter(e => e.category === activeTab);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      entries = entries.filter(e => {
        const name = (e.name || e.title || '').toLowerCase();
        const excerpt = getExcerpt(e.content, 500).toLowerCase();
        return name.includes(q) || excerpt.includes(q);
      });
    }

    // For acts, sort by order
    if (activeTab === 'act') {
      entries.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    if (entries.length === 0) {
      gridEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${activeTab === 'all' ? '📖' : (CATEGORY_ICONS[activeTab] || '📖')}</div>
          <h2 class="empty-state-title">${searchQuery ? 'No results found' : 'No story entries yet'}</h2>
          <p class="empty-state-text">
            ${searchQuery
              ? 'Try a different search term or clear the filter.'
              : 'Start building your narrative by creating your first story entry.'}
          </p>
          ${!searchQuery ? '<button class="btn btn-primary" id="empty-new-btn">+ Create Entry</button>' : ''}
        </div>
      `;
      const emptyBtn = gridEl.querySelector('#empty-new-btn');
      if (emptyBtn) emptyBtn.addEventListener('click', () => navigate('story/new'));
      return;
    }

    gridEl.innerHTML = `
      <div class="grid-auto" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));">
        ${entries.map(entry => {
          const icon = CATEGORY_ICONS[entry.category] || '📖';
          const color = CATEGORY_COLORS[entry.category] || 'var(--text-secondary)';
          const dimColor = CATEGORY_DIM_COLORS[entry.category] || 'var(--bg-elevated)';
          const title = escapeHtml(entry.name || entry.title || 'Untitled');
          const excerpt = escapeHtml(getExcerpt(entry.content));
          const catLabel = getCategoryLabel(entry.category);
          const updated = timeAgo(entry.updatedAt);

          // Extra info based on category
          let extra = '';
          if (entry.category === 'act' && entry.order != null) {
            extra = `<span style="font-size:var(--fs-xs); color:var(--text-muted); margin-left:auto;">Act ${entry.order}</span>`;
          }
          if (entry.category === 'act' && entry.details?.status) {
            const statusColor = entry.details.status === 'Final' ? 'var(--accent-green)'
              : entry.details.status === 'Revised' ? 'var(--accent-secondary)'
              : entry.details.status === 'Draft' ? 'var(--accent-primary)'
              : 'var(--text-tertiary)';
            extra += `<span class="tag" style="border-color:${statusColor}; color:${statusColor};">${escapeHtml(entry.details.status)}</span>`;
          }
          if (entry.category === 'plotpoint' && entry.details?.beatType) {
            extra += `<span class="tag" style="border-color:var(--accent-red); color:var(--accent-red);">${escapeHtml(entry.details.beatType)}</span>`;
          }

          return `
            <div class="card card-clickable card-sm story-entry-card" data-id="${entry.id}" style="display:flex; flex-direction:column; gap:var(--sp-3);">
              <!-- Top row: icon + category -->
              <div class="flex items-center gap-3">
                <div style="
                  width:40px; height:40px; border-radius:var(--radius-md);
                  background:${dimColor}; color:${color};
                  display:flex; align-items:center; justify-content:center;
                  font-size:1.25rem; flex-shrink:0;
                ">${icon}</div>
                <div style="flex:1; min-width:0;">
                  <div style="font-weight:var(--fw-bold); font-family:var(--font-heading); color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${title}
                  </div>
                  <div style="font-size:var(--fs-xs); color:var(--text-tertiary);">
                    <span class="tag" style="font-size:var(--fs-xs); padding:1px 6px; background:${dimColor}; color:${color}; border-color:transparent;">
                      ${catLabel}
                    </span>
                  </div>
                </div>
                ${extra}
              </div>

              <!-- Excerpt -->
              ${excerpt ? `
                <div style="font-size:var(--fs-sm); color:var(--text-tertiary); line-height:var(--lh-relaxed); display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">
                  ${excerpt}
                </div>
              ` : ''}

              <!-- Tags + time -->
              <div class="flex items-center justify-between" style="margin-top:auto;">
                <div class="flex flex-wrap gap-1">
                  ${(entry.tags || []).slice(0, 3).map(t =>
                    `<span class="tag" style="font-size:var(--fs-xs);">${escapeHtml(t)}</span>`
                  ).join('')}
                  ${(entry.tags || []).length > 3 ? `<span class="tag" style="font-size:var(--fs-xs);">+${entry.tags.length - 3}</span>` : ''}
                </div>
                <span style="font-size:var(--fs-xs); color:var(--text-muted); flex-shrink:0;">${updated}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Click handlers
    gridEl.querySelectorAll('.story-entry-card').forEach(card => {
      card.addEventListener('click', () => navigate(`story/${card.dataset.id}`));
    });
  }

  // --- Events ---
  container.querySelector('#new-entry-btn').addEventListener('click', () => navigate('story/new'));

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    renderGrid();
  });

  renderTabs();
  renderGrid();
}


/* ============================================================
   DETAIL / EDIT VIEW
   ============================================================ */

export async function renderStoryDetail(container, params) {
  const isNew = params.id === 'new';
  let entry = isNew ? null : await getStoryEntry(params.id);

  if (!isNew && !entry) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <h2 class="empty-state-title">Entry Not Found</h2>
        <p class="empty-state-text">This story entry may have been deleted.</p>
        <button class="btn btn-primary" id="back-btn">← Back to Story</button>
      </div>
    `;
    container.querySelector('#back-btn').addEventListener('click', () => navigate('story'));
    return;
  }

  let isEditing = isNew;

  if (isNew) {
    entry = {
      id: '',
      name: '',
      title: '',
      category: 'synopsis',
      content: '',
      tags: [],
      order: null,
      details: {},
      createdAt: '',
      updatedAt: '',
    };
  }

  // Pre-fetch characters for dropdowns
  const allCharacters = await getAllCharacters();

  async function render() {
    if (isEditing) {
      await renderEditMode(container, entry, isNew, allCharacters, () => {
        isEditing = false;
        render();
      });
    } else {
      renderViewMode(container, entry, allCharacters, () => {
        isEditing = true;
        render();
      });
    }
  }

  await render();
}


/* ---------- VIEW MODE ---------- */

function renderViewMode(container, entry, allCharacters, onEdit) {
  const icon = CATEGORY_ICONS[entry.category] || '📖';
  const color = CATEGORY_COLORS[entry.category] || 'var(--text-secondary)';
  const dimColor = CATEGORY_DIM_COLORS[entry.category] || 'var(--bg-elevated)';
  const catLabel = getCategoryLabel(entry.category);
  const title = escapeHtml(entry.name || entry.title || 'Untitled');

  container.innerHTML = `
    <div class="detail-page">
      <!-- Back + actions -->
      <div class="flex items-center justify-between">
        <button class="btn btn-ghost" id="back-btn">← Back to Story</button>
        <div class="flex gap-2">
          <button class="btn btn-secondary" id="edit-btn">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" id="delete-btn">🗑️ Delete</button>
        </div>
      </div>

      <!-- Header -->
      <div class="detail-header" style="flex-direction: column; align-items: flex-start; gap: var(--sp-4);">
        <div class="flex items-center gap-4">
          <div style="
            width:56px; height:56px; border-radius:var(--radius-lg);
            background:${dimColor}; color:${color};
            display:flex; align-items:center; justify-content:center;
            font-size:1.75rem; flex-shrink:0;
          ">${icon}</div>
          <div>
            <h1 class="detail-name">${title}</h1>
            <div class="detail-badges mt-2">
              <span class="tag" style="background:${dimColor}; color:${color}; border-color:transparent; font-size:var(--fs-sm); padding:3px 10px;">
                ${icon} ${catLabel}
              </span>
              ${entry.category === 'act' && entry.order != null ? `
                <span class="tag" style="font-size:var(--fs-sm); padding:3px 10px;">Act ${entry.order}</span>
              ` : ''}
              ${entry.category === 'act' && entry.details?.status ? `
                <span class="status-badge ${entry.details.status === 'Final' ? 'alive' : entry.details.status === 'Draft' ? 'unknown' : 'sealed'}">${escapeHtml(entry.details.status)}</span>
              ` : ''}
              ${entry.category === 'plotpoint' && entry.details?.beatType ? `
                <span class="tag" style="background:var(--accent-red-dim); color:var(--accent-red); border-color:transparent; font-size:var(--fs-sm); padding:3px 10px;">
                  ${escapeHtml(entry.details.beatType)}
                </span>
              ` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Content -->
      <div class="detail-section">
        <h3 class="detail-section-title">📝 Content</h3>
        <div class="detail-section-content">${renderQuillContent(entry.content)}</div>
      </div>

      <!-- Category-specific sections -->
      <div id="category-details"></div>

      <!-- Tags -->
      ${(entry.tags && entry.tags.length > 0) ? `
        <div class="detail-section">
          <h3 class="detail-section-title">🏷️ Tags</h3>
          <div class="tags-container">
            ${entry.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Metadata -->
      <div style="font-size:var(--fs-xs); color:var(--text-muted); display:flex; gap:var(--sp-6);">
        ${entry.createdAt ? `<span>Created ${timeAgo(entry.createdAt)}</span>` : ''}
        ${entry.updatedAt ? `<span>Updated ${timeAgo(entry.updatedAt)}</span>` : ''}
      </div>
    </div>
  `;

  // Category-specific detail sections
  const detailsEl = container.querySelector('#category-details');
  renderCategoryDetails(detailsEl, entry, allCharacters);

  // Events
  container.querySelector('#back-btn').addEventListener('click', () => navigate('story'));
  container.querySelector('#edit-btn').addEventListener('click', onEdit);
  container.querySelector('#delete-btn').addEventListener('click', async () => {
    const confirmed = await showConfirm(
      'Delete Entry',
      `Are you sure you want to delete "${escapeHtml(entry.name || entry.title)}"? This action cannot be undone.`
    );
    if (confirmed) {
      await deleteStoryEntry(entry.id);
      showToast('Entry deleted', 'success');
      navigate('story');
    }
  });
}


function renderCategoryDetails(container, entry, allCharacters) {
  const details = entry.details || {};
  let html = '';

  if (entry.category === 'act') {
    const involvedNames = (details.involvedCharacters || []).map(id => {
      const c = allCharacters.find(ch => ch.id === id);
      return c ? escapeHtml(c.name) : '(unknown)';
    });

    html += `
      <div class="detail-section">
        <h3 class="detail-section-title">🎬 Act Details</h3>
        <div class="grid-2" style="gap:var(--sp-4);">
          <div class="form-group">
            <span class="form-label">Status</span>
            <span style="color:var(--text-primary); font-weight:var(--fw-medium);">${escapeHtml(details.status || '—')}</span>
          </div>
          <div class="form-group">
            <span class="form-label">Order</span>
            <span style="color:var(--text-primary); font-weight:var(--fw-medium);">${entry.order != null ? entry.order : '—'}</span>
          </div>
        </div>
        ${details.keyEvents ? `
          <div class="mt-4">
            <span class="form-label">Key Events</span>
            <div class="detail-section-content mt-2">${renderQuillContent(details.keyEvents)}</div>
          </div>
        ` : ''}
        ${involvedNames.length > 0 ? `
          <div class="mt-4">
            <span class="form-label">Involved Characters</span>
            <div class="tags-container mt-2">
              ${involvedNames.map(n => `<span class="tag">👤 ${n}</span>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  if (entry.category === 'plotpoint') {
    const charNames = (details.characters || []).map(id => {
      const c = allCharacters.find(ch => ch.id === id);
      return c ? escapeHtml(c.name) : '(unknown)';
    });

    html += `
      <div class="detail-section">
        <h3 class="detail-section-title">💥 Plot Point Details</h3>
        <div class="grid-2" style="gap:var(--sp-4);">
          ${details.beatType ? `
            <div class="form-group">
              <span class="form-label">Beat Type</span>
              <span class="tag" style="background:var(--accent-red-dim); color:var(--accent-red); border-color:transparent;">${escapeHtml(details.beatType)}</span>
            </div>
          ` : ''}
          ${details.location ? `
            <div class="form-group">
              <span class="form-label">Location</span>
              <span style="color:var(--text-primary);">📍 ${escapeHtml(details.location)}</span>
            </div>
          ` : ''}
          ${details.act ? `
            <div class="form-group">
              <span class="form-label">Act Reference</span>
              <span style="color:var(--text-primary);">🎬 ${escapeHtml(details.act)}</span>
            </div>
          ` : ''}
        </div>
        ${charNames.length > 0 ? `
          <div class="mt-4">
            <span class="form-label">Characters Involved</span>
            <div class="tags-container mt-2">
              ${charNames.map(n => `<span class="tag">👤 ${n}</span>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  if (entry.category === 'dialogue') {
    const speaker = details.speaker
      ? allCharacters.find(c => c.id === details.speaker)
      : null;

    html += `
      <div class="detail-section">
        <h3 class="detail-section-title">💬 Dialogue Details</h3>
        <div class="grid-2" style="gap:var(--sp-4);">
          <div class="form-group">
            <span class="form-label">Speaker</span>
            <span style="color:var(--text-primary); font-weight:var(--fw-medium);">
              ${speaker ? `👤 ${escapeHtml(speaker.name)}` : '—'}
            </span>
          </div>
          ${details.context ? `
            <div class="form-group">
              <span class="form-label">Context</span>
              <span style="color:var(--text-secondary);">${escapeHtml(details.context)}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // themes just use main content — no extra section needed unless we want to show something
  container.innerHTML = html;
}


/* ---------- EDIT MODE ---------- */

async function renderEditMode(container, entry, isNew, allCharacters, onCancel) {
  const title = isNew ? 'New Story Entry' : `Edit: ${escapeHtml(entry.name || entry.title || 'Untitled')}`;

  container.innerHTML = `
    <div class="detail-page">
      <!-- Back -->
      <div class="flex items-center justify-between">
        <button class="btn btn-ghost" id="cancel-btn">← ${isNew ? 'Back to Story' : 'Cancel'}</button>
        <h2 style="font-family:var(--font-heading); font-weight:var(--fw-bold); font-size:var(--fs-xl);">${title}</h2>
        <div style="width:120px;"></div>
      </div>

      <div class="card" style="padding:var(--sp-6);">
        <div class="flex flex-col gap-6">
          <!-- Row: Title + Category -->
          <div class="grid-2" style="gap:var(--sp-4);">
            <div class="form-group">
              <label class="form-label">Title</label>
              <input class="form-input" id="entry-title" value="${escapeHtml(entry.name || entry.title || '')}" placeholder="Enter a title…" />
            </div>
            <div class="form-group">
              <label class="form-label">Category</label>
              <select class="form-select" id="entry-category">
                ${CATEGORIES.filter(c => c.key !== 'all').map(c =>
                  `<option value="${c.key}" ${entry.category === c.key ? 'selected' : ''}>${c.icon} ${c.label}</option>`
                ).join('')}
              </select>
            </div>
          </div>

          <!-- Content editor -->
          <div class="form-group">
            <label class="form-label">Content</label>
            <div id="content-editor"></div>
          </div>

          <!-- Category-specific fields -->
          <div id="category-fields"></div>

          <!-- Tags -->
          <div class="form-group">
            <label class="form-label">Tags</label>
            <div class="tag-input-wrapper" id="tag-wrapper">
              <input type="text" placeholder="Type and press Enter…" id="tag-input" />
            </div>
          </div>

          <!-- Actions -->
          <div class="flex justify-between items-center" style="padding-top:var(--sp-4); border-top:1px solid var(--border-subtle);">
            <div>
              ${!isNew ? '<button class="btn btn-danger" id="delete-btn">🗑️ Delete</button>' : ''}
            </div>
            <div class="flex gap-3">
              <button class="btn btn-secondary" id="cancel-btn-2">Cancel</button>
              <button class="btn btn-primary btn-lg" id="save-btn">
                ${isNew ? '✨ Create Entry' : '💾 Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // --- Quill editor ---
  const editorContainer = container.querySelector('#content-editor');
  const editor = await createEditor(editorContainer, {
    placeholder: 'Write your story content…',
    initialContent: entry.content || '',
  });

  // --- Category-specific field editors ---
  let keyEventsEditor = null;
  const categoryFieldsEl = container.querySelector('#category-fields');
  const categorySelect = container.querySelector('#entry-category');

  async function renderCategoryFields() {
    const cat = categorySelect.value;
    const details = entry.details || {};
    categoryFieldsEl.innerHTML = '';
    keyEventsEditor = null;

    if (cat === 'act') {
      categoryFieldsEl.innerHTML = `
        <div class="card card-flat" style="padding:var(--sp-5);">
          <h4 style="font-family:var(--font-heading); font-weight:var(--fw-bold); color:var(--text-primary); margin-bottom:var(--sp-4);">🎬 Act Details</h4>
          <div class="grid-2" style="gap:var(--sp-4);">
            <div class="form-group">
              <label class="form-label">Act Order</label>
              <input class="form-input" type="number" id="act-order" value="${entry.order != null ? entry.order : ''}" placeholder="e.g. 1, 2, 3" min="1" />
            </div>
            <div class="form-group">
              <label class="form-label">Status</label>
              <select class="form-select" id="act-status">
                <option value="">Select status…</option>
                ${ACT_STATUSES.map(s => `<option value="${s}" ${details.status === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group mt-4">
            <label class="form-label">Key Events</label>
            <div id="key-events-editor"></div>
          </div>
          <div class="form-group mt-4">
            <label class="form-label">Involved Characters</label>
            <div class="flex flex-wrap gap-2" id="act-characters">
              ${allCharacters.map(c => {
                const checked = (details.involvedCharacters || []).includes(c.id);
                return `
                  <label class="tag" style="cursor:pointer; ${checked ? 'background:var(--accent-primary-dim); color:var(--accent-primary); border-color:var(--accent-primary);' : ''}">
                    <input type="checkbox" value="${c.id}" ${checked ? 'checked' : ''} style="display:none;" class="char-check" />
                    👤 ${escapeHtml(c.name)}
                  </label>
                `;
              }).join('')}
              ${allCharacters.length === 0 ? '<span class="text-muted" style="font-size:var(--fs-sm);">No characters created yet</span>' : ''}
            </div>
          </div>
        </div>
      `;

      // Character checkbox style toggle
      categoryFieldsEl.querySelectorAll('.char-check').forEach(cb => {
        cb.addEventListener('change', () => {
          const label = cb.closest('.tag');
          if (cb.checked) {
            label.style.background = 'var(--accent-primary-dim)';
            label.style.color = 'var(--accent-primary)';
            label.style.borderColor = 'var(--accent-primary)';
          } else {
            label.style.background = '';
            label.style.color = '';
            label.style.borderColor = '';
          }
        });
      });

      // Key events editor
      const keContainer = categoryFieldsEl.querySelector('#key-events-editor');
      keyEventsEditor = await createEditor(keContainer, {
        placeholder: 'Describe key events in this act…',
        initialContent: details.keyEvents || '',
      });
    }

    if (cat === 'plotpoint') {
      categoryFieldsEl.innerHTML = `
        <div class="card card-flat" style="padding:var(--sp-5);">
          <h4 style="font-family:var(--font-heading); font-weight:var(--fw-bold); color:var(--text-primary); margin-bottom:var(--sp-4);">💥 Plot Point Details</h4>
          <div class="grid-3" style="gap:var(--sp-4);">
            <div class="form-group">
              <label class="form-label">Beat Type</label>
              <select class="form-select" id="pp-beat-type">
                <option value="">Select beat type…</option>
                ${BEAT_TYPES.map(b => `<option value="${b}" ${details.beatType === b ? 'selected' : ''}>${b}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Location</label>
              <input class="form-input" id="pp-location" value="${escapeHtml(details.location || '')}" placeholder="Where does this happen?" />
            </div>
            <div class="form-group">
              <label class="form-label">Act Reference</label>
              <input class="form-input" id="pp-act" value="${escapeHtml(details.act || '')}" placeholder="e.g. Act 1" />
            </div>
          </div>
          <div class="form-group mt-4">
            <label class="form-label">Characters Involved</label>
            <div class="flex flex-wrap gap-2" id="pp-characters">
              ${allCharacters.map(c => {
                const checked = (details.characters || []).includes(c.id);
                return `
                  <label class="tag" style="cursor:pointer; ${checked ? 'background:var(--accent-primary-dim); color:var(--accent-primary); border-color:var(--accent-primary);' : ''}">
                    <input type="checkbox" value="${c.id}" ${checked ? 'checked' : ''} style="display:none;" class="char-check-pp" />
                    👤 ${escapeHtml(c.name)}
                  </label>
                `;
              }).join('')}
              ${allCharacters.length === 0 ? '<span class="text-muted" style="font-size:var(--fs-sm);">No characters created yet</span>' : ''}
            </div>
          </div>
        </div>
      `;

      categoryFieldsEl.querySelectorAll('.char-check-pp').forEach(cb => {
        cb.addEventListener('change', () => {
          const label = cb.closest('.tag');
          if (cb.checked) {
            label.style.background = 'var(--accent-primary-dim)';
            label.style.color = 'var(--accent-primary)';
            label.style.borderColor = 'var(--accent-primary)';
          } else {
            label.style.background = '';
            label.style.color = '';
            label.style.borderColor = '';
          }
        });
      });
    }

    if (cat === 'dialogue') {
      categoryFieldsEl.innerHTML = `
        <div class="card card-flat" style="padding:var(--sp-5);">
          <h4 style="font-family:var(--font-heading); font-weight:var(--fw-bold); color:var(--text-primary); margin-bottom:var(--sp-4);">💬 Dialogue Details</h4>
          <div class="grid-2" style="gap:var(--sp-4);">
            <div class="form-group">
              <label class="form-label">Speaker</label>
              <select class="form-select" id="dlg-speaker">
                <option value="">Select speaker…</option>
                ${allCharacters.map(c =>
                  `<option value="${c.id}" ${details.speaker === c.id ? 'selected' : ''}>👤 ${escapeHtml(c.name)}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Context</label>
              <input class="form-input" id="dlg-context" value="${escapeHtml(details.context || '')}" placeholder="Scene context or situation…" />
            </div>
          </div>
        </div>
      `;
    }

    if (cat === 'theme') {
      categoryFieldsEl.innerHTML = `
        <div class="card card-flat" style="padding:var(--sp-5);">
          <h4 style="font-family:var(--font-heading); font-weight:var(--fw-bold); color:var(--text-primary); margin-bottom:var(--sp-4);">💡 Theme Notes</h4>
          <p style="color:var(--text-tertiary); font-size:var(--fs-sm);">
            Use the content editor above to describe the theme and how it manifests throughout the narrative.
          </p>
        </div>
      `;
    }

    if (cat === 'synopsis') {
      categoryFieldsEl.innerHTML = `
        <div class="card card-flat" style="padding:var(--sp-5);">
          <h4 style="font-family:var(--font-heading); font-weight:var(--fw-bold); color:var(--text-primary); margin-bottom:var(--sp-4);">📋 Synopsis Notes</h4>
          <p style="color:var(--text-tertiary); font-size:var(--fs-sm);">
            Use the content editor above for your full rich text overview of the narrative.
          </p>
        </div>
      `;
    }
  }

  // Initial render of category fields
  await renderCategoryFields();

  // Re-render when category changes
  categorySelect.addEventListener('change', async () => {
    // Reset details when switching categories
    entry.details = {};
    await renderCategoryFields();
  });

  // --- Tags ---
  let currentTags = [...(entry.tags || [])];
  const tagWrapper = container.querySelector('#tag-wrapper');
  const tagInput = container.querySelector('#tag-input');

  function renderTags() {
    // Remove existing tag elements
    tagWrapper.querySelectorAll('.tag').forEach(t => t.remove());
    // Re-add before input
    currentTags.forEach(tag => {
      const tagEl = document.createElement('span');
      tagEl.className = 'tag';
      tagEl.innerHTML = `${escapeHtml(tag)} <button class="tag-remove" data-tag="${escapeHtml(tag)}">✕</button>`;
      tagWrapper.insertBefore(tagEl, tagInput);
    });

    tagWrapper.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentTags = currentTags.filter(t => t !== btn.dataset.tag);
        renderTags();
      });
    });
  }
  renderTags();

  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && tagInput.value.trim()) {
      e.preventDefault();
      const val = tagInput.value.trim();
      if (!currentTags.includes(val)) {
        currentTags.push(val);
        renderTags();
      }
      tagInput.value = '';
    }
    if (e.key === 'Backspace' && !tagInput.value && currentTags.length > 0) {
      currentTags.pop();
      renderTags();
    }
  });

  tagWrapper.addEventListener('click', () => tagInput.focus());

  // --- Save ---
  container.querySelector('#save-btn').addEventListener('click', async () => {
    const nameVal = container.querySelector('#entry-title').value.trim();
    if (!nameVal) {
      showToast('Please enter a title', 'error');
      return;
    }

    const cat = categorySelect.value;

    entry.name = nameVal;
    entry.title = nameVal;
    entry.category = cat;
    entry.content = editor.getContent();
    entry.tags = currentTags;

    // Gather category-specific details
    entry.details = {};

    if (cat === 'act') {
      const orderInput = container.querySelector('#act-order');
      entry.order = orderInput && orderInput.value ? parseInt(orderInput.value, 10) : null;

      const statusSelect = container.querySelector('#act-status');
      entry.details.status = statusSelect ? statusSelect.value : '';

      if (keyEventsEditor) {
        entry.details.keyEvents = keyEventsEditor.getContent();
      }

      const checkedChars = container.querySelectorAll('.char-check:checked');
      entry.details.involvedCharacters = Array.from(checkedChars).map(cb => cb.value);
    }

    if (cat === 'plotpoint') {
      const beatSelect = container.querySelector('#pp-beat-type');
      entry.details.beatType = beatSelect ? beatSelect.value : '';

      const locInput = container.querySelector('#pp-location');
      entry.details.location = locInput ? locInput.value.trim() : '';

      const actInput = container.querySelector('#pp-act');
      entry.details.act = actInput ? actInput.value.trim() : '';

      const checkedChars = container.querySelectorAll('.char-check-pp:checked');
      entry.details.characters = Array.from(checkedChars).map(cb => cb.value);
    }

    if (cat === 'dialogue') {
      const speakerSelect = container.querySelector('#dlg-speaker');
      entry.details.speaker = speakerSelect ? speakerSelect.value : '';

      const ctxInput = container.querySelector('#dlg-context');
      entry.details.context = ctxInput ? ctxInput.value.trim() : '';
    }

    try {
      const saved = await saveStoryEntry(entry);
      entry = saved;
      showToast(isNew ? 'Entry created!' : 'Changes saved!', 'success');
      navigate(`story/${saved.id}`);
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error');
    }
  });

  // --- Cancel ---
  const cancelHandler = () => {
    if (isNew) {
      navigate('story');
    } else {
      onCancel();
    }
  };
  container.querySelector('#cancel-btn').addEventListener('click', cancelHandler);
  const cancelBtn2 = container.querySelector('#cancel-btn-2');
  if (cancelBtn2) cancelBtn2.addEventListener('click', cancelHandler);

  // --- Delete ---
  const deleteBtn = container.querySelector('#delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const confirmed = await showConfirm(
        'Delete Entry',
        `Are you sure you want to delete "${escapeHtml(entry.name || entry.title)}"? This action cannot be undone.`
      );
      if (confirmed) {
        await deleteStoryEntry(entry.id);
        showToast('Entry deleted', 'success');
        navigate('story');
      }
    });
  }
}

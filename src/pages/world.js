/* ============================================================
   Forge — World Page
   Worldbuilding content organized by category.
   ============================================================ */

import * as db from '../db.js';
import { navigate } from '../router.js';
import {
  showToast, showConfirm, showModal, showLightbox,
  escapeHtml, timeAgo, renderQuillContent,
  createEditor, createImageUploadZone, fileToDataURL,
} from '../ui.js';

const CATEGORIES = [
  { id: 'all', label: 'All', icon: '🌐' },
  { id: 'location', label: 'Locations', icon: '📍' },
  { id: 'faction', label: 'Factions', icon: '🏴' },
  { id: 'history', label: 'History', icon: '📜' },
  { id: 'lore', label: 'Lore', icon: '📚' },
  { id: 'item', label: 'Items', icon: '🗡️' },
];

const LOCATION_TYPES = ['City', 'Dungeon', 'Arena', 'Wilderness', 'Sacred Site', 'Ruins', 'Fortress', 'Village', 'Underground', 'Other'];
const ITEM_TYPES = ['Weapon', 'Armor', 'Relic', 'Consumable', 'Key Item', 'Material', 'Other'];

function getCategoryIcon(cat) {
  const found = CATEGORIES.find(c => c.id === cat);
  return found ? found.icon : '📄';
}

// ========== LIST VIEW ==========
export async function renderWorld(container) {
  const entries = await db.getAllWorldEntries();
  let activeTab = 'all';
  let searchQuery = '';

  function getFiltered() {
    let list = entries;
    if (activeTab !== 'all') {
      list = list.filter(e => e.category === activeTab);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(e => e.name && e.name.toLowerCase().includes(q));
    }
    return list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }

  function render() {
    const filtered = getFiltered();

    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-row">
          <div>
            <h1 class="page-title">🌍 World</h1>
            <p class="page-subtitle">Locations, factions, lore, and more</p>
          </div>
          <button class="btn btn-primary" id="new-world-btn">+ New Entry</button>
        </div>
      </div>

      <div class="tabs" id="world-tabs">
        ${CATEGORIES.map(c => `
          <button class="tab ${activeTab === c.id ? 'active' : ''}" data-tab="${c.id}">
            ${c.icon} ${c.label}
          </button>
        `).join('')}
      </div>

      <div class="toolbar mb-6">
        <div class="toolbar-search">
          <span class="search-icon">🔍</span>
          <input type="text" placeholder="Search world entries..." value="${escapeHtml(searchQuery)}" id="world-search" />
        </div>
      </div>

      <div id="world-list">
        ${filtered.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon">🌍</div>
            <h2 class="empty-state-title">No ${activeTab === 'all' ? 'world entries' : CATEGORIES.find(c => c.id === activeTab)?.label.toLowerCase() || 'entries'} yet</h2>
            <p class="empty-state-text">Start building your world by creating your first entry.</p>
            <button class="btn btn-primary" id="empty-create-btn">+ Create Entry</button>
          </div>
        ` : `
          <div class="grid-auto">
            ${filtered.map(entry => `
              <div class="card card-clickable" data-id="${entry.id}">
                <div class="flex items-center gap-2 mb-2">
                  <span style="font-size: 1.25rem;">${getCategoryIcon(entry.category)}</span>
                  <span class="tag">${entry.category || 'unknown'}</span>
                </div>
                <h3 style="font-family: var(--font-heading); font-weight: var(--fw-bold); font-size: var(--fs-md); margin-bottom: var(--sp-2);">
                  ${escapeHtml(entry.name)}
                </h3>
                ${entry.type ? `<div style="font-size: var(--fs-sm); color: var(--text-tertiary); margin-bottom: var(--sp-2);">${escapeHtml(entry.type)}</div>` : ''}
                <div style="font-size: var(--fs-sm); color: var(--text-muted);">${timeAgo(entry.updatedAt)}</div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;

    // Tabs
    container.querySelectorAll('.tab[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        render();
      });
    });

    // Search
    const searchInput = container.querySelector('#world-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        render();
      });
      // Re-focus after re-render
      searchInput.focus();
      searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
    }

    // New entry
    const newBtn = container.querySelector('#new-world-btn');
    if (newBtn) newBtn.addEventListener('click', () => showNewEntryModal());

    const emptyBtn = container.querySelector('#empty-create-btn');
    if (emptyBtn) emptyBtn.addEventListener('click', () => showNewEntryModal());

    // Card clicks
    container.querySelectorAll('.card[data-id]').forEach(card => {
      card.addEventListener('click', () => navigate(`world/${card.dataset.id}`));
    });
  }

  function showNewEntryModal() {
    const content = document.createElement('div');
    content.innerHTML = `
      <div class="grid-2" style="gap: var(--sp-3);">
        ${CATEGORIES.filter(c => c.id !== 'all').map(c => `
          <button class="card card-clickable card-sm text-center" data-cat="${c.id}" style="display: flex; flex-direction: column; align-items: center; gap: var(--sp-2);">
            <span style="font-size: 2rem;">${c.icon}</span>
            <span style="font-weight: var(--fw-semibold);">${c.label}</span>
          </button>
        `).join('')}
      </div>
    `;

    const { close } = showModal({ title: '🌍 New World Entry', content });
    content.querySelectorAll('[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        close();
        navigate(`world/new?category=${btn.dataset.cat}`);
      });
    });
  }

  render();
}

// ========== DETAIL / EDIT VIEW ==========
export async function renderWorldDetail(container, params) {
  const isNew = params.id === 'new';
  let entry = isNew ? {
    name: '',
    category: new URLSearchParams(window.location.hash.split('?')[1] || '').get('category') || 'location',
    description: '',
    type: '',
    tags: [],
    details: {},
  } : await db.getWorldEntry(params.id);

  if (!entry && !isNew) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <h2 class="empty-state-title">Entry Not Found</h2>
        <p class="empty-state-text">This world entry doesn't exist.</p>
        <button class="btn btn-primary" onclick="window.location.hash='#/world'">Back to World</button>
      </div>
    `;
    return;
  }

  let editMode = isNew;
  let images = isNew ? [] : await db.getImagesForEntity('world', params.id);
  let editors = {};

  async function render() {
    if (editMode) {
      await renderEditMode();
    } else {
      renderViewMode();
    }
  }

  function renderViewMode() {
    const details = entry.details || {};

    container.innerHTML = `
      <div class="detail-page">
        <div class="flex items-center gap-3 mb-4">
          <button class="btn btn-ghost btn-sm" id="back-btn">← Back</button>
          <div class="ml-auto flex gap-2">
            <button class="btn btn-secondary btn-sm" id="edit-btn">✏️ Edit</button>
            <button class="btn btn-danger btn-sm" id="delete-btn">🗑️ Delete</button>
          </div>
        </div>

        <div class="detail-header" style="flex-direction: column; align-items: flex-start;">
          <div class="flex items-center gap-3">
            <span style="font-size: 2rem;">${getCategoryIcon(entry.category)}</span>
            <div>
              <h1 class="detail-name">${escapeHtml(entry.name)}</h1>
              <div class="detail-badges mt-2">
                <span class="tag">${entry.category}</span>
                ${entry.type ? `<span class="tag">${escapeHtml(entry.type)}</span>` : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- Description -->
        <div class="detail-section">
          <h3 class="detail-section-title">📝 Description</h3>
          <div class="detail-section-content">${renderQuillContent(entry.description)}</div>
        </div>

        ${renderCategoryViewFields(entry)}

        <!-- Images -->
        ${images.length > 0 ? `
          <div class="detail-section">
            <h3 class="detail-section-title">🖼️ Images</h3>
            <div class="image-gallery-grid">
              ${images.map(img => `
                <div class="image-gallery-item" data-img-src="${img.data}">
                  <img src="${img.data}" alt="${escapeHtml(img.name || 'Image')}" />
                  <div class="image-overlay">
                    <span style="color: white; font-size: var(--fs-sm);">${escapeHtml(img.name || '')}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Tags -->
        ${entry.tags && entry.tags.length > 0 ? `
          <div class="detail-section">
            <h3 class="detail-section-title">🏷️ Tags</h3>
            <div class="tags-container">
              ${entry.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // Events
    container.querySelector('#back-btn').addEventListener('click', () => navigate('world'));
    container.querySelector('#edit-btn').addEventListener('click', () => {
      editMode = true;
      render();
    });
    container.querySelector('#delete-btn').addEventListener('click', async () => {
      const confirmed = await showConfirm('Delete Entry', `Are you sure you want to delete "${entry.name}"? This cannot be undone.`);
      if (confirmed) {
        await db.deleteWorldEntry(entry.id);
        showToast('Entry deleted', 'success');
        navigate('world');
      }
    });

    // Lightbox
    container.querySelectorAll('.image-gallery-item').forEach(item => {
      item.addEventListener('click', () => showLightbox(item.dataset.imgSrc));
    });
  }

  function renderCategoryViewFields(entry) {
    const d = entry.details || {};
    let html = '';

    switch (entry.category) {
      case 'location':
        if (d.storySignificance) {
          html += `<div class="detail-section"><h3 class="detail-section-title">📖 Story Significance</h3><div class="detail-section-content">${renderQuillContent(d.storySignificance)}</div></div>`;
        }
        if (d.gameplayNotes) {
          html += `<div class="detail-section"><h3 class="detail-section-title">🎮 Gameplay Notes</h3><div class="detail-section-content">${renderQuillContent(d.gameplayNotes)}</div></div>`;
        }
        break;
      case 'faction':
        if (d.goals) {
          html += `<div class="detail-section"><h3 class="detail-section-title">🎯 Goals & Philosophy</h3><div class="detail-section-content">${renderQuillContent(d.goals)}</div></div>`;
        }
        if (d.allies) {
          html += `<div class="detail-section"><h3 class="detail-section-title">🤝 Allies</h3><div class="detail-section-content">${escapeHtml(d.allies)}</div></div>`;
        }
        if (d.enemies) {
          html += `<div class="detail-section"><h3 class="detail-section-title">⚔️ Enemies</h3><div class="detail-section-content">${escapeHtml(d.enemies)}</div></div>`;
        }
        break;
      case 'history':
        if (d.era) {
          html += `<div class="detail-section"><h3 class="detail-section-title">📅 Era</h3><div class="detail-section-content">${escapeHtml(d.era)}</div></div>`;
        }
        break;
      case 'item':
        if (d.loreSignificance) {
          html += `<div class="detail-section"><h3 class="detail-section-title">📜 Lore Significance</h3><div class="detail-section-content">${renderQuillContent(d.loreSignificance)}</div></div>`;
        }
        if (d.statsNotes) {
          html += `<div class="detail-section"><h3 class="detail-section-title">📊 Stats & Notes</h3><div class="detail-section-content">${escapeHtml(d.statsNotes)}</div></div>`;
        }
        break;
    }
    return html;
  }

  async function renderEditMode() {
    editors = {};
    const details = entry.details || {};

    container.innerHTML = `
      <div class="detail-page">
        <div class="flex items-center gap-3 mb-4">
          <button class="btn btn-ghost btn-sm" id="back-btn">← Back</button>
          <div class="ml-auto flex gap-2">
            <button class="btn btn-secondary btn-sm" id="cancel-btn">Cancel</button>
            <button class="btn btn-primary btn-sm" id="save-btn">💾 Save</button>
          </div>
        </div>

        <div class="card mb-6">
          <h3 class="detail-section-title">Basic Info</h3>
          <div class="flex flex-col gap-4">
            <div class="form-group">
              <label class="form-label">Name</label>
              <input class="form-input" id="entry-name" value="${escapeHtml(entry.name || '')}" placeholder="Entry name" />
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Category</label>
                <select class="form-select" id="entry-category" ${isNew ? '' : 'disabled'}>
                  ${CATEGORIES.filter(c => c.id !== 'all').map(c => `
                    <option value="${c.id}" ${entry.category === c.id ? 'selected' : ''}>${c.icon} ${c.label}</option>
                  `).join('')}
                </select>
              </div>
              <div class="form-group" id="type-group">
                <label class="form-label">Type</label>
                ${renderTypeSelect(entry.category, entry.type)}
              </div>
            </div>
          </div>
        </div>

        <!-- Description Editor -->
        <div class="card mb-6">
          <h3 class="detail-section-title">📝 Description</h3>
          <div id="desc-editor"></div>
        </div>

        <!-- Category-specific fields -->
        <div id="category-fields"></div>

        <!-- Tags -->
        <div class="card mb-6">
          <h3 class="detail-section-title">🏷️ Tags</h3>
          <div class="tag-input-wrapper" id="tag-wrapper">
            ${(entry.tags || []).map(t => `
              <span class="tag">${escapeHtml(t)}<span class="tag-remove" data-tag="${escapeHtml(t)}">×</span></span>
            `).join('')}
            <input type="text" placeholder="Type and press Enter..." id="tag-input" />
          </div>
        </div>

        <!-- Images -->
        <div class="card mb-6">
          <h3 class="detail-section-title">🖼️ Images</h3>
          <div id="images-section"></div>
          <div id="image-upload-area" class="mt-4"></div>
        </div>
      </div>
    `;

    // Description editor
    const descEditor = await createEditor(container.querySelector('#desc-editor'), {
      placeholder: 'Describe this entry...',
      initialContent: entry.description || '',
    });
    editors.description = descEditor;

    // Category-specific fields
    await renderCategoryEditFields(entry.category, details);

    // Type select change on category change
    const catSelect = container.querySelector('#entry-category');
    catSelect.addEventListener('change', async () => {
      const newCat = catSelect.value;
      const typeGroup = container.querySelector('#type-group');
      typeGroup.innerHTML = `<label class="form-label">Type</label>${renderTypeSelect(newCat, '')}`;
      const cfDiv = container.querySelector('#category-fields');
      cfDiv.innerHTML = '';
      await renderCategoryEditFields(newCat, {});
    });

    // Render existing images
    renderImagePreview();

    // Image upload
    const uploadZone = createImageUploadZone(async (files) => {
      for (const file of files) {
        const dataURL = await fileToDataURL(file);
        const imgRecord = await db.saveImage({
          entityType: 'world',
          entityId: entry.id || 'pending',
          data: dataURL,
          name: file.name,
        });
        images.push(imgRecord);
      }
      renderImagePreview();
      showToast(`${files.length} image(s) uploaded`, 'success');
    });
    container.querySelector('#image-upload-area').appendChild(uploadZone);

    // Tags
    setupTagInput();

    // Save
    container.querySelector('#save-btn').addEventListener('click', async () => {
      entry.name = container.querySelector('#entry-name').value.trim();
      if (!entry.name) {
        showToast('Please enter a name', 'error');
        return;
      }
      entry.category = container.querySelector('#entry-category').value;
      const typeInput = container.querySelector('#entry-type');
      entry.type = typeInput ? typeInput.value : '';
      entry.description = editors.description.getContent();
      entry.details = collectCategoryFields(entry.category);
      entry.tags = collectTags();

      const saved = await db.saveWorldEntry(entry);
      entry = saved;

      // Update image entity IDs for new entries
      for (const img of images) {
        if (img.entityId === 'pending') {
          img.entityId = saved.id;
          await db.saveImage(img);
        }
      }

      showToast('Entry saved!', 'success');
      editMode = false;
      navigate(`world/${saved.id}`);
    });

    // Cancel
    container.querySelector('#cancel-btn').addEventListener('click', () => {
      if (isNew) {
        navigate('world');
      } else {
        editMode = false;
        render();
      }
    });

    // Back
    container.querySelector('#back-btn').addEventListener('click', () => navigate('world'));
  }

  function renderTypeSelect(category, currentType) {
    let types = [];
    if (category === 'location') types = LOCATION_TYPES;
    else if (category === 'item') types = ITEM_TYPES;

    if (types.length === 0) {
      return `<input class="form-input" id="entry-type" value="${escapeHtml(currentType || '')}" placeholder="Optional type..." />`;
    }

    return `
      <select class="form-select" id="entry-type">
        <option value="">Select type...</option>
        ${types.map(t => `<option value="${t}" ${currentType === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    `;
  }

  async function renderCategoryEditFields(category, details) {
    const cfDiv = container.querySelector('#category-fields');
    cfDiv.innerHTML = '';

    switch (category) {
      case 'location': {
        cfDiv.innerHTML = `
          <div class="card mb-6"><h3 class="detail-section-title">📖 Story Significance</h3><div id="ed-storysig"></div></div>
          <div class="card mb-6"><h3 class="detail-section-title">🎮 Gameplay Notes</h3><div id="ed-gameplay"></div></div>
        `;
        editors.storySignificance = await createEditor(cfDiv.querySelector('#ed-storysig'), {
          placeholder: 'What happens here in the story?',
          initialContent: details.storySignificance || '',
        });
        editors.gameplayNotes = await createEditor(cfDiv.querySelector('#ed-gameplay'), {
          placeholder: 'What does the player do here?',
          initialContent: details.gameplayNotes || '',
        });
        break;
      }
      case 'faction': {
        cfDiv.innerHTML = `
          <div class="card mb-6"><h3 class="detail-section-title">🎯 Goals & Philosophy</h3><div id="ed-goals"></div></div>
          <div class="card mb-6">
            <h3 class="detail-section-title">🤝 Allies & Enemies</h3>
            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Allies</label>
                <input class="form-input" id="ed-allies" value="${escapeHtml(details.allies || '')}" placeholder="Allied factions..." />
              </div>
              <div class="form-group">
                <label class="form-label">Enemies</label>
                <input class="form-input" id="ed-enemies" value="${escapeHtml(details.enemies || '')}" placeholder="Enemy factions..." />
              </div>
            </div>
          </div>
        `;
        editors.goals = await createEditor(cfDiv.querySelector('#ed-goals'), {
          placeholder: 'What does this faction stand for?',
          initialContent: details.goals || '',
        });
        break;
      }
      case 'history': {
        cfDiv.innerHTML = `
          <div class="card mb-6">
            <h3 class="detail-section-title">📅 Timeline</h3>
            <div class="form-group">
              <label class="form-label">Era / Date</label>
              <input class="form-input" id="ed-era" value="${escapeHtml(details.era || '')}" placeholder="e.g., The Age of Flame, Year 302" />
            </div>
          </div>
        `;
        break;
      }
      case 'item': {
        cfDiv.innerHTML = `
          <div class="card mb-6"><h3 class="detail-section-title">📜 Lore Significance</h3><div id="ed-loresig"></div></div>
          <div class="card mb-6">
            <h3 class="detail-section-title">📊 Stats & Notes</h3>
            <div class="form-group">
              <textarea class="form-textarea" id="ed-stats" placeholder="Damage values, effects, etc.">${escapeHtml(details.statsNotes || '')}</textarea>
            </div>
          </div>
        `;
        editors.loreSignificance = await createEditor(cfDiv.querySelector('#ed-loresig'), {
          placeholder: 'History and significance of this item...',
          initialContent: details.loreSignificance || '',
        });
        break;
      }
    }
  }

  function collectCategoryFields(category) {
    const details = {};
    switch (category) {
      case 'location':
        if (editors.storySignificance) details.storySignificance = editors.storySignificance.getContent();
        if (editors.gameplayNotes) details.gameplayNotes = editors.gameplayNotes.getContent();
        break;
      case 'faction':
        if (editors.goals) details.goals = editors.goals.getContent();
        const allies = container.querySelector('#ed-allies');
        const enemies = container.querySelector('#ed-enemies');
        if (allies) details.allies = allies.value;
        if (enemies) details.enemies = enemies.value;
        break;
      case 'history':
        const era = container.querySelector('#ed-era');
        if (era) details.era = era.value;
        break;
      case 'item':
        if (editors.loreSignificance) details.loreSignificance = editors.loreSignificance.getContent();
        const stats = container.querySelector('#ed-stats');
        if (stats) details.statsNotes = stats.value;
        break;
    }
    return details;
  }

  function renderImagePreview() {
    const section = container.querySelector('#images-section');
    if (!section) return;
    if (images.length === 0) {
      section.innerHTML = `<p class="text-muted" style="font-size: var(--fs-sm);">No images uploaded yet.</p>`;
      return;
    }
    section.innerHTML = `
      <div class="image-gallery-grid">
        ${images.map(img => `
          <div class="image-gallery-item" data-img-id="${img.id}">
            <img src="${img.data}" alt="${escapeHtml(img.name || '')}" />
            <div class="image-overlay">
              <span style="color: white; font-size: var(--fs-xs);">${escapeHtml(img.name || '')}</span>
              <div class="image-actions">
                <button class="btn btn-icon btn-ghost sm img-delete" data-img-id="${img.id}" style="color: var(--accent-red);">×</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    section.querySelectorAll('.img-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await db.deleteImage(btn.dataset.imgId);
        images = images.filter(i => i.id !== btn.dataset.imgId);
        renderImagePreview();
        showToast('Image removed', 'info');
      });
    });

    section.querySelectorAll('.image-gallery-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.img-delete')) return;
        const img = images.find(i => i.id === item.dataset.imgId);
        if (img) showLightbox(img.data);
      });
    });
  }

  function setupTagInput() {
    const wrapper = container.querySelector('#tag-wrapper');
    const input = container.querySelector('#tag-input');
    if (!input) return;

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        e.preventDefault();
        const tag = input.value.trim();
        if (!entry.tags) entry.tags = [];
        if (!entry.tags.includes(tag)) {
          entry.tags.push(tag);
          const span = document.createElement('span');
          span.className = 'tag';
          span.innerHTML = `${escapeHtml(tag)}<span class="tag-remove" data-tag="${escapeHtml(tag)}">×</span>`;
          wrapper.insertBefore(span, input);
          span.querySelector('.tag-remove').addEventListener('click', () => {
            entry.tags = entry.tags.filter(t => t !== tag);
            span.remove();
          });
        }
        input.value = '';
      }
    });

    // Remove click on existing tags
    wrapper.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        entry.tags = (entry.tags || []).filter(t => t !== tag);
        btn.closest('.tag').remove();
      });
    });
  }

  function collectTags() {
    return entry.tags || [];
  }

  await render();
}

/* ============================================================
   Forge — Schema / Database View
   Shows all pages belonging to a schema, plus schema field management.
   ============================================================ */

import { getSchema, saveSchema, deleteSchema, getPagesBySchema, savePage, deletePage, generateId, getActiveProject, saveProject } from '../db.js';
import { refreshIcons } from '../main.js';
import { navigate } from '../router.js';
import { showModal, showToast, showConfirm, escapeHtml, timeAgo } from '../ui.js';
import { refreshSidebarLists } from '../sidebar.js';
import { getStyleConfig } from '../styleConfig.js';

export async function renderSchemaView(container, params) {
  const schemaId = params.id;
  const schema = await getSchema(schemaId);

  if (window.setTabTitle) {
    window.setTabTitle(schema.name);
  }

  if (!schema) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i data-lucide="database-off"></i></div>
        <h2 class="empty-state-title">Database Not Found</h2>
        <p class="empty-state-text">This database doesn't exist or was deleted.</p>
        <button class="btn btn-primary" onclick="window.location.hash='#/dashboard'">Go Home</button>
      </div>
    `;
    refreshIcons();
    return;
  }

  await renderSchemaPage(container, schema);
}async function renderSchemaPage(container, schema) {
  let pages = await getPagesBySchema(schema.id);
  const fields = schema.fields || [];

  // Load view mode from localStorage
  const viewModeKey = `forge-schema-view-mode-${schema.id}`;
  let currentViewMode = localStorage.getItem(viewModeKey) || 'table'; // table, gallery, compact

  // Load search, filter, and sort state
  let searchQuery = '';
  let activeFilters = {}; // fieldId -> value
  let sortBy = 'updated-desc'; // title-asc, title-desc, updated-desc, updated-asc

  const getFilteredAndSortedPages = () => {
    let filtered = [...pages];

    // Search query filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        (p.title || '').toLowerCase().includes(q) ||
        Object.values(p.properties || {}).some(v => String(v).toLowerCase().includes(q))
      );
    }

    // Active filters chips
    Object.entries(activeFilters).forEach(([fieldId, filterVal]) => {
      if (!filterVal) return;
      filtered = filtered.filter(p => {
        const val = p.properties?.[fieldId];
        if (!val) return false;
        // Handles comma-separated tags or lists
        return String(val).toLowerCase().includes(filterVal.toLowerCase());
      });
    });

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'title-asc') {
        return (a.title || '').localeCompare(b.title || '');
      } else if (sortBy === 'title-desc') {
        return (b.title || '').localeCompare(a.title || '');
      } else if (sortBy === 'updated-asc') {
        return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0);
      } else { // updated-desc default
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      }
    });

    return filtered;
  };

  const updateListUI = () => {
    const listContainer = container.querySelector('#sv-list-container');
    const filterBar = container.querySelector('#sv-filter-bar');
    const countLabel = container.querySelector('#sv-count-label');
    
    if (!listContainer) return;

    const filteredPages = getFilteredAndSortedPages();
    if (countLabel) {
      countLabel.textContent = `${filteredPages.length} entry${filteredPages.length === 1 ? '' : 'ies'}`;
    }

    // Render filter chips
    let chipHtml = '';
    Object.entries(activeFilters).forEach(([fieldId, val]) => {
      const field = fields.find(f => f.id === fieldId);
      if (!field || !val) return;
      chipHtml += `
        <div class="filter-chip" data-field-id="${fieldId}">
          <span>${escapeHtml(field.name)}: <strong>${escapeHtml(val)}</strong></span>
          <button class="remove-filter-btn"><i data-lucide="x" style="width:12px;height:12px;"></i></button>
        </div>
      `;
    });
    if (searchQuery) {
      chipHtml += `
        <div class="filter-chip" data-type="search">
          <span>Search: <strong>"${escapeHtml(searchQuery)}"</strong></span>
          <button class="remove-filter-btn"><i data-lucide="x" style="width:12px;height:12px;"></i></button>
        </div>
      `;
    }
    if (filterBar) {
      if (chipHtml) {
        filterBar.innerHTML = chipHtml + `<button class="btn btn-ghost btn-xs" id="clear-all-filters" style="margin-left:auto;">Clear All</button>`;
        filterBar.style.display = 'flex';
      } else {
        filterBar.style.display = 'none';
      }
    }

    // Empty state check
    if (filteredPages.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state" style="padding: var(--sp-12);">
          <div class="empty-state-icon"><i data-lucide="search-code"></i></div>
          <h2 class="empty-state-title">No entries match filters</h2>
          <p class="empty-state-text">Try adjusting your filters or search query.</p>
        </div>
      `;
      refreshIcons();
      bindFilterActions();
      return;
    }

    // Render Views
    let html = '';
    if (currentViewMode === 'table') {
      html = `
        <div class="db-table-wrap" style="border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); overflow: hidden; margin-top: var(--sp-2);">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-subtle); background: rgba(255,255,255,0.02);">
                <th style="padding: var(--sp-3) var(--sp-4); text-align: left; font-size: var(--fs-xs); color: var(--text-muted); font-weight: var(--fw-semibold); text-transform: uppercase; letter-spacing: 0.08em; width: 40%;">Title</th>
                ${fields.map(f => `<th style="padding: var(--sp-3) var(--sp-4); text-align: left; font-size: var(--fs-xs); color: var(--text-muted); font-weight: var(--fw-semibold); text-transform: uppercase; letter-spacing: 0.08em;">${escapeHtml(f.name)}</th>`).join('')}
                <th style="padding: var(--sp-3) var(--sp-4); text-align: right; font-size: var(--fs-xs); color: var(--text-muted); font-weight: var(--fw-semibold); text-transform: uppercase; letter-spacing: 0.08em;">Updated</th>
              </tr>
            </thead>
            <tbody>
              ${filteredPages.map(p => `
                <tr class="db-table-row" data-page-id="${p.id}" draggable="true"
                  style="border-bottom: 1px solid var(--border-subtle); cursor: grab; transition: background 0.15s; user-select: none; -webkit-user-select: none;"
                  onmouseenter="this.style.background='rgba(255,255,255,0.03)'"
                  onmouseleave="this.style.background=''"
                >
                  <td style="padding: var(--sp-3) var(--sp-4);">
                    <div style="display: flex; align-items: center; gap: var(--sp-2);">
                      ${p.coverImage
                        ? `<img src="${p.coverImage}" alt="" style="width: 28px; height: 28px; border-radius: 6px; object-fit: cover; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.1);">`
                        : `<i data-lucide="${p.icon || 'file-text'}" style="width: 15px; height: 15px; color: var(--accent-primary); flex-shrink: 0;"></i>`
                      }
                      <span style="font-weight: var(--fw-medium); color: var(--text-primary);">${escapeHtml(p.title || 'Untitled')}</span>
                    </div>
                  </td>
                  ${fields.map(f => {
                    const val = p.properties?.[f.id] || '';
                    if ((f.type === 'tags' || f.type === 'multiselect' || f.name.toLowerCase() === 'tags') && val) {
                      const chips = val.split(',').map(t => t.trim()).filter(Boolean);
                      return `
                        <td style="padding: var(--sp-3) var(--sp-4);">
                          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                            ${chips.map(c => `
                              <span style="background: rgba(229, 169, 59, 0.08); border: 1px solid rgba(229, 169, 59, 0.2); color: var(--accent-primary); padding: 2px 6px; border-radius: 10px; font-size: 0.68rem; font-family: var(--font-hud, monospace); line-height: 1;">${escapeHtml(c)}</span>
                            `).join('')}
                          </div>
                        </td>
                      `;
                    }
                    return `<td style="padding: var(--sp-3) var(--sp-4); font-size: var(--fs-sm); color: var(--text-secondary);">${escapeHtml(val || '—')}</td>`;
                  }).join('')}
                  <td style="padding: var(--sp-3) var(--sp-4); text-align: right; font-size: var(--fs-xs); color: var(--text-muted);">${timeAgo(p.updatedAt)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (currentViewMode === 'gallery') {
      html = `
        <div class="schema-view-gallery">
          ${filteredPages.map(p => {
            const subtitle = fields.length > 0 ? (p.properties?.[fields[0].id] || '') : '';
            return `
              <div class="gallery-card" data-page-id="${p.id}">
                ${p.coverImage
                  ? `<img class="gallery-card-cover" src="${p.coverImage}">`
                  : `<div class="gallery-card-cover"><i data-lucide="${p.icon || 'file-text'}" style="width: 32px; height: 32px;"></i></div>`
                }
                <div class="gallery-card-body">
                  <div class="gallery-card-title">${escapeHtml(p.title || 'Untitled')}</div>
                  <div class="gallery-card-meta">${escapeHtml(subtitle || 'No attributes')}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else if (currentViewMode === 'compact') {
      html = `
        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 10px;">
          ${filteredPages.map(p => `
            <div class="db-table-row" data-page-id="${p.id}" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); background: var(--glass-surface); cursor: pointer; transition: all 120ms ease;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <i data-lucide="${p.icon || 'file-text'}" style="width: 14px; height: 14px; color: var(--text-tertiary);"></i>
                <span style="font-size: var(--fs-sm); font-weight: 500; color: var(--text-primary);">${escapeHtml(p.title || 'Untitled')}</span>
              </div>
              <span style="font-size: var(--fs-xs); color: var(--text-muted);">${timeAgo(p.updatedAt)}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    listContainer.innerHTML = html;
    refreshIcons();
    bindRowActions();
    bindFilterActions();
  };

  const bindRowActions = () => {
    // Row clicks & drag
    container.querySelectorAll('.db-table-row, .gallery-card').forEach(row => {
      row.addEventListener('click', (e) => {
        if (row.dataset.dragging === 'true') return;
        navigate(`page/${row.dataset.pageId}`);
      });

      row.addEventListener('dragstart', (e) => {
        row.dataset.dragging = 'true';
        window.getSelection()?.removeAllRanges();
        row.style.opacity = '0.5';
        const pageId = row.dataset.pageId;
        const page = pages.find(p => p.id === pageId);
        const payload = JSON.stringify({
          type: 'pagelink',
          pageId: pageId,
          title: page ? (page.title || 'Unnamed') : 'Unnamed'
        });
        e.dataTransfer.setData('forge/pagelink', payload);
        e.dataTransfer.setData('application/json', payload);
        e.dataTransfer.setData('text/plain', payload);
      });

      row.addEventListener('dragend', () => {
        row.style.opacity = '';
        if (row.parentNode === document.body) {
          row.remove();
        }
        setTimeout(() => {
          row.removeAttribute('data-dragging');
        }, 50);
      });
    });
  };

  const bindFilterActions = () => {
    // Clear individual filter chip
    container.querySelectorAll('.filter-chip .remove-filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const chip = btn.closest('.filter-chip');
        if (chip.dataset.type === 'search') {
          searchQuery = '';
          const searchInput = container.querySelector('#sv-search-input');
          if (searchInput) searchInput.value = '';
        } else {
          delete activeFilters[chip.dataset.fieldId];
          const filterSelect = container.querySelector(`#filter-select-${chip.dataset.fieldId}`);
          if (filterSelect) filterSelect.value = '';
        }
        updateListUI();
      });
    });

    // Clear all filters
    container.querySelector('#clear-all-filters')?.addEventListener('click', () => {
      searchQuery = '';
      activeFilters = {};
      const searchInput = container.querySelector('#sv-search-input');
      if (searchInput) searchInput.value = '';
      container.querySelectorAll('.filter-dropdown').forEach(s => s.value = '');
      updateListUI();
    });
  };

  // Render Page Layout
  container.innerHTML = `
    <div class="page-header" style="padding-bottom: 12px;">
      <div class="page-header-row">
        <div style="display: flex; align-items: center; gap: var(--sp-3);">
          <div style="width: 36px; height: 36px; border-radius: var(--radius-md); background: ${schema.color || 'var(--accent-primary)'}20; display: flex; align-items: center; justify-content: center;">
            <i data-lucide="${schema.icon || 'database'}" style="width: 18px; height: 18px; color: ${schema.color || 'var(--accent-primary)'};"></i>
          </div>
          <div>
            <h1 class="page-title" style="font-size: 1.4rem;">${escapeHtml(schema.name)}</h1>
            <p class="page-subtitle" id="sv-count-label">${pages.length} entries</p>
          </div>
        </div>
        <div style="display: flex; gap: var(--sp-2);">
          <button id="sv-fields-btn" class="btn btn-secondary btn-sm"><i data-lucide="settings-2" style="width:14px;height:14px;margin-right:6px;"></i>Fields</button>
          <button id="sv-delete-db-btn" class="btn btn-sm" style="color: var(--color-danger,#f43f5e); background: transparent; border-color: rgba(244,63,94,0.3); margin-right: var(--sp-2);">
            <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
          </button>
          <button id="sv-new-btn" class="btn btn-primary btn-sm"><i data-lucide="plus" style="width:14px;height:14px;margin-right:6px;"></i>New Entry</button>
        </div>
      </div>
    </div>

    <!-- Filter & Options Controls -->
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 var(--sp-6) 12px; flex-wrap: wrap;">
      
      <!-- Left side: Filters & Search -->
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <!-- Text search -->
        <div style="display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:4px 10px; width:180px; height:30px; box-sizing:border-box;">
          <i data-lucide="search" style="width:12px;height:12px;color:var(--text-muted);"></i>
          <input id="sv-search-input" type="text" placeholder="Search..." style="background:transparent; border:none; outline:none; font-size:var(--fs-xs); color:var(--text-primary); width:100%;" />
        </div>

        <!-- Attribute filters (select columns) -->
        ${fields.filter(f => f.type === 'select').map(f => `
          <select id="filter-select-${f.id}" class="filter-dropdown" data-field-id="${f.id}" style="background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:0 8px; height:30px; font-size:var(--fs-xs); color:var(--text-secondary); outline:none; cursor:pointer;">
            <option value="">Filter ${escapeHtml(f.name)}</option>
            ${(f.options || []).map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('')}
          </select>
        `).join('')}
      </div>

      <!-- Right side: Sort + View Switcher -->
      <div style="display: flex; align-items: center; gap: 12px;">
        <!-- Sort select -->
        <div style="display:flex; align-items:center; gap:6px;">
          <i data-lucide="arrow-up-down" style="width:12px;height:12px;color:var(--text-muted);"></i>
          <select id="sv-sort-select" style="background:transparent; border:none; font-size:var(--fs-xs); color:var(--text-secondary); outline:none; cursor:pointer;">
            <option value="updated-desc">Updated: Newest First</option>
            <option value="updated-asc">Updated: Oldest First</option>
            <option value="title-asc">Title: A-Z</option>
            <option value="title-desc">Title: Z-A</option>
          </select>
        </div>

        <!-- View switcher -->
        <div class="view-switcher">
          <button class="view-switcher-btn ${currentViewMode === 'table' ? 'active' : ''}" data-mode="table" title="Table View"><i data-lucide="table" style="width:13px;height:13px;"></i></button>
          <button class="view-switcher-btn ${currentViewMode === 'gallery' ? 'active' : ''}" data-mode="gallery" title="Gallery Cards"><i data-lucide="layout-grid" style="width:13px;height:13px;"></i></button>
          <button class="view-switcher-btn ${currentViewMode === 'compact' ? 'active' : ''}" data-mode="compact" title="Compact List"><i data-lucide="list" style="width:13px;height:13px;"></i></button>
        </div>
      </div>
    </div>

    <!-- Active Filter Chips Bar -->
    <div class="filter-bar" id="sv-filter-bar" style="margin: 0 var(--sp-6) 12px; display: none;"></div>

    <div class="hud-divider"></div>

    <div style="padding: 0 var(--sp-6) var(--sp-6);">
      
      <!-- Inline Create Card -->
      <div style="display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: var(--radius-lg); border: 1px dashed var(--border-default); background: rgba(255,255,255,0.01); margin: 12px 0 var(--sp-4);" id="sv-inline-create-container">
        <i data-lucide="plus-circle" style="width:14px;height:14px;color:var(--text-muted);flex-shrink:0;"></i>
        <input type="text" id="sv-inline-create-input" placeholder="Quickly add new entry..." style="background:transparent; border:none; outline:none; font-size:var(--fs-sm); color:var(--text-primary); flex:1;" />
        <button class="btn btn-secondary btn-xs" id="sv-inline-create-btn" style="height:26px;">Create</button>
      </div>

      <!-- Main Listing container -->
      <div id="sv-list-container"></div>

    </div>
  `;

  // Bind Switcher, Search, and Filter event listeners
  const switcherBtns = container.querySelectorAll('.view-switcher-btn');
  switcherBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      currentViewMode = mode;
      localStorage.setItem(viewModeKey, mode);
      switcherBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      updateListUI();
    });
  });

  const searchInput = container.querySelector('#sv-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.trim();
      updateListUI();
    });
  }

  container.querySelectorAll('.filter-dropdown').forEach(dropdown => {
    dropdown.addEventListener('change', () => {
      const fieldId = dropdown.dataset.fieldId;
      if (dropdown.value) {
        activeFilters[fieldId] = dropdown.value;
      } else {
        delete activeFilters[fieldId];
      }
      updateListUI();
    });
  });

  const sortSelect = container.querySelector('#sv-sort-select');
  if (sortSelect) {
    sortSelect.value = sortBy;
    sortSelect.addEventListener('change', () => {
      sortBy = sortSelect.value;
      updateListUI();
    });
  }

  // Bind Inline Create Actions
  const inlineInput = container.querySelector('#sv-inline-create-input');
  const inlineBtn = container.querySelector('#sv-inline-create-btn');
  
  const triggerInlineCreate = async () => {
    const titleVal = inlineInput.value.trim();
    if (!titleVal) return;

    // If this is the Chapters & Scenes schema, mark as a story beat with default coords
    const isChaptersSchema = schema.id === 'story-chapters-schema';
    const newPage = await savePage({
      projectId: schema.projectId,
      schemaId: schema.id,
      title: titleVal,
      properties: isChaptersSchema
        ? { lane: 0, x: 80, prerequisites: [], characters: [], f1: 'Act I', f2: 'Draft', f3: 0, f4: '', f5: '', f6: '' }
        : {},
      content: '',
      icon: 'file-text',
      ...(isChaptersSchema ? { isStoryBeat: true } : {})
    });
    inlineInput.value = '';
    showToast(`"${titleVal}" added to database!`, 'success');

    // Refresh local cache and list
    pages.unshift(newPage);
    updateListUI();

    await refreshSidebarLists();
  };

  inlineInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') triggerInlineCreate();
  });
  inlineBtn.addEventListener('click', triggerInlineCreate);

  // Bind "New Entry" button — opens a modal with schema fields
  container.querySelector('#sv-new-btn')?.addEventListener('click', () => {
    const fieldInputsHtml = fields.length > 0 ? fields.map(f => {
      if (f.type === 'select' || f.type === 'multiselect') {
        return `
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:var(--fs-xs);color:var(--text-muted);font-weight:var(--fw-semibold);text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(f.name)}</label>
            <select class="form-input new-entry-field" data-field-id="${f.id}" data-field-type="${f.type}" style="font-size:var(--fs-sm);height:36px;">
              <option value="">— None —</option>
              ${(f.options || []).map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}
            </select>
          </div>`;
      } else if (f.type === 'date') {
        return `
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:var(--fs-xs);color:var(--text-muted);font-weight:var(--fw-semibold);text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(f.name)}</label>
            <input type="date" class="form-input new-entry-field" data-field-id="${f.id}" data-field-type="${f.type}" style="font-size:var(--fs-sm);height:36px;" />
          </div>`;
      } else if (f.type === 'number') {
        return `
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:var(--fs-xs);color:var(--text-muted);font-weight:var(--fw-semibold);text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(f.name)}</label>
            <input type="number" class="form-input new-entry-field" data-field-id="${f.id}" data-field-type="${f.type}" placeholder="0" style="font-size:var(--fs-sm);height:36px;" />
          </div>`;
      } else {
        return `
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:var(--fs-xs);color:var(--text-muted);font-weight:var(--fw-semibold);text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(f.name)}</label>
            <input type="text" class="form-input new-entry-field" data-field-id="${f.id}" data-field-type="${f.type}" placeholder="${escapeHtml(f.name)}..." style="font-size:var(--fs-sm);height:36px;" />
          </div>`;
      }
    }).join('') : `<p style="color:var(--text-muted);font-size:var(--fs-sm);">No custom fields — only a title is required.</p>`;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = 'display:flex;flex-direction:column;gap:var(--sp-3);';
    modalContent.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:4px;">
        <label style="font-size:var(--fs-xs);color:var(--text-muted);font-weight:var(--fw-semibold);text-transform:uppercase;letter-spacing:0.05em;">Title <span style="color:var(--color-danger);">*</span></label>
        <input type="text" id="new-entry-title" class="form-input" placeholder="Entry title..." style="font-size:var(--fs-sm);height:36px;" autofocus />
      </div>
      ${fieldInputsHtml}
    `;

    showModal({
      title: `New ${escapeHtml(schema.name)} Entry`,
      content: modalContent,
      actions: [
        {
          label: 'Cancel',
          className: 'btn-secondary',
          onClick: () => {}
        },
        {
          label: 'Create Entry',
          className: 'btn-primary',
          onClick: async () => {
            const titleVal = modalContent.querySelector('#new-entry-title')?.value.trim();
            if (!titleVal) {
              showToast('Title is required', 'error');
              return false; // keeps modal open
            }
            const properties = {};
            modalContent.querySelectorAll('.new-entry-field').forEach(el => {
              const fid = el.dataset.fieldId;
              if (fid && el.value) properties[fid] = el.value;
            });

            // For the Chapters & Scenes schema, ensure beat properties are initialized
            const isChaptersSchema = schema.id === 'story-chapters-schema';
            if (isChaptersSchema) {
              properties.lane = properties.lane ?? 0;
              properties.x = properties.x ?? 80;
              properties.prerequisites = properties.prerequisites ?? [];
              properties.characters = properties.characters ?? [];
              if (!properties.f1) properties.f1 = 'Act I';
              if (!properties.f2) properties.f2 = 'Draft';
              if (!properties.f3) properties.f3 = 0;
            }

            const newPage = await savePage({
              projectId: schema.projectId,
              schemaId: schema.id,
              title: titleVal,
              properties,
              content: '',
              icon: 'file-text',
              ...(isChaptersSchema ? { isStoryBeat: true } : {})
            });
            pages.unshift(newPage);
            updateListUI();
            await refreshSidebarLists();
            showToast(`"${titleVal}" created!`, 'success');
          }
        }
      ]
    });
    // Focus title after modal renders
    setTimeout(() => modalContent.querySelector('#new-entry-title')?.focus(), 50);
  });

  // Initial draw
  updateListUI();

  // Bind fields config button
  container.querySelector('#sv-fields-btn')?.addEventListener('click', async () => {
    const project = await getActiveProject();
    const styleId = project?.settings?.style || 'story';
    showFieldsModal(schema, styleId, async (updatedSchema) => {
      await saveSchema(updatedSchema);
      showToast('Fields saved', 'success');
      // Full redraw
      await renderSchemaPage(container, updatedSchema);
    });
  });

  // Bind delete database button
  container.querySelector('#sv-delete-db-btn')?.addEventListener('click', async () => {
    const confirmed = await showConfirm('Delete Database', `Delete "${schema.name}" and all its entries? This cannot be undone.`);
    if (!confirmed) return;
    const project = await getActiveProject();
    if (project) {
      if (!project.settings) project.settings = {};
      if (!project.settings.deletedSchemas) project.settings.deletedSchemas = [];
      if (!project.settings.deletedSchemas.includes(schema.id)) {
        project.settings.deletedSchemas.push(schema.id);
        await saveProject(project);
      }
    }
    for (const p of pages) await deletePage(p.id);
    await deleteSchema(schema.id);
    await refreshSidebarLists();
    showToast(`"${schema.name}" deleted`, 'info');
    navigate('dashboard');
  });
}

// ── Field Manager Modal ───────────────────────────────────────────────────────

function showFieldsModal(schema, styleId, onSave) {
  const fields = JSON.parse(JSON.stringify(schema.fields || [])); // deep copy
  const styleConf = getStyleConfig(styleId);

  // Get style-specific templates/schemas to gather premade fields
  const presetSchemas = styleConf.getSchemas(schema.projectId) || [];
  const premadeFieldsMap = new Map();

  presetSchemas.forEach(ps => {
    if (ps.fields) {
      ps.fields.forEach(f => {
        if (!premadeFieldsMap.has(f.name.toLowerCase())) {
          premadeFieldsMap.set(f.name.toLowerCase(), {
            name: f.name,
            type: f.type,
            options: f.options || []
          });
        }
      });
    }
  });

  // Generic common fields as fallbacks
  const commonFields = [
    { name: 'Summary', type: 'text' },
    { name: 'Priority', type: 'select', options: ['High', 'Medium', 'Low'] },
    { name: 'URL/Link', type: 'url' },
    { name: 'Date Created', type: 'date' },
    { name: 'Notes', type: 'text' }
  ];

  commonFields.forEach(cf => {
    if (!premadeFieldsMap.has(cf.name.toLowerCase())) {
      premadeFieldsMap.set(cf.name.toLowerCase(), cf);
    }
  });

  const premadeFields = Array.from(premadeFieldsMap.values());

  const content = document.createElement('div');

  const renderFields = () => {
    content.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--sp-2); margin-bottom: var(--sp-4);">
        ${fields.length === 0 ? `<p style="color: var(--text-muted); font-size: var(--fs-sm);">No fields yet. Add one below.</p>` : ''}
        ${fields.map((f, i) => `
          <div class="field-row" data-index="${i}" style="display: grid; grid-template-columns: 1fr 140px 36px; gap: var(--sp-2); align-items: center;">
            <input class="form-input field-name" data-index="${i}" value="${escapeHtml(f.name)}" placeholder="Field name" style="font-size: var(--fs-sm);" />
            <select class="form-input field-type" data-index="${i}" style="font-size: var(--fs-sm);">
              ${['text','number','select','tags','multiselect','date','url','email'].map(t => `<option value="${t}" ${f.type === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
            <button class="btn btn-sm field-del" data-index="${i}" style="padding: 4px; color: var(--text-muted); background: transparent; border-color: transparent;">
              <i data-lucide="x" style="width:14px;height:14px;pointer-events:none;"></i>
            </button>
          </div>
        `).join('')}
      </div>

      <div style="display: flex; flex-direction: column; gap: var(--sp-1.5); border-top: 1px solid var(--border-subtle); padding-top: var(--sp-4); margin-top: var(--sp-2);">
        <label style="font-size: var(--fs-xs); color: var(--text-muted); font-weight: var(--fw-semibold); text-transform: uppercase; letter-spacing: 0.05em;">Choose Field Type / Premade Field</label>
        <div style="display: flex; gap: var(--sp-2);">
          <select id="premade-fields-select" class="form-input" style="flex: 1; font-size: var(--fs-sm); height: 36px;">
            <option value="custom">[ Custom Field... ]</option>
            ${premadeFields.map(pf => `<option value="${escapeHtml(pf.name)}">${escapeHtml(pf.name)} (${pf.type})</option>`).join('')}
          </select>
          <button id="add-field-btn" class="btn btn-secondary btn-sm" style="flex-shrink: 0; height: 36px;">
            <i data-lucide="plus" style="width:14px;height:14px;margin-right:6px;pointer-events:none;"></i> Add Field
          </button>
        </div>
      </div>
    `;

    refreshIcons();

    // Bind field inputs
    content.querySelectorAll('.field-name').forEach(input => {
      input.addEventListener('input', e => { fields[+e.target.dataset.index].name = e.target.value; });
    });
    content.querySelectorAll('.field-type').forEach(select => {
      select.addEventListener('change', e => { fields[+e.target.dataset.index].type = e.target.value; });
    });
    content.querySelectorAll('.field-del').forEach(btn => {
      btn.addEventListener('click', e => {
        const idx = +e.currentTarget.dataset.index;
        fields.splice(idx, 1);
        renderFields();
      });
    });

    content.querySelector('#add-field-btn')?.addEventListener('click', () => {
      const selectVal = content.querySelector('#premade-fields-select').value;
      if (selectVal === 'custom') {
        fields.push({ id: generateId(), name: 'New Field', type: 'text' });
      } else {
        const pf = premadeFields.find(p => p.name === selectVal);
        if (pf) {
          fields.push({
            id: generateId(),
            name: pf.name,
            type: pf.type,
            options: pf.options ? [...pf.options] : []
          });
        }
      }
      renderFields();
    });
  };

  renderFields();

  showModal({
    title: `Fields — ${schema.name}`,
    content,
    large: true,
    actions: [
      { label: 'Cancel', className: 'btn-secondary' },
      {
        label: 'Save Fields',
        className: 'btn-primary',
        onClick: () => {
          schema.fields = fields.filter(f => f.name.trim());
          onSave(schema);
        },
      },
    ],
  });
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

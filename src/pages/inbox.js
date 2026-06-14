/* ============================================================
   Forge — Inbox / Capture Draft Center
   A staging area for unassigned entries. Edit, delete,
   drag-and-drop to canvases, or categorize into databases.
   ============================================================ */

import { getActiveProject, getPages, getSchemas, savePage, deletePage, getSchema } from '../db.js';
import { refreshIcons } from '../main.js';
import { navigate } from '../router.js';
import { showToast, showConfirm, createEditor, escapeHtml } from '../ui.js';
import { refreshSidebarLists } from '../sidebar.js';

let state = {
  project: null,
  inboxPages: [],
  schemas: [],
  selectedPage: null,
  editor: null,
  autoSaveTimer: null
};

export async function renderInbox(container) {
  if (window.setTabTitle) {
    window.setTabTitle('Inbox');
  }

  // Load project data
  state.project = await getActiveProject();
  if (!state.project) {
    container.innerHTML = `<div class="empty-state"><p>Please open or create a project first.</p></div>`;
    return;
  }

  // Fetch all schemas and pages
  state.schemas = await getSchemas(state.project.id);
  await loadInboxPages();

  // Draw template skeleton
  container.innerHTML = `
    <div class="inbox-page" style="display: flex; flex-direction: column; height: 100vh; background: #07050a; overflow: hidden; font-family: var(--font-hud, monospace);">
      
      <!-- Toolbar -->
      <div class="inbox-toolbar" style="padding: var(--sp-4) var(--sp-6); background: rgba(10, 8, 18, 0.85); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; z-index: 10;">
        <div>
          <h1 class="page-title" style="font-size: 1.4rem; margin: 0; display: flex; align-items: center; gap: 8px; font-weight: 700; background: linear-gradient(135deg, var(--accent-primary) 0%, #3b82f6 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
            <i data-lucide="inbox" style="-webkit-text-fill-color: var(--accent-primary); width: 20px; height: 20px;"></i>
            Capture Inbox
          </h1>
          <p class="page-subtitle" style="font-size: var(--fs-xs); color: var(--text-muted); margin: 2px 0 0;">Unassigned notes, drafts, and quick capture ideas</p>
        </div>
      </div>

      <!-- Main split content -->
      <div style="flex: 1; display: flex; overflow: hidden;">
        
        <!-- Left: Inbox Lists -->
        <div style="width: 340px; border-right: 1px solid var(--border-subtle); display: flex; flex-direction: column; background: rgba(10, 8, 18, 0.4);">
          <div style="padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border-subtle); background: rgba(255,255,255,0.01); font-size: 10px; color: var(--text-muted); text-transform: uppercase;">
            Capture list (<span id="inbox-count">0</span> items)
          </div>
          <div id="inbox-list" style="flex: 1; overflow-y: auto; padding: var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-2);">
            <!-- Populated dynamically -->
          </div>
        </div>

        <!-- Right: Page Editor and Schema Categorizer -->
        <div id="inbox-editor-panel" style="flex: 1; display: flex; flex-direction: column; overflow-y: auto; background: #0a0812; padding: var(--sp-6) var(--sp-8);">
          <div id="inbox-editor-empty" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; color:var(--text-muted);">
            <div style="font-size: 3rem; margin-bottom: var(--sp-4);">📥</div>
            <h3>Select a captured idea</h3>
            <p style="font-size: var(--fs-sm); max-width: 320px; margin-top: var(--sp-2);">Select an item from the inbox to refine its contents, link it to canvases, or categorize it into a database.</p>
          </div>
          
          <div id="inbox-editor-active" style="display: none; flex-direction: column; gap: var(--sp-4); flex: 1;">
            <!-- Rendered when node is selected -->
          </div>
        </div>

      </div>

    </div>
  `;

  // Draw list items
  renderInboxList(container);

  const handleDbUpdate = async (e) => {
    if (e.detail && e.detail.storeName === 'pages') {
      await loadInboxPages();
      renderInboxList(container);
    }
  };
  window.addEventListener('forge-db-updated', handleDbUpdate);

  // Add cleanup
  container._cleanup = () => {
    window.removeEventListener('forge-db-updated', handleDbUpdate);
    flushSave();
  };

  refreshIcons();
}

async function loadInboxPages() {
  const allPages = await getPages(state.project.id);
  // Inbox pages are those that:
  // 1. Have no schemaId
  // 2. Are NOT story beats (isStoryBeat is not true)
  // 3. Are not project homepages
  state.inboxPages = allPages.filter(p => !p.schemaId && !p.isStoryBeat && p.id !== state.project.id);
  state.inboxPages.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

function renderInboxList(container) {
  const listEl = container.querySelector('#inbox-list');
  const countEl = container.querySelector('#inbox-count');
  if (!listEl) return;

  countEl.textContent = state.inboxPages.length;
  listEl.innerHTML = '';

  if (state.inboxPages.length === 0) {
    listEl.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: var(--sp-8) 0; font-size: var(--fs-xs);">
        🎉 Inbox is clear!<br/>Press Ctrl+Shift+F to capture.
      </div>
    `;
    return;
  }

  state.inboxPages.forEach(page => {
    const card = document.createElement('div');
    card.className = `inbox-card ${state.selectedPage?.id === page.id ? 'active' : ''}`;
    
    // Inline styling for the premium glassmorphism card
    card.style.cssText = `
      padding: var(--sp-3) var(--sp-4);
      background: ${state.selectedPage?.id === page.id ? 'rgba(229,169,59,0.06)' : 'rgba(255,255,255,0.02)'};
      border: 1px solid ${state.selectedPage?.id === page.id ? 'var(--accent-primary)' : 'var(--border-subtle)'};
      border-radius: var(--radius-md);
      cursor: grab;
      transition: all 0.2s;
      user-select: none;
      display: flex;
      flex-direction: column;
      gap: var(--sp-1.5);
    `;

    card.onmouseenter = () => {
      if (state.selectedPage?.id !== page.id) {
        card.style.background = 'rgba(255,255,255,0.04)';
        card.style.borderColor = 'rgba(255,255,255,0.15)';
      }
    };
    card.onmouseleave = () => {
      if (state.selectedPage?.id !== page.id) {
        card.style.background = 'rgba(255,255,255,0.02)';
        card.style.borderColor = 'var(--border-subtle)';
      }
    };

    // Extract text snippet safely from Quill content or plain string
    let snippet = 'No additional text.';
    if (page.content) {
      if (page.content.startsWith('{')) {
        try {
          const delta = JSON.parse(page.content);
          if (delta.ops) {
            snippet = delta.ops.map(op => typeof op.insert === 'string' ? op.insert : '').join('').trim();
          }
        } catch (_) {}
      } else {
        snippet = page.content;
      }
    }
    const truncatedSnippet = snippet.length > 50 ? snippet.slice(0, 50) + '...' : snippet || 'No additional text.';

    card.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <span style="font-weight: 600; color: var(--text-primary); font-size: var(--fs-sm); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 220px;">
          ${escapeHtml(page.title || 'Untitled Draft')}
        </span>
        <i data-lucide="grip-vertical" style="width:12px; height:12px; color: var(--text-muted); cursor: grab;"></i>
      </div>
      <p style="font-size: 10px; color: var(--text-muted); margin: 0; line-height: 1.4;">${escapeHtml(truncatedSnippet)}</p>
      <div style="font-size: 8px; color: var(--text-muted); text-align: right; opacity: 0.7;">
        ${new Date(page.updatedAt || page.createdAt).toLocaleDateString()}
      </div>
    `;

    // Make Draggable
    card.draggable = true;
    card.addEventListener('dragstart', (e) => {
      window.getSelection()?.removeAllRanges();
      card.style.opacity = '0.5';
      const payload = JSON.stringify({
        type: 'pagelink',
        pageId: page.id,
        title: page.title || 'Unnamed Capture'
      });
      e.dataTransfer.setData('forge/pagelink', payload);
      e.dataTransfer.setData('application/json', payload);
      e.dataTransfer.setData('text/plain', payload);
    });
    card.addEventListener('dragend', () => {
      card.style.opacity = '';
    });

    // Select click
    card.addEventListener('click', () => {
      selectPage(page, container);
    });

    listEl.appendChild(card);
  });
  
  refreshIcons();
}

async function flushSave() {
  if (state.autoSaveTimer && state.selectedPage) {
    clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = null;

    const page = state.selectedPage;
    const activePanel = document.querySelector('#inbox-editor-active');
    if (!activePanel || activePanel.style.display === 'none') return;

    const titleEl = activePanel.querySelector('#inbox-edit-title');
    if (titleEl) {
      page.title = titleEl.value.trim();
    }
    if (state.editor) {
      page.content = state.editor.getContent();
    }

    const propertiesEl = activePanel.querySelector('#inbox-dynamic-properties');
    const props = {};
    if (propertiesEl) {
      propertiesEl.querySelectorAll('[data-inbox-prop]').forEach(inp => {
        props[inp.dataset.inboxProp] = inp.value;
      });
      page.properties = props;
    }

    await savePage(page);
    await loadInboxPages();
  }
}

async function selectPage(page, container) {
  // Save current active draft before selecting new one
  await flushSave();

  state.selectedPage = page;
  
  // Update active card styling
  renderInboxList(container);

  const emptyPanel = container.querySelector('#inbox-editor-empty');
  const activePanel = container.querySelector('#inbox-editor-active');
  
  emptyPanel.style.display = 'none';
  activePanel.style.display = 'flex';

  activePanel.innerHTML = `
    <!-- Top Row: title + action -->
    <div style="display: flex; align-items: center; justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 10px; color: var(--accent-primary); border: 1px solid rgba(229,169,59,0.3); background: rgba(229,169,59,0.08); padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">Draft Node</span>
      </div>
      <div style="display: flex; gap: var(--sp-2);">
        <button id="inbox-delete-btn" class="btn btn-sm" style="color: var(--color-danger, #f43f5e); background: transparent; border-color: rgba(244,63,94,0.3);">
          <i data-lucide="trash-2" style="width: 14px; height: 14px; margin-right: 6px;"></i>Delete Draft
        </button>
      </div>
    </div>

    <!-- Title editor -->
    <input type="text" id="inbox-edit-title" value="${escapeHtml(page.title || '')}" style="background: transparent; border: none; border-bottom: 1px solid var(--border-subtle); font-size: 1.8rem; font-weight: 700; color: var(--text-primary); padding: var(--sp-2) 0; outline: none; width: 100%;" />

    <!-- Schema selection / Categorization -->
    <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-3);">
      <div style="display: flex; align-items: center; gap: var(--sp-4);">
        <label style="font-size: var(--fs-xs); color: var(--text-muted); white-space: nowrap;">MOVE TO DATABASE:</label>
        <select id="inbox-schema-select" class="form-input" style="flex: 1; height: 34px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); color: var(--text-primary); font-size: var(--fs-xs);">
          <option value="">— Select Database Schema —</option>
          ${state.schemas.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
        </select>
        <button id="inbox-categorize-btn" class="btn btn-primary btn-sm" style="height: 34px;">
          Categorize
        </button>
      </div>

      <!-- Schema dynamic property fields will render here -->
      <div id="inbox-dynamic-properties" style="display: none; flex-direction: column; gap: var(--sp-3); border-top: 1px solid var(--border-subtle); padding-top: var(--sp-3);">
      </div>
    </div>

    <!-- Quill Editor mount -->
    <div style="flex: 1; display: flex; flex-direction: column; min-height: 250px;">
      <h4 style="font-size: var(--fs-xs); color: var(--text-muted); text-transform: uppercase; margin: 0 0 var(--sp-2);">Notes Content</h4>
      <div id="inbox-editor-mount" style="flex: 1; border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); overflow: hidden;"></div>
    </div>
  `;

  const titleInput = activePanel.querySelector('#inbox-edit-title');
  const deleteBtn = activePanel.querySelector('#inbox-delete-btn');
  const schemaSelect = activePanel.querySelector('#inbox-schema-select');
  const categorizeBtn = activePanel.querySelector('#inbox-categorize-btn');
  const propertiesEl = activePanel.querySelector('#inbox-dynamic-properties');
  const editorMount = activePanel.querySelector('#inbox-editor-mount');

  // Load editor
  state.editor = await createEditor(editorMount, {
    placeholder: 'Add description details...',
    initialContent: page.content || ''
  });

  // Track edits
  const triggerPageSave = () => {
    clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = setTimeout(async () => {
      const titleEl = container.querySelector('#inbox-edit-title');
      page.title = titleEl ? titleEl.value.trim() : page.title;
      if (state.editor) {
        page.content = state.editor.getContent();
      }

      // Collect properties
      const props = {};
      propertiesEl.querySelectorAll('[data-inbox-prop]').forEach(inp => {
        props[inp.dataset.inboxProp] = inp.value;
      });
      page.properties = props;

      await savePage(page);
      
      // Refresh list to show title changes or content updates
      await loadInboxPages();
      renderInboxList(container);
    }, 600);
  };

  titleInput.addEventListener('input', () => triggerPageSave());
  state.editor.quill.on('text-change', () => triggerPageSave());

  // Dynamic schema change fields loading
  const renderSchemaProperties = async (schemaId) => {
    if (!schemaId) {
      propertiesEl.style.display = 'none';
      propertiesEl.innerHTML = '';
      return;
    }
    const schema = await getSchema(schemaId);
    if (!schema || !schema.fields || schema.fields.length === 0) {
      propertiesEl.style.display = 'none';
      propertiesEl.innerHTML = '';
      return;
    }

    propertiesEl.style.display = 'flex';
    propertiesEl.innerHTML = `
      <div style="font-size: var(--fs-xs); color: var(--accent-primary); font-weight: bold; text-transform: uppercase;">Set properties before moving:</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3);">
        ${schema.fields.map(f => {
          const val = page.properties?.[f.id] || '';
          return `
            <div class="form-group">
              <label class="form-label" style="font-size: 10px; margin-bottom: 4px;">${escapeHtml(f.name)}</label>
              ${renderPropertyInput(f, val)}
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Hook inputs to save changes
    propertiesEl.querySelectorAll('[data-inbox-prop]').forEach(inp => {
      inp.addEventListener('input', () => triggerPageSave(null));
    });
  };

  schemaSelect.addEventListener('change', (e) => {
    renderSchemaProperties(e.target.value);
  });

  // Categorize click
  categorizeBtn.addEventListener('click', async () => {
    const selectedSchemaId = schemaSelect.value;
    if (!selectedSchemaId) {
      showToast('Please select a database schema first.', 'error');
      return;
    }

    const confirmed = await showConfirm(
      'Categorize Entry',
      `Move "${page.title || 'Untitled'}" into the selected database?`
    );
    if (!confirmed) return;

    try {
      // Finalize page save with selected properties & schema
      page.title = titleInput.value.trim() || 'Untitled Capture';
      page.content = state.editor.getContent();
      page.schemaId = selectedSchemaId;
      page.isInbox = false; // Remove from inbox status

      const props = {};
      propertiesEl.querySelectorAll('[data-inbox-prop]').forEach(inp => {
        props[inp.dataset.inboxProp] = inp.value;
      });
      page.properties = props;

      await savePage(page);
      showToast(`Categorized as "${page.title}"!`, 'success');

      // Clear state selection
      state.selectedPage = null;
      state.editor = null;

      // Reload
      await loadInboxPages();
      renderInbox(container);
      await refreshSidebarLists();

    } catch (err) {
      console.error('Failed to categorize page:', err);
      showToast('Failed to categorize capture.', 'error');
    }
  });

  // Delete draft
  deleteBtn.addEventListener('click', async () => {
    const confirmed = await showConfirm(
      'Delete Draft',
      `Delete "${page.title || 'Untitled Draft'}"? This cannot be undone.`
    );
    if (!confirmed) return;

    await deletePage(page.id);
    showToast('Draft deleted successfully.', 'info');

    state.selectedPage = null;
    state.editor = null;

    // Reload
    await loadInboxPages();
    renderInbox(container);
    await refreshSidebarLists();
  });

  refreshIcons();
}

function renderPropertyInput(field, value) {
  const esc = v => String(v || '').replace(/"/g, '&quot;');
  if (field.type === 'select' && field.options) {
    return `
      <select data-inbox-prop="${field.id}" class="form-input" style="height: 32px; font-size: var(--fs-xs); width: 100%;">
        <option value="">—</option>
        ${field.options.map(o => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
      </select>
    `;
  }
  return `
    <input type="text" data-inbox-prop="${field.id}" value="${esc(value)}" class="form-input" style="height: 32px; font-size: var(--fs-xs); width: 100%;" />
  `;
}

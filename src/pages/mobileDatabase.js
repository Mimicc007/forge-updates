/* ============================================================
   Forge Mobile — Database Tab
   Schema selector + entry list browser.
   Entries are "pages" with a schemaId — using db.js page API.
   ============================================================ */

import {
  getActiveProject, getSchemas, getPagesBySchema,
  savePage, getPage, generateId
} from '../db.js';

let _project = null;



export async function renderMobileDatabase(container, activeSchemaId = null) {
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

  const schemas = await getSchemas(_project.id).catch(() => []);

  if (schemas.length === 0) {
    container.innerHTML = `
      <div class="m-page">
        <div class="m-header">
          <div class="m-header-title">Database</div>
        </div>
        <div class="m-empty">
          <div class="m-empty-icon">🗄️</div>
          <div class="m-empty-title">No databases yet</div>
          <div class="m-empty-sub">Create a database schema on desktop to get started.</div>
        </div>
      </div>
    `;
    return;
  }

  const activeSchema = (activeSchemaId ? schemas.find(s => s.id === activeSchemaId) : null) || schemas[0];
  await _renderSchemaView(container, schemas, activeSchema);
}

async function _renderSchemaView(container, schemas, schema) {
  const entries = await getPagesBySchema(schema.id).catch(() => []);
  const sorted = [...entries].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  container.innerHTML = `
    <div class="m-page" id="m-db-root">
      <div class="m-header">
        <div class="m-header-title">Database</div>
      </div>

      <!-- Schema selector chips -->
      <div class="m-db-schema-strip" id="m-schema-strip">
        ${schemas.map(s => `
          <button class="m-schema-chip ${s.id === schema.id ? 'active' : ''}" data-schema-id="${s.id}">
            ${s.icon || '📋'} ${_esc(s.name)}
          </button>
        `).join('')}
      </div>

      <!-- Entry count -->
      <div style="padding:0 16px 8px;font-size:0.75rem;color:var(--text-muted)">
        ${sorted.length} ${sorted.length === 1 ? 'entry' : 'entries'}
      </div>

      <!-- Entries list -->
      <div id="m-db-entries" style="padding:0 16px 16px">
        ${sorted.length === 0 ? `
          <div class="m-empty">
            <div class="m-empty-icon" style="font-size:32px">📭</div>
            <div class="m-empty-sub">No entries yet. Tap "+" to add one.</div>
          </div>
        ` : sorted.map(e => _entryItem(e, schema)).join('')}
      </div>
    </div>

    <!-- FAB -->
    <button class="m-fab" id="m-db-fab">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  `;

  _injectDbStyles();
  _wireDb(container, schemas, schema, sorted);
}

function _entryItem(entry, schema) {
  const titleField = schema.fields?.find(f => ['text','string','title'].includes(f.type));
  const title = titleField
    ? (entry.properties?.[titleField.id] || entry.title || 'Untitled')
    : (entry.title || 'Untitled');

  const otherFields = schema.fields?.filter(f => f.id !== titleField?.id).slice(0, 2) || [];
  const subtitle = otherFields.map(f => {
    const val = entry.properties?.[f.id];
    return val ? String(val).slice(0, 40) : null;
  }).filter(Boolean).join(' · ');

  return `
    <button class="m-list-item" data-entry-id="${entry.id}">
      <div class="m-list-item-icon">${schema.icon || '📋'}</div>
      <div class="m-list-item-body">
        <div class="m-list-item-title">${_esc(title)}</div>
        ${subtitle ? `<div class="m-list-item-sub">${_esc(subtitle)}</div>` : ''}
      </div>
      <div class="m-list-item-chevron">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      </div>
    </button>
  `;
}

function _wireDb(container, schemas, schema, entries) {
  // Schema strip chips
  container.querySelectorAll('.m-schema-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const s = schemas.find(x => x.id === chip.dataset.schemaId);
      if (s) await _renderSchemaView(container, schemas, s);
    });
  });

  // Entry tap → detail view
  container.querySelectorAll('[data-entry-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const entry = entries.find(e => e.id === btn.dataset.entryId);
      if (entry) _openEntryDetail(container, entry, schema, schemas);
    });
  });

  // Add entry FAB
  document.getElementById('m-db-fab')?.addEventListener('click', async () => {
    const newEntry = await savePage({
      id: generateId(),
      projectId: _project.id,
      schemaId: schema.id,
      title: 'New Entry',
      content: '',
      properties: {},
    });
    await _renderSchemaView(container, schemas, schema);
    // Auto-open new entry detail
    const allEntries = await getPagesBySchema(schema.id).catch(() => []);
    const created = allEntries.find(e => e.id === newEntry.id);
    if (created) _openEntryDetail(container, created, schema, schemas);
  });
}

function _openEntryDetail(container, entry, schema, schemas) {
  const detailEl = document.createElement('div');
  detailEl.className = 'm-editor-page';
  detailEl.id = 'm-entry-detail';
  document.body.appendChild(detailEl);

  const fields = schema.fields || [];
  const fieldHtml = fields.length > 0 ? fields.map(f => {
    const val = entry.properties?.[f.id] || '';
    const isLong = f.type === 'textarea' || f.type === 'richtext';
    return `
      <div class="m-detail-field">
        <label class="m-detail-label">${_esc(f.name || f.id)}</label>
        ${isLong ? `
          <textarea class="m-detail-input m-detail-textarea" data-field-id="${f.id}"
            autocorrect="off" spellcheck="false" inputmode="text">${_esc(val)}</textarea>
        ` : `
          <input type="text" class="m-detail-input" data-field-id="${f.id}"
            value="${_esc(val)}"
            autocorrect="off" autocapitalize="none" spellcheck="false" inputmode="text" />
        `}
      </div>
    `;
  }).join('') : `
    <div class="m-detail-field">
      <label class="m-detail-label">Title</label>
      <input type="text" class="m-detail-input" data-field-id="__title"
        value="${_esc(entry.title || '')}"
        placeholder="Entry title"
        autocorrect="off" autocapitalize="sentences" spellcheck="false" inputmode="text" />
    </div>
    <div class="m-detail-field">
      <label class="m-detail-label">Notes</label>
      <textarea class="m-detail-input m-detail-textarea" data-field-id="__content"
        autocorrect="off" spellcheck="false"
      >${_stripHtml(entry.content || '')}</textarea>
    </div>
  `;

  detailEl.innerHTML = `
    <div class="m-header" style="padding-top:calc(16px + env(safe-area-inset-top, 0px))">
      <button class="m-back-btn" id="m-detail-back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
        ${_esc(schema.name)}
      </button>
      <div id="m-detail-save-ind" style="font-size:0.72rem;color:var(--text-muted);padding:4px 8px">Saved</div>
    </div>
    <div style="padding:20px;overflow-y:auto;flex:1;-webkit-overflow-scrolling:touch">
      ${fieldHtml}
    </div>
  `;

  _injectDetailStyles();
  requestAnimationFrame(() => detailEl.classList.add('open'));

  document.getElementById('m-detail-back')?.addEventListener('click', async () => {
    detailEl.classList.remove('open');
    setTimeout(() => detailEl.remove(), 350);
    await _renderSchemaView(container, schemas, schema);
  });

  // Auto-save on field change
  let saveTimer = null;
  detailEl.querySelectorAll('[data-field-id]').forEach(input => {
    input.addEventListener('input', () => {
      clearTimeout(saveTimer);
      const ind = document.getElementById('m-detail-save-ind');
      if (ind) ind.textContent = 'Saving…';
      saveTimer = setTimeout(async () => {
        try {
          const props = { ...entry.properties };
          let title = entry.title;
          let content = entry.content;
          detailEl.querySelectorAll('[data-field-id]').forEach(el => {
            const fid = el.dataset.fieldId;
            if (fid === '__title') { title = el.value; }
            else if (fid === '__content') { content = el.value; }
            else { props[fid] = el.value || el.textContent; }
          });
          await savePage({ ...entry, title, content, properties: props });
          if (ind) ind.textContent = 'Saved';
        } catch { if (document.getElementById('m-detail-save-ind')) document.getElementById('m-detail-save-ind').textContent = '⚠ Error'; }
      }, 800);
    });
  });
}

function _injectDbStyles() {
  if (document.getElementById('m-db-styles')) return;
  const s = document.createElement('style');
  s.id = 'm-db-styles';
  s.textContent = `
    .m-db-schema-strip {
      display: flex;
      gap: 8px;
      padding: 8px 16px 12px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .m-db-schema-strip::-webkit-scrollbar { display: none; }
    .m-schema-chip {
      background: var(--bg-surface);
      border: 1px solid var(--border-default);
      border-radius: 20px;
      padding: 7px 14px;
      font-size: 0.82rem;
      color: var(--text-secondary);
      white-space: nowrap;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: all 0.15s;
      font-family: var(--font-body);
    }
    .m-schema-chip.active {
      background: var(--accent-primary);
      border-color: var(--accent-primary);
      color: #070b14;
      font-weight: 700;
    }
  `;
  document.head.appendChild(s);
}

function _injectDetailStyles() {
  if (document.getElementById('m-detail-styles')) return;
  const s = document.createElement('style');
  s.id = 'm-detail-styles';
  s.textContent = `
    .m-detail-field { margin-bottom: 20px; }
    .m-detail-label {
      display: block;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .m-detail-input {
      width: 100%;
      box-sizing: border-box;
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      border-radius: 10px;
      padding: 12px 14px;
      font-size: 0.95rem;
      color: var(--text-primary);
      font-family: var(--font-body);
      outline: none;
    }
    .m-detail-input:focus { border-color: var(--accent-primary); }
    .m-detail-textarea { min-height: 120px; resize: vertical; line-height: 1.6; }
  `;
  document.head.appendChild(s);
}

function _stripHtml(html) {
  return html.replace(/<[^>]+>/g, '');
}

function _esc(str) {
  return String(str).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

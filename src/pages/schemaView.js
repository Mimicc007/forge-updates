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
}

async function renderSchemaPage(container, schema) {
  const pages = await getPagesBySchema(schema.id);
  const fields = schema.fields || [];

  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-row">
        <div style="display: flex; align-items: center; gap: var(--sp-3);">
          <div style="width: 36px; height: 36px; border-radius: var(--radius-md); background: var(--accent-primary-dim); display: flex; align-items: center; justify-content: center;">
            <i data-lucide="${schema.icon || 'database'}" style="width: 18px; height: 18px; color: var(--accent-primary);"></i>
          </div>
          <div>
            <h1 class="page-title" style="font-size: 1.4rem;">${escapeHtml(schema.name)}</h1>
            <p class="page-subtitle">${pages.length} entr${pages.length === 1 ? 'y' : 'ies'}</p>
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

    <div class="hud-divider"></div>

    <div style="padding: 0 var(--sp-6) var(--sp-6);">
      ${pages.length === 0 ? `
        <div class="empty-state" style="padding: var(--sp-16);">
          <div class="empty-state-icon"><i data-lucide="plus-circle"></i></div>
          <h2 class="empty-state-title">No entries yet</h2>
          <p class="empty-state-text">Create your first entry in the <strong>${escapeHtml(schema.name)}</strong> database.</p>
          <button id="sv-new-empty-btn" class="btn btn-primary" style="margin-top: var(--sp-4);">
            <i data-lucide="plus" style="width:16px;height:16px;margin-right:8px;"></i> New Entry
          </button>
        </div>
      ` : `
        <div class="db-table-wrap" style="border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); overflow: hidden; margin-top: var(--sp-4);">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-subtle); background: rgba(255,255,255,0.02);">
                <th style="padding: var(--sp-3) var(--sp-4); text-align: left; font-size: var(--fs-xs); color: var(--text-muted); font-weight: var(--fw-semibold); text-transform: uppercase; letter-spacing: 0.08em; width: 40%;">Title</th>
                ${fields.map(f => `<th style="padding: var(--sp-3) var(--sp-4); text-align: left; font-size: var(--fs-xs); color: var(--text-muted); font-weight: var(--fw-semibold); text-transform: uppercase; letter-spacing: 0.08em;">${escapeHtml(f.name)}</th>`).join('')}
                <th style="padding: var(--sp-3) var(--sp-4); text-align: right; font-size: var(--fs-xs); color: var(--text-muted); font-weight: var(--fw-semibold); text-transform: uppercase; letter-spacing: 0.08em;">Updated</th>
              </tr>
            </thead>
            <tbody>
              ${pages.map(p => `
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
      `}
    </div>
  `;

  refreshIcons();

  // ── Event handlers ────────────────────────────────────────────────────────

  const createEntry = async () => {
    const newPage = await savePage({
      projectId: schema.projectId,
      schemaId: schema.id,
      title: '',
      properties: {},
      content: '',
      icon: 'file-text'
    });
    navigate(`page/${newPage.id}`);
  };

  container.querySelector('#sv-new-btn')?.addEventListener('click', createEntry);
  container.querySelector('#sv-new-empty-btn')?.addEventListener('click', createEntry);

  // Row clicks & drag
  container.querySelectorAll('.db-table-row').forEach(row => {
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

  // Fields manager
  container.querySelector('#sv-fields-btn')?.addEventListener('click', async () => {
    const project = await getActiveProject();
    const styleId = project?.settings?.style || 'story';
    showFieldsModal(schema, styleId, async (updatedSchema) => {
      await saveSchema(updatedSchema);
      showToast('Fields saved', 'success');
      await renderSchemaPage(container, updatedSchema);
    });
  });

  // Delete database
  container.querySelector('#sv-delete-db-btn')?.addEventListener('click', async () => {
    const confirmed = await showConfirm('Delete Database', `Delete "${schema.name}" and all its entries? This cannot be undone.`);
    if (!confirmed) return;
    // Track deleted default schemas so they don't get auto-seeded on reload
    const project = await getActiveProject();
    if (project) {
      if (!project.settings) project.settings = {};
      if (!project.settings.deletedSchemas) project.settings.deletedSchemas = [];
      if (!project.settings.deletedSchemas.includes(schema.id)) {
        project.settings.deletedSchemas.push(schema.id);
        await saveProject(project);
      }
    }
    // Delete all pages first
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

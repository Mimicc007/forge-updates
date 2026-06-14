/* ============================================================
   Forge — Page View / Editor
   Notion-style document editor for pages (schema entries or standalone docs).
   ============================================================ */

import { getPage, savePage, getSchema, deletePage, getBacklinks, getSchemas } from '../db.js';
import { refreshIcons } from '../main.js';
import { navigate } from '../router.js';
import { showToast, showConfirm, createEditor } from '../ui.js';
import { initMapEditor } from '../mapEditor.js';

export async function renderPageView(container, params) {
  const pageId = params.id;
  const page = await getPage(pageId);
  let editor = null;
  if (window.setTabTitle) {
    window.setTabTitle(page.title || 'Untitled');
  }

  if (!page) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i data-lucide="file-x"></i></div>
        <h2 class="empty-state-title">Page Not Found</h2>
        <p class="empty-state-text">This page may have been deleted.</p>
        <button class="btn btn-primary" onclick="window.location.hash='#/dashboard'">Go Home</button>
      </div>
    `;
    refreshIcons();
    return;
  }

  // Load schema if this page belongs to one
  let schema = null;
  if (page.schemaId) {
    schema = await getSchema(page.schemaId);
  }

  const isMapPage = ['dnd-maps-schema', 'story-maps-schema', 'story-locs-schema', 'locations'].includes(page.schemaId) || (schema && ['dnd-maps-schema', 'story-maps-schema', 'story-locs-schema', 'locations'].includes(schema.templateId));

  // Build the page wrapper
  container.innerHTML = `
    <div class="page-view-wrapper" style="max-width: 860px; margin: 0 auto; padding: var(--sp-10) var(--sp-8) var(--sp-16); position: relative;">
      
      <!-- Top bar: back + delete -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-8);">
        <button id="pv-back-btn" class="btn btn-secondary btn-sm" style="gap: 6px;">
          <i data-lucide="arrow-left" style="width:14px;height:14px;"></i>
          ${schema ? `Back to ${schema.name}` : 'Back'}
        </button>
        <div style="display: flex; gap: 8px; align-items: center;">
          <span id="pv-save-status" style="font-size: var(--fs-xs); color: var(--text-muted); opacity: 0; transition: opacity 0.3s;">Saved</span>
          <button id="pv-delete-btn" class="btn btn-sm" style="color: var(--color-danger, #f43f5e); background: transparent; border-color: rgba(244,63,94,0.3);">
            <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
          </button>
        </div>
      </div>

      <!-- Cover image + icon row -->
      <div style="display: flex; align-items: flex-end; gap: var(--sp-4); margin-bottom: var(--sp-4);">
        <!-- Page icon -->
        <div id="pv-icon-area" style="cursor: pointer; flex-shrink: 0;" title="Click to change icon">
          <i data-lucide="${page.icon || 'file-text'}" style="width: 52px; height: 52px; color: var(--accent-primary); opacity: 0.85;"></i>
        </div>

        ${!isMapPage ? `
          <!-- Cover image upload -->
          <div id="pv-cover-area" style="position: relative; cursor: pointer;" title="Upload cover image">
            ${page.coverImage ? `
              <img id="pv-cover-img" src="${page.coverImage}" alt="Cover" style="width: 120px; height: 80px; border-radius: 10px; object-fit: cover; border: 1px solid rgba(255,255,255,0.1); display: block;">
              <div id="pv-cover-overlay" style="position: absolute; inset: 0; background: rgba(0,0,0,0.5); border-radius: 10px; opacity: 0; display: flex; align-items: center; justify-content: center; transition: opacity 0.15s; font-size: 0.7rem; color: #fff; gap: 4px;">
                <i data-lucide="image" style="width:12px;height:12px;"></i> Change
              </div>
            ` : `
              <div id="pv-cover-placeholder" style="width: 120px; height: 80px; border-radius: 10px; border: 1.5px dashed rgba(255,255,255,0.12); background: rgba(255,255,255,0.02); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; transition: border-color 0.15s, background 0.15s;">
                <i data-lucide="image-plus" style="width:16px;height:16px;color:var(--text-muted);"></i>
                <span style="font-size: 0.62rem; color: var(--text-muted);">Cover image</span>
              </div>
            `}
            <input type="file" id="pv-cover-input" accept="image/*" style="display:none;">
          </div>
        ` : ''}
      </div>

      ${isMapPage ? `
        <!-- Full Interactive Map Canvas Editor -->
        <div id="pv-map-editor-mount" style="width: 100%; ${page.coverImage ? 'height: 500px;' : 'height: auto;'} border: 1px solid var(--border-subtle); border-radius: var(--radius-xl); overflow: hidden; margin-bottom: var(--sp-6); background: #000; position: relative;">
          ${!page.coverImage ? `
            <div id="pv-add-map-btn" style="padding: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; color: var(--text-muted); font-size: var(--fs-sm); background: rgba(255,255,255,0.01); border: 2px dashed rgba(255,255,255,0.08); border-radius: var(--radius-xl); transition: all 0.2s;" class="canvas-map-upload-area">
              <span style="font-size: 1.8rem;">🗺️</span>
              <span style="font-weight: 500; color: #fff;">Add Interactive Map to Entry</span>
              <span style="font-size: var(--fs-xs); opacity: 0.6;">(Click or Drag-and-Drop image here to add map)</span>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <!-- Title -->
      <div
        id="pv-title"
        contenteditable="true"
        spellcheck="false"
        data-placeholder="Untitled"
        style="font-size: 2.5rem; font-weight: 700; color: var(--text-primary); outline: none; margin-bottom: var(--sp-6); min-height: 1.2em; empty-cells: show; word-break: break-word;"
      >${escHtml(page.title || '')}</div>

      <!-- Properties (if schema attached) -->
      ${schema && schema.fields && schema.fields.length > 0 ? `
      <div id="pv-properties" style="display: flex; flex-direction: column; gap: 0; margin-bottom: var(--sp-8); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); overflow: hidden;">
        ${schema.fields.map(field => `
          <div class="pv-property-row" style="display: grid; grid-template-columns: 160px 1fr; border-bottom: 1px solid var(--border-subtle);">
            <div style="padding: var(--sp-3) var(--sp-4); font-size: var(--fs-sm); color: var(--text-secondary); display: flex; align-items: center; gap: var(--sp-2); background: rgba(255,255,255,0.02);">
              <i data-lucide="${fieldIcon(field.type)}" style="width: 13px; height: 13px; flex-shrink: 0;"></i>
              ${escHtml(field.name)}
            </div>
            <div style="padding: var(--sp-2) var(--sp-3);">
              ${renderPropertyInput(field, page.properties[field.id] || '')}
            </div>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <!-- Divider -->
      <div style="height: 1px; background: var(--border-subtle); margin-bottom: var(--sp-8);"></div>

      <!-- Rich Text Editor -->
      <div id="pv-editor-mount"></div>

      <!-- Backlinks Panel -->
      <div id="pv-backlinks-panel" style="margin-top: var(--sp-12); padding-top: var(--sp-6); border-top: 1px dashed var(--border-subtle);">
        <h3 style="font-size: var(--fs-xs); color: var(--text-muted); text-transform: uppercase; margin: 0 0 var(--sp-4); letter-spacing: 0.08em; display: flex; align-items: center; gap: 6px;">
          <i data-lucide="link-2" style="width: 14px; height: 14px; color: var(--accent-primary);"></i>
          Backlinks / Mentions (<span id="pv-backlinks-count">0</span>)
        </h3>
        <div id="pv-backlinks-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--sp-3);">
          <!-- Rendered dynamically -->
        </div>
      </div>

    </div>
  `;

  refreshIcons();

  // ── Cover image upload ───────────────────────────────────────────────────
  const coverArea = container.querySelector('#pv-cover-area');
  const coverInput = container.querySelector('#pv-cover-input');
  const coverPlaceholder = container.querySelector('#pv-cover-placeholder');
  const coverOverlay = container.querySelector('#pv-cover-overlay');

  if (coverArea && coverInput) {
    // Hover effects
    if (coverPlaceholder) {
      coverArea.addEventListener('mouseenter', () => {
        coverPlaceholder.style.borderColor = 'rgba(255,255,255,0.3)';
        coverPlaceholder.style.background = 'rgba(255,255,255,0.05)';
      });
      coverArea.addEventListener('mouseleave', () => {
        coverPlaceholder.style.borderColor = 'rgba(255,255,255,0.12)';
        coverPlaceholder.style.background = 'rgba(255,255,255,0.02)';
      });
    }
    if (coverOverlay) {
      coverArea.addEventListener('mouseenter', () => { coverOverlay.style.opacity = '1'; });
      coverArea.addEventListener('mouseleave', () => { coverOverlay.style.opacity = '0'; });
    }

    // Click triggers file pick
    coverArea.addEventListener('click', () => coverInput.click());

    // On file pick: read → base64 → save
    coverInput.addEventListener('change', async () => {
      const file = coverInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        page.coverImage = e.target.result;
        await savePage(page);
        flashSaved();
        // Update UI inline without full re-render
        const existing = container.querySelector('#pv-cover-img');
        if (existing) {
          existing.src = page.coverImage;
        } else {
          // Replace placeholder with image
          const placeholder = container.querySelector('#pv-cover-placeholder');
          if (placeholder) {
            placeholder.outerHTML = `
              <img id="pv-cover-img" src="${page.coverImage}" alt="Cover"
                style="width: 120px; height: 80px; border-radius: 10px; object-fit: cover; border: 1px solid rgba(255,255,255,0.1); display: block;">
              <div id="pv-cover-overlay" style="position: absolute; inset: 0; background: rgba(0,0,0,0.5); border-radius: 10px; opacity: 0; display: flex; align-items: center; justify-content: center; transition: opacity 0.15s; font-size: 0.7rem; color: #fff; gap: 4px;">
                <i data-lucide="image" style="width:12px;height:12px;"></i> Change
              </div>`;
            refreshIcons();
            const newOverlay = container.querySelector('#pv-cover-overlay');
            if (newOverlay) {
              coverArea.addEventListener('mouseenter', () => { newOverlay.style.opacity = '1'; });
              coverArea.addEventListener('mouseleave', () => { newOverlay.style.opacity = '0'; });
            }
          }
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // ── Save status flash ────────────────────────────────────────────────────
  const saveStatus = container.querySelector('#pv-save-status');
  let saveTimer;

  const flashSaved = () => {
    saveStatus.style.opacity = '1';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveStatus.style.opacity = '0'; }, 1800);
  };

  // ── Auto-save ────────────────────────────────────────────────────────────
  let autoSaveTimer;
  const triggerSave = () => {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      // Title
      const titleEl = container.querySelector('#pv-title');
      page.title = titleEl ? titleEl.innerText.trim() : page.title;

      // Properties
      container.querySelectorAll('[data-prop-field]').forEach(input => {
        page.properties[input.dataset.propField] = input.value;
      });

      // Editor content
      if (editor) {
        page.content = editor.getContent();
      }

      await savePage(page);
      flashSaved();
    }, 600);
  };

  const flushSave = async () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;

      const titleEl = container.querySelector('#pv-title');
      page.title = titleEl ? titleEl.innerText.trim() : page.title;

      container.querySelectorAll('[data-prop-field]').forEach(input => {
        page.properties[input.dataset.propField] = input.value;
      });

      if (editor) {
        page.content = editor.getContent();
      }

      await savePage(page);
    }
  };

  // ── Title editing ────────────────────────────────────────────────────────
  const titleEl = container.querySelector('#pv-title');
  // Ensure cursor shows at end when clicking
  if (titleEl) {
    titleEl.addEventListener('input', () => {
      triggerSave();
      if (window.setTabTitle) {
        window.setTabTitle(titleEl.innerText.trim() || 'Untitled');
      }
    });
    titleEl.addEventListener('blur', async () => {
      clearTimeout(autoSaveTimer);
      page.title = titleEl.innerText.trim();
      await savePage(page);
      if (window.setTabTitle) {
        window.setTabTitle(page.title || 'Untitled');
      }
      flashSaved();
    });
    titleEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
    });
    // Auto-focus if title is empty (new page)
    if (!page.title) {
      setTimeout(() => {
        try {
          titleEl.focus();
        } catch (e) {
          console.warn('Failed to auto-focus empty title:', e);
        }
      }, 50);
    }
  }

  // ── Property inputs ───────────────────────────────────────────────────────
  container.querySelectorAll('[data-prop-field]').forEach(input => {
    input.addEventListener('input', () => triggerSave());
  });

  // ── Visual Tag Event Handlers ──────────────────────────────────────────────
  container.querySelectorAll('.pv-tags-container').forEach(tagsContainer => {
    const fieldId = tagsContainer.dataset.fieldId;
    const hiddenInput = tagsContainer.querySelector(`#prop-hidden-${fieldId}`);
    const tagInput = tagsContainer.querySelector('.pv-tag-input');

    const getTagsList = () => {
      return (hiddenInput.value ? hiddenInput.value.split(',') : []).map(t => t.trim()).filter(Boolean);
    };

    const setTagsList = (tags) => {
      hiddenInput.value = tags.join(',');
      triggerSave(null);
      
      const esc = v => String(v || '').replace(/"/g, '&quot;');
      const escHtml = str => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      
      // Remove old chips
      tagsContainer.querySelectorAll('.pv-tag-chip').forEach(chip => chip.remove());
      
      // Prepend new chips before the tagInput
      tags.forEach(tag => {
        const chip = document.createElement('span');
        chip.className = 'pv-tag-chip';
        chip.style.cssText = 'background: rgba(229, 169, 59, 0.08); border: 1px solid rgba(229, 169, 59, 0.2); color: var(--accent-primary); padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-family: var(--font-hud, monospace); display: flex; align-items: center; gap: 4px; line-height: 1; user-select: none;';
        chip.innerHTML = `
          <span>${escHtml(tag)}</span>
          <span class="pv-tag-remove" data-tag="${esc(tag)}" style="cursor: pointer; font-weight: bold; font-size: 0.75rem; color: var(--text-muted); transition: color 0.15s; margin-left: 2px;">✕</span>
        `;
        
        // Add remove click handler
        chip.querySelector('.pv-tag-remove').addEventListener('click', () => {
          const updated = getTagsList().filter(t => t !== tag);
          setTagsList(updated);
        });
        
        chip.querySelector('.pv-tag-remove').addEventListener('mouseenter', (e) => {
          e.target.style.color = 'var(--color-danger, #f43f5e)';
        });
        chip.querySelector('.pv-tag-remove').addEventListener('mouseleave', (e) => {
          e.target.style.color = 'var(--text-muted)';
        });

        tagsContainer.insertBefore(chip, tagInput);
      });
    };

    // Bind initial remove buttons
    tagsContainer.querySelectorAll('.pv-tag-remove').forEach(removeBtn => {
      removeBtn.addEventListener('click', (e) => {
        const tag = e.target.dataset.tag;
        const updated = getTagsList().filter(t => t !== tag);
        setTagsList(updated);
      });
    });

    const addTagFromInput = () => {
      const newTag = tagInput.value.trim().replace(/,/g, '');
      if (newTag) {
        const current = getTagsList();
        if (!current.includes(newTag)) {
          current.push(newTag);
          setTagsList(current);
        }
      }
      tagInput.value = '';
    };

    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTagFromInput();
      }
    });

    tagInput.addEventListener('blur', () => {
      addTagFromInput();
    });
  });

  // ── Rich Text Editor ──────────────────────────────────────────────────────
  const editorMount = container.querySelector('#pv-editor-mount');
  editor = await createEditor(editorMount, {
    placeholder: 'Start writing…',
    initialContent: page.content || ''
  });

  editor.quill.on('text-change', () => {
    triggerSave();
  });

  // ── Initialize Map Editor (if map page schema) ──
  const mapMount = container.querySelector('#pv-map-editor-mount');
  if (mapMount) {
    if (page.coverImage) {
      await initMapEditor(mapMount, page);
    } else {
      const addBtn = mapMount.querySelector('#pv-add-map-btn');
      if (addBtn) {
        const triggerUpload = (file) => {
          if (!file || !file.type.startsWith('image/')) return;
          const reader = new FileReader();
          reader.onload = async (ev) => {
            page.coverImage = ev.target.result;
            await savePage(page);
            renderPageView(container, params);
            showToast('Map image added to entry!', 'success');
          };
          reader.readAsDataURL(file);
        };

        addBtn.addEventListener('click', () => {
          const fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.accept = 'image/*';
          fileInput.onchange = (e) => triggerUpload(e.target.files[0]);
          fileInput.click();
        });

        addBtn.addEventListener('dragover', (e) => {
          e.preventDefault();
          addBtn.style.borderColor = 'var(--accent-primary)';
          addBtn.style.background = 'rgba(255,255,255,0.03)';
        });

        addBtn.addEventListener('dragleave', () => {
          addBtn.style.borderColor = '';
          addBtn.style.background = '';
        });

        addBtn.addEventListener('drop', (e) => {
          e.preventDefault();
          triggerUpload(e.dataTransfer.files[0]);
        });
      }
    }
  }

  // ── Back button ────────────────────────────────────────────────────────────
  const backBtn = container.querySelector('#pv-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', async () => {
      // Force immediate save of everything before navigating
      await flushSave();
      
      if (schema) {
        navigate(`schema/${schema.id}`);
      } else {
        history.length > 1 ? history.back() : navigate('dashboard');
      }
    });
  }

  // ── Delete button ─────────────────────────────────────────────────────────
  const deleteBtn = container.querySelector('#pv-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const confirmed = await showConfirm('Delete Page', `Delete "${page.title || 'Untitled'}"? This cannot be undone.`);
      if (!confirmed) return;
      await deletePage(page.id);
      showToast('Page deleted', 'info');
      if (schema) {
        navigate(`schema/${schema.id}`);
      } else {
        navigate('dashboard');
      }
    });
  }

  // ── Load & Render Backlinks ──
  const loadBacklinks = async () => {
    const listEl = container.querySelector('#pv-backlinks-list');
    const countEl = container.querySelector('#pv-backlinks-count');
    if (!listEl) return;

    try {
      const backlinks = await getBacklinks(page.id);
      countEl.textContent = backlinks.length;
      listEl.innerHTML = '';

      if (backlinks.length === 0) {
        listEl.innerHTML = `<div style="font-size: var(--fs-xs); color: var(--text-muted); font-style: italic; padding: 4px 0;">No backlinks yet. Link to this page using [[${page.title || 'Title'}]] in another page.</div>`;
        return;
      }

      // Fetch all schemas to map colors
      const allSchemas = await getSchemas(page.projectId);

      for (const link of backlinks) {
        const srcPage = await getPage(link.sourceId);
        if (!srcPage) continue;

        const srcSchema = srcPage.schemaId ? await getSchema(srcPage.schemaId) : null;
        let schemaColor = '#a8a29e';
        let schemaName = 'Standalone';

        if (srcSchema) {
          schemaName = srcSchema.name;
          const idx = allSchemas.findIndex(s => s.id === srcSchema.id);
          const colors = ['#f43f5e', '#a855f7', '#3b82f6', '#10b981', '#e5a93b', '#06b6d4', '#ec4899', '#f97316'];
          schemaColor = colors[idx !== -1 ? idx % colors.length : 0];
        }

        const card = document.createElement('div');
        card.className = 'backlink-card';
        card.style.cssText = `
          padding: var(--sp-2.5) var(--sp-3.5);
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-subtle);
          border-left: 3px solid ${schemaColor};
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 2px;
        `;
        card.onmouseenter = () => {
          card.style.background = 'rgba(255, 255, 255, 0.04)';
          card.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        };
        card.onmouseleave = () => {
          card.style.background = 'rgba(255, 255, 255, 0.02)';
          card.style.borderColor = 'var(--border-subtle)';
        };

        card.innerHTML = `
          <div style="font-size: 8px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">${escHtml(schemaName)}</div>
          <span style="font-weight: var(--fw-medium); color: var(--text-primary); font-size: var(--fs-xs);">${escHtml(srcPage.title || 'Untitled')}</span>
        `;

        card.addEventListener('click', () => {
          navigate(`page/${srcPage.id}`);
        });

        listEl.appendChild(card);
      }
    } catch (err) {
      console.error('Failed to load backlinks:', err);
    }
  };

  const handleDbUpdate = async (e) => {
    if (e.detail && (e.detail.storeName === 'links' || e.detail.storeName === 'pages')) {
      await loadBacklinks();
    }
  };
  window.addEventListener('forge-db-updated', handleDbUpdate);

  await loadBacklinks();

  // ── Intercept Click Navigation on wiki-links ──
  container.addEventListener('click', (e) => {
    const wikiLink = e.target.closest('.wiki-link');
    if (wikiLink) {
      e.preventDefault();
      const targetPageId = wikiLink.dataset.pageId;
      navigate(`page/${targetPageId}`);
    }
  });

  // ── Wiki Hover Preview Tooltip ──
  let hoverTimer = null;
  let previewEl = null;

  const showPreview = async (wikiLinkEl, pageId) => {
    const targetPage = await getPage(pageId);
    if (!targetPage) return;

    const targetSchema = targetPage.schemaId ? await getSchema(targetPage.schemaId) : null;
    let schemaName = targetSchema ? targetSchema.name : 'Standalone';
    let schemaColor = '#a8a29e';

    if (targetSchema) {
      const allSchemas = await getSchemas(page.projectId);
      const idx = allSchemas.findIndex(s => s.id === targetSchema.id);
      const colors = ['#f43f5e', '#a855f7', '#3b82f6', '#10b981', '#e5a93b', '#06b6d4', '#ec4899', '#f97316'];
      schemaColor = colors[idx !== -1 ? idx % colors.length : 0];
    }

    // Snippet extraction
    let snippet = 'No text content.';
    if (targetPage.content) {
      if (targetPage.content.startsWith('{')) {
        try {
          const delta = JSON.parse(targetPage.content);
          if (delta.ops) {
            snippet = delta.ops.map(op => typeof op.insert === 'string' ? op.insert : '').join('').trim();
          }
        } catch (_) {}
      } else {
        snippet = targetPage.content;
      }
    }
    const truncatedSnippet = snippet.length > 90 ? snippet.slice(0, 90) + '...' : snippet || 'No text content.';

    // Create preview element if not exists
    if (!previewEl) {
      previewEl = document.createElement('div');
      previewEl.className = 'wiki-hover-preview';
      document.body.appendChild(previewEl);
    }

    previewEl.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <span style="font-size: 8px; color: var(--text-muted); text-transform: uppercase;">${escHtml(schemaName)}</span>
        <span style="display:inline-block; width: 6px; height: 6px; border-radius:50%; background: ${schemaColor}; box-shadow: 0 0 6px ${schemaColor}"></span>
      </div>
      <h4 style="margin: 4px 0; font-size: var(--fs-xs); color: var(--text-primary); font-weight: 700;">${escHtml(targetPage.title || 'Untitled')}</h4>
      <p style="margin: 0; font-size: 9px; color: var(--text-secondary); line-height: 1.4;">${escHtml(truncatedSnippet)}</p>
    `;

    // Position preview relative to link position on window
    const linkRect = wikiLinkEl.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

    previewEl.style.left = `${linkRect.left + scrollLeft - 10}px`;
    previewEl.style.top = `${linkRect.bottom + scrollTop + 6}px`;
    
    // Trigger animation
    requestAnimationFrame(() => {
      previewEl.classList.add('visible');
    });
  };

  const hidePreview = () => {
    if (previewEl) {
      previewEl.classList.remove('visible');
      const el = previewEl;
      previewEl = null;
      setTimeout(() => el.remove(), 200);
    }
  };

  container.addEventListener('mouseover', (e) => {
    const link = e.target.closest('a');
    if (link) {
      const href = link.getAttribute('href') || '';
      if (href.startsWith('#/page/') || link.classList.contains('wiki-link')) {
        const pageId = href.split('/').pop() || link.dataset.pageId;
        if (pageId) {
          clearTimeout(hoverTimer);
          hoverTimer = setTimeout(() => {
            showPreview(link, pageId);
          }, 400);
        }
      }
    }
  });

  container.addEventListener('mouseout', (e) => {
    const link = e.target.closest('a');
    if (link) {
      if (e.relatedTarget && link.contains(e.relatedTarget)) {
        return; // Still inside the link!
      }
      const href = link.getAttribute('href') || '';
      if (href.startsWith('#/page/') || link.classList.contains('wiki-link')) {
        clearTimeout(hoverTimer);
        hidePreview();
      }
    }
  });

  // Cleanup tooltip if navigating away
  container._cleanup = () => {
    window.removeEventListener('forge-db-updated', handleDbUpdate);
    clearTimeout(hoverTimer);
    if (previewEl) previewEl.remove();
    flushSave();
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fieldIcon(type) {
  const map = { text: 'type', number: 'hash', select: 'chevron-down', multiselect: 'list', date: 'calendar', relation: 'link-2', url: 'globe', email: 'mail' };
  return map[type] || 'tag';
}

function renderPropertyInput(field, value) {
  const esc = v => String(v || '').replace(/"/g, '&quot;');
  
  if (field.type === 'select' && field.options) {
    return `<select data-prop-field="${field.id}" class="form-input" style="height: 34px; font-size: var(--fs-sm); background: transparent; border: none; padding: var(--sp-1) var(--sp-2); width: 100%;">
      <option value="">—</option>
      ${field.options.map(o => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${escHtml(o)}</option>`).join('')}
    </select>`;
  }

  if (field.type === 'tags' || field.type === 'multiselect' || field.name.toLowerCase() === 'tags') {
    const tags = (value ? value.split(',') : []).map(t => t.trim()).filter(Boolean);
    return `
      <div class="pv-tags-container" data-field-id="${field.id}" style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-height: 34px; padding: 4px 8px; width: 100%; box-sizing: border-box; background: rgba(255,255,255,0.01); border-radius: 4px;">
        <input type="hidden" data-prop-field="${field.id}" id="prop-hidden-${field.id}" value="${esc(value)}" />
        ${tags.map(tag => `
          <span class="pv-tag-chip" style="background: rgba(229, 169, 59, 0.08); border: 1px solid rgba(229, 169, 59, 0.2); color: var(--accent-primary); padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-family: var(--font-hud, monospace); display: flex; align-items: center; gap: 4px; line-height: 1; user-select: none;">
            <span>${escHtml(tag)}</span>
            <span class="pv-tag-remove" data-tag="${esc(tag)}" style="cursor: pointer; font-weight: bold; font-size: 0.75rem; color: var(--text-muted); transition: color 0.15s; margin-left: 2px;">✕</span>
          </span>
        `).join('')}
        <input type="text" class="pv-tag-input" placeholder="Add tag..." style="background: transparent; border: none; outline: none; font-size: var(--fs-sm); color: var(--text-primary); flex: 1; min-width: 80px; height: 24px; padding: 0; margin: 0;" />
      </div>
      <div style="font-size: 0.65rem; color: var(--text-muted); padding: 2px 8px 0; font-family: var(--font-hud, monospace); opacity: 0.7;">
        Press Enter or Comma to add.
      </div>
    `;
  }

  if (field.type === 'date') {
    return `<input type="date" data-prop-field="${field.id}" value="${esc(value)}"
      style="width: 100%; background: transparent; border: none; outline: none; color: var(--text-primary); font-size: var(--fs-sm); padding: var(--sp-1) var(--sp-2); height: 34px;" />`;
  }
  if (field.type === 'number') {
    return `<input type="number" data-prop-field="${field.id}" value="${esc(value)}" placeholder="—"
      style="width: 100%; background: transparent; border: none; outline: none; color: var(--text-primary); font-size: var(--fs-sm); padding: var(--sp-1) var(--sp-2); height: 34px;" />`;
  }
  if (field.type === 'url') {
    return `<input type="url" data-prop-field="${field.id}" value="${esc(value)}" placeholder="https://..."
      style="width: 100%; background: transparent; border: none; outline: none; color: var(--accent-cyan); font-size: var(--fs-sm); padding: var(--sp-1) var(--sp-2); height: 34px;" />`;
  }
  if (field.type === 'email') {
    return `<input type="email" data-prop-field="${field.id}" value="${esc(value)}" placeholder="email@example.com"
      style="width: 100%; background: transparent; border: none; outline: none; color: var(--text-primary); font-size: var(--fs-sm); padding: var(--sp-1) var(--sp-2); height: 34px;" />`;
  }

  return `<input type="text" data-prop-field="${field.id}" value="${esc(value)}" placeholder="—"
    style="width: 100%; background: transparent; border: none; outline: none; color: var(--text-primary); font-size: var(--fs-sm); padding: var(--sp-1) var(--sp-2); height: 34px;" />`;
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

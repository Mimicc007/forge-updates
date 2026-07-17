/* ============================================================
   Forge — Page View / Editor
   Notion-style document editor for pages (schema entries or standalone docs).
   ============================================================ */

import { getPage, savePage, getSchema, deletePage, getBacklinks, getSchemas, getPagesBySchema } from '../db.js';
import { refreshIcons } from '../icons.js';
import { navigate } from '../router.js';
import { showToast, showConfirm, createEditor, timeAgo } from '../ui.js';
import { initMapEditor } from '../mapEditor.js';
import { refreshSidebarLists } from '../sidebar.js';

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
  let characters = [];
  if (page.schemaId) {
    schema = await getSchema(page.schemaId);
    if (schema && schema.fields && schema.fields.some(f => f.isDynamicCharacters)) {
      const projectSchemas = await getSchemas(page.projectId);
      const matchingSchemas = projectSchemas.filter(s => {
        const id = (s.id || '').toLowerCase();
        const name = (s.name || '').toLowerCase();
        if (['story-chars-schema', 'dnd-npcs-schema', 'dnd-monsters-schema', 'gamedev-units-schema'].includes(id)) {
          return true;
        }
        const keywords = ['character', 'npc', 'monster', 'enemy', 'boss', 'unit', 'foe', 'hero'];
        return keywords.some(kw => name.includes(kw));
      });

      let charPages = [];
      for (const s of matchingSchemas) {
        const pages = await getPagesBySchema(s.id);
        charPages.push(...pages);
      }

      if (charPages.length === 0) {
        charPages = await getPagesBySchema('story-chars-schema');
      }

      const seen = new Set();
      characters = charPages.filter(p => {
        const title = p.title || 'Untitled';
        if (seen.has(title)) return false;
        seen.add(title);
        return true;
      });
    }
  }

  const isMapPage = ['dnd-maps-schema', 'story-maps-schema', 'story-locs-schema', 'locations'].includes(page.schemaId) || (schema && ['dnd-maps-schema', 'story-maps-schema', 'story-locs-schema', 'locations'].includes(schema.templateId));

  // Build the page wrapper
  container.innerHTML = `
    <style>
      #pv-title[data-placeholder]:empty::before {
        content: attr(data-placeholder);
        color: var(--text-muted);
        pointer-events: none;
      }
      #pv-title {
        caret-color: var(--accent-primary);
        border-bottom: 2px solid transparent;
        transition: border-color 0.3s ease, box-shadow 0.3s ease;
        padding-bottom: 8px;
      }
      #pv-title:focus {
        border-color: var(--accent-primary-dim);
        box-shadow: 0 4px 12px -4px var(--accent-primary-glow);
      }
      .pv-cover-area:hover #pv-cover-overlay {
        opacity: 1 !important;
      }
      .pv-cover-area:hover {
        border-color: var(--accent-primary-dim) !important;
        box-shadow: 0 0 20px -5px var(--accent-primary-glow) !important;
      }
      #pv-icon-area:hover {
        transform: scale(1.06) translateY(-2px);
        border-color: var(--accent-primary) !important;
        box-shadow: var(--shadow-xl), 0 0 20px var(--accent-primary-dim) !important;
      }
      #pv-icon-area:hover #pv-icon-graphic {
        transform: rotate(6deg) scale(1.1);
      }
      .pv-meta-item {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .pv-meta-item i {
        width: 13px;
        height: 13px;
        color: var(--accent-primary);
        opacity: 0.8;
      }
    </style>
    <div class="page-view-wrapper" style="position: relative;">
      
      <!-- Top bar: breadcrumbs + actions -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-8);">
        <div class="breadcrumb" style="margin-bottom: 0;">
          <div class="breadcrumb-item" id="pv-bread-root" title="Go to Dashboard">
            <i data-lucide="home" style="width:12px;height:12px;"></i>
            Dashboard
          </div>
          ${schema ? `
            <span class="breadcrumb-sep">›</span>
            <div class="breadcrumb-item" id="pv-bread-schema" title="Go to ${schema.name} Database">
              <i data-lucide="${schema.icon || 'database'}" style="width:12px;height:12px;"></i>
              ${escHtml(schema.name)}
            </div>
          ` : ''}
          <span class="breadcrumb-sep">›</span>
          <div class="breadcrumb-item active" id="pv-bread-current">${escHtml(page.title || 'Untitled')}</div>
        </div>

        <div style="display: flex; gap: 8px; align-items: center;">
          <!-- Autosave Indicator -->
          <div class="autosave-indicator saved" id="pv-save-status" style="opacity: 0; transition: opacity 0.3s; display: flex; align-items: center; gap: 6px;">
            <i data-lucide="check" style="width:12px;height:12px;color:var(--accent-green);"></i>
            <span>Saved</span>
          </div>

          <!-- Focus & Typewriter toggles -->
          <button id="pv-focus-btn" class="btn btn-secondary btn-icon" title="Toggle Focus Mode (Ctrl+Shift+F)">
            <i data-lucide="maximize-2"></i>
          </button>
          <button id="pv-typewriter-btn" class="btn btn-secondary btn-icon" title="Toggle Typewriter Mode (Ctrl+Shift+T)">
            <i data-lucide="heading"></i>
          </button>

          <!-- Properties slide-in panel toggle -->
          ${schema && schema.fields && schema.fields.length > 0 ? `
            <button id="pv-props-btn" class="btn btn-secondary btn-icon" title="Document Properties">
              <i data-lucide="sliders-horizontal"></i>
            </button>
          ` : ''}

          <button id="pv-delete-btn" class="btn btn-secondary btn-icon" style="color: var(--accent-red); border-color: transparent;" title="Delete Page">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>

      <!-- Overlapping Cover & Icon Header Section -->
      <div class="pv-header-container" style="position: relative; margin-bottom: 50px; border-radius: 16px; overflow: visible;">
        <!-- Cover Image area -->
        ${!isMapPage ? `
          <div id="pv-cover-area" class="pv-cover-area" style="position: relative; width: 100%; height: 200px; border-radius: 16px; overflow: hidden; cursor: pointer; transition: all 0.3s var(--easing-out-expo); background: rgba(255, 255, 255, 0.01); border: 1px solid var(--border-subtle);">
            ${page.coverImage ? `
              <img id="pv-cover-img" src="${page.coverImage}" alt="Cover" style="width: 100%; height: 100%; object-fit: cover; display: block; transition: filter 0.3s;">
              <div id="pv-cover-overlay" style="position: absolute; inset: 0; background: rgba(0,0,0,0.45); opacity: 0; display: flex; align-items: center; justify-content: center; transition: opacity 0.2s; font-size: 0.85rem; color: #fff; font-family: var(--font-heading); font-weight: 600; gap: 8px;">
                <i data-lucide="image" style="width:16px;height:16px;"></i> Change Cover Image
              </div>
            ` : `
              <div id="pv-cover-placeholder" style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; transition: all 0.3s; border: 1.5px dashed rgba(255,255,255,0.12); border-radius: 16px; background: rgba(255,255,255,0.02);">
                <i data-lucide="image-plus" style="width:24px;height:24px;color:var(--text-muted); opacity: 0.6;"></i>
                <span style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-hud);">Add Cover Image Preset or Upload</span>
              </div>
            `}
            <input type="file" id="pv-cover-input" accept="image/*" style="display:none;">
          </div>
        ` : ''}

        <!-- Overlapping Page Icon Area -->
        <div id="pv-icon-area" style="position: absolute; bottom: -28px; left: 28px; z-index: 10; cursor: pointer; width: 68px; height: 68px; border-radius: 18px; background: var(--bg-deep); border: 2px solid var(--border-strong); box-shadow: var(--shadow-lg), 0 0 15px var(--accent-primary-dim); display: flex; align-items: center; justify-content: center; transition: all 0.25s var(--easing-out-expo);" title="Click to change icon">
          <i id="pv-icon-graphic" data-lucide="${page.icon || 'file-text'}" style="width: 32px; height: 32px; color: var(--accent-primary); transition: transform 0.25s var(--easing-out-expo);"></i>
        </div>
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
        style="font-size: 2.5rem; font-weight: 700; color: var(--text-primary); outline: none; margin-bottom: 12px; min-height: 1.2em; empty-cells: show; word-break: break-word; margin-top: 16px;"
      >${escHtml(page.title || '')}</div>

      <!-- Info/Stats row below title -->
      <div style="display: flex; align-items: center; gap: 16px; font-size: var(--fs-xs); color: var(--text-muted); margin-bottom: 28px; font-family: var(--font-hud); flex-wrap: wrap;">
        <span class="pv-meta-item"><i data-lucide="book-open"></i> <span id="pv-word-count-val">0 words</span></span>
        <span style="opacity: 0.4;">·</span>
        <span class="pv-meta-item"><i data-lucide="clock"></i> <span id="pv-read-time-val">0 min read</span></span>
        <span style="opacity: 0.4;">·</span>
        <span class="pv-meta-item"><i data-lucide="calendar"></i> <span>Edited ${timeAgo(page.updatedAt)}</span></span>
      </div>

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

    <!-- Properties Slide-In Panel — premium redesign -->
    ${schema && schema.fields && schema.fields.length > 0 ? `
    <div id="pv-props-panel" class="props-panel">
      <div class="props-panel-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="width:28px; height:28px; border-radius:8px; background:rgba(229,169,59,0.12); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            <i data-lucide="sliders-horizontal" style="width:14px; height:14px; color:var(--accent-primary);"></i>
          </div>
          <div>
            <div class="props-panel-title">Metadata</div>
            <div style="font-size:0.6rem; color:var(--text-muted); font-family:var(--font-hud); letter-spacing:0.05em;">${schema.fields.length} field${schema.fields.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <button id="pv-props-close" class="btn-icon" title="Close Panel" style="width:28px;height:28px;border-radius:8px;"><i data-lucide="x" style="width: 13px; height: 13px;"></i></button>
      </div>
      <div class="props-panel-body">
        ${schema.fields.map(field => `
          <div class="props-field-card">
            <div class="prop-field-label">
              <i data-lucide="${fieldIcon(field.type)}" style="width: 11px; height: 11px; color: var(--accent-primary); opacity:0.8;"></i>
              <span>${escHtml(field.name)}</span>
            </div>
            <div class="prop-field-value">
              ${renderPropertyInput(field, page.properties[field.id] || '', characters)}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}
  
  `;

  refreshIcons();

  // ── Word Count & Reading Time calculation ───────────────────────────────────
  const updateStats = () => {
    if (!editor || !editor.quill) return;
    const text = editor.quill.getText() || '';
    const cleanText = text.trim();
    const words = cleanText ? cleanText.split(/\s+/).filter(Boolean).length : 0;
    
    // Estimate reading time: average adult reads ~200-250 wpm
    const readTime = Math.max(1, Math.ceil(words / 200));

    const wordCountEl = container.querySelector('#pv-word-count-val');
    const readTimeEl = container.querySelector('#pv-read-time-val');
    
    if (wordCountEl) wordCountEl.textContent = `${words} word${words !== 1 ? 's' : ''}`;
    if (readTimeEl) readTimeEl.textContent = `${readTime} min${readTime !== 1 ? 's' : ''} read`;
  };

  // ── Page Icon Picker Modal ────────────────────────────────────────────────
  const iconArea = container.querySelector('#pv-icon-area');
  if (iconArea) {
    iconArea.addEventListener('click', () => {
      const modalId = 'pv-icon-picker-modal';
      const existing = document.getElementById(modalId);
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = modalId;
      modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(5, 4, 8, 0.75); backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px); display: flex; align-items: center;
        justify-content: center; z-index: 10100;
      `;

      // Icons options list
      const iconsList = [
        'feather', 'book', 'book-open', 'scroll', 'sword', 'shield', 'gem', 
        'crown', 'compass', 'award', 'heart', 'flame', 'map-pin', 'map', 
        'activity', 'sparkles', 'zap', 'key', 'castle', 'skull', 
        'file-text', 'glasses', 'coffee', 'pen-tool'
      ];

      modal.innerHTML = `
        <div class="card" style="width: 100%; max-width: 420px; padding: var(--sp-6); background: rgba(20, 17, 34, 0.96); border: 1px solid rgba(229, 169, 59, 0.25); box-shadow: var(--shadow-2xl); border-radius: var(--radius-lg); animation: scaleIn 0.2s ease-out;">
          <h3 style="color: #fff; margin-top: 0; margin-bottom: 16px; font-family: var(--font-heading); font-size: 1.15rem; display:flex; align-items:center; gap:8px;">
            <i data-lucide="sparkles" style="color: var(--accent-primary); width: 18px; height: 18px;"></i>
            <span>Select Page Icon</span>
          </h3>
          <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px;">
            ${iconsList.map(iconName => `
              <button class="icon-option-btn btn-secondary" data-icon="${iconName}" style="width: 54px; height: 54px; display: flex; align-items: center; justify-content: center; border-radius: 12px; cursor: pointer; transition: all 0.15s; background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); padding: 0;">
                <i data-lucide="${iconName}" style="width: 22px; height: 22px; color: var(--text-secondary);"></i>
              </button>
            `).join('')}
          </div>
          <div style="display: flex; justify-content: flex-end;">
            <button class="btn btn-ghost" id="pv-icon-cancel" style="font-family: var(--font-hud);">Cancel</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      refreshIcons();

      // Hook up options
      modal.querySelectorAll('.icon-option-btn').forEach(btn => {
        btn.style.transition = 'all 0.15s ease-in-out';
        btn.addEventListener('mouseenter', () => {
          btn.style.transform = 'scale(1.08)';
          btn.style.borderColor = 'var(--accent-primary)';
          btn.style.background = 'var(--accent-primary-dim)';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.transform = '';
          btn.style.borderColor = '';
          btn.style.background = '';
        });
        btn.addEventListener('click', async () => {
          const selected = btn.dataset.icon;
          page.icon = selected;
          await savePage(page);
          
          // Update visual immediately
          const graphic = container.querySelector('#pv-icon-graphic');
          if (graphic) {
            graphic.setAttribute('data-lucide', selected);
            refreshIcons();
          }
          modal.remove();
          showToast('Icon updated!', 'success');
          // Also refresh sidebar lists to propagate icon change
          await refreshSidebarLists();
        });
      });

      modal.querySelector('#pv-icon-cancel').addEventListener('click', () => modal.remove());
    });
  }

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
          // Replace placeholder with correctly-sized full-bleed image
          const placeholder = container.querySelector('#pv-cover-placeholder');
          if (placeholder) {
            placeholder.outerHTML = `
              <img id="pv-cover-img" src="${page.coverImage}" alt="Cover"
                style="width: 100%; height: 100%; object-fit: cover; display: block; transition: filter 0.3s;">
              <div id="pv-cover-overlay" style="position: absolute; inset: 0; background: rgba(0,0,0,0.45); opacity: 0; display: flex; align-items: center; justify-content: center; transition: opacity 0.2s; font-size: 0.85rem; color: #fff; font-family: var(--font-heading); font-weight: 600; gap: 8px;">
                <i data-lucide="image" style="width:16px;height:16px;"></i> Change Cover Image
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

  const showSaving = () => {
    if (!saveStatus) return;
    saveStatus.className = 'autosave-indicator saving';
    saveStatus.innerHTML = '<i data-lucide="loader" style="width:12px;height:12px;"></i><span>Saving...</span>';
    saveStatus.style.opacity = '1';
    refreshIcons();
  };

  const flashSaved = () => {
    if (!saveStatus) return;
    saveStatus.className = 'autosave-indicator saved';
    saveStatus.innerHTML = '<i data-lucide="check" style="width:12px;height:12px;color:var(--accent-green);"></i><span>Saved</span>';
    saveStatus.style.opacity = '1';
    refreshIcons();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { if (saveStatus) saveStatus.style.opacity = '0'; }, 2000);
  };

  // ── Auto-save ────────────────────────────────────────────────────────────
  let autoSaveTimer;
  const triggerSave = () => {
    showSaving();
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      // Title
      const titleEl = container.querySelector('#pv-title');
      page.title = titleEl ? titleEl.innerText.trim() : page.title;

      // Properties
      container.querySelectorAll('[data-prop-field]').forEach(input => {
        page.properties[input.dataset.propField] = input.value;
      });

      // Sync Primary/Secondary POV characters to characters list
      if (page.isStoryBeat || page.schemaId === 'story-chapters-schema') {
        const charIds = new Set(page.properties.characters || []);
        if (page.properties.f4) {
          const charPage = characters.find(c => (c.title || 'Untitled') === page.properties.f4);
          if (charPage) charIds.add(charPage.id);
        }
        if (page.properties.f5) {
          const charPage = characters.find(c => (c.title || 'Untitled') === page.properties.f5);
          if (charPage) charIds.add(charPage.id);
        }
        page.properties.characters = Array.from(charIds);
      }

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

      // Sync Primary/Secondary POV characters to characters list
      if (page.isStoryBeat || page.schemaId === 'story-chapters-schema') {
        const charIds = new Set(page.properties.characters || []);
        if (page.properties.f4) {
          const charPage = characters.find(c => (c.title || 'Untitled') === page.properties.f4);
          if (charPage) charIds.add(charPage.id);
        }
        if (page.properties.f5) {
          const charPage = characters.find(c => (c.title || 'Untitled') === page.properties.f5);
          if (charPage) charIds.add(charPage.id);
        }
        page.properties.characters = Array.from(charIds);
      }

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

  // Handle dynamic dropdown exclusions for Primary/Secondary POV
  const dynamicSelects = Array.from(container.querySelectorAll('select[data-prop-field]')).filter(select => {
    const fieldId = select.dataset.propField;
    const field = schema?.fields?.find(f => f.id === fieldId);
    return field && field.isDynamicCharacters;
  });

  const updateDynamicOptions = () => {
    const selectedValues = dynamicSelects.map(s => s.value).filter(Boolean);
    dynamicSelects.forEach(select => {
      const currentVal = select.value;
      const options = select.querySelectorAll('option');
      options.forEach(opt => {
        if (!opt.value) return; // Skip empty option
        const isSelectedElsewhere = selectedValues.includes(opt.value) && opt.value !== currentVal;
        opt.disabled = isSelectedElsewhere;
        opt.hidden = isSelectedElsewhere;
        opt.style.display = isSelectedElsewhere ? 'none' : '';
      });
    });
  };

  if (dynamicSelects.length > 0) {
    dynamicSelects.forEach(select => {
      select.addEventListener('change', () => {
        updateDynamicOptions();
        triggerSave();
      });
    });
    updateDynamicOptions();
  }

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

  // Calculate initial page stats
  setTimeout(updateStats, 100);

  editor.quill.on('text-change', () => {
    triggerSave();
    updateStats();
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

  // ── Breadcrumbs ────────────────────────────────────────────────────────────
  const breadRoot = container.querySelector('#pv-bread-root');
  if (breadRoot) {
    breadRoot.addEventListener('click', async () => {
      await flushSave();
      navigate('dashboard');
    });
  }
  const breadSchema = container.querySelector('#pv-bread-schema');
  if (breadSchema) {
    breadSchema.addEventListener('click', async () => {
      await flushSave();
      navigate(`schema/${schema.id}`);
    });
  }

  // ── Properties Panel Toggle ────────────────────────────────────────────────
  const propsBtn = container.querySelector('#pv-props-btn');
  const propsPanel = container.querySelector('#pv-props-panel');
  const propsClose = container.querySelector('#pv-props-close');
  const wrapper = container.querySelector('.page-view-wrapper');

  if (propsBtn && propsPanel) {
    propsBtn.addEventListener('click', () => {
      const isOpen = propsPanel.classList.toggle('open');
      propsBtn.classList.toggle('active', isOpen);
      if (wrapper) wrapper.classList.toggle('props-open', isOpen);
    });
  }

  if (propsClose && propsPanel) {
    propsClose.addEventListener('click', () => {
      propsPanel.classList.remove('open');
      if (propsBtn) propsBtn.classList.remove('active');
      if (wrapper) wrapper.classList.remove('props-open');
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
      if (countEl) countEl.textContent = backlinks.length > 0 ? `(${backlinks.length})` : '(0)';
      listEl.innerHTML = '';

      if (backlinks.length === 0) {
        listEl.innerHTML = `<div style="font-size: var(--fs-xs); color: var(--text-muted); font-style: italic; padding: 4px 0;">No backlinks yet. Link to this page using [[${page.title || 'Title'}]] in another page.</div>`;
        return;
      }

      for (const link of backlinks) {
        const srcPage = await getPage(link.sourceId);
        if (!srcPage) continue;

        let snippet = 'No text content.';
        if (srcPage.content) {
          if (srcPage.content.startsWith('{')) {
            try {
              const delta = JSON.parse(srcPage.content);
              if (delta.ops) {
                snippet = delta.ops.map(op => typeof op.insert === 'string' ? op.insert : '').join('').trim();
              }
            } catch (_) {}
          } else {
            snippet = srcPage.content;
          }
        }
        const truncatedExcerpt = snippet.length > 90 ? snippet.slice(0, 90) + '...' : snippet || 'No text content.';

        const item = document.createElement('div');
        item.className = 'backlink-item';
        item.innerHTML = `
          <div class="backlink-icon">
            <i data-lucide="${srcPage.icon || 'file-text'}" style="width: 14px; height: 14px;"></i>
          </div>
          <div class="backlink-content">
            <div class="backlink-title">${escHtml(srcPage.title || 'Untitled')}</div>
            <div class="backlink-excerpt">${escHtml(truncatedExcerpt)}</div>
          </div>
        `;

        item.addEventListener('click', () => {
          navigate(`page/${srcPage.id}`);
        });

        listEl.appendChild(item);
      }
      refreshIcons();
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

  // ── Floating Format Toolbar (Selection Change) ──────────────────────────────
  let bubbleToolbar = null;
  
  const removeBubble = () => {
    if (bubbleToolbar) {
      bubbleToolbar.remove();
      bubbleToolbar = null;
    }
  };
  
  const showBubble = (selection) => {
    removeBubble();
    if (!selection || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0) return;
    
    // Only show if selection is inside our editor
    const editorEl = container.querySelector('.ql-editor');
    if (!editorEl || !editorEl.contains(range.commonAncestorContainer)) return;
    
    bubbleToolbar = document.createElement('div');
    bubbleToolbar.className = 'bubble-toolbar animate-scale-in';
    bubbleToolbar.innerHTML = `
      <button title="Bold" data-cmd="bold"><b>B</b></button>
      <button title="Italic" data-cmd="italic"><i>I</i></button>
      <button title="Underline" data-cmd="underline"><u>U</u></button>
      <div class="bubble-sep"></div>
      <button title="Heading 1" data-cmd="heading1">H1</button>
      <button title="Heading 2" data-cmd="heading2">H2</button>
      <div class="bubble-sep"></div>
      <button title="Quote" data-cmd="blockquote">❝</button>
      <button title="Code" data-cmd="code">{ }</button>
    `;
    
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - 130, window.innerWidth - 268));
    const top = rect.top + scrollY - 46;
    bubbleToolbar.style.cssText = `left: ${left}px; top: ${top}px;`;
    document.body.appendChild(bubbleToolbar);
    refreshIcons();
    
    // Format button click handlers
    bubbleToolbar.querySelectorAll('[data-cmd]').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent losing focus/selection
        if (!editor || !editor.quill) return;
        const cmd = btn.dataset.cmd;
        const q = editor.quill;
        const sel = q.getSelection();
        if (!sel) return;
        
        if (cmd === 'bold') q.format('bold', !q.getFormat(sel).bold);
        else if (cmd === 'italic') q.format('italic', !q.getFormat(sel).italic);
        else if (cmd === 'underline') q.format('underline', !q.getFormat(sel).underline);
        else if (cmd === 'heading1') q.format('header', q.getFormat(sel).header === 1 ? false : 1);
        else if (cmd === 'heading2') q.format('header', q.getFormat(sel).header === 2 ? false : 2);
        else if (cmd === 'blockquote') q.format('blockquote', !q.getFormat(sel).blockquote);
        else if (cmd === 'code') q.format('code', !q.getFormat(sel).code);
        
        removeBubble();
      });
    });
  };

  const handleSelectionChange = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.toString().trim() === '') {
      removeBubble();
      return;
    }
    showBubble(sel);
  };
  document.addEventListener('selectionchange', handleSelectionChange);

  // ── Focus & Typewriter Modes ──────────────────────────────────────────────
  let focusModeActive = false;
  let typewriterModeActive = false;
  const focusBtn = container.querySelector('#pv-focus-btn');
  const typewriterBtn = container.querySelector('#pv-typewriter-btn');

  const updateWordCount = () => {
    if (!editor) return;
    const text = editor.getText() || '';
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const wordCountEl = document.getElementById('focus-word-count');
    if (wordCountEl) {
      wordCountEl.textContent = `${words} word${words !== 1 ? 's' : ''}`;
    }
  };

  const toggleFocusMode = (forceState) => {
    focusModeActive = typeof forceState === 'boolean' ? forceState : !focusModeActive;
    document.body.classList.toggle('focus-mode', focusModeActive);
    
    if (focusBtn) {
      focusBtn.classList.toggle('active', focusModeActive);
      focusBtn.innerHTML = `<i data-lucide="${focusModeActive ? 'minimize-2' : 'maximize-2'}"></i>`;
      refreshIcons();
    }

    // Toggle bottom status panel in focus mode
    let existingBar = document.querySelector('.focus-mode-bar');
    if (focusModeActive) {
      if (!existingBar) {
        const bar = document.createElement('div');
        bar.className = 'focus-mode-bar';
        bar.innerHTML = `
          <i data-lucide="zap" style="width:12px;height:12px;color:var(--accent-amber);"></i>
          <span>Focus Mode</span>
          <span style="margin: 0 8px; opacity: 0.4;">·</span>
          <span id="focus-word-count">0 words</span>
          <span style="margin: 0 8px; opacity: 0.4;">·</span>
          <button id="pv-exit-focus" style="background:none; border:1px solid rgba(255,255,255,0.15); color:var(--text-secondary); border-radius:4px; padding:2px 8px; cursor:pointer; font-size:11px;">Exit (Esc)</button>
        `;
        document.body.appendChild(bar);
        document.getElementById('pv-exit-focus')?.addEventListener('click', () => toggleFocusMode(false));
        refreshIcons();
      }
      updateWordCount();
    } else if (existingBar) {
      existingBar.remove();
    }
  };

  const toggleTypewriterMode = (forceState) => {
    typewriterModeActive = typeof forceState === 'boolean' ? forceState : !typewriterModeActive;
    document.body.classList.toggle('typewriter-mode', typewriterModeActive);
    if (typewriterBtn) {
      typewriterBtn.classList.toggle('active', typewriterModeActive);
    }
    if (typewriterModeActive) {
      updateTypewriterLine();
    } else if (lastActivePara) {
      lastActivePara.classList.remove('ql-active');
      lastActivePara = null;
    }
  };

  let lastActivePara = null;
  const updateTypewriterLine = () => {
    if (!typewriterModeActive || !editor || !editor.quill) return;
    const q = editor.quill;
    const range = q.getSelection();
    if (!range) return;

    const [line] = q.getLine(range.index);
    if (line && line.domNode) {
      if (lastActivePara) lastActivePara.classList.remove('ql-active');
      const el = line.domNode;
      el.classList.add('ql-active');
      lastActivePara = el;

      // Center active paragraph vertically
      const rect = el.getBoundingClientRect();
      const scrollContainer = document.getElementById('main-content');
      if (scrollContainer) {
        const currentScroll = scrollContainer.scrollTop;
        const rectInContainer = rect.top + currentScroll - scrollContainer.getBoundingClientRect().top;
        const scrollTarget = rectInContainer - scrollContainer.clientHeight / 2 + rect.height / 2;
        scrollContainer.scrollTo({ top: scrollTarget, behavior: 'smooth' });
      }
    }
  };

  if (focusBtn) focusBtn.addEventListener('click', () => toggleFocusMode());
  if (typewriterBtn) typewriterBtn.addEventListener('click', () => toggleTypewriterMode());

  if (editor && editor.quill) {
    editor.quill.on('selection-change', () => {
      updateTypewriterLine();
      if (focusModeActive) updateWordCount();
    });
    editor.quill.on('text-change', () => {
      if (focusModeActive) updateWordCount();
    });
  }



  // Keyboard Shortcuts Handler
  const handleKeyShortcuts = (e) => {
    const isFocusShortcut = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toUpperCase() === 'F';
    const isTypewriterShortcut = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toUpperCase() === 'T';
    
    if (isFocusShortcut) {
      e.preventDefault();
      toggleFocusMode();
    } else if (isTypewriterShortcut) {
      e.preventDefault();
      toggleTypewriterMode();
    } else if (e.key === 'Escape') {
      if (propsPanel && propsPanel.classList.contains('open')) {
        e.preventDefault();
        propsPanel.classList.remove('open');
        if (propsBtn) propsBtn.classList.remove('active');
      }
      if (focusModeActive) {
        e.preventDefault();
        toggleFocusMode(false);
      }
      if (typewriterModeActive) {
        e.preventDefault();
        toggleTypewriterMode(false);
      }
    }
  };
  document.addEventListener('keydown', handleKeyShortcuts);

  // Cleanup tooltip if navigating away
  container._cleanup = () => {
    window.removeEventListener('forge-db-updated', handleDbUpdate);
    document.removeEventListener('selectionchange', handleSelectionChange);
    document.removeEventListener('keydown', handleKeyShortcuts);
    clearTimeout(hoverTimer);
    if (previewEl) previewEl.remove();
    removeBubble();
    
    // Remove focus mode classes/elements from body
    document.body.classList.remove('focus-mode');
    document.body.classList.remove('typewriter-mode');
    const existingBar = document.querySelector('.focus-mode-bar');
    if (existingBar) existingBar.remove();

    // Casual Mode cleanup
    if (container._simpleKeyHandler) {
      document.removeEventListener('keydown', container._simpleKeyHandler);
    }

    flushSave();
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fieldIcon(type) {
  const map = { text: 'type', number: 'hash', select: 'chevron-down', multiselect: 'list', date: 'calendar', relation: 'link-2', url: 'globe', email: 'mail' };
  return map[type] || 'tag';
}

function renderPropertyInput(field, value, characters = []) {
  const esc = v => String(v || '').replace(/"/g, '&quot;');
  
  if (field.type === 'select') {
    if (field.isDynamicCharacters) {
      const options = characters.map(c => c.title || 'Untitled');
      return `<select data-prop-field="${field.id}" class="form-input" style="height: 34px; font-size: var(--fs-sm); background: transparent; border: none; padding: var(--sp-1) var(--sp-2); width: 100%;">
        <option value="">—</option>
        ${options.map(o => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${escHtml(o)}</option>`).join('')}
      </select>`;
    }
    if (field.options) {
      return `<select data-prop-field="${field.id}" class="form-input" style="height: 34px; font-size: var(--fs-sm); background: transparent; border: none; padding: var(--sp-1) var(--sp-2); width: 100%;">
        <option value="">—</option>
        ${field.options.map(o => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${escHtml(o)}</option>`).join('')}
      </select>`;
    }
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

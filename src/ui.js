/* ============================================================
   Forge — Shared UI utilities
   Toast notifications, modals, lightbox, image handling, etc.
   ============================================================ */

import { getActiveProject, getPages } from './db.js';
import { navigate } from './router.js';

// --- Toast Notifications ---
let toastContainer = null;

function ensureToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    (document.getElementById('toast-root') || document.body).appendChild(toastContainer);
  }
  return toastContainer;
}

export function showToast(message, type = 'info') {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// --- Modal ---
export function showModal({ title, content, actions, large = false, onClose }) {
  const root = document.getElementById('modal-root') || document.body;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = `modal${large ? ' modal-lg' : ''}`;

  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = `
    <h3 class="modal-title">${title}</h3>
    <button class="btn btn-icon btn-ghost modal-close-btn" aria-label="Close">✕</button>
  `;

  const body = document.createElement('div');
  body.className = 'modal-body';
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else {
    body.appendChild(content);
  }

  modal.appendChild(header);
  modal.appendChild(body);

  if (actions && actions.length > 0) {
    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    for (const action of actions) {
      const btn = document.createElement('button');
      btn.className = `btn ${action.className || 'btn-secondary'}`;
      btn.textContent = action.label;
      btn.addEventListener('click', async () => {
        if (action.onClick) {
          const res = await action.onClick();
          if (res === false) return;
        }
        close();
      });
      footer.appendChild(btn);
    }
    modal.appendChild(footer);
  }

  backdrop.appendChild(modal);

  function close() {
    if (document.activeElement) {
      document.activeElement.blur();
    }
    document.body.focus();
    backdrop.style.opacity = '0';
    setTimeout(() => {
      backdrop.remove();
      if (onClose) onClose();
    }, 200);
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  header.querySelector('.modal-close-btn').addEventListener('click', close);

  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', handler);
    }
  });

  root.appendChild(backdrop);
  return { close, body, modal };
}

// --- Confirm Dialog ---
export function showConfirm(title, message) {
  return new Promise(resolve => {
    const content = document.createElement('div');
    content.innerHTML = `<p style="color: var(--text-secondary); line-height: 1.6;">${message}</p>`;
    showModal({
      title,
      content,
      actions: [
        { label: 'Cancel', className: 'btn-secondary', onClick: () => resolve(false) },
        { label: 'Confirm', className: 'btn-danger', onClick: () => resolve(true) },
      ],
      onClose: () => resolve(false),
    });
  });
}

// --- Lightbox ---
export function showLightbox(src) {
  const root = document.getElementById('modal-root') || document.body;
  const backdrop = document.createElement('div');
  backdrop.className = 'lightbox-backdrop';
  backdrop.innerHTML = `
    <img class="lightbox-image" src="${src}" alt="Full size" />
    <button class="lightbox-close" aria-label="Close">✕</button>
  `;

  function close() {
    backdrop.style.opacity = '0';
    setTimeout(() => backdrop.remove(), 200);
  }

  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', handler);
    }
  });

  root.appendChild(backdrop);
}

// --- Image Helpers ---
export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function createImageUploadZone(onFiles) {
  const zone = document.createElement('div');
  zone.className = 'image-upload-zone';
  zone.innerHTML = `
    <div class="upload-icon">📁</div>
    <div class="upload-text">Drop images here or click to upload</div>
    <div class="upload-hint">PNG, JPG, GIF, WEBP</div>
  `;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.style.display = 'none';

  zone.appendChild(input);

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) onFiles(files);
  });
  input.addEventListener('change', () => {
    if (input.files.length > 0) {
      onFiles(Array.from(input.files));
      input.value = '';
    }
  });

  return zone;
}

// --- Rich Text Editor (Quill wrapper) ---
let quillModule = null;
let quillCssLoaded = false;

export async function loadQuill() {
  if (quillModule) return quillModule.default?.default || quillModule.default;

  if (!quillCssLoaded) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css';
    document.head.appendChild(link);
    quillCssLoaded = true;
  }

  quillModule = await import('quill');
  // Defensive unwrap: in some production (Rollup) builds, quill's CJS default
  // export comes back double-nested (quillModule.default.default) in a way
  // it doesn't in Vite's dev server. Without this, `new Quill(...)` still
  // "succeeds" but produces an object missing the real prototype (.on, etc),
  // which surfaces later as a cryptic "X.on is not a function" crash.
  const Quill = quillModule.default?.default || quillModule.default;

  // Custom Link Blot to override default Quill 2 sanitization
  // This allows local hash links (#/page/someId) to function without being sanitized to about:blank
  const Link = Quill.import('formats/link');
  class CustomLink extends Link {
    static sanitize(url) {
      if (url.startsWith('#/page/') || url.startsWith('/') || url.startsWith('#')) {
        return url;
      }
      return super.sanitize(url);
    }
  }
  Quill.register(CustomLink, true);

  return Quill;
}

export async function createEditor(container, { placeholder = 'Start writing...', initialContent = '', minimal = false } = {}) {
  const Quill = await loadQuill();

  const editorContainer = document.createElement('div');
  container.appendChild(editorContainer);

  const quill = new Quill(editorContainer, {
    theme: 'snow',
    placeholder,
    modules: {
      toolbar: minimal ? [
        ['bold', 'italic', 'link'],
        [{ list: 'bullet' }]
      ] : [
        [{ header: [2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['blockquote'],
        ['link'],
        ['clean'],
      ],
    },
  });

  // Explicitly enable spellchecking on the editable editor root
  quill.root.setAttribute('spellcheck', 'true');

  if (initialContent) {
    try {
      const delta = JSON.parse(initialContent);
      quill.setContents(delta);
    } catch {
      quill.clipboard.dangerouslyPasteHTML(initialContent);
    }
  }

  // ── Autocomplete Dropdown State ──
  let dropdown = null;
  let activeIndex = 0;
  let matches = [];
  let doubleBracketIndex = -1;
  let lastCursorIndex = -1;

  const closeDropdown = () => {
    if (dropdown) {
      dropdown.remove();
      dropdown = null;
    }
  };

  quill.on('text-change', async () => {
    const range = quill.getSelection();
    if (!range) {
      closeDropdown();
      return;
    }

    const cursorIdx = range.index;
    lastCursorIndex = cursorIdx;
    const textBeforeCursor = quill.getText(0, cursorIdx);
    
    // Find last [[
    const lastOpen = textBeforeCursor.lastIndexOf('[[');
    if (lastOpen === -1) {
      closeDropdown();
      return;
    }

    // Check if there is a close bracket or newline after the last [[
    const textAfterOpen = textBeforeCursor.slice(lastOpen + 2);
    if (textAfterOpen.includes(']]') || textAfterOpen.includes('\n')) {
      closeDropdown();
      return;
    }

    doubleBracketIndex = lastOpen;
    const query = textAfterOpen.toLowerCase().trim();

    // Fetch pages
    try {
      const project = await getActiveProject();
      if (!project) return;
      const allPages = await getPages(project.id);
      
      matches = allPages.filter(p => 
        p.title && p.title.toLowerCase().includes(query)
      ).slice(0, 8); // Limit to 8 matches

      if (matches.length === 0) {
        closeDropdown();
        return;
      }

      renderDropdown(lastOpen);
    } catch (err) {
      console.error('Failed to search autocomplete pages:', err);
    }
  });

  quill.on('selection-change', (range) => {
    if (!range) return;
    
    const cursorIdx = range.index;
    lastCursorIndex = cursorIdx;
    
    // Close dropdown if selection moved away from current [[
    const textBeforeCursor = quill.getText(0, cursorIdx);
    const lastOpen = textBeforeCursor.lastIndexOf('[[');
    if (lastOpen === -1) {
      closeDropdown();
      return;
    }
    const textAfterOpen = textBeforeCursor.slice(lastOpen + 2);
    if (textAfterOpen.includes(']]') || textAfterOpen.includes('\n')) {
      closeDropdown();
      return;
    }
  });

  const selectMatch = (match) => {
    if (!match) return;
    const endIdx = lastCursorIndex >= 0 ? lastCursorIndex : (quill.getSelection()?.index || 0);
    if (endIdx < 0 || doubleBracketIndex < 0) return;

    // Replace [[query with wiki link
    quill.deleteText(doubleBracketIndex, endIdx - doubleBracketIndex);
    quill.insertText(doubleBracketIndex, match.title, { link: `#/page/${match.id}` });
    quill.setSelection(doubleBracketIndex + match.title.length);
    closeDropdown();
  };

  const renderDropdown = (startIndex) => {
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'quill-autocomplete-dropdown';
      // Style dropdown
      dropdown.style.cssText = `
        position: absolute;
        z-index: 1000;
        background: rgba(10, 8, 18, 0.95);
        backdrop-filter: blur(12px);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        min-width: 200px;
        max-width: 320px;
        max-height: 240px;
        overflow-y: auto;
        padding: 4px;
        font-family: var(--font-hud, monospace);
        box-sizing: border-box;
      `;
      quill.container.appendChild(dropdown);
    }

    // Position dropdown below cursor
    const bounds = quill.getBounds(startIndex);
    dropdown.style.left = `${bounds.left}px`;
    dropdown.style.top = `${bounds.bottom + 5}px`;

    activeIndex = Math.min(activeIndex, matches.length - 1);
    if (activeIndex < 0) activeIndex = 0;

    dropdown.innerHTML = matches.map((m, idx) => {
      return `
        <div class="autocomplete-item ${idx === activeIndex ? 'active' : ''}" data-idx="${idx}" style="
          padding: 6px 10px;
          border-radius: var(--radius-sm);
          font-size: var(--fs-xs);
          color: ${idx === activeIndex ? '#ffffff' : 'var(--text-secondary)'};
          background: ${idx === activeIndex ? 'var(--accent-primary-dim)' : 'transparent'};
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: flex;
          align-items: center;
          gap: 6px;
        ">
          <span style="font-size: 10px; color: var(--accent-primary);">📄</span>
          <span>${escapeHtml(m.title || 'Untitled')}</span>
        </div>
      `;
    }).join('');

    // Click and Hover handlers
    dropdown.querySelectorAll('.autocomplete-item').forEach(el => {
      el.addEventListener('mouseenter', () => {
        activeIndex = parseInt(el.dataset.idx);
        dropdown.querySelectorAll('.autocomplete-item').forEach((item, idx) => {
          if (idx === activeIndex) {
            item.classList.add('active');
            item.style.color = '#ffffff';
            item.style.background = 'var(--accent-primary-dim)';
          } else {
            item.classList.remove('active');
            item.style.color = 'var(--text-secondary)';
            item.style.background = 'transparent';
          }
        });
      });

      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt(el.dataset.idx);
        selectMatch(matches[idx]);
      });
    });
  };

  // Keyboard navigation
  quill.root.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return; // ignore virtual IME typing composition
    if (dropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % matches.length;
        renderDropdown(doubleBracketIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + matches.length) % matches.length;
        renderDropdown(doubleBracketIndex);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectMatch(matches[activeIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeDropdown();
      }
    }
  }, true);

  // Close dropdown when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (dropdown && !quill.container.contains(e.target)) {
      closeDropdown();
    }
  });

  // Intercept click on links inside editor to navigate directly and bypass Quill tooltip
  quill.root.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link) {
      const href = link.getAttribute('href') || '';
      if (href.startsWith('#/page/')) {
        e.preventDefault();
        e.stopPropagation();
        const route = href.replace('#/', '');
        navigate(route);
      }
    }
  });

  // Suppress native Quill link tooltip for internal wiki-links
  const tooltip = quill.theme.tooltip;
  if (tooltip) {
    const originalShow = tooltip.show;
    tooltip.show = function() {
      const range = quill.getSelection();
      if (range) {
        const formats = quill.getFormat(range);
        if (formats.link && formats.link.startsWith('#/page/')) {
          this.hide();
          return;
        }
      }
      originalShow.apply(this, arguments);
    };
  }

  return {
    quill,
    getContent: () => JSON.stringify(quill.getContents()),
    getText: () => quill.getText(),
    setContent: (content) => {
      try {
        quill.setContents(JSON.parse(content));
      } catch {
        quill.setText(content);
      }
    },
  };
}

// --- HTML Rendering from Quill Delta ---
export function renderQuillContent(content) {
  if (!content) return '<span class="text-muted" style="font-style: italic;">No content yet</span>';
  try {
    const delta = JSON.parse(content);
    let html = '';
    for (const op of delta.ops) {
      if (typeof op.insert === 'string') {
        let text = op.insert.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (op.attributes) {
          if (op.attributes.bold) text = `<strong>${text}</strong>`;
          if (op.attributes.italic) text = `<em>${text}</em>`;
          if (op.attributes.underline) text = `<u>${text}</u>`;
          if (op.attributes.strike) text = `<s>${text}</s>`;
          if (op.attributes.link) {
            const href = op.attributes.link;
            if (href.startsWith('#/page/')) {
              const pageId = href.split('/').pop();
              text = `<a href="${href}" class="wiki-link" data-page-id="${pageId}">${text}</a>`;
            } else {
              text = `<a href="${href}" target="_blank">${text}</a>`;
            }
          }
        }
        text = text.replace(/\n/g, '<br>');
        html += text;
      }
    }
    html = html.replace(/\[\[(.*?)\]\]/g, `<span class="wiki-link-plain">📎 $1</span>`);
    return html || '<span class="text-muted" style="font-style: italic;">No content yet</span>';
  } catch {
    let escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    escaped = escaped.replace(/\[\[(.*?)\]\]/g, `<span class="wiki-link-plain">📎 $1</span>`);
    return escaped;
  }
}

// --- Global Search / Command Palette (Ctrl+K) ---
let searchOverlay = null;

export function initGlobalSearch(searchFn, onSelect) {
  // Quick Actions always available in the palette
  const QUICK_ACTIONS = [
    { id: 'nav-dashboard', title: 'Go to Dashboard', icon: 'home', type: 'Navigation', route: 'dashboard' },
    { id: 'nav-timeline', title: 'Go to Story Timeline', icon: 'map', type: 'Navigation', route: 'story-timeline' },
    { id: 'nav-graph', title: 'Go to Relationship Graph', icon: 'network', type: 'Navigation', route: 'graph' },
    { id: 'nav-analytics', title: 'Go to Writer Analytics', icon: 'bar-chart-2', type: 'Navigation', route: 'writer-analytics' },
    { id: 'nav-continuity', title: 'Go to AI Plot Inspector', icon: 'alert-triangle', type: 'Navigation', route: 'continuity' },
    { id: 'nav-settings', title: 'Open Settings', icon: 'settings', type: 'Navigation', route: 'settings' },
  ];

  let selectedIdx = -1;
  let currentResults = [];
  let searchTimeout = null;

  function getRecentSearches() {
    try {
      return JSON.parse(sessionStorage.getItem('forge-recent-searches') || '[]');
    } catch (_) {
      return [];
    }
  }

  function addRecentSearch(query) {
    if (!query || query.trim().length < 2) return;
    const recents = getRecentSearches().filter(q => q !== query.trim());
    recents.unshift(query.trim());
    sessionStorage.setItem('forge-recent-searches', JSON.stringify(recents.slice(0, 5)));
  }

  function closeSearch() {
    if (searchOverlay) {
      searchOverlay.style.opacity = '0';
      setTimeout(() => {
        if (searchOverlay) {
          searchOverlay.remove();
          searchOverlay = null;
        }
      }, 150);
    }
    document.removeEventListener('keydown', onKeyDown);
  }

  function selectResult(result) {
    if (!result) return;
    closeSearch();
    if (result.route) {
      navigate(result.route);
    } else if (onSelect) {
      onSelect(result);
    }
  }

  function updateSelection() {
    const items = searchOverlay?.querySelectorAll('.cp-item');
    if (!items) return;
    items.forEach((item, idx) => {
      item.classList.toggle('selected', idx === selectedIdx);
      if (idx === selectedIdx) item.scrollIntoView({ block: 'nearest' });
    });
  }

  function renderResults(items, query) {
    currentResults = items;
    selectedIdx = -1;
    const listEl = searchOverlay?.querySelector('#cp-list');
    if (!listEl) return;

    if (items.length === 0 && query.length >= 2) {
      listEl.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: var(--fs-sm);">No results for "${escapeHtml(query)}"</div>`;
      return;
    }

    // Group into sections
    const pageResults = items.filter(r => r._type === 'page' || !r.route);
    const actionResults = items.filter(r => r.route);

    let html = '';

    if (query.length < 2) {
      // Show recent searches + quick nav
      const recents = getRecentSearches();
      if (recents.length > 0) {
        html += `<div class="cp-section-label">Recent Searches</div>`;
        html += recents.map(q => `
          <div class="cp-item" data-query="${escapeHtml(q)}" data-type="recent">
            <div class="cp-item-icon"><i data-lucide="clock" style="width:14px;height:14px;"></i></div>
            <div class="cp-item-text">
              <div class="cp-item-title">${escapeHtml(q)}</div>
            </div>
          </div>
        `).join('');
      }
      html += `<div class="cp-section-label">Quick Navigation</div>`;
      html += QUICK_ACTIONS.map(a => `
        <div class="cp-item" data-route="${a.route}" data-type="action">
          <div class="cp-item-icon"><i data-lucide="${a.icon}" style="width:14px;height:14px;"></i></div>
          <div class="cp-item-text">
            <div class="cp-item-title">${escapeHtml(a.title)}</div>
          </div>
          <div class="cp-item-badge">${escapeHtml(a.type)}</div>
        </div>
      `).join('');
    } else {
      if (pageResults.length > 0) {
        html += `<div class="cp-section-label">Pages</div>`;
        html += pageResults.map(r => `
          <div class="cp-item" data-route="${r.route || `page/${r.id}`}" data-type="page">
            <div class="cp-item-icon"><i data-lucide="${r.icon || 'file-text'}" style="width:14px;height:14px;"></i></div>
            <div class="cp-item-text">
              <div class="cp-item-title">${escapeHtml(r.title || r.name || 'Untitled')}</div>
              ${r.schemaName ? `<div class="cp-item-sub">${escapeHtml(r.schemaName)}</div>` : ''}
            </div>
            ${r.schemaName ? `<div class="cp-item-badge">${escapeHtml(r.schemaName)}</div>` : ''}
          </div>
        `).join('');
      }
      const filteredActions = QUICK_ACTIONS.filter(a => a.title.toLowerCase().includes(query.toLowerCase()));
      if (filteredActions.length > 0) {
        html += `<div class="cp-section-label">Navigation</div>`;
        html += filteredActions.map(a => `
          <div class="cp-item" data-route="${a.route}" data-type="action">
            <div class="cp-item-icon"><i data-lucide="${a.icon}" style="width:14px;height:14px;"></i></div>
            <div class="cp-item-text">
              <div class="cp-item-title">${escapeHtml(a.title)}</div>
            </div>
            <div class="cp-item-badge">${escapeHtml(a.type)}</div>
          </div>
        `).join('');
      }
    }

    listEl.innerHTML = html || `<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: var(--fs-sm);">Start typing to search...</div>`;
    
    // Event handlers
    listEl.querySelectorAll('.cp-item').forEach((item, idx) => {
      item.addEventListener('click', () => {
        const route = item.dataset.route;
        const q = item.dataset.query;
        if (q) {
          const input = searchOverlay?.querySelector('#cp-input');
          if (input) { input.value = q; input.dispatchEvent(new Event('input')); }
        } else if (route) {
          selectResult({ route });
        }
      });
      item.addEventListener('mouseenter', () => {
        selectedIdx = idx;
        updateSelection();
      });
    });

    // Rebuild currentResults as flat array for keyboard nav
    currentResults = [...listEl.querySelectorAll('.cp-item')].map(el => ({
      route: el.dataset.route,
      _query: el.dataset.query
    }));
    
    refreshIcons();
  }

  function onKeyDown(e) {
    if (!searchOverlay) return;
    const items = searchOverlay.querySelectorAll('.cp-item');
    if (e.key === 'Escape') { closeSearch(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
      updateSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIdx = Math.max(selectedIdx - 1, 0);
      updateSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const sel = currentResults[selectedIdx];
      if (sel) {
        if (sel._query) {
          const input = searchOverlay?.querySelector('#cp-input');
          if (input) { input.value = sel._query; input.dispatchEvent(new Event('input')); }
        } else if (sel.route) {
          const query = searchOverlay?.querySelector('#cp-input')?.value;
          if (query) addRecentSearch(query);
          selectResult(sel);
        }
      }
    }
  }

  function openSearch() {
    if (searchOverlay) { searchOverlay.querySelector('#cp-input')?.focus(); return; }

    const root = document.getElementById('search-root') || document.body;
    searchOverlay = document.createElement('div');
    searchOverlay.id = 'global-search-overlay';
    searchOverlay.style.cssText = `
      position: fixed; inset: 0; z-index: 500;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(6px);
      display: flex; align-items: flex-start; justify-content: center;
      padding-top: 100px;
      opacity: 0;
      transition: opacity 150ms ease;
    `;
    searchOverlay.innerHTML = `
      <div style="
        width: 600px; max-width: calc(100vw - 32px);
        background: var(--bg-elevated);
        border: 1px solid var(--border-strong);
        border-radius: var(--radius-xl);
        box-shadow: 0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05);
        overflow: hidden;
        animation: scaleIn 180ms var(--easing-out-expo) both;
      ">
        <!-- Search input -->
        <div style="display:flex; align-items:center; gap:12px; padding:14px 16px; border-bottom:1px solid var(--border-subtle);">
          <i data-lucide="search" style="width:16px;height:16px;color:var(--text-muted);flex-shrink:0;"></i>
          <input
            id="cp-input"
            type="text"
            placeholder="Search pages or type a command..."
            autocomplete="off"
            spellcheck="false"
            style="
              flex:1; background:transparent; border:none; outline:none;
              color:var(--text-primary); font-size:var(--fs-md);
              font-family:var(--font-body);
            "
          >
          <kbd style="
            font-family:var(--font-hud); font-size:10px; color:var(--text-muted);
            background:var(--bg-surface); border:1px solid var(--border-default);
            border-radius:4px; padding:2px 6px; flex-shrink:0;
          ">ESC</kbd>
        </div>
        <!-- Results -->
        <div id="cp-list" style="max-height:400px; overflow-y:auto; padding:4px;"></div>
        <!-- Footer -->
        <div style="display:flex; align-items:center; gap:12px; padding:8px 16px; border-top:1px solid var(--border-subtle); font-size:10px; color:var(--text-muted);">
          <span><kbd style="font-family:var(--font-hud); background:var(--bg-surface); border:1px solid var(--border-default); border-radius:3px; padding:1px 5px;">↑↓</kbd> navigate</span>
          <span><kbd style="font-family:var(--font-hud); background:var(--bg-surface); border:1px solid var(--border-default); border-radius:3px; padding:1px 5px;">↵</kbd> open</span>
          <span><kbd style="font-family:var(--font-hud); background:var(--bg-surface); border:1px solid var(--border-default); border-radius:3px; padding:1px 5px;">Esc</kbd> close</span>
        </div>
      </div>
    `;

    root.appendChild(searchOverlay);
    requestAnimationFrame(() => { searchOverlay.style.opacity = '1'; });

    const input = searchOverlay.querySelector('#cp-input');
    input.focus();

    // Show initial state (recent + quick actions)
    renderResults([], '');

    // Input handler
    input.addEventListener('input', () => {
      const query = input.value.trim();
      clearTimeout(searchTimeout);
      if (query.length < 2) {
        renderResults([], query);
        return;
      }
      searchTimeout = setTimeout(async () => {
        const results = await searchFn(query);
        const tagged = results.map(r => ({ ...r, _type: 'page' }));
        renderResults(tagged, query);
      }, 150);
    });

    // Backdrop close
    searchOverlay.addEventListener('click', (e) => {
      if (e.target === searchOverlay) {
        const query = input.value.trim();
        if (query.length >= 2) addRecentSearch(query);
        closeSearch();
      }
    });

    document.addEventListener('keydown', onKeyDown);
    
    refreshIcons();
  }

  // Register Ctrl+K / Cmd+K
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (searchOverlay) closeSearch();
      else openSearch();
    }
  });

  // Expose for external open (e.g. sidebar button)
  window.openForgeSearch = openSearch;
}

// --- Time formatting ---
export function timeAgo(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

// --- Escape HTML ---
export function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Continuity Popup Alert ---
export function showContinuityAlertPopup(newCount, issues) {
  const popupsEnabled = localStorage.getItem('forge-continuity-popup-enabled') !== 'false';
  if (!popupsEnabled) return;

  const container = ensureToastContainer();
  if (!container) return;

  const existing = document.getElementById('continuity-alert-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.id = 'continuity-alert-popup';
  popup.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: rgba(20, 16, 36, 0.95);
    border: 1px solid var(--accent-red, #f43f5e);
    box-shadow: 0 8px 32px rgba(244, 63, 94, 0.15), inset 0 1px 0 rgba(255,255,255,0.1);
    border-radius: 12px;
    padding: 16px 20px;
    color: #fff;
    width: 320px;
    z-index: 600;
    cursor: pointer;
    font-family: var(--font-body, sans-serif);
    animation: cont-popup-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    backdrop-filter: blur(20px);
    transition: all 0.3s ease;
  `;

  if (!document.getElementById('cont-popup-style')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'cont-popup-style';
    styleEl.textContent = `
      @keyframes cont-popup-slide-in {
        from { transform: translateY(40px) scale(0.95); opacity: 0; }
        to { transform: translateY(0) scale(1); opacity: 1; }
      }
      #continuity-alert-popup:hover {
        transform: translateY(-2px) scale(1.02);
        box-shadow: 0 12px 40px rgba(244, 63, 94, 0.25), inset 0 1px 0 rgba(255,255,255,0.2);
        border-color: #ff5773;
      }
    `;
    document.head.appendChild(styleEl);
  }

  const header = document.createElement('div');
  header.style.cssText = 'display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--accent-red, #f43f5e); font-size: 0.82rem; margin-bottom: 6px; font-family: var(--font-hud, monospace);';
  header.innerHTML = `
    <span style="font-size: 1rem;">⚠️</span>
    <span>IGNIS CONTINUITY ALERT</span>
    <button id="cont-popup-close-btn" style="margin-left: auto; background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 11px; padding: 2px;">✕</button>
  `;

  const body = document.createElement('div');
  body.style.cssText = 'font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;';
  body.textContent = `${newCount} new narrative issue${newCount > 1 ? 's' : ''} detected by Ignis. Click here to review conflicts.`;

  popup.appendChild(header);
  popup.appendChild(body);

  const closeBtn = header.querySelector('#cont-popup-close-btn');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    popup.style.opacity = '0';
    popup.style.transform = 'translateY(20px) scale(0.95)';
    setTimeout(() => popup.remove(), 300);
  });

  popup.addEventListener('click', () => {
    navigate('continuity');
    popup.style.opacity = '0';
    popup.style.transform = 'translateY(20px) scale(0.95)';
    setTimeout(() => popup.remove(), 300);
  });

  container.appendChild(popup);

  setTimeout(() => {
    if (popup.parentElement) {
      popup.style.opacity = '0';
      popup.style.transform = 'translateY(20px) scale(0.95)';
      setTimeout(() => popup.remove(), 300);
    }
  }, 10000);
}

export async function checkOllamaRunning() {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1200); // 1.2s timeout
    const res = await fetch('http://localhost:11434', { signal: controller.signal });
    clearTimeout(id);
    return res.ok || res.status === 200 || res.status === 404;
  } catch (e) {
    return false;
  }
}

export function showOllamaInstallPrompt() {
  showModal({
    title: 'Enhance Ignis with Ollama',
    content: `
      <div style="text-align: center; padding: var(--sp-4);">
        <div style="font-size: 3rem; margin-bottom: var(--sp-3);">🔥</div>
        <p style="color: #fff; font-size: 1rem; font-weight: 600; margin-bottom: 12px;">
          For a better experience with Ignis, please download Ollama.
        </p>
        <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.5; margin-bottom: var(--sp-4);">
          Ignis runs best locally using local large language models (like Llama 3) via Ollama. It is completely private, free, and runs offline on your own machine.
        </p>
      </div>
    `,
    actions: [
      {
        label: 'Download Ollama',
        className: 'btn-primary',
        onClick: () => {
          if (window.electronAPI && window.electronAPI.openExternal) {
            window.electronAPI.openExternal('https://ollama.com');
          } else {
            window.open('https://ollama.com', '_blank');
          }
        }
      },
      {
        label: 'Maybe Later',
        className: 'btn-ghost'
      }
    ]
  });
}



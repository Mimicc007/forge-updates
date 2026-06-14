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
    document.getElementById('toast-root').appendChild(toastContainer);
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
  const root = document.getElementById('modal-root');

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
  const root = document.getElementById('modal-root');
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

async function loadQuill() {
  if (quillModule) return quillModule.default;

  if (!quillCssLoaded) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css';
    document.head.appendChild(link);
    quillCssLoaded = true;
  }

  quillModule = await import('quill');
  const Quill = quillModule.default;

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

// --- Global Search (Ctrl+K) ---
let searchOverlay = null;

export function initGlobalSearch(searchFn, onSelect) {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openGlobalSearch(searchFn, onSelect);
    }
  });
}

function openGlobalSearch(searchFn, onSelect) {
  if (searchOverlay) return;

  const root = document.getElementById('search-root');
  searchOverlay = document.createElement('div');
  searchOverlay.className = 'search-overlay';

  const container = document.createElement('div');
  container.className = 'search-container';

  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'search-input-wrapper';
  inputWrapper.innerHTML = `
    <span style="color: var(--text-muted);">🔍</span>
    <input type="text" placeholder="Search characters, lore, story..." autofocus />
    <span style="font-size: var(--fs-xs); color: var(--text-muted); border: 1px solid var(--border-default); padding: 2px 6px; border-radius: 4px;">ESC</span>
  `;

  const resultsDiv = document.createElement('div');
  resultsDiv.className = 'search-results';
  resultsDiv.style.display = 'none';

  container.appendChild(inputWrapper);
  container.appendChild(resultsDiv);
  searchOverlay.appendChild(container);

  function close() {
    searchOverlay.style.opacity = '0';
    setTimeout(() => {
      searchOverlay.remove();
      searchOverlay = null;
    }, 150);
  }

  searchOverlay.addEventListener('click', (e) => {
    if (e.target === searchOverlay) close();
  });

  const input = inputWrapper.querySelector('input');
  let highlightedIndex = -1;

  input.addEventListener('input', async () => {
    const query = input.value.trim();
    if (query.length < 2) {
      resultsDiv.style.display = 'none';
      return;
    }

    const results = await searchFn(query);
    highlightedIndex = -1;

    if (results.length === 0) {
      resultsDiv.innerHTML = `<div style="padding: var(--sp-4) var(--sp-5); color: var(--text-muted); text-align: center;">No results found</div>`;
    } else {
      resultsDiv.innerHTML = results.map((r, i) => `
        <div class="search-result-item" data-index="${i}">
          <span class="result-icon">${r.icon}</span>
          <span class="result-name">${r.name}</span>
          <span class="result-type">${r.type}</span>
        </div>
      `).join('');

      resultsDiv.querySelectorAll('.search-result-item').forEach((item, i) => {
        item.addEventListener('click', () => {
          onSelect(results[i]);
          close();
        });
      });
    }
    resultsDiv.style.display = 'block';
  });

  input.addEventListener('keydown', (e) => {
    const items = resultsDiv.querySelectorAll('.search-result-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
      items.forEach((item, i) => item.classList.toggle('highlighted', i === highlightedIndex));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      items.forEach((item, i) => item.classList.toggle('highlighted', i === highlightedIndex));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && items[highlightedIndex]) {
        items[highlightedIndex].click();
      }
    } else if (e.key === 'Escape') {
      close();
    }
  });

  root.appendChild(searchOverlay);
  input.focus();
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



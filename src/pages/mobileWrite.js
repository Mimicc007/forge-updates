/* ============================================================
   Forge Mobile — Write Tab
   Page list + full-screen editor slide-in panel.
   ============================================================ */

import { getActiveProject, getPages, getPage, savePage, deletePage, generateId } from '../db.js';
import { navigate } from '../router.js';
import { createEditor } from '../ui.js';
let _editorPage = null;
let _quill = null;
let _currentPageId = null;
let _saveTimer = null;
let _project = null;



export async function renderMobileWrite(container, activePageId = null) {
  _project = await getActiveProject();

  if (!_project) {
    container.innerHTML = `
      <div class="m-page">
        <div class="m-empty" style="padding-top:80px">
          <div class="m-empty-icon">📂</div>
          <div class="m-empty-title">No project open</div>
          <div class="m-empty-sub">Open a project to start writing.</div>
        </div>
      </div>
    `;
    return;
  }

  await _renderPageList(container);
  if (activePageId) {
    const pages = await getPages(_project.id).catch(() => []);
    _openEditor(activePageId, pages, container);
  }
}

async function _renderPageList(container) {
  const pages = await getPages(_project.id).catch(() => []);
  const sorted = [...pages].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  container.innerHTML = `
    <div class="m-page" id="m-write-root">
      <div class="m-header">
        <div class="m-header-title">Pages</div>
        <button class="m-header-action" id="m-write-new">+ New</button>
      </div>

      <input type="search" class="m-search" placeholder="Search pages…"
        id="m-write-search" autocorrect="off" autocapitalize="none" spellcheck="false" inputmode="search" />

      <div id="m-write-list" style="padding:0 16px 16px">
        ${sorted.length === 0 ? `
          <div class="m-empty">
            <div class="m-empty-icon">✏️</div>
            <div class="m-empty-title">No pages yet</div>
            <div class="m-empty-sub">Tap "+ New" to write your first page.</div>
          </div>
        ` : sorted.map(p => _pageItem(p)).join('')}
      </div>
    </div>
  `;

  _wireList(container, sorted);
}

function _pageItem(p) {
  const words = (p.content?.replace(/<[^>]+>/g, '') || '').split(/\s+/).filter(Boolean).length;
  const timeAgo = _timeAgo(p.updatedAt);
  return `
    <button class="m-list-item" data-page-id="${p.id}">
      <div class="m-list-item-icon">${p.icon || '📄'}</div>
      <div class="m-list-item-body">
        <div class="m-list-item-title">${_esc(p.title || 'Untitled')}</div>
        <div class="m-list-item-sub">${timeAgo} · ${words} words</div>
      </div>
      <div class="m-list-item-chevron">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      </div>
    </button>
  `;
}

function _wireList(container, pages) {
  // Search
  document.getElementById('m-write-search')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const list = document.getElementById('m-write-list');
    if (!list) return;
    const filtered = pages.filter(p =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.content?.replace(/<[^>]+>/g, '') || '').toLowerCase().includes(q)
    );
    if (filtered.length === 0) {
      list.innerHTML = `<div class="m-empty"><div class="m-empty-sub">No pages match "${_esc(e.target.value)}"</div></div>`;
    } else {
      list.innerHTML = filtered.map(p => _pageItem(p)).join('');
      list.querySelectorAll('[data-page-id]').forEach(btn => {
        btn.addEventListener('click', () => _openEditor(btn.dataset.pageId, pages, container));
      });
    }
  });

  // Page items
  container.querySelectorAll('[data-page-id]').forEach(btn => {
    btn.addEventListener('click', () => _openEditor(btn.dataset.pageId, pages, container));
  });

  // New page button
  document.getElementById('m-write-new')?.addEventListener('click', async () => {
    const newPage = await savePage({
      id: generateId(),
      projectId: _project.id,
      title: 'Untitled',
      content: '',
      properties: {},
    });
    const allPages = await getPages(_project.id);
    await _renderPageList(container);
    // Auto-open the new page
    _openEditor(newPage.id, allPages, container);
  });
}

async function _openEditor(pageId, pages, container) {
  const page = pages.find(p => p.id === pageId);
  if (!page) return;

  _currentPageId = pageId;

  // Create or reuse the slide-in editor panel
  if (!_editorPage) {
    _editorPage = document.createElement('div');
    _editorPage.className = 'm-editor-page';
    _editorPage.id = 'm-editor-panel';
    document.body.appendChild(_editorPage);
  }

  _editorPage.innerHTML = `
    <div class="m-header" style="padding-top:calc(16px + env(safe-area-inset-top, 0px))">
      <button class="m-back-btn" id="m-editor-back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
        Pages
      </button>
      <input id="m-editor-title" type="text"
        value="${_esc(page.title || '')}"
        placeholder="Page title"
        style="flex:1;background:none;border:none;outline:none;font-size:1rem;font-weight:700;color:var(--text-primary);font-family:var(--font-heading);min-width:0"
        autocorrect="off" autocapitalize="sentences" spellcheck="false" inputmode="text" />
      <div id="m-editor-save-indicator" style="font-size:0.72rem;color:var(--text-muted);padding:4px 8px">Saved</div>
    </div>
    <div id="m-quill-root"></div>
  `;

  // Slide in
  requestAnimationFrame(() => {
    _editorPage.classList.add('open');
  });

  // Load Quill
  await _initQuill(page);

  // Back button
  document.getElementById('m-editor-back')?.addEventListener('click', () => {
    _closeEditor();
    _renderPageList(container);
  });

  // Title save
  document.getElementById('m-editor-title')?.addEventListener('input', (e) => {
    _scheduleSave({ title: e.target.value });
  });
}

async function _initQuill(page) {
  const root = document.getElementById('m-quill-root');
  if (!root) return;

  root.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden';

  // Instantiate the shared, features-rich, IME-shielded editor
  const editorObj = await createEditor(root, {
    placeholder: 'Begin writing…',
    initialContent: page.content || '',
    minimal: false
  });
  _quill = editorObj.quill;

  _quill.on('text-change', () => {
    _scheduleSave({ content: _quill.root.innerHTML });
  });
}

async function _scheduleSave(patch) {
  clearTimeout(_saveTimer);
  const indicator = document.getElementById('m-editor-save-indicator');
  if (indicator) indicator.textContent = 'Saving…';

  _saveTimer = setTimeout(async () => {
    try {
      const titleEl = document.getElementById('m-editor-title');
      const existing = await getPage(_currentPageId);
      await savePage({
        ...(existing || {}),
        id: _currentPageId,
        projectId: _project.id,
        title: patch.title !== undefined ? patch.title : (titleEl?.value || 'Untitled'),
        content: patch.content !== undefined ? patch.content : (_quill?.root.innerHTML || ''),
      });
      if (indicator) indicator.textContent = 'Saved';
    } catch (e) {
      if (indicator) indicator.textContent = '⚠ Error';
      console.error('[MobileWrite] save error', e);
    }
  }, 800);
}

function _closeEditor() {
  if (_editorPage) {
    _editorPage.classList.remove('open');
  }
  _quill = null;
  _currentPageId = null;
  clearTimeout(_saveTimer);
}



function _timeAgo(ts) {
  if (!ts) return 'Never';
  const time = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (Number.isNaN(time)) return 'Never';
  const diff = Date.now() - time;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function _esc(str) {
  return String(str).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

/* ============================================================
   Forge Mobile — Relationship Graph Browser
   Touch-friendly relation index browser mapping backlinks and tags.
   ============================================================ */

import { getActiveProject, getPages } from '../db.js';
import { navigate } from '../router.js';

let _project = null;
let _pages = [];
let _selectedPageId = null;

export async function renderMobileGraph(container) {
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

  _pages = await getPages(_project.id).catch(() => []);
  _render(container);
}

function _render(container) {
  const searchVal = container.querySelector('#m-graph-search')?.value || '';
  const filteredPages = _pages.filter(p => 
    (p.title || 'Untitled').toLowerCase().includes(searchVal.toLowerCase())
  );

  const selectedPage = _selectedPageId ? _pages.find(p => p.id === _selectedPageId) : null;
  
  // Find relations for selected page
  let relations = [];
  if (selectedPage) {
    // 1. Outward relations (parsed from Quill links in content e.g. href="#/page/id")
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = selectedPage.content || '';
    const links = Array.from(tempDiv.querySelectorAll('a[href]'));
    links.forEach(l => {
      const href = l.getAttribute('href') || '';
      const match = href.match(/#\/page\/([a-zA-Z0-9_-]+)/);
      if (match) {
        const destId = match[1];
        const destPage = _pages.find(p => p.id === destId);
        if (destPage) {
          relations.push({
            pageId: destId,
            title: destPage.title || 'Untitled',
            type: 'Wiki Link',
            icon: '🔗',
            color: '#38bdf8',
            direction: 'out'
          });
        }
      }
    });

    // Explicit relationships inside beat properties (characters, prerequisites)
    if (selectedPage.properties?.characters) {
      selectedPage.properties.characters.forEach(cid => {
        const charPage = _pages.find(p => p.id === cid);
        if (charPage) {
          relations.push({
            pageId: cid,
            title: charPage.title || 'Untitled',
            type: 'Character Present',
            icon: '🎭',
            color: '#a78bfa',
            direction: 'out'
          });
        }
      });
    }

    if (selectedPage.properties?.prerequisites) {
      selectedPage.properties.prerequisites.forEach(pid => {
        const prereqPage = _pages.find(p => p.id === pid);
        if (prereqPage) {
          relations.push({
            pageId: pid,
            title: prereqPage.title || 'Untitled',
            type: 'Prerequisite Beat',
            icon: '🎛️',
            color: '#f43f5e',
            direction: 'out'
          });
        }
      });
    }

    // 2. Inward relations (backlinks)
    _pages.forEach(p => {
      if (p.id === selectedPage.id) return;
      const content = p.content || '';
      if (content.includes(`#/page/${selectedPage.id}`)) {
        relations.push({
          pageId: p.id,
          title: p.title || 'Untitled',
          type: 'Backlink',
          icon: '📥',
          color: '#34d399',
          direction: 'in'
        });
      }
      
      // Check if this page has selectedPage in its characters or prerequisites
      if (p.properties?.characters?.includes(selectedPage.id)) {
        relations.push({
          pageId: p.id,
          title: p.title || 'Untitled',
          type: 'Appears In Beat',
          icon: '🎬',
          color: '#a78bfa',
          direction: 'in'
        });
      }

      if (p.properties?.prerequisites?.includes(selectedPage.id)) {
        relations.push({
          pageId: p.id,
          title: p.title || 'Untitled',
          type: 'Unlocked Beat',
          icon: '🔑',
          color: '#fb7185',
          direction: 'in'
        });
      }
    });

    // Deduplicate relations
    const seen = new Set();
    relations = relations.filter(r => {
      const key = `${r.pageId}-${r.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  container.innerHTML = `
    <div class="m-page" id="m-graph-root" style="padding-bottom:100px">
      <!-- Header -->
      <div class="m-header">
        <div class="m-header-title">Web of Fate (Relations)</div>
      </div>

      <!-- Search -->
      <input type="text" id="m-graph-search" class="m-search" placeholder="Search pages..." value="${_esc(searchVal)}" />

      <!-- Page List Grid -->
      <div style="padding:10px 16px 8px">
        <div style="font-size:0.7rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Select Entity</div>
        <div style="display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:6px" id="m-graph-strip">
          ${filteredPages.slice(0, 15).map(p => `
            <button class="m-schema-chip ${p.id === _selectedPageId ? 'active' : ''}" data-page-id="${p.id}" style="white-space:nowrap;flex-shrink:0;--chip-color:var(--accent-primary)">
              ${p.icon || '📄'} ${_esc(p.title || 'Untitled')}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Relation Panel -->
      <div style="padding:10px 16px 24px">
        ${!selectedPage ? `
          <div class="m-empty">
            <div class="m-empty-icon">🕸️</div>
            <div class="m-empty-title">No page selected</div>
            <div class="m-empty-sub">Tap an entity chip above to inspect its relationship network.</div>
          </div>
        ` : `
          <div style="font-size:0.7rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px">
            Connections for "${selectedPage.title || 'Untitled'}"
          </div>
          
          <div class="m-card" style="padding:16px">
            <div style="font-size:0.85rem;font-weight:700;color:var(--text-primary);margin-bottom:14px;display:flex;align-items:center;justify-content:between">
              <span>🕸️ Network Index</span>
              <button id="m-graph-inspect-page" style="background:none;border:none;color:var(--accent-primary);font-size:0.75rem;font-weight:700;cursor:pointer">Open Page ↗</button>
            </div>

            ${relations.length === 0 ? `
              <div style="font-size:0.78rem;color:var(--text-muted);text-align:center;padding:12px 0">This page has no active connections in the narrative map.</div>
            ` : relations.map(r => `
              <div class="m-list-item m-graph-relation-item" data-dest-id="${r.pageId}" style="padding:10px 12px;margin-bottom:8px;border-left:3px solid ${r.color}">
                <div style="display:flex;align-items:center;justify-content:between;gap:8px;width:100%">
                  <div style="flex:1;min-width:0;text-align:left">
                    <div style="font-size:0.85rem;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(r.title)}</div>
                    <div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px">${r.direction === 'in' ? '↙ Inward Link' : '↗ Outward Link'}</div>
                  </div>
                  <span style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.04em;background:${r.color}15;color:${r.color};padding:2px 6px;border-radius:8px;font-weight:700;border:1px solid ${r.color}25">
                    ${r.icon} ${r.type}
                  </span>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>
  `;

  // Wire events
  container.querySelector('#m-graph-search')?.addEventListener('input', () => {
    _render(container);
  });

  container.querySelectorAll('#m-graph-strip [data-page-id]').forEach(chip => {
    chip.addEventListener('click', () => {
      _selectedPageId = chip.dataset.pageId;
      _render(container);
    });
  });

  container.querySelectorAll('.m-graph-relation-item').forEach(item => {
    item.addEventListener('click', () => {
      _selectedPageId = item.dataset.destId;
      _render(container);
    });
  });

  container.querySelector('#m-graph-inspect-page')?.addEventListener('click', () => {
    if (_selectedPageId) navigate(`page/${_selectedPageId}`);
  });
}

function _esc(str) {
  return String(str).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

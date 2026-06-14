/* ============================================================
   Forge — Sidebar Component
   Universal Database Sidebar navigation.
   ============================================================ */

import { navigate } from './router.js';
import * as db from './db.js';
import { refreshIcons } from './main.js';
import { toggleAiDrawer } from './ai.js';
import { showToast, showModal, escapeHtml, showContinuityAlertPopup } from './ui.js';
import { toggleSceneMode } from './sceneMode.js';
import { getContinuityIssues, clearContinuityIssues } from './continuityMonitor.js';
import { getStyleConfig } from './styleConfig.js';

let collapsed = false;
let schemaListEl = null;
let currentRefreshId = 0;

// ─── Main render ─────────────────────────────────────────────────────────────

export async function renderSidebar() {
  const sidebar = document.getElementById('sidebar');
  const project = await db.getActiveProject();

  if (!project) {
    sidebar.style.display = 'none';
    return;
  }
  sidebar.style.display = 'flex';

  // Restore collapsed state
  const savedCollapsed = localStorage.getItem('forge-sidebar-collapsed');
  if (savedCollapsed === 'true') {
    collapsed = true;
    sidebar.classList.add('collapsed');
  }

  // Header (Forge logo + Collapse Toggle)
  const header = document.createElement('div');
  header.className = 'sidebar-header';
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.width = '100%';
  
  const logoWrapper = document.createElement('div');
  logoWrapper.className = 'sidebar-logo-wrapper';
  logoWrapper.style.display = 'flex';
  logoWrapper.style.alignItems = 'center';
  logoWrapper.style.gap = 'var(--sp-2)';
  logoWrapper.style.overflow = 'hidden';
  logoWrapper.style.cursor = 'pointer';
  logoWrapper.innerHTML = `
    <svg class="sidebar-logo" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0; width: 24px; height: 24px;">
      <path d="M38 4 L18 28 H28 L20 60 L46 32 H36 Z" fill="var(--accent-primary)" opacity="0.9" stroke="var(--accent-primary)" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
    <span class="sidebar-title" style="font-weight: 700; letter-spacing: 0.1em; color: var(--text-primary);">FORGE</span>
  `;

  logoWrapper.addEventListener('click', () => {
    if (collapsed) {
      collapsed = false;
      sidebar.classList.remove('collapsed');
      collapseBtn.innerHTML = `<i data-lucide="panel-left-close"></i>`;
      localStorage.setItem('forge-sidebar-collapsed', 'false');
      refreshIcons();
    }
  });

  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'sidebar-collapse-btn icon-btn';
  collapseBtn.innerHTML = `<i data-lucide="panel-left-close"></i>`;
  collapseBtn.title = 'Toggle Sidebar';
  collapseBtn.addEventListener('click', () => {
    collapsed = !collapsed;
    sidebar.classList.toggle('collapsed', collapsed);
    collapseBtn.innerHTML = `<i data-lucide="${collapsed ? 'panel-left-open' : 'panel-left-close'}"></i>`;
    localStorage.setItem('forge-sidebar-collapsed', collapsed);
    refreshIcons();
  });

  header.appendChild(logoWrapper);
  header.appendChild(collapseBtn);

  // Nav
  const nav = document.createElement('nav');
  nav.className = 'sidebar-nav';
  nav.style.flex = '1';
  nav.style.overflowY = 'auto';

  const styleId = project.settings?.style || 'story';
  const styleConf = getStyleConfig(styleId);
  const customAccent = localStorage.getItem('forge-custom-accent');
  if (!customAccent) {
    const { applyCustomAccent } = await import('./main.js');
    applyCustomAccent(styleConf.accent);
  }

  // Overview section label
  const overviewLabel = document.createElement('div');
  overviewLabel.className = 'sidebar-section-label';
  overviewLabel.textContent = 'Overview';
  nav.appendChild(overviewLabel);
  nav.appendChild(buildStaticNavItem({ route: 'dashboard', icon: 'home', label: styleConf.terms.dashboardTitle }));
  nav.appendChild(buildStaticNavItem({ route: 'story-timeline', icon: 'map', label: styleConf.terms.roadmap }));
  nav.appendChild(buildStaticNavItem({ route: 'graph', icon: 'network', label: styleConf.terms.fate }));
  nav.appendChild(buildStaticNavItem({ route: 'inbox', icon: 'inbox', label: 'Inbox' }));
  const continuityEnabled = localStorage.getItem('forge-continuity-enabled') !== 'false';
  if (continuityEnabled) {
    nav.appendChild(buildStaticNavItem({ route: 'continuity', icon: 'alert-triangle', label: 'Continuity' }));
  }

  // Dynamic list container (databases + canvases sections added by refreshSidebarLists)
  schemaListEl = document.createElement('div');
  schemaListEl.className = 'sidebar-tab-list';
  nav.appendChild(schemaListEl);

  // Footer for Settings and AI Companion
  const footer = document.createElement('div');
  footer.className = 'sidebar-footer';
  footer.style.marginTop = 'auto';
  footer.style.borderTop = '1px solid var(--border-subtle)';
  footer.style.padding = 'var(--sp-2) 0';
  
  // Ignis AI toggle item
  const aiItem = document.createElement('a');
  aiItem.className = 'nav-item sidebar-ai-toggle-btn';
  aiItem.style.cursor = 'pointer';
  aiItem.style.color = 'var(--accent-primary)';
  aiItem.style.display = 'flex';
  aiItem.style.alignItems = 'center';
  aiItem.style.gap = 'var(--sp-3)';
  aiItem.style.padding = 'var(--sp-2.5) var(--sp-4)';
  aiItem.style.textDecoration = 'none';
  aiItem.innerHTML = `
    <span class="nav-item-icon" style="color: var(--accent-primary); filter: drop-shadow(0 0 3px rgba(229, 169, 59, 0.25)); display: flex; align-items: center;"><i data-lucide="zap"></i></span>
    <span class="nav-item-label" style="color: var(--accent-primary); font-weight: 600;">Ignis Companion</span>
  `;
  aiItem.title = 'Ignis AI Companion';
  aiItem.addEventListener('click', (e) => {
    e.preventDefault();
    toggleAiDrawer();
  });
  footer.appendChild(aiItem);

  // Scene Mode toggle item
  const sceneModeItem = document.createElement('a');
  sceneModeItem.className = 'nav-item sidebar-scene-mode-btn';
  sceneModeItem.style.cursor = 'pointer';
  sceneModeItem.style.color = 'var(--accent-purple, #a78bfa)';
  sceneModeItem.style.display = 'flex';
  sceneModeItem.style.alignItems = 'center';
  sceneModeItem.style.gap = 'var(--sp-3)';
  sceneModeItem.style.padding = 'var(--sp-2.5) var(--sp-4)';
  sceneModeItem.style.textDecoration = 'none';
  sceneModeItem.innerHTML = `
    <span class="nav-item-icon" style="color: var(--accent-purple, #a78bfa); filter: drop-shadow(0 0 3px rgba(167,139,250,0.25)); display: flex; align-items: center;"><i data-lucide="film"></i></span>
    <span class="nav-item-label" style="color: var(--accent-purple, #a78bfa); font-weight: 600;">Scene Mode</span>
  `;
  sceneModeItem.title = 'Ignis Scene Mode — Co-write scenes';
  sceneModeItem.addEventListener('click', (e) => {
    e.preventDefault();
    toggleSceneMode();
  });
  footer.appendChild(sceneModeItem);

  // Inject continuity pulse animation if not already present
  if (!document.getElementById('continuity-pulse-style')) {
    const style = document.createElement('style');
    style.id = 'continuity-pulse-style';
    style.textContent = `
      @keyframes continuity-pulse {
        0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(244,63,94,0.4); }
        50% { opacity: 0.85; box-shadow: 0 0 0 4px rgba(244,63,94,0); }
      }
    `;
    document.head.appendChild(style);
  }

  // Helper to update continuity badge visibility + severity breakdown
  const updateContinuityBadge = (issues) => {
    const badge = document.getElementById('continuity-issue-badge');
    if (badge) {
      if (issues && issues.length > 0) {
        badge.style.display = 'inline-block';
        const highCount = issues.filter(i => i.severity === 'high').length;
        const medCount  = issues.filter(i => i.severity === 'medium').length;
        const lowCount  = issues.filter(i => i.severity === 'low').length;
        const parts = [];
        if (highCount) parts.push(`<span style="color:#f43f5e">${highCount}🔴</span>`);
        if (medCount)  parts.push(`<span style="color:#f97316">${medCount}🟠</span>`);
        if (lowCount)  parts.push(`<span style="color:#facc15">${lowCount}🟡</span>`);
        badge.innerHTML = parts.length ? parts.join(' ') : issues.length;
      } else {
        badge.style.display = 'none';
      }
    }
  };

  // Check for existing stored issues on render
  const storedIssues = getContinuityIssues();
  setTimeout(() => updateContinuityBadge(storedIssues), 100);

  // Listen for new issues being found
  if (window._continuityFoundHandler) {
    window.removeEventListener('forge-continuity-issues-found', window._continuityFoundHandler);
  }
  window._continuityFoundHandler = (e) => {
    updateContinuityBadge(e.detail.issues);
    if (e.detail.newCount > 0) {
      showContinuityAlertPopup(e.detail.newCount, e.detail.issues);
    }
  };
  window.addEventListener('forge-continuity-issues-found', window._continuityFoundHandler);

  // Listen for issues cleared
  if (window._continuityClearedHandler) {
    window.removeEventListener('forge-continuity-cleared', window._continuityClearedHandler);
  }
  window._continuityClearedHandler = () => updateContinuityBadge([]);
  window.addEventListener('forge-continuity-cleared', window._continuityClearedHandler);

  const settingsItem = buildStaticNavItem({ route: 'settings', icon: 'settings', label: 'Settings' });
  settingsItem.id = 'sidebar-settings-item';
  footer.appendChild(settingsItem);

  // Show update badge if available
  const updateVer = localStorage.getItem('forge-update-available');
  if (updateVer) {
    showSidebarUpdateBadge(settingsItem);
  }
  
  window.addEventListener('forge-update-found', () => {
    showSidebarUpdateBadge(settingsItem);
  });

  sidebar.innerHTML = '';
  sidebar.appendChild(header);
  sidebar.appendChild(nav);
  sidebar.appendChild(footer);

  // Populate dynamic lists
  await refreshSidebarLists();

  // Listen for active route changes
  window.addEventListener('hashchange', () => updateSidebarActive());
  updateSidebarActive();

  // Listen for db updates from other windows to refresh dynamic sidebar lists
  if (window._sidebarDbUpdateHandler) {
    window.removeEventListener('forge-db-updated', window._sidebarDbUpdateHandler);
  }
  window._sidebarDbUpdateHandler = async (e) => {
    if (e.detail && (e.detail.storeName === 'pages' || e.detail.storeName === 'schemas' || e.detail.storeName === 'tabs')) {
      await refreshSidebarLists();
    }
  };
  window.addEventListener('forge-db-updated', window._sidebarDbUpdateHandler);
}

// ─── Build a static nav item ──────────────────────────────────────────────────

function buildStaticNavItem(item) {
  const link = document.createElement('a');
  link.className = 'nav-item';
  link.dataset.route = item.route;
  link.href = `#/${item.route}`;
  
  if (item.route === 'continuity') {
    link.id = 'sidebar-continuity-item';
    link.innerHTML = `
      <span class="nav-item-icon"><i data-lucide="${item.icon}"></i></span>
      <span class="nav-item-label" style="flex: 1;">${item.label}</span>
      <span id="continuity-issue-badge" style="
        background: var(--accent-red, #f43f5e);
        color: #fff;
        font-size: 0.65rem;
        font-weight: 700;
        border-radius: 10px;
        padding: 2px 7px;
        font-family: var(--font-hud, monospace);
        animation: continuity-pulse 2s ease-in-out infinite;
        display: none;
      ">0</span>
    `;
  } else {
    link.innerHTML = `
      <span class="nav-item-icon"><i data-lucide="${item.icon}"></i></span>
      <span class="nav-item-label">${item.label}</span>
    `;
  }
  
  link.title = item.label;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigate(item.route);
  });
  return link;
}

// ─── Refresh dynamic schema list ──────────────────────────────────────────────

export async function refreshSidebarLists() {
  if (!schemaListEl) return;
  
  const refreshId = ++currentRefreshId;

  const project = await db.getActiveProject();
  if (refreshId !== currentRefreshId) return;
  if (!project) return;

  const schemas = await db.getSchemas(project.id);
  if (refreshId !== currentRefreshId) return;

  const styleId = project.settings?.style || 'story';
  const styleConf = getStyleConfig(styleId);

  // Auto-seed default schemas if missing (e.g. for existing projects getting the Maps feature)
  if (styleConf && styleConf.getSchemas) {
    const defaultSchemas = styleConf.getSchemas(project.id);
    const deletedSchemas = project.settings?.deletedSchemas || [];
    for (const defSchema of defaultSchemas) {
      if (deletedSchemas.includes(defSchema.id)) {
        continue;
      }
      if (!schemas.some(s => s.id === defSchema.id)) {
        await db.saveSchema(defSchema);
        schemas.push(defSchema);
      }
    }
  }

  const tabs = await db.getAllTabs();
  if (refreshId !== currentRefreshId) return;

  const fragment = document.createDocumentFragment();

  // Databases Header
  const dbHeader = document.createElement('div');
  dbHeader.className = 'sidebar-section-label';
  dbHeader.textContent = styleConf.terms.sidebarTitle || 'Databases';
  fragment.appendChild(dbHeader);

  if (schemas.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sidebar-tab-empty';
    empty.textContent = 'No databases yet';
    fragment.appendChild(empty);
  } else {
    for (const schema of schemas) {
      const item = await buildSchemaItem(schema);
      if (refreshId !== currentRefreshId) return;
      fragment.appendChild(item);
    }
  }

  // Canvases Header
  const cvHeader = document.createElement('div');
  cvHeader.className = 'sidebar-section-label';
  cvHeader.textContent = 'Canvases';
  cvHeader.style.marginTop = 'var(--sp-4)';
  fragment.appendChild(cvHeader);

  if (tabs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sidebar-tab-empty';
    empty.textContent = 'No canvases yet';
    fragment.appendChild(empty);
  } else {
    for (const tab of tabs) {
      fragment.appendChild(buildTabItem(tab));
    }
  }
  
  if (refreshId !== currentRefreshId) return;
  
  schemaListEl.innerHTML = '';
  schemaListEl.appendChild(fragment);
  
  refreshIcons();
  updateSidebarActive();
}

async function buildSchemaItem(schema) {
  const route = 'schema/' + schema.id;

  const container = document.createElement('div');
  container.className = 'sidebar-schema-group';
  container.style.cssText = 'display: flex; flex-direction: column; width: 100%;';

  const item = document.createElement('div');
  item.className = 'nav-item sidebar-tab-item';
  item.dataset.schemaId = schema.id;
  item.dataset.route = route;
  item.title = schema.name;

  const iconName = schema.icon && schema.icon.length > 2 ? schema.icon : 'database';

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'sidebar-sublist-toggle';
  toggleBtn.innerHTML = '▸';
  toggleBtn.style.cssText = 'background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:10px; margin-right:6px; padding:2px; transition:transform 0.15s; display:flex; align-items:center; justify-content:center; width:14px; height:14px;';
  
  const icon = document.createElement('span');
  icon.className = 'nav-item-icon';
  icon.innerHTML = `<i data-lucide="${iconName}"></i>`;

  const label = document.createElement('span');
  label.className = 'nav-item-label';
  label.textContent = schema.name;

  item.appendChild(toggleBtn);
  item.appendChild(icon);
  item.appendChild(label);

  item.addEventListener('click', (e) => {
    if (e.target.closest('.sidebar-sublist-toggle')) return;
    navigate(route);
  });

  const sublist = document.createElement('div');
  sublist.className = 'sidebar-sublist';
  sublist.style.cssText = 'display:none; flex-direction:column; padding-left: 12px; border-left: 1px dashed var(--border-subtle); margin-left: 18px; margin-top: 2px; margin-bottom: 4px; gap: 2px;';

  const pages = await db.getPagesBySchema(schema.id);
  pages.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  if (pages.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size: 10px; color: var(--text-muted); padding: 4px 8px; font-style: italic;';
    empty.textContent = 'Empty';
    sublist.appendChild(empty);
  } else {
    for (const page of pages) {
      const pageEl = document.createElement('div');
      pageEl.className = 'sidebar-sublist-item';
      pageEl.textContent = page.title || 'Unnamed';
      pageEl.style.cssText = 'font-size: 11px; color: var(--text-secondary); padding: 4px 8px; border-radius: 4px; cursor: grab; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; user-select: none; transition: background 0.15s, color 0.15s;';
      
      pageEl.addEventListener('mouseenter', () => {
        pageEl.style.background = 'var(--bg-hover)';
        pageEl.style.color = 'var(--text-primary)';
      });
      pageEl.addEventListener('mouseleave', () => {
        pageEl.style.background = '';
        pageEl.style.color = 'var(--text-secondary)';
      });
      
      // Make Draggable
      pageEl.draggable = true;
      pageEl.addEventListener('dragstart', (e) => {
        window.getSelection()?.removeAllRanges();
        pageEl.style.opacity = '0.5';
        const payload = JSON.stringify({
          type: 'pagelink',
          pageId: page.id,
          title: page.title || 'Unnamed'
        });
        e.dataTransfer.setData('forge/pagelink', payload);
        e.dataTransfer.setData('application/json', payload);
        e.dataTransfer.setData('text/plain', payload);
      });
      pageEl.addEventListener('dragend', () => {
        pageEl.style.opacity = '';
      });

      // Double-click to navigate
      pageEl.addEventListener('dblclick', () => {
        navigate('page/' + page.id);
      });

      sublist.appendChild(pageEl);
    }
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = sublist.style.display !== 'none';
    sublist.style.display = open ? 'none' : 'flex';
    toggleBtn.innerHTML = open ? '▸' : '▼';
  });

  container.appendChild(item);
  container.appendChild(sublist);
  return container;
}

function buildTabItem(tab) {
  const route = 'workspace/' + tab.id;

  const item = document.createElement('div');
  item.className = 'nav-item sidebar-tab-item';
  item.dataset.tabId = tab.id;
  item.dataset.route = route;
  item.title = tab.name;
  item.style.position = 'relative';

  const iconName = tab.icon && tab.icon.length > 2 ? tab.icon : 'layout-dashboard';

  const icon = document.createElement('span');
  icon.className = 'nav-item-icon';
  icon.innerHTML = `<i data-lucide="${iconName}"></i>`;

  const label = document.createElement('span');
  label.className = 'nav-item-label';
  label.textContent = tab.name;
  label.style.paddingRight = '20px';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'sidebar-tab-delete-btn';
  deleteBtn.innerHTML = '✕';
  deleteBtn.title = 'Delete Canvas';
  deleteBtn.style.cssText = `
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 10px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    z-index: 2;
  `;

  // Hover states for delete button visibility
  item.addEventListener('mouseenter', () => {
    deleteBtn.style.opacity = '1';
  });
  item.addEventListener('mouseleave', () => {
    deleteBtn.style.opacity = '0';
  });

  deleteBtn.addEventListener('mouseenter', () => {
    deleteBtn.style.color = 'var(--accent-red)';
    deleteBtn.style.background = 'rgba(239, 68, 68, 0.1)';
  });
  deleteBtn.addEventListener('mouseleave', () => {
    deleteBtn.style.color = 'var(--text-muted)';
    deleteBtn.style.background = 'transparent';
  });

  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation(); // prevent navigating to tab
    if (confirm(`Are you sure you want to delete the canvas "${tab.name}" and all of its nodes?`)) {
      await db.deleteTab(tab.id);
      
      const hash = window.location.hash.slice(2);
      if (hash === route || hash.startsWith('workspace/' + tab.id)) {
        navigate('dashboard');
      }
      
      await refreshSidebarLists();
    }
  });

  item.appendChild(icon);
  item.appendChild(label);
  item.appendChild(deleteBtn);

  // Drag over spring-loading: Switch to this workspace tab after hovering 500ms
  let hoverTimer = null;
  let dragCounter = 0;

  item.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
      item.classList.add('drag-hover');
      if (!hoverTimer) {
        hoverTimer = setTimeout(() => {
          hoverTimer = null;  // Reset so subsequent drags work
          navigate(route);
        }, 500);
      }
    }
  });

  item.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  item.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter === 0) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
      item.classList.remove('drag-hover');
    }
  });

  // Drop directly onto a canvas tab — adds the entry as a node without navigating
  item.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    clearTimeout(hoverTimer);
    hoverTimer = null;
    item.classList.remove('drag-hover');

    // Parse drag payload
    let dragData = null;
    const types = ['forge/pagelink', 'application/json', 'text/plain'];
    for (const t of types) {
      try {
        const raw = e.dataTransfer.getData(t);
        if (raw) { dragData = JSON.parse(raw); break; }
      } catch (_) {}
    }
    if (!dragData || dragData.type !== 'pagelink') return;

    // Save a new pagelink node into the target canvas tab
    try {
      let nodeType = 'pagelink';
      let nodeWidth = 340;
      let nodeHeight = 220;
      const page = await db.getPage(dragData.pageId);
      if (page) {
        let isMap = false;
        const mapIds = ['dnd-maps-schema', 'story-maps-schema', 'story-locs-schema', 'locations'];
        if (mapIds.includes(page.schemaId)) {
          isMap = true;
        } else if (page.schemaId) {
          const schema = await db.getSchema(page.schemaId);
          if (schema && mapIds.includes(schema.templateId)) {
            isMap = true;
          }
        }
        if (isMap) {
          nodeType = 'map';
          nodeWidth = 500;
          nodeHeight = 400;
        }
      }

      const nodeData = {
        id: db.generateId(),
        tabId: tab.id,
        type: nodeType,
        title: dragData.title || 'Database Entry',
        content: { pageId: dragData.pageId },
        x: 100 + Math.random() * 200,
        y: 100 + Math.random() * 200,
        width: nodeWidth,
        height: nodeHeight,
        zIndex: 1,
      };
      await db.saveNode(nodeData);
      showToast(`Added "${nodeData.title}" to ${tab.name}`, 'success');
      
      // Navigate to the target tab immediately so the canvas opens
      navigate(route);
    } catch (err) {
      console.error('sidebar drop: failed to save node', err);
    }
  });

  item.addEventListener('click', () => {
    navigate(route);
  });

  return item;
}

// ─── Active state ─────────────────────────────────────────────────────────────

function updateSidebarActive() {
  const hash = window.location.hash.slice(2) || 'dashboard';
  const basePath = hash;

  document.querySelectorAll('.nav-item, .sidebar-tab-item').forEach(el => {
    const route = el.dataset.route;
    if (route) {
      // Exact match for dashboard
      if (route === 'dashboard') {
        el.classList.toggle('active', basePath === 'dashboard');
      } else {
        el.classList.toggle('active', basePath.startsWith(route));
      }
    }
  });
}

function showSidebarUpdateBadge(settingsItem) {
  if (settingsItem.querySelector('.sidebar-update-badge')) return;
  const badge = document.createElement('span');
  badge.className = 'sidebar-update-badge';
  badge.style.cssText = `
    width: 6px;
    height: 6px;
    background-color: var(--accent-primary, #e5a93b);
    border-radius: 50%;
    position: absolute;
    right: 14px;
    box-shadow: 0 0 6px var(--accent-primary, #e5a93b);
  `;
  settingsItem.style.position = 'relative';
  settingsItem.appendChild(badge);
}


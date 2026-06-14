/* ============================================================
   Forge — Workspace Canvas Page
   A free-form, infinite canvas of modular, draggable nodes.
   Routes: workspace/:tabId
   ============================================================ */

import {
  getTab, saveTab, getAllTabs,
  getNodesForTab, saveNode, deleteNode, generateId,
  getPage, savePage, getPages, getActiveProject, getSchema,
  flushFileAutosave
} from '../db.js';
import { navigate } from '../router.js';
import { showToast, createEditor } from '../ui.js';
import { playClickSound, playZapSound } from '../audio.js';
import { normalizeActionName } from '../ai.js';
import { getStyleConfig } from '../styleConfig.js';
import { initMapEditor } from '../mapEditor.js';

// ─── Constants ─────────────────────────────────────────────────────────────

const SNAP_GRID = 16;
const SAVE_DEBOUNCE = 600;

const CARD_COLORS = [
  { name: 'Default', hex: '' },
  { name: 'Red', hex: '#f43f5e' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Green', hex: '#10b981' },
  { name: 'Purple', hex: '#8b5cf6' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Slate', hex: '#64748b' }
];

function getActiveNodeTypes(styleId) {
  const cfg = getStyleConfig(styleId || 'story');
  return cfg.getNodeTypes ? cfg.getNodeTypes() : _defaultNodeTypes();
}

function _defaultNodeTypes() {
  return [
    { type: 'richtext',    label: 'Rich Text',        icon: '📝', color: '#c084fc', defaultW: 380, defaultH: 260 },
    { type: 'image',       label: 'Image',             icon: '🖼️', color: '#38bdf8', defaultW: 320, defaultH: 280 },
    { type: 'timeline',   label: 'Timeline Event',     icon: '🕒', color: '#34d399', defaultW: 360, defaultH: 220 },
    { type: 'link',        label: 'Relationship Link',  icon: '🔗', color: '#fb923c', defaultW: 280, defaultH: 180 },
    { type: 'moodboard',  label: 'Mood Board',          icon: '🎨', color: '#a78bfa', defaultW: 420, defaultH: 340 },
    { type: 'quote',       label: 'Quote',              icon: '💬', color: '#06b6d4', defaultW: 320, defaultH: 180 },
    { type: 'pagelink',    label: 'Database Page',     icon: '📄', color: '#14b8a6', defaultW: 340, defaultH: 220 },
    { type: 'statblock',   label: 'Character Codex',   icon: '👤', color: '#e5a93b', defaultW: 300, defaultH: 320 }
  ];
}

function getNodeTypeConfig(type) {
  const styleId = canvasState.styleId || 'story';
  return getActiveNodeTypes(styleId).find(n => n.type === type) || { type, label: 'Concept Node', icon: '💡', color: '#e5a93b', defaultW: 300, defaultH: 200 };
}


// ─── State ──────────────────────────────────────────────────────────────────

let canvasState = {
  tabId: null,
  tab: null,
  nodes: [],             // live node objects {data, el}
  pan: { x: 0, y: 0 },
  zoom: 1,
  snapToGrid: false,
  maxZ: 10,
  surface: null,
  viewport: null,
  minimap: null,
  saveTimers: {},
};

// ─── Main Render ────────────────────────────────────────────────────────────

export async function renderWorkspace(container, params) {
  const { tabId } = params;
  if (!tabId) { container.innerHTML = '<div class="empty-state"><p>No tab selected.</p></div>'; return; }

  const tab = await getTab(tabId);
  if (!tab) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><h2 class="empty-state-title">Tab Not Found</h2><p class="empty-state-text">This workspace tab no longer exists.</p><button class="btn btn-primary" onclick="window.location.hash='#/dashboard'">Go Home</button></div>`;
    return;
  }

  if (window.setTabTitle) {
    window.setTabTitle(tab.name);
  }

  injectFocusStyles();

  container.classList.add('canvas-page-active');
  const mainContent = document.getElementById('main-content');
  if (mainContent) mainContent.classList.add('canvas-page-active');

  const nodes = await getNodesForTab(tabId);

  // Sync details node with beat data (in case it was edited on the roadmap)
  if (tab.beatId) {
    try {
      const beat = await getPage(tab.beatId);
      if (beat) {
        const detailsNode = nodes.find(n => n.isBeatDetails) || nodes.find(n => n.type === 'richtext');
        if (detailsNode) {
          let nodeChanged = false;
          if (detailsNode.title !== beat.title) {
            detailsNode.title = beat.title;
            nodeChanged = true;
          }
          
          const currentText = extractSynopsisFromDelta(detailsNode.content?.delta || detailsNode.content, beat.title);
          if (currentText.trim() !== (beat.content || '').trim()) {
            const newContent = beat.title
              ? `<h2>${beat.title}</h2><p>${beat.content || 'No synopsis yet.'}</p>`
              : `<p>${beat.content || 'No synopsis yet.'}</p>`;
            detailsNode.content = { delta: newContent };
            nodeChanged = true;
          }
          if (nodeChanged) {
            await saveNode(detailsNode);
          }
        }
      }
    } catch (err) {
      console.error('Failed to pre-sync beat canvas nodes on load:', err);
    }
  }

  const project = await getActiveProject();
  const styleId = project?.settings?.style || 'story';

  // Reset state
  canvasState = {
    tabId,
    tab,
    nodes: [],
    pan: tab.pan || { x: 0, y: 0 },
    zoom: tab.zoom || 1,
    snapToGrid: false,
    maxZ: 10,
    surface: null,
    viewport: null,
    minimap: null,
    saveTimers: {},
    linkingMode: false,
    linkingSourceId: null,
    isSyncing: false,
    styleId,
    container
  };

  // Track active canvas tab for sidebar drop-to-canvas feature
  localStorage.setItem('forge-active-tab-id', tabId);


  // Build DOM
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.overflow = 'hidden';
  container.style.height = '100%';
  container.style.padding = '0';

  const toolbar = buildToolbar(tab);
  const viewport = document.createElement('div');
  viewport.className = `canvas-viewport style-${styleId}`;
  const surface = document.createElement('div');
  surface.className = 'canvas-surface';
  viewport.appendChild(surface);

  // Connection SVG Layer
  const connectionsSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  connectionsSvg.setAttribute('class', 'canvas-connections');
  connectionsSvg.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; z-index: 0;';
  surface.appendChild(connectionsSvg);
  canvasState.connectionsSvg = connectionsSvg;

  const minimap = buildMinimap();
  container.appendChild(toolbar);
  container.appendChild(viewport);
  container.appendChild(minimap);

  canvasState.surface = surface;
  canvasState.viewport = viewport;
  canvasState.minimap = minimap;

  applySurfaceTransform();

  // 1. Ensure a details node exists and is tagged on beat canvases
  if (tab.beatId) {
    try {
      let detailsNode = nodes.find(n => n.isBeatDetails);
      if (!detailsNode) {
        detailsNode = nodes.find(n => n.type === 'richtext');
        if (detailsNode) {
          detailsNode.isBeatDetails = true;
          await saveNode(detailsNode);
        } else {
          const beat = await getPage(tab.beatId);
          const beatContent = beat?.title
            ? `<h2>${beat.title}</h2><p>${beat.content || 'No synopsis yet.'}</p>`
            : `<p>No synopsis yet.</p>`;
          
          detailsNode = {
            id: generateId(),
            tabId,
            type: 'richtext',
            isBeatDetails: true,
            x: 80,
            y: 80,
            width: 380,
            height: 200,
            color: '',
            title: beat?.title || 'Beat Notes',
            content: { delta: beatContent }
          };
          await saveNode(detailsNode);
          nodes.push(detailsNode);
        }
      }
    } catch (err) {
      console.error('Failed to ensure details node on load:', err);
    }
  }

  // Mount saved nodes
  for (const nodeData of nodes) {
    if (nodeData.type === 'pagelink' && nodeData.pageId && (!nodeData.content || !nodeData.content.pageId)) {
      if (!nodeData.content) nodeData.content = {};
      nodeData.content.pageId = nodeData.pageId;
      if (!nodeData.title && nodeData.label) {
        nodeData.title = nodeData.label;
      }
      await saveNode(nodeData);
    }
    mountNode(nodeData);
  }

  // 2. Sync beat characters to canvas (adding missing, removing deleted)
  if (tab.beatId) {
    try {
      const beat = await getPage(tab.beatId);
      if (beat) {
        await syncBeatCharactersToCanvas(beat);
      }
    } catch (err) {
      console.error('Failed to sync beat characters on load:', err);
    }
  }

  renderCanvasGuides();
  drawConnections();

  // Interactions
  setupCanvasPan(viewport, surface);
  setupCanvasZoom(viewport);
  setupDragAndDrop(viewport);
  updateMinimap();

  // Handle any pending canvas action from another page
  if (window.pendingCanvasAction) {
    setTimeout(() => {
      if (window.pendingCanvasAction) {
        handleCanvasAction({ detail: window.pendingCanvasAction });
        window.pendingCanvasAction = null;
      }
    }, 400);
  }

  const onNodeAddedExternally = (e) => {
    const nodeData = e.detail;
    if (nodeData && nodeData.tabId === canvasState.tabId) {
      // Avoid duplicates
      if (!canvasState.nodes.some(n => n.data.id === nodeData.id)) {
        canvasState.nodes.push({ data: nodeData, el: null });
        mountNode(nodeData);
        updateMinimap();
        drawConnections();
      }
    }
  };

  // Listen for sidebar tab renames and canvas AI actions
  window.addEventListener('forge-tab-renamed', onTabRenamed);
  window.addEventListener('forge-canvas-action', handleCanvasAction);
  window.addEventListener('forge-db-updated', onDbUpdated);
  window.addEventListener('forge-canvas-node-added', onNodeAddedExternally);
  container._cleanup = () => {
    window.removeEventListener('forge-tab-renamed', onTabRenamed);
    window.removeEventListener('forge-canvas-action', handleCanvasAction);
    window.removeEventListener('forge-db-updated', onDbUpdated);
    window.removeEventListener('forge-canvas-node-added', onNodeAddedExternally);
    // Clean up drag-and-drop window listeners
    if (canvasState.viewport && canvasState.viewport._dndCleanup) {
      canvasState.viewport._dndCleanup();
    }
    // Clear active tab tracking
    if (localStorage.getItem('forge-active-tab-id') === canvasState.tabId) {
      localStorage.removeItem('forge-active-tab-id');
    }
    
    // Clean up global canvas tooltip if it exists (Bug 15)
    if (globalCanvasTooltip) {
      globalCanvasTooltip.remove();
      globalCanvasTooltip = null;
    }

    // Flush and clear all pending node saves (Bug 28)
    for (const nodeId in canvasState.saveTimers) {
      clearTimeout(canvasState.saveTimers[nodeId]);
      const entry = canvasState.nodes.find(n => n.data.id === nodeId);
      if (entry) {
        saveNode(entry.data);
      }
    }
    canvasState.saveTimers = {};

    container.classList.remove('canvas-page-active');
    container.style.position = '';
    container.style.overflow = '';
    container.style.height = '';
    container.style.padding = '';
    const mc = document.getElementById('main-content');
    if (mc) mc.classList.remove('canvas-page-active');
  };
}

async function onDbUpdated(e) {
  const detail = e.detail;
  if (!detail || detail.storeName !== 'pages') return;

  // 1. Check if the updated page is the beat itself
  if (canvasState.tab && canvasState.tab.beatId && canvasState.tab.beatId === detail.id) {
    if (canvasState.isSyncing) return;
    try {
      const beat = await getPage(detail.id);
      if (!beat) return;

      // Sync tab title if it changed
      if (canvasState.tab.name !== beat.title) {
        canvasState.tab.name = beat.title;
        const nameEl = document.querySelector('.canvas-tab-name');
        if (nameEl) nameEl.textContent = beat.title;
        if (window.setTabTitle) {
          window.setTabTitle(beat.title);
        }
      }

      // Find details node and update it
      const detailsNode = canvasState.nodes.find(n => n.data.isBeatDetails) || canvasState.nodes.find(n => n.data.type === 'richtext');
      if (detailsNode) {
        let nodeChanged = false;

        // Update header title
        const titleEl = detailsNode.el.querySelector('.canvas-node-title');
        if (titleEl && document.activeElement !== titleEl) {
          if (detailsNode.data.title !== beat.title) {
            detailsNode.data.title = beat.title;
            titleEl.textContent = beat.title;
            nodeChanged = true;
          }
        }

        // Update editor content
        if (detailsNode.quillEditor && !detailsNode.quillEditor.quill.hasFocus()) {
          const currentTextInEditor = extractSynopsisFromDelta(detailsNode.quillEditor.getContent(), beat.title);
          if (currentTextInEditor.trim() !== (beat.content || '').trim()) {
            const newContent = beat.title
              ? `<h2>${beat.title}</h2><p>${beat.content || 'No synopsis yet.'}</p>`
              : `<p>${beat.content || 'No synopsis yet.'}</p>`;
            detailsNode.quillEditor.setContent(newContent);
            detailsNode.data.content = { delta: detailsNode.quillEditor.getContent() };
            nodeChanged = true;
          }
        }

        if (nodeChanged) {
          await saveNode(detailsNode.data);
        }
      }

      // Sync linked characters/entities (add/remove nodes dynamically)
      await syncBeatCharactersToCanvas(beat);

      updateMinimap();
      drawConnections();
    } catch (err) {
      console.error('Error syncing beat update to canvas:', err);
    }
  }

  // 2. Check if the updated page is a character/entity referenced in any page-linked nodes
  const matchingNodes = canvasState.nodes.filter(n => n.data.content?.pageId === detail.id);
  for (const node of matchingNodes) {
    try {
      const pg = await getPage(detail.id);
      if (pg) {
        let nodeChanged = false;
        if (pg.title && node.data.title !== pg.title) {
          node.data.title = pg.title;
          const titleEl = node.el.querySelector('.canvas-node-title');
          if (titleEl && document.activeElement !== titleEl) {
            titleEl.textContent = pg.title;
          }
          nodeChanged = true;
        }
        if (nodeChanged) {
          await saveNode(node.data);
        }
      }
    } catch (_) {}

    const bodyEl = node.el.querySelector('.canvas-node-body');
    if (bodyEl) {
      await renderNodeBody(bodyEl, node.data);
    }
  }
}

function onTabRenamed(e) {
  if (e.detail.id === canvasState.tabId) {
    canvasState.tab.name = e.detail.name;
    const nameEl = document.querySelector('.canvas-tab-name');
    if (nameEl) nameEl.textContent = e.detail.name;
  }
}

function injectFocusStyles() {
  const styleId = 'canvas-focus-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.innerHTML = `
    @keyframes focusPulse {
      0% { box-shadow: 0 0 0 0 var(--accent-primary); transform: scale(1); }
      50% { box-shadow: 0 0 25px 8px var(--accent-primary); transform: scale(1.05); }
      100% { box-shadow: 0 0 0 0 var(--accent-primary); transform: scale(1); }
    }
    .node-focused-pulse {
      animation: focusPulse 1.2s ease-in-out 2 !important;
      z-index: 99999 !important;
    }
    .canvas-node.dragging {
      will-change: left, top;
      z-index: 10000 !important;
      transition: none !important;
    }
  `;
  document.head.appendChild(style);
}

async function handleCanvasAction(e) {
  const data = e.detail;
  if (!data) return;

  const action = data.action;
  switch (action) {
    case 'rearrange_nodes':
      await handleRearrangeNodes(data);
      break;
    case 'destroy_nodes':
      await handleDestroyNodes(data);
      break;
    case 'unlink_nodes':
      await handleUnlinkNodes(data);
      break;
    case 'link_nodes':
      await handleLinkNodes(data);
      break;
    case 'focus_node':
      await handleFocusNode(data);
      break;
    case 'spawn_nodes':
      await handleSpawnNodes(data);
      break;
  }
}

async function handleSpawnNodes(data) {
  if (!data) {
    showToast('No data to spawn.', 'warning');
    return;
  }

  const nodesList = Array.isArray(data) ? data : (data.nodes || []);
  if (nodesList.length === 0) {
    showToast('No nodes to spawn.', 'warning');
    return;
  }

  const newIds = [];
  const newNodes = [];

  // Pre-fetch all pages for the current active project to resolve title matches
  let projectPages = [];
  try {
    const proj = await getActiveProject();
    if (proj) {
      projectPages = await getPages(proj.id);
    }
  } catch (err) {
    console.error('Error fetching pages for spawn matching:', err);
  }

  // Save and mount nodes
  for (let i = 0; i < nodesList.length; i++) {
    const n = nodesList[i];
    const newId = generateId();
    newIds.push(newId);

    let nodeType = n.type || 'richtext';
    let nodeTitle = n.title || 'Concept Card';
    let nodeContent = n.content || {};

    // Check if the title matches a database entry
    let matchedPage = null;
    const cleanTitle = String(nodeTitle).trim().toLowerCase();

    // Check for exact match or close match by stripping common prefixes
    const prefixes = ['character:', 'lore:', 'world:', 'entry:', 'page:'];
    let searchTitle = cleanTitle;
    for (const prefix of prefixes) {
      if (searchTitle.startsWith(prefix)) {
        searchTitle = searchTitle.slice(prefix.length).trim();
      }
    }

    if (projectPages.length > 0) {
      matchedPage = projectPages.find(p => {
        const pTitle = String(p.title || '').trim().toLowerCase();
        return pTitle === searchTitle || pTitle === cleanTitle;
      });
      if (!matchedPage) {
        // Fallback: partial match if exact match not found
        matchedPage = projectPages.find(p => {
          const pTitle = String(p.title || '').trim().toLowerCase();
          return pTitle.includes(searchTitle) || searchTitle.includes(pTitle);
        });
      }
    }

    if (matchedPage) {
      if (nodeType === 'pagelink' || nodeType === 'richtext') {
        nodeType = 'pagelink';
        nodeTitle = matchedPage.title || nodeTitle;
        nodeContent = { pageId: matchedPage.id };
      }
    } else if (nodeType === 'pagelink' && !nodeContent.pageId) {
      if (n.pageId) {
        nodeContent = { pageId: n.pageId };
      } else if (n.content && n.content.pageId) {
        nodeContent = { pageId: n.content.pageId };
      } else {
        nodeType = 'richtext';
        nodeContent = { delta: `<p>${nodeTitle} details not found.</p>` };
      }
    }

    const nodeObj = {
      id: newId,
      tabId: canvasState.tabId,
      type: nodeType,
      title: nodeTitle,
      content: nodeContent,
      x: typeof n.x === 'number' ? n.x : (i * 350 - 350),
      y: typeof n.y === 'number' ? n.y : (i % 2 === 0 ? -100 : 150),
      width: n.width || (nodeType === 'pagelink' ? 340 : 300),
      height: n.height || (nodeType === 'pagelink' ? 220 : 200),
      zIndex: ++canvasState.maxZ,
      _isNew: true
    };

    await saveNode(nodeObj);
    mountNode(nodeObj);
    newNodes.push(nodeObj);
  }

  // Draw connections
  if (!canvasState.tab.connections) canvasState.tab.connections = [];
  const connectionsList = data.connections || [];
  if (Array.isArray(connectionsList)) {
    connectionsList.forEach(conn => {
      let sourceId = null;
      let targetId = null;

      if (typeof conn.sourceIndex === 'number' && conn.sourceIndex >= 0 && conn.sourceIndex < newIds.length) {
        sourceId = newIds[conn.sourceIndex];
      }
      if (typeof conn.targetIndex === 'number' && conn.targetIndex >= 0 && conn.targetIndex < newIds.length) {
        targetId = newIds[conn.targetIndex];
      }

      if (!sourceId && conn.sourceTitle) {
        const sClean = conn.sourceTitle.trim().toLowerCase();
        let sMatch = newNodes.find(n => n.title.trim().toLowerCase() === sClean);
        if (!sMatch) {
          sMatch = newNodes.find(n => {
            const t = n.title.trim().toLowerCase();
            return t.includes(sClean) || sClean.includes(t);
          });
        }
        if (sMatch) sourceId = sMatch.id;
      }
      if (!targetId && conn.targetTitle) {
        const tClean = conn.targetTitle.trim().toLowerCase();
        let tMatch = newNodes.find(n => n.title.trim().toLowerCase() === tClean);
        if (!tMatch) {
          tMatch = newNodes.find(n => {
            const t = n.title.trim().toLowerCase();
            return t.includes(tClean) || tClean.includes(t);
          });
        }
        if (tMatch) targetId = tMatch.id;
      }

      if (!sourceId && conn.sourceTitle) {
        const sClean = conn.sourceTitle.trim().toLowerCase();
        let sMatch = canvasState.nodes.find(n => (n.data.title || '').trim().toLowerCase() === sClean);
        if (!sMatch) {
          sMatch = canvasState.nodes.find(n => {
            const t = (n.data.title || '').trim().toLowerCase();
            return t.includes(sClean) || sClean.includes(t);
          });
        }
        if (sMatch) sourceId = sMatch.data.id;
      }
      if (!targetId && conn.targetTitle) {
        const tClean = conn.targetTitle.trim().toLowerCase();
        let tMatch = canvasState.nodes.find(n => (n.data.title || '').trim().toLowerCase() === tClean);
        if (!tMatch) {
          tMatch = canvasState.nodes.find(n => {
            const t = (n.data.title || '').trim().toLowerCase();
            return t.includes(tClean) || tClean.includes(t);
          });
        }
        if (tMatch) targetId = tMatch.data.id;
      }

      if (sourceId && targetId) {
        canvasState.tab.connections.push({
          id: generateId(),
          sourceId,
          targetId,
          label: conn.label || ''
        });
      }
    });
  }

  await saveTab(canvasState.tab);
  await flushFileAutosave();
  drawConnections();
  updateMinimap();
  playZapSound();
  showToast('AI layout spawned successfully!', 'success');
}

async function handleFocusNode(data) {
  const rawTitle = data.nodeTitle || data.title || '';
  if (!rawTitle) {
    showToast('No node title specified to focus.', 'warning');
    return;
  }
  const title = String(rawTitle).trim().toLowerCase();
  const node = canvasState.nodes.find(n => {
    const nodeTitle = String(n.data.title || '').trim().toLowerCase();
    return nodeTitle.includes(title) || title.includes(nodeTitle);
  });

  if (!node) {
    showToast(`Could not find node "${rawTitle}" to focus.`, 'warning');
    return;
  }

  // Bring to front
  bringToFront(node);

  // Center camera
  const centerX = node.data.x + node.data.width / 2;
  const centerY = node.data.y + node.data.height / 2;
  canvasState.pan.x = -(centerX * canvasState.zoom - canvasState.viewport.clientWidth / 2);
  canvasState.pan.y = -(centerY * canvasState.zoom - canvasState.viewport.clientHeight / 2);
  applySurfaceTransform();

  // Highlight/glow effect
  node.el.classList.add('node-focused-pulse');
  setTimeout(() => {
    node.el.classList.remove('node-focused-pulse');
  }, 2400);

  showToast(`Focused on node "${node.data.title}"`, 'info');
}

async function handleDestroyNodes(data) {
  let rawTitles = [];
  if (Array.isArray(data.nodeTitles)) rawTitles = data.nodeTitles;
  else if (Array.isArray(data.nodes)) rawTitles = data.nodes;
  else if (data.nodeTitle) rawTitles = [data.nodeTitle];
  else if (data.node) rawTitles = [data.node];
  else if (data.title) rawTitles = [data.title];
  else if (data.name) rawTitles = [data.name];
  else if (typeof data.nodeTitles === 'string') rawTitles = [data.nodeTitles];
  else if (typeof data.nodes === 'string') rawTitles = [data.nodes];

  const titles = rawTitles.map(t => {
    if (typeof t === 'string') return t.trim().toLowerCase();
    if (t && typeof t === 'object') {
      const val = t.title || t.name || t.nodeTitle || t.label || '';
      return String(val).trim().toLowerCase();
    }
    return String(t).trim().toLowerCase();
  }).filter(Boolean);

  const deleteAll = data.destroyAll || data.clear || data.all || 
    titles.some(t => t === 'all' || t === 'everything' || t === 'clear' || t.includes('all ') || t.includes('everything') || t === '*');

  let toDelete = [];
  
  if (deleteAll) {
    toDelete = [...canvasState.nodes];
  } else {
    toDelete = canvasState.nodes.filter(n => {
      const nodeTitle = String(n.data.title || '').trim().toLowerCase();
      return titles.some(t => nodeTitle.includes(t) || t.includes(nodeTitle));
    });
  }

  if (toDelete.length === 0) {
    showToast('No matching nodes found to delete.', 'warning');
    return;
  }

  for (const entry of toDelete) {
    try {
      if (canvasState.saveTimers[entry.data.id]) {
        clearTimeout(canvasState.saveTimers[entry.data.id]);
        delete canvasState.saveTimers[entry.data.id];
      }
      await deleteNode(entry.data.id);
      entry.el.remove();
      canvasState.nodes = canvasState.nodes.filter(n => n.data.id !== entry.data.id);
      
      // Remove connections involving this node
      if (canvasState.tab.connections) {
        canvasState.tab.connections = canvasState.tab.connections.filter(c => c.sourceId !== entry.data.id && c.targetId !== entry.data.id);
      }
    } catch (e) {
      console.error(`Error deleting node ${entry.data.id}:`, e);
    }
  }

  await saveTab(canvasState.tab);
  await flushFileAutosave();
  playClickSound();
  updateMinimap();
  drawConnections();
  showToast(`Deleted ${toDelete.length} nodes successfully!`, 'success');
  if (canvasState.tab && canvasState.tab.beatId) {
    await syncBeatWithCanvas();
  }
}

async function handleUnlinkNodes(data) {
  if (!canvasState.tab.connections || canvasState.tab.connections.length === 0) {
    showToast('No active connections to remove.', 'warning');
    return;
  }

  // Support links array, single link object, or top-level source/target keys
  let rawLinks = [];
  if (Array.isArray(data.links)) {
    rawLinks = data.links;
  } else if (data.link) {
    rawLinks = [data.link];
  } else if ((data.sourceTitle || data.source || data.sourceNode) && (data.targetTitle || data.target || data.targetNode)) {
    rawLinks = [data];
  } else if (Array.isArray(data.nodes) && data.nodes.length >= 2) {
    rawLinks = [{ source: data.nodes[0], target: data.nodes[1] }];
  } else if (Array.isArray(data.nodeTitles) && data.nodeTitles.length >= 2) {
    rawLinks = [{ source: data.nodeTitles[0], target: data.nodeTitles[1] }];
  }

  const unlinkAll = data.unlinkAll || data.clear || data.all || 
    (rawLinks.length === 0 && !data.sourceTitle && !data.source && !data.sourceNode && 
     !data.nodeTitles && !data.nodes && !data.nodeTitle && !data.node && !data.title) ||
    (rawLinks.some(l => {
      const src = String(l.sourceTitle || l.source || l.sourceNode || '').trim().toLowerCase();
      const tgt = String(l.targetTitle || l.target || l.targetNode || '').trim().toLowerCase();
      return src === 'all' || tgt === 'all' || src === 'everything' || tgt === 'everything';
    }));

  if (unlinkAll) {
    const totalCount = canvasState.tab.connections.length;
    canvasState.tab.connections = [];
    await saveTab(canvasState.tab);
    await flushFileAutosave();
    drawConnections();
    showToast(`Removed all ${totalCount} connections successfully.`, 'success');
    if (canvasState.tab && canvasState.tab.beatId) {
      await syncBeatWithCanvas();
    }
    return;
  }

  // Check if we want to unlink all connections for specific node(s)
  let unlinkSpecificNodes = [];
  if (rawLinks.length === 0) {
    let checkNodes = [];
    if (Array.isArray(data.nodeTitles)) checkNodes = data.nodeTitles;
    else if (Array.isArray(data.nodes)) checkNodes = data.nodes;
    else if (data.nodeTitle) checkNodes = [data.nodeTitle];
    else if (data.node) checkNodes = [data.node];
    else if (data.title) checkNodes = [data.title];
    
    if (checkNodes.length > 0) {
      const checkNodeTitles = checkNodes.map(cn => {
        if (typeof cn === 'string') return cn.trim().toLowerCase();
        if (cn && typeof cn === 'object') {
          return String(cn.title || cn.name || cn.nodeTitle || cn.label || '').trim().toLowerCase();
        }
        return String(cn).trim().toLowerCase();
      }).filter(Boolean);

      unlinkSpecificNodes = canvasState.nodes.filter(n => {
        const title = String(n.data.title || '').trim().toLowerCase();
        return checkNodeTitles.some(t => title.includes(t) || t.includes(title));
      });
    }
  }

  if (unlinkSpecificNodes.length > 0) {
    const beforeCount = canvasState.tab.connections.length;
    const ids = unlinkSpecificNodes.map(n => n.data.id);
    canvasState.tab.connections = canvasState.tab.connections.filter(c => 
      !ids.includes(c.sourceId) && !ids.includes(c.targetId)
    );
    const removedCount = beforeCount - canvasState.tab.connections.length;
    await saveTab(canvasState.tab);
    await flushFileAutosave();
    drawConnections();
    showToast(`Removed ${removedCount} connections for specified nodes.`, 'success');
    if (canvasState.tab && canvasState.tab.beatId) {
      await syncBeatWithCanvas();
    }
    return;
  }

  const getStringVal = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object') {
      return val.title || val.name || val.nodeTitle || val.label || '';
    }
    return String(val);
  };

  let count = 0;
  for (const link of rawLinks) {
    const sourceTitleVal = link.sourceTitle || link.source || link.sourceNode || '';
    const targetTitleVal = link.targetTitle || link.target || link.targetNode || '';
    if (!sourceTitleVal || !targetTitleVal) continue;
    
    const srcTitle = getStringVal(sourceTitleVal).trim().toLowerCase();
    const tgtTitle = getStringVal(targetTitleVal).trim().toLowerCase();

    const srcNode = canvasState.nodes.find(n => {
      const title = String(n.data.title || '').trim().toLowerCase();
      return title.includes(srcTitle) || srcTitle.includes(title);
    });
    const tgtNode = canvasState.nodes.find(n => {
      const title = String(n.data.title || '').trim().toLowerCase();
      return title.includes(tgtTitle) || tgtTitle.includes(title);
    });

    if (srcNode && tgtNode) {
      const beforeLength = canvasState.tab.connections.length;
      canvasState.tab.connections = canvasState.tab.connections.filter(c => 
        !(c.sourceId === srcNode.data.id && c.targetId === tgtNode.data.id) &&
        !(c.sourceId === tgtNode.data.id && c.targetId === srcNode.data.id)
      );
      if (canvasState.tab.connections.length < beforeLength) {
        count++;
      }
    }
  }

  if (count > 0) {
    await saveTab(canvasState.tab);
    await flushFileAutosave();
    drawConnections();
    showToast(`Removed ${count} connections.`, 'success');
    if (canvasState.tab && canvasState.tab.beatId) {
      await syncBeatWithCanvas();
    }
  } else {
    showToast('No matching connections found to unlink.', 'warning');
  }
}

async function handleLinkNodes(data) {
  // Support links array, single link object, or top-level source/target keys
  let rawLinks = [];
  if (Array.isArray(data.links)) {
    rawLinks = data.links;
  } else if (data.link) {
    rawLinks = [data.link];
  } else if ((data.sourceTitle || data.source || data.sourceNode) && (data.targetTitle || data.target || data.targetNode)) {
    rawLinks = [data];
  }

  if (rawLinks.length === 0) {
    showToast('No links provided to connect.', 'warning');
    return;
  }

  if (!canvasState.tab.connections) {
    canvasState.tab.connections = [];
  }

  const getStringVal = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object') {
      return val.title || val.name || val.nodeTitle || val.label || '';
    }
    return String(val);
  };

  let count = 0;
  for (const link of rawLinks) {
    const sourceTitleVal = link.sourceTitle || link.source || link.sourceNode || '';
    const targetTitleVal = link.targetTitle || link.target || link.targetNode || '';
    if (!sourceTitleVal || !targetTitleVal) continue;

    const srcTitle = getStringVal(sourceTitleVal).trim().toLowerCase();
    const tgtTitle = getStringVal(targetTitleVal).trim().toLowerCase();

    const srcNode = canvasState.nodes.find(n => {
      const title = String(n.data.title || '').trim().toLowerCase();
      return title.includes(srcTitle) || srcTitle.includes(title);
    });
    const tgtNode = canvasState.nodes.find(n => {
      const title = String(n.data.title || '').trim().toLowerCase();
      return title.includes(tgtTitle) || tgtTitle.includes(title);
    });

    if (srcNode && tgtNode) {
      const exists = canvasState.tab.connections.some(c => 
        (c.sourceId === srcNode.data.id && c.targetId === tgtNode.data.id) ||
        (c.sourceId === tgtNode.data.id && c.targetId === srcNode.data.id)
      );

      if (!exists) {
        canvasState.tab.connections.push({
          id: generateId(),
          sourceId: srcNode.data.id,
          targetId: tgtNode.data.id,
          label: link.label || link.name || link.relationship || ''
        });
        count++;
      }
    }
  }

  if (count > 0) {
    await saveTab(canvasState.tab);
    await flushFileAutosave();
    drawConnections();
    showToast(`Linked ${count} node pairs successfully!`, 'success');
    if (canvasState.tab && canvasState.tab.beatId) {
      await syncBeatWithCanvas();
    }
  } else {
    showToast('No matching nodes found to link.', 'warning');
  }
}

async function handleRearrangeNodes(data) {
  let nodesToArrange = canvasState.nodes;
  const rawTitles = data.nodeTitles || (data.nodeTitle ? [data.nodeTitle] : []);
  if (rawTitles.length > 0) {
    const titles = rawTitles.map(t => String(t).trim().toLowerCase());
    nodesToArrange = canvasState.nodes.filter(n => {
      const nodeTitle = String(n.data.title || '').trim().toLowerCase();
      return titles.some(t => nodeTitle.includes(t) || t.includes(nodeTitle));
    });
  }

  if (nodesToArrange.length === 0) {
    showToast('No matching nodes found to rearrange.', 'warning');
    return;
  }

  // Find bounding box to position them nicely
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  nodesToArrange.forEach(n => {
    if (n.data.x < minX) minX = n.data.x;
    if (n.data.y < minY) minY = n.data.y;
    if (n.data.x > maxX) maxX = n.data.x;
    if (n.data.y > maxY) maxY = n.data.y;
  });

  const startX = minX === Infinity ? 100 : minX;
  const startY = minY === Infinity ? 100 : minY;

  // Temporarily add smooth animation transitions to nodes
  nodesToArrange.forEach(node => {
    node.el.style.transition = 'left 0.5s cubic-bezier(0.25, 1, 0.5, 1), top 0.5s cubic-bezier(0.25, 1, 0.5, 1)';
  });

  const layout = data.layout || 'grid';
  if (layout === 'grid') {
    const cols = Math.ceil(Math.sqrt(nodesToArrange.length)) || 3;
    nodesToArrange.forEach((node, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      node.data.x = startX + col * 400;
      node.data.y = startY + row * 320;
    });
  } else if (layout === 'row') {
    nodesToArrange.forEach((node, idx) => {
      node.data.x = startX + idx * 400;
      node.data.y = startY;
    });
  } else if (layout === 'column') {
    nodesToArrange.forEach((node, idx) => {
      node.data.x = startX;
      node.data.y = startY + idx * 320;
    });
  } else if (layout === 'circle') {
    const centerX = (maxX > minX) ? (startX + (maxX - minX) / 2) : startX;
    const centerY = (maxY > minY) ? (startY + (maxY - minY) / 2) : startY;
    const radius = Math.max(300, nodesToArrange.length * 80);
    nodesToArrange.forEach((node, idx) => {
      const angle = (idx / nodesToArrange.length) * 2 * Math.PI;
      node.data.x = centerX + radius * Math.cos(angle) - node.data.width / 2;
      node.data.y = centerY + radius * Math.sin(angle) - node.data.height / 2;
    });
  }

  // Update layout and database
  for (const node of nodesToArrange) {
    node.el.style.left = node.data.x + 'px';
    node.el.style.top = node.data.y + 'px';
    await saveNode(node.data);
  }

  // Clean transitions and redraw connections after animation finishes
  setTimeout(() => {
    nodesToArrange.forEach(node => {
      node.el.style.transition = '';
    });
    drawConnections();
    updateMinimap();
  }, 500);

  // Animate lines drawing while transitioning
  const startTime = performance.now();
  function animateConnections(now) {
    drawConnections();
    if (now - startTime < 550) {
      requestAnimationFrame(animateConnections);
    }
  }
  requestAnimationFrame(animateConnections);

  showToast(`Rearranged nodes in ${layout} layout.`, 'success');
}

// ─── Toolbar ────────────────────────────────────────────────────────────────

let globalCanvasTooltip = null;

function showInstantTooltip(targetEl, text) {
  if (!globalCanvasTooltip) {
    globalCanvasTooltip = document.createElement('div');
    globalCanvasTooltip.className = 'canvas-instant-tooltip';
    document.body.appendChild(globalCanvasTooltip);
  }
  globalCanvasTooltip.textContent = text;
  globalCanvasTooltip.style.display = 'block';

  const rect = targetEl.getBoundingClientRect();
  const tooltipRect = globalCanvasTooltip.getBoundingClientRect();

  // Position it horizontally centered under the button
  const left = rect.left + (rect.width - tooltipRect.width) / 2;
  const top = rect.bottom + 6;

  globalCanvasTooltip.style.left = `${Math.max(8, left)}px`;
  globalCanvasTooltip.style.top = `${top}px`;
}

function hideInstantTooltip() {
  if (globalCanvasTooltip) {
    globalCanvasTooltip.style.display = 'none';
  }
}

function addInstantTooltip(btn, text) {
  btn.dataset.tooltip = text;
  btn.setAttribute('aria-label', text);
  btn.addEventListener('mouseenter', () => showInstantTooltip(btn, text));
  btn.addEventListener('mouseleave', () => hideInstantTooltip());
  btn.addEventListener('click', () => hideInstantTooltip());
}

function buildToolbar(tab) {
  const toolbar = document.createElement('div');
  toolbar.className = `canvas-toolbar style-${canvasState.styleId || 'story'}`;

  // Left: tab name + rename
  const left = document.createElement('div');
  left.className = 'canvas-toolbar-left';
  const nameSpan = document.createElement('span');
  nameSpan.className = 'canvas-tab-name';
  nameSpan.textContent = tab.name;
  const renameBtn = document.createElement('button');
  renameBtn.className = 'canvas-toolbar-btn icon-btn';
  addInstantTooltip(renameBtn, 'Rename tab');
  renameBtn.textContent = '✏️';
  renameBtn.addEventListener('click', () => promptRenameTab());
  left.appendChild(nameSpan);
  left.appendChild(renameBtn);

  // Center: node type picker (icon-only)
  const center = document.createElement('div');
  center.className = 'canvas-toolbar-center';
  const activeTypes = getActiveNodeTypes(canvasState.styleId || 'story');
  for (const nt of activeTypes) {
    if (nt.hideFromToolbar) continue;
    const btn = document.createElement('button');
    btn.className = 'canvas-add-node-btn';
    addInstantTooltip(btn, `Add ${nt.label}`);
    btn.dataset.type = nt.type;
    btn.innerHTML = `<span>${nt.icon}</span>`;
    btn.style.setProperty('--node-color', nt.color);
    btn.addEventListener('click', () => spawnNode(nt.type));
    center.appendChild(btn);
  }

  // Right: controls (grouped by function with dividers)
  const right = document.createElement('div');
  right.className = 'canvas-toolbar-right';

  // Group 1 (Action & Link): Snap, Link, AI Generate
  const group1 = document.createElement('div');
  group1.className = 'canvas-toolbar-group';

  // Snap to grid
  const snapBtn = document.createElement('button');
  snapBtn.className = 'canvas-toolbar-btn';
  snapBtn.id = 'canvas-snap-btn';
  snapBtn.textContent = '⊞';
  addInstantTooltip(snapBtn, 'Toggle snap to grid');
  if (canvasState.snapToGrid) {
    snapBtn.classList.add('active');
  }
  snapBtn.addEventListener('click', () => {
    canvasState.snapToGrid = !canvasState.snapToGrid;
    snapBtn.classList.toggle('active', canvasState.snapToGrid);
  });
  group1.appendChild(snapBtn);

  // Link Nodes button
  const linkNodesBtn = document.createElement('button');
  linkNodesBtn.className = 'canvas-toolbar-btn';
  linkNodesBtn.id = 'canvas-link-nodes-btn';
  linkNodesBtn.textContent = '🔗';
  addInstantTooltip(linkNodesBtn, 'Draw connection line between two nodes (Link)');
  linkNodesBtn.addEventListener('click', () => toggleConnectionMode());
  group1.appendChild(linkNodesBtn);

  // AI Generate button
  const aiGenerateBtn = document.createElement('button');
  aiGenerateBtn.className = 'canvas-toolbar-btn';
  aiGenerateBtn.id = 'canvas-ai-generate-btn';
  aiGenerateBtn.textContent = '🪄';
  addInstantTooltip(aiGenerateBtn, 'AI Concept Spawner (generate ideas & layout)');
  aiGenerateBtn.addEventListener('click', () => promptAiCanvasGeneration());
  group1.appendChild(aiGenerateBtn);

  right.appendChild(group1);

  // Group 2 (Layout): Outline, helper panel toggle
  const group2 = document.createElement('div');
  group2.className = 'canvas-toolbar-group';

  // Story-specific: Manuscript Outline sidebar toggle
  if ((canvasState.styleId || 'story') === 'story') {
    const outlineBtn = document.createElement('button');
    outlineBtn.className = 'canvas-toolbar-btn';
    outlineBtn.id = 'canvas-outline-btn';
    outlineBtn.innerHTML = '📖';
    addInstantTooltip(outlineBtn, 'Toggle Manuscript Outline Navigator');
    outlineBtn.addEventListener('click', () => toggleManuscriptOutline());
    group2.appendChild(outlineBtn);
  }

  // Style-specific helper panel toggle button
  const cfg = getStyleConfig(canvasState.styleId || 'story');
  if (cfg.canvasPanel) {
    const helperBtn = document.createElement('button');
    helperBtn.className = 'canvas-toolbar-btn';
    helperBtn.id = cfg.canvasPanel.buttonId;
    helperBtn.innerHTML = cfg.canvasPanel.buttonLabel.split(' ')[0]; // Extract emoji
    addInstantTooltip(helperBtn, cfg.canvasPanel.buttonTitle);
    helperBtn.addEventListener('click', () => {
      const fn = cfg.canvasPanel.toggleFn;
      if (fn === 'toggleDiceTray') toggleDiceTray();
      else if (fn === 'toggleMathSolver') toggleMathSolver();
      else if (fn === 'togglePacingTracker') togglePacingTracker();
    });
    group2.appendChild(helperBtn);
  }

  // Append Group 2 conditionally with a divider
  if (group2.children.length > 0) {
    const divider1 = document.createElement('div');
    divider1.className = 'canvas-toolbar-divider';
    right.appendChild(divider1);
    right.appendChild(group2);
  }

  // Group 3 (Zoom & View): Zoom Out, Zoom Reset, Zoom In, Map
  const divider2 = document.createElement('div');
  divider2.className = 'canvas-toolbar-divider';
  right.appendChild(divider2);

  const group3 = document.createElement('div');
  group3.className = 'canvas-toolbar-group';

  // Zoom Out
  const zoomOut = document.createElement('button');
  zoomOut.className = 'canvas-toolbar-btn';
  zoomOut.textContent = '−';
  addInstantTooltip(zoomOut, 'Zoom out');
  zoomOut.addEventListener('click', () => adjustZoom(-0.1));
  group3.appendChild(zoomOut);

  // Zoom Reset
  const zoomReset = document.createElement('button');
  zoomReset.className = 'canvas-toolbar-btn canvas-zoom-label';
  zoomReset.id = 'canvas-zoom-label';
  zoomReset.textContent = '100%';
  addInstantTooltip(zoomReset, 'Reset zoom');
  zoomReset.addEventListener('click', () => { canvasState.zoom = 1; applySurfaceTransform(); });
  group3.appendChild(zoomReset);

  // Zoom In
  const zoomIn = document.createElement('button');
  zoomIn.className = 'canvas-toolbar-btn';
  zoomIn.textContent = '+';
  addInstantTooltip(zoomIn, 'Zoom in');
  zoomIn.addEventListener('click', () => adjustZoom(0.1));
  group3.appendChild(zoomIn);

  // Mini-map toggle
  const mmBtn = document.createElement('button');
  mmBtn.className = 'canvas-toolbar-btn active';
  mmBtn.id = 'canvas-mm-btn';
  mmBtn.textContent = '🗺️';
  addInstantTooltip(mmBtn, 'Toggle minimap');
  mmBtn.addEventListener('click', () => {
    const mm = canvasState.minimap;
    const hidden = mm.style.display === 'none';
    mm.style.display = hidden ? 'block' : 'none';
    mmBtn.classList.toggle('active', hidden);
  });
  group3.appendChild(mmBtn);

  right.appendChild(group3);

  // Group 4 (File & Convert): Export, Convert to Beat
  const divider3 = document.createElement('div');
  divider3.className = 'canvas-toolbar-divider';
  right.appendChild(divider3);

  const group4 = document.createElement('div');
  group4.className = 'canvas-toolbar-group';

  // Export Canvas button
  const exportBtn = document.createElement('button');
  exportBtn.className = 'canvas-toolbar-btn';
  exportBtn.id = 'canvas-export-btn';
  exportBtn.textContent = '📥';
  addInstantTooltip(exportBtn, 'Export canvas board as SVG vector image');
  exportBtn.addEventListener('click', () => exportCanvasToSvg());
  group4.appendChild(exportBtn);

  // Convert to Story Beat button
  const toBeatBtn = document.createElement('button');
  toBeatBtn.className = 'canvas-toolbar-btn';
  toBeatBtn.id = 'canvas-to-beat-btn';
  const beatCfg = getStyleConfig(canvasState.styleId || 'story');
  toBeatBtn.textContent = (beatCfg.beatBtnLabel || '🗺️ → Beat').split(' ')[0];
  addInstantTooltip(toBeatBtn, beatCfg.beatBtnTitle || 'Convert this canvas into a Story Roadmap beat');
  toBeatBtn.addEventListener('click', () => convertCanvasToBeat());
  group4.appendChild(toBeatBtn);

  right.appendChild(group4);

  toolbar.appendChild(left);
  toolbar.appendChild(center);
  toolbar.appendChild(right);
  return toolbar;
}

// ─── Convert canvas → Story Beat ─────────────────────────────────────────────
async function convertCanvasToBeat() {
  const tab = canvasState.tab;

  // If already linked to a beat, just navigate to roadmap
  if (tab.beatId) {
    showToast('This canvas is already a story beat — opening Roadmap…', 'info');
    setTimeout(() => navigate('story-timeline'), 800);
    return;
  }

  showModal({
    title: '🗺️ Convert to Story Beat',
    fields: [
      { key: 'title', label: 'Beat Title',  value: tab.name,  placeholder: 'Beat name' },
      { key: 'lane',  label: 'Lane (0=Main, 1=Subplots, 2=World Events)', value: '0', placeholder: '0' },
      { key: 'act',   label: 'Act X position (0=Act I, 700=Act II, 1400=Act III, 2100=Epilogue)', value: '80', placeholder: '80' },
    ],
    onConfirm: async (values) => {
      const title = (values.title || tab.name).trim();
      const lane  = Math.max(0, Math.min(2, parseInt(values.lane, 10) || 0));
      const x     = parseInt(values.act, 10) || 80;

      const project = await getActiveProject();
      if (!project) {
        showToast('No active project found. Please open a project first.', 'error');
        return;
      }

      const beat = await savePage({
        projectId: project.id,
        title,
        isStoryBeat: true,
        properties: {
          lane,
          x,
          prerequisites: [],
          characters:    [],
          canvasTabId:   tab.id,
        },
        content: '',
        icon:  'map',
      });

      // Tag the tab so we know it's linked
      tab.beatId = beat.id;
      await saveTab(tab);

      showToast(`Beat "${title}" added to the Roadmap ✓`, 'success');
      setTimeout(() => navigate('story-timeline'), 1200);
    },
  });
}

async function promptRenameTab() {
  const current = canvasState.tab.name;
  showModal({
    title: 'Rename Tab',
    fields: [{ key: 'name', label: 'Tab name', value: current, placeholder: 'e.g. Kairo, Act 2...' }],
    onConfirm: async (values) => {
      const name = values.name.trim();
      if (!name) return;
      canvasState.tab.name = name;
      await saveTab(canvasState.tab);
      const nameEl = document.querySelector('.canvas-tab-name');
      if (nameEl) nameEl.textContent = name;
      if (window.setTabTitle) {
        window.setTabTitle(name);
      }
      window.dispatchEvent(new CustomEvent('forge-tab-renamed', { detail: { id: canvasState.tabId, name } }));
    },
  });
}

// ─── Pan & Zoom ─────────────────────────────────────────────────────────────

function applySurfaceTransform() {
  const { surface, pan, zoom } = canvasState;
  if (!surface) return;

  // Enable hardware acceleration/compositing during transform
  surface.classList.add('canvas-transforming');

  surface.style.transform = `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`;
  
  // Calculate text scale compensation so text remains readable when zoomed out
  const compensation = 1 + Math.max(0, 1 - zoom) * 0.75;
  surface.style.setProperty('--text-scale-compensate', compensation);

  const label = document.getElementById('canvas-zoom-label');
  if (label) label.textContent = Math.round(zoom * 100) + '%';
  scheduleMinimapUpdate();

  // Debounce to remove transforming class and force crisp re-rasterization
  clearTimeout(canvasState._transformEndTimer);
  canvasState._transformEndTimer = setTimeout(() => {
    surface.classList.remove('canvas-transforming');
  }, 150);

  // Persist pan/zoom to tab
  clearTimeout(canvasState._panSaveTimer);
  canvasState._panSaveTimer = setTimeout(async () => {
    if (canvasState.tab) {
      canvasState.tab.pan = canvasState.pan;
      canvasState.tab.zoom = canvasState.zoom;
      await saveTab(canvasState.tab);
    }
  }, 800);
}

function adjustZoom(delta) {
  canvasState.zoom = Math.min(3, Math.max(0.2, canvasState.zoom + delta));
  applySurfaceTransform();
}

function setupCanvasPan(viewport, surface) {
  let isPanning = false;
  let startX = 0, startY = 0;
  let startPanX = 0, startPanY = 0;

  const onMouseMove = (e) => {
    if (!isPanning) return;
    canvasState.pan.x = startPanX + (e.clientX - startX);
    canvasState.pan.y = startPanY + (e.clientY - startY);
    applySurfaceTransform();
  };

  const onMouseUp = () => {
    if (isPanning) {
      isPanning = false;
      viewport.style.cursor = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
  };

  const isInteractive = (target) => {
    if (!target) return false;
    return target.tagName === 'INPUT' ||
           target.tagName === 'TEXTAREA' ||
           target.tagName === 'SELECT' ||
           target.closest('.ql-editor') ||
           target.closest('.ql-toolbar') ||
           target.getAttribute('contenteditable') === 'true' ||
           target.closest('[contenteditable="true"]');
  };

  viewport.addEventListener('mousedown', (e) => {
    if (isInteractive(e.target)) return;
    // Middle-click or space+left-click
    if (e.button === 1 || (e.button === 0 && e.target === viewport) || (e.button === 0 && e.target === surface)) {
      isPanning = true;
      startX = e.clientX;
      startY = e.clientY;
      startPanX = canvasState.pan.x;
      startPanY = canvasState.pan.y;
      viewport.style.cursor = 'grabbing';
      e.preventDefault();

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
  });
}

function setupCanvasZoom(viewport) {
  viewport.addEventListener('wheel', (e) => {
    // If hovering over a canvas card/node, allow normal wheel scrolling of its content
    // UNLESS the user holds Ctrl or Meta (pinch-to-zoom or ctrl-scroll zoom)
    if (e.target.closest('.canvas-node') && !e.ctrlKey && !e.metaKey) {
      return;
    }
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    adjustZoom(delta);
  }, { passive: false });
}

function setupDragAndDrop(viewport) {
  // Convert drop event client coords to canvas coords
  function dropToCanvasCoords(e) {
    const rect = viewport.getBoundingClientRect();
    const dropX = (e.clientX - rect.left - canvasState.pan.x) / canvasState.zoom;
    const dropY = (e.clientY - rect.top - canvasState.pan.y) / canvasState.zoom;
    return snapPos(dropX - 170, dropY - 110);
  }

  // Extract pagelink payload from any dataTransfer
  function extractDragPayload(e) {
    const types = ['forge/pagelink', 'application/json', 'text/plain'];
    for (const t of types) {
      try {
        const d = e.dataTransfer.getData(t);
        if (d) return d;
      } catch (_) {}
    }
    return null;
  }

  // Create a pagelink node at the given canvas coords
  async function handlePagelinkDrop(e, coords) {
    const dataStr = extractDragPayload(e);
    if (!dataStr) return;
    let dragData;
    try { dragData = JSON.parse(dataStr); } catch (_) { return; }
    if (dragData.type !== 'pagelink') return;

    let page = null;
    try {
      page = await getPage(dragData.pageId);
    } catch (err) {
      console.warn('Could not load dropped page:', err);
    }

    let type = 'pagelink';
    let content = { pageId: dragData.pageId };
    let width = 340;
    let height = 220;
    let isMap = false;
    if (page) {
      const mapIds = ['dnd-maps-schema', 'story-maps-schema', 'story-locs-schema', 'locations'];
      if (mapIds.includes(page.schemaId)) {
        isMap = true;
      } else if (page.schemaId) {
        const schema = await getSchema(page.schemaId);
        if (schema && mapIds.includes(schema.templateId)) {
          isMap = true;
        }
      }
    }
    if (isMap) {
      type = 'map';
      width = 500;
      height = 400;
    }
    const styleId = canvasState.styleId || 'story';

    const nodeData = {
      id: generateId(),
      tabId: canvasState.tabId,
      type,
      title: dragData.title || 'Database Page',
      content,
      x: coords.x,
      y: coords.y,
      width,
      height,
      zIndex: ++canvasState.maxZ,
      _isNew: true,
    };

    await saveNode(nodeData);
    await flushFileAutosave();
    playClickSound();
    mountNode(nodeData);
    updateMinimap();
    showToast(`Added "${nodeData.title}" to canvas`, 'success');
    if (canvasState.tab && canvasState.tab.beatId) {
      const detailsNode = canvasState.nodes.find(n => n.data.isBeatDetails) || canvasState.nodes.find(n => n.data.type === 'richtext');
      if (detailsNode) {
        if (!canvasState.tab.connections) canvasState.tab.connections = [];
        canvasState.tab.connections.push({
          id: generateId(),
          sourceId: detailsNode.data.id,
          targetId: nodeData.id
        });
        await saveTab(canvasState.tab);
        await flushFileAutosave();
        drawConnections();
      }
      await syncBeatWithCanvas();
    }
  }

  // Visual drop-zone indicator shown when a draggable hovers over the canvas
  let dropIndicator = null;
  function showDropIndicator() {
    if (dropIndicator) return;
    dropIndicator = document.createElement('div');
    dropIndicator.style.cssText = [
      'position:absolute', 'inset:0', 'z-index:99999', 'pointer-events:none',
      'border:2px dashed rgba(229,169,59,0.6)',
      'background:rgba(229,169,59,0.04)',
      'border-radius:4px',
      'transition:opacity 0.15s ease'
    ].join(';');
    viewport.appendChild(dropIndicator);
  }
  function hideDropIndicator() {
    if (dropIndicator) { dropIndicator.remove(); dropIndicator = null; }
  }

  let isDragOverCanvas = false;

  viewport.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    isDragOverCanvas = true;
    showDropIndicator();
  });

  viewport.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    isDragOverCanvas = true;
  });

  viewport.addEventListener('dragleave', (e) => {
    if (!viewport.contains(e.relatedTarget)) {
      isDragOverCanvas = false;
      hideDropIndicator();
    }
  });

  viewport.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDragOverCanvas = false;
    hideDropIndicator();
    try {
      const coords = dropToCanvasCoords(e);
      await handlePagelinkDrop(e, coords);
    } catch (err) {
      console.error('Drop handling failed:', err);
    }
  });

  // Window-level fallback: catches drops on child elements that stop propagation
  const onWindowDrop = async (e) => {
    if (!canvasState.surface) return;
    if (e.defaultPrevented) return;
    const rect = viewport.getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right &&
                   e.clientY >= rect.top  && e.clientY <= rect.bottom;
    if (!inside) return;
    e.preventDefault();
    isDragOverCanvas = false;
    hideDropIndicator();
    try {
      const coords = dropToCanvasCoords(e);
      await handlePagelinkDrop(e, coords);
    } catch (err) {
      console.error('Window drop fallback failed:', err);
    }
  };
  const onWindowDragover = (e) => {
    if (isDragOverCanvas) e.preventDefault();
  };

  window.addEventListener('drop', onWindowDrop);
  window.addEventListener('dragover', onWindowDragover);

  // Store cleanup refs for renderWorkspace cleanup
  viewport._dndCleanup = () => {
    window.removeEventListener('drop', onWindowDrop);
    window.removeEventListener('dragover', onWindowDragover);
  };
}

async function exportCanvasToSvg() {
  const nodes = canvasState.nodes;
  if (nodes.length === 0) {
    showToast('No nodes to export.', 'warning');
    return;
  }

  showToast('Generating vector SVG export...', 'info');

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const { data } of nodes) {
    if (data.x < minX) minX = data.x;
    if (data.y < minY) minY = data.y;
    if (data.x + data.width > maxX) maxX = data.x + data.width;
    if (data.y + data.height > maxY) maxY = data.y + data.height;
  }

  const padding = 50;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  const width = maxX - minX;
  const height = maxY - minY;

  // Background color setup
  const baseColor = getComputedStyle(document.body).getPropertyValue('--bg-base') || '#0a0812';

  let svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">`;

  // Get active CSS rules
  let cssStyles = '';
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (!rule.cssText.includes('@import') && !rule.cssText.includes('@font-face')) {
          cssStyles += rule.cssText + '\n';
        }
      }
    } catch (e) {
      // Ignored for cross-origin stylesheets
    }
  }

  svgStr += `<style>
    /* Base style resets for export */
    .canvas-node { position: absolute; box-sizing: border-box; }
    .canvas-node-body { box-sizing: border-box; }
    input, textarea, select { box-sizing: border-box; }
    ${cssStyles}
  </style>`;

  // 0. Render Solid Background
  svgStr += `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${baseColor}" />`;

  // 1. Render Connections Layer
  if (canvasState.connectionsSvg) {
    const connSvgClone = canvasState.connectionsSvg.cloneNode(true);
    connSvgClone.removeAttribute('style');
    // Ensure defs and styles copy
    svgStr += connSvgClone.outerHTML;
  }

  // 2. Render Cards Layer via foreignObject
  const serializer = new XMLSerializer();
  for (const { data, el } of nodes) {
    const elClone = el.cloneNode(true);
    
    // Clean up absolute layout styles of wrapper for foreignObject positioning
    elClone.style.position = 'relative';
    elClone.style.left = '0px';
    elClone.style.top = '0px';
    elClone.style.width = '100%';
    elClone.style.height = '100%';
    elClone.style.margin = '0px';

    // Remove interactive menus
    elClone.querySelector('.canvas-node-color-menu')?.remove();

    // Map dynamic input/textarea/select values to HTML attributes
    const origInputs = el.querySelectorAll('input, textarea, select');
    const cloneInputs = elClone.querySelectorAll('input, textarea, select');
    
    cloneInputs.forEach((input, idx) => {
      const orig = origInputs[idx];
      if (!orig) return;
      if (input.tagName === 'TEXTAREA') {
        input.textContent = orig.value;
      } else if (input.tagName === 'SELECT') {
        Array.from(input.options).forEach(opt => {
          if (opt.value === orig.value) opt.setAttribute('selected', 'selected');
        });
      } else {
        input.setAttribute('value', orig.value);
      }
    });

    const xhtmlStr = serializer.serializeToString(elClone);

    svgStr += `<foreignObject x="${data.x}" y="${data.y}" width="${data.width}" height="${data.height}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; margin:0; padding:0; overflow:hidden; border-radius:12px;">
        ${xhtmlStr}
      </div>
    </foreignObject>`;
  }

  svgStr += `</svg>`;

  try {
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${canvasState.tab?.name || 'canvas'}-roadmap.svg`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Canvas exported successfully as SVG!', 'success');
    playClickSound();
  } catch (e) {
    console.error('Canvas export failed:', e);
    showToast('Export failed: SVG generation error.', 'error');
  }
}

// ─── Mini-map ───────────────────────────────────────────────────────────────

function buildMinimap() {
  const mm = document.createElement('canvas');
  mm.className = 'canvas-minimap';
  mm.width = 180;
  mm.height = 120;
  mm.title = 'Click to navigate';
  mm.addEventListener('click', (e) => {
    const rect = mm.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    // Jump pan to center on clicked spot
    const CANVAS_VIRTUAL = 4000;
    canvasState.pan.x = -(mx * CANVAS_VIRTUAL - canvasState.viewport.clientWidth / 2);
    canvasState.pan.y = -(my * CANVAS_VIRTUAL - canvasState.viewport.clientHeight / 2);
    applySurfaceTransform();
  });
  return mm;
}

function updateMinimap() {
  const mm = canvasState.minimap;
  if (!mm) return;
  const ctx = mm.getContext('2d');
  const W = mm.width;
  const H = mm.height;
  const VIRTUAL = 4000;
  const scaleX = W / VIRTUAL;
  const scaleY = H / VIRTUAL;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(10,8,18,0.92)';
  ctx.fillRect(0, 0, W, H);

  // Grid dots
  ctx.fillStyle = 'rgba(229,169,59,0.06)';
  for (let x = 0; x < W; x += 12) {
    for (let y = 0; y < H; y += 8) {
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Draw nodes
  for (const { data } of canvasState.nodes) {
    const nt = getNodeTypeConfig(data.type);
    const color = nt ? nt.color : '#888';
    ctx.fillStyle = color + '55';
    ctx.strokeStyle = color + 'aa';
    ctx.lineWidth = 0.5;
    const nx = (data.x + VIRTUAL / 2) * scaleX;
    const ny = (data.y + VIRTUAL / 2) * scaleY;
    const nw = data.width * scaleX;
    const nh = data.height * scaleY;
    ctx.fillRect(nx, ny, nw, nh);
    ctx.strokeRect(nx, ny, nw, nh);
  }

  // Draw viewport rect
  const vw = canvasState.viewport ? canvasState.viewport.clientWidth : 800;
  const vh = canvasState.viewport ? canvasState.viewport.clientHeight : 600;
  const vpX = (-canvasState.pan.x / canvasState.zoom + VIRTUAL / 2) * scaleX;
  const vpY = (-canvasState.pan.y / canvasState.zoom + VIRTUAL / 2) * scaleY;
  const vpW = (vw / canvasState.zoom) * scaleX;
  const vpH = (vh / canvasState.zoom) * scaleY;
  ctx.strokeStyle = 'rgba(229,169,59,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(vpX, vpY, vpW, vpH);
}

// ─── Node Spawning ──────────────────────────────────────────────────────────

async function spawnNode(type) {
  const nt = getNodeTypeConfig(type);
  const vpW = canvasState.viewport.clientWidth;
  const vpH = canvasState.viewport.clientHeight;
  // Center in current view
  const cx = (-canvasState.pan.x + vpW / 2) / canvasState.zoom - nt.defaultW / 2;
  const cy = (-canvasState.pan.y + vpH / 2) / canvasState.zoom - nt.defaultH / 2;

  const snapped = snapPos(cx, cy);

  const nodeData = {
    id: generateId(),
    tabId: canvasState.tabId,
    type,
    title: nt.label,
    content: getDefaultContent(type),
    x: snapped.x,
    y: snapped.y,
    width: nt.defaultW,
    height: nt.defaultH,
    zIndex: ++canvasState.maxZ,
    _isNew: true,
  };
  await saveNode(nodeData);
  playClickSound();
  mountNode(nodeData);
  updateMinimap();
  if (canvasState.tab && canvasState.tab.beatId) {
    await syncBeatWithCanvas();
  }
}

function snapPos(x, y) {
  if (!canvasState.snapToGrid) return { x, y };
  return {
    x: Math.round(x / SNAP_GRID) * SNAP_GRID,
    y: Math.round(y / SNAP_GRID) * SNAP_GRID,
  };
}

function getDefaultContent(type) {
  switch (type) {
    case 'statblock': return { fields: [{ key: 'Name', value: '' }, { key: 'Age', value: '' }, { key: 'Faction', value: '' }, { key: 'Status', value: '' }] };
    case 'ability': return { name: '', input: '', abilityType: 'Melee', description: '', notes: '' };
    case 'timeline': return { era: '', title: '', description: '' };
    case 'link': return { targetTabId: '', label: '', note: '' };
    case 'moodboard': return { images: [] };
    case 'quote': return { speaker: '', text: '' };
    case 'richtext': return { delta: '' };
    case 'image': return { src: null, caption: '' };
    case 'pagelink': return { pageId: '', title: '', schemaName: '', snippet: '' };
    default: return {};
  }
}

// ─── Node Mounting ──────────────────────────────────────────────────────────

function mountNode(nodeData) {
  const nt = getNodeTypeConfig(nodeData.type);
  if (!nt) return;

  // Normalize width/height and w/h shorthand
  if (nodeData.w && !nodeData.width) nodeData.width = nodeData.w;
  if (nodeData.h && !nodeData.height) nodeData.height = nodeData.h;
  if (!nodeData.width) nodeData.width = nt.defaultW || 300;
  if (!nodeData.height) nodeData.height = nt.defaultH || 200;

  const el = document.createElement('div');
  el.className = 'canvas-node';
  el.dataset.nodeId = nodeData.id;
  el.dataset.nodeType = nodeData.type;
  el.style.left = nodeData.x + 'px';
  el.style.top = nodeData.y + 'px';
  el.style.width = nodeData.width + 'px';
  el.style.height = nodeData.height + 'px';
  el.style.zIndex = nodeData.zIndex || 1;
  const accentColor = nodeData.color || nt.color || '';
  el.style.setProperty('--node-accent', accentColor);
  el.style.setProperty('--node-accent-glow', accentColor ? `${accentColor}15` : 'rgba(255,255,255,0.02)');
  el.style.setProperty('--node-accent-border', accentColor ? `${accentColor}44` : 'rgba(255,255,255,0.06)');

  // Header
  const header = document.createElement('div');
  header.className = 'canvas-node-header';
  header.innerHTML = `
    <span class="canvas-node-icon">${nt.icon}</span>
    <span class="canvas-node-title" contenteditable="true" spellcheck="false">${escHtml(nodeData.title)}</span>
    ${(canvasState.styleId === 'story' && (nodeData.type === 'richtext' || nodeData.type === 'pagelink')) ? `
      <span class="canvas-node-progress-container" id="progress-ring-${nodeData.id}"></span>
      <button class="canvas-node-goal-btn" title="Set word count target">🎯</button>
      <button class="canvas-node-zen-btn" title="Enter Zen Focus Mode">🧘</button>
      <button class="canvas-node-lore-btn" title="Link characters or locations">🏷️</button>
    ` : ''}
    <button class="canvas-node-color-btn" title="Change color">🎨</button>
    <button class="canvas-node-delete" title="Delete node">✕</button>
  `;

  // Body
  const body = document.createElement('div');
  body.className = 'canvas-node-body';

  // Resize handle
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'canvas-resize-handle';

  el.appendChild(header);
  el.appendChild(body);
  el.appendChild(resizeHandle);

  canvasState.surface.appendChild(el);
  // Spawn animation for newly created nodes (not for initial page load)
  if (nodeData._isNew) {
    el.classList.add('canvas-node-new');
    setTimeout(() => el.classList.remove('canvas-node-new'), 400);
    delete nodeData._isNew;
  }

  const entry = { data: nodeData, el };
  canvasState.nodes.push(entry);

  // Render body AFTER push to canvasState.nodes and append to surface
  renderNodeBody(body, nodeData);

  // Bring to front on click
  el.addEventListener('mousedown', () => bringToFront(entry));

  // Double-click header to navigate to full page view
  header.addEventListener('dblclick', (e) => {
    if (e.target.classList.contains('canvas-node-title')) return;
    if (nodeData.content && nodeData.content.pageId) {
      e.stopPropagation();
      navigate(`page/${nodeData.content.pageId}`);
    }
  });

  // Drag
  setupNodeDrag(el, entry);

  // Resize
  setupNodeResize(resizeHandle, el, entry);

  // Title edit
  const titleEl = header.querySelector('.canvas-node-title');
  titleEl.addEventListener('input', () => {
    scheduleNodeSave(entry, async () => {
      const newTitle = titleEl.textContent;
      entry.data.title = newTitle;
      
      const pageId = entry.data.content?.pageId;
      if (pageId) {
        try {
          const pg = await getPage(pageId);
          if (pg && pg.title !== newTitle) {
            pg.title = newTitle;
            await savePage(pg);
          }
        } catch (err) {
          console.warn('Failed to sync node title change to backing page:', err);
        }
      }
    });
  });
  titleEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } });

  // Color Palette Click Listener
  const colorBtn = header.querySelector('.canvas-node-color-btn');
  colorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    let menu = el.querySelector('.canvas-node-color-menu');
    if (menu) {
      menu.remove();
      return;
    }
    
    // Close other menus
    document.querySelectorAll('.canvas-node-color-menu').forEach(m => m.remove());
    
    menu = document.createElement('div');
    menu.className = 'canvas-node-color-menu';
    menu.style.cssText = 'position: absolute; top: 32px; right: 28px; background: var(--bg-elevated); border: 1px solid var(--border-default); border-radius: 8px; padding: 6px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; z-index: 1000; box-shadow: var(--shadow-lg);';
    
    for (const c of CARD_COLORS) {
      const dot = document.createElement('button');
      dot.className = 'canvas-color-dot';
      dot.title = c.name;
      dot.style.cssText = `width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--border-subtle); cursor: pointer; background: ${c.hex || nt.color};`;
      dot.addEventListener('click', async (evt) => {
        evt.stopPropagation();
        nodeData.color = c.hex;
        const colorVal = c.hex || nt.color || '';
        el.style.setProperty('--node-accent', colorVal);
        el.style.setProperty('--node-accent-glow', colorVal ? `${colorVal}20` : 'rgba(255,255,255,0.02)');
        el.style.setProperty('--node-accent-border', colorVal ? `${colorVal}44` : 'rgba(255,255,255,0.06)');
        await saveNode(nodeData);
        playClickSound();
        menu.remove();
        drawConnections();
      });
      menu.appendChild(dot);
    }
    
    el.appendChild(menu);
    
    const closeMenu = (evt) => {
      if (!menu.contains(evt.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 10);
  });

  // Delete
  header.querySelector('.canvas-node-delete').addEventListener('click', async () => {
    if (!confirm(`Delete "${nodeData.title}"?`)) return;
    if (canvasState.saveTimers[nodeData.id]) {
      clearTimeout(canvasState.saveTimers[nodeData.id]);
      delete canvasState.saveTimers[nodeData.id];
    }
    await deleteNode(nodeData.id);
    playClickSound();
    el.remove();
    canvasState.nodes = canvasState.nodes.filter(n => n.data.id !== nodeData.id);
    // Remove connections involving this node
    if (canvasState.tab.connections) {
      canvasState.tab.connections = canvasState.tab.connections.filter(c => c.sourceId !== nodeData.id && c.targetId !== nodeData.id);
      await saveTab(canvasState.tab);
    }
    if (canvasState.tab && canvasState.tab.beatId) {
      await syncBeatWithCanvas();
    }
    await flushFileAutosave();
    updateMinimap();
    drawConnections();
  });

  // Connection Mode click listener
  el.addEventListener('click', async (e) => {
    if (canvasState.linkingMode) {
      e.stopPropagation();
      const nodeId = nodeData.id;
      if (!canvasState.linkingSourceId) {
        canvasState.linkingSourceId = nodeId;
        playClickSound();
        showToast('Click target node to connect...', 'info');
        el.style.outline = '3px solid var(--accent-primary)';
      } else {
        if (canvasState.linkingSourceId === nodeId) {
          showToast('Cannot link a node to itself.', 'warning');
          return;
        }
        if (!canvasState.tab.connections) canvasState.tab.connections = [];
        
        const exists = canvasState.tab.connections.some(c => 
          (c.sourceId === canvasState.linkingSourceId && c.targetId === nodeId) ||
          (c.sourceId === nodeId && c.targetId === canvasState.linkingSourceId)
        );
        if (exists) {
          showToast('Nodes are already connected.', 'warning');
          const prevSourceEl = document.querySelector(`[data-node-id="${canvasState.linkingSourceId}"]`);
          if (prevSourceEl) prevSourceEl.style.outline = '';
          toggleConnectionMode();
          return;
        }

        canvasState.tab.connections.push({
          id: generateId(),
          sourceId: canvasState.linkingSourceId,
          targetId: nodeId
        });
        
        await saveTab(canvasState.tab);
        await flushFileAutosave();
        drawConnections();
        playZapSound();
        showToast('Nodes linked successfully!', 'success');
        if (canvasState.tab && canvasState.tab.beatId) {
          await syncBeatWithCanvas();
        }
        
        const prevSourceEl = document.querySelector(`[data-node-id="${canvasState.linkingSourceId}"]`);
        if (prevSourceEl) prevSourceEl.style.outline = '';
        
        toggleConnectionMode();
      }
    }
  });

  // ─── Story Writer: Per-node interactive features ──────────────
  if (canvasState.styleId === 'story' && (nodeData.type === 'richtext' || nodeData.type === 'pagelink')) {
    // Normalize content: if it's a plain string (legacy beat data), wrap it
    if (nodeData.type === 'richtext') {
      if (!nodeData.content) {
        nodeData.content = { delta: '' };
      } else if (typeof nodeData.content === 'string') {
        nodeData.content = { delta: nodeData.content };
      }
    } else {
      if (!nodeData.content) nodeData.content = {};
    }
    // Initialize lore associations array if missing
    if (!nodeData.content.loreAssociations) nodeData.content.loreAssociations = [];

    // Render lore chips footer
    renderLoreChipsFooter(el, entry);

    // Word Goal ring initial render
    renderWordGoalRing(nodeData);

    // Goal button
    const goalBtn = header.querySelector('.canvas-node-goal-btn');
    if (goalBtn) {
      goalBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openWordGoalPopup(el, entry);
      });
    }

    // Zen mode button
    const zenBtn = header.querySelector('.canvas-node-zen-btn');
    if (zenBtn) {
      zenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        enterZenFocusMode(entry);
      });
    }

    // Lore link button
    const loreBtn = header.querySelector('.canvas-node-lore-btn');
    if (loreBtn) {
      loreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openLoreLinkPopup(el, entry);
      });
    }

    // Update outline sidebar live when node is dragged
    // Use AbortController so the listener is removed when this node is taken out of the DOM
    const outlineAbort = new AbortController();
    window.addEventListener('mouseup', () => refreshManuscriptOutline(), { signal: outlineAbort.signal });
    // Watch for node removal and abort the listener
    const outlineNodeObserver = new MutationObserver(() => {
      if (!el.isConnected) {
        outlineAbort.abort();
        outlineNodeObserver.disconnect();
      }
    });
    outlineNodeObserver.observe(el.parentElement || document.body, { childList: true, subtree: false });
  }

  // Load cover image if node represents a database page
  const pageId = nodeData.content?.pageId || nodeData.pageId;
  if (pageId) {
    getPage(pageId).then(page => {
      if (page && page.coverImage) {
        const iconEl = el.querySelector('.canvas-node-icon');
        if (iconEl) {
          iconEl.innerHTML = `<img src="${page.coverImage}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;display:inline-block;vertical-align:middle;border:1.5px solid rgba(255,255,255,0.25);box-shadow:0 2px 6px rgba(0,0,0,0.4);">`;
        }
      }
    }).catch(err => console.warn('Failed to load page cover image on mount:', err));
  }

  // Prevent canvas zoom wheel events from bubbling up when scrolling inside the node
  el.addEventListener('wheel', (e) => {
    // Only block bubble-up if the user is scrolling normally (without holding Ctrl or Meta)
    // so that pinch-to-zoom or ctrl-wheel zooming still works!
    if (!e.ctrlKey && !e.metaKey) {
      e.stopPropagation();
    }
  }, { passive: true });

  if (nodeData.zIndex > canvasState.maxZ) canvasState.maxZ = nodeData.zIndex;
}

function bringToFront(entry) {
  const isAlreadyFront = !canvasState.nodes.some(n => n.data.id !== entry.data.id && n.data.zIndex >= entry.data.zIndex);
  if (isAlreadyFront && entry.el.style.zIndex) {
    return;
  }
  entry.data.zIndex = ++canvasState.maxZ;
  entry.el.style.zIndex = entry.data.zIndex;
  scheduleNodeSave(entry);
}

// Connection Drawing & Toggling
function toggleConnectionMode() {
  canvasState.linkingMode = !canvasState.linkingMode;
  const btn = document.getElementById('canvas-link-nodes-btn');
  if (btn) btn.classList.toggle('active', canvasState.linkingMode);

  if (canvasState.linkingMode) {
    canvasState.linkingSourceId = null;
    canvasState.viewport.style.cursor = 'crosshair';
    showToast('Click source node to link...', 'info');
  } else {
    canvasState.viewport.style.cursor = '';
    if (canvasState.linkingSourceId) {
      const prevSourceEl = document.querySelector(`[data-node-id="${canvasState.linkingSourceId}"]`);
      if (prevSourceEl) prevSourceEl.style.outline = '';
    }
    canvasState.linkingSourceId = null;
  }
}

function renderCanvasGuides() {
  if (!canvasState.surface) return;
  // Clear any existing guides
  const existingGuides = canvasState.surface.querySelectorAll('.canvas-guide');
  existingGuides.forEach(g => g.remove());

  const cfg = getStyleConfig(canvasState.styleId || 'story');
  if (cfg.renderGuides) {
    cfg.renderGuides(canvasState.surface);
  }
}

function drawConnections() {
  const svg = canvasState.connectionsSvg;
  if (!svg) return;
  svg.innerHTML = '';

  const connections = canvasState.tab.connections || [];
  
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const connCfg = getStyleConfig(canvasState.styleId || 'story');
    const connColor = connCfg.connectionColor || 'var(--accent-primary)';
    const connHoverColor = connCfg.connectionHoverColor || 'var(--accent-primary-hover)';
    defs.innerHTML = `
      <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="${connColor}"></path>
      </marker>
      <marker id="arrow-hover" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="${connHoverColor}"></path>
      </marker>
    `;
    svg.appendChild(defs);
  }

  connections.forEach(conn => {
    const srcNode = canvasState.nodes.find(n => n.data.id === conn.sourceId);
    const tgtNode = canvasState.nodes.find(n => n.data.id === conn.targetId);
    
    if (!srcNode || !tgtNode) return;

    const srcType = getNodeTypeConfig(srcNode.data.type);
    const tgtType = getNodeTypeConfig(tgtNode.data.type);
    const srcW = srcNode.data.width || (srcType ? srcType.defaultW : 300);
    const srcH = srcNode.data.height || (srcType ? srcType.defaultH : 200);
    const tgtW = tgtNode.data.width || (tgtType ? tgtType.defaultW : 300);
    const tgtH = tgtNode.data.height || (tgtType ? tgtType.defaultH : 200);

    // Center coordinates
    const x1 = srcNode.data.x + srcW / 2;
    const y1 = srcNode.data.y + srcH / 2;
    const x2 = tgtNode.data.x + tgtW / 2;
    const y2 = tgtNode.data.y + tgtH / 2;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) return;

    // Exact intersection with source node bounding box + 10px padding
    const tSrcX = dx === 0 ? Infinity : (srcW / 2) / Math.abs(dx);
    const tSrcY = dy === 0 ? Infinity : (srcH / 2) / Math.abs(dy);
    const tSrc = Math.min(tSrcX, tSrcY);
    const sourceX = x1 + dx * (tSrc + 10 / distance);
    const sourceY = y1 + dy * (tSrc + 10 / distance);

    // Exact intersection with target node bounding box + 10px padding
    const tTgtX = dx === 0 ? Infinity : (tgtW / 2) / Math.abs(dx);
    const tTgtY = dy === 0 ? Infinity : (tgtH / 2) / Math.abs(dy);
    const tTgt = Math.min(tTgtX, tTgtY);
    const targetX = x2 - dx * (tTgt + 10 / distance);
    const targetY = y2 - dy * (tTgt + 10 / distance);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    
    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2;
    const perpX = -(dy / distance) * Math.min(60, distance * 0.15);
    const perpY = (dx / distance) * Math.min(60, distance * 0.15);
    
    const ctrlX = midX + perpX;
    const ctrlY = midY + perpY;
    
    const dStr = `M ${sourceX} ${sourceY} Q ${ctrlX} ${ctrlY} ${targetX} ${targetY}`;
    path.setAttribute('d', dStr);
    path.setAttribute('data-source-id', conn.sourceId);
    path.setAttribute('data-target-id', conn.targetId);
    const pConnCfg = getStyleConfig(canvasState.styleId || 'story');
    const baseColor = pConnCfg.connectionColor || 'var(--accent-primary)';
    const connHoverColor = pConnCfg.connectionHoverColor || 'var(--accent-primary-hover)';
    const dashArray = pConnCfg.connectionDash || 'none';
    path.setAttribute('stroke', baseColor);
    path.setAttribute('stroke-dasharray', dashArray);
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('fill', 'none');
    path.setAttribute('marker-end', 'url(#arrow)');
    path.style.cssText = 'transition: stroke 0.15s, stroke-width 0.15s; cursor: pointer; pointer-events: auto;';

    const hitTarget = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitTarget.setAttribute('d', dStr);
    hitTarget.setAttribute('stroke', 'transparent');
    hitTarget.setAttribute('stroke-width', '15');
    hitTarget.setAttribute('fill', 'none');
    hitTarget.style.cssText = 'cursor: pointer; pointer-events: stroke;';

    hitTarget.addEventListener('mouseenter', () => {
      path.setAttribute('stroke', connHoverColor || 'var(--accent-primary-hover)');
      path.setAttribute('stroke-width', '4');
      path.setAttribute('marker-end', 'url(#arrow-hover)');
    });
    hitTarget.addEventListener('mouseleave', () => {
      path.setAttribute('stroke', baseColor);
      path.setAttribute('stroke-width', '2.5');
      path.setAttribute('marker-end', 'url(#arrow)');
    });

    hitTarget.addEventListener('dblclick', async (e) => {
      e.stopPropagation();
      const srcName = srcNode.data.title || 'Node';
      const tgtName = tgtNode.data.title || 'Node';
      if (confirm(`Delete connection line between "${srcName}" and "${tgtName}"?`)) {
        canvasState.tab.connections = canvasState.tab.connections.filter(c => c.id !== conn.id);
        await saveTab(canvasState.tab);
        await flushFileAutosave();
        drawConnections();
        showToast('Connection removed!', 'success');
        if (canvasState.tab && canvasState.tab.beatId) {
          await syncBeatWithCanvas();
        }
      }
    });

    // Right-click context menu on connection lines for label editing / removal
    hitTarget.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const srcName = srcNode.data.title || 'Node';
      const tgtName = tgtNode.data.title || 'Node';

      document.querySelectorAll('.canvas-conn-menu').forEach(m => m.remove());

      const menu = document.createElement('div');
      menu.className = 'canvas-conn-menu';
      menu.style.left = e.clientX + 'px';
      menu.style.top = e.clientY + 'px';
      menu.innerHTML = `
        <div class="canvas-conn-menu-header">Connection</div>
        <div class="canvas-conn-menu-sub">${srcName} ➔ ${tgtName}</div>
        <button id="conn-menu-label">✏️ Edit Label</button>
        <button id="conn-menu-delete" class="danger">🗑️ Remove Connection</button>
      `;
      document.body.appendChild(menu);

      menu.querySelector('#conn-menu-label').addEventListener('click', async () => {
        menu.remove();
        const label = prompt('Enter connection label (leave empty to clear):', conn.label || '');
        if (label !== null) {
          conn.label = label.trim();
          await saveTab(canvasState.tab);
          await flushFileAutosave();
          drawConnections();
          showToast('Label updated!', 'success');
        }
      });

      menu.querySelector('#conn-menu-delete').addEventListener('click', async () => {
        menu.remove();
        canvasState.tab.connections = canvasState.tab.connections.filter(c => c.id !== conn.id);
        await saveTab(canvasState.tab);
        await flushFileAutosave();
        drawConnections();
        showToast('Connection removed!', 'success');
        if (canvasState.tab && canvasState.tab.beatId) {
          await syncBeatWithCanvas();
        }
      });

      const dismissMenu = (ev) => {
        if (!menu.contains(ev.target)) {
          menu.remove();
          document.removeEventListener('mousedown', dismissMenu);
        }
      };
      setTimeout(() => document.addEventListener('mousedown', dismissMenu), 0);
    });

    svg.appendChild(path);
    svg.appendChild(hitTarget);
  });
}

let _canvasUpdateScheduled = false;
function scheduleCanvasUpdate() {
  if (_canvasUpdateScheduled) return;
  _canvasUpdateScheduled = true;
  requestAnimationFrame(() => {
    updateMinimap();
    drawConnections();
    _canvasUpdateScheduled = false;
  });
}

let _minimapUpdateScheduled = false;
function scheduleMinimapUpdate() {
  if (_minimapUpdateScheduled) return;
  _minimapUpdateScheduled = true;
  requestAnimationFrame(() => {
    updateMinimap();
    _minimapUpdateScheduled = false;
  });
}

// ─── Node Drag ───────────────────────────────────────────────────────────────

function setupNodeDrag(el, entry) {
  const header = el.querySelector('.canvas-node-header');
  let dragging = false;
  let startMX, startMY, startX, startY;

  const onMouseMove = (e) => {
    if (!dragging) return;
    const dx = (e.clientX - startMX) / canvasState.zoom;
    const dy = (e.clientY - startMY) / canvasState.zoom;
    const snapped = snapPos(startX + dx, startY + dy);
    entry.data.x = snapped.x;
    entry.data.y = snapped.y;
    el.style.left = entry.data.x + 'px';
    el.style.top = entry.data.y + 'px';
    scheduleCanvasUpdate();
  };

  const onMouseUp = () => {
    if (dragging) {
      dragging = false;
      el.classList.remove('dragging');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      scheduleNodeSave(entry);
    }
  };

  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('button') || e.target.closest('[contenteditable]')) return;
    dragging = true;
    el.classList.add('dragging');
    startMX = e.clientX;
    startMY = e.clientY;
    startX = entry.data.x;
    startY = entry.data.y;
    bringToFront(entry);
    e.preventDefault();

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}

// ─── Node Resize ─────────────────────────────────────────────────────────────

function setupNodeResize(handle, el, entry) {
  let resizing = false;
  let startMX, startMY, startW, startH;

  const onMouseMove = (e) => {
    if (!resizing) return;
    const dw = (e.clientX - startMX) / canvasState.zoom;
    const dh = (e.clientY - startMY) / canvasState.zoom;
    entry.data.width = Math.max(200, startW + dw);
    entry.data.height = Math.max(120, startH + dh);
    el.style.width = entry.data.width + 'px';
    el.style.height = entry.data.height + 'px';
    scheduleCanvasUpdate();
  };

  const onMouseUp = () => {
    if (resizing) {
      resizing = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      scheduleNodeSave(entry);
    }
  };

  handle.addEventListener('mousedown', (e) => {
    resizing = true;
    startMX = e.clientX;
    startMY = e.clientY;
    startW = entry.data.width;
    startH = entry.data.height;
    bringToFront(entry);
    e.preventDefault();
    e.stopPropagation();

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}

// ─── Node Body Renderers ─────────────────────────────────────────────────────

async function renderNodeBody(body, nodeData) {
  body.innerHTML = '';
  switch (nodeData.type) {
    case 'richtext':    renderRichText(body, nodeData); break;
    case 'image':       renderImage(body, nodeData); break;
    case 'statblock':   
      if (canvasState.styleId === 'dnd') {
        renderDndStatBlock(body, nodeData);
      } else {
        renderStatBlock(body, nodeData);
      }
      break;
    case 'ability':     renderAbility(body, nodeData); break;
    case 'timeline':    renderTimeline(body, nodeData); break;
    case 'link':        renderLink(body, nodeData); break;
    case 'moodboard':   renderMoodboard(body, nodeData); break;
    case 'quote':       renderQuote(body, nodeData); break;
    case 'pagelink':    await renderPageLink(body, nodeData); break;
    case 'map':         await renderMapNode(body, nodeData); break;
    case 'encounter':   renderEncounter(body, nodeData); break;
    case 'flowchart':   renderFlowchart(body, nodeData); break;
    case 'progression': renderProgression(body, nodeData); break;
  }
}

function renderDndStatBlock(body, nodeData) {
  const entry = canvasState.nodes.find(n => n.data.id === nodeData.id);
  if (!nodeData.content) nodeData.content = {};
  const c = nodeData.content;
  
  if (c.ac === undefined) c.ac = 10;
  if (c.hp === undefined) c.hp = 10;
  if (c.cr === undefined) c.cr = '1';
  if (!c.abilities) {
    c.abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  }

  const getMod = (val) => {
    const mod = Math.floor((val - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  };

  const rollAbility = (abilityName, score) => {
    const mod = Math.floor((score - 10) / 2);
    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20 + mod;
    playZapSound();

    // Visual shake feedback on the card itself
    const cardEl = body.closest('.canvas-node');
    if (cardEl) {
      cardEl.classList.remove('roll-shake');
      void cardEl.offsetWidth; // trigger reflow
      cardEl.classList.add('roll-shake');
      setTimeout(() => cardEl.classList.remove('roll-shake'), 500);
    }

    // Auto-open Dice Tray panel if closed
    let dicePanel = document.getElementById('canvas-dice-panel');
    if (!dicePanel) {
      toggleDiceTray();
      dicePanel = document.getElementById('canvas-dice-panel');
    }

    // Append roll log to Dice Tray history (new panel format)
    if (dicePanel) {
      const historyBox = dicePanel.querySelector('#dice-history');
      if (historyBox) {
        const prevEmpty = historyBox.querySelector('[style*="font-style: italic"], [style*="font-style:italic"]');
        if (prevEmpty) historyBox.innerHTML = '';
        const isNat20Roll = d20 === 20;
        const isNat1Roll = d20 === 1;
        const specialBadge = isNat20Roll ? ' <span style="color:#fbbf24;font-size:0.65rem;">⚡ NAT 20</span>' : isNat1Roll ? ' <span style="color:#f43f5e;font-size:0.65rem;">💀 NAT 1</span>' : '';
        const item = document.createElement('div');
        item.style.cssText = 'padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.04); font-size:0.7rem; display:flex; justify-content:space-between; align-items:center;';
        item.innerHTML = `
          <span style="color:rgba(255,255,255,0.4);">${nodeData.title || 'Monster'} · ${abilityName.toUpperCase()}</span>
          <span>[${d20}] ${mod >= 0 ? '+' : ''}${mod} = <b style="color:#a78bfa">${total}</b>${specialBadge}</span>
        `;
        historyBox.insertBefore(item, historyBox.firstChild);
      }
    }

    const resText = `${nodeData.title || 'Monster'} rolled ${abilityName.toUpperCase()}: [${d20}] ${mod >= 0 ? '+' : ''}${mod} = **${total}**`;
    showToast(resText, 'info');
  };

  body.innerHTML = `
    <div class="canvas-dnd-statblock" style="display: flex; flex-direction: column; gap: var(--sp-3); height: 100%; box-sizing: border-box; font-family: var(--font-hud);">
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
        <div class="form-group">
          <label class="form-label" style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">AC</label>
          <input type="number" class="form-input" id="dnd-ac" value="${c.ac}" style="background: rgba(0,0,0,0.3); padding: 4px; font-size: 0.8rem;" />
        </div>
        <div class="form-group">
          <label class="form-label" style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">HP</label>
          <input type="number" class="form-input" id="dnd-hp" value="${c.hp}" style="background: rgba(0,0,0,0.3); padding: 4px; font-size: 0.8rem;" />
        </div>
        <div class="form-group">
          <label class="form-label" style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">CR</label>
          <input class="form-input" id="dnd-cr" value="${escHtml(c.cr)}" style="background: rgba(0,0,0,0.3); padding: 4px; font-size: 0.8rem;" />
        </div>
      </div>

      <div class="hud-divider" style="margin: 4px 0;"></div>

      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; flex: 1; overflow-y: auto;">
        ${['str', 'dex', 'con', 'int', 'wis', 'cha'].map(ab => `
          <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 6px;">
            <div style="display: flex; flex-direction: column;">
              <span style="font-weight: 700; text-transform: uppercase; font-size: 0.7rem; color: var(--accent-purple, #8b5cf6);">${ab}</span>
              <input type="number" class="dnd-ability-val" data-ability="${ab}" value="${c.abilities[ab]}" style="width: 44px; background: transparent; border: none; color: #fff; font-size: 0.85rem; font-weight: bold; padding: 0;" />
            </div>
            <button class="btn btn-sm dnd-roll-btn" data-ability="${ab}" style="padding: 2px 4px; font-size: 0.65rem; font-weight: bold;">
              ${getMod(c.abilities[ab])} 🎲
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  body.querySelector('#dnd-ac').addEventListener('input', e => {
    c.ac = parseInt(e.target.value) || 10;
    if (entry) scheduleNodeSave(entry);
  });
  body.querySelector('#dnd-hp').addEventListener('input', e => {
    c.hp = parseInt(e.target.value) || 10;
    if (entry) scheduleNodeSave(entry);
  });
  body.querySelector('#dnd-cr').addEventListener('input', e => {
    c.cr = e.target.value;
    if (entry) scheduleNodeSave(entry);
  });

  body.querySelectorAll('.dnd-ability-val').forEach(input => {
    input.addEventListener('input', e => {
      const ab = input.dataset.ability;
      const score = parseInt(e.target.value) || 10;
      c.abilities[ab] = score;
      const btn = body.querySelector(`.dnd-roll-btn[data-ability="${ab}"]`);
      if (btn) btn.textContent = `${getMod(score)} 🎲`;
      if (entry) scheduleNodeSave(entry);
    });
  });

  body.querySelectorAll('.dnd-roll-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ab = btn.dataset.ability;
      const score = c.abilities[ab];
      rollAbility(ab, score);
    });
  });
}

function renderEncounter(body, nodeData) {
  const entry = canvasState.nodes.find(n => n.data.id === nodeData.id);
  if (!nodeData.content) nodeData.content = {};
  const c = nodeData.content;
  
  if (!c.monsters) c.monsters = [{ name: 'Goblin', count: 2, xp: 50 }];
  if (c.playerCount === undefined) c.playerCount = 4;
  if (c.playerLevel === undefined) c.playerLevel = 1;

  const calculateDifficulty = () => {
    let totalXP = 0;
    let monsterCount = 0;
    for (const m of c.monsters) {
      totalXP += (m.xp || 0) * (m.count || 0);
      monsterCount += m.count || 0;
    }

    let multiplier = 1;
    if (monsterCount === 2) multiplier = 1.5;
    else if (monsterCount >= 3 && monsterCount <= 6) multiplier = 2;
    else if (monsterCount >= 7 && monsterCount <= 10) multiplier = 2.5;
    else if (monsterCount >= 11) multiplier = 3;

    const adjustedXP = totalXP * multiplier;

    const thresholds = {
      1:  [25, 50, 75, 100],
      2:  [50, 100, 150, 200],
      3:  [75, 150, 225, 400],
      4:  [125, 250, 375, 500],
      5:  [250, 500, 750, 1100],
      6:  [300, 600, 900, 1400],
      7:  [350, 750, 1100, 1700],
      8:  [450, 900, 1400, 2100],
      9:  [550, 1100, 1600, 2400],
      10: [600, 1200, 1900, 2800],
    };

    const lvl = c.playerLevel || 1;
    const baseThresh = thresholds[lvl] || thresholds[10];
    const partyThresh = baseThresh.map(t => t * (c.playerCount || 4));

    let difficulty = 'Trivial';
    let diffColor = '#64748b';
    if (adjustedXP >= partyThresh[3]) { difficulty = 'Deadly 💀'; diffColor = '#f43f5e'; }
    else if (adjustedXP >= partyThresh[2]) { difficulty = 'Hard ⚔️'; diffColor = '#f97316'; }
    else if (adjustedXP >= partyThresh[1]) { difficulty = 'Medium 🟠'; diffColor = '#eab308'; }
    else if (adjustedXP >= partyThresh[0]) { difficulty = 'Easy 🟢'; diffColor = '#10b981'; }

    return { totalXP, adjustedXP, difficulty, diffColor };
  };

  const updateEncounterStats = () => {
    const stats = calculateDifficulty();
    const xpEl = body.querySelector('#enc-xp-summary');
    const diffEl = body.querySelector('#enc-diff-summary');
    if (xpEl) xpEl.innerHTML = `<div style="font-size:0.65rem;color:var(--text-muted);">Adjusted XP: <b>${stats.adjustedXP}</b></div><div style="font-size:0.65rem;color:var(--text-muted);">Raw XP: ${stats.totalXP}</div>`;
    if (diffEl) { diffEl.textContent = stats.difficulty; diffEl.style.color = stats.diffColor; }
  };

  const renderEncounterUI = () => {
    const stats = calculateDifficulty();
    
    body.innerHTML = `
      <div class="canvas-encounter" style="display: flex; flex-direction: column; gap: 6px; height: 100%; box-sizing: border-box; font-family: var(--font-hud); font-size: 0.75rem;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 2px;">
          <div>
            <label style="color: var(--text-muted); font-size: 0.6rem; text-transform: uppercase;">Players Count</label>
            <input type="number" class="form-input" id="enc-players" value="${c.playerCount}" style="background:rgba(0,0,0,0.3); padding:3px; font-size:0.75rem;" />
          </div>
          <div>
            <label style="color: var(--text-muted); font-size: 0.6rem; text-transform: uppercase;">Party Level</label>
            <input type="number" class="form-input" id="enc-lvl" value="${c.playerLevel}" style="background:rgba(0,0,0,0.3); padding:3px; font-size:0.75rem;" />
          </div>
        </div>

        <div class="hud-divider" style="margin: 2px 0;"></div>

        <div style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; max-height: 140px;">
          <div style="display: flex; gap: 4px; align-items: center; margin-bottom: 2px; color: var(--text-muted); font-size: 0.58rem; text-transform: uppercase; font-weight: bold; padding: 0 4px;">
            <span style="flex: 2;">Monster Name</span>
            <span style="flex: 0.8; text-align: center;">Qty</span>
            <span style="flex: 1.2;">XP Each</span>
            <span style="flex: 0.35;"></span>
          </div>
          ${c.monsters.map((m, idx) => `
            <div style="display: flex; gap: 4px; align-items: center;">
              <input class="form-input enc-mon-name" data-index="${idx}" value="${escHtml(m.name)}" placeholder="Monster" style="flex:2; padding:3px; font-size:0.75rem;" />
              <input type="number" class="form-input enc-mon-count" data-index="${idx}" value="${m.count}" placeholder="Qty" style="flex:0.8; padding:3px; text-align:center; font-size:0.75rem;" />
              <input type="number" class="form-input enc-mon-xp" data-index="${idx}" value="${m.xp}" placeholder="XP" style="flex:1.2; padding:3px; font-size:0.75rem;" />
              <button class="btn btn-sm enc-mon-del" data-index="${idx}" style="padding: 2px 4px; color: var(--accent-red); background: transparent; border: none; cursor: pointer;">✕</button>
            </div>
          `).join('')}
          <button class="btn btn-secondary btn-sm" id="enc-add-mon-btn" style="margin-top: 4px; font-size: 0.65rem; align-self: flex-start; padding: 2px 6px;">+ Add Monster</button>
        </div>

        <div class="hud-divider" style="margin: 2px 0;"></div>

        <div style="background: rgba(0,0,0,0.25); border-radius: 6px; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center;">
          <div id="enc-xp-summary">
            <div style="font-size: 0.65rem; color: var(--text-muted);">Adjusted XP: <b>${stats.adjustedXP}</b></div>
            <div style="font-size: 0.65rem; color: var(--text-muted);">Raw XP: ${stats.totalXP}</div>
          </div>
          <div id="enc-diff-summary" style="font-size: 0.85rem; font-weight: bold; color: ${stats.diffColor};">${stats.difficulty}</div>
        </div>
      </div>
    `;

    // Player count / level: update stats only, no re-render (preserves focus)
    body.querySelector('#enc-players').addEventListener('input', e => {
      c.playerCount = parseInt(e.target.value) || 4;
      updateEncounterStats();
      if (entry) scheduleNodeSave(entry);
    });

    body.querySelector('#enc-lvl').addEventListener('input', e => {
      c.playerLevel = parseInt(e.target.value) || 1;
      updateEncounterStats();
      if (entry) scheduleNodeSave(entry);
    });

    body.querySelectorAll('.enc-mon-name').forEach(input => {
      input.addEventListener('input', e => {
        const idx = parseInt(input.dataset.index);
        c.monsters[idx].name = e.target.value;
        if (entry) scheduleNodeSave(entry);
      });
    });

    body.querySelectorAll('.enc-mon-count').forEach(input => {
      input.addEventListener('input', e => {
        const idx = parseInt(input.dataset.index);
        c.monsters[idx].count = parseInt(e.target.value) || 1;
        updateEncounterStats();
        if (entry) scheduleNodeSave(entry);
      });
    });

    body.querySelectorAll('.enc-mon-xp').forEach(input => {
      input.addEventListener('input', e => {
        const idx = parseInt(input.dataset.index);
        c.monsters[idx].xp = parseInt(e.target.value) || 0;
        updateEncounterStats();
        if (entry) scheduleNodeSave(entry);
      });
    });

    body.querySelectorAll('.enc-mon-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        c.monsters.splice(idx, 1);
        renderEncounterUI(); // Full re-render OK on list changes (no focus to preserve)
        if (entry) scheduleNodeSave(entry);
      });
    });

    body.querySelector('#enc-add-mon-btn').addEventListener('click', () => {
      c.monsters.push({ name: '', count: 1, xp: 0 });
      renderEncounterUI(); // Full re-render OK on list changes
      if (entry) scheduleNodeSave(entry);
    });
  };

  renderEncounterUI();
}

function renderFlowchart(body, nodeData) {
  const entry = canvasState.nodes.find(n => n.data.id === nodeData.id);
  if (!nodeData.content) nodeData.content = {};
  const c = nodeData.content;
  
  if (!c.nodeType) c.nodeType = 'Action';
  if (!c.desc) c.desc = '';

  const types = ['Selector', 'Sequence', 'Action', 'Condition'];

  body.innerHTML = `
    <div class="canvas-flowchart" style="display: flex; flex-direction: column; gap: var(--sp-2); height: 100%; box-sizing: border-box; font-family: var(--font-hud);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
        <label class="form-label" style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase; margin: 0;">Logic Node Type</label>
        <button class="btn btn-sm run-simulation-btn" style="padding: 2px 6px; font-size: 0.62rem; background: var(--accent-cyan, #06b6d4); border: 1px solid var(--accent-cyan, #06b6d4); color: #000; font-weight: bold; cursor: pointer; border-radius: 4px; display: flex; align-items: center; gap: 2px;">▶ Run Step</button>
      </div>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px;">
        ${types.map(t => {
          const active = c.nodeType === t;
          return `
            <button class="btn btn-sm behavior-type-btn ${active ? 'active' : ''}" data-type="${t}" style="padding: 4px; font-size: 0.65rem; ${active ? 'background: var(--accent-cyan, #06b6d4) !important; color: #000; font-weight: 700;' : 'background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.05);'}">
              ${t}
            </button>
          `;
        }).join('')}
      </div>

      <div class="form-group" style="flex: 1; display: flex; flex-direction: column; margin-top: 4px;">
        <label class="form-label" style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase;">Condition / Action Script</label>
        <textarea class="canvas-textarea" placeholder="e.g. if playerNear -> attack()" style="flex: 1; min-height: 50px; background: rgba(0,0,0,0.3); font-size: 0.75rem; margin-top: 4px;">${escHtml(c.desc)}</textarea>
      </div>
    </div>
  `;

  body.querySelectorAll('.behavior-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      c.nodeType = btn.dataset.type;
      
      const colors = { Selector: '#3b82f6', Sequence: '#a78bfa', Action: '#f43f5e', Condition: '#eab308' };
      const col = colors[c.nodeType] || '#06b6d4';
      if (entry) {
        nodeData.color = col;
        entry.el.style.setProperty('--node-accent', col);
        entry.el.style.setProperty('--node-accent-glow', `${col}20`);
        entry.el.style.setProperty('--node-accent-border', `${col}44`);
      }
      
      renderFlowchart(body, nodeData);
      if (entry) scheduleNodeSave(entry);
    });
  });

  body.querySelector('textarea').addEventListener('input', e => {
    c.desc = e.target.value;
    if (entry) scheduleNodeSave(entry);
  });

  body.querySelector('.run-simulation-btn').addEventListener('click', () => {
    runBehaviorTreeSimulation(nodeData.id);
  });
}

async function runBehaviorTreeSimulation(startNodeId) {
  playZapSound();
  showToast('Simulating behavior tree execution...', 'info');

  const currentTabId = canvasState.tabId;
  const visited = new Set();
  const queue = [startNodeId];
  const stepDelay = 600;

  while (queue.length > 0) {
    if (canvasState.tabId !== currentTabId) break;
    const currentNodeId = queue.shift();
    if (visited.has(currentNodeId)) continue;
    visited.add(currentNodeId);

    // Find the node element
    const nodeEl = document.querySelector(`[data-node-id="${currentNodeId}"]`);
    if (nodeEl) {
      nodeEl.classList.remove('behavior-node-pulse');
      void nodeEl.offsetWidth; // trigger reflow
      nodeEl.classList.add('behavior-node-pulse');
      
      // Add status bubble on node
      let statusEl = nodeEl.querySelector('.behavior-status-pill');
      if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.className = 'behavior-status-pill';
        statusEl.style.cssText = 'position: absolute; top: -20px; right: 8px; background: var(--accent-cyan); color: #000; font-size: 8px; font-weight: bold; font-family: var(--font-hud); padding: 2px 6px; border-radius: 4px; z-index: 10; box-shadow: 0 2px 6px rgba(0,0,0,0.4); animation: fadeIn 0.2s;';
        nodeEl.appendChild(statusEl);
      }
      statusEl.textContent = 'RUNNING...';
      statusEl.style.background = 'var(--accent-cyan, #06b6d4)';

      await new Promise(resolve => setTimeout(resolve, stepDelay));
      
      const success = Math.random() > 0.3;
      statusEl.textContent = success ? 'SUCCESS ✔' : 'FAILURE ✕';
      statusEl.style.background = success ? 'var(--accent-green, #10b981)' : 'var(--accent-red, #f43f5e)';

      // Auto remove after 2.5s
      const currentStatus = statusEl;
      setTimeout(() => currentStatus.remove(), 2500);

      // Stop traversal if path failure
      if (!success) {
        showToast('Sequence failed at behavior node.', 'warning');
        break;
      }
    }

    // Find outgoing connections
    const connections = canvasState.tab.connections || [];
    const outgoing = connections.filter(c => c.sourceId === currentNodeId);
    
    for (const conn of outgoing) {
      // Find the SVG path representing this connection
      const pathEl = canvasState.connectionsSvg.querySelector(`path[data-source-id="${currentNodeId}"][data-target-id="${conn.targetId}"]`);
      if (pathEl) {
        pathEl.setAttribute('stroke', 'var(--accent-cyan, #06b6d4)');
        pathEl.setAttribute('stroke-width', '5');
        // Reset after animation window
        const currentPath = pathEl;
        setTimeout(() => {
          currentPath.setAttribute('stroke', 'var(--accent-primary)');
          currentPath.setAttribute('stroke-width', '2.5');
        }, 1200);
      }
      queue.push(conn.targetId);
    }
  }
}

function renderProgression(body, nodeData) {
  const entry = canvasState.nodes.find(n => n.data.id === nodeData.id);
  if (!nodeData.content) nodeData.content = {};
  const c = nodeData.content;
  
  if (c.baseXP === undefined) c.baseXP = 100;
  if (c.coefficient === undefined) c.coefficient = 1.5;
  if (c.levelCap === undefined) c.levelCap = 10;

  const calculateProgression = () => {
    const rows = [];
    let cumulativeXP = 0;
    for (let lvl = 1; lvl <= (c.levelCap || 10); lvl++) {
      const nextXP = Math.round((c.baseXP || 100) * Math.pow(lvl, c.coefficient || 1.5));
      cumulativeXP += nextXP;
      rows.push({ level: lvl, xpNeeded: nextXP, total: cumulativeXP });
    }
    return rows;
  };

  const updateProgressionTable = () => {
    const data = calculateProgression();
    const tbody = body.querySelector('#prog-table-body');
    if (!tbody) return;
    tbody.innerHTML = data.map(row => `
      <tr style="border-bottom: 1px dashed rgba(255,255,255,0.03);">
        <td style="padding: 3px 6px; font-weight: bold; color: var(--accent-primary);">Lvl ${row.level}</td>
        <td style="padding: 3px 6px;">${row.xpNeeded}</td>
        <td style="padding: 3px 6px; color: var(--text-muted);">${row.total}</td>
      </tr>
    `).join('');
  };

  const renderProgressionUI = () => {
    const data = calculateProgression();
    body.innerHTML = `
      <div class="canvas-progression" style="display: flex; flex-direction: column; gap: 6px; height: 100%; box-sizing: border-box; font-family: var(--font-hud); font-size: 0.75rem;">
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
          <div>
            <label style="color: var(--text-muted); font-size: 0.6rem; text-transform: uppercase;">Base XP</label>
            <input type="number" class="form-input" id="prog-base" value="${c.baseXP}" style="background:rgba(0,0,0,0.3); padding:4px; font-size:0.75rem;" />
          </div>
          <div>
            <label style="color: var(--text-muted); font-size: 0.6rem; text-transform: uppercase;">Exponent</label>
            <input type="number" step="0.1" class="form-input" id="prog-coeff" value="${c.coefficient}" style="background:rgba(0,0,0,0.3); padding:4px; font-size:0.75rem;" />
          </div>
          <div>
            <label style="color: var(--text-muted); font-size: 0.6rem; text-transform: uppercase;">Max Level</label>
            <input type="number" class="form-input" id="prog-cap" value="${c.levelCap}" style="background:rgba(0,0,0,0.3); padding:4px; font-size:0.75rem;" />
          </div>
        </div>

        <div class="hud-divider" style="margin: 2px 0;"></div>

        <div style="flex: 1; overflow-y: auto; max-height: 160px; border: 1px solid rgba(255,255,255,0.05); border-radius: 6px; background: rgba(0,0,0,0.15);">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02);">
                <th style="padding: 4px 6px; font-size: 0.65rem; color: var(--text-muted);">Lvl</th>
                <th style="padding: 4px 6px; font-size: 0.65rem; color: var(--text-muted);">XP Needed</th>
                <th style="padding: 4px 6px; font-size: 0.65rem; color: var(--text-muted);">Total</th>
              </tr>
            </thead>
            <tbody id="prog-table-body">
              ${data.map(row => `
                <tr style="border-bottom: 1px dashed rgba(255,255,255,0.03);">
                  <td style="padding: 3px 6px; font-weight: bold; color: var(--accent-primary);">Lvl ${row.level}</td>
                  <td style="padding: 3px 6px;">${row.xpNeeded}</td>
                  <td style="padding: 3px 6px; color: var(--text-muted);">${row.total}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Update only the table, preserving focus in the inputs
    body.querySelector('#prog-base').addEventListener('input', e => {
      c.baseXP = parseInt(e.target.value) || 100;
      updateProgressionTable();
      if (entry) scheduleNodeSave(entry);
    });

    body.querySelector('#prog-coeff').addEventListener('input', e => {
      c.coefficient = parseFloat(e.target.value) || 1.5;
      updateProgressionTable();
      if (entry) scheduleNodeSave(entry);
    });

    body.querySelector('#prog-cap').addEventListener('input', e => {
      c.levelCap = Math.min(30, parseInt(e.target.value) || 10);
      updateProgressionTable();
      if (entry) scheduleNodeSave(entry);
    });
  };

  renderProgressionUI();
}


// Rich Text
async function renderRichText(body, nodeData) {
  const entry = canvasState.nodes.find(n => n.data.id === nodeData.id);
  // Normalize: legacy beat nodes may store content as a plain string
  if (!nodeData.content) {
    nodeData.content = { delta: '' };
  } else if (typeof nodeData.content === 'string') {
    nodeData.content = { delta: nodeData.content };
  }
  
  const editorMount = document.createElement('div');
  editorMount.className = 'canvas-richtext-editor-mount';
  body.appendChild(editorMount);

  const editor = await createEditor(editorMount, {
    placeholder: 'Write anything...',
    initialContent: nodeData.content.delta || '',
    minimal: true
  });
  if (entry) {
    entry.quillEditor = editor;
  }

  editor.quill.on('text-change', () => {
    nodeData.content.delta = editor.getContent();
    if (entry) scheduleNodeSave(entry);
    // Story Writer: update word goal ring and outline in real time
    if (canvasState.styleId === 'story') {
      renderWordGoalRing(nodeData);
      // Debounce outline refresh
      clearTimeout(nodeData._outlineRefreshTimer);
      nodeData._outlineRefreshTimer = setTimeout(() => refreshManuscriptOutline(), 400);
    }
  });

  // AI Expand Button at the bottom
  const aiExpandBtn = document.createElement('button');
  aiExpandBtn.className = 'canvas-node-ai-expand-btn';
  aiExpandBtn.innerHTML = '✨ Expand with AI';
  aiExpandBtn.title = 'Ask AI to expand this concept into related nodes';
  aiExpandBtn.style.cssText = 'align-self: flex-end; font-size: 0.65rem; background: rgba(229,169,59,0.05); border: 1px dashed rgba(229,169,59,0.25); color: var(--accent-primary); border-radius: 4px; padding: 2px 6px; cursor: pointer; margin-top: 4px; transition: all 0.2s; display: flex; align-items: center; gap: 4px;';
  aiExpandBtn.addEventListener('mouseenter', () => {
    aiExpandBtn.style.background = 'rgba(229,169,59,0.12)';
    aiExpandBtn.style.borderColor = 'var(--accent-primary)';
  });
  aiExpandBtn.addEventListener('mouseleave', () => {
    aiExpandBtn.style.background = 'rgba(229,169,59,0.05)';
    aiExpandBtn.style.borderColor = 'rgba(229,169,59,0.25)';
  });
  aiExpandBtn.addEventListener('click', () => expandNodeWithAi(nodeData, editor.getText()));
  body.appendChild(aiExpandBtn);
}

// Image
function renderImage(body, nodeData) {
  const entry = canvasState.nodes.find(n => n.data.id === nodeData.id);
  const wrap = document.createElement('div');
  wrap.className = 'canvas-image-wrap';

  if (nodeData.content?.src) {
    const img = document.createElement('img');
    img.src = nodeData.content.src;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    wrap.appendChild(img);
  }

  const overlay = document.createElement('div');
  overlay.className = 'canvas-image-overlay';
  overlay.innerHTML = `<span>${nodeData.content?.src ? '🔄 Replace' : '📁 Upload Image'}</span>`;
  overlay.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        nodeData.content.src = ev.target.result;
        wrap.innerHTML = '';
        const img = document.createElement('img');
        img.src = ev.target.result;
        img.style.cssText = 'width:100%;height:100%;object-fit:contain;';
        wrap.appendChild(img);
        wrap.appendChild(overlay);
        overlay.innerHTML = '<span>🔄 Replace</span>';
        if (entry) scheduleNodeSave(entry);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });

  wrap.appendChild(overlay);
  body.appendChild(wrap);

  // Caption
  const cap = document.createElement('input');
  cap.type = 'text';
  cap.className = 'canvas-input canvas-caption';
  cap.placeholder = 'Caption…';
  cap.value = nodeData.content?.caption || '';
  cap.addEventListener('input', () => {
    nodeData.content.caption = cap.value;
    if (entry) scheduleNodeSave(entry);
  });
  body.appendChild(cap);
}

async function renderMapNode(body, nodeData) {
  if (!nodeData.content) nodeData.content = {};
  let pageId = nodeData.content.pageId;
  let page = null;
  if (pageId) {
    try {
      page = await getPage(pageId);
    } catch (_) {}
  }

  if (!page) {
    // Dynamically create a standalone page for this map node so that it can hold image edits, labels, etc.
    try {
      const activeProject = await getActiveProject();
      const newMapPage = await savePage({
        projectId: activeProject.id,
        schemaId: 'dnd-maps-schema', // associate it with D&D maps schema
        title: nodeData.title || 'Interactive Map',
        properties: {
          mapData: {
            gridType: 'none',
            gridSize: 40,
            gridOpacity: 0.3,
            labels: []
          }
        },
        content: '',
        icon: 'map'
      });
      nodeData.content.pageId = newMapPage.id;
      const entry = canvasState.nodes.find(n => n.data.id === nodeData.id);
      if (entry) {
        entry.data.content.pageId = newMapPage.id;
      }
      await saveNode(nodeData);
      page = newMapPage;
    } catch (err) {
      console.error('Failed to auto-create map page:', err);
      body.innerHTML = `<div class="empty-state" style="padding: 12px; font-size: 0.72rem; color: var(--text-muted);">Error: Map database page not found.</div>`;
      return;
    }
  }

  body.innerHTML = '';

  const mainWrapper = document.createElement('div');
  mainWrapper.style.cssText = 'display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden;';
  body.appendChild(mainWrapper);

  const editorContainer = document.createElement('div');
  editorContainer.style.cssText = 'flex: 1; min-height: 0; position: relative; width: 100%;';
  mainWrapper.appendChild(editorContainer);

  // Load the shared, full-featured interactive Map Editor
  await initMapEditor(editorContainer, page, { isCanvasNode: true });

  // Now, render the bottom properties panel if the page has an attached schema with fields
  if (page.schemaId) {
    let schema = null;
    try {
      schema = await getSchema(page.schemaId);
    } catch (_) {}

    if (schema && schema.fields && schema.fields.length > 0) {
      // Filter out mapData field
      const visibleFields = schema.fields.filter(f => f.id !== 'mapData' && f.name.toLowerCase() !== 'map data');
      
      if (visibleFields.length > 0) {
        const propPanel = document.createElement('div');
        propPanel.className = 'canvas-map-properties-panel';
        propPanel.style.cssText = 'max-height: 120px; min-height: 60px; border-top: 1px solid rgba(255,255,255,0.08); background: rgba(13,10,20,0.95); display: flex; flex-direction: column; overflow-y: auto; padding: 6px 8px; flex-shrink: 0; gap: 4px; font-family: var(--font-hud, monospace); font-size: 0.72rem;';
        
        const propTitle = document.createElement('div');
        propTitle.style.cssText = 'font-weight: bold; color: var(--accent-primary); border-bottom: 1px solid rgba(255,255,255,0.04); padding-bottom: 2px; margin-bottom: 2px; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.5px;';
        propTitle.textContent = 'Map Entry Properties';
        propPanel.appendChild(propTitle);

        const propGrid = document.createElement('div');
        propGrid.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 12px;';
        propPanel.appendChild(propGrid);

        visibleFields.forEach(field => {
          const value = page.properties[field.id] || '';
          const fieldRow = document.createElement('div');
          fieldRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 6px;';

          const label = document.createElement('label');
          label.style.cssText = 'color: var(--text-muted); font-size: 0.68rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90px;';
          label.textContent = field.name;
          fieldRow.appendChild(label);

          const inputWrapper = document.createElement('div');
          inputWrapper.style.cssText = 'flex: 1; min-width: 0; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden; display: flex; align-items: center;';
          
          const inputEl = createMapPropertyInputElement(field, value, async (newVal) => {
            page.properties[field.id] = newVal;
            await savePage(page);
            const entry = canvasState.nodes.find(n => n.data.id === nodeData.id);
            if (entry) {
              scheduleNodeSave(entry);
            }
          });
          
          inputWrapper.appendChild(inputEl);
          fieldRow.appendChild(inputWrapper);
          propGrid.appendChild(fieldRow);
        });

        mainWrapper.appendChild(propPanel);
      }
    }
  }
}

function createMapPropertyInputElement(field, value, onChange) {
  if (field.type === 'select' && field.options) {
    const select = document.createElement('select');
    select.style.cssText = 'width: 100%; background: transparent; border: none; outline: none; color: var(--text-primary); font-size: 0.68rem; padding: 2px 4px; height: 20px; cursor: pointer;';
    
    const optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = '—';
    select.appendChild(optNone);
    
    field.options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      if (o === value) opt.selected = true;
      select.appendChild(opt);
    });
    
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  const input = document.createElement('input');
  input.style.cssText = 'width: 100%; background: transparent; border: none; outline: none; color: var(--text-primary); font-size: 0.68rem; padding: 2px 4px; height: 20px;';
  
  if (field.type === 'number') {
    input.type = 'number';
    input.value = value;
    input.placeholder = '—';
  } else if (field.type === 'date') {
    input.type = 'date';
    input.value = value;
    input.style.colorScheme = 'dark';
  } else if (field.type === 'tags' || field.type === 'multiselect' || field.name.toLowerCase() === 'tags') {
    input.type = 'text';
    input.value = value;
    input.placeholder = 'tag1, tag2...';
  } else {
    input.type = 'text';
    input.value = value;
    input.placeholder = '—';
  }

  input.addEventListener('input', () => onChange(input.value));
  return input;
}


// Stat Block
async function renderStatBlock(body, nodeData) {
  const entry = canvasState.nodes.find(n => n.data.id === nodeData.id);
  if (!nodeData.content) nodeData.content = { fields: [] };
  if (!nodeData.content.fields) nodeData.content.fields = [];

  const pageId = nodeData.content?.pageId;
  let page = null;
  if (pageId) {
    try {
      page = await getPage(pageId);
    } catch (err) {
      console.warn('Failed to load page for statblock:', err);
    }
  }

  // Synchronize database properties to card fields if available
  if (page && page.properties) {
    let schema = null;
    if (page.schemaId) {
      try {
        schema = await getSchema(page.schemaId);
      } catch (_) {}
    }
    const schemaFields = schema ? (schema.fields || []) : [];
    let fieldsChanged = false;

    for (const [fieldId, val] of Object.entries(page.properties)) {
      const fieldDef = schemaFields.find(f => f.id === fieldId);
      const fieldLabel = fieldDef ? fieldDef.name : null;
      if (fieldLabel) {
        // Find existing key in fields
        const existingField = nodeData.content.fields.find(f => f.key.toLowerCase() === fieldLabel.toLowerCase());
        if (existingField) {
          if (existingField.value !== String(val)) {
            existingField.value = String(val);
            fieldsChanged = true;
          }
        } else {
          nodeData.content.fields.push({ key: fieldLabel, value: String(val) });
          fieldsChanged = true;
        }
      }
    }
    if (fieldsChanged && entry) {
      scheduleNodeSave(entry);
    }
  }

  // Update header icon with cover image if available
  const nodeEl = body.closest('.canvas-node') || entry?.el;
  if (nodeEl) {
    const iconEl = nodeEl.querySelector('.canvas-node-icon');
    if (iconEl) {
      if (page && page.coverImage) {
        iconEl.innerHTML = `<img src="${page.coverImage}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;display:inline-block;vertical-align:middle;border:1.5px solid rgba(255,255,255,0.25);box-shadow:0 2px 6px rgba(0,0,0,0.4);">`;
      } else {
        iconEl.innerHTML = '👤';
      }
    }
  }

  body.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;height:100%;padding:2px 0;';
  body.appendChild(wrap);

  const table = document.createElement('div');
  table.className = 'canvas-statblock';
  table.style.flex = '1';
  table.style.overflowY = 'auto';
  wrap.appendChild(table);

  const renderFields = () => {
    table.innerHTML = '';
    for (let i = 0; i < nodeData.content.fields.length; i++) {
      const f = nodeData.content.fields[i];
      const row = document.createElement('div');
      row.className = 'canvas-stat-row';
      row.innerHTML = `
        <input class="canvas-input stat-key" placeholder="Key" value="${escHtml(f.key)}"/>
        <input class="canvas-input stat-val" placeholder="Value" value="${escHtml(f.value)}"/>
        <button class="canvas-stat-del" title="Remove">✕</button>
      `;
      row.querySelector('.stat-key').addEventListener('input', e => { 
        f.key = e.target.value; 
        if (entry) scheduleNodeSave(entry); 
      });
      row.querySelector('.stat-val').addEventListener('input', async (e) => { 
        f.value = e.target.value; 
        if (entry) scheduleNodeSave(entry); 

        // Update database page property if it is linked
        if (pageId) {
          try {
            const pg = await getPage(pageId);
            if (pg && pg.properties) {
              let schema = null;
              if (pg.schemaId) {
                try { schema = await getSchema(pg.schemaId); } catch (_) {}
              }
              const schemaFields = schema ? (schema.fields || []) : [];
              const fieldDef = schemaFields.find(sf => sf.name.toLowerCase() === f.key.toLowerCase());
              if (fieldDef) {
                pg.properties[fieldDef.id] = f.value;
                await savePage(pg);
              }
            }
          } catch (err) {
            console.error('Failed to save statblock field change to database page:', err);
          }
        }
      });
      row.querySelector('.canvas-stat-del').addEventListener('click', () => {
        nodeData.content.fields.splice(i, 1);
        renderFields();
        if (entry) scheduleNodeSave(entry);
      });
      table.appendChild(row);
    }
    const addBtn = document.createElement('button');
    addBtn.className = 'canvas-stat-add';
    addBtn.textContent = '+ Add Field';
    addBtn.addEventListener('click', () => {
      nodeData.content.fields.push({ key: '', value: '' });
      renderFields();
    });
    table.appendChild(addBtn);
  };
  renderFields();
}

// Ability Card
function renderAbility(body, nodeData) {
  const entry = canvasState.nodes.find(n => n.data.id === nodeData.id);
  if (!nodeData.content) nodeData.content = {};
  const c = nodeData.content;

  const types = ['Melee', 'Ranged', 'AoE', 'Buff', 'Debuff', 'Ultimate', 'Passive'];

  body.innerHTML = `
    <div class="canvas-ability">
      <div class="canvas-ability-row">
        <input class="canvas-input" id="ab-name" placeholder="Ability name" value="${escHtml(c.name || '')}"/>
        <input class="canvas-input" id="ab-input" placeholder="Input (e.g. △△□)" value="${escHtml(c.input || '')}"/>
      </div>
      <select class="canvas-select" id="ab-type">
        ${types.map(t => `<option ${t === (c.abilityType || 'Melee') ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <textarea class="canvas-textarea" id="ab-desc" placeholder="Description…">${escHtml(c.description || '')}</textarea>
      <input class="canvas-input" id="ab-notes" placeholder="Balance / Combo notes…" value="${escHtml(c.notes || '')}"/>
    </div>
  `;

  const bind = (id, key) => body.querySelector(`#${id}`).addEventListener('input', (e) => {
    c[key] = e.target.value;
    if (entry) scheduleNodeSave(entry);
  });
  bind('ab-name', 'name');
  bind('ab-input', 'input');
  bind('ab-type', 'abilityType');
  bind('ab-desc', 'description');
  bind('ab-notes', 'notes');
}

// Timeline Event
function renderTimeline(body, nodeData) {
  const entry = canvasState.nodes.find(n => n.data.id === nodeData.id);
  if (!nodeData.content) nodeData.content = {};
  const c = nodeData.content;

  body.innerHTML = `
    <div class="canvas-timeline">
      <input class="canvas-input canvas-timeline-era" placeholder="Era / Date…" value="${escHtml(c.era || '')}"/>
      <input class="canvas-input canvas-timeline-title" placeholder="Event title…" value="${escHtml(c.title || '')}"/>
      <textarea class="canvas-textarea" placeholder="What happened…">${escHtml(c.description || '')}</textarea>
    </div>
  `;

  body.querySelector('.canvas-timeline-era').addEventListener('input', e => { c.era = e.target.value; if (entry) scheduleNodeSave(entry); });
  body.querySelector('.canvas-timeline-title').addEventListener('input', e => { c.title = e.target.value; if (entry) scheduleNodeSave(entry); });
  body.querySelector('textarea').addEventListener('input', e => { c.description = e.target.value; if (entry) scheduleNodeSave(entry); });
}

// Relationship Link
function renderLink(body, nodeData) {
  const entry = canvasState.nodes.find(n => n.data.id === nodeData.id);
  if (!nodeData.content) nodeData.content = {};
  const c = nodeData.content;

  const wrap = document.createElement('div');
  wrap.className = 'canvas-link-wrap';

  const buildLinkUI = async () => {
    const tabs = await getAllTabs();
    wrap.innerHTML = `
      <div class="canvas-link-icon">🔗</div>
      <select class="canvas-select" id="lk-target">
        <option value="">— Select a tab —</option>
        ${tabs.filter(t => t.id !== canvasState.tabId).map(t =>
          `<option value="${t.id}" ${t.id === c.targetTabId ? 'selected' : ''}>${escHtml(t.name)}</option>`
        ).join('')}
      </select>
      <input class="canvas-input" id="lk-label" placeholder="Relationship label (e.g. Rival of, Killed by)…" value="${escHtml(c.label || '')}"/>
      <textarea class="canvas-textarea" id="lk-note" placeholder="Notes…">${escHtml(c.note || '')}</textarea>
    `;

    const targetSelect = wrap.querySelector('#lk-target');
    targetSelect.addEventListener('change', async () => {
      c.targetTabId = targetSelect.value;
      if (entry) scheduleNodeSave(entry);
      // Navigate button
      let navBtn = wrap.querySelector('.canvas-link-nav');
      if (!navBtn) {
        navBtn = document.createElement('button');
        navBtn.className = 'btn btn-sm canvas-link-nav';
        navBtn.textContent = '→ Open Tab';
        navBtn.addEventListener('click', () => { if (c.targetTabId) navigate('workspace/' + c.targetTabId); });
        wrap.appendChild(navBtn);
      }
      navBtn.style.display = c.targetTabId ? 'block' : 'none';
    });

    if (c.targetTabId) {
      const navBtn = document.createElement('button');
      navBtn.className = 'btn btn-sm canvas-link-nav';
      navBtn.textContent = '→ Open Tab';
      navBtn.addEventListener('click', () => navigate('workspace/' + c.targetTabId));
      wrap.appendChild(navBtn);
    }

    wrap.querySelector('#lk-label').addEventListener('input', e => { c.label = e.target.value; if (entry) scheduleNodeSave(entry); });
    wrap.querySelector('#lk-note').addEventListener('input', e => { c.note = e.target.value; if (entry) scheduleNodeSave(entry); });
  };

  buildLinkUI();
  body.appendChild(wrap);
}

// Mood Board
function renderMoodboard(body, nodeData) {
  const entry = canvasState.nodes.find(n => n.data.id === nodeData.id);
  if (!nodeData.content) nodeData.content = { images: [] };
  if (!nodeData.content.images) nodeData.content.images = [];
  const images = nodeData.content.images;

  const grid = document.createElement('div');
  grid.className = 'canvas-moodboard-grid';

  const refresh = () => {
    grid.innerHTML = '';
    for (let i = 0; i < images.length; i++) {
      const src = images[i];
      const thumb = document.createElement('div');
      thumb.className = 'canvas-mood-thumb';
      thumb.innerHTML = `<img src="${src}" /><button class="canvas-mood-del" title="Remove">✕</button>`;
      thumb.querySelector('.canvas-mood-del').addEventListener('click', () => {
        images.splice(i, 1);
        refresh();
        if (entry) scheduleNodeSave(entry);
      });
      grid.appendChild(thumb);
    }
    // Add button
    const addThumb = document.createElement('div');
    addThumb.className = 'canvas-mood-add';
    addThumb.innerHTML = '<span>+</span>';
    addThumb.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = (e) => {
        for (const file of e.target.files) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            images.push(ev.target.result);
            refresh();
            if (entry) scheduleNodeSave(entry);
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    });
    grid.appendChild(addThumb);
  };

  refresh();
  body.appendChild(grid);
}

// Quote
function renderQuote(body, nodeData) {
  const entry = canvasState.nodes.find(n => n.data.id === nodeData.id);
  if (!nodeData.content) nodeData.content = {};
  const c = nodeData.content;

  body.innerHTML = `
    <div class="canvas-quote-wrap">
      <div class="canvas-quote-mark">"</div>
      <textarea class="canvas-textarea canvas-quote-text" placeholder="The words they spoke…">${escHtml(c.text || '')}</textarea>
      <input class="canvas-input canvas-quote-speaker" placeholder="— Speaker name…" value="${escHtml(c.speaker || '')}"/>
    </div>
  `;

  body.querySelector('.canvas-quote-text').addEventListener('input', e => { c.text = e.target.value; if (entry) scheduleNodeSave(entry); });
  body.querySelector('.canvas-quote-speaker').addEventListener('input', e => { c.speaker = e.target.value; if (entry) scheduleNodeSave(entry); });
}

// Rich Page Link Card Renderer
async function renderPageLink(body, nodeData) {
  const entry = canvasState.nodes.find(n => n.data.id === nodeData.id);
  if (!nodeData.content) nodeData.content = {};
  const c = nodeData.content;

  body.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;height:100%;padding:2px 0;';
  body.appendChild(wrap);

  if (!c.pageId) {
    wrap.innerHTML = `
      <p style="font-size:11px;color:var(--text-muted);margin:0 0 4px 0;line-height:1.4;">Link this card to a database entry:</p>
      <select class="canvas-select" id="page-select" style="width:100%;font-size:11px;"><option value="">— Select entry —</option></select>`;
    const select = wrap.querySelector('#page-select');
    try {
      const proj = await getActiveProject();
      if (proj) {
        const pages = await getPages(proj.id);
        pages.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        pages.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id; opt.textContent = p.title || 'Unnamed';
          select.appendChild(opt);
        });
      }
    } catch (e) { console.error('renderPageLink: error loading pages', e); }
    select.addEventListener('change', async () => {
      const pageId = select.value;
      if (!pageId) return;
      c.pageId = pageId;
      const pg = await getPage(pageId);
      if (pg) {
        nodeData.title = pg.title || 'Unnamed';
        const titleEl = entry?.el.querySelector('.canvas-node-title');
        if (titleEl) titleEl.textContent = nodeData.title;
      }
      await saveNode(nodeData);
      await renderNodeBody(body, nodeData);
      if (canvasState.tab && canvasState.tab.beatId) {
        await syncBeatWithCanvas();
      }
    });
    return;
  }

  // Loading skeleton
  wrap.innerHTML = `<div style="display:flex;flex-direction:column;gap:7px;padding:4px 0;opacity:0.6;">
    <div style="height:9px;background:rgba(255,255,255,0.06);border-radius:4px;width:40%;"></div>
    <div style="height:13px;background:rgba(255,255,255,0.08);border-radius:4px;width:80%;"></div>
    <div style="height:9px;background:rgba(255,255,255,0.05);border-radius:4px;width:90%;"></div>
    <div style="height:9px;background:rgba(255,255,255,0.04);border-radius:4px;width:60%;"></div>
  </div>`;

  let page;
  try { page = await getPage(c.pageId); } catch (err) { console.error('renderPageLink: getPage failed', err); }

  const nodeEl = body.closest('.canvas-node') || entry?.el;

  if (!page) {
    if (nodeEl) {
      const iconEl = nodeEl.querySelector('.canvas-node-icon');
      if (iconEl) iconEl.innerHTML = '📄';
    }
    wrap.innerHTML = `
      <div style="font-size:11px;color:var(--accent-red);margin-bottom:8px;">⚠️ Linked entry not found.</div>
      <button id="relink-btn" style="width:100%;padding:5px 8px;font-size:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:5px;color:var(--text-secondary);cursor:pointer;">Select Another Entry</button>`;
    wrap.querySelector('#relink-btn').addEventListener('click', async () => {
      c.pageId = '';
      await saveNode(nodeData);
      await renderNodeBody(body, nodeData);
      if (canvasState.tab && canvasState.tab.beatId) {
        await syncBeatWithCanvas();
      }
    });
    return;
  }

  // Update header icon with cover image if available (making it larger: 28px * 28px)
  if (nodeEl) {
    const iconEl = nodeEl.querySelector('.canvas-node-icon');
    if (iconEl) {
      if (page.coverImage) {
        iconEl.innerHTML = `<img src="${page.coverImage}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;display:inline-block;vertical-align:middle;border:1.5px solid rgba(255,255,255,0.25);box-shadow:0 2px 6px rgba(0,0,0,0.4);">`;
      } else {
        iconEl.innerHTML = '📄';
      }
    }
  }

  // Schema info
  let schemaName = '', schemaColor = 'var(--accent-primary)';
  if (page.schemaId) {
    try {
      const schema = await getSchema(page.schemaId);
      if (schema) { schemaName = schema.name; schemaColor = schema.color || schemaColor; }
    } catch (_) {}
  }

  // Helper: compute word count from Quill delta or plain text
  function getWordCount(delta) {
    if (!delta) return 0;
    try {
      const parsed = typeof delta === 'string' ? JSON.parse(delta) : delta;
      if (parsed && Array.isArray(parsed.ops)) {
        const text = parsed.ops.map(op => (typeof op.insert === 'string' ? op.insert : '')).join('');
        return text.trim().split(/\s+/).filter(w => w.length > 0).length;
      }
    } catch (_) {}
    const stripped = String(delta).replace(/<[^>]+>/g, ' ').trim();
    return stripped ? stripped.split(/\s+/).filter(w => w.length > 0).length : 0;
  }

  // Save current word count to canvas node state so progress ring can read it synchronously
  c.dbWordCount = getWordCount(page.content);
  renderWordGoalRing(nodeData);

  const props = Object.entries(page.properties || {}).filter(([, v]) => v && String(v).trim());
  const propGrid = props.slice(0, 4).map(([k, v]) => `
    <div style="display:flex;gap:4px;align-items:baseline;overflow:hidden;">
      <span style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;flex-shrink:0;font-family:var(--font-hud);">${escHtml(k)}</span>
      <span style="font-size:10px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(String(v).slice(0, 40))}</span>
    </div>`).join('');

  wrap.innerHTML = `
    ${schemaName ? `<div style="display:flex;align-items:center;gap:5px;margin-bottom:2px;">
      <span style="width:7px;height:7px;border-radius:50%;background:${schemaColor};flex-shrink:0;display:inline-block;"></span>
      <span style="font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:${schemaColor};font-family:var(--font-hud);font-weight:600;">${escHtml(schemaName)}</span>
    </div>` : ''}
    <div style="font-size:12px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px;" title="${escHtml(page.title || '')}">${escHtml(page.title || 'Unnamed')}</div>
    ${propGrid ? `<div style="display:flex;flex-direction:column;gap:2px;background:rgba(0,0,0,0.25);border-radius:6px;padding:5px 7px;border:1px solid rgba(255,255,255,0.04);margin-bottom:4px;">${propGrid}</div>` : ''}
    <div class="canvas-richtext-editor-mount" style="flex:1;min-height:80px;display:flex;flex-direction:column;"></div>
    <div style="margin-top:auto;display:flex;gap:4px;padding-top:4px;">
      <button id="open-page-btn" style="flex:1;padding:5px 8px;font-size:10px;background:var(--accent-primary-dim);border:1px solid var(--accent-primary-glow);border-radius:5px;color:var(--accent-primary);cursor:pointer;font-family:var(--font-hud);letter-spacing:0.04em;text-transform:uppercase;transition:background 0.15s;">Open Entry ↗</button>
      <button id="relink-page-btn" title="Change linked entry" style="padding:5px 8px;font-size:11px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:5px;color:var(--text-muted);cursor:pointer;transition:all 0.15s;">⇄</button>
    </div>`;

  const editorMount = wrap.querySelector('.canvas-richtext-editor-mount');
  const editor = await createEditor(editorMount, {
    placeholder: 'Write database page content here…',
    initialContent: page.content || '',
    minimal: true
  });

  if (entry) {
    entry.quillEditor = editor;
  }

  editor.quill.on('text-change', () => {
    const content = editor.getContent();
    c.dbWordCount = getWordCount(content);
    renderWordGoalRing(nodeData);

    // Save changes to database page content
    getPage(c.pageId).then(async pg => {
      if (pg) {
        pg.content = content;
        await savePage(pg);
      }
    }).catch(err => console.error('Failed to save page content changes from canvas editor:', err));
  });

  const openPageBtn = wrap.querySelector('#open-page-btn');
  openPageBtn.addEventListener('mouseenter', e => { e.currentTarget.style.background = 'var(--accent-primary-glow)'; });
  openPageBtn.addEventListener('mouseleave', e => { e.currentTarget.style.background = 'var(--accent-primary-dim)'; });
  openPageBtn.addEventListener('click', () => navigate('page/' + c.pageId));
  wrap.querySelector('#relink-page-btn').addEventListener('click', async () => {
    c.pageId = '';
    if (nodeEl) {
      const iconEl = nodeEl.querySelector('.canvas-node-icon');
      if (iconEl) iconEl.innerHTML = '📄';
    }
    await saveNode(nodeData);
    await renderNodeBody(body, nodeData);
    if (canvasState.tab && canvasState.tab.beatId) {
      await syncBeatWithCanvas();
    }
  });
}

// ─── Save Debounce ───────────────────────────────────────────────────────────

async function syncBeatCharactersToCanvas(beat) {
  if (!beat) return;

  const detailsNode = canvasState.nodes.find(n => n.data.isBeatDetails) || canvasState.nodes.find(n => n.data.type === 'richtext');
  
  // Sync linked characters/entities (add/remove nodes dynamically)
  const newCharIds = beat.properties?.characters || [];
  const currentCharacterNodes = canvasState.nodes.filter(n => n.data.content?.pageId || n.data.pageId);
  const currentCharIds = currentCharacterNodes.map(n => n.data.content?.pageId || n.data.pageId);

  let nodesChanged = false;

  // Remove deleted characters from canvas
  const toDelete = [];
  for (const node of currentCharacterNodes) {
    const charId = node.data.content?.pageId || node.data.pageId;
    if (!newCharIds.includes(charId)) {
      toDelete.push(node);
    }
  }

  for (const node of toDelete) {
    if (canvasState.saveTimers[node.data.id]) {
      clearTimeout(canvasState.saveTimers[node.data.id]);
      delete canvasState.saveTimers[node.data.id];
    }
    await deleteNode(node.data.id);
    node.el.remove();
    
    // Clean up connections involving this node
    if (canvasState.tab.connections) {
      canvasState.tab.connections = canvasState.tab.connections.filter(c => c.sourceId !== node.data.id && c.targetId !== node.data.id);
    }
    nodesChanged = true;
  }

  if (toDelete.length > 0) {
    const deletedIds = new Set(toDelete.map(n => n.data.id));
    canvasState.nodes = canvasState.nodes.filter(n => !deletedIds.has(n.data.id));
  }

  let offsetX = 80;
  let offsetY = 320;
  if (canvasState.nodes.length > 0) {
    const maxYNode = canvasState.nodes.reduce((max, n) => n.data.y > max.data.y ? n : max, canvasState.nodes[0]);
    offsetY = maxYNode.data.y + 200;
  }

  const validCharIds = [];

  for (const charId of newCharIds) {
    let pg = null;
    try {
      pg = await getPage(charId);
    } catch (_) {}

    if (!pg) {
      // Filter out invalid/deleted database pages
      nodesChanged = true;
      continue;
    }

    validCharIds.push(charId);

    if (!currentCharIds.includes(charId)) {
      let charTitle = pg.title || 'Unnamed Entry';
      let nodeType = 'pagelink';
      let nodeWidth = 340;
      let nodeHeight = 220;
      let nodeContent = { pageId: charId };

      let isMap = false;
      const mapIds = ['dnd-maps-schema', 'story-maps-schema', 'story-locs-schema', 'locations'];
      if (mapIds.includes(pg.schemaId)) {
        isMap = true;
      } else if (pg.schemaId) {
        try {
          const schema = await getSchema(pg.schemaId);
          if (schema && mapIds.includes(schema.templateId)) {
            isMap = true;
          }
        } catch (_) {}
      }
      if (isMap) {
        nodeType = 'map';
        nodeWidth = 500;
        nodeHeight = 400;
      }

      const newNodeData = {
        id: generateId(),
        tabId: canvasState.tabId,
        type: nodeType,
        x: offsetX,
        y: offsetY,
        width: nodeWidth,
        height: nodeHeight,
        color: '',
        content: nodeContent,
        title: charTitle,
        _isNew: true
      };

      await saveNode(newNodeData);
      mountNode(newNodeData);

      // Automatically link new character card to synopsis details node
      if (!canvasState.tab.connections) canvasState.tab.connections = [];

      if (detailsNode) {
        canvasState.tab.connections.push({
          id: generateId(),
          sourceId: detailsNode.data.id,
          targetId: newNodeData.id
        });
      }

      // Find other character cards on the canvas to link them sequentially
      const otherCharNodes = canvasState.nodes.filter(n => (n.data.content?.pageId || n.data.pageId) && n.data.id !== newNodeData.id);
      if (otherCharNodes.length > 0) {
        const lastCharNode = otherCharNodes[otherCharNodes.length - 1];
        canvasState.tab.connections.push({
          id: generateId(),
          sourceId: lastCharNode.data.id,
          targetId: newNodeData.id
        });
      }

      nodesChanged = true;

      offsetX += 300;
      if (offsetX > 980) {
        offsetX = 80;
        offsetY += 200;
      }
    }
  }

  // Update beat properties if we filtered out deleted/invalid IDs
  if (validCharIds.length !== newCharIds.length) {
    if (!beat.properties) beat.properties = {};
    beat.properties.characters = validCharIds;
    await savePage(beat);
  }

  if (nodesChanged) {
    await saveTab(canvasState.tab);
    await flushFileAutosave();
  }
}

async function syncBeatWithCanvas() {
  if (!canvasState.tab || !canvasState.tab.beatId) return;

  try {
    const beatId = canvasState.tab.beatId;
    const beat = await getPage(beatId);
    if (!beat) return;

    let changed = false;

    // Find details node (either marked with isBeatDetails, or the first rich text node)
    const detailsNode = canvasState.nodes.find(n => n.data.isBeatDetails) || canvasState.nodes.find(n => n.data.type === 'richtext');
    if (detailsNode) {
      // Sync Title
      const newTitle = (detailsNode.data.title || '').trim();
      if (newTitle && beat.title !== newTitle) {
        beat.title = newTitle;
        changed = true;

        if (canvasState.tab.name !== newTitle) {
          canvasState.tab.name = newTitle;
          await saveTab(canvasState.tab);
          if (window.setTabTitle) {
            window.setTabTitle(newTitle);
          }
        }
      }

      // Sync Content / Synopsis
      const rawDelta = detailsNode.data.content?.delta || '';
      const newContent = extractSynopsisFromDelta(rawDelta, beat.title);
      if (beat.content !== newContent) {
        beat.content = newContent;
        changed = true;
      }
    }

    // Sync character page links that have a connection to the details card
    let newCharIds = [];
    if (detailsNode) {
      const connections = canvasState.tab.connections || [];
      const linkedNodeIds = new Set();
      connections.forEach(c => {
        if (c.sourceId === detailsNode.data.id) linkedNodeIds.add(c.targetId);
        if (c.targetId === detailsNode.data.id) linkedNodeIds.add(c.sourceId);
      });
      const characterNodes = canvasState.nodes.filter(n => linkedNodeIds.has(n.data.id) && (n.data.content?.pageId || n.data.pageId));
      newCharIds = characterNodes.map(n => n.data.content?.pageId || n.data.pageId);
    } else {
      const characterNodes = canvasState.nodes.filter(n => n.data.content?.pageId || n.data.pageId);
      newCharIds = characterNodes.map(n => n.data.content?.pageId || n.data.pageId);
    }
    const oldCharIds = beat.properties?.characters || [];

    const sortedNew = [...newCharIds].sort();
    const sortedOld = [...oldCharIds].sort();

    if (JSON.stringify(sortedNew) !== JSON.stringify(sortedOld)) {
      if (!beat.properties) beat.properties = {};
      beat.properties.characters = newCharIds;
      changed = true;
    }

    if (changed) {
      canvasState.isSyncing = true;
      try {
        await savePage(beat);
        window.dispatchEvent(new CustomEvent('forge-db-updated', {
          detail: { type: 'db-updated', action: 'save', storeName: 'pages', id: beat.id }
        }));
      } finally {
        canvasState.isSyncing = false;
      }
    }
  } catch (err) {
    console.error('Failed to sync story beat with canvas:', err);
  }
}

function extractSynopsisFromDelta(deltaStr, titleToExclude) {
  if (!deltaStr) return '';
  try {
    const parsed = typeof deltaStr === 'string' ? JSON.parse(deltaStr) : deltaStr;
    if (parsed && Array.isArray(parsed.ops)) {
      let currentLineText = '';
      let isHeader = false;
      const lines = [];

      for (const op of parsed.ops) {
        if (typeof op.insert === 'string') {
          const parts = op.insert.split('\n');
          for (let i = 0; i < parts.length; i++) {
            currentLineText += parts[i];

            if (i < parts.length - 1) {
              if (op.attributes && op.attributes.header) {
                isHeader = true;
              }

              if (isHeader && titleToExclude && currentLineText.trim().toLowerCase() === titleToExclude.trim().toLowerCase() && lines.length === 0) {
                // Skip the first title header line
              } else {
                lines.push(currentLineText);
              }

              currentLineText = '';
              isHeader = false;
            }
          }
        }
      }

      if (currentLineText.trim()) {
        lines.push(currentLineText);
      }

      return lines.join('\n').trim();
    }
  } catch (_) {}
  
  // Handled plain text or HTML
  let text = String(deltaStr || '').trim();
  if (text.includes('<') && text.includes('>')) {
    const tmp = document.createElement('div');
    tmp.innerHTML = text;
    if (titleToExclude) {
      const h2 = tmp.querySelector('h2');
      if (h2 && h2.textContent.trim().toLowerCase() === titleToExclude.trim().toLowerCase()) {
        h2.remove();
      }
    }
    text = tmp.textContent || tmp.innerText || '';
  }
  return text.trim();
}

function scheduleNodeSave(entry, mutate) {
  if (mutate) mutate();
  clearTimeout(canvasState.saveTimers[entry.data.id]);
  canvasState.saveTimers[entry.data.id] = setTimeout(async () => {
    // Check if the tab is still open to prevent out-of-context background saves (Bug 28)
    if (canvasState.tabId !== entry.data.tabId) {
      return;
    }
    await saveNode(entry.data);
    updateMinimap();

    if (canvasState.tab && canvasState.tab.beatId) {
      await syncBeatWithCanvas();
    }
  }, SAVE_DEBOUNCE);
}

// ─── Tab Creation Modal (called from sidebar) ────────────────────────────────

export function showCreateTabModal(onCreate) {
  showModal({
    title: 'New Workspace Tab',
    fields: [
      { key: 'name', label: 'Tab name', placeholder: 'e.g. Kairo, The Abyss, Act 1…' },
      { key: 'icon', label: 'Icon (lucide name)', placeholder: 'file-text', value: 'file-text' },
    ],
    onConfirm: async (values) => {
      const name = (values.name || '').trim();
      if (!name) { showToast('Please enter a tab name', 'error'); return false; }
      const icon = (values.icon || 'file-text').trim() || 'file-text';
      onCreate({ name, icon });
    },
  });
}
// ─── Generic Modal Helper ────────────────────────────────────────────────────

function showModal({ title, fields = [], onConfirm }) {
  // Remove any existing modal
  document.querySelector('.forge-modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'forge-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'forge-modal';
  modal.innerHTML = `
    <div class="forge-modal-header">
      <h2 class="forge-modal-title">${escHtml(title)}</h2>
      <button class="forge-modal-close">✕</button>
    </div>
    <div class="forge-modal-body">
      ${fields.map(f => `
        <div class="forge-modal-field">
          <label class="forge-modal-label">${escHtml(f.label)}</label>
          <input class="forge-modal-input" data-key="${escHtml(f.key)}" placeholder="${escHtml(f.placeholder || '')}" value="${escHtml(f.value || '')}"/>
        </div>
      `).join('')}
    </div>
    <div class="forge-modal-footer">
      <button class="btn btn-secondary forge-modal-cancel">Cancel</button>
      <button class="btn btn-primary forge-modal-confirm">Confirm</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const getValues = () => {
    const v = {};
    modal.querySelectorAll('[data-key]').forEach(el => { v[el.dataset.key] = el.value; });
    return v;
  };

  const close = () => {
    if (document.activeElement) document.activeElement.blur();
    document.body.focus();
    overlay.remove();
  };
  modal.querySelector('.forge-modal-close').addEventListener('click', close);
  modal.querySelector('.forge-modal-cancel').addEventListener('click', close);
  modal.querySelector('.forge-modal-confirm').addEventListener('click', async () => {
    const res = await onConfirm(getValues());
    if (res === false) return;
    close();
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // Add keydown handler on inputs to allow Enter to confirm, and Escape to close
  modal.querySelectorAll('input').forEach(input => {
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const res = await onConfirm(getValues());
        if (res === false) return;
        close();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });
  });

  // Focus first input
  setTimeout(() => modal.querySelector('input')?.focus(), 50);
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function callOllamaDirect(systemInstruction, userPrompt, model, baseUrl) {
  const url = `${baseUrl}/api/chat`;
  const messages = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: userPrompt }
  ];
  
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      format: 'json',
      stream: false
    })
  });

  if (!resp.ok) {
    throw new Error(`Ollama HTTP error ${resp.status}`);
  }

  const data = await resp.json();
  const text = data.message?.content;
  if (!text) throw new Error('No content returned from local Ollama.');
  return text;
}

async function callGeminiDirect(systemInstruction, userPrompt, apiKey) {
  const provider = localStorage.getItem('forge-ai-provider') || 'gemini';
  if (provider === 'ollama') {
    const oModel = localStorage.getItem('forge-ollama-model') || 'llama3';
    const oUrl = localStorage.getItem('forge-ollama-url') || 'http://localhost:11434';
    return callOllamaDirect(systemInstruction, userPrompt, oModel, oUrl);
  }

  const models = ['gemini-2.5-flash'];
  let lastError = null;

  const payload = {
    contents: [
      { role: 'user', parts: [{ text: userPrompt }] }
    ],
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      responseMimeType: 'application/json'
    }
  };

  for (const model of models) {
    console.log(`Attempting direct Gemini request with model: ${model}`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (resp.status === 503 || resp.status === 429 || resp.status >= 500) {
          const delay = attempt * 1000;
          console.warn(`Direct Gemini API returned status ${resp.status} on attempt ${attempt} for model ${model}. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        if (!resp.ok) {
          const errorBody = await resp.json().catch(() => ({}));
          throw new Error(errorBody.error?.message || `HTTP error ${resp.status}`);
        }

        const result = await resp.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('No content returned from Gemini.');
        
        console.log(`Direct Gemini request succeeded with model: ${model}`);
        return text;
      } catch (err) {
        lastError = err;
        console.error(`Attempt ${attempt} for model ${model} failed:`, err.message);
        if (err.message.includes('400') || err.message.includes('Bad Request') || err.message.includes('not found')) {
          break; // Try next model immediately
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  throw lastError || new Error('All model attempts failed');
}

function sanitizeJsonString(str) {
  let clean = str.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```[a-zA-Z0-9]*\n/, '');
    clean = clean.replace(/\n```$/, '');
  }
  return clean.trim();
}

async function expandNodeWithAi(nodeData, text) {
  const nodeEl = document.querySelector(`[data-node-id="${nodeData.id}"]`);
  const btn = nodeEl?.querySelector('.canvas-node-ai-expand-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '✨ Thinking...';
  }

  showToast('AI is expanding this concept...', 'info');

  const provider = localStorage.getItem('forge-ai-provider') || 'gemini';
  const apiKey = localStorage.getItem('forge-gemini-key');

  try {
    let responseText = '';
    
    if (provider === 'ollama' || apiKey) {
      const systemInstruction = `You are an AI assistant helping a game designer expand ideas on a canvas board.
The designer has a node with title "${nodeData.title}" and content: "${text}".
Generate exactly 3 related cards of any type: 'richtext', 'statblock', 'ability', 'timeline', 'quote'.
Position the nodes in a clean cluster around the center (original node is at x: ${nodeData.x}, y: ${nodeData.y}).
Choose coordinates that space them out nicely around the original node, offset by about 320 to 450px so they do not overlap.
Return a JSON object conforming to this schema:
{
  "nodes": [
    {
      "type": "richtext" | "statblock" | "ability" | "timeline" | "quote",
      "title": "Title of new card",
      "content": { ... }, // fitting the node type, e.g. for richtext: { "delta": "<p>Content...</p>" }, for statblock: { "fields": [{"key": "Field", "value": "Val"}] }, for timeline: { "era": "date", "title": "event title", "description": "desc" }, for quote: { "speaker": "name", "text": "words" }
      "x": number,
      "y": number,
      "width": number,
      "height": number
    }
  ],
  "connections": [
    {
      "sourceIndex": -1, // -1 means the original node
      "targetIndex": number, // 0-based index of the new node in the nodes array
      "label": "short label describing the relationship"
    }
  ]
}`;
      responseText = await callGeminiDirect(systemInstruction, `Expand this concept: ${nodeData.title}`, apiKey);
    } else {
      // Mock / Offline Simulator Mode
      await new Promise(r => setTimeout(r, 1200));
      const simulatedData = {
        nodes: [
          {
            type: 'richtext',
            title: `Themes of ${nodeData.title}`,
            content: { delta: `<p>Explore the core narrative themes, aesthetic tone, and world impact of <strong>${nodeData.title}</strong>.</p>` },
            x: nodeData.x + 360,
            y: nodeData.y,
            width: 300,
            height: 180
          },
          {
            type: 'ability',
            title: `${nodeData.title} Spell`,
            content: { name: `${nodeData.title} Trigger`, input: '△□◯', abilityType: 'AoE', description: `A custom combat spell derived from ${nodeData.title}.` },
            x: nodeData.x - 360,
            y: nodeData.y,
            width: 340,
            height: 220
          },
          {
            type: 'quote',
            title: `${nodeData.title} Dialogue`,
            content: { speaker: 'Protagonist', text: `This represents the fallout of ${nodeData.title}. We must stand together.` },
            x: nodeData.x,
            y: nodeData.y + 300,
            width: 300,
            height: 180
          }
        ],
        connections: [
          { sourceIndex: -1, targetIndex: 0, label: 'Thematic Link' },
          { sourceIndex: -1, targetIndex: 1, label: 'Combat Affinity' },
          { sourceIndex: -1, targetIndex: 2, label: 'Verbal Climax' }
        ]
      };
      responseText = JSON.stringify(simulatedData);
      showToast('Simulating: Configure a Gemini Key in Settings for live AI.', 'warning');
    }

    const cleanJson = sanitizeJsonString(responseText);
    const result = JSON.parse(cleanJson);
    
    if (result && Array.isArray(result.nodes)) {
      const newIds = [];
      
      // Save and mount new nodes
      for (let i = 0; i < result.nodes.length; i++) {
        const n = result.nodes[i];
        const newId = generateId();
        newIds.push(newId);

        // Fallback coordinates if zero or overlapping
        const fallbackX = nodeData.x + (i === 0 ? 360 : i === 1 ? -360 : 0);
        const fallbackY = nodeData.y + (i === 2 ? 300 : -50);

        const nodeObj = {
          id: newId,
          tabId: canvasState.tabId,
          type: n.type || 'richtext',
          title: n.title || 'Related Idea',
          content: n.content || {},
          x: n.x || fallbackX,
          y: n.y || fallbackY,
          width: n.width || 300,
          height: n.height || 200,
          zIndex: ++canvasState.maxZ
        };

        await saveNode(nodeObj);
        mountNode(nodeObj);
      }

      // Add connections
      if (!canvasState.tab.connections) canvasState.tab.connections = [];
      if (Array.isArray(result.connections)) {
        result.connections.forEach(conn => {
          let sourceId = null;
          let targetId = null;

          if (conn.sourceIndex === -1) {
            sourceId = nodeData.id;
          } else if (typeof conn.sourceIndex === 'number' && newIds[conn.sourceIndex]) {
            sourceId = newIds[conn.sourceIndex];
          }

          if (typeof conn.targetIndex === 'number' && newIds[conn.targetIndex]) {
            targetId = newIds[conn.targetIndex];
          }

          if (sourceId && targetId) {
            canvasState.tab.connections.push({
              id: generateId(),
              sourceId,
              targetId,
              label: conn.label || ''
            });
          }
        });
      }

      await saveTab(canvasState.tab);
      drawConnections();
      updateMinimap();
      playZapSound();
      showToast('Concept expanded successfully!', 'success');
    }
  } catch (err) {
    console.error('AI Expansion error:', err);
    showToast('Failed to expand concept: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '✨ Expand with AI';
    }
  }
}

async function promptAiCanvasGeneration() {
  const overlay = document.createElement('div');
  overlay.className = 'forge-modal-overlay';
  overlay.style.zIndex = '99999';

  const modal = document.createElement('div');
  modal.className = 'forge-modal';
  modal.style.width = '400px';
  modal.innerHTML = `
    <div class="forge-modal-header">
      <h2 class="forge-modal-title">🪄 AI Canvas Spawner</h2>
      <button class="forge-modal-close">✕</button>
    </div>
    <div class="forge-modal-body" style="display:flex; flex-direction:column; gap: var(--sp-4);">
      <p style="font-size:0.75rem; color:var(--text-muted); line-height:1.4;">
        Describe the layout, system, or sequence of concepts you would like to generate. The AI will place cards and connect them automatically.
      </p>
      <div class="forge-modal-field">
        <label class="forge-modal-label">What should we generate?</label>
        <textarea class="canvas-textarea" id="ai-prompt-input" style="height:80px;" placeholder="e.g. Design a combat ability tree for a Fire Mage class, or Map out the main factions and their conflicts..."></textarea>
      </div>
    </div>
    <div class="forge-modal-footer">
      <button class="btn btn-secondary forge-modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="ai-generate-confirm">Generate Layout</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  modal.querySelector('.forge-modal-close').addEventListener('click', () => overlay.remove());
  modal.querySelector('.forge-modal-cancel').addEventListener('click', () => overlay.remove());

  const generateBtn = modal.querySelector('#ai-generate-confirm');
  const promptInput = modal.querySelector('#ai-prompt-input');

  generateBtn.addEventListener('click', async () => {
    const promptText = promptInput.value.trim();
    if (!promptText) {
      showToast('Please type a generation prompt.', 'warning');
      return;
    }

    // Set loading state on modal body and hide footer to preserve the header close button (Bug 18)
    const modalBody = modal.querySelector('.forge-modal-body');
    const modalFooter = modal.querySelector('.forge-modal-footer');
    if (modalBody) {
      modalBody.innerHTML = `
        <div style="padding: 40px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: var(--sp-4); width: 100%;">
          <div style="font-size: 2rem; animation: spin 2s linear infinite;">🪄</div>
          <h3 style="color:#fff; font-family:var(--font-heading);">Generating Concept Board</h3>
          <p style="font-size:0.75rem; color:var(--text-muted);">Consulting Ignis and building node grid layout...</p>
        </div>
      `;
    }
    if (modalFooter) {
      modalFooter.style.display = 'none';
    }

    const provider = localStorage.getItem('forge-ai-provider') || 'gemini';
    const apiKey = localStorage.getItem('forge-gemini-key');

    try {
      let responseText = '';
      if (provider === 'ollama' || apiKey) {
        const systemInstruction = `You are an AI assistant helping a game designer spawn a layout of nodes or modify an active canvas board.
The user wants to perform: "${promptText}".

You can execute one of the following operations:

1. Spawn layout of new nodes (use when they want to create/design cards or maps):
{
  "action": "spawn_nodes",
  "nodes": [
    {
      "type": "richtext" | "statblock" | "ability" | "timeline" | "quote",
      "title": "Title of card",
      "content": { ... },
      "x": number,
      "y": number,
      "width": number,
      "height": number
    }
  ],
  "connections": [
    {
      "sourceIndex": number,
      "targetIndex": number,
      "label": "short relationship label"
    }
  ]
}

2. Rearrange nodes on active canvas (layout: "grid" | "row" | "column" | "circle"):
{
  "action": "rearrange_nodes",
  "layout": "circle",
  "nodeTitles": ["Kaelen"] // optional
}

3. Destroy/delete nodes:
{
  "action": "destroy_nodes",
  "nodeTitles": ["Kaelen"]
}

4. Unlink/disconnect connections between nodes (to unlink all, use unlinkAll: true):
{
  "action": "unlink_nodes",
  "links": [
    { "sourceTitle": "Kaelen", "targetTitle": "Stormbringer" }
  ]
}

5. Link/connect existing nodes:
{
  "action": "link_nodes",
  "links": [
    { "sourceTitle": "Kaelen", "targetTitle": "Stormbringer", "label": "Wields" }
  ]
}

6. Focus viewport camera on a node:
{
  "action": "focus_node",
  "nodeTitle": "Kaelen"
}

Determine which operation the user wants to execute and output a single JSON object conforming to its schema. Do not output markdown code blocks in the JSON itself or any other text, just the raw JSON.`;
        responseText = await callGeminiDirect(systemInstruction, `Execute action: ${promptText}`, apiKey);
      } else {
        // Simulated fallback
        await new Promise(r => setTimeout(r, 1500));
        const lowercase = promptText.toLowerCase();
        let simulatedData = null;
        
        if (lowercase.includes('delete') || lowercase.includes('destroy') || lowercase.includes('remove node')) {
          const matchedTitles = canvasState.nodes.map(n => n.data.title).filter(t => lowercase.includes(t.toLowerCase()));
          simulatedData = {
            action: 'destroy_nodes',
            nodeTitles: matchedTitles.length > 0 ? matchedTitles : []
          };
        } else if (lowercase.includes('unlink') || lowercase.includes('disconnect') || lowercase.includes('sever')) {
          const matchedTitles = canvasState.nodes.map(n => n.data.title).filter(t => lowercase.includes(t.toLowerCase()));
          simulatedData = {
            action: 'unlink_nodes',
            unlinkAll: matchedTitles.length < 2,
            links: matchedTitles.length >= 2 ? [{ sourceTitle: matchedTitles[0], targetTitle: matchedTitles[1] }] : []
          };
        } else {
          // Default: spawn nodes
          simulatedData = {
            action: 'spawn_nodes',
            nodes: [
              {
                type: 'richtext',
                title: 'Combat System Overview',
                content: { delta: '<p>A balanced action-combat cycle incorporating dodging, resource pools, and cooldown sweeps.</p>' },
                x: -200, y: -100, width: 300, height: 180
              },
              {
                type: 'ability',
                title: 'Primary Slash',
                content: { name: 'Quick Slice', input: '◯', abilityType: 'Melee', description: 'Standard quick slash. Restores 5 focus on hit.' },
                x: 200, y: -180, width: 340, height: 220
              },
              {
                type: 'ability',
                title: 'Dodge Roll',
                content: { name: 'Tumble Escape', input: 'R1', abilityType: 'Buff', description: 'Invulnerability frames for 0.4s.' },
                x: 200, y: 80, width: 340, height: 220
              },
              {
                type: 'quote',
                title: 'Designer Maxim',
                content: { speaker: 'Director', text: 'Players should always feel like defeat is their own mechanical error, not a balance oversight.' },
                x: -200, y: 150, width: 300, height: 180
              }
            ],
            connections: [
              { sourceIndex: 0, targetIndex: 1, label: 'Standard Attack' },
              { sourceIndex: 0, targetIndex: 2, label: 'Evasion Loop' },
              { sourceIndex: 3, targetIndex: 0, label: 'Design Directive' }
            ]
          };
        }
        responseText = JSON.stringify(simulatedData);
        showToast('Simulating: Configure a Gemini Key in Settings for live AI.', 'warning');
      }

      // Check if user has closed the modal during the network call (Bug 17)
      if (!document.body.contains(overlay)) {
        return;
      }

      const cleanJson = sanitizeJsonString(responseText);
      const result = JSON.parse(cleanJson);

      if (result) {
        if (!document.body.contains(overlay)) return; // Double check in case closed during parsing
        let action = result.action ? normalizeActionName(result.action) : null;
        if (!action && Array.isArray(result.nodes)) {
          action = 'spawn_nodes';
        }

        if (action === 'spawn_nodes') {
          await handleSpawnNodes(result);
        } else if (action) {
          result.action = action;
          window.dispatchEvent(new CustomEvent('forge-canvas-action', { detail: result }));
        } else {
          showToast('AI returned an unrecognized response format.', 'warning');
        }
      }
    } catch (err) {
      console.error('AI Generation error:', err);
      showToast('Failed to generate AI layout: ' + err.message, 'error');
    } finally {
      if (document.body.contains(overlay)) {
        overlay.remove();
      }
    }
  });

  setTimeout(() => promptInput.focus(), 100);
}

// ─── Preset Specific Canvas Utility Panels ───────────────────────────────────

function toggleDiceTray() {
  const existing = document.getElementById('canvas-dice-panel');
  if (existing) {
    existing.remove();
    return;
  }
  
  // Close other floating panels
  document.querySelectorAll('.canvas-floating-panel').forEach(p => p.remove());

  const panel = document.createElement('div');
  panel.id = 'canvas-dice-panel';
  panel.className = 'canvas-floating-panel dnd-dice-panel';
  panel.style.cssText = `
    position: absolute; 
    bottom: 80px; 
    right: 20px; 
    width: 320px; 
    background: linear-gradient(160deg, rgba(15,10,30,0.98) 0%, rgba(20,10,40,0.98) 100%); 
    border: 1px solid rgba(139,92,246,0.4); 
    border-radius: 16px; 
    padding: 0;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(139,92,246,0.15), inset 0 1px 0 rgba(255,255,255,0.05); 
    z-index: 1000; 
    font-family: var(--font-hud);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  `;
  
  panel.innerHTML = `
    <!-- Header -->
    <div style="
      background: linear-gradient(90deg, rgba(139,92,246,0.15) 0%, rgba(167,139,250,0.08) 100%);
      border-bottom: 1px solid rgba(139,92,246,0.2);
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    ">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:1.2rem;">🎲</span>
        <div>
          <div style="font-weight:800; color:#a78bfa; letter-spacing:0.12em; font-size:0.75rem; text-transform:uppercase;">Dice Tray</div>
          <div style="font-size:0.6rem; color:rgba(255,255,255,0.35); letter-spacing:0.06em;">D&amp;D BEYOND STYLE</div>
        </div>
      </div>
      <button id="dice-panel-close" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.5); cursor:pointer; width:26px; height:26px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:0.75rem; transition:all 0.15s;">✕</button>
    </div>
    
    <!-- 3D Dice Stage -->
    <div id="dice-stage" style="
      height: 150px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(ellipse at center, rgba(139,92,246,0.1) 0%, transparent 70%);
      border-bottom: 1px solid rgba(139,92,246,0.12);
      overflow: hidden;
    ">
      <!-- Ambient glow rings -->
      <div class="dice-glow-ring" style="position:absolute; width:200px; height:200px; border-radius:50%; border:1px solid rgba(139,92,246,0.06); top:50%; left:50%; transform:translate(-50%,-50%);"></div>
      <div class="dice-glow-ring" style="position:absolute; width:130px; height:130px; border-radius:50%; border:1px solid rgba(139,92,246,0.09); top:50%; left:50%; transform:translate(-50%,-50%);"></div>

      <!-- 3D cube wrapper: perspective lives here -->
      <div id="dice-3d-container" style="
        perspective: 500px;
        perspective-origin: 50% 50%;
        width: 70px;
        height: 70px;
        cursor: pointer;
        flex-shrink: 0;
        position: relative;
      ">
        <!-- The cube: transform-style:preserve-3d so children render in 3D space -->
        <div id="dice-3d" class="dice-3d-idle" style="
          width: 70px;
          height: 70px;
          position: relative;
          transform-style: preserve-3d;
          transform: rotateX(-25deg) rotateY(35deg);
        ">
          <!-- FRONT face: translateZ(+half) -->
          <div class="dice-face dice-face-front" style="
            position:absolute; top:0; left:0; width:70px; height:70px;
            background: linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%);
            border: 1.5px solid rgba(167,139,250,0.8);
            border-radius: 10px;
            display:flex; align-items:center; justify-content:center;
            backface-visibility:hidden; -webkit-backface-visibility:hidden;
            transform: translateZ(35px);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -2px 0 rgba(0,0,0,0.4);
          " id="dice-face-display">
            <span style="font-size:1.3rem; font-weight:900; color:#f5f3ff; text-shadow:0 0 14px rgba(167,139,250,0.9); letter-spacing:-0.02em;">d20</span>
          </div>
          <!-- BACK face: rotateY(180deg) translateZ(+half) -->
          <div class="dice-face dice-face-back" style="
            position:absolute; top:0; left:0; width:70px; height:70px;
            background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%);
            border: 1.5px solid rgba(109,72,206,0.5);
            border-radius: 10px;
            display:flex; align-items:center; justify-content:center;
            backface-visibility:hidden; -webkit-backface-visibility:hidden;
            transform: rotateY(180deg) translateZ(35px);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 0 rgba(0,0,0,0.4);
          ">
            <span style="font-size:1.2rem; font-weight:700; color:rgba(196,181,253,0.75);">1</span>
          </div>
          <!-- RIGHT face: rotateY(90deg) translateZ(+half) -->
          <div class="dice-face dice-face-right" style="
            position:absolute; top:0; left:0; width:70px; height:70px;
            background: linear-gradient(135deg, #5b21b6 0%, #2e1065 100%);
            border: 1.5px solid rgba(139,92,246,0.6);
            border-radius: 10px;
            display:flex; align-items:center; justify-content:center;
            backface-visibility:hidden; -webkit-backface-visibility:hidden;
            transform: rotateY(90deg) translateZ(35px);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 0 rgba(0,0,0,0.4);
          ">
            <span style="font-size:1.2rem; font-weight:700; color:rgba(196,181,253,0.75);">14</span>
          </div>
          <!-- LEFT face: rotateY(-90deg) translateZ(+half) -->
          <div class="dice-face dice-face-left" style="
            position:absolute; top:0; left:0; width:70px; height:70px;
            background: linear-gradient(135deg, #4c1d95 0%, #1e1b4b 100%);
            border: 1.5px solid rgba(109,72,206,0.45);
            border-radius: 10px;
            display:flex; align-items:center; justify-content:center;
            backface-visibility:hidden; -webkit-backface-visibility:hidden;
            transform: rotateY(-90deg) translateZ(35px);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 0 rgba(0,0,0,0.4);
          ">
            <span style="font-size:1.2rem; font-weight:700; color:rgba(196,181,253,0.75);">8</span>
          </div>
          <!-- TOP face: rotateX(90deg) translateZ(+half) — lighter -->
          <div class="dice-face dice-face-top" style="
            position:absolute; top:0; left:0; width:70px; height:70px;
            background: linear-gradient(135deg, #8b5cf6 0%, #5b21b6 100%);
            border: 1.5px solid rgba(196,181,253,0.6);
            border-radius: 10px;
            display:flex; align-items:center; justify-content:center;
            backface-visibility:hidden; -webkit-backface-visibility:hidden;
            transform: rotateX(90deg) translateZ(35px);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -2px 0 rgba(0,0,0,0.4);
          ">
            <span style="font-size:1.2rem; font-weight:700; color:rgba(196,181,253,0.75);">19</span>
          </div>
          <!-- BOTTOM face: rotateX(-90deg) translateZ(+half) — darkest -->
          <div class="dice-face dice-face-bottom" style="
            position:absolute; top:0; left:0; width:70px; height:70px;
            background: linear-gradient(135deg, #172554 0%, #030712 100%);
            border: 1.5px solid rgba(109,72,206,0.35);
            border-radius: 10px;
            display:flex; align-items:center; justify-content:center;
            backface-visibility:hidden; -webkit-backface-visibility:hidden;
            transform: rotateX(-90deg) translateZ(35px);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -2px 0 rgba(0,0,0,0.4);
          ">
            <span style="font-size:1.2rem; font-weight:700; color:rgba(196,181,253,0.75);">2</span>
          </div>
        </div>
      </div>
      
      <!-- Result display (shown after roll) -->
      <div id="dice-result-display" style="
        position:absolute;
        right: 14px;
        top:50%;
        transform: translateY(-50%);
        text-align:center;
        opacity:0;
        transition: opacity 0.35s ease;
        min-width: 70px;
      ">
        <div id="dice-result-nat" style="font-size:0.55rem; color:#a78bfa; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:2px; white-space:nowrap;"></div>
        <div id="dice-result-roll" style="font-size:2.4rem; font-weight:900; color:#fff; line-height:1; text-shadow: 0 0 24px rgba(167,139,250,0.9);">—</div>
        <div id="dice-result-total" style="font-size:0.7rem; color:#a78bfa; margin-top:3px;"></div>
        <div id="dice-result-type" style="font-size:0.55rem; color:rgba(255,255,255,0.35); letter-spacing:0.08em; margin-top:1px;"></div>
      </div>
    </div>
    
    <!-- Controls -->
    <div style="padding: 12px 14px;">
      <!-- Die selector -->
      <div style="margin-bottom:10px;">
        <div style="font-size:0.6rem; color:rgba(255,255,255,0.3); letter-spacing:0.1em; text-transform:uppercase; margin-bottom:6px; font-weight:700;">Choose Die</div>
        <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:5px;">
          ${[4, 6, 8, 10, 12, 20, 100].map(d => `
            <button class="dnd-die-btn" data-die="${d}" style="
              background: rgba(139,92,246,0.08);
              border: 1px solid rgba(139,92,246,0.2);
              border-radius: 8px;
              color: #c4b5fd;
              font-family: var(--font-hud);
              font-weight: 700;
              font-size: 0.72rem;
              padding: 6px 4px;
              cursor: pointer;
              transition: all 0.15s;
              letter-spacing: 0.04em;
            ">d${d}</button>
          `).join('')}
        </div>
      </div>
      
      <!-- Modifier + Roll count -->
      <div style="display:flex; gap:8px; margin-bottom:10px; align-items:flex-end;">
        <div style="flex:1;">
          <div style="font-size:0.6rem; color:rgba(255,255,255,0.3); letter-spacing:0.1em; text-transform:uppercase; margin-bottom:4px; font-weight:700;">Count</div>
          <input type="number" id="dice-count" min="1" max="20" value="1" style="
            width:100%; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.08); 
            border-radius:6px; color:#fff; font-family:var(--font-hud); font-size:0.8rem; 
            padding:5px 8px; box-sizing:border-box;
          " />
        </div>
        <div style="flex:1;">
          <div style="font-size:0.6rem; color:rgba(255,255,255,0.3); letter-spacing:0.1em; text-transform:uppercase; margin-bottom:4px; font-weight:700;">Modifier</div>
          <input type="number" id="dice-modifier" value="0" style="
            width:100%; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.08); 
            border-radius:6px; color:#fff; font-family:var(--font-hud); font-size:0.8rem; 
            padding:5px 8px; box-sizing:border-box;
          " />
        </div>
        <button id="dice-roll-btn" style="
          background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);
          border: 1px solid rgba(167,139,250,0.4);
          border-radius: 8px;
          color: #fff;
          font-family: var(--font-hud);
          font-weight: 800;
          font-size: 0.72rem;
          padding: 6px 12px;
          cursor: pointer;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          transition: all 0.15s;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(124,58,237,0.4);
        ">ROLL!</button>
      </div>
      
      <!-- History -->
      <div style="font-size:0.6rem; color:rgba(255,255,255,0.3); letter-spacing:0.1em; text-transform:uppercase; margin-bottom:5px; font-weight:700;">Roll History</div>
      <div id="dice-history" style="
        height:90px; 
        overflow-y:auto; 
        background:rgba(0,0,0,0.25); 
        border:1px solid rgba(255,255,255,0.04); 
        border-radius:8px; 
        padding:6px 8px; 
        font-size:0.72rem; 
        display:flex; 
        flex-direction:column;
        gap:3px;
        scrollbar-width:thin;
        scrollbar-color: rgba(139,92,246,0.3) transparent;
      ">
        <div style="color:rgba(255,255,255,0.2); font-style:italic; text-align:center; padding:8px 0;">No rolls yet — choose a die and roll!</div>
      </div>
    </div>
  `;
  
  canvasState.viewport.appendChild(panel);

  // ── State ─────────────────────────────────────────────────────────────────
  let selectedDie = 20;
  let isRolling = false;

  const dice3d = panel.querySelector('#dice-3d');
  const diceFaceDisplay = panel.querySelector('#dice-face-display');
  const resultDisplay = panel.querySelector('#dice-result-display');
  const resultNat = panel.querySelector('#dice-result-nat');
  const resultRoll = panel.querySelector('#dice-result-roll');
  const resultTotal = panel.querySelector('#dice-result-total');
  const resultType = panel.querySelector('#dice-result-type');
  const historyBox = panel.querySelector('#dice-history');
  const modInput = panel.querySelector('#dice-modifier');
  const countInput = panel.querySelector('#dice-count');
  const rollBtn = panel.querySelector('#dice-roll-btn');

  // Close button
  panel.querySelector('#dice-panel-close').addEventListener('click', () => panel.remove());

  // Helper to set text content on a face (targeting the inner span or the face itself)
  const setFaceText = (selector, val) => {
    const face = panel.querySelector(selector);
    if (face) {
      const span = face.querySelector('span');
      if (span) span.textContent = val;
      else face.textContent = val;
    }
  };

  // Hover effects for die buttons
  panel.querySelectorAll('.dnd-die-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(139,92,246,0.22)';
      btn.style.borderColor = 'rgba(167,139,250,0.5)';
      btn.style.transform = 'translateY(-1px)';
    });
    btn.addEventListener('mouseleave', () => {
      const isSelected = parseInt(btn.dataset.die) === selectedDie;
      btn.style.background = isSelected ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.08)';
      btn.style.borderColor = isSelected ? 'rgba(167,139,250,0.6)' : 'rgba(139,92,246,0.2)';
      btn.style.transform = '';
    });
  });

  // Select a die
  function selectDie(d) {
    selectedDie = d;
    setFaceText('.dice-face-front', `d${d}`);
    setFaceText('.dice-face-back', '1');
    setFaceText('.dice-face-right', Math.floor(d * 0.7) || '1');
    setFaceText('.dice-face-left', Math.floor(d * 0.4) || '1');
    setFaceText('.dice-face-top', d - 1 || '1');
    setFaceText('.dice-face-bottom', '2');
    
    panel.querySelectorAll('.dnd-die-btn').forEach(btn => {
      const isSelected = parseInt(btn.dataset.die) === d;
      btn.style.background = isSelected ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.08)';
      btn.style.borderColor = isSelected ? 'rgba(167,139,250,0.6)' : 'rgba(139,92,246,0.2)';
      btn.style.color = isSelected ? '#e9d5ff' : '#c4b5fd';
      btn.style.boxShadow = isSelected ? '0 0 10px rgba(139,92,246,0.25)' : 'none';
    });
    // Gentle nudge when switching die
    dice3d.style.transition = 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1)';
    const rx = -20 - Math.random() * 15;
    const ry = 30 + Math.random() * 25;
    dice3d.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    setTimeout(() => {
      if (!isRolling) {
        dice3d.style.transition = '';
        dice3d.style.transform = '';
      }
    }, 500);
  }

  // Start with d20 selected
  selectDie(20);

  panel.querySelectorAll('.dnd-die-btn').forEach(btn => {
    btn.addEventListener('click', () => selectDie(parseInt(btn.dataset.die)));
  });

  // Also click on dice to roll
  panel.querySelector('#dice-3d-container').addEventListener('click', () => {
    if (!isRolling) performRoll();
  });

  rollBtn.addEventListener('mouseenter', () => {
    rollBtn.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)';
    rollBtn.style.transform = 'translateY(-1px)';
    rollBtn.style.boxShadow = '0 6px 20px rgba(124,58,237,0.6)';
  });
  rollBtn.addEventListener('mouseleave', () => {
    rollBtn.style.background = 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)';
    rollBtn.style.transform = '';
    rollBtn.style.boxShadow = '0 4px 12px rgba(124,58,237,0.4)';
  });
  rollBtn.addEventListener('click', () => {
    if (!isRolling) performRoll();
  });

  // ── Roll Logic ─────────────────────────────────────────────────────────────
  function performRoll() {
    if (isRolling) return;
    isRolling = true;

    const die = selectedDie;
    const count = Math.max(1, Math.min(20, parseInt(countInput.value) || 1));
    const mod = parseInt(modInput.value) || 0;

    playZapSound();

    // Reset result
    resultDisplay.style.opacity = '0';
    rollBtn.disabled = true;
    rollBtn.textContent = '...';

    // ── PHASE 1: Tumble physics simulation ──
    dice3d.classList.remove('dice-3d-idle');
    dice3d.style.transition = 'none';

    let x = -80 - Math.random() * 40; // start left
    let y = -40 - Math.random() * 20; // start near top
    let z = -30 - Math.random() * 30; // depth

    // Throw velocities (slightly slowed down for dramatic weight & D&D Beyond feel)
    let vx = 5 + Math.random() * 4;
    let vy = -1 - Math.random() * 3;
    let vz = 2 + Math.random() * 3;

    let rx = Math.random() * 360;
    let ry = Math.random() * 360;
    let rz = Math.random() * 360;

    let vrx = 6 + Math.random() * 8;
    let vry = 6 + Math.random() * 8;
    let vrz = 4 + Math.random() * 6;

    const gravity = 0.45; 
    const bounce = -0.55;
    const friction = 0.99; 

    let startTime = null;
    const duration = 1100; // snappier 1.1s roll duration
    let lastNumberUpdate = 0;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      if (elapsed < duration) {
        // Apply physics
        vy += gravity;
        
        x += vx;
        y += vy;
        z += vz;

        rx += vrx;
        ry += vry;
        rz += vrz;

        // Apply friction/air resistance
        vx *= friction;
        vy *= friction;
        vz *= friction;
        vrx *= friction;
        vry *= friction;
        vrz *= friction;

        // Floor collision
        if (y > 35) {
          y = 35;
          vy = vy * bounce;
          vx *= 0.85;
          vz *= 0.85;
          vrx += (Math.random() - 0.5) * 8;
          vry += (Math.random() - 0.5) * 8;
          vrz += (Math.random() - 0.5) * 8;
          // Play collision sound
          if (Math.abs(vy) > 1.0) playClickSound();
        }
        // Ceiling collision
        if (y < -45) {
          y = -45;
          vy = vy * bounce;
        }
        // Left/Right wall collisions
        if (x > 95) {
          x = 95;
          vx = vx * bounce;
          vry += (Math.random() - 0.5) * 8;
        }
        if (x < -95) {
          x = -95;
          vx = vx * bounce;
          vry += (Math.random() - 0.5) * 8;
        }
        // Depth wall collisions
        if (z > 50) {
          z = 50;
          vz = vz * bounce;
        }
        if (z < -80) {
          z = -80;
          vz = vz * bounce;
        }

        // Apply scale pulse on bounces
        const scale = 1.0 + Math.sin(elapsed * 0.04) * 0.04;

        // Render transform in hardware-accelerated translate3d for 60fps
        dice3d.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${scale})`;

        // Randomize numbers on faces during tumble
        if (timestamp - lastNumberUpdate > 50) {
          lastNumberUpdate = timestamp;
          setFaceText('.dice-face-front', Math.floor(Math.random() * die) + 1);
          setFaceText('.dice-face-back', Math.floor(Math.random() * die) + 1);
          setFaceText('.dice-face-right', Math.floor(Math.random() * die) + 1);
          setFaceText('.dice-face-left', Math.floor(Math.random() * die) + 1);
          setFaceText('.dice-face-top', Math.floor(Math.random() * die) + 1);
          setFaceText('.dice-face-bottom', Math.floor(Math.random() * die) + 1);
        }

        requestAnimationFrame(step);
      } else {
        // ── PHASE 2: Settle ──
        dice3d.style.transition = 'transform 0.8s cubic-bezier(0.25, 1.5, 0.5, 1)';
        
        // Cryptographically secure roll generator (hardware entropy, unbiased)
        const getSecureRoll = (sides) => {
          const buffer = new Uint32Array(1);
          window.crypto.getRandomValues(buffer);
          const randomFloat = buffer[0] / (0xffffffff + 1);
          return Math.floor(randomFloat * sides) + 1;
        };

        // Calculate rolls
        const rolls = [];
        for (let i = 0; i < count; i++) {
          rolls.push(getSecureRoll(die));
        }
        const rollSum = rolls.reduce((a, b) => a + b, 0);
        const total = rollSum + mod;
        const isNat20 = die === 20 && count === 1 && rolls[0] === 20;
        const isNat1 = die === 20 && count === 1 && rolls[0] === 1;

        const rollResult = count === 1 ? rolls[0] : rollSum;
        resultRoll.textContent = rollResult;
        resultTotal.textContent = mod !== 0 ? `${mod >= 0 ? '+' : ''}${mod} = ${total}` : '';
        resultType.textContent = `${count > 1 ? count + 'x ' : ''}d${die}`;

        // Set final values using secure rolls
        setFaceText('.dice-face-front', rollResult);
        setFaceText('.dice-face-back', getSecureRoll(die));
        setFaceText('.dice-face-right', getSecureRoll(die));
        setFaceText('.dice-face-left', getSecureRoll(die));
        setFaceText('.dice-face-top', getSecureRoll(die));
        setFaceText('.dice-face-bottom', getSecureRoll(die));

        // Standard resting position centered, with scale pop & glow shadow
        dice3d.style.transform = 'translate3d(0, 0, 0) rotateX(-15deg) rotateY(25deg) rotateZ(0deg) scale(1.15)';

        setTimeout(() => {
          if (isNat20) {
            resultNat.textContent = '⚡ NATURAL 20!';
            resultNat.style.color = '#fbbf24';
            resultRoll.style.color = '#fbbf24';
            resultRoll.style.textShadow = '0 0 30px rgba(251,191,36,0.9)';
            
            // Full stage gold flash
            const stage = panel.querySelector('#dice-stage');
            const flash = document.createElement('div');
            flash.className = 'nat20-flash';
            stage.appendChild(flash);
            setTimeout(() => flash.remove(), 800);
            dice3d.style.boxShadow = '0 0 40px rgba(251,191,36,0.6)';
            setTimeout(() => dice3d.style.boxShadow = '', 800);
          } else if (isNat1) {
            resultNat.textContent = '💀 CRITICAL FAIL';
            resultNat.style.color = '#f43f5e';
            resultRoll.style.color = '#f43f5e';
            resultRoll.style.textShadow = '0 0 20px rgba(244,63,94,0.8)';
          } else {
            resultNat.textContent = '';
            resultRoll.style.color = '#fff';
            resultRoll.style.textShadow = '0 0 20px rgba(167,139,250,0.9)';
          }

          resultDisplay.style.opacity = '1';

          // Add to history
          const prevEmpty = historyBox.querySelector('[style*="font-style: italic"], [style*="font-style:italic"]');
          if (prevEmpty) historyBox.innerHTML = '';

          const rollStr = count > 1 ? `[${rolls.join('+')}]` : `[${rolls[0]}]`;
          const modStr = mod !== 0 ? ` ${mod >= 0 ? '+' : ''}${mod} = <b style="color:#a78bfa">${total}</b>` : '';
          const specialBadge = isNat20 ? ' <span style="color:#fbbf24;font-size:0.65rem;">⚡ NAT 20</span>' : isNat1 ? ' <span style="color:#f43f5e;font-size:0.65rem;">💀 NAT 1</span>' : '';
          
          const item = document.createElement('div');
          item.style.cssText = 'padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.04); font-size:0.7rem; display:flex; justify-content:space-between; align-items:center;';
          item.innerHTML = `
            <span style="color:rgba(255,255,255,0.4);">d${die}${count > 1 ? 'x'+count : ''}</span>
            <span>${rollStr}${modStr}${specialBadge}</span>
          `;
          historyBox.insertBefore(item, historyBox.firstChild);

          showToast(
            isNat20 ? `⚡ NATURAL 20! d${die} = ${rolls[0]}` :
            isNat1  ? `💀 Critical fail! d${die} = 1` :
            `d${die}: ${rollStr}${mod !== 0 ? ` ${mod >= 0 ? '+' : ''}${mod} = ${total}` : ''}`,
            isNat20 ? 'success' : isNat1 ? 'error' : 'info'
          );

          isRolling = false;
          rollBtn.disabled = false;
          rollBtn.textContent = 'ROLL!';
          
          // Smooth handoff back to idle floating animation
          setTimeout(() => {
            if (!isRolling) {
              dice3d.classList.add('dice-3d-idle');
              dice3d.style.transition = '';
              dice3d.style.transform = '';
            }
          }, 600);
        }, 150);
      }
    }

    requestAnimationFrame(step);
  }
}

function toggleMathSolver() {
  const existing = document.getElementById('canvas-math-panel');
  if (existing) {
    existing.remove();
    return;
  }
  
  // Close other floating panels
  document.querySelectorAll('.canvas-floating-panel').forEach(p => p.remove());

  const panel = document.createElement('div');
  panel.id = 'canvas-math-panel';
  panel.className = 'canvas-floating-panel';
  panel.style.cssText = `
    position: absolute; 
    bottom: 80px; 
    right: 20px; 
    width: 280px; 
    background: rgba(20, 17, 34, 0.95); 
    border: 1px solid var(--accent-cyan, #06b6d4); 
    border-radius: 12px; 
    padding: 16px; 
    box-shadow: 0 10px 30px rgba(0,0,0,0.6); 
    z-index: 1000; 
    font-family: var(--font-hud);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  `;
  
  panel.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <span style="font-weight:700; color:var(--accent-cyan, #06b6d4); letter-spacing:0.05em;">📊 XP SOLVER</span>
      <button class="panel-close-btn icon-btn" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer;">✕</button>
    </div>
    <div class="form-group" style="margin-bottom:8px;">
      <label class="form-label" style="font-size:0.65rem; color:var(--text-muted);">SOLVE FOR LEVEL</label>
      <input type="number" id="math-lvl" class="form-input" value="5" style="background:rgba(0,0,0,0.3); padding:4px; font-size:0.8rem;" />
    </div>
    <div class="form-group" style="margin-bottom:8px;">
      <label class="form-label" style="font-size:0.65rem; color:var(--text-muted);">BASE XP</label>
      <input type="number" id="math-base" class="form-input" value="100" style="background:rgba(0,0,0,0.3); padding:4px; font-size:0.8rem;" />
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label class="form-label" style="font-size:0.65rem; color:var(--text-muted);">EXPONENT</label>
      <input type="number" step="0.1" id="math-exp" class="form-input" value="1.5" style="background:rgba(0,0,0,0.3); padding:4px; font-size:0.8rem;" />
    </div>
    <button class="btn btn-primary w-full" id="math-calc-btn" style="background:var(--accent-cyan, #06b6d4); border-color:var(--accent-cyan, #06b6d4); color:#000; font-weight:700; margin-bottom:12px; font-size:0.8rem;">Calculate XP</button>
    <div style="background:rgba(0,0,0,0.25); padding:10px; border-radius:6px; font-size:0.8rem; text-align:center;" id="math-result">
      Result: <b>1,118 XP</b>
    </div>
  `;
  
  canvasState.viewport.appendChild(panel);

  panel.querySelector('.panel-close-btn').addEventListener('click', () => panel.remove());

  const calcBtn = panel.querySelector('#math-calc-btn');
  const lvlInput = panel.querySelector('#math-lvl');
  const baseInput = panel.querySelector('#math-base');
  const expInput = panel.querySelector('#math-exp');
  const resultDiv = panel.querySelector('#math-result');

  calcBtn.addEventListener('click', () => {
    const lvl = parseInt(lvlInput.value) || 1;
    const base = parseInt(baseInput.value) || 100;
    const exp = parseFloat(expInput.value) || 1.5;
    
    const xpNeeded = Math.round(base * Math.pow(lvl, exp));
    resultDiv.innerHTML = `Lvl ${lvl} Target: <b>${xpNeeded.toLocaleString()} XP</b>`;
    playClickSound();
  });
}

function togglePacingTracker() {
  const existing = document.getElementById('canvas-pacing-panel');
  if (existing) {
    existing.remove();
    return;
  }
  
  // Close other floating panels
  document.querySelectorAll('.canvas-floating-panel').forEach(p => p.remove());

  const panel = document.createElement('div');
  panel.id = 'canvas-pacing-panel';
  panel.className = 'canvas-floating-panel';
  panel.style.cssText = `
    position: absolute; 
    bottom: 80px; 
    right: 20px; 
    width: 280px; 
    background: rgba(20, 17, 34, 0.95); 
    border: 1px solid var(--accent-primary); 
    border-radius: 12px; 
    padding: 16px; 
    box-shadow: 0 10px 30px rgba(0,0,0,0.6); 
    z-index: 1000; 
    font-family: var(--font-hud);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  `;
  
  // Compute live act stats from canvas nodes
  const ACT_BOUNDARIES = [0, 1200, 2400, 3600];
  const ACT_NAMES = ['ACT I — Setup', 'ACT II — Rising Action', 'ACT III — Climax'];
  const actStats = ACT_NAMES.map((name, i) => {
    const minX = ACT_BOUNDARIES[i];
    const maxX = ACT_BOUNDARIES[i + 1];
    const nodesInAct = canvasState.nodes.filter(n => n.data.x >= minX && n.data.x < maxX);
    // Rough word count: count chars in richtext nodes, divide by 5
    let words = 0;
    nodesInAct.forEach(n => {
      if (n.data.type === 'richtext' && n.data.content) {
        const raw = typeof n.data.content === 'string' ? n.data.content
          : (n.data.content.delta || '');
        const text = raw.replace(/<[^>]+>/g, ' ');
        words += Math.round(text.length / 5);
      }
    });
    return { name, nodes: nodesInAct.length, words };
  });
  const totalNodes = actStats.reduce((s, a) => s + a.nodes, 0) || 1;

  panel.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <span style="font-weight:700; color:var(--accent-primary); letter-spacing:0.05em;">📈 ACT PACING</span>
      <button class="panel-close-btn icon-btn" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer;">✕</button>
    </div>
    <div style="font-size:0.65rem; color:var(--text-muted); margin-bottom:10px; text-transform:uppercase; letter-spacing:0.08em;">${canvasState.nodes.length} total nodes across canvas</div>
    <div style="display: flex; flex-direction: column; gap:14px;">
      ${actStats.map(act => {
        const pct = Math.round((act.nodes / totalNodes) * 100);
        const idealLabel = act.name.includes('II') ? 'Ideal: 50%' : 'Ideal: 25%';
        const isBalanced = act.name.includes('II') ? pct >= 40 && pct <= 60 : pct >= 15 && pct <= 35;
        const barColor = isBalanced ? '#10b981' : pct === 0 ? 'rgba(255,255,255,0.1)' : 'var(--accent-primary)';
        return `
          <div>
            <div style="display:flex; justify-content:space-between; font-size:0.7rem; margin-bottom:5px; font-weight:600;">
              <span>${act.name}</span>
              <span style="color:var(--text-muted);">${act.nodes} nodes · ~${act.words.toLocaleString()} words</span>
            </div>
            <div style="height:7px; background:rgba(255,255,255,0.05); border-radius:4px; overflow:hidden; margin-bottom:3px;">
              <div style="height:100%; width:${pct}%; background:${barColor}; border-radius:4px; transition: width 0.4s ease;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.62rem; color:var(--text-muted);">
              <span>${pct}% of canvas</span>
              <span>${idealLabel}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div style="margin-top:14px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05); font-size:0.68rem; color:var(--text-muted); line-height:1.5;">
      💡 Tip: Story Writer canvases work best with 25% / 50% / 25% distribution.
    </div>
  `;
  
  canvasState.viewport.appendChild(panel);

  panel.querySelector('.panel-close-btn').addEventListener('click', () => panel.remove());
}

// =====================================================================
// STORY WRITER — FEATURE 1: MANUSCRIPT OUTLINE SIDEBAR
// =====================================================================

function toggleManuscriptOutline() {
  let sidebar = document.getElementById('canvas-outline-sidebar');
  const btn = document.getElementById('canvas-outline-btn');

  if (sidebar) {
    sidebar.classList.remove('open');
    if (btn) btn.classList.remove('active');
    setTimeout(() => sidebar.remove(), 310);
    return;
  }

  sidebar = document.createElement('div');
  sidebar.id = 'canvas-outline-sidebar';
  sidebar.className = 'canvas-outline-sidebar';

  sidebar.innerHTML = `
    <div class="canvas-outline-header">
      <span class="canvas-outline-title">📖 Manuscript Outline</span>
      <button id="outline-close-btn" class="canvas-toolbar-btn icon-btn" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem;">✕</button>
    </div>
    <div class="canvas-outline-summary" id="outline-summary"></div>
    <div class="canvas-outline-list" id="outline-list"></div>
  `;

  canvasState.viewport.appendChild(sidebar);
  setTimeout(() => sidebar.classList.add('open'), 10);
  if (btn) btn.classList.add('active');

  sidebar.querySelector('#outline-close-btn').addEventListener('click', () => toggleManuscriptOutline());

  refreshManuscriptOutline();
}

function refreshManuscriptOutline() {
  const sidebar = document.getElementById('canvas-outline-sidebar');
  if (!sidebar) return;

  const richNodes = canvasState.nodes
    .filter(n => n.data.type === 'richtext')
    .sort((a, b) => (a.data.x || 0) - (b.data.x || 0));

  const summary = sidebar.querySelector('#outline-summary');
  const list = sidebar.querySelector('#outline-list');
  if (!summary || !list) return;

  const totalWords = richNodes.reduce((sum, n) => sum + countWordsFromNodeData(n.data), 0);
  const totalTarget = richNodes.reduce((sum, n) => sum + (n.data.content?.wordTarget || 0), 0);
  summary.textContent = `${richNodes.length} scenes · ${totalWords.toLocaleString()} words${totalTarget > 0 ? ` / ${totalTarget.toLocaleString()} target` : ''}`;

  list.innerHTML = '';
  richNodes.forEach((entry, idx) => {
    const wc = countWordsFromNodeData(entry.data);
    const target = entry.data.content?.wordTarget || 0;
    const item = document.createElement('div');
    item.className = 'canvas-outline-item';
    item.draggable = true;
    item.dataset.nodeId = entry.data.id;
    item.dataset.idx = idx;

    const preview = getTextPreviewFromNodeData(entry.data, 100);
    item.innerHTML = `
      <div class="canvas-outline-item-title-row">
        <span class="canvas-outline-item-title">${escHtml(entry.data.title || 'Untitled Scene')}</span>
        <span class="canvas-outline-item-badge">${wc.toLocaleString()}${target ? ` / ${target.toLocaleString()}` : ''} w</span>
      </div>
      <div class="canvas-outline-item-preview">${escHtml(preview)}</div>
    `;

    // Click to center canvas on this node
    item.addEventListener('click', () => panToNode(entry));

    // Drag-and-drop reordering
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', entry.data.id);
      item.style.opacity = '0.5';
    });
    item.addEventListener('dragend', () => { item.style.opacity = ''; });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      document.querySelectorAll('.canvas-outline-item').forEach(i => i.classList.remove('drag-over'));
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      const draggedId = e.dataTransfer.getData('text/plain');
      if (draggedId === entry.data.id) return;
      await reorderOutlineNodes(draggedId, entry.data.id, richNodes);
    });

    list.appendChild(item);
  });
}

function panToNode(entry) {
  const vpW = canvasState.viewport.clientWidth;
  const vpH = canvasState.viewport.clientHeight;
  const nodeW = entry.data.width || 380;
  const nodeH = entry.data.height || 260;
  canvasState.pan.x = -(entry.data.x - vpW / 2 + nodeW / 2);
  canvasState.pan.y = -(entry.data.y - vpH / 2 + nodeH / 2);
  canvasState.zoom = 1;
  applySurfaceTransform();

  // Highlight the node briefly
  entry.el.style.outline = '2px solid var(--accent-primary)';
  entry.el.style.boxShadow = '0 0 20px rgba(229,169,59,0.5)';
  setTimeout(() => {
    entry.el.style.outline = '';
    entry.el.style.boxShadow = '';
  }, 1200);
}

async function reorderOutlineNodes(draggedId, targetId, sortedNodes) {
  const draggedEntry = canvasState.nodes.find(n => n.data.id === draggedId);
  const targetEntry = canvasState.nodes.find(n => n.data.id === targetId);
  if (!draggedEntry || !targetEntry) return;

  // Collect all richtext nodes sorted by x
  const richNodes = canvasState.nodes
    .filter(n => n.data.type === 'richtext')
    .sort((a, b) => (a.data.x || 0) - (b.data.x || 0));

  // Remove draggedEntry from sorted list
  const from = richNodes.findIndex(n => n.data.id === draggedId);
  const to = richNodes.findIndex(n => n.data.id === targetId);
  if (from === -1 || to === -1) return;

  richNodes.splice(from, 1);
  richNodes.splice(to, 0, draggedEntry);

  // Reassign X positions with 500px gaps, and align Y positions to target scene Y
  const startX = 50;
  const GAP = 500;
  const targetY = targetEntry.data.y || 100;
  for (let i = 0; i < richNodes.length; i++) {
    const entry = richNodes[i];
    entry.data.x = startX + i * GAP;
    entry.data.y = targetY;
    entry.el.style.left = entry.data.x + 'px';
    entry.el.style.top = entry.data.y + 'px';
    await saveNode(entry.data);
  }

  drawConnections();
  updateMinimap();
  refreshManuscriptOutline();
  showToast('Scenes reordered!', 'success');
}

function countWordsFromNodeData(nodeData) {
  if (nodeData.type === 'pagelink') {
    return nodeData.content?.dbWordCount || 0;
  }
  if (!nodeData.content) return 0;
  const raw = typeof nodeData.content === 'string' ? nodeData.content : (nodeData.content.delta || '');
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.ops)) {
      const text = parsed.ops.map(op => (typeof op.insert === 'string' ? op.insert : '')).join('');
      return text.trim().split(/\s+/).filter(w => w.length > 0).length;
    }
  } catch (_) {}
  const stripped = raw.replace(/<[^>]+>/g, ' ').trim();
  return stripped ? stripped.split(/\s+/).filter(w => w.length > 0).length : 0;
}

function getTextPreviewFromNodeData(nodeData, maxLen) {
  if (!nodeData.content) return '';
  const raw = typeof nodeData.content === 'string' ? nodeData.content : (nodeData.content.delta || '');
  let text = '';
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.ops)) {
      text = parsed.ops.map(op => (typeof op.insert === 'string' ? op.insert : '')).join('');
    }
  } catch (_) {
    text = raw.replace(/<[^>]+>/g, ' ');
  }
  text = text.trim().replace(/\s+/g, ' ');
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}


// =====================================================================
// STORY WRITER — FEATURE 2: WORD COUNT GOALS & PROGRESS RINGS
// =====================================================================

function renderWordGoalRing(nodeData) {
  const ringContainer = document.getElementById(`progress-ring-${nodeData.id}`);
  if (!ringContainer) return;

  const target = nodeData.content?.wordTarget;
  if (!target || target <= 0) {
    ringContainer.innerHTML = '';
    return;
  }

  const words = countWordsFromNodeData(nodeData);
  const pct = Math.min(words / target, 1);
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - pct);

  let ringClass = 'progress-ring-amber';
  let titleText = `${words} / ${target} words`;
  if (pct >= 1) {
    ringClass = 'progress-ring-green';
    titleText = `✅ Target reached! ${words} words`;
  } else if (pct < 0.25) {
    ringClass = 'progress-ring-amber';
  }

  ringContainer.innerHTML = `
    <svg width="22" height="22" class="goal-progress-ring" title="${escHtml(titleText)}">
      <circle cx="11" cy="11" r="${radius}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="2.5"/>
      <circle cx="11" cy="11" r="${radius}" fill="none"
        class="progress-ring-bar ${ringClass}"
        stroke-width="2.5"
        stroke-dasharray="${circumference.toFixed(2)}"
        stroke-dashoffset="${dashoffset.toFixed(2)}"
        stroke-linecap="round"/>
      ${pct >= 1 ? `<text x="11" y="15" text-anchor="middle" font-size="8" fill="#10b981">✓</text>` : `<text x="11" y="14.5" text-anchor="middle" font-size="6.5" fill="rgba(255,255,255,0.55)">${Math.round(pct * 100)}%</text>`}
    </svg>
  `;
}

function openWordGoalPopup(el, entry) {
  // Close any existing popups
  document.querySelectorAll('.goal-popup').forEach(p => p.remove());

  const nodeData = entry.data;
  const currentTarget = nodeData.content?.wordTarget || '';

  const popup = document.createElement('div');
  popup.className = 'goal-popup';
  popup.innerHTML = `
    <div style="font-size:0.72rem; color:var(--accent-primary); font-weight:700; margin-bottom:8px; letter-spacing:0.04em;">🎯 WORD COUNT TARGET</div>
    <div style="font-size:0.65rem; color:var(--text-muted); margin-bottom:6px;">Current: ${countWordsFromNodeData(nodeData).toLocaleString()} words</div>
    <input type="number" id="goal-input" placeholder="e.g. 500" value="${currentTarget}"
      style="width:100%; background:rgba(0,0,0,0.4); border:1px solid rgba(229,169,59,0.3); color:#fff; padding:4px 8px; border-radius:4px; font-size:0.8rem; margin-bottom:8px; outline:none; box-sizing:border-box;" />
    <div style="display:flex; gap:6px;">
      <button id="goal-set-btn" style="flex:1; background:var(--accent-primary); border:none; color:#0c0a08; padding:4px; border-radius:4px; font-weight:700; font-size:0.72rem; cursor:pointer;">Set</button>
      <button id="goal-clear-btn" style="flex:1; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); color:var(--text-muted); padding:4px; border-radius:4px; font-size:0.72rem; cursor:pointer;">Clear</button>
    </div>
  `;

  // Position relative to the node header
  const header = el.querySelector('.canvas-node-header');
  header.style.position = 'relative';
  header.appendChild(popup);

  const input = popup.querySelector('#goal-input');
  input.focus();
  input.select();

  const closePopup = () => popup.remove();

  popup.querySelector('#goal-set-btn').addEventListener('click', () => {
    const val = parseInt(input.value);
    if (!isNaN(val) && val > 0) {
      if (!nodeData.content) nodeData.content = {};
      nodeData.content.wordTarget = val;
      scheduleNodeSave(entry);
      renderWordGoalRing(nodeData);
      showToast(`Word target set: ${val.toLocaleString()} words`, 'success');
    }
    closePopup();
  });

  popup.querySelector('#goal-clear-btn').addEventListener('click', () => {
    if (nodeData.content) delete nodeData.content.wordTarget;
    scheduleNodeSave(entry);
    renderWordGoalRing(nodeData);
    closePopup();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') popup.querySelector('#goal-set-btn').click();
    if (e.key === 'Escape') closePopup();
  });

  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!popup.contains(e.target)) {
        closePopup();
        document.removeEventListener('click', handler);
      }
    });
  }, 50);
}


// =====================================================================
// STORY WRITER — FEATURE 3: ZEN FOCUS MODE
// =====================================================================

// ─── Web Audio Synthesizer ───────────────────────────────────────────
class ForgeAudioSynth {
  constructor() {
    this._ctx = null;
    this._rainNodes = null;
    this._rainActive = false;
    this._clickActive = false;
    this._rainVolume = 0.5;
  }

  _getCtx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
    return this._ctx;
  }

  playKeyClick() {
    if (!this._clickActive) return;
    try {
      const ctx = this._getCtx();
      const now = ctx.currentTime;

      // Mechanical click: very short noise burst + pitchy thunk
      const bufferSize = ctx.sampleRate * 0.015;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 8);
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(3500 + Math.random() * 1500, now);
      bandpass.Q.value = 0.8;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18 + Math.random() * 0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.012);

      src.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.015);
    } catch (_) {}
  }

  startRain() {
    if (this._rainActive) return;
    try {
      const ctx = this._getCtx();
      const now = ctx.currentTime;

      // Generate Pink Noise using Kellet's method
      const bufferSize = ctx.sampleRate * 4;
      const noiseBuffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
      
      const leftData = noiseBuffer.getChannelData(0);
      const rightData = noiseBuffer.getChannelData(1);

      let b0_L = 0, b1_L = 0, b2_L = 0, b3_L = 0, b4_L = 0, b5_L = 0, b6_L = 0;
      let b0_R = 0, b1_R = 0, b2_R = 0, b3_R = 0, b4_R = 0, b5_R = 0, b6_R = 0;

      for (let i = 0; i < bufferSize; i++) {
        let white_L = Math.random() * 2 - 1;
        b0_L = 0.99886 * b0_L + white_L * 0.0555179;
        b1_L = 0.99332 * b1_L + white_L * 0.0750759;
        b2_L = 0.96900 * b2_L + white_L * 0.1538520;
        b3_L = 0.86650 * b3_L + white_L * 0.3104856;
        b4_L = 0.55000 * b4_L + white_L * 0.5329522;
        b5_L = -0.7616 * b5_L - white_L * 0.0168980;
        let pink_L = b0_L + b1_L + b2_L + b3_L + b4_L + b5_L + b6_L + white_L * 0.5362;
        b6_L = white_L * 0.115926;
        leftData[i] = pink_L * 0.12;

        let white_R = Math.random() * 2 - 1;
        b0_R = 0.99886 * b0_R + white_R * 0.0555179;
        b1_R = 0.99332 * b1_R + white_R * 0.0750759;
        b2_R = 0.96900 * b2_R + white_R * 0.1538520;
        b3_R = 0.86650 * b3_R + white_R * 0.3104856;
        b4_R = 0.55000 * b4_R + white_R * 0.5329522;
        b5_R = -0.7616 * b5_R - white_R * 0.0168980;
        let pink_R = b0_R + b1_R + b2_R + b3_R + b4_R + b5_R + b6_R + white_R * 0.5362;
        b6_R = white_R * 0.115926;
        rightData[i] = pink_R * 0.12;
      }

      // Add individual raindrop impacts (transients)
      const numDrops = 4 * 180; // 180 drops per second * 4 seconds
      for (let d = 0; d < numDrops; d++) {
        const startIdx = Math.floor(Math.random() * bufferSize);
        const freq = 600 + Math.random() * 1200; 
        const decayTime = 0.002 + Math.random() * 0.006;
        const decaySamples = Math.floor(ctx.sampleRate * decayTime);
        const pan = Math.random();
        const leftGain = Math.sqrt(1 - pan);
        const rightGain = Math.sqrt(pan);
        const amp = 0.08 + Math.random() * 0.12;

        for (let j = 0; j < decaySamples; j++) {
          const t = j / ctx.sampleRate;
          const value = amp * Math.exp(-t * (4 / decayTime)) * Math.sin(2 * Math.PI * freq * t);
          const idx = (startIdx + j) % bufferSize;
          leftData[idx] += value * leftGain;
          rightData[idx] += value * rightGain;
        }
      }

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;

      // Low pass filter to make it rain-like
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2200, now);

      // High pass to remove rumble
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(120, now);

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.20 * this._rainVolume, now + 1.5);

      noise.connect(lp);
      lp.connect(hp);
      hp.connect(gainNode);
      gainNode.connect(ctx.destination);
      noise.start();

      this._rainNodes = { noise, gainNode };
      this._rainActive = true;
    } catch (_) {}
  }

  stopRain() {
    if (!this._rainActive || !this._rainNodes) return;
    try {
      const ctx = this._getCtx();
      const { gainNode, noise } = this._rainNodes;
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.0);
      setTimeout(() => {
        try { noise.stop(); } catch (_) {}
      }, 1100);
      this._rainNodes = null;
      this._rainActive = false;
    } catch (_) {}
  }

  setClickEnabled(enabled) { this._clickActive = enabled; }
  setRainEnabled(enabled) { enabled ? this.startRain() : this.stopRain(); }
  setRainVolume(volume) {
    this._rainVolume = volume;
    if (this._rainActive && this._rainNodes) {
      try {
        const ctx = this._getCtx();
        this._rainNodes.gainNode.gain.linearRampToValueAtTime(0.20 * volume, ctx.currentTime + 0.1);
      } catch (_) {}
    }
  }
  destroy() { this.stopRain(); try { if (this._ctx) this._ctx.close(); } catch (_) {} }
}

let _zenSynth = null;
let _zenKeyHandler = null;

function enterZenFocusMode(entry) {
  if (document.getElementById('zen-focus-overlay')) return;

  const nodeData = entry.data;
  const overlay = document.createElement('div');
  overlay.id = 'zen-focus-overlay';
  overlay.className = 'zen-focus-overlay';

  overlay.innerHTML = `
    <div class="zen-focus-container">
      <div class="zen-focus-header">
        <span class="zen-focus-title">📖 ${escHtml(nodeData.title || 'Scene Focus')}</span>
        <button id="zen-exit-btn" class="zen-focus-exit-btn">Exit Focus ↩</button>
      </div>
      <div class="zen-focus-editor-wrapper" id="zen-editor-mount"></div>
      <div class="zen-focus-audio-bar">
        <span style="font-size:0.68rem; color:var(--text-muted); font-family:var(--font-hud); margin-right:4px;">Atmosphere:</span>
        <button id="zen-audio-click" class="zen-audio-toggle" title="Toggle typewriter key sounds">⌨️ Typewriter</button>
        <button id="zen-audio-rain" class="zen-audio-toggle" title="Toggle ambient rain sound">🌧️ Rain</button>
        <div class="zen-audio-slider-wrap" style="display: inline-flex; align-items: center; gap: 4px; margin-left: 6px;">
          <input type="range" id="zen-audio-rain-vol" min="0" max="100" value="50" style="width: 55px; height: 3px; accent-color: var(--accent-primary); cursor: pointer; border: none; outline: none; background: rgba(255,255,255,0.15);" title="Rain Volume">
        </div>
        <span id="zen-word-count" style="font-size:0.68rem; color:var(--text-muted); font-family:var(--font-hud); margin-left:auto;"></span>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('open'), 10);

  // Initialize audio synth
  _zenSynth = new ForgeAudioSynth();

  // Load current content into zen editor (using Quill)
  const editorMount = overlay.querySelector('#zen-editor-mount');
  
  let getInitialContentPromise;
  if (nodeData.type === 'pagelink' && nodeData.content?.pageId) {
    getInitialContentPromise = getPage(nodeData.content.pageId).then(page => {
      return page ? (page.content || '') : '';
    });
  } else {
    getInitialContentPromise = Promise.resolve(nodeData.content?.delta || '');
  }

  getInitialContentPromise.then(initialContent => {
    createEditor(editorMount, {
      placeholder: 'Your story begins here…',
      initialContent: initialContent,
      minimal: false
    }).then(zenEditor => {
      // Sync content back on change
      const wcLabel = overlay.querySelector('#zen-word-count');
      zenEditor.quill.on('text-change', () => {
        const content = zenEditor.getContent();
        const txt = zenEditor.getText().trim();
        const wc = txt ? txt.split(/\s+/).filter(w => w.length > 0).length : 0;

        if (nodeData.type === 'pagelink' && nodeData.content?.pageId) {
          nodeData.content.dbWordCount = wc;
          scheduleNodeSave(entry);
          renderWordGoalRing(nodeData);

          // Update database page
          getPage(nodeData.content.pageId).then(async pg => {
            if (pg) {
              pg.content = content;
              await savePage(pg);
            }
          }).catch(err => console.error('Failed to save page from Zen Mode:', err));

          // Update card editor if it exists
          if (entry.quillEditor && entry.quillEditor.getContent() !== content) {
            entry.quillEditor.setContent(content);
          }
        } else {
          nodeData.content = nodeData.content || {};
          nodeData.content.delta = content;
          scheduleNodeSave(entry);
          renderWordGoalRing(nodeData);
        }

        // Update word count
        const target = nodeData.content?.wordTarget;
        wcLabel.textContent = `${wc.toLocaleString()} words${target ? ` / ${target.toLocaleString()} target` : ''}`;
      });

      // Initial word count display
      const txt = zenEditor.getText().trim();
      const wc = txt ? txt.split(/\s+/).filter(w => w.length > 0).length : 0;
      const target = nodeData.content?.wordTarget;
      const wcLabel2 = overlay.querySelector('#zen-word-count');
      wcLabel2.textContent = `${wc.toLocaleString()} words${target ? ` / ${target.toLocaleString()} target` : ''}`;

      // Typewriter key click
      _zenKeyHandler = (e) => {
        if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter') {
          _zenSynth.playKeyClick();
        }
      };
      zenEditor.quill.root.addEventListener('keydown', _zenKeyHandler);
    });
  });

  // Audio toggle buttons
  overlay.querySelector('#zen-audio-click').addEventListener('click', function() {
    const on = !this.classList.contains('active');
    this.classList.toggle('active', on);
    _zenSynth.setClickEnabled(on);
  });
  overlay.querySelector('#zen-audio-rain').addEventListener('click', function() {
    const on = !this.classList.contains('active');
    this.classList.toggle('active', on);
    _zenSynth.setRainEnabled(on);
  });

  // Rain volume slider
  const volSlider = overlay.querySelector('#zen-audio-rain-vol');
  if (volSlider) {
    volSlider.addEventListener('input', function() {
      const val = parseFloat(this.value) / 100;
      _zenSynth.setRainVolume(val);
    });
  }

  // Exit
  overlay.querySelector('#zen-exit-btn').addEventListener('click', exitZenFocusMode);

  // Esc key to exit
  const escHandler = (e) => {
    if (e.key === 'Escape') exitZenFocusMode();
  };
  document.addEventListener('keydown', escHandler, { once: false });
  overlay._escHandler = escHandler;
}

function exitZenFocusMode() {
  const overlay = document.getElementById('zen-focus-overlay');
  if (!overlay) return;
  if (overlay._escHandler) document.removeEventListener('keydown', overlay._escHandler);
  overlay.classList.remove('open');
  if (_zenSynth) { _zenSynth.destroy(); _zenSynth = null; }
  setTimeout(() => overlay.remove(), 420);
  refreshManuscriptOutline();
}


// =====================================================================
// STORY WRITER — FEATURE 4: LORE ASSOCIATION CHIPS
// =====================================================================

function renderLoreChipsFooter(el, entry) {
  // Remove existing footer if any
  const existing = el.querySelector('.canvas-node-lore-footer');
  if (existing) existing.remove();

  const loreAssoc = entry.data.content?.loreAssociations || [];
  if (loreAssoc.length === 0) return;

  const footer = document.createElement('div');
  footer.className = 'canvas-node-lore-footer';

  loreAssoc.forEach(lore => {
    const chip = document.createElement('span');
    chip.className = `lore-chip ${lore.type || 'char'}`;
    chip.dataset.loreId = lore.id;
    chip.title = 'Hover for details · Double-click to navigate';
    chip.innerHTML = `${lore.type === 'loc' ? '📍' : '👤'} ${escHtml(lore.name)} <span class="lore-chip-delete" data-lore-id="${lore.id}">✕</span>`;

    // Hover popover
    let popover = null;
    chip.addEventListener('mouseenter', () => {
      document.querySelectorAll('.lore-popover').forEach(p => p.remove());
      popover = document.createElement('div');
      popover.className = 'lore-popover';
      popover.innerHTML = `
        <div class="lore-popover-title">${escHtml(lore.name)}</div>
        <div class="lore-popover-meta">${lore.type === 'loc' ? '📍 Location' : '👤 Character'}${lore.meta ? ' · ' + escHtml(lore.meta) : ''}</div>
        ${lore.desc ? `<div class="lore-popover-desc">${escHtml(lore.desc)}</div>` : ''}
        <div style="font-size:0.6rem; color:rgba(255,255,255,0.2); margin-top:4px;">Double-click chip to navigate</div>
      `;
      el.appendChild(popover);

      // Position popover above chip
      const chipRect = chip.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      popover.style.bottom = (elRect.bottom - chipRect.top + 6) + 'px';
      popover.style.left = '8px';
      setTimeout(() => { if (popover) popover.style.opacity = '1'; }, 10);
    });
    chip.addEventListener('mouseleave', () => {
      if (popover) { popover.remove(); popover = null; }
    });

    // Double click to navigate to canvas node or page
    chip.addEventListener('dblclick', () => {
      if (lore.canvasNodeId) {
        const target = canvasState.nodes.find(n => n.data.id === lore.canvasNodeId);
        if (target) { panToNode(target); return; }
      }
      if (lore.pageId) {
        navigate(`page/${lore.pageId}`);
      }
    });

    // Delete chip
    chip.querySelector('.lore-chip-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!entry.data.content) entry.data.content = {};
      entry.data.content.loreAssociations = (entry.data.content.loreAssociations || []).filter(l => l.id !== lore.id);
      scheduleNodeSave(entry);
      renderLoreChipsFooter(el, entry);
    });

    footer.appendChild(chip);
  });

  // Insert footer inside the node element (after body)
  const body = el.querySelector('.canvas-node-body');
  if (body) {
    el.insertBefore(footer, body.nextSibling);
  } else {
    el.appendChild(footer);
  }
}

async function openLoreLinkPopup(el, entry) {
  document.querySelectorAll('.lore-link-popup').forEach(p => p.remove());
  document.querySelectorAll('.goal-popup').forEach(p => p.remove());

  // Gather available lore sources:
  // 1. Character Codex nodes on canvas
  // 2. Character/Location pages from DB
  const canvasChars = canvasState.nodes
    .filter(n => n.data.type === 'statblock' && n.data.id !== entry.data.id)
    .map(n => ({ id: `canvas-${n.data.id}`, name: n.data.title || 'Unnamed Character', type: 'char', canvasNodeId: n.data.id }));

  let dbPages = [];
  try {
    const project = await getActiveProject();
    if (project) {
      const pages = await getPages(project.id);
      // Filter to characters and locations schemas by name heuristic
      dbPages = pages
        .filter(p => p.title && p.title.trim())
        .slice(0, 40)
        .map(p => ({
          id: `page-${p.id}`,
          name: p.title,
          type: 'char',
          pageId: p.id,
          desc: p.content ? String(p.content).replace(/<[^>]+>/g, '').slice(0, 80) : ''
        }));
    }
  } catch (_) {}

  const allOptions = [...canvasChars, ...dbPages];
  if (allOptions.length === 0) {
    showToast('No characters or pages found. Add some first!', 'info');
    return;
  }

  const formatOptionText = (name) => {
    const truncated = name.length > 28 ? name.slice(0, 27) + '…' : name;
    return escHtml(truncated);
  };

  const popup = document.createElement('div');
  popup.className = 'lore-link-popup';
  popup.innerHTML = `
    <div style="font-size:0.72rem; color:var(--accent-primary); font-weight:700; margin-bottom:6px; letter-spacing:0.04em;">🏷️ LINK LORE</div>
    <input type="text" id="lore-search" placeholder="Search characters, pages..." class="lore-link-select" style="margin-bottom:6px;"/>
    <select id="lore-select" class="lore-link-select" size="6" style="height:auto; min-height:80px; margin-bottom:6px;">
      ${allOptions.map(o => `<option value="${escHtml(o.id)}">${formatOptionText(o.name)}</option>`).join('')}
    </select>
    <div style="display:flex;gap:6px;">
      <button id="lore-link-char-btn" style="flex:1; background:rgba(229,169,59,0.12); border:1px solid rgba(229,169,59,0.25); color:var(--accent-primary); padding:4px; border-radius:4px; font-size:0.7rem; cursor:pointer;">Link as 👤 Char</button>
      <button id="lore-link-loc-btn" style="flex:1; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.2); color:#10b981; padding:4px; border-radius:4px; font-size:0.7rem; cursor:pointer;">Link as 📍 Loc</button>
    </div>
  `;

  const header = el.querySelector('.canvas-node-header');
  header.style.position = 'relative';
  header.appendChild(popup);

  const searchInput = popup.querySelector('#lore-search');
  const select = popup.querySelector('#lore-select');
  searchInput.focus();

  // Live filter
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    const filtered = allOptions.filter(o => o.name.toLowerCase().includes(q));
    select.innerHTML = filtered.map(o => `<option value="${escHtml(o.id)}">${formatOptionText(o.name)}</option>`).join('');
  });

  const doLink = (type) => {
    const selectedVal = select.value;
    if (!selectedVal) { showToast('Select a character or page first', 'warning'); return; }
    const option = allOptions.find(o => o.id === selectedVal);
    if (!option) return;

    if (!entry.data.content) entry.data.content = {};
    if (!entry.data.content.loreAssociations) entry.data.content.loreAssociations = [];

    // Avoid duplicates
    const alreadyLinked = entry.data.content.loreAssociations.some(l => l.id === option.id);
    if (alreadyLinked) { showToast('Already linked!', 'info'); popup.remove(); return; }

    entry.data.content.loreAssociations.push({
      id: option.id,
      name: option.name,
      type: type,
      canvasNodeId: option.canvasNodeId || null,
      pageId: option.pageId || null,
      meta: option.meta || null,
      desc: option.desc || null,
    });

    scheduleNodeSave(entry);
    renderLoreChipsFooter(el, entry);
    popup.remove();
    showToast(`Linked: ${option.name}`, 'success');
  };

  popup.querySelector('#lore-link-char-btn').addEventListener('click', () => doLink('char'));
  popup.querySelector('#lore-link-loc-btn').addEventListener('click', () => doLink('loc'));

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!popup.contains(e.target)) {
        popup.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 50);
}

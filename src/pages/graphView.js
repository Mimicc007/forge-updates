/* ============================================================
   Forge — Web of Fate (Relationship Graph)
   An interactive, canvas-based force-directed node graph
   visualizing how all pages in the universe connect.
   ============================================================ */

import { getActiveProject, getPages, getSchemas, getAllTabs, getNodesForTab } from '../db.js';
import { navigate } from '../router.js';
import { refreshIcons } from '../main.js';
import { showToast, escapeHtml } from '../ui.js';

// Graph state
let state = {
  project: null,
  pages: [],
  schemas: [],
  nodes: [],
  edges: [],
  filteredNodes: [],
  filteredEdges: [],
  focusedNodeId: null,
  draggedNode: null,
  zoom: 0.9,
  panX: 0,
  panY: 0,
  width: 0,
  height: 0,
  isPanning: false,
  dragStartX: 0,
  dragStartY: 0,
  panStartX: 0,
  panStartY: 0,
  searchQuery: '',
  activeSchemaFilters: new Set(),
  animationFrameId: null,
  canvas: null,
  ctx: null,
  physicsCooling: 1.0,
  hoveredNode: null
};

// Colors for schemas (fallback to stone if unknown)
const NEON_COLORS = [
  '#f43f5e', // Neon Rose
  '#a855f7', // Neon Purple
  '#3b82f6', // Neon Blue
  '#10b981', // Neon Emerald
  '#e5a93b', // Neon Gold
  '#06b6d4', // Neon Cyan
  '#ec4899', // Neon Pink
  '#f97316'  // Neon Orange
];

export async function renderGraphView(container) {
  if (window.setTabTitle) {
    window.setTabTitle('Web of Fate');
  }

  // Load project data
  state.project = await getActiveProject();
  if (!state.project) {
    container.innerHTML = `<div class="empty-state"><p>Please open or create a project first.</p></div>`;
    return;
  }

  state.pages = await getPages(state.project.id);
  state.schemas = await getSchemas(state.project.id);

  // Initialize schema filters (all active by default)
  state.activeSchemaFilters.clear();
  state.schemas.forEach(s => state.activeSchemaFilters.add(s.id));
  state.activeSchemaFilters.add('standalone'); // For pages without a schema

  // Setup layout & build UI
  container.innerHTML = `
    <div class="web-of-fate-page" style="display: flex; flex-direction: column; height: 100vh; position: relative; background: #07050a; overflow: hidden; font-family: var(--font-hud, monospace);">
      
      <!-- Graph Header & Toolbar -->
      <div class="graph-toolbar" style="padding: var(--sp-4) var(--sp-6); background: rgba(10, 8, 18, 0.85); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); z-index: 10;">
        <div>
          <h1 class="page-title" style="font-size: 1.4rem; margin: 0; display: flex; align-items: center; gap: 8px; font-weight: 700; background: linear-gradient(135deg, var(--accent-primary) 0%, #d946ef 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
            <i data-lucide="network" style="-webkit-text-fill-color: var(--accent-primary); width: 20px; height: 20px;"></i>
            Web of Fate
          </h1>
          <p class="page-subtitle" style="font-size: var(--fs-xs); color: var(--text-muted); margin: 2px 0 0;">Visualizing inter-connections, backlinks, and narratives</p>
        </div>

        <div style="display: flex; align-items: center; gap: var(--sp-3);">
          <!-- Search input -->
          <div style="position: relative;">
            <input type="text" id="graph-search" placeholder="Search node..." style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 6px 12px 6px 30px; font-size: var(--fs-xs); color: var(--text-primary); outline: none; width: 180px; transition: all 0.3s;" />
            <i data-lucide="search" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 13px; height: 13px; color: var(--text-muted);"></i>
          </div>

          <button id="graph-recenter-btn" class="btn btn-secondary btn-sm" title="Recenter Graph" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0;">
            <i data-lucide="focus" style="width: 14px; height: 14px;"></i>
          </button>
        </div>
      </div>

      <!-- Filters & Legend Drawer (Left side overlay) -->
      <div id="graph-filters-sidebar" style="position: absolute; left: var(--sp-4); top: 90px; width: 220px; background: rgba(10, 8, 18, 0.9); backdrop-filter: blur(10px); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: var(--sp-4); z-index: 5; display: flex; flex-direction: column; gap: var(--sp-3); box-shadow: var(--shadow-lg);">
        <h4 style="margin: 0 0 var(--sp-1); font-size: var(--fs-xs); text-transform: uppercase; color: var(--accent-primary); letter-spacing: 0.08em;">Filters</h4>
        <div style="display: flex; flex-direction: column; gap: 6px;" id="schema-filter-list">
          <!-- Filters generated dynamically -->
        </div>
        <div class="hud-divider" style="margin: var(--sp-1) 0;"></div>
        <div style="font-size: 10px; color: var(--text-muted); line-height: 1.4;">
          💡 Double-click node to Edit<br/>
          💡 Click node to Focus connections<br/>
          💡 Drag nodes to rearrange
        </div>
      </div>

      <!-- Canvas Area -->
      <div id="graph-canvas-container" style="flex: 1; position: relative; width: 100%; height: 100%; cursor: grab;">
        <canvas id="graph-canvas" style="display: block; width: 100%; height: 100%;"></canvas>
      </div>
      
      <!-- Node Detail Panel (Bottom right overlay) -->
      <div id="graph-node-details" style="position: absolute; right: var(--sp-4); bottom: var(--sp-4); width: 280px; background: rgba(10, 8, 18, 0.9); backdrop-filter: blur(10px); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: var(--sp-4); z-index: 5; box-shadow: var(--shadow-lg); transition: all 0.3s; transform: translateY(120%); opacity: 0;">
        <!-- Filled dynamically -->
      </div>

    </div>
  `;

  // Inject Custom CSS styles
  injectGraphStyles();

  // Setup DOM references
  state.canvas = container.querySelector('#graph-canvas');
  state.ctx = state.canvas.getContext('2d');
  const canvasContainer = container.querySelector('#graph-canvas-container');

  // Handle Resize
  const resizeCanvas = () => {
    state.width = canvasContainer.clientWidth;
    state.height = canvasContainer.clientHeight;
    state.canvas.width = state.width * window.devicePixelRatio;
    state.canvas.height = state.height * window.devicePixelRatio;
    state.canvas.style.width = state.width + 'px';
    state.canvas.style.height = state.height + 'px';
    state.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  };
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Build Graph Nodes and Edges
  await buildGraphData();

  // Initial Center
  recenterGraph();

  // Populate Filter List
  renderFilterList(container);

  // Setup Interaction Handlers
  setupHandlers(container);

  // Start Animation Loop
  state.physicsCooling = 1.0; // Reset physics energy
  startSimulation();

  // Listen for database updates to dynamically rebuild links and nodes
  const handleDbUpdate = async (e) => {
    if (e.detail && (
      e.detail.storeName === 'pages' || 
      e.detail.storeName === 'links' || 
      e.detail.storeName === 'tabs' || 
      e.detail.storeName === 'nodes'
    )) {
      const oldNodeCount = state.nodes.length;
      state.pages = await getPages(state.project.id);
      state.schemas = await getSchemas(state.project.id);
      await buildGraphData();
      
      // If node count changed, revive physics slightly to disperse them. Otherwise, keep them fully stable.
      if (state.nodes.length !== oldNodeCount) {
        state.physicsCooling = 0.2;
      }
    }
  };
  window.addEventListener('forge-db-updated', handleDbUpdate);

  // Clean up event listener when navigating away
  container._cleanup = () => {
    window.removeEventListener('forge-db-updated', handleDbUpdate);
    if (state.animationFrameId) {
      cancelAnimationFrame(state.animationFrameId);
    }
  };

  refreshIcons();
}

function injectGraphStyles() {
  if (document.getElementById('graph-view-styles')) return;
  const style = document.createElement('style');
  style.id = 'graph-view-styles';
  style.innerHTML = `
    .web-of-fate-page input:focus {
      border-color: var(--accent-primary) !important;
      box-shadow: 0 0 8px rgba(229, 169, 59, 0.25);
      background: rgba(255,255,255,0.05) !important;
    }
  `;
  document.head.appendChild(style);
}

// ─── Data parsing and building ──────────────────────────────────────────────

async function buildGraphData() {
  const oldNodeMap = new Map(state.nodes.map(n => [n.id, n]));
  state.nodes = [];
  state.edges = [];

  const pageIdMap = new Map();
  const pageTitleMap = new Map();

  // 1. Create Nodes
  state.pages.forEach((page, idx) => {
    const schema = state.schemas.find(s => s.id === page.schemaId);
    let color = '#a8a29e'; // Default stone gray
    let schemaName = 'Standalone';

    if (schema) {
      schemaName = schema.name;
      const schemaIdx = state.schemas.indexOf(schema);
      color = NEON_COLORS[schemaIdx % NEON_COLORS.length];
    }

    const oldNode = oldNodeMap.get(page.id);

    const node = {
      id: page.id,
      label: page.title || 'Untitled',
      schemaId: page.schemaId || 'standalone',
      schemaName,
      color,
      x: oldNode ? oldNode.x : (Math.random() - 0.5) * 400,
      y: oldNode ? oldNode.y : (Math.random() - 0.5) * 400,
      vx: oldNode ? oldNode.vx : 0,
      vy: oldNode ? oldNode.vy : 0,
      radius: 12 + Math.min((page.content || '').length / 500, 10), // size based on content length
      page
    };

    state.nodes.push(node);
    pageIdMap.set(page.id, node);
    pageTitleMap.set((page.title || '').trim().toLowerCase(), node);
  });

  // Helper to safely add an edge
  const addEdge = (sourceId, targetId, type, label = '') => {
    if (sourceId === targetId) return; // No self loops
    const srcNode = pageIdMap.get(sourceId);
    const tgtNode = pageIdMap.get(targetId);
    if (!srcNode || !tgtNode) return;

    // Check duplicate
    const exists = state.edges.some(e => 
      (e.source === sourceId && e.target === targetId) ||
      (e.source === targetId && e.target === sourceId)
    );
    if (!exists) {
      state.edges.push({
        id: `${sourceId}-${targetId}`,
        source: sourceId,
        target: targetId,
        type,
        label
      });
    }
  };

  // 2. Discover Edges/Connections
  for (const page of state.pages) {
    // A. Parse Quill Delta or plain text in page.content for [[Page Title]] links
    const contentStr = page.content || '';
    
    // Simple bracket parser: [[Page Title]]
    const bracketRegex = /\[\[(.*?)\]\]/g;
    let match;
    while ((match = bracketRegex.exec(contentStr)) !== null) {
      const targetTitle = match[1].trim().toLowerCase();
      const targetNode = pageTitleMap.get(targetTitle);
      if (targetNode) {
        addEdge(page.id, targetNode.id, 'wiki', 'link');
      }
    }

    // Also parse actual links in Quill delta format (e.g. href="#/page/ID")
    if (contentStr.startsWith('{')) {
      try {
        const delta = JSON.parse(contentStr);
        if (delta.ops) {
          delta.ops.forEach(op => {
            if (op.attributes && op.attributes.link) {
              const href = op.attributes.link;
              const pageIdMatch = href.match(/#\/page\/([a-zA-Z0-9]+)/);
              if (pageIdMatch) {
                addEdge(page.id, pageIdMatch[1], 'wiki', 'link');
              }
            }
          });
        }
      } catch (_) {}
    }

    // B. Prerequisites links (Story beats)
    if (page.properties && page.properties.prerequisites) {
      const prereqs = Array.isArray(page.properties.prerequisites) 
        ? page.properties.prerequisites 
        : typeof page.properties.prerequisites === 'string' 
          ? page.properties.prerequisites.split(',').map(s => s.trim()) 
          : [];
      prereqs.forEach(preId => {
        addEdge(preId, page.id, 'prereq', 'prerequisite');
      });
    }

    // C. Characters relationships
    if (page.properties && page.properties.relationships) {
      const rels = Array.isArray(page.properties.relationships) ? page.properties.relationships : [];
      rels.forEach(rel => {
        addEdge(page.id, rel.characterId, 'relationship', rel.type || 'relates');
      });
    }
    // Backward compatibility with legacy character relationships list in page root
    if (page.relationships && Array.isArray(page.relationships)) {
      page.relationships.forEach(rel => {
        addEdge(page.id, rel.characterId, 'relationship', rel.type || 'relates');
      });
    }
  }

  // D. Canvas links (extract connections from all workspace tabs)
  try {
    const tabs = await getAllTabs();
    for (const tab of tabs) {
      const nodes = await getNodesForTab(tab.id);
      const connections = tab.connections || [];
      
      // Node ID to Page ID map
      const nodeToPageId = new Map();
      nodes.forEach(n => {
        if (n.type === 'pagelink' && n.content && n.content.pageId) {
          nodeToPageId.set(n.id, n.content.pageId);
        }
      });

      connections.forEach(c => {
        const srcPageId = nodeToPageId.get(c.sourceId);
        const tgtPageId = nodeToPageId.get(c.targetId);
        if (srcPageId && tgtPageId) {
          addEdge(srcPageId, tgtPageId, 'canvas', c.label || 'connects');
        }
      });
    }
  } catch (e) {
    console.error('Failed to parse workspace canvas links for graph', e);
  }

  filterGraph();
}

function filterGraph() {
  state.filteredNodes = state.nodes.filter(node => {
    // Schema filter
    if (!state.activeSchemaFilters.has(node.schemaId)) return false;

    // Search query filter
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      const title = node.label.toLowerCase();
      if (!title.includes(query)) return false;
    }

    return true;
  });

  const nodeIds = new Set(state.filteredNodes.map(n => n.id));

  state.filteredEdges = state.edges.filter(edge => {
    return nodeIds.has(edge.source) && nodeIds.has(edge.target);
  });
}

// ─── Recenter ───────────────────────────────────────────────────────────────

function recenterGraph() {
  state.zoom = 0.95;
  state.panX = state.width / 2;
  state.panY = state.height / 2;
}

// ─── Filter List Rendering ──────────────────────────────────────────────────

function renderFilterList(container) {
  const filterList = container.querySelector('#schema-filter-list');
  if (!filterList) return;

  filterList.innerHTML = '';

  const createFilterItem = (id, name, color) => {
    const label = document.createElement('label');
    label.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); font-size: var(--fs-xs); color: var(--text-secondary); cursor: pointer; padding: 4px 6px; border-radius: 4px; transition: background 0.2s;';
    label.onmouseenter = () => label.style.background = 'rgba(255,255,255,0.03)';
    label.onmouseleave = () => label.style.background = '';

    const isChecked = state.activeSchemaFilters.has(id);
    
    label.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="display:inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${color}; box-shadow: 0 0 6px ${color};"></span>
        <span>${escapeHtml(name)}</span>
      </div>
      <input type="checkbox" data-schema-id="${id}" ${isChecked ? 'checked' : ''} style="margin: 0; accent-color: var(--accent-primary);" />
    `;

    label.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) {
        state.activeSchemaFilters.add(id);
      } else {
        state.activeSchemaFilters.delete(id);
      }
      filterGraph();
    });

    filterList.appendChild(label);
  };

  // Add filters for each user schema
  state.schemas.forEach((schema, idx) => {
    const color = NEON_COLORS[idx % NEON_COLORS.length];
    createFilterItem(schema.id, schema.name, color);
  });

  // Add standalone default filter
  createFilterItem('standalone', 'Standalone Docs', '#a8a29e');
}

// ─── Interaction Handlers ───────────────────────────────────────────────────

function setupHandlers(container) {
  const searchInput = container.querySelector('#graph-search');
  const recenterBtn = container.querySelector('#graph-recenter-btn');
  const detailsPanel = container.querySelector('#graph-node-details');

  // Recenter
  recenterBtn.addEventListener('click', () => {
    recenterGraph();
    showToast('Recentered Graph View', 'info');
  });

  // Search
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    filterGraph();
  });

  // Canvas Mouse Actions
  const canvas = state.canvas;

  const getCanvasMousePos = (e) => {
    const rect = canvas.getBoundingClientRect();
    // Translate client coordinates to scaled/panned canvas space
    const x = (e.clientX - rect.left - state.panX) / state.zoom;
    const y = (e.clientY - rect.top - state.panY) / state.zoom;
    return { x, y };
  };

  canvas.addEventListener('mousedown', (e) => {
    const pos = getCanvasMousePos(e);
    
    // 1. Check if clicked a node
    let clickedNode = null;
    for (const node of state.filteredNodes) {
      const dx = pos.x - node.x;
      const dy = pos.y - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= node.radius + 6) {
        clickedNode = node;
        break;
      }
    }

    if (clickedNode) {
      if (e.button === 0) { // Left click
        state.draggedNode = clickedNode;
        state.focusedNodeId = clickedNode.id;
        renderNodeDetails(clickedNode, detailsPanel);
      }
    } else {
      // Background pan
      if (e.button === 0) {
        state.isPanning = true;
        canvas.style.cursor = 'grabbing';
        state.dragStartX = e.clientX;
        state.dragStartY = e.clientY;
        state.panStartX = state.panX;
        state.panStartY = state.panY;
      }
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const pos = getCanvasMousePos(e);

    // Node drag update
    if (state.draggedNode) {
      state.draggedNode.x = pos.x;
      state.draggedNode.y = pos.y;
      return;
    }

    // Pan update
    if (state.isPanning) {
      const dx = e.clientX - state.dragStartX;
      const dy = e.clientY - state.dragStartY;
      state.panX = state.panStartX + dx;
      state.panY = state.panStartY + dy;
      return;
    }

    // Hover detection
    let hovered = null;
    for (const node of state.filteredNodes) {
      const dx = pos.x - node.x;
      const dy = pos.y - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= node.radius + 6) {
        hovered = node;
        break;
      }
    }
    
    if (hovered !== state.hoveredNode) {
      state.hoveredNode = hovered;
      canvas.style.cursor = hovered ? 'pointer' : state.isPanning ? 'grabbing' : 'grab';
    }
  });

  window.addEventListener('mouseup', () => {
    state.draggedNode = null;
    if (state.isPanning) {
      state.isPanning = false;
      canvas.style.cursor = 'grab';
    }
  });

  // Double Click Node to Edit
  canvas.addEventListener('dblclick', (e) => {
    const pos = getCanvasMousePos(e);
    for (const node of state.filteredNodes) {
      const dx = pos.x - node.x;
      const dy = pos.y - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= node.radius + 6) {
        // Double click navigate to page
        navigate('page/' + node.id);
        break;
      }
    }
  });

  // Click background to clear focus
  canvas.addEventListener('click', (e) => {
    const pos = getCanvasMousePos(e);
    let hitNode = false;
    for (const node of state.filteredNodes) {
      const dx = pos.x - node.x;
      const dy = pos.y - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= node.radius + 6) {
        hitNode = true;
        break;
      }
    }
    if (!hitNode && !state.isPanning) {
      state.focusedNodeId = null;
      hideNodeDetails(detailsPanel);
    }
  });

  // Zooming
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.08;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Mouse coordinates in canvas space before zooming
    const canvasX = (mouseX - state.panX) / state.zoom;
    const canvasY = (mouseY - state.panY) / state.zoom;

    if (e.deltaY < 0) {
      state.zoom = Math.min(3.0, state.zoom * zoomFactor);
    } else {
      state.zoom = Math.max(0.15, state.zoom / zoomFactor);
    }

    // Adjust panning to center zoom on mouse point
    state.panX = mouseX - canvasX * state.zoom;
    state.panY = mouseY - canvasY * state.zoom;

    // Do not revive physics on zoom
  }, { passive: false });
}

// ─── Details Overlay ────────────────────────────────────────────────────────

function renderNodeDetails(node, panel) {
  panel.style.transform = 'translateY(0)';
  panel.style.opacity = '1';

  // Count incoming & outgoing links
  const outgoing = state.edges.filter(e => e.source === node.id);
  const incoming = state.edges.filter(e => e.target === node.id);

  panel.innerHTML = `
    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
      <div style="display: flex; gap: 8px; align-items: center;">
        <span style="display:inline-block; width: 10px; height: 10px; border-radius:50%; background:${node.color}; box-shadow:0 0 6px ${node.color}"></span>
        <span style="font-size:10px; color:var(--text-muted); text-transform:uppercase;">${escapeHtml(node.schemaName)}</span>
      </div>
      <button id="close-details-btn" style="background:transparent; border:none; color:var(--text-muted); font-size:11px; cursor:pointer;">✕</button>
    </div>
    <h3 style="margin: var(--sp-2) 0 var(--sp-1.5); font-size:var(--sp-4); color:var(--text-primary); font-weight:700;">${escapeHtml(node.label)}</h3>
    <p style="font-size:10px; color:var(--text-muted); margin: 0 0 var(--sp-3); font-style:italic;">Updated: ${new Date(node.page.updatedAt || node.page.createdAt).toLocaleDateString()}</p>
    
    <div class="hud-divider" style="margin: var(--sp-2) 0;"></div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--sp-2); text-align:center; font-size:var(--fs-xs); margin-bottom:var(--sp-4);">
      <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:4px; padding:var(--sp-2) 0;">
        <div style="color:var(--accent-primary); font-weight:bold; font-size:var(--sp-4.5);">${outgoing.length}</div>
        <div style="color:var(--text-muted); font-size:9px; text-transform:uppercase;">Outgoing</div>
      </div>
      <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:4px; padding:var(--sp-2) 0;">
        <div style="color:#d946ef; font-weight:bold; font-size:var(--sp-4.5);">${incoming.length}</div>
        <div style="color:var(--text-muted); font-size:9px; text-transform:uppercase;">Backlinks</div>
      </div>
    </div>

    <button id="open-editor-btn" class="btn btn-primary btn-sm w-full">Open Entry ↗</button>
  `;

  panel.querySelector('#close-details-btn').addEventListener('click', () => {
    state.focusedNodeId = null;
    hideNodeDetails(panel);
  });

  panel.querySelector('#open-editor-btn').addEventListener('click', () => {
    navigate('page/' + node.id);
  });
}

function hideNodeDetails(panel) {
  panel.style.transform = 'translateY(120%)';
  panel.style.opacity = '0';
}

// ─── Force-Directed Physics Simulation ──────────────────────────────────────

function startSimulation() {
  if (state.animationFrameId) {
    cancelAnimationFrame(state.animationFrameId);
  }

  const step = () => {
    if (state.physicsCooling > 0.005) {
      applyPhysicsForces();
      state.physicsCooling *= 0.85; // Cool down even faster to stabilize quickly
    }

    drawGraph();
    state.animationFrameId = requestAnimationFrame(step);
  };

  state.animationFrameId = requestAnimationFrame(step);
}

function applyPhysicsForces() {
  const nodes = state.filteredNodes;
  const edges = state.filteredEdges;
  const numNodes = nodes.length;

  if (numNodes === 0) return;

  // 1. Repulsion (Coulomb's Law) - Damped strength
  const repulsionStrength = 45;
  for (let i = 0; i < numNodes; i++) {
    const n1 = nodes[i];
    for (let j = i + 1; j < numNodes; j++) {
      const n2 = nodes[j];
      const dx = n2.x - n1.x;
      const dy = n2.y - n1.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1.0;

      if (dist < 280) {
        const force = (repulsionStrength * repulsionStrength) / (dist + 20);
        const fx = (dx / dist) * force * state.physicsCooling;
        const fy = (dy / dist) * force * state.physicsCooling;

        n1.vx -= fx;
        n1.vy -= fy;
        n2.vx += fx;
        n2.vy += fy;
      }
    }
  }

  // 2. Attraction (Hooke's Law along links) - Damped spring constant
  const idealLength = 100;
  const springConstant = 0.005;

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  edges.forEach(edge => {
    const n1 = nodeMap.get(edge.source);
    const n2 = nodeMap.get(edge.target);

    if (n1 && n2) {
      const dx = n2.x - n1.x;
      const dy = n2.y - n1.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1.0;

      const force = (dist - idealLength) * springConstant * state.physicsCooling;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      n1.vx += fx;
      n1.vy += fy;
      n2.vx -= fx;
      n2.vy -= fy;
    }
  });

  // 3. Gravity pulling to center (0, 0) - Muted gravity
  const gravity = 0.003;
  nodes.forEach(node => {
    if (node === state.draggedNode) return;

    node.vx -= node.x * gravity * state.physicsCooling;
    node.vy -= node.y * gravity * state.physicsCooling;

    // Cap max velocity to prevent sudden large movements (shaking)
    const maxVel = 2.0;
    node.vx = Math.max(-maxVel, Math.min(maxVel, node.vx));
    node.vy = Math.max(-maxVel, Math.min(maxVel, node.vy));

    // Apply friction and update coordinates
    node.x += node.vx;
    node.y += node.vy;

    // Cool down velocity with heavier damping friction (0.5 instead of 0.65)
    node.vx *= 0.5;
    node.vy *= 0.5;
  });
}

// ─── Drawing ────────────────────────────────────────────────────────────────

function drawGraph() {
  const ctx = state.ctx;
  if (!ctx) return;

  // Clear canvas
  ctx.fillStyle = '#07050a';
  ctx.fillRect(0, 0, state.width, state.height);

  ctx.save();
  // Apply Zoom and Pan
  ctx.translate(state.panX, state.panY);
  ctx.scale(state.zoom, state.zoom);

  // Draw Grid lines under graph
  drawGridPattern(ctx);

  // Draw Edges
  state.filteredEdges.forEach(edge => {
    const srcNode = state.filteredNodes.find(n => n.id === edge.source);
    const tgtNode = state.filteredNodes.find(n => n.id === edge.target);
    if (!srcNode || !tgtNode) return;

    // Determine opacity based on focus state
    let alpha = 0.12;
    let strokeWidth = 1.0;

    if (state.focusedNodeId) {
      if (edge.source === state.focusedNodeId || edge.target === state.focusedNodeId) {
        alpha = 0.65;
        strokeWidth = 2.0;
      } else {
        alpha = 0.03;
      }
    } else {
      alpha = 0.22;
    }

    ctx.strokeStyle = `rgba(229, 169, 59, ${alpha})`;
    if (edge.type === 'relationship') ctx.strokeStyle = `rgba(244, 63, 94, ${alpha})`; // Crimson relations
    if (edge.type === 'canvas') ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`; // Blue canvas links

    ctx.lineWidth = strokeWidth;
    ctx.beginPath();
    ctx.moveTo(srcNode.x, srcNode.y);
    ctx.lineTo(tgtNode.x, tgtNode.y);
    ctx.stroke();

    // Draw edge labels if hovered or focused on the source/target
    if (alpha >= 0.5 && edge.label) {
      const midX = (srcNode.x + tgtNode.x) / 2;
      const midY = (srcNode.y + tgtNode.y) / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(10, 8, 18, 0.9)';
      ctx.font = '8px monospace';
      const textWidth = ctx.measureText(edge.label).width;
      ctx.fillRect(midX - textWidth / 2 - 3, midY - 6, textWidth + 6, 11);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(edge.label, midX - textWidth / 2, midY + 2);
      ctx.restore();
    }
  });

  // Draw Nodes
  state.filteredNodes.forEach(node => {
    // Determine opacity based on focus state
    let alpha = 1.0;
    if (state.focusedNodeId) {
      const isNeighbor = state.edges.some(e => 
        (e.source === node.id && e.target === state.focusedNodeId) ||
        (e.source === state.focusedNodeId && e.target === node.id)
      );
      if (node.id === state.focusedNodeId) {
        alpha = 1.0;
      } else if (isNeighbor) {
        alpha = 0.8;
      } else {
        alpha = 0.12;
      }
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    // Glowing shadow
    ctx.shadowBlur = 12;
    ctx.shadowColor = node.color;

    // Node Circle
    ctx.fillStyle = node.color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fill();

    // Node Border
    ctx.shadowBlur = 0; // Reset shadow for stroke
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // If focused, draw ring
    if (node.id === state.focusedNodeId) {
      ctx.strokeStyle = node.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Node text label
    ctx.font = `${node.id === state.focusedNodeId ? 'bold 11px' : '10px'} monospace`;
    ctx.fillStyle = node.id === state.focusedNodeId ? '#ffffff' : 'rgba(255,255,255,0.75)';
    ctx.textAlign = 'center';
    
    // Draw label below node
    ctx.fillText(node.label, node.x, node.y + node.radius + 14);

    ctx.restore();
  });

  ctx.restore();
}

function drawGridPattern(ctx) {
  const gridSize = 45;
  const width = 2000;
  const height = 2000;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.012)';
  ctx.lineWidth = 0.5;

  ctx.beginPath();
  for (let x = -width; x <= width; x += gridSize) {
    ctx.moveTo(x, -height);
    ctx.lineTo(x, height);
  }
  for (let y = -height; y <= height; y += gridSize) {
    ctx.moveTo(-width, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
}

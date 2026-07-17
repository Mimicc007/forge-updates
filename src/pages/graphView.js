/* ============================================================
   Forge — Web of Fate (Relationship Graph)
   An interactive, canvas-based force-directed node graph
   visualizing how all pages in the universe connect.
   ============================================================ */

import { getActiveProject, getPages, getSchemas, getAllTabs, getNodesForTab, getAllNodes } from '../db.js';
import { navigate } from '../router.js';
import { refreshIcons } from '../icons.js';
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
  activeEdgeFilters: new Set(['wiki', 'prereq', 'relationship', 'canvas', 'pov', 'appearance', 'setup-payoff', 'hierarchy']),
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

  // Initialize edge filters (all active by default)
  state.activeEdgeFilters = new Set(['wiki', 'prereq', 'relationship', 'canvas', 'pov', 'appearance', 'setup-payoff', 'hierarchy']);

  const styleId = state.project?.settings?.style || 'story';
  if (styleId === 'story') {
    state.activeSchemaFilters.add('setup');
    state.activeSchemaFilters.add('payoff');
  }

  // Setup layout & build UI
  container.innerHTML = `
    <div class="web-of-fate-page" style="display: flex; flex-direction: column; height: 100vh; position: relative; background: #070b14; overflow: hidden; font-family: 'Space Grotesk', sans-serif;">
      
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

          <!-- Zoom indicator -->
          <span id="graph-zoom-label" title="Click to recenter" style="font-size: 0.72rem; font-family: var(--font-hud, monospace); color: rgba(255,255,255,0.4); cursor: pointer; padding: 0 4px; user-select:none; transition: color 0.15s;" onmouseenter="this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.color='rgba(255,255,255,0.4)'">95%</span>

          <!-- Sidebar toggle -->
          <button id="graph-sidebar-toggle-btn" class="btn btn-secondary btn-sm" title="Toggle Filters" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0;">
            <i data-lucide="sliders-horizontal" style="width: 14px; height: 14px;"></i>
          </button>

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
        <div id="graph-stats-line">— nodes · — edges</div>
        <div class="graph-tips-block">
          <div class="graph-tip-row"><span class="graph-tip-dot"></span><span>Double-click a node to open its entry</span></div>
          <div class="graph-tip-row"><span class="graph-tip-dot"></span><span>Click a node to focus its connections</span></div>
          <div class="graph-tip-row"><span class="graph-tip-dot"></span><span>Drag nodes to rearrange the layout</span></div>
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

      <!-- Hover Tooltip overlay -->
      <div id="graph-tooltip" style="position: fixed; pointer-events: none; background: rgba(10, 8, 18, 0.94); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 10px 14px; z-index: 1000; box-shadow: var(--shadow-xl); max-width: 240px; opacity: 0; transform: translate(-50%, -115%) scale(0.95); transition: opacity 150ms ease, transform 150ms ease;"></div>

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
  updateGraphStats(container);

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
    #graph-filters-sidebar {
      transition: transform 0.25s cubic-bezier(0.25,0.8,0.25,1), opacity 0.25s;
    }
    #graph-filters-sidebar.sidebar-hidden {
      transform: translateX(-110%);
      opacity: 0;
      pointer-events: none;
    }
    #graph-stats-line {
      font-size: 0.68rem;
      font-family: var(--font-hud, monospace);
      color: var(--text-muted);
      padding-top: 8px;
      border-top: 1px solid rgba(255,255,255,0.05);
      margin-top: 4px;
    }
    .graph-tips-block {
      border-top: 1px solid rgba(255,255,255,0.05);
      padding-top: 10px;
      margin-top: 4px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .graph-tip-row {
      display: flex;
      align-items: flex-start;
      gap: 7px;
      font-size: 0.68rem;
      color: var(--text-muted);
      line-height: 1.4;
    }
    .graph-tip-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--accent-primary);
      flex-shrink: 0;
      margin-top: 5px;
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

  // 1. Create Nodes from Pages
  state.pages.forEach((page, idx) => {
    const schema = state.schemas.find(s => s.id === page.schemaId);
    let color = '#a8a29e'; // Default stone gray
    let schemaName = 'Standalone';

    if (schema) {
      schemaName = schema.name;
      color = schema.color || NEON_COLORS[state.schemas.indexOf(schema) % NEON_COLORS.length];
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

  const styleId = state.project?.settings?.style || 'story';
  const tabs = await getAllTabs();
  const allNodes = await getAllNodes();

  if (styleId === 'story') {
    const setupNodes = allNodes.filter(n => n.type === 'setup');
    const payoffNodes = allNodes.filter(n => n.type === 'payoff');

    // Build connection lookups to check unresolved setups
    const nodeConnections = new Map();
    tabs.forEach(t => {
      const conns = t.connections || [];
      conns.forEach(c => {
        if (!nodeConnections.has(c.sourceId)) nodeConnections.set(c.sourceId, []);
        if (!nodeConnections.has(c.targetId)) nodeConnections.set(c.targetId, []);
        nodeConnections.get(c.sourceId).push(c.targetId);
        nodeConnections.get(c.targetId).push(c.sourceId);
      });
    });

    const tabBeatMap = new Map();
    tabs.forEach(t => { if (t.beatId) tabBeatMap.set(t.id, t.beatId); });

    // Process Setup nodes
    setupNodes.forEach(setup => {
      let resolvedPayoffId = setup.content?.payoffNodeId || '';
      if (!resolvedPayoffId) {
        const connectedNodeIds = nodeConnections.get(setup.id) || [];
        const connectedPayoff = payoffNodes.find(p => connectedNodeIds.includes(p.id));
        if (connectedPayoff) {
          resolvedPayoffId = connectedPayoff.id;
        }
      }
      const hasPayoff = payoffNodes.some(p => p.id === resolvedPayoffId);
      const isUnresolved = !hasPayoff;

      const oldNode = oldNodeMap.get(setup.id);
      const beatId = tabBeatMap.get(setup.tabId);
      const beatPage = beatId ? state.pages.find(p => p.id === beatId) : null;

      const node = {
        id: setup.id,
        label: setup.title || `Setup: ${setup.content?.setupType || 'Plant'}`,
        schemaId: 'setup',
        schemaName: 'Setup',
        color: '#3b82f6', // Setup node is blue
        x: oldNode ? oldNode.x : (Math.random() - 0.5) * 400,
        y: oldNode ? oldNode.y : (Math.random() - 0.5) * 400,
        vx: oldNode ? oldNode.vx : 0,
        vy: oldNode ? oldNode.vy : 0,
        radius: 10,
        isUnresolved,
        resolvedPayoffId: hasPayoff ? resolvedPayoffId : null,
        page: beatPage || { updatedAt: setup.updatedAt || setup.createdAt || Date.now(), createdAt: setup.createdAt || Date.now(), title: 'Beat Canvas' }
      };

      state.nodes.push(node);
      pageIdMap.set(setup.id, node);
    });

    // Process Payoff nodes
    payoffNodes.forEach(payoff => {
      const oldNode = oldNodeMap.get(payoff.id);
      const beatId = tabBeatMap.get(payoff.tabId);
      const beatPage = beatId ? state.pages.find(p => p.id === beatId) : null;

      const node = {
        id: payoff.id,
        label: payoff.title || `Payoff: ${payoff.content?.payoffType || 'Resolution'}`,
        schemaId: 'payoff',
        schemaName: 'Payoff',
        color: '#10b981', // Payoff node is green
        x: oldNode ? oldNode.x : (Math.random() - 0.5) * 400,
        y: oldNode ? oldNode.y : (Math.random() - 0.5) * 400,
        vx: oldNode ? oldNode.vx : 0,
        vy: oldNode ? oldNode.vy : 0,
        radius: 10,
        page: beatPage || { updatedAt: payoff.updatedAt || payoff.createdAt || Date.now(), createdAt: payoff.createdAt || Date.now(), title: 'Beat Canvas' }
      };

      state.nodes.push(node);
      pageIdMap.set(payoff.id, node);
    });
  }

  // Helper to safely add an edge
  const addEdge = (sourceId, targetId, type, label = '') => {
    if (sourceId === targetId) return; // No self loops
    const srcNode = pageIdMap.get(sourceId);
    const tgtNode = pageIdMap.get(targetId);
    if (!srcNode || !tgtNode) return;

    // Check duplicate (differentiated by type to allow multiple connections)
    const exists = state.edges.some(e => 
      (e.source === sourceId && e.target === targetId && e.type === type) ||
      (e.source === targetId && e.target === sourceId && e.type === type)
    );
    if (!exists) {
      state.edges.push({
        id: `${sourceId}-${targetId}-${type}`,
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
    for (const tab of tabs) {
      const nodes = allNodes.filter(n => n.tabId === tab.id);
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

  // E. Story-specific links (POV, appearances, Setup-Payoffs, hierarchy)
  if (styleId === 'story') {
    const beats = state.pages.filter(p => p.isStoryBeat || p.properties?.isStoryBeat || p.schemaId === 'story-chapters-schema' || p.schemaId === 'story-beats-schema');
    
    // POV links & Appearances
    beats.forEach(beat => {
      // Primary POV (field f4)
      if (beat.properties?.f4) {
        const charNode = pageTitleMap.get(beat.properties.f4.toLowerCase().trim());
        if (charNode) {
          addEdge(charNode.id, beat.id, 'pov', 'Primary POV');
        }
      }
      // Secondary POV (field f5)
      if (beat.properties?.f5) {
        const charNode = pageTitleMap.get(beat.properties.f5.toLowerCase().trim());
        if (charNode) {
          addEdge(charNode.id, beat.id, 'pov', 'Secondary POV');
        }
      }

      // Appearances
      const activeChars = new Set();
      const roadmapChars = beat.properties?.characters || [];
      roadmapChars.forEach(cid => activeChars.add(cid));

      const tab = tabs.find(t => t.beatId === beat.id);
      if (tab) {
        const nodes = allNodes.filter(n => n.tabId === tab.id);
        nodes.forEach(n => {
          if ((n.type === 'pagelink' || n.type === 'statblock') && n.content?.pageId) {
            activeChars.add(n.content.pageId);
          }
        });
      }

      activeChars.forEach(cid => {
        addEdge(cid, beat.id, 'appearance', 'Appears');
      });
    });

    // Setup-Payoffs & Hierarchy edges
    const setupNodes = allNodes.filter(n => n.type === 'setup');
    const payoffNodes = allNodes.filter(n => n.type === 'payoff');
    const tabBeatMap = new Map();
    tabs.forEach(t => { if (t.beatId) tabBeatMap.set(t.id, t.beatId); });

    // Establish connections map
    const nodeConnections = new Map();
    tabs.forEach(t => {
      const conns = t.connections || [];
      conns.forEach(c => {
        if (!nodeConnections.has(c.sourceId)) nodeConnections.set(c.sourceId, []);
        if (!nodeConnections.has(c.targetId)) nodeConnections.set(c.targetId, []);
        nodeConnections.get(c.sourceId).push(c.targetId);
        nodeConnections.get(c.targetId).push(c.sourceId);
      });
    });

    setupNodes.forEach(setup => {
      let resolvedPayoffId = setup.content?.payoffNodeId || '';
      if (!resolvedPayoffId) {
        const connectedNodeIds = nodeConnections.get(setup.id) || [];
        const connectedPayoff = payoffNodes.find(p => connectedNodeIds.includes(p.id));
        if (connectedPayoff) {
          resolvedPayoffId = connectedPayoff.id;
        }
      }
      
      const hasPayoff = payoffNodes.some(p => p.id === resolvedPayoffId);
      if (hasPayoff) {
        addEdge(setup.id, resolvedPayoffId, 'setup-payoff', 'Setup-Payoff');
      }

      // Hierarchy
      const parentBeatId = tabBeatMap.get(setup.tabId);
      if (parentBeatId) {
        addEdge(setup.id, parentBeatId, 'hierarchy', 'Hierarchy');
      }
    });

    payoffNodes.forEach(payoff => {
      // Hierarchy
      const parentBeatId = tabBeatMap.get(payoff.tabId);
      if (parentBeatId) {
        addEdge(payoff.id, parentBeatId, 'hierarchy', 'Hierarchy');
      }
    });
  }

  // F. Calculate dynamic connection degrees for zoom label density
  state.nodes.forEach(node => {
    node.edgeCount = state.edges.filter(e => e.source === node.id || e.target === node.id).length;
  });

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
    if (state.activeEdgeFilters && !state.activeEdgeFilters.has(edge.type)) return false;
    return nodeIds.has(edge.source) && nodeIds.has(edge.target);
  });
}

// 2d: Update node/edge count display in sidebar
function updateGraphStats(container) {
  const statsEl = container?.querySelector('#graph-stats-line');
  if (!statsEl) return;
  const nCount = state.filteredNodes.length;
  const eCount = state.filteredEdges.length;
  statsEl.textContent = `${nCount} node${nCount !== 1 ? 's' : ''} \u00b7 ${eCount} edge${eCount !== 1 ? 's' : ''}`;
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

  const styleId = state.project?.settings?.style || 'story';
  if (styleId === 'story') {
    createFilterItem('setup', 'Setup Nodes', '#3b82f6');
    createFilterItem('payoff', 'Payoff Nodes', '#10b981');
    
    // Add Edge Filters section
    const edgeHeader = document.createElement('h4');
    edgeHeader.style.cssText = 'margin: var(--sp-3) 0 var(--sp-1); font-size: var(--fs-xs); text-transform: uppercase; color: var(--accent-primary); letter-spacing: 0.08em;';
    edgeHeader.textContent = 'Link Types';
    filterList.appendChild(edgeHeader);

    const edgeTypes = [
      { id: 'pov', name: 'POV Links', color: '#e5a93b' },
      { id: 'appearance', name: 'Appearances', color: '#a78bfa' },
      { id: 'setup-payoff', name: 'Setup-Payoff', color: '#10b981' },
      { id: 'hierarchy', name: 'Hierarchy', color: '#64748b' }
    ];

    edgeTypes.forEach(et => {
      const label = document.createElement('label');
      label.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); font-size: var(--fs-xs); color: var(--text-secondary); cursor: pointer; padding: 4px 6px; border-radius: 4px; transition: background 0.2s;';
      label.onmouseenter = () => label.style.background = 'rgba(255,255,255,0.03)';
      label.onmouseleave = () => label.style.background = '';

      const isChecked = state.activeEdgeFilters.has(et.id);

      label.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="display:inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${et.color}; box-shadow: 0 0 6px ${et.color};"></span>
          <span>${escapeHtml(et.name)}</span>
        </div>
        <input type="checkbox" data-edge-id="${et.id}" ${isChecked ? 'checked' : ''} style="margin: 0; accent-color: var(--accent-primary);" />
      `;

      label.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) {
          state.activeEdgeFilters.add(et.id);
        } else {
          state.activeEdgeFilters.delete(et.id);
        }
        filterGraph();
      });

      filterList.appendChild(label);
    });
  }
}

// ─── Interaction Handlers ───────────────────────────────────────────────────

function setupHandlers(container) {
  const searchInput = container.querySelector('#graph-search');
  const recenterBtn = container.querySelector('#graph-recenter-btn');
  const sidebarToggleBtn = container.querySelector('#graph-sidebar-toggle-btn');
  const zoomLabel = container.querySelector('#graph-zoom-label');
  const detailsPanel = container.querySelector('#graph-node-details');
  const sidebar = container.querySelector('#graph-filters-sidebar');

  // Restore sidebar visibility from localStorage
  const sidebarKey = 'forge-graph-sidebar-open';
  const sidebarOpen = localStorage.getItem(sidebarKey) !== 'false';
  if (!sidebarOpen && sidebar) sidebar.classList.add('sidebar-hidden');

  // Recenter
  recenterBtn.addEventListener('click', () => {
    recenterGraph();
    showToast('Recentered Graph View', 'info');
  });

  // 2f: Zoom label click also recenters
  if (zoomLabel) {
    zoomLabel.addEventListener('click', () => {
      recenterGraph();
      zoomLabel.textContent = '95%';
      showToast('Recentered Graph View', 'info');
    });
  }

  // 2c: Sidebar toggle
  if (sidebarToggleBtn && sidebar) {
    sidebarToggleBtn.addEventListener('click', () => {
      const isHidden = sidebar.classList.toggle('sidebar-hidden');
      localStorage.setItem(sidebarKey, isHidden ? 'false' : 'true');
    });
  }

  // Search
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    filterGraph();
    updateGraphStats(container);
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
      state.draggedNode.vx = (pos.x - state.draggedNode.x);
      state.draggedNode.vy = (pos.y - state.draggedNode.y);
      state.draggedNode.x = pos.x;
      state.draggedNode.y = pos.y;
      state.physicsCooling = 1.0;
      updateTooltip(null);
      return;
    }

    // Pan update
    if (state.isPanning) {
      const dx = e.clientX - state.dragStartX;
      const dy = e.clientY - state.dragStartY;
      state.panX = state.panStartX + dx;
      state.panY = state.panStartY + dy;
      updateTooltip(null);
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
      updateTooltip(hovered, e);
    } else if (hovered) {
      positionTooltip(e);
    }
  });

  window.addEventListener('mouseup', () => {
    if (state.draggedNode) {
      state.physicsCooling = 1.0;
      state.draggedNode = null;
    }
    if (state.isPanning) {
      state.isPanning = false;
      canvas.style.cursor = 'grab';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    state.hoveredNode = null;
    updateTooltip(null);
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
        if (node.schemaName === 'Setup' || node.schemaName === 'Payoff') {
          if (node.page && node.page.id) {
            navigate('page/' + node.page.id);
          }
        } else {
          navigate('page/' + node.id);
        }
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

    // 2f: Update zoom label
    const zl = container.querySelector('#graph-zoom-label');
    if (zl) zl.textContent = Math.round(state.zoom * 100) + '%';

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

  const isOpenWorkspace = (node.schemaName === 'Setup' || node.schemaName === 'Payoff');
  const buttonText = isOpenWorkspace ? 'Open Beat Workspace ↗' : 'Open Entry ↗';

  // 2e: Lucide x icon for close button
  panel.innerHTML = `
    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
      <div style="display: flex; gap: 8px; align-items: center;">
        <span style="display:inline-block; width: 10px; height: 10px; border-radius:50%; background:${node.color}; box-shadow:0 0 6px ${node.color}"></span>
        <span style="font-size:10px; color:var(--text-muted); text-transform:uppercase;">${escapeHtml(node.schemaName)}</span>
      </div>
      <button id="close-details-btn" class="btn btn-secondary" title="Close" style="width:22px;height:22px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:4px;flex-shrink:0;">
        <i data-lucide="x" style="width:12px;height:12px;"></i>
      </button>
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

    <button id="open-editor-btn" class="btn btn-primary btn-sm w-full">${buttonText}</button>
  `;

  refreshIcons();

  panel.querySelector('#close-details-btn').addEventListener('click', () => {
    state.focusedNodeId = null;
    hideNodeDetails(panel);
  });

  panel.querySelector('#open-editor-btn').addEventListener('click', () => {
    if (isOpenWorkspace) {
      if (node.page && node.page.id) {
        navigate('page/' + node.page.id);
      } else {
        showToast('Parent Beat Sheet not found', 'warning');
      }
    } else {
      navigate('page/' + node.id);
    }
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
      state.physicsCooling *= 0.88; // Cool down faster and stop floatiness
    } else {
      // Clear velocities to guarantee zero jitter at rest
      state.filteredNodes.forEach(n => {
        n.vx = 0;
        n.vy = 0;
      });
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

  // Initialize node mass dynamically based on node radius (area-proportional)
  nodes.forEach(node => {
    node.mass = node.radius * node.radius * 0.05; // Larger nodes are heavier
  });

  const idealLength = 110;
  const springConstant = 0.04;   // Stable spring constant
  const springDamping = 0.70;    // Strong damping to stop spring oscillation quickly
  const charge = 250;            // Lower repulsion charge to prevent distant node drift

  // 1. N-Body Coulomb Repulsion (push nodes apart gently, only when close and connected)
  for (let i = 0; i < numNodes; i++) {
    const n1 = nodes[i];
    if (n1.edgeCount === 0) continue; // Skip unconnected nodes
    
    for (let j = i + 1; j < numNodes; j++) {
      const n2 = nodes[j];
      if (n2.edgeCount === 0) continue; // Skip unconnected nodes
      
      const dx = n2.x - n1.x;
      const dy = n2.y - n1.y;
      const distSq = dx * dx + dy * dy;
      const dist = Math.sqrt(distSq) || 1.0;

      // Only repel when very close to avoid shifting unconnected distant nodes
      if (dist < 150) {
        const force = (charge * n1.mass * n2.mass) / (distSq + 100);
        const fx = (dx / dist) * force * state.physicsCooling;
        const fy = (dy / dist) * force * state.physicsCooling;

        n1.vx -= fx / n1.mass;
        n1.vy -= fy / n1.mass;
        n2.vx += fx / n2.mass;
        n2.vy += fy / n2.mass;
      }
    }
  }

  // 2. Link Spring Forces (Hooke's Law + Spring Damping)
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  edges.forEach(edge => {
    const n1 = nodeMap.get(edge.source);
    const n2 = nodeMap.get(edge.target);

    if (n1 && n2) {
      const dx = n2.x - n1.x;
      const dy = n2.y - n1.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1.0;

      // Displacement force
      const displacement = dist - idealLength;
      const springForce = displacement * springConstant;

      // Spring velocity damping (stops rubber band oscillation)
      const rvx = n2.vx - n1.vx;
      const rvy = n2.vy - n1.vy;
      const nx = dx / dist;
      const ny = dy / dist;
      const relVelNormal = rvx * nx + rvy * ny;
      const dampingForce = relVelNormal * springDamping;

      let totalForce = (springForce + dampingForce) * state.physicsCooling;

      // Pull neighbor nodes extra if dragged node stretched too far
      const isDraggingN1 = (n1 === state.draggedNode);
      const isDraggingN2 = (n2 === state.draggedNode);
      if ((isDraggingN1 || isDraggingN2) && dist > 110) {
        totalForce += (dist - 110) * 0.85;
      }

      const fx = nx * totalForce;
      const fy = ny * totalForce;

      n1.vx += fx / n1.mass;
      n1.vy += fy / n1.mass;
      n2.vx -= fx / n2.mass;
      n2.vy -= fy / n2.mass;
    }
  });

  // 3. Rigid Body Overlap Resolution & Elastic Impulse Collisions
  for (let i = 0; i < numNodes; i++) {
    const n1 = nodes[i];
    for (let j = i + 1; j < numNodes; j++) {
      const n2 = nodes[j];
      const dx = n2.x - n1.x;
      const dy = n2.y - n1.y;
      const distSq = dx * dx + dy * dy;
      const minDist = n1.radius + n2.radius + 12; // radius + padding

      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq) || 1.0;
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;

        // Position projection (resolve overlap instantly)
        const percent = 0.5; // shift factor
        const correctionAmount = overlap / (1 / n1.mass + 1 / n2.mass) * percent;
        const cx = nx * correctionAmount;
        const cy = ny * correctionAmount;

        if (n1 !== state.draggedNode) {
          n1.x -= cx / n1.mass;
          n1.y -= cy / n1.mass;
        }
        if (n2 !== state.draggedNode) {
          n2.x += cx / n2.mass;
          n2.y += cy / n2.mass;
        }

        // Elastic momentum impulse calculation (bounce effect)
        const rvx = n2.vx - n1.vx;
        const rvy = n2.vy - n1.vy;
        const velAlongNormal = rvx * nx + rvy * ny;

        if (velAlongNormal < 0) { // Nodes moving towards each other
          const restitution = 0.35; // bounce elasticity coefficient
          const impulseScalar = -(1 + restitution) * velAlongNormal / (1 / n1.mass + 1 / n2.mass);

          const ix = nx * impulseScalar;
          const iy = ny * impulseScalar;

          if (n1 !== state.draggedNode) {
            n1.vx -= ix / n1.mass;
            n1.vy -= iy / n1.mass;
          }
          if (n2 !== state.draggedNode) {
            n2.vx += ix / n2.mass;
            n2.vy += iy / n2.mass;
          }
        }
      }
    }
  }

  // 4. Gravity, boundary limits, and position integration
  const gravity = 0.003;
  const boundaryRadius = 600; // soft boundary from center
  nodes.forEach(node => {
    if (node === state.draggedNode) return;

    // Unconnected nodes: freeze velocities to prevent sliding or drifting on other nodes' drag
    if (node.edgeCount === 0) {
      node.vx = 0;
      node.vy = 0;
      return;
    }

    // Pull toward center (0, 0) only if connected
    if (node.edgeCount > 0) {
      node.vx -= node.x * gravity * state.physicsCooling;
      node.vy -= node.y * gravity * state.physicsCooling;
    }

    // Boundary repulsion wall
    const distToCenter = Math.sqrt(node.x * node.x + node.y * node.y) || 1.0;
    if (distToCenter > boundaryRadius) {
      const boundaryPush = (distToCenter - boundaryRadius) * 0.05;
      node.vx -= (node.x / distToCenter) * boundaryPush;
      node.vy -= (node.y / distToCenter) * boundaryPush;
    }

    // Limit maximum speed to keep system stable and grounded
    const maxVel = 24.0;
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
    if (speed > maxVel) {
      node.vx = (node.vx / speed) * maxVel;
      node.vy = (node.vy / speed) * maxVel;
    }

    // Apply coordinate updates
    node.x += node.vx;
    node.y += node.vy;

    // Viscous friction damping (0.75) to feel grounded and heavy
    node.vx *= 0.75;
    node.vy *= 0.75;
  });
}

// ─── Drawing ────────────────────────────────────────────────────────────────

function drawGraph() {
  const ctx = state.ctx;
  if (!ctx) return;

  // Clear canvas
  ctx.fillStyle = '#070b14';
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
    let strokeWidth = 1.0 + Math.min(srcNode.edgeCount || 0, tgtNode.edgeCount || 0) * 0.18;

    if (state.focusedNodeId) {
      if (edge.source === state.focusedNodeId || edge.target === state.focusedNodeId) {
        alpha = 0.65;
        strokeWidth += 1.0;
      } else {
        alpha = 0.03;
      }
    } else {
      alpha = 0.22;
    }

    ctx.save();
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = `rgba(229, 169, 59, ${alpha})`;

    if (edge.type === 'relationship') {
      ctx.strokeStyle = `rgba(244, 63, 94, ${alpha})`; // Crimson relations
    } else if (edge.type === 'canvas') {
      ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`; // Blue canvas links
    } else if (edge.type === 'pov') {
      ctx.strokeStyle = `rgba(229, 169, 59, ${alpha})`; // Gold POV links
      if (edge.label === 'Secondary POV') {
        ctx.setLineDash([4, 4]); // Dashed POV links
      }
    } else if (edge.type === 'appearance') {
      ctx.strokeStyle = `rgba(167, 139, 250, ${alpha})`; // Soft purple appearances
    } else if (edge.type === 'setup-payoff') {
      const isUnresolved = srcNode.isUnresolved || tgtNode.isUnresolved;
      if (isUnresolved) {
        ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`; // Unresolved: crimson
        ctx.setLineDash([2, 3]); // Dotted
      } else {
        ctx.strokeStyle = `rgba(16, 185, 129, ${alpha})`; // Resolved: solid emerald
      }
    } else if (edge.type === 'hierarchy') {
      ctx.strokeStyle = `rgba(100, 116, 139, ${alpha})`; // Hierarchy: subtle gray
    }

    // Bezier curve calculations
    const midX = (srcNode.x + tgtNode.x) / 2;
    const midY = (srcNode.y + tgtNode.y) / 2;
    const dx = tgtNode.x - srcNode.x;
    const dy = tgtNode.y - srcNode.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1.0;
    const px = -dy / dist;
    const py = dx / dist;
    
    // Curved path control point offset
    const curveOffset = 12;
    const cx = midX + px * curveOffset;
    const cy = midY + py * curveOffset;

    ctx.beginPath();
    ctx.moveTo(srcNode.x, srcNode.y);
    ctx.quadraticCurveTo(cx, cy, tgtNode.x, tgtNode.y);
    ctx.stroke();

    // Draw arrowhead pointing toward target along the Bezier curve tangent
    if (alpha >= 0.1) {
      const angle = Math.atan2(tgtNode.y - cy, tgtNode.x - cx);
      const arrowLen = 8;
      // Position arrowhead at edge of target node
      const ax = tgtNode.x - Math.cos(angle) * (tgtNode.radius + 2);
      const ay = tgtNode.y - Math.sin(angle) * (tgtNode.radius + 2);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(
        ax - arrowLen * Math.cos(angle - Math.PI / 7),
        ay - arrowLen * Math.sin(angle - Math.PI / 7)
      );
      ctx.lineTo(
        ax - arrowLen * Math.cos(angle + Math.PI / 7),
        ay - arrowLen * Math.sin(angle + Math.PI / 7)
      );
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();

    // Draw edge labels if hovered or focused on the source/target
    if (alpha >= 0.5 && edge.label) {
      // Find the midpoint of the Bezier curve (t=0.5)
      const bx = 0.25 * srcNode.x + 0.5 * cx + 0.25 * tgtNode.x;
      const by = 0.25 * srcNode.y + 0.5 * cy + 0.25 * tgtNode.y;
      
      ctx.save();
      ctx.fillStyle = 'rgba(10, 8, 18, 0.9)';
      ctx.font = '8px monospace';
      const textWidth = ctx.measureText(edge.label).width;
      ctx.fillRect(bx - textWidth / 2 - 3, by - 6, textWidth + 6, 11);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(edge.label, bx - textWidth / 2, by + 2);
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
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Outer aura halo (vvd-style node glow ring)
    if (alpha >= 0.1) {
      ctx.shadowBlur = 0;
      const auraGrad = ctx.createRadialGradient(
        node.x, node.y, node.radius,
        node.x, node.y, node.radius + 18
      );
      // Parse hex color to rgba
      const hexToRgb = (hex) => {
        const r = parseInt(hex.slice(1,3), 16);
        const g = parseInt(hex.slice(3,5), 16);
        const b = parseInt(hex.slice(5,7), 16);
        return `${r},${g},${b}`;
      };
      const rgb = node.color.startsWith('#') ? hexToRgb(node.color) : '255,255,255';
      auraGrad.addColorStop(0, `rgba(${rgb}, ${0.12 * alpha})`);
      auraGrad.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + 18, 0, Math.PI * 2);
      ctx.fill();
    }

    // If focused, draw ring
    if (node.id === state.focusedNodeId) {
      ctx.strokeStyle = node.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Unresolved setup node pulsing warning ring
    if (node.isUnresolved) {
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      const pulse = node.radius + 5 + Math.sin(Date.now() / 200) * 3;
      ctx.arc(node.x, node.y, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Hover glow ring
    if (node === state.hoveredNode && node.id !== state.focusedNodeId) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = node.color;
      ctx.globalAlpha = alpha * 0.45;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = alpha;
    }

    // Node text label with adaptive density based on zoom factor
    let labelAlpha = alpha;
    if (state.zoom < 0.65) {
      const isHub = node.edgeCount >= 3;
      const isFocusedOrHovered = (node.id === state.focusedNodeId || node === state.hoveredNode);
      if (!isFocusedOrHovered && !isHub) {
        labelAlpha = 0;
      } else if (!isFocusedOrHovered) {
        labelAlpha = Math.max(0, (state.zoom - 0.4) / 0.25) * alpha;
      }
    }

    if (labelAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = labelAlpha;
      ctx.shadowBlur = 0;
      ctx.font = `${node.id === state.focusedNodeId ? '600 11px' : '400 10px'} 'Space Grotesk', 'Inter', sans-serif`;
      ctx.fillStyle = node.id === state.focusedNodeId ? '#ffffff' : 'rgba(255,255,255,0.80)';
      ctx.textAlign = 'center';
      
      // Draw label below node
      ctx.fillText(node.label, node.x, node.y + node.radius + 14);
      ctx.restore();
    }

    ctx.restore();
  });

  ctx.restore();
}

function drawGridPattern(ctx) {
  // VVD-style dot grid — small dots at regular intervals
  const dotSpacing = 28;
  const dotRadius = 1;
  const extent = 2500;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';

  for (let x = -extent; x <= extent; x += dotSpacing) {
    for (let y = -extent; y <= extent; y += dotSpacing) {
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ─── Tooltip Helper Functions ───────────────────────────────────────────────

function updateTooltip(node, e) {
  const tooltip = document.getElementById('graph-tooltip');
  if (!tooltip) return;

  if (!node) {
    tooltip.style.opacity = '0';
    tooltip.style.transform = 'translate(-50%, -100%) scale(0.95)';
    return;
  }

  // Get description/excerpt
  let excerpt = '';
  if (node.page && node.page.content) {
    let rawContent = node.page.content;
    if (rawContent.startsWith('{')) {
      try {
        const delta = JSON.parse(rawContent);
        if (delta.ops) {
          excerpt = delta.ops.map(op => typeof op.insert === 'string' ? op.insert : '').join('').trim();
        }
      } catch (_) {}
    } else {
      excerpt = rawContent;
    }
  }
  if (excerpt.length > 90) {
    excerpt = excerpt.slice(0, 85) + '...';
  }

  tooltip.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
      <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${node.color}; box-shadow:0 0 6px ${node.color};"></span>
      <strong style="color:#fff; font-size:12px; font-weight:600; font-family:var(--font-heading);">${escapeHtml(node.label)}</strong>
    </div>
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:10px; color:var(--text-muted); font-family:var(--font-hud, monospace); margin-bottom:4px;">
      <span>${escapeHtml(node.schemaName)}</span>
      <span>${node.edgeCount || 0} connections</span>
    </div>
    ${excerpt ? `<div style="font-size:10px; color:var(--text-secondary); line-height:1.4; border-top:1px solid rgba(255,255,255,0.04); padding-top:4px;">${escapeHtml(excerpt)}</div>` : ''}
  `;

  tooltip.style.opacity = '1';
  tooltip.style.transform = 'translate(-50%, -115%) scale(1)';
  positionTooltip(e);
}

function positionTooltip(e) {
  const tooltip = document.getElementById('graph-tooltip');
  if (!tooltip) return;
  tooltip.style.left = `${e.clientX}px`;
  tooltip.style.top = `${e.clientY}px`;
}

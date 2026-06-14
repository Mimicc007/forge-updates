/* ============================================================
   Forge — Relationship Map
   An interactive visual canvas linking characters together.
   ============================================================ */

import {
  getAllCharacters, getCharacter, saveCharacter, getImage
} from '../db.js';
import { navigate } from '../router.js';
import { showToast, escapeHtml } from '../ui.js';

let panX = 0;
let panY = 0;
let zoom = 1.0;
let characters = [];
let portraitMap = {}; // Cache character portrait base64 data
let selectedNodeId = null;
let activeDragNodeId = null;
let isPanningState = false;
let dragStartX = 0;
let dragStartY = 0;
let panStartX = 0;
let panStartY = 0;

export async function renderRelationshipMap(container) {
  // Sync tab title
  if (window.setTabTitle) {
    window.setTabTitle('Relationship Map');
  }

  characters = await getAllCharacters();

  // Load portraits
  portraitMap = {};
  await Promise.all(
    characters
      .filter(c => c.portraitImageId)
      .map(async c => {
        const img = await getImage(c.portraitImageId);
        if (img) portraitMap[c.id] = img.data;
      })
  );

  // Load coordinates from localStorage
  let savedCoords = {};
  try {
    const saved = localStorage.getItem('forge-relationship-coords');
    if (saved) savedCoords = JSON.parse(saved);
  } catch (e) {
    console.error('Failed to load character coordinates', e);
  }

  // Initialize coordinates if they don't exist
  const width = 2500;
  const height = 2500;
  const cx = width / 2;
  const cy = height / 2;

  characters.forEach((char, idx) => {
    if (savedCoords[char.id]) {
      char.x = savedCoords[char.id].x;
      char.y = savedCoords[char.id].y;
    } else {
      // Circular layout default
      const radius = 280 + Math.min(characters.length * 15, 400);
      const angle = (idx / characters.length) * 2 * Math.PI;
      char.x = cx + radius * Math.cos(angle);
      char.y = cy + radius * Math.sin(angle);
      savedCoords[char.id] = { x: char.x, y: char.y };
    }
  });

  // Render Page Skeleton
  container.innerHTML = `
    <div class="relationship-map-page">
      <div class="page-header" style="padding-bottom:var(--sp-4);">
        <h1 class="page-title">Relationship Map</h1>
        <p class="page-subtitle">Visual character connection network</p>
      </div>

      <div class="canvas-viewport" id="map-viewport">
        <!-- Digital Grid Background inside canvas -->
        <div class="canvas-board" id="map-board" style="width: ${width}px; height: ${height}px; transform: translate(${panX}px, ${panY}px) scale(${zoom});">
          <svg class="canvas-svg" id="map-svg" width="${width}" height="${height}"></svg>
          <div class="canvas-nodes" id="map-nodes"></div>
        </div>

        <!-- Canvas Controls -->
        <div class="canvas-controls">
          <button class="control-btn" id="zoom-in-btn" title="Zoom In">+</button>
          <button class="control-btn" id="zoom-out-btn" title="Zoom Out">−</button>
          <button class="control-btn" id="zoom-reset-btn" title="Recenter Map">⌖</button>
        </div>
      </div>

      <!-- Detail Sidebar Drawer -->
      <div class="map-sidebar-drawer" id="map-sidebar">
        <button class="sidebar-close-btn" id="close-sidebar-btn">✕</button>
        <div class="sidebar-scroll-content" id="sidebar-content">
          <div class="sidebar-empty">
            <span class="placeholder-icon">🔗</span>
            <p>Select a character node to view details & link relationships.</p>
          </div>
        </div>
      </div>
    </div>
  `;

  const viewport = container.querySelector('#map-viewport');
  const board = container.querySelector('#map-board');
  const svg = container.querySelector('#map-svg');
  const nodesContainer = container.querySelector('#map-nodes');

  // Center pan initially
  recenterPan();

  // Render everything
  updateCanvas();

  // --- Handlers for Panning & Zooming ---

  viewport.addEventListener('mousedown', (e) => {
    // Check if we clicked on viewport background (not a node/button)
    const isBackground = e.target === viewport || e.target === board || e.target === svg;
    if (isBackground && e.button === 0) {
      isPanningState = true;
      viewport.style.cursor = 'grabbing';
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      panStartX = panX;
      panStartY = panY;
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (isPanningState) {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      panX = panStartX + dx;
      panY = panStartY + dy;
      updateBoardTransform();
    } else if (activeDragNodeId) {
      // Handle node dragging
      const nodeRect = viewport.getBoundingClientRect();
      // Calculate coordinates relative to canvas taking zoom/pan into account
      const mouseXInCanvas = (e.clientX - nodeRect.left - panX) / zoom;
      const mouseYInCanvas = (e.clientY - nodeRect.top - panY) / zoom;

      const char = characters.find(c => c.id === activeDragNodeId);
      if (char) {
        char.x = Math.max(50, Math.min(width - 50, mouseXInCanvas));
        char.y = Math.max(50, Math.min(height - 50, mouseYInCanvas));
        
        // Update DOM node position directly for smooth rendering
        const el = nodesContainer.querySelector(`[data-id="${char.id}"]`);
        if (el) {
          el.style.left = `${char.x}px`;
          el.style.top = `${char.y}px`;
        }

        // Save position
        savedCoords[char.id] = { x: char.x, y: char.y };
        localStorage.setItem('forge-relationship-coords', JSON.stringify(savedCoords));

        // Redraw SVG edges in real time
        drawEdges();
      }
    }
  });

  window.addEventListener('mouseup', () => {
    if (isPanningState) {
      isPanningState = false;
      viewport.style.cursor = 'grab';
    }
    activeDragNodeId = null;
  });

  // Trackpad / Scroll Wheel Zooming
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.08;
    const rect = viewport.getBoundingClientRect();
    
    // Mouse coords relative to viewport
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Mouse coords on canvas before zoom
    const canvasX = (mouseX - panX) / zoom;
    const canvasY = (mouseY - panY) / zoom;

    if (e.deltaY < 0) {
      zoom = Math.min(2.0, zoom * zoomFactor);
    } else {
      zoom = Math.max(0.3, zoom / zoomFactor);
    }

    // Adjust pan to zoom on mouse point
    panX = mouseX - canvasX * zoom;
    panY = mouseY - canvasY * zoom;

    updateBoardTransform();
  }, { passive: false });

  // Buttons Controls
  container.querySelector('#zoom-in-btn').addEventListener('click', () => {
    zoom = Math.min(2.0, zoom * 1.25);
    updateBoardTransform();
  });

  container.querySelector('#zoom-out-btn').addEventListener('click', () => {
    zoom = Math.max(0.3, zoom / 1.25);
    updateBoardTransform();
  });

  container.querySelector('#zoom-reset-btn').addEventListener('click', () => {
    recenterPan();
  });

  container.querySelector('#close-sidebar-btn').addEventListener('click', () => {
    container.querySelector('#map-sidebar').classList.remove('open');
    selectedNodeId = null;
    updateNodeActiveStates();
  });

  // --- Canvas Rendering Functions ---

  function recenterPan() {
    zoom = 0.8;
    const rect = viewport.getBoundingClientRect();
    panX = (rect.width - width * zoom) / 2;
    panY = (rect.height - height * zoom) / 2;
    updateBoardTransform();
  }

  function updateBoardTransform() {
    board.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }

  function updateCanvas() {
    renderNodes();
    drawEdges();
  }

  function renderNodes() {
    nodesContainer.innerHTML = '';
    
    if (characters.length === 0) {
      nodesContainer.innerHTML = `
        <div style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); text-align: center; color: var(--text-muted);">
          <h3>No Characters Found</h3>
          <p class="mt-2">Go to the Characters page to create characters first.</p>
        </div>
      `;
      return;
    }

    characters.forEach(char => {
      const node = document.createElement('div');
      node.className = 'map-node';
      if (char.id === selectedNodeId) node.classList.add('selected');
      node.dataset.id = char.id;
      node.style.left = `${char.x}px`;
      node.style.top = `${char.y}px`;

      const portrait = portraitMap[char.id]
        ? `<img class="map-node-img" src="${portraitMap[char.id]}" alt="${escapeHtml(char.name)}" />`
        : `<div class="map-node-placeholder">👤</div>`;

      node.innerHTML = `
        <div class="map-node-avatar-ring ${char.role || 'supporting'}">${portrait}</div>
        <div class="map-node-label">
          <div class="map-node-name">${escapeHtml(char.name || 'Unnamed')}</div>
          <div class="map-node-role">${escapeHtml(char.role || 'supporting')}</div>
        </div>
      `;

      // Drag listener
      node.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
          e.stopPropagation();
          activeDragNodeId = char.id;
          selectedNodeId = char.id;
          updateNodeActiveStates();
          renderSidebar(char.id);
        }
      });

      // Double click to open full profile
      node.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        navigate(`characters/${char.id}`);
      });

      nodesContainer.appendChild(node);
    });
  }

  function updateNodeActiveStates() {
    nodesContainer.querySelectorAll('.map-node').forEach(el => {
      if (el.dataset.id === selectedNodeId) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
  }

  function drawEdges() {
    svg.innerHTML = '';
    
    // Use an index/map to avoid duplicate drawing of double-sided links
    const drawn = new Set();

    characters.forEach(char => {
      const links = char.relationships || [];
      links.forEach(link => {
        const target = characters.find(c => c.id === link.characterId);
        if (!target) return;

        // Unique pair key
        const key = [char.id, target.id].sort().join('-');
        
        // Calculate mid points
        const x1 = char.x;
        const y1 = char.y;
        const x2 = target.x;
        const y2 = target.y;

        // Draw line
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        
        // Custom neon styling depending on relationship status
        const isRival = link.type.toLowerCase().includes('rival') || link.type.toLowerCase().includes('nemesis');
        const isLove = link.type.toLowerCase().includes('love') || link.type.toLowerCase().includes('ally') || link.type.toLowerCase().includes('friend');
        
        let strokeColor = 'rgba(229, 169, 59, 0.25)'; // Gold glow
        if (isRival) strokeColor = 'rgba(244, 63, 94, 0.4)';  // Neon crimson
        if (isLove) strokeColor = 'rgba(52, 211, 153, 0.4)';   // Neon emerald

        line.setAttribute('stroke', strokeColor);
        line.setAttribute('stroke-width', '2');
        line.setAttribute('class', 'map-edge-line');
        svg.appendChild(line);

        // Render relationship label if not drawn yet for this pair
        if (!drawn.has(key)) {
          drawn.add(key);

          // Find mid point for text positioning
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          // Draw a small HTML label or SVG text
          // Using SVG text with nice background grouping
          const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          
          text.textContent = link.type || 'Related';
          text.setAttribute('x', midX);
          text.setAttribute('y', midY + 3);
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('class', 'map-edge-text');
          
          svg.appendChild(text);
          
          // Size box around text
          setTimeout(() => {
            try {
              const bbox = text.getBBox();
              rect.setAttribute('x', bbox.x - 6);
              rect.setAttribute('y', bbox.y - 2);
              rect.setAttribute('width', bbox.width + 12);
              rect.setAttribute('height', bbox.height + 4);
              rect.setAttribute('rx', '4');
              rect.setAttribute('class', 'map-edge-rect');
              group.appendChild(rect);
              group.appendChild(text);
              svg.appendChild(group);
            } catch (err) {
              // BBox might fail on hidden nodes/tabs
            }
          }, 0);
        }
      });
    });
  }

  // --- Sidebar Panel Content Manager ---

  async function renderSidebar(charId) {
    const sidebar = container.querySelector('#map-sidebar');
    const content = container.querySelector('#sidebar-content');
    sidebar.classList.add('open');

    const char = await getCharacter(charId);
    if (!char) return;

    const portrait = portraitMap[char.id]
      ? `<img class="sidebar-avatar-img" src="${portraitMap[char.id]}" alt="" />`
      : `<div class="sidebar-avatar-placeholder">👤</div>`;

    content.innerHTML = `
      <div class="sidebar-profile">
        <div class="sidebar-avatar">${portrait}</div>
        <h3 class="sidebar-name">${escapeHtml(char.name)}</h3>
        <p class="sidebar-epithet">${escapeHtml(char.title || 'No Title')}</p>
        <span class="role-badge ${char.role}">${escapeHtml(char.role)}</span>
        
        <button class="btn btn-secondary btn-sm mt-4 w-full" id="navigate-profile-btn">
          Open Full Editor ↗
        </button>
      </div>

      <div class="sidebar-section mt-6">
        <h4 class="section-title">Relationships</h4>
        <div class="relationships-list" id="sidebar-rel-list"></div>
      </div>

      <div class="sidebar-section mt-6">
        <h4 class="section-title">Link New Connection</h4>
        <div class="flex flex-col gap-3 mt-2">
          <div class="form-group">
            <label class="form-label" style="font-size:var(--fs-xs);">Character</label>
            <select class="form-select" id="new-rel-char-select">
              <option value="">Select target...</option>
              ${characters
                .filter(c => c.id !== char.id)
                .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
                .join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" style="font-size:var(--fs-xs);">Bond Type</label>
            <input class="form-input" id="new-rel-type-input" placeholder="e.g. Rival, Mentor, Clone..." />
          </div>
          <button class="btn btn-primary btn-sm w-full mt-2" id="create-rel-btn">
            + Create Relationship
          </button>
        </div>
      </div>
    `;

    // Add Profile button listener
    content.querySelector('#navigate-profile-btn').addEventListener('click', () => {
      navigate(`characters/${char.id}`);
    });

    const relListEl = content.querySelector('#sidebar-rel-list');
    
    // Draw current list of relationships
    function drawSidebarRels() {
      const rels = char.relationships || [];
      if (rels.length === 0) {
        relListEl.innerHTML = `<p class="text-muted" style="font-size:var(--fs-xs); font-style:italic;">No relationships defined.</p>`;
        return;
      }

      relListEl.innerHTML = rels.map((rel, idx) => {
        const targetChar = characters.find(c => c.id === rel.characterId);
        if (!targetChar) return '';
        return `
          <div class="rel-row" style="display:flex; align-items:center; justify-content:between; padding:var(--sp-2) 0; border-bottom:1px solid var(--border-subtle);">
            <div>
              <strong style="color:var(--accent-primary); font-size:var(--fs-sm);">${escapeHtml(targetChar.name)}</strong>
              <div style="font-size:var(--fs-xs); color:var(--text-secondary);">${escapeHtml(rel.type)}</div>
            </div>
            <button class="btn btn-ghost btn-icon btn-sm text-danger delete-rel-row-btn" data-idx="${idx}" title="Delete" style="margin-left:auto;">✕</button>
          </div>
        `;
      }).join('');

      relListEl.querySelectorAll('.delete-rel-row-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = parseInt(btn.dataset.idx);
          const targetRel = char.relationships[idx];
          
          // Delete relationship locally on both sides or just one?
          // To keep it simple, we delete this direction
          char.relationships.splice(idx, 1);
          await saveCharacter(char);
          
          // Recast character details locally
          const targetChar = characters.find(c => c.id === targetRel.characterId);
          if (targetChar && targetChar.relationships) {
            // Check if reverse relationship also exists and delete it
            targetChar.relationships = targetChar.relationships.filter(r => r.characterId !== char.id);
            await saveCharacter(targetChar);
          }

          // Reload state
          showToast('Relationship deleted', 'info');
          
          // Update global state character info
          characters = await getAllCharacters();
          
          // Re-render
          updateCanvas();
          drawSidebarRels();
        });
      });
    }

    drawSidebarRels();

    // Create New Relationship Listener
    content.querySelector('#create-rel-btn').addEventListener('click', async () => {
      const targetId = content.querySelector('#new-rel-char-select').value;
      const bondType = content.querySelector('#new-rel-type-input').value.trim() || 'Related';

      if (!targetId) {
        showToast('Please select a target character', 'error');
        return;
      }

      // Check if duplicate
      if (char.relationships && char.relationships.some(r => r.characterId === targetId)) {
        showToast('Relationship already exists!', 'error');
        return;
      }

      // Add to current character
      if (!char.relationships) char.relationships = [];
      char.relationships.push({ characterId: targetId, type: bondType });
      await saveCharacter(char);

      // Add reverse relationship to make it double-sided
      const targetChar = await getCharacter(targetId);
      if (targetChar) {
        if (!targetChar.relationships) targetChar.relationships = [];
        // Only if reverse doesn't already exist
        if (!targetChar.relationships.some(r => r.characterId === char.id)) {
          targetChar.relationships.push({ characterId: char.id, type: bondType });
          await saveCharacter(targetChar);
        }
      }

      showToast('Relationship created!', 'success');
      
      // Update local state
      characters = await getAllCharacters();
      
      // Refresh portraits map in case
      // Render
      updateCanvas();
      
      // Reload sidebar
      renderSidebar(char.id);
    });
  }
}

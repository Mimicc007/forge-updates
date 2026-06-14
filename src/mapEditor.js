/* ============================================================
   Forge — Interactive Map Editor Component
   Provides paint drawing, cropping, scaling, grid overlays,
   and double-click wiki-linked text labels.
   ============================================================ */

import { savePage, getPages } from './db.js';
import { navigate } from './router.js';
import { showToast } from './ui.js';

export async function initMapEditor(container, page, options = {}) {
  const isCanvasNode = options.isCanvasNode || false;
  if (!page.properties) page.properties = {};
  if (!page.properties.mapData) {
    page.properties.mapData = {
      gridType: 'none',
      gridSize: 40,
      gridOpacity: 0.3,
      labels: [],
      drawings: [] // for backward compatibility or extra metadata
    };
  }
  const mapData = page.properties.mapData;
  if (!mapData.labels) mapData.labels = [];

  let currentTool = 'navigate'; // 'navigate', 'draw', 'crop', 'resize', 'grid'
  let brushColor = '#f43f5e';
  let brushSize = 5;
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;

  // Render initial frame
  container.innerHTML = '';
  
  const editorWrap = document.createElement('div');
  editorWrap.className = 'map-editor-wrap';
  editorWrap.style.cssText = 'position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden; font-family: var(--font-hud, monospace);';

  // ── UPLOADER OR ACTIVE EDITOR ──
  if (!page.coverImage) {
    renderUploader(editorWrap);
  } else {
    renderActiveEditor(editorWrap);
  }

  container.appendChild(editorWrap);

  // ── 1. UPLOADER STATE ──
  function renderUploader(parent) {
    parent.innerHTML = '';
    const uploader = document.createElement('div');
    uploader.className = 'canvas-map-upload-area';
    uploader.style.cssText = 'flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; border: 2px dashed rgba(255,255,255,0.08); border-radius: var(--radius-xl); cursor: pointer; color: var(--text-muted); font-size: var(--fs-sm); background: rgba(255,255,255,0.01); transition: all 0.2s;';
    uploader.innerHTML = `
      <span style="font-size: 2.2rem;">🗺️</span>
      <span style="font-weight: 500; color: #fff;">Upload Tactical Map Image</span>
      <span style="font-size: var(--fs-xs); opacity: 0.6;">Supports PNG, JPG, WebP (Click or Drag-and-Drop)</span>
    `;

    uploader.addEventListener('click', () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
          page.coverImage = ev.target.result;
          await savePage(page);
          initMapEditor(container, page, options);
          showToast('Map image uploaded!', 'success');
        };
        reader.readAsDataURL(file);
      };
      fileInput.click();
    });

    uploader.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploader.style.borderColor = 'var(--accent-primary)';
      uploader.style.background = 'rgba(255,255,255,0.03)';
    });

    uploader.addEventListener('dragleave', () => {
      uploader.style.borderColor = 'rgba(255,255,255,0.08)';
      uploader.style.background = 'rgba(255,255,255,0.01)';
    });

    uploader.addEventListener('drop', (e) => {
      e.preventDefault();
      uploader.style.borderColor = 'rgba(255,255,255,0.08)';
      uploader.style.background = 'rgba(255,255,255,0.01)';

      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith('image/')) return;

      const reader = new FileReader();
      reader.onload = async (ev) => {
        page.coverImage = ev.target.result;
        await savePage(page);
        initMapEditor(container, page, options);
        showToast('Map image uploaded!', 'success');
      };
      reader.readAsDataURL(file);
    });

    parent.appendChild(uploader);
  }

  // ── 2. ACTIVE EDITOR STATE ──
  function renderActiveEditor(parent) {
    parent.innerHTML = '';

    // ── Toolbar ──
    const toolbar = document.createElement('div');
    toolbar.className = 'map-toolbar';
    toolbar.style.cssText = 'height: 40px; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; background: rgba(13,10,20,0.85); border-bottom: 1px solid rgba(255,255,255,0.08); z-index: 20; backdrop-filter: blur(8px); flex-shrink: 0;';
    
    // Left tools
    const toolsLeft = document.createElement('div');
    toolsLeft.style.cssText = 'display: flex; gap: 6px;';
    
    const toolButtons = [
      { id: 'navigate', label: '🖐️ Navigate', title: 'Move labels / double-click to place wiki-links' },
      { id: 'draw', label: '🎨 Draw', title: 'Freehand draw on the map' },
      { id: 'crop', label: '✂️ Crop', title: 'Crop the map layout' },
      { id: 'resize', label: '📏 Scale', title: 'Resize base image resolution' },
      { id: 'grid', label: '🏁 Grid', title: 'Toggle grid overlay' }
    ];

    const btnMap = {};
    toolButtons.forEach(tool => {
      const btn = document.createElement('button');
      btn.className = `btn btn-xs ${currentTool === tool.id ? 'btn-primary' : 'btn-secondary'}`;
      btn.style.cssText = 'padding: 2px 6px; font-size: 0.72rem;';
      btn.textContent = tool.label;
      btn.title = tool.title;
      btn.addEventListener('click', () => selectTool(tool.id));
      toolsLeft.appendChild(btn);
      btnMap[tool.id] = btn;
    });

    // Right actions
    const toolsRight = document.createElement('div');
    toolsRight.style.cssText = 'display: flex; gap: 6px;';

    const saveImgBtn = document.createElement('button');
    saveImgBtn.className = 'btn btn-xs btn-primary';
    saveImgBtn.style.cssText = 'display: none; padding: 2px 6px; font-size: 0.72rem; background: var(--color-success, #10b981); border-color: var(--color-success, #10b981);';
    saveImgBtn.textContent = '💾 Save Canvas Edits';

    const deleteMapBtn = document.createElement('button');
    deleteMapBtn.className = 'btn btn-xs';
    deleteMapBtn.style.cssText = 'padding: 2px 6px; font-size: 0.72rem; color: var(--color-danger, #f43f5e); border-color: rgba(244,63,94,0.2); background: transparent;';
    deleteMapBtn.textContent = '🗑️ Delete Image';

    toolsRight.appendChild(saveImgBtn);
    toolsRight.appendChild(deleteMapBtn);

    if (isCanvasNode) {
      const openPageBtn = document.createElement('button');
      openPageBtn.className = 'btn btn-xs btn-secondary';
      openPageBtn.style.cssText = 'padding: 2px 6px; font-size: 0.72rem; border-color: var(--accent-primary-glow, rgba(139, 92, 246, 0.2)); color: var(--accent-primary, #8b5cf6); background: var(--accent-primary-dim, rgba(139, 92, 246, 0.1));';
      openPageBtn.textContent = 'Open Entry ↗';
      openPageBtn.title = 'Open full page view for this map';
      openPageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigate(`page/${page.id}`);
      });
      toolsRight.appendChild(openPageBtn);
    }

    toolbar.appendChild(toolsLeft);
    toolbar.appendChild(toolsRight);
    parent.appendChild(toolbar);

    // ── Brush Settings Bar ──
    const brushBar = document.createElement('div');
    brushBar.style.cssText = 'height: 34px; display: none; align-items: center; gap: 12px; padding: 0 12px; background: rgba(0,0,0,0.5); border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.7rem; z-index: 15; flex-shrink: 0;';
    brushBar.innerHTML = `
      <div style="display:flex;gap:4px;align-items:center;">
        <span style="color:var(--text-muted);">Color:</span>
        <div class="brush-colors" style="display:flex;gap:4px;">
          ${['#f43f5e', '#3b82f6', '#10b981', '#eab308', '#ffffff', '#000000'].map(c => `
            <div class="brush-color-dot" data-color="${c}" style="width:14px;height:14px;border-radius:50%;cursor:pointer;background:${c};border:1px solid ${c === brushColor ? '#fff' : 'rgba(255,255,255,0.2)'};"></div>
          `).join('')}
        </div>
      </div>
      <div style="display:flex;gap:4px;align-items:center;flex:1;">
        <span style="color:var(--text-muted);white-space:nowrap;">Size (${brushSize}px):</span>
        <input type="range" class="brush-size-slider" min="1" max="25" value="${brushSize}" style="width:100px;cursor:pointer;accent-color:var(--accent-primary);" />
      </div>
    `;

    // Hook brush dot selection
    brushBar.querySelectorAll('.brush-color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        brushColor = dot.dataset.color;
        brushBar.querySelectorAll('.brush-color-dot').forEach(d => d.style.border = `1px solid ${d.dataset.color === brushColor ? '#fff' : 'rgba(255,255,255,0.2)'}`);
      });
    });

    brushBar.querySelector('.brush-size-slider').addEventListener('input', (e) => {
      brushSize = parseInt(e.target.value);
      brushBar.querySelector('span:nth-of-type(2)').textContent = `Size (${brushSize}px):`;
    });

    parent.appendChild(brushBar);

    // ── Scale Settings Bar ──
    const scaleBar = document.createElement('div');
    scaleBar.style.cssText = 'height: 34px; display: none; align-items: center; gap: 12px; padding: 0 12px; background: rgba(0,0,0,0.5); border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.7rem; z-index: 15; flex-shrink: 0;';
    scaleBar.innerHTML = `
      <span style="color:var(--text-muted);">Scaling Factor:</span>
      <select class="scale-factor-select" style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:4px; padding:2px 4px; font-size:0.7rem; color:#fff;">
        <option value="0.5">50% (Optimize speed)</option>
        <option value="0.75" selected>75%</option>
        <option value="0.9">90%</option>
        <option value="1.1">110%</option>
        <option value="1.5">150% (Increase Detail)</option>
      </select>
      <button class="btn btn-xs btn-primary apply-scale-btn" style="padding:1px 6px;">Scale & Apply</button>
    `;
    parent.appendChild(scaleBar);

    // ── Grid Overlay Config Bar ──
    const gridBar = document.createElement('div');
    gridBar.style.cssText = 'height: 34px; display: none; align-items: center; gap: 16px; padding: 0 12px; background: rgba(0,0,0,0.5); border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.7rem; z-index: 15; flex-shrink: 0;';
    gridBar.innerHTML = `
      <div style="display:flex;gap:4px;align-items:center;">
        <span style="color:var(--text-muted);white-space:nowrap;">Grid Type:</span>
        <select class="grid-type-select" style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:4px; padding:2px; font-size:0.7rem; color:#fff; cursor:pointer;">
          <option value="none" ${mapData.gridType === 'none' ? 'selected' : ''}>None</option>
          <option value="square" ${mapData.gridType === 'square' ? 'selected' : ''}>Square Grid</option>
          <option value="hex" ${mapData.gridType === 'hex' ? 'selected' : ''}>Hex Grid</option>
          <option value="isometric" ${mapData.gridType === 'isometric' ? 'selected' : ''}>Isometric Grid</option>
        </select>
      </div>
      <div style="display:flex;gap:4px;align-items:center;flex:1;">
        <span style="color:var(--text-muted);white-space:nowrap;">Opacity (${Math.round(mapData.gridOpacity * 100)}%):</span>
        <input type="range" class="grid-opacity-slider" min="0" max="1" step="0.05" value="${mapData.gridOpacity}" style="width:70px;cursor:pointer;accent-color:var(--accent-primary);" />
      </div>
      <div style="display:flex;gap:4px;align-items:center;flex:1;">
        <span style="color:var(--text-muted);white-space:nowrap;">Size (${mapData.gridSize}px):</span>
        <input type="range" class="grid-size-slider" min="20" max="120" step="2" value="${mapData.gridSize}" style="width:70px;cursor:pointer;accent-color:var(--accent-primary);" />
      </div>
    `;

    // Hook grid controls
    gridBar.querySelector('.grid-type-select').addEventListener('change', async (e) => {
      mapData.gridType = e.target.value;
      updateGridDisplay();
      await savePage(page);
    });

    gridBar.querySelector('.grid-opacity-slider').addEventListener('input', async (e) => {
      mapData.gridOpacity = parseFloat(e.target.value);
      gridBar.querySelector('span:nth-of-type(2)').textContent = `Opacity (${Math.round(mapData.gridOpacity * 100)}%):`;
      updateGridDisplay();
      await savePage(page);
    });

    gridBar.querySelector('.grid-size-slider').addEventListener('input', async (e) => {
      mapData.gridSize = parseInt(e.target.value);
      gridBar.querySelector('span:nth-of-type(3)').textContent = `Size (${mapData.gridSize}px):`;
      updateGridDisplay();
      await savePage(page);
    });

    parent.appendChild(gridBar);

    // ── 3. MAP CANVAS RENDER VIEWPORT ──
    const viewport = document.createElement('div');
    viewport.className = 'map-viewport';
    viewport.style.cssText = 'flex: 1; position: relative; overflow: auto; background: #08070d; display: flex; align-items: flex-start; justify-content: flex-start; user-select: none;';
    
    const mapWrapper = document.createElement('div');
    mapWrapper.className = 'map-wrapper';
    mapWrapper.style.cssText = 'position: relative; display: inline-block; margin: auto; box-shadow: 0 10px 40px rgba(0,0,0,0.8);';

    const mapImg = document.createElement('img');
    mapImg.src = page.coverImage;
    mapImg.style.cssText = 'display: block; max-width: 100%; height: auto; pointer-events: none;';
    mapWrapper.appendChild(mapImg);

    // Drawing Canvas (Overlaid perfectly)
    const drawCanvas = document.createElement('canvas');
    drawCanvas.className = 'map-draw-canvas';
    drawCanvas.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2;';
    mapWrapper.appendChild(drawCanvas);

    // Grid Overlay Layer
    const gridOverlay = document.createElement('div');
    gridOverlay.className = 'map-grid-overlay';
    gridOverlay.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 3;';
    mapWrapper.appendChild(gridOverlay);

    // Labels Container
    const labelsContainer = document.createElement('div');
    labelsContainer.className = 'map-labels-container';
    labelsContainer.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: auto; z-index: 4;';
    mapWrapper.appendChild(labelsContainer);

    viewport.appendChild(mapWrapper);
    parent.appendChild(viewport);

    // ── Crop Selector Box Overlay ──
    const cropBox = document.createElement('div');
    cropBox.className = 'map-crop-box';
    cropBox.style.cssText = 'position: absolute; border: 2px dashed var(--accent-primary); background: rgba(167,139,250,0.15); display: none; z-index: 5; pointer-events: none; box-shadow: 0 0 0 9999px rgba(0,0,0,0.6);';
    mapWrapper.appendChild(cropBox);

    // Initialize display state
    let isEditingDrawing = false;
    let originalImageWidth = 0;
    let originalImageHeight = 0;

    mapImg.onload = () => {
      originalImageWidth = mapImg.naturalWidth;
      originalImageHeight = mapImg.naturalHeight;
      drawCanvas.width = originalImageWidth;
      drawCanvas.height = originalImageHeight;
      updateGridDisplay();
      renderLabels();
    };

    // ── Tool Selection Logic ──
    function selectTool(toolId) {
      currentTool = toolId;
      toolButtons.forEach(tb => {
        btnMap[tb.id].className = `btn btn-xs ${currentTool === tb.id ? 'btn-primary' : 'btn-secondary'}`;
      });

      // Clear or toggle extra setting bars
      brushBar.style.display = currentTool === 'draw' ? 'flex' : 'none';
      scaleBar.style.display = currentTool === 'resize' ? 'flex' : 'none';
      gridBar.style.display = currentTool === 'grid' ? 'flex' : 'none';

      // Pointer event control
      if (currentTool === 'draw') {
        drawCanvas.style.pointerEvents = 'auto';
        labelsContainer.style.pointerEvents = 'none';
      } else {
        drawCanvas.style.pointerEvents = 'none';
        labelsContainer.style.pointerEvents = 'auto';
      }

      // Deactivate cropping box
      if (currentTool !== 'crop') {
        cropBox.style.display = 'none';
      }
    }

    // ── Grid Overlay renderer ──
    function updateGridDisplay() {
      const type = mapData.gridType;
      const opacity = mapData.gridOpacity;
      const size = mapData.gridSize;

      if (type === 'none' || opacity <= 0) {
        gridOverlay.style.backgroundImage = 'none';
        return;
      }

      if (type === 'square') {
        gridOverlay.style.backgroundImage = `linear-gradient(to right, rgba(255, 255, 255, ${opacity}) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, ${opacity}) 1px, transparent 1px)`;
        gridOverlay.style.backgroundSize = `${size}px ${size}px`;
      } else if (type === 'hex') {
        const hexH = Math.round(size * 1.732);
        const halfW = Math.round(size / 2);
        const hexPath1 = `M${halfW} 0 L${size} ${Math.round(size * 0.288)} L${size} ${Math.round(size * 0.866)} L${halfW} ${Math.round(size * 1.154)} L0 ${Math.round(size * 0.866)} L0 ${Math.round(size * 0.288)} Z`;
        const hexPath2 = `M${halfW} ${hexH} L${size} ${Math.round(hexH - size * 0.288)} L${size} ${Math.round(hexH - size * 0.866)} L${halfW} ${Math.round(hexH - size * 1.154)} L0 ${Math.round(hexH - size * 0.866)} L0 ${Math.round(hexH - size * 0.288)} Z`;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${hexH}" viewBox="0 0 ${size} ${hexH}">
          <path d="${hexPath1} ${hexPath2}" fill="none" stroke="rgba(255,255,255,${opacity})" stroke-width="1"/>
        </svg>`;
        gridOverlay.style.backgroundImage = `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}')`;
        gridOverlay.style.backgroundSize = `${size}px ${hexH}px`;
      } else if (type === 'isometric') {
        const isoH = Math.round(size * 1.732);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${isoH}" viewBox="0 0 ${size} ${isoH}">
          <path d="M0 0 L${size} ${Math.round(isoH/2)} L0 ${isoH} M${size} 0 L0 ${Math.round(isoH/2)} L${size} ${isoH}" fill="none" stroke="rgba(255,255,255,${opacity})" stroke-width="1"/>
        </svg>`;
        gridOverlay.style.backgroundImage = `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}')`;
        gridOverlay.style.backgroundSize = `${size}px ${isoH}px`;
      }
    }

    // ── Drawing Logic ──
    const ctx = drawCanvas.getContext('2d');
    
    drawCanvas.addEventListener('mousedown', (e) => {
      if (currentTool !== 'draw') return;
      isDrawing = true;
      isEditingDrawing = true;
      saveImgBtn.style.display = 'block';

      const rect = drawCanvas.getBoundingClientRect();
      lastX = (e.clientX - rect.left) * (drawCanvas.width / rect.width);
      lastY = (e.clientY - rect.top) * (drawCanvas.height / rect.height);
    });

    drawCanvas.addEventListener('mousemove', (e) => {
      if (!isDrawing || currentTool !== 'draw') return;
      const rect = drawCanvas.getBoundingClientRect();
      const currentX = (e.clientX - rect.left) * (drawCanvas.width / rect.width);
      const currentY = (e.clientY - rect.top) * (drawCanvas.height / rect.height);

      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(currentX, currentY);
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize * (drawCanvas.width / rect.width); // scale brush with viewport scaling
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      lastX = currentX;
      lastY = currentY;
    });

    drawCanvas.addEventListener('mouseup', () => { isDrawing = false; });
    drawCanvas.addEventListener('mouseleave', () => { isDrawing = false; });

    // 💾 Bake & Save Drawings to Base64
    saveImgBtn.addEventListener('click', () => {
      if (!isEditingDrawing) return;

      const bakeCanvas = document.createElement('canvas');
      bakeCanvas.width = originalImageWidth;
      bakeCanvas.height = originalImageHeight;
      const bCtx = bakeCanvas.getContext('2d');

      // Draw original map image
      const tempImg = new Image();
      tempImg.onload = async () => {
        bCtx.drawImage(tempImg, 0, 0);
        // Overlay drawing canvas
        bCtx.drawImage(drawCanvas, 0, 0);

        page.coverImage = bakeCanvas.toDataURL('image/jpeg', 0.92);
        await savePage(page);
        isEditingDrawing = false;
        saveImgBtn.style.display = 'none';
        initMapEditor(container, page, options);
        showToast('Drawing canvas saved and baked!', 'success');
      };
      tempImg.src = page.coverImage;
    });

    // ── Cropping Logic ──
    let cropStartX = 0;
    let cropStartY = 0;
    let isCroppingSelect = false;

    labelsContainer.addEventListener('mousedown', (e) => {
      if (currentTool !== 'crop') return;
      isCroppingSelect = true;

      const rect = mapWrapper.getBoundingClientRect();
      cropStartX = e.clientX - rect.left;
      cropStartY = e.clientY - rect.top;

      cropBox.style.left = `${cropStartX}px`;
      cropBox.style.top = `${cropStartY}px`;
      cropBox.style.width = '0px';
      cropBox.style.height = '0px';
      cropBox.style.display = 'block';
    });

    labelsContainer.addEventListener('mousemove', (e) => {
      if (!isCroppingSelect || currentTool !== 'crop') return;
      const rect = mapWrapper.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;

      const x = Math.min(cropStartX, curX);
      const y = Math.min(cropStartY, curY);
      const w = Math.abs(cropStartX - curX);
      const h = Math.abs(cropStartY - curY);

      cropBox.style.left = `${x}px`;
      cropBox.style.top = `${y}px`;
      cropBox.style.width = `${w}px`;
      cropBox.style.height = `${h}px`;
    });

    labelsContainer.addEventListener('mouseup', () => {
      if (!isCroppingSelect || currentTool !== 'crop') return;
      isCroppingSelect = false;

      // Confirm Crop Dialog
      if (confirm('Crop image to this selected area?')) {
        const wrapRect = mapWrapper.getBoundingClientRect();
        const boxLeft = parseFloat(cropBox.style.left);
        const boxTop = parseFloat(cropBox.style.top);
        const boxWidth = parseFloat(cropBox.style.width);
        const boxHeight = parseFloat(cropBox.style.height);

        if (boxWidth < 10 || boxHeight < 10) {
          showToast('Selection box too small to crop.', 'error');
          cropBox.style.display = 'none';
          return;
        }

        // Map wrapper relative dimensions to pixel dimensions
        const scaleX = originalImageWidth / wrapRect.width;
        const scaleY = originalImageHeight / wrapRect.height;

        const cropX = Math.round(boxLeft * scaleX);
        const cropY = Math.round(boxTop * scaleY);
        const cropW = Math.round(boxWidth * scaleX);
        const cropH = Math.round(boxHeight * scaleY);

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cCtx = cropCanvas.getContext('2d');

        const tempImg = new Image();
        tempImg.onload = async () => {
          cCtx.drawImage(tempImg, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
          page.coverImage = cropCanvas.toDataURL('image/jpeg', 0.92);

          // Shift coordinates of existing text labels relatively
          const shiftLabels = mapData.labels.map(lbl => {
            // Percentages mapped back to absolute coordinates
            const absoluteX = (lbl.x / 100) * originalImageWidth;
            const absoluteY = (lbl.y / 100) * originalImageHeight;
            // Shift coordinates by cropped margins
            const newAbsoluteX = absoluteX - cropX;
            const newAbsoluteY = absoluteY - cropY;
            // Re-map to new percentages
            return {
              ...lbl,
              x: Math.min(100, Math.max(0, (newAbsoluteX / cropW) * 100)),
              y: Math.min(100, Math.max(0, (newAbsoluteY / cropH) * 100))
            };
          });
          mapData.labels = shiftLabels;

          await savePage(page);
          cropBox.style.display = 'none';
          initMapEditor(container, page, options);
          showToast('Image cropped successfully!', 'success');
        };
        tempImg.src = page.coverImage;
      } else {
        cropBox.style.display = 'none';
      }
    });

    // ── Resizing Logic ──
    scaleBar.querySelector('.apply-scale-btn').addEventListener('click', () => {
      const factor = parseFloat(scaleBar.querySelector('.scale-factor-select').value);
      if (confirm(`Rescale base map image size to ${factor * 100}%? This helps optimize image sizes.`)) {
        const resizeCanvas = document.createElement('canvas');
        const resizeW = Math.round(originalImageWidth * factor);
        const resizeH = Math.round(originalImageHeight * factor);
        resizeCanvas.width = resizeW;
        resizeCanvas.height = resizeH;
        const rCtx = resizeCanvas.getContext('2d');

        const tempImg = new Image();
        tempImg.onload = async () => {
          rCtx.drawImage(tempImg, 0, 0, resizeW, resizeH);
          page.coverImage = resizeCanvas.toDataURL('image/jpeg', 0.90);
          await savePage(page);
          initMapEditor(container, page, options);
          showToast(`Map image resized to ${resizeW}x${resizeH}!`, 'success');
        };
        tempImg.src = page.coverImage;
      }
    });

    // ── Double-Click Label Creator ──
    labelsContainer.addEventListener('dblclick', async (e) => {
      if (currentTool !== 'navigate') return;
      if (e.target !== labelsContainer) return; // double clicking on labels wrapper only

      const rect = mapWrapper.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Convert coordinates to percentages (0-100)
      const pctX = (clickX / rect.width) * 100;
      const pctY = (clickY / rect.height) * 100;

      // Show float inputbox
      showLabelInput(clickX, clickY, pctX, pctY);
    });

    // Float Label Input Dialog with Autocomplete Page linking
    async function showLabelInput(posX, posY, pctX, pctY, editingLabel = null) {
      // Remove any existing active input
      document.querySelector('.map-label-input-overlay')?.remove();

      const overlay = document.createElement('div');
      overlay.className = 'map-label-input-overlay';
      overlay.style.cssText = `position: absolute; left: ${posX}px; top: ${posY}px; z-index: 100; background: var(--bg-elevated); border: 1px solid var(--border-default); border-radius: 8px; padding: 6px; display: flex; flex-direction: column; gap: 4px; box-shadow: var(--shadow-lg); width: 200px;`;
      
      overlay.innerHTML = `
        <input class="form-input label-text-box" type="text" value="${editingLabel ? editingLabel.text : ''}" placeholder="Label name (e.g. [[Evermore]])" style="font-size:0.75rem; padding:4px; width:100%; border-radius:4px; background:rgba(0,0,0,0.4);" />
        <div class="wiki-autocomplete-dropdown" style="display:none; max-height:100px; overflow-y:auto; background:var(--bg-default); border:1px solid rgba(255,255,255,0.08); border-radius:4px; font-size:0.68rem; margin-top:2px;"></div>
        
        <div style="display:flex; gap:6px; align-items:center; justify-content:space-between; margin-top:2px;">
          <!-- Icon select -->
          <div style="display:flex; flex-direction:column; gap:2px; width: 100%;">
            <span style="font-size:0.55rem; color:var(--text-muted); text-transform:uppercase;">Pin Icon</span>
            <select class="label-pin-icon-select" style="background:rgba(0,0,0,0.3); font-size:0.68rem; padding:4px 6px; border:1px solid rgba(255,255,255,0.1); border-radius:4px; color:#fff; width:100%; cursor:pointer;">
              <option value="" ${(!editingLabel || !editingLabel?.icon) ? 'selected' : ''}>None</option>
              <option value="📍" ${editingLabel?.icon === '📍' ? 'selected' : ''}>📍 Pin</option>
              <option value="🪙" ${editingLabel?.icon === '🪙' ? 'selected' : ''}>🪙 Loot</option>
              <option value="👾" ${editingLabel?.icon === '👾' ? 'selected' : ''}>👾 Monster</option>
              <option value="⚔️" ${editingLabel?.icon === '⚔️' ? 'selected' : ''}>⚔️ Combat</option>
              <option value="🏰" ${editingLabel?.icon === '🏰' ? 'selected' : ''}>🏰 Castle</option>
              <option value="🌳" ${editingLabel?.icon === '🌳' ? 'selected' : ''}>🌳 Nature</option>
              <option value="🚪" ${editingLabel?.icon === '🚪' ? 'selected' : ''}>🚪 Dungeon</option>
              <option value="📜" ${editingLabel?.icon === '📜' ? 'selected' : ''}>📜 Quest</option>
              <option value="💎" ${editingLabel?.icon === '💎' ? 'selected' : ''}>💎 Gem</option>
              <option value="⚠️" ${editingLabel?.icon === '⚠️' ? 'selected' : ''}>⚠️ Hazard</option>
              <option value="🏠" ${editingLabel?.icon === '🏠' ? 'selected' : ''}>🏠 Tavern</option>
              <option value="⛺" ${editingLabel?.icon === '⛺' ? 'selected' : ''}>⛺ Camp</option>
              <option value="👤" ${editingLabel?.icon === '👤' ? 'selected' : ''}>👤 NPC</option>
              <option value="🐾" ${editingLabel?.icon === '🐾' ? 'selected' : ''}>🐾 Beast</option>
              <option value="🔮" ${editingLabel?.icon === '🔮' ? 'selected' : ''}>🔮 Magic</option>
            </select>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; border-top:1px solid rgba(255,255,255,0.04); padding-top:4px;">
          <!-- Hide Text checkbox -->
          <label style="display:flex; align-items:center; gap:4px; font-size:0.62rem; color:var(--text-muted); cursor:pointer; user-select:none; margin:0;">
            <input type="checkbox" class="label-hide-text-checkbox" ${editingLabel?.hideText ? 'checked' : ''} style="margin:0; width:11px; height:11px; cursor:pointer;" />
            <span>Hide Text</span>
          </label>
          <div style="display:flex; gap:4px;">
            <button class="btn btn-xs btn-secondary cancel-label-btn" style="padding:1px 4px; font-size:0.62rem;">Cancel</button>
            <button class="btn btn-xs btn-primary save-label-btn" style="padding:1px 4px; font-size:0.62rem;">OK</button>
          </div>
        </div>
      `;

      mapWrapper.appendChild(overlay);

      const input = overlay.querySelector('.label-text-box');
      const dropdown = overlay.querySelector('.wiki-autocomplete-dropdown');
      const saveBtn = overlay.querySelector('.save-label-btn');
      const cancelBtn = overlay.querySelector('.cancel-label-btn');

      input.focus();

      // Autocomplete search
      let allPages = [];
      try {
        allPages = await getPages(page.projectId);
      } catch (_) {}

      let searchIndex = -1;
      let matchedPages = [];

      input.addEventListener('input', () => {
        const val = input.value;
        const lastOpen = val.lastIndexOf('[[');
        
        if (lastOpen === -1 || val.slice(lastOpen + 2).includes(']]') || val.slice(lastOpen + 2).includes('\n')) {
          dropdown.style.display = 'none';
          return;
        }

        const query = val.slice(lastOpen + 2).toLowerCase().trim();
        matchedPages = allPages.filter(p => p.title && p.title.toLowerCase().includes(query)).slice(0, 5);

        if (matchedPages.length === 0) {
          dropdown.style.display = 'none';
          return;
        }

        dropdown.innerHTML = matchedPages.map((p, idx) => `
          <div class="wiki-opt" data-index="${idx}" style="padding:3px 6px; cursor:pointer; border-bottom:1px dashed rgba(255,255,255,0.02); display:flex; align-items:center; gap:4px;">
            📄 <span>${p.title}</span>
          </div>
        `).join('');
        dropdown.style.display = 'block';

        // Select match click handler
        dropdown.querySelectorAll('.wiki-opt').forEach(opt => {
          opt.addEventListener('click', () => {
            const match = matchedPages[opt.dataset.index];
            applyMatch(match, lastOpen);
          });
        });
      });

      function applyMatch(match, startIdx) {
        const val = input.value;
        input.value = val.slice(0, startIdx) + `[[${match.title}]]`;
        dropdown.style.display = 'none';
        input.focus();
      }

      const closeOverlay = () => { overlay.remove(); };
      cancelBtn.addEventListener('click', closeOverlay);

      // Save Label Handler
      const saveLabel = async () => {
        const textVal = input.value.trim();
        if (!textVal) {
          closeOverlay();
          return;
        }

        // Parse wiki-link
        let pageId = null;
        const match = textVal.match(/\[\[([^\]]+)\]\]/);
        if (match) {
          const matchTitle = match[1].toLowerCase().trim();
          const found = allPages.find(p => p.title && p.title.toLowerCase().trim() === matchTitle);
          if (found) {
            pageId = found.id;
          }
        }

        const iconVal = overlay.querySelector('.label-pin-icon-select').value;
        const hideTextVal = overlay.querySelector('.label-hide-text-checkbox').checked;

        if (editingLabel) {
          // Update existing
          editingLabel.text = textVal;
          editingLabel.pageId = pageId;
          editingLabel.icon = iconVal;
          editingLabel.hideText = hideTextVal;
        } else {
          // Add new
          mapData.labels.push({
            id: 'lbl_' + Math.random().toString(36).slice(2, 9),
            text: textVal,
            x: pctX,
            y: pctY,
            fontSize: '13px',
            pageId,
            icon: iconVal,
            hideText: hideTextVal
          });
        }

        await savePage(page);
        closeOverlay();
        renderLabels();
        showToast(editingLabel ? 'Pin updated' : 'Pin placed', 'success');
      };

      saveBtn.addEventListener('click', saveLabel);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveLabel();
        } else if (e.key === 'Escape') {
          closeOverlay();
        }
      });
    }

    function closePinMenu() {
      document.querySelector('.map-pin-menu')?.remove();
    }

    function createMenuItem(icon, text, onClick, isDanger = false) {
      const item = document.createElement('button');
      item.style.cssText = `
        background: transparent;
        border: none;
        color: ${isDanger ? 'var(--accent-red, #f43f5e)' : 'var(--text-secondary, #e2e8f0)'};
        padding: 6px 10px;
        font-size: 11px;
        font-family: var(--font-body);
        font-weight: 500;
        text-align: left;
        cursor: pointer;
        border-radius: 4px;
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        transition: background 0.15s, color 0.15s;
        box-sizing: border-box;
      `;
      item.innerHTML = `<span>${icon}</span> <span>${text}</span>`;
      item.addEventListener('mouseenter', () => {
        item.style.background = isDanger ? 'rgba(244, 63, 94, 0.1)' : 'rgba(255, 255, 255, 0.05)';
        item.style.color = isDanger ? 'var(--accent-red, #f43f5e)' : '#fff';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
        item.style.color = isDanger ? 'var(--accent-red, #f43f5e)' : 'var(--text-secondary, #e2e8f0)';
      });
      item.addEventListener('click', onClick);
      return item;
    }

    function showPinMenu(targetEl, labelData) {
      closePinMenu();

      const spawnBelow = labelData.y < 25;
      let translateX = '-50%';
      if (labelData.x < 15) {
        translateX = '-15%';
      } else if (labelData.x > 85) {
        translateX = '-85%';
      }
      const transformVal = `translate(${translateX}, ${spawnBelow ? '20%' : '-120%'})`;

      const menu = document.createElement('div');
      menu.className = 'map-pin-menu';
      menu.style.cssText = `
        position: absolute;
        left: ${labelData.x}%;
        top: ${labelData.y}%;
        transform: ${transformVal};
        z-index: 1000;
        background: rgba(13, 10, 20, 0.95);
        border: 1px solid var(--accent-primary);
        border-radius: 6px;
        padding: 4px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.6), 0 0 8px rgba(229,169,59,0.15);
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 130px;
        backdrop-filter: blur(8px);
      `;

      // Edit Option
      const editBtn = createMenuItem('📝', 'Edit Details', (evt) => {
        evt.stopPropagation();
        closePinMenu();
        const rect = mapWrapper.getBoundingClientRect();
        const posX = (labelData.x / 100) * rect.width;
        const posY = (labelData.y / 100) * rect.height;
        showLabelInput(posX, posY, labelData.x, labelData.y, labelData);
      });
      menu.appendChild(editBtn);

      // Open Entry Option
      if (labelData.pageId) {
        const openBtn = createMenuItem('📖', 'Open Entry ↗', (evt) => {
          evt.stopPropagation();
          closePinMenu();
          navigate(`page/${labelData.pageId}`);
        });
        menu.appendChild(openBtn);
      }

      // Toggle Label text Option
      const toggleTextBtn = createMenuItem(
        labelData.hideText ? '👁️' : '🕶️', 
        labelData.hideText ? 'Show Text' : 'Hide Text', 
        async (evt) => {
          evt.stopPropagation();
          closePinMenu();
          labelData.hideText = !labelData.hideText;
          await savePage(page);
          renderLabels();
          showToast(labelData.hideText ? 'Label text hidden' : 'Label text visible', 'success');
        }
      );
      menu.appendChild(toggleTextBtn);

      // Divider
      const hr = document.createElement('div');
      hr.style.cssText = 'height: 1px; background: rgba(255,255,255,0.06); margin: 2px 0;';
      menu.appendChild(hr);

      // Delete Option
      const deleteBtn = createMenuItem('🗑️', 'Delete Pin', async (evt) => {
        evt.stopPropagation();
        closePinMenu();
        mapData.labels = mapData.labels.filter(l => l.id !== labelData.id);
        await savePage(page);
        renderLabels();
        showToast('Pin removed', 'success');
      }, true);
      menu.appendChild(deleteBtn);

      labelsContainer.appendChild(menu);
    }

    function clearAllHighlights() {
      closePinMenu();
      labelsContainer.querySelectorAll('.map-label').forEach(other => {
        other.classList.remove('highlighted');
        const otherDel = other.querySelector('.lbl-del-btn');
        const otherResize = other.querySelector('.lbl-resize-handle');
        if (otherDel) otherDel.style.display = 'none';
        if (otherResize) otherResize.style.display = 'none';
        
        // Restore standard border / shadows
        const isLink = other.classList.contains('map-label-link');
        const hideText = other.dataset.hideText === 'true';

        if (hideText) {
          other.style.boxShadow = 'none';
          other.style.border = 'none';
        } else {
          if (isLink) {
            other.style.background = 'rgba(13,10,20,0.85)';
            other.style.border = '1px solid var(--accent-primary)';
            other.style.boxShadow = '0 2px 10px rgba(0,0,0,0.4), 0 0 6px var(--node-accent-glow, rgba(167,139,250,0.2))';
          } else {
            other.style.background = 'rgba(0,0,0,0.65)';
            other.style.border = '1px solid rgba(255,255,255,0.08)';
            other.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)';
          }
        }
      });
    }

    // Dismiss highlights when clicking map background
    mapWrapper.addEventListener('click', (e) => {
      if (e.target === mapWrapper || e.target === labelsContainer || e.target === mapImg || e.target === drawCanvas || e.target === gridOverlay) {
        clearAllHighlights();
      }
    });

    // ── Render All Map Labels ──
    function renderLabels() {
      labelsContainer.innerHTML = '';

      mapData.labels.forEach(lbl => {
        const el = document.createElement('div');
        el.className = 'map-label';
        el.dataset.hideText = lbl.hideText ? 'true' : 'false';
        el.dataset.hasLink = lbl.pageId ? 'true' : 'false';
        
        let pinIcon = lbl.icon || '';
        // Default to pin icon for wiki links
        if (lbl.pageId && !pinIcon) {
          pinIcon = '📍';
        }
        // Fail-safe: if text is hidden, there must be an icon or else it is invisible
        if (lbl.hideText && !pinIcon) {
          pinIcon = '📍';
        }

        const displayLabelText = lbl.hideText ? '' : (lbl.pageId ? lbl.text.replace(/\[\[|\]\]/g, '') : lbl.text);

        const size = lbl.size || (lbl.hideText ? 28 : (lbl.fontSize ? parseInt(lbl.fontSize) : 13));

        if (lbl.hideText) {
          // Icon-only style: compact, transparent background by default, no borders
          el.style.cssText = `position: absolute; left: ${lbl.x}%; top: ${lbl.y}%; transform: translate(-50%, -50%); cursor: grab; z-index: 8; display: flex; align-items: center; justify-content: center; padding: 0; border-radius: 50%; width: ${size}px; height: ${size}px; background: transparent; border: none; box-shadow: none; font-size: ${size * 0.05}rem; transition: transform 0.15s;`;
          el.innerHTML = `<span class="lbl-link-icon" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.65)); display: flex; align-items: center; justify-content: center; user-select: none; font-size: ${size * 0.05}rem;">${pinIcon}</span>`;
          
          if (lbl.pageId) {
            el.className += ' map-label-link';
          }
        } else {
          // Normal pill-box rendering (with text and optional icon)
          el.style.cssText = `position: absolute; left: ${lbl.x}%; top: ${lbl.y}%; transform: translate(-50%, -50%); cursor: grab; z-index: 8; display: flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 4px; font-size: ${size}px; transition: transform 0.15s;`;
          
          if (lbl.pageId) {
            // Style as clickable Database Link button
            el.className += ' map-label-link';
            el.style.background = 'rgba(13,10,20,0.85)';
            el.style.border = '1px solid var(--accent-primary)';
            el.style.boxShadow = '0 2px 10px rgba(0,0,0,0.4), 0 0 6px var(--node-accent-glow, rgba(167,139,250,0.2))';
            el.style.color = 'var(--accent-primary)';
            el.innerHTML = `
              ${pinIcon ? `<span class="lbl-link-icon" style="font-size:0.65rem;">${pinIcon}</span>` : ''}
              ${displayLabelText ? `<span class="lbl-text" style="font-weight:600;">${displayLabelText}</span>` : ''}
            `;
          } else {
            // Standard plain text label
            el.style.background = 'rgba(0,0,0,0.65)';
            el.style.color = '#fff';
            el.style.border = '1px solid rgba(255,255,255,0.08)';
            el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)';
            el.innerHTML = `
              ${pinIcon ? `<span class="lbl-link-icon" style="font-size:0.65rem; margin-right: 2px;">${pinIcon}</span>` : ''}
              ${displayLabelText ? `<span class="lbl-text">${displayLabelText}</span>` : ''}
            `;
          }
        }

        // Add Delete "X" handler (shown only on highlight)
        const delBtn = document.createElement('span');
        delBtn.className = 'lbl-del-btn';
        delBtn.innerHTML = '✕';
        delBtn.style.cssText = 'cursor:pointer; font-weight:bold; font-size:0.65rem; color:var(--text-muted); padding: 0 2px; display:none; margin-left: 4px;';
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          mapData.labels = mapData.labels.filter(l => l.id !== lbl.id);
          await savePage(page);
          renderLabels();
          showToast('Label removed', 'success');
        });
        el.appendChild(delBtn);

        // Add Resize Handle (shown only on highlight)
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'lbl-resize-handle';
        resizeHandle.style.cssText = 'position: absolute; right: 1px; bottom: 1px; width: 6px; height: 6px; cursor: se-resize; border-right: 1.5px solid var(--accent-primary); border-bottom: 1.5px solid var(--accent-primary); display: none;';
        el.appendChild(resizeHandle);

        // Unified Click Listener for Left-Click Highlight
        el.addEventListener('click', (e) => {
          if (el.dataset.dragged === 'true') return;
          e.stopPropagation();

          const isAlreadyHighlighted = el.classList.contains('highlighted');

          if (!isAlreadyHighlighted) {
            clearAllHighlights();
            closePinMenu();

            // Highlight this one
            el.classList.add('highlighted');
            delBtn.style.display = 'inline-block';
            resizeHandle.style.display = 'block';

            // Glow / Highlight border styling
            el.style.boxShadow = '0 0 0 2px var(--accent-primary), 0 0 12px var(--accent-primary)';
            if (lbl.hideText) {
              el.style.border = '1px solid var(--accent-primary)';
            } else {
              el.style.borderColor = 'var(--accent-primary)';
            }
          }
        });

        // Unified Contextmenu Listener for Right-Click Floater Dropdown Menu
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();

          const isAlreadyHighlighted = el.classList.contains('highlighted');

          if (!isAlreadyHighlighted) {
            clearAllHighlights();
            closePinMenu();

            // Highlight this one
            el.classList.add('highlighted');
            delBtn.style.display = 'inline-block';
            resizeHandle.style.display = 'block';

            // Glow / Highlight border styling
            el.style.boxShadow = '0 0 0 2px var(--accent-primary), 0 0 12px var(--accent-primary)';
            if (lbl.hideText) {
              el.style.border = '1px solid var(--accent-primary)';
            } else {
              el.style.borderColor = 'var(--accent-primary)';
            }
          }

          // Show the pin options menu
          showPinMenu(el, lbl);
        });

        // Double click to open the database entry (navigate to page)
        el.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          if (lbl.pageId) {
            navigate(`page/${lbl.pageId}`);
          } else {
            // Fallback: if no page is linked, open the edit dialog to let them link one
            const rect = mapWrapper.getBoundingClientRect();
            const posX = (lbl.x / 100) * rect.width;
            const posY = (lbl.y / 100) * rect.height;
            showLabelInput(posX, posY, lbl.x, lbl.y, lbl);
          }
        });

        // Resize Drag Handler
        let isResizing = false;
        let startSize = 0;
        let startX = 0;
        let startY = 0;

        resizeHandle.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          isResizing = true;
          startX = e.clientX;
          startY = e.clientY;
          startSize = lbl.size || (lbl.hideText ? 28 : (lbl.fontSize ? parseInt(lbl.fontSize) : 13));

          const onResizeMove = (moveEvt) => {
            if (!isResizing) return;
            const deltaX = moveEvt.clientX - startX;
            const deltaY = moveEvt.clientY - startY;
            const delta = Math.round((deltaX + deltaY) / 2);
            
            const minVal = lbl.hideText ? 16 : 8;
            const maxVal = lbl.hideText ? 120 : 64;
            const newSize = Math.max(minVal, Math.min(maxVal, startSize + delta));
            
            lbl.size = newSize;
            lbl.fontSize = `${newSize}px`;
            
            if (lbl.hideText) {
              el.style.width = `${newSize}px`;
              el.style.height = `${newSize}px`;
              const iconSpan = el.querySelector('.lbl-link-icon');
              if (iconSpan) {
                iconSpan.style.fontSize = `${newSize * 0.05}rem`;
              }
            } else {
              el.style.fontSize = `${newSize}px`;
            }
          };

          const onResizeUp = async () => {
            if (!isResizing) return;
            isResizing = false;
            document.removeEventListener('mousemove', onResizeMove);
            document.removeEventListener('mouseup', onResizeUp);
            await savePage(page);
          };

          document.addEventListener('mousemove', onResizeMove);
          document.addEventListener('mouseup', onResizeUp);
        });

        // Drag-and-drop label positioning logic
        let isLabelDrag = false;
        let dragOffsetLeft = 0;
        let dragOffsetTop = 0;

        const onMouseMove = (e) => {
          if (!isLabelDrag) return;
          el.dataset.dragged = 'true';
          const rect = mapWrapper.getBoundingClientRect();
          const clickX = e.clientX - rect.left - dragOffsetLeft;
          const clickY = e.clientY - rect.top - dragOffsetTop;

          // Convert to percentages
          const pctX = Math.min(100, Math.max(0, (clickX / rect.width) * 100));
          const pctY = Math.min(100, Math.max(0, (clickY / rect.height) * 100));

          lbl.x = pctX;
          lbl.y = pctY;

          el.style.left = `${pctX}%`;
          el.style.top = `${pctY}%`;
        };

        const onMouseUp = async () => {
          if (!isLabelDrag) return;
          isLabelDrag = false;
          el.style.cursor = 'grab';
          el.style.zIndex = '8';
          if (el.dataset.dragged === 'true') {
            await savePage(page);
          }
          
          // Clear document level listeners
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };

        el.addEventListener('mousedown', (e) => {
          if (e.target.closest('.lbl-del-btn') || e.target.closest('.lbl-resize-handle')) return;
          isLabelDrag = true;
          el.dataset.dragged = 'false';
          el.style.cursor = 'grabbing';
          el.style.zIndex = '99';

          const rect = mapWrapper.getBoundingClientRect();
          const lblRect = el.getBoundingClientRect();
          
          dragOffsetLeft = e.clientX - lblRect.left - (lblRect.width / 2);
          dragOffsetTop = e.clientY - lblRect.top - (lblRect.height / 2);

          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        });

        labelsContainer.appendChild(el);
      });
    }

    // ── Delete Map Action ──
    deleteMapBtn.addEventListener('click', async () => {
      if (confirm('Delete the map image? This clears the image but preserves text labels.')) {
        page.coverImage = '';
        await savePage(page);
        initMapEditor(container, page, options);
        showToast('Map image deleted!', 'success');
      }
    });

    // Default Tool Selector
    selectTool(currentTool);
  }
}

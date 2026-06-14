/* ============================================================
   Forge — Quick Capture Overlay Page
   A streamlined, distraction-free view designed to run in
   a small frameless window for fast notes capture.
   ============================================================ */

import { getActiveProject, getSchemas, savePage, generateId, flushFileAutosave } from '../db.js';
import { showToast } from '../ui.js';

export async function renderQuickCapture(container) {
  document.body.classList.add('quick-capture-mode');
  // Center window styles
  injectStyles();

  // Load project & schemas
  const project = await getActiveProject();
  const schemas = project ? await getSchemas(project.id) : [];

  container.innerHTML = `
    <div class="quick-capture-container" style="padding: var(--sp-6); height: 100vh; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; background: #0a0812; border: 1px solid rgba(229, 169, 59, 0.2); border-radius: var(--radius-lg); overflow: hidden;">
      
      <!-- Top header drag bar / Title -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-4); -webkit-app-region: drag;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="display:inline-block; width: 6px; height: 6px; border-radius:50%; background: var(--accent-primary); box-shadow: 0 0 6px var(--accent-primary);"></span>
          <h2 style="font-size: var(--fs-md); font-weight: 700; color: var(--text-primary); margin: 0; letter-spacing: 0.05em; font-family: var(--font-hud, monospace); text-transform: uppercase;">Quick Capture</h2>
        </div>
        <button id="qc-close-btn" class="icon-btn" style="-webkit-app-region: no-drag; font-size: 11px; color: var(--text-muted); cursor: pointer; background: transparent; border: none;">✕</button>
      </div>

      <!-- Main Input Form -->
      <div style="display: flex; flex-direction: column; gap: var(--sp-4); flex: 1; margin-bottom: var(--sp-4);">
        <!-- Title field -->
        <div class="form-group">
          <input type="text" id="qc-title" placeholder="Jot down a title..." style="width: 100%; font-size: 1.15rem; font-weight: 600; color: #ffffff; background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 8px 12px; outline: none; box-sizing: border-box; transition: border-color 0.2s;" />
        </div>

        <!-- Schema/Target Database selector -->
        <div class="form-group" style="display: flex; align-items: center; gap: 12px;">
          <label style="font-size: var(--fs-xs); color: var(--text-muted); font-family: var(--font-hud, monospace); white-space: nowrap;">DATABASE:</label>
          <select id="qc-schema-select" class="form-input" style="flex: 1; height: 32px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); color: var(--text-primary); font-size: var(--fs-xs); padding: 0 var(--sp-2); outline: none;">
            <option value="">Inbox (Unassigned)</option>
            ${schemas.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
          </select>
        </div>

        <!-- Content field -->
        <div class="form-group" style="flex: 1; display: flex; flex-direction: column;">
          <textarea id="qc-content" placeholder="Write down your thoughts... (Supports Ctrl+Enter to save)" style="width: 100%; flex: 1; min-height: 120px; font-size: var(--fs-sm); color: var(--text-secondary); background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 10px 12px; resize: none; outline: none; box-sizing: border-box; line-height: 1.5; transition: border-color 0.2s;"></textarea>
        </div>
      </div>

      <!-- Action Footer -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4);">
        <span style="font-size: 9px; color: var(--text-muted); font-family: var(--font-hud, monospace); opacity: 0.7;">Esc to cancel</span>
        <div style="display: flex; gap: var(--sp-2);">
          <button id="qc-cancel-btn" class="btn btn-secondary btn-sm" style="height: 32px; padding: 0 var(--sp-4);">Cancel</button>
          <button id="qc-save-btn" class="btn btn-primary btn-sm" style="height: 32px; padding: 0 var(--sp-4); font-weight: 600; display: flex; align-items: center; gap: 6px;">
            Save Capture
          </button>
        </div>
      </div>

    </div>
  `;

  // Focus title automatically on spawn
  const titleInput = container.querySelector('#qc-title');
  const contentInput = container.querySelector('#qc-content');
  const schemaSelect = container.querySelector('#qc-schema-select');
  const saveBtn = container.querySelector('#qc-save-btn');
  const cancelBtn = container.querySelector('#qc-cancel-btn');
  const closeBtn = container.querySelector('#qc-close-btn');

  setTimeout(() => titleInput.focus(), 150);

  // Close helper
  const closeWindow = () => {
    if (window.electronAPI && window.electronAPI.closeQuickCapture) {
      window.electronAPI.closeQuickCapture();
    } else {
      window.close(); // Browser fallback
    }
  };

  // Save logic
  const handleSave = async () => {
    const titleVal = titleInput.value.trim();
    const contentVal = contentInput.value.trim();
    const schemaIdVal = schemaSelect.value || null;

    if (!titleVal) {
      showToast('Please enter a title for the idea', 'error');
      titleInput.focus();
      return;
    }

    if (!project) {
      showToast('No active project found to capture idea', 'error');
      return;
    }

    try {
      const pageData = {
        id: generateId(),
        projectId: project.id,
        schemaId: schemaIdVal,
        title: titleVal,
        // Convert plain text to simple Quill delta JSON structure
        content: JSON.stringify({
          ops: [{ insert: contentVal + '\n' }]
        }),
        properties: {},
        isInbox: schemaIdVal ? false : true, // Mark as inbox draft if no schema
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await savePage(pageData);
      await flushFileAutosave(); // Force write to file before the window closes
      showToast('Idea captured successfully!', 'success');
      
      // Flash save effect and close
      saveBtn.disabled = true;
      saveBtn.innerText = 'Saved!';
      setTimeout(() => {
        closeWindow();
      }, 500);

    } catch (err) {
      console.error('Failed to save quick capture:', err);
      showToast('Failed to save capture.', 'error');
    }
  };

  // Keyboard hooks
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeWindow();
    }
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSave();
    }
  });

  saveBtn.addEventListener('click', handleSave);
  cancelBtn.addEventListener('click', closeWindow);
  closeBtn.addEventListener('click', closeWindow);

  // Clean up quick-capture-mode when route changes or window closes
  container._cleanup = () => {
    document.body.classList.remove('quick-capture-mode');
  };
}

function injectStyles() {
  if (document.getElementById('quick-capture-styles')) return;
  const style = document.createElement('style');
  style.id = 'quick-capture-styles';
  style.innerHTML = `
    body.quick-capture-mode #sidebar {
      display: none !important;
    }
    body.quick-capture-mode #main-content {
      background: transparent !important;
      overflow: hidden !important;
    }
    body.quick-capture-mode #page-container {
      max-width: none !important;
      padding: 0 !important;
      margin: 0 !important;
      height: 100vh !important;
    }
    .quick-capture-container input:focus, 
    .quick-capture-container textarea:focus,
    .quick-capture-container select:focus {
      border-color: var(--accent-primary) !important;
      box-shadow: 0 0 8px rgba(229, 169, 59, 0.25);
      background: rgba(255, 255, 255, 0.04) !important;
    }
  `;
  document.head.appendChild(style);
}

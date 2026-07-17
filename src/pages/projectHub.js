/* ============================================================
   Forge — Project Hub Landing Screen
   Allows the user to select, open, or create local .forge project files.
   ============================================================ */

import * as db from '../db.js';
import { navigate } from '../router.js';
import { showToast, escapeHtml } from '../ui.js';
import { refreshIcons } from '../icons.js';
import { renderSidebar } from '../sidebar.js';
import { getStyleConfig } from '../styleConfig.js';

export async function renderProjectHub(container) {
  const recents = db.getRecentProjects();

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background: #0a0812; padding: var(--sp-8); box-sizing: border-box; font-family: var(--font-body);">
      
      <!-- Logo & Title -->
      <div style="text-align: center; margin-bottom: var(--sp-10); animation: fadeInDown 0.6s ease;">
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 80px; height: 80px; margin-bottom: var(--sp-4); filter: drop-shadow(0 0 15px rgba(229,169,59,0.3));">
          <path d="M38 4 L18 28 H28 L20 60 L46 32 H36 Z" fill="var(--accent-primary)" stroke="var(--accent-primary)" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
        <h1 style="font-family: var(--font-heading); font-size: 2.2rem; font-weight: 800; color: #fff; letter-spacing: 0.15em; margin: 0 0 8px 0; background: linear-gradient(135deg, #fff, var(--accent-primary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">FORGE</h1>
        <p style="color: var(--text-tertiary); font-size: 0.95rem; font-family: var(--font-hud); letter-spacing: 0.05em; text-transform: uppercase;">Universal Creative Universe Builder</p>
      </div>

      <!-- Main Action Panels -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-6); max-width: 900px; width: 100%; box-sizing: border-box; animation: fadeInUp 0.6s ease;">
        
        <!-- Left Panel: Create / Open -->
        <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; padding: var(--sp-6); background: rgba(20,17,34,0.6); border-color: rgba(229,169,59,0.15);">
          <div>
            <h3 style="color: #fff; font-family: var(--font-heading); font-size: 1.25rem; font-weight: var(--fw-semibold); margin-top: 0; margin-bottom: var(--sp-4); display: flex; align-items: center; gap: 8px;">
              <i data-lucide="plus-circle" style="color: var(--accent-primary);"></i> Start a New Universe
            </h3>
            
            <div style="display: flex; flex-direction: column; gap: var(--sp-4); margin-bottom: var(--sp-6);">
              <div class="form-group">
                <label class="form-label" style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted);">Universe Name</label>
                <input class="form-input" id="hub-project-name" placeholder="e.g., Kairo, Project Eldritch" style="background: rgba(0,0,0,0.3); border-color: rgba(255,255,255,0.05);" />
              </div>
              <div class="form-group">
                <label class="form-label" style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted);">Genre / Theme</label>
                <input class="form-input" id="hub-project-genre" placeholder="e.g., Dark Fantasy RPG, Sci-Fi Strategy" style="background: rgba(0,0,0,0.3); border-color: rgba(255,255,255,0.05);" />
              </div>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 12px;">
            <button class="btn btn-primary" id="hub-create-btn" style="width: 100%; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px;">
              <i data-lucide="file-plus-2"></i> Create Universe File (.forge)
            </button>
            
            <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; margin: 4px 0;">— OR —</div>
            
            <button class="btn btn-secondary" id="hub-open-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;">
              <i data-lucide="folder-open"></i> Open Existing .forge File
            </button>
          </div>
        </div>

        <!-- Right Panel: Recents -->
        <div class="card" style="padding: var(--sp-6); background: rgba(20,17,34,0.6); border-color: rgba(229,169,59,0.15); display: flex; flex-direction: column;">
          <h3 style="color: #fff; font-family: var(--font-heading); font-size: 1.25rem; font-weight: var(--fw-semibold); margin-top: 0; margin-bottom: var(--sp-4); display: flex; align-items: center; gap: 8px;">
            <i data-lucide="history" style="color: var(--accent-secondary);"></i> Recent Universes
          </h3>

          <div id="hub-recents-list" style="flex: 1; overflow-y: auto; max-height: 280px; display: flex; flex-direction: column; gap: 8px; scrollbar-width: thin;">
            ${recents.length === 0 ? `
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); text-align: center; padding: var(--sp-6);">
                <i data-lucide="folder" style="width: 32px; height: 32px; opacity: 0.3; margin-bottom: var(--sp-2);"></i>
                <p style="font-size: 0.85rem; margin: 0;">No recently opened universes found.<br>Create a new one to begin forging.</p>
              </div>
            ` : recents.map(r => `
              <div class="recent-project-card" data-path="${escapeHtml(r.path)}" style="cursor: pointer; padding: var(--sp-3); border-radius: var(--radius-md); border: 1px solid var(--border-subtle); background: rgba(255,255,255,0.01); transition: all 0.2s; display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);">
                <div class="recent-project-click-area" style="flex: 1; display: flex; align-items: center; gap: var(--sp-3); min-width: 0;">
                  <div style="color: var(--accent-secondary);"><i data-lucide="scroll"></i></div>
                  <div style="min-width: 0; flex: 1;">
                    <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(r.name)}</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--font-mono); margin-top: 2px;">${escapeHtml(r.path)}</div>
                  </div>
                </div>
                <button class="recent-project-delete icon-btn" data-path="${escapeHtml(r.path)}" title="Remove from list" style="padding: 4px; border-radius: 4px; color: var(--text-muted); opacity: 0.6;">✕</button>
              </div>
            `).join('')}
          </div>
        </div>

      </div>
    </div>
  `;

  // --- Handlers ---

  // Create Project File
  container.querySelector('#hub-create-btn').addEventListener('click', () => {
    const name = container.querySelector('#hub-project-name').value.trim();
    const genre = container.querySelector('#hub-project-genre').value.trim();
    if (!name) {
      showToast('Please enter a name for your universe', 'error');
      return;
    }

    openStyleModal(name, genre, !window.electronAPI);
  });

  function hexToRgb(hex) {
    const bigint = parseInt(hex.replace('#', ''), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r}, ${g}, ${b}`;
  }

  function openStyleModal(name, genre, isBrowser) {
    const modalId = 'style-selection-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(5, 4, 8, 0.85);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    modal.innerHTML = `
      <div class="card" style="width: 100%; max-width: 680px; padding: var(--sp-6); background: rgba(20, 17, 34, 0.95); border: 1px solid rgba(229, 169, 59, 0.2); box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8); border-radius: var(--radius-lg); animation: fadeIn 0.25s ease-out;">
        <h3 style="color: #fff; font-family: var(--font-heading); font-size: 1.5rem; margin-top: 0; margin-bottom: 4px;">Initialize Your Universe</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 24px;">Select a specialized style to adapt Forge's terminology, database templates, and AI companion.</p>
        
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px;">
          <!-- Story Card -->
          <div class="style-card active" data-style="story" style="border: 2px solid #e5a93b; background: rgba(229, 169, 59, 0.08); padding: 20px; border-radius: 12px; cursor: pointer; text-align: center; transition: all 0.2s; box-shadow: 0 0 15px rgba(229, 169, 59, 0.15);">
            <div style="font-size: 2.2rem; margin-bottom: 12px; color: #e5a93b;">📖</div>
            <div style="font-weight: 700; color: #fff; font-size: 0.95rem; margin-bottom: 6px;">Story Writer</div>
            <div style="font-size: 0.72rem; color: var(--text-muted); line-height: 1.4;">Descriptive prose, chapters, scenes, and character arcs.</div>
          </div>
          <!-- D&D Card -->
          <div class="style-card" data-style="dnd" style="border: 2px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.01); padding: 20px; border-radius: 12px; cursor: pointer; text-align: center; transition: all 0.2s;">
            <div style="font-size: 2.2rem; margin-bottom: 12px; color: #8b5cf6;">🛡️</div>
            <div style="font-weight: 700; color: #fff; font-size: 0.95rem; margin-bottom: 6px;">D&D Campaign</div>
            <div style="font-size: 0.72rem; color: var(--text-muted); line-height: 1.4;">Campaign prep, session logs, monsters, and loot.</div>
          </div>
          <!-- Game Dev Card -->
          <div class="style-card" data-style="gamedev" style="border: 2px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.01); padding: 20px; border-radius: 12px; cursor: pointer; text-align: center; transition: all 0.2s;">
            <div style="font-size: 2.2rem; margin-bottom: 12px; color: #06b6d4;">🎮</div>
            <div style="font-weight: 700; color: #fff; font-size: 0.95rem; margin-bottom: 6px;">Game Dev</div>
            <div style="font-size: 0.72rem; color: var(--text-muted); line-height: 1.4;">System mechanics documentation and level flow flowcharts.</div>
          </div>
        </div>
        
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <button class="btn btn-secondary" id="modal-cancel-btn" style="padding: 10px 20px;">Cancel</button>
          <button class="btn btn-primary" id="modal-create-btn" style="padding: 10px 24px; font-weight: 700;">Create Project</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    let selectedStyle = 'story';

    const cards = modal.querySelectorAll('.style-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        cards.forEach(c => {
          c.classList.remove('active');
          c.style.border = '2px solid rgba(255,255,255,0.08)';
          c.style.background = 'rgba(255,255,255,0.01)';
          c.style.boxShadow = 'none';
        });
        card.classList.add('active');
        selectedStyle = card.dataset.style;
        const conf = getStyleConfig(selectedStyle);
        card.style.border = `2px solid ${conf.accent}`;
        card.style.background = `rgba(${hexToRgb(conf.accent)}, 0.08)`;
        card.style.boxShadow = `0 0 15px rgba(${hexToRgb(conf.accent)}, 0.15)`;
      });
    });

    modal.querySelector('#modal-cancel-btn').addEventListener('click', () => {
      modal.remove();
    });

    modal.querySelector('#modal-create-btn').addEventListener('click', async () => {
      modal.remove();
      if (isBrowser) {
        await createBrowserProject(name, genre, selectedStyle);
      } else {
        await createElectronProject(name, genre, selectedStyle);
      }
    });
  }

  async function createBrowserProject(name, genre, style) {
    showToast('Creating local browser project...', 'success');
    await db.clearDatabase();
    const projectId = db.generateId();
    const proj = {
      id: projectId,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: {
        genre,
        style,
        theme: 'dark'
      }
    };
    await db.saveProject(proj);
    
    // Seed schemas for this style
    const styleConf = getStyleConfig(style);
    const schemas = styleConf.getSchemas(projectId);
    for (const schema of schemas) {
      await db.saveSchema(schema);
    }
    
    await renderSidebar();
    navigate('dashboard');
  }

  async function createElectronProject(name, genre, style) {
    try {
      const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const chosenPath = await window.electronAPI.saveNewFile({
        title: 'Create Universe File',
        defaultName: `${sanitizedName}.forge`
      });

      if (!chosenPath) return; // User canceled

      const projectId = db.generateId();
      const defaultProject = {
        id: projectId,
        name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        settings: {
          genre,
          style,
          theme: 'dark'
        }
      };

      const styleConf = getStyleConfig(style);
      const schemas = styleConf.getSchemas(projectId);

      // Format payload
      const initialPayload = {
        version: 4,
        exportedAt: new Date().toISOString(),
        projects: [defaultProject],
        schemas,
        pages: [],
        links: [],
        images: [],
        tabs: [],
        nodes: []
      };

      // Write initial payload to file
      await window.electronAPI.writeFile(chosenPath, JSON.stringify(initialPayload, null, 2));

      // Load it into active database
      localStorage.setItem('forge-active-project-path', chosenPath);
      db.addRecentProject(chosenPath, name);
      await db.importUniversalData(initialPayload);

      showToast('Universe created successfully!', 'success');
      await renderSidebar();
      navigate('dashboard');
    } catch (err) {
      showToast('Failed to create universe: ' + err.message, 'error');
    }
  }


  // Open Existing File
  container.querySelector('#hub-open-btn').addEventListener('click', async () => {
    if (!window.electronAPI) {
      showToast('Browser mode does not support local files. Use Electron.', 'error');
      return;
    }

    try {
      const result = await window.electronAPI.selectFile();
      if (!result) return; // User canceled

      const { filePath, data } = result;
      const parsed = JSON.parse(data);
      
      // Basic structure validation
      if (!parsed.projects || parsed.projects.length === 0) {
        showToast('Invalid universe file structure', 'error');
        return;
      }

      // Load project into DB
      localStorage.setItem('forge-active-project-path', filePath);
      await db.importUniversalData(parsed);

      const activeProj = parsed.projects[0];
      db.addRecentProject(filePath, activeProj.name);

      showToast(`Welcome to ${activeProj.name}!`, 'success');
      await renderSidebar();
      navigate('dashboard');
    } catch (err) {
      showToast('Failed to open universe file: ' + err.message, 'error');
    }
  });

  // Recent Projects Clicks
  container.querySelectorAll('.recent-project-click-area').forEach(area => {
    area.addEventListener('click', async () => {
      const card = area.closest('.recent-project-card');
      const filePath = card.dataset.path;
      if (!window.electronAPI) return;

      try {
        const fileContent = await window.electronAPI.readFile(filePath);
        const parsed = JSON.parse(fileContent);

        localStorage.setItem('forge-active-project-path', filePath);
        await db.importUniversalData(parsed);

        const activeProj = parsed.projects[0];
        db.addRecentProject(filePath, activeProj.name);

        showToast(`Loaded ${activeProj.name}`, 'success');
        await renderSidebar();
        navigate('dashboard');
      } catch (err) {
        showToast('Failed to load recent project (file might have been moved or deleted)', 'error');
      }
    });
  });

  // Recent Projects Delete from list (just clears index, doesn't delete file on disk)
  container.querySelectorAll('.recent-project-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const filePath = btn.dataset.path;
      const recents = db.getRecentProjects();
      const filtered = recents.filter(r => r.path !== filePath);
      localStorage.setItem('forge-recent-projects', JSON.stringify(filtered));
      renderProjectHub(container); // Re-render lists
    });
  });

  refreshIcons();
}

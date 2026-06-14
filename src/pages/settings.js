/* ============================================================
   Forge — Settings Page
   A unified center for project, visual, notification, and AI configurations.
   ============================================================ */

import * as db from '../db.js';
import { navigate } from '../router.js';
import { showToast, escapeHtml, showModal, checkOllamaRunning, showOllamaInstallPrompt } from '../ui.js';
import { refreshIcons, applyCustomAccent } from '../main.js';
import { renderSidebar } from '../sidebar.js';
import { askGemini, getProjectContext, parseMarkdown, executeForgeAction } from '../ai.js';
import { getStyleConfig } from '../styleConfig.js';

let activeTab = 'project';

function cleanActionJson(str) {
  let clean = str.trim();
  clean = clean.replace(/^```(?:json)?\n?/i, '');
  clean = clean.replace(/\n?```$/i, '');
  return clean.trim();
}

export async function renderSettings(container) {
  const project = await db.getActiveProject();
  if (!project) {
    container.innerHTML = `<div class="empty-state"><p>No active project loaded.</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <h1 class="page-title">Forge Control Center</h1>
          <p class="page-subtitle">Configure project settings, interface visuals, OS reminders, and AI companion Ignis</p>
        </div>
      </div>
    </div>

    <div class="hud-divider"></div>

    <div style="display: grid; grid-template-columns: 200px 1fr; gap: var(--sp-8); padding: 0 var(--sp-6) var(--sp-6);">
      
      <!-- Settings Tabs Navigation -->
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <button class="settings-tab-btn ${activeTab === 'project' ? 'active' : ''}" data-tab="project">📁 General / Project</button>
        <button class="settings-tab-btn ${activeTab === 'visuals' ? 'active' : ''}" data-tab="visuals">🎨 Visuals & Themes</button>
        <button class="settings-tab-btn ${activeTab === 'storage' ? 'active' : ''}" data-tab="storage">💾 Storage & Sync</button>
        <button class="settings-tab-btn ${activeTab === 'notifications' ? 'active' : ''}" data-tab="notifications">🔔 Reminders</button>
        <button class="settings-tab-btn ${activeTab === 'ai' ? 'active' : ''}" data-tab="ai">🔥 AI Companion</button>
        <button class="settings-tab-btn ${activeTab === 'updates' ? 'active' : ''}" data-tab="updates">📜 Updates</button>
        <button class="settings-tab-btn ${activeTab === 'links' ? 'active' : ''}" data-tab="links">🔗 Broken Links</button>
      </div>

      <!-- Settings Content Panel -->
      <div class="card" id="settings-content-panel" style="padding: var(--sp-6); background: rgba(20,17,34,0.4);">
        <!-- Injected Dynamically -->
      </div>

    </div>
  `;

  // Render sub-tab content
  const panel = container.querySelector('#settings-content-panel');
  await renderTabContent(panel, project);

  // Tab buttons clicks
  container.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      container.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      await renderTabContent(panel, project);
    });
  });

  refreshIcons();
}

async function renderTabContent(panel, project) {
  panel.innerHTML = '';

  const projectPath = localStorage.getItem('forge-active-project-path') || 'Local IndexedDB Storage (Browser)';
  const theme = localStorage.getItem('forge-theme') || 'dark';
  const remindersEnabled = localStorage.getItem('forge-reminders-enabled') === 'true';
  const reminderTime = localStorage.getItem('forge-reminder-time') || '18:00';
  const companionEnabled = localStorage.getItem('forge-companion-enabled') !== 'false';
  const companionPersonality = localStorage.getItem('forge-companion-personality') || 'sage';

  switch (activeTab) {
    case 'project':
      panel.innerHTML = `
        <h3 style="color: #fff; margin-top: 0; margin-bottom: 24px; font-family: var(--font-heading);">General Universe Parameters</h3>
        <div style="display: flex; flex-direction: column; gap: 20px; max-width: 500px;">
          <div class="form-group">
            <label class="form-label">Universe Name</label>
            <input class="form-input" id="set-project-name" value="${escapeHtml(project.name || '')}" placeholder="e.g. My Game Universe" />
          </div>
          <div class="form-group">
            <label class="form-label">Genre / Game Type</label>
            <input class="form-input" id="set-project-genre" value="${escapeHtml(project.settings?.genre || '')}" placeholder="e.g. Sci-Fi RPG" />
          </div>
          <div class="form-group">
            <label class="form-label">Universe Style Preset</label>
            <select class="form-input" id="set-project-style" style="background: rgba(0,0,0,0.3); border-color: rgba(255,255,255,0.05); color: #fff;">
              <option value="story" ${project.settings?.style === 'story' ? 'selected' : ''}>Story Writer Style</option>
              <option value="dnd" ${project.settings?.style === 'dnd' ? 'selected' : ''}>D&D Campaign Planner Style</option>
              <option value="gamedev" ${project.settings?.style === 'gamedev' ? 'selected' : ''}>Game Dev Companion Style</option>
            </select>
          </div>
          <button class="btn btn-primary" id="save-project-btn" style="align-self: flex-start; margin-top: var(--sp-2);">Save Changes</button>
        </div>
      `;

      panel.querySelector('#save-project-btn').addEventListener('click', async () => {
        const name = panel.querySelector('#set-project-name').value.trim();
        const genre = panel.querySelector('#set-project-genre').value.trim();
        const style = panel.querySelector('#set-project-style').value;
        if (!name) { showToast('Name cannot be empty', 'error'); return; }

        project.name = name;
        if (!project.settings) project.settings = {};
        project.settings.genre = genre;
        const oldStyle = project.settings.style;
        project.settings.style = style;

        await db.saveProject(project);
        const dashTitle = document.getElementById('dash-title');
        if (dashTitle) dashTitle.textContent = name;
        const dashTag = document.getElementById('dash-tagline');
        if (dashTag) dashTag.textContent = genre;

        if (oldStyle !== style) {
          showToast('Project style updated! Seeding new databases...', 'info');
          const styleConf = getStyleConfig(style);
          
          // Seed missing schemas for the new style
          const schemas = styleConf.getSchemas(project.id);
          const existingSchemas = await db.getSchemas(project.id);
          for (const s of schemas) {
            if (!existingSchemas.some(es => es.id === s.id)) {
              await db.saveSchema(s);
            }
          }

          const customAccent = localStorage.getItem('forge-custom-accent');
          if (!customAccent) {
            applyCustomAccent(styleConf.accent);
          }
          await renderSidebar();
          showToast(`Style preset switched to ${styleConf.name}!`, 'success');
        } else {
          showToast('General settings saved!', 'success');
        }
      });
      break;

    case 'visuals':
      panel.innerHTML = `
        <h3 style="color: #fff; margin-top: 0; margin-bottom: 24px; font-family: var(--font-heading);">Visual Appearance</h3>
        
        <div class="form-group" style="margin-bottom: 24px;">
          <label class="form-label">Theme Mode</label>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: var(--sp-2);">
            <button class="theme-select-btn ${theme === 'dark' ? 'active' : ''}" data-theme="dark" style="background:#0a0812; color:#fff; border: 1px solid rgba(255,255,255,0.05); padding: 16px; border-radius: 8px; cursor: pointer;">
              <div style="font-weight: 600; font-size: 0.85rem;">Dark Mode</div>
              <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">Monochrome Slate</div>
            </button>
            <button class="theme-select-btn ${theme === 'light' ? 'active' : ''}" data-theme="light" style="background:#f7f6f9; color:#1a1628; border: 1px solid rgba(0,0,0,0.05); padding: 16px; border-radius: 8px; cursor: pointer;">
              <div style="font-weight: 600; font-size: 0.85rem;">Light Mode</div>
              <div style="font-size: 0.7rem; color: #718096; margin-top: 4px;">High Contrast Light</div>
            </button>
            <button class="theme-select-btn ${theme === 'cyberpunk' ? 'active' : ''}" data-theme="cyberpunk" style="background:#0f051d; color:#e5a93b; border: 1px solid rgba(229,169,59,0.1); padding: 16px; border-radius: 8px; cursor: pointer;">
              <div style="font-weight: 600; font-size: 0.85rem; color:#e5a93b;">Cyberpunk</div>
              <div style="font-size: 0.7rem; color: #a78bfa; margin-top: 4px;">Neon Amber & Purple</div>
            </button>
            <button class="theme-select-btn ${theme === 'obsidian' ? 'active' : ''}" data-theme="obsidian" style="background:#050505; color:#888; border: 1px solid rgba(255,255,255,0.03); padding: 16px; border-radius: 8px; cursor: pointer;">
              <div style="font-weight: 600; font-size: 0.85rem; color:#eee;">Obsidian</div>
              <div style="font-size: 0.7rem; color: #555; margin-top: 4px;">Pure Minimalist Black</div>
            </button>
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 24px; border-top: 1px solid var(--border-subtle); padding-top: var(--sp-4);">
          <label class="form-label">Highlight Accent Color</label>
          <p style="color: var(--text-muted); font-size: 0.8rem; margin: 4px 0 16px 0;">Customize your highlight accents, active buttons, borders, and logo style.</p>
          <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
            <!-- Color presets -->
            <div style="display: flex; gap: 8px;">
              ${[
                { hex: '#e5a93b', name: 'Amber' },
                { hex: '#a78bfa', name: 'Purple' },
                { hex: '#10b981', name: 'Emerald' },
                { hex: '#3b82f6', name: 'Blue' },
                { hex: '#ef4444', name: 'Red' }
              ].map(color => `
                <button class="accent-preset-btn" data-color="${color.hex}" title="${color.name}"
                  style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; background-color: ${color.hex}; cursor: pointer; transition: transform 0.1s; display: flex; align-items: center; justify-content: center;"
                  onmouseenter="this.style.transform='scale(1.15)'"
                  onmouseleave="this.style.transform=''"
                ></button>
              `).join('')}
            </div>
            
            <!-- Custom color picker -->
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 0.8rem; color: var(--text-secondary);">Custom:</span>
              <input type="color" id="accent-custom-picker" value="${localStorage.getItem('forge-custom-accent') || '#e5a93b'}" 
                style="border: none; background: transparent; width: 36px; height: 32px; cursor: pointer; border-radius: 4px;" />
            </div>

            <!-- Reset -->
            <button class="btn btn-secondary btn-sm" id="accent-reset-btn" style="margin-left: auto;">Reset to Default</button>
          </div>
        </div>
      `;

      panel.querySelectorAll('.theme-select-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          panel.querySelectorAll('.theme-select-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const chosenTheme = btn.dataset.theme;
          await db.saveProjectSetting('forge-theme', chosenTheme);
          
          // Apply globally to HTML element
          document.documentElement.setAttribute('data-theme', chosenTheme);
          showToast(`Theme switched to ${chosenTheme}`, 'success');
        });
      });

      // Accent color handler wire up
      const accentPresets = panel.querySelectorAll('.accent-preset-btn');
      const customPicker = panel.querySelector('#accent-custom-picker');
      const resetBtn = panel.querySelector('#accent-reset-btn');

      const activeColor = localStorage.getItem('forge-custom-accent');
      if (activeColor) {
        customPicker.value = activeColor;
        accentPresets.forEach(b => {
          if (b.dataset.color.toLowerCase() === activeColor.toLowerCase()) {
            b.style.borderColor = 'var(--text-primary)';
          }
        });
      }

      accentPresets.forEach(btn => {
        btn.addEventListener('click', async () => {
          const color = btn.dataset.color;
          await db.saveProjectSetting('forge-custom-accent', color);
          applyCustomAccent(color);
          
          // Update visual borders
          accentPresets.forEach(b => b.style.borderColor = 'transparent');
          btn.style.borderColor = 'var(--text-primary)';
          customPicker.value = color;
          showToast('Accent color updated!', 'success');
        });
      });

      customPicker.addEventListener('change', async (e) => {
        const color = e.target.value;
        await db.saveProjectSetting('forge-custom-accent', color);
        applyCustomAccent(color);
        
        // Remove preset borders
        accentPresets.forEach(b => b.style.borderColor = 'transparent');
        showToast('Custom accent color applied!', 'success');
      });

      resetBtn.addEventListener('click', async () => {
        await db.saveProjectSetting('forge-custom-accent', null);
        applyCustomAccent(null);
        accentPresets.forEach(b => b.style.borderColor = 'transparent');
        customPicker.value = '#e5a93b';
        showToast('Accent color reset to theme default.', 'info');
      });
      break;

    case 'storage':
      panel.innerHTML = `
        <h3 style="color: #fff; margin-top: 0; margin-bottom: 24px; font-family: var(--font-heading);">Storage, Directory & Cloud Sync</h3>
        
        <div style="display: flex; flex-direction: column; gap: 24px;">
          
          <!-- File path detail -->
          <div>
            <h4 style="color: var(--text-secondary); margin: 0 0 8px 0; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;">Active Project File Directory</h4>
            <div style="display: flex; align-items: center; gap: 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 12px 16px;">
              <div style="color: var(--accent-primary); font-size: 1.5rem;"><i data-lucide="folder-git"></i></div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-primary); word-break: break-all; user-select: text;">${escapeHtml(projectPath)}</div>
              </div>
            </div>
          </div>

          <!-- Unload file project -->
          <div style="border-top: 1px solid var(--border-subtle); padding-top: var(--sp-4);">
            <h4 style="color:#fff; margin: 0 0 8px 0; font-size: 0.95rem;">Unload Project</h4>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0 0 16px 0; line-height: 1.5;">
              Unloading will save the current state to the file on disk and return you to the launch screen. Your files stay safe on your computer.
            </p>
            <button class="btn btn-secondary" id="close-project-btn" style="border-color: var(--accent-red); color: var(--accent-red); background: transparent;"><i data-lucide="log-out" style="width:14px;height:14px;margin-right:6px;"></i> Close Project & Return to Hub</button>
          </div>

          <!-- Cloud storage mockup -->
          <div style="border-top: 1px solid var(--border-subtle); padding-top: var(--sp-4);">
            <h4 style="color:#fff; margin: 0 0 4px 0; font-size: 0.95rem; display: flex; align-items: center; gap: 8px;">
              Cloud Storage Backup <span style="font-size: 0.7rem; background: rgba(59, 130, 246, 0.2); color: #60a5fa; padding: 2px 8px; border-radius: 10px;">FUTURE MAJOR UPDATE</span>
            </h4>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0 0 16px 0; line-height: 1.5;">
              Sign in with your Forge Cloud account to sync databases and canvases automatically across devices.
            </p>
            <div style="display: flex; gap: 12px; max-width: 400px;">
              <input class="form-input" placeholder="Enter email..." disabled style="background: rgba(255,255,255,0.02); color: var(--text-muted);" />
              <button class="btn btn-primary" disabled style="opacity: 0.5;">Sign In</button>
            </div>
          </div>

        </div>
      `;

      panel.querySelector('#close-project-btn').addEventListener('click', async () => {
        if (confirm('Are you sure you want to close this project and return to the main selector Hub? All changes will be saved to your file.')) {
          // Force save one final time
          await db.triggerFileAutosave();
          await db.closeProject();
          navigate('hub');
          // Reload sidebar to wipe lists/hide sidebar
          await renderSidebar();
        }
      });
      break;

    case 'notifications': {
      const remindersEnabled = localStorage.getItem('forge-reminders-enabled') === 'true';
      const reminderTime = localStorage.getItem('forge-reminder-time') || '09:00';

      panel.innerHTML = `
        <h3 style="color: #fff; margin-top: 0; margin-bottom: 24px; font-family: var(--font-heading);">Reminders & Work Notifications</h3>
        
        <div style="display: flex; flex-direction: column; gap: 24px; max-width: 500px;">
          <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.02); padding: 16px; border-radius: 8px; border: 1px solid var(--border-subtle);">
            <div>
              <div style="font-weight: 600; color: #fff; font-size: 0.9rem;">Daily Reminders</div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">Receive a daily OS notification to check on your universe.</div>
            </div>
            <label class="switch" style="position: relative; display: inline-block; width: 44px; height: 24px;">
              <input type="checkbox" id="set-reminders-toggle" ${remindersEnabled ? 'checked' : ''} style="opacity:0; width:0; height:0;" />
              <span class="slider" style="position: absolute; cursor: pointer; inset: 0; background-color: rgba(255,255,255,0.1); border-radius: 24px; transition: .4s;"></span>
            </label>
          </div>

          <div class="form-group" id="reminder-time-group" style="display: ${remindersEnabled ? 'block' : 'none'};">
            <label class="form-label">Reminder Time</label>
            <input type="time" class="form-input" id="set-reminder-time" value="${escapeHtml(reminderTime)}" style="background: rgba(0,0,0,0.3); border-color: rgba(255,255,255,0.05); color: #fff; width: 140px; text-align: center;" />
          </div>

          <div style="display: flex; gap: 12px; margin-top: var(--sp-2);">
            <button class="btn btn-secondary" id="test-notif-btn">Test Notification Toast</button>
            <button class="btn btn-primary" id="save-notif-btn">Save Preferences</button>
          </div>
        </div>
      `;

      const toggle = panel.querySelector('#set-reminders-toggle');
      const timeGroup = panel.querySelector('#reminder-time-group');
      toggle.addEventListener('change', () => {
        timeGroup.style.display = toggle.checked ? 'block' : 'none';
      });

      panel.querySelector('#save-notif-btn').addEventListener('click', async () => {
        const enabled = toggle.checked;
        const time = panel.querySelector('#set-reminder-time').value;
        
        await db.saveProjectSettings({
          'forge-reminders-enabled': enabled ? 'true' : 'false',
          'forge-reminder-time': time
        });
        
        if (enabled && !window.electronAPI && Notification.permission !== 'granted') {
          Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
              showToast('Notifications enabled!', 'success');
            } else {
              showToast('Notification permission denied.', 'warning');
            }
          });
        } else {
          showToast('Notification settings saved!', 'success');
        }
      });

      panel.querySelector('#test-notif-btn').addEventListener('click', () => {
        if (window.electronAPI) {
          window.electronAPI.showNotification('Forge Reminder', `Ignis awaits your return to work on "${project.name}"!`);
        } else {
          new Notification('Forge Reminder', { body: `Ignis awaits your return to work on "${project.name}"!` });
        }
      });
      break;
    }

    case 'ai': {
      const companionEnabled = localStorage.getItem('forge-companion-enabled') === 'true';
      const companionPersonality = localStorage.getItem('forge-companion-personality') || 'sage';
      const currentApiKey = localStorage.getItem('forge-gemini-key') || '';
      const aiProvider = localStorage.getItem('forge-ai-provider') || 'gemini';
      const ollamaModel = localStorage.getItem('forge-ollama-model') || 'llama3';
      const ollamaUrl = localStorage.getItem('forge-ollama-url') || 'http://localhost:11434';

      panel.innerHTML = `
        <h3 style="color: #fff; margin-top: 0; margin-bottom: 8px; font-family: var(--font-heading);">Ignis — The Creative AI Companion</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.5; margin: 0 0 24px 0;">
          Ignis is a contextual assistant that learns your creative design patterns and database schemas, generating fitting mechanics, lore, and connection ideas.
        </p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-6); align-items: start;">
          
          <!-- Left Panel: AI Config -->
          <div style="display: flex; flex-direction: column; gap: var(--sp-4);">
            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.02); padding: 12px var(--sp-4); border-radius: 8px; border: 1px solid var(--border-subtle);">
              <span style="font-weight: 600; font-size: 0.85rem; color:#fff;">Enable Ignis Companion</span>
              <label class="switch" style="position: relative; display: inline-block; width: 44px; height: 24px;">
                <input type="checkbox" id="set-companion-toggle" ${companionEnabled ? 'checked' : ''} style="opacity:0; width:0; height:0;" />
                <span class="slider" style="position: absolute; cursor: pointer; inset: 0; background-color: rgba(255,255,255,0.1); border-radius: 24px; transition: .4s;"></span>
              </label>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.02); padding: 12px var(--sp-4); border-radius: 8px; border: 1px solid var(--border-subtle);">
              <div>
                <span style="font-weight: 600; font-size: 0.85rem; color:#fff; display: block;">Narrative Continuity Engine</span>
                <span style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px; display: block;">Scan for plot/lore conflicts, display the Continuity tab, and show alert popups.</span>
              </div>
              <label class="switch" style="position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0;">
                <input type="checkbox" id="set-continuity-enabled-toggle" ${localStorage.getItem('forge-continuity-enabled') !== 'false' ? 'checked' : ''} style="opacity:0; width:0; height:0;" />
                <span class="slider" style="position: absolute; cursor: pointer; inset: 0; background-color: rgba(255,255,255,0.1); border-radius: 24px; transition: .4s;"></span>
              </label>
            </div>

            <!-- AI Model Provider Dropdown -->
            <div class="form-group" style="display: ${companionEnabled ? 'block' : 'none'};" id="comp-provider-group">
              <label class="form-label">AI Model Provider</label>
              <select class="form-select" id="set-ai-provider" style="width:100%; padding: 8px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: 6px; color:#fff; cursor:pointer;">
                <option value="gemini" ${aiProvider === 'gemini' ? 'selected' : ''}>Google Gemini API (Cloud)</option>
                <option value="ollama" ${aiProvider === 'ollama' ? 'selected' : ''}>Local Ollama (Llama/Phi/Local)</option>
              </select>
            </div>

            <div class="form-group" style="display: ${companionEnabled ? 'block' : 'none'};" id="comp-personality-group">
              <label class="form-label">Companion Personality Type</label>
              <select class="form-select" id="set-companion-personality" style="width:100%; padding: 8px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: 6px; color:#fff; cursor:pointer;">
                <option value="sage" ${companionPersonality === 'sage' ? 'selected' : ''}>Creative Sage (Thematic & Poetic Ideas)</option>
                <option value="strategist" ${companionPersonality === 'strategist' ? 'selected' : ''}>Analytical Strategist (Gameplay Balance & Systems)</option>
                <option value="historian" ${companionPersonality === 'historian' ? 'selected' : ''}>Lore Historian (Consistency & World-Lore)</option>
                <option value="director" ${companionPersonality === 'director' ? 'selected' : ''}>Action Director (Combat Loops & Mechanics)</option>
              </select>
            </div>

            <!-- Custom Instructions -->
            <div class="form-group" style="display: ${companionEnabled ? 'block' : 'none'}; margin-top: var(--sp-2);" id="comp-instructions-group">
              <label class="form-label">Custom Instructions / Directives</label>
              <p style="color: var(--text-muted); font-size: 0.72rem; line-height: 1.3; margin: 0 0 6px 0;">
                Tell Ignis how to talk to you, what tone or format to use (e.g. "Keep answers under 2 paragraphs and bulleted"), or details about yourself.
              </p>
              <textarea class="form-input" id="set-companion-instructions" rows="4" placeholder="e.g. Keep replies extremely concise, under 2 paragraphs. Focus on world-building lore first..." style="background: rgba(0,0,0,0.3); border-color: rgba(255,255,255,0.05); color: #fff; resize: vertical; min-height: 80px; font-size: 0.8rem; line-height: 1.4; font-family: var(--font-body); width: 100%; box-sizing: border-box; padding: var(--sp-2); border-radius: 6px;">${escapeHtml(localStorage.getItem('forge-companion-instructions') || '')}</textarea>
            </div>

            <!-- Gemini Key Config -->
            <div id="gemini-config-section" style="display: ${companionEnabled && aiProvider === 'gemini' ? 'block' : 'none'}; padding-top: var(--sp-2);">
              <h4 style="color: #fff; margin: 0 0 8px 0; font-size: 0.9rem; font-weight: var(--fw-semibold);">Google Gemini Configuration</h4>
              <p style="color: var(--text-muted); font-size: 0.78rem; line-height: 1.4; margin: 0 0 12px 0;">
                Connect to a live Gemini model to make Ignis a true collaborative partner. Get an API key from 
                <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color: var(--accent-primary); text-decoration: underline;">Google AI Studio</a>.
              </p>
              <div class="form-group">
                <label class="form-label" style="font-size: 0.72rem;">Gemini API Key</label>
                <input type="password" class="form-input" id="set-gemini-key" value="${escapeHtml(currentApiKey)}" placeholder="Paste AI Studio API Key..." style="background: rgba(0,0,0,0.3); border-color: rgba(255,255,255,0.05); color: #fff;" />
              </div>
            </div>

            <!-- Ollama Config -->
            <div id="ollama-config-section" style="display: ${companionEnabled && aiProvider === 'ollama' ? 'block' : 'none'}; padding-top: var(--sp-2);">
              <h4 style="color: #fff; margin: 0 0 8px 0; font-size: 0.9rem; font-weight: var(--fw-semibold);">Local Ollama Configuration</h4>
              <p style="color: var(--text-muted); font-size: 0.78rem; line-height: 1.4; margin: 0 0 12px 0;">
                Connect to your locally running Ollama instance. Ensure Ollama is running and has the requested model downloaded.
              </p>
              <div class="form-group" style="margin-bottom: var(--sp-2);">
                <label class="form-label" style="font-size: 0.72rem;">Ollama Host URL</label>
                <input type="text" class="form-input" id="set-ollama-url" value="${escapeHtml(ollamaUrl)}" placeholder="http://localhost:11434" style="background: rgba(0,0,0,0.3); border-color: rgba(255,255,255,0.05); color: #fff;" />
              </div>
              <div class="form-group">
                <label class="form-label" style="font-size: 0.72rem;">Model Name</label>
                <input type="text" class="form-input" id="set-ollama-model" value="${escapeHtml(ollamaModel)}" placeholder="llama3" style="background: rgba(0,0,0,0.3); border-color: rgba(255,255,255,0.05); color: #fff;" />
              </div>
            </div>

            <button class="btn btn-primary" id="save-ai-btn" style="align-self: flex-start; margin-top: 8px;">Save AI Preferences</button>
          </div>

          <!-- Right Panel: Interactive Playground -->
          <div class="card" style="padding: var(--sp-4); background: rgba(0,0,0,0.3); display: flex; flex-direction: column; height: 340px; border-color: rgba(229,169,59,0.15);">
            <div style="font-size: 0.75rem; font-family: var(--font-hud); color: var(--accent-primary); letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
              <span>Settings Ignis Playground</span>
              <span id="ignis-status"></span>
            </div>

            <div id="ignis-chat-messages" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px; font-size: 0.8rem; line-height: 1.4; scrollbar-width: thin; margin-bottom: 12px;">
              <div style="color: var(--accent-primary); font-weight: 600;">Ignis:</div>
              <div style="color: var(--text-secondary); background: rgba(229,169,59,0.05); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(229,169,59,0.05);">
                Greetings, Creator. I am Ignis. I am learning from your databases and canvases. What part of your universe ("${project.name}") shall we refine today?
              </div>
            </div>

            <div style="display: flex; gap: 8px;">
              <input class="form-input" id="ignis-chat-input" placeholder="Type a message or suggestion request..." style="font-size:0.8rem; background: rgba(0,0,0,0.4);" />
              <button class="btn btn-primary" id="ignis-chat-send" style="padding: 0 16px; background: var(--accent-primary); border-color: var(--accent-primary); color: #000;"><i data-lucide="send" style="width:14px;height:14px;"></i></button>
            </div>
          </div>

          </div>
      `;

      const aiToggle = panel.querySelector('#set-companion-toggle');
      const personalityGroup = panel.querySelector('#comp-personality-group');
      const instructionsGroup = panel.querySelector('#comp-instructions-group');
      const providerGroup = panel.querySelector('#comp-provider-group');
      const geminiSection = panel.querySelector('#gemini-config-section');
      const ollamaSection = panel.querySelector('#ollama-config-section');
      const statusText = panel.querySelector('#ignis-status');

      const updatePlaygroundStatus = () => {
        const enabled = aiToggle.checked;
        const prov = panel.querySelector('#set-ai-provider') ? panel.querySelector('#set-ai-provider').value : 'gemini';
        const geminiKeyVal = panel.querySelector('#set-gemini-key') ? panel.querySelector('#set-gemini-key').value.trim() : '';
        const ollamaModelVal = panel.querySelector('#set-ollama-model') ? panel.querySelector('#set-ollama-model').value.trim() : 'llama3';
        
        if (!enabled) {
          statusText.style.color = 'var(--text-muted)';
          statusText.textContent = '○ Disabled';
        } else {
          if (prov === 'ollama') {
            statusText.style.color = 'var(--accent-green)';
            statusText.textContent = `● Local Ollama (${ollamaModelVal})`;
          } else {
            statusText.style.color = geminiKeyVal ? 'var(--accent-green)' : 'var(--accent-secondary)';
            statusText.textContent = geminiKeyVal ? `● Live Gemini (gemini-2.5-flash)` : '● Gemini Simulator';
          }
        }
      };

      // Initial status run
      updatePlaygroundStatus();
      
      aiToggle.addEventListener('change', async () => {
        const enabled = aiToggle.checked;
        const prov = panel.querySelector('#set-ai-provider').value;
        personalityGroup.style.display = enabled ? 'block' : 'none';
        instructionsGroup.style.display = enabled ? 'block' : 'none';
        providerGroup.style.display = enabled ? 'block' : 'none';
        geminiSection.style.display = (enabled && prov === 'gemini') ? 'block' : 'none';
        ollamaSection.style.display = (enabled && prov === 'ollama') ? 'block' : 'none';
        updatePlaygroundStatus();

        if (enabled && !localStorage.getItem('forge-ollama-prompted')) {
          localStorage.setItem('forge-ollama-prompted', 'true');
          const running = await checkOllamaRunning();
          if (!running) {
            showOllamaInstallPrompt();
          }
        }
      });

      panel.querySelector('#set-ai-provider').addEventListener('change', async () => {
        const enabled = aiToggle.checked;
        const prov = panel.querySelector('#set-ai-provider').value;
        geminiSection.style.display = (enabled && prov === 'gemini') ? 'block' : 'none';
        ollamaSection.style.display = (enabled && prov === 'ollama') ? 'block' : 'none';
        updatePlaygroundStatus();

        if (enabled && prov === 'ollama' && !localStorage.getItem('forge-ollama-prompted')) {
          localStorage.setItem('forge-ollama-prompted', 'true');
          const running = await checkOllamaRunning();
          if (!running) {
            showOllamaInstallPrompt();
          }
        }
      });

      panel.querySelector('#set-gemini-key').addEventListener('input', updatePlaygroundStatus);
      panel.querySelector('#set-ollama-model').addEventListener('input', updatePlaygroundStatus);

      panel.querySelector('#save-ai-btn').addEventListener('click', async () => {
        const keyVal = panel.querySelector('#set-gemini-key').value.trim();
        const instructionsVal = panel.querySelector('#set-companion-instructions').value.trim();
        const provVal = panel.querySelector('#set-ai-provider').value;
        const oUrlVal = panel.querySelector('#set-ollama-url').value.trim() || 'http://localhost:11434';
        const oModelVal = panel.querySelector('#set-ollama-model').value.trim() || 'llama3';
        const contEnabled = panel.querySelector('#set-continuity-enabled-toggle').checked;

        await db.saveProjectSettings({
          'forge-companion-enabled': aiToggle.checked ? 'true' : 'false',
          'forge-companion-personality': panel.querySelector('#set-companion-personality').value,
          'forge-companion-instructions': instructionsVal,
          'forge-gemini-key': keyVal,
          'forge-gemini-model': 'gemini-2.5-flash',
          'forge-ai-provider': provVal,
          'forge-ollama-url': oUrlVal,
          'forge-ollama-model': oModelVal
        });
        
        localStorage.setItem('forge-continuity-enabled', contEnabled ? 'true' : 'false');
        localStorage.setItem('forge-continuity-popup-enabled', contEnabled ? 'true' : 'false'); // Sync popup state as well
        
        // Instantly refresh the sidebar layout to hide/show the tab
        await renderSidebar();
        
        updatePlaygroundStatus();
        showToast('AI Companion preferences saved!', 'success');
        
        // Notify the global drawer to update its state
        window.dispatchEvent(new CustomEvent('ai-preferences-updated'));
      });

      // Chat Simulator Logic
      const chatInput = panel.querySelector('#ignis-chat-input');
      const chatMessages = panel.querySelector('#ignis-chat-messages');
      const chatSend = panel.querySelector('#ignis-chat-send');
      const localHistory = [];

      const appendMessage = (sender, text, isAI = false) => {
        const msgDiv = document.createElement('div');
        msgDiv.style.marginTop = '4px';
        const formatted = parseMarkdown(text);
        msgDiv.innerHTML = `
          <div style="color: ${isAI ? 'var(--accent-primary)' : 'var(--accent-cyan)'}; font-weight: 600;">${sender}:</div>
          <div style="color: var(--text-secondary); background: ${isAI ? 'rgba(229,169,59,0.05)' : 'rgba(56,189,248,0.05)'}; padding: 8px 12px; border-radius: 8px; border: 1px solid ${isAI ? 'rgba(229,169,59,0.05)' : 'rgba(56,189,248,0.05)'}; font-size: 0.85rem;">
            ${formatted}
          </div>
        `;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      };

      const handleSend = async () => {
        const txt = chatInput.value.trim();
        if (!txt) return;
        chatInput.value = '';
        appendMessage('You', txt, false);
        localHistory.push({ sender: 'You', text: txt });

        if (!aiToggle.checked) {
          setTimeout(() => {
            appendMessage('Ignis', 'Companion is currently disabled. Please enable it in the preferences to chat.', true);
          }, 600);
          return;
        }

        // Show thinking indicator
        const indicator = document.createElement('div');
        indicator.id = 'settings-ignis-thinking';
        indicator.innerHTML = `
          <div style="color: var(--accent-primary); font-weight: 600;">Ignis:</div>
          <div style="color: var(--text-muted); font-size: 0.8rem; font-style: italic; margin-top: 4px;">Thinking... 🔥</div>
        `;
        chatMessages.appendChild(indicator);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        try {
          const prov = localStorage.getItem('forge-ai-provider') || 'gemini';
          const keyVal = localStorage.getItem('forge-gemini-key');
          const context = await getProjectContext();
          let reply = '';

          if (prov === 'ollama' || keyVal) {
            // Live Call (Ollama or Gemini)
            reply = await askGemini(txt, localHistory, keyVal || '', context);
          } else {
            // Simulated Response
            await new Promise(r => setTimeout(r, 600));
            
            // Basic offline response generator based on keywords
            const activeProj = await db.getActiveProject();
            const schemas = await db.getSchemas(activeProj.id);
            const pages = await db.getPages(activeProj.id);
            
            const lmsg = txt.toLowerCase();
            if (lmsg.includes('schema') || lmsg.includes('database')) {
              reply = `I see you have created ${schemas.length} databases (${schemas.map(s => s.name).join(', ') || 'none yet'}). If you are writing a **${activeProj.settings?.genre || 'universe'}**, I suggest introducing a "Factions" database or a "Magic System" database.`;
            } else if (lmsg.includes('character') || lmsg.includes('lore')) {
              reply = `Your project lists ${pages.length} entry pages. Fleshing out their backstories and mapping their motivations to locations in your lore increases narrative coherence. Shall we map an event?`;
            } else {
              const pers = panel.querySelector('#set-companion-personality').value;
              if (pers === 'sage') {
                reply = `Interesting query, Creator. The genre is "${activeProj.settings?.genre || 'custom'}". I recommend introducing a core conflict, perhaps a mysterious element that bridges your lore databases. What theme should bind them?`;
              } else if (pers === 'strategist') {
                reply = `Let's look at the systemic design. In a "${activeProj.settings?.genre || 'custom'}" type universe, we must balance active player mechanics against character stats. Make sure your Stat Blocks have clear values.`;
              } else if (pers === 'historian') {
                reply = `I suggest checking your timeline events. Adding timeline events helps map character ages and faction disputes so your world history does not clash.`;
              } else {
                reply = `Let's focus on combat action. Designing abilities and grunts/bosses that interact (e.g. dodging AoE patterns) makes character kits feel robust. Let's spawn an Ability Card to sketch it out.`;
              }
            }
          }

          // Intercept forge-action
          const actionRegex = /<forge-action>([\s\S]*?)<\/forge-action>/g;
          const match = actionRegex.exec(reply);
          if (match) {
            try {
              const actionData = JSON.parse(cleanActionJson(match[1]));
              const executionNotice = await executeForgeAction(actionData);
              reply = reply.replace(actionRegex, '').trim() + executionNotice;
            } catch (err) {
              console.error('Failed to execute forge-action:', err);
              reply = reply.replace(actionRegex, '').trim();
            }
          }

          indicator.remove();
          appendMessage('Ignis', reply, true);
          localHistory.push({ sender: 'Ignis', text: reply });
        } catch (err) {
          indicator.remove();
          const prov = localStorage.getItem('forge-ai-provider') || 'gemini';
          let userMsg = `I apologize, Creator. An error occurred: **${err.message}**. If you are using the Gemini API, please verify that your API key is correct in the Settings.`;
          
          if (prov === 'ollama' && (err.message.toLowerCase().includes('failed to fetch') || err.message.toLowerCase().includes('networkerror') || err.message.toLowerCase().includes('http error') || err.message.toLowerCase().includes('fetch') || err.message.toLowerCase().includes('all model attempts failed'))) {
            userMsg = `I apologize, Creator. It seems I cannot connect to your local Ollama server (usually running at **http://localhost:11434**).\n\nIf you do not have Ollama installed yet, you can download and install it from their official website:\n\n👉 **[Download Ollama (ollama.com)](https://ollama.com)**\n\nAfter installing, start the Ollama application and download a model (like **llama3** or **phi3**) by opening your terminal/command prompt and running:\n\`\`\`bash\nollama run llama3\n\`\`\`\n\nIf Ollama is already installed, please ensure the Ollama background service is currently running. You can check your active model and URL configurations under Settings ⚙️.`;
          } else if (err.status === 429 || err.message.includes('429') || err.message.toLowerCase().includes('too many requests') || err.message.toLowerCase().includes('rate limit')) {
            userMsg = `I apologize, Creator. It seems I am receiving a **Rate Limit Exceeded (429 / Too Many Requests)** error from the Gemini API. This happens when your Gemini free tier API quota is reached. Please wait a minute before trying again, or consider switching to a local Ollama model in Settings.`;
          }
          appendMessage('Ignis', userMsg, true);
        }
      };

      chatSend.addEventListener('click', handleSend);
      chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleSend(); });

      break;
    }

    case 'updates': {
      let currentVersion = 'v0.1.5-alpha';
      if (window.electronAPI && window.electronAPI.getAppVersion) {
        try {
          const v = await window.electronAPI.getAppVersion();
          currentVersion = v.startsWith('v') ? v : `v${v}`;
        } catch (e) {
          console.warn('Failed to get app version:', e);
        }
      }
      const updateUrl = 'https://raw.githubusercontent.com/Mimicc007/forge-updates/main/updates.json';

      // Simple version compare: returns true if remote version is newer than current
      const isNewerVersion = (curr, rem) => {
        try {
          const clean = (v) => v.replace(/^v/, '').split('-')[0].split('.').map(Number);
          const [cMajor, cMinor, cPatch] = clean(curr);
          const [rMajor, rMinor, rPatch] = clean(rem);

          if (rMajor > cMajor) return true;
          if (rMajor < cMajor) return false;
          if (rMinor > cMinor) return true;
          if (rMinor < cMinor) return false;
          return rPatch > cPatch;
        } catch (e) {
          return false;
        }
      };

      panel.innerHTML = `
        <h3 style="color: #fff; margin-top: 0; margin-bottom: 8px; font-family: var(--font-heading);">Forge System Core & Updates</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.5; margin: 0 0 20px 0;">
          Verify your client build version, view release history, and check for new features or patches from the update stream.
        </p>

        <!-- Current Version Badge and Configuration -->
        <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 28px; background: rgba(10, 8, 18, 0.6); padding: var(--sp-5); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.05); box-shadow: 0 4px 20px rgba(0,0,0,0.3); align-items: center; justify-content: space-between; width: 100%; box-sizing: border-box;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div style="width: 42px; height: 42px; border-radius: 10px; background: rgba(229, 169, 59, 0.08); border: 1px solid rgba(229, 169, 59, 0.15); display: flex; align-items: center; justify-content: center; color: var(--accent-primary); font-size: 1.25rem; filter: drop-shadow(0 0 4px rgba(229,169,59,0.25));">
              <i data-lucide="cpu"></i>
            </div>
            <div>
              <div style="font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 2px; font-weight: 600;">Current App Instance</div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-family: var(--font-mono); font-size: 1.15rem; color: #fff; font-weight: 700; letter-spacing: -0.01em;">${currentVersion}</span>
                <span style="font-size: 0.7rem; background: rgba(16, 185, 129, 0.12); color: #10b981; padding: 2px 8px; border-radius: 10px; display: inline-flex; align-items: center; gap: 5px; font-weight: 600;">
                  <span style="width: 5px; height: 5px; border-radius: 50%; background: #10b981; display: inline-block;"></span> Active
                </span>
              </div>
            </div>
          </div>
          <div>
            <button class="btn btn-primary" id="check-updates-btn" style="background: var(--accent-primary); border-color: var(--accent-primary); color: #000; padding: 8px 20px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
              <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i> Check for Updates
            </button>
          </div>
        </div>

        <!-- Update Alert Banner (Appears dynamically) -->
        <div id="update-banner-container" style="margin-bottom: 24px; display: none;"></div>

        <!-- Timeline Container -->
        <div id="updates-timeline-loading" style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 20px 0;">
          Checking server files...
        </div>
        <div id="updates-timeline-container" style="display: flex; flex-direction: column; gap: var(--sp-4); max-height: 420px; overflow-y: auto; padding-right: 4px; scrollbar-width: thin; display: none;">
          <!-- Loaded dynamically -->
        </div>
      `;

      // Check updates click handler
      panel.querySelector('#check-updates-btn').addEventListener('click', () => {
        fetchUpdates();
      });

      const fetchUpdates = async () => {
        const loadingEl = panel.querySelector('#updates-timeline-loading');
        const containerEl = panel.querySelector('#updates-timeline-container');
        const bannerContainer = panel.querySelector('#update-banner-container');
        
        loadingEl.style.display = 'block';
        loadingEl.textContent = 'Checking server files...';
        containerEl.style.display = 'none';
        bannerContainer.style.display = 'none';

        try {
          const targetUrl = updateUrl;
          console.log(`Checking updates from: ${targetUrl}`);
          const resp = await fetch(targetUrl, { cache: 'no-store' });
          if (!resp.ok) throw new Error(`HTTP error ${resp.status}`);
          const list = await resp.json();
          if (!Array.isArray(list)) throw new Error('Invalid updates manifest format.');

          // Populate timeline list
          containerEl.innerHTML = list.map(update => `
            <div class="card" style="border-left: 4px solid var(${update.type === 'major' ? '--accent-purple' : '--accent-cyan'}); background: rgba(0,0,0,0.2); padding: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--sp-2);">
                <div>
                  <h4 style="font-size: 1.05rem; font-weight: var(--fw-semibold); color: var(--text-primary); margin: 0 0 4px 0;">${escapeHtml(update.title)}</h4>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">${escapeHtml(update.version)}</span>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(update.date)}</span>
                  </div>
                </div>
                ${update.type === 'major' ? `<span style="background: rgba(168, 85, 247, 0.2); color: var(--accent-purple); padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600;">MAJOR UPDATE</span>` : ''}
              </div>
              <ul style="list-style: none; padding: 0; margin: 8px 0 0 0; display: flex; flex-direction: column; gap: 6px; font-size: 0.8rem;">
                ${update.changes.map(change => `
                  <li style="display: flex; gap: 8px; align-items: flex-start; color: var(--text-secondary);">
                    <i data-lucide="check-circle-2" style="width: 14px; height: 14px; color: var(--accent-cyan); flex-shrink: 0; margin-top: 2px;"></i>
                    <span style="line-height: 1.4;">${escapeHtml(change)}</span>
                  </li>
                `).join('')}
              </ul>
            </div>
          `).join('');

          loadingEl.style.display = 'none';
          containerEl.style.display = 'flex';
          refreshIcons();

          // Check if a newer version is available
          const latestUpdate = list[0]; // manifest is sorted newest first
          if (latestUpdate && isNewerVersion(currentVersion, latestUpdate.version)) {
            // New version detected! Render update banner.
            bannerContainer.innerHTML = `
              <div class="card" style="border: 1px solid var(--accent-primary); background: rgba(229, 169, 59, 0.04); padding: 16px; display: flex; flex-direction: column; gap: 16px; animation: msgFadeIn 0.3s ease-out; width: 100%; box-sizing: border-box;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap;">
                  <div style="flex: 1; min-width: 250px;">
                    <h4 style="color: #fff; margin: 0 0 4px 0; font-size: 0.95rem;">New Update Available: ${escapeHtml(latestUpdate.version)}</h4>
                    <p style="color: var(--text-secondary); font-size: 0.8rem; margin: 0; line-height: 1.4; font-weight: 600;">
                      "${escapeHtml(latestUpdate.title)}" is ready to download and install.
                    </p>
                    <ul style="list-style: none; padding: 0; margin: 12px 0 0 0; display: flex; flex-direction: column; gap: 6px; font-size: 0.78rem;">
                      ${latestUpdate.changes.map(change => `
                        <li style="display: flex; gap: 8px; align-items: flex-start; color: var(--text-secondary);">
                          <i data-lucide="sparkles" style="width: 12px; height: 12px; color: var(--accent-primary); flex-shrink: 0; margin-top: 2px;"></i>
                          <span style="line-height: 1.35;">${escapeHtml(change)}</span>
                        </li>
                      `).join('')}
                    </ul>
                  </div>
                  <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px; min-width: 180px; align-self: flex-end;">
                    <button class="btn btn-primary" id="trigger-update-btn" style="background: var(--accent-primary); border-color: var(--accent-primary); color: #000; width: 100%; white-space: nowrap;">Download & Install Update</button>
                    <div id="update-download-progress-container" style="display: none; width: 100%;">
                      <div style="font-size: 0.72rem; color: var(--accent-primary); margin-bottom: 4px; display: flex; justify-content: space-between;">
                        <span>Downloading files...</span>
                        <span id="update-progress-pct">0%</span>
                      </div>
                      <div style="background: rgba(255,255,255,0.08); height: 6px; border-radius: 3px; overflow: hidden; width: 100%;">
                        <div id="update-progress-bar" style="background: var(--accent-primary); height: 100%; width: 0%; transition: width 0.15s ease-out;"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `;
            bannerContainer.style.display = 'block';
            refreshIcons();

            // Wire up download button
            const triggerBtn = bannerContainer.querySelector('#trigger-update-btn');
            const progressContainer = bannerContainer.querySelector('#update-download-progress-container');
            const progressPct = bannerContainer.querySelector('#update-progress-pct');
            const progressBar = bannerContainer.querySelector('#update-progress-bar');

            triggerBtn.addEventListener('click', async () => {
              triggerBtn.disabled = true;
              triggerBtn.textContent = 'Preparing Download...';
              
              if (window.electronAPI && window.electronAPI.downloadAndUpdate) {
                // Electron app - download and run the binary installer directly!
                progressContainer.style.display = 'block';
                
                window.electronAPI.onUpdateProgress((pct) => {
                  progressPct.textContent = `${pct}%`;
                  progressBar.style.width = `${pct}%`;
                  triggerBtn.textContent = `Downloading (${pct}%)`;
                });

                try {
                  const downloadUrl = latestUpdate.downloadUrl || '';
                  if (!downloadUrl) throw new Error('Download URL is empty in updates manifest.');
                  
                  await window.electronAPI.downloadAndUpdate(downloadUrl, latestUpdate.version);
                  showToast('Download complete. Launching installer...', 'success');
                  triggerBtn.textContent = 'Launching Installer...';
                } catch (err) {
                  showToast('Update failed: ' + err.message, 'error');
                  triggerBtn.disabled = false;
                  triggerBtn.textContent = 'Download & Install Update';
                  progressContainer.style.display = 'none';
                }
              } else {
                // Browser mode - open download URL in a new tab
                showToast('Downloading update file in browser...', 'info');
                window.open(latestUpdate.downloadUrl || '#');
                triggerBtn.disabled = false;
                triggerBtn.textContent = 'Download & Install Update';
              }
            });
          }
        } catch (err) {
          console.error('Failed to load updates:', err);
          loadingEl.style.display = 'block';
          loadingEl.innerHTML = `
            <div style="color: var(--accent-red); margin-bottom: 8px;">Failed to check updates: ${err.message}</div>
            <button class="btn btn-secondary btn-sm" id="updates-retry-btn">Retry Check</button>
          `;
          const retryBtn = loadingEl.querySelector('#updates-retry-btn');
          if (retryBtn) retryBtn.addEventListener('click', fetchUpdates);
        }
      };

      // Run check on tab render
      fetchUpdates();
      break;
    }

    case 'links': {
      panel.innerHTML = `
        <h3 style="color: #fff; margin-top: 0; margin-bottom: 8px; font-family: var(--font-heading);">Broken Links Detector</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.5; margin: 0 0 20px 0;">
          Scan and repair broken wiki links across your database pages and canvas note nodes.
        </p>

        <!-- Current Version Badge and Configuration -->
        <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 28px; background: rgba(10, 8, 18, 0.6); padding: var(--sp-5); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.05); box-shadow: 0 4px 20px rgba(0,0,0,0.3); align-items: center; justify-content: space-between; width: 100%; box-sizing: border-box;">
          <div>
            <div style="font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 2px; font-weight: 600;">Link Integrity Checker</div>
            <div style="font-size: 0.82rem; color: var(--text-secondary);" id="link-scan-status">Ready to scan.</div>
          </div>
          <div>
            <button class="btn btn-primary" id="run-link-scan-btn" style="background: var(--accent-primary); border-color: var(--accent-primary); color: #000; padding: 8px 20px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
              <i data-lucide="scan" style="width: 14px; height: 14px;"></i> Scan for Broken Links
            </button>
          </div>
        </div>

        <div id="link-scan-loading" style="display: none; color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 20px 0;">
          Scanning project entities...
        </div>

        <div id="link-scan-results" style="display: flex; flex-direction: column; gap: var(--sp-4); max-height: 480px; overflow-y: auto; padding-right: 4px; scrollbar-width: thin;">
          <!-- Results list -->
        </div>
      `;

      const scanBtn = panel.querySelector('#run-link-scan-btn');
      const loadingEl = panel.querySelector('#link-scan-loading');
      const resultsEl = panel.querySelector('#link-scan-results');
      const statusEl = panel.querySelector('#link-scan-status');

      // Scan logic
      const runScan = async () => {
        loadingEl.style.display = 'block';
        resultsEl.innerHTML = '';
        statusEl.textContent = 'Scanning...';
        scanBtn.disabled = true;

        try {
          const allPages = await db.getPages(project.id);
          const allNodes = await db.getAllNodes();
          const allTabs = await db.getAllTabs();
          
          const activePageIds = new Set(allPages.map(p => p.id));
          const brokenLinks = [];

          // 1. Scan Database Pages
          for (const page of allPages) {
            if (!page.content) continue;
            try {
              const delta = JSON.parse(page.content);
              if (delta && Array.isArray(delta.ops)) {
                delta.ops.forEach(op => {
                  if (op.attributes && op.attributes.link) {
                    const href = op.attributes.link;
                    if (href.startsWith('#/page/')) {
                      const targetId = href.replace('#/page/', '');
                      if (!activePageIds.has(targetId)) {
                        brokenLinks.push({
                          id: db.generateId(),
                          type: 'page',
                          sourceId: page.id,
                          sourceTitle: page.title || 'Untitled Page',
                          targetId: targetId,
                          linkText: typeof op.insert === 'string' ? op.insert : 'Wiki Link',
                          op: op
                        });
                      }
                    }
                  }
                });
              }
            } catch (_) {
              // Plain text / HTML fallback regex match
              const matches = [...page.content.matchAll(/#\/page\/([a-zA-Z0-9_-]+)/g)];
              matches.forEach(m => {
                const targetId = m[1];
                if (!activePageIds.has(targetId)) {
                  brokenLinks.push({
                    id: db.generateId(),
                    type: 'page_raw',
                    sourceId: page.id,
                    sourceTitle: page.title || 'Untitled Page',
                    targetId: targetId,
                    linkText: 'Wiki Link'
                  });
                }
              });
            }
          }

          // 2. Scan Canvas Nodes
          allNodes.forEach(node => {
            if (!node.data || !node.data.type) return;
            const tab = allTabs.find(t => t.id === node.tabId);
            const tabName = tab ? tab.name : 'Canvas Board';

            // Page link node cards
            if (node.data.type === 'pagelink' && node.data.content && node.data.content.pageId) {
              const targetId = node.data.content.pageId;
              if (!activePageIds.has(targetId)) {
                brokenLinks.push({
                  id: db.generateId(),
                  type: 'canvas_pagelink',
                  nodeId: node.id,
                  tabId: node.tabId,
                  sourceTitle: `Canvas: ${tabName} (Card: "${node.data.title || 'Unnamed'}")`,
                  targetId: targetId,
                  linkText: node.data.title || 'Linked Card'
                });
              }
            }

            // Rich text nodes
            if (node.data.type === 'richtext' && node.data.content && node.data.content.delta) {
              const htmlOrDelta = node.data.content.delta;
              
              // Canvas rich text is now saved as Quill delta JSON string
              try {
                const delta = JSON.parse(htmlOrDelta);
                if (delta && Array.isArray(delta.ops)) {
                  delta.ops.forEach(op => {
                    if (op.attributes && op.attributes.link) {
                      const href = op.attributes.link;
                      if (href.startsWith('#/page/')) {
                        const targetId = href.replace('#/page/', '');
                        if (!activePageIds.has(targetId)) {
                          brokenLinks.push({
                            id: db.generateId(),
                            type: 'canvas_richtext_delta',
                            nodeId: node.id,
                            tabId: node.tabId,
                            sourceTitle: `Canvas: ${tabName} (Note Node)`,
                            targetId: targetId,
                            linkText: typeof op.insert === 'string' ? op.insert : 'Wiki Link',
                            op: op
                          });
                        }
                      }
                    }
                  });
                }
              } catch (_) {
                // HTML format fallback (legacy notes)
                const matches = [...htmlOrDelta.matchAll(/href="#\/page\/([a-zA-Z0-9_-]+)"/g)];
                matches.forEach(m => {
                  const targetId = m[1];
                  if (!activePageIds.has(targetId)) {
                    // Try to find the exact text in anchor
                    const linkRegex = new RegExp(`<a href="#/page/${targetId}"[^>]*>([\\s\\S]*?)</a>`, 'g');
                    const linkMatch = linkRegex.exec(htmlOrDelta);
                    const linkText = linkMatch ? linkMatch[1] : 'Link';
                    
                    brokenLinks.push({
                      id: db.generateId(),
                      type: 'canvas_richtext_html',
                      nodeId: node.id,
                      tabId: node.tabId,
                      sourceTitle: `Canvas: ${tabName} (Note Node)`,
                      targetId: targetId,
                      linkText: linkText.replace(/<[^>]*>/g, '') // strip html tags
                    });
                  }
                });
              }
            }
          });

          loadingEl.style.display = 'none';
          scanBtn.disabled = false;
          
          if (brokenLinks.length === 0) {
            statusEl.textContent = 'Scan complete. All links healthy.';
            resultsEl.innerHTML = `
              <div class="card" style="border-left: 4px solid var(--accent-green); background: rgba(16, 185, 129, 0.03); padding: var(--sp-6); text-align: center; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: var(--sp-3);">
                <div style="font-size: 2.2rem; color: var(--accent-green);">✔</div>
                <h4 style="color: #fff; font-family: var(--font-heading); margin: 0; font-size: 1.05rem;">No Broken Links Found</h4>
                <p style="color: var(--text-muted); font-size: 0.82rem; max-width: 420px; line-height: 1.45; margin: 0;">
                  Your project's bi-directional links are completely integrated. All references point to active wiki entries.
                </p>
              </div>
            `;
            return;
          }

          statusEl.textContent = `Scan complete. Found ${brokenLinks.length} issues.`;
          
          // Render results
          resultsEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 12px;">
              ${brokenLinks.map(issue => {
                let editRoute = '#';
                if (issue.type === 'page' || issue.type === 'page_raw') {
                  editRoute = `#/page/${issue.sourceId}`;
                } else if (issue.tabId) {
                  editRoute = `#/workspace/${issue.tabId}`;
                }

                return `
                  <div class="card broken-link-card" style="border-left: 4px solid var(--accent-red); background: rgba(0,0,0,0.25); padding: var(--sp-4); display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;" data-issue-id="${issue.id}">
                    <div style="flex: 1; min-width: 250px;">
                      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: var(--sp-1);">
                        <a href="${editRoute}" style="font-size: 0.85rem; color: #fff; font-weight: 600; text-decoration: underline;" class="broken-link-location-link">${escapeHtml(issue.sourceTitle)}</a>
                        <span style="font-size: 0.65rem; background: rgba(239, 68, 68, 0.15); color: var(--accent-red); padding: 2px 6px; border-radius: 4px; font-weight: 600; font-family: var(--font-hud); text-transform: uppercase;">Broken</span>
                      </div>
                      <div style="font-size: 0.8rem; color: var(--text-secondary);">
                        Linked text <span style="font-family: var(--font-mono); color: var(--accent-red); background: rgba(239, 68, 68, 0.05); padding: 1px 4px; border-radius: 4px;">[[${escapeHtml(issue.linkText)}]]</span> points to missing entry <code style="font-size: 0.72rem; color: var(--text-muted); background: rgba(255,255,255,0.03); padding: 2px 4px; border-radius: 4px;">ID: ${escapeHtml(issue.targetId)}</code>
                      </div>
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      <select class="canvas-select broken-link-relink-select" style="font-size: 0.75rem; width: 160px; padding: var(--sp-1) var(--sp-2); background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); color: #fff; border-radius: 6px; cursor: pointer;">
                        <option value="">— Re-link to... —</option>
                        ${allPages.map(p => `<option value="${p.id}">${escapeHtml(p.title || 'Untitled')}</option>`).join('')}
                      </select>
                      <button class="btn btn-secondary btn-sm broken-link-unlink-btn" style="padding: 6px 12px; font-size: 0.75rem;">Unlink</button>
                      <button class="btn btn-sm broken-link-delete-btn" style="padding: 6px 12px; font-size: 0.75rem; border-color: rgba(239, 68, 68, 0.3); color: var(--accent-red); background: transparent;">Delete</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `;

          refreshIcons();

          // Bind Action Handlers
          brokenLinks.forEach(issue => {
            const card = resultsEl.querySelector(`[data-issue-id="${issue.id}"]`);
            if (!card) return;

            const unlinkBtn = card.querySelector('.broken-link-unlink-btn');
            const deleteBtn = card.querySelector('.broken-link-delete-btn');
            const relinkSelect = card.querySelector('.broken-link-relink-select');

            const executeRepair = async (action, replacementId = '') => {
              statusEl.textContent = 'Repairing...';
              
              if (issue.type === 'page') {
                const page = await db.getPage(issue.sourceId);
                if (page && page.content) {
                  try {
                    const delta = JSON.parse(page.content);
                    if (delta && Array.isArray(delta.ops)) {
                      delta.ops.forEach(op => {
                        if (op.attributes && op.attributes.link === `#/page/${issue.targetId}`) {
                          if (action === 'unlink') {
                            delete op.attributes.link;
                            if (Object.keys(op.attributes).length === 0) delete op.attributes;
                          } else if (action === 'relink') {
                            op.attributes.link = `#/page/${replacementId}`;
                          } else if (action === 'delete') {
                            op.insert = '';
                            delete op.attributes;
                          }
                        }
                      });
                      delta.ops = delta.ops.filter(op => op.insert !== '');
                      page.content = JSON.stringify(delta);
                      await db.savePage(page);
                      showToast('Link repaired successfully!', 'success');
                    }
                  } catch (e) {
                    console.error('Failed to repair Quill delta:', e);
                    showToast('Failed to repair link.', 'error');
                  }
                }
              } else if (issue.type === 'canvas_pagelink') {
                const node = await db.getNode(issue.nodeId);
                if (node && node.data && node.data.content) {
                  if (action === 'unlink') {
                    node.data.content.pageId = '';
                  } else if (action === 'relink') {
                    node.data.content.pageId = replacementId;
                    const pg = await db.getPage(replacementId);
                    if (pg) node.data.title = pg.title || 'Linked Card';
                  } else if (action === 'delete') {
                    await db.deleteNode(issue.nodeId);
                    showToast('Node card deleted.', 'info');
                    runScan();
                    return;
                  }
                  await db.saveNode(node);
                  showToast('Canvas card link repaired!', 'success');
                }
              } else if (issue.type === 'canvas_richtext_delta') {
                const node = await db.getNode(issue.nodeId);
                if (node && node.data && node.data.content && node.data.content.delta) {
                  try {
                    const delta = JSON.parse(node.data.content.delta);
                    if (delta && Array.isArray(delta.ops)) {
                      delta.ops.forEach(op => {
                        if (op.attributes && op.attributes.link === `#/page/${issue.targetId}`) {
                          if (action === 'unlink') {
                            delete op.attributes.link;
                            if (Object.keys(op.attributes).length === 0) delete op.attributes;
                          } else if (action === 'relink') {
                            op.attributes.link = `#/page/${replacementId}`;
                          } else if (action === 'delete') {
                            op.insert = '';
                            delete op.attributes;
                          }
                        }
                      });
                      delta.ops = delta.ops.filter(op => op.insert !== '');
                      node.data.content.delta = JSON.stringify(delta);
                      await db.saveNode(node);
                      showToast('Canvas note link repaired!', 'success');
                    }
                  } catch (e) {
                    console.error('Failed to repair canvas delta:', e);
                  }
                }
              } else if (issue.type === 'canvas_richtext_html') {
                const node = await db.getNode(issue.nodeId);
                if (node && node.data && node.data.content && node.data.content.delta) {
                  let html = node.data.content.delta;
                  const linkPattern = new RegExp(`<a href="#/page/${issue.targetId}"[^>]*>([\\s\\S]*?)</a>`, 'g');
                  
                  if (action === 'unlink') {
                    html = html.replace(linkPattern, '$1');
                  } else if (action === 'relink') {
                    html = html.replace(linkPattern, `<a href="#/page/${replacementId}">$1</a>`);
                  } else if (action === 'delete') {
                    html = html.replace(linkPattern, '');
                  }
                  
                  node.data.content.delta = html;
                  await db.saveNode(node);
                  showToast('Canvas note link repaired!', 'success');
                }
              }

              // Re-run scan to update UI
              await db.flushFileAutosave();
              runScan();
            };

            unlinkBtn.addEventListener('click', () => executeRepair('unlink'));
            deleteBtn.addEventListener('click', () => executeRepair('delete'));
            relinkSelect.addEventListener('change', () => {
              if (relinkSelect.value) {
                executeRepair('relink', relinkSelect.value);
              }
            });
          });

        } catch (err) {
          console.error('Link scan failed:', err);
          statusEl.textContent = 'Scan failed.';
          resultsEl.innerHTML = `<div style="color: var(--accent-red); font-size: 0.85rem; padding: 20px 0;">Error scanning link integrity: ${err.message}</div>`;
          scanBtn.disabled = false;
        }
      };

      // Trigger automatic scan when tab opens
      runScan();

      // Bind button click
      scanBtn.addEventListener('click', runScan);
      break;
    }
  }

  refreshIcons();
}

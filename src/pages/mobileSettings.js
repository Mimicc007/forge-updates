/* ============================================================
   Forge Mobile — Settings Tab ("More" screen)
   Account info, theme toggle, AI settings, sign out.
   ============================================================ */

import { getCurrentUser, signOutUser } from '../auth.js';
import { navigate } from '../router.js';

export async function renderMobileSettings(container) {
  const user = getCurrentUser();
  const username = user?.displayName || user?.email?.split('@')[0] || 'User';
  const email = user?.email || '';
  const theme = localStorage.getItem('forge-theme') || 'dark';
  const aiEnabled = localStorage.getItem('forge-companion-enabled') !== 'false';
  const aiModel = localStorage.getItem('forge-gemini-model') || 'gemini-2.5-flash';

  container.innerHTML = `
    <div class="m-page" id="m-settings-root">
      <!-- Header -->
      <div style="padding:calc(28px + env(safe-area-inset-top, 0px)) 20px 20px">
        <div style="font-size:0.7rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px">Account</div>
        <div style="display:flex;align-items:center;gap:14px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:16px;padding:16px">
          <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,rgba(251,191,36,0.3),rgba(245,158,11,0.1));border:2px solid var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:1.3rem;font-weight:700;color:var(--accent-primary);font-family:var(--font-heading);flex-shrink:0">
            ${username[0]?.toUpperCase() || 'U'}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:1rem;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(username)}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(email)}</div>
          </div>
        </div>
      </div>

      <!-- Appearance -->
      <div style="padding:0 16px 4px;font-size:0.7rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-muted)">Appearance</div>
      <div class="m-settings-group">
        <div class="m-settings-row" id="m-theme-row" style="cursor:pointer">
          <div class="m-settings-row-icon">🎨</div>
          <div class="m-settings-row-body">
            <div class="m-settings-row-label">Theme</div>
            <div class="m-settings-row-sub" id="m-theme-label">${theme === 'dark' ? 'Dark' : 'Light'}</div>
          </div>
          <div class="m-settings-row-action">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        </div>
      </div>

      <!-- AI -->
      <div style="padding:0 16px 4px;font-size:0.7rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-muted)">AI</div>
      <div class="m-settings-group">
        <div class="m-settings-row">
          <div class="m-settings-row-icon">⚡</div>
          <div class="m-settings-row-body">
            <div class="m-settings-row-label">Ignis Companion</div>
            <div class="m-settings-row-sub">Your AI writing partner</div>
          </div>
          <label class="m-toggle" style="flex-shrink:0">
            <input type="checkbox" id="m-ai-toggle" ${aiEnabled ? 'checked' : ''} />
            <span class="m-toggle-track"></span>
          </label>
        </div>
        <div class="m-settings-row">
          <div class="m-settings-row-icon">🤖</div>
          <div class="m-settings-row-body">
            <div class="m-settings-row-label">Model</div>
            <div class="m-settings-row-sub">${aiModel}</div>
          </div>
        </div>
      </div>

      <!-- Project -->
      <div style="padding:0 16px 4px;font-size:0.7rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-muted)">Project</div>
      <div class="m-settings-group">
        <button class="m-settings-row" id="m-switch-project" style="cursor:pointer;width:100%;text-align:left">
          <div class="m-settings-row-icon">📂</div>
          <div class="m-settings-row-body">
            <div class="m-settings-row-label">Switch Project</div>
          </div>
          <div class="m-settings-row-action">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        </button>
        <button class="m-settings-row" id="m-open-settings" style="cursor:pointer;width:100%;text-align:left">
          <div class="m-settings-row-icon">⚙️</div>
          <div class="m-settings-row-body">
            <div class="m-settings-row-label">Full Settings</div>
          </div>
          <div class="m-settings-row-action">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        </button>
      </div>

      <!-- Sign out -->
      <div style="padding:0 16px 32px">
        <button id="m-sign-out" style="width:100%;padding:14px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:12px;color:#ef4444;font-size:0.9rem;font-weight:600;cursor:pointer;font-family:var(--font-body);-webkit-tap-highlight-color:transparent">
          Sign Out
        </button>
      </div>

      <!-- Version -->
      <div style="text-align:center;padding-bottom:24px;font-size:0.72rem;color:var(--text-muted)">
        Forge v0.2.2-alpha
      </div>
    </div>
  `;

  _injectSettingsStyles();
  _wireSettings(container, theme);
}

function _wireSettings(container, currentTheme) {
  // Theme toggle
  document.getElementById('m-theme-row')?.addEventListener('click', () => {
    const next = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('forge-theme', next);
    document.documentElement.setAttribute('data-theme', next);
    document.getElementById('m-theme-label').textContent = next === 'dark' ? 'Dark' : 'Light';
    currentTheme = next;
  });

  // AI companion toggle
  document.getElementById('m-ai-toggle')?.addEventListener('change', (e) => {
    localStorage.setItem('forge-companion-enabled', e.target.checked ? 'true' : 'false');
  });

  // Switch project
  document.getElementById('m-switch-project')?.addEventListener('click', () => {
    navigate('hub');
  });

  // Full settings
  document.getElementById('m-open-settings')?.addEventListener('click', () => {
    navigate('settings');
  });

  // Sign out
  document.getElementById('m-sign-out')?.addEventListener('click', async () => {
    if (confirm('Sign out of Forge?')) {
      try {
        await signOutUser();
        navigate('login');
      } catch (e) {
        console.error('[MobileSettings] sign out error', e);
      }
    }
  });
}

function _injectSettingsStyles() {
  if (document.getElementById('m-settings-styles')) return;
  const s = document.createElement('style');
  s.id = 'm-settings-styles';
  s.textContent = `
    .m-settings-row button { background: none; border: none; }
    .m-toggle { position: relative; display: inline-block; width: 44px; height: 26px; }
    .m-toggle input { opacity: 0; width: 0; height: 0; }
    .m-toggle-track {
      position: absolute; inset: 0;
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      border-radius: 13px;
      transition: background 0.2s;
      cursor: pointer;
    }
    .m-toggle-track::after {
      content: '';
      position: absolute;
      left: 3px; top: 3px;
      width: 18px; height: 18px;
      border-radius: 50%;
      background: var(--text-muted);
      transition: transform 0.2s, background 0.2s;
    }
    .m-toggle input:checked + .m-toggle-track { background: var(--accent-primary); border-color: var(--accent-primary); }
    .m-toggle input:checked + .m-toggle-track::after { transform: translateX(18px); background: #070b14; }
  `;
  document.head.appendChild(s);
}

function _esc(str) {
  return String(str).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

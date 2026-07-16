/**
 * sceneMode.js — Ignis Scene Mode
 * A floating right-side drawer panel for AI-powered co-writing.
 * Part of the Forge creative writing AI assistant.
 */

import { getActiveProject, getPages } from './db.js';
import { askGemini } from './ai.js';
import { showToast, escapeHtml } from './ui.js';
import { refreshIcons } from './main.js';

// ─── Module State ─────────────────────────────────────────────────────────────
let _isOpen = false;
let _drawer = null;
let _backdrop = null;
let _project = null;
let _pages = [];
let _characters = []; // { name, pageId, content } — selected character chips
let _acceptedParagraphs = [];
let _currentParagraphs = []; // parsed from AI response
let _currentParaIndex = 0;  // which paragraph is currently being shown
let _isGenerating = false;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build and inject Scene Mode drawer DOM + styles.
 * Call once from main.js on app boot.
 */
export function initSceneMode() {
  _injectStyles();
  _buildDrawer();
}

/**
 * Open or close the Scene Mode drawer.
 * @param {boolean|undefined} forceState — true = open, false = close, undefined = toggle
 */
export function toggleSceneMode(forceState) {
  const shouldOpen = forceState !== undefined ? forceState : !_isOpen;
  if (shouldOpen === _isOpen) return;

  if (shouldOpen) {
    _openDrawer();
  } else {
    _closeDrawer();
  }
}

/**
 * Returns true if the Scene Mode drawer is currently open.
 */
export function isSceneModeOpen() {
  return _isOpen;
}

// ─── DOM Construction ─────────────────────────────────────────────────────────

function _buildDrawer() {
  const root = document.getElementById('scene-mode-root');
  if (!root) {
    console.warn('[SceneMode] #scene-mode-root not found in DOM.');
    return;
  }

  // Backdrop
  _backdrop = document.createElement('div');
  _backdrop.className = 'scene-mode-backdrop';
  _backdrop.setAttribute('aria-hidden', 'true');
  _backdrop.addEventListener('click', () => toggleSceneMode(false));

  // Close Scene Mode on navigation
  window.addEventListener('page-rendered', () => {
    if (_isOpen) _closeDrawer();
  });

  // Close when Ignis opens (mutual exclusivity)
  window.addEventListener('forge-ignis-opened', () => {
    if (_isOpen) _closeDrawer();
  });

  // Drawer
  _drawer = document.createElement('div');
  _drawer.className = 'scene-mode-drawer';
  _drawer.setAttribute('role', 'complementary');
  _drawer.setAttribute('aria-label', 'Ignis Scene Mode');
  _drawer.id = 'scene-mode-drawer';

  _drawer.innerHTML = `
    <!-- ── Header ── -->
    <header class="scene-mode-header" style="border-bottom: none; padding-bottom: 8px;">
      <div class="scene-mode-header-left">
        <div class="scene-mode-logo">
          <span class="scene-mode-logo-icon">🎬</span>
          <div>
            <h2 class="scene-mode-title">IGNIS — SCENE MODE</h2>
            <p class="scene-mode-subtitle">Co-write scenes paragraph by paragraph</p>
          </div>
        </div>
      </div>
      <button class="scene-mode-close-btn" id="scene-mode-close-btn" aria-label="Close Scene Mode" title="Close">✕</button>
    </header>

    <!-- Mode Toggle: Chat Mode vs Scene Mode (active) -->
    <div class="scene-mode-tabs" style="display: flex; padding: 3px; background: rgba(0,0,0,0.35); border-radius: 8px; margin: 0 16px 12px; border: 1px solid var(--border-subtle); gap: 4px;">
      <button id="scene-mode-chat-btn" style="flex: 1; background: transparent; border: none; color: var(--text-secondary); font-size: 10px; font-weight: 600; padding: 6px; border-radius: 6px; cursor: pointer; transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.05em; font-family: var(--font-hud);">💬 Chat</button>
      <button id="scene-mode-scene-btn" class="active" style="flex: 1; background: rgba(255,255,255,0.08); border: none; color: #fff; font-size: 10px; font-weight: 600; padding: 6px; border-radius: 6px; cursor: pointer; transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.05em; font-family: var(--font-hud);">🎬 Scene Mode</button>
    </div>

    <!-- ── Scrollable Body ── -->
    <div class="scene-mode-body">

      <!-- ── Section 1: Context Form ── -->
      <section class="scene-section scene-context-section" id="scene-context-section">
        <button class="scene-section-header" id="scene-context-toggle" aria-expanded="true" aria-controls="scene-context-content">
          <span class="scene-section-title">
            <i data-lucide="sliders-horizontal" class="scene-section-icon"></i>
            Scene Context
          </span>
          <span class="scene-collapse-arrow" id="scene-context-arrow">▲</span>
        </button>
        <div class="scene-context-content" id="scene-context-content">
          <div class="scene-glass-card">

            <!-- Location -->
            <div class="scene-field">
              <label class="scene-label" for="scene-location">
                <i data-lucide="map-pin" class="scene-label-icon"></i>
                Location
              </label>
              <input
                type="text"
                id="scene-location"
                class="scene-input"
                placeholder="Where is this scene set?"
                autocomplete="off"
              />
            </div>

            <!-- Characters -->
            <div class="scene-field">
              <label class="scene-label">
                <i data-lucide="users" class="scene-label-icon"></i>
                Characters
              </label>
              <div class="scene-char-picker">
                <div class="scene-char-picker-row">
                  <select id="scene-char-select" class="scene-select scene-char-select">
                    <option value="">— Select from project pages —</option>
                  </select>
                  <input
                    type="text"
                    id="scene-char-custom"
                    class="scene-input scene-char-custom-input"
                    placeholder="Or type a custom name…"
                    autocomplete="off"
                  />
                  <button id="scene-char-add-btn" class="scene-btn-secondary scene-char-add-btn" title="Add character">
                    <i data-lucide="plus" style="width:14px;height:14px;"></i>
                    Add
                  </button>
                </div>
                <div class="scene-chips" id="scene-chips" aria-label="Selected characters"></div>
              </div>
            </div>

            <!-- Scene Premise -->
            <div class="scene-field">
              <label class="scene-label" for="scene-premise">
                <i data-lucide="scroll-text" class="scene-label-icon"></i>
                Scene Premise
              </label>
              <textarea
                id="scene-premise"
                class="scene-textarea"
                rows="4"
                placeholder="What just happened? What is the setup?"
              ></textarea>
            </div>

            <!-- Tone -->
            <div class="scene-field">
              <label class="scene-label" for="scene-tone">
                <i data-lucide="theater" class="scene-label-icon"></i>
                Tone
              </label>
              <select id="scene-tone" class="scene-select">
                <option value="Dramatic">Dramatic</option>
                <option value="Tense">Tense</option>
                <option value="Humorous">Humorous</option>
                <option value="Melancholic">Melancholic</option>
                <option value="Action-packed">Action-packed</option>
                <option value="Mysterious">Mysterious</option>
                <option value="Romantic">Romantic</option>
              </select>
            </div>

            <!-- Generate Button -->
            <button id="scene-generate-btn" class="scene-btn-primary scene-generate-btn">
              <i data-lucide="play" class="scene-btn-icon"></i>
              Generate Scene Draft
            </button>

          </div>
        </div>
      </section>

      <!-- ── Section 2: Scene Output ── -->
      <section class="scene-section scene-output-section" id="scene-output-section">
        <div class="scene-section-header scene-output-header-bar">
          <span class="scene-section-title">
            <i data-lucide="film" class="scene-section-icon"></i>
            Scene Output
          </span>
          <span class="scene-output-status" id="scene-output-status"></span>
        </div>

        <!-- Paragraphs container -->
        <div class="scene-output-content" id="scene-output-content">
          <div class="scene-empty-state" id="scene-empty-state">
            <div class="scene-empty-icon">✍️</div>
            <p class="scene-empty-title">Your scene will appear here</p>
            <p class="scene-empty-sub">Fill in the context form above and click Generate Scene Draft to begin co-writing with Ignis.</p>
          </div>
        </div>

        <!-- Action Buttons (shown after ≥1 paragraph accepted) -->
        <div class="scene-action-bar" id="scene-action-bar" style="display:none;">
          <button class="scene-btn-action" id="scene-dialogue-btn" title="Generate dialogue between characters">
            <i data-lucide="message-square-quote" class="scene-btn-icon"></i>
            Generate Dialogue
          </button>
          <button class="scene-btn-action" id="scene-whatif-btn" title="Explore alternate scene outcomes">
            <i data-lucide="shuffle" class="scene-btn-icon"></i>
            What If?
          </button>
          <button class="scene-btn-action scene-btn-copy" id="scene-copy-btn" title="Copy all accepted paragraphs">
            <i data-lucide="clipboard-copy" class="scene-btn-icon"></i>
            Copy All Accepted
          </button>
        </div>

      </section>

    </div><!-- end .scene-mode-body -->
  `;

  root.appendChild(_backdrop);
  root.appendChild(_drawer);

  _bindEvents();
  refreshIcons();
}

// ─── Event Binding ────────────────────────────────────────────────────────────

function _bindEvents() {
  // Close button
  document.getElementById('scene-mode-close-btn')
    .addEventListener('click', () => toggleSceneMode(false));

  // Chat Mode toggle
  document.getElementById('scene-mode-chat-btn')
    .addEventListener('click', () => {
      import('./ai.js').then(({ toggleAiDrawer }) => {
        toggleSceneMode(false);
        toggleAiDrawer(true);
      });
    });

  // Collapsible context section
  document.getElementById('scene-context-toggle')
    .addEventListener('click', _toggleContextSection);

  // Add character chip
  document.getElementById('scene-char-add-btn')
    .addEventListener('click', _addCharacterChip);

  // Also add on Enter key in custom input
  document.getElementById('scene-char-custom')
    .addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); _addCharacterChip(); }
    });

  // Generate scene
  document.getElementById('scene-generate-btn')
    .addEventListener('click', _handleGenerateScene);

  // Action buttons
  document.getElementById('scene-dialogue-btn')
    .addEventListener('click', _handleGenerateDialogue);
  document.getElementById('scene-whatif-btn')
    .addEventListener('click', _handleWhatIf);
  document.getElementById('scene-copy-btn')
    .addEventListener('click', _handleCopyAccepted);
}

// ─── Open / Close Logic ───────────────────────────────────────────────────────

async function _openDrawer() {
  _isOpen = true;
  _drawer.classList.add('open');
  _backdrop.classList.add('open');
  document.body.classList.add('scene-mode-active');

  // Close Ignis if it's open (mutual exclusivity — no circular import needed)
  window.dispatchEvent(new CustomEvent('forge-scene-mode-opened'));

  // Load project + pages
  try {
    _project = await getActiveProject();
    if (_project) {
      _pages = (await getPages(_project.id)).filter(p => !p.isStoryBeat);
      _populateCharacterDropdown();
    }
  } catch (err) {
    console.error('[SceneMode] Failed to load project data:', err);
  }
}

function _closeDrawer() {
  _isOpen = false;
  _drawer.classList.remove('open');
  _backdrop.classList.remove('open');
  document.body.classList.remove('scene-mode-active');
}

// ─── Character Chip System ────────────────────────────────────────────────────

function _populateCharacterDropdown() {
  const select = document.getElementById('scene-char-select');
  // Clear existing options (keep placeholder)
  select.innerHTML = '<option value="">— Select from project pages —</option>';

  _pages.forEach(page => {
    const opt = document.createElement('option');
    opt.value = page.id;
    opt.textContent = page.title || 'Untitled';
    select.appendChild(opt);
  });
}

function _addCharacterChip() {
  const select = document.getElementById('scene-char-select');
  const customInput = document.getElementById('scene-char-custom');

  let name = '';
  let pageId = null;
  let content = '';

  if (customInput.value.trim()) {
    // Custom typed name
    name = customInput.value.trim();
    customInput.value = '';
  } else if (select.value) {
    // From dropdown
    pageId = select.value;
    const page = _pages.find(p => p.id === pageId);
    if (!page) return;
    name = page.title || 'Untitled';
    content = _extractPageContent(page);
    select.value = '';
  } else {
    return; // nothing selected
  }

  // Prevent duplicates
  if (_characters.find(c => c.name.toLowerCase() === name.toLowerCase())) {
    showToast(`"${name}" is already in the scene.`, 'info');
    return;
  }

  _characters.push({ name, pageId, content });
  _renderChips();
}

function _removeCharacter(name) {
  _characters = _characters.filter(c => c.name !== name);
  _renderChips();
}

function _renderChips() {
  const container = document.getElementById('scene-chips');
  container.innerHTML = '';
  _characters.forEach(char => {
    const chip = document.createElement('span');
    chip.className = 'scene-char-chip';
    chip.innerHTML = `
      <span class="scene-chip-name">${escapeHtml(char.name)}</span>
      <button class="scene-chip-remove" aria-label="Remove ${escapeHtml(char.name)}" title="Remove">✕</button>
    `;
    chip.querySelector('.scene-chip-remove').addEventListener('click', () => _removeCharacter(char.name));
    container.appendChild(chip);
  });
}

function _extractPageContent(page) {
  // Try to get plain text from Quill delta JSON, else use raw
  let raw = page.content || '';
  try {
    const delta = JSON.parse(raw);
    if (delta && Array.isArray(delta.ops)) {
      raw = delta.ops.map(op => (typeof op.insert === 'string' ? op.insert : '')).join('');
    }
  } catch (_) { /* not JSON, use as-is */ }
  return raw.slice(0, 300);
}

// ─── Collapsible Context Section ──────────────────────────────────────────────

function _toggleContextSection() {
  const content = document.getElementById('scene-context-content');
  const arrow = document.getElementById('scene-context-arrow');
  const toggle = document.getElementById('scene-context-toggle');
  const isExpanded = toggle.getAttribute('aria-expanded') === 'true';

  if (isExpanded) {
    content.style.maxHeight = content.scrollHeight + 'px';
    requestAnimationFrame(() => {
      content.style.maxHeight = '0';
      content.style.overflow = 'hidden';
    });
    toggle.setAttribute('aria-expanded', 'false');
    arrow.textContent = '▼';
  } else {
    content.style.maxHeight = content.scrollHeight + 'px';
    content.style.overflow = '';
    toggle.setAttribute('aria-expanded', 'true');
    arrow.textContent = '▲';
    // Reset to auto after transition
    content.addEventListener('transitionend', () => {
      if (toggle.getAttribute('aria-expanded') === 'true') {
        content.style.maxHeight = '';
      }
    }, { once: true });
  }
}

// ─── API Key & Context Helpers ────────────────────────────────────────────────

function _getApiKey() {
  return localStorage.getItem('forge-gemini-key') || '';
}

function _getAiContext() {
  if (!_project) return {};
  return {
    name: _project.name,
    genre: _project.settings?.genre || ''
  };
}

function _buildCharacterProfiles() {
  return _characters
    .filter(c => c.content)
    .map(c => `${c.name}: ${c.content}`)
    .join('\n\n');
}

// ─── Scene Generation ─────────────────────────────────────────────────────────

async function _handleGenerateScene() {
  if (_isGenerating) return;

  const apiKey = _getApiKey();
  if (!apiKey) {
    _showApiKeyError();
    return;
  }

  if (!_project) {
    showToast('No active project found. Please open a project first.', 'error');
    return;
  }

  const location = document.getElementById('scene-location').value.trim();
  const premise = document.getElementById('scene-premise').value.trim();
  const tone = document.getElementById('scene-tone').value;
  const characters = _characters.map(c => c.name);

  if (!location) { showToast('Please enter a location for the scene.', 'warning'); return; }
  if (characters.length === 0) { showToast('Add at least one character to the scene.', 'warning'); return; }
  if (!premise) { showToast('Please enter a scene premise.', 'warning'); return; }

  _isGenerating = true;
  _acceptedParagraphs = [];
  _currentParagraphs = [];
  _currentParaIndex = 0;

  const outputContent = document.getElementById('scene-output-content');
  outputContent.innerHTML = '';
  document.getElementById('scene-action-bar').style.display = 'none';
  _setOutputStatus('Ignis is writing…');

  // Disable generate button
  const genBtn = document.getElementById('scene-generate-btn');
  genBtn.disabled = true;
  genBtn.innerHTML = `<span class="scene-spinner"></span> Writing…`;

  const characterProfiles = _buildCharacterProfiles();

  const prompt = `You are Ignis, writing partner for the ${escapeHtml(_project.name)} universe.
Write a ${tone} scene with the following setup.
Location: ${location}
Characters: ${characters.join(', ')}
Premise: ${premise}

Return the scene as exactly 5 paragraphs, each prefixed with [P1], [P2], [P3], [P4], [P5] on its own line.
Example format:
[P1] The wind howled through the abandoned hall...
[P2] Kairo stepped forward, hand on his blade...

Character profiles from the database:
${characterProfiles}

Write vivid, immersive prose. Stay true to the characters and lore.`;

  try {
    const response = await askGemini(prompt, [], apiKey, _getAiContext());
    _currentParagraphs = _parseSceneParagraphs(response);

    if (_currentParagraphs.length === 0) {
      throw new Error('No paragraphs were returned. Please try again.');
    }

    _setOutputStatus(`${_currentParagraphs.length} paragraphs — reviewing…`);
    await _showNextParagraph();

  } catch (err) {
    console.error('[SceneMode] Scene generation failed:', err);
    showToast('Scene generation failed: ' + err.message, 'error');
    _setOutputStatus('');
    outputContent.innerHTML = `<div class="scene-error-msg">⚠️ Generation failed. ${escapeHtml(err.message)}</div>`;
  } finally {
    _isGenerating = false;
    genBtn.disabled = false;
    genBtn.innerHTML = `<i data-lucide="play" class="scene-btn-icon"></i> Generate Scene Draft`;
    refreshIcons();
  }
}

function _parseSceneParagraphs(text) {
  // Split on [P1], [P2], etc.
  const parts = text.split(/\[P\d+\]/g).map(s => s.trim()).filter(Boolean);
  return parts;
}

async function _showNextParagraph() {
  if (_currentParaIndex >= _currentParagraphs.length) {
    _setOutputStatus(`Done — ${_acceptedParagraphs.length} paragraph(s) accepted.`);
    return;
  }

  const paraText = _currentParagraphs[_currentParaIndex];
  const paraIndex = _currentParaIndex;
  const outputContent = document.getElementById('scene-output-content');

  // Remove empty state
  const emptyState = document.getElementById('scene-empty-state');
  if (emptyState) emptyState.remove();

  const card = document.createElement('div');
  card.className = 'scene-para-card scene-para-entering';
  card.dataset.index = paraIndex;
  card.innerHTML = `
    <div class="scene-para-number">Paragraph ${paraIndex + 1} of ${_currentParagraphs.length}</div>
    <div class="scene-para-text" id="scene-para-text-${paraIndex}"></div>
    <div class="scene-para-actions" id="scene-para-actions-${paraIndex}">
      <button class="scene-btn-accept" id="scene-accept-${paraIndex}">
        <i data-lucide="check" style="width:14px;height:14px;"></i> Accept
      </button>
      <button class="scene-btn-reject" id="scene-reject-${paraIndex}">
        <i data-lucide="x" style="width:14px;height:14px;"></i> Reject
      </button>
    </div>
  `;
  outputContent.appendChild(card);
  outputContent.scrollTop = outputContent.scrollHeight;

  // Animate card in
  requestAnimationFrame(() => {
    card.classList.remove('scene-para-entering');
  });

  refreshIcons();

  // Typewriter animation
  await _typewriterAnimate(`scene-para-text-${paraIndex}`, paraText);

  // Bind accept / reject
  document.getElementById(`scene-accept-${paraIndex}`)
    .addEventListener('click', () => _acceptParagraph(card, paraIndex, paraText));
  document.getElementById(`scene-reject-${paraIndex}`)
    .addEventListener('click', () => _rejectParagraph(card, paraIndex));
}

function _typewriterAnimate(elementId, text) {
  return new Promise(resolve => {
    const el = document.getElementById(elementId);
    if (!el) { resolve(); return; }

    let i = 0;
    const speed = Math.max(8, Math.min(25, Math.round(4000 / text.length))); // adaptive speed

    function tick() {
      if (i <= text.length) {
        el.textContent = text.slice(0, i);
        // Blinking cursor
        el.innerHTML = escapeHtml(text.slice(0, i)) + (i < text.length ? '<span class="scene-cursor">|</span>' : '');
        i++;
        if (i <= text.length) {
          requestAnimationFrame(() => setTimeout(tick, speed));
        } else {
          el.innerHTML = escapeHtml(text); // final clean text
          resolve();
        }
      }
    }

    tick();
  });
}

async function _acceptParagraph(card, index, text) {
  _acceptedParagraphs.push(text);
  _currentParaIndex++;

  card.classList.add('accepted');
  const actions = document.getElementById(`scene-para-actions-${index}`);
  actions.innerHTML = `<span class="scene-accepted-badge"><i data-lucide="check-circle" style="width:14px;height:14px;"></i> Accepted</span>`;
  refreshIcons();

  // Show action bar if at least one accepted
  if (_acceptedParagraphs.length >= 1) {
    document.getElementById('scene-action-bar').style.display = 'flex';
  }

  _setOutputStatus(`${_currentParaIndex} of ${_currentParagraphs.length} reviewed — ${_acceptedParagraphs.length} accepted`);

  // Show next paragraph
  await _showNextParagraph();
}

async function _rejectParagraph(card, index) {
  card.classList.add('regenerating');
  const actions = document.getElementById(`scene-para-actions-${index}`);
  actions.innerHTML = `<span class="scene-regen-status"><span class="scene-spinner"></span> Regenerating…</span>`;

  const apiKey = _getApiKey();
  const location = document.getElementById('scene-location').value.trim();
  const premise = document.getElementById('scene-premise').value.trim();
  const tone = document.getElementById('scene-tone').value;
  const characters = _characters.map(c => c.name);
  const characterProfiles = _buildCharacterProfiles();

  const rejectPrompt = `You are Ignis, writing partner for the ${escapeHtml(_project.name)} universe.
The user rejected a paragraph in a ${tone} scene and wants a fresh take.
Try a completely different approach for this paragraph.

Context:
Location: ${location}
Characters: ${characters.join(', ')}
Premise: ${premise}
Character profiles: ${characterProfiles}

Return ONLY a single replacement paragraph. No labels, no numbering — just the paragraph text.`;

  try {
    const response = await askGemini(rejectPrompt, [], apiKey, _getAiContext());
    const newText = response.trim();

    // Replace paragraph in array
    _currentParagraphs[index] = newText;

    card.classList.remove('regenerating');
    card.classList.remove('rejected');

    // Re-render text with typewriter
    const textEl = document.getElementById(`scene-para-text-${index}`);
    if (textEl) textEl.textContent = '';

    actions.innerHTML = `
      <button class="scene-btn-accept" id="scene-accept-${index}">
        <i data-lucide="check" style="width:14px;height:14px;"></i> Accept
      </button>
      <button class="scene-btn-reject" id="scene-reject-${index}">
        <i data-lucide="x" style="width:14px;height:14px;"></i> Reject
      </button>
    `;
    refreshIcons();

    await _typewriterAnimate(`scene-para-text-${index}`, newText);

    document.getElementById(`scene-accept-${index}`)
      .addEventListener('click', () => _acceptParagraph(card, index, newText));
    document.getElementById(`scene-reject-${index}`)
      .addEventListener('click', () => _rejectParagraph(card, index));

  } catch (err) {
    console.error('[SceneMode] Regeneration failed:', err);
    showToast('Regeneration failed: ' + err.message, 'error');
    card.classList.remove('regenerating');
    card.classList.add('rejected');
    actions.innerHTML = `
      <button class="scene-btn-accept" id="scene-accept-${index}">
        <i data-lucide="check" style="width:14px;height:14px;"></i> Accept
      </button>
      <button class="scene-btn-reject" id="scene-reject-${index}">
        <i data-lucide="x" style="width:14px;height:14px;"></i> Try Again
      </button>
    `;
    refreshIcons();
    document.getElementById(`scene-accept-${index}`)
      .addEventListener('click', () => _acceptParagraph(card, index, _currentParagraphs[index]));
    document.getElementById(`scene-reject-${index}`)
      .addEventListener('click', () => _rejectParagraph(card, index));
  }
}

// ─── Dialogue Generation ──────────────────────────────────────────────────────

async function _handleGenerateDialogue() {
  const apiKey = _getApiKey();
  if (!apiKey) { _showApiKeyError(); return; }

  const location = document.getElementById('scene-location').value.trim();
  const premise = document.getElementById('scene-premise').value.trim();
  const characters = _characters.map(c => c.name);

  if (characters.length < 2) {
    showToast('Add at least 2 characters to generate dialogue.', 'warning');
    return;
  }

  const btn = document.getElementById('scene-dialogue-btn');
  btn.disabled = true;
  btn.innerHTML = `<span class="scene-spinner"></span> Writing…`;

  const prompt = `Generate 3 short lines of dialogue between ${characters.join(' and ')} for this scene:
Location: ${location}, Premise: ${premise}
Use each character's established voice and personality.
Format: CHARACTER_NAME: "dialogue line"
Return exactly 3 exchanges.`;

  try {
    const response = await askGemini(prompt, [], apiKey, _getAiContext());
    _renderDialogueCard(response);
    showToast('Dialogue generated!', 'success');
  } catch (err) {
    showToast('Dialogue generation failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="message-square-quote" class="scene-btn-icon"></i> Generate Dialogue`;
    refreshIcons();
  }
}

function _renderDialogueCard(text) {
  const outputContent = document.getElementById('scene-output-content');
  const emptyState = document.getElementById('scene-empty-state');
  if (emptyState) emptyState.remove();

  // Parse lines: "CHARACTER: "dialogue""
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const exchanges = lines.map(line => {
    const match = line.match(/^([^:]+):\s*[""]?(.+?)[""]?\s*$/);
    if (match) return { speaker: match[1].trim(), line: match[2].trim() };
    return { speaker: '', line: line };
  });

  const card = document.createElement('div');
  card.className = 'scene-extra-card scene-dialogue-card scene-para-entering';
  card.innerHTML = `
    <div class="scene-extra-card-header">
      <i data-lucide="message-square-quote" style="width:16px;height:16px;"></i>
      Generated Dialogue
    </div>
    <div class="scene-dialogue-exchanges">
      ${exchanges.map(ex => `
        <div class="scene-dialogue-line">
          <span class="scene-dialogue-speaker">${escapeHtml(ex.speaker || '?')}</span>
          <span class="scene-dialogue-text">"${escapeHtml(ex.line)}"</span>
        </div>
      `).join('')}
    </div>
  `;

  requestAnimationFrame(() => card.classList.remove('scene-para-entering'));
  outputContent.appendChild(card);
  outputContent.scrollTop = outputContent.scrollHeight;
  refreshIcons();
}

// ─── What If? Generation ──────────────────────────────────────────────────────

async function _handleWhatIf() {
  const apiKey = _getApiKey();
  if (!apiKey) { _showApiKeyError(); return; }

  const location = document.getElementById('scene-location').value.trim();
  const premise = document.getElementById('scene-premise').value.trim();
  const characters = _characters.map(c => c.name);

  const btn = document.getElementById('scene-whatif-btn');
  btn.disabled = true;
  btn.innerHTML = `<span class="scene-spinner"></span> Imagining…`;

  const prompt = `Generate 3 alternative outcomes for this scene:
Location: ${location}, Characters: ${characters.join(', ')}, Premise: ${premise}
Format each as:
[WHAT IF] Brief title
Description of the alternative outcome (2-3 sentences).`;

  try {
    const response = await askGemini(prompt, [], apiKey, _getAiContext());
    _renderWhatIfCard(response);
    showToast('Alternate outcomes generated!', 'success');
  } catch (err) {
    showToast('What If? generation failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="shuffle" class="scene-btn-icon"></i> What If?`;
    refreshIcons();
  }
}

function _renderWhatIfCard(text) {
  const outputContent = document.getElementById('scene-output-content');
  const emptyState = document.getElementById('scene-empty-state');
  if (emptyState) emptyState.remove();

  // Parse: [WHAT IF] Title\nDescription
  const alternates = [];
  const blocks = text.split(/\[WHAT IF\]/i).map(s => s.trim()).filter(Boolean);
  blocks.forEach(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    const title = lines[0] || 'Alternative Outcome';
    const desc = lines.slice(1).join(' ');
    alternates.push({ title, desc });
  });

  const card = document.createElement('div');
  card.className = 'scene-extra-card scene-whatif-card scene-para-entering';
  card.innerHTML = `
    <div class="scene-extra-card-header">
      <i data-lucide="shuffle" style="width:16px;height:16px;"></i>
      What If? — Alternate Outcomes
    </div>
    <div class="scene-whatif-list">
      ${alternates.map((alt, i) => `
        <details class="scene-whatif-item" ${i === 0 ? 'open' : ''}>
          <summary class="scene-whatif-title">
            <i data-lucide="git-branch" style="width:13px;height:13px;"></i>
            ${escapeHtml(alt.title)}
          </summary>
          <p class="scene-whatif-desc">${escapeHtml(alt.desc)}</p>
        </details>
      `).join('')}
    </div>
  `;

  requestAnimationFrame(() => card.classList.remove('scene-para-entering'));
  outputContent.appendChild(card);
  outputContent.scrollTop = outputContent.scrollHeight;
  refreshIcons();
}

// ─── Copy Accepted ────────────────────────────────────────────────────────────

async function _handleCopyAccepted() {
  if (_acceptedParagraphs.length === 0) {
    showToast('No accepted paragraphs to copy.', 'info');
    return;
  }

  const text = _acceptedParagraphs.join('\n\n');
  try {
    await navigator.clipboard.writeText(text);
    showToast('Accepted paragraphs copied to clipboard!', 'success');

    const btn = document.getElementById('scene-copy-btn');
    btn.innerHTML = `<i data-lucide="clipboard-check" class="scene-btn-icon"></i> Copied!`;
    refreshIcons();
    setTimeout(() => {
      btn.innerHTML = `<i data-lucide="clipboard-copy" class="scene-btn-icon"></i> Copy All Accepted`;
      refreshIcons();
    }, 2000);
  } catch (err) {
    showToast('Failed to copy: ' + err.message, 'error');
  }
}

// ─── Utility Helpers ──────────────────────────────────────────────────────────

function _setOutputStatus(text) {
  const el = document.getElementById('scene-output-status');
  if (el) el.textContent = text;
}

function _showApiKeyError() {
  const outputContent = document.getElementById('scene-output-content');
  const emptyState = document.getElementById('scene-empty-state');
  if (emptyState) emptyState.remove();

  outputContent.innerHTML = `
    <div class="scene-api-key-msg">
      <div class="scene-api-key-icon">🔑</div>
      <p class="scene-api-key-title">API Key Required</p>
      <p class="scene-api-key-sub">Configure a Gemini API key in <strong>Settings › AI Companion</strong> to use Scene Mode.</p>
    </div>
  `;
}

// ─── Style Injection ──────────────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById('scene-mode-styles')) return;

  const style = document.createElement('style');
  style.id = 'scene-mode-styles';
  style.textContent = `
/* ═══════════════════════════════════════════════
   IGNIS SCENE MODE — Stylesheet
   Uses CSS variables from the Forge design system
════════════════════════════════════════════════ */

/* ── Backdrop ─────────────────────────────────── */
.scene-mode-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 449;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  opacity: 0;
  transition: opacity 0.35s ease;
}

.scene-mode-backdrop.open {
  display: block;
  opacity: 1;
}

/* ── Drawer ────────────────────────────────────── */
.scene-mode-drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: 720px;
  max-width: 100vw;
  height: 100vh;
  z-index: 450;
  display: flex;
  flex-direction: column;
  background: rgba(10, 8, 18, 0.97);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-left: 1px solid rgba(229, 169, 59, 0.15);
  box-shadow: -8px 0 40px rgba(0, 0, 0, 0.6);
  transform: translateX(100%);
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.scene-mode-drawer.open {
  transform: translateX(0);
}

/* ── Header ────────────────────────────────────── */
.scene-mode-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 16px;
  border-bottom: 1px solid rgba(229, 169, 59, 0.12);
  background: rgba(229, 169, 59, 0.04);
  flex-shrink: 0;
}

.scene-mode-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.scene-mode-logo {
  display: flex;
  align-items: center;
  gap: 14px;
}

.scene-mode-logo-icon {
  font-size: 28px;
  filter: drop-shadow(0 0 10px rgba(229, 169, 59, 0.7));
  animation: scene-flame-flicker 3s ease-in-out infinite;
}

@keyframes scene-flame-flicker {
  0%, 100% { filter: drop-shadow(0 0 10px rgba(229, 169, 59, 0.7)); }
  50%       { filter: drop-shadow(0 0 18px rgba(229, 169, 59, 1)); }
}

.scene-mode-title {
  font-family: var(--font-heading, 'Cinzel', serif);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--accent-primary, #e5a93b);
  text-shadow: 0 0 20px rgba(229, 169, 59, 0.5);
  margin: 0;
  line-height: 1.2;
}

.scene-mode-subtitle {
  font-family: var(--font-hud, 'Rajdhani', sans-serif);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--text-muted, #6b7280);
  margin: 3px 0 0;
}

.scene-mode-close-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: var(--text-secondary, #9ca3af);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.scene-mode-close-btn:hover {
  background: rgba(229, 169, 59, 0.12);
  border-color: rgba(229, 169, 59, 0.3);
  color: var(--accent-primary, #e5a93b);
  transform: rotate(90deg);
}

/* ── Body (scrollable split) ──────────────────── */
.scene-mode-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  gap: 0;
}

.scene-section {
  display: flex;
  flex-direction: column;
}

/* ── Context Section ──────────────────────────── */
.scene-context-section {
  flex-shrink: 0;
  border-bottom: 1px solid rgba(229, 169, 59, 0.1);
}

.scene-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  cursor: pointer;
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
  transition: background 0.2s ease;
}

.scene-section-header:hover {
  background: rgba(229, 169, 59, 0.04);
}

.scene-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-hud, 'Rajdhani', sans-serif);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-secondary, #9ca3af);
}

.scene-section-icon {
  width: 13px;
  height: 13px;
  opacity: 0.7;
}

.scene-collapse-arrow {
  font-size: 10px;
  color: var(--text-muted, #6b7280);
  transition: transform 0.2s ease;
}

.scene-context-content {
  overflow: hidden;
  transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  padding: 0 20px 16px;
}

/* ── Glass Card ────────────────────────────────── */
.scene-glass-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: var(--radius-lg, 12px);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── Form Fields ───────────────────────────────── */
.scene-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.scene-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-hud, 'Rajdhani', sans-serif);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary, #9ca3af);
}

.scene-label-icon {
  width: 12px;
  height: 12px;
  opacity: 0.6;
}

.scene-input,
.scene-select,
.scene-textarea {
  width: 100%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: var(--text-primary, #f3f4f6);
  font-family: inherit;
  font-size: 13px;
  padding: 10px 12px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  outline: none;
  box-sizing: border-box;
}

.scene-input:focus,
.scene-select:focus,
.scene-textarea:focus {
  border-color: rgba(229, 169, 59, 0.45);
  background: rgba(229, 169, 59, 0.04);
  box-shadow: 0 0 0 3px rgba(229, 169, 59, 0.1);
}

.scene-input::placeholder,
.scene-textarea::placeholder {
  color: var(--text-muted, #6b7280);
}

.scene-textarea {
  resize: vertical;
  min-height: 80px;
  line-height: 1.6;
}

.scene-select {
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 32px;
  cursor: pointer;
}

.scene-select option {
  background: #0f0d1e;
  color: #f3f4f6;
}

/* ── Character Picker ─────────────────────────── */
.scene-char-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scene-char-picker-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.scene-char-select {
  flex: 1;
  min-width: 0;
}

.scene-char-custom-input {
  flex: 1;
  min-width: 0;
}

.scene-char-add-btn {
  flex-shrink: 0;
  white-space: nowrap;
}

/* ── Character Chips ──────────────────────────── */
.scene-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 0;
}

.scene-char-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 12px;
  background: rgba(229, 169, 59, 0.1);
  border: 1px solid rgba(229, 169, 59, 0.25);
  border-radius: 999px;
  font-size: 12px;
  color: var(--accent-primary, #e5a93b);
  font-family: var(--font-hud, 'Rajdhani', sans-serif);
  letter-spacing: 0.04em;
  animation: scene-chip-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes scene-chip-in {
  from { transform: scale(0.75); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}

.scene-chip-name { font-weight: 600; }

.scene-chip-remove {
  border: none;
  background: transparent;
  color: rgba(229, 169, 59, 0.5);
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  padding: 0;
  display: flex;
  align-items: center;
  transition: color 0.15s ease;
}

.scene-chip-remove:hover { color: var(--accent-red, #ef4444); }

/* ── Buttons ───────────────────────────────────── */
.scene-btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px 20px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #e5a93b, #c8831f);
  color: #0a0812;
  font-family: var(--font-hud, 'Rajdhani', sans-serif);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 20px rgba(229, 169, 59, 0.25);
}

.scene-btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 28px rgba(229, 169, 59, 0.4);
  background: linear-gradient(135deg, #f0b84a, #d4922e);
}

.scene-btn-primary:active:not(:disabled) { transform: translateY(0); }

.scene-btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.scene-btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  border-radius: 8px;
  border: 1px solid rgba(229, 169, 59, 0.25);
  background: rgba(229, 169, 59, 0.08);
  color: var(--accent-primary, #e5a93b);
  font-family: var(--font-hud, 'Rajdhani', sans-serif);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.scene-btn-secondary:hover {
  background: rgba(229, 169, 59, 0.15);
  border-color: rgba(229, 169, 59, 0.4);
}

.scene-btn-icon {
  width: 14px;
  height: 14px;
}

/* ── Generate button spinner ──────────────────── */
.scene-generate-btn {
  margin-top: 4px;
}

/* ── Output Section ────────────────────────────── */
.scene-output-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.scene-output-header-bar {
  padding: 10px 24px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  flex-shrink: 0;
  cursor: default;
}

.scene-output-header-bar:hover { background: transparent; }

.scene-output-status {
  font-family: var(--font-hud, 'Rajdhani', sans-serif);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--accent-primary, #e5a93b);
  opacity: 0.7;
}

.scene-output-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  scrollbar-width: thin;
  scrollbar-color: rgba(229, 169, 59, 0.2) transparent;
}

.scene-output-content::-webkit-scrollbar { width: 4px; }
.scene-output-content::-webkit-scrollbar-track { background: transparent; }
.scene-output-content::-webkit-scrollbar-thumb { background: rgba(229, 169, 59, 0.2); border-radius: 2px; }

/* ── Empty State ────────────────────────────────── */
.scene-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 20px;
  gap: 10px;
  flex: 1;
}

.scene-empty-icon {
  font-size: 40px;
  opacity: 0.4;
}

.scene-empty-title {
  font-family: var(--font-hud, 'Rajdhani', sans-serif);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--text-secondary, #9ca3af);
  margin: 0;
}

.scene-empty-sub {
  font-size: 12px;
  color: var(--text-muted, #6b7280);
  max-width: 300px;
  line-height: 1.6;
  margin: 0;
}

/* ── Paragraph Cards ─────────────────────────── */
.scene-para-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-lg, 12px);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-left: 3px solid rgba(229, 169, 59, 0.25);
  transition: all 0.35s ease;
  transform: translateY(0);
  opacity: 1;
}

.scene-para-card.scene-para-entering {
  transform: translateY(12px);
  opacity: 0;
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
}

.scene-para-card.accepted {
  border-left-color: var(--accent-green, #22c55e);
  background: rgba(34, 197, 94, 0.04);
}

.scene-para-card.rejected {
  border-left-color: var(--accent-red, #ef4444);
  background: rgba(239, 68, 68, 0.04);
}

.scene-para-card.regenerating {
  border-left-color: var(--accent-primary, #e5a93b);
  animation: scene-regen-pulse 1.5s ease-in-out infinite;
}

@keyframes scene-regen-pulse {
  0%, 100% { border-left-color: rgba(229, 169, 59, 0.3); }
  50%       { border-left-color: rgba(229, 169, 59, 1); box-shadow: 0 0 16px rgba(229, 169, 59, 0.2); }
}

.scene-para-number {
  font-family: var(--font-hud, 'Rajdhani', sans-serif);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted, #6b7280);
}

.scene-para-text {
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-primary, #f3f4f6);
  font-family: 'Georgia', serif;
  white-space: pre-wrap;
  word-break: break-word;
}

.scene-cursor {
  display: inline-block;
  color: var(--accent-primary, #e5a93b);
  animation: scene-cursor-blink 0.7s ease-in-out infinite;
  font-weight: 100;
  margin-left: 1px;
}

@keyframes scene-cursor-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}

/* ── Paragraph Action Buttons ─────────────────── */
.scene-para-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.scene-btn-accept,
.scene-btn-reject {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border-radius: 7px;
  border: 1px solid;
  font-family: var(--font-hud, 'Rajdhani', sans-serif);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all 0.2s ease;
}

.scene-btn-accept {
  border-color: rgba(34, 197, 94, 0.35);
  background: rgba(34, 197, 94, 0.08);
  color: var(--accent-green, #22c55e);
}

.scene-btn-accept:hover {
  background: rgba(34, 197, 94, 0.18);
  border-color: rgba(34, 197, 94, 0.6);
  transform: translateY(-1px);
  box-shadow: 0 3px 12px rgba(34, 197, 94, 0.2);
}

.scene-btn-reject {
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.08);
  color: var(--accent-red, #ef4444);
}

.scene-btn-reject:hover {
  background: rgba(239, 68, 68, 0.18);
  border-color: rgba(239, 68, 68, 0.6);
  transform: translateY(-1px);
  box-shadow: 0 3px 12px rgba(239, 68, 68, 0.2);
}

.scene-accepted-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-hud, 'Rajdhani', sans-serif);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--accent-green, #22c55e);
  opacity: 0.8;
}

.scene-regen-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-hud, 'Rajdhani', sans-serif);
  font-size: 12px;
  color: var(--accent-primary, #e5a93b);
  opacity: 0.8;
}

/* ── Extra Cards (dialogue, what if) ──────────── */
.scene-extra-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(229, 169, 59, 0.12);
  border-radius: var(--radius-lg, 12px);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.scene-extra-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-hud, 'Rajdhani', sans-serif);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent-primary, #e5a93b);
  opacity: 0.8;
}

/* ── Dialogue Card ────────────────────────────── */
.scene-dialogue-exchanges {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.scene-dialogue-line {
  display: flex;
  gap: 10px;
  align-items: baseline;
  padding: 8px 12px;
  background: rgba(255,255,255,0.02);
  border-radius: 8px;
  border-left: 2px solid rgba(229, 169, 59, 0.2);
}

.scene-dialogue-speaker {
  font-family: var(--font-hud, 'Rajdhani', sans-serif);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent-primary, #e5a93b);
  min-width: 80px;
  flex-shrink: 0;
}

.scene-dialogue-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary, #f3f4f6);
  font-style: italic;
  font-family: 'Georgia', serif;
}

/* ── What If Card ─────────────────────────────── */
.scene-whatif-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scene-whatif-item {
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255,255,255,0.02);
}

.scene-whatif-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  font-family: var(--font-hud, 'Rajdhani', sans-serif);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-primary, #f3f4f6);
  list-style: none;
  user-select: none;
  transition: background 0.15s ease;
}

.scene-whatif-title:hover { background: rgba(229, 169, 59, 0.05); }
.scene-whatif-title::-webkit-details-marker { display: none; }

.scene-whatif-desc {
  padding: 0 14px 12px;
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-secondary, #9ca3af);
  margin: 0;
}

/* ── Action Bar ────────────────────────────────── */
.scene-action-bar {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid rgba(229, 169, 59, 0.08);
  flex-shrink: 0;
  flex-wrap: wrap;
  background: rgba(10, 8, 18, 0.5);
}

.scene-btn-action {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 16px;
  border-radius: 9px;
  border: 1px solid rgba(229, 169, 59, 0.2);
  background: rgba(229, 169, 59, 0.07);
  color: var(--accent-primary, #e5a93b);
  font-family: var(--font-hud, 'Rajdhani', sans-serif);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;
  flex: 1;
  justify-content: center;
  min-width: 140px;
}

.scene-btn-action:hover {
  background: rgba(229, 169, 59, 0.14);
  border-color: rgba(229, 169, 59, 0.4);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(229, 169, 59, 0.15);
}

.scene-btn-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.scene-btn-copy {
  border-color: rgba(99, 179, 237, 0.2);
  background: rgba(99, 179, 237, 0.06);
  color: #63b3ed;
}

.scene-btn-copy:hover {
  background: rgba(99, 179, 237, 0.13);
  border-color: rgba(99, 179, 237, 0.4);
  box-shadow: 0 4px 16px rgba(99, 179, 237, 0.15);
}

/* ── Messages ──────────────────────────────────── */
.scene-error-msg {
  padding: 16px;
  background: rgba(239, 68, 68, 0.07);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 10px;
  color: #fca5a5;
  font-size: 13px;
  line-height: 1.6;
}

.scene-api-key-msg {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 40px 24px;
  gap: 10px;
}

.scene-api-key-icon { font-size: 36px; opacity: 0.5; }

.scene-api-key-title {
  font-family: var(--font-hud, 'Rajdhani', sans-serif);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--text-secondary, #9ca3af);
  margin: 0;
}

.scene-api-key-sub {
  font-size: 12px;
  color: var(--text-muted, #6b7280);
  max-width: 300px;
  line-height: 1.6;
  margin: 0;
}

.scene-api-key-sub strong { color: var(--accent-primary, #e5a93b); }

/* ── Spinner ────────────────────────────────────── */
.scene-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(229, 169, 59, 0.2);
  border-top-color: var(--accent-primary, #e5a93b);
  border-radius: 50%;
  animation: scene-spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes scene-spin {
  to { transform: rotate(360deg); }
}

/* ── Scrollbar polish across the drawer ────────── */
.scene-mode-drawer * {
  scrollbar-width: thin;
  scrollbar-color: rgba(229, 169, 59, 0.15) transparent;
}

/* ── Body lock when drawer open ─────────────────── */
body.scene-mode-active {
  overflow: hidden;
}

/* ── Responsive: narrow screens ─────────────────── */
@media (max-width: 780px) {
  .scene-mode-drawer {
    width: 100vw;
  }

  .scene-char-picker-row {
    flex-wrap: wrap;
  }

  .scene-btn-action {
    min-width: 100px;
    font-size: 11px;
  }
}
  `.trim();

  document.head.appendChild(style);
}
